import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	BLOCK_PAYLOAD_BYTES,
	ThreeDpFormatError,
	probeThreeDp,
	toReportedCoordinate,
} from "../tools/three-dp/three-dp-probe.mjs";

function zigZagLong(value) {
	let encoded = BigInt(value) << 1n;
	const bytes = [];
	do {
		let byte = Number(encoded & 0x7fn);
		encoded >>= 7n;
		if (encoded !== 0n) byte |= 0x80;
		bytes.push(byte);
	} while (encoded !== 0n);
	return Buffer.from(bytes);
}

function encodeString(value) {
	const bytes = Buffer.from(value, "utf8");
	return Buffer.concat([zigZagLong(bytes.length), bytes]);
}

function frameLogicalBytes(logical) {
	const blocks = [];
	for (let offset = 0; offset < logical.length; offset += BLOCK_PAYLOAD_BYTES) {
		const payload = logical.subarray(offset, offset + BLOCK_PAYLOAD_BYTES);
		const checksum = crypto.createHash("md5").update(payload).digest();
		blocks.push(payload, checksum);
	}
	return Buffer.concat(blocks);
}

function makeFixture(schema, { version = 1, padding = 0, magic = "3ds" } = {}) {
	const schemaBytes = Buffer.from(JSON.stringify(schema), "utf8");
	const logical = Buffer.concat([
		Buffer.concat([Buffer.from(magic, "ascii"), Buffer.from([version, 0x02])]),
		encodeString("geosurvey.schema"),
		zigZagLong(schemaBytes.length),
		schemaBytes,
		Buffer.alloc(padding, 0x5a),
	]);
	return frameLogicalBytes(logical);
}

function projectSchema(extraDescription = "") {
	return {
		type: "record",
		name: "Project",
		description: extraDescription,
		fields: [
			{
				name: "geometry_data",
				type: {
					type: "record",
					name: "GeometryData",
					fields: [
						{ name: "origin", type: { type: "record", name: "Point3d", fields: [
							{ name: "x", type: "double" },
							{ name: "y", type: "double" },
							{ name: "z", type: "double" },
						] } },
						{ name: "layers", type: { type: "record", name: "GeometryDataLayerMap", fields: [{ name: "items", type: "bytes" }] } },
						{ name: "lines", type: { type: "array", items: { type: "record", name: "GeometryDataLine", fields: [{ name: "vertices", type: "bytes" }] } } },
						{ name: "points", type: { type: "array", items: { type: "record", name: "GeometryDataPoint", fields: [{ name: "location", type: "Point3d" }] } } },
					],
				},
			},
		],
	};
}

async function withFixture(bytes, callback) {
	const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "three-dp-test-"));
	const file = path.join(directory, "fixture.3Dp");
	await fs.promises.writeFile(file, bytes);
	try {
		return await callback(file);
	} finally {
		await fs.promises.rm(directory, { recursive: true, force: true });
	}
}

test("probes a framed 3Dp schema across checksum block boundaries", async () => {
	const schema = projectSchema("x".repeat(BLOCK_PAYLOAD_BYTES));
	await withFixture(makeFixture(schema), async (file) => {
		const result = await probeThreeDp(file);
		assert.equal(result.format.magic, "3ds");
		assert.equal(result.format.version, 1);
		assert.equal(result.schema.namespace, "geosurvey.schema");
		assert.equal(result.schema.rootRecord, "Project");
		assert.ok(result.integrity.verifiedBlocks >= 2);
		assert.deepEqual(result.geometryData.records.GeometryData, ["origin", "layers", "lines", "points"]);
		assert.deepEqual(result.geometryData.records.GeometryDataPoint, ["location"]);
		assert.equal(result.coordinateContract.internal, "x=Est,y=Nord,z=Cota");
		assert.equal(result.coordinateContract.report, "Nord,Est,Cota");
	});
});

test("rejects a corrupted block before trusting its schema", async () => {
	const bytes = makeFixture(projectSchema("x".repeat(BLOCK_PAYLOAD_BYTES)));
	bytes[100] ^= 0xff;
	await withFixture(bytes, async (file) => {
		await assert.rejects(() => probeThreeDp(file), (error) => {
			assert.ok(error instanceof ThreeDpFormatError);
			assert.equal(error.code, "CHECKSUM_MISMATCH");
			return true;
		});
	});
});

test("rejects unknown magic, unsupported version and excessive schema size", async () => {
	const valid = makeFixture(projectSchema());
	for (const [bytes, code] of [
		[makeFixture(projectSchema(), { magic: "xds" }), "INVALID_MAGIC"],
		[makeFixture(projectSchema(), { version: 0x7f }), "UNSUPPORTED_VERSION"],
	]) {
		await withFixture(bytes, async (file) => {
			await assert.rejects(() => probeThreeDp(file), (error) => error.code === code);
		});
	}

	await withFixture(valid, async (file) => {
		await assert.rejects(
			() => probeThreeDp(file, { maxSchemaBytes: 10 }),
			(error) => error.code === "SCHEMA_TOO_LARGE",
		);
	});
});

test("reports Stereo 70 coordinates as Nord, Est, Cota without changing precision", () => {
	assert.deepEqual(
		toReportedCoordinate({ x: 410573.637123, y: 309257.536987, z: 136.018004 }),
		{ Nord: 309257.536987, Est: 410573.637123, Cota: 136.018004 },
	);
	assert.throws(() => toReportedCoordinate({ x: 1, y: Number.NaN, z: 3 }), /finite/);
});
