import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";

import {
	inspectAsset,
	resolveAssetPath,
	validateAsset,
} from "../tools/benchmarks/data-assets.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repoRoot, "config", "data-assets.example.json");

test("CORNU manifest is local-safe and records the immutable reference facts", async () => {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const serialized = JSON.stringify(manifest);

	assert.equal(manifest.schemaVersion, 1);
	assert.equal(manifest.coordinateConvention.internal, "X=Est,Y=Nord,Z=Cota");
	assert.equal(manifest.assets.cornuOctree.expected.points, 145591927);
	assert.equal(manifest.assets.cornu3dp.expected.sizeBytes, 4067222306);
	assert.equal(
		manifest.assets.cornu3dp.expected.sha256,
		"9e84c006c30417bd1d9d553138fc71994f55e442a5dc91259272c10e2f70e0a4",
	);
	assert.equal(manifest.assets.cornu3dp.path.env, "POTREE_NET_CORNU_3DP");
	assert.equal(serialized.includes("/Users/"), false);
});

test("asset paths prefer environment values and safely resolve repo-relative fallbacks", () => {
	const descriptor = {
		path: {env: "POTREE_NET_TEST_ASSET", repoRelative: "fixtures/sample.bin"},
	};

	assert.equal(
		resolveAssetPath(descriptor, {repoRoot: "/repo", env: {POTREE_NET_TEST_ASSET: "/data/a.bin"}}),
		path.resolve("/data/a.bin"),
	);
	assert.equal(
		resolveAssetPath(descriptor, {repoRoot: "/repo", env: {}}),
		path.resolve("/repo/fixtures/sample.bin"),
	);
	assert.throws(
		() => resolveAssetPath({path: {env: "MISSING"}}, {repoRoot: "/repo", env: {}}),
		/MISSING/,
	);
});

test("asset inspection and validation can verify bytes and SHA-256 without copying data", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "potree-net-asset-"));
	const assetPath = path.join(directory, "fixture.3Dp");
	const payload = Buffer.from("local-only-cornu-fixture");
	const sha256 = createHash("sha256").update(payload).digest("hex");

	try{
		await writeFile(assetPath, payload);
		const inspection = await inspectAsset(assetPath, {hash: true});
		assert.deepEqual(inspection, {
			path: path.resolve(assetPath),
			type: "file",
			sizeBytes: payload.length,
			sha256,
		});

		const valid = await validateAsset(
			{expected: {sizeBytes: payload.length, sha256}},
			assetPath,
			{hash: true},
		);
		assert.equal(valid.ok, true);
		assert.deepEqual(valid.errors, []);

		const invalid = await validateAsset(
			{expected: {sizeBytes: payload.length + 1, sha256: "0".repeat(64)}},
			assetPath,
			{hash: true},
		);
		assert.equal(invalid.ok, false);
		assert.equal(invalid.errors.length, 2);
	}finally{
		await rm(directory, {recursive: true, force: true});
	}
});
