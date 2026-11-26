import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GridSystem } from '../world/GridSystem';
import { BattleBiome, EntityData } from '../types/game';
import { createEntityGroup, directionToYaw } from './EntityMeshFactory';
import {
  BRAWL_PALETTE,
  QUALITY_PRESETS,
  QualityPreset,
  attachWebGLContextGuards,
  probeClientDeviceTier,
  setOutlinesVisible
} from './BrawlStyleSystem';
import {
  BATTLE_ELEVATION_STEP,
  buildBattleDiorama,
  getBiomePalette,
  resolveBattleBiome
} from './BattleDioramaBuilder';
import { BattleVfxSystem, SkillCastVfxParams } from './BattleVfxSystem';
import { CustomRigController, createRiggedModelInstance } from './CustomModelRig';

const _vec3A = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _tmpColor = new THREE.Color();

interface UnitVisualState {
  group: THREE.Group;
  actorBody: THREE.Group;
  statusHalo: THREE.Mesh;
  statusHaloMat: THREE.MeshBasicMaterial;
  targetPos: THREE.Vector3;
  targetYaw: number;
  flashTimer: number;
  attackPunch: number;
  walkPhase: number;
  isDying: boolean;
  deathTimer: number;
  customRig?: CustomRigController;
}

export class SceneManager {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.OrthographicCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;

  private dioramaGroup: THREE.Group | null = null;
  private tilePickMeshes: THREE.Mesh[] = [];
  private dioramaTextures: THREE.Texture[] = [];
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private hazardMat: THREE.MeshStandardMaterial | null = null;
  private animatedProps: THREE.Object3D[] = [];
  private vfxSystem: BattleVfxSystem | null = null;
  private envTexture: THREE.Texture | null = null;

  private entityVisuals: Map<string, UnitVisualState> = new Map();

  private highlightInstanced: THREE.InstancedMesh | null = null;
  private pathInstanced: THREE.InstancedMesh | null = null;
  private cursorGroup: THREE.Group;
  private activeUnitRing: THREE.Mesh;

  // Lighting refs for biome tinting
  private hemiLight: THREE.HemisphereLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;

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
  private qualityPreset: QualityPreset;
  private detachContextGuards: (() => void) | null = null;
  private hitstopTimer = 0;
  private currentBiome: BattleBiome = 'lowlands';

  constructor(container: HTMLElement, initialPreset?: QualityPreset) {
    this.container = container;
    this.isSoftwareGl = this.detectSoftwareGl();
    this.qualityPreset = initialPreset ?? QUALITY_PRESETS[probeClientDeviceTier(this.isSoftwareGl)];

    const pal = BRAWL_PALETTE.battle;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(pal.backgroundHex);
    this.scene.fog = new THREE.FogExp2(pal.backgroundHex, pal.fogDensity);

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
      antialias: this.qualityPreset.antialias && !this.isSoftwareGl,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
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

    // Zero-dependency Studio Environment Map for crisp highlights on armor, gold & crystals
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const roomEnv = new RoomEnvironment();
      this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
      this.scene.environment = this.envTexture;
      roomEnv.dispose();
      pmrem.dispose();
    } catch {
      // Fallback gracefully if PMREM fails on restricted WebGL context
    }

    this.setupLighting();

    // Cursor indicator (dual tactical diamond frame)
    this.cursorGroup = this.createCursorIndicator();
    this.scene.add(this.cursorGroup);

    // Active unit glowing ground beacon
    const activeRingGeo = new THREE.RingGeometry(0.41, 0.5, 24);
    const activeRingMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.activeUnitRing = new THREE.Mesh(activeRingGeo, activeRingMat);
    this.activeUnitRing.rotation.x = -Math.PI / 2;
    this.activeUnitRing.visible = false;
    this.scene.add(this.activeUnitRing);

    this.initListeners();
    this.applyCameraFrustum(width, height);
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

