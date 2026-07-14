import test from "node:test";
import assert from "node:assert/strict";

import {createNativeFixtureFromSplatData} from "../src/modules/gaussians/native/NativeGaussianAdapter.js";

function buffer(values){
	return new Float32Array(values).buffer;
}

test("adapts streamed PLY buffers to the native renderer contract", () => {
	const fixture = createNativeFixtureFromSplatData({
		count: 2,
		positions: buffer([1, 2, 3, 4, 5, 6]),
		color: buffer([1, 0, 0, 0.5, 0, 1, 0, 0.75]),
		scale: buffer([0.01, 0.02, 0.03, 0.5, 1, 0.25]),
	}, {pixelScale: 100, minPixels: 1, maxPixels: 32});

	assert.equal(fixture.count, 2);
	assert.deepEqual(Array.from(fixture.positions), [1, 2, 3, 4, 5, 6]);
	assert.deepEqual(Array.from(fixture.colors), [1, 0, 0, 0.5, 0, 1, 0, 0.75]);
	assert.deepEqual(Array.from(fixture.scales), [1, 2, 32, 32]);
});

test("uses only the uploaded prefix and never exposes uninitialized splats", () => {
	const fixture = createNativeFixtureFromSplatData({
		count: 3,
		uploadedCount: 1,
		positions: buffer([1, 2, 3, 0, 0, 0, 0, 0, 0]),
		color: buffer([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
		scale: buffer([0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0]),
	});

	assert.equal(fixture.count, 1);
	assert.deepEqual(Array.from(fixture.positions), [1, 2, 3]);
});

test("rejects malformed buffers, unsafe counts and invalid pixel controls", () => {
	assert.throws(() => createNativeFixtureFromSplatData({
		count: 1,
		positions: buffer([1, 2]),
		color: buffer([1, 1, 1, 1]),
		scale: buffer([1, 1, 1]),
	}), /positions/);

	assert.throws(() => createNativeFixtureFromSplatData({
		count: 1,
		positions: buffer([1, 2, 3]),
		color: buffer([1, 1, 1, 1]),
		scale: buffer([1, 1, 1]),
	}, {pixelScale: 0}), /pixelScale/);
});
