import assert from "node:assert/strict";
import test from "node:test";

import {
	HybridLayerController,
	HybridLayerMode,
} from "../src/modules/hybrid/HybridLayerController.js";

const layer = () => ({visible: true});

test("POINTS shows only the point cloud", () => {
	const pointcloud = layer();
	const splat = layer();
	const controller = new HybridLayerController({pointcloud, splat});

	const state = controller.setMode(HybridLayerMode.POINTS);

	assert.equal(pointcloud.visible, true);
	assert.equal(splat.visible, false);
	assert.equal(state.requestedMode, HybridLayerMode.POINTS);
	assert.equal(state.effectiveMode, HybridLayerMode.POINTS);
});

test("SPLATS shows only the Gaussian layer", () => {
	const pointcloud = layer();
	const splat = layer();
	const controller = new HybridLayerController({pointcloud, splat});

	const state = controller.setMode(HybridLayerMode.SPLATS);

	assert.equal(pointcloud.visible, false);
	assert.equal(splat.visible, true);
	assert.equal(state.effectiveMode, HybridLayerMode.SPLATS);
});

test("HYBRID shows both available layers", () => {
	const pointcloud = layer();
	const splat = layer();
	const controller = new HybridLayerController({pointcloud, splat});

	const state = controller.setMode(HybridLayerMode.HYBRID);

	assert.equal(pointcloud.visible, true);
	assert.equal(splat.visible, true);
	assert.equal(state.effectiveMode, HybridLayerMode.HYBRID);
});

test("a missing splat deterministically falls back to POINTS", () => {
	const pointcloud = layer();
	const controller = new HybridLayerController({
		pointcloud,
		mode: HybridLayerMode.SPLATS,
	});

	assert.equal(pointcloud.visible, true);
	assert.deepEqual(controller.getState(), {
		requestedMode: HybridLayerMode.SPLATS,
		effectiveMode: HybridLayerMode.POINTS,
		hasPointcloud: true,
		hasSplat: false,
		status: "Splats indisponibile · afișare POINTS",
	});
});

test("attaching a splat restores the previously requested mode", () => {
	const pointcloud = layer();
	const splat = layer();
	const controller = new HybridLayerController({
		pointcloud,
		mode: HybridLayerMode.HYBRID,
	});

	const state = controller.setSplat(splat);

	assert.equal(pointcloud.visible, true);
	assert.equal(splat.visible, true);
	assert.equal(state.requestedMode, HybridLayerMode.HYBRID);
	assert.equal(state.effectiveMode, HybridLayerMode.HYBRID);
});

test("a missing point cloud falls back from POINTS to SPLATS", () => {
	const splat = layer();
	const controller = new HybridLayerController({
		splat,
		mode: HybridLayerMode.POINTS,
	});

	assert.equal(splat.visible, true);
	assert.equal(controller.getState().effectiveMode, HybridLayerMode.SPLATS);
});

test("removing a layer hides the detached object", () => {
	const pointcloud = layer();
	const splat = layer();
	const controller = new HybridLayerController({
		pointcloud,
		splat,
		mode: HybridLayerMode.HYBRID,
	});

	controller.setSplat(null);

	assert.equal(splat.visible, false);
	assert.equal(pointcloud.visible, true);
});

test("state changes notify the UI and invalid modes are rejected", () => {
	const changes = [];
	const controller = new HybridLayerController({
		pointcloud: layer(),
		onChange: state => changes.push(state),
	});

	controller.setMode(HybridLayerMode.HYBRID);

	assert.equal(changes.at(-1).requestedMode, HybridLayerMode.HYBRID);
	assert.throws(() => controller.setMode("XRAY"), RangeError);
});
