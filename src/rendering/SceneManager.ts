import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GridSystem } from '../world/GridSystem';
import { EntityData, TileData } from '../types/game';
import { createEntityGroup, directionToYaw } from './EntityMeshFactory';

const ELEVATION_STEP = 0.52;

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _dummy = new THREE.Object3D();

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  scale: number;
}

interface UnitVisualState {
  group: THREE.Group;
  actorBody: THREE.Group;
  targetPos: THREE.Vector3;
  targetYaw: number;
  flashTimer: number;
  attackPunch: number;
  walkPhase: number;
  isDying: boolean;
  deathTimer: number;
}

export class SceneManager {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.OrthographicCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;

  private tileGroups: THREE.Group[] = [];
  private tilePickMeshes: THREE.Mesh[] = [];
  private environmentProps: THREE.Object3D[] = [];
  private entityVisuals: Map<string, UnitVisualState> = new Map();

  private highlightInstanced: THREE.InstancedMesh | null = null;
  private pathInstanced: THREE.InstancedMesh | null = null;
  private cursorGroup: THREE.Group;
  private activeUnitRing: THREE.Mesh;

  // Pooled particles (zero GC)
  private particlePool: ParticleSlot[] = [];
  private particleMesh: THREE.InstancedMesh;
  private readonly MAX_PARTICLES = 64;

  // Procedural textures
  private stoneTex: THREE.CanvasTexture;
  private grassTex: THREE.CanvasTexture;

  // Camera state (smoothly damped)
  private cameraTarget = new THREE.Vector3(5, 0.5, 5);
  private desiredTarget = new THREE.Vector3(5, 0.5, 5);
  private cameraAngle = Math.PI / 4;
  private desiredAngle = Math.PI / 4;
  private cameraZoom = 8.5; // ortho frustum half-height
  private desiredZoom = 8.5;
  private cameraPitch = 0.68; // elevation angle
  private trauma = 0;

  // Pointer & Raycasting
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private isDragging = false;
  private dragMode: 'rotate' | 'pan' = 'rotate';
  private lastPointerPos = { x: 0, y: 0 };
  private lastHoverTime = 0;

  // Callbacks
  public onTileClick: ((x: number, z: number) => void) | null = null;
  public onTileHover: ((x: number, z: number) => void) | null = null;

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private startTimeMs = performance.now();
  private lastFrameMs = performance.now();
  private gridWidth = 10;
  private gridHeight = 10;
  private boundListeners: Array<{ target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = this.detectSoftwareGl();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1420);
    this.scene.fog = new THREE.FogExp2(0x0f1420, 0.016);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;

    this.camera = new THREE.OrthographicCamera(
      -this.cameraZoom * aspect,
      this.cameraZoom * aspect,
      this.cameraZoom,
      -this.cameraZoom,
      0.5,
      160
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Studio Environment Reflection (mandatory for PBR steel/brass)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.stoneTex = this.createTileTexture('#747b89', '#475569', true, maxAniso);
    this.grassTex = this.createTileTexture('#4d7c4f', '#365838', false, maxAniso);

    this.setupLighting();

    // Cursor indicator
    this.cursorGroup = this.createCursorIndicator();
    this.scene.add(this.cursorGroup);

    // Active unit ring
    const activeRingGeo = new THREE.RingGeometry(0.41, 0.49, 24);
    const activeRingMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.activeUnitRing = new THREE.Mesh(activeRingGeo, activeRingMat);
    this.activeUnitRing.rotation.x = -Math.PI / 2;
    this.activeUnitRing.visible = false;
    this.scene.add(this.activeUnitRing);

    // Pooled particle InstancedMesh
    const pGeo = new THREE.OctahedronGeometry(0.08, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
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
        color: new THREE.Color(0xffffff),
        scale: 1
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.scene.add(this.particleMesh);

    this.initListeners();
    this.updateCameraTransform(1);
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

  private createTileTexture(baseHex: string, edgeHex: string, masonry: boolean, anisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 128, 128);

    // Subtle organic/stone speckle
    for (let i = 0; i < 160; i++) {
      const x = (i * 53) % 128;
      const y = (i * 97) % 128;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, y, masonry ? 6 : 3, masonry ? 4 : 3);
    }

    // Tile bevel grid border
    ctx.strokeStyle = edgeHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 124);

