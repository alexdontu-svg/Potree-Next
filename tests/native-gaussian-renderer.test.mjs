import test from "node:test";
import assert from "node:assert/strict";

import {
	createNativeGaussianRenderer,
	resolveNativeGaussianBackend,
} from "../src/modules/gaussians/native/NativeGaussianRenderer.js";
import {createNativeGaussianFixture} from "../src/modules/gaussians/native/NativeGaussianFixture.js";

const GPU = Object.freeze({
	bufferUsage: {COPY_DST: 1, STORAGE: 2, UNIFORM: 4},
	shaderStage: {VERTEX: 1, FRAGMENT: 2},
});

function createMockWebGpu(){
	const calls = [];
	const pass = {
		setPipeline(value){ calls.push(["setPipeline", value]); },
		setBindGroup(index, value){ calls.push(["setBindGroup", index, value]); },
		draw(vertices, instances){ calls.push(["draw", vertices, instances]); },
		end(){ calls.push(["end"]); },
	};
	const encoder = {
		beginRenderPass(descriptor){ calls.push(["beginRenderPass", descriptor]); return pass; },
		finish(){ calls.push(["finish"]); return "commands"; },
	};
	const device = {
		queue: {
			writeBuffer(...args){ calls.push(["writeBuffer", ...args]); },
			submit(value){ calls.push(["submit", value]); },
		},
		createBuffer(descriptor){ const value = {kind: "buffer", descriptor}; calls.push(["createBuffer", descriptor]); return value; },
		createShaderModule(descriptor){ const value = {kind: "shader", descriptor}; calls.push(["createShaderModule", descriptor]); return value; },
		createRenderPipeline(descriptor){
			const value = {
				kind: "pipeline",
				descriptor,
				getBindGroupLayout(index){ return {kind: "layout", index}; },
			};
			calls.push(["createRenderPipeline", descriptor]);
			return value;
		},
		createBindGroup(descriptor){ const value = {kind: "bindGroup", descriptor}; calls.push(["createBindGroup", descriptor]); return value; },
		createCommandEncoder(){ calls.push(["createCommandEncoder"]); return encoder; },
	};
	const textureView = {kind: "textureView"};
	const context = {
		getCurrentTexture(){ return {createView(){ return textureView; }}; },
	};

	return {device, context, calls, textureView};
}

test("backend resolution returns deterministic disabled reasons", () => {
	assert.deepEqual(resolveNativeGaussianBackend({}), {
		kind: "disabled",
		reason: "WEBGPU_DEVICE_UNAVAILABLE",
	});
	assert.deepEqual(resolveNativeGaussianBackend({device: {}}), {
		kind: "disabled",
		reason: "WEBGPU_CONTEXT_UNAVAILABLE",
	});
	assert.deepEqual(resolveNativeGaussianBackend({device: {}, context: {getCurrentTexture(){}}}), {
		kind: "disabled",
		reason: "WEBGPU_FORMAT_UNAVAILABLE",
	});
});

test("disabled renderer is a stable no-op fallback", () => {
	const renderer = createNativeGaussianRenderer({});
	assert.equal(renderer.kind, "disabled");
	assert.equal(renderer.reason, "WEBGPU_DEVICE_UNAVAILABLE");
	assert.deepEqual(renderer.upload(createNativeGaussianFixture({count: 1})), {
		uploaded: 0,
		reason: "WEBGPU_DEVICE_UNAVAILABLE",
	});
	assert.deepEqual(renderer.render(), {
		drawn: 0,
		reason: "WEBGPU_DEVICE_UNAVAILABLE",
	});
});

test("native renderer uploads packed data and draws six vertices per splat instance", () => {
	const mock = createMockWebGpu();
	const renderer = createNativeGaussianRenderer({
		device: mock.device,
		context: mock.context,
		format: "bgra8unorm",
		gpuConstants: GPU,
	});

	assert.equal(renderer.kind, "webgpu");
	assert.deepEqual(renderer.upload(createNativeGaussianFixture({count: 3, seed: 2})), {uploaded: 3});

	const result = renderer.render({
		viewProjection: new Float32Array([
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		]),
		viewport: [640, 480],
		clearColor: [0.1, 0.2, 0.3, 1],
	});

	assert.deepEqual(result, {drawn: 3});
	assert.ok(mock.calls.some(call => call[0] === "draw" && call[1] === 6 && call[2] === 3));
	assert.ok(mock.calls.some(call => call[0] === "submit" && call[1][0] === "commands"));
});

test("rendering zero uploaded splats does not encode or submit commands", () => {
	const mock = createMockWebGpu();
	const renderer = createNativeGaussianRenderer({
		device: mock.device,
		context: mock.context,
		format: "bgra8unorm",
		gpuConstants: GPU,
	});

	assert.deepEqual(renderer.render(), {drawn: 0, reason: "NO_SPLATS_UPLOADED"});
	assert.equal(mock.calls.some(call => call[0] === "createCommandEncoder"), false);
});

test("render validates matrices, viewport and clear color before touching the GPU", () => {
	const mock = createMockWebGpu();
	const renderer = createNativeGaussianRenderer({
		device: mock.device,
		context: mock.context,
		format: "bgra8unorm",
		gpuConstants: GPU,
	});
	renderer.upload(createNativeGaussianFixture({count: 1}));

	assert.throws(() => renderer.render({viewport: [0, 480]}), /viewport must contain two positive finite values/);
	assert.throws(() => renderer.render({viewProjection: new Float32Array(15)}), /viewProjection must contain 16 finite values/);
	assert.throws(() => renderer.render({clearColor: [0, 0, Number.NaN, 1]}), /clearColor must contain 4 finite values/);
});
