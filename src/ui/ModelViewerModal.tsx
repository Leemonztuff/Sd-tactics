import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createRiggedModelInstance,
  importRiggedModelFromBuffer,
  loadTextureFromBuffer,
  detectModelFormat,
  setCustomHeroModelOverride,
  setCustomHeroTextureOverride,
  setCustomHeroConfigOverride,
  CompanionModelFile,
  CustomRigController,
  CustomMaterialMode,
  CustomRigMetadata,
  CustomModelConfig,
  HumanoidLandmarkName,
  RigLandmarkPosition,
  SkinWeightPaintMode,
  DEFAULT_CUSTOM_MODEL_CONFIG,
  normalizeCustomModelConfig
} from '../rendering/CustomModelRig';
import {
  MODEL_ASSIGNMENT_SLOTS,
  SavedCustomModelEntry,
  assignCustomModelToSlot,
  buildExportConfigPayload,
  deleteCustomModelEntry,
  getModelAssignments,
  getSlotsForModel,
  initCustomModelLibrary,
  listSavedCustomModels,
  parseImportedConfigJson,
  saveCustomModelEntry
} from '../rendering/CustomModelLibrary';
import {
  Play,
  Swords,
  Footprints,
  Flame,
  Bone,
  Palette,
  RotateCcw,
  Gauge,
  X,
  Crosshair,
  Shield,
  Upload,
  Film,
  Image as ImageIcon,
  SlidersHorizontal,
  Save,
  Download,
  FileJson,
  Trash2,
  Check
} from 'lucide-react';
import { game } from '../game/Game';
import { soundManager } from '../utils/SoundManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnterBattle?: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

const PROPORTION_LABELS: Record<string, string> = {
  chibi: 'Chibi (1:2)',
  balanced: 'Estándar (1:4)',
  tall_humanoid: 'Estilizado / Anime (1:6)'
};

const POSE_LABELS: Record<string, string> = {
  't-pose': 'T-Pose',
  'a-pose': 'A-Pose',
  relaxed: 'Relajada'
};

const RIG_LANDMARK_OPTIONS: Array<{ id: HumanoidLandmarkName; label: string }> = [
  { id: 'pelvis', label: 'Pelvis · centro' },
  { id: 'chest', label: 'Tórax · centro' },
  { id: 'neck', label: 'Cuello · centro' },
  { id: 'leftShoulder', label: 'Hombro izquierdo' },
  { id: 'leftElbow', label: 'Codo izquierdo' },
  { id: 'leftWrist', label: 'Muñeca izquierda' },
  { id: 'leftHip', label: 'Cadera izquierda' },
  { id: 'leftKnee', label: 'Rodilla izquierda' },
  { id: 'leftAnkle', label: 'Tobillo izquierdo' }
];

