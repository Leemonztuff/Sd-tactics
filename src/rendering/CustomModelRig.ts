import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  BRAWL_PALETTE,
  getBrawlToonGradientTexture
} from './BrawlStyleSystem';

export interface RigAnimationClips {
  idle: THREE.AnimationClip;
  attack: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  hit: THREE.AnimationClip;
}

export type CustomMaterialMode = 'toon' | 'textured';

export type ProportionClass = 'chibi' | 'balanced' | 'tall_humanoid';
export type ArmPoseClass = 't-pose' | 'a-pose' | 'relaxed';
export type HumanoidLandmarkName =
  | 'pelvis'
  | 'chest'
  | 'neck'
  | 'leftShoulder'
  | 'leftElbow'
  | 'leftWrist'
  | 'leftHip'
  | 'leftKnee'
  | 'leftAnkle';

export interface RigLandmarkPosition {
  x: number;
  y: number;
  z: number;
}

export type ManualRigLandmarks = Partial<Record<HumanoidLandmarkName, RigLandmarkPosition>>;

export interface ManualSkinWeightInfluence {
  boneName: string;
  weight: number;
}

export interface ManualSkinWeightEdit {
  meshIndex: number;
  meshName: string;
  vertexIndex: number;
  influences: ManualSkinWeightInfluence[];
}

export type SkinWeightPaintMode = 'paint' | 'erase' | 'smooth';

export interface AutoRigProfile {
  proportionClass: ProportionClass;
  armPose: ArmPoseClass;
  detectedPelvisY: number;
  detectedShoulderY: number;
  detectedNeckY: number;
  detectedHeadTopY: number;
  detectedArmDropRad: number;
  hasBackAppendages: boolean;
  hasFloatingHalo: boolean;
  backAppendageZ: number;
  rearSign: -1 | 1;
  nativeHeight: number;
}

export interface CustomModelConfig {
  scale: number;
  facingYawDeg: number;
  groundOffsetY: number;
  pelvisHeightOffset: number;
  shoulderHeightOffset: number;
  neckHeightOffset: number;
  armDropOffsetRad: number;
  armSpanScale: number;
  manualLandmarks: ManualRigLandmarks;
  manualWeightEdits: ManualSkinWeightEdit[];
  isolateBackAppendages: boolean;
  materialMode: CustomMaterialMode;
  weaponsEnabled: boolean;
  outlinesEnabled: boolean;
  playbackSpeed: number;
}

export const DEFAULT_CUSTOM_MODEL_CONFIG: CustomModelConfig = {
  scale: 1.0,
  facingYawDeg: 0,
  groundOffsetY: 0,
  pelvisHeightOffset: 0,
  shoulderHeightOffset: 0,
  neckHeightOffset: 0,
  armDropOffsetRad: 0,
  armSpanScale: 1.0,
  manualLandmarks: {},
  manualWeightEdits: [],
  isolateBackAppendages: true,
  materialMode: 'toon',
  weaponsEnabled: true,
  outlinesEnabled: true,
  playbackSpeed: 1.0
};

export function normalizeCustomModelConfig(
  raw?: Partial<CustomModelConfig> | null
): CustomModelConfig {
  const c = raw ?? {};
  const manualLandmarks: ManualRigLandmarks = {};
  if (c.manualLandmarks && typeof c.manualLandmarks === 'object') {
    const landmarkNames: HumanoidLandmarkName[] = [
      'pelvis',
      'chest',
      'neck',
      'leftShoulder',
      'leftElbow',
      'leftWrist',
      'leftHip',
      'leftKnee',
      'leftAnkle'
    ];
    for (const name of landmarkNames) {
      const point = c.manualLandmarks[name];
      if (
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z)
      ) {
        manualLandmarks[name] = {
          x: clamp(point.x, -0.7, 0.7),
          y: clamp(point.y, 0, 1.1),
          z: clamp(point.z, -0.4, 0.4)
        };
      }
    }
  }
  const manualWeightEdits: ManualSkinWeightEdit[] = [];
  if (Array.isArray(c.manualWeightEdits)) {
    const seenVertices = new Set<string>();
    for (const edit of c.manualWeightEdits) {
      if (
        !edit ||
        !Number.isInteger(edit.meshIndex) ||
        edit.meshIndex < 0 ||
        typeof edit.meshName !== 'string' ||
        !Number.isInteger(edit.vertexIndex) ||
        edit.vertexIndex < 0 ||
        !Array.isArray(edit.influences)
      ) {
        continue;
      }

      const mergedInfluences = new Map<string, number>();
      for (const influence of edit.influences) {
        if (
          influence &&
          typeof influence.boneName === 'string' &&
          influence.boneName.length > 0 &&
          Number.isFinite(influence.weight) &&
          influence.weight > 0
        ) {
          mergedInfluences.set(
            influence.boneName,
            (mergedInfluences.get(influence.boneName) ?? 0) + influence.weight
          );
        }
      }
      const influences = Array.from(mergedInfluences, ([boneName, weight]) => ({ boneName, weight }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4);
      const total = influences.reduce((sum, influence) => sum + influence.weight, 0);
      if (total <= 0) continue;

      const key = `${edit.meshIndex}:${edit.meshName}:${edit.vertexIndex}`;
      if (seenVertices.has(key)) {
        const previousIndex = manualWeightEdits.findIndex(
          previous =>
            previous.meshIndex === edit.meshIndex &&
            previous.meshName === edit.meshName &&
            previous.vertexIndex === edit.vertexIndex
        );
        if (previousIndex >= 0) manualWeightEdits.splice(previousIndex, 1);
      }
      seenVertices.add(key);
      manualWeightEdits.push({
        meshIndex: edit.meshIndex,
        meshName: edit.meshName,
        vertexIndex: edit.vertexIndex,
        influences: influences.map(influence => ({
          boneName: influence.boneName,
          weight: influence.weight / total
        }))
      });
    }
  }
  return {
    scale: clamp(Number.isFinite(c.scale) ? c.scale! : DEFAULT_CUSTOM_MODEL_CONFIG.scale, 0.4, 2.2),
    facingYawDeg: clamp(
      Number.isFinite(c.facingYawDeg) ? c.facingYawDeg! : DEFAULT_CUSTOM_MODEL_CONFIG.facingYawDeg,
      -180,
      180
    ),
    groundOffsetY: clamp(
      Number.isFinite(c.groundOffsetY) ? c.groundOffsetY! : DEFAULT_CUSTOM_MODEL_CONFIG.groundOffsetY,
      -0.35,
      0.35
    ),
    pelvisHeightOffset: clamp(
      Number.isFinite(c.pelvisHeightOffset) ? c.pelvisHeightOffset! : 0,
      -0.14,
      0.14
    ),
    shoulderHeightOffset: clamp(
      Number.isFinite(c.shoulderHeightOffset) ? c.shoulderHeightOffset! : 0,
      -0.14,
      0.14
    ),
    neckHeightOffset: clamp(
      Number.isFinite(c.neckHeightOffset) ? c.neckHeightOffset! : 0,
      -0.12,
      0.12
    ),
    armDropOffsetRad: clamp(
      Number.isFinite(c.armDropOffsetRad) ? c.armDropOffsetRad! : 0,
      -0.75,
      0.75
    ),
    armSpanScale: clamp(
      Number.isFinite(c.armSpanScale) ? c.armSpanScale! : 1.0,
      0.7,
      1.4
    ),
    manualLandmarks,
    manualWeightEdits,
    isolateBackAppendages:
      typeof c.isolateBackAppendages === 'boolean' ? c.isolateBackAppendages : true,
    materialMode: c.materialMode === 'textured' ? 'textured' : 'toon',
    weaponsEnabled: typeof c.weaponsEnabled === 'boolean' ? c.weaponsEnabled : true,
    outlinesEnabled: typeof c.outlinesEnabled === 'boolean' ? c.outlinesEnabled : true,
    playbackSpeed: clamp(
      Number.isFinite(c.playbackSpeed) ? c.playbackSpeed! : 1.0,
      0.25,
      3.0
    )
  };
}

export interface CustomRigMetadata {
  modelName: string;
  rigSource: 'native_skeleton' | 'auto_rig';
  animationSource: 'embedded' | 'hybrid' | 'procedural';
  boneCount: number;
  meshCount: number;
  hasNativeTextures: boolean;
  hasNativeUvs: boolean;
  availableClipNames: string[];
  autoProfile?: AutoRigProfile;
  appliedConfig: CustomModelConfig;
}

export interface CompanionModelFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface HumanoidSkeletonLayout {
  pelvisY: number;
  pelvisZ: number;
  spineY: number;
  spineZ: number;
  chestY: number;
  chestZ: number;
  neckY: number;
  neckZ: number;
  headTopY: number;
  headZ: number;
  hipX: number;
  hipZ: number;
  kneeY: number;
  kneeZ: number;
  footY: number;
  footZ: number;
  torsoRadiusX: number;
  shoulderX: number;
  shoulderY: number;
  shoulderZ: number;
  elbowX: number;
  elbowY: number;
  elbowZ: number;
  armEndX: number;
  armEndY: number;
  armEndZ: number;
  armMinY: number;
  hasBackAppendages?: boolean;
  backAppendageZ?: number;
  rearSign?: -1 | 1;
  armPose?: ArmPoseClass;
  proportionClass?: ProportionClass;
  hasFloatingHalo?: boolean;
}

export interface MeshMaterialEntry {
  mesh: THREE.Mesh;
  toonMat: THREE.Material | THREE.Material[];
  texturedMat: THREE.Material | THREE.Material[];
  outlineMesh: THREE.Mesh | null;
  hadNativeColors?: boolean;
}

function getVertexInfluences(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number
): ManualSkinWeightInfluence[] {
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  if (!skinIndex || !skinWeight || !mesh.skeleton) return [];

  const influences = new Map<string, number>();
  for (let slot = 0; slot < 4; slot++) {
    const weight = skinWeight.getComponent(vertexIndex, slot);
    const bone = mesh.skeleton.bones[skinIndex.getComponent(vertexIndex, slot)];
    if (bone && weight > 0) {
      influences.set(bone.name, (influences.get(bone.name) ?? 0) + weight);
    }
  }
  return Array.from(influences, ([boneName, weight]) => ({ boneName, weight }));
}

function writeVertexInfluences(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  influences: ManualSkinWeightInfluence[],
  boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone.name, index]))
): boolean {
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  if (!skinIndex || !skinWeight || !mesh.skeleton) return false;

  const merged = new Map<number, number>();
  for (const influence of influences) {
    const boneIndex = boneIndices.get(influence.boneName);
    if (boneIndex !== undefined && Number.isFinite(influence.weight) && influence.weight > 0) {
      merged.set(boneIndex, (merged.get(boneIndex) ?? 0) + influence.weight);
    }
  }

  const top = Array.from(merged, ([boneIndex, weight]) => ({ boneIndex, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const total = top.reduce((sum, influence) => sum + influence.weight, 0);
  if (total <= 0) return false;

  for (let slot = 0; slot < 4; slot++) {
    const influence = top[slot];
    skinIndex.setComponent(vertexIndex, slot, influence?.boneIndex ?? 0);
    skinWeight.setComponent(vertexIndex, slot, influence ? influence.weight / total : 0);
  }
  return true;
}

export function applyManualSkinWeightEdits(
  meshEntries: MeshMaterialEntry[],
  edits: ManualSkinWeightEdit[]
): void {
  const boneIndicesByMesh = new Map<number, Map<string, number>>();
  for (const edit of edits) {
    const entry = meshEntries[edit.meshIndex];
    const mesh = entry?.mesh as THREE.SkinnedMesh | undefined;
    const position = mesh?.geometry.attributes.position;
    if (
      !mesh?.isSkinnedMesh ||
      mesh.name !== edit.meshName ||
      !position ||
      edit.vertexIndex >= position.count
    ) {
      continue;
    }
    let boneIndices = boneIndicesByMesh.get(edit.meshIndex);
    if (!boneIndices) {
      boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone.name, index]));
      boneIndicesByMesh.set(edit.meshIndex, boneIndices);
    }
    if (!writeVertexInfluences(mesh, edit.vertexIndex, edit.influences, boneIndices)) continue;
    const outline = entry.outlineMesh as THREE.SkinnedMesh | null;
    const sourceSkinIndex = mesh.geometry.attributes.skinIndex;
    const sourceSkinWeight = mesh.geometry.attributes.skinWeight;
    const outlineSkinIndex = outline?.geometry.attributes.skinIndex;
    const outlineSkinWeight = outline?.geometry.attributes.skinWeight;
    if (
      outline?.isSkinnedMesh &&
      sourceSkinIndex &&
      sourceSkinWeight &&
      outlineSkinIndex &&
      outlineSkinWeight
    ) {
      for (let slot = 0; slot < 4; slot++) {
        outlineSkinIndex.setComponent(
          edit.vertexIndex,
          slot,
          sourceSkinIndex.getComponent(edit.vertexIndex, slot)
        );
        outlineSkinWeight.setComponent(
          edit.vertexIndex,
          slot,
          sourceSkinWeight.getComponent(edit.vertexIndex, slot)
        );
      }
      outlineSkinIndex.needsUpdate = true;
      outlineSkinWeight.needsUpdate = true;
    }
  }
  for (const entry of meshEntries) {
    const mesh = entry.mesh as THREE.SkinnedMesh;
    if (
      mesh.isSkinnedMesh &&
      mesh.geometry.attributes.skinIndex &&
      mesh.geometry.attributes.skinWeight
    ) {
      mesh.geometry.attributes.skinIndex.needsUpdate = true;
      mesh.geometry.attributes.skinWeight.needsUpdate = true;
    }
  }
}

function getOppositeBoneName(boneName: string, names: Set<string>): string | null {
  const sideMatch = boneName.match(/left|right/i);
  if (!sideMatch) return null;
  const opposite = boneName.replace(/left|right/i, sideMatch[0].toLowerCase() === 'left' ? 'right' : 'left');
  return Array.from(names).find(name => name.toLowerCase() === opposite.toLowerCase()) ?? null;
}

function weightEditKey(meshIndex: number, meshName: string, vertexIndex: number): string {
  return `${meshIndex}:${meshName}:${vertexIndex}`;
}

interface WeightPaintUndoEntry {
  edit: ManualSkinWeightEdit;
  hadManualEdit: boolean;
}

export interface RigInstanceOptions {
  isPlayer?: boolean;
  outlinesEnabled?: boolean;
  url?: string;
  modelName?: string;
  initialMaterialMode?: CustomMaterialMode;
  companionFiles?: CompanionModelFile[];
  config?: Partial<CustomModelConfig>;
}

const DEFAULT_HUMANOID_LAYOUT: HumanoidSkeletonLayout = {
  pelvisY: 0.42,
  pelvisZ: 0,
  spineY: 0.52,
  spineZ: 0,
  chestY: 0.61,
  chestZ: 0,
  neckY: 0.71,
  neckZ: 0,
  headTopY: 0.96,
  headZ: 0,
  hipX: 0.08,
  hipZ: 0,
  kneeY: 0.21,
  kneeZ: 0,
  footY: 0.035,
  footZ: 0.02,
  torsoRadiusX: 0.11,
  shoulderX: 0.11,
  shoulderY: 0.64,
  shoulderZ: 0,
  elbowX: 0.24,
  elbowY: 0.63,
  elbowZ: 0,
  armEndX: 0.40,
  armEndY: 0.62,
  armEndZ: 0,
  armMinY: 0.50,
  hasBackAppendages: false,
  backAppendageZ: -0.09,
  rearSign: -1,
  armPose: 't-pose',
  proportionClass: 'chibi',
  hasFloatingHalo: false
};

export class CustomRigController {
  public group: THREE.Group;
  public transformGroup: THREE.Group;
  public modelRoot: THREE.Object3D;
  public skinnedMesh: THREE.SkinnedMesh;
  public skeleton: THREE.Skeleton;
  public bones: Record<string, THREE.Bone>;
  public mixer: THREE.AnimationMixer;
  public clips: RigAnimationClips;
  public allClips: THREE.AnimationClip[];
  public actions: Record<string, THREE.AnimationAction>;
  public clipActionsByName: Record<string, THREE.AnimationAction> = {};
  public currentActionName: string = 'idle';
  public currentClipName: string = 'idle';
  public skeletonHelper: THREE.SkeletonHelper;
  public outlineMesh: THREE.SkinnedMesh | THREE.Mesh | null = null;
  public weaponGroup: THREE.Group | null = null;
  public shieldMesh: THREE.Mesh | null = null;
  public toonMaterial: THREE.MeshToonMaterial;
  public texturedMaterial: THREE.MeshStandardMaterial;
  public meshEntries: MeshMaterialEntry[] = [];
  public currentMaterialMode: CustomMaterialMode = 'toon';
  public timeScale: number = 1.0;
  public metadata: CustomRigMetadata;

  private skeletonsToDispose: THREE.Skeleton[];
  private geometriesToDispose: THREE.BufferGeometry[];
  private materialsToDispose: THREE.Material[];
  private texturesToDispose: THREE.Texture[] = [];
  private weightPreviewOverlays: Array<{
    mesh: THREE.SkinnedMesh;
    source: THREE.SkinnedMesh;
    geometry: THREE.BufferGeometry;
    material: THREE.MeshBasicMaterial;
  }> = [];
  private weightPreviewVisible = false;
  private boneIndicesByMesh = new Map<number, Map<string, number>>();
  private manualWeightEditsByVertex = new Map<string, ManualSkinWeightEdit>();
  private activeWeightStroke = new Map<string, ManualSkinWeightEdit>();
  private activeWeightStrokeHadEdit = new Map<string, boolean>();
  private weightUndoStack: WeightPaintUndoEntry[][] = [];
  private attackCallback: (() => void) | null = null;
  private hitCallback: (() => void) | null = null;
  private bindPoseActive = false;
  private bindPoseAction: THREE.AnimationAction | null = null;
  private bindPosePreviousActionName = 'idle';
  private bindPosePreviousClipName = 'idle';
  private bindPoseActionTime = 0;

  public setWeaponsVisible(visible: boolean) {
    if (this.weaponGroup) this.weaponGroup.visible = visible;
    if (this.shieldMesh) this.shieldMesh.visible = visible;
    this.metadata.appliedConfig.weaponsEnabled = visible;
  }

  public applyDisplayConfig(partial: Partial<CustomModelConfig>) {
    const merged = normalizeCustomModelConfig({
      ...this.metadata.appliedConfig,
      ...partial
    });
    this.metadata.appliedConfig = merged;
    this.transformGroup.scale.setScalar(merged.scale);
    this.transformGroup.rotation.y = THREE.MathUtils.degToRad(merged.facingYawDeg);
    this.transformGroup.position.y = merged.groundOffsetY;
    this.setMaterialMode(merged.materialMode);
    this.setWeaponsVisible(merged.weaponsEnabled);
    this.setSpeed(merged.playbackSpeed);
    if (this.skeletonHelper.visible) {
      this.skeletonHelper.updateMatrixWorld(true);
    }
  }

