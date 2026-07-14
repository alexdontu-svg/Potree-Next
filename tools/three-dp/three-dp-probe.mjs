#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BLOCK_BYTES = 8192;
export const BLOCK_PAYLOAD_BYTES = 8176;
export const BLOCK_CHECKSUM_BYTES = 16;
export const DEFAULT_MAX_SCHEMA_BYTES = 8 * 1024 * 1024;

const MAGIC = Buffer.from("3ds", "ascii");
const SUPPORTED_VERSIONS = new Set([1]);

export class ThreeDpFormatError extends Error {
	constructor(code, message, details = {}) {
		super(message);
		this.name = "ThreeDpFormatError";
		this.code = code;
		this.details = details;
	}
}

class FramedReader {
	constructor(handle, size, { verifyChecksums = true } = {}) {
		this.handle = handle;
		this.size = size;
		this.verifyChecksums = verifyChecksums;
		this.cache = new Map();
		this.verifiedBlocks = new Set();
	}

	async readBlock(index) {
		if (this.cache.has(index)) return this.cache.get(index);

		const physicalOffset = index * BLOCK_BYTES;
		if (physicalOffset >= this.size) {
			throw new ThreeDpFormatError("UNEXPECTED_EOF", "Unexpected end of 3Dp stream", { block: index });
		}

		const physicalLength = Math.min(BLOCK_BYTES, this.size - physicalOffset);
		if (physicalLength <= BLOCK_CHECKSUM_BYTES) {
			throw new ThreeDpFormatError("TRUNCATED_BLOCK", "3Dp block has no usable payload", { block: index });
		}

		const framed = Buffer.allocUnsafe(physicalLength);
		const { bytesRead } = await this.handle.read(framed, 0, physicalLength, physicalOffset);
		if (bytesRead !== physicalLength) {
			throw new ThreeDpFormatError("UNEXPECTED_EOF", "Could not read a complete 3Dp block", { block: index });
		}

		const payloadLength = physicalLength - BLOCK_CHECKSUM_BYTES;
		if (index * BLOCK_BYTES + physicalLength < this.size && payloadLength !== BLOCK_PAYLOAD_BYTES) {
			throw new ThreeDpFormatError("TRUNCATED_BLOCK", "A non-final 3Dp block is incomplete", { block: index });
		}

		const payload = framed.subarray(0, payloadLength);
		const storedChecksum = framed.subarray(payloadLength);
		if (this.verifyChecksums) {
			const calculatedChecksum = crypto.createHash("md5").update(payload).digest();
			if (!crypto.timingSafeEqual(storedChecksum, calculatedChecksum)) {
				throw new ThreeDpFormatError("CHECKSUM_MISMATCH", "3Dp block checksum does not match", {
					block: index,
					physicalOffset,
				});
			}
			this.verifiedBlocks.add(index);
		}

		this.cache.set(index, payload);
		return payload;
	}

	async read(logicalOffset, length) {
		if (!Number.isSafeInteger(logicalOffset) || logicalOffset < 0 || !Number.isSafeInteger(length) || length < 0) {
			throw new TypeError("logicalOffset and length must be non-negative safe integers");
		}

		const chunks = [];
		let position = logicalOffset;
		let remaining = length;
		while (remaining > 0) {
			const blockIndex = Math.floor(position / BLOCK_PAYLOAD_BYTES);
			const withinBlock = position % BLOCK_PAYLOAD_BYTES;
			const payload = await this.readBlock(blockIndex);
			if (withinBlock >= payload.length) {
				throw new ThreeDpFormatError("UNEXPECTED_EOF", "Logical offset is outside the final 3Dp payload", {
					logicalOffset: position,
				});
			}
			const take = Math.min(remaining, payload.length - withinBlock);
			chunks.push(payload.subarray(withinBlock, withinBlock + take));
			position += take;
			remaining -= take;
		}
		return Buffer.concat(chunks, length);
	}
}

class LogicalCursor {
	constructor(reader) {
		this.reader = reader;
		this.offset = 0;
	}

	async read(length) {
		const bytes = await this.reader.read(this.offset, length);
		this.offset += length;
		return bytes;
	}

	async readByte() {
		return (await this.read(1))[0];
	}

	async readZigZagLong() {
		let encoded = 0n;
		let shift = 0n;
		for (let index = 0; index < 10; index++) {
			const byte = await this.readByte();
			encoded |= BigInt(byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				const decoded = (encoded >> 1n) ^ (-(encoded & 1n));
				if (decoded < 0n || decoded > BigInt(Number.MAX_SAFE_INTEGER)) {
					throw new ThreeDpFormatError("INVALID_LENGTH", "3Dp length is negative or too large");
				}
				return Number(decoded);
			}
			shift += 7n;
		}
		throw new ThreeDpFormatError("INVALID_VARINT", "3Dp variable-length integer exceeds 10 bytes");
	}

	async readString(maxBytes, label) {
		const length = await this.readZigZagLong();
		if (length > maxBytes) {
			throw new ThreeDpFormatError("STRING_TOO_LARGE", `${label} exceeds its safe size limit`, { length, maxBytes });
		}
		return (await this.read(length)).toString("utf8");
	}
}

