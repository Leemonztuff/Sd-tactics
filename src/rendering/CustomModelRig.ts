import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BRAWL_PALETTE,
  attachInvertedHullOutline,
  getBrawlToonGradientTexture
} from './BrawlStyleSystem';

export interface RigAnimationClips {
  idle: THREE.AnimationClip;
  attack: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  hit: THREE.AnimationClip;
}

export type CustomMaterialMode = 'toon' | 'textured';

export class CustomRigController {
  public group: THREE.Group;
  public skinnedMesh: THREE.SkinnedMesh;
  public skeleton: THREE.Skeleton;
  public bones: Record<string, THREE.Bone>;
  public mixer: THREE.AnimationMixer;
  public clips: RigAnimationClips;
  public actions: Record<string, THREE.AnimationAction>;
  public currentActionName: string = 'idle';
  public skeletonHelper: THREE.SkeletonHelper;
  public outlineMesh: THREE.SkinnedMesh | THREE.Mesh | null = null;
  public weaponGroup: THREE.Group | null = null;
  public shieldMesh: THREE.Mesh | null = null;
  public toonMaterial: THREE.MeshToonMaterial;
  public texturedMaterial: THREE.MeshStandardMaterial;
  public currentMaterialMode: CustomMaterialMode = 'toon';
  public timeScale: number = 1.0;
  private attackCallback: (() => void) | null = null;

  public setWeaponsVisible(visible: boolean) {
    if (this.weaponGroup) this.weaponGroup.visible = visible;
    if (this.shieldMesh) this.shieldMesh.visible = visible;
  }

  constructor(
    group: THREE.Group,
    skinnedMesh: THREE.SkinnedMesh,
    skeleton: THREE.Skeleton,
    bones: Record<string, THREE.Bone>,
    clips: RigAnimationClips,
    toonMaterial: THREE.MeshToonMaterial,
    texturedMaterial: THREE.MeshStandardMaterial,
    outlineMesh: THREE.SkinnedMesh | THREE.Mesh | null
  ) {
    this.group = group;
    this.skinnedMesh = skinnedMesh;
    this.skeleton = skeleton;
    this.bones = bones;
    this.clips = clips;
    this.toonMaterial = toonMaterial;
    this.texturedMaterial = texturedMaterial;
    this.outlineMesh = outlineMesh;

    this.skeletonHelper = new THREE.SkeletonHelper(this.skinnedMesh);
    this.skeletonHelper.visible = false;
    this.group.add(this.skeletonHelper);

    this.mixer = new THREE.AnimationMixer(this.skinnedMesh);
    this.actions = {
      idle: this.mixer.clipAction(this.clips.idle),
      attack: this.mixer.clipAction(this.clips.attack),
      walk: this.mixer.clipAction(this.clips.walk),
      hit: this.mixer.clipAction(this.clips.hit)
    };

    // Configure attack as non-looping with return to idle
    this.actions.attack.setLoop(THREE.LoopOnce, 1);
    this.actions.attack.clampWhenFinished = true;

    this.actions.hit.setLoop(THREE.LoopOnce, 1);
    this.actions.hit.clampWhenFinished = true;

    this.mixer.addEventListener('finished', (e: { action: THREE.AnimationAction }) => {
      if (e.action === this.actions.attack) {
        if (this.attackCallback) {
          const cb = this.attackCallback;
          this.attackCallback = null;
          cb();
        }
        this.playIdle(0.22);
      } else if (e.action === this.actions.hit) {
        this.playIdle(0.18);
      }
    });

    this.playIdle(0);
  }

