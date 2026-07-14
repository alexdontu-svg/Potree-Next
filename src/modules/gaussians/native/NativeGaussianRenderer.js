import {packNativeGaussianSplats} from "./NativeGaussianFixture.js";
import {NATIVE_GAUSSIAN_SHADER} from "./NativeGaussianShader.js";

const IDENTITY_MATRIX = new Float32Array([
	1, 0, 0, 0,
	0, 1, 0, 0,
	0, 0, 1, 0,
	0, 0, 0, 1,
]);

export function resolveNativeGaussianBackend({device, context, format} = {}){
	if(!device){
		return {kind: "disabled", reason: "WEBGPU_DEVICE_UNAVAILABLE"};
	}
	if(!context || typeof context.getCurrentTexture !== "function"){
		return {kind: "disabled", reason: "WEBGPU_CONTEXT_UNAVAILABLE"};
	}
	if(typeof format !== "string" || format.length === 0){
		return {kind: "disabled", reason: "WEBGPU_FORMAT_UNAVAILABLE"};
	}
	return {kind: "webgpu", device, context, format};
}

function disabledRenderer(reason){
	return Object.freeze({
		kind: "disabled",
		reason,
		upload(){ return {uploaded: 0, reason}; },
		render(){ return {drawn: 0, reason}; },
		destroy(){},
	});
}

function finiteValues(value, length, label){
	if(value == null || typeof value.length !== "number" || value.length !== length){
		throw new TypeError(`${label} must contain ${length} finite values`);
	}
	for(const component of value){
		if(!Number.isFinite(component)){
			throw new TypeError(`${label} must contain ${length} finite values`);
		}
	}
}

function validateViewport(viewport){
	finiteValues(viewport, 2, "viewport");
	if(viewport[0] <= 0 || viewport[1] <= 0){
		throw new RangeError("viewport must contain two positive finite values");
	}
}

class WebGpuNativeGaussianRenderer {
	constructor({device, context, format, gpuConstants}){
		this.kind = "webgpu";
		this.device = device;
		this.context = context;
		this.format = format;
		this.count = 0;
		this.splatBuffer = null;
		this.lastTexture = null;
		this.lastViewport = null;

		const usage = gpuConstants?.bufferUsage ?? globalThis.GPUBufferUsage;
		if(!usage){
			throw new Error("GPUBufferUsage constants are unavailable");
		}
		this.usage = usage;
		this.mapMode = gpuConstants?.mapMode ?? globalThis.GPUMapMode;

		this.uniformBuffer = device.createBuffer({
			label: "native gaussian uniforms",
			size: 80,
			usage: usage.UNIFORM | usage.COPY_DST,
		});
		const shader = device.createShaderModule({
			label: "native gaussian shader",
			code: NATIVE_GAUSSIAN_SHADER,
		});
		this.pipeline = device.createRenderPipeline({
			label: "native gaussian pipeline",
			layout: "auto",
			vertex: {module: shader, entryPoint: "vertexMain"},
			fragment: {
				module: shader,
				entryPoint: "fragmentMain",
				targets: [{
					format,
					blend: {
						color: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"},
						alpha: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"},
					},
				}],
			},
			primitive: {topology: "triangle-list", cullMode: "none"},
		});
	}

