import test from "node:test";
import assert from "node:assert/strict";

import {
	extractTightBounds,
	toLocalBounds,
} from "../src/potree/octree/loader/metadataBounds.js";

function metadata(overrides = {}) {
	return {
		boundingBox: {
			min: [410_573.637, 309_257.536, 136.018],
			max: [411_275.018, 309_958.917, 837.399],
		},
		offset: [410_573.637, 309_257.536, 136.018],
		attributes: [{
			name: "position",
			min: [410_573.637, 309_257.536, 136.018],
			max: [411_275.018, 309_488.501, 196.465],
		}],
		...overrides,
	};
}

test("extracts real content bounds from the position attribute", () => {
	const source = metadata();
	const tight = extractTightBounds(source);

	assert.deepEqual(tight, {
		min: [410_573.637, 309_257.536, 136.018],
		max: [411_275.018, 309_488.501, 196.465],
	});
	assert.notStrictEqual(tight.min, source.attributes[0].min);
	assert.notStrictEqual(tight.max, source.attributes[0].max);
});

test("converts tight bounds to the octree local frame without changing the hierarchy cube", () => {
	const source = metadata();
	const hierarchyBefore = structuredClone(source.boundingBox);
	const tight = extractTightBounds(source);
	const local = toLocalBounds(tight, source.boundingBox.min);

	assert.deepEqual(local, {
		min: [0, 0, 0],
		max: [
			411_275.018 - 410_573.637,
			309_488.501 - 309_257.536,
			196.465 - 136.018,
		],
	});
	assert.deepEqual(source.boundingBox, hierarchyBefore);
});

test("accepts a tight box touching any face of the metadata bounding box", () => {
	const source = metadata({
		attributes: [{
			name: "position",
			min: [410_573.637, 309_257.536, 136.018],
			max: [411_275.018, 309_958.917, 837.399],
		}],
	});

	assert.doesNotThrow(() => extractTightBounds(source));
});

test("rejects non-finite or inverted content bounds", () => {
	const nonFinite = metadata();
	nonFinite.attributes[0].max[2] = Number.NaN;
	assert.throws(() => extractTightBounds(nonFinite), /position\.max\[2\].*finite/i);

	const inverted = metadata();
	inverted.attributes[0].min[1] = inverted.attributes[0].max[1] + 1;
	assert.throws(() => extractTightBounds(inverted), /position.*min.*max/i);
});

test("rejects content bounds outside the cubic metadata bounding box", () => {
	const source = metadata();
	source.attributes[0].max[1] = source.boundingBox.max[1] + 0.001;

	assert.throws(() => extractTightBounds(source), /position.*boundingBox/i);
});

test("rejects missing position attributes and invalid local origins", () => {
	assert.throws(() => extractTightBounds(metadata({attributes: []})), /position.*attribute/i);
	assert.throws(
		() => toLocalBounds({min: [1, 2, 3], max: [4, 5, 6]}, [0, Infinity, 0]),
		/origin\[1\].*finite/i,
	);
});