  public playIdle(fadeDuration: number = 0.2) {
    if (this.currentActionName === 'idle' && this.actions.idle.isRunning()) return;
    const prev = this.actions[this.currentActionName];
    const next = this.actions.idle;
    next.reset();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fadeDuration, true);
    }
    next.play();
    this.currentActionName = 'idle';
  }

  public playAttack(onComplete?: () => void, fadeDuration: number = 0.1) {
    this.attackCallback = onComplete ?? null;
    const prev = this.actions[this.currentActionName];
    const next = this.actions.attack;
    next.reset();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fadeDuration, true);
    }
    next.play();
    this.currentActionName = 'attack';
  }

  public playWalk(fadeDuration: number = 0.15) {
    if (this.currentActionName === 'walk' && this.actions.walk.isRunning()) return;
    const prev = this.actions[this.currentActionName];
    const next = this.actions.walk;
    next.reset();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fadeDuration, true);
    }
    next.play();
    this.currentActionName = 'walk';
  }

  public playHit(fadeDuration: number = 0.08) {
    const prev = this.actions[this.currentActionName];
    const next = this.actions.hit;
    next.reset();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fadeDuration, true);
    }
    next.play();
    this.currentActionName = 'hit';
  }

  public setSpeed(speed: number) {
    this.timeScale = Math.max(0.1, Math.min(3.0, speed));
    this.mixer.timeScale = this.timeScale;
  }

  public setMaterialMode(mode: CustomMaterialMode) {
    this.currentMaterialMode = mode;
    if (mode === 'toon') {
      this.skinnedMesh.material = this.toonMaterial;
      if (this.outlineMesh) this.outlineMesh.visible = true;
    } else {
      this.skinnedMesh.material = this.texturedMaterial;
      if (this.outlineMesh) this.outlineMesh.visible = false;
    }
  }

  public setSkeletonVisible(visible: boolean) {
    this.skeletonHelper.visible = visible;
  }

  public update(dt: number) {
    this.mixer.update(dt);
    if (this.skeletonHelper.visible) {
      this.skeletonHelper.updateMatrixWorld(true);
    }
  }

  public dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.skinnedMesh);
    this.skeleton.dispose();
    this.skeletonHelper.dispose();
    this.toonMaterial.dispose();
    this.texturedMaterial.dispose();
  }
}

// Global cached geometry & textures for instant instancing
let cachedBaseGeometry: THREE.BufferGeometry | null = null;
let cachedTexture: THREE.Texture | null = null;
let modelLoadingPromise: Promise<THREE.BufferGeometry> | null = null;

function eulerToQuat(x: number, y: number, z: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Builds the 13-bone humanoid skeletal hierarchy.
 */
export function buildHumanoidSkeleton(): {
  root: THREE.Bone;
  skeleton: THREE.Skeleton;
  bonesMap: Record<string, THREE.Bone>;
} {
  const root = new THREE.Bone();
  root.name = 'root';

  const pelvis = new THREE.Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.42, 0);

  const spine = new THREE.Bone();
  spine.name = 'spine';
  spine.position.set(0, 0.16, 0);

  const chest = new THREE.Bone();
  chest.name = 'chest';
  chest.position.set(0, 0.14, 0);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, 0.16, 0);

  const leftShoulder = new THREE.Bone();
  leftShoulder.name = 'leftShoulder';
  leftShoulder.position.set(-0.16, 0.06, 0);

  const leftArm = new THREE.Bone();
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.14, -0.08, 0);

  const rightShoulder = new THREE.Bone();
  rightShoulder.name = 'rightShoulder';
  rightShoulder.position.set(0.16, 0.06, 0);

  const rightArm = new THREE.Bone();
  rightArm.name = 'rightArm';
  rightArm.position.set(0.14, -0.08, 0);

  const leftHip = new THREE.Bone();
  leftHip.name = 'leftHip';
  leftHip.position.set(-0.11, -0.05, 0);

  const leftLeg = new THREE.Bone();
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(0, -0.22, 0);

  const rightHip = new THREE.Bone();
  rightHip.name = 'rightHip';
  rightHip.position.set(0.11, -0.05, 0);

  const rightLeg = new THREE.Bone();
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0, -0.22, 0);

  // Parent linkage
  root.add(pelvis);
  pelvis.add(spine);
  spine.add(chest);
  chest.add(head);
  chest.add(leftShoulder);
  leftShoulder.add(leftArm);
  chest.add(rightShoulder);
  rightShoulder.add(rightArm);
  pelvis.add(leftHip);
  leftHip.add(leftLeg);
  pelvis.add(rightHip);
  rightHip.add(rightLeg);

  const bones = [
    root,
    pelvis,
    spine,
    chest,
    head,
    leftShoulder,
    leftArm,
    rightShoulder,
    rightArm,
    leftHip,
    leftLeg,
    rightHip,
    rightLeg
  ];

  const bonesMap: Record<string, THREE.Bone> = {};
  bones.forEach(b => {
    bonesMap[b.name] = b;
  });

  const skeleton = new THREE.Skeleton(bones);
  return { root, skeleton, bonesMap };
}

/**
 * Calculates smooth anatomical skin weights and indices for all vertices.
 */
