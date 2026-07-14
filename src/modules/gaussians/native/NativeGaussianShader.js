export const NATIVE_GAUSSIAN_SHADER = /* wgsl */ `
struct Uniforms {
	viewProjection: mat4x4<f32>,
	viewport: vec2<f32>,
	_padding: vec2<f32>,
};

struct Splat {
	position: vec4<f32>,
	color: vec4<f32>,
	scale: vec4<f32>,
};

struct VertexOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
	@location(1) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> splats: array<Splat>;

const QUAD = array<vec2<f32>, 6>(
	vec2<f32>(-1.0, -1.0),
	vec2<f32>( 1.0, -1.0),
	vec2<f32>( 1.0,  1.0),
	vec2<f32>(-1.0, -1.0),
	vec2<f32>( 1.0,  1.0),
	vec2<f32>(-1.0,  1.0),
);

@vertex
fn vertexMain(
	@builtin(vertex_index) vertexIndex: u32,
	@builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
	let splat = splats[instanceIndex];
	let corner = QUAD[vertexIndex];
	let center = uniforms.viewProjection * splat.position;
	let pixelToNdc = vec2<f32>(2.0) / uniforms.viewport;
	let offset = corner * splat.scale.xy * pixelToNdc * center.w;

	var output: VertexOutput;
	output.position = center + vec4<f32>(offset, 0.0, 0.0);
	output.uv = corner * 3.0;
	output.color = splat.color;
	return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
	let weight = exp(-0.5 * dot(input.uv, input.uv));
	let alpha = clamp(input.color.a * weight, 0.0, 1.0);
	if(alpha < (1.0 / 255.0)) {
		discard;
	}
	return vec4<f32>(input.color.rgb * alpha, alpha);
}
`;
