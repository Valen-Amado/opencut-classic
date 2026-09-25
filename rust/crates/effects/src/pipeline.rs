use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");
const COLOR_ADJUST_SHADER_ID: &str = "color-adjust";
const COLOR_ADJUST_SHADER_SOURCE: &str = include_str!("shaders/color_adjust.wgsl");

/// Every effect shader the pipeline knows about, keyed by the id that effect
/// passes reference. Each shader owns its uniform layout; see
/// `pack_effect_uniforms`.
const EFFECT_SHADERS: &[(&str, &str)] = &[
    (GAUSSIAN_BLUR_SHADER_ID, GAUSSIAN_BLUR_SHADER_SOURCE),
    (COLOR_ADJUST_SHADER_ID, COLOR_ADJUST_SHADER_SOURCE),
];

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
}

/// Matches `EffectUniforms` in `shaders/gaussian_blur.wgsl`.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
struct GaussianBlurUniforms {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
}

/// Matches `ColorAdjustUniforms` in `shaders/color_adjust.wgsl`.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
struct ColorAdjustUniforms {
    resolution: [f32; 2],
    _padding: [f32; 2],
    light: [f32; 4],
    color: [f32; 4],
    fx: [f32; 4],
    extra: [f32; 4],
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let pipelines = EFFECT_SHADERS
            .iter()
            .map(|(shader_id, shader_source)| {
                let fragment_shader_module =
                    context
                        .device()
                        .create_shader_module(wgpu::ShaderModuleDescriptor {
                            label: Some(&format!("effects-{shader_id}-shader")),
                            source: wgpu::ShaderSource::Wgsl((*shader_source).into()),
                        });
                let pipeline =
                    context
                        .device()
                        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                            label: Some(&format!("effects-{shader_id}-pipeline")),
                            layout: Some(&pipeline_layout),
                            vertex: wgpu::VertexState {
                                module: &vertex_shader_module,
                                entry_point: Some("vertex_main"),
                                buffers: &[wgpu::VertexBufferLayout {
                                    array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                                    step_mode: wgpu::VertexStepMode::Vertex,
                                    attributes: &[wgpu::VertexAttribute {
                                        format: wgpu::VertexFormat::Float32x2,
                                        offset: 0,
                                        shader_location: 0,
                                    }],
                                }],
                                compilation_options: wgpu::PipelineCompilationOptions::default(),
                            },
                            fragment: Some(wgpu::FragmentState {
                                module: &fragment_shader_module,
                                entry_point: Some("fragment_main"),
                                targets: &[Some(wgpu::ColorTargetState {
                                    format: context.texture_format(),
                                    blend: None,
                                    write_mask: wgpu::ColorWrites::ALL,
                                })],
                                compilation_options: wgpu::PipelineCompilationOptions::default(),
                            }),
                            primitive: wgpu::PrimitiveState::default(),
                            depth_stencil: None,
                            multisample: wgpu::MultisampleState::default(),
                            multiview_mask: None,
                            cache: None,
                        });
                (shader_id.to_string(), pipeline)
            })
            .collect();

        Self {
            uniform_bind_group_layout,
            pipelines,
        }
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let input_texture = current_texture.as_ref().unwrap_or(source);
            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let texture_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-texture-bind-group"),
                        layout: context.texture_sampler_bind_group_layout(),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&input_view),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                            },
                        ],
                    });
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: &pack_effect_uniforms(pass, width, height)?,
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });
            let pipeline = self.pipelines.get(&pass.shader).ok_or_else(|| {
                EffectsError::UnknownEffectShader {
                    shader: pass.shader.clone(),
                }
            })?;

            {
                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

/// Packs a pass's uniforms into the byte layout its shader expects.
///
/// Each shader id owns its own uniform struct, so this dispatches on the id and
/// rejects both missing and unknown uniforms.
fn pack_effect_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, EffectsError> {
    let resolution = [width as f32, height as f32];
    match pass.shader.as_str() {
        GAUSSIAN_BLUR_SHADER_ID => {
            let sigma = read_number_uniform(pass, "u_sigma")?;
            let step = read_number_uniform(pass, "u_step")?;
            let direction = read_vec_uniform::<2>(pass, "u_direction")?;
            ensure_only_uniforms(pass, &["u_sigma", "u_step", "u_direction"])?;
            let uniforms = GaussianBlurUniforms {
                resolution,
                direction,
                scalars: [sigma, step, 0.0, 0.0],
            };
            Ok(bytemuck::bytes_of(&uniforms).to_vec())
        }
        COLOR_ADJUST_SHADER_ID => {
            let light = read_vec_uniform::<4>(pass, "u_light")?;
            let color = read_vec_uniform::<4>(pass, "u_color")?;
            let fx = read_vec_uniform::<4>(pass, "u_fx")?;
            let extra = read_vec_uniform::<4>(pass, "u_extra")?;
            ensure_only_uniforms(pass, &["u_light", "u_color", "u_fx", "u_extra"])?;
            let uniforms = ColorAdjustUniforms {
                resolution,
                _padding: [0.0; 2],
                light,
                color,
                fx,
                extra,
            };
            Ok(bytemuck::bytes_of(&uniforms).to_vec())
        }
        _ => Err(EffectsError::UnknownEffectShader {
            shader: pass.shader.clone(),
        }),
    }
}

fn ensure_only_uniforms(pass: &EffectPass, supported: &[&str]) -> Result<(), EffectsError> {
    match pass
        .uniforms
        .keys()
        .find(|uniform| !supported.contains(&uniform.as_str()))
    {
        Some(uniform) => Err(EffectsError::UnsupportedUniform {
            shader: pass.shader.clone(),
            uniform: uniform.clone(),
        }),
        None => Ok(()),
    }
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec_uniform<const N: usize>(
    pass: &EffectPass,
    uniform: &str,
) -> Result<[f32; N], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let invalid = || EffectsError::InvalidVectorUniform {
        shader: pass.shader.clone(),
        uniform: uniform.to_string(),
        expected_length: N,
    };
    let UniformValue::Vector(values) = value else {
        return Err(invalid());
    };
    values.as_slice().try_into().map_err(|_| invalid())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pass(shader: &str, uniforms: &[(&str, UniformValue)]) -> EffectPass {
        EffectPass {
            shader: shader.to_string(),
            uniforms: uniforms
                .iter()
                .map(|(name, value)| (name.to_string(), value.clone()))
                .collect(),
        }
    }

    fn color_adjust_pass() -> EffectPass {
        pass(
            COLOR_ADJUST_SHADER_ID,
            &[
                ("u_light", UniformValue::Vector(vec![0.1, 0.2, 0.3, 0.4])),
                ("u_color", UniformValue::Vector(vec![0.5, 0.6, 0.7, 0.8])),
                ("u_fx", UniformValue::Vector(vec![-0.5, 0.25, 0.5, 0.75])),
                ("u_extra", UniformValue::Vector(vec![42.0, 0.0, 0.0, 0.0])),
            ],
        )
    }

    fn floats(bytes: &[u8]) -> Vec<f32> {
        bytemuck::cast_slice::<u8, f32>(bytes).to_vec()
    }

    #[test]
    fn packs_gaussian_blur_uniforms_like_before() {
        let bytes = pack_effect_uniforms(
            &pass(
                GAUSSIAN_BLUR_SHADER_ID,
                &[
                    ("u_sigma", UniformValue::Number(4.0)),
                    ("u_step", UniformValue::Number(1.5)),
                    ("u_direction", UniformValue::Vector(vec![1.0, 0.0])),
                ],
            ),
            640,
            360,
        )
        .expect("blur uniforms pack");
        assert_eq!(
            floats(&bytes),
            vec![640.0, 360.0, 1.0, 0.0, 4.0, 1.5, 0.0, 0.0]
        );
    }

    #[test]
    fn packs_color_adjust_uniforms_in_shader_order() {
        let bytes =
            pack_effect_uniforms(&color_adjust_pass(), 1920, 1080).expect("color uniforms pack");
        assert_eq!(bytes.len(), std::mem::size_of::<ColorAdjustUniforms>());
        assert_eq!(
            bytes.len() % 16,
            0,
            "uniform buffers must be 16-byte aligned"
        );
        assert_eq!(
            floats(&bytes),
            vec![
                1920.0, 1080.0, 0.0, 0.0, // resolution + padding
                0.1, 0.2, 0.3, 0.4, // light
                0.5, 0.6, 0.7, 0.8, // color
                -0.5, 0.25, 0.5, 0.75, // fx
                42.0, 0.0, 0.0, 0.0, // extra
            ]
        );
    }

    #[test]
    fn rejects_missing_and_unknown_uniforms() {
        let mut missing = color_adjust_pass();
        missing.uniforms.remove("u_fx");
        assert!(matches!(
            pack_effect_uniforms(&missing, 1, 1),
            Err(EffectsError::MissingUniform { .. })
        ));

        let mut unknown = color_adjust_pass();
        unknown
            .uniforms
            .insert("u_sigma".into(), UniformValue::Number(1.0));
        assert!(matches!(
            pack_effect_uniforms(&unknown, 1, 1),
            Err(EffectsError::UnsupportedUniform { .. })
        ));

        let mut short = color_adjust_pass();
        short
            .uniforms
            .insert("u_light".into(), UniformValue::Vector(vec![1.0]));
        assert!(matches!(
            pack_effect_uniforms(&short, 1, 1),
            Err(EffectsError::InvalidVectorUniform { .. })
        ));

        assert!(matches!(
            pack_effect_uniforms(&pass("nope", &[]), 1, 1),
            Err(EffectsError::UnknownEffectShader { .. })
        ));
    }

    #[test]
    fn effect_shaders_are_valid_wgsl() {
        use wgpu::naga;
        for (shader_id, source) in EFFECT_SHADERS {
            let module = naga::front::wgsl::parse_str(source).unwrap_or_else(|error| {
                panic!(
                    "{shader_id} failed to parse: {}",
                    error.emit_to_string(source)
                )
            });
            naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::all(),
            )
            .validate(&module)
            .unwrap_or_else(|error| panic!("{shader_id} failed validation: {error:?}"));
        }
    }
}