export function applyAnatomicalSkinWeights(geometry: THREE.BufferGeometry): void {
  const posAttr = geometry.attributes.position;
  const count = posAttr.count;

  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  // Bone index mapping according to buildHumanoidSkeleton
  const B = {
    root: 0,
    pelvis: 1,
    spine: 2,
    chest: 3,
    head: 4,
    leftShoulder: 5,
    leftArm: 6,
    rightShoulder: 7,
    rightArm: 8,
    leftHip: 9,
    leftLeg: 10,
    rightHip: 11,
    rightLeg: 12
  };

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const idx = [0, 0, 0, 0];
    const w = [0, 0, 0, 0];

    if (y < 0.22) {
      // Lower legs / boots
      if (x < 0) {
        idx[0] = B.leftLeg;
        w[0] = 0.82;
        idx[1] = B.leftHip;
        w[1] = 0.18;
      } else {
        idx[0] = B.rightLeg;
        w[0] = 0.82;
        idx[1] = B.rightHip;
        w[1] = 0.18;
      }
    } else if (y < 0.44) {
      // Hips & upper legs
      if (x < 0) {
        idx[0] = B.leftHip;
        w[0] = 0.55;
        idx[1] = B.pelvis;
        w[1] = 0.35;
        idx[2] = B.leftLeg;
        w[2] = 0.10;
      } else {
        idx[0] = B.rightHip;
        w[0] = 0.55;
        idx[1] = B.pelvis;
        w[1] = 0.35;
        idx[2] = B.rightLeg;
        w[2] = 0.10;
      }
    } else if (y < 0.62) {
      // Pelvis / waist / mid-torso
      idx[0] = B.spine;
      w[0] = 0.60;
      idx[1] = B.pelvis;
      w[1] = 0.28;
      idx[2] = B.chest;
      w[2] = 0.12;
    } else if (y < 0.80) {
      // Upper chest / shoulders / arms
      if (x < -0.16) {
        idx[0] = B.leftArm;
        w[0] = 0.70;
        idx[1] = B.leftShoulder;
        w[1] = 0.25;
        idx[2] = B.chest;
        w[2] = 0.05;
      } else if (x > 0.16) {
        idx[0] = B.rightArm;
        w[0] = 0.70;
        idx[1] = B.rightShoulder;
        w[1] = 0.25;
        idx[2] = B.chest;
        w[2] = 0.05;
      } else {
        idx[0] = B.chest;
        w[0] = 0.75;
        idx[1] = B.spine;
        w[1] = 0.20;
        idx[2] = B.head;
        w[2] = 0.05;
      }
    } else {
      // Head / hair
      idx[0] = B.head;
      w[0] = 0.85;
      idx[1] = B.chest;
      w[1] = 0.15;
    }

    // Normalize weights to sum exactly to 1.0
    const sum = w[0] + w[1] + w[2] + w[3];
    const inv = sum > 0 ? 1.0 / sum : 1.0;
    for (let k = 0; k < 4; k++) {
      skinIndices[i * 4 + k] = idx[k];
      skinWeights[i * 4 + k] = w[k] * inv;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Builds keyframed animation clips for IDLE, ATTACK, WALK, and HIT.
 */
export function createRigAnimationClips(): RigAnimationClips {
  // 1. IDLE CLIP (2.4s period, smooth breathing & ready combat stance)
  const idleTimes = [0, 0.6, 1.2, 1.8, 2.4];
  const p0 = [0, 0.42, 0];
  const pBreathHigh = [0, 0.428, 0];
  const pBreathLow = [0, 0.414, 0];
  const idleTracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack('pelvis.position', idleTimes, [
      ...p0,
      ...pBreathHigh,
      ...p0,
      ...pBreathLow,
      ...p0
    ]),
    new THREE.VectorKeyframeTrack('chest.scale', idleTimes, [
      1, 1, 1,
      1.035, 1.025, 1.04,
      1, 1, 1,
      0.985, 0.99, 0.985,
      1, 1, 1
    ]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', idleTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.02, 0.025, -0.015),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.015, -0.02, 0.015),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', idleTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.025, -0.015, 0.01),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.015, 0.015, -0.01),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('rightShoulder.quaternion', idleTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.04, -0.03, 0.03),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.03, 0.02, -0.02),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('rightArm.quaternion', idleTimes, [
      ...eulerToQuat(0.12, 0, 0.08),
      ...eulerToQuat(0.16, 0.04, 0.12),
      ...eulerToQuat(0.12, 0, 0.08),
      ...eulerToQuat(0.08, -0.02, 0.05),
      ...eulerToQuat(0.12, 0, 0.08)
    ]),
    new THREE.QuaternionKeyframeTrack('leftShoulder.quaternion', idleTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.03, 0.02, -0.03),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.02, -0.02, 0.02),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('leftArm.quaternion', idleTimes, [
      ...eulerToQuat(0.12, 0, -0.08),
      ...eulerToQuat(0.15, -0.03, -0.11),
      ...eulerToQuat(0.12, 0, -0.08),
      ...eulerToQuat(0.09, 0.02, -0.06),
      ...eulerToQuat(0.12, 0, -0.08)
    ])
  ];
  const idle = new THREE.AnimationClip('idle', 2.4, idleTracks);

  // 2. ATTACK CLIP (1.0s, high-impact Brawl-Tactics anticipation, slash & elastic recovery)
  const atkTimes = [0, 0.22, 0.38, 0.48, 0.70, 1.0];
  const atkTracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack('pelvis.position', atkTimes, [
      0, 0.42, 0,         // start stance
      0, 0.36, -0.16,     // windup: drop low and pull back
      0, 0.45, 0.42,      // explosive forward strike lunge
      0, 0.44, 0.40,      // hit impact hold
      0, 0.415, -0.04,    // recoil overshoot
      0, 0.42, 0          // elastic return to ready
    ]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.12, -0.45, 0.15),  // coil back torso
      ...eulerToQuat(0.24, 0.48, -0.18),   // whip torso through strike
      ...eulerToQuat(0.20, 0.45, -0.15),   // hold frame
      ...eulerToQuat(-0.06, -0.10, 0.05),  // counter recoil
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.VectorKeyframeTrack('chest.scale', atkTimes, [
      1, 1, 1,
      0.96, 0.95, 0.96,
      1.08, 0.94, 1.08,   // strike tension
      1.06, 0.95, 1.06,
      0.98, 1.02, 0.98,
      1, 1, 1
    ]),
    new THREE.QuaternionKeyframeTrack('rightShoulder.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.75, 0.30, 0.55),   // windup raise weapon high
      ...eulerToQuat(1.15, -0.35, -0.40),  // slash down across forward
      ...eulerToQuat(1.10, -0.30, -0.35),
      ...eulerToQuat(0.20, -0.10, -0.05),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('rightArm.quaternion', atkTimes, [
      ...eulerToQuat(0.12, 0, 0.08),
      ...eulerToQuat(-0.95, 0.45, 0.60),   // arm fully cocked back
      ...eulerToQuat(1.40, -0.40, -0.25),  // strike extension
      ...eulerToQuat(1.35, -0.35, -0.20),
      ...eulerToQuat(0.35, -0.10, 0.05),
      ...eulerToQuat(0.12, 0, 0.08)
    ]),
    new THREE.QuaternionKeyframeTrack('leftShoulder.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.40, 0.20, -0.35),   // counter-balance reach forward
      ...eulerToQuat(-0.55, -0.25, 0.30),  // sweep back for torque
      ...eulerToQuat(-0.50, -0.20, 0.25),
      ...eulerToQuat(-0.15, -0.05, 0.10),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('leftArm.quaternion', atkTimes, [
      ...eulerToQuat(0.12, 0, -0.08),
      ...eulerToQuat(0.45, 0.15, -0.40),
      ...eulerToQuat(-0.65, -0.30, 0.35),
      ...eulerToQuat(-0.60, -0.25, 0.30),
      ...eulerToQuat(-0.10, -0.05, 0.05),
      ...eulerToQuat(0.12, 0, -0.08)
    ]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.08, 0.25, -0.08),   // eyes locked on enemy during coil
      ...eulerToQuat(0.15, -0.20, 0.06),   // head follows strike thrust
      ...eulerToQuat(0.12, -0.15, 0.04),
      ...eulerToQuat(-0.04, 0.05, -0.02),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('leftLeg.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.25, 0, 0),          // front foot plants
      ...eulerToQuat(-0.40, 0, 0),         // kick forward
      ...eulerToQuat(-0.35, 0, 0),
      ...eulerToQuat(0.10, 0, 0),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('rightLeg.quaternion', atkTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.30, 0, 0),         // back leg braces
      ...eulerToQuat(0.35, 0, 0),          // follow through
      ...eulerToQuat(0.30, 0, 0),
      ...eulerToQuat(-0.08, 0, 0),
      ...eulerToQuat(0, 0, 0)
    ])
  ];
  const attack = new THREE.AnimationClip('attack', 1.0, atkTracks);

  // 3. WALK CLIP (0.8s looping tactical stride)
  const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
  const walkTracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack('pelvis.position', walkTimes, [
      0, 0.42, 0,
      0, 0.445, 0,
      0, 0.42, 0,
      0, 0.445, 0,
      0, 0.42, 0
    ]),
    new THREE.QuaternionKeyframeTrack('leftLeg.quaternion', walkTimes, [
      ...eulerToQuat(0.40, 0, 0),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.40, 0, 0),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.40, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('rightLeg.quaternion', walkTimes, [
      ...eulerToQuat(-0.40, 0, 0),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.40, 0, 0),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.40, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('leftArm.quaternion', walkTimes, [
      ...eulerToQuat(-0.35, 0, -0.10),
      ...eulerToQuat(0.10, 0, -0.08),
      ...eulerToQuat(0.35, 0, -0.06),
      ...eulerToQuat(0.10, 0, -0.08),
      ...eulerToQuat(-0.35, 0, -0.10)
    ]),
    new THREE.QuaternionKeyframeTrack('rightArm.quaternion', walkTimes, [
      ...eulerToQuat(0.35, 0, 0.06),
      ...eulerToQuat(0.10, 0, 0.08),
      ...eulerToQuat(-0.35, 0, 0.10),
      ...eulerToQuat(0.10, 0, 0.08),
      ...eulerToQuat(0.35, 0, 0.06)
    ]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', walkTimes, [
      ...eulerToQuat(0.04, 0.08, -0.03),
      ...eulerToQuat(0.02, 0, 0),
      ...eulerToQuat(0.04, -0.08, 0.03),
      ...eulerToQuat(0.02, 0, 0),
      ...eulerToQuat(0.04, 0.08, -0.03)
    ])
  ];
  const walk = new THREE.AnimationClip('walk', 0.8, walkTracks);

  // 4. HIT CLIP (0.35s damage flinch)
  const hitTimes = [0, 0.08, 0.20, 0.35];
  const hitTracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack('pelvis.position', hitTimes, [
      0, 0.42, 0,
      0, 0.40, -0.15,
      0, 0.425, -0.04,
      0, 0.42, 0
    ]),
    new THREE.QuaternionKeyframeTrack('spine.quaternion', hitTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.25, 0.15, -0.12),
      ...eulerToQuat(-0.08, 0.05, -0.04),
      ...eulerToQuat(0, 0, 0)
    ]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', hitTimes, [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.35, -0.18, 0.15),
      ...eulerToQuat(-0.10, -0.05, 0.04),
      ...eulerToQuat(0, 0, 0)
    ])
  ];
  const hit = new THREE.AnimationClip('hit', 0.35, hitTracks);

  return { idle, attack, walk, hit };
}