  constructor(params: {
    group: THREE.Group;
    transformGroup: THREE.Group;
    modelRoot: THREE.Object3D;
    skeletonRoot: THREE.Object3D;
    skinnedMesh: THREE.SkinnedMesh;
    skeleton: THREE.Skeleton;
    allSkeletons: THREE.Skeleton[];
    bones: Record<string, THREE.Bone>;
    clips: RigAnimationClips;
    allClips: THREE.AnimationClip[];
    oneShotRoles: { attack: boolean; hit: boolean };
    toonMaterial: THREE.MeshToonMaterial;
    texturedMaterial: THREE.MeshStandardMaterial;
    meshEntries: MeshMaterialEntry[];
    outlineMesh: THREE.SkinnedMesh | THREE.Mesh | null;
    metadata: CustomRigMetadata;
    geometriesToDispose: THREE.BufferGeometry[];
    materialsToDispose: THREE.Material[];
  }) {
    this.group = params.group;
    this.transformGroup = params.transformGroup;
    this.modelRoot = params.modelRoot;
    this.skinnedMesh = params.skinnedMesh;
    this.skeleton = params.skeleton;
    this.skeletonsToDispose = params.allSkeletons;
    this.bones = params.bones;
    this.clips = params.clips;
    this.allClips = params.allClips;
    this.toonMaterial = params.toonMaterial;
    this.texturedMaterial = params.texturedMaterial;
    this.meshEntries = params.meshEntries;
    this.outlineMesh = params.outlineMesh;
    this.metadata = params.metadata;
    this.geometriesToDispose = params.geometriesToDispose;
    this.materialsToDispose = params.materialsToDispose;
    for (const edit of this.metadata.appliedConfig.manualWeightEdits) {
      this.manualWeightEditsByVertex.set(
        weightEditKey(edit.meshIndex, edit.meshName, edit.vertexIndex),
        edit
      );
    }

    this.skeletonHelper = new THREE.SkeletonHelper(params.skeletonRoot);
    this.skeletonHelper.visible = false;
    this.group.add(this.skeletonHelper);

    // Bind mixer to modelRoot so ALL bone tracks & multi-mesh hierarchies animate cleanly
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    this.actions = {
      idle: this.mixer.clipAction(this.clips.idle),
      attack: this.mixer.clipAction(this.clips.attack),
      walk: this.mixer.clipAction(this.clips.walk),
      hit: this.mixer.clipAction(this.clips.hit)
    };

    for (const clip of this.allClips) {
      if (!this.clipActionsByName[clip.name]) {
        this.clipActionsByName[clip.name] = this.mixer.clipAction(clip);
      }
    }

    if (params.oneShotRoles.attack) {
      this.actions.attack.setLoop(THREE.LoopOnce, 1);
      this.actions.attack.clampWhenFinished = true;
    }

    if (params.oneShotRoles.hit) {
      this.actions.hit.setLoop(THREE.LoopOnce, 1);
      this.actions.hit.clampWhenFinished = true;
    }

    this.mixer.addEventListener('finished', (e: { action: THREE.AnimationAction }) => {
      if (e.action === this.actions.attack) {
        if (this.attackCallback) {
          const cb = this.attackCallback;
          this.attackCallback = null;
          cb();
        }
        this.playIdle(0.22);
      } else if (e.action === this.actions.hit) {
        if (this.hitCallback) {
          const cb = this.hitCallback;
          this.hitCallback = null;
          cb();
        }
        this.playIdle(0.18);
      }
    });

    this.playIdle(0);
  }

  private switchToAction(
    roleName: string,
    next: THREE.AnimationAction,
    fadeDuration: number,
    clipLabel?: string
  ) {
    if (this.bindPoseActive) this.exitBindPoseMode();
    const prev =
      this.actions[this.currentActionName] ??
      this.clipActionsByName[this.currentClipName];

    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();

    if (prev && prev !== next && fadeDuration > 0) {
      prev.crossFadeTo(next, fadeDuration, true);
    } else if (prev && prev !== next) {
      prev.stop();
    }

    this.currentActionName = roleName;
    this.currentClipName = clipLabel ?? next.getClip().name;
  }

  public playIdle(fadeDuration: number = 0.2) {
    if (this.currentActionName === 'idle' && this.actions.idle.isRunning()) return;
    this.switchToAction('idle', this.actions.idle, fadeDuration, this.clips.idle.name);
  }

  public playAttack(onComplete?: () => void, fadeDuration: number = 0.1) {
    this.attackCallback = onComplete ?? null;
    this.switchToAction('attack', this.actions.attack, fadeDuration, this.clips.attack.name);
  }

  public playWalk(fadeDuration: number = 0.15) {
    if (this.currentActionName === 'walk' && this.actions.walk.isRunning()) return;
    this.switchToAction('walk', this.actions.walk, fadeDuration, this.clips.walk.name);
  }

  public playHit(fadeDuration: number = 0.08, onComplete?: () => void) {
    this.hitCallback = onComplete ?? null;
    this.switchToAction('hit', this.actions.hit, fadeDuration, this.clips.hit.name);
  }

  public playClipByName(name: string, fadeDuration: number = 0.18) {
    const action = this.clipActionsByName[name];
    if (!action) return;
    action.setLoop(THREE.LoopRepeat, Infinity);
    this.switchToAction(`custom:${name}`, action, fadeDuration, name);
  }

  /**
   * Freezes the rig in its bind/rest pose. Landmark placement and weight painting
   * raycast against the static bind geometry, so showing that same pose avoids
   * clicking on an animated surface that no longer matches the mesh being edited.
   */
  public enterBindPoseMode() {
    if (this.bindPoseActive) return;
    const action =
      this.actions[this.currentActionName] ??
      this.clipActionsByName[this.currentClipName] ??
      this.actions.idle;
    this.bindPosePreviousActionName = this.currentActionName;
    this.bindPosePreviousClipName = this.currentClipName;
    this.bindPoseAction = action;
    this.bindPoseActionTime = action.time;
    this.bindPoseActive = true;
    this.mixer.stopAllAction();
    for (const skeleton of this.skeletonsToDispose) skeleton.pose();
    this.modelRoot.updateMatrixWorld(true);
  }

  public exitBindPoseMode() {
    if (!this.bindPoseActive) return;
    this.bindPoseActive = false;
    const action = this.bindPoseAction ?? this.actions.idle;
    this.bindPoseAction = null;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.play();
    action.time = this.bindPoseActionTime;
    this.currentActionName = this.bindPosePreviousActionName;
    this.currentClipName = this.bindPosePreviousClipName;
    this.mixer.update(0);
    this.modelRoot.updateMatrixWorld(true);
  }

  public get isBindPoseActive(): boolean {
    return this.bindPoseActive;
  }

  public setSpeed(speed: number) {
    this.timeScale = Math.max(0.1, Math.min(3.0, speed));
    this.mixer.timeScale = this.timeScale;
    this.metadata.appliedConfig.playbackSpeed = this.timeScale;
  }

  public setMaterialMode(mode: CustomMaterialMode) {
    this.currentMaterialMode = mode;
    this.metadata.appliedConfig.materialMode = mode;
    for (const entry of this.meshEntries) {
      entry.mesh.material = mode === 'toon' ? entry.toonMat : entry.texturedMat;
      if (entry.outlineMesh) {
        entry.outlineMesh.visible = mode === 'toon';
      }
    }
    if (this.meshEntries.length === 0) {
      this.skinnedMesh.material = mode === 'toon' ? this.toonMaterial : this.texturedMaterial;
      if (this.outlineMesh) this.outlineMesh.visible = mode === 'toon';
    }
  }

  public applyCustomTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this.texturesToDispose.push(texture);

    const applyToMats = (mats: THREE.Material | THREE.Material[], hadNativeColors: boolean | undefined) => {
      const list = Array.isArray(mats) ? mats : [mats];
      for (const m of list) {
        const anyM = m as unknown as {
          map?: THREE.Texture | null;
          color?: THREE.Color;
          vertexColors?: boolean;
          needsUpdate: boolean;
        };
        anyM.map = texture;
        if (anyM.color) anyM.color.setHex(0xffffff);
        if (!hadNativeColors) {
          anyM.vertexColors = false;
        }
        anyM.needsUpdate = true;
      }
    };

    for (const entry of this.meshEntries) {
      applyToMats(entry.toonMat, entry.hadNativeColors);
      applyToMats(entry.texturedMat, entry.hadNativeColors);
    }
    this.metadata.hasNativeTextures = true;
    this.setMaterialMode(this.currentMaterialMode);
  }

  public setSkeletonVisible(visible: boolean) {
    this.skeletonHelper.visible = visible;
  }

  public setWeightPreview(visible: boolean) {
    this.weightPreviewVisible = visible;
    if (!visible) {
      for (const overlay of this.weightPreviewOverlays) {
        overlay.mesh.removeFromParent();
        overlay.geometry.dispose();
        overlay.material.dispose();
      }
      this.weightPreviewOverlays = [];
      return;
    }

    if (this.weightPreviewOverlays.length > 0) return;

    const armBones = new Set([
      this.bones.leftShoulder,
      this.bones.leftArm,
      this.bones.leftHand,
      this.bones.rightShoulder,
      this.bones.rightArm,
      this.bones.rightHand
    ].filter((bone): bone is THREE.Bone => Boolean(bone)));
    const torsoBones = new Set([
      this.bones.pelvis,
      this.bones.spine,
      this.bones.chest
    ].filter((bone): bone is THREE.Bone => Boolean(bone)));

    for (const entry of this.meshEntries) {
      const source = entry.mesh;
      if (!(source as THREE.SkinnedMesh).isSkinnedMesh) continue;

      const skinnedSource = source as THREE.SkinnedMesh;
      const skinIndex = source.geometry.attributes.skinIndex;
      const skinWeight = source.geometry.attributes.skinWeight;
      if (!skinIndex || !skinWeight) continue;

      const geometry = source.geometry.clone();
      const colors = new Float32Array(skinIndex.count * 3);
      for (let i = 0; i < skinIndex.count; i++) {
        let armInfluence = 0;
        let torsoInfluence = 0;
        for (let j = 0; j < 4; j++) {
          const boneIndex = skinIndex.getComponent(i, j);
          const influence = skinWeight.getComponent(i, j);
          const bone = skinnedSource.skeleton.bones[boneIndex];
          if (armBones.has(bone)) armInfluence += influence;
          if (torsoBones.has(bone)) torsoInfluence += influence;
        }

        colors[i * 3] = 0.10 + Math.min(1, armInfluence) * 0.88;
        colors[i * 3 + 1] = 0.12 + Math.min(1, Math.min(armInfluence, torsoInfluence)) * 0.55;
        colors[i * 3 + 2] = 0.12 + Math.min(1, torsoInfluence) * 0.88;
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.DoubleSide
      });
      const overlayMesh = new THREE.SkinnedMesh(geometry, material);
      overlayMesh.name = `${source.name || 'mesh'}_weight_preview`;
      overlayMesh.frustumCulled = false;
      overlayMesh.position.copy(source.position);
      overlayMesh.quaternion.copy(source.quaternion);
      overlayMesh.scale.copy(source.scale);
      overlayMesh.bind(skinnedSource.skeleton, skinnedSource.bindMatrix);
      source.parent?.add(overlayMesh);
      this.weightPreviewOverlays.push({
        mesh: overlayMesh,
        source: skinnedSource,
        geometry,
        material
      });
    }
  }

  public beginWeightPaintStroke() {
    this.activeWeightStroke.clear();
    this.activeWeightStrokeHadEdit.clear();
  }

  public paintWeightsAt(
    worldPoint: THREE.Vector3,
    selectedBoneName: string,
    radius: number,
    strength: number,
    mode: SkinWeightPaintMode,
    mirror: boolean
  ): number {
    const brushRadius = clamp(radius, 0.01, 0.4);
    const brushStrength = clamp(strength, 0.01, 1);
    this.modelRoot.updateMatrixWorld(true);
    const modelPoint = this.modelRoot.worldToLocal(worldPoint.clone());
    const editedVerticesByMesh = new Map<number, Set<number>>();

    for (let meshIndex = 0; meshIndex < this.meshEntries.length; meshIndex++) {
      const mesh = this.meshEntries[meshIndex].mesh as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !mesh.skeleton) continue;
      const position = mesh.geometry.attributes.position;
      const skinWeight = mesh.geometry.attributes.skinWeight;
      if (!position || !skinWeight) continue;

      let boneIndices = this.boneIndicesByMesh.get(meshIndex);
      if (!boneIndices) {
        boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone.name, index]));
        this.boneIndicesByMesh.set(meshIndex, boneIndices);
      }

      const boneNames = new Set(boneIndices.keys());
      const centers = [{ point: worldPoint.clone(), boneName: selectedBoneName }];
      const oppositeBone = mirror ? getOppositeBoneName(selectedBoneName, boneNames) : null;
      if (oppositeBone) {
        const mirroredModelPoint = modelPoint.clone();
        mirroredModelPoint.x *= -1;
        centers.push({
          point: this.modelRoot.localToWorld(mirroredModelPoint),
          boneName: oppositeBone
        });
      }

      mesh.updateMatrixWorld(true);
      for (const center of centers) {
        const targetBoneIndex = boneIndices.get(center.boneName);
        if (targetBoneIndex === undefined) continue;
        const targetBone = mesh.skeleton.bones[targetBoneIndex];
        if (!targetBone) continue;

        const samples: Array<{ vertexIndex: number; falloff: number }> = [];
        const vertex = new THREE.Vector3();
        for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex++) {
          mesh.getVertexPosition(vertexIndex, vertex);
          mesh.localToWorld(vertex);
          const distance = vertex.distanceTo(center.point);
          if (distance < brushRadius) {
            samples.push({
              vertexIndex,
              falloff: 1 - smoothstep(0, brushRadius, distance)
            });
          }
        }
        if (samples.length === 0) continue;

        const averageInfluence =
          mode === 'smooth'
            ? samples.reduce(
                (sum, sample) =>
                  sum + (getVertexInfluences(mesh, sample.vertexIndex).find(
                    influence => influence.boneName === center.boneName
                  )?.weight ?? 0),
                0
              ) / samples.length
            : 0;

        for (const sample of samples) {
          const oldInfluences = getVertexInfluences(mesh, sample.vertexIndex);
          const oldTarget =
            oldInfluences.find(influence => influence.boneName === center.boneName)?.weight ?? 0;
          const blend = brushStrength * sample.falloff;
          const nextTarget =
            mode === 'paint'
              ? oldTarget + (1 - oldTarget) * blend
              : mode === 'erase'
                ? oldTarget * (1 - blend)
                : oldTarget + (averageInfluence - oldTarget) * blend;
          if (Math.abs(nextTarget - oldTarget) < 0.0001) continue;

          const key = weightEditKey(meshIndex, mesh.name, sample.vertexIndex);
          if (!this.activeWeightStroke.has(key)) {
            this.activeWeightStroke.set(key, {
              meshIndex,
              meshName: mesh.name,
              vertexIndex: sample.vertexIndex,
              influences: oldInfluences.map(influence => ({ ...influence }))
            });
            this.activeWeightStrokeHadEdit.set(
              key,
              this.manualWeightEditsByVertex.has(key)
            );
          }

          const otherTotal = oldInfluences
            .filter(influence => influence.boneName !== center.boneName)
            .reduce((sum, influence) => sum + influence.weight, 0);
          const nextInfluences: ManualSkinWeightInfluence[] =
            otherTotal > 0
              ? oldInfluences
                  .filter(influence => influence.boneName !== center.boneName)
                  .map(influence => ({
                    boneName: influence.boneName,
                    weight: influence.weight * ((1 - nextTarget) / otherTotal)
                  }))
              : [];
          if (nextTarget > 0.0001) {
            nextInfluences.push({ boneName: center.boneName, weight: nextTarget });
          }
          if (otherTotal === 0 && nextTarget < 0.9999) {
            const parentBone =
              targetBone.parent instanceof THREE.Bone &&
              boneIndices.has(targetBone.parent.name)
                ? targetBone.parent
                : mesh.skeleton.bones.find(bone => bone.name !== center.boneName);
            const fallbackBone =
              parentBone?.name !== center.boneName
                ? parentBone
                : mesh.skeleton.bones.find(bone => bone.name !== center.boneName);
            if (fallbackBone) {
              nextInfluences.push({
                boneName: fallbackBone.name,
                weight: 1 - nextTarget
              });
            }
          }
          if (!writeVertexInfluences(mesh, sample.vertexIndex, nextInfluences, boneIndices)) continue;
          let editedVertices = editedVerticesByMesh.get(meshIndex);
          if (!editedVertices) {
            editedVertices = new Set<number>();
            editedVerticesByMesh.set(meshIndex, editedVertices);
          }
          editedVertices.add(sample.vertexIndex);
        }
      }

      const editedVertices = editedVerticesByMesh.get(meshIndex);
      if (editedVertices && editedVertices.size > 0) {
        mesh.geometry.attributes.skinIndex.needsUpdate = true;
        mesh.geometry.attributes.skinWeight.needsUpdate = true;
        for (const overlay of this.weightPreviewOverlays) {
          if (overlay.source !== mesh) continue;
          const overlaySkinIndex = overlay.geometry.attributes.skinIndex;
          const overlaySkinWeight = overlay.geometry.attributes.skinWeight;
          const sourceSkinIndex = mesh.geometry.attributes.skinIndex;
          const sourceSkinWeight = mesh.geometry.attributes.skinWeight;
          if (!overlaySkinIndex || !overlaySkinWeight || !sourceSkinIndex || !sourceSkinWeight) continue;
          for (const vertexIndex of editedVertices) {
            for (let slot = 0; slot < 4; slot++) {
              overlaySkinIndex.setComponent(
                vertexIndex,
                slot,
                sourceSkinIndex.getComponent(vertexIndex, slot)
              );
              overlaySkinWeight.setComponent(
                vertexIndex,
                slot,
                sourceSkinWeight.getComponent(vertexIndex, slot)
              );
            }
          }
          overlaySkinIndex.needsUpdate = true;
          overlaySkinWeight.needsUpdate = true;
        }
      }
    }

    let editedVertexCount = 0;
    for (const [meshIndex, editedVertices] of editedVerticesByMesh) {
      const mesh = this.meshEntries[meshIndex].mesh as THREE.SkinnedMesh;
      const outline = this.meshEntries[meshIndex].outlineMesh as THREE.SkinnedMesh | null;
      const outlineSkinIndex = outline?.geometry.attributes.skinIndex;
      const outlineSkinWeight = outline?.geometry.attributes.skinWeight;
      const sourceSkinIndex = mesh.geometry.attributes.skinIndex;
      const sourceSkinWeight = mesh.geometry.attributes.skinWeight;
      for (const vertexIndex of editedVertices) {
        const key = weightEditKey(meshIndex, mesh.name, vertexIndex);
        const previousEdit = this.activeWeightStroke.get(key);
        if (previousEdit) {
          this.manualWeightEditsByVertex.set(key, {
            ...previousEdit,
            influences: getVertexInfluences(mesh, vertexIndex)
          });
        }
        if (
          outline?.isSkinnedMesh &&
          outlineSkinIndex &&
          outlineSkinWeight &&
          sourceSkinIndex &&
          sourceSkinWeight
        ) {
          for (let slot = 0; slot < 4; slot++) {
            outlineSkinIndex.setComponent(vertexIndex, slot, sourceSkinIndex.getComponent(vertexIndex, slot));
            outlineSkinWeight.setComponent(vertexIndex, slot, sourceSkinWeight.getComponent(vertexIndex, slot));
          }
        }
        editedVertexCount++;
      }
      if (outlineSkinIndex && outlineSkinWeight) {
        outlineSkinIndex.needsUpdate = true;
        outlineSkinWeight.needsUpdate = true;
      }
    }
    return editedVertexCount;
  }

  public endWeightPaintStroke(): number {
    const before = Array.from(this.activeWeightStroke, ([key, edit]) => ({
      edit,
      hadManualEdit: this.activeWeightStrokeHadEdit.get(key) ?? false
    }));
    this.activeWeightStroke.clear();
    this.activeWeightStrokeHadEdit.clear();
    if (before.length === 0) return 0;

    this.weightUndoStack.push(before);
    if (this.weightUndoStack.length > 30) this.weightUndoStack.shift();
    this.metadata.appliedConfig = normalizeCustomModelConfig({
      ...this.metadata.appliedConfig,
      manualWeightEdits: Array.from(this.manualWeightEditsByVertex.values())
    });
    if (this.weightPreviewVisible) {
      this.setWeightPreview(false);
      this.setWeightPreview(true);
    }
    return before.length;
  }

  public get canUndoWeightPaint(): boolean {
    return this.weightUndoStack.length > 0;
  }

  public undoWeightPaintStroke(): number {
    const previous = this.weightUndoStack.pop();
    if (!previous) return 0;

    for (const { edit, hadManualEdit } of previous) {
      const mesh = this.meshEntries[edit.meshIndex]?.mesh as THREE.SkinnedMesh | undefined;
      if (!mesh?.isSkinnedMesh) continue;
      let boneIndices = this.boneIndicesByMesh.get(edit.meshIndex);
      if (!boneIndices) {
        boneIndices = new Map(mesh.skeleton.bones.map((bone, index) => [bone.name, index]));
        this.boneIndicesByMesh.set(edit.meshIndex, boneIndices);
      }
      if (!writeVertexInfluences(mesh, edit.vertexIndex, edit.influences, boneIndices)) continue;
      const key = weightEditKey(edit.meshIndex, edit.meshName, edit.vertexIndex);
      if (hadManualEdit) {
        this.manualWeightEditsByVertex.set(key, {
          ...edit,
          influences: edit.influences.map(influence => ({ ...influence }))
        });
      } else {
        this.manualWeightEditsByVertex.delete(key);
      }

      const outline = this.meshEntries[edit.meshIndex].outlineMesh as THREE.SkinnedMesh | null;
      if (outline?.isSkinnedMesh) {
        const sourceSkinIndex = mesh.geometry.attributes.skinIndex;
        const sourceSkinWeight = mesh.geometry.attributes.skinWeight;
        const outlineSkinIndex = outline.geometry.attributes.skinIndex;
        const outlineSkinWeight = outline.geometry.attributes.skinWeight;
        if (sourceSkinIndex && sourceSkinWeight && outlineSkinIndex && outlineSkinWeight) {
          for (let slot = 0; slot < 4; slot++) {
            outlineSkinIndex.setComponent(
              edit.vertexIndex,
              slot,
              sourceSkinIndex.getComponent(edit.vertexIndex, slot)
            );
            outlineSkinWeight.setComponent(
              edit.vertexIndex,
              slot,
              sourceSkinWeight.getComponent(edit.vertexIndex, slot)
            );
          }
          outlineSkinIndex.needsUpdate = true;
          outlineSkinWeight.needsUpdate = true;
        }
      }
      mesh.geometry.attributes.skinIndex.needsUpdate = true;
      mesh.geometry.attributes.skinWeight.needsUpdate = true;
    }

    this.metadata.appliedConfig = normalizeCustomModelConfig({
      ...this.metadata.appliedConfig,
      manualWeightEdits: Array.from(this.manualWeightEditsByVertex.values())
    });
    if (this.weightPreviewVisible) {
      this.setWeightPreview(false);
      this.setWeightPreview(true);
    }
    return previous.length;
  }

  public update(dt: number) {
    if (!this.bindPoseActive) {
      this.mixer.update(dt);
    }
    if (this.skeletonHelper.visible) {
      this.skeletonHelper.updateMatrixWorld(true);
    }
  }

  public dispose() {
    this.mixer.stopAllAction();
    this.setWeightPreview(false);
    this.mixer.uncacheRoot(this.modelRoot);
    for (const skel of this.skeletonsToDispose) {
      skel.dispose();
    }
    this.skeletonHelper.dispose();
    for (const geo of this.geometriesToDispose) {
      geo.dispose();
    }
    for (const mat of this.materialsToDispose) {
      mat.dispose();
    }
    for (const tex of this.texturesToDispose) {
      tex.dispose();
    }
    this.toonMaterial.dispose();
    this.texturedMaterial.dispose();
  }
}

