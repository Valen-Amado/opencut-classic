struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct LayerUniforms {
    resolution: vec2f,
    center: vec2f,
    size: vec2f,
    rotation_radians: f32,
    opacity: f32,
    flip_x: f32,
    flip_y: f32,
    corner_radius: f32,
    _padding: f32,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: LayerUniforms;

fn rotate_inverse(point: vec2f, angle: f32) -> vec2f {
    let c = cos(angle);
    let s = sin(angle);
    return vec2f(
        point.x * c + point.y * s,
        -point.x * s + point.y * c,
    );
}

// Antialiased coverage of a rounded rectangle centered on the origin. Distances
// are in canvas pixels, so the 1px ramp stays crisp at any layer scale.
fn rounded_rect_coverage(point: vec2f, half_size: vec2f, radius: f32) -> f32 {
    let corner = abs(point) - half_size + radius;
    let distance = length(max(corner, vec2f(0.0))) + min(max(corner.x, corner.y), 0.0) - radius;
    return clamp(0.5 - distance, 0.0, 1.0);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let pixel = input.tex_coord * uniforms.resolution;
    let local = rotate_inverse(pixel - uniforms.center, uniforms.rotation_radians);

    let uv = vec2f(
        local.x / uniforms.size.x + 0.5,
        local.y / uniforms.size.y + 0.5,
    );

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    let sample_uv = vec2f(
        select(uv.x, 1.0 - uv.x, uniforms.flip_x > 0.5),
        select(uv.y, 1.0 - uv.y, uniforms.flip_y > 0.5),
    );
    let color = textureSampleLevel(source_texture, source_sampler, sample_uv, 0.0);
    // Square layers skip the ramp so their edge pixels stay untouched.
    let coverage = select(
        1.0,
        rounded_rect_coverage(local, uniforms.size * 0.5, uniforms.corner_radius),
        uniforms.corner_radius > 0.0,
    );
    return vec4f(color.rgb, color.a * uniforms.opacity * coverage);
}
