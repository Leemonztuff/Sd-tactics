import * as THREE from 'three';

export type QualityTier = 'eco' | 'balanced' | 'high';

export interface QualityPreset {
  tier: QualityTier;
  label: string;
  shortLabel: string;
  maxPixelRatio: number;
  shadowsEnabled: boolean;
  outlinesEnabled: boolean;
  particleScale: number;
  anisotropyCap: number;
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  eco: {
    tier: 'eco',
    label: 'Eco (Low-End 2GB)',
    shortLabel: 'Eco',
    maxPixelRatio: 1.0,
    shadowsEnabled: false,
    outlinesEnabled: false,
    particleScale: 0.45,
    anisotropyCap: 1,
    antialias: false
  },
  balanced: {
    tier: 'balanced',
    label: 'Balanced (Mobile)',
    shortLabel: 'Balanced',
    maxPixelRatio: 1.35,
    shadowsEnabled: false,
    outlinesEnabled: true,
    particleScale: 0.75,
    anisotropyCap: 4,
    antialias: true
  },
  high: {
    tier: 'high',
    label: 'High (Desktop)',
    shortLabel: 'High',
    maxPixelRatio: 2.0,
    shadowsEnabled: true,
    outlinesEnabled: true,
    particleScale: 1.0,
    anisotropyCap: 8,
    antialias: true
  }
};

/**
 * Brawl-Tactics Aesthetic Bible Constants (60-30-10 luminance discipline).
 * Calibrated to eliminate washed-out white glare on Overworld tiles/sprites
 * while preserving punchy Supercell-inspired silhouette readability.
 */
export const BRAWL_PALETTE = {
  overworld: {
    backgroundHex: 0x102238,
    fogDensity: 0.0165,
    toneMappingExposure: 1.02,
    sunColor: 0xffebc7,
    sunIntensity: 1.3,
    hemiSky: 0x93c5fd,
    hemiGround: 0x2a3147,
    hemiIntensity: 0.76,
    rimColor: 0x6098e6,
    rimIntensity: 0.36,
    // Pre-lit Wesnoth terrain PNGs use a calibrated cool-stone tint (~0.74 linear) so
    // cobbles/snow/roads never blow out to white while grass & earth stay vibrant.
    terrainTintHex: 0xd8dfe8,
    propSpriteTintHex: 0xe0e6ee,
    unitSpriteTintHex: 0xffffff,
    bridgeTintHex: 0xe5ded5,
    castleWallHex: 0x7c8aa3,
    castleTrimHex: 0x5b6982,
    seaHex: 0x1e568a,
    reefHex: 0x174169
  },
  battle: {
    backgroundHex: 0x131d31,
    fogDensity: 0.013,
    toneMappingExposure: 1.08,
    sunColor: 0xffedd0,
    sunIntensity: 1.42,
    hemiSky: 0x93c5fd,
    hemiGround: 0x2c2b47,
    hemiIntensity: 0.8,
    rimColor: 0x60a5fa,
    rimIntensity: 0.45,
    outlineHex: 0x161229,
    plinthHex: 0x202b40,
    rimBoardHex: 0x3a4a66
  }
} as const;

export interface DeviceProbeInput {
  isSoftwareGl: boolean;
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  viewportWidth?: number;
}

export function resolveDefaultQualityTier(input: DeviceProbeInput): QualityTier {
  if (input.isSoftwareGl) return 'eco';
  if (typeof input.deviceMemoryGb === 'number' && input.deviceMemoryGb <= 3) {
    return 'eco';
  }
  const isNarrowMobile = typeof input.viewportWidth === 'number' && input.viewportWidth <= 820;
  if (isNarrowMobile && typeof input.hardwareConcurrency === 'number' && input.hardwareConcurrency <= 4) {
    return 'eco';
  }
  if (isNarrowMobile || (typeof input.deviceMemoryGb === 'number' && input.deviceMemoryGb <= 4)) {
    return 'balanced';
  }
  return 'high';
}

export function probeClientDeviceTier(isSoftwareGl: boolean): QualityTier {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  return resolveDefaultQualityTier({
    isSoftwareGl,
    deviceMemoryGb: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
    viewportWidth: win?.innerWidth
  });
}

let sharedToonGradient: THREE.DataTexture | null = null;

/**
 * 3-step Brawl-style cel shading ramp (shadow -> mid -> bright highlight).
 * Keeps shadowed faces saturated rather than collapsing into muddy gray.
 */
export function getBrawlToonGradientTexture(): THREE.DataTexture {
  if (sharedToonGradient) return sharedToonGradient;
  const bands = new Uint8Array([108, 186, 255]);
  const tex = new THREE.DataTexture(bands, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedToonGradient = tex;
  return tex;
}

const outlineMaterialCache = new Map<number, THREE.MeshBasicMaterial>();

function getOutlineMaterial(colorHex: number): THREE.MeshBasicMaterial {
  const existing = outlineMaterialCache.get(colorHex);
  if (existing) return existing;
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.BackSide
  });
  outlineMaterialCache.set(colorHex, mat);
  return mat;
}

/**
 * Adds a lightweight inverted-hull ink outline child to a mesh so characters pop
 * like Brawl Stars models. Tagged with `userData.isOutline = true` for zero-rebuild
 * toggling by the Quality Tier system.
 */
export function attachInvertedHullOutline(
  mesh: THREE.Mesh,
  scaleFactor: number = 1.075,
  colorHex: number = BRAWL_PALETTE.battle.outlineHex
): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial(colorHex));
  outline.scale.setScalar(scaleFactor);
  outline.userData.isOutline = true;
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

export function setOutlinesVisible(root: THREE.Object3D, visible: boolean): void {
  root.traverse(obj => {
    if (obj.userData?.isOutline) {
      obj.visible = visible;
    }
  });
}

export function attachWebGLContextGuards(
  canvas: HTMLCanvasElement,
  onLost?: () => void,
  onRestored?: () => void
): () => void {
  const handleLost = (e: Event) => {
    e.preventDefault();
    onLost?.();
  };
  const handleRestored = () => {
    onRestored?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}