/**
 * Normalizes the raw buffer geometry from model01.glb:
 * - Grounds base of model to y = 0
 * - Scales to standard height ~1.0
 * - Generates smooth normals and cylindrical UV coordinates
 */
export function normalizeModelGeometry(rawMesh: THREE.Mesh): THREE.BufferGeometry {
  const geo = rawMesh.geometry.clone();

  // If node translation/scale was not applied to geometry, apply it
  if (rawMesh.scale.x !== 1 || rawMesh.position.x !== 0 || rawMesh.position.y !== 0) {
    rawMesh.updateWorldMatrix(true, false);
    geo.applyMatrix4(rawMesh.matrix);
  }

  geo.computeBoundingBox();
  const box = geo.boundingBox ?? new THREE.Box3();

  const minY = box.min.y;
  const height = box.max.y - box.min.y;
  const targetHeight = 1.0;
  const scaleFactor = height > 0 ? targetHeight / height : 1.0;

  // Center X and Z, ground Y to 0
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

  // Generate cylindrical UV mapping for texture atlas compatibility
  if (!geo.attributes.uv) {
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const u = (Math.atan2(x, z) / (2 * Math.PI)) + 0.5;
      const v = Math.min(1.0, Math.max(0.0, y / targetHeight));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  // Generate rich anatomical vertex colors matching reference image (brown hair, warm skin, tan leather, red sash, brown boots)
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

  applyAnatomicalSkinWeights(geo);
  return geo;
}

/**
 * Loads the base GLTF model once and caches it.
 */
export async function loadBaseModelGeometry(url: string = '/models/model01.glb'): Promise<THREE.BufferGeometry> {
  if (cachedBaseGeometry) {
    return cachedBaseGeometry;
  }
  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = new Promise<THREE.BufferGeometry>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      gltf => {
        let foundMesh: THREE.Mesh | null = null;
        gltf.scene.traverse(obj => {
          if (!foundMesh && (obj as THREE.Mesh).isMesh) {
            foundMesh = obj as THREE.Mesh;
          }
        });

        if (!foundMesh) {
          reject(new Error('No mesh found in GLTF model'));
          return;
        }

        const mesh = foundMesh as THREE.Mesh;
        const normGeo = normalizeModelGeometry(mesh);
        cachedBaseGeometry = normGeo;

        // Load user uploaded texture png
        const texLoader = new THREE.TextureLoader();
        texLoader.load('/models/model01_texture.png', tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          cachedTexture = tex;
        }, undefined, () => {
          // Fallback to webp if png fails
          texLoader.load('/models/model01_texture.webp', tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            cachedTexture = tex;
          });
        });

        resolve(normGeo);
      },
      undefined,
      err => {
        console.error('Failed to load model01.glb:', err);
        reject(err);
      }
    );
  });

  return modelLoadingPromise;
}