// Global cached GLTF & texture for default model01.glb
let cachedDefaultGltf: GLTF | null = null;
let cachedBaseGeometry: THREE.BufferGeometry | null = null;
let cachedTexture: THREE.Texture | null = null;
let defaultGltfPromise: Promise<GLTF> | null = null;

// Optional runtime override when user imports a custom model in ModelViewerModal
let customHeroOverrideBuffer: ArrayBuffer | null = null;
let customHeroOverrideName: string | null = null;
let customHeroOverrideCompanions: CompanionModelFile[] = [];
let customHeroOverrideTextureBuffer: ArrayBuffer | null = null;
let customHeroOverrideConfig: CustomModelConfig | null = null;

export function setCustomHeroModelOverride(
  buffer: ArrayBuffer | null,
  name?: string,
  companions?: CompanionModelFile[],
  config?: Partial<CustomModelConfig> | null
) {
  customHeroOverrideBuffer = buffer;
  customHeroOverrideName = name ?? null;
  customHeroOverrideCompanions = companions ? [...companions] : [];
  customHeroOverrideConfig = config ? normalizeCustomModelConfig(config) : null;
  if (!buffer) {
    customHeroOverrideTextureBuffer = null;
    customHeroOverrideConfig = null;
  }
}

export function setCustomHeroTextureOverride(textureBuffer: ArrayBuffer | null) {
  customHeroOverrideTextureBuffer = textureBuffer;
}

export function setCustomHeroConfigOverride(config: Partial<CustomModelConfig> | null) {
  customHeroOverrideConfig = config ? normalizeCustomModelConfig(config) : null;
}

export function getCustomHeroModelOverride(): {
  buffer: ArrayBuffer;
  name: string;
  companions: CompanionModelFile[];
  textureBuffer: ArrayBuffer | null;
  config: CustomModelConfig | null;
} | null {
  if (!customHeroOverrideBuffer) return null;
  return {
    buffer: customHeroOverrideBuffer,
    name: customHeroOverrideName ?? 'custom_model.glb',
    companions: customHeroOverrideCompanions,
    textureBuffer: customHeroOverrideTextureBuffer,
    config: customHeroOverrideConfig
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function eulerToQuat(x: number, y: number, z: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

function normalizeBoneNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/^bip01[_ ]?/, '')
    .replace(/^def[-_]/, '')
    .replace(/^valvebiped[_.]?/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Matches bones from arbitrary rigs (Mixamo, ReadyPlayerMe, Blender, Rigify, VRM, custom)
 * into canonical humanoid slots without modifying bone names or hierarchy.
 */
export function matchHumanoidBones(bones: THREE.Bone[]): Record<string, THREE.Bone> {
  const map: Record<string, THREE.Bone> = {};
  if (bones.length === 0) return map;

  const findByPatterns = (patterns: RegExp[], exclude?: RegExp): THREE.Bone | undefined => {
    for (const pattern of patterns) {
      const hit = bones.find(b => {
        const raw = b.name.toLowerCase();
        if (exclude && exclude.test(raw)) return false;
        const norm = normalizeBoneNameKey(b.name);
        return pattern.test(raw) || pattern.test(norm);
      });
      if (hit) return hit;
    }
    return undefined;
  };

  map.root =
    findByPatterns([/^root$/, /^armature$/, /^skeleton$/]) ?? bones[0];

  map.pelvis =
    findByPatterns([/pelvis/, /hips?$/, /^hip$/, /cog/]) ??
    bones.find(b => b !== map.root) ??
    bones[0];

  map.spine =
    findByPatterns([/^spine$/, /spine0?1$/, /spine_?0?1/, /abdomen/, /waist/, /spine/]) ??
    map.pelvis;

  map.chest =
    findByPatterns([/chest/, /upperchest/, /spine0?2$/, /spine0?3$/, /torso/, /ribcage/]) ??
    map.spine;

  map.head =
    findByPatterns([/^head$/, /headtop/, /cranium/, /head/], /headend|head_end/) ??
    findByPatterns([/neck/]) ??
    map.chest;

  // Left/right chain detection. Mixamo uses "mixamorig:LeftArm" (no separator
  // after the side word), while Blender/Rigify use "upper_arm.L" / "Bip01 L
  // UpperArm". Match side words at a token boundary OR as a prefix/suffix, and
  // single-letter sides only as standalone tokens so "lowerarm"/"leg" never
  // get misclassified.
  const hasSideWord = (raw: string, word: 'left' | 'right'): boolean =>
    new RegExp(`(^|[^a-z])${word}`).test(raw) || new RegExp(`${word}$`).test(raw);
  const isLeft = (n: string) => {
    const raw = n.toLowerCase();
    return hasSideWord(raw, 'left') || /(^|[^a-z])l([^a-z]|$)/.test(raw);
  };
  const isRight = (n: string) => {
    const raw = n.toLowerCase();
    return hasSideWord(raw, 'right') || /(^|[^a-z])r([^a-z]|$)/.test(raw);
  };

  const assign = (slot: string, bone: THREE.Bone | undefined) => {
    if (bone) map[slot] = bone;
  };

  assign(
    'leftShoulder',
    bones.find(b => isLeft(b.name) && /shoulder|clavicle|collar/i.test(b.name)) ??
      findByPatterns([/leftshoulder/, /shoulderl/, /claviclel/])
  );

  assign(
    'leftArm',
    bones.find(
      b =>
        isLeft(b.name) &&
        /upperarm|upper_arm|arm|humerus|bicep/i.test(b.name) &&
        !/forearm|lower|shoulder|clavicle|hand/i.test(b.name)
    ) ??
      bones.find(b => isLeft(b.name) && /forearm|lowerarm|lower_arm|elbow/i.test(b.name)) ??
      findByPatterns([/leftarm/, /arml/, /upperarml/])
  );

  assign(
    'leftHand',
    bones.find(
      b =>
        isLeft(b.name) &&
        /hand|wrist/i.test(b.name) &&
        !/finger|thumb|index|middle|ring|pinky/i.test(b.name)
    )
  );

  // Right arm chain
  assign(
    'rightShoulder',
    bones.find(b => isRight(b.name) && /shoulder|clavicle|collar/i.test(b.name)) ??
      findByPatterns([/rightshoulder/, /shoulderr/, /clavicler/])
  );

  assign(
    'rightArm',
    bones.find(
      b =>
        isRight(b.name) &&
        /upperarm|upper_arm|arm|humerus|bicep/i.test(b.name) &&
        !/forearm|lower|shoulder|clavicle|hand/i.test(b.name)
    ) ??
      bones.find(b => isRight(b.name) && /forearm|lowerarm|lower_arm|elbow/i.test(b.name)) ??
      findByPatterns([/rightarm/, /armr/, /upperarmr/])
  );

  assign(
    'rightHand',
    bones.find(
      b =>
        isRight(b.name) &&
        /hand|wrist/i.test(b.name) &&
        !/finger|thumb|index|middle|ring|pinky/i.test(b.name)
    )
  );

  // Left leg chain
  assign(
    'leftHip',
    bones.find(b => isLeft(b.name) && /upleg|up_leg|thigh|hip|femur/i.test(b.name)) ??
      findByPatterns([/leftupleg/, /leftthigh/, /lefthip/])
  );

  assign(
    'leftLeg',
    bones.find(
      b =>
        isLeft(b.name) &&
        (/lowerleg|lower_leg|calf|shin|knee|tibia/i.test(b.name) ||
          (/leg/i.test(b.name) && !/upleg|up_leg/i.test(b.name)))
    ) ?? map.leftHip
  );

  // Right leg chain
  assign(
    'rightHip',
    bones.find(b => isRight(b.name) && /upleg|up_leg|thigh|hip|femur/i.test(b.name)) ??
      findByPatterns([/rightupleg/, /rightthigh/, /righthip/])
  );

  assign(
    'rightLeg',
    bones.find(
      b =>
        isRight(b.name) &&
        (/lowerleg|lower_leg|calf|shin|knee|tibia/i.test(b.name) ||
          (/leg/i.test(b.name) && !/upleg|up_leg/i.test(b.name)))
    ) ?? map.rightHip
  );

  return map;
}

function medianOf(arr: number[], fallback: number): number {
  if (arr.length === 0) return fallback;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function quantileOf(sortedArr: number[], q: number, fallback: number): number {
  if (sortedArr.length === 0) return fallback;
  const idx = clamp(Math.floor((sortedArr.length - 1) * q), 0, sortedArr.length - 1);
  return sortedArr[idx];
}

/**
 * Analyzes a normalized (height ~ 1.0, Y >= 0, centered XZ) humanoid BufferGeometry
 * to fit the 18-bone full-body rig cleanly across chibi, balanced, and tall anime/humanoid
 * proportions, T-pose/A-pose arms, floating halos, and rear wings/capes.
 */
export function analyzeHumanoidGeometry(
  geometry: THREE.BufferGeometry,
  config?: Partial<CustomModelConfig>
): HumanoidSkeletonLayout {
  const posAttr = geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return { ...DEFAULT_HUMANOID_LAYOUT };

  const count = posAttr.count;

  // 0. Establish dense torso core Z & half-depth so rear wings/capes/ponytails never skew measurements
  const coreZs: number[] = [];
  const footZsRaw: number[] = [];
  const shinZsRaw: number[] = [];
  for (let i = 0; i < count; i++) {
    const ax = Math.abs(posAttr.getX(i));
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (y >= 0.42 && y <= 0.78 && ax < 0.115) {
      coreZs.push(z);
    }
    if (y >= 0.0 && y <= 0.08 && ax > 0.015 && ax < 0.16) {
      footZsRaw.push(z);
    } else if (y >= 0.10 && y <= 0.22 && ax > 0.015 && ax < 0.16) {
      shinZsRaw.push(z);
    }
  }
  coreZs.sort((a, b) => a - b);
  const coreCenterZ = quantileOf(coreZs, 0.5, 0);
  const q25Z = quantileOf(coreZs, 0.25, coreCenterZ - 0.05);
  const q75Z = quantileOf(coreZs, 0.75, coreCenterZ + 0.05);
  const torsoHalfDepth = clamp((q75Z - q25Z) * 0.65, 0.045, 0.13);

  // Determine whether back lies at -Z (standard +Z forward) or +Z (flipped model)
  let rearSign: -1 | 1 = -1;
  if (footZsRaw.length >= 6 && shinZsRaw.length >= 6) {
    const footMedZ = medianOf(footZsRaw, coreCenterZ);
    const shinMedZ = medianOf(shinZsRaw, coreCenterZ);
    if (footMedZ < shinMedZ - 0.014) {
      rearSign = 1;
    }
  }

  // Detect rear appendages (wings, long cloak tails, trailing hair) sticking out laterally & behind torso
  const candidateRearGap = Math.max(0.062, torsoHalfDepth * 1.15);
  const backThresholdProbe = coreCenterZ + rearSign * candidateRearGap;
  let totalLateralUpper = 0;
  let rearLateralUpper = 0;
  let oppositeLateralUpper = 0;
  for (let i = 0; i < count; i++) {
    const ax = Math.abs(posAttr.getX(i));
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (y >= 0.30 && y <= 0.88 && ax > 0.13) {
      totalLateralUpper++;
      if ((rearSign < 0 && z < backThresholdProbe) || (rearSign > 0 && z > backThresholdProbe)) {
        rearLateralUpper++;
      } else if (
        (rearSign < 0 && z > coreCenterZ + candidateRearGap) ||
        (rearSign > 0 && z < coreCenterZ - candidateRearGap)
      ) {
        oppositeLateralUpper++;
      }
    }
  }
  // If strong asymmetric rear cluster lies on opposite side, flip rearSign automatically
  if (oppositeLateralUpper > rearLateralUpper * 2.2 && oppositeLateralUpper >= 16) {
    rearSign = (rearSign === -1 ? 1 : -1) as -1 | 1;
  }
  const backAppendageZ = coreCenterZ + rearSign * candidateRearGap;
  const effectiveRearCount = Math.max(rearLateralUpper, oppositeLateralUpper);
  const detectedBackAppendages =
    totalLateralUpper >= 12 &&
    effectiveRearCount >= Math.max(10, Math.floor(totalLateralUpper * 0.22));
  const isolateBack =
    detectedBackAppendages && config?.isolateBackAppendages !== false;

  const isRearAppendage = (z: number) =>
    isolateBack && (rearSign < 0 ? z < backAppendageZ : z > backAppendageZ);

  // 1. Detect pelvis split height across wide range [0.22..0.58] (supports both chibi ~0.41 and tall anime ~0.50)
  // Restrict strictly to hip/leg X columns (|x| <= 0.16) so lateral arms/capes never masquerade as a leg split!
  let pelvisY = 0.41;
  let bestSplitScore = -1;
  for (let band = 0; band < 12; band++) {
    const y0 = 0.22 + band * 0.03;
    const y1 = y0 + 0.03;
    let coreTotal = 0;
    let centerCount = 0;
    let leftCount = 0;
    let rightCount = 0;
    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      if (y >= y0 && y < y1) {
        if (isRearAppendage(posAttr.getZ(i))) continue;
        const x = posAttr.getX(i);
        const ax = Math.abs(x);
        if (ax > 0.16) continue;
        coreTotal++;
        if (ax < 0.025) {
          centerCount++;
        } else if (x < -0.025) {
          leftCount++;
        } else {
          rightCount++;
        }
      }
    }
    if (coreTotal >= 4 && leftCount >= 2 && rightCount >= 2) {
      const centerRatio = centerCount / coreTotal;
      if (centerRatio < 0.25) {
        const yMid = (y0 + y1) * 0.5;
        if (yMid > bestSplitScore) {
          bestSplitScore = yMid;
        }
      }
    }
  }
  if (bestSplitScore > 0) {
    pelvisY = clamp(bestSplitScore + 0.035, 0.35, 0.55);
  }
  if (config?.pelvisHeightOffset) {
    pelvisY = clamp(pelvisY + config.pelvisHeightOffset, 0.30, 0.60);
  }

  // 2. Sample waist radius above detected pelvisY and leg spread below pelvisY
  const waistAbsX: number[] = [];
  const lowerAbsX: number[] = [];
  const waistMinY = clamp(pelvisY + 0.01, 0.34, 0.58);
  const waistMaxY = clamp(pelvisY + 0.19, 0.48, 0.72);

  for (let i = 0; i < count; i++) {
    const x = Math.abs(posAttr.getX(i));
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (isRearAppendage(z)) continue;
    if (y >= waistMinY && y <= waistMaxY && x < 0.23) {
      waistAbsX.push(x);
    }
    if (y >= 0.03 && y <= pelvisY - 0.06 && x > 0.015) {
      lowerAbsX.push(x);
    }
  }

  waistAbsX.sort((a, b) => a - b);
  const torsoRadiusX =
    waistAbsX.length > 0
      ? clamp(waistAbsX[Math.floor(waistAbsX.length * 0.90)], 0.075, 0.21)
      : 0.11;

  // 3. Detect arm span vertices sticking out beyond torso core (filtering out rear wings/coat tails!)
  const armThresholdX = torsoRadiusX * 1.30;
  const armScanMinY = clamp(pelvisY - 0.06, 0.30, 0.50);
  const armScanMaxY = 0.84;
  let armMaxX = torsoRadiusX * 1.8;
  let armMinY = 0.62;
  for (let i = 0; i < count; i++) {
    const ax = Math.abs(posAttr.getX(i));
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (isRearAppendage(z)) continue;
    if (y >= armScanMinY && y <= armScanMaxY && ax > armThresholdX) {
      if (ax > armMaxX) armMaxX = ax;
      if (y < armMinY) armMinY = y;
    }
  }

  const innerArmYs: number[] = [];
  const innerArmZs: number[] = [];
  const midArmYs: number[] = [];
  const midArmZs: number[] = [];
  const outerArmYs: number[] = [];
  const outerArmZs: number[] = [];

  const elbowCutLow = lerp(torsoRadiusX, armMaxX, 0.34);
  const elbowCutHigh = lerp(torsoRadiusX, armMaxX, 0.68);

  for (let i = 0; i < count; i++) {
    const ax = Math.abs(posAttr.getX(i));
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (isRearAppendage(z)) continue;
    if (y < armScanMinY || y > armScanMaxY) continue;

    if (ax >= armThresholdX && ax < elbowCutLow) {
      innerArmYs.push(y);
      innerArmZs.push(z);
    } else if (ax >= elbowCutLow && ax < elbowCutHigh) {
      midArmYs.push(y);
      midArmZs.push(z);
    } else if (ax >= elbowCutHigh) {
      outerArmYs.push(y);
      outerArmZs.push(z);
    }
  }

  const armEndY = clamp(medianOf(outerArmYs, 0.62), 0.34, 0.78);
  let shoulderY = clamp(medianOf(innerArmYs, Math.max(armEndY + 0.015, pelvisY + 0.20)), 0.52, 0.80);
  if (config?.shoulderHeightOffset) {
    shoulderY = clamp(shoulderY + config.shoulderHeightOffset, pelvisY + 0.12, 0.84);
  }
  const elbowY = clamp(medianOf(midArmYs, lerp(shoulderY, armEndY, 0.5)), 0.38, 0.79);

  const shoulderX = clamp(torsoRadiusX * 0.62, 0.05, 0.13);
  const baseArmEndX = clamp(armMaxX * 0.94, torsoRadiusX * 1.45, 0.52);
  const armEndX = clamp(baseArmEndX * (config?.armSpanScale ?? 1.0), torsoRadiusX * 1.35, 0.62);
  const elbowX = lerp(shoulderX, armEndX, 0.48);

  const armEndZ = clamp(medianOf(outerArmZs, coreCenterZ), -0.18, 0.18);
  const elbowZ = clamp(medianOf(midArmZs, armEndZ), -0.18, 0.18);
  const shoulderZ = clamp(medianOf(innerArmZs, elbowZ), -0.18, 0.18);

  // 4. Detect neck constriction above shoulderY (adapts up to 0.86 for tall humanoids)
  let neckY = clamp(shoulderY + 0.065, 0.66, 0.86);
  let narrowestMedianX = Infinity;
  for (let band = 0; band < 10; band++) {
    const y0 = shoulderY + 0.02 + band * 0.018;
    const y1 = y0 + 0.036;
    if (y1 > 0.90) break;
    const sliceAbsX: number[] = [];
    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const ax = Math.abs(posAttr.getX(i));
      const z = posAttr.getZ(i);
      if (isRearAppendage(z)) continue;
      if (y >= y0 && y < y1 && ax < 0.22) {
        sliceAbsX.push(ax);
      }
    }
    if (sliceAbsX.length >= 6) {
      const med = medianOf(sliceAbsX, 0.12);
      if (med < narrowestMedianX) {
        narrowestMedianX = med;
        neckY = clamp((y0 + y1) * 0.5, shoulderY + 0.03, 0.86);
      }
    }
  }
  if (config?.neckHeightOffset) {
    neckY = clamp(neckY + config.neckHeightOffset, shoulderY + 0.03, 0.90);
  }

  // 5. Detect compact skull top vs floating halo/crown gap in [0.84..1.00]
  let headTopY = 0.96;
  let hasFloatingHalo = false;
  const upperHeadCounts: number[] = [];
  for (let b = 0; b < 8; b++) {
    const y0 = 0.84 + b * 0.02;
    const y1 = b === 7 ? 1.001 : y0 + 0.02;
    let c = 0;
    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      if (y >= y0 && y < y1 && Math.abs(posAttr.getX(i)) < 0.16) c++;
    }
    upperHeadCounts.push(c);
  }
  const gapIdx = upperHeadCounts.findIndex((c, idx) => idx >= 2 && idx <= 6 && c <= 2 && upperHeadCounts.slice(idx + 1).some(v => v >= 4));
  if (gapIdx >= 2) {
    hasFloatingHalo = true;
    headTopY = clamp(0.84 + gapIdx * 0.02, Math.max(neckY + 0.06, 0.88), 0.96);
  }

  const spineY = lerp(pelvisY, shoulderY, 0.45);
  const chestY = clamp(shoulderY - 0.025, spineY + 0.04, neckY - 0.035);

  // 6. Compute true Z centroids per anatomical slice so skeleton aligns inside the 3D mesh depth!
  const collectZ = (yMin: number, yMax: number, maxAbsX: number, minAbsX: number = 0) => {
    const zs: number[] = [];
    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const ax = Math.abs(posAttr.getX(i));
      const z = posAttr.getZ(i);
      if (isRearAppendage(z)) continue;
      if (y >= yMin && y <= yMax && ax <= maxAbsX && ax >= minAbsX) {
        zs.push(z);
      }
    }
    return zs;
  };

  const pelvisZ = clamp(medianOf(collectZ(pelvisY - 0.05, pelvisY + 0.05, torsoRadiusX * 1.15), coreCenterZ), -0.15, 0.15);
  const spineZ = clamp(medianOf(collectZ(spineY - 0.04, spineY + 0.04, torsoRadiusX * 1.15), pelvisZ), -0.15, 0.15);
  const chestZ = clamp(medianOf(collectZ(chestY - 0.04, chestY + 0.04, torsoRadiusX * 1.15), spineZ), -0.15, 0.15);
  const neckZ = clamp(medianOf(collectZ(neckY - 0.03, neckY + 0.04, torsoRadiusX * 1.25), chestZ), -0.15, 0.15);
  const headZ = clamp(medianOf(collectZ(neckY + 0.04, headTopY, 0.18), neckZ), -0.15, 0.15);

  // 7. Legs & feet centroids (X & Z)
  const hipZs = collectZ(pelvisY - 0.14, pelvisY - 0.02, 0.18, 0.02);
  const kneeZs = collectZ(pelvisY * 0.42, pelvisY * 0.62, 0.18, 0.02);
  const footZs = collectZ(0.01, 0.09, 0.18, 0.02);

  lowerAbsX.sort((a, b) => a - b);
  const legSpreadX =
    lowerAbsX.length > 0
      ? clamp(lowerAbsX[Math.floor(lowerAbsX.length * 0.55)], 0.05, 0.14)
      : 0.08;

  const hipZ = clamp(medianOf(hipZs, pelvisZ), -0.15, 0.15);
  const kneeZ = clamp(medianOf(kneeZs, hipZ), -0.15, 0.15);
  const footZ = clamp(medianOf(footZs, kneeZ), -0.15, 0.15);

  // 8. Classify mesh proportion & arm rest pose automatically
  const armSlope = (shoulderY - armEndY) / Math.max(0.06, armEndX - shoulderX);
  const armPose: ArmPoseClass =
    armSlope < 0.32 ? 't-pose' : armSlope <= 1.73 ? 'a-pose' : 'relaxed';
  const proportionClass: ProportionClass =
    neckY >= 0.785 || pelvisY >= 0.465
      ? 'tall_humanoid'
      : neckY <= 0.725 && pelvisY <= 0.425
      ? 'chibi'
      : 'balanced';

  return {
    pelvisY,
    pelvisZ,
    spineY,
    spineZ,
    chestY,
    chestZ,
    neckY,
    neckZ,
    headTopY,
    headZ,
    hipX: legSpreadX,
    hipZ,
    kneeY: pelvisY * 0.50,
    kneeZ,
    footY: 0.035,
    footZ,
    torsoRadiusX,
    shoulderX,
    shoulderY,
    shoulderZ,
    elbowX,
    elbowY,
    elbowZ,
    armEndX,
    armEndY,
    armEndZ,
    armMinY: clamp(armMinY, Math.max(0.32, pelvisY - 0.06), shoulderY),
    hasBackAppendages: isolateBack,
    backAppendageZ,
    rearSign,
    armPose,
    proportionClass,
    hasFloatingHalo
  };
}

