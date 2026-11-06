use std::collections::HashMap;

use gpu::wgpu;

pub struct StoredTexture {
    texture: wgpu::Texture,
}

impl StoredTexture {
    pub fn new(texture: wgpu::Texture) -> Self {
        Self { texture }
    }

    pub fn texture(&self) -> &wgpu::Texture {
        &self.texture
    }
}

/// Textures are destroyed as soon as they are replaced. On the web, dropping a
/// handle frees nothing until the JS garbage collector runs, and video uploads
/// one full frame per render, so memory would climb by gigabytes in between.
#[derive(Default)]
pub struct TextureStore {
    textures: HashMap<String, StoredTexture>,
}

impl TextureStore {
    pub fn upsert(&mut self, id: String, texture: wgpu::Texture) {
        if let Some(previous) = self.textures.insert(id, StoredTexture::new(texture)) {
            previous.texture.destroy();
        }
    }

    pub fn get(&self, id: &str) -> Option<&StoredTexture> {
        self.textures.get(id)
    }

    pub fn remove(&mut self, id: &str) {
        if let Some(previous) = self.textures.remove(id) {
            previous.texture.destroy();
        }
    }
}
