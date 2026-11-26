import * as THREE from 'three';
import { WesnothMapData, hexToWorld } from './WesnothMapSystem';

export interface OverworldWeatherBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface ParticleSimBuffers {
  count: number;
  anchorX: Float32Array;
  anchorY: Float32Array;
  anchorZ: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  lifeRate: Float32Array;
  phase: Float32Array;
  bobAmp: Float32Array;
}

function createRadialGlowTexture(size: number, power: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const dist = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(Math.max(0, 1 - dist), power);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createWeatherShaderMaterial(
  map: THREE.DataTexture,
  size: number,
  opacity: number,
  blending: THREE.Blending
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSize: { value: size },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aAlpha;
      uniform float uSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(uSize * (420.0 / max(1.0, -mvPosition.z)), 1.5, 160.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float alpha = tex.a * uOpacity * vAlpha;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vColor * tex.rgb, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending
  });
}

function deterministicRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getBiomeWeatherProfile(
  cat: string,
  overlay: string
): {
  fogHex: number;
  moteHex: number;
  vy: number;
  windScale: number;
} {
  if (cat === 'snow') {
    return { fogHex: 0xbcd8f5, moteHex: 0xd9eeff, vy: -0.22, windScale: 1.05 };
  }
  if (cat === 'volcanic' || cat === 'lava') {
    return { fogHex: 0x7d4c3e, moteHex: 0xf59e42, vy: 0.28, windScale: 0.75 };
  }
  if (cat === 'sand') {
    return { fogHex: 0xc9a574, moteHex: 0xe8bd76, vy: -0.04, windScale: 1.35 };
  }
  if (cat === 'swamp_water') {
    return { fogHex: 0x6ba68d, moteHex: 0x9ae6b4, vy: 0.05, windScale: 0.6 };
  }
  if (cat === 'shallow_water') {
    return { fogHex: 0x73a4cf, moteHex: 0xaad4f5, vy: 0.02, windScale: 1.0 };
  }
  if (overlay === 'forest') {
    return { fogHex: 0x7da896, moteHex: 0xded98c, vy: 0.04, windScale: 0.65 };
  }
  return { fogHex: 0x8aa3bf, moteHex: 0xebd19b, vy: 0.03, windScale: 0.85 };
}

export const MAX_OVERWORLD_FOG_WISPS = 64;
export const MAX_OVERWORLD_MOTES = 160;

export class OverworldWeatherSystem {
  public readonly group = new THREE.Group();
  public readonly fogPoints: THREE.Points;
  public readonly motePoints: THREE.Points;
  public readonly bounds: OverworldWeatherBounds;

  private fogGeo: THREE.BufferGeometry;
  private moteGeo: THREE.BufferGeometry;
  private fogMat: THREE.ShaderMaterial;
  private moteMat: THREE.ShaderMaterial;
  private fogTex: THREE.DataTexture;
  private moteTex: THREE.DataTexture;

  private fogSim: ParticleSimBuffers;
  private moteSim: ParticleSimBuffers;
  private particleScale = 1.0;