export function applyManualRigLandmarks(
  detected: HumanoidSkeletonLayout,
  landmarks: ManualRigLandmarks
): HumanoidSkeletonLayout {
  const layout = { ...detected };
  const point = (name: HumanoidLandmarkName) => landmarks[name];

  const pelvis = point('pelvis');
  if (pelvis) {
    layout.pelvisY = clamp(pelvis.y, 0.25, 0.68);
    layout.pelvisZ = pelvis.z;
  }

  const chest = point('chest');
  if (chest) {
    layout.chestY = clamp(chest.y, layout.pelvisY + 0.045, 0.9);
    layout.chestZ = chest.z;
    layout.spineY = lerp(layout.pelvisY, layout.chestY, 0.52);
    layout.spineZ = lerp(layout.pelvisZ, layout.chestZ, 0.52);
  }

  const neck = point('neck');
  if (neck) {
    layout.neckY = clamp(neck.y, layout.chestY + 0.025, 1.05);
    layout.neckZ = neck.z;
  }

  const shoulder = point('leftShoulder');
  if (shoulder) {
    layout.shoulderX = clamp(Math.abs(shoulder.x), 0.035, 0.28);
    layout.shoulderY = clamp(shoulder.y, layout.pelvisY + 0.12, layout.neckY - 0.025);
    layout.shoulderZ = shoulder.z;
  }

  const elbow = point('leftElbow');
  if (elbow) {
    layout.elbowX = clamp(Math.abs(elbow.x), layout.shoulderX + 0.015, 0.55);
    layout.elbowY = elbow.y;
    layout.elbowZ = elbow.z;
  }

  const wrist = point('leftWrist');
  if (wrist) {
    layout.armEndX = clamp(Math.abs(wrist.x), layout.elbowX + 0.015, 0.62);
    layout.armEndY = wrist.y;
    layout.armEndZ = wrist.z;
  }

  const hip = point('leftHip');
  if (hip) {
    layout.hipX = clamp(Math.abs(hip.x), 0.025, 0.22);
    layout.hipZ = hip.z;
  }

  const knee = point('leftKnee');
  if (knee) {
    layout.kneeY = clamp(knee.y, 0.08, layout.pelvisY - 0.05);
    layout.kneeZ = knee.z;
  }

  const ankle = point('leftAnkle');
  if (ankle) {
    layout.footY = clamp(ankle.y, 0, layout.kneeY - 0.015);
    layout.footZ = ankle.z;
  }

  layout.armMinY = Math.min(layout.armMinY, layout.shoulderY, layout.elbowY, layout.armEndY);
  return layout;
}

/**
 * Builds the 18-bone full-body humanoid skeletal hierarchy (aligned to X/Y/Z centroids).
 */
export function buildHumanoidSkeleton(layout: HumanoidSkeletonLayout = DEFAULT_HUMANOID_LAYOUT): {
  root: THREE.Bone;
  skeleton: THREE.Skeleton;
  bonesMap: Record<string, THREE.Bone>;
} {
  const root = new THREE.Bone();
  root.name = 'root';
  root.position.set(0, 0, layout.pelvisZ);

  const pelvis = new THREE.Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, layout.pelvisY, 0);

  const spine = new THREE.Bone();
  spine.name = 'spine';
  spine.position.set(0, layout.spineY - layout.pelvisY, layout.spineZ - layout.pelvisZ);

  const chest = new THREE.Bone();
  chest.name = 'chest';
  chest.position.set(0, layout.chestY - layout.spineY, layout.chestZ - layout.spineZ);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, layout.neckY - layout.chestY, layout.neckZ - layout.chestZ);

  const headTop = new THREE.Bone();
  headTop.name = 'headTop';
  headTop.position.set(0, layout.headTopY - layout.neckY, layout.headZ - layout.neckZ);

  const leftShoulder = new THREE.Bone();
  leftShoulder.name = 'leftShoulder';
  leftShoulder.position.set(
    -layout.shoulderX,
    layout.shoulderY - layout.chestY,
    layout.shoulderZ - layout.chestZ
  );

  const leftArm = new THREE.Bone();
  leftArm.name = 'leftArm';
  leftArm.position.set(
    -(layout.elbowX - layout.shoulderX),
    layout.elbowY - layout.shoulderY,
    layout.elbowZ - layout.shoulderZ
  );

  const leftHand = new THREE.Bone();
  leftHand.name = 'leftHand';
  leftHand.position.set(
    -(layout.armEndX - layout.elbowX),
    layout.armEndY - layout.elbowY,
    layout.armEndZ - layout.elbowZ
  );

  const rightShoulder = new THREE.Bone();
  rightShoulder.name = 'rightShoulder';
  rightShoulder.position.set(
    layout.shoulderX,
    layout.shoulderY - layout.chestY,
    layout.shoulderZ - layout.chestZ
  );

  const rightArm = new THREE.Bone();
  rightArm.name = 'rightArm';
  rightArm.position.set(
    layout.elbowX - layout.shoulderX,
    layout.elbowY - layout.shoulderY,
    layout.elbowZ - layout.shoulderZ
  );

  const rightHand = new THREE.Bone();
  rightHand.name = 'rightHand';
  rightHand.position.set(
    layout.armEndX - layout.elbowX,
    layout.armEndY - layout.elbowY,
    layout.armEndZ - layout.elbowZ
  );

  const hipOffsetY = -0.035;
  const leftHip = new THREE.Bone();
  leftHip.name = 'leftHip';
  leftHip.position.set(-layout.hipX, hipOffsetY, layout.hipZ - layout.pelvisZ);

  const leftLeg = new THREE.Bone();
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(0, layout.kneeY - (layout.pelvisY + hipOffsetY), layout.kneeZ - layout.hipZ);

  const leftFoot = new THREE.Bone();
  leftFoot.name = 'leftFoot';
  leftFoot.position.set(0, layout.footY - layout.kneeY, layout.footZ - layout.kneeZ);

  const rightHip = new THREE.Bone();
  rightHip.name = 'rightHip';
  rightHip.position.set(layout.hipX, hipOffsetY, layout.hipZ - layout.pelvisZ);

  const rightLeg = new THREE.Bone();
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0, layout.kneeY - (layout.pelvisY + hipOffsetY), layout.kneeZ - layout.hipZ);

  const rightFoot = new THREE.Bone();
  rightFoot.name = 'rightFoot';
  rightFoot.position.set(0, layout.footY - layout.kneeY, layout.footZ - layout.kneeZ);

  // Parent linkage
  root.add(pelvis);
  pelvis.add(spine);
  spine.add(chest);
  chest.add(head);
  head.add(headTop);
  chest.add(leftShoulder);
  leftShoulder.add(leftArm);
  leftArm.add(leftHand);
  chest.add(rightShoulder);
  rightShoulder.add(rightArm);
  rightArm.add(rightHand);
  pelvis.add(leftHip);
  leftHip.add(leftLeg);
  leftLeg.add(leftFoot);
  pelvis.add(rightHip);
  rightHip.add(rightLeg);
  rightLeg.add(rightFoot);

  const bones = [
    root,
    pelvis,
    spine,
    chest,
    head,
    headTop,
    leftShoulder,
    leftArm,
    leftHand,
    rightShoulder,
    rightArm,
    rightHand,
    leftHip,
    leftLeg,
    leftFoot,
    rightHip,
    rightLeg,
    rightFoot
  ];

  const bonesMap: Record<string, THREE.Bone> = {};
  bones.forEach(b => {
    bonesMap[b.name] = b;
  });

  const skeleton = new THREE.Skeleton(bones);
  return { root, skeleton, bonesMap };
}

/**
 * Calculates smooth, seam-free anatomical skin weights using adaptive capsule domains
 * across all 18 bones (including forearms/hands and shins/feet) without boundary tearing.
 */
