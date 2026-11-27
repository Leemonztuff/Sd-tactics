import * as THREE from 'three';
import {
  HEX_RADIUS,
  HEX_SQRT3,
  HexCoord,
  ReachableHex,
  WesnothHexTile,
  WesnothMapData,
  hexToWorld
} from './WesnothMapSystem';
import {
  HexDirection,
  computeHexAutoTilePlan,
  computeReachableFrontierEdges,
  getDirectionalNeighbors
} from './WesnothAutoTiler';
import { ActivePatrolState } from './OverworldManager';
import { ActiveWorldEventNode } from './OverworldEvents';
import { OverworldWeatherSystem } from './OverworldWeatherSystem';
import { OVERWORLD_VILLAGES, OverworldPoiSpec } from './WesnothOverworldMap';
import {
  OVERWORLD_LANDMARKS,
  getPoiWesnothAsset,
  getWorldEventWesnothAsset
} from './WesnothIconRegistry';
import {
  DungeonAllySpec,
  DungeonFloorSpec,
  DungeonTrapSpec,
  DungeonTreasureSpec,
  OverworldRuinSpec
} from './WesnothDungeonMaps';
import { WesnothTextureCache } from './WesnothAssetLoader';
import { ShroudVisibilityState, WesnothTileAtlas, TILE_PX } from './WesnothTileAtlas';
import { WesnothMovetypeId } from './WesnothTerrain';
import {
  BRAWL_PALETTE,
  QUALITY_PRESETS,
  QualityPreset,
  attachWebGLContextGuards,
  probeClientDeviceTier
} from '../rendering/BrawlStyleSystem';

const _vec3A = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

export interface OverworldSceneBuildOptions {
  isDungeon: boolean;
  floorSpec?: DungeonFloorSpec;
  ruins?: OverworldRuinSpec[];
  visibility?: ShroudVisibilityState;
  detectedTraps?: DungeonTrapSpec[];
  treasures?: DungeonTreasureSpec[];
  allies?: DungeonAllySpec[];
}

interface BillboardSpriteEntry {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  bobPhase: number;
}

interface PatrolVisualEntry {
  group: THREE.Group;
  sprite: THREE.Mesh;
  ring: THREE.Mesh;
  targetPos: THREE.Vector3;
  phase: number;
  hexX: number;
  hexY: number;
}

interface PoiVisualEntry {
  group: THREE.Group;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  baseY: number;
  phase: number;
}

interface WorldEventVisualEntry {
  group: THREE.Group;
  prop: THREE.Object3D;
  ring: THREE.Mesh;
  baseY: number;
  phase: number;
}

interface RuinVisualEntry {
  group: THREE.Group;
  sprite: THREE.Mesh;
  ring: THREE.Mesh;
  baseY: number;
  phase: number;
}

interface DungeonMarkerEntry {
  group: THREE.Group;
  hexKey: string;
  sprite?: THREE.Mesh;
  ring: THREE.Mesh;
  baseY: number;
  phase: number;
}

interface DungeonWallEntry {
  hexKey: string;
  group: THREE.Group;
  sideMesh: THREE.Mesh;
}

const HEX_CORNERS: Array<{ x: number; z: number }> = Array.from({ length: 6 }, (_, i) => {
  const ang = (i * Math.PI) / 3;
  return {
    x: Math.cos(ang) * HEX_RADIUS * 1.004,
    z: Math.sin(ang) * HEX_RADIUS * 1.004
  };
});

// Edge corner pairs matching HEX_DIRECTIONS: ['n', 'ne', 'se', 's', 'sw', 'nw']
const DIR_EDGE_CORNERS: Record<HexDirection, [number, number]> = {
  n: [4, 5],
  ne: [5, 0],
  se: [0, 1],
  s: [1, 2],
  sw: [2, 3],
  nw: [3, 4]
};

function getHexEdgeTransform(dir: HexDirection, radiusScale: number = 1) {
  const [iA, iB] = DIR_EDGE_CORNERS[dir];
  const a = HEX_CORNERS[iA];
  const b = HEX_CORNERS[iB];
  const mx = ((a.x + b.x) * 0.5) * radiusScale;
  const mz = ((a.z + b.z) * 0.5) * radiusScale;
  const rotY = Math.atan2(-(b.z - a.z), b.x - a.x);
  return { mx, mz, rotY };
}

/**
 * Builds TWO merged BufferGeometries for the entire Wesnoth hex map:
 *   1. `topGeo`: All hex top surfaces with exact Wesnoth 72x72 UVs into the single `WesnothTileAtlas`.
 *   2. `sideGeo`: Low-poly cliff/shoreline faces ONLY where adjacent elevation drops (zero internal seams on coplanar flats).
 */
function buildMergedHexTerrainGeometries(
  map: WesnothMapData,
  atlas: WesnothTileAtlas,
  isDungeon: boolean = false
): { topGeo: THREE.BufferGeometry; sideGeo: THREE.BufferGeometry } {
  const topPos: number[] = [];
  const topNorm: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];

  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const sideCol: number[] = [];
  const sideIdx: number[] = [];

  const halfHexH = (HEX_SQRT3 / 2) * (HEX_RADIUS * 1.004);
  const { atlasW, atlasH } = atlas.layout;
  const tmpColor = new THREE.Color();

  const effectiveElev = (t: WesnothHexTile | null | undefined) => {
    if (!t) return 0;
    // In dungeon mode, wall hexes stay flat in the base terrain mesh and use toggleable 3D wall blocks
    // so unexplored walls never jut out above the pitch-black Shroud.
    if (isDungeon && t.terrain.isWall) return 0.26;
    return t.terrain.elevation;
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile: WesnothHexTile | undefined = map.tiles[y]?.[x];
      if (!tile) continue;

      const { wx, wz } = hexToWorld(x, y);
      const h = effectiveElev(tile);
      const { ox, oy } = atlas.layout.cellOrigin(x, y);

      const toAtlasUv = (cx: number, cz: number) => {
        const localU = 0.5 + 0.5 * (cx / (HEX_RADIUS * 1.004));
        const localVTopDown = 0.5 + 0.5 * (cz / halfHexH);
        const u = (ox + localU * TILE_PX) / atlasW;
        const v = 1 - (oy + localVTopDown * TILE_PX) / atlasH;
        return [u, v];
      };

      // Top hex cap (center + 6 corners)
      const centerIdx = topPos.length / 3;
      const [cu, cv] = toAtlasUv(0, 0);
      topPos.push(wx, h, wz);
      topNorm.push(0, 1, 0);
      topUv.push(cu, cv);

      for (let i = 0; i < 6; i++) {
        const c = HEX_CORNERS[i];
        const [u, v] = toAtlasUv(c.x, c.z);
        topPos.push(wx + c.x, h, wz + c.z);
        topNorm.push(0, 1, 0);
        topUv.push(u, v);
      }

      for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6;
        topIdx.push(centerIdx, centerIdx + 1 + next, centerIdx + 1 + i);
      }

      // Low-poly vertical side cliffs ONLY where neighbor is lower or missing
      const neighbors = getDirectionalNeighbors(map, x, y);
      tmpColor.setHex(tile.terrain.sideColor);

      for (const { dir, tile: nb } of neighbors) {
        const nbH = effectiveElev(nb);
        if (h <= nbH + 0.004) continue;

        const [iA, iB] = DIR_EDGE_CORNERS[dir];
        const cA = HEX_CORNERS[iA];
        const cB = HEX_CORNERS[iB];

        const mx = (cA.x + cB.x) * 0.5;
        const mz = (cA.z + cB.z) * 0.5;
        const len = Math.hypot(mx, mz) || 1;
        const nx = mx / len;
        const nz = mz / len;

        const baseV = sidePos.length / 3;
        sidePos.push(
          wx + cB.x, h, wz + cB.z,
          wx + cA.x, h, wz + cA.z,
          wx + cA.x, nbH, wz + cA.z,
          wx + cB.x, nbH, wz + cB.z
        );
        for (let k = 0; k < 4; k++) {
          sideNorm.push(nx, 0, nz);
          const shade = k >= 2 ? 0.72 : 1.0;
          sideCol.push(tmpColor.r * shade, tmpColor.g * shade, tmpColor.b * shade);
        }
        sideIdx.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
      }
    }
  }

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(topNorm, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);

  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sideNorm, 3));
  sideGeo.setAttribute('color', new THREE.Float32BufferAttribute(sideCol, 3));
  sideGeo.setIndex(sideIdx);

  return { topGeo, sideGeo };
}

