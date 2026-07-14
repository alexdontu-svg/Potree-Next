
import {GaussianSplats} from "./GaussianSplats.js";
import {Vector3} from "../../math/Vector3.js";
import {GaussianBoundsAccumulator} from "./GaussianBounds.js";
import {computeGaussianBatchRange, parseGaussianPlyHeader} from "./GaussianPlyParser.js";

const HEADER_INITIAL_END = 64 * 1024 - 1;
const HEADER_MAX_END = 8 * 1024 * 1024 - 1;

async function fetchHeader(url){
	let lastByte = HEADER_INITIAL_END;

	while(lastByte <= HEADER_MAX_END){
		const response = await fetch(url, {headers: {Range: `bytes=0-${lastByte}`}});
		if(!response.ok){
			throw new Error(`Failed to load Gaussian PLY header (${response.status} ${response.statusText})`);
		}

		const buffer = await response.arrayBuffer();
		try{
			return parseGaussianPlyHeader(buffer);
		}catch(error){
			const incomplete = error instanceof Error && /header is incomplete/i.test(error.message);
			const contentRange = response.headers.get("Content-Range");
			const match = contentRange?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
			const entireFileReceived = response.status === 200 || (match?.[3] !== "*" && Number(match?.[2]) + 1 >= Number(match?.[3]));

			if(!incomplete || entireFileReceived || lastByte === HEADER_MAX_END){
				throw error;
			}
		}

		lastByte = Math.min((lastByte + 1) * 2 - 1, HEADER_MAX_END);
	}

	throw new Error("Gaussian PLY header exceeds the 8 MiB safety limit");
}

async function fetchBatch(url, range){
	const response = await fetch(url, {headers: {Range: range.header}});
	if(!response.ok){
		throw new Error(`Failed to load Gaussian PLY bytes ${range.first}-${range.last} (${response.status} ${response.statusText})`);
	}

	const buffer = await response.arrayBuffer();
	const expectedLength = range.last - range.first + 1;
	let returnedFirst = response.status === 200 ? 0 : range.first;
	const contentRange = response.headers.get("Content-Range");
	const match = contentRange?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
	if(match){
		returnedFirst = Number(match[1]);
	}

	const offset = range.first - returnedFirst;
	if(offset < 0 || offset + expectedLength > buffer.byteLength){
		throw new Error(`Gaussian PLY server returned ${buffer.byteLength} bytes, but ${expectedLength} bytes were required for ${range.header}`);
	}

	return new DataView(buffer, offset, expectedLength);
}

export class GSLoader{

	constructor(){
		this.numSplats = 0;
		this.numSplatsLoaded = 0;
		this.bytesPerSplat = 0;

		this.offset_position = 0;
		this.offset_color = 0;
		this.offset_harmonics = 0;
		this.offset_opacity = 0;
		this.offset_scale = 0;
		this.offset_rotation = 0;
		this.firstContentByte = 0;

	}