export function applyAnatomicalSkinWeights(
  geometry: THREE.BufferGeometry,
  layout: HumanoidSkeletonLayout = DEFAULT_HUMANOID_LAYOUT
): void {
  const posAttr = geometry.attributes.position;
  const count = posAttr.count;

  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const B = {
    root: 0,
    pelvis: 1,
    spine: 2,
    chest: 3,
    head: 4,
    headTop: 5,
    leftShoulder: 6,
    leftArm: 7,
    leftHand: 8,
    rightShoulder: 9,
    rightArm: 10,
    rightHand: 11,
    leftHip: 12,
    leftLeg: 13,
    leftFoot: 14,
    rightHip: 15,
    rightLeg: 16,
    rightFoot: 17
  };

  // The arm domain must begin outside the anatomical torso, not at the shoulder
  // offset. Starting too close to the center progressively pulls chest/bust
  // vertices into the arms and flattens the model during T-pose or idle motion.
  const armStartX = clamp(
    Math.max(layout.torsoRadiusX * 1.18, layout.shoulderX * 1.12),
    layout.shoulderX * 1.05,
    0.22
  );
  const armSpan = Math.max(0.08, layout.armEndX - armStartX);
  const torsoSigma = 0.09;
  const isolateBack = Boolean(layout.hasBackAppendages && layout.backAppendageZ !== undefined);
  const backZ = layout.backAppendageZ ?? -0.09;
  const rearSign = layout.rearSign ?? -1;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ax = Math.abs(x);

    const accum = new Float32Array(18);

    // 1. Head isolation above neckY (prevents ears/hair/halos from attaching to arms).
    // Keep the head blend on the skull/neck instead of starting far below the neck:
    // on chibi models the old -0.09 start captured wide shoulder pauldrons/sleeves,
    // freezing them in T-pose while the real arms lowered. Lateral gating keeps the
    // head from claiming shoulder-width geometry at the neck line.
    const headBlend = smoothstep(layout.neckY - 0.045, layout.neckY + 0.02, y);
    const headLateral = 1 - smoothstep(
      layout.torsoRadiusX * 0.95,
      layout.torsoRadiusX * 1.35,
      ax
    );
    const headCrown = smoothstep(layout.neckY + 0.005, layout.neckY + 0.035, y);
    const wHead = headBlend * lerp(headLateral, 1, headCrown);

    // 1b. Rear appendage factor (isolates wings, cloaks, long back hair to torso/chest instead of arms)
    let rearFade = 1.0;
    let rearFactor = 0.0;
    if (isolateBack) {
      rearFade =
        rearSign < 0
          ? smoothstep(backZ - 0.035, backZ + 0.025, z)
          : 1 - smoothstep(backZ - 0.025, backZ + 0.035, z);
      rearFactor = 1 - rearFade;
    }

    // 2. Arm domain mask (covers sleeves up to neckY - 0.05, keeping arms completely away from head/ears)
    let armMask = 0;
    if (y >= layout.armMinY - 0.08 && y <= layout.neckY + 0.005) {
      const lateralMask = smoothstep(armStartX - 0.015, armStartX + 0.04, ax);
      const lowFade = smoothstep(layout.armMinY - 0.08, layout.armMinY - 0.01, y);
      const torsoGuardY =
        y >= layout.pelvisY - 0.02 && y <= layout.neckY + 0.005
          ? 1
          : 0;
      const torsoGuardX = smoothstep(
        layout.torsoRadiusX * 1.10,
        layout.torsoRadiusX * 1.52,
        ax
      );
      const torsoGuard = torsoGuardY * (1 - torsoGuardX);
      armMask = lateralMask * lowFade * (1 - wHead) * rearFade * (1 - torsoGuard);
    }

    // 3. Leg domain mask (left/right isolated below pelvisY; soften rear coat tails)
    const legRearAtten = 1 - rearFactor * 0.65;
    const legMask =
      (1 - smoothstep(layout.pelvisY - 0.035, layout.pelvisY + 0.05, y)) *
      (1 - armMask) *
      legRearAtten;

    // 4. Torso weight = remainder (wings/capes fall smoothly onto chest/spine)
    const torsoMask = Math.max(0, 1 - wHead - armMask * (1 - wHead) - legMask);

    // Distribute Head
    if (wHead > 0.0001) {
      accum[B.head] += wHead * (1 - torsoMask * 0.18);
      accum[B.chest] += wHead * (torsoMask * 0.18);
    }

    // Distribute Arms smoothly across shoulder -> upperArm (elbow) -> forearm/hand
    if (armMask > 0.0001) {
      const tAlong = clamp((ax - armStartX) / armSpan, 0, 1);
      const wShoulder = 1 - smoothstep(0.16, 0.42, tAlong);
      const wHand = smoothstep(0.56, 0.84, tAlong);
      const wArm = Math.max(0, 1 - wShoulder - wHand);

      if (x < 0) {
        accum[B.leftShoulder] += armMask * wShoulder;
        accum[B.leftArm] += armMask * wArm;
        accum[B.leftHand] += armMask * wHand;
      } else {
        accum[B.rightShoulder] += armMask * wShoulder;
        accum[B.rightArm] += armMask * wArm;
        accum[B.rightHand] += armMask * wHand;
      }
    }

    // Distribute Legs smoothly across hip -> knee/shin -> ankle/foot
    if (legMask > 0.0001) {
      const wUpperLeg = smoothstep(layout.kneeY - 0.045, layout.kneeY + 0.045, y);
      const wFoot = 1 - smoothstep(layout.footY + 0.015, layout.footY + 0.075, y);
      const wLowerLeg = Math.max(0, 1 - wUpperLeg - wFoot);
      const pelvisSupport = smoothstep(layout.pelvisY - 0.055, layout.pelvisY + 0.02, y) * 0.32;
      const limbShare = 1 - pelvisSupport;

      accum[B.pelvis] += legMask * pelvisSupport;
      if (x < 0) {
        accum[B.leftHip] += legMask * limbShare * wUpperLeg;
        accum[B.leftLeg] += legMask * limbShare * wLowerLeg;
        accum[B.leftFoot] += legMask * limbShare * wFoot;
      } else {
        accum[B.rightHip] += legMask * limbShare * wUpperLeg;
        accum[B.rightLeg] += legMask * limbShare * wLowerLeg;
        accum[B.rightFoot] += legMask * limbShare * wFoot;
      }
    }

    // Distribute Torso smoothly across Pelvis / Spine / Chest via Gaussian distance
    if (torsoMask > 0.0001) {
      const gPelvis = Math.exp(-Math.pow((y - layout.pelvisY) / torsoSigma, 2));
      const gSpine = Math.exp(-Math.pow((y - layout.spineY) / torsoSigma, 2));
      const gChest = Math.exp(-Math.pow((y - layout.chestY) / torsoSigma, 2));
      const gSum = gPelvis + gSpine + gChest || 1;

      accum[B.pelvis] += torsoMask * (gPelvis / gSum);
      accum[B.spine] += torsoMask * (gSpine / gSum);
      accum[B.chest] += torsoMask * (gChest / gSum);
    }

    // Pick top 4 bone influences and normalize strictly to 1.0
    const pairs: Array<{ b: number; w: number }> = [];
    for (let b = 0; b < 18; b++) {
      if (accum[b] > 1e-5) pairs.push({ b, w: accum[b] });
    }
    pairs.sort((a, b) => b.w - a.w);

    if (pairs.length === 0) {
      pairs.push({ b: B.pelvis, w: 1 });
    }

    const top = pairs.slice(0, 4);
    const total = top.reduce((s, p) => s + p.w, 0) || 1;
    for (let k = 0; k < 4; k++) {
      if (k < top.length) {
        skinIndices[i * 4 + k] = top[k].b;
        skinWeights[i * 4 + k] = top[k].w / total;
      } else {
        skinIndices[i * 4 + k] = 0;
        skinWeights[i * 4 + k] = 0;
      }
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Helper to create a bone quaternion track applying character-space Euler deltas
 * on top of the bone's actual rest pose, so arbitrary bone rolls/orientations never twist!
 */
function buildRelativeQuatTrack(
  bone: THREE.Bone | undefined,
  fallbackTrackName: string,
  times: number[],
  worldEulerDeltas: Array<[number, number, number]>,
  boneWorldQuatCache: Map<THREE.Bone, THREE.Quaternion>
): THREE.QuaternionKeyframeTrack | null {
  if (!bone) {
    if (fallbackTrackName) {
      const vals: number[] = [];
      for (const [rx, ry, rz] of worldEulerDeltas) {
        vals.push(...eulerToQuat(rx, ry, rz));
      }
      return new THREE.QuaternionKeyframeTrack(fallbackTrackName, times, vals);
    }
    return null;
  }

  const worldQuat = boneWorldQuatCache.get(bone) ?? new THREE.Quaternion();
  const invWorldQuat = worldQuat.clone().invert();
  const restLocal = bone.quaternion.clone();

  const vals: number[] = [];
  const tmpEuler = new THREE.Euler();
  const tmpWorldDelta = new THREE.Quaternion();
  const tmpLocalDelta = new THREE.Quaternion();
  const tmpOut = new THREE.Quaternion();

  for (const [rx, ry, rz] of worldEulerDeltas) {
    tmpEuler.set(rx, ry, rz, 'XYZ');
    tmpWorldDelta.setFromEuler(tmpEuler);
    // L' = L0 * (W^-1 * dW * W)
    tmpLocalDelta.copy(invWorldQuat).multiply(tmpWorldDelta).multiply(worldQuat);
    tmpOut.copy(restLocal).multiply(tmpLocalDelta).normalize();
    vals.push(tmpOut.x, tmpOut.y, tmpOut.z, tmpOut.w);
  }

  return new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, vals);
}

function buildRelativePosTrack(
  bone: THREE.Bone | undefined,
  fallbackTrackName: string,
  times: number[],
  offsets: Array<[number, number, number]>,
  defaultBase: [number, number, number] = [0, 0.42, 0]
): THREE.VectorKeyframeTrack | null {
  if (!bone && !fallbackTrackName) return null;
  const baseX = bone ? bone.position.x : defaultBase[0];
  const baseY = bone ? bone.position.y : defaultBase[1];
  const baseZ = bone ? bone.position.z : defaultBase[2];

  // Scale pelvis bob relative to bone height if model uses cm/mm internal coordinates
  const scaleRef = bone && Math.abs(baseY) > 5 ? Math.abs(baseY) / 0.42 : 1.0;

  const vals: number[] = [];
  for (const [dx, dy, dz] of offsets) {
    vals.push(baseX + dx * scaleRef, baseY + dy * scaleRef, baseZ + dz * scaleRef);
  }

  const targetName = bone ? `${bone.uuid}.position` : fallbackTrackName;
  return new THREE.VectorKeyframeTrack(targetName, times, vals);
}

/**
 * Detects whether a skeleton's arms rest horizontally (T-pose / A-pose) vs already hanging down,
 * so animations lower T-pose arms down naturally without clipping already-lowered rigs.
 */
function detectRestArmDropAngle(
  bonesMap: Record<string, THREE.Bone>,
  worldPositions: Map<THREE.Bone, THREE.Vector3>
): number {
  const pairL: [THREE.Bone | undefined, THREE.Bone | undefined] = [
    bonesMap.leftShoulder ?? bonesMap.leftArm,
    bonesMap.leftHand ?? bonesMap.leftArm
  ];
  const pairR: [THREE.Bone | undefined, THREE.Bone | undefined] = [
    bonesMap.rightShoulder ?? bonesMap.rightArm,
    bonesMap.rightHand ?? bonesMap.rightArm
  ];

  const angles: number[] = [];
  for (const [startBone, endBone] of [pairL, pairR]) {
    if (!startBone) continue;
    const p0 = worldPositions.get(startBone);
    let p1 = endBone && endBone !== startBone ? worldPositions.get(endBone) : undefined;
    if (!p1 && startBone.children.length > 0) {
      const childPos = new THREE.Vector3();
      startBone.children[0].getWorldPosition(childPos);
      p1 = childPos;
    }
    if (p0 && p1) {
      const dx = Math.abs(p1.x - p0.x);
      const dy = p1.y - p0.y;
      if (dx + Math.abs(dy) > 1e-4) {
        const horizRatio = Math.atan2(dx, Math.max(0, -dy)); // pi/2 for horizontal T-pose, 0 for hanging down
        angles.push(clamp(horizRatio - 0.45, 0, 1.05));
      }
    }
  }
  if (angles.length === 0) return 0.78;
  return angles.reduce((a, b) => a + b, 0) / angles.length;
}

/**
 * Builds rest-pose-relative animation clips for IDLE, ATTACK, WALK, and HIT.
 * Lowers T-pose arms naturally to the sides (+Z for -X left arm, -Z for +X right arm),
 * swings arms forward/back along Y axis, and bends elbows/feet cleanly.
 */
export function createRigAnimationClips(
  bonesMap?: Record<string, THREE.Bone>,
  layout?: HumanoidSkeletonLayout,
  armDropOffsetRad: number = 0
): RigAnimationClips {
  const b = bonesMap ?? {};
  const useBoneRefs = Boolean(bonesMap && Object.keys(b).length > 0);

  const worldQuats = new Map<THREE.Bone, THREE.Quaternion>();
  const worldPositions = new Map<THREE.Bone, THREE.Vector3>();
  if (useBoneRefs) {
    const anyBone = Object.values(b)[0];
    let top: THREE.Object3D = anyBone;
    while (top.parent) top = top.parent;
    top.updateMatrixWorld(true);
    for (const bone of Object.values(b)) {
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      bone.getWorldQuaternion(q);
      bone.getWorldPosition(p);
      worldQuats.set(bone, q);
      worldPositions.set(bone, p);
    }
  }

  // How much to drop the arms down from horizontal T-pose / A-pose into a natural ready stance
  const isAutoRig = Boolean(b.headTop && b.leftFoot);
  const detectedDrop = useBoneRefs ? detectRestArmDropAngle(b, worldPositions) : 0.85;
  const armPoseDrop =
    layout?.armPose === 't-pose'
      ? 1.15
      : layout?.armPose === 'a-pose'
        ? 0.92
        : layout?.armPose === 'relaxed'
          ? 0.55
          : detectedDrop;
  const baseDrop = layout ? armPoseDrop : detectedDrop;
  const dropTotal = clamp(baseDrop + armDropOffsetRad, 0, 1.25);
  // In our 18-bone auto-rig, leftShoulder/rightShoulder sit at the shoulder socket and leftArm/rightArm at the elbow.
  // In native Mixamo/Blender rigs, leftShoulder is a short clavicle and leftArm is the shoulder socket.
  const dropShoulder = dropTotal * (isAutoRig ? 0.78 : 0.22);
  const dropUpper = dropTotal * (isAutoRig ? 0.22 : 0.78);
  const shoulderSwingMult = isAutoRig ? 1.0 : 0.35;
  const elbowSwingMult = isAutoRig ? 0.55 : 1.0;

  const qTrack = (
    slot: string,
    times: number[],
    deltas: Array<[number, number, number]>
  ): THREE.QuaternionKeyframeTrack | null => {
    const bone = b[slot];
    if (useBoneRefs && !bone) return null;
    return buildRelativeQuatTrack(
      bone,
      useBoneRefs ? '' : `${slot}.quaternion`,
      times,
      deltas,
      worldQuats
    );
  };

  const pTrack = (
    slot: string,
    times: number[],
    offsets: Array<[number, number, number]>
  ): THREE.VectorKeyframeTrack | null => {
    const bone = b[slot];
    if (useBoneRefs && !bone) return null;
    return buildRelativePosTrack(
      bone,
      useBoneRefs ? '' : `${slot}.position`,
      times,
      offsets
    );
  };

  const compact = (tracks: Array<THREE.KeyframeTrack | null>): THREE.KeyframeTrack[] =>
    tracks.filter((t): t is THREE.KeyframeTrack => t !== null);

  // Remember right-hand rule for character facing +Z:
  // - Left arm (-X): +rz lowers down (-Y), +ry swings forward (+Z)
  // - Right arm (+X): -rz lowers down (-Y), -ry swings forward (+Z)
  // - Legs (-Y): -rx swings forward (+Z), +rx bends knee backward (-Z)

  // 1. IDLE CLIP (2.4s relaxed combat stance + breathing)
  const idleTimes = [0, 0.6, 1.2, 1.8, 2.4];
  const idle = new THREE.AnimationClip(
    'idle',
    2.4,
    compact([
      pTrack('pelvis', idleTimes, [
        [0, 0, 0],
        [0, 0.008, 0],
        [0, 0, 0],
        [0, -0.006, 0],
        [0, 0, 0]
      ]),
      qTrack('spine', idleTimes, [
        [0.03, 0, 0],
        [0.05, 0.02, -0.01],
        [0.03, 0, 0],
        [0.01, -0.02, 0.01],
        [0.03, 0, 0]
      ]),
      qTrack('chest', idleTimes, [
        [0, 0, 0],
        [-0.03, 0, 0],
        [0, 0, 0],
        [0.02, 0, 0],
        [0, 0, 0]
      ]),
      qTrack('head', idleTimes, [
        [0, 0, 0],
        [-0.025, -0.02, 0.01],
        [0, 0, 0],
        [0.015, 0.02, -0.01],
        [0, 0, 0]
      ]),
      qTrack('rightShoulder', idleTimes, [
        [0, -0.10 * shoulderSwingMult, -dropShoulder],
        [0, -0.14 * shoulderSwingMult, -dropShoulder - 0.03],
        [0, -0.10 * shoulderSwingMult, -dropShoulder],
        [0, -0.07 * shoulderSwingMult, -dropShoulder + 0.02],
        [0, -0.10 * shoulderSwingMult, -dropShoulder]
      ]),
      qTrack('rightArm', idleTimes, [
        [0, -0.26, -dropUpper],
        [0, -0.30, -dropUpper - 0.04],
        [0, -0.26, -dropUpper],
        [0, -0.22, -dropUpper + 0.03],
        [0, -0.26, -dropUpper]
      ]),
      qTrack('rightHand', idleTimes, [
        [0, -0.18, -0.06],
        [0, -0.22, -0.08],
        [0, -0.18, -0.06],
        [0, -0.14, -0.04],
        [0, -0.18, -0.06]
      ]),
      qTrack('leftShoulder', idleTimes, [
        [0, 0.12 * shoulderSwingMult, dropShoulder],
        [0, 0.16 * shoulderSwingMult, dropShoulder + 0.03],
        [0, 0.12 * shoulderSwingMult, dropShoulder],
        [0, 0.08 * shoulderSwingMult, dropShoulder - 0.02],
        [0, 0.12 * shoulderSwingMult, dropShoulder]
      ]),
      qTrack('leftArm', idleTimes, [
        [0, 0.28, dropUpper],
        [0, 0.34, dropUpper + 0.04],
        [0, 0.28, dropUpper],
        [0, 0.24, dropUpper - 0.03],
        [0, 0.28, dropUpper]
      ]),
      qTrack('leftHand', idleTimes, [
        [0, 0.20, 0.06],
        [0, 0.24, 0.08],
        [0, 0.20, 0.06],
        [0, 0.16, 0.04],
        [0, 0.20, 0.06]
      ])
    ])
  );

  // 2. ATTACK CLIP (1.0s overhead windup -> sweeping forward slash -> clean recovery)
  const atkTimes = [0, 0.22, 0.40, 0.52, 0.76, 1.0];
  const attack = new THREE.AnimationClip(
    'attack',
    1.0,
    compact([
      pTrack('pelvis', atkTimes, [
        [0, 0, 0],
        [0, -0.03, -0.06],
        [0, 0.015, 0.16],
        [0, 0.01, 0.14],
        [0, -0.01, 0.02],
        [0, 0, 0]
      ]),
      qTrack('spine', atkTimes, [
        [0.03, 0, 0],
        [-0.08, -0.36, 0.06],
        [0.20, 0.42, -0.08],
        [0.16, 0.36, -0.06],
        [0.06, 0.10, -0.02],
        [0.03, 0, 0]
      ]),
      qTrack('chest', atkTimes, [
        [0, 0, 0],
        [-0.08, -0.24, 0.05],
        [0.16, 0.28, -0.06],
        [0.14, 0.22, -0.05],
        [0.04, 0.06, -0.01],
        [0, 0, 0]
      ]),
      qTrack('rightShoulder', atkTimes, [
        [0, -0.10 * shoulderSwingMult, -dropShoulder],
        [0, 0.36 * shoulderSwingMult, isAutoRig ? 0.62 : 0.28],
        [0, -0.88 * shoulderSwingMult, isAutoRig ? -0.45 : -0.22],
        [0, -0.76 * shoulderSwingMult, isAutoRig ? -0.52 : -0.26],
        [0, -0.34 * shoulderSwingMult, -dropShoulder],
        [0, -0.10 * shoulderSwingMult, -dropShoulder]
      ]),
      qTrack('rightArm', atkTimes, [
        [0, -0.26, -dropUpper],
        [0, -0.20, isAutoRig ? 0.28 : 0.58],
        [0, -0.45 * elbowSwingMult - 0.15, isAutoRig ? -0.15 : -0.35],
        [0, -0.38 * elbowSwingMult - 0.12, isAutoRig ? -0.18 : -0.45],
        [0, -0.30, -dropUpper],
        [0, -0.26, -dropUpper]
      ]),
      qTrack('rightHand', atkTimes, [
        [0, -0.18, -0.06],
        [0, -0.32, 0.15],
        [0, -0.28, -0.18],
        [0, -0.24, -0.14],
        [0, -0.20, -0.08],
        [0, -0.18, -0.06]
      ]),
      qTrack('leftShoulder', atkTimes, [
        [0, 0.12 * shoulderSwingMult, dropShoulder],
        [0, 0.44 * shoulderSwingMult, dropShoulder - 0.14],
        [0, -0.34 * shoulderSwingMult, dropShoulder + 0.12],
        [0, -0.26 * shoulderSwingMult, dropShoulder + 0.08],
        [0, 0.04 * shoulderSwingMult, dropShoulder],
        [0, 0.12 * shoulderSwingMult, dropShoulder]
      ]),
      qTrack('leftArm', atkTimes, [
        [0, 0.28, dropUpper],
        [0, 0.42, dropUpper - 0.08],
        [0, 0.18, dropUpper + 0.08],
        [0, 0.22, dropUpper + 0.06],
        [0, 0.26, dropUpper],
        [0, 0.28, dropUpper]
      ]),
      qTrack('leftHand', atkTimes, [
        [0, 0.20, 0.06],
        [0, 0.34, 0.10],
        [0, 0.16, 0.04],
        [0, 0.18, 0.05],
        [0, 0.20, 0.06],
        [0, 0.20, 0.06]
      ]),
      qTrack('head', atkTimes, [
        [0, 0, 0],
        [0.05, 0.22, -0.05],
        [0.08, -0.18, 0.04],
        [0.06, -0.14, 0.03],
        [0.02, -0.04, 0.01],
        [0, 0, 0]
      ]),
      qTrack('leftHip', atkTimes, [
        [0, 0, 0],
        [0.16, 0, 0],
        [-0.32, 0, 0],
        [-0.26, 0, 0],
        [-0.08, 0, 0],
        [0, 0, 0]
      ]),
      qTrack('leftLeg', atkTimes, [
        [0, 0, 0],
        [0.14, 0, 0],
        [0.24, 0, 0],
        [0.20, 0, 0],
        [0.06, 0, 0],
        [0, 0, 0]
      ]),
      qTrack('rightHip', atkTimes, [
        [0, 0, 0],
        [-0.18, 0, 0],
        [0.28, 0, 0],
        [0.22, 0, 0],
        [0.06, 0, 0],
        [0, 0, 0]
      ]),
      qTrack('rightLeg', atkTimes, [
        [0, 0, 0],
        [0.18, 0, 0],
        [0.12, 0, 0],
        [0.10, 0, 0],
        [0.04, 0, 0],
        [0, 0, 0]
      ])
    ])
  );

  // 3. WALK CLIP (0.8s balanced tactical stride with true forward/back arm & leg swing)
  const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
  const walk = new THREE.AnimationClip(
    'walk',
    0.8,
    compact([
      pTrack('pelvis', walkTimes, [
        [0, 0, 0],
        [0, 0.02, 0],
        [0, 0, 0],
        [0, 0.02, 0],
        [0, 0, 0]
      ]),
      qTrack('leftHip', walkTimes, [
        [-0.32, 0, 0],
        [0, 0, 0],
        [0.30, 0, 0],
        [0, 0, 0],
        [-0.32, 0, 0]
      ]),
      qTrack('leftLeg', walkTimes, [
        [0.16, 0, 0],
        [0.08, 0, 0],
        [0.24, 0, 0],
        [0.42, 0, 0],
        [0.16, 0, 0]
      ]),
      qTrack('rightHip', walkTimes, [
        [0.30, 0, 0],
        [0, 0, 0],
        [-0.32, 0, 0],
        [0, 0, 0],
        [0.30, 0, 0]
      ]),
      qTrack('rightLeg', walkTimes, [
        [0.24, 0, 0],
        [0.42, 0, 0],
        [0.16, 0, 0],
        [0.08, 0, 0],
        [0.24, 0, 0]
      ]),
      qTrack('leftShoulder', walkTimes, [
        [0, -0.38 * shoulderSwingMult, dropShoulder],
        [0, 0.02 * shoulderSwingMult, dropShoulder + 0.03],
        [0, 0.44 * shoulderSwingMult, dropShoulder],
        [0, 0.02 * shoulderSwingMult, dropShoulder + 0.03],
        [0, -0.38 * shoulderSwingMult, dropShoulder]
      ]),
      qTrack('leftArm', walkTimes, [
        [0, 0.14 - 0.24 * (1 - shoulderSwingMult), dropUpper],
        [0, 0.28, dropUpper + 0.03],
        [0, 0.46, dropUpper],
        [0, 0.28, dropUpper + 0.03],
        [0, 0.14 - 0.24 * (1 - shoulderSwingMult), dropUpper]
      ]),
      qTrack('leftHand', walkTimes, [
        [0, 0.14, 0.04],
        [0, 0.22, 0.06],
        [0, 0.34, 0.08],
        [0, 0.22, 0.06],
        [0, 0.14, 0.04]
      ]),
      qTrack('rightShoulder', walkTimes, [
        [0, -0.44 * shoulderSwingMult, -dropShoulder],
        [0, -0.02 * shoulderSwingMult, -dropShoulder - 0.03],
        [0, 0.38 * shoulderSwingMult, -dropShoulder],
        [0, -0.02 * shoulderSwingMult, -dropShoulder - 0.03],
        [0, -0.44 * shoulderSwingMult, -dropShoulder]
      ]),
      qTrack('rightArm', walkTimes, [
        [0, -0.46, -dropUpper],
        [0, -0.28, -dropUpper - 0.03],
        [0, -0.14 + 0.24 * (1 - shoulderSwingMult), -dropUpper],
        [0, -0.28, -dropUpper - 0.03],
        [0, -0.46, -dropUpper]
      ]),
      qTrack('rightHand', walkTimes, [
        [0, -0.34, -0.08],
        [0, -0.22, -0.06],
        [0, -0.14, -0.04],
        [0, -0.22, -0.06],
        [0, -0.34, -0.08]
      ]),
      qTrack('spine', walkTimes, [
        [0.05, 0.08, -0.02],
        [0.03, 0, 0],
        [0.05, -0.08, 0.02],
        [0.03, 0, 0],
        [0.05, 0.08, -0.02]
      ])
    ])
  );

  // 4. HIT CLIP (0.35s damage flinch with arms thrown wide/up)
  const hitTimes = [0, 0.09, 0.21, 0.35];
  const hit = new THREE.AnimationClip(
    'hit',
    0.35,
    compact([
      pTrack('pelvis', hitTimes, [
        [0, 0, 0],
        [0, -0.02, -0.08],
        [0, 0.005, -0.02],
        [0, 0, 0]
      ]),
      qTrack('spine', hitTimes, [
        [0.03, 0, 0],
        [-0.24, 0.12, -0.08],
        [-0.08, 0.04, -0.03],
        [0.03, 0, 0]
      ]),
      qTrack('head', hitTimes, [
        [0, 0, 0],
        [-0.30, -0.14, 0.10],
        [-0.10, -0.04, 0.03],
        [0, 0, 0]
      ]),
      qTrack('leftShoulder', hitTimes, [
        [0, 0.12 * shoulderSwingMult, dropShoulder],
        [0, -0.28 * shoulderSwingMult, dropShoulder - 0.45],
        [0, -0.06 * shoulderSwingMult, dropShoulder - 0.14],
        [0, 0.12 * shoulderSwingMult, dropShoulder]
      ]),
      qTrack('leftArm', hitTimes, [
        [0, 0.28, dropUpper],
        [0, 0.08, dropUpper - 0.15],
        [0, 0.20, dropUpper - 0.05],
        [0, 0.28, dropUpper]
      ]),
      qTrack('rightShoulder', hitTimes, [
        [0, -0.10 * shoulderSwingMult, -dropShoulder],
        [0, 0.28 * shoulderSwingMult, -dropShoulder + 0.45],
        [0, 0.06 * shoulderSwingMult, -dropShoulder + 0.14],
        [0, -0.10 * shoulderSwingMult, -dropShoulder]
      ]),
      qTrack('rightArm', hitTimes, [
        [0, -0.26, -dropUpper],
        [0, -0.08, -dropUpper + 0.15],
        [0, -0.20, -dropUpper + 0.05],
        [0, -0.26, -dropUpper]
      ])
    ])
  );

  return { idle, attack, walk, hit };
}

/**
 * Generates a seam-free inverted-hull outline geometry by extruding vertices along
 * position-averaged smooth normals in bind-pose space (keeps scale = 1.0 so skinning never drifts).
 */
export function createNormalExtrudedOutlineGeometry(
  sourceGeo: THREE.BufferGeometry,
  thickness: number
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const srcPos = sourceGeo.attributes.position;
  if (!srcPos) return geo;

  const posArr = new Float32Array(srcPos.count * 3);
  for (let i = 0; i < srcPos.count; i++) {
    posArr[i * 3] = srcPos.getX(i);
    posArr[i * 3 + 1] = srcPos.getY(i);
    posArr[i * 3 + 2] = srcPos.getZ(i);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  if (sourceGeo.index) {
    geo.setIndex(sourceGeo.index.clone());
  }
  if (sourceGeo.attributes.skinIndex) {
    geo.setAttribute('skinIndex', sourceGeo.attributes.skinIndex.clone());
  }
  if (sourceGeo.attributes.skinWeight) {
    geo.setAttribute('skinWeight', sourceGeo.attributes.skinWeight.clone());
  }

  let srcNorm = sourceGeo.attributes.normal;
  if (!srcNorm) {
    geo.computeVertexNormals();
    srcNorm = geo.attributes.normal;
  }

  const count = srcPos.count;
  const smoothNormals = new Float32Array(count * 3);

  if (count <= 45000 && srcNorm) {
    const accum = new Map<string, [number, number, number]>();
    for (let i = 0; i < count; i++) {
      const key = `${Math.round(posArr[i * 3] * 1e4)},${Math.round(posArr[i * 3 + 1] * 1e4)},${Math.round(posArr[i * 3 + 2] * 1e4)}`;
      const nx = srcNorm.getX(i);
      const ny = srcNorm.getY(i);
      const nz = srcNorm.getZ(i);
      const existing = accum.get(key);
      if (existing) {
        existing[0] += nx;
        existing[1] += ny;
        existing[2] += nz;
      } else {
        accum.set(key, [nx, ny, nz]);
      }
    }
    for (let i = 0; i < count; i++) {
      const key = `${Math.round(posArr[i * 3] * 1e4)},${Math.round(posArr[i * 3 + 1] * 1e4)},${Math.round(posArr[i * 3 + 2] * 1e4)}`;
      const v = accum.get(key)!;
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      smoothNormals[i * 3] = v[0] / len;
      smoothNormals[i * 3 + 1] = v[1] / len;
      smoothNormals[i * 3 + 2] = v[2] / len;
    }
  } else if (srcNorm) {
    for (let i = 0; i < count; i++) {
      smoothNormals[i * 3] = srcNorm.getX(i);
      smoothNormals[i * 3 + 1] = srcNorm.getY(i);
      smoothNormals[i * 3 + 2] = srcNorm.getZ(i);
    }
  }

  for (let i = 0; i < count; i++) {
    posArr[i * 3] += smoothNormals[i * 3] * thickness;
    posArr[i * 3 + 1] += smoothNormals[i * 3 + 1] * thickness;
    posArr[i * 3 + 2] += smoothNormals[i * 3 + 2] * thickness;
  }
  geo.attributes.position.needsUpdate = true;
  geo.setAttribute('normal', new THREE.BufferAttribute(smoothNormals, 3));

  return geo;
}

function unpackAttributeToFloat32(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  itemSize: number
): THREE.Float32BufferAttribute {
  const count = attr.count;
  const out = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    const x = attr.getX(i);
    out[i * itemSize] = Number.isFinite(x) ? x : 0;
    if (itemSize >= 2) {
      const y = attr.getY(i);
      out[i * itemSize + 1] = Number.isFinite(y) ? y : 0;
    }
    if (itemSize >= 3) {
      const z = attr.getZ(i);
      out[i * itemSize + 2] = Number.isFinite(z) ? z : 0;
    }
    if (itemSize >= 4) {
      const w = attr.getW(i);
      out[i * itemSize + 3] = Number.isFinite(w) ? w : 1;
    }
  }
  return new THREE.Float32BufferAttribute(out, itemSize);
}

function flipNonIndexedWinding(geo: THREE.BufferGeometry) {
  const swapTri = (attr: THREE.BufferAttribute | undefined, itemSize: number) => {
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i + 2 < attr.count; i += 3) {
      const i1 = (i + 1) * itemSize;
      const i2 = (i + 2) * itemSize;
      for (let k = 0; k < itemSize; k++) {
        const tmp = arr[i1 + k];
        arr[i1 + k] = arr[i2 + k];
        arr[i2 + k] = tmp;
      }
    }
    attr.needsUpdate = true;
  };
  swapTri(geo.attributes.position as THREE.BufferAttribute | undefined, 3);
  swapTri(geo.attributes.uv as THREE.BufferAttribute | undefined, 2);
  const col = geo.attributes.color as THREE.BufferAttribute | undefined;
  if (col) swapTri(col, col.itemSize);
}