  constructor(map: WesnothMapData, initialParticleScale: number = 1.0) {
    const maxWorld = hexToWorld(map.width - 1, map.height - 1);
    this.bounds = {
      minX: -2.0,
      maxX: maxWorld.wx + 2.0,
      minZ: -2.0,
      maxZ: maxWorld.wz + 2.0
    };

    // Collect non-deep-water tiles so wisps and motes stay anchored over terrain & coastlines
    // instead of floating like bright dots over the dark outer ocean void.
    const activeTiles: Array<{ wx: number; wz: number; cat: string; overlay: string }> = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;
        const cat = tile.terrain.baseCategory;
        if (cat === 'deep_water') continue;
        const { wx, wz } = hexToWorld(x, y);
        activeTiles.push({
          wx,
          wz,
          cat,
          overlay: tile.terrain.overlayCategory ?? 'none'
        });
      }
    }
    if (activeTiles.length === 0) {
      activeTiles.push({ wx: maxWorld.wx * 0.5, wz: maxWorld.wz * 0.5, cat: 'flat', overlay: 'none' });
    }

    const rand = deterministicRand(0x56414c45);
    const tmpColor = new THREE.Color();

    // 1. Soft Drifting Biome-Tinted Atmospheric Fog Wisps
    this.fogTex = createRadialGlowTexture(48, 2.0);
    this.fogGeo = new THREE.BufferGeometry();
    const fogPositions = new Float32Array(MAX_OVERWORLD_FOG_WISPS * 3);
    const fogColors = new Float32Array(MAX_OVERWORLD_FOG_WISPS * 3);
    const fogAlphas = new Float32Array(MAX_OVERWORLD_FOG_WISPS);
    this.fogSim = {
      count: MAX_OVERWORLD_FOG_WISPS,
      anchorX: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      anchorY: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      anchorZ: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      vx: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      vy: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      vz: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      life: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      lifeRate: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      phase: new Float32Array(MAX_OVERWORLD_FOG_WISPS),
      bobAmp: new Float32Array(MAX_OVERWORLD_FOG_WISPS)
    };

    for (let i = 0; i < MAX_OVERWORLD_FOG_WISPS; i++) {
      const tile = activeTiles[Math.floor(rand() * activeTiles.length)];
      const ax = tile.wx + (rand() - 0.5) * 1.4;
      const az = tile.wz + (rand() - 0.5) * 1.4;
      const ay = 0.6 + rand() * 0.75;
      const prof = getBiomeWeatherProfile(tile.cat, tile.overlay);

      this.fogSim.anchorX[i] = ax;
      this.fogSim.anchorY[i] = ay;
      this.fogSim.anchorZ[i] = az;
      this.fogSim.vx[i] = (0.18 + rand() * 0.16) * prof.windScale;
      this.fogSim.vy[i] = 0;
      this.fogSim.vz[i] = (rand() - 0.35) * 0.12;
      const life = rand();
      this.fogSim.life[i] = life;
      this.fogSim.lifeRate[i] = 0.08 + rand() * 0.05;
      this.fogSim.phase[i] = rand() * Math.PI * 2;
      this.fogSim.bobAmp[i] = 0.06 + rand() * 0.06;

      const p3 = i * 3;
      fogPositions[p3] = ax + this.fogSim.vx[i] * life * 6.0;
      fogPositions[p3 + 1] = ay;
      fogPositions[p3 + 2] = az + this.fogSim.vz[i] * life * 6.0;
      fogAlphas[i] = Math.sin(life * Math.PI);

      tmpColor.setHex(prof.fogHex);
      fogColors[p3] = tmpColor.r;
      fogColors[p3 + 1] = tmpColor.g;
      fogColors[p3 + 2] = tmpColor.b;
    }

    this.fogGeo.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
    this.fogGeo.setAttribute('color', new THREE.BufferAttribute(fogColors, 3));
    this.fogGeo.setAttribute('aAlpha', new THREE.BufferAttribute(fogAlphas, 1));
    this.fogMat = createWeatherShaderMaterial(this.fogTex, 5.8, 0.16, THREE.NormalBlending);
    this.fogPoints = new THREE.Points(this.fogGeo, this.fogMat);
    this.fogPoints.frustumCulled = false;

    // 2. Subtle Biome Dust Motes, Frost Flurries & Caldera Embers
    this.moteTex = createRadialGlowTexture(32, 2.4);
    this.moteGeo = new THREE.BufferGeometry();
    const motePositions = new Float32Array(MAX_OVERWORLD_MOTES * 3);
    const moteColors = new Float32Array(MAX_OVERWORLD_MOTES * 3);
    const moteAlphas = new Float32Array(MAX_OVERWORLD_MOTES);
    this.moteSim = {
      count: MAX_OVERWORLD_MOTES,
      anchorX: new Float32Array(MAX_OVERWORLD_MOTES),
      anchorY: new Float32Array(MAX_OVERWORLD_MOTES),
      anchorZ: new Float32Array(MAX_OVERWORLD_MOTES),
      vx: new Float32Array(MAX_OVERWORLD_MOTES),
      vy: new Float32Array(MAX_OVERWORLD_MOTES),
      vz: new Float32Array(MAX_OVERWORLD_MOTES),
      life: new Float32Array(MAX_OVERWORLD_MOTES),
      lifeRate: new Float32Array(MAX_OVERWORLD_MOTES),
      phase: new Float32Array(MAX_OVERWORLD_MOTES),
      bobAmp: new Float32Array(MAX_OVERWORLD_MOTES)
    };

    for (let i = 0; i < MAX_OVERWORLD_MOTES; i++) {
      const tile = activeTiles[Math.floor(rand() * activeTiles.length)];
      const ax = tile.wx + (rand() - 0.5) * 1.3;
      const az = tile.wz + (rand() - 0.5) * 1.3;
      const prof = getBiomeWeatherProfile(tile.cat, tile.overlay);
      const ay = prof.vy < 0 ? 1.85 + rand() * 0.7 : 0.55 + rand() * 1.1;

      this.moteSim.anchorX[i] = ax;
      this.moteSim.anchorY[i] = ay;
      this.moteSim.anchorZ[i] = az;
      this.moteSim.vx[i] = (0.14 + rand() * 0.22) * prof.windScale;
      this.moteSim.vy[i] = prof.vy * (0.75 + rand() * 0.5);
      this.moteSim.vz[i] = (rand() - 0.4) * 0.16;
      const life = rand();
      this.moteSim.life[i] = life;
      this.moteSim.lifeRate[i] = 0.11 + rand() * 0.08;
      this.moteSim.phase[i] = rand() * Math.PI * 2;
      this.moteSim.bobAmp[i] = 0.05 + rand() * 0.08;

      const p3 = i * 3;
      const ageSec = life * 6.0;
      motePositions[p3] = ax + this.moteSim.vx[i] * ageSec;
      motePositions[p3 + 1] = ay + this.moteSim.vy[i] * ageSec;
      motePositions[p3 + 2] = az + this.moteSim.vz[i] * ageSec;
      moteAlphas[i] = Math.sin(life * Math.PI);

      tmpColor.setHex(prof.moteHex);
      moteColors[p3] = tmpColor.r;
      moteColors[p3 + 1] = tmpColor.g;
      moteColors[p3 + 2] = tmpColor.b;
    }

    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    this.moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
    this.moteGeo.setAttribute('aAlpha', new THREE.BufferAttribute(moteAlphas, 1));
    this.moteMat = createWeatherShaderMaterial(this.moteTex, 0.25, 0.44, THREE.AdditiveBlending);
    this.motePoints = new THREE.Points(this.moteGeo, this.moteMat);
    this.motePoints.frustumCulled = false;

    this.group.add(this.fogPoints, this.motePoints);
    this.setQualityScale(initialParticleScale);
  }

  public setQualityScale(scale: number) {
    this.particleScale = Math.max(0.2, Math.min(1.0, scale));
    this.fogGeo.setDrawRange(0, Math.max(1, Math.round(MAX_OVERWORLD_FOG_WISPS * this.particleScale)));
    this.moteGeo.setDrawRange(0, Math.max(1, Math.round(MAX_OVERWORLD_MOTES * this.particleScale)));
  }

  public getActiveCounts(): { fogCount: number; moteCount: number } {
    return {
      fogCount: this.fogGeo.drawRange.count,
      moteCount: this.moteGeo.drawRange.count
    };
  }

  public step(dt: number, elapsed: number) {
    if (dt <= 0) return;
    this.stepLayer(this.fogGeo, this.fogSim, this.fogGeo.drawRange.count, dt, elapsed);
    this.stepLayer(this.moteGeo, this.moteSim, this.moteGeo.drawRange.count, dt, elapsed);
  }

  private stepLayer(
    geo: THREE.BufferGeometry,
    sim: ParticleSimBuffers,
    activeCount: number,
    dt: number,
    elapsed: number
  ) {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const alphaAttr = geo.getAttribute('aAlpha') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const alphaArr = alphaAttr.array as Float32Array;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const limit = Math.min(sim.count, activeCount);

    for (let i = 0; i < limit; i++) {
      let life = sim.life[i] + sim.lifeRate[i] * dt;
      if (life >= 1) life -= Math.floor(life);
      sim.life[i] = life;

      const ageSec = life * 6.0;
      const sway = Math.sin(elapsed * 0.9 + sim.phase[i]) * sim.bobAmp[i];
      const px = Math.max(minX, Math.min(maxX, sim.anchorX[i] + sim.vx[i] * ageSec));
      const py = Math.max(0.35, sim.anchorY[i] + sim.vy[i] * ageSec + sway);
      const pz = Math.max(minZ, Math.min(maxZ, sim.anchorZ[i] + sim.vz[i] * ageSec));

      const p3 = i * 3;
      arr[p3] = px;
      arr[p3 + 1] = py;
      arr[p3 + 2] = pz;
      alphaArr[i] = Math.sin(life * Math.PI);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  public dispose() {
    this.fogGeo.dispose();
    this.moteGeo.dispose();
    this.fogMat.dispose();
    this.moteMat.dispose();
    this.fogTex.dispose();
    this.moteTex.dispose();
  }
}