function collectNamedRecords(value, records = new Map(), seen = new Set()) {
	if (value === null || typeof value !== "object" || seen.has(value)) return records;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const item of value) collectNamedRecords(item, records, seen);
		return records;
	}
	if (value.type === "record" && typeof value.name === "string") {
		records.set(value.name, Array.isArray(value.fields) ? value.fields.map((field) => field.name) : []);
	}
	for (const child of Object.values(value)) collectNamedRecords(child, records, seen);
	return records;
}

function geometryInventory(schema) {
	const records = collectNamedRecords(schema);
	const geometryRecords = {};
	for (const [name, fields] of records) {
		if (name === "GeometryData" || name.startsWith("GeometryData")) geometryRecords[name] = fields;
	}
	return {
		available: Object.hasOwn(geometryRecords, "GeometryData"),
		recordCount: Object.keys(geometryRecords).length,
		records: geometryRecords,
	};
}

export function toReportedCoordinate({ x, y, z }) {
	if (![x, y, z].every(Number.isFinite)) throw new TypeError("Stereo 70 coordinates must be finite numbers");
	return { Nord: y, Est: x, Cota: z };
}

export async function probeThreeDp(filePath, options = {}) {
	const maxSchemaBytes = options.maxSchemaBytes ?? DEFAULT_MAX_SCHEMA_BYTES;
	if (!Number.isSafeInteger(maxSchemaBytes) || maxSchemaBytes <= 0) {
		throw new TypeError("maxSchemaBytes must be a positive safe integer");
	}

	const handle = await fs.promises.open(filePath, "r");
	try {
		const stat = await handle.stat();
		const reader = new FramedReader(handle, stat.size, options);
		const cursor = new LogicalCursor(reader);
		const magic = await cursor.read(MAGIC.length);
		if (!magic.equals(MAGIC)) {
			throw new ThreeDpFormatError("INVALID_MAGIC", "Not a recognized 3Dp file (expected ASCII '3ds')");
		}

		const version = await cursor.readByte();
		if (!SUPPORTED_VERSIONS.has(version)) {
			throw new ThreeDpFormatError("UNSUPPORTED_VERSION", `Unsupported 3Dp version ${version}`, { version });
		}

		const schemaTag = await cursor.readByte();
		if (schemaTag !== 0x02) {
			throw new ThreeDpFormatError("INVALID_SCHEMA_TAG", `Unexpected 3Dp schema tag ${schemaTag}`, { schemaTag });
		}
		const namespace = await cursor.readString(1024, "Schema namespace");
		const schemaLength = await cursor.readZigZagLong();
		if (schemaLength > maxSchemaBytes) {
			throw new ThreeDpFormatError("SCHEMA_TOO_LARGE", "3Dp schema exceeds the configured safe size limit", {
				schemaLength,
				maxSchemaBytes,
			});
		}
		const schemaBytes = await cursor.read(schemaLength);
		let document;
		try {
			document = JSON.parse(schemaBytes.toString("utf8"));
		} catch (error) {
			throw new ThreeDpFormatError("INVALID_SCHEMA_JSON", `3Dp schema is not valid JSON: ${error.message}`);
		}

		const allRecords = collectNamedRecords(document);
		return {
			file: {
				path: path.resolve(filePath),
				sizeBytes: stat.size,
			},
			format: {
				magic: magic.toString("ascii"),
				version,
				blockBytes: BLOCK_BYTES,
				blockPayloadBytes: BLOCK_PAYLOAD_BYTES,
				checksum: "MD5",
			},
			schema: {
				namespace,
				lengthBytes: schemaLength,
				sha256: crypto.createHash("sha256").update(schemaBytes).digest("hex"),
				rootRecord: document?.name ?? null,
				recordCount: allRecords.size,
				document,
			},
			geometryData: geometryInventory(document),
			payload: {
				logicalOffset: cursor.offset,
				decoded: false,
				note: "Payload intentionally not decoded by the read-only schema probe.",
			},
			integrity: {
				verifiedBlocks: reader.verifiedBlocks.size,
			},
			coordinateContract: {
				internal: "x=Est,y=Nord,z=Cota",
				report: "Nord,Est,Cota",
			},
		};
	} finally {
		await handle.close();
	}
}

async function main(argv) {
	const args = [...argv];
	let includeSchema = false;
	if (args[0] === "--include-schema") {
		includeSchema = true;
		args.shift();
	}
	if (args.length !== 1) {
		console.error("Usage: node tools/three-dp/three-dp-probe.mjs [--include-schema] <file.3Dp>");
		process.exitCode = 2;
		return;
	}
	try {
		const result = await probeThreeDp(args[0]);
		if (!includeSchema) delete result.schema.document;
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} catch (error) {
		const output = error instanceof ThreeDpFormatError
			? { error: error.code, message: error.message, details: error.details }
			: { error: "PROBE_FAILED", message: error.message };
		process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
		process.exitCode = 1;
	}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main(process.argv.slice(2));
