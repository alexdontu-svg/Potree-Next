const TYPE_SIZES = new Map([
	["char", 1], ["int8", 1],
	["uchar", 1], ["uint8", 1],
	["short", 2], ["int16", 2],
	["ushort", 2], ["uint16", 2],
	["int", 4], ["int32", 4],
	["uint", 4], ["uint32", 4],
	["float", 4], ["float32", 4],
	["double", 8], ["float64", 8],
]);

export const GAUSSIAN_REQUIRED_PROPERTIES = Object.freeze([
	"x", "y", "z",
	"f_dc_0", "f_dc_1", "f_dc_2",
	"opacity",
	"scale_0", "scale_1", "scale_2",
	"rot_0", "rot_1", "rot_2", "rot_3",
]);

function asBytes(source){
	if(source instanceof Uint8Array){
		return source;
	}
	if(source instanceof ArrayBuffer){
		return new Uint8Array(source);
	}
	if(ArrayBuffer.isView(source)){
		return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
	}
	if(typeof source === "string"){
		return new TextEncoder().encode(source);
	}

	throw new TypeError("PLY header must be a string, ArrayBuffer, or typed array");
}

function extractHeader(bytes){
	const decoder = new TextDecoder("utf-8", {fatal: true});
	const lines = [];
	let lineStart = 0;

	for(let index = 0; index < bytes.byteLength; index++){
		if(bytes[index] !== 0x0a){
			continue;
		}

		let lineEnd = index;
		if(lineEnd > lineStart && bytes[lineEnd - 1] === 0x0d){
			lineEnd--;
		}
		const line = decoder.decode(bytes.subarray(lineStart, lineEnd));
		lines.push(line);
		lineStart = index + 1;

		if(line.trim() === "end_header"){
			return {lines, firstContentByte: lineStart};
		}
	}

	throw new Error("PLY header is incomplete: end_header followed by a newline was not found");
}

export function parseGaussianPlyHeader(source){
	const bytes = asBytes(source);
	const {lines, firstContentByte} = extractHeader(bytes);

	if(lines[0]?.trim() !== "ply"){
		throw new Error("Invalid PLY header: missing ply signature");
	}

	let vertexCount = null;
	let currentElement = null;
	let stride = 0;
	let format = null;
	const offsets = Object.create(null);
	const propertyTypes = Object.create(null);

	for(const rawLine of lines){
		const line = rawLine.trim();
		if(line === "" || line.startsWith("comment ") || line.startsWith("obj_info ")){
			continue;
		}

		const tokens = line.split(/\s+/);
		if(tokens[0] === "format"){
			format = `${tokens[1] ?? ""} ${tokens[2] ?? ""}`.trim();
		}else if(tokens[0] === "element"){
			currentElement = tokens[1];
			if(currentElement === "vertex"){
				vertexCount = Number(tokens[2]);
				if(!Number.isSafeInteger(vertexCount) || vertexCount < 0){
					throw new Error(`Invalid PLY vertex count: ${tokens[2]}`);
				}
			}
		}else if(tokens[0] === "property" && currentElement === "vertex"){
			if(tokens[1] === "list"){
				throw new Error("List properties are not supported on PLY vertex elements");
			}

			const [, type, name] = tokens;
			const size = TYPE_SIZES.get(type);
			if(size === undefined || !name){
				throw new Error(`Unsupported PLY vertex property: ${rawLine}`);
			}
			if(Object.hasOwn(offsets, name)){
				throw new Error(`Duplicate PLY vertex property: ${name}`);
			}

			offsets[name] = stride;
			propertyTypes[name] = type;
			stride += size;
		}
	}

	if(format !== "binary_little_endian 1.0"){
		throw new Error(`Gaussian PLY must use format binary_little_endian 1.0; received ${format || "none"}`);
	}
	if(vertexCount === null){
		throw new Error("PLY header has no vertex element");
	}

	const missing = GAUSSIAN_REQUIRED_PROPERTIES.filter(name => !Object.hasOwn(offsets, name));
	if(missing.length > 0){
		throw new Error(`Gaussian PLY is missing required properties: ${missing.join(", ")}`);
	}

	const nonFloat = GAUSSIAN_REQUIRED_PROPERTIES.filter(name => !["float", "float32"].includes(propertyTypes[name]));
	if(nonFloat.length > 0){
		throw new Error(`Gaussian PLY properties must be float32: ${nonFloat.join(", ")}`);
	}

	return {vertexCount, firstContentByte, stride, offsets, propertyTypes};
}

export function computeGaussianBatchRange(firstContentByte, stride, firstIndex, count){
	if(!Number.isSafeInteger(firstContentByte) || firstContentByte < 0){
		throw new RangeError("firstContentByte must be a non-negative integer");
	}
	if(!Number.isSafeInteger(stride) || stride <= 0){
		throw new RangeError("stride must be a positive integer");
	}
	if(!Number.isSafeInteger(firstIndex) || firstIndex < 0){
		throw new RangeError("firstIndex must be a non-negative integer");
	}
	if(!Number.isSafeInteger(count) || count <= 0){
		throw new RangeError("count must be a positive integer");
	}

	const first = firstContentByte + firstIndex * stride;
	const last = first + count * stride - 1;
	if(!Number.isSafeInteger(first) || !Number.isSafeInteger(last)){
		throw new RangeError("Gaussian PLY byte range exceeds JavaScript's safe integer limit");
	}

	return {first, last, header: `bytes=${first}-${last}`};
}