	upload(fixture){
		const packed = packNativeGaussianSplats(fixture);
		this.splatBuffer?.destroy?.();
		this.splatBuffer = this.device.createBuffer({
			label: "native gaussian splats",
			size: Math.max(4, packed.data.byteLength),
			usage: this.usage.STORAGE | this.usage.COPY_DST,
		});
		if(packed.data.byteLength > 0){
			this.device.queue.writeBuffer(
				this.splatBuffer,
				0,
				packed.data.buffer,
				packed.data.byteOffset,
				packed.data.byteLength,
			);
		}
		this.bindGroup = this.device.createBindGroup({
			label: "native gaussian bind group",
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				{binding: 0, resource: {buffer: this.uniformBuffer}},
				{binding: 1, resource: {buffer: this.splatBuffer}},
			],
		});
		this.count = packed.count;
		return {uploaded: this.count};
	}

	render({
		viewProjection = IDENTITY_MATRIX,
		viewport = [1, 1],
		clearColor = [0, 0, 0, 0],
		readPixel = null,
	} = {}){
		if(this.count === 0){
			return {drawn: 0, reason: "NO_SPLATS_UPLOADED"};
		}
		finiteValues(viewProjection, 16, "viewProjection");
		validateViewport(viewport);
		finiteValues(clearColor, 4, "clearColor");

		const uniforms = new Float32Array(20);
		uniforms.set(viewProjection, 0);
		uniforms.set(viewport, 16);
		this.device.queue.writeBuffer(
			this.uniformBuffer,
			0,
			uniforms.buffer,
			uniforms.byteOffset,
			uniforms.byteLength,
		);

		const encoder = this.device.createCommandEncoder({label: "native gaussian encoder"});
		const texture = this.context.getCurrentTexture();
		this.lastTexture = texture;
		this.lastViewport = [Math.floor(viewport[0]), Math.floor(viewport[1])];
		const view = texture.createView();
		const pass = encoder.beginRenderPass({
			label: "native gaussian pass",
			colorAttachments: [{
				view,
				clearValue: {
					r: clearColor[0],
					g: clearColor[1],
					b: clearColor[2],
					a: clearColor[3],
				},
				loadOp: "clear",
				storeOp: "store",
			}],
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.draw(6, this.count, 0, 0);
		pass.end();

		let readback = null;
		if(readPixel !== null){
			const {x, y} = readPixel;
			if(!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
				x >= this.lastViewport[0] || y >= this.lastViewport[1]){
				throw new RangeError("pixel coordinates must be integers inside the last viewport");
			}
			if(!this.mapMode || !Number.isFinite(this.mapMode.READ)){
				throw new Error("GPU map-read support is unavailable");
			}
			const bytesPerRow = 256;
			readback = this.device.createBuffer({
				label: "native gaussian same-pass readback",
				size: bytesPerRow,
				usage: this.usage.COPY_DST | this.usage.MAP_READ,
			});
			encoder.copyTextureToBuffer(
				{texture, origin: {x, y, z: 0}},
				{buffer: readback, bytesPerRow, rowsPerImage: 1},
				{width: 1, height: 1, depthOrArrayLayers: 1},
			);
		}
		this.device.queue.submit([encoder.finish()]);
		if(readback){
			return {drawn: this.count, pixel: this.#mapPixel(readback)};
		}
		return {drawn: this.count};
	}

	async #mapPixel(readback){
		try{
			await readback.mapAsync(this.mapMode.READ);
			const raw = new Uint8Array(readback.getMappedRange(), 0, 4);
			return this.format.startsWith("bgra")
				? [raw[2], raw[1], raw[0], raw[3]]
				: [raw[0], raw[1], raw[2], raw[3]];
		}finally{
			readback.unmap?.();
			readback.destroy?.();
		}
	}

	async readPixel({x, y} = {}){
		if(!this.lastTexture || !this.lastViewport){
			return {rgba: null, reason: "NO_RENDERED_FRAME"};
		}
		if(!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
			x >= this.lastViewport[0] || y >= this.lastViewport[1]){
			throw new RangeError("pixel coordinates must be integers inside the last viewport");
		}
		if(!this.mapMode || !Number.isFinite(this.mapMode.READ)){
			return {rgba: null, reason: "GPU_MAP_READ_UNAVAILABLE"};
		}

		const bytesPerRow = 256;
		const readback = this.device.createBuffer({
			label: "native gaussian pixel readback",
			size: bytesPerRow,
			usage: this.usage.COPY_DST | this.usage.MAP_READ,
		});
		try{
			const encoder = this.device.createCommandEncoder({label: "native gaussian readback encoder"});
			encoder.copyTextureToBuffer(
				{texture: this.lastTexture, origin: {x, y, z: 0}},
				{buffer: readback, bytesPerRow, rowsPerImage: 1},
				{width: 1, height: 1, depthOrArrayLayers: 1},
			);
			this.device.queue.submit([encoder.finish()]);
			const rgba = await this.#mapPixel(readback);
			return {rgba};
		}finally{
			// #mapPixel owns the buffer after copy submission.
		}
	}

	destroy(){
		this.splatBuffer?.destroy?.();
		this.uniformBuffer?.destroy?.();
		this.splatBuffer = null;
		this.count = 0;
		this.lastTexture = null;
		this.lastViewport = null;
	}
}

export function createNativeGaussianRenderer(options = {}){
	const backend = resolveNativeGaussianBackend(options);
	if(backend.kind === "disabled"){
		return disabledRenderer(backend.reason);
	}

	return new WebGpuNativeGaussianRenderer({...backend, gpuConstants: options.gpuConstants});
}
