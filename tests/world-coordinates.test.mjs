import test from "node:test";
import assert from "node:assert/strict";

import {
	WorldCoordinates,
	internalToUi,
	uiToInternal,
} from "../src/core/WorldCoordinates.js";

const ORIGIN = {x: 642_123.456_789, y: 318_987.654_321, z: 94.125};

test("converts Stereo70 world coordinates to local float64 coordinates and back", () => {
	const coordinates = new WorldCoordinates(ORIGIN);
	const world = {x: 642_135.987_654, y: 319_002.123_456, z: 101.875};

	const local = coordinates.worldToLocal(world);

	assert.deepEqual(local, {
		x: world.x - ORIGIN.x,
		y: world.y - ORIGIN.y,
		z: world.z - ORIGIN.z,
	});
	assert.deepEqual(coordinates.localToWorld(local), world);
});

test("uses X=Est, Y=Nord, Z=Cota internally and Nord, Est, Cota in the UI", () => {
	const internal = {x: 642_135.25, y: 319_002.75, z: 101.5};

	assert.deepEqual(internalToUi(internal), {
		nord: 319_002.75,
		est: 642_135.25,
		cota: 101.5,
	});
	assert.deepEqual(uiToInternal({nord: 319_002.75, est: 642_135.25, cota: 101.5}), internal);
});

test("does not round coordinates or coerce them to float32", () => {
	const coordinates = new WorldCoordinates({x: 600_000.123_456_789, y: 300_000.987_654_321, z: 0});
	const world = {x: 600_000.123_457_789, y: 300_000.987_656_321, z: 0.000_003_141_592_653};

	const local = coordinates.worldToLocal(world);

	assert.equal(local.x, world.x - 600_000.123_456_789);
	assert.equal(local.y, world.y - 300_000.987_654_321);
	assert.equal(local.z, 0.000_003_141_592_653);
	assert.deepEqual(coordinates.localToWorld(local), world);
});

test("copies the origin so external mutation cannot change the coordinate frame", () => {
	const origin = {x: 600_000, y: 300_000, z: 100};
	const coordinates = new WorldCoordinates(origin);
	origin.x = 0;

	assert.deepEqual(coordinates.origin, {x: 600_000, y: 300_000, z: 100});
	assert.deepEqual(coordinates.worldToLocal({x: 600_001, y: 300_002, z: 103}), {x: 1, y: 2, z: 3});
});

test("rejects missing, non-number and non-finite values at every boundary", () => {
	assert.throws(() => new WorldCoordinates({x: 600_000, y: Number.NaN, z: 0}), /origin\.y.*finite/i);

	const coordinates = new WorldCoordinates({x: 600_000, y: 300_000, z: 100});
	assert.throws(() => coordinates.worldToLocal({x: Infinity, y: 300_000, z: 100}), /world\.x.*finite/i);
	assert.throws(() => coordinates.localToWorld({x: 1, y: "2", z: 3}), /local\.y.*finite/i);
	assert.throws(() => internalToUi({x: 1, y: 2}), /internal\.z.*finite/i);
	assert.throws(() => uiToInternal({nord: 1, est: 2, cota: -Infinity}), /ui\.cota.*finite/i);
});
