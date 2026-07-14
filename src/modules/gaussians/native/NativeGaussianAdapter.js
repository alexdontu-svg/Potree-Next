function positiveFinite(value, label){
	if(!Number.isFinite(value) || value <= 0){
		throw new RangeError(`${label} must be a positive finite number`);
	}
	return value;
}

function floatView(value, expectedLength, label){
	let view;
	if(value instanceof Float32Array){
		view = value;
	}else if(value instanceof ArrayBuffer){
		view = new Float32Array(value);
	}else{
		throw new TypeError(`${label} must be an ArrayBuffer or Float32Array`);
	}
	if(view.length < expectedLength){
		throw new RangeError(`${label} must contain at least ${expectedLength} float32 values`);
	}
	return view;
}

function clamp(value, minimum, maximum){
	return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Converts the existing progressive PLY buffers into the compact native
 * renderer contract. PLY scales are world-space radii; the phase-one native
 * renderer uses a bounded pixel footprint until covariance projection lands.
 */
export function createNativeFixtureFromSplatData(splatData, {
	pixelScale = 1_000,
	minPixels = 1,
	maxPixels = 32,
} = {}){
	const capacity = splatData?.count;
	if(!Number.isInteger(capacity) || capacity < 0){
		throw new RangeError("count must be a non-negative integer");
	}
	const uploaded = splatData.uploadedCount ?? capacity;
	if(!Number.isInteger(uploaded) || uploaded < 0 || uploaded > capacity){
		throw new RangeError("uploadedCount must be between zero and count");
	}
	positiveFinite(pixelScale, "pixelScale");
	positiveFinite(minPixels, "minPixels");
	positiveFinite(maxPixels, "maxPixels");
	if(maxPixels < minPixels){
		throw new RangeError("maxPixels must be greater than or equal to minPixels");
	}

	const sourcePositions = floatView(splatData.positions, capacity * 3, "positions");
	const sourceColors = floatView(splatData.color, capacity * 4, "color");
	const sourceScales = floatView(splatData.scale, capacity * 3, "scale");
	const positions = new Float32Array(sourcePositions.subarray(0, uploaded * 3));
	const colors = new Float32Array(sourceColors.subarray(0, uploaded * 4));
	const scales = new Float32Array(uploaded * 2);

	for(let index = 0; index < uploaded; index++){
		for(const component of positions.subarray(index * 3, index * 3 + 3)){
			if(!Number.isFinite(component)) throw new TypeError(`positions contains a non-finite value at splat ${index}`);
		}
		for(const component of colors.subarray(index * 4, index * 4 + 4)){
			if(!Number.isFinite(component)) throw new TypeError(`color contains a non-finite value at splat ${index}`);
		}
		const sx = sourceScales[index * 3];
		const sy = sourceScales[index * 3 + 1];
		if(!Number.isFinite(sx) || !Number.isFinite(sy)){
			throw new TypeError(`scale contains a non-finite value at splat ${index}`);
		}
		scales[index * 2] = clamp(Math.abs(sx) * pixelScale, minPixels, maxPixels);
		scales[index * 2 + 1] = clamp(Math.abs(sy) * pixelScale, minPixels, maxPixels);
	}

	return {count: uploaded, positions, colors, scales};
}