function buildCleanWorldBakedGeometry(
  rawMesh: THREE.Mesh,
  matCount: number
): {
  geo: THREE.BufferGeometry;
  hadNativeUvs: boolean;
  hadNativeColors: boolean;
} | null {
  const srcGeo = rawMesh.geometry;
  const srcPos = srcGeo?.attributes?.position;
  if (!srcGeo || !srcPos || srcPos.count === 0) return null;

  const count = srcPos.count;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', unpackAttributeToFloat32(srcPos, 3));

  if (srcGeo.attributes.normal) {
    geo.setAttribute('normal', unpackAttributeToFloat32(srcGeo.attributes.normal, 3));
  }

  const srcUv = srcGeo.attributes.uv ?? srcGeo.attributes.uv1;
  const hadNativeUvs = Boolean(srcUv);
  if (srcUv) {
    geo.setAttribute('uv', unpackAttributeToFloat32(srcUv, 2));
  }

  const srcColor = srcGeo.attributes.color;
  const hadNativeColors = Boolean(srcColor);
  if (srcColor) {
    const cSize = Math.min(4, Math.max(3, srcColor.itemSize || 3));
    geo.setAttribute('color', unpackAttributeToFloat32(srcColor, cSize));
  }

  if (srcGeo.index) {
    const idxArr = srcGeo.index.array;
    const useUint32 = count > 65535 || idxArr instanceof Uint32Array;
    const cleanIdx = useUint32 ? new Uint32Array(idxArr.length) : new Uint16Array(idxArr.length);
    for (let i = 0; i < idxArr.length; i++) {
      const v = idxArr[i];
      cleanIdx[i] = v >= 0 && v < count ? v : 0;
    }
    geo.setIndex(new THREE.BufferAttribute(cleanIdx, 1));
  }

  if (matCount > 1 && srcGeo.groups.length > 0) {
    for (const g of srcGeo.groups) {
      geo.addGroup(g.start, g.count, clamp(g.materialIndex ?? 0, 0, matCount - 1));
    }
  }
  geo.setDrawRange(0, Infinity);

  rawMesh.updateWorldMatrix(true, false);
  const worldDet = rawMesh.matrixWorld.determinant();
  geo.applyMatrix4(rawMesh.matrixWorld);

  if (worldDet < 0) {
    if (geo.index) {
      const idx = geo.index.array as Uint16Array | Uint32Array;
      for (let i = 0; i + 2 < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
      geo.index.needsUpdate = true;
    } else {
      flipNonIndexedWinding(geo);
    }
  }

  return { geo, hadNativeUvs, hadNativeColors };
}

/**
 * Normalizes a single raw static Mesh geometry:
 * - Unpacks quantized/interleaved attributes to Float32 and bakes full world matrix
 * - Grounds base of model to y = 0 and scales to target height ~1.0
 * - Generates smooth normals and fallback UVs/colors only when absent
 */
export function normalizeModelGeometry(rawMesh: THREE.Mesh): THREE.BufferGeometry {
  const matCount = Array.isArray(rawMesh.material) ? rawMesh.material.length : 1;
  const cleaned = buildCleanWorldBakedGeometry(rawMesh, matCount);
  const geo = cleaned ? cleaned.geo : rawMesh.geometry.clone();

  geo.computeBoundingBox();
  const box = geo.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());

  const minY = box.min.y;
  const height = size.y;
  const maxSpan = Math.max(size.x, size.y, size.z);
  const targetHeight = 1.0;
  const scaleFactor =
    height > 1e-8 ? targetHeight / height : maxSpan > 1e-8 ? targetHeight / maxSpan : 1.0;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;

  const posAttr = geo.attributes.position;
  const count = posAttr.count;
  for (let i = 0; i < count; i++) {
    const x = (posAttr.getX(i) - centerX) * scaleFactor;
    const y = (posAttr.getY(i) - minY) * scaleFactor;
    const z = (posAttr.getZ(i) - centerZ) * scaleFactor;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  if (!geo.attributes.uv) {
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const u = Math.atan2(x, z) / (2 * Math.PI) + 0.5;
      const v = clamp(y / targetHeight, 0, 1);
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  if (!geo.attributes.color) {
    const colors = new Float32Array(count * 3);
    const colBoot = new THREE.Color(0x4a3728);
    const colPants = new THREE.Color(0x5c4033);
    const colSash = new THREE.Color(0xc0392b);
    const colLeather = new THREE.Color(0xbf9b7a);
    const colSkin = new THREE.Color(0xecb394);
    const colHair = new THREE.Color(0x7a6558);

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      let c = colLeather;
      if (y < 0.22) c = colBoot;
      else if (y < 0.44) c = colPants;
      else if (y < 0.50) c = colSash;
      else if (y < 0.76) c = colLeather;
      else if (y < 0.88) c = colSkin;
      else c = colHair;

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const layout = analyzeHumanoidGeometry(geo);
  applyAnatomicalSkinWeights(geo, layout);
  return geo;
}

/**
 * Loads the default GLTF model once and caches it.
 */
async function loadDefaultGltf(url: string = '/models/model01.glb'): Promise<GLTF> {
  if (url === '/models/model01.glb' && cachedDefaultGltf) {
    return cachedDefaultGltf;
  }

  const loadPromise = new Promise<GLTF>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      gltf => {
        if (url === '/models/model01.glb') {
          cachedDefaultGltf = gltf;
        }
        resolve(gltf);
      },
      undefined,
      err => {
        reject(err);
      }
    );
  });

  if (url === '/models/model01.glb') {
    if (!defaultGltfPromise) {
      defaultGltfPromise = loadPromise.catch(err => {
        defaultGltfPromise = null;
        throw err;
      });
    }
    const gltf = await defaultGltfPromise;
    await ensureDefaultTextureLoaded();
    return gltf;
  }

  return loadPromise;
}

async function ensureDefaultTextureLoaded(): Promise<THREE.Texture | null> {
  if (cachedTexture) return cachedTexture;
  const texLoader = new THREE.TextureLoader();
  return new Promise(resolve => {
    texLoader.load(
      '/models/model01_texture.png',
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        cachedTexture = tex;
        resolve(tex);
      },
      undefined,
      () => {
        texLoader.load(
          '/models/model01_texture.webp',
          tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            cachedTexture = tex;
            resolve(tex);
          },
          undefined,
          () => resolve(null)
        );
      }
    );
  });
}

export async function loadBaseModelGeometry(url: string = '/models/model01.glb'): Promise<THREE.BufferGeometry> {
  if (url === '/models/model01.glb' && cachedBaseGeometry) {
    return cachedBaseGeometry;
  }

  const gltf = await loadDefaultGltf(url);
  gltf.scene.updateMatrixWorld(true);
  let foundMesh: THREE.Mesh | null = null;
  gltf.scene.traverse(obj => {
    if (!foundMesh && (obj as THREE.Mesh).isMesh) {
      foundMesh = obj as THREE.Mesh;
    }
  });

  if (!foundMesh) {
    throw new Error('No mesh found in GLTF model');
  }

  const normGeo = normalizeModelGeometry(foundMesh);
  if (url === '/models/model01.glb') {
    cachedBaseGeometry = normGeo;
  }
  return normGeo;
}

function extractSourceMaterialInfo(sourceMat: THREE.Material | undefined) {
  const anyMat = sourceMat as unknown as {
    map?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    color?: THREE.Color;
    emissive?: THREE.Color;
    transparent?: boolean;
    opacity?: number;
    alphaTest?: number;
    side?: THREE.Side;
    roughness?: number;
    metalness?: number;
    isMeshBasicMaterial?: boolean;
    isMeshStandardMaterial?: boolean;
  } | undefined;

  const primaryMap = anyMat?.map ?? null;
  const emissiveOnlyMap = !primaryMap && anyMat?.emissiveMap ? anyMat.emissiveMap : null;
  const map = primaryMap ?? emissiveOnlyMap;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
  }

  let baseColor = anyMat?.color ? anyMat.color.clone() : new THREE.Color(0xffffff);
  if (emissiveOnlyMap) {
    const em = anyMat?.emissive ? anyMat.emissive.clone() : new THREE.Color(0xffffff);
    baseColor = em.r + em.g + em.b > 0.05 ? em : new THREE.Color(0xffffff);
  }

  const rawOpacity = anyMat?.opacity ?? 1;
  const hasExplicitAlphaMap = Boolean(anyMat?.alphaMap);
  const opacity = Number.isFinite(rawOpacity) && rawOpacity > 0.05 ? clamp(rawOpacity, 0, 1) : 1;
  const transparent = Boolean(anyMat?.transparent) && (rawOpacity > 0.05 || hasExplicitAlphaMap);
  const rawAlphaTest = anyMat?.alphaTest ?? 0;
  const alphaTest = Number.isFinite(rawAlphaTest) && rawAlphaTest < 0.98 ? Math.max(0, rawAlphaTest) : 0.5;

  return {
    anyMat,
    map,
    normalMap: anyMat?.normalMap ?? null,
    roughnessMap: anyMat?.roughnessMap ?? null,
    metalnessMap: anyMat?.metalnessMap ?? null,
    aoMap: anyMat?.aoMap ?? null,
    alphaMap: anyMat?.alphaMap ?? null,
    baseColor,
    transparent,
    opacity,
    alphaTest,
    side: anyMat?.side ?? THREE.FrontSide
  };
}

function materialHasAnyTexture(mat: THREE.Material | THREE.Material[] | undefined): boolean {
  if (!mat) return false;
  const list = Array.isArray(mat) ? mat : [mat];
  return list.some(m => {
    const info = extractSourceMaterialInfo(m);
    return Boolean(info.map);
  });
}

function createToonMaterialFromSource(
  sourceMat: THREE.Material | undefined,
  geometry: THREE.BufferGeometry,
  gradientMap: THREE.DataTexture,
  fallbackTexture: THREE.Texture | null,
  hasRealUvs: boolean,
  forceDoubleSide: boolean = false
): THREE.MeshToonMaterial {
  const info = extractSourceMaterialInfo(sourceMat);
  const hasColors = Boolean(geometry.attributes.color);
  const map = hasRealUvs && info.map ? info.map : undefined;
  const resolvedMap = map ?? (hasRealUvs && !hasColors ? fallbackTexture : null);

  const params: THREE.MeshToonMaterialParameters = {
    color: resolvedMap
      ? info.baseColor.r + info.baseColor.g + info.baseColor.b > 0.05
        ? info.baseColor
        : new THREE.Color(0xffffff)
      : info.baseColor,
    gradientMap,
    vertexColors: hasColors,
    transparent: info.transparent,
    opacity: info.opacity,
    alphaTest: info.alphaTest,
    side: forceDoubleSide ? THREE.DoubleSide : info.side
  };
  if (resolvedMap) {
    params.map = resolvedMap;
  }
  if (hasRealUvs && info.normalMap) params.normalMap = info.normalMap;
  if (hasRealUvs && info.alphaMap) params.alphaMap = info.alphaMap;

  return new THREE.MeshToonMaterial(params);
}

