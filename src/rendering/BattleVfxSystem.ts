import * as THREE from 'three';
import { BattleBiome } from '../types/game';

const ELEVATION_STEP = 0.52;
const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();

export type SkillVfxElement = 'steel' | 'fire' | 'lightning' | 'solar' | 'venom' | 'acid' | 'astral' | 'heal' | 'buff';

export interface SkillCastVfxParams {
  originX: number;
  originY: number;
  originZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  element: SkillVfxElement;
  isRanged: boolean;
  aoeRadius: number;
  heavy: boolean;
}

interface ShockwaveSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface SlashArcSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  baseYaw: number;
  sweepDir: number;
}

interface SkyBeamSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  baseY: number;
  rising: boolean;
  baseRadiusScale: number;
}

interface ProjectileSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  arcHeight: number;
  colorHex: number;
  impactRingScale: number;
}

interface BoltSlot {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  positions: Float32Array;
  active: boolean;
  life: number;
  maxLife: number;
}

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity: number;
  color: THREE.Color;
  scale: number;
}

function createSoftGlowTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(Math.max(0, 1 - d), 2.2);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function getElementVfxColor(element: SkillVfxElement): number {
  switch (element) {
    case 'fire':
      return 0xf97316;
    case 'lightning':
      return 0x38bdf8;
    case 'solar':
      return 0xfde047;
    case 'heal':
      return 0x34d399;
    case 'astral':
      return 0xc084fc;
    case 'acid':
      return 0x84cc16;
    case 'venom':
      return 0xa855f7;
    case 'buff':
      return 0x60a5fa;
    case 'steel':
    default:
      return 0xfacc15;
  }
}

export class BattleVfxSystem {
  public readonly group = new THREE.Group();

  private shockwaves: ShockwaveSlot[] = [];
  private slashArcs: SlashArcSlot[] = [];
  private skyBeams: SkyBeamSlot[] = [];
  private projectiles: ProjectileSlot[] = [];
  private bolts: BoltSlot[] = [];

  private particlePool: ParticleSlot[] = [];
  private particleMesh: THREE.InstancedMesh;
  private readonly MAX_PARTICLES = 140;

  private impactLight: THREE.PointLight;
  private impactLightLife = 0;
  private impactLightMaxLife = 0.38;
  private impactLightIntensity = 0;

  // Ambient biome motes
  private ambientGeo: THREE.BufferGeometry;
  private ambientMat: THREE.ShaderMaterial;
  private ambientTex: THREE.DataTexture;
  private ambientPoints: THREE.Points;
  private readonly MAX_AMBIENT = 72;
  private ambientBase: Float32Array;
  private ambientPhase: Float32Array;
  private ambientRiseSpeed: number = 0.14;
  private particleScale = 1.0;

  // Shared geometries disposed cleanly on cleanup
  private sharedGeos: THREE.BufferGeometry[] = [];
  private sharedMats: THREE.Material[] = [];

  constructor(
    gridWidth: number,
    gridHeight: number,
    biome: BattleBiome,
    initialParticleScale: number = 1.0
  ) {
    this.particleScale = initialParticleScale;

    // 1. Expanding Ground Shockwaves
    const ringGeo = new THREE.RingGeometry(0.38, 0.56, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.sharedGeos.push(ringGeo);

    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.sharedMats.push(mat);
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.shockwaves.push({ mesh, mat, active: false, life: 0, maxLife: 0.4, startScale: 0.4, endScale: 1.8 });
    }

    // 2. Sweeping Melee Crescent Slash Arcs
    const slashGeo = new THREE.RingGeometry(0.45, 0.96, 18, 1, -1.05, 2.1);
    slashGeo.rotateX(-Math.PI / 2);
    this.sharedGeos.push(slashGeo);

    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.sharedMats.push(mat);
      const mesh = new THREE.Mesh(slashGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.slashArcs.push({ mesh, mat, active: false, life: 0, maxLife: 0.28, baseYaw: 0, sweepDir: 1 });
    }

    // 3. Vertical Sky Beams (Astral / Meteor / Sanctuary / Buff Pillars)
    const beamGeo = new THREE.CylinderGeometry(0.24, 0.46, 4.6, 14, 1, true);
    this.sharedGeos.push(beamGeo);

    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xc084fc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.sharedMats.push(mat);
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.skyBeams.push({ mesh, mat, active: false, life: 0, maxLife: 0.52, baseY: 0, rising: false, baseRadiusScale: 1 });
    }