	static async load(url){

		let loader = new GSLoader();
		let splats = new GaussianSplats(url);

		const metadata = await fetchHeader(url);
		loader.numSplats = metadata.vertexCount;
		loader.firstContentByte = metadata.firstContentByte;
		loader.bytesPerSplat = metadata.stride;
		loader.offset_position = metadata.offsets.x;
		loader.offset_color = metadata.offsets.f_dc_0;
		loader.offset_harmonics = metadata.offsets.f_rest_0 ?? 0;
		loader.offset_opacity = metadata.offsets.opacity;
		loader.offset_scale = metadata.offsets.scale_0;
		loader.offset_rotation = metadata.offsets.rot_0;

		{ // load splat data
			let numSplats = Math.floor(loader.numSplats / 1);

			let positions = new ArrayBuffer(12 * numSplats);
			let color     = new ArrayBuffer(16 * numSplats);
			let rotation  = new ArrayBuffer(16 * numSplats);
			let scale     = new ArrayBuffer(12 * numSplats);

			let v_positions = new DataView(positions);
			let v_color     = new DataView(color);
			let v_rotation  = new DataView(rotation);
			let v_scale     = new DataView(scale);
			const bounds = new GaussianBoundsAccumulator({nonFinite: "reject"});
			const updateBoundingBox = () => {
				const snapshot = bounds.snapshot();
				splats.boundingBox.min.copy(new Vector3(...snapshot.min));
				splats.boundingBox.max.copy(new Vector3(...snapshot.max));
			};

			const BATCH_SIZE = 10_000;
			let loadBatch = async (firstIndex, count) => {
				const range = computeGaussianBatchRange(loader.firstContentByte, loader.bytesPerSplat, firstIndex, count);
				const view = await fetchBatch(url, range);

				// console.log(`loading splats ${firstIndex} to ${count}`);

				for(let splatIndex = 0; splatIndex < count; splatIndex++){

					let targetIndex = firstIndex + splatIndex;
					const sourceOffset = splatIndex * loader.bytesPerSplat;

					{ // POSITION
						let x = view.getFloat32(sourceOffset + metadata.offsets.x, true);
						let y = view.getFloat32(sourceOffset + metadata.offsets.y, true);
						let z = view.getFloat32(sourceOffset + metadata.offsets.z, true);
						bounds.add(x, y, z, targetIndex);

						v_positions.setFloat32(12 * targetIndex + 0, x, true);
						v_positions.setFloat32(12 * targetIndex + 4, y, true);
						v_positions.setFloat32(12 * targetIndex + 8, z, true);
					}

					{ // COLOR & OPACITY
						let R = view.getFloat32(sourceOffset + metadata.offsets.f_dc_0, true);
						let G = view.getFloat32(sourceOffset + metadata.offsets.f_dc_1, true);
						let B = view.getFloat32(sourceOffset + metadata.offsets.f_dc_2, true);

						let clamp = v => Math.min(Math.max(v, 0), 1);
						let O = view.getFloat32(sourceOffset + metadata.offsets.opacity, true);
						let opacity = (1.0 / (1.0 + Math.exp(-O)));

						let CO = 0.28209479177387814; // spherical harmonics coefficient
						let r = clamp(0.5 + CO * R, 0, 1);
						let g = clamp(0.5 + CO * G, 0, 1);
						let b = clamp(0.5 + CO * B, 0, 1);

						v_color.setFloat32(16 * targetIndex +  0, r, true);
						v_color.setFloat32(16 * targetIndex +  4, g, true);
						v_color.setFloat32(16 * targetIndex +  8, b, true);
						v_color.setFloat32(16 * targetIndex + 12, opacity, true);
					}

					{ // SCALE
						let sx = view.getFloat32(sourceOffset + metadata.offsets.scale_0, true);
						let sy = view.getFloat32(sourceOffset + metadata.offsets.scale_1, true);
						let sz = view.getFloat32(sourceOffset + metadata.offsets.scale_2, true);

						sx = Math.exp(sx);
						sy = Math.exp(sy);
						sz = Math.exp(sz);

						v_scale.setFloat32(12 * targetIndex + 0, sx, true);
						v_scale.setFloat32(12 * targetIndex + 4, sy, true);
						v_scale.setFloat32(12 * targetIndex + 8, sz, true);

						// if(splatIndex < 5){
						// 	console.log({sx, sy, sz});
						// }
					}

					{ // ROTATION
						let w = view.getFloat32(sourceOffset + metadata.offsets.rot_0, true);
						let x = view.getFloat32(sourceOffset + metadata.offsets.rot_1, true);
						let y = view.getFloat32(sourceOffset + metadata.offsets.rot_2, true);
						let z = view.getFloat32(sourceOffset + metadata.offsets.rot_3, true);

						let length = Math.sqrt(x * x + y * y + z * z + w * w);

						v_rotation.setFloat32(16 * targetIndex +  0, x / length, true);
						v_rotation.setFloat32(16 * targetIndex +  4, y / length, true);
						v_rotation.setFloat32(16 * targetIndex +  8, z / length, true);
						v_rotation.setFloat32(16 * targetIndex + 12, w / length, true);
					}

				}

				updateBoundingBox();
				splats.numSplatsLoaded = firstIndex + count;
			};

			splats.numSplats = numSplats;
			splats.numSplatsLoaded = 0;
			splats.splatData = {positions, color, rotation, scale };
			splats.loadError = null;
			updateBoundingBox();
			splats.loading = (async () => {
				for(let firstIndex = 0; firstIndex < numSplats; firstIndex += BATCH_SIZE){
					const count = Math.min(BATCH_SIZE, numSplats - firstIndex);
					await loadBatch(firstIndex, count);
				}
			})().catch(error => {
				splats.loadError = error;
				splats.dispatcher.dispatch("error", {splats, error});
				console.error(`Failed to stream Gaussian splats from ${url}`, error);
			});
		}

		return splats;
	}

}