function createTexturedMaterialFromSource(
  sourceMat: THREE.Material | undefined,
  geometry: THREE.BufferGeometry,
  fallbackTexture: THREE.Texture | null,
  hasRealUvs: boolean,
  forceDoubleSide: boolean = false
): THREE.Material {
  const hasColors = Boolean(geometry.attributes.color);
  const info = extractSourceMaterialInfo(sourceMat);

  if (sourceMat && (sourceMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const cloned = sourceMat.clone() as THREE.MeshStandardMaterial;
    if (cloned.map) {
      cloned.map.colorSpace = THREE.SRGBColorSpace;
    } else if (hasRealUvs && info.map) {
      cloned.map = info.map;
    } else if (hasRealUvs && fallbackTexture) {
      cloned.map = fallbackTexture;
    }
    cloned.vertexColors = hasColors;
    cloned.visible = true;
    cloned.colorWrite = true;
    cloned.opacity = info.opacity;
    cloned.transparent = info.transparent;
    cloned.alphaTest = info.alphaTest;
    if (forceDoubleSide) {
      cloned.side = THREE.DoubleSide;
    }
    if (cloned.metalness > 0.75) {
      cloned.metalness = 0.75;
    }
    if ('transmission' in cloned && typeof (cloned as THREE.MeshPhysicalMaterial).transmission === 'number') {
      (cloned as THREE.MeshPhysicalMaterial).transmission = 0;
    }
    cloned.needsUpdate = true;
    return cloned;
  }

  // Preserve KHR_materials_unlit (MeshBasicMaterial) faithfully without darkening
  if (sourceMat && (sourceMat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const cloned = sourceMat.clone() as THREE.MeshBasicMaterial;
    if (cloned.map) {
      cloned.map.colorSpace = THREE.SRGBColorSpace;
    } else if (hasRealUvs && fallbackTexture) {
      cloned.map = fallbackTexture;
    }
    cloned.vertexColors = hasColors;
    cloned.visible = true;
    cloned.colorWrite = true;
    cloned.opacity = info.opacity;
    cloned.transparent = info.transparent;
    cloned.alphaTest = info.alphaTest;
    if (forceDoubleSide) {
      cloned.side = THREE.DoubleSide;
    }
    cloned.needsUpdate = true;
    return cloned;
  }

  // Preserve MeshPhongMaterial / MeshLambertMaterial / OBJ / FBX textures cleanly
  const resolvedMap = hasRealUvs ? info.map ?? fallbackTexture : null;
  const params: THREE.MeshStandardMaterialParameters = {
    color: resolvedMap
      ? info.baseColor.r + info.baseColor.g + info.baseColor.b > 0.05
        ? info.baseColor
        : new THREE.Color(0xffffff)
      : info.baseColor,
    roughness: info.anyMat?.roughness ?? 0.65,
    metalness: Math.min(0.75, info.anyMat?.metalness ?? 0.05),
    vertexColors: hasColors,
    transparent: info.transparent,
    opacity: info.opacity,
    alphaTest: info.alphaTest,
    side: forceDoubleSide ? THREE.DoubleSide : info.side
  };
  if (resolvedMap) params.map = resolvedMap;
  if (hasRealUvs && info.normalMap) params.normalMap = info.normalMap;
  if (hasRealUvs && info.roughnessMap) params.roughnessMap = info.roughnessMap;
  if (hasRealUvs && info.metalnessMap) params.metalnessMap = info.metalnessMap;
  if (hasRealUvs && info.aoMap) params.aoMap = info.aoMap;
  if (hasRealUvs && info.alphaMap) params.alphaMap = info.alphaMap;

  return new THREE.MeshStandardMaterial(params);
}

function buildMaterialPair(
  origMaterial: THREE.Material | THREE.Material[] | undefined,
  geometry: THREE.BufferGeometry,
  gradientMap: THREE.DataTexture,
  fallbackTexture: THREE.Texture | null,
  hasRealUvs: boolean,
  materialsToDispose: THREE.Material[],
  forceDoubleSide: boolean = false
): {
  toonMat: THREE.Material | THREE.Material[];
  texturedMat: THREE.Material | THREE.Material[];
} {
  if (Array.isArray(origMaterial) && origMaterial.length > 0) {
    const toonArr = origMaterial.map(m => {
      const tm = createToonMaterialFromSource(m, geometry, gradientMap, fallbackTexture, hasRealUvs, forceDoubleSide);
      materialsToDispose.push(tm);
      return tm;
    });
    const texArr = origMaterial.map(m => {
      const sm = createTexturedMaterialFromSource(m, geometry, fallbackTexture, hasRealUvs, forceDoubleSide);
      materialsToDispose.push(sm);
      return sm;
    });
    return {
      toonMat: toonArr.length === 1 ? toonArr[0] : toonArr,
      texturedMat: texArr.length === 1 ? texArr[0] : texArr
    };
  }

  const single = Array.isArray(origMaterial) ? origMaterial[0] : origMaterial;
  const toonMat = createToonMaterialFromSource(single, geometry, gradientMap, fallbackTexture, hasRealUvs, forceDoubleSide);
  const texturedMat = createTexturedMaterialFromSource(single, geometry, fallbackTexture, hasRealUvs, forceDoubleSide);
  materialsToDispose.push(toonMat, texturedMat);
  return { toonMat, texturedMat };
}

function buildWeaponsForController(
  controller: CustomRigController,
  bonesMap: Record<string, THREE.Bone>,
  gradientMap: THREE.DataTexture,
  isPlayer: boolean,
  modelRoot: THREE.Object3D
) {
  const primaryHex = isPlayer ? 0x2563eb : 0xdc2626;
  const trimHex = isPlayer ? 0xfacc15 : 0xf97316;

  const rightTarget = bonesMap.rightHand ?? bonesMap.rightArm;
  const leftTarget = bonesMap.leftHand ?? bonesMap.leftArm;

  modelRoot.updateMatrixWorld(true);
  const worldScaleVec = new THREE.Vector3();

  if (rightTarget) {
    rightTarget.getWorldScale(worldScaleVec);
    const invScale = 1 / Math.max(0.0001, (worldScaleVec.x + worldScaleVec.y + worldScaleVec.z) / 3);

    const weaponGroup = new THREE.Group();
    weaponGroup.name = 'rightWeapon';

    const bladeGeo = new THREE.BoxGeometry(0.075, 0.58, 0.032);
    const bladeMat = new THREE.MeshToonMaterial({ color: 0xe2e8f0, gradientMap });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.28;
    blade.castShadow = true;
    weaponGroup.add(blade);

    const guardGeo = new THREE.BoxGeometry(0.22, 0.055, 0.055);
    const guardMat = new THREE.MeshToonMaterial({ color: trimHex, gradientMap });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 0.02;
    weaponGroup.add(guard);

    const gripGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.18, 8);
    const gripMat = new THREE.MeshToonMaterial({ color: 0x3f2818, gradientMap });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -0.09;
    weaponGroup.add(grip);

    weaponGroup.scale.setScalar(invScale * 0.72);
    weaponGroup.position.set(0, -0.01 * invScale, 0.03 * invScale);
    weaponGroup.rotation.set(-Math.PI / 6, 0, Math.PI / 4);
    rightTarget.add(weaponGroup);
    controller.weaponGroup = weaponGroup;
  }

  if (leftTarget) {
    leftTarget.getWorldScale(worldScaleVec);
    const invScale = 1 / Math.max(0.0001, (worldScaleVec.x + worldScaleVec.y + worldScaleVec.z) / 3);

    const shieldGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12);
    shieldGeo.rotateX(Math.PI / 2);
    const shieldMat = new THREE.MeshToonMaterial({ color: primaryHex, gradientMap });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.scale.setScalar(invScale * 0.65);
    shield.position.set(-0.015 * invScale, 0, 0.05 * invScale);
    shield.castShadow = true;
    leftTarget.add(shield);
    controller.shieldMesh = shield;
  }
}

function matchEmbeddedAnimations(
  clips: THREE.AnimationClip[],
  fallbackClips: RigAnimationClips
): {
  resolved: RigAnimationClips;
  allClips: THREE.AnimationClip[];
  animationSource: 'embedded' | 'hybrid' | 'procedural';
  oneShotRoles: { attack: boolean; hit: boolean };
} {
  if (!clips || clips.length === 0) {
    return {
      resolved: fallbackClips,
      allClips: [fallbackClips.idle, fallbackClips.attack, fallbackClips.walk, fallbackClips.hit],
      animationSource: 'procedural',
      oneShotRoles: { attack: true, hit: true }
    };
  }

  const findClip = (patterns: RegExp[], exclude?: RegExp) =>
    clips.find(c => {
      const n = c.name.toLowerCase();
      if (exclude && exclude.test(n)) return false;
      return patterns.some(p => p.test(n));
    });

  const restPoseClip = /t[ _-]?pose|bind[ _-]?pose|rest[ _-]?pose|reference[ _-]?pose|apose|a[ _-]?pose/i;
  const idleClip =
    findClip([/idle/, /stand/, /breath/, /wait/, /rest/], restPoseClip) ??
    findClip([/.*/], restPoseClip) ??
    fallbackClips.idle;
  const walkClip =
    findClip([/walk/, /run/, /move/, /stride/, /jog/, /locomotion/]);
  const attackClip =
    findClip([/attack/, /slash/, /strike/, /swing/, /punch/, /shoot/, /cast/, /combat/, /skill/]);
  const hitClip =
    findClip([/hurt/, /damage/, /flinch/, /recoil/, /get_?hit/, /stun/, /pain/, /\bhit\b/], /hit_?enemy/);

  // Ensure each role gets a distinct AnimationClip instance so LoopOnce never leaks to idle
  const ensureDistinct = (c: THREE.AnimationClip, used: Set<THREE.AnimationClip>) => {
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
    const copy = c.clone();
    used.add(copy);
    return copy;
  };

  const used = new Set<THREE.AnimationClip>();
  const resolvedIdle = ensureDistinct(idleClip, used);
  const resolvedWalk = ensureDistinct(walkClip ?? fallbackClips.walk, used);
  const resolvedAttack = ensureDistinct(attackClip ?? fallbackClips.attack, used);
  const resolvedHit = ensureDistinct(hitClip ?? fallbackClips.hit, used);

  const matchedAny = Boolean(walkClip || attackClip || hitClip || clips.length > 0);
  const allMatchedEmbedded = Boolean(idleClip && walkClip && attackClip && hitClip);

  const allClips = [...clips];
  for (const fc of [resolvedIdle, resolvedWalk, resolvedAttack, resolvedHit]) {
    if (!allClips.includes(fc)) {
      allClips.push(fc);
    }
  }

  return {
    resolved: {
      idle: resolvedIdle,
      walk: resolvedWalk,
      attack: resolvedAttack,
      hit: resolvedHit
    },
    allClips,
    animationSource: allMatchedEmbedded ? 'embedded' : matchedAny ? 'hybrid' : 'procedural',
    oneShotRoles: {
      attack: Boolean(attackClip) || resolvedAttack === fallbackClips.attack,
      hit: Boolean(hitClip) || resolvedHit === fallbackClips.hit
    }
  };
}

/**
 * Ensures imported GLTF AnimationClip tracks resolve cleanly even when bone names
 * contain colons (`mixamorig:Spine`), dots (`Arm.L`), or slashes.
 */
function resolveAnimationClipTargets(
  clips: THREE.AnimationClip[],
  modelRoot: THREE.Object3D
): THREE.AnimationClip[] {
  if (!clips || clips.length === 0) return [];
  const byExactName = new Map<string, THREE.Object3D>();
  const bySanitized = new Map<string, THREE.Object3D>();
  modelRoot.traverse(obj => {
    if (obj.name) {
      if (!byExactName.has(obj.name)) byExactName.set(obj.name, obj);
      const san = THREE.PropertyBinding.sanitizeNodeName(obj.name);
      if (!bySanitized.has(san)) bySanitized.set(san, obj);
    }
  });

  return clips.map(clip => {
    const cloned = clip.clone();
    cloned.tracks = cloned.tracks.map(track => {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const direct = THREE.PropertyBinding.findNode(modelRoot, parsed.nodeName);
      if (direct) return track;

      // Extract raw node prefix before property suffix (e.g. ".quaternion", ".position", ".scale")
      const dotIdx = track.name.lastIndexOf('.');
      const rawNode = dotIdx > 0 ? track.name.slice(0, dotIdx) : track.name;
      const propSuffix = dotIdx > 0 ? track.name.slice(dotIdx) : '';
      const target =
        byExactName.get(rawNode) ??
        bySanitized.get(THREE.PropertyBinding.sanitizeNodeName(rawNode));

      if (target) {
        const clonedTrack = track.clone();
        clonedTrack.name = `${target.uuid}${propSuffix}`;
        return clonedTrack;
      }
      return track;
    });
    return cloned;
  });
}

/**
 * Core universal importer: builds a CustomRigController from ANY loaded GLTF object.
 * - Preserves native Skeleton, SkinnedMeshes, skin weights, textures, and embedded animations when present.
 * - Falls back to adaptive 13-bone auto-rigging + smooth capsule skin weights for static meshes.
 */