/**
 * Instantiates a fully rigged, skinned and animated controller instance for model01.
 */
export async function createRiggedModelInstance(
  isPlayer: boolean = true,
  outlinesEnabled: boolean = true
): Promise<CustomRigController> {
  const baseGeo = await loadBaseModelGeometry();
  const geo = baseGeo.clone();

  const group = new THREE.Group();
  group.name = 'customRig_root';

  const { root, skeleton, bonesMap } = buildHumanoidSkeleton();

  const gradientMap = getBrawlToonGradientTexture();
  const primaryHex = isPlayer ? 0x2563eb : 0xdc2626;
  const trimHex = isPlayer ? 0xfacc15 : 0xf97316;

  // Brawl Stars stylized Toon material
  const toonMat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap,
    vertexColors: true
  });

  // Textured material
  const texturedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.1,
    vertexColors: true,
    map: cachedTexture
  });

  const skinnedMesh = new THREE.SkinnedMesh(geo, toonMat);
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.name = 'customSkinnedMesh';

  group.add(root);
  group.add(skinnedMesh);
  skinnedMesh.bind(skeleton);

  // Synchronously skinned inverted hull outline
  let outlineMesh: THREE.SkinnedMesh | null = null;
  if (outlinesEnabled) {
    const outlineMat = new THREE.MeshBasicMaterial({
      color: BRAWL_PALETTE.battle.outlineHex,
      side: THREE.BackSide,
      depthWrite: true
    });
    outlineMesh = new THREE.SkinnedMesh(geo, outlineMat);
    outlineMesh.name = 'customSkinnedOutline';
    outlineMesh.scale.setScalar(1.025);
    group.add(outlineMesh);
    outlineMesh.bind(skeleton);
  }

  // Attach chunky stylized weapon (Broadsword with golden guard) to rightArm bone
  const weaponGroup = new THREE.Group();
  weaponGroup.name = 'rightWeapon';
  const bladeGeo = new THREE.BoxGeometry(0.08, 0.65, 0.035);
  const bladeMat = new THREE.MeshToonMaterial({ color: 0xe2e8f0, gradientMap });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.32;
  blade.castShadow = true;
  weaponGroup.add(blade);

  const guardGeo = new THREE.BoxGeometry(0.24, 0.06, 0.06);
  const guardMat = new THREE.MeshToonMaterial({ color: trimHex, gradientMap });
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = 0.02;
  weaponGroup.add(guard);

  const gripGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.20, 8);
  const gripMat = new THREE.MeshToonMaterial({ color: 0x3f2818, gradientMap });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.y = -0.10;
  weaponGroup.add(grip);

  weaponGroup.position.set(0, -0.05, 0.12);
  weaponGroup.rotation.x = -Math.PI / 4;
  bonesMap.rightArm.add(weaponGroup);

  // Attach buckler / shield to leftArm bone
  const shieldGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.045, 12);
  shieldGeo.rotateX(Math.PI / 2);
  const shieldMat = new THREE.MeshToonMaterial({ color: primaryHex, gradientMap });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.position.set(-0.06, -0.04, 0.06);
  shield.castShadow = true;
  bonesMap.leftArm.add(shield);

  const clips = createRigAnimationClips();

  const controller = new CustomRigController(
    group,
    skinnedMesh,
    skeleton,
    bonesMap,
    clips,
    toonMat,
    texturedMat,
    outlineMesh
  );
  controller.weaponGroup = weaponGroup;
  controller.shieldMesh = shield;
  return controller;
}
