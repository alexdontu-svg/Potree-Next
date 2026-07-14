const FLOATS_PER_SPLAT = 12;
const STRIDE_BYTES = FLOATS_PER_SPLAT * Float32Array.BYTES_PER_ELEMENT;

function assertFixtureCount(count){
	if(!Number.isInteger(count) || count < 1 || count > 100){
		throw new RangeError("count must be an integer between 1 and 100");
	}
}

function createGenerator(seed){
	if(!Number.isInteger(seed)){
		throw new TypeError("seed must be an integer");
	}

	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ value >>> 15, value | 1);
		value ^= value + Math.imul(value ^ value >>> 7, value | 61);
		return ((value ^ value >>> 14) >>> 0) / 4294967296;
	};
}

function assertFiniteArray(value, label){
	for(const component of value){
		if(!Number.isFinite(component)){
			throw new TypeError(`${label} contains a non-finite value`);
		}
	}
}

/**
 * Creates a tiny, deterministic scene in clip-friendly coordinates. It is
 * intentionally capped at 100 splats so it remains useful as a visual and
 * pixel-readback fixture rather than becoming an accidental benchmark.
 */
export function createNativeGaussianFixture({count = 1, seed = 1} = {}){
	assertFixtureCount(count);
	const random = createGenerator(seed);
	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 4);
	const scales = new Float32Array(count * 2);

	for(let index = 0; index < count; index++){
		const positionOffset = index * 3;
		positions[positionOffset] = -0.8 + 1.6 * random();
		positions[positionOffset + 1] = -0.8 + 1.6 * random();
		positions[positionOffset + 2] = -0.25 + 0.5 * random();

		const hue = random();
		const colorOffset = index * 4;
		colors[colorOffset] = 0.25 + 0.75 * Math.abs(Math.sin((hue + 0.00) * Math.PI));
		colors[colorOffset + 1] = 0.25 + 0.75 * Math.abs(Math.sin((hue + 0.33) * Math.PI));
		colors[colorOffset + 2] = 0.25 + 0.75 * Math.abs(Math.sin((hue + 0.66) * Math.PI));
		colors[colorOffset + 3] = 0.55 + 0.4 * random();

		const scaleOffset = index * 2;
		scales[scaleOffset] = 4 + 14 * random();
		scales[scaleOffset + 1] = 4 + 14 * random();
	}

	return {count, positions, colors, scales};
}

/** Packs each splat as position/pad, color, scale/pad: three aligned vec4s. */
export function packNativeGaussianSplats({count, positions, colors, scales}){
	if(!Number.isInteger(count) || count < 0){
		throw new RangeError("count must be a non-negative integer");
	}
	if(!(positions instanceof Float32Array) || positions.length !== count * 3){
		throw new TypeError("positions must contain exactly 3 values per splat");
	}
	if(!(colors instanceof Float32Array) || colors.length !== count * 4){
		throw new TypeError("colors must contain exactly 4 values per splat");
	}
	if(!(scales instanceof Float32Array) || scales.length !== count * 2){
		throw new TypeError("scales must contain exactly 2 values per splat");
	}

	assertFiniteArray(positions, "positions");
	assertFiniteArray(colors, "colors");
	assertFiniteArray(scales, "scales");

	const data = new Float32Array(count * FLOATS_PER_SPLAT);
	for(let index = 0; index < count; index++){
		const target = index * FLOATS_PER_SPLAT;
		data.set(positions.subarray(index * 3, index * 3 + 3), target);
		data[target + 3] = 1;
		data.set(colors.subarray(index * 4, index * 4 + 4), target + 4);
		data.set(scales.subarray(index * 2, index * 2 + 2), target + 8);
	}

	return {count, data, strideBytes: STRIDE_BYTES};
}