    if (masonry) {
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 64);
      ctx.lineTo(128, 64);
      ctx.moveTo(64, 0);
      ctx.lineTo(64, 64);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, anisotropy);
    return tex;
  }

  private setupLighting() {
    // Cool sky / warm earth hemisphere fill
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x292524, 0.72);
    this.scene.add(hemi);

    // Warm key directional light
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.45);
    keyLight.position.set(16, 26, 14);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Subtle cool rim backlight for silhouette readability
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.5);
    rimLight.position.set(-14, 12, -16);
    this.scene.add(rimLight);
  }

  private createCursorIndicator(): THREE.Group {
    const group = new THREE.Group();
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.49, 4), borderMat);
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = Math.PI / 4;
    group.add(ring);
    group.position.set(0, -10, 0);
    return group;
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
      this.dragMode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
    });

    this.addBoundListener(dom, 'pointermove', (ev: Event) => {
      const e = ev as PointerEvent;
      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerPos.x;
        const dy = e.clientY - this.lastPointerPos.y;
        const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);

        if (dist > 5) {
          if (this.dragMode === 'rotate') {
            this.desiredAngle -= dx * 0.008;
          } else {
            // Pan in camera-aligned XZ plane
            const forwardX = -Math.sin(this.cameraAngle);
            const forwardZ = -Math.cos(this.cameraAngle);
            const rightX = Math.cos(this.cameraAngle);
            const rightZ = -Math.sin(this.cameraAngle);
            const panScale = this.cameraZoom * 0.003;
            this.desiredTarget.x = THREE.MathUtils.clamp(
              this.desiredTarget.x - (rightX * dx - forwardX * dy) * panScale,
              -1,
              this.gridWidth
            );
            this.desiredTarget.z = THREE.MathUtils.clamp(
              this.desiredTarget.z - (rightZ * dx - forwardZ * dy) * panScale,
              -1,
              this.gridHeight
            );
          }
        }
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        return;
      }

      // Throttled hover raycast
      const now = performance.now();
      if (now - this.lastHoverTime < 45) return;
      this.lastHoverTime = now;

      const hit = this.raycastTile(e.clientX, e.clientY);
      if (hit && this.onTileHover) {
        this.onTileHover(hit.x, hit.z);
      }
    });

    this.addBoundListener(window, 'pointerup', (ev: Event) => {
      const e = ev as PointerEvent;
      if (!this.isDragging) return;
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      this.isDragging = false;

      // Tap / Click (< 6px drag) picks tile via raycaster
      if (dist < 6 && e.target === dom && e.button === 0) {
        const hit = this.raycastTile(e.clientX, e.clientY);
        if (hit && this.onTileClick) {
          this.onTileClick(hit.x, hit.z);
        }
      }
    });

    this.addBoundListener(dom, 'contextmenu', (e: Event) => e.preventDefault());

    this.addBoundListener(
      dom,
      'wheel',
      (ev: Event) => {
        const e = ev as WheelEvent;
        e.preventDefault();
        this.adjustZoom(e.deltaY * 0.006);
      },
      // non-passive handled via listener
    );
  }

  private raycastTile(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.tilePickMeshes, false);
    if (hits.length > 0) {
      const { gridX, gridZ } = hits[0].object.userData;
      return { x: gridX, z: gridZ };
    }
    return null;
  }

  public rotateCamera(deltaAngle: number) {
    this.desiredAngle += deltaAngle;
  }

  public adjustZoom(delta: number) {
    this.desiredZoom = THREE.MathUtils.clamp(this.desiredZoom + delta, 5.0, 15.0);
  }

  public focusOnTile(x: number, z: number, y: number = 0) {
    this.desiredTarget.set(x, y * ELEVATION_STEP + 0.4, z);
  }

  public resetCamera() {
    this.desiredAngle = Math.PI / 4;
    this.desiredZoom = 8.5;
    this.desiredTarget.set((this.gridWidth - 1) / 2, 0.4, (this.gridHeight - 1) / 2);
  }

  public addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public buildGridScene(grid: GridSystem) {
    // Cleanup previous tiles & props
    this.tileGroups.forEach(g => this.scene.remove(g));
    this.tileGroups = [];
    this.tilePickMeshes = [];
    this.environmentProps.forEach(p => this.scene.remove(p));
    this.environmentProps = [];

    this.gridWidth = grid.width;
    this.gridHeight = grid.height;
    this.desiredTarget.set((grid.width - 1) / 2, 0.4, (grid.height - 1) / 2);
    this.cameraTarget.copy(this.desiredTarget);

    // Grounded outer diorama plinth extending beyond playable zone
    const plinthW = grid.width + 6;
    const plinthH = grid.height + 6;
    const plinthGeo = new THREE.BoxGeometry(plinthW, 1.4, plinthH);
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1e2433, roughness: 0.92, metalness: 0.08 });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set((grid.width - 1) / 2, -0.78, (grid.height - 1) / 2);
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    this.environmentProps.push(plinth);

    const rimGeo = new THREE.BoxGeometry(grid.width + 0.5, 0.22, grid.height + 0.5);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set((grid.width - 1) / 2, -0.08, (grid.height - 1) / 2);
    this.scene.add(rim);
    this.environmentProps.push(rim);

    // Shared geometries & materials for tiles
    const colGeo = new THREE.BoxGeometry(0.97, 1, 0.97);
    const topPickGeo = new THREE.PlaneGeometry(0.98, 0.98);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });

    const matGrass = new THREE.MeshStandardMaterial({ map: this.grassTex, color: 0xffffff, roughness: 0.85, metalness: 0.02 });
    const matStone = new THREE.MeshStandardMaterial({ map: this.stoneTex, color: 0xffffff, roughness: 0.72, metalness: 0.1 });
    const matHigh = new THREE.MeshStandardMaterial({ map: this.grassTex, color: 0xa7c98f, roughness: 0.78, metalness: 0.05 });
    const matWater = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.85 });
    const matMud = new THREE.MeshStandardMaterial({ map: this.stoneTex, color: 0x7c5338, roughness: 0.94, metalness: 0.02 });
    const matHazard = new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0xb45309, emissiveIntensity: 0.55, roughness: 0.5 });

    const group = new THREE.Group();

    grid.tiles.forEach((tile: TileData) => {
      const columnHeight = (tile.y + 1) * ELEVATION_STEP;
      let mat = matGrass;
      if (tile.terrain === 'stone') mat = matStone;
      else if (tile.terrain === 'high_ground') mat = matHigh;
      else if (tile.terrain === 'water') mat = matWater;
      else if (tile.terrain === 'mud') mat = matMud;
      else if (tile.terrain === 'hazard') mat = matHazard;

      const mesh = new THREE.Mesh(colGeo, mat);
      mesh.scale.y = tile.terrain === 'water' ? Math.max(0.35, columnHeight - 0.12) : columnHeight;
      mesh.position.set(tile.x, mesh.scale.y / 2, tile.z);
      mesh.receiveShadow = true;
      mesh.castShadow = !this.isSoftwareGl;
      group.add(mesh);

      // Top face surface height
      const topY = tile.y * ELEVATION_STEP + ELEVATION_STEP;

      // Invisible raycast proxy plane flush at top of tile
      const pickPlane = new THREE.Mesh(topPickGeo, pickMat);
      pickPlane.rotation.x = -Math.PI / 2;
      pickPlane.position.set(tile.x, topY + 0.005, tile.z);
      pickPlane.userData = { gridX: tile.x, gridZ: tile.z };
      group.add(pickPlane);
      this.tilePickMeshes.push(pickPlane);

      // Stone pillar / boulder obstacle prop
      if (tile.hasObstacle) {
        const pillarGroup = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.25, 6), matStone);
        base.position.y = 0.125;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.75, 6), matStone);
        shaft.position.y = 0.62;
        const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), matStone);
        cap.position.y = 1.05;
        pillarGroup.add(base, shaft, cap);
        pillarGroup.position.set(tile.x, topY, tile.z);
        group.add(pillarGroup);
      }
    });

    // Instanced perimeter trees/monoliths outside playable bounds for atmospheric framing
    const borderRocksGeo = new THREE.DodecahedronGeometry(0.65, 0);
    const borderRocksMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88 });
    const rockCount = 16;
    const rocks = new THREE.InstancedMesh(borderRocksGeo, borderRocksMat, rockCount);
    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2;
      const radX = grid.width * 0.68 + (i % 3) * 0.6;
      const radZ = grid.height * 0.68 + ((i + 1) % 3) * 0.6;
      _dummy.position.set(
        (grid.width - 1) / 2 + Math.cos(angle) * radX,
        0.15,
        (grid.height - 1) / 2 + Math.sin(angle) * radZ
      );
      _dummy.scale.setScalar(0.85 + (i % 4) * 0.15);
      _dummy.rotation.set(0, angle, 0);
      _dummy.updateMatrix();
      rocks.setMatrixAt(i, _dummy.matrix);
    }
    rocks.computeBoundingSphere();
    this.scene.add(rocks);
    this.environmentProps.push(rocks);

    this.scene.add(group);
    this.tileGroups.push(group);

    // Highlight InstancedMeshes (created once per grid)
    const hlGeo = new THREE.PlaneGeometry(0.86, 0.86);
    hlGeo.rotateX(-Math.PI / 2);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    this.highlightInstanced = new THREE.InstancedMesh(hlGeo, hlMat, grid.width * grid.height);
    this.highlightInstanced.count = 0;
    this.highlightInstanced.frustumCulled = false;
    this.scene.add(this.highlightInstanced);

    const pathGeo = new THREE.CircleGeometry(0.18, 12);
    pathGeo.rotateX(-Math.PI / 2);
    const pathMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.pathInstanced = new THREE.InstancedMesh(pathGeo, pathMat, 32);
    this.pathInstanced.count = 0;
    this.pathInstanced.frustumCulled = false;
    this.scene.add(this.pathInstanced);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public syncEntities(entities: EntityData[]) {
    const seen = new Set<string>();

    for (const entity of entities) {
      if (!entity.isAlive) continue;
      seen.add(entity.id);

      const topY = (entity.y + 1) * ELEVATION_STEP;
      const existing = this.entityVisuals.get(entity.id);

      if (!existing) {
        const group = createEntityGroup(entity);
        const actorBody = group.getObjectByName('actorBody') as THREE.Group;
        group.position.set(entity.x, topY, entity.z);
        this.scene.add(group);
        this.entityVisuals.set(entity.id, {
          group,
          actorBody,
          targetPos: new THREE.Vector3(entity.x, topY, entity.z),
          targetYaw: directionToYaw(entity.facing),
          flashTimer: 0,
          attackPunch: 0,
          walkPhase: 0,
          isDying: false,
          deathTimer: 0
        });
      } else {
        existing.targetPos.set(entity.x, topY, entity.z);
        existing.targetYaw = directionToYaw(entity.facing);
      }
    }

    // Trigger KO topple for newly defeated entities
    for (const [id, vis] of this.entityVisuals.entries()) {
      if (!seen.has(id) && !vis.isDying) {
        vis.isDying = true;
        vis.deathTimer = 0.45;
      }
    }
  }

  public triggerHitEffect(entityId: string, wx: number, y: number, wz: number, colorHex: number, heavy: boolean = false) {
    const vis = this.entityVisuals.get(entityId);
    if (vis) {
      vis.flashTimer = 0.14;
      vis.attackPunch = 0.25;
    }
    if (heavy) {
      this.addTrauma(0.38);
    }
    this.spawnBurst(wx, (y + 1) * ELEVATION_STEP + 0.55, wz, colorHex, heavy ? 20 : 10);
  }

  public triggerAttackLunge(attackerId: string) {
    const vis = this.entityVisuals.get(attackerId);
    if (vis) {
      vis.attackPunch = 0.35;
    }
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number, count: number) {
    let spawned = 0;
    for (let i = 0; i < this.MAX_PARTICLES && spawned < count; i++) {
      const slot = this.particlePool[i];
      if (!slot.active) {
        slot.active = true;
        slot.maxLife = 0.45 + Math.random() * 0.25;
        slot.life = slot.maxLife;
        slot.pos.set(x, y, z);
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.4 + Math.random() * 2.2;
        slot.vel.set(Math.cos(angle) * speed, 1.8 + Math.random() * 2.2, Math.sin(angle) * speed);
        slot.color.setHex(colorHex);
        slot.scale = 0.8 + Math.random() * 0.7;
        spawned++;
      }
    }
  }

  public showHighlights(tiles: { x: number; z: number; y: number; color?: number }[], defaultColor: number = 0x3b82f6) {
    if (!this.highlightInstanced) return;
    const count = Math.min(tiles.length, this.highlightInstanced.instanceMatrix.count);
    this.highlightInstanced.count = count;

    for (let i = 0; i < count; i++) {
      const t = tiles[i];
      const topY = (t.y + 1) * ELEVATION_STEP + 0.025;
      _mat4.makeTranslation(t.x, topY, t.z);
      this.highlightInstanced.setMatrixAt(i, _mat4);
      this.highlightInstanced.setColorAt(i, new THREE.Color(t.color ?? defaultColor));
    }
    this.highlightInstanced.instanceMatrix.needsUpdate = true;
    if (this.highlightInstanced.instanceColor) this.highlightInstanced.instanceColor.needsUpdate = true;
  }

  public showPathPreview(path: { x: number; z: number }[], grid: GridSystem) {
    if (!this.pathInstanced) return;
    const count = Math.min(path.length, 32);
    this.pathInstanced.count = count;

    for (let i = 0; i < count; i++) {
      const node = path[i];
      const tile = grid.getTile(node.x, node.z);
      const topY = ((tile?.y ?? 0) + 1) * ELEVATION_STEP + 0.04;
      _mat4.makeTranslation(node.x, topY, node.z);
      this.pathInstanced.setMatrixAt(i, _mat4);
    }
    this.pathInstanced.instanceMatrix.needsUpdate = true;
  }

  public clearPathPreview() {
    if (this.pathInstanced) {
      this.pathInstanced.count = 0;
    }
  }

  public clearHighlights() {
    if (this.highlightInstanced) {
      this.highlightInstanced.count = 0;
    }
    this.clearPathPreview();
  }

  public setCursor(x: number, z: number, y: number) {
    const topY = (y + 1) * ELEVATION_STEP + 0.035;
    this.cursorGroup.position.set(x, topY, z);
  }

  public setActiveUnitBeacon(x: number, z: number, y: number, visible: boolean) {
    this.activeUnitRing.visible = visible;
    if (visible) {
      this.activeUnitRing.position.set(x, (y + 1) * ELEVATION_STEP + 0.03, z);
    }
  }

  public projectWorldToScreen(x: number, y: number, z: number): { sx: number; sy: number; visible: boolean } {
    _vec3A.set(x, (y + 1) * ELEVATION_STEP + 1.15, z);
    _vec3A.project(this.camera);
    const visible = _vec3A.z >= -1 && _vec3A.z <= 1;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return {
      sx: ((_vec3A.x + 1) / 2) * w,
      sy: (-(_vec3A.y - 1) / 2) * h,
      visible
    };
  }

  public resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    this.camera.left = -this.cameraZoom * aspect;
    this.camera.right = this.cameraZoom * aspect;
    this.camera.top = this.cameraZoom;
    this.camera.bottom = -this.cameraZoom;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private updateCameraTransform(dt: number) {
    const dampFactor = 1 - Math.exp(-8 * dt);
    this.cameraTarget.lerp(this.desiredTarget, dampFactor);
    this.cameraAngle = THREE.MathUtils.lerp(this.cameraAngle, this.desiredAngle, dampFactor);

    const prevZoom = this.cameraZoom;
    this.cameraZoom = THREE.MathUtils.lerp(this.cameraZoom, this.desiredZoom, dampFactor);
    if (Math.abs(this.cameraZoom - prevZoom) > 0.001) {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      const aspect = w / h;
      this.camera.left = -this.cameraZoom * aspect;
      this.camera.right = this.cameraZoom * aspect;
      this.camera.top = this.cameraZoom;
      this.camera.bottom = -this.cameraZoom;
      this.camera.updateProjectionMatrix();
    }

    const dist = 26;
    const horiz = Math.cos(this.cameraPitch) * dist;
    const height = Math.sin(this.cameraPitch) * dist;

    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0.001) {
      const mag = this.trauma * this.trauma * 0.4;
      shakeX = (Math.random() * 2 - 1) * mag;
      shakeY = (Math.random() * 2 - 1) * mag;
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }

    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.cameraAngle) * horiz + shakeX,
      this.cameraTarget.y + height + shakeY,
      this.cameraTarget.z + Math.cos(this.cameraAngle) * horiz
    );
    this.camera.lookAt(this.cameraTarget);
  }

  private updateEntitiesAndParticles(dt: number, elapsed: number) {
    const moveFactor = 1 - Math.exp(-12 * dt);

    for (const [id, vis] of this.entityVisuals.entries()) {
      if (vis.isDying) {
        vis.deathTimer -= dt;
        const progress = 1 - Math.max(0, vis.deathTimer / 0.45);
        vis.group.rotation.z = progress * (Math.PI / 2);
        vis.group.scale.setScalar(Math.max(0.01, 1 - progress * 0.6));
        if (vis.deathTimer <= 0) {
          this.scene.remove(vis.group);
          this.entityVisuals.delete(id);
        }
        continue;
      }

      const dist = vis.group.position.distanceTo(vis.targetPos);
      vis.group.position.lerp(vis.targetPos, moveFactor);

      // Gait hop proportional to movement speed
      if (dist > 0.04) {
        vis.walkPhase += dt * 16;
        vis.actorBody.position.y = Math.abs(Math.sin(vis.walkPhase)) * 0.14;
      } else {
        // Subtle idle breathe
        vis.actorBody.position.y = Math.sin(elapsed * 2.5 + vis.targetPos.x) * 0.025;
      }

      // Shortest-angle yaw lerp
      let diff = vis.targetYaw - vis.actorBody.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      vis.actorBody.rotation.y += diff * moveFactor;

      // Attack lunge punch
      if (vis.attackPunch > 0) {
        vis.attackPunch = Math.max(0, vis.attackPunch - dt * 2.0);
        vis.actorBody.position.z = Math.sin(vis.attackPunch * Math.PI * 2) * 0.22;
      } else {
        vis.actorBody.position.z = 0;
      }

      // Hit flash feedback
      if (vis.flashTimer > 0) {
        vis.flashTimer = Math.max(0, vis.flashTimer - dt);
        const flashOn = vis.flashTimer > 0;
        vis.actorBody.traverse(obj => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.emissiveIntensity = flashOn ? 1.5 : 0;
            if (flashOn) mesh.material.emissive.setHex(0xffffff);
            else mesh.material.emissive.setHex(0x000000);
          }
        });
      }
    }

    // Update pooled particles
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
        slot.vel.y -= 6.5 * dt;
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

    // Subtle cursor float pulse
    this.cursorGroup.scale.setScalar(1 + Math.sin(elapsed * 4.2) * 0.045);
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

      this.updateCameraTransform(dt);
      this.updateEntitiesAndParticles(dt, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
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

    this.stoneTex.dispose();
    this.grassTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
