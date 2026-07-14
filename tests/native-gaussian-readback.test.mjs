import test from "node:test";
import assert from "node:assert/strict";

import {createNativeGaussianRenderer} from "../src/modules/gaussians/native/NativeGaussianRenderer.js";
import {createNativeGaussianFixture} from "../src/modules/gaussians/native/NativeGaussianFixture.js";

function mockGpu(){
	const pixels = new Uint8Array(256);
	pixels.set([10, 20, 30, 40]);
	const texture = {createView: () => ({})};
	const pass = {setPipeline(){}, setBindGroup(){}, draw(){}, end(){}};
	const encoder = {
		beginRenderPass: () => pass,
		copyTextureToBuffer(){},
		finish: () => ({}),
	};
	const device = {
		queue: {writeBuffer(){}, submit(){}},
		createBuffer(descriptor){
			if(descriptor.label?.includes("readback")){
				return {
					async mapAsync(){},
					getMappedRange: () => pixels.buffer,
					unmap(){}, destroy(){},
				};
			}
			return {destroy(){}};
		},
		createShaderModule: () => ({}),
		createRenderPipeline: () => ({getBindGroupLayout: () => ({})}),
		createBindGroup: () => ({}),
		createCommandEncoder: () => encoder,
	};
	return {device, context: {getCurrentTexture: () => texture}};
}

test("reads one rendered BGRA pixel back as RGBA", async () => {
	const gpu = mockGpu();
	const renderer = createNativeGaussianRenderer({
		...gpu,
		format: "bgra8unorm",
		gpuConstants: {
			bufferUsage: {COPY_DST: 1, STORAGE: 2, UNIFORM: 4, MAP_READ: 8},
			mapMode: {READ: 1},
		},
	});
	renderer.upload(createNativeGaussianFixture({count: 1}));
	renderer.render({viewport: [64, 32]});
	assert.deepEqual(await renderer.readPixel({x: 32, y: 16}), {rgba: [30, 20, 10, 40]});
	await assert.rejects(renderer.readPixel({x: 64, y: 0}), /inside the last viewport/);
});

test("copies the requested pixel in the same command buffer as rendering", async () => {
	const gpu = mockGpu();
	const renderer = createNativeGaussianRenderer({
		...gpu,
		format: "bgra8unorm",
		gpuConstants: {
			bufferUsage: {COPY_DST: 1, STORAGE: 2, UNIFORM: 4, MAP_READ: 8},
			mapMode: {READ: 1},
		},
	});
	renderer.upload(createNativeGaussianFixture({count: 1}));
	const result = renderer.render({viewport: [64, 32], readPixel: {x: 32, y: 16}});
	assert.equal(result.drawn, 1);
	assert.deepEqual(await result.pixel, [30, 20, 10, 40]);
});

test("readback before the first frame is deterministic", async () => {
	const gpu = mockGpu();
	const renderer = createNativeGaussianRenderer({
		...gpu,
		format: "rgba8unorm",
		gpuConstants: {
			bufferUsage: {COPY_DST: 1, STORAGE: 2, UNIFORM: 4, MAP_READ: 8},
			mapMode: {READ: 1},
		},
	});
	assert.deepEqual(await renderer.readPixel({x: 0, y: 0}), {
		rgba: null,
		reason: "NO_RENDERED_FRAME",
	});
});