function buildDungeonWallBlockMesh(
  tile: WesnothHexTile,
  atlas: WesnothTileAtlas,
  topMat: THREE.Material,
  sideMat: THREE.Material
): { group: THREE.Group; sideMesh: THREE.Mesh } {
  const grp = new THREE.Group();
  const { wx, wz } = hexToWorld(tile.x, tile.y);
  const baseH = 0.255;
  const topH = tile.terrain.elevation;
  const halfHexH = (HEX_SQRT3 / 2) * (HEX_RADIUS * 1.004);
  const { atlasW, atlasH } = atlas.layout;
  const { ox, oy } = atlas.layout.cellOrigin(tile.x, tile.y);

  const toAtlasUv = (cx: number, cz: number) => {
    const localU = 0.5 + 0.5 * (cx / (HEX_RADIUS * 1.004));
    const localVTopDown = 0.5 + 0.5 * (cz / halfHexH);
    const u = (ox + localU * TILE_PX) / atlasW;
    const v = 1 - (oy + localVTopDown * TILE_PX) / atlasH;
    return [u, v];
  };

  // Top cap mapped cleanly to Wesnoth wall sprite inside atlas
  const topPos: number[] = [];
  const topNorm: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const [cu, cv] = toAtlasUv(0, 0);
  topPos.push(0, topH, 0);
  topNorm.push(0, 1, 0);
  topUv.push(cu, cv);
  for (let i = 0; i < 6; i++) {
    const c = HEX_CORNERS[i];
    const [u, v] = toAtlasUv(c.x, c.z);
    topPos.push(c.x, topH, c.z);
    topNorm.push(0, 1, 0);
    topUv.push(u, v);
  }
  for (let i = 0; i < 6; i++) {
    topIdx.push(0, 1 + ((i + 1) % 6), 1 + i);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(topNorm, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.receiveShadow = true;

  // Side masonry faces
  const sPos: number[] = [];
  const sNorm: number[] = [];
  const sCol: number[] = [];
  const sIdx: number[] = [];
  const tmpCol = new THREE.Color(tile.terrain.sideColor);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const cA = HEX_CORNERS[i];
    const cB = HEX_CORNERS[next];
    const mx = (cA.x + cB.x) * 0.5;
    const mz = (cA.z + cB.z) * 0.5;
    const len = Math.hypot(mx, mz) || 1;
    const nx = mx / len;
    const nz = mz / len;
    const bv = sPos.length / 3;
    sPos.push(
      cB.x, topH, cB.z,
      cA.x, topH, cA.z,
      cA.x, baseH, cA.z,
      cB.x, baseH, cB.z
    );
    for (let k = 0; k < 4; k++) {
      sNorm.push(nx, 0, nz);
      const shade = k >= 2 ? 0.65 : 1.0;
      sCol.push(tmpCol.r * shade, tmpCol.g * shade, tmpCol.b * shade);
    }
    sIdx.push(bv, bv + 1, bv + 2, bv, bv + 2, bv + 3);
  }
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sNorm, 3));
  sideGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
  sideGeo.setIndex(sIdx);
  const sideMesh = new THREE.Mesh(sideGeo, sideMat);
  sideMesh.receiveShadow = true;

  grp.position.set(wx, 0, wz);
  grp.add(topMesh, sideMesh);
  return { group: grp, sideMesh };
}

export class OverworldSceneManager {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;

  private texCache: WesnothTextureCache;
  private tileAtlas: WesnothTileAtlas | null = null;
  private worldGroup = new THREE.Group();
  private pickMeshes: THREE.Mesh[] = [];
  private billboards: BillboardSpriteEntry[] = [];
  private patrolVisuals = new Map<string, PatrolVisualEntry>();
  private poiVisuals = new Map<string, PoiVisualEntry>();
  private worldEventVisuals = new Map<string, WorldEventVisualEntry>();
  private ruinVisuals = new Map<string, RuinVisualEntry>();
  private dungeonTreasureVisuals = new Map<string, DungeonMarkerEntry>();
  private dungeonAllyVisuals = new Map<string, DungeonMarkerEntry>();
  private dungeonTrapVisuals = new Map<string, DungeonMarkerEntry>();
  private dungeonWallEntries: DungeonWallEntry[] = [];
  private dungeonRevealableObjects: Array<{ hexKey: string; obj: THREE.Object3D }> = [];
  private wallSideLitMat: THREE.MeshLambertMaterial | null = null;
  private wallSideFogMat: THREE.MeshLambertMaterial | null = null;

  private isDungeonMode = false;
  private latestVisibility?: ShroudVisibilityState;

  private heroGroup: THREE.Group;
  private heroSprite: THREE.Mesh;
  private heroRing: THREE.Mesh;
  private heroTorchLight: THREE.PointLight;
  private heroTargetPos = new THREE.Vector3();
  private heroFacingEast = true;
  private heroWalkPhase = 0;

  private frontierInstanced: THREE.InstancedMesh | null = null;
  private pathInstanced: THREE.InstancedMesh | null = null;
  private hoverHexRing: THREE.Mesh;
  private waterOverlayMesh: THREE.Mesh | null = null;
  private weatherSystem: OverworldWeatherSystem | null = null;

  private cameraTarget = new THREE.Vector3(10, 0.4, 10);
  private desiredTarget = new THREE.Vector3(10, 0.4, 10);
  private cameraYaw = 0.0;
  private desiredYaw = 0.0;
  private cameraDist = 13.5;
  private desiredDist = 13.5;
  private cameraPitch = 0.82;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private lastHoverTime = 0;

  public onHexClick: ((x: number, y: number) => void) | null = null;
  public onHexHover: ((x: number, y: number) => void) | null = null;

  private frameId = 0;
  private disposed = false;
  private startTimeMs = performance.now();
  private lastFrameMs = performance.now();
  private boundListeners: Array<{ target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }> = [];
  private mapBounds = { maxX: 30, maxZ: 25 };
  private hemiLight: THREE.HemisphereLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private qualityPreset: QualityPreset;
  private detachContextGuards: (() => void) | null = null;

