use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::BlendMode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDescriptor {
    pub width: u32,
    pub height: u32,
    pub clear: CanvasClearDescriptor,
    pub items: Vec<FrameItemDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasClearDescriptor {
    pub color: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
// `rename_all` only renames the variant tags; `rename_all_fields` is needed so
// struct-variant fields like `effect_pass_groups` accept the camelCase the web sends.
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum FrameItemDescriptor {
    Layer(LayerDescriptor),
    SceneEffect {
        effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    pub texture_id: String,
    pub transform: QuadTransformDescriptor,
    pub opacity: f32,
    /// Percent of the largest radius the layer fits: 0 is square, 100 rounds the
    /// shorter side completely. Relative so it follows the layer's scale.
    #[serde(default)]
    pub corner_radius: f32,
    pub blend_mode: BlendMode,
    #[serde(default)]
    pub effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    pub mask: Option<LayerMaskDescriptor>,
}

impl LayerDescriptor {
    pub fn corner_radius_pixels(&self) -> f32 {
        let largest_radius = self.transform.width.abs().min(self.transform.height.abs()) / 2.0;
        largest_radius * self.corner_radius.clamp(0.0, 100.0) / 100.0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadTransformDescriptor {
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_degrees: f32,
    pub flip_x: bool,
    pub flip_y: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMaskDescriptor {
    pub texture_id: String,
    pub feather: f32,
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectPassDescriptor {
    pub shader: String,
    pub uniforms: HashMap<String, EffectUniformValueDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EffectUniformValueDescriptor {
    Number(f32),
    Vector(Vec<f32>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasTextureDescriptor {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod tests {
    use super::{FrameItemDescriptor, LayerDescriptor};

    fn layer_with_corner_radius(corner_radius: Option<f32>) -> LayerDescriptor {
        let corner_radius = corner_radius
            .map(|value| format!(r#""cornerRadius":{value},"#))
            .unwrap_or_default();
        serde_json::from_str(&format!(
            r#"{{
                "textureId":"source",
                "transform":{{
                    "centerX":0,"centerY":0,"width":-400,"height":200,
                    "rotationDegrees":0,"flipX":true,"flipY":false
                }},
                "opacity":1,
                {corner_radius}
                "blendMode":"normal",
                "mask":null
            }}"#
        ))
        .expect("layer should deserialize")
    }

    #[test]
    fn layers_without_corner_radius_stay_square() {
        assert_eq!(layer_with_corner_radius(None).corner_radius_pixels(), 0.0);
    }

    #[test]
    fn corner_radius_is_relative_to_the_shorter_side() {
        assert_eq!(
            layer_with_corner_radius(Some(50.0)).corner_radius_pixels(),
            50.0
        );
        assert_eq!(
            layer_with_corner_radius(Some(100.0)).corner_radius_pixels(),
            100.0
        );
    }

    #[test]
    fn corner_radius_is_clamped_to_the_valid_range() {
        assert_eq!(
            layer_with_corner_radius(Some(250.0)).corner_radius_pixels(),
            100.0
        );
        assert_eq!(
            layer_with_corner_radius(Some(-10.0)).corner_radius_pixels(),
            0.0
        );
    }

    #[test]
    fn scene_effect_reads_camel_case_fields() {
        let item: FrameItemDescriptor =
            serde_json::from_str(r#"{"type":"sceneEffect","effectPassGroups":[[]]}"#)
                .expect("scene effect should deserialize");
        match item {
            FrameItemDescriptor::SceneEffect { effect_pass_groups } => {
                assert_eq!(effect_pass_groups.len(), 1);
            }
            FrameItemDescriptor::Layer(_) => panic!("expected a scene effect"),
        }
    }
}