    // 4. Arcing Energy / Alchemy / Bolt Projectiles
    const projGeo = new THREE.OctahedronGeometry(0.16, 1);
    this.sharedGeos.push(projGeo);

    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.95
      });
      this.sharedMats.push(mat);
      const mesh = new THREE.Mesh(projGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.projectiles.push({
        mesh,
        mat,
        active: false,
        life: 0,
        maxLife: 0.26,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        arcHeight: 1.4,
        colorHex: 0xf97316,
        impactRingScale: 1.8
      });
    }

    // 5. Jagged 3D Lightning / Synergy Link Bolts (7 vertices per bolt)
    for (let i = 0; i < 6; i++) {
      const positions = new Float32Array(7 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.sharedGeos.push(geo);

      const mat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0
      });
      this.sharedMats.push(mat);

      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.bolts.push({ line, mat, positions, active: false, life: 0, maxLife: 0.34 });
    }

    // 6. Pooled Instanced Particles
    const pGeo = new THREE.OctahedronGeometry(0.085, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sharedGeos.push(pGeo);
    this.sharedMats.push(pMat);
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particlePool.push({
        active: false,
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        gravity: 6.5,
        color: new THREE.Color(0xffffff),
        scale: 1
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _tmpColor.setHex(0xffffff));
    }
    this.group.add(this.particleMesh);

    // 7. Single Pooled Transient Dynamic PointLight for dramatic skill flashes
    this.impactLight = new THREE.PointLight(0xfacc15, 0, 7.5, 1.8);
    this.impactLight.position.set(gridWidth * 0.5, 3, gridHeight * 0.5);
    this.group.add(this.impactLight);

    // 8. Ambient Biome Motes floating softly across the arena
    this.ambientTex = createSoftGlowTexture(24);
    this.ambientGeo = new THREE.BufferGeometry();
    const ambPos = new Float32Array(this.MAX_AMBIENT * 3);
    const ambCol = new Float32Array(this.MAX_AMBIENT * 3);
    this.ambientBase = new Float32Array(this.MAX_AMBIENT * 3);
    this.ambientPhase = new Float32Array(this.MAX_AMBIENT);

    const motePalette =
      biome === 'caldera'
        ? [0xf97316, 0xfbbf24, 0xfb7185]
        : biome === 'ruins'
          ? [0xfde047, 0x38bdf8, 0xfef3c7]
          : [0xd9f99d, 0xfef08a, 0xbae6fd];
    this.ambientRiseSpeed = biome === 'caldera' ? 0.34 : 0.14;

    for (let i = 0; i < this.MAX_AMBIENT; i++) {
      const x = -1.2 + ((i * 37) % 100) / 100 * (gridWidth + 2.4);
      const z = -1.2 + ((i * 73) % 100) / 100 * (gridHeight + 2.4);
      const y = 0.7 + ((i * 53) % 100) / 100 * 2.6;
      this.ambientBase[i * 3] = x;
      this.ambientBase[i * 3 + 1] = y;
      this.ambientBase[i * 3 + 2] = z;
      ambPos[i * 3] = x;
      ambPos[i * 3 + 1] = y;
      ambPos[i * 3 + 2] = z;
      this.ambientPhase[i] = (i * 0.618) * Math.PI * 2;

      _tmpColor.setHex(motePalette[i % motePalette.length]);
      ambCol[i * 3] = _tmpColor.r;
      ambCol[i * 3 + 1] = _tmpColor.g;
      ambCol[i * 3 + 2] = _tmpColor.b;
    }

    this.ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
    this.ambientGeo.setAttribute('color', new THREE.BufferAttribute(ambCol, 3));
    this.ambientMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.ambientTex },
        uSize: { value: 0.24 },
        uOpacity: { value: 0.45 }
      },
      vertexShader: `
        attribute vec3 color;
        uniform float uSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uSize * (400.0 / max(1.0, -mvPosition.z)), 1.5, 18.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float alpha = tex.a * uOpacity;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(vColor * tex.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.ambientPoints = new THREE.Points(this.ambientGeo, this.ambientMat);
    this.ambientPoints.frustumCulled = false;
    this.group.add(this.ambientPoints);

    this.setQualityScale(initialParticleScale);
  }

  public setQualityScale(scale: number) {
    this.particleScale = Math.max(0.25, Math.min(1.0, scale));
    this.ambientGeo.setDrawRange(0, Math.max(8, Math.round(this.MAX_AMBIENT * this.particleScale)));
  }

  public triggerSkillCast(params: SkillCastVfxParams) {
    const colorHex = getElementVfxColor(params.element);
    const ox = params.originX;
    const oy = (params.originY + 1) * ELEVATION_STEP + 0.62;
    const oz = params.originZ;
    const tx = params.targetX;
    const ty = (params.targetY + 1) * ELEVATION_STEP + 0.12;
    const tz = params.targetZ;

    this.flashImpactLight(tx, ty + 0.9, tz, colorHex, params.heavy ? 5.2 : 3.2);

    if (params.element === 'lightning') {
      // Sky-to-target lightning bolt + caster spark bolt
      this.spawnJaggedBolt(tx, ty + 4.4, tz, tx, ty + 0.2, tz, 0xe0f2fe);
      if (Math.hypot(tx - ox, tz - oz) > 0.5) {
        this.spawnJaggedBolt(ox, oy, oz, tx, ty + 0.5, tz, 0x38bdf8);
      }
      this.spawnShockwave(tx, ty + 0.04, tz, 0x38bdf8, 0.35, 1.6 + params.aoeRadius * 0.95, 0.42);
      this.spawnBurst(tx, ty + 0.5, tz, 0x7dd3fc, Math.round(16 * this.particleScale), 1.4, 3.2);
      return;
    }

    if (params.element === 'astral') {
      // Descending celestial beam + expanding rune shockwave
      this.spawnSkyBeam(tx, ty, tz, 0xc084fc, false, 0.9 + params.aoeRadius * 0.65, 0.55);
      this.spawnShockwave(tx, ty + 0.04, tz, 0xe879f9, 0.4, 1.9 + params.aoeRadius * 1.1, 0.52);
      this.spawnBurst(tx, ty + 0.4, tz, 0xd8b4fe, Math.round(22 * this.particleScale), 2.0, 2.2);
      return;
    }

    if (params.element === 'heal' || params.element === 'solar') {
      const rising = params.element === 'heal';
      this.spawnSkyBeam(tx, ty, tz, colorHex, rising, 0.85 + params.aoeRadius * 0.55, 0.54);
      this.spawnShockwave(tx, ty + 0.04, tz, colorHex, 0.3, 1.5 + params.aoeRadius * 0.9, 0.48);
      this.spawnBurst(tx, ty + 0.35, tz, colorHex, Math.round(16 * this.particleScale), -1.8, 1.8);
      return;
    }

    if (params.element === 'buff') {
      this.spawnSkyBeam(tx, ty, tz, colorHex, true, 0.85, 0.46);
      this.spawnShockwave(tx, ty + 0.04, tz, colorHex, 0.3, 1.35, 0.42);
      return;
    }

    if (params.isRanged || params.element === 'fire' || params.element === 'acid' || params.element === 'venom') {
      const arc = params.element === 'steel' ? 0.55 : 1.55;
      this.spawnProjectile(ox, oy, oz, tx, ty + 0.42, tz, colorHex, arc, 1.5 + params.aoeRadius * 0.95);
      return;
    }

    // Melee steel slash arc + ground shockwave
    const yaw = Math.atan2(tx - ox, tz - oz);
    this.spawnSlashArc(tx, ty + 0.5, tz, colorHex, yaw, params.heavy ? 1.3 : 1.0);
    this.spawnShockwave(tx, ty + 0.04, tz, colorHex, 0.3, params.heavy ? 1.7 : 1.25, 0.36);
    this.spawnBurst(tx, ty + 0.45, tz, colorHex, Math.round((params.heavy ? 18 : 10) * this.particleScale), 5.5, 2.6);
  }

  public spawnChainArc(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    colorHex: number
  ) {
    const fy = (fromY + 1) * ELEVATION_STEP + 0.55;
    const ty = (toY + 1) * ELEVATION_STEP + 0.55;
    this.spawnJaggedBolt(fromX, fy, fromZ, toX, ty, toZ, colorHex);
    this.spawnShockwave(toX, (toY + 1) * ELEVATION_STEP + 0.06, toZ, colorHex, 0.25, 1.25, 0.35);
    this.spawnBurst(toX, ty, toZ, colorHex, Math.round(10 * this.particleScale), 2.5, 2.0);
  }

  public spawnShockwave(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    startScale: number,
    endScale: number,
    duration: number = 0.42
  ) {
    const slot = this.shockwaves.find(s => !s.active) ?? this.shockwaves[0];
    slot.active = true;
    slot.life = duration;
    slot.maxLife = duration;
    slot.startScale = startScale;
    slot.endScale = endScale;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.9;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(startScale);
    slot.mesh.visible = true;
  }

  public spawnSlashArc(x: number, y: number, z: number, colorHex: number, yaw: number, scale: number = 1.0) {
    const slot = this.slashArcs.find(s => !s.active) ?? this.slashArcs[0];
    slot.active = true;
    slot.life = 0.28;
    slot.maxLife = 0.28;
    slot.baseYaw = yaw;
    slot.sweepDir = 1;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.95;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(scale);
    slot.mesh.rotation.set(0.22, yaw - 0.9, 0.15);
    slot.mesh.visible = true;
  }

  public spawnSkyBeam(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    rising: boolean,
    radiusScale: number = 1.0,
    duration: number = 0.52
  ) {
    const slot = this.skyBeams.find(s => !s.active) ?? this.skyBeams[0];
    slot.active = true;
    slot.life = duration;
    slot.maxLife = duration;
    slot.baseY = y;
    slot.rising = rising;
    slot.baseRadiusScale = radiusScale;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.72;
    slot.mesh.position.set(x, y + 2.2, z);
    slot.mesh.scale.set(radiusScale, 1, radiusScale);
    slot.mesh.visible = true;
  }

  public spawnProjectile(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    colorHex: number,
    arcHeight: number,
    impactRingScale: number
  ) {
    const slot = this.projectiles.find(s => !s.active) ?? this.projectiles[0];
    slot.active = true;
    slot.maxLife = 0.25;
    slot.life = 0.25;
    slot.start.set(sx, sy, sz);
    slot.end.set(ex, ey, ez);
    slot.arcHeight = arcHeight;
    slot.colorHex = colorHex;
    slot.impactRingScale = impactRingScale;
    slot.mat.color.setHex(colorHex);
    slot.mesh.position.copy(slot.start);
    slot.mesh.visible = true;
  }

  public spawnJaggedBolt(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    colorHex: number
  ) {
    const slot = this.bolts.find(b => !b.active) ?? this.bolts[0];
    slot.active = true;
    slot.life = 0.34;
    slot.maxLife = 0.34;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 1.0;

    const segments = 6;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : 0.24;
      const jx = (Math.random() - 0.5) * jitter;
      const jy = (Math.random() - 0.5) * jitter * 0.6;
      const jz = (Math.random() - 0.5) * jitter;
      slot.positions[i * 3] = x0 + (x1 - x0) * t + jx;
      slot.positions[i * 3 + 1] = y0 + (y1 - y0) * t + jy;
      slot.positions[i * 3 + 2] = z0 + (z1 - z0) * t + jz;
    }
    const attr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    slot.line.visible = true;
  }

  public flashImpactLight(x: number, y: number, z: number, colorHex: number, intensity: number = 3.8) {
    this.impactLight.color.setHex(colorHex);
    this.impactLight.position.set(x, y, z);
    this.impactLightIntensity = intensity;
    this.impactLight.intensity = intensity;
    this.impactLightLife = this.impactLightMaxLife;
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count: number,
    gravity: number = 6.5,
    speedScale: number = 2.2
  ) {
    let spawned = 0;
    const clampedCount = Math.max(3, count);
    for (let i = 0; i < this.MAX_PARTICLES && spawned < clampedCount; i++) {
      const slot = this.particlePool[i];
      if (!slot.active) {
        slot.active = true;
        slot.maxLife = 0.42 + Math.random() * 0.28;
        slot.life = slot.maxLife;
        slot.gravity = gravity;
        slot.pos.set(x, y, z);
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * speedScale;
        slot.vel.set(
          Math.cos(angle) * speed,
          gravity < 0 ? 1.2 + Math.random() * 1.6 : 1.4 + Math.random() * 2.1,
          Math.sin(angle) * speed
        );
        slot.color.setHex(colorHex);
        slot.scale = 0.75 + Math.random() * 0.75;
        spawned++;
      }
    }
  }

  public step(dt: number, elapsed: number) {
    // 1. Shockwaves
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.life -= dt;
      if (sw.life <= 0) {
        sw.active = false;
        sw.mesh.visible = false;
      } else {
        const t = 1 - sw.life / sw.maxLife;
        const eased = 1 - Math.pow(1 - t, 3);
        sw.mesh.scale.setScalar(sw.startScale + (sw.endScale - sw.startScale) * eased);
        sw.mat.opacity = 0.9 * (1 - t);
      }
    }

    // 2. Slash arcs
    for (const sa of this.slashArcs) {
      if (!sa.active) continue;
      sa.life -= dt;
      if (sa.life <= 0) {
        sa.active = false;
        sa.mesh.visible = false;
      } else {
        const t = 1 - sa.life / sa.maxLife;
        sa.mesh.rotation.y = sa.baseYaw - 0.9 + t * 1.9 * sa.sweepDir;
        sa.mat.opacity = 0.95 * (1 - t * t);
      }
    }

    // 3. Sky beams
    for (const sb of this.skyBeams) {
      if (!sb.active) continue;
      sb.life -= dt;
      if (sb.life <= 0) {
        sb.active = false;
        sb.mesh.visible = false;
      } else {
        const t = 1 - sb.life / sb.maxLife;
        const widthFade = Math.sin(t * Math.PI);
        sb.mesh.scale.set(sb.baseRadiusScale * (0.65 + 0.5 * widthFade), 1, sb.baseRadiusScale * (0.65 + 0.5 * widthFade));
        sb.mesh.position.y = sb.rising ? sb.baseY + 1.8 + t * 1.6 : sb.baseY + 3.4 - t * 1.3;
        sb.mesh.rotation.y += dt * 3.5;
        sb.mat.opacity = 0.68 * Math.sin(t * Math.PI);
      }
    }

    // 4. Projectiles
    for (const pr of this.projectiles) {
      if (!pr.active) continue;
      pr.life -= dt;
      if (pr.life <= 0) {
        pr.active = false;
        pr.mesh.visible = false;
        this.spawnShockwave(pr.end.x, pr.end.y - 0.32, pr.end.z, pr.colorHex, 0.35, pr.impactRingScale, 0.42);
        this.spawnBurst(pr.end.x, pr.end.y + 0.1, pr.end.z, pr.colorHex, Math.round(18 * this.particleScale), 5.5, 2.8);
      } else {
        const t = 1 - pr.life / pr.maxLife;
        pr.mesh.position.lerpVectors(pr.start, pr.end, t);
        pr.mesh.position.y += Math.sin(t * Math.PI) * pr.arcHeight;
        pr.mesh.rotation.x += dt * 14;
        pr.mesh.rotation.y += dt * 10;
        if (Math.random() < 0.65) {
          this.spawnBurst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, pr.colorHex, 1, 1.5, 0.5);
        }
      }
    }

    // 5. Lightning bolts
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.line.visible = false;
      } else {
        b.mat.opacity = b.life / b.maxLife;
      }
    }

    // 6. Pooled particles
    let anyParticleActive = false;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const slot = this.particlePool[i];
      if (!slot.active) continue;
      anyParticleActive = true;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
      } else {
        slot.vel.y -= slot.gravity * dt;
        slot.pos.addScaledVector(slot.vel, dt);
        const t = slot.life / slot.maxLife;
        _dummy.position.copy(slot.pos);
        _dummy.scale.setScalar(slot.scale * t);
        _dummy.rotation.set(t * 4, t * 3, 0);
      }
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, slot.color);
    }
    if (anyParticleActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // 7. Transient impact light
    if (this.impactLightLife > 0) {
      this.impactLightLife = Math.max(0, this.impactLightLife - dt);
      const t = this.impactLightLife / this.impactLightMaxLife;
      this.impactLight.intensity = this.impactLightIntensity * (t * t);
    }

    // 8. Ambient Biome Motes
    const posAttr = this.ambientGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const activeAmb = this.ambientGeo.drawRange.count;
    for (let i = 0; i < activeAmb; i++) {
      const p3 = i * 3;
      const ph = this.ambientPhase[i];
      const cycle = ((elapsed * this.ambientRiseSpeed + ph) % 2.8);
      arr[p3] = this.ambientBase[p3] + Math.sin(elapsed * 0.7 + ph) * 0.35;
      arr[p3 + 1] = 0.65 + cycle;
      arr[p3 + 2] = this.ambientBase[p3 + 2] + Math.cos(elapsed * 0.6 + ph) * 0.25;
    }
    posAttr.needsUpdate = true;
  }

  public dispose() {
    this.sharedGeos.forEach(g => g.dispose());
    this.sharedMats.forEach(m => m.dispose());
    this.ambientGeo.dispose();
    this.ambientMat.dispose();
    this.ambientTex.dispose();
  }
}
