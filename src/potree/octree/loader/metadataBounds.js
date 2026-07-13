function finite(value, path){
	if(typeof value !== "number" || !Number.isFinite(value)){
		throw new TypeError(`${path} must be a finite number`);
	}

	return value;
}

function vector3(value, path){
	if(!Array.isArray(value) || value.length < 3){
		throw new TypeError(`${path} must contain three finite numbers`);
	}

	return [
		finite(value[0], `${path}[0]`),
		finite(value[1], `${path}[1]`),
		finite(value[2], `${path}[2]`),
	];
}

function validatedBounds(bounds, path){
	if(bounds === null || typeof bounds !== "object"){
		throw new TypeError(`${path} must define min and max`);
	}

	let min = vector3(bounds.min, `${path}.min`);
	let max = vector3(bounds.max, `${path}.max`);

	for(let axis = 0; axis < 3; axis++){
		if(min[axis] > max[axis]){
			throw new RangeError(`${path} min must not exceed max on axis ${axis}`);
		}
	}

	return {min, max};
}

/**
 * Returns the actual point-content bounds stored on Potree's position attribute.
 * The hierarchy boundingBox remains the independent cubic subdivision volume.
 */
export function extractTightBounds(metadata){
	if(metadata === null || typeof metadata !== "object"){
		throw new TypeError("metadata must be an object");
	}

	let hierarchy = validatedBounds(metadata.boundingBox, "metadata.boundingBox");
	let position = metadata.attributes?.find(attribute => attribute?.name === "position");

	if(!position){
		throw new TypeError("metadata must contain a position attribute");
	}

	let tight = validatedBounds(position, "position");

	for(let axis = 0; axis < 3; axis++){
		if(tight.min[axis] < hierarchy.min[axis] || tight.max[axis] > hierarchy.max[axis]){
			throw new RangeError(`position bounds must be inside metadata.boundingBox on axis ${axis}`);
		}
	}

	return tight;
}

/** Translate world-space bounds into the local frame used by PointCloudOctree. */
export function toLocalBounds(bounds, origin){
	let validated = validatedBounds(bounds, "bounds");
	let localOrigin = vector3(origin, "origin");

	return {
		min: validated.min.map((value, axis) => value - localOrigin[axis]),
		max: validated.max.map((value, axis) => value - localOrigin[axis]),
	};
}
