// Color adjustment effect.
//
// Operates on straight (non-premultiplied) alpha, the same convention layer
// textures use: RGB is adjusted, alpha is passed through untouched. Every
// adjustment is normalized so 0 is neutral; with all zeros the pass is an
// identity (up to 8-bit quantization).

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct ColorAdjustUniforms {
    resolution: vec2f,
    _padding: vec2f,
    // exposure, brightness, contrast, highlights  (each -1..1)
    light: vec4f,
    // shadows, temperature, tint, saturation      (each -1..1)
    color: vec4f,
    // hue (-1..1 => -180..180 deg), fade, vignette, grain (each 0..1)
    fx: vec4f,
    // seed (changes per frame for animated grain), unused, unused, unused
    extra: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: ColorAdjustUniforms;

const PI: f32 = 3.14159265358979;
const LUMA: vec3f = vec3f(0.2126, 0.7152, 0.0722);

fn luma(color: vec3f) -> f32 {
    return dot(color, LUMA);
}

fn srgb_to_linear(color: vec3f) -> vec3f {
    let low = color / 12.92;
    let high = pow((color + 0.055) / 1.055, vec3f(2.4));
    return select(high, low, color <= vec3f(0.04045));
}

fn linear_to_srgb(color: vec3f) -> vec3f {
    let low = color * 12.92;
    let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
    return select(high, low, color <= vec3f(0.0031308));
}

// Exposure in stops (x * 2 => -2..+2 EV), applied in linear light.
fn apply_exposure(color: vec3f, exposure: f32) -> vec3f {
    if (exposure == 0.0) {
        return color;
    }
    let linear = srgb_to_linear(max(color, vec3f(0.0))) * exp2(exposure * 2.0);
    return linear_to_srgb(linear);
}

// White balance: temperature pushes toward orange (+) or blue (-), tint toward
// magenta (+) or green (-). Luma is kept so the shift doesn't read as a
// brightness change.
fn apply_white_balance(color: vec3f, temperature: f32, tint: f32) -> vec3f {
    if (temperature == 0.0 && tint == 0.0) {
        return color;
    }
    let gains = vec3f(
        1.0 + temperature * 0.25 + tint * 0.1,
        1.0 + temperature * 0.05 - tint * 0.25,
        1.0 - temperature * 0.25 + tint * 0.1,
    );
    let balanced = color * max(gains, vec3f(0.0));
    let before = luma(color);
    let after = luma(balanced);
    if (after <= 0.0001) {
        return balanced;
    }
    return balanced * (before / after);
}

// Highlights / shadows: luma-weighted lifts or pulls, added evenly to all
// channels so hue is preserved.
fn apply_tones(color: vec3f, highlights: f32, shadows: f32) -> vec3f {
    let l = clamp(luma(color), 0.0, 1.0);
    let highlight_weight = smoothstep(0.35, 1.0, l);
    let shadow_weight = 1.0 - smoothstep(0.0, 0.65, l);
    return color + vec3f(highlights * 0.3 * highlight_weight + shadows * 0.3 * shadow_weight);
}

// Hue rotation around the luma axis in YIQ space.
fn rotate_hue(color: vec3f, turns: f32) -> vec3f {
    if (turns == 0.0) {
        return color;
    }
    let angle = turns * PI;
    let y = dot(color, vec3f(0.299, 0.587, 0.114));
    let i = dot(color, vec3f(0.595716, -0.274453, -0.321263));
    let q = dot(color, vec3f(0.211456, -0.522591, 0.311135));
    let c = cos(angle);
    let s = sin(angle);
    let i2 = i * c - q * s;
    let q2 = i * s + q * c;
    return vec3f(
        y + 0.9563 * i2 + 0.6210 * q2,
        y - 0.2721 * i2 - 0.6474 * q2,
        y - 1.1070 * i2 + 1.7046 * q2,
    );
}

fn hash_u32(value: u32) -> u32 {
    // PCG hash.
    let state = value * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Uniform noise in [-0.5, 0.5) per pixel, reseeded by `seed`.
fn grain_noise(pixel: vec2f, seed: f32) -> f32 {
    let p = vec2u(max(floor(pixel), vec2f(0.0)));
    let h = hash_u32(p.x ^ hash_u32(p.y ^ hash_u32(bitcast<u32>(seed))));
    return f32(h) / 4294967296.0 - 0.5;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let source = textureSample(input_texture, input_sampler, input.tex_coord);

    let exposure = uniforms.light.x;
    let brightness = uniforms.light.y;
    let contrast = uniforms.light.z;
    let highlights = uniforms.light.w;
    let shadows = uniforms.color.x;
    let temperature = uniforms.color.y;
    let tint = uniforms.color.z;
    let saturation = uniforms.color.w;
    let hue = uniforms.fx.x;
    let fade = uniforms.fx.y;
    let vignette = uniforms.fx.z;
    let grain = uniforms.fx.w;
    let seed = uniforms.extra.x;

    var color = source.rgb;

    color = apply_exposure(color, exposure);

    // Brightness: additive offset (+-0.25 at the extremes).
    color = color + vec3f(brightness * 0.25);

    // Contrast around mid-gray: -1 flattens to gray, +1 doubles the slope.
    color = (color - vec3f(0.5)) * (1.0 + contrast) + vec3f(0.5);

    color = apply_tones(color, highlights, shadows);

    // Saturation, luma-preserving: -1 => grayscale, +1 => double chroma.
    let l = luma(color);
    color = mix(vec3f(l), color, 1.0 + saturation);

    color = rotate_hue(color, hue);

    // White balance goes after saturation so warm/cool tones survive a
    // black-and-white look (e.g. sepia = desaturate + warm).
    color = apply_white_balance(color, temperature, tint);

    // Fade: lift blacks toward 0.25 and pull whites slightly down.
    color = color * (1.0 - 0.35 * fade) + vec3f(0.25 * fade);

    color = clamp(color, vec3f(0.0), vec3f(1.0));

    // Vignette: circular in pixel space (aspect-correct), 1.0 at the corners.
    if (vignette > 0.0) {
        let offset = (input.tex_coord - vec2f(0.5)) * uniforms.resolution;
        let distance = length(offset) / max(length(uniforms.resolution * 0.5), 0.0001);
        let falloff = smoothstep(0.35, 1.05, distance);
        color = color * (1.0 - vignette * 0.85 * falloff);
    }

    // Film grain: stronger in midtones than in pure black/white.
    if (grain > 0.0) {
        let noise = grain_noise(input.tex_coord * uniforms.resolution, seed);
        let midtone = 1.0 - abs(luma(color) * 2.0 - 1.0) * 0.6;
        color = color + vec3f(noise * grain * 0.2 * midtone);
    }

    return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), source.a);
}
