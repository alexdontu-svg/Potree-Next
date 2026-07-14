import test from "node:test";
import assert from "node:assert/strict";

import {
	createNativeGaussianFixture,
	packNativeGaussianSplats,
} from "../src/modules/gaussians/native/NativeGaussianFixture.js";

test("creates deterministic Gaussian fixtures from 1 through 100 splats", () => {
	for(const count of [1, 2, 17, 100]){
		const first = createNativeGaussianFixture({count, seed: 42});
		const second = createNativeGaussianFixture({count, seed: 42});

		assert.equal(first.count, count);
		assert.equal(first.positions.length, count * 3);
		assert.equal(first.colors.length, count * 4);
		assert.equal(first.scales.length, count * 2);
		assert.deepEqual(first, second);
	}
});

test("fixture values stay inside renderer-safe ranges", () => {
	const fixture = createNativeGaussianFixture({count: 100, seed: 7});

	for(let index = 0; index < fixture.count; index++){
		const x = fixture.positions[index * 3];
		const y = fixture.positions[index * 3 + 1];
		const z = fixture.positions[index * 3 + 2];
		assert.ok(x >= -0.8 && x <= 0.8);
		assert.ok(y >= -0.8 && y <= 0.8);
		assert.ok(z >= -0.25 && z <= 0.25);

		const alpha = fixture.colors[index * 4 + 3];
		assert.ok(alpha >= 0.55 && alpha <= 0.95);
		assert.ok(fixture.scales[index * 2] >= 4);
		assert.ok(fixture.scales[index * 2 + 1] <= 18);
	}
});

test("rejects fixture counts outside the 1-100 validation envelope", () => {
	for(const count of [0, 101, 1.5, Number.NaN]){
		assert.throws(
			() => createNativeGaussianFixture({count}),
			/count must be an integer between 1 and 100/,
		);
	}
});

test("packs one splat as three vec4 values with stable 48-byte stride", () => {
	const packed = packNativeGaussianSplats({
		count: 1,
		positions: new Float32Array([1, 2, 3]),
		colors: new Float32Array([0.1, 0.2, 0.3, 0.4]),
		scales: new Float32Array([9, 11]),
	});

	assert.equal(packed.strideBytes, 48);
	assert.equal(packed.count, 1);
	assert.deepEqual(Array.from(packed.data), Array.from(new Float32Array([
		1, 2, 3, 1,
		0.1, 0.2, 0.3, 0.4,
		9, 11, 0, 0,
	])));
});

test("packer rejects malformed or non-finite fixture data", () => {
	assert.throws(() => packNativeGaussianSplats({
		count: 1,
		positions: new Float32Array([1, 2]),
		colors: new Float32Array(4),
		scales: new Float32Array(2),
	}), /positions must contain exactly 3 values per splat/);

	assert.throws(() => packNativeGaussianSplats({
		count: 1,
		positions: new Float32Array([1, 2, Number.NaN]),
		colors: new Float32Array(4),
		scales: new Float32Array([1, 1]),
	}), /positions contains a non-finite value/);
});
