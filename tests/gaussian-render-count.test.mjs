import assert from "node:assert/strict";
import test from "node:test";

import {resolveGaussianRenderCount} from "../src/modules/gaussians/GaussianRenderCount.js";

test("renders nothing before any Gaussian splats are uploaded", () => {
	assert.equal(resolveGaussianRenderCount(25_000, 0), 0);
});

test("renders only uploaded splats while preserving a larger total capacity", () => {
	assert.equal(resolveGaussianRenderCount(25_000, 10_000), 10_000);
	assert.equal(resolveGaussianRenderCount(25_000, 25_000), 25_000);
});

test("never permits an uploaded count to exceed the declared total", () => {
	assert.equal(resolveGaussianRenderCount(25_000, 30_000), 25_000);
});

test("rejects invalid Gaussian counts", () => {
	assert.throws(() => resolveGaussianRenderCount(-1, 0), /non-negative integer/i);
	assert.throws(() => resolveGaussianRenderCount(1, Number.NaN), /non-negative integer/i);
});