export const ModelViewerModal: React.FC<Props> = ({ isOpen, onClose, onEnterBattle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const resetCameraFnRef = useRef<(() => void) | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const landmarkPickingRef = useRef(false);
  const weightPaintingRef = useRef(false);
  const selectedLandmarkRef = useRef<HumanoidLandmarkName>('pelvis');
  const onLandmarkPlacedRef = useRef<(point: RigLandmarkPosition) => void>(() => {});
  const onWeightPaintAtRef = useRef<(point: THREE.Vector3) => number>(() => 0);
  const onWeightStrokeStartRef = useRef<() => void>(() => {});
  const onWeightStrokeEndRef = useRef<() => void>(() => {});
  const weightBrushCursorRef = useRef<THREE.Mesh | null>(null);
  const updateLandmarkMarkersRef = useRef<
    (landmarks: CustomModelConfig['manualLandmarks'], rig: CustomRigController | null) => void
  >(() => {});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [activeAnim, setActiveAnim] = useState<string>('idle');
  const [materialMode, setMaterialMode] = useState<CustomMaterialMode>('toon');
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showWeapons, setShowWeapons] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [metadata, setMetadata] = useState<CustomRigMetadata | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [rigWizardOpen, setRigWizardOpen] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState<HumanoidLandmarkName>('pelvis');
  const [isPlacingLandmark, setIsPlacingLandmark] = useState(false);
  const [showWeightPreview, setShowWeightPreview] = useState(false);
  const [wizardDirty, setWizardDirty] = useState(false);
  const [weightPaintEnabled, setWeightPaintEnabled] = useState(false);
  const [selectedWeightBone, setSelectedWeightBone] = useState('leftArm');
  const [weightPaintMode, setWeightPaintMode] = useState<SkinWeightPaintMode>('paint');
  const [weightBrushRadius, setWeightBrushRadius] = useState(0.075);
  const [weightBrushStrength, setWeightBrushStrength] = useState(0.45);
  const [weightMirrorEnabled, setWeightMirrorEnabled] = useState(true);
  const [canUndoWeights, setCanUndoWeights] = useState(false);
  const [lastPaintedVertexCount, setLastPaintedVertexCount] = useState(0);

  const [importedBuffer, setImportedBuffer] = useState<{
    buffer: ArrayBuffer;
    name: string;
    companions: CompanionModelFile[];
  } | null>(null);
  const [overrideTextureBuf, setOverrideTextureBuf] = useState<ArrayBuffer | null>(null);
  const [hasOverrideTexture, setHasOverrideTexture] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Studio calibration & library assignment state
  const [config, setConfig] = useState<CustomModelConfig>({ ...DEFAULT_CUSTOM_MODEL_CONFIG });
  const [modelTitle, setModelTitle] = useState('Valerius Custom');
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>('hero:hero_1');
  const [savedModels, setSavedModels] = useState<SavedCustomModelEntry[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const rigRef = useRef<CustomRigController | null>(null);
  const stateRefs = useRef({
    playbackSpeed,
    showSkeleton,
    showWeightPreview,
    weightPaintEnabled,
    weightBrushRadius
  });
  stateRefs.current = {
    playbackSpeed,
    showSkeleton,
    showWeightPreview,
    weightPaintEnabled,
    weightBrushRadius
  };
  selectedLandmarkRef.current = selectedLandmark;
  landmarkPickingRef.current = isPlacingLandmark;

  const showToast = (msg: string) => {
    setStatusNote(msg);
    window.setTimeout(() => {
      setStatusNote(prev => (prev === msg ? null : prev));
    }, 3200);
  };

  onWeightPaintAtRef.current = point => {
    const rig = rigRef.current;
    if (!rig) return 0;
    const boneNames = rig.skinnedMesh?.skeleton.bones.map(bone => bone.name) ?? [];
    const boneName = boneNames.includes(selectedWeightBone)
      ? selectedWeightBone
      : boneNames.find(name => /arm/i.test(name)) ?? boneNames[0];
    if (!boneName) return 0;
    const edited = rig.paintWeightsAt(
      point,
      boneName,
      weightBrushRadius,
      weightBrushStrength,
      weightPaintMode,
      weightMirrorEnabled
    );
    if (edited > 0) renderOnceRef.current?.();
    return edited;
  };
  onWeightStrokeStartRef.current = () => rigRef.current?.beginWeightPaintStroke();
  onWeightStrokeEndRef.current = () => {
    const rig = rigRef.current;
    if (!rig) return;
    const changed = rig.endWeightPaintStroke();
    if (changed > 0) {
      const nextConfig = normalizeCustomModelConfig(rig.metadata.appliedConfig);
      setConfig(nextConfig);
      if (importedBuffer) setCustomHeroConfigOverride(nextConfig);
      setCanUndoWeights(rig.canUndoWeightPaint);
      setLastPaintedVertexCount(changed);
      showToast(`${changed} vértices ajustados; listos para guardar o exportar`);
      renderOnceRef.current?.();
    }
  };

  const refreshLibraryState = async () => {
    await initCustomModelLibrary();
    setSavedModels(listSavedCustomModels());
    setAssignments(getModelAssignments());
  };

  onLandmarkPlacedRef.current = point => {
    const rig = rigRef.current;
    if (!rig) return;

    const landmark = selectedLandmarkRef.current;
    const nextConfig = normalizeCustomModelConfig({
      ...config,
      manualLandmarks: {
        ...config.manualLandmarks,
        [landmark]: point
      }
    });
    setConfig(nextConfig);
    setWizardDirty(true);
    updateLandmarkMarkersRef.current(nextConfig.manualLandmarks, rig);
    renderOnceRef.current?.();
  };

  const mountRigIntoScene = (
    rig: CustomRigController,
    isCustomUpload: boolean,
    explicitConfig?: Partial<CustomModelConfig>,
    preserveCamera = false
  ) => {
    const scene = sceneRef.current;
    if (!scene) {
      rig.dispose();
      return;
    }

    if (rigRef.current) {
      scene.remove(rigRef.current.group);
      rigRef.current.dispose();
      rigRef.current = null;
    }

    rigRef.current = rig;
    const canShowOriginalTex = rig.metadata.hasNativeTextures && rig.metadata.hasNativeUvs;
    const initialMode: CustomMaterialMode =
      explicitConfig?.materialMode ??
      (isCustomUpload && canShowOriginalTex ? 'textured' : 'toon');
    const defaultWeapons =
      explicitConfig?.weaponsEnabled ?? rig.metadata.rigSource === 'auto_rig';

    const mergedCfg = normalizeCustomModelConfig({
      ...rig.metadata.appliedConfig,
      ...explicitConfig,
      materialMode: initialMode,
      weaponsEnabled: defaultWeapons,
      playbackSpeed: explicitConfig?.playbackSpeed ?? stateRefs.current.playbackSpeed
    });

    rig.applyDisplayConfig(mergedCfg);
    rig.setSkeletonVisible(stateRefs.current.showSkeleton);
    rig.setWeightPreview(stateRefs.current.showWeightPreview);

    setConfig(mergedCfg);
    setMaterialMode(mergedCfg.materialMode);
    setShowWeapons(mergedCfg.weaponsEnabled);
    setPlaybackSpeed(mergedCfg.playbackSpeed);
    setCanUndoWeights(false);
    setLastPaintedVertexCount(0);
    setActiveAnim('idle');
    setMetadata({ ...rig.metadata });

    scene.add(rig.group);
    updateLandmarkMarkersRef.current(mergedCfg.manualLandmarks, rig);
    if (!preserveCamera) resetCameraFnRef.current?.();
    rig.update(0);
    renderOnceRef.current?.();
  };

  useEffect(() => {
    if (!isOpen) return;
    void refreshLibraryState();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    let disposed = false;
    let frameId = 0;
    const isSoftwareGl = detectSoftwareWebGL();
    const container = containerRef.current;
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;

    // 1. Scene & Studio Environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1320);
    sceneRef.current = scene;
    const weightBrushCursor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffc857,
        transparent: true,
        opacity: 0.6,
        wireframe: true,
        depthWrite: false
      })
    );
    weightBrushCursor.name = 'weight_paint_brush_cursor';
    weightBrushCursor.visible = false;
    weightBrushCursor.renderOrder = 25;
    scene.add(weightBrushCursor);
    weightBrushCursorRef.current = weightBrushCursor;
    const landmarkMarkerGroup = new THREE.Group();
    landmarkMarkerGroup.name = 'rig_calibration_landmarks';
    scene.add(landmarkMarkerGroup);

    updateLandmarkMarkersRef.current = (landmarks, rig) => {
      for (const marker of [...landmarkMarkerGroup.children]) {
        landmarkMarkerGroup.remove(marker);
        const mesh = marker as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      if (!rig) return;

      for (const [name, point] of Object.entries(landmarks)) {
        if (!point) continue;
        const isSelected = name === selectedLandmarkRef.current;
        const points = [{ name, point, isMirror: false }];
        if (name.startsWith('left')) {
          points.push({
            name: `mirror_${name}`,
            point: { ...point, x: -point.x },
            isMirror: true
          });
        }
        for (const markerPoint of points) {
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(isSelected && !markerPoint.isMirror ? 0.018 : 0.013, 12, 8),
            new THREE.MeshBasicMaterial({
              color: isSelected && !markerPoint.isMirror ? 0xffd166 : 0x38bdf8,
              depthTest: false
            })
          );
          marker.name = `landmark_${markerPoint.name}`;
          marker.position.copy(
            rig.modelRoot.localToWorld(
              new THREE.Vector3(markerPoint.point.x, markerPoint.point.y, markerPoint.point.z)
            )
          );
          marker.renderOrder = 20;
          landmarkMarkerGroup.add(marker);
        }
      }
    };

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.08, 60);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Ground disc & gold tactical ring
    const groundGeo = new THREE.CircleGeometry(1.35, 36);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1b2333,
      roughness: 0.85,
      metalness: 0.15
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    scene.add(ground);

    const ringGeo = new THREE.RingGeometry(1.31, 1.35, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd89b32, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);

    // 3-point studio lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.05);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    sunLight.position.set(3, 5, 4);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 16;
    sunLight.shadow.camera.left = -2;
    sunLight.shadow.camera.right = 2;
    sunLight.shadow.camera.top = 2;
    sunLight.shadow.camera.bottom = -2;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.15);
    rimLight.position.set(-3, 2.5, -3);
    scene.add(rimLight);

    // Orbit & Zoom state framed cleanly for 1.0m hero
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const DEFAULT_SPHERICAL = { radius: 2.75, theta: 0.18, phi: Math.PI / 2.22 };
    const spherical = { ...DEFAULT_SPHERICAL };
    const lookTarget = new THREE.Vector3(0, 0.50, 0);

    const updateCameraPos = () => {
      camera.position.x = lookTarget.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = lookTarget.y + spherical.radius * Math.cos(spherical.phi);
      camera.position.z = lookTarget.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(lookTarget);
    };
    updateCameraPos();

    resetCameraFnRef.current = () => {
      spherical.radius = DEFAULT_SPHERICAL.radius;
      spherical.theta = DEFAULT_SPHERICAL.theta;
      spherical.phi = DEFAULT_SPHERICAL.phi;
      updateCameraPos();
    };

    const paintWeightAtPointer = (event: PointerEvent, paint: boolean) => {
      if (lastWeightPaintSample > 0 && event.timeStamp - lastWeightPaintSample < 20) return;
      lastWeightPaintSample = event.timeStamp;
      const rect = domEl.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const rig = rigRef.current;
      if (!rig) return;
      const hit = raycaster.intersectObjects(rig.meshEntries.map(entry => entry.mesh), false)[0];
      if (!hit) {
        weightBrushCursor.visible = false;
        return;
      }
      weightBrushCursor.visible = stateRefs.current.weightPaintEnabled;
      weightBrushCursor.position.copy(hit.point);
      weightBrushCursor.scale.setScalar(stateRefs.current.weightBrushRadius);
      if (paint) onWeightPaintAtRef.current(hit.point);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (landmarkPickingRef.current) return;
      if (stateRefs.current.weightPaintEnabled && e.button === 0) {
        weightPaintingRef.current = true;
        lastWeightPaintSample = 0;
        onWeightStrokeStartRef.current();
        domEl.setPointerCapture(e.pointerId);
        paintWeightAtPointer(e, true);
        e.preventDefault();
        return;
      }
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (weightPaintingRef.current) {
        paintWeightAtPointer(e, true);
        return;
      }
      if (stateRefs.current.weightPaintEnabled) {
        paintWeightAtPointer(e, false);
        return;
      }
      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.04, spherical.phi - dy * 0.008));
      updateCameraPos();
    };

    const onPointerUp = () => {
      if (weightPaintingRef.current) {
        weightPaintingRef.current = false;
        onWeightStrokeEndRef.current();
      }
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(1.2, Math.min(6.0, spherical.radius + e.deltaY * 0.003));
      updateCameraPos();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastWeightPaintSample = 0;
    const onCanvasClick = (event: MouseEvent) => {
      if (!landmarkPickingRef.current) return;
      const rig = rigRef.current;
      if (!rig) return;

      const rect = domEl.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets = rig.meshEntries.map(entry => entry.mesh);
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) {
        showToast('Haz clic sobre la malla visible para colocar la articulación.');
        return;
      }

      event.preventDefault();
      const local = rig.modelRoot.worldToLocal(hit.point.clone());
      const landmark = selectedLandmarkRef.current;
      if (landmark === 'pelvis' || landmark === 'chest' || landmark === 'neck') {
        local.z *= 0.35;
      } else {
        local.x = -Math.max(0.02, Math.abs(local.x) - 0.012);
        local.z *= 0.55;
      }
      onLandmarkPlacedRef.current({ x: local.x, y: local.y, z: local.z });
      landmarkPickingRef.current = false;
      setIsPlacingLandmark(false);
    };

    const domEl = renderer.domElement;
    domEl.style.touchAction = 'none';
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    domEl.addEventListener('click', onCanvasClick);

    // 2. Load Initial Model
    setLoading(true);
    setError(null);

    const loadInitial = importedBuffer
      ? importRiggedModelFromBuffer(importedBuffer.buffer, {
          isPlayer: true,
          outlinesEnabled: true,
          modelName: importedBuffer.name,
          companionFiles: importedBuffer.companions,
          config
        })
      : createRiggedModelInstance(true, true);

    loadInitial
      .then(async rig => {
        if (disposed) {
          rig.dispose();
          return;
        }
        if (overrideTextureBuf && importedBuffer) {
          try {
            const fmt = detectModelFormat(importedBuffer.buffer, importedBuffer.name);
            const tex = await loadTextureFromBuffer(overrideTextureBuf, fmt === 'obj' || fmt === 'fbx');
            rig.applyCustomTexture(tex);
          } catch {
            // ignore
          }
        }
        mountRigIntoScene(rig, Boolean(importedBuffer), importedBuffer ? config : undefined);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error creating rigged model instance:', err);
        if (!disposed) {
          setError('No se pudo cargar el modelo 3D. Verifica que el archivo (.glb, .gltf, .fbx u .obj) sea válido.');
          setLoading(false);
        }
      });

    // 3. Render Loop with Software-WebGL Pacing
    const clock = new THREE.Clock();
    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const animate = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);

      if (rigRef.current) {
        rigRef.current.update(dt);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(animate);
      } else {
        frameId = requestAnimationFrame(animate);
      }
    };

    renderOnceRef.current = () => {
      if (disposed) return;
      renderer.render(scene, camera);
    };

    if (isSoftwareGl) {
      frameId = window.setTimeout(animate, 16);
    } else {
      frameId = requestAnimationFrame(animate);
    }

    // 4. Resize observer
    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);
      domEl.removeEventListener('click', onCanvasClick);
      updateLandmarkMarkersRef.current = () => {};

      if (rigRef.current) {
        rigRef.current.dispose();
        rigRef.current = null;
      }
      for (const marker of [...landmarkMarkerGroup.children]) {
        landmarkMarkerGroup.remove(marker);
        const mesh = marker as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      scene.remove(landmarkMarkerGroup);
      scene.remove(weightBrushCursor);
      weightBrushCursor.geometry.dispose();
      (weightBrushCursor.material as THREE.Material).dispose();
      weightBrushCursorRef.current = null;
      sceneRef.current = null;
      resetCameraFnRef.current = null;
      renderOnceRef.current = null;
      envTex.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [isOpen]);

  const rebuildWithConfig = async (
    nextConfig: CustomModelConfig,
    preserveCamera = false
  ): Promise<boolean> => {
    setError(null);
    try {
      let rig: CustomRigController;
      if (importedBuffer) {
        rig = await importRiggedModelFromBuffer(importedBuffer.buffer, {
          isPlayer: true,
          outlinesEnabled: nextConfig.outlinesEnabled,
          modelName: importedBuffer.name,
          companionFiles: importedBuffer.companions,
          config: nextConfig
        });
        if (overrideTextureBuf) {
          const fmt = detectModelFormat(importedBuffer.buffer, importedBuffer.name);
          const tex = await loadTextureFromBuffer(overrideTextureBuf, fmt === 'obj' || fmt === 'fbx');
          rig.applyCustomTexture(tex);
        }
        setCustomHeroConfigOverride(nextConfig);
      } else {
        rig = await createRiggedModelInstance(true, nextConfig.outlinesEnabled, '/models/model01.glb', {
          modelName: 'model01.glb',
          config: nextConfig
        });
      }
      mountRigIntoScene(rig, Boolean(importedBuffer), nextConfig, preserveCamera);
      showToast('Rig recalibrado');
      return true;
    } catch (err) {
      console.error('Error recalibrating rig:', err);
      setError('No se pudo recalibrar el esqueleto con estos parámetros.');
      return false;
    }
  };

  const applyManualLandmarkAxis = (
    landmark: HumanoidLandmarkName,
    axis: keyof RigLandmarkPosition,
    value: number
  ) => {
    const current = config.manualLandmarks[landmark] ?? { x: 0, y: 0.5, z: 0 };
    const nextPoint = { ...current, [axis]: value };
    const nextConfig = normalizeCustomModelConfig({
      ...config,
      manualLandmarks: { ...config.manualLandmarks, [landmark]: nextPoint }
    });
    setConfig(nextConfig);
    setWizardDirty(true);
    updateLandmarkMarkersRef.current(nextConfig.manualLandmarks, rigRef.current);
    renderOnceRef.current?.();
  };

  const handleSelectLandmark = (landmark: HumanoidLandmarkName) => {
    selectedLandmarkRef.current = landmark;
    setSelectedLandmark(landmark);
    updateLandmarkMarkersRef.current(config.manualLandmarks, rigRef.current);
    renderOnceRef.current?.();
  };

  const handleLandmarkStep = (offset: -1 | 1) => {
    const index = RIG_LANDMARK_OPTIONS.findIndex(option => option.id === selectedLandmark);
    const nextIndex = Math.max(0, Math.min(RIG_LANDMARK_OPTIONS.length - 1, index + offset));
    handleSelectLandmark(RIG_LANDMARK_OPTIONS[nextIndex].id);
  };

  const handlePlaceLandmark = () => {
    if (isPlacingLandmark) {
      landmarkPickingRef.current = false;
      setIsPlacingLandmark(false);
      return;
    }
    selectedLandmarkRef.current = selectedLandmark;
    landmarkPickingRef.current = true;
    setIsPlacingLandmark(true);
  };

  const handleApplyLandmarks = async () => {
    landmarkPickingRef.current = false;
    setIsPlacingLandmark(false);
    if (await rebuildWithConfig(config, true)) setWizardDirty(false);
  };

  const handleResetLandmarks = () => {
    const nextConfig = normalizeCustomModelConfig({ ...config, manualLandmarks: {} });
    setConfig(nextConfig);
    setWizardDirty(true);
    updateLandmarkMarkersRef.current(nextConfig.manualLandmarks, rigRef.current);
    renderOnceRef.current?.();
  };

  const handleWeightPreviewChange = (visible: boolean) => {
    setShowWeightPreview(visible);
    rigRef.current?.setWeightPreview(visible);
    renderOnceRef.current?.();
  };

  const handleWeightPaintToggle = () => {
    const enabled = !weightPaintEnabled;
    setWeightPaintEnabled(enabled);
    if (weightBrushCursorRef.current) weightBrushCursorRef.current.visible = false;
    if (enabled) {
      landmarkPickingRef.current = false;
      setIsPlacingLandmark(false);
      if (activeAnim !== 'idle') handlePlayAnim('idle');
      setShowWeightPreview(true);
      rigRef.current?.setWeightPreview(true);
    }
    renderOnceRef.current?.();
  };

  const handleUndoWeightStroke = () => {
    const rig = rigRef.current;
    if (!rig) return;
    const undone = rig.undoWeightPaintStroke();
    if (undone > 0) {
      const nextConfig = normalizeCustomModelConfig(rig.metadata.appliedConfig);
      setConfig(nextConfig);
      if (importedBuffer) setCustomHeroConfigOverride(nextConfig);
      setCanUndoWeights(rig.canUndoWeightPaint);
      setLastPaintedVertexCount(undone);
      showToast(`Deshecho: ${undone} vértices restaurados`);
      renderOnceRef.current?.();
    }
  };

  const handleResetWeightEdits = async () => {
    const nextConfig = normalizeCustomModelConfig({
      ...config,
      manualWeightEdits: []
    });
    const applied = await rebuildWithConfig(nextConfig, true);
    if (applied) {
      setCanUndoWeights(false);
      setLastPaintedVertexCount(0);
      showToast('Pesos manuales borrados; se restauraron los pesos calculados');
    }
  };

  const updateDisplayConfigField = (partial: Partial<CustomModelConfig>) => {
    const next = normalizeCustomModelConfig({ ...config, ...partial });
    setConfig(next);
    rigRef.current?.applyDisplayConfig(next);
    setMaterialMode(next.materialMode);
    setShowWeapons(next.weaponsEnabled);
    setPlaybackSpeed(next.playbackSpeed);
    if (importedBuffer) {
      setCustomHeroConfigOverride(next);
    }
    rigRef.current?.update(0);
    renderOnceRef.current?.();
  };

  const applyTextureFile = async (file: File) => {
    if (!rigRef.current) return;
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const fmt = importedBuffer
        ? detectModelFormat(importedBuffer.buffer, importedBuffer.name)
        : 'glb';
      const flipY = fmt === 'obj' || fmt === 'fbx';
      const tex = await loadTextureFromBuffer(buf, flipY);
      rigRef.current.applyCustomTexture(tex);
      rigRef.current.setMaterialMode('textured');
      setCustomHeroTextureOverride(buf);
      setOverrideTextureBuf(buf);
      setHasOverrideTexture(true);
      setMaterialMode('textured');
      setConfig(prev => ({ ...prev, materialMode: 'textured' }));
      setMetadata({ ...rigRef.current.metadata });
      renderOnceRef.current?.();
    } catch (err) {
      console.error('Failed to apply custom texture:', err);
      setError(`No se pudo cargar la textura "${file.name}". Usa una imagen .png, .jpg o .webp válida.`);
    }
  };

  const loadCustomFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const modelExts = /\.(glb|gltf|fbx|obj)$/i;
    const imageExts = /\.(png|jpe?g|webp|bmp)$/i;

    const primaryModel = files.find(f => modelExts.test(f.name));

    if (!primaryModel && files.length === 1 && imageExts.test(files[0].name) && rigRef.current) {
      await applyTextureFile(files[0]);
      return;
    }

    const chosenModel = primaryModel ?? files[0];
    const companionList = files.filter(f => f !== chosenModel);

    setLoading(true);
    setError(null);
    try {
      const buffer = await chosenModel.arrayBuffer();
      const companions: CompanionModelFile[] = await Promise.all(
        companionList.map(async f => ({
          name: f.name,
          buffer: await f.arrayBuffer()
        }))
      );

      const freshCfg: CustomModelConfig = {
        ...DEFAULT_CUSTOM_MODEL_CONFIG,
        playbackSpeed: stateRefs.current.playbackSpeed
      };

      const rig = await importRiggedModelFromBuffer(buffer, {
        isPlayer: true,
        outlinesEnabled: true,
        modelName: chosenModel.name,
        companionFiles: companions
      });
      const resolvedCfg = normalizeCustomModelConfig({
        ...freshCfg,
        materialMode: rig.metadata.hasNativeTextures && rig.metadata.hasNativeUvs ? 'textured' : 'toon',
        weaponsEnabled: rig.metadata.rigSource === 'auto_rig'
      });

      setImportedBuffer({ buffer, name: chosenModel.name, companions });
      setOverrideTextureBuf(null);
      setActiveLibraryId(null);
      setModelTitle(stripExtension(chosenModel.name));
      setCustomHeroModelOverride(buffer, chosenModel.name, companions, resolvedCfg);
      setCustomHeroTextureOverride(null);
      setHasOverrideTexture(false);
      mountRigIntoScene(rig, true, resolvedCfg);
      setLoading(false);
    } catch (err) {
      console.error('Failed to import custom 3D model:', err);
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setError(
        `No se pudo importar "${chosenModel.name}". Soporta .glb, .gltf, .fbx y .obj${detail}`
      );
      setLoading(false);
    }
  };

  const handleLoadLibraryEntry = async (entry: SavedCustomModelEntry) => {
    soundManager.playClick();
    setLoading(true);
    setError(null);
    try {
      const rig = await importRiggedModelFromBuffer(entry.buffer, {
        isPlayer: true,
        outlinesEnabled: entry.config.outlinesEnabled,
        modelName: entry.fileName,
        companionFiles: entry.companions,
        config: entry.config
      });
      if (entry.textureBuffer) {
        const fmt = detectModelFormat(entry.buffer, entry.fileName);
        const tex = await loadTextureFromBuffer(entry.textureBuffer, fmt === 'obj' || fmt === 'fbx');
        rig.applyCustomTexture(tex);
      }
      setImportedBuffer({
        buffer: entry.buffer,
        name: entry.fileName,
        companions: entry.companions
      });
      setOverrideTextureBuf(entry.textureBuffer ?? null);
      setHasOverrideTexture(Boolean(entry.textureBuffer));
      setActiveLibraryId(entry.id);
      setModelTitle(entry.name);
      setCustomHeroModelOverride(entry.buffer, entry.fileName, entry.companions, entry.config);
      setCustomHeroTextureOverride(entry.textureBuffer ?? null);
      const slots = getSlotsForModel(entry.id);
      if (slots.length > 0) setSelectedSlot(slots[0]);
      mountRigIntoScene(rig, true, entry.config);
      setLoading(false);
      showToast(`Cargado "${entry.name}"`);
    } catch (err) {
      console.error('Error loading saved model:', err);
      setError(`No se pudo cargar "${entry.name}" desde la biblioteca.`);
      setLoading(false);
    }
  };

  const handleSaveAndAssign = async () => {
    soundManager.playClick();
    setError(null);
    try {
      let targetBuffer = importedBuffer?.buffer;
      let fileName = importedBuffer?.name ?? 'model01.glb';
      const companions = importedBuffer?.companions ?? [];

      if (!targetBuffer) {
        const res = await fetch('/models/model01.glb');
        if (!res.ok) throw new Error('No se pudo leer model01.glb');
        targetBuffer = await res.arrayBuffer();
      }

      const id = activeLibraryId ?? `mdl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const cleanName = modelTitle.trim() || stripExtension(fileName);
      const saved = await saveCustomModelEntry({
        id,
        name: cleanName,
        fileName,
        buffer: targetBuffer,
        companions,
        textureBuffer: overrideTextureBuf,
        config,
        autoProfile: metadata?.autoProfile ?? null
      });
      await assignCustomModelToSlot(selectedSlot, saved.id);
      setActiveLibraryId(saved.id);
      await refreshLibraryState();
      const slotLabel = MODEL_ASSIGNMENT_SLOTS.find(s => s.key === selectedSlot)?.label ?? selectedSlot;
      showToast(`Guardado y asignado a ${slotLabel}`);
    } catch (err) {
      console.error('Failed to save model:', err);
      setError('No se pudo guardar el modelo en la biblioteca del navegador.');
    }
  };

  const handleDeleteSaved = async (id: string) => {
    soundManager.playClick();
    await deleteCustomModelEntry(id);
    if (activeLibraryId === id) {
      setActiveLibraryId(null);
    }
    await refreshLibraryState();
    showToast('Modelo eliminado de la biblioteca');
  };

  const handleExportConfigJson = () => {
    soundManager.playClick();
    const assignedSlots = activeLibraryId ? getSlotsForModel(activeLibraryId) : [selectedSlot];
    const payload = buildExportConfigPayload(
      modelTitle || metadata?.modelName || 'model',
      config,
      metadata?.autoProfile ?? null,
      assignedSlots
    );
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stripExtension(metadata?.modelName ?? modelTitle ?? 'model')}.config.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(json).catch(() => {});
    }
    showToast('Config .json exportada');
  };

  const handleImportConfigJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportedConfigJson(text);
      if (parsed.assignments[0]) {
        setSelectedSlot(parsed.assignments[0]);
      }
      await rebuildWithConfig(parsed.config);
      showToast(`Config "${file.name}" aplicada`);
    } catch {
      setError(`El archivo "${file.name}" no es una configuración JSON válida.`);
    }
  };

  const handleAutoResetConfig = async () => {
    soundManager.playClick();
    const resetCfg = normalizeCustomModelConfig({
      ...DEFAULT_CUSTOM_MODEL_CONFIG,
      materialMode,
      weaponsEnabled: showWeapons,
      playbackSpeed
    });
    await rebuildWithConfig(resetCfg);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void loadCustomFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleTextureInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void applyTextureFile(file);
    }
    e.target.value = '';
  };

  const handleResetDefaultModel = async () => {
    soundManager.playClick();
    setLoading(true);
    setError(null);
    setImportedBuffer(null);
    setOverrideTextureBuf(null);
    setActiveLibraryId(null);
    setModelTitle('Valerius (Model01)');
    setCustomHeroModelOverride(null);
    setCustomHeroTextureOverride(null);
    setHasOverrideTexture(false);
    try {
      const rig = await createRiggedModelInstance(true, true, '/models/model01.glb', {
        modelName: 'model01.glb'
      });
      mountRigIntoScene(rig, false);
      setLoading(false);
    } catch (err) {
      console.error('Error reloading default model01.glb:', err);
      setError('No se pudo recargar model01.glb');
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void loadCustomFiles(e.dataTransfer.files);
    }
  };

  const handlePlayAnim = (anim: 'idle' | 'attack' | 'walk' | 'hit') => {
    soundManager.playClick();
    setActiveAnim(anim);
    if (!rigRef.current) return;
    if (anim === 'idle') {
      rigRef.current.playIdle(0.15);
    } else if (anim === 'attack') {
      rigRef.current.playAttack(() => {
        setActiveAnim('idle');
      }, 0.1);
    } else if (anim === 'walk') {
      rigRef.current.playWalk(0.15);
    } else if (anim === 'hit') {
      rigRef.current.playHit(0.08, () => {
        setActiveAnim('idle');
      });
    }
  };

  const handlePlayCustomClip = (clipName: string) => {
    soundManager.playClick();
    setActiveAnim(`clip:${clipName}`);
    rigRef.current?.playClipByName(clipName, 0.15);
  };

  const handleToggleMaterial = () => {
    soundManager.playClick();
    const nextMode: CustomMaterialMode = materialMode === 'toon' ? 'textured' : 'toon';
    updateDisplayConfigField({ materialMode: nextMode });
  };

  const handleToggleSkeleton = () => {
    soundManager.playClick();
    const nextVal = !showSkeleton;
    setShowSkeleton(nextVal);
    rigRef.current?.setSkeletonVisible(nextVal);
    rigRef.current?.update(0);
    renderOnceRef.current?.();
  };

  const handleToggleWeapons = () => {
    soundManager.playClick();
    const nextVal = !showWeapons;
    updateDisplayConfigField({ weaponsEnabled: nextVal });
  };

  const handleSetSpeed = (speed: number) => {
    soundManager.playClick();
    updateDisplayConfigField({ playbackSpeed: speed });
  };

  const handleResetCamera = () => {
    soundManager.playClick();
    resetCameraFnRef.current?.();
    renderOnceRef.current?.();
  };

  const handleTestInBattle = () => {
    soundManager.playClick();
    onClose();
    if (onEnterBattle) {
      onEnterBattle();
    } else {
      if (game.state !== 'battle') {
        game.startMission(0);
      }
    }
  };

  if (!isOpen) return null;

  const extraClips =
    metadata?.availableClipNames.filter(
      n => !['idle', 'attack', 'walk', 'hit'].includes(n.toLowerCase())
    ) ?? [];

  const autoProf = metadata?.autoProfile;
  const rigSubtitle = metadata
    ? `${metadata.modelName} · ${
        metadata.rigSource === 'native_skeleton'
          ? `Esqueleto Original (${metadata.boneCount}h)`
          : `Auto-Rig (${metadata.boneCount}h)`
      }${autoProf ? ` · ${PROPORTION_LABELS[autoProf.proportionClass] ?? autoProf.proportionClass} · ${POSE_LABELS[autoProf.armPose] ?? autoProf.armPose}` : ''}`
    : 'Editor 3D Universal (.glb / .gltf / .fbx / .obj)';
  const weightBoneOptions = Array.from(
    new Set(rigRef.current?.skinnedMesh?.skeleton.bones.map(bone => bone.name) ?? [])
  );
  const activeWeightBone =
    weightBoneOptions.find(name => name === selectedWeightBone) ??
    weightBoneOptions.find(name => /arm/i.test(name)) ??
    weightBoneOptions[0] ??
    '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-[#04060ae6]">
      <div
        className={`relative w-full ${
          showEditor ? 'max-w-6xl' : 'max-w-4xl'
        } h-[94vh] max-h-[860px] bg-[#090d16] border-2 border-[#d89b32] shadow-[0_12px_48px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden rounded-md text-[#f6eedb] transition-all`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-[#222e44] bg-[#0e1422]">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair className="text-[#f3cf7a] shrink-0" size={18} />
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-xs sm:text-base text-[#f6eedb] tracking-wider uppercase truncate">
                Estudio 3D · Rig y Editor del Juego
              </h2>
              <p className="text-[10px] sm:text-[11px] text-[#8a99b3] leading-none mt-1 truncate">
                {rigSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".glb,.gltf,.fbx,.obj,.mtl,.png,.jpg,.jpeg,.webp"
              aria-label="Importar modelo 3D GLB, GLTF, FBX u OBJ"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <input
              ref={textureInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.bmp"
              aria-label="Cargar textura del modelo"
              className="hidden"
              onChange={handleTextureInputChange}
            />
            <input
              ref={configInputRef}
              type="file"
              accept=".json"
              aria-label="Importar configuración JSON"
              className="hidden"
              onChange={handleImportConfigJson}
            />

            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e2d46] border border-[#d89b32]/60 text-[#f3cf7a] text-xs font-bold transition-colors cursor-pointer"
              title="Importar .glb, .gltf, .fbx u .obj (puedes seleccionar también .mtl e imagen)"
            >
              <Upload size={14} />
              <span>Importar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                textureInputRef.current?.click();
              }}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                hasOverrideTexture
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                  : 'bg-[#162032] hover:bg-[#1e2d46] border-slate-700 text-[#cbd5e1]'
              }`}
              title="Adjuntar textura (.png, .jpg, .webp)"
            >
              <ImageIcon size={14} />
              <span className="hidden md:inline">Textura</span>
            </button>

            <button
              type="button"
              data-testid="editor-toggle-btn"
              onClick={() => {
                soundManager.playClick();
                setShowEditor(v => !v);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded border text-xs font-bold transition-colors cursor-pointer ${
                showEditor
                  ? 'bg-[#d89b32] text-[#090d16] border-[#f3cf7a]'
                  : 'bg-[#162032] hover:bg-[#1e2d46] border-[#3b82f6]/50 text-sky-200'
              }`}
              title="Abrir calibración automática, asignación a héroes/clases y exportación JSON"
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">Editor Juego</span>
              <span className="sm:hidden">Calibrar</span>
            </button>

            {importedBuffer && (
              <button
                type="button"
                onClick={handleResetDefaultModel}
                className="hidden sm:inline-flex px-2.5 py-1.5 rounded bg-[#162032] hover:bg-[#223048] text-[#cbd5e1] text-xs font-semibold transition-colors cursor-pointer"
                title="Volver al modelo por defecto (model01.glb)"
              >
                Model01
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-8 h-8 flex items-center justify-center rounded bg-[#162032] hover:bg-[#223048] text-[#cbd5e1] hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Inline Status Notification Bar */}
        {statusNote && (
          <div className="px-4 py-1.5 bg-emerald-950/90 border-b border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <Check size={14} className="shrink-0 text-emerald-400" />
            <span className="truncate">{statusNote}</span>
          </div>
        )}

        {/* Mobile Controls & Diagnostics Strip (hidden when Editor tab is active on small screens) */}
        {!showEditor && (
          <div className="sm:hidden px-3 py-2 bg-[#0a101b] border-b border-[#1e293b] space-y-2">
            {metadata && !loading && (
              <div className="flex items-center justify-between gap-2 text-[10px] leading-tight">
                <span className="font-bold text-[#f3cf7a] flex items-center gap-1 truncate">
                  <Bone size={11} className="shrink-0" />
                  {metadata.rigSource === 'native_skeleton' ? 'Esqueleto Nativo' : 'Auto-Rig'} · {metadata.boneCount}h ·{' '}
                  {autoProf ? POSE_LABELS[autoProf.armPose] : `${metadata.meshCount}m`}
                </span>
                <span className={`truncate ${metadata.hasNativeUvs && metadata.hasNativeTextures ? 'text-emerald-300' : 'text-amber-300/90'}`}>
                  {!metadata.hasNativeUvs ? 'Sin UVs' : metadata.hasNativeTextures ? 'Textura OK' : 'Sin textura'}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleToggleMaterial}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  materialMode === 'toon'
                    ? 'bg-[#1e3a8a] text-sky-200 border border-sky-400/50'
                    : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
                }`}
              >
                <Palette size={13} />
                <span className="truncate">{materialMode === 'toon' ? 'Toon Brawl' : 'Textura'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleSkeleton}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  showSkeleton
                    ? 'bg-amber-600 text-amber-100 border border-amber-300/60'
                    : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
                }`}
              >
                <Bone size={13} />
                <span className="truncate">{showSkeleton ? 'Ocultar Rig' : 'Ver Huesos'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleWeapons}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  showWeapons
                    ? 'bg-[#1e293b] text-[#f3cf7a] border border-[#d89b32]/50'
                    : 'bg-[#1b2333] text-[#8a99b3] border border-slate-700'
                }`}
              >
                <Shield size={13} />
                <span className="truncate">{showWeapons ? 'Con Armas' : 'Sin Armas'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetCamera}
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold bg-[#1b2333] text-[#cbd5e1] border border-slate-700 transition-all cursor-pointer"
              >
                <RotateCcw size={13} />
                <span className="truncate">Centrar</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content Split: 3D Viewport + Collapsible Game Editor Side Drawer */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* 3D Viewport Area (kept mounted so WebGL context stays alive even on mobile tab toggle) */}
          <div
            className={`relative flex-1 min-h-0 bg-[#070a12] overflow-hidden ${
              showEditor ? 'hidden md:block' : 'block'
            } ${isDragOver ? 'ring-2 ring-inset ring-[#f3cf7a]' : ''}`}
            onDragOver={e => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <div
              ref={containerRef}
              data-testid="model-viewer-canvas"
              className={`w-full h-full select-none ${
                isPlacingLandmark ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
              }`}
            />

            {/* Loading Indicator */}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090d16]/92 z-20">
                <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-[#f3cf7a] rounded-full animate-spin mb-3" />
                <p className="font-display font-bold text-sm text-[#f6eedb]">
                  Analizando geometría y auto-rig...
                </p>
                <p className="text-xs text-[#8a99b3] mt-1">
                  Detectando proporciones, postura de brazos y alas/capas traseras
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090d16]/95 p-6 z-20 text-center">
                <p className="font-display font-bold text-base text-rose-400 mb-3 max-w-lg">{error}</p>
                <button
                  type="button"
                  onClick={handleResetDefaultModel}
                  className="px-5 py-2 valen-btn-steel valen-bevel font-bold text-xs cursor-pointer"
                >
                  Reintentar con model01.glb
                </button>
              </div>
            )}

            {/* Top-Left Model Diagnostics Summary (Desktop/Tablet) */}
            {metadata && !loading && (
              <div className="hidden sm:block absolute top-3 left-3 bg-[#090d16]/92 px-3 py-2 rounded border border-[#222e44] text-[11px] text-[#cbd5e1] pointer-events-none select-none z-10 space-y-0.5 max-w-[330px]">
                <div className="font-bold text-[#f3cf7a] flex items-center gap-1.5">
                  <Bone size={12} />
                  <span>
                    {metadata.rigSource === 'native_skeleton' ? 'Esqueleto Nativo' : 'Auto-Rig Adaptativo'} ·{' '}
                    {metadata.boneCount}h · {metadata.meshCount} {metadata.meshCount === 1 ? 'malla' : 'mallas'}
                  </span>
                </div>
                {autoProf && (
                  <div className="text-sky-300/95">
                    {PROPORTION_LABELS[autoProf.proportionClass]} · {POSE_LABELS[autoProf.armPose]}
                    {autoProf.hasBackAppendages ? ' · Alas/Capa (-Z)' : ''}
                    {autoProf.hasFloatingHalo ? ' · Aureola' : ''}
                  </div>
                )}
                <div className="text-[#8a99b3] truncate">
                  Clips: {metadata.availableClipNames.join(', ')}
                </div>
                <div className={metadata.hasNativeUvs && metadata.hasNativeTextures ? 'text-emerald-300' : 'text-amber-300/90'}>
                  {!metadata.hasNativeUvs
                    ? 'Sin UVs (TEXCOORD_0) · colores por zona'
                    : metadata.hasNativeTextures
                    ? 'UVs y textura original cargados'
                    : 'Con UVs · sin textura (suelta un .png/.jpg aquí)'}
                </div>
              </div>
            )}

            {/* Top-Right Overlay Toggles (Desktop/Tablet) */}
            <div className="hidden sm:flex absolute top-3 right-3 flex-col gap-2 z-10">
              <button
                type="button"
                onClick={handleToggleMaterial}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                  materialMode === 'toon'
                    ? 'bg-[#1e3a8a] text-sky-200 border border-sky-400/50'
                    : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
                }`}
              >
                <Palette size={14} />
                <span>{materialMode === 'toon' ? 'Toon Brawl Stars' : 'Textura Original'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleSkeleton}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                  showSkeleton
                    ? 'bg-amber-600 text-amber-100 border border-amber-300/60'
                    : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
                }`}
              >
                <Bone size={14} />
                <span>{showSkeleton ? 'Ocultar Rig' : 'Ver Huesos / Rig'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleWeapons}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                  showWeapons
                    ? 'bg-[#1e293b] text-[#f3cf7a] border border-[#d89b32]/50'
                    : 'bg-[#1b2333] text-[#8a99b3] border border-slate-700'
                }`}
              >
                <Shield size={14} />
                <span>{showWeapons ? 'Con Armas' : 'Sin Armas (Puro)'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetCamera}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel bg-[#1b2333] text-[#cbd5e1] border border-slate-700 hover:border-[#d89b32]/60 transition-all cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Centrar Cámara</span>
              </button>
            </div>

            {/* Camera Interaction Hint */}
            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 bg-[#090d16]/85 px-2.5 py-1 rounded text-[10px] sm:text-[11px] text-[#8a99b3] pointer-events-none select-none border border-slate-800">
              <span className="sm:hidden">Arrastra para girar · Zoom con pellizco</span>
              <span className="hidden sm:inline">Arrastra para girar · Zoom con rueda · Suelta .glb/.fbx/.obj (+ .mtl/.png) aquí</span>
            </div>
          </div>

          {/* Collapsible Game Model Editor & Calibration Drawer */}
          {showEditor && (
            <aside
              data-testid="model-editor-panel"
              className="w-full md:w-88 shrink-0 bg-[#0b111d] border-t md:border-t-0 md:border-l border-[#222e44] overflow-y-auto p-3.5 space-y-4 text-xs"
            >
              {/* Section 1: Auto-Detected Mesh Profile */}
              {autoProf && (
                <div className="bg-[#11192a] border border-[#24324c] rounded p-2.5 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#f3cf7a]">
                    Auto-Detección de Malla
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[#cbd5e1]">
                    <span>Proporción:</span>
                    <span className="font-semibold text-right text-sky-300">
                      {PROPORTION_LABELS[autoProf.proportionClass]}
                    </span>
                    <span>Brazos:</span>
                    <span className="font-semibold text-right text-sky-300">
                      {POSE_LABELS[autoProf.armPose]}
                    </span>
                    <span>Cadera / Cuello:</span>
                    <span className="font-mono-num text-right">
                      {autoProf.detectedPelvisY.toFixed(2)} / {autoProf.detectedNeckY.toFixed(2)}
                    </span>
                    <span>Alas / Capa (-Z):</span>
                    <span className="font-semibold text-right text-emerald-300">
                      {autoProf.hasBackAppendages ? 'Aisladas a torso' : 'No detectadas'}
                    </span>
                  </div>
                </div>
              )}

              {/* Section 2: Transform & Rig Calibration */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#f3cf7a]">
                    Parámetros de Calibración
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoResetConfig}
                    className="text-[11px] text-sky-300 hover:text-sky-200 underline cursor-pointer"
                  >
                    Auto-Reset
                  </button>
                </div>

                {/* Live Scale */}
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#cbd5e1]">Escala en Batalla</span>
                    <span className="font-mono-num text-[#f3cf7a]">{config.scale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.8}
                    step={0.05}
                    value={config.scale}
                    onChange={e => updateDisplayConfigField({ scale: parseFloat(e.target.value) })}
                    className="w-full accent-[#d89b32]"
                  />
                </label>

                {/* Facing Yaw */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#cbd5e1]">Orientación Frente (Y)</span>
                    <span className="font-mono-num text-[#f3cf7a]">{config.facingYawDeg}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0, 90, 180, -90].map(deg => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => updateDisplayConfigField({ facingYawDeg: deg })}
                        className={`py-1 rounded text-[11px] font-mono-num font-bold border cursor-pointer ${
                          config.facingYawDeg === deg
                            ? 'bg-[#d89b32] text-[#090d16] border-[#f3cf7a]'
                            : 'bg-[#162032] text-[#cbd5e1] border-slate-700'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ground Offset Y */}
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#cbd5e1]">Altura Base Y</span>
                    <span className="font-mono-num text-[#f3cf7a]">{config.groundOffsetY.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={-0.25}
                    max={0.25}
                    step={0.01}
                    value={config.groundOffsetY}
                    onChange={e => updateDisplayConfigField({ groundOffsetY: parseFloat(e.target.value) })}
                    className="w-full accent-[#d89b32]"
                  />
                </label>

                {/* Auto-Rig Skeleton Offsets */}
                {metadata?.rigSource === 'auto_rig' && (
                  <div className="pt-2 border-t border-[#1e293b] space-y-2">
                    <div className="text-[11px] font-semibold text-[#8a99b3]">
                      Ajuste Fino de Huesos (Auto-Rig)
                    </div>

                    <section className="rounded border border-sky-400/30 bg-sky-950/20 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-[11px] font-bold text-sky-200">Wizard de articulaciones</h3>
                          <p className="text-[10px] text-slate-400">
                            {Object.keys(config.manualLandmarks).length}/9 puntos manuales · espejo bilateral
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-expanded={rigWizardOpen}
                          onClick={() => setRigWizardOpen(open => !open)}
                          className="rounded border border-sky-300/40 px-2 py-1 text-[10px] font-semibold text-sky-100 hover:bg-sky-900/50 cursor-pointer"
                        >
                          {rigWizardOpen ? 'Cerrar' : 'Abrir'}
                        </button>
                      </div>

                      {rigWizardOpen && (
                        <div className="space-y-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-300">Articulación a colocar</span>
                            <select
                              value={selectedLandmark}
                              onChange={e => {
                                const option = RIG_LANDMARK_OPTIONS.find(item => item.id === e.target.value);
                                if (option) handleSelectLandmark(option.id);
                              }}
                              className="w-full rounded border border-slate-700 bg-[#101827] px-2 py-1.5 text-[11px] text-slate-100"
                            >
                              {RIG_LANDMARK_OPTIONS.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </label>

                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="text-slate-400">
                              Punto {RIG_LANDMARK_OPTIONS.findIndex(option => option.id === selectedLandmark) + 1} de 9
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={selectedLandmark === RIG_LANDMARK_OPTIONS[0].id}
                                onClick={() => handleLandmarkStep(-1)}
                                className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-40 cursor-pointer"
                              >
                                Anterior
                              </button>
                              <button
                                type="button"
                                disabled={selectedLandmark === RIG_LANDMARK_OPTIONS[RIG_LANDMARK_OPTIONS.length - 1].id}
                                onClick={() => handleLandmarkStep(1)}
                                className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:opacity-40 cursor-pointer"
                              >
                                Siguiente
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handlePlaceLandmark}
                            className={`w-full rounded px-2 py-1.5 text-[11px] font-bold border cursor-pointer ${
                              isPlacingLandmark
                                ? 'bg-amber-500 text-slate-950 border-amber-200'
                                : 'bg-[#162032] text-sky-100 border-sky-400/40 hover:bg-sky-900/50'
                            }`}
                          >
                            {isPlacingLandmark ? 'Cancelar colocación' : 'Colocar punto en la malla'}
                          </button>
                          <p className="text-[10px] leading-relaxed text-slate-400">
                            Selecciona un punto y haz clic sobre el modelo. El punto se guarda en coordenadas normalizadas;
                            el lado derecho se refleja automáticamente.
                          </p>

                          {config.manualLandmarks[selectedLandmark] && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {(['x', 'y', 'z'] as const).map(axis => (
                                <label key={axis} className="space-y-0.5">
                                  <span className="block text-[9px] uppercase text-slate-400">{axis}</span>
                                  <input
                                    type="number"
                                    aria-label={`${selectedLandmark} ${axis}`}
                                    min={axis === 'y' ? 0 : axis === 'z' ? -0.4 : -0.7}
                                    max={axis === 'y' ? 1.1 : axis === 'z' ? 0.4 : 0.7}
                                    step={0.005}
                                    value={config.manualLandmarks[selectedLandmark]![axis]}
                                    onChange={e => {
                                      const value = e.currentTarget.valueAsNumber;
                                      if (Number.isFinite(value)) {
                                        applyManualLandmarkAxis(selectedLandmark, axis, value);
                                      }
                                    }}
                                    className="w-full rounded border border-slate-700 bg-[#101827] px-1.5 py-1 font-mono-num text-[10px] text-slate-100"
                                  />
                                </label>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={!wizardDirty}
                              onClick={() => void handleApplyLandmarks()}
                              className="flex-1 rounded bg-blue-800 px-2 py-1.5 text-[10px] font-bold text-blue-50 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              Aplicar y reconstruir rig
                            </button>
                            <button
                              type="button"
                              disabled={Object.keys(config.manualLandmarks).length === 0}
                              onClick={handleResetLandmarks}
                              aria-label="Borrar landmarks manuales"
                              title="Borrar puntos manuales"
                              className="rounded border border-slate-700 px-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                          {wizardDirty && (
                            <p role="status" className="text-[10px] text-amber-300">
                              Hay cambios sin aplicar. Se reconstruirá desde el archivo original para evitar deformación acumulada.
                            </p>
                          )}

                          <label className="flex items-center gap-2 rounded border border-slate-700/70 px-2 py-1.5 text-[10px] text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showWeightPreview}
                              onChange={e => handleWeightPreviewChange(e.target.checked)}
                              className="accent-sky-400"
                            />
                            Ver influencias: brazo (rojo) / torso (azul)
                          </label>
                          <p className="text-[10px] text-slate-400">
                            Valida luego con Idle, Caminar y Ataque en la barra inferior.
                          </p>
                        </div>
                      )}
                    </section>

                    <section className="rounded border border-amber-400/30 bg-amber-950/15 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-[11px] font-bold text-amber-200">Pintura manual de pesos</h3>
                          <p className="text-[10px] text-slate-400">
                            {config.manualWeightEdits.length} vértices ajustados
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-pressed={weightPaintEnabled}
                          onClick={handleWeightPaintToggle}
                          className={`rounded border px-2 py-1 text-[10px] font-bold cursor-pointer ${
                            weightPaintEnabled
                              ? 'border-amber-200 bg-amber-400 text-slate-950'
                              : 'border-amber-300/40 text-amber-100 hover:bg-amber-900/40'
                          }`}
                        >
                          {weightPaintEnabled ? 'Terminar pincel' : 'Activar pincel'}
                        </button>
                      </div>

                      {weightPaintEnabled && (
                        <div className="space-y-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-300">Hueso a editar</span>
                            <select
                              aria-label="Hueso de pesos"
                              value={activeWeightBone}
                              onChange={event => setSelectedWeightBone(event.target.value)}
                              className="w-full rounded border border-slate-700 bg-[#101827] px-2 py-1.5 text-[11px] text-slate-100"
                            >
                              {weightBoneOptions.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-300">Operación</span>
                            <select
                              aria-label="Modo de pintura de pesos"
                              value={weightPaintMode}
                              onChange={event => setWeightPaintMode(event.target.value as SkinWeightPaintMode)}
                              className="w-full rounded border border-slate-700 bg-[#101827] px-2 py-1.5 text-[11px] text-slate-100"
                            >
                              <option value="paint">Pintar influencia</option>
                              <option value="erase">Reducir influencia</option>
                              <option value="smooth">Suavizar pesos</option>
                            </select>
                          </label>

                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-300">Radio del pincel</span>
                              <span className="font-mono-num text-amber-200">{weightBrushRadius.toFixed(3)} m</span>
                            </div>
                            <input
                              aria-label="Radio del pincel de pesos"
                              type="range"
                              min={0.015}
                              max={0.2}
                              step={0.005}
                              value={weightBrushRadius}
                              onChange={event => setWeightBrushRadius(Number(event.target.value))}
                              className="w-full accent-amber-400"
                            />
                          </label>

                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-300">Fuerza</span>
                              <span className="font-mono-num text-amber-200">{Math.round(weightBrushStrength * 100)}%</span>
                            </div>
                            <input
                              aria-label="Fuerza del pincel de pesos"
                              type="range"
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={weightBrushStrength}
                              onChange={event => setWeightBrushStrength(Number(event.target.value))}
                              className="w-full accent-amber-400"
                            />
                          </label>

                          <label className="flex items-center gap-2 rounded border border-slate-700/70 px-2 py-1.5 text-[10px] text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={weightMirrorEnabled}
                              onChange={event => setWeightMirrorEnabled(event.target.checked)}
                              className="accent-amber-400"
                            />
                            Simetría izquierda / derecha
                          </label>

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={!canUndoWeights}
                              onClick={handleUndoWeightStroke}
                              className="flex-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                            >
                              Deshacer trazo
                            </button>
                            <button
                              type="button"
                              disabled={config.manualWeightEdits.length === 0}
                              onClick={() => void handleResetWeightEdits()}
                              className="flex-1 rounded border border-rose-400/40 px-2 py-1.5 text-[10px] text-rose-200 hover:bg-rose-950/40 disabled:opacity-40 cursor-pointer"
                            >
                              Restaurar auto-pesos
                            </button>
                          </div>
                          <p role="status" className="text-[10px] leading-relaxed text-slate-400">
                            Clic y arrastrá sobre la malla. El pincel usa caída suave; cada trazo puede deshacerse. Guarda y asigna o exporta JSON para conservarlo.
                            {lastPaintedVertexCount > 0 ? ` Último trazo: ${lastPaintedVertexCount} vértices.` : ''}
                          </p>
                        </div>
                      )}
                    </section>

                    <label className="block space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#cbd5e1]">Cadera Y</span>
                        <span className="font-mono-num">{config.pelvisHeightOffset.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={-0.12}
                        max={0.12}
                        step={0.01}
                        value={config.pelvisHeightOffset}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, pelvisHeightOffset: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-[#3b82f6]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#cbd5e1]">Hombros Y</span>
                        <span className="font-mono-num">{config.shoulderHeightOffset.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={-0.12}
                        max={0.12}
                        step={0.01}
                        value={config.shoulderHeightOffset}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, shoulderHeightOffset: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-[#3b82f6]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#cbd5e1]">Caída de Brazos</span>
                        <span className="font-mono-num">{config.armDropOffsetRad.toFixed(2)} rad</span>
                      </div>
                      <input
                        type="range"
                        min={-0.5}
                        max={0.5}
                        step={0.05}
                        value={config.armDropOffsetRad}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, armDropOffsetRad: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-[#3b82f6]"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-[11px] text-[#cbd5e1] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.isolateBackAppendages}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, isolateBackAppendages: e.target.checked }))
                        }
                        className="accent-[#3b82f6]"
                      />
                      <span>Aislar alas / capa trasera (-Z)</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => void handleApplyLandmarks()}
                      className="w-full py-1.5 rounded bg-[#1e3a8a] hover:bg-[#1d4ed8] text-sky-100 font-bold text-[11px] border border-sky-400/40 cursor-pointer"
                    >
                      Aplicar Ajustes al Rig
                    </button>
                  </div>
                )}
              </div>

              {/* Section 3: Assign & Save into Game Library */}
              <div className="pt-2.5 border-t border-[#222e44] space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#f3cf7a]">
                  Usar en el Juego (Biblioteca)
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] text-[#8a99b3]">Nombre del Personaje / Asset</span>
                  <input
                    type="text"
                    value={modelTitle}
                    onChange={e => setModelTitle(e.target.value)}
                    placeholder="Ej. Valkiria Alada"
                    className="w-full px-2.5 py-1.5 rounded bg-[#162032] border border-slate-700 text-[#f6eedb] text-xs focus:outline-none focus:border-[#d89b32]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-[#8a99b3]">Asignar a Unidad o Clase</span>
                  <select
                    value={selectedSlot}
                    onChange={e => setSelectedSlot(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#162032] border border-slate-700 text-[#f6eedb] text-xs focus:outline-none focus:border-[#d89b32]"
                  >
                    {MODEL_ASSIGNMENT_SLOTS.map(slot => (
                      <option key={slot.key} value={slot.key}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  data-testid="save-assign-btn"
                  onClick={() => void handleSaveAndAssign()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 valen-btn-gold valen-bevel font-bold text-xs uppercase tracking-wide cursor-pointer"
                >
                  <Save size={14} />
                  <span>Guardar y Asignar</span>
                </button>

                {/* Portable Config Export / Import */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="export-config-btn"
                    onClick={handleExportConfigJson}
                    className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#162032] hover:bg-[#1e2d46] border border-slate-700 text-[#cbd5e1] text-[11px] font-semibold cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Exportar JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => configInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#162032] hover:bg-[#1e2d46] border border-slate-700 text-[#cbd5e1] text-[11px] font-semibold cursor-pointer"
                  >
                    <FileJson size={12} />
                    <span>Cargar JSON</span>
                  </button>
                </div>

                {/* Saved Models List */}
                {savedModels.length > 0 && (
                  <div className="pt-2 border-t border-[#1e293b] space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#8a99b3]">
                      Modelos Guardados ({savedModels.length})
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {savedModels.map(item => {
                        const itemSlots = Object.entries(assignments)
                          .filter(([, mId]) => mId === item.id)
                          .map(
                            ([slot]) =>
                              MODEL_ASSIGNMENT_SLOTS.find(s => s.key === slot)?.label.split(' ')[0] ?? slot
                          );
                        const isActive = activeLibraryId === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border ${
                              isActive
                                ? 'bg-[#1a263e] border-[#d89b32]/70'
                                : 'bg-[#11192a] border-slate-800'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => void handleLoadLibraryEntry(item)}
                              className="flex-1 text-left min-w-0 cursor-pointer"
                            >
                              <div className="font-semibold text-[11px] text-[#f6eedb] truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-[#8a99b3] truncate">
                                {itemSlots.length > 0
                                  ? `Asignado: ${itemSlots.join(', ')}`
                                  : 'Sin asignar'}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSaved(item.id)}
                              aria-label={`Eliminar ${item.name}`}
                              className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Embedded Clips Bar (shown when custom GLB contains additional animations) */}
        {extraClips.length > 0 && (
          <div className="px-3 sm:px-4 py-2 bg-[#0a101b] border-t border-[#1e293b] flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-[#8a99b3] uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Film size={12} />
              Clips del modelo:
            </span>
            {extraClips.map(clipName => (
              <button
                key={clipName}
                type="button"
                onClick={() => handlePlayCustomClip(clipName)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold shrink-0 transition-colors cursor-pointer ${
                  activeAnim === `clip:${clipName}`
                    ? 'bg-[#d89b32] text-[#090d16] font-bold'
                    : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
                }`}
              >
                {clipName}
              </button>
            ))}
          </div>
        )}

        {/* Bottom Control Deck */}
        <div className="p-2.5 sm:p-4 bg-[#0c121e] border-t border-[#222e44] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* Animation Triggers */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-[#8a99b3] uppercase tracking-wider mr-0.5 hidden md:inline">
              Animación:
            </span>

            <button
              type="button"
              onClick={() => handlePlayAnim('idle')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'idle'
                  ? 'bg-[#2563eb] text-white shadow-[0_0_12px_rgba(37,99,235,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Play size={13} />
              <span>Idle</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('attack')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'attack'
                  ? 'bg-[#dc2626] text-white shadow-[0_0_14px_rgba(220,38,38,0.7)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Swords size={13} />
              <span>Ataque</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('walk')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'walk'
                  ? 'bg-[#059669] text-white shadow-[0_0_12px_rgba(5,150,105,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Footprints size={13} />
              <span>Caminar</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('hit')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'hit'
                  ? 'bg-[#ea580c] text-white shadow-[0_0_12px_rgba(234,88,12,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Flame size={13} />
              <span>Impacto</span>
            </button>
          </div>

          {/* Speed & Direct Battle Deploy */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-1 bg-[#162032] p-1 rounded border border-slate-800 shrink-0">
              <Gauge size={13} className="text-[#8a99b3] ml-1" />
              {[0.5, 1.0, 1.5].map(spd => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => handleSetSpeed(spd)}
                  className={`px-2 py-1 rounded text-[11px] font-mono-num font-bold transition-colors cursor-pointer ${
                    playbackSpeed === spd
                      ? 'bg-[#d89b32] text-[#090d16]'
                      : 'text-[#8a99b3] hover:text-[#f6eedb]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleTestInBattle}
              className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 valen-btn-gold valen-bevel font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              <Swords size={15} />
              <span className="sm:hidden">Batalla Táctica</span>
              <span className="hidden sm:inline">Jugar en Batalla Táctica</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
