import assert from "node:assert/strict";
import test from "node:test";

import {
	computeGaussianBatchRange,
	parseGaussianPlyHeader,
} from "../src/modules/gaussians/GaussianPlyParser.js";

const REQUIRED_PROPERTIES = [
	"x", "y", "z",
	"f_dc_0", "f_dc_1", "f_dc_2",
	"opacity",
	"scale_0", "scale_1", "scale_2",
	"rot_0", "rot_1", "rot_2", "rot_3",
];

function makeHeader({lineEnding = "\n", omit = null, format = "binary_little_endian 1.0"} = {}){
	const properties = REQUIRED_PROPERTIES
		.filter(name => name !== omit)
		.map(name => `property float ${name}`);

	return [
		"ply",
		`format ${format}`,
		"comment parser fixture",
		"element vertex 7",
		"property uchar quality",
		...properties,
		"element face 0",
		"property list uchar int vertex_indices",
		"end_header",
		"",
	].join(lineEnding);
}

test("parses a binary little-endian Gaussian PLY header and computes byte offsets", () => {
	const header = makeHeader();
	const bytes = new TextEncoder().encode(`${header}binary payload`);
	const metadata = parseGaussianPlyHeader(bytes);

	assert.equal(metadata.vertexCount, 7);
	assert.equal(metadata.firstContentByte, new TextEncoder().encode(header).byteLength);
	assert.equal(metadata.stride, 1 + REQUIRED_PROPERTIES.length * 4);
	assert.equal(metadata.offsets.x, 1);
	assert.equal(metadata.offsets.y, 5);
	assert.equal(metadata.offsets.z, 9);
	assert.equal(metadata.offsets.f_dc_0, 13);
	assert.equal(metadata.offsets.opacity, 25);
	assert.equal(metadata.offsets.scale_0, 29);
	assert.equal(metadata.offsets.rot_0, 41);
});

test("counts CRLF bytes exactly when locating the binary payload", () => {
	const header = makeHeader({lineEnding: "\r\n"});
	const metadata = parseGaussianPlyHeader(new TextEncoder().encode(header));

	assert.equal(metadata.firstContentByte, new TextEncoder().encode(header).byteLength);
});

test("rejects truncated headers, unsupported formats, and missing properties", () => {
	assert.throws(
		() => parseGaussianPlyHeader(new TextEncoder().encode("ply\nformat binary_little_endian 1.0\n")),
		/header is incomplete/i,
	);
	assert.throws(
		() => parseGaussianPlyHeader(new TextEncoder().encode(makeHeader({format: "ascii 1.0"}))),
		/binary_little_endian/i,
	);
	assert.throws(
		() => parseGaussianPlyHeader(new TextEncoder().encode(makeHeader({omit: "rot_3"}))),
		/rot_3/i,
	);
});

test("computes inclusive HTTP byte ranges without requesting an extra byte", () => {
	assert.deepEqual(
		computeGaussianBatchRange(321, 57, 10_000, 73),
		{first: 570_321, last: 574_481, header: "bytes=570321-574481"},
	);

	assert.throws(() => computeGaussianBatchRange(0, 56, 0, 0), /positive integer/i);
});