export function createControllerFromGltf(
  gltf: GLTF,
  options: RigInstanceOptions = {}
): CustomRigController {
  const isPlayer = options.isPlayer ?? true;
  const modelName = options.modelName ?? 'model01.glb';
  const baseConfig = normalizeCustomModelConfig({
    ...options.config,
    outlinesEnabled: options.config?.outlinesEnabled ?? options.outlinesEnabled ?? true
  });
  const outlinesEnabled = baseConfig.outlinesEnabled;
  const gradientMap = getBrawlToonGradientTexture();

  gltf.scene.updateMatrixWorld(true);

  const rawSkinnedMeshes: THREE.SkinnedMesh[] = [];
  const rawMeshes: THREE.Mesh[] = [];
  const rawBones: THREE.Bone[] = [];

  gltf.scene.traverse(obj => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      rawSkinnedMeshes.push(obj as THREE.SkinnedMesh);
    } else if ((obj as THREE.Mesh).isMesh) {
      rawMeshes.push(obj as THREE.Mesh);
    }
    if ((obj as THREE.Bone).isBone) {
      rawBones.push(obj as THREE.Bone);
    }
  });

  const hasNativeSkeleton = rawSkinnedMeshes.length > 0 || rawBones.length > 0;

  // =========================================================================
  // PATH A: NATIVE SKELETON (Preserves original bones, weights, meshes & clips)
  // =========================================================================
  if (hasNativeSkeleton && rawSkinnedMeshes.length > 0) {
    const group = new THREE.Group();
    group.name = 'customRig_root';
    const transformGroup = new THREE.Group();
    transformGroup.name = 'calibration_transform';

    const clonedScene = SkeletonUtils.clone(gltf.scene);
    const modelWrapper = new THREE.Group();
    modelWrapper.name = 'importedModel_wrapper';
    modelWrapper.add(clonedScene);

    // Update skeletons & compute accurate bounds without mutating skinned vertices!
    modelWrapper.updateMatrixWorld(true);
    const clonedSkinnedMeshes: THREE.SkinnedMesh[] = [];
    const clonedAllMeshes: THREE.Mesh[] = [];
    const clonedBones: THREE.Bone[] = [];
    const allSkeletons = new Set<THREE.Skeleton>();

    clonedScene.traverse(obj => {
      if ((obj as THREE.Bone).isBone) {
        clonedBones.push(obj as THREE.Bone);
      }
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = obj as THREE.SkinnedMesh;
        sm.skeleton.update();
        sm.computeBoundingBox();
        sm.computeBoundingSphere();
        clonedSkinnedMeshes.push(sm);
        clonedAllMeshes.push(sm);
        allSkeletons.add(sm.skeleton);
      } else if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        clonedAllMeshes.push(m);
      }
    });

    const box = new THREE.Box3().setFromObject(modelWrapper);
    const size = box.getSize(new THREE.Vector3());
    const maxSpan = Math.max(size.x, size.y, size.z);
    const height = size.y > 1e-8 ? size.y : maxSpan > 1e-8 ? maxSpan : 1.0;
    const targetHeight = 1.0;
    const scaleFactor = targetHeight / height;

    modelWrapper.scale.setScalar(scaleFactor);
    modelWrapper.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(modelWrapper);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    modelWrapper.position.set(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
    modelWrapper.updateMatrixWorld(true);

    transformGroup.add(modelWrapper);
    group.add(transformGroup);

    // Collect bones across skeletons + scene
    for (const skel of allSkeletons) {
      for (const b of skel.bones) {
        if (!clonedBones.includes(b)) clonedBones.push(b);
      }
    }
    const matchedBones = matchHumanoidBones(clonedBones);

    const meshEntries: MeshMaterialEntry[] = [];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];
    let hasNativeTextures = false;
    let hasNativeUvs = false;
    const worldScaleVec = new THREE.Vector3();

    for (const mesh of clonedAllMeshes) {
      mesh.visible = true;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (!mesh.geometry.attributes.uv && mesh.geometry.attributes.uv1) {
        mesh.geometry.setAttribute('uv', mesh.geometry.attributes.uv1);
      }

      const hasRealUvs = Boolean(mesh.geometry.attributes.uv);
      if (hasRealUvs) hasNativeUvs = true;
      if (materialHasAnyTexture(mesh.material)) {
        hasNativeTextures = true;
      }

      const { toonMat, texturedMat } = buildMaterialPair(
        mesh.material,
        mesh.geometry,
        gradientMap,
        null,
        hasRealUvs,
        materialsToDispose
      );

      let outlineMesh: THREE.Mesh | null = null;
      if (outlinesEnabled && mesh.geometry.attributes.position) {
        mesh.getWorldScale(worldScaleVec);
        const avgScale = Math.max(0.001, (Math.abs(worldScaleVec.x) + Math.abs(worldScaleVec.y) + Math.abs(worldScaleVec.z)) / 3);
        const outlineThickness = 0.0075 / avgScale;
        const outlineGeo = createNormalExtrudedOutlineGeometry(mesh.geometry, outlineThickness);
        geometriesToDispose.push(outlineGeo);

        const outlineMat = new THREE.MeshBasicMaterial({
          color: BRAWL_PALETTE.battle.outlineHex,
          side: THREE.BackSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 2
        });
        materialsToDispose.push(outlineMat);

        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          const sm = mesh as THREE.SkinnedMesh;
          const outSkinned = new THREE.SkinnedMesh(outlineGeo, outlineMat);
          outSkinned.name = `${mesh.name || 'mesh'}_outline`;
          outSkinned.userData.isOutline = true;
          outSkinned.castShadow = false;
          outSkinned.receiveShadow = false;
          mesh.parent?.add(outSkinned);
          outSkinned.position.copy(mesh.position);
          outSkinned.quaternion.copy(mesh.quaternion);
          outSkinned.scale.copy(mesh.scale);
          outSkinned.bind(sm.skeleton, sm.bindMatrix);
          outlineMesh = outSkinned;
        } else {
          const outRigid = new THREE.Mesh(outlineGeo, outlineMat);
          outRigid.name = `${mesh.name || 'mesh'}_outline`;
          outRigid.userData.isOutline = true;
          mesh.add(outRigid);
          outlineMesh = outRigid;
        }
      }

      meshEntries.push({
        mesh,
        toonMat,
        texturedMat,
        outlineMesh,
        hadNativeColors: Boolean(mesh.geometry.attributes.color)
      });
    }

    const primarySkinned = clonedSkinnedMeshes[0];
    const firstToon = meshEntries[0]?.toonMat;
    const primaryToon = ((Array.isArray(firstToon) ? firstToon[0] : firstToon) as THREE.MeshToonMaterial) ??
      new THREE.MeshToonMaterial({ gradientMap });
    const firstTex = meshEntries[0]?.texturedMat;
    const primaryTextured = ((Array.isArray(firstTex) ? firstTex[0] : firstTex) as THREE.MeshStandardMaterial) ??
      new THREE.MeshStandardMaterial();

    // Generate rest-pose-relative fallback clips on the model's real bones (used only for missing clip roles)
    const fallbackClips = createRigAnimationClips(
      matchedBones,
      undefined,
      baseConfig.armDropOffsetRad
    );
    const boundEmbeddedClips = resolveAnimationClipTargets(gltf.animations ?? [], modelWrapper);
    const { resolved, allClips, animationSource, oneShotRoles } = matchEmbeddedAnimations(
      boundEmbeddedClips,
      fallbackClips
    );

    const resolvedMaterialMode =
      options.config?.materialMode ??
      options.initialMaterialMode ??
      (hasNativeTextures && hasNativeUvs ? 'textured' : 'toon');
    const resolvedWeapons = options.config?.weaponsEnabled ?? true;
    const appliedConfig = normalizeCustomModelConfig({
      ...baseConfig,
      materialMode: resolvedMaterialMode,
      weaponsEnabled: resolvedWeapons
    });
    applyManualSkinWeightEdits(meshEntries, appliedConfig.manualWeightEdits);

    const nativeProfile: AutoRigProfile = {
      proportionClass: 'balanced',
      armPose: 't-pose',
      detectedPelvisY: 0.45,
      detectedShoulderY: 0.72,
      detectedNeckY: 0.80,
      detectedHeadTopY: 0.96,
      detectedArmDropRad: 0.78,
      hasBackAppendages: false,
      hasFloatingHalo: false,
      backAppendageZ: -0.09,
      rearSign: -1,
      nativeHeight: height
    };

    const controller = new CustomRigController({
      group,
      transformGroup,
      modelRoot: modelWrapper,
      skeletonRoot: clonedScene,
      skinnedMesh: primarySkinned,
      skeleton: primarySkinned.skeleton,
      allSkeletons: Array.from(allSkeletons),
      bones: matchedBones,
      clips: resolved,
      allClips,
      oneShotRoles,
      toonMaterial: primaryToon,
      texturedMaterial: primaryTextured,
      meshEntries,
      outlineMesh: meshEntries[0]?.outlineMesh ?? null,
      metadata: {
        modelName,
        rigSource: 'native_skeleton',
        animationSource,
        boneCount: clonedBones.length,
        meshCount: clonedAllMeshes.length,
        hasNativeTextures,
        hasNativeUvs,
        availableClipNames: allClips.map(c => c.name),
        autoProfile: nativeProfile,
        appliedConfig
      },
      geometriesToDispose,
      materialsToDispose
    });

    buildWeaponsForController(controller, matchedBones, gradientMap, isPlayer, modelWrapper);
    controller.applyDisplayConfig(appliedConfig);
    return controller;
  }

  // =========================================================================
  // PATH B: STATIC / UNRIGGED MESHES (Adaptive 13-Bone Auto-Rig, Smooth Weights)
  // =========================================================================
  const allMeshes = [...rawMeshes, ...rawSkinnedMeshes];
  if (allMeshes.length === 0) {
    throw new Error('No mesh found in 3D model');
  }

  // Compute unified world-space bounding box across all sub-meshes so parts never collapse onto each other
  const unifiedBox = new THREE.Box3();
  const bakedParts: Array<{
    geo: THREE.BufferGeometry;
    origMat: THREE.Material | THREE.Material[] | undefined;
    hadNativeUvs: boolean;
    hadNativeColors: boolean;
    name: string;
  }> = [];

  for (const m of allMeshes) {
    const matCount = Array.isArray(m.material) ? m.material.length : 1;
    const cleaned = buildCleanWorldBakedGeometry(m, matCount);
    if (!cleaned) continue;

    cleaned.geo.computeBoundingBox();
    if (cleaned.geo.boundingBox && !cleaned.geo.boundingBox.isEmpty()) {
      unifiedBox.union(cleaned.geo.boundingBox);
    }
    bakedParts.push({
      geo: cleaned.geo,
      origMat: m.material,
      hadNativeUvs: cleaned.hadNativeUvs,
      hadNativeColors: cleaned.hadNativeColors,
      name: m.name || 'part'
    });
  }

  if (bakedParts.length === 0) {
    throw new Error('No valid vertex geometry found in 3D model');
  }

  const unifiedSize = unifiedBox.getSize(new THREE.Vector3());
  const height = unifiedSize.y;
  const maxSpan = Math.max(unifiedSize.x, unifiedSize.y, unifiedSize.z);
  const targetHeight = 1.0;
  const scaleFactor =
    height > 1e-8 ? targetHeight / height : maxSpan > 1e-8 ? targetHeight / maxSpan : 1.0;
  const centerX = unifiedBox.isEmpty() ? 0 : (unifiedBox.min.x + unifiedBox.max.x) / 2;
  const centerZ = unifiedBox.isEmpty() ? 0 : (unifiedBox.min.z + unifiedBox.max.z) / 2;
  const minY = unifiedBox.isEmpty() ? 0 : unifiedBox.min.y;

  // Normalize all sub-meshes into the exact same [0..1] grounded coordinate space
  const combinedPositions: number[] = [];
  for (const part of bakedParts) {
    const pos = part.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = (pos.getX(i) - centerX) * scaleFactor;
      const y = (pos.getY(i) - minY) * scaleFactor;
      const z = (pos.getZ(i) - centerZ) * scaleFactor;
      pos.setXYZ(i, x, y, z);
      combinedPositions.push(x, y, z);
    }
    pos.needsUpdate = true;
    part.geo.computeVertexNormals();
    part.geo.computeBoundingBox();
    part.geo.computeBoundingSphere();
  }

  // Fit adaptive skeleton using ALL combined vertices + optional calibration offsets
  const probeGeo = new THREE.BufferGeometry();
  probeGeo.setAttribute('position', new THREE.Float32BufferAttribute(combinedPositions, 3));
  const rawAutoLayout = analyzeHumanoidGeometry(probeGeo);
  const detectedLayout =
    options.config &&
    (options.config.pelvisHeightOffset ||
      options.config.shoulderHeightOffset ||
      options.config.neckHeightOffset ||
      (options.config.armSpanScale !== undefined && options.config.armSpanScale !== 1.0) ||
      options.config.isolateBackAppendages === false ||
      Object.keys(baseConfig.manualLandmarks).length > 0)
      ? analyzeHumanoidGeometry(probeGeo, baseConfig)
      : rawAutoLayout;
  const layout = applyManualRigLandmarks(
    detectedLayout,
    baseConfig.manualLandmarks
  );
  probeGeo.dispose();

  const { root, skeleton, bonesMap } = buildHumanoidSkeleton(layout);

  const group = new THREE.Group();
  group.name = 'customRig_root';
  const transformGroup = new THREE.Group();
  transformGroup.name = 'calibration_transform';
  const modelWrapper = new THREE.Group();
  modelWrapper.name = 'autoRig_wrapper';
  modelWrapper.add(root);
  transformGroup.add(modelWrapper);
  group.add(transformGroup);
  // CRITICAL: update world matrices of the entire bone hierarchy BEFORE sm.bind(skeleton)
  // so skeleton.calculateInverses() captures true rest transforms instead of Identity!
  modelWrapper.updateMatrixWorld(true);
  skeleton.calculateInverses();

  const meshEntries: MeshMaterialEntry[] = [];
  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];
  let hasNativeTextures = false;
  let hasNativeUvs = false;
  let primarySkinned: THREE.SkinnedMesh | null = null;

  for (const part of bakedParts) {
    const geo = part.geo;
    const posAttr = geo.attributes.position;
    const count = posAttr.count;

    if (part.hadNativeUvs) hasNativeUvs = true;
    const partHasTexture = materialHasAnyTexture(part.origMat);
    if (partHasTexture) hasNativeTextures = true;

    if (!geo.attributes.uv) {
      const uvs = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        uvs[i * 2] = Math.atan2(x, z) / (2 * Math.PI) + 0.5;
        uvs[i * 2 + 1] = clamp(y / targetHeight, 0, 1);
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    // Add anatomical vertex colors ONLY when mesh has no native UVs+texture and no native vertex colors
    if (!geo.attributes.color && !(part.hadNativeUvs && partHasTexture)) {
      const colors = new Float32Array(count * 3);
      const colBoot = new THREE.Color(0x4a3728);
      const colPants = new THREE.Color(0x5c4033);
      const colSash = new THREE.Color(0xc0392b);
      const colLeather = new THREE.Color(0xbf9b7a);
      const colSkin = new THREE.Color(0xecb394);
      const colHair = new THREE.Color(0x7a6558);

      for (let i = 0; i < count; i++) {
        const y = posAttr.getY(i);
        let c = colLeather;
        if (y < layout.kneeY) c = colBoot;
        else if (y < layout.pelvisY) c = colPants;
        else if (y < layout.pelvisY + 0.06) c = colSash;
        else if (y < layout.neckY) c = colLeather;
        else if (y < layout.neckY + 0.13) c = colSkin;
        else c = colHair;

        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    applyAnatomicalSkinWeights(geo, layout);
    geometriesToDispose.push(geo);

    const fallbackTex = part.hadNativeUvs && !partHasTexture ? cachedTexture : null;
    const { toonMat, texturedMat } = buildMaterialPair(
      part.origMat,
      geo,
      gradientMap,
      fallbackTex,
      part.hadNativeUvs,
      materialsToDispose,
      true
    );

    const sm = new THREE.SkinnedMesh(geo, toonMat);
    sm.name = part.name;
    sm.frustumCulled = false;
    sm.castShadow = true;
    sm.receiveShadow = true;
    modelWrapper.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);

    if (!primarySkinned) primarySkinned = sm;

    let outlineMesh: THREE.SkinnedMesh | null = null;
    if (outlinesEnabled) {
      const outlineGeo = createNormalExtrudedOutlineGeometry(geo, 0.0055);
      geometriesToDispose.push(outlineGeo);
      const outlineMat = new THREE.MeshBasicMaterial({
        color: BRAWL_PALETTE.battle.outlineHex,
        side: THREE.BackSide,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2
      });
      materialsToDispose.push(outlineMat);

      outlineMesh = new THREE.SkinnedMesh(outlineGeo, outlineMat);
      outlineMesh.name = `${part.name}_outline`;
      outlineMesh.userData.isOutline = true;
      outlineMesh.frustumCulled = false;
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      modelWrapper.add(outlineMesh);
      outlineMesh.bind(skeleton, sm.bindMatrix);
    }

    meshEntries.push({
      mesh: sm,
      toonMat,
      texturedMat,
      outlineMesh,
      hadNativeColors: part.hadNativeColors
    });
  }

  const finalPrimary = primarySkinned!;
  const firstToon = meshEntries[0].toonMat;
  const primaryToon = (Array.isArray(firstToon) ? firstToon[0] : firstToon) as THREE.MeshToonMaterial;
  const firstTex = meshEntries[0].texturedMat;
  const primaryTextured = (Array.isArray(firstTex) ? firstTex[0] : firstTex) as THREE.MeshStandardMaterial;

  const fallbackClips = createRigAnimationClips(
    bonesMap,
    layout,
    baseConfig.armDropOffsetRad
  );
  // Auto-rigged static meshes have no source skeleton for embedded tracks to drive.
  const { resolved, allClips, animationSource, oneShotRoles } = matchEmbeddedAnimations(
    [],
    fallbackClips
  );

  const resolvedMaterialMode =
    options.config?.materialMode ??
    options.initialMaterialMode ??
    (hasNativeTextures && hasNativeUvs ? 'textured' : 'toon');
  const resolvedWeapons = options.config?.weaponsEnabled ?? true;
  const appliedConfig = normalizeCustomModelConfig({
    ...baseConfig,
    materialMode: resolvedMaterialMode,
    weaponsEnabled: resolvedWeapons
  });
  applyManualSkinWeightEdits(meshEntries, appliedConfig.manualWeightEdits);

  const worldPositionsProbe = new Map<THREE.Bone, THREE.Vector3>();
  modelWrapper.updateMatrixWorld(true);
  for (const b of Object.values(bonesMap)) {
    const p = new THREE.Vector3();
    b.getWorldPosition(p);
    worldPositionsProbe.set(b, p);
  }
  const detectedDrop = detectRestArmDropAngle(bonesMap, worldPositionsProbe);

  const autoProfile: AutoRigProfile = {
    proportionClass: rawAutoLayout.proportionClass ?? 'balanced',
    armPose: rawAutoLayout.armPose ?? 't-pose',
    detectedPelvisY: rawAutoLayout.pelvisY,
    detectedShoulderY: rawAutoLayout.shoulderY,
    detectedNeckY: rawAutoLayout.neckY,
    detectedHeadTopY: rawAutoLayout.headTopY,
    detectedArmDropRad: detectedDrop,
    hasBackAppendages: Boolean(rawAutoLayout.hasBackAppendages),
    hasFloatingHalo: Boolean(rawAutoLayout.hasFloatingHalo),
    backAppendageZ: rawAutoLayout.backAppendageZ ?? -0.09,
    rearSign: rawAutoLayout.rearSign ?? -1,
    nativeHeight: height
  };

  const controller = new CustomRigController({
    group,
    transformGroup,
    modelRoot: modelWrapper,
    skeletonRoot: modelWrapper,
    skinnedMesh: finalPrimary,
    skeleton,
    allSkeletons: [skeleton],
    bones: bonesMap,
    clips: resolved,
    allClips,
    oneShotRoles,
    toonMaterial: primaryToon,
    texturedMaterial: primaryTextured,
    meshEntries,
    outlineMesh: meshEntries[0]?.outlineMesh ?? null,
    metadata: {
      modelName,
      rigSource: 'auto_rig',
      animationSource,
      boneCount: skeleton.bones.length,
      meshCount: bakedParts.length,
      hasNativeTextures,
      hasNativeUvs,
      availableClipNames: allClips.map(c => c.name),
      autoProfile,
      appliedConfig
    },
    geometriesToDispose,
    materialsToDispose
  });

  buildWeaponsForController(controller, bonesMap, gradientMap, isPlayer, modelWrapper);
  controller.applyDisplayConfig(appliedConfig);
  return controller;
}

export type DetectedModelFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'unknown';

export function detectModelFormat(buffer: ArrayBuffer, modelName: string = ''): DetectedModelFormat {
  const bytes = new Uint8Array(buffer);
  // 1. Binary glTF magic: "glTF"
  if (bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return 'glb';
  }
  // 2. Binary FBX magic: "Kaydara FBX Binary"
  if (bytes.length >= 18) {
    const header = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 21));
    if (header.startsWith('Kaydara FBX Binary')) {
      return 'fbx';
    }
  }

  const ext = modelName.toLowerCase().split('.').pop() ?? '';
  const sampleText = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(4096, bytes.length)));
  const trimmed = sampleText.trimStart();

  if (trimmed.startsWith('{') && (trimmed.includes('"asset"') || trimmed.includes('"meshes"') || ext === 'gltf')) {
    return 'gltf';
  }
  if (/;\s*FBX\b/i.test(sampleText) || /^\s*FBXHeaderExtension:/m.test(sampleText) || ext === 'fbx') {
    return 'fbx';
  }
  if (
    ext === 'obj' ||
    /^\s*(v|vt|vn|f|o|g|mtllib|usemtl)\s+/m.test(sampleText) ||
    (trimmed.startsWith('#') && !trimmed.startsWith('#!') && /^\s*(v|vt|vn|f|mtllib|usemtl)\s+/m.test(sampleText))
  ) {
    return 'obj';
  }

  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  return 'unknown';
}

function createCompanionLoadingManager(companionFiles: CompanionModelFile[]): {
  manager: THREE.LoadingManager;
  cleanup: () => void;
} {
  const manager = new THREE.LoadingManager();
  const blobUrls: string[] = [];

  if (companionFiles.length > 0) {
    const byName = new Map<string, string>();
    for (const file of companionFiles) {
      const url = URL.createObjectURL(new Blob([file.buffer]));
      blobUrls.push(url);
      const norm = file.name.replace(/\\/g, '/').toLowerCase();
      const base = norm.split('/').pop() ?? norm;
      byName.set(norm, url);
      if (!byName.has(base)) {
        byName.set(base, url);
      }
    }

    manager.setURLModifier(url => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      const clean = url.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
      const base = clean.split('/').pop() ?? clean;
      return byName.get(clean) ?? byName.get(base) ?? url;
    });
  }

  const cleanup = () => {
    if (blobUrls.length === 0) return;
    setTimeout(() => {
      for (const u of blobUrls) {
        URL.revokeObjectURL(u);
      }
    }, 3000);
  };

  return { manager, cleanup };
}

export async function loadTextureFromBuffer(buffer: ArrayBuffer, flipY: boolean = true): Promise<THREE.Texture> {
  const blobUrl = URL.createObjectURL(new Blob([buffer]));
  try {
    const loader = new THREE.TextureLoader();
    const tex = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(blobUrl, resolve, undefined, reject);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = flipY;
    tex.needsUpdate = true;
    return tex;
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  }
}

/**
 * Parses and imports ANY .glb / .gltf / .fbx / .obj File or ArrayBuffer into a ready-to-animate CustomRigController.
 */
export async function importRiggedModelFromBuffer(
  buffer: ArrayBuffer,
  options: RigInstanceOptions = {}
): Promise<CustomRigController> {
  const modelName = options.modelName ?? 'model.glb';
  const format = detectModelFormat(buffer, modelName);
  const companions = options.companionFiles ?? [];
  const { manager, cleanup } = createCompanionLoadingManager(companions);

  try {
    let gltfLike: GLTF;

    if (format === 'glb' || format === 'gltf') {
      const loader = new GLTFLoader(manager);
      loader.setMeshoptDecoder(MeshoptDecoder);
      gltfLike = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(buffer, '', resolve, reject);
      });
    } else if (format === 'fbx') {
      const fbxLoader = new FBXLoader(manager);
      const fbxGroup = fbxLoader.parse(buffer, '');
      const anims = (fbxGroup as THREE.Object3D & { animations?: THREE.AnimationClip[] }).animations ?? [];
      gltfLike = {
        scene: fbxGroup,
        scenes: [fbxGroup],
        animations: anims,
        cameras: [],
        asset: {},
        parser: {} as GLTF['parser'],
        userData: {}
      };
    } else if (format === 'obj') {
      const objText = new TextDecoder('utf-8').decode(buffer);
      const objLoader = new OBJLoader(manager);

      // Attach companion .mtl if supplied
      const mtlMatch = objText.match(/^\s*mtllib\s+(.+)$/m);
      const requestedMtl = mtlMatch?.[1]?.trim().toLowerCase().split(/[\\/]/).pop();
      const mtlFile =
        companions.find(c => c.name.toLowerCase().endsWith('.mtl') && (!requestedMtl || c.name.toLowerCase().endsWith(requestedMtl))) ??
        companions.find(c => c.name.toLowerCase().endsWith('.mtl'));

      if (mtlFile) {
        const mtlText = new TextDecoder('utf-8').decode(mtlFile.buffer);
        const mtlLoader = new MTLLoader(manager);
        const materials = mtlLoader.parse(mtlText, '');
        materials.preload();
        objLoader.setMaterials(materials);
      }

      const objGroup = objLoader.parse(objText);
      gltfLike = {
        scene: objGroup,
        scenes: [objGroup],
        animations: [],
        cameras: [],
        asset: {},
        parser: {} as GLTF['parser'],
        userData: {}
      };
    } else {
      throw new Error(
        `El archivo "${modelName}" no tiene un formato 3D compatible. Usa archivos .glb, .gltf, .fbx o .obj.`
      );
    }

    const controller = createControllerFromGltf(gltfLike, options);

    // If a companion image texture was dropped without .mtl (or standalone texture override exists), apply it
    if (!controller.metadata.hasNativeTextures) {
      const companionImage = companions.find(c => /\.(png|jpe?g|webp|bmp)$/i.test(c.name));
      if (companionImage && typeof URL !== 'undefined' && typeof Image !== 'undefined') {
        try {
          const flipY = format === 'obj' || format === 'fbx';
          const tex = await loadTextureFromBuffer(companionImage.buffer, flipY);
          controller.applyCustomTexture(tex);
          if (
            !options.initialMaterialMode &&
            !options.config?.materialMode &&
            controller.metadata.hasNativeUvs
          ) {
            controller.setMaterialMode('textured');
          }
        } catch {
          // Ignore malformed companion texture
        }
      }
    }

    return controller;
  } finally {
    cleanup();
  }
}

/**
 * Instantiates a rigged, skinned and animated controller from a URL (defaults to /models/model01.glb
 * or any user-supplied override).
 */
export async function createRiggedModelInstance(
  isPlayer: boolean = true,
  outlinesEnabled: boolean = true,
  url?: string,
  options?: Omit<RigInstanceOptions, 'isPlayer' | 'outlinesEnabled' | 'url'>
): Promise<CustomRigController> {
  if (!url && customHeroOverrideBuffer) {
    const effectiveConfig = options?.config ?? customHeroOverrideConfig ?? undefined;
    const controller = await importRiggedModelFromBuffer(customHeroOverrideBuffer, {
      isPlayer,
      outlinesEnabled,
      modelName: customHeroOverrideName ?? 'custom_model.glb',
      companionFiles: customHeroOverrideCompanions,
      ...options,
      config: effectiveConfig
    });
    if (customHeroOverrideTextureBuffer && typeof URL !== 'undefined' && typeof Image !== 'undefined') {
      try {
        const fmt = detectModelFormat(customHeroOverrideBuffer, customHeroOverrideName ?? '');
        const tex = await loadTextureFromBuffer(customHeroOverrideTextureBuffer, fmt === 'obj' || fmt === 'fbx');
        controller.applyCustomTexture(tex);
        if (effectiveConfig?.materialMode) {
          controller.setMaterialMode(effectiveConfig.materialMode);
        }
      } catch {
        // ignore invalid override texture
      }
    }
    return controller;
  }

  const targetUrl = url ?? '/models/model01.glb';
  const gltf = await loadDefaultGltf(targetUrl);
  const derivedName = options?.modelName ?? targetUrl.split('/').pop() ?? 'model01.glb';
  return createControllerFromGltf(gltf, {
    isPlayer,
    outlinesEnabled,
    url: targetUrl,
    modelName: derivedName,
    ...options
  });
}
