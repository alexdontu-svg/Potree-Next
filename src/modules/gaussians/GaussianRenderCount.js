function requireCount(name, value){
	if(!Number.isSafeInteger(value) || value < 0){
		throw new RangeError(`${name} must be a non-negative integer`);
	}
}

export function resolveGaussianRenderCount(numSplats, numSplatsUploaded){
	requireCount("numSplats", numSplats);
	requireCount("numSplatsUploaded", numSplatsUploaded);

	return Math.min(numSplats, numSplatsUploaded);
}
