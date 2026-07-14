import assert from "node:assert/strict";
import test from "node:test";

import {GaussianBoundsAccumulator} from "../src/modules/gaussians/GaussianBounds.js";

test("accumulates finite min/max across multiple batches", () => {
	const bounds = new GaussianBoundsAccumulator();

	bounds.addBatch(new Float32Array([
		4, -2, 8,
		1, 5, 3,
	]), {firstIndex: 0});
	bounds.addBatch(new Float32Array([
		9, 0, -7,
		-3, 12, 4,
	]), {firstIndex: 2});

	assert.deepEqual(bounds.snapshot(), {
		min: [-3, -2, -7],
		max: [9, 12, 8],
		count: 4,
		empty: false,
		rejectedCount: 0,
	});
});

test("returns a finite zero-sized box for zero splats", () => {
	const bounds = new GaussianBoundsAccumulator();

	assert.deepEqual(bounds.snapshot(), {
		min: [0, 0, 0],
		max: [0, 0, 0],
		count: 0,
		empty: true,
		rejectedCount: 0,
	});
});

test("rejects non-finite coordinates deterministically with the global splat index", () => {
	const bounds = new GaussianBoundsAccumulator();

	assert.throws(
		() => bounds.addBatch(new Float32Array([1, 2, 3, 4, Number.NaN, 6]), {firstIndex: 70}),
		error => error instanceof RangeError && /splat 71/i.test(error.message) && /non-finite/i.test(error.message),
	);
	assert.deepEqual(bounds.snapshot().min, [1, 2, 3]);
	assert.deepEqual(bounds.snapshot().max, [1, 2, 3]);
});

test("can deterministically ignore malformed splats when configured", () => {
	const bounds = new GaussianBoundsAccumulator({nonFinite: "ignore"});

	bounds.addBatch(new Float32Array([
		1, 2, 3,
		Infinity, 5, 6,
		-2, 8, 0,
	]));

	assert.deepEqual(bounds.snapshot(), {
		min: [-2, 2, 0],
		max: [1, 8, 3],
		count: 2,
		empty: false,
		rejectedCount: 1,
	});
});

test("rejects malformed flat position batches", () => {
	const bounds = new GaussianBoundsAccumulator();

	assert.throws(() => bounds.addBatch(new Float32Array([1, 2])), /multiple of 3/i);
});
