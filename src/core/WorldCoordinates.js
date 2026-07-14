/**
 * Stereo70 coordinate boundary for rendering and UI code.
 *
 * Internal/world convention: X = Est, Y = Nord, Z = Cota.
 * UI convention: Nord, Est, Cota.
 * All values remain JavaScript Numbers (IEEE-754 float64). GPU-specific float32
 * conversion must happen after worldToLocal(), outside this service.
 */

function finiteNumber(value, path) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError(`${path} must be a finite number`);
	}

	return value;
}

function copyInternal(point, name) {
	if (point === null || typeof point !== "object") {
		throw new TypeError(`${name} must be an object`);
	}

	return {
		x: finiteNumber(point.x, `${name}.x`),
		y: finiteNumber(point.y, `${name}.y`),
		z: finiteNumber(point.z, `${name}.z`),
	};
}

/** Convert internal X/Y/Z ordering to UI Nord/Est/Cota ordering. */
export function internalToUi(point) {
	const internal = copyInternal(point, "internal");

	return {
		nord: internal.y,
		est: internal.x,
		cota: internal.z,
	};
}

/** Convert UI Nord/Est/Cota ordering to internal X/Y/Z ordering. */
export function uiToInternal(point) {
	if (point === null || typeof point !== "object") {
		throw new TypeError("ui must be an object");
	}

	return {
		x: finiteNumber(point.est, "ui.est"),
		y: finiteNumber(point.nord, "ui.nord"),
		z: finiteNumber(point.cota, "ui.cota"),
	};
}

export class WorldCoordinates {
	#origin;

	constructor(origin) {
		this.#origin = Object.freeze(copyInternal(origin, "origin"));
	}

	/** Return a copy so the coordinate frame cannot be mutated externally. */
	get origin() {
		return {...this.#origin};
	}

	worldToLocal(point) {
		const world = copyInternal(point, "world");

		return {
			x: world.x - this.#origin.x,
			y: world.y - this.#origin.y,
			z: world.z - this.#origin.z,
		};
	}

	localToWorld(point) {
		const local = copyInternal(point, "local");

		return {
			x: local.x + this.#origin.x,
			y: local.y + this.#origin.y,
			z: local.z + this.#origin.z,
		};
	}

	internalToUi(point) {
		return internalToUi(point);
	}

	uiToInternal(point) {
		return uiToInternal(point);
	}
}
