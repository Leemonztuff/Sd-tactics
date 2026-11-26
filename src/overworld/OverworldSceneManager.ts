import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
import { WesnothTextureCache } from './WesnothAssetLoader';
import { WesnothTileAtlas, TILE_PX } from './WesnothTileAtlas';
import { WesnothMovetypeId } from './WesnothTerrain';

const _vec3A = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

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
  atlas: WesnothTileAtlas
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

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile: WesnothHexTile | undefined = map.tiles[y]?.[x];
      if (!tile) continue;

      const { wx, wz } = hexToWorld(x, y);
      const h = tile.terrain.elevation;
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
        const nbH = nb ? nb.terrain.elevation : 0;
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
          // Slight vertical shading darker at cliff bottom for crisp 3D depth
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

  private heroGroup: THREE.Group;
  private heroSprite: THREE.Mesh;
  private heroRing: THREE.Mesh;
  private heroTargetPos = new THREE.Vector3();
  private heroFacingEast = true;
  private heroWalkPhase = 0;

  private frontierInstanced: THREE.InstancedMesh | null = null;
  private pathInstanced: THREE.InstancedMesh | null = null;
  private hoverHexRing: THREE.Mesh;
  private waterOverlayMesh: THREE.Mesh | null = null;

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

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = this.detectSoftwareGl();
    this.texCache = new WesnothTextureCache(() => {
      if (!this.disposed) {
        this.renderer.render(this.scene, this.camera);
      }
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101c2e);
    this.scene.fog = new THREE.FogExp2(0x101c2e, 0.021);

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 140);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

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
    const heroMat = new THREE.MeshStandardMaterial({
      map: heroTex,
      color: 0xffffff,
      alphaTest: 0.4,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    this.heroSprite = new THREE.Mesh(heroPlaneGeo, heroMat);
    this.heroSprite.castShadow = !this.isSoftwareGl;

    this.heroGroup.add(heroShadow, this.heroRing, this.heroSprite);
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
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x262b38, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3d6, 1.48);
    sun.position.set(16, 26, 18);
    sun.castShadow = !this.isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x60a5fa, 0.45);
    rim.position.set(-14, 12, -16);
    this.scene.add(rim);
  }

  public buildOverworldScene(map: WesnothMapData) {
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.tileAtlas?.dispose();
    this.pickMeshes = [];
    this.billboards = [];

    const maxWorld = hexToWorld(map.width - 1, map.height - 1);
    this.mapBounds = { maxX: maxWorld.wx, maxZ: maxWorld.wz };

    // 1. Auto-tiled Wesnoth Atlas (all transitions composited into 1 crisp pixel-art atlas)
    this.tileAtlas = new WesnothTileAtlas(map, () => {
      if (!this.disposed) {
        this.renderer.render(this.scene, this.camera);
      }
    });
    if (!this.isSoftwareGl) {
      this.tileAtlas.texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }

    const { topGeo, sideGeo } = buildMergedHexTerrainGeometries(map, this.tileAtlas);

    const terrainTopMat = new THREE.MeshStandardMaterial({
      map: this.tileAtlas.texture,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.03
    });
    const terrainTopMesh = new THREE.Mesh(topGeo, terrainTopMat);
    terrainTopMesh.receiveShadow = true;
    this.worldGroup.add(terrainTopMesh);

    const terrainSideMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true
    });
    const terrainSideMesh = new THREE.Mesh(sideGeo, terrainSideMat);
    terrainSideMesh.receiveShadow = true;
    terrainSideMesh.castShadow = !this.isSoftwareGl;
    this.worldGroup.add(terrainSideMesh);

    // 2. Continuous Deep Ocean base matched to Wesnoth deep water extending into horizon fog
    const seaGeo = new THREE.PlaneGeometry(130, 130);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x224363,
      roughness: 0.36,
      metalness: 0.16
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.set(maxWorld.wx / 2, 0.01, maxWorld.wz / 2);
    seaMesh.receiveShadow = true;
    this.worldGroup.add(seaMesh);
    this.waterOverlayMesh = seaMesh;

    // Low coastal reefs far around perimeter
    const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x16314c, roughness: 0.88, flatShading: true });
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

    // Shared geometries/materials for props, connected castle walls, and raycast proxies
    const pickGeo = new THREE.CircleGeometry(HEX_RADIUS * 0.9, 6);
    pickGeo.rotateX(-Math.PI / 2);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });

    const overlayMatCache = new Map<string, THREE.MeshStandardMaterial>();
    const getOverlayMat = (assetKey: string) => {
      const existing = overlayMatCache.get(assetKey);
      if (existing) return existing;
      const mat = new THREE.MeshStandardMaterial({
        map: this.texCache.getTexture(assetKey),
        color: 0xffffff,
        alphaTest: 0.42,
        roughness: 0.88,
        metalness: 0.04,
        side: THREE.DoubleSide
      });
      overlayMatCache.set(assetKey, mat);
      return mat;
    };

    const propShadowGeo = new THREE.CircleGeometry(0.36, 10);
    propShadowGeo.rotateX(-Math.PI / 2);
    const propShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    const castleWallSegGeo = new THREE.BoxGeometry(HEX_RADIUS * 0.98, 0.2, 0.14);
    const castleCrestGeo = new THREE.BoxGeometry(0.22, 0.09, 0.16);
    const castleCornerGeo = new THREE.CylinderGeometry(0.115, 0.125, 0.27, 6);
    const castleWallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.82, flatShading: true });
    const castleTrimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.78, flatShading: true });

    const poleGeo = new THREE.CylinderGeometry(0.024, 0.03, 0.84, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.55, metalness: 0.45 });
    const pennantGeo = new THREE.BoxGeometry(0.34, 0.16, 0.03);

    const bridgeDeckGeo = new THREE.BoxGeometry(HEX_RADIUS * 1.4, 0.14, HEX_RADIUS * 0.72);
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      map: this.texCache.getTexture('bridge_stone'),
      color: 0xffffff,
      roughness: 0.8
    });

    const spriteGeo = new THREE.PlaneGeometry(1.25, 1.25);
    spriteGeo.translate(0, 0.56, 0);
    const villageGeo = new THREE.PlaneGeometry(1.18, 1.18);
    villageGeo.translate(0, 0.36, 0);
    const bigMountainGeo = new THREE.PlaneGeometry(1.78, 1.62);
    bigMountainGeo.translate(0, 0.72, 0);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile: WesnothHexTile | undefined = map.tiles[y]?.[x];
        if (!tile) continue;

        const { wx, wz } = hexToWorld(x, y);
        const h = tile.terrain.elevation;

        // Raycast proxy disc
        const pick = new THREE.Mesh(pickGeo, pickMat);
        pick.position.set(wx, h + 0.01, wz);
        pick.userData = { hexX: x, hexY: y };
        this.worldGroup.add(pick);
        this.pickMeshes.push(pick);

        // Connected 3D Castle Walls ONLY on exterior edges bordering non-castle terrain
        if (tile.terrain.baseCategory === 'castle') {
          const plan = computeHexAutoTilePlan(map, x, y);
          const placedCorners = new Set<number>();
          for (const dir of plan.castleOuterDirs) {
            const { mx, mz, rotY } = getHexEdgeTransform(dir, 0.92);
            const wall = new THREE.Mesh(castleWallSegGeo, castleWallMat);
            wall.position.set(wx + mx, h + 0.09, wz + mz);
            wall.rotation.y = rotY;
            wall.castShadow = !this.isSoftwareGl;
            this.worldGroup.add(wall);

            // Crenellation merlon teeth
            for (const offset of [-0.26, 0.26]) {
              const merlon = new THREE.Mesh(castleCrestGeo, castleTrimMat);
              merlon.position.set(
                wx + mx + Math.cos(rotY) * offset,
                h + 0.22,
                wz + mz - Math.sin(rotY) * offset
              );
              merlon.rotation.y = rotY;
              this.worldGroup.add(merlon);
            }

            // Stone corner turret posts join outer wall segments without miter gaps
            const [cA, cB] = DIR_EDGE_CORNERS[dir];
            for (const cornerIdx of [cA, cB]) {
              if (placedCorners.has(cornerIdx)) continue;
              placedCorners.add(cornerIdx);
              const corner = HEX_CORNERS[cornerIdx];
              const turret = new THREE.Mesh(castleCornerGeo, castleTrimMat);
              turret.position.set(wx + corner.x * 0.92, h + 0.135, wz + corner.z * 0.92);
              this.worldGroup.add(turret);
            }
          }

          if (tile.terrain.isKeep) {
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(wx - 0.54, h + 0.42, wz - 0.42);
            this.worldGroup.add(pole);

            const bannerColor = tile.startingPosition === 1 ? 0x2563eb : 0xdc2626;
            const pennant = new THREE.Mesh(
              pennantGeo,
              new THREE.MeshStandardMaterial({ color: bannerColor, roughness: 0.55, flatShading: true })
            );
            pennant.position.set(wx - 0.37, h + 0.74, wz - 0.42);
            this.worldGroup.add(pennant);
          }
        }

        // Low-poly 3D Stone Bridge Deck
        if (tile.terrain.overlayCategory === 'bridge') {
          const deck = new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat);
          deck.position.set(wx, h + 0.04, wz);
          this.worldGroup.add(deck);
        }

        // Upright Wesnoth Pixel-Art Overlays (Forests, Villages, Mountains)
        if (tile.terrain.overlayAsset && tile.terrain.overlayCategory !== 'bridge') {
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
              this.billboards.push({
                mesh: tree,
                baseX: wx + o.ox,
                baseY: h + 0.01,
                baseZ: wz + o.oz,
                bobPhase: x + y + idx
              });
            });
          } else if (tile.terrain.baseCode === 'Mm') {
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

            const useVillageGeo = tile.terrain.overlayCategory === 'village';
            const sprite = new THREE.Mesh(
              useVillageGeo ? villageGeo : spriteGeo,
              getOverlayMat(tile.terrain.overlayAsset)
            );
            sprite.position.set(wx, h + 0.01, wz);
            sprite.castShadow = !this.isSoftwareGl;
            this.worldGroup.add(sprite);
            this.billboards.push({
              mesh: sprite,
              baseX: wx,
              baseY: h + 0.01,
              baseZ: wz,
              bobPhase: x * 0.5
            });
          }
        }
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
    const mat = this.heroSprite.material as THREE.MeshStandardMaterial;
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
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
        );
        sh.position.y = 0.02;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.46, 0.56, 6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: p.isBoss ? 0xf59e0b : 0xef4444,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.position.y = 0.03;

        const spGeo = new THREE.PlaneGeometry(p.isBoss ? 1.38 : 1.16, p.isBoss ? 1.38 : 1.16);
        spGeo.translate(0, p.isBoss ? 0.66 : 0.56, 0);
        const spMat = new THREE.MeshStandardMaterial({
          map: this.texCache.getTexture(p.spriteAsset),
          color: 0xffffff,
          alphaTest: 0.4,
          roughness: 0.85,
          side: THREE.DoubleSide
        });
        const sprite = new THREE.Mesh(spGeo, spMat);
        sprite.castShadow = !this.isSoftwareGl;

        grp.add(sh, ring, sprite);
        grp.position.set(pw.wx, pElev + 0.02, pw.wz);
        this.scene.add(grp);

        this.patrolVisuals.set(p.id, {
          group: grp,
          sprite,
          ring,
          targetPos: new THREE.Vector3(pw.wx, pElev + 0.02, pw.wz),
          phase: p.x * 0.7 + p.y
        });
      } else {
        existing.targetPos.set(pw.wx, pElev + 0.02, pw.wz);
      }
    }

    for (const [id, vis] of this.patrolVisuals.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group);
        this.patrolVisuals.delete(id);
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
    const edges = computeReachableFrontierEdges(
      map,
      reachable.map(r => ({ x: r.x, y: r.y })),
      patrols.map(p => ({ x: p.x, y: p.y }))
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
    this.hoverHexRing.position.set(wx, tile.terrain.elevation + 0.035, wz);
  }

  public rotateCamera(deltaYaw: number) {
    this.desiredYaw += deltaYaw;
  }

  public adjustZoom(delta: number) {
    this.desiredDist = THREE.MathUtils.clamp(this.desiredDist + delta, 7.5, 22.0);
  }

  public focusOnHex(x: number, y: number, map: WesnothMapData) {
    const tile = map.tiles[y]?.[x];
    const h = tile ? tile.terrain.elevation : 0.26;
    const { wx, wz } = hexToWorld(x, y);
    this.desiredTarget.set(wx, h + 0.4, wz);
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

    if (this.waterOverlayMesh) {
      this.waterOverlayMesh.position.y = 0.01 + Math.sin(elapsed * 1.4) * 0.008;
    }
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

    this.tileAtlas?.dispose();
    this.tileAtlas = null;
    this.texCache.disposeAll();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
