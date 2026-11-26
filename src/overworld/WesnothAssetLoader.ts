import * as THREE from 'three';

// Bundle all local Wesnoth terrain, transition, and unit PNGs cleanly with zero runtime network requests
const globAssets = import.meta.glob('../assets/wesnoth/**/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>;

export const WESNOTH_ASSET_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(globAssets)) {
  const file = path.split('/').pop() ?? '';
  const key = file.replace(/\.png$/i, '');
  if (key) {
    WESNOTH_ASSET_URLS[key] = url;
  }
}

const decodedImages = new Map<string, HTMLImageElement>();
const imageLoadPromises: Promise<void>[] = [];

export function preloadWesnothImages(): void {
  if (typeof Image === 'undefined') return;
  for (const [key, url] of Object.entries(WESNOTH_ASSET_URLS)) {
    if (decodedImages.has(key)) continue;
    const img = new Image();
    const p = new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    img.src = url;
    decodedImages.set(key, img);
    imageLoadPromises.push(p);
  }
}

preloadWesnothImages();

export function getWesnothImage(key: string): HTMLImageElement | null {
  return decodedImages.get(key) ?? null;
}

export function whenAllWesnothImagesReady(): Promise<void> {
  return Promise.all(imageLoadPromises).then(() => undefined);
}

function configurePixelTexture(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
}

export class WesnothTextureCache {
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();
  private onLoadCallback?: () => void;

  constructor(onLoadCallback?: () => void) {
    this.onLoadCallback = onLoadCallback;
  }

  public getTexture(key: string): THREE.Texture {
    const existing = this.textures.get(key);
    if (existing) return existing;

    const cachedImg = decodedImages.get(key);
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      const tex = new THREE.Texture(cachedImg);
      configurePixelTexture(tex);
      tex.needsUpdate = true;
      this.textures.set(key, tex);
      return tex;
    }

    const url = WESNOTH_ASSET_URLS[key] ?? WESNOTH_ASSET_URLS.grass_green;
    const tex = this.loader.load(url, () => {
      tex.needsUpdate = true;
      this.onLoadCallback?.();
    });
    configurePixelTexture(tex);
    this.textures.set(key, tex);
    return tex;
  }

  public disposeAll() {
    this.textures.forEach(t => t.dispose());
    this.textures.clear();
  }
}