  private setupLighting() {
    const pal = BRAWL_PALETTE.battle;
    const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiIntensity);
    this.hemiLight = hemi;
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(pal.sunColor, pal.sunIntensity);
    keyLight.position.set(16, 24, 14);
    keyLight.castShadow = this.qualityPreset.shadowsEnabled && !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.sunLight = keyLight;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(pal.rimColor, pal.rimIntensity);
    rimLight.position.set(-14, 12, -16);
    this.rimLight = rimLight;
    this.scene.add(rimLight);
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
    const maxAniso = this.isSoftwareGl
      ? 1
      : Math.min(preset.anisotropyCap, this.renderer.capabilities.getMaxAnisotropy());
    this.dioramaTextures.forEach(tex => {
      tex.anisotropy = maxAniso;
    });
    this.vfxSystem?.setQualityScale(preset.particleScale);
    setOutlinesVisible(this.scene, preset.outlinesEnabled);
  }

  private createCursorIndicator(): THREE.Group {
    const group = new THREE.Group();
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.49, 4), borderMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.rotation.z = Math.PI / 4;

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.3, 4), innerMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.rotation.z = Math.PI / 4;
    innerRing.position.y = 0.005;

    group.add(outerRing, innerRing);
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

      if (dist < 6 && e.target === dom && e.button === 0) {
        const hit = this.raycastTile(e.clientX, e.clientY);
        if (hit && this.onTileClick) {
          this.onTileClick(hit.x, hit.z);
        }
      }
    });

    this.addBoundListener(dom, 'contextmenu', (e: Event) => e.preventDefault());

    this.addBoundListener(dom, 'wheel', (ev: Event) => {
      const e = ev as WheelEvent;
      e.preventDefault();
      this.adjustZoom(e.deltaY * 0.006);
    });
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
    this.desiredTarget.set(x, y * BATTLE_ELEVATION_STEP + 0.4, z);
  }

  public resetCamera() {
    this.desiredAngle = Math.PI / 4;
    this.desiredZoom = 8.5;
    this.desiredTarget.set((this.gridWidth - 1) / 2, 0.4, (this.gridHeight - 1) / 2);
  }

  public addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public buildGridScene(grid: GridSystem, elevationSeed: number = 1) {
    // Cleanup previous diorama & VFX
    if (this.dioramaGroup) {
      this.scene.remove(this.dioramaGroup);
      this.dioramaGroup = null;
    }
    this.dioramaTextures.forEach(t => t.dispose());
    this.dioramaTextures = [];
    this.tilePickMeshes = [];
    this.animatedProps = [];
    this.waterMat = null;
    this.hazardMat = null;

    if (this.highlightInstanced) {
      this.scene.remove(this.highlightInstanced);
      this.highlightInstanced = null;
    }
    if (this.pathInstanced) {
      this.scene.remove(this.pathInstanced);
      this.pathInstanced = null;
    }
    if (this.vfxSystem) {
      this.scene.remove(this.vfxSystem.group);
      this.vfxSystem.dispose();
      this.vfxSystem = null;
    }

    this.gridWidth = grid.width;
    this.gridHeight = grid.height;
    this.desiredTarget.set((grid.width - 1) / 2, 0.4, (grid.height - 1) / 2);
    this.cameraTarget.copy(this.desiredTarget);

    this.currentBiome = resolveBattleBiome(elevationSeed);
    const biomePal = getBiomePalette(this.currentBiome);

    // Sync scene atmosphere & lighting to biome
    this.scene.background = new THREE.Color(biomePal.bgHex);
    this.scene.fog = new THREE.FogExp2(biomePal.bgHex, biomePal.fogDensity);
    if (this.hemiLight) {
      this.hemiLight.color.setHex(biomePal.hemiSky);
      this.hemiLight.groundColor.setHex(biomePal.hemiGround);
      this.hemiLight.intensity = biomePal.hemiIntensity;
    }
    if (this.sunLight) {
      this.sunLight.color.setHex(biomePal.sunColor);
      this.sunLight.intensity = biomePal.sunIntensity;
    }
    if (this.rimLight) {
      this.rimLight.color.setHex(biomePal.rimColor);
    }

    const maxAniso = this.isSoftwareGl
      ? 1
      : Math.min(this.qualityPreset.anisotropyCap, this.renderer.capabilities.getMaxAnisotropy());

    const diorama = buildBattleDiorama(grid, this.currentBiome, this.qualityPreset, this.isSoftwareGl, maxAniso);
    this.dioramaGroup = diorama.group;
    this.tilePickMeshes = diorama.pickMeshes;
    this.waterMat = diorama.waterMat;
    this.hazardMat = diorama.hazardMat;
    this.animatedProps = diorama.animatedProps;
    this.dioramaTextures = diorama.disposableTextures;
    this.scene.add(this.dioramaGroup);

    // Build BattleVfxSystem
    this.vfxSystem = new BattleVfxSystem(grid.width, grid.height, this.currentBiome, this.qualityPreset.particleScale);
    this.scene.add(this.vfxSystem.group);

    // Tactical tile highlight frames (crisp outer border + translucent fill look)
    const hlGeo = new THREE.PlaneGeometry(0.88, 0.88);
    hlGeo.rotateX(-Math.PI / 2);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.44,
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

    const pathGeo = new THREE.RingGeometry(0.11, 0.21, 4);
    pathGeo.rotateX(-Math.PI / 2);
    const pathMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
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

      const topY = (entity.y + 1) * BATTLE_ELEVATION_STEP;
      const existing = this.entityVisuals.get(entity.id);

      // Determine status aura ring color
      let auraHex: number | null = null;
      const st = entity.statusEffects.find(s => s.duration > 0);
      if (st) {
        if (st.type === 'haste') auraHex = 0x38bdf8;
        else if (st.type === 'burn') auraHex = 0xf97316;
        else if (st.type === 'poison' || st.type === 'acid') auraHex = 0x84cc16;
        else if (st.type === 'fortify' || st.type === 'aether_shield') auraHex = 0xfacc15;
        else if (st.type === 'slow' || st.type === 'snare') auraHex = 0xa855f7;
        else auraHex = 0x93c5fd;
      }

      if (!existing) {
        const group = createEntityGroup(entity, this.qualityPreset.outlinesEnabled);
        const actorBody = group.getObjectByName('actorBody') as THREE.Group;

        const haloGeo = new THREE.RingGeometry(0.45, 0.52, 20);
        haloGeo.rotateX(-Math.PI / 2);
        const statusHaloMat = new THREE.MeshBasicMaterial({
          color: auraHex ?? 0x38bdf8,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const statusHalo = new THREE.Mesh(haloGeo, statusHaloMat);
        statusHalo.position.y = 0.032;
        statusHalo.visible = auraHex !== null;
        group.add(statusHalo);

        group.position.set(entity.x, topY, entity.z);
        this.scene.add(group);
        const visState: UnitVisualState = {
          group,
          actorBody,
          statusHalo,
          statusHaloMat,
          targetPos: new THREE.Vector3(entity.x, topY, entity.z),
          targetYaw: directionToYaw(entity.facing),
          flashTimer: 0,
          attackPunch: 0,
          walkPhase: 0,
          isDying: false,
          deathTimer: 0
        };
        this.entityVisuals.set(entity.id, visState);

        // Squad leader hero (Valerius / hero_1) utilizes the custom rigged model01
        if (entity.id === 'hero_1' || entity.name === 'Valerius') {
          createRiggedModelInstance(entity.faction === 'player', this.qualityPreset.outlinesEnabled)
            .then(rig => {
              if (this.entityVisuals.get(entity.id) === visState && !visState.isDying) {
                // Hide procedural body meshes while keeping contact shadow and ring
                actorBody.traverse(obj => {
                  if (obj !== actorBody && (obj as THREE.Mesh).isMesh) {
                    const m = obj as THREE.Mesh;
                    if (
                      m.geometry?.type !== 'RingGeometry' &&
                      m.geometry?.type !== 'ConeGeometry' &&
                      m.geometry?.type !== 'CircleGeometry'
                    ) {
                      m.visible = false;
                    }
                  }
                });
                actorBody.add(rig.group);
                visState.customRig = rig;
              } else {
                rig.dispose();
              }
            })
            .catch(err => {
              console.warn('Could not load custom rig for unit, fallback to procedural mesh', err);
            });
        }
      } else {
        existing.targetPos.set(entity.x, topY, entity.z);
        existing.targetYaw = directionToYaw(entity.facing);
        if (auraHex !== null) {
          existing.statusHaloMat.color.setHex(auraHex);
          existing.statusHalo.visible = true;
        } else {
          existing.statusHalo.visible = false;
        }
      }
    }

    for (const [id, vis] of this.entityVisuals.entries()) {
      if (!seen.has(id) && !vis.isDying) {
        vis.isDying = true;
        vis.deathTimer = 0.45;
      }
    }
  }

  public triggerSkillCast(params: SkillCastVfxParams) {
    this.vfxSystem?.triggerSkillCast(params);
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
    this.vfxSystem?.spawnChainArc(fromX, fromY, fromZ, toX, toY, toZ, colorHex);
  }

  public triggerHitEffect(entityId: string, wx: number, y: number, wz: number, colorHex: number, heavy: boolean = false) {
    const vis = this.entityVisuals.get(entityId);
    if (vis) {
      vis.flashTimer = 0.14;
      vis.attackPunch = 0.25;
      if (vis.customRig) {
        vis.customRig.playHit();
      }
    }
    if (heavy) {
      this.hitstopTimer = 0.045;
      this.addTrauma(0.38);
    }
    const baseCount = heavy ? 18 : 9;
    const scaledCount = Math.max(4, Math.round(baseCount * this.qualityPreset.particleScale));
    this.spawnBurst(wx, (y + 1) * BATTLE_ELEVATION_STEP + 0.55, wz, colorHex, scaledCount);
  }

  public triggerAttackLunge(attackerId: string) {
    const vis = this.entityVisuals.get(attackerId);
    if (vis) {
      vis.attackPunch = 0.35;
      if (vis.customRig) {
        vis.customRig.playAttack();
      }
    }
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number, count: number) {
    this.vfxSystem?.spawnBurst(x, y, z, colorHex, count);
  }

  public showHighlights(tiles: { x: number; z: number; y: number; color?: number }[], defaultColor: number = 0x3b82f6) {
    if (!this.highlightInstanced) return;
    const count = Math.min(tiles.length, this.highlightInstanced.instanceMatrix.count);
    this.highlightInstanced.count = count;

    for (let i = 0; i < count; i++) {
      const t = tiles[i];
      const topY = (t.y + 1) * BATTLE_ELEVATION_STEP + 0.025;
      _mat4.makeTranslation(t.x, topY, t.z);
      this.highlightInstanced.setMatrixAt(i, _mat4);
      this.highlightInstanced.setColorAt(i, _tmpColor.setHex(t.color ?? defaultColor));
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
      const topY = ((tile?.y ?? 0) + 1) * BATTLE_ELEVATION_STEP + 0.042;
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
    const topY = (y + 1) * BATTLE_ELEVATION_STEP + 0.036;
    this.cursorGroup.position.set(x, topY, z);
  }

  public setActiveUnitBeacon(x: number, z: number, y: number, visible: boolean) {
    this.activeUnitRing.visible = visible;
    if (visible) {
      this.activeUnitRing.position.set(x, (y + 1) * BATTLE_ELEVATION_STEP + 0.032, z);
    }
  }

  public projectWorldToScreen(x: number, y: number, z: number): { sx: number; sy: number; visible: boolean } {
    _vec3A.set(x, (y + 1) * BATTLE_ELEVATION_STEP + 1.15, z);
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

  private applyCameraFrustum(width: number, height: number) {
    const aspect = width / height;
    const effectiveZoom = aspect < 0.85
      ? this.cameraZoom * (0.85 / Math.max(0.45, aspect)) * 0.92
      : this.cameraZoom;
    this.camera.left = -effectiveZoom * aspect;
    this.camera.right = effectiveZoom * aspect;
    this.camera.top = effectiveZoom;
    this.camera.bottom = -effectiveZoom;
    this.camera.updateProjectionMatrix();
  }

  public resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.applyCameraFrustum(width, height);
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
      this.applyCameraFrustum(w, h);
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
          vis.customRig?.dispose();
          this.scene.remove(vis.group);
          this.entityVisuals.delete(id);
        }
        continue;
      }

      const dist = vis.group.position.distanceTo(vis.targetPos);
      vis.group.position.lerp(vis.targetPos, moveFactor);

      if (dist > 0.04) {
        vis.walkPhase += dt * 16;
        vis.actorBody.position.y = Math.abs(Math.sin(vis.walkPhase)) * 0.14;
        if (vis.customRig && vis.customRig.currentActionName !== 'attack') {
          vis.customRig.playWalk();
        }
      } else {
        vis.actorBody.position.y = Math.sin(elapsed * 2.5 + vis.targetPos.x) * 0.025;
        if (
          vis.customRig &&
          vis.customRig.currentActionName !== 'attack' &&
          vis.customRig.currentActionName !== 'hit'
        ) {
          vis.customRig.playIdle();
        }
      }

      let diff = vis.targetYaw - vis.actorBody.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      vis.actorBody.rotation.y += diff * moveFactor;

      if (vis.attackPunch > 0) {
        vis.attackPunch = Math.max(0, vis.attackPunch - dt * 2.0);
        vis.actorBody.position.z = Math.sin(vis.attackPunch * Math.PI * 2) * 0.22;
      } else {
        vis.actorBody.position.z = 0;
      }

      if (vis.customRig) {
        vis.customRig.update(dt);
      }

      if (vis.statusHalo.visible) {
        vis.statusHalo.scale.setScalar(1 + Math.sin(elapsed * 4.0) * 0.06);
      }

      if (vis.flashTimer > 0) {
        vis.flashTimer = Math.max(0, vis.flashTimer - dt);
        const flashOn = vis.flashTimer > 0;
        vis.actorBody.traverse(obj => {
          if (obj.userData?.isOutline) return;
          const mesh = obj as THREE.Mesh;
          if (
            mesh.isMesh &&
            (mesh.material instanceof THREE.MeshToonMaterial ||
              mesh.material instanceof THREE.MeshStandardMaterial)
          ) {
            mesh.material.emissiveIntensity = flashOn ? 1.4 : 0;
            if (flashOn) mesh.material.emissive.setHex(0xffffff);
            else mesh.material.emissive.setHex(0x000000);
          }
        });
      }
    }

    // Animate water river ripple & magma hazard glow & floating obstacle gems
    if (this.waterMat?.map) {
      this.waterMat.map.offset.x = (elapsed * 0.12) % 1;
      this.waterMat.map.offset.y = (elapsed * 0.07) % 1;
    }
    if (this.hazardMat) {
      this.hazardMat.emissiveIntensity = 0.65 + Math.sin(elapsed * 3.2) * 0.22;
    }
    for (let i = 0; i < this.animatedProps.length; i++) {
      const prop = this.animatedProps[i];
      const topChild = prop.children[prop.children.length - 1];
      if (topChild) {
        topChild.rotation.y = elapsed * 1.2 + i;
      }
    }

    this.vfxSystem?.step(dt, elapsed);

    this.cursorGroup.scale.setScalar(1 + Math.sin(elapsed * 4.2) * 0.045);
    if (this.activeUnitRing.visible) {
      this.activeUnitRing.scale.setScalar(1 + Math.sin(elapsed * 3.6) * 0.05);
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

      this.updateCameraTransform(dt);
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.updateEntitiesAndParticles(dt, elapsed);
      }
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
    this.detachContextGuards?.();
    this.detachContextGuards = null;

    for (const l of this.boundListeners) {
      l.target.removeEventListener(l.type, l.fn);
    }
    this.boundListeners = [];

    this.vfxSystem?.dispose();
    this.vfxSystem = null;

    for (const vis of this.entityVisuals.values()) {
      vis.customRig?.dispose();
    }
    this.entityVisuals.clear();

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

    this.dioramaTextures.forEach(t => t.dispose());
    this.dioramaTextures = [];
    this.envTexture?.dispose();
    this.envTexture = null;
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