  constructor(container: HTMLElement, initialPreset?: QualityPreset) {
    this.container = container;
    this.isSoftwareGl = this.detectSoftwareGl();
    this.qualityPreset = initialPreset ?? QUALITY_PRESETS[probeClientDeviceTier(this.isSoftwareGl)];
    this.texCache = new WesnothTextureCache(() => {
      if (!this.disposed) {
        this.renderer.render(this.scene, this.camera);
      }
    });

    const pal = BRAWL_PALETTE.overworld;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(pal.backgroundHex);
    this.scene.fog = new THREE.FogExp2(pal.backgroundHex, pal.fogDensity);

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 140);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.qualityPreset.antialias && !this.isSoftwareGl,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, this.qualityPreset.maxPixelRatio)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = pal.toneMappingExposure;
    this.renderer.shadowMap.enabled = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.detachContextGuards = attachWebGLContextGuards(this.renderer.domElement);

    // Intentionally omit RoomEnvironment IBL on the Overworld so pre-lit Wesnoth terrain
    // and world sprites retain rich, saturated colors instead of washing out to white.
    this.setupLighting();
    this.scene.add(this.worldGroup);

    // Crisp gold cursor hex ring
    const hoverGeo = new THREE.RingGeometry(HEX_RADIUS * 0.85, HEX_RADIUS * 0.93, 6);
    hoverGeo.rotateX(-Math.PI / 2);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.hoverHexRing = new THREE.Mesh(hoverGeo, hoverMat);
    this.hoverHexRing.position.y = -20;
    this.scene.add(this.hoverHexRing);

    // Hero Group
    this.heroGroup = new THREE.Group();
    const shadowGeo = new THREE.CircleGeometry(0.36, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    const heroShadow = new THREE.Mesh(shadowGeo, shadowMat);
    heroShadow.position.y = 0.02;

    const ringGeo = new THREE.RingGeometry(0.33, 0.41, 6);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.heroRing = new THREE.Mesh(ringGeo, ringMat);
    this.heroRing.position.y = 0.03;

    const heroTex = this.texCache.getTexture('hero_marshal');
    const heroPlaneGeo = new THREE.PlaneGeometry(1.18, 1.18);
    heroPlaneGeo.translate(0, 0.56, 0);
    const heroMat = new THREE.MeshLambertMaterial({
      map: heroTex,
      color: BRAWL_PALETTE.overworld.unitSpriteTintHex,
      emissive: 0x1e293b,
      emissiveIntensity: 0.18,
      alphaTest: 0.4,
      side: THREE.DoubleSide
    });
    this.heroSprite = new THREE.Mesh(heroPlaneGeo, heroMat);
    this.heroSprite.castShadow = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;

    // Warm hero torchlight active inside Dungeons
    this.heroTorchLight = new THREE.PointLight(0xffb45c, 0, 14.5, 1.35);
    this.heroTorchLight.position.set(0, 1.55, 0);

    this.heroGroup.add(heroShadow, this.heroRing, this.heroSprite, this.heroTorchLight);
    this.scene.add(this.heroGroup);

    this.initListeners();
    this.startLoop();
  }

  private detectSoftwareGl(): boolean {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private setupLighting() {
    const pal = BRAWL_PALETTE.overworld;
    const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiIntensity);
    this.hemiLight = hemi;
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(pal.sunColor, pal.sunIntensity);
    sun.position.set(22, 24, 18);
    sun.castShadow = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 85;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.bias = -0.0005;
    this.sunLight = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const rim = new THREE.DirectionalLight(pal.rimColor, pal.rimIntensity);
    rim.position.set(-14, 10, -16);
    this.rimLight = rim;
    this.scene.add(rim);
  }

  public applyQualityPreset(preset: QualityPreset) {
    this.qualityPreset = preset;
    if (this.disposed) return;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio)
    );
    const shadowsOn = preset.shadowsEnabled && !this.isSoftwareGl;
    this.renderer.shadowMap.enabled = shadowsOn;
    if (this.sunLight) {
      this.sunLight.castShadow = shadowsOn;
    }
    if (this.tileAtlas) {
      this.tileAtlas.texture.anisotropy = this.isSoftwareGl
        ? 1
        : Math.min(preset.anisotropyCap, this.renderer.capabilities.getMaxAnisotropy());
    }
    this.weatherSystem?.setQualityScale(preset.particleScale);
  }

  public buildOverworldScene(map: WesnothMapData, options?: OverworldSceneBuildOptions) {
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.tileAtlas?.dispose();
    if (this.weatherSystem) {
      this.scene.remove(this.weatherSystem.group);
      this.weatherSystem.dispose();
      this.weatherSystem = null;
    }
    for (const vis of this.patrolVisuals.values()) this.scene.remove(vis.group);
    this.patrolVisuals.clear();
    for (const vis of this.poiVisuals.values()) this.scene.remove(vis.group);
    this.poiVisuals.clear();
    for (const vis of this.worldEventVisuals.values()) this.scene.remove(vis.group);
    this.worldEventVisuals.clear();
    for (const vis of this.ruinVisuals.values()) this.scene.remove(vis.group);
    this.ruinVisuals.clear();
    for (const vis of this.dungeonTreasureVisuals.values()) this.scene.remove(vis.group);
    this.dungeonTreasureVisuals.clear();
    for (const vis of this.dungeonAllyVisuals.values()) this.scene.remove(vis.group);
    this.dungeonAllyVisuals.clear();
    for (const vis of this.dungeonTrapVisuals.values()) this.scene.remove(vis.group);
    this.dungeonTrapVisuals.clear();

    this.pickMeshes = [];
    this.billboards = [];
    this.dungeonWallEntries = [];
    this.dungeonRevealableObjects = [];
    this.isDungeonMode = Boolean(options?.isDungeon);
    this.latestVisibility = options?.visibility;

    const pal = BRAWL_PALETTE.overworld;
    const maxWorld = hexToWorld(map.width - 1, map.height - 1);
    this.mapBounds = { maxX: maxWorld.wx, maxZ: maxWorld.wz };

    // Configure lighting & atmosphere for Dungeon (pitch-black shroud + hero torch) vs Overworld
    const heroMat = this.heroSprite.material as THREE.MeshLambertMaterial;
    if (this.isDungeonMode) {
      this.scene.background = new THREE.Color(0x000000);
      this.scene.fog = new THREE.FogExp2(0x000000, 0.015);
      this.renderer.toneMappingExposure = 1.12;
      if (this.hemiLight) {
        this.hemiLight.color.setHex(0x94a3b8);
        this.hemiLight.groundColor.setHex(0x0f172a);
        this.hemiLight.intensity = 0.72;
      }
      if (this.sunLight) {
        this.sunLight.color.setHex(0xe2e8f0);
        this.sunLight.intensity = 0.68;
      }
      if (this.rimLight) {
        this.rimLight.intensity = 0.42;
      }
      heroMat.emissive.setHex(0x3b2f22);
      heroMat.emissiveIntensity = 0.34;
      this.heroTorchLight.intensity = 4.2;
    } else {
      this.scene.background = new THREE.Color(pal.backgroundHex);
      this.scene.fog = new THREE.FogExp2(pal.backgroundHex, pal.fogDensity);
      this.renderer.toneMappingExposure = pal.toneMappingExposure;
      if (this.hemiLight) {
        this.hemiLight.color.setHex(pal.hemiSky);
        this.hemiLight.groundColor.setHex(pal.hemiGround);
        this.hemiLight.intensity = pal.hemiIntensity;
      }
      if (this.sunLight) {
        this.sunLight.color.setHex(pal.sunColor);
        this.sunLight.intensity = pal.sunIntensity;
      }
      if (this.rimLight) {
        this.rimLight.intensity = pal.rimIntensity;
      }
      heroMat.emissive.setHex(0x1e293b);
      heroMat.emissiveIntensity = 0.18;
      this.heroTorchLight.intensity = 0;
    }

    if (this.sunLight) {
      const cx = maxWorld.wx * 0.5;
      const cz = maxWorld.wz * 0.5;
      this.sunLight.position.set(cx + 12, 24, cz + 10);
      this.sunLight.target.position.set(cx, 0, cz);
      this.sunLight.target.updateMatrixWorld();
    }

    // 1. Auto-tiled Wesnoth Atlas (all transitions & Shroud/Fog composited into 1 crisp pixel-art atlas)
    this.tileAtlas = new WesnothTileAtlas(
      map,
      () => {
        if (!this.disposed) {
          this.renderer.render(this.scene, this.camera);
        }
      },
      options?.visibility
    );
    if (!this.isSoftwareGl) {
      this.tileAtlas.texture.anisotropy = Math.min(
        this.qualityPreset.anisotropyCap,
        this.renderer.capabilities.getMaxAnisotropy()
      );
    }

    const { topGeo, sideGeo } = buildMergedHexTerrainGeometries(map, this.tileAtlas, this.isDungeonMode);

    // Calibrated MeshLambertMaterial keeps hex tiles crisp, richly saturated, and fast on low-end GPUs
    const terrainTopMat = new THREE.MeshLambertMaterial({
      map: this.tileAtlas.texture,
      color: this.isDungeonMode ? 0xffffff : pal.terrainTintHex
    });
    const terrainTopMesh = new THREE.Mesh(topGeo, terrainTopMat);
    terrainTopMesh.receiveShadow = true;
    this.worldGroup.add(terrainTopMesh);

    const terrainSideMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true
    });
    const terrainSideMesh = new THREE.Mesh(sideGeo, terrainSideMat);
    terrainSideMesh.receiveShadow = true;
    terrainSideMesh.castShadow = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;
    this.worldGroup.add(terrainSideMesh);

    this.wallSideLitMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true
    });
    this.wallSideFogMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      color: 0x4b5563
    });

    // 2. Continuous Deep Ocean base (Overworld) OR pitch-black abyss backdrop (Dungeon)
    const seaGeo = new THREE.PlaneGeometry(130, 130);
    seaGeo.rotateX(-Math.PI / 2);
    if (this.isDungeonMode) {
      const abyssMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const abyssMesh = new THREE.Mesh(seaGeo, abyssMat);
      abyssMesh.position.set(maxWorld.wx / 2, -0.02, maxWorld.wz / 2);
      this.worldGroup.add(abyssMesh);
      this.waterOverlayMesh = null;
    } else {
      const seaMat = new THREE.MeshLambertMaterial({
        color: pal.seaHex
      });
      const seaMesh = new THREE.Mesh(seaGeo, seaMat);
      seaMesh.position.set(maxWorld.wx / 2, 0.01, maxWorld.wz / 2);
      seaMesh.receiveShadow = true;
      this.worldGroup.add(seaMesh);
      this.waterOverlayMesh = seaMesh;
    }

    // Subtle atmospheric fog wisps & biome dust motes
    this.weatherSystem = new OverworldWeatherSystem(map, this.qualityPreset.particleScale);
    this.scene.add(this.weatherSystem.group);

    // Low coastal reefs far around perimeter (Overworld only)
    if (!this.isDungeonMode) {
      const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
      const rockMat = new THREE.MeshLambertMaterial({ color: pal.reefHex, flatShading: true });
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, 14);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const rx = maxWorld.wx * 0.82 + (i % 3) * 2.4;
        const rz = maxWorld.wz * 0.88 + ((i + 1) % 3) * 2.4;
        _mat4.makeTranslation(maxWorld.wx / 2 + Math.cos(ang) * rx, -0.02, maxWorld.wz / 2 + Math.sin(ang) * rz);
        _mat4.scale(_vec3A.set(1.0 + (i % 2) * 0.35, 0.4 + (i % 3) * 0.14, 1.0 + (i % 2) * 0.3));
        rockInst.setMatrixAt(i, _mat4);
      }
      rockInst.computeBoundingSphere();
      this.worldGroup.add(rockInst);
    }

    // Shared geometries/materials for props, connected castle walls, and raycast proxies
    const pickGeo = new THREE.CircleGeometry(HEX_RADIUS * 0.9, 6);
    pickGeo.rotateX(-Math.PI / 2);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });

    const overlayMatCache = new Map<string, THREE.MeshLambertMaterial>();
    const getOverlayMat = (assetKey: string) => {
      const existing = overlayMatCache.get(assetKey);
      if (existing) return existing;
      const mat = new THREE.MeshLambertMaterial({
        map: this.texCache.getTexture(assetKey),
        color: pal.propSpriteTintHex,
        alphaTest: 0.42,
        side: THREE.DoubleSide
      });
      overlayMatCache.set(assetKey, mat);
      return mat;
    };

    const propShadowGeo = new THREE.CircleGeometry(0.36, 10);
    propShadowGeo.rotateX(-Math.PI / 2);
    const propShadowMat = new THREE.MeshBasicMaterial({
      color: 0x050814,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });

    const castleWallSegGeo = new THREE.BoxGeometry(HEX_RADIUS * 0.98, 0.2, 0.15);
    const castleCrestGeo = new THREE.BoxGeometry(0.22, 0.09, 0.17);
    const castleCornerGeo = new THREE.CylinderGeometry(0.12, 0.135, 0.28, 6);
    const castleWallMat = new THREE.MeshLambertMaterial({ color: pal.castleWallHex, flatShading: true });
    const castleTrimMat = new THREE.MeshLambertMaterial({ color: pal.castleTrimHex, flatShading: true });

    const poleGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.84, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    const pennantGeo = new THREE.BoxGeometry(0.34, 0.16, 0.03);

    const bridgeDeckGeo = new THREE.BoxGeometry(HEX_RADIUS * 1.4, 0.14, HEX_RADIUS * 0.72);
    const bridgeRailGeo = new THREE.BoxGeometry(HEX_RADIUS * 1.42, 0.08, 0.09);
    const bridgeDeckMat = new THREE.MeshLambertMaterial({
      color: 0x948c7e,
      flatShading: true
    });

    const spriteGeo = new THREE.PlaneGeometry(1.25, 1.25);
    spriteGeo.translate(0, 0.56, 0);
    const villageGeo = new THREE.PlaneGeometry(1.18, 1.18);
    villageGeo.translate(0, 0.36, 0);
    const bigMountainGeo = new THREE.PlaneGeometry(1.78, 1.62);
    bigMountainGeo.translate(0, 0.72, 0);

    const registerRevealable = (hexKey: string, obj: THREE.Object3D) => {
      if (this.isDungeonMode) {
        obj.visible = options?.visibility?.explored.has(hexKey) ?? false;
        this.dungeonRevealableObjects.push({ hexKey, obj });
      }
    };

    const flatDecalGeo = new THREE.PlaneGeometry(HEX_RADIUS * 1.66, HEX_RADIUS * 1.46);
    flatDecalGeo.rotateX(-Math.PI / 2);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile: WesnothHexTile | undefined = map.tiles[y]?.[x];
        if (!tile) continue;

        const { wx, wz } = hexToWorld(x, y);
        const h = tile.terrain.elevation;
        const hexKey = `${x},${y}`;

        // Raycast proxy disc (unexplored walls stay at floor height so pick never leaks hidden walls)
        const pickH = this.isDungeonMode && tile.terrain.isWall ? 0.26 : h;
        const pick = new THREE.Mesh(pickGeo, pickMat);
        pick.position.set(wx, pickH + 0.01, wz);
        pick.userData = { hexX: x, hexY: y };
        this.worldGroup.add(pick);
        this.pickMeshes.push(pick);

        // Toggleable 3D Dungeon Wall blocks (hidden until explored so Shroud remains pitch-black)
        if (this.isDungeonMode && tile.terrain.isWall && this.wallSideLitMat && this.wallSideFogMat) {
          const isExplored = options?.visibility?.explored.has(hexKey) ?? false;
          const isVis = options?.visibility?.visible.has(hexKey) ?? false;
          const wallBlock = buildDungeonWallBlockMesh(
            tile,
            this.tileAtlas,
            terrainTopMat,
            isVis ? this.wallSideLitMat : this.wallSideFogMat
          );
          if (tile.terrain.emitsLight) {
            const torchSprite = new THREE.Mesh(
              new THREE.PlaneGeometry(0.64, 0.64).translate(0, 0.3, 0),
              getOverlayMat('item_torch')
            );
            torchSprite.position.set(0, h * 0.62, 0.48);
            wallBlock.group.add(torchSprite);
            this.billboards.push({
              mesh: torchSprite,
              baseX: wx,
              baseY: h * 0.62,
              baseZ: wz + 0.48,
              bobPhase: x * 0.5 + y * 0.3
            });
          }
          wallBlock.group.visible = isExplored;
          this.worldGroup.add(wallBlock.group);
          this.dungeonWallEntries.push({ hexKey, ...wallBlock });
          continue;
        }

        // Connected 3D Castle Walls ONLY on exterior edges bordering non-castle terrain
        if (tile.terrain.baseCategory === 'castle') {
          const castleGroup = new THREE.Group();
          const plan = computeHexAutoTilePlan(map, x, y);
          const placedCorners = new Set<number>();
          for (const dir of plan.castleOuterDirs) {
            const { mx, mz, rotY } = getHexEdgeTransform(dir, 0.92);
            const wall = new THREE.Mesh(castleWallSegGeo, castleWallMat);
            wall.position.set(wx + mx, h + 0.09, wz + mz);
            wall.rotation.y = rotY;
            wall.castShadow = !this.isSoftwareGl;
            castleGroup.add(wall);

            for (const offset of [-0.26, 0.26]) {
              const merlon = new THREE.Mesh(castleCrestGeo, castleTrimMat);
              merlon.position.set(
                wx + mx + Math.cos(rotY) * offset,
                h + 0.22,
                wz + mz - Math.sin(rotY) * offset
              );
              merlon.rotation.y = rotY;
              castleGroup.add(merlon);
            }

            const [cA, cB] = DIR_EDGE_CORNERS[dir];
            for (const cornerIdx of [cA, cB]) {
              if (placedCorners.has(cornerIdx)) continue;
              placedCorners.add(cornerIdx);
              const corner = HEX_CORNERS[cornerIdx];
              const turret = new THREE.Mesh(castleCornerGeo, castleTrimMat);
              turret.position.set(wx + corner.x * 0.92, h + 0.135, wz + corner.z * 0.92);
              castleGroup.add(turret);
            }
          }

          if (tile.terrain.isKeep) {
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(wx - 0.54, h + 0.42, wz - 0.42);
            castleGroup.add(pole);

            const bannerColor =
              tile.startingPosition === 1
                ? 0x2563eb
                : tile.startingPosition === 4
                  ? 0x38bdf8
                  : tile.startingPosition === 5
                    ? 0xf59e0b
                    : 0xdc2626;
            const pennant = new THREE.Mesh(
              pennantGeo,
              new THREE.MeshLambertMaterial({ color: bannerColor, flatShading: true })
            );
            pennant.position.set(wx - 0.37, h + 0.74, wz - 0.42);
            castleGroup.add(pennant);

            const brazierSprite = new THREE.Mesh(
              new THREE.PlaneGeometry(0.68, 0.68).translate(0, 0.32, 0),
              getOverlayMat('item_brazier_lit')
            );
            brazierSprite.position.set(wx + 0.46, h + 0.02, wz + 0.34);
            castleGroup.add(brazierSprite);
            this.billboards.push({
              mesh: brazierSprite,
              baseX: wx + 0.46,
              baseY: h + 0.02,
              baseZ: wz + 0.34,
              bobPhase: x * 0.4 + y * 0.3
            });
          }

          this.worldGroup.add(castleGroup);
          registerRevealable(hexKey, castleGroup);
        }

        // Major City & Harbor Town 3D Landmarks (Surface Overworld only)
        if (!this.isDungeonMode) {
          const citySpec = OVERWORLD_VILLAGES.find(v => v.x === x && v.y === y);
          if (citySpec && (citySpec.cityTier === 'city' || citySpec.cityTier === 'port')) {
            const cityPole = new THREE.Mesh(poleGeo, poleMat);
            cityPole.position.set(wx + 0.44, h + 0.36, wz - 0.34);
            cityPole.scale.set(0.85, 0.85, 0.85);
            this.worldGroup.add(cityPole);

            const cityPennant = new THREE.Mesh(
              pennantGeo,
              new THREE.MeshLambertMaterial({
                color: citySpec.cityTier === 'port' ? 0x0ea5e9 : 0xf59e0b,
                flatShading: true
              })
            );
            cityPennant.position.set(wx + 0.57, h + 0.64, wz - 0.34);
            cityPennant.scale.set(0.82, 0.82, 0.82);
            this.worldGroup.add(cityPennant);
          }
        }

        // Bridges & Dwarven Minecart Rails
        if (tile.terrain.overlayCategory === 'bridge' || tile.terrain.overlayCategory === 'rails') {
          const isTexSpan =
            tile.terrain.overlayCategory === 'rails' ||
            (tile.terrain.overlayAsset &&
              (tile.terrain.overlayAsset.startsWith('dun_bridge_') ||
                tile.terrain.overlayAsset.startsWith('dun_rails_')));
          if (isTexSpan && tile.terrain.overlayAsset) {
            const spanMesh = new THREE.Mesh(flatDecalGeo, getOverlayMat(tile.terrain.overlayAsset));
            spanMesh.position.set(wx, h + 0.024, wz);
            this.worldGroup.add(spanMesh);
            registerRevealable(hexKey, spanMesh);
          } else {
            const bridgeGrp = new THREE.Group();
            const deck = new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat);
            deck.position.set(wx, h + 0.04, wz);
            bridgeGrp.add(deck);
            const northRail = new THREE.Mesh(bridgeRailGeo, castleWallMat);
            northRail.position.set(wx, h + 0.12, wz - HEX_RADIUS * 0.31);
            bridgeGrp.add(northRail);
            const southRail = new THREE.Mesh(bridgeRailGeo, castleWallMat);
            southRail.position.set(wx, h + 0.12, wz + HEX_RADIUS * 0.31);
            bridgeGrp.add(southRail);
            this.worldGroup.add(bridgeGrp);
            registerRevealable(hexKey, bridgeGrp);
          }
        }

        // Upright Wesnoth Pixel-Art Overlays (Forests, Villages, Mountains, Mushrooms, Sanctuaries)
        if (
          tile.terrain.overlayAsset &&
          tile.terrain.overlayCategory !== 'bridge' &&
          tile.terrain.overlayCategory !== 'rails'
        ) {
          if (tile.terrain.overlayCategory === 'forest') {
            const offsets = [
              { ox: -0.26, oz: -0.18, s: 0.86 },
              { ox: 0.26, oz: 0.08, s: 0.94 },
              { ox: -0.04, oz: 0.26, s: 0.8 },
              { ox: 0.14, oz: -0.26, s: 0.74 }
            ];
            offsets.forEach((o, idx) => {
              const tree = new THREE.Mesh(spriteGeo, getOverlayMat(tile.terrain.overlayAsset!));
              tree.position.set(wx + o.ox, h + 0.01, wz + o.oz);
              tree.scale.setScalar(o.s);
              tree.castShadow = !this.isSoftwareGl;
              this.worldGroup.add(tree);
              registerRevealable(hexKey, tree);
              this.billboards.push({
                mesh: tree,
                baseX: wx + o.ox,
                baseY: h + 0.01,
                baseZ: wz + o.oz,
                bobPhase: x + y + idx
              });
            });
          } else if (tile.terrain.baseCode === 'Mm' || tile.terrain.baseCode === 'Ms') {
            const peaks = [
              { ox: -0.24, oz: -0.16, s: 0.72 },
              { ox: 0.24, oz: -0.1, s: 0.68 },
              { ox: 0, oz: 0.06, s: 1.0 }
            ];
            peaks.forEach((p, idx) => {
              const peak = new THREE.Mesh(bigMountainGeo, getOverlayMat(tile.terrain.overlayAsset!));
              peak.position.set(wx + p.ox, h - 0.04, wz + p.oz);
              peak.scale.setScalar(p.s);
              peak.castShadow = !this.isSoftwareGl;
              this.worldGroup.add(peak);
              registerRevealable(hexKey, peak);
              this.billboards.push({
                mesh: peak,
                baseX: wx + p.ox,
                baseY: h - 0.04,
                baseZ: wz + p.oz,
                bobPhase: (x + idx) * 0.5
              });
            });
          } else {
            const sh = new THREE.Mesh(propShadowGeo, propShadowMat);
            sh.position.set(wx, h + 0.015, wz);
            this.worldGroup.add(sh);
            registerRevealable(hexKey, sh);

            const useVillageGeo = tile.terrain.overlayCategory === 'village';
            const sprite = new THREE.Mesh(
              useVillageGeo ? villageGeo : spriteGeo,
              getOverlayMat(tile.terrain.overlayAsset)
            );
            sprite.position.set(wx, h + 0.01, wz);
            sprite.castShadow = !this.isSoftwareGl;
            this.worldGroup.add(sprite);
            registerRevealable(hexKey, sprite);
            this.billboards.push({
              mesh: sprite,
              baseX: wx,
              baseY: h + 0.01,
              baseZ: wz,
              bobPhase: x * 0.5
            });
          }
        }

        // Surface Overworld Scenic Landmarks & Props
        if (!this.isDungeonMode) {
          const landmarkSpec = OVERWORLD_LANDMARKS.find(l => l.x === x && l.y === y);
          if (landmarkSpec) {
            const isFlatDecal = landmarkSpec.assetKey === 'scenery_summoning';
            if (isFlatDecal) {
              const decalGeo = new THREE.PlaneGeometry(1.18, 1.18);
              decalGeo.rotateX(-Math.PI / 2);
              const decal = new THREE.Mesh(decalGeo, getOverlayMat(landmarkSpec.assetKey));
              decal.position.set(wx, h + 0.025, wz);
              this.worldGroup.add(decal);
            } else {
              const sh = new THREE.Mesh(propShadowGeo, propShadowMat);
              sh.position.set(wx, h + 0.016, wz);
              sh.scale.setScalar(Math.min(1.25, landmarkSpec.scale * 0.85));
              this.worldGroup.add(sh);

              const lmPlaneGeo = new THREE.PlaneGeometry(landmarkSpec.scale, landmarkSpec.scale);
              lmPlaneGeo.translate(0, landmarkSpec.scale * 0.46 + (landmarkSpec.yOffset ?? 0), 0);
              const lmSprite = new THREE.Mesh(lmPlaneGeo, getOverlayMat(landmarkSpec.assetKey));
              lmSprite.position.set(wx, h + 0.015, wz);
              lmSprite.castShadow = !this.isSoftwareGl;
              this.worldGroup.add(lmSprite);
              this.billboards.push({
                mesh: lmSprite,
                baseX: wx,
                baseY: h + 0.015,
                baseZ: wz,
                bobPhase: (x + y) * 0.45
              });
            }
          }
        }
      }
    }

    // 2b. Dungeon Props, Stairwells & Sanctuaries (revealed progressively as Shroud clears)
    if (this.isDungeonMode && options?.floorSpec) {
      const floorSpec = options.floorSpec;
      for (const prop of floorSpec.props) {
        const tile = map.tiles[prop.y]?.[prop.x];
        if (!tile) continue;
        const { wx, wz } = hexToWorld(prop.x, prop.y);
        const h = tile.terrain.elevation;
        const hexKey = `${prop.x},${prop.y}`;
        const sc = prop.scale ?? 0.92;

        if (prop.flatDecal) {
          const decalGeo = new THREE.PlaneGeometry(sc, sc);
          decalGeo.rotateX(-Math.PI / 2);
          const decal = new THREE.Mesh(decalGeo, getOverlayMat(prop.assetKey));
          decal.position.set(wx, h + 0.025, wz);
          this.worldGroup.add(decal);
          registerRevealable(hexKey, decal);
        } else {
          const sh = new THREE.Mesh(propShadowGeo, propShadowMat);
          sh.position.set(wx, h + 0.016, wz);
          sh.scale.setScalar(Math.min(1.2, sc * 0.85));
          this.worldGroup.add(sh);
          registerRevealable(hexKey, sh);

          const pGeo = new THREE.PlaneGeometry(sc, sc);
          pGeo.translate(0, sc * 0.46, 0);
          const pMesh = new THREE.Mesh(pGeo, getOverlayMat(prop.assetKey));
          pMesh.position.set(wx, h + 0.015, wz);
          this.worldGroup.add(pMesh);
          registerRevealable(hexKey, pMesh);
          this.billboards.push({
            mesh: pMesh,
            baseX: wx,
            baseY: h + 0.015,
            baseZ: wz,
            bobPhase: (prop.x + prop.y) * 0.45
          });
        }
      }

      const addStairMarker = (coord: HexCoord, assetKey: string, ringHex: number) => {
        const tile = map.tiles[coord.y]?.[coord.x];
        if (!tile) return;
        const { wx, wz } = hexToWorld(coord.x, coord.y);
        const h = tile.terrain.elevation;
        const grp = new THREE.Group();

        const decalGeo = new THREE.PlaneGeometry(1.12, 1.12);
        decalGeo.rotateX(-Math.PI / 2);
        const decal = new THREE.Mesh(decalGeo, getOverlayMat(assetKey));
        decal.position.y = 0.028;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.48, 0.58, 6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: ringHex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.position.y = 0.036;

        grp.add(decal, ring);
        grp.position.set(wx, h, wz);
        this.worldGroup.add(grp);
        registerRevealable(`${coord.x},${coord.y}`, grp);
      };

      addStairMarker(floorSpec.stairsUp, 'scenery_trapdoor_closed', 0x38bdf8);
      if (floorSpec.stairsDown) {
        addStairMarker(floorSpec.stairsDown, 'scenery_trapdoor_open', 0xfacc15);
      }

      for (const sanc of floorSpec.sanctuaries) {
        const tile = map.tiles[sanc.y]?.[sanc.x];
        if (!tile) continue;
        const { wx, wz } = hexToWorld(sanc.x, sanc.y);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.46, 0.56, 6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: 0x34d399,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.position.set(wx, tile.terrain.elevation + 0.036, wz);
        this.worldGroup.add(ring);
        registerRevealable(`${sanc.x},${sanc.y}`, ring);
      }
    }

    // 3. Clean Outer Frontier Boundary for Reachable Range (zero noisy interior rings!)
    const edgeGeo = new THREE.BoxGeometry(HEX_RADIUS * 0.96, 0.035, 0.085);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this.frontierInstanced = new THREE.InstancedMesh(edgeGeo, edgeMat, 600);
    this.frontierInstanced.count = 0;
    this.frontierInstanced.frustumCulled = false;
    this.worldGroup.add(this.frontierInstanced);

    // Path Preview Breadcrumbs
    const dotGeo = new THREE.CircleGeometry(0.15, 8);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.pathInstanced = new THREE.InstancedMesh(dotGeo, dotMat, 48);
    this.pathInstanced.count = 0;
    this.pathInstanced.frustumCulled = false;
    this.worldGroup.add(this.pathInstanced);

    if (!this.isDungeonMode && options?.ruins) {
      this.syncRuins(options.ruins, map);
    }
    if (this.isDungeonMode && options?.visibility) {
      this.syncDungeonVisuals(
        map,
        options.visibility,
        options.detectedTraps ?? [],
        options.treasures ?? [],
        options.allies ?? []
      );
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public syncHeroAndPatrols(
    heroX: number,
    heroY: number,
    facingEast: boolean,
    movetype: WesnothMovetypeId,
    map: WesnothMapData,
    patrols: ActivePatrolState[]
  ) {
    const heroTile = map.tiles[heroY]?.[heroX];
    const heroElev = heroTile ? heroTile.terrain.elevation : 0.26;
    const { wx, wz } = hexToWorld(heroX, heroY);

    this.heroTargetPos.set(wx, heroElev + 0.02, wz);
    this.heroFacingEast = facingEast;
    this.desiredTarget.set(wx, heroElev + 0.4, wz);

    const heroAsset = movetype === 'woodland' ? 'hero_lieutenant' : 'hero_marshal';
    const mat = this.heroSprite.material as THREE.MeshLambertMaterial;
    const targetTex = this.texCache.getTexture(heroAsset);
    if (mat.map !== targetTex) {
      mat.map = targetTex;
      mat.needsUpdate = true;
    }

    const seen = new Set<string>();
    for (const p of patrols) {
      seen.add(p.id);
      const pTile = map.tiles[p.y]?.[p.x];
      const pElev = pTile ? pTile.terrain.elevation : 0.26;
      const pw = hexToWorld(p.x, p.y);
      const existing = this.patrolVisuals.get(p.id);

      if (!existing) {
        const grp = new THREE.Group();
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(0.4, 14).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.44, depthWrite: false })
        );
        sh.position.y = 0.02;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.46, 0.56, 6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: p.isBoss ? 0xf59e0b : 0xef4444,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.position.y = 0.03;

        const spGeo = new THREE.PlaneGeometry(p.isBoss ? 1.38 : 1.16, p.isBoss ? 1.38 : 1.16);
        spGeo.translate(0, p.isBoss ? 0.66 : 0.56, 0);
        const spMat = new THREE.MeshLambertMaterial({
          map: this.texCache.getTexture(p.spriteAsset),
          color: BRAWL_PALETTE.overworld.unitSpriteTintHex,
          emissive: 0x1e293b,
          emissiveIntensity: 0.18,
          alphaTest: 0.4,
          side: THREE.DoubleSide
        });
        const sprite = new THREE.Mesh(spGeo, spMat);
        sprite.castShadow = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;

        grp.add(sh, ring, sprite);
        grp.position.set(pw.wx, pElev + 0.02, pw.wz);
        grp.visible =
          !this.isDungeonMode || !this.latestVisibility || this.latestVisibility.visible.has(`${p.x},${p.y}`);
        this.scene.add(grp);

        this.patrolVisuals.set(p.id, {
          group: grp,
          sprite,
          ring,
          targetPos: new THREE.Vector3(pw.wx, pElev + 0.02, pw.wz),
          phase: p.x * 0.7 + p.y,
          hexX: p.x,
          hexY: p.y
        });
      } else {
        existing.targetPos.set(pw.wx, pElev + 0.02, pw.wz);
        existing.hexX = p.x;
        existing.hexY = p.y;
        existing.group.visible =
          !this.isDungeonMode || !this.latestVisibility || this.latestVisibility.visible.has(`${p.x},${p.y}`);
      }
    }

    for (const [id, vis] of this.patrolVisuals.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group);
        this.patrolVisuals.delete(id);
      }
    }
  }

  public syncRuins(ruins: OverworldRuinSpec[], map: WesnothMapData) {
    const seen = new Set<string>();
    for (const ruin of ruins) {
      seen.add(ruin.id);
      if (this.ruinVisuals.has(ruin.id)) continue;

      const tile = map.tiles[ruin.y]?.[ruin.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(ruin.x, ruin.y);

      const grp = new THREE.Group();
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.44, 14).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.45, depthWrite: false })
      );
      shadow.position.y = 0.022;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.48, 0.58, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.032;

      const spGeo = new THREE.PlaneGeometry(ruin.scale, ruin.scale);
      spGeo.translate(0, ruin.scale * 0.46, 0);
      const spMat = new THREE.MeshLambertMaterial({
        map: this.texCache.getTexture(ruin.assetKey),
        color: BRAWL_PALETTE.overworld.unitSpriteTintHex,
        emissive: 0x3b0764,
        emissiveIntensity: 0.25,
        alphaTest: 0.4,
        side: THREE.DoubleSide
      });
      const sprite = new THREE.Mesh(spGeo, spMat);
      sprite.position.y = 0.02;
      sprite.castShadow = !this.isSoftwareGl;

      grp.add(shadow, ring, sprite);
      grp.position.set(wx, h + 0.015, wz);
      this.scene.add(grp);

      this.ruinVisuals.set(ruin.id, {
        group: grp,
        sprite,
        ring,
        baseY: 0.02,
        phase: ruin.x * 0.5 + ruin.y * 0.7
      });
    }

    for (const [id, vis] of this.ruinVisuals.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group);
        this.ruinVisuals.delete(id);
      }
    }
  }

  public syncDungeonVisuals(
    map: WesnothMapData,
    visibility: ShroudVisibilityState,
    detectedTraps: DungeonTrapSpec[],
    treasures: DungeonTreasureSpec[],
    allies: DungeonAllySpec[]
  ) {
    this.latestVisibility = visibility;
    this.tileAtlas?.updateDungeonVisibility(map, visibility);

    for (const entry of this.dungeonWallEntries) {
      const explored = visibility.explored.has(entry.hexKey);
      const visible = visibility.visible.has(entry.hexKey);
      entry.group.visible = explored;
      if (this.wallSideLitMat && this.wallSideFogMat) {
        entry.sideMesh.material = visible ? this.wallSideLitMat : this.wallSideFogMat;
      }
    }

    for (const item of this.dungeonRevealableObjects) {
      item.obj.visible = visibility.explored.has(item.hexKey);
    }

    for (const vis of this.patrolVisuals.values()) {
      vis.group.visible = visibility.visible.has(`${vis.hexX},${vis.hexY}`);
    }

    // Treasures (gold ring + chest/relic sprite, visible once explored)
    const seenTreasures = new Set<string>();
    for (const t of treasures) {
      seenTreasures.add(t.id);
      const hexKey = `${t.x},${t.y}`;
      const existing = this.dungeonTreasureVisuals.get(t.id);
      if (existing) {
        existing.group.visible = visibility.explored.has(hexKey);
        continue;
      }
      const tile = map.tiles[t.y]?.[t.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(t.x, t.y);
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.48, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.032;
      const spGeo = new THREE.PlaneGeometry(0.92, 0.92);
      spGeo.translate(0, 0.4, 0);
      const sprite = new THREE.Mesh(
        spGeo,
        new THREE.MeshLambertMaterial({
          map: this.texCache.getTexture(t.assetKey),
          emissive: 0x451a03,
          emissiveIntensity: 0.22,
          alphaTest: 0.4,
          side: THREE.DoubleSide
        })
      );
      sprite.position.y = 0.02;
      grp.add(ring, sprite);
      grp.position.set(wx, h + 0.02, wz);
      grp.visible = visibility.explored.has(hexKey);
      this.scene.add(grp);
      this.dungeonTreasureVisuals.set(t.id, {
        group: grp,
        hexKey,
        sprite,
        ring,
        baseY: 0.02,
        phase: t.x * 0.7 + t.y
      });
    }
    for (const [id, vis] of this.dungeonTreasureVisuals.entries()) {
      if (!seenTreasures.has(id)) {
        this.scene.remove(vis.group);
        this.dungeonTreasureVisuals.delete(id);
      }
    }

    // Captive Allies (emerald ring + hero sprite + iron cage overlay)
    const seenAllies = new Set<string>();
    for (const a of allies) {
      seenAllies.add(a.id);
      const hexKey = `${a.x},${a.y}`;
      const existing = this.dungeonAllyVisuals.get(a.id);
      if (existing) {
        existing.group.visible = visibility.explored.has(hexKey);
        continue;
      }
      const tile = map.tiles[a.y]?.[a.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(a.x, a.y);
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.032;
      const spGeo = new THREE.PlaneGeometry(1.06, 1.06);
      spGeo.translate(0, 0.48, 0);
      const sprite = new THREE.Mesh(
        spGeo,
        new THREE.MeshLambertMaterial({
          map: this.texCache.getTexture(a.spriteAsset),
          emissive: 0x064e3b,
          emissiveIntensity: 0.24,
          alphaTest: 0.4,
          side: THREE.DoubleSide
        })
      );
      sprite.position.y = 0.02;
      const cageGeo = new THREE.PlaneGeometry(1.16, 1.16);
      cageGeo.translate(0, 0.54, 0);
      const cage = new THREE.Mesh(
        cageGeo,
        new THREE.MeshLambertMaterial({
          map: this.texCache.getTexture('item_cage'),
          alphaTest: 0.4,
          side: THREE.DoubleSide
        })
      );
      cage.position.set(0, 0.02, 0.06);
      grp.add(ring, sprite, cage);
      grp.position.set(wx, h + 0.02, wz);
      grp.visible = visibility.explored.has(hexKey);
      this.scene.add(grp);
      this.dungeonAllyVisuals.set(a.id, {
        group: grp,
        hexKey,
        sprite,
        ring,
        baseY: 0.02,
        phase: a.x * 0.5 + a.y * 0.8
      });
    }
    for (const [id, vis] of this.dungeonAllyVisuals.entries()) {
      if (!seenAllies.has(id)) {
        this.scene.remove(vis.group);
        this.dungeonAllyVisuals.delete(id);
      }
    }

    // Detected Traps (orange-crimson hazard ring + Wesnoth rune/slab decal, visible only within torchlight LoS)
    const seenTraps = new Set<string>();
    for (const tr of detectedTraps) {
      seenTraps.add(tr.id);
      const hexKey = `${tr.x},${tr.y}`;
      const existing = this.dungeonTrapVisuals.get(tr.id);
      if (existing) {
        existing.group.visible = visibility.visible.has(hexKey);
        continue;
      }
      const tile = map.tiles[tr.y]?.[tr.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(tr.x, tr.y);
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.49, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.034;
      const decalGeo = new THREE.PlaneGeometry(0.95, 0.95);
      decalGeo.rotateX(-Math.PI / 2);
      const decal = new THREE.Mesh(
        decalGeo,
        new THREE.MeshBasicMaterial({
          map: this.texCache.getTexture(tr.assetKey),
          transparent: true,
          depthWrite: false
        })
      );
      decal.position.y = 0.026;
      grp.add(decal, ring);
      grp.position.set(wx, h, wz);
      grp.visible = visibility.visible.has(hexKey);
      this.scene.add(grp);
      this.dungeonTrapVisuals.set(tr.id, {
        group: grp,
        hexKey,
        ring,
        baseY: 0.026,
        phase: tr.x * 0.9 + tr.y * 0.4
      });
    }
    for (const [id, vis] of this.dungeonTrapVisuals.entries()) {
      if (!seenTraps.has(id)) {
        this.scene.remove(vis.group);
        this.dungeonTrapVisuals.delete(id);
      }
    }
  }

  public syncPois(pois: OverworldPoiSpec[], map: WesnothMapData) {
    const seen = new Set<string>();
    for (const poi of pois) {
      seen.add(poi.id);
      if (this.poiVisuals.has(poi.id)) continue;

      const tile = map.tiles[poi.y]?.[poi.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(poi.x, poi.y);

      const grp = new THREE.Group();
      const ringColor =
        poi.kind === 'recruit' ? 0x34d399 : poi.kind === 'shrine' ? 0x38bdf8 : 0xfacc15;

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.36, 12).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.38, depthWrite: false })
      );
      shadow.position.y = 0.022;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.032;

      const assetKey = getPoiWesnothAsset(poi);
      const isRecruit = poi.kind === 'recruit';
      const isShrine = poi.kind === 'shrine';
      const spriteSize = isRecruit ? 1.12 : isShrine ? 1.18 : 0.96;
      const spGeo = new THREE.PlaneGeometry(spriteSize, spriteSize);
      spGeo.translate(0, spriteSize * 0.44, 0);
      const spMat = new THREE.MeshLambertMaterial({
        map: this.texCache.getTexture(assetKey),
        color: BRAWL_PALETTE.overworld.unitSpriteTintHex,
        emissive: isShrine ? 0x0c4a6e : 0x1e293b,
        emissiveIntensity: isShrine ? 0.28 : 0.16,
        alphaTest: 0.4,
        side: THREE.DoubleSide
      });
      const beacon = new THREE.Mesh(spGeo, spMat);
      const baseY = 0.03;
      beacon.position.y = baseY;
      beacon.castShadow = !this.isSoftwareGl;

      grp.add(shadow, ring, beacon);
      grp.position.set(wx, h + 0.02, wz);
      this.scene.add(grp);

      this.poiVisuals.set(poi.id, {
        group: grp,
        beacon,
        ring,
        baseY,
        phase: poi.x * 0.6 + poi.y * 0.9
      });
    }

    for (const [id, vis] of this.poiVisuals.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group);
        this.poiVisuals.delete(id);
      }
    }
  }

  public syncWorldEvents(events: ActiveWorldEventNode[], map: WesnothMapData) {
    const seen = new Set<string>();
    for (const ev of events) {
      seen.add(ev.id);
      if (this.worldEventVisuals.has(ev.id)) continue;

      const tile = map.tiles[ev.y]?.[ev.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(ev.x, ev.y);

      const grp = new THREE.Group();
      const isMerchant = ev.category === 'merchant';
      const ringColor = isMerchant ? 0xf59e0b : ev.category === 'omen' ? 0x38bdf8 : 0x2dd4bf;

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.38, 12).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.4, depthWrite: false })
      );
      shadow.position.y = 0.022;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.54, 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.position.y = 0.032;

      const assetKey = getWorldEventWesnothAsset(ev.templateId, ev.category);
      const spriteSize = isMerchant ? 1.18 : 0.98;
      const spGeo = new THREE.PlaneGeometry(spriteSize, spriteSize);
      spGeo.translate(0, spriteSize * 0.44, 0);
      const spMat = new THREE.MeshLambertMaterial({
        map: this.texCache.getTexture(assetKey),
        color: BRAWL_PALETTE.overworld.unitSpriteTintHex,
        emissive: isMerchant ? 0x451a03 : 0x134e4a,
        emissiveIntensity: 0.2,
        alphaTest: 0.4,
        side: THREE.DoubleSide
      });
      const prop = new THREE.Mesh(spGeo, spMat);
      prop.position.y = 0.03;
      prop.castShadow = !this.isSoftwareGl;

      grp.add(shadow, ring, prop);
      grp.position.set(wx, h + 0.02, wz);
      this.scene.add(grp);

      this.worldEventVisuals.set(ev.id, {
        group: grp,
        prop,
        ring,
        baseY: 0.03,
        phase: ev.x * 0.7 + ev.y * 0.5
      });
    }

    for (const [id, vis] of this.worldEventVisuals.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group);
        this.worldEventVisuals.delete(id);
      }
    }
  }

  public snapCameraToHero(heroX: number, heroY: number, map: WesnothMapData) {
    const tile = map.tiles[heroY]?.[heroX];
    const h = tile ? tile.terrain.elevation : 0.26;
    const { wx, wz } = hexToWorld(heroX, heroY);
    this.heroGroup.position.set(wx, h + 0.02, wz);
    this.heroTargetPos.copy(this.heroGroup.position);
    this.desiredTarget.set(wx, h + 0.4, wz);
    this.cameraTarget.copy(this.desiredTarget);
    this.updateCamera(1);
  }

  public showReachableHexes(reachable: ReachableHex[], map: WesnothMapData, patrols: ActivePatrolState[]) {
    if (!this.frontierInstanced) return;
    const filteredReachable =
      this.isDungeonMode && this.latestVisibility
        ? reachable.filter(r => this.latestVisibility!.explored.has(`${r.x},${r.y}`))
        : reachable;
    const visiblePatrols =
      this.isDungeonMode && this.latestVisibility
        ? patrols.filter(p => this.latestVisibility!.visible.has(`${p.x},${p.y}`))
        : patrols;

    const edges = computeReachableFrontierEdges(
      map,
      filteredReachable.map(r => ({ x: r.x, y: r.y })),
      visiblePatrols.map(p => ({ x: p.x, y: p.y }))
    );

    const count = Math.min(edges.length, 600);
    this.frontierInstanced.count = count;

    for (let i = 0; i < count; i++) {
      const e = edges[i];
      const { wx, wz } = hexToWorld(e.x, e.y);
      const { mx, mz, rotY } = getHexEdgeTransform(e.dir, 0.94);

      _vec3A.set(wx + mx, e.elevation + 0.032, wz + mz);
      _euler.set(0, rotY, 0);
      _quat.setFromEuler(_euler);
      _scale.set(1, 1, 1);
      _mat4.compose(_vec3A, _quat, _scale);
      this.frontierInstanced.setMatrixAt(i, _mat4);

      _color.setHex(e.isEnemyEdge ? 0xef4444 : 0x38bdf8);
      this.frontierInstanced.setColorAt(i, _color);
    }

    this.frontierInstanced.instanceMatrix.needsUpdate = true;
    if (this.frontierInstanced.instanceColor) this.frontierInstanced.instanceColor.needsUpdate = true;
  }

  public showPathPreview(path: HexCoord[], map: WesnothMapData) {
    if (!this.pathInstanced) return;
    const count = Math.min(path.length, 48);
    this.pathInstanced.count = count;
    for (let i = 0; i < count; i++) {
      const node = path[i];
      const tile = map.tiles[node.y]?.[node.x];
      const h = tile ? tile.terrain.elevation : 0.26;
      const { wx, wz } = hexToWorld(node.x, node.y);
      _mat4.makeTranslation(wx, h + 0.04, wz);
      this.pathInstanced.setMatrixAt(i, _mat4);
    }
    this.pathInstanced.instanceMatrix.needsUpdate = true;
  }

  public setHoveredHex(x: number, y: number, map: WesnothMapData) {
    const tile = map.tiles[y]?.[x];
    if (!tile) return;
    const { wx, wz } = hexToWorld(x, y);
    const hideWallHeight =
      this.isDungeonMode && tile.terrain.isWall && !(this.latestVisibility?.explored.has(`${x},${y}`) ?? false);
    const elev = hideWallHeight ? 0.26 : tile.terrain.elevation;
    this.hoverHexRing.position.set(wx, elev + 0.035, wz);
  }

  public rotateCamera(deltaYaw: number) {
    this.desiredYaw += deltaYaw;
  }

  public adjustZoom(delta: number) {
    this.desiredDist = THREE.MathUtils.clamp(this.desiredDist + delta, 7.5, 27.0);
  }

  public focusOnHex(x: number, y: number, map: WesnothMapData) {
    const tile = map.tiles[y]?.[x];
    const h = tile ? tile.terrain.elevation : 0.26;
    const { wx, wz } = hexToWorld(x, y);
    this.desiredTarget.set(wx, h + 0.4, wz);
    if (this.isSoftwareGl) {
      this.cameraTarget.copy(this.desiredTarget);
      this.updateCamera(1);
    }
  }

  public resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private addBoundListener(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject) {
    target.addEventListener(type, fn);
    this.boundListeners.push({ target, type, fn });
  }

  private initListeners() {
    const dom = this.renderer.domElement;

    this.addBoundListener(dom, 'pointerdown', (ev: Event) => {
      const e = ev as PointerEvent;
      this.isDragging = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
    });

    this.addBoundListener(dom, 'pointermove', (ev: Event) => {
      const e = ev as PointerEvent;
      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerPos.x;
        const dy = e.clientY - this.lastPointerPos.y;
        const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
        if (dist > 6) {
          if (e.buttons === 2 || e.shiftKey) {
            const panScale = this.cameraDist * 0.0022;
            const cos = Math.cos(this.cameraYaw);
            const sin = Math.sin(this.cameraYaw);
            this.desiredTarget.x = THREE.MathUtils.clamp(
              this.desiredTarget.x - (cos * dx + sin * dy) * panScale,
              0,
              this.mapBounds.maxX
            );
            this.desiredTarget.z = THREE.MathUtils.clamp(
              this.desiredTarget.z - (-sin * dx + cos * dy) * panScale,
              0,
              this.mapBounds.maxZ
            );
          } else {
            this.desiredYaw -= dx * 0.007;
          }
        }
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        return;
      }

      const now = performance.now();
      if (now - this.lastHoverTime < 45) return;
      this.lastHoverTime = now;

      const hit = this.raycastHex(e.clientX, e.clientY);
      if (hit && this.onHexHover) {
        this.onHexHover(hit.x, hit.y);
      }
    });

    this.addBoundListener(window, 'pointerup', (ev: Event) => {
      const e = ev as PointerEvent;
      if (!this.isDragging) return;
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      this.isDragging = false;

      if (dist < 6 && e.target === dom && e.button === 0) {
        const hit = this.raycastHex(e.clientX, e.clientY);
        if (hit && this.onHexClick) {
          this.onHexClick(hit.x, hit.y);
        }
      }
    });

    this.addBoundListener(dom, 'contextmenu', (e: Event) => e.preventDefault());
    this.addBoundListener(dom, 'wheel', (ev: Event) => {
      const e = ev as WheelEvent;
      e.preventDefault();
      this.adjustZoom(e.deltaY * 0.008);
    });
  }

  private raycastHex(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickMeshes, false);
    if (hits.length > 0) {
      const { hexX, hexY } = hits[0].object.userData;
      return { x: hexX, y: hexY };
    }
    return null;
  }

  private updateCamera(dt: number) {
    const damp = 1 - Math.exp(-7 * dt);
    this.cameraTarget.lerp(this.desiredTarget, damp);
    this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, this.desiredYaw, damp);
    this.cameraDist = THREE.MathUtils.lerp(this.cameraDist, this.desiredDist, damp);

    const horiz = Math.cos(this.cameraPitch) * this.cameraDist;
    const height = Math.sin(this.cameraPitch) * this.cameraDist;

    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horiz,
      this.cameraTarget.y + height,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horiz
    );
    this.camera.lookAt(this.cameraTarget);
  }

  private updateActorsAndSprites(dt: number, elapsed: number) {
    const camYaw = this.cameraYaw;

    for (let i = 0; i < this.billboards.length; i++) {
      this.billboards[i].mesh.rotation.y = camYaw;
    }

    const heroMoveDist = this.heroGroup.position.distanceTo(this.heroTargetPos);
    const lerpFactor = 1 - Math.exp(-11 * dt);
    this.heroGroup.position.lerp(this.heroTargetPos, lerpFactor);
    this.heroSprite.rotation.y = camYaw;
    this.heroSprite.scale.x = this.heroFacingEast ? 1 : -1;

    if (heroMoveDist > 0.05) {
      this.heroWalkPhase += dt * 16;
      this.heroSprite.position.y = Math.abs(Math.sin(this.heroWalkPhase)) * 0.16;
    } else {
      this.heroSprite.position.y = Math.sin(elapsed * 3.0) * 0.025;
    }

    for (const vis of this.patrolVisuals.values()) {
      vis.group.position.lerp(vis.targetPos, lerpFactor);
      vis.sprite.rotation.y = camYaw;
      vis.sprite.position.y = Math.sin(elapsed * 2.8 + vis.phase) * 0.03;
      vis.ring.scale.setScalar(1 + Math.sin(elapsed * 4 + vis.phase) * 0.05);
    }

    for (const poiVis of this.poiVisuals.values()) {
      poiVis.beacon.rotation.y = camYaw;
      poiVis.beacon.position.y = poiVis.baseY + Math.sin(elapsed * 2.4 + poiVis.phase) * 0.035;
      poiVis.ring.scale.setScalar(1 + Math.sin(elapsed * 3.5 + poiVis.phase) * 0.06);
    }

    for (const evVis of this.worldEventVisuals.values()) {
      evVis.prop.rotation.y = camYaw;
      evVis.prop.position.y = evVis.baseY + Math.sin(elapsed * 2.2 + evVis.phase) * 0.03;
      evVis.ring.scale.setScalar(1 + Math.sin(elapsed * 3.8 + evVis.phase) * 0.07);
    }

    for (const ruinVis of this.ruinVisuals.values()) {
      ruinVis.sprite.rotation.y = camYaw;
      ruinVis.sprite.position.y = ruinVis.baseY + Math.sin(elapsed * 1.8 + ruinVis.phase) * 0.022;
      ruinVis.ring.scale.setScalar(1 + Math.sin(elapsed * 3.2 + ruinVis.phase) * 0.06);
    }

    for (const trVis of this.dungeonTreasureVisuals.values()) {
      if (trVis.sprite) {
        trVis.sprite.rotation.y = camYaw;
        trVis.sprite.position.y = trVis.baseY + Math.sin(elapsed * 2.5 + trVis.phase) * 0.028;
      }
      trVis.ring.scale.setScalar(1 + Math.sin(elapsed * 3.6 + trVis.phase) * 0.05);
    }

    for (const alVis of this.dungeonAllyVisuals.values()) {
      alVis.group.children.forEach(c => {
        if (c !== alVis.ring) c.rotation.y = camYaw;
      });
      alVis.ring.scale.setScalar(1 + Math.sin(elapsed * 3.4 + alVis.phase) * 0.06);
    }

    for (const trapVis of this.dungeonTrapVisuals.values()) {
      trapVis.ring.scale.setScalar(1 + Math.sin(elapsed * 5.2 + trapVis.phase) * 0.08);
    }

    if (this.isDungeonMode) {
      this.heroTorchLight.intensity = 2.65 + Math.sin(elapsed * 7.5) * 0.14;
    }

    if (this.waterOverlayMesh) {
      this.waterOverlayMesh.position.y = 0.01 + Math.sin(elapsed * 1.4) * 0.008;
    }

    this.weatherSystem?.step(dt, elapsed);
  }

  private afterDraw(cb: () => void) {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop() {
    this.startTimeMs = performance.now();
    this.lastFrameMs = this.startTimeMs;

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastFrameMs) / 1000;
      this.lastFrameMs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      const elapsed = (now - this.startTimeMs) / 1000;

      this.updateCamera(dt);
      this.updateActorsAndSprites(dt, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      tick();
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public renderNow() {
    if (this.disposed) return;
    this.updateCamera(1);
    this.updateActorsAndSprites(0.016, (performance.now() - this.startTimeMs) / 1000);
    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.detachContextGuards?.();
    this.detachContextGuards = null;

    for (const l of this.boundListeners) {
      l.target.removeEventListener(l.type, l.fn);
    }
    this.boundListeners = [];

    this.scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    this.weatherSystem?.dispose();
    this.weatherSystem = null;
    this.tileAtlas?.dispose();
    this.tileAtlas = null;
    this.texCache.disposeAll();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
