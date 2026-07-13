import assert from "node:assert/strict";
import test from "node:test";

import {
	applySplatPlacement,
	parseSplatPlacement,
} from "../src/modules/hybrid/SplatPlacement.js";

test("parses optional Stereo70 Est,Nord,Cota position and positive scale", () => {
	const params = new URLSearchParams(
		"splatPosition=405123.25,312456.5,98.75&splatScale=1.5",
	);

	assert.deepEqual(parseSplatPlacement(params), {
		position: [405123.25, 312456.5, 98.75],
		scale: 1.5,
	});
});

test("uses neutral defaults when placement parameters are absent", () => {
	assert.deepEqual(parseSplatPlacement(new URLSearchParams()), {
		position: null,
		scale: 1,
	});
});

test("rejects malformed or non-finite positions", () => {
	for(const value of ["1,2", "1,2,3,4", "1,,3", "1,NaN,3", "1,Infinity,3"]){
		assert.throws(
			() => parseSplatPlacement(new URLSearchParams({splatPosition: value})),
			{cause: value},
		);
	}
});

test("rejects a non-finite, zero, or negative scale", () => {
	for(const value of ["", "0", "-1", "NaN", "Infinity"]){
		assert.throws(
			() => parseSplatPlacement(new URLSearchParams({splatScale: value})),
			{cause: value},
		);
	}
});

test("applies placement through the scene node API and updates its world matrix", () => {
	const calls = [];
	const splat = {
		position: {set: (...values) => calls.push(["position", ...values])},
		scale: {set: (...values) => calls.push(["scale", ...values])},
		updateWorld: () => calls.push(["updateWorld"]),
	};

	const result = applySplatPlacement(splat, {
		position: [405123.25, 312456.5, 98.75],
		scale: 2,
	});

	assert.equal(result, splat);
	assert.deepEqual(calls, [
		["position", 405123.25, 312456.5, 98.75],
		["scale", 2, 2, 2],
		["updateWorld"],
	]);
});

test("neutral placement preserves position while normalizing scale", () => {
	const calls = [];
	const splat = {
		position: {set: (...values) => calls.push(["position", ...values])},
		scale: {set: (...values) => calls.push(["scale", ...values])},
		updateWorld: () => calls.push(["updateWorld"]),
	};

	applySplatPlacement(splat, {position: null, scale: 1});

	assert.deepEqual(calls, [
		["scale", 1, 1, 1],
		["updateWorld"],
	]);
});
