import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  analyzeHumanoidGeometry,
  applyManualRigLandmarks,
  applyAnatomicalSkinWeights,
  applyManualSkinWeightEdits,
  buildHumanoidSkeleton,
  createControllerFromGltf,
  createRigAnimationClips,
  detectModelFormat,
  importRiggedModelFromBuffer,
  normalizeCustomModelConfig,
  normalizeModelGeometry
} from '../rendering/CustomModelRig';
import {
  assignCustomModelToSlot,
  buildExportConfigPayload,
  parseImportedConfigJson,
  resetCustomModelLibraryForTests,
  resolveCustomModelForEntity,
  saveCustomModelEntry
} from '../rendering/CustomModelLibrary';

function buildTestSkinnedCharacterScene() {
  const scene = new THREE.Group();
  scene.name = 'RootScene';

  const hips = new THREE.Bone();
  hips.name = 'mixamorig:Hips';
  hips.position.set(0, 95, 0);

  const spine = new THREE.Bone();
  spine.name = 'mixamorig:Spine';
  spine.position.set(0, 18, 0);

  const chest = new THREE.Bone();
  chest.name = 'mixamorig:Spine2';
  chest.position.set(0, 22, 0);

  const head = new THREE.Bone();
  head.name = 'mixamorig:Head';
  head.position.set(0, 24, 0);

  const leftArm = new THREE.Bone();
  leftArm.name = 'mixamorig:LeftArm';
  leftArm.position.set(-18, 16, 0);
  // Intentional non-identity bone roll like Blender/Mixamo rigs
  leftArm.quaternion.setFromEuler(new THREE.Euler(0.15, 0.25, -1.45));

  const rightArm = new THREE.Bone();
  rightArm.name = 'mixamorig:RightArm';
  rightArm.position.set(18, 16, 0);
  rightArm.quaternion.setFromEuler(new THREE.Euler(-0.15, -0.25, 1.45));

  hips.add(spine);
  spine.add(chest);
  chest.add(head);
  chest.add(leftArm);
  chest.add(rightArm);

  const bones = [hips, spine, chest, head, leftArm, rightArm];
  const skeleton = new THREE.Skeleton(bones);

  // Body geometry (0..180cm height)
  const bodyGeo = new THREE.BoxGeometry(40, 140, 24, 2, 4, 2);
  bodyGeo.translate(0, 70, 0);
  const count = bodyGeo.attributes.position.count;
  const skinIdx = new Uint16Array(count * 4);
  const skinWgt = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const x = bodyGeo.attributes.position.getX(i);
    const y = bodyGeo.attributes.position.getY(i);
    if (x < -14 && y > 105) {
      skinIdx[i * 4] = 4; // leftArm
      skinWgt[i * 4] = 1;
    } else if (x > 14 && y > 105) {
      skinIdx[i * 4] = 5; // rightArm
      skinWgt[i * 4] = 1;
    } else if (y > 115) {
      skinIdx[i * 4] = 2; // chest
      skinWgt[i * 4] = 1;
    } else {
      skinIdx[i * 4] = 0; // hips
      skinWgt[i * 4] = 1;
    }
  }
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWgt, 4));

  const armatureWrapper = new THREE.Group();
  armatureWrapper.name = 'Armature';
  armatureWrapper.scale.setScalar(0.01); // 180cm -> 1.8m before importer normalizes to 1.0m

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  bodyMesh.name = 'BodyMesh';
  armatureWrapper.add(hips);
  armatureWrapper.add(bodyMesh);
  scene.add(armatureWrapper);

  // Second mesh (HeadMesh) sharing skeleton
  const headGeo = new THREE.BoxGeometry(24, 30, 24);
  headGeo.translate(0, 165, 0);
  const hCount = headGeo.attributes.position.count;
  const hIdx = new Uint16Array(hCount * 4);
  const hWgt = new Float32Array(hCount * 4);
  for (let i = 0; i < hCount; i++) {
    hIdx[i * 4] = 3; // head
    hWgt[i * 4] = 1;
  }
  headGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(hIdx, 4));
  headGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(hWgt, 4));
  const headMesh = new THREE.SkinnedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xf6eedb }));
  headMesh.name = 'HeadMesh';
  armatureWrapper.add(headMesh);

  scene.updateMatrixWorld(true);
  bodyMesh.bind(skeleton, bodyMesh.matrixWorld);
  headMesh.bind(skeleton, headMesh.matrixWorld);

  return { scene, skeleton, bones, bodyMesh, headMesh };
}

function buildMinimalGlbBufferWithRigAndAnim(): ArrayBuffer {
  // Minimal valid GLB 2.0 with 2-bone skeleton, 1 triangle SkinnedMesh, and 1 animation clip
  const positions = new Float32Array([
    -0.25, 0.0, 0.0,
     0.25, 0.0, 0.0,
     0.0,  1.0, 0.0
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]);
  const joints = new Uint16Array([
    0, 0, 0, 0,
    0, 0, 0, 0,
    1, 0, 0, 0
  ]);
  const weights = new Float32Array([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0
  ]);
  const ibm = new Float32Array([
    1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1,
    1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.5, 0, 1
  ]);
  const animTimes = new Float32Array([0, 0.5, 1.0]);
  const animRots = new Float32Array([
    0, 0, 0, 1,
    0, 0, 0.258819, 0.9659258,
    0, 0, 0, 1
  ]);

  const chunks = [
    Buffer.from(positions.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(joints.buffer),
    Buffer.from(weights.buffer),
    Buffer.from(ibm.buffer),
    Buffer.from(animTimes.buffer),
    Buffer.from(animRots.buffer)
  ];

  const offsets: number[] = [];
  let byteOffset = 0;
  for (const c of chunks) {
    offsets.push(byteOffset);
    byteOffset += c.byteLength;
  }
  const paddedBinLen = Math.ceil(byteOffset / 4) * 4;
  const binBuf = Buffer.alloc(paddedBinLen);
  chunks.forEach((c, idx) => c.copy(binBuf, offsets[idx]));

  const gltfJson = {
    asset: { version: '2.0', generator: 'ValenTest' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'SkinnedTri', mesh: 0, skin: 0 },
      { name: 'Hips', children: [2], translation: [0, 0, 0] },
      { name: 'Spine', translation: [0, 0.5, 0] }
    ],
    skins: [{ joints: [1, 2], inverseBindMatrices: 4 }],
    meshes: [
      {
        name: 'TriMesh',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }
          }
        ]
      }
    ],
    animations: [
      {
        name: 'Custom_Idle',
        channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }],
        samplers: [{ input: 5, interpolation: 'LINEAR', output: 6 }]
      }
    ],
    buffers: [{ byteLength: byteOffset }],
    bufferViews: chunks.map((c, idx) => ({
      buffer: 0,
      byteOffset: offsets[idx],
      byteLength: c.byteLength
    })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.25, 0, 0], max: [0.25, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: 2, type: 'MAT4' },
      { bufferView: 5, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 6, componentType: 5126, count: 3, type: 'VEC4' }
    ]
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPadLen = Math.ceil(jsonRaw.length / 4) * 4;
  const jsonBuf = Buffer.alloc(jsonPadLen, 0x20);
  jsonRaw.copy(jsonBuf);

  const totalLen = 12 + 8 + jsonPadLen + 8 + paddedBinLen;
  const glb = Buffer.alloc(totalLen);
  glb.writeUInt32LE(0x46546c67, 0); // glTF
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLen, 8);
  glb.writeUInt32LE(jsonPadLen, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBuf.copy(glb, 20);
  glb.writeUInt32LE(paddedBinLen, 20 + jsonPadLen);
  glb.writeUInt32LE(0x004e4942, 20 + jsonPadLen + 4); // BIN
  binBuf.copy(glb, 20 + jsonPadLen + 8);

  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}

describe('Custom 3D Model Rig & Universal Importer Tests', () => {
  it('should construct a valid 18-bone humanoid skeletal hierarchy', () => {
    const { skeleton, bonesMap } = buildHumanoidSkeleton();

    assert.equal(skeleton.bones.length, 18);
    assert.ok(bonesMap.root);
    assert.ok(bonesMap.pelvis);
    assert.ok(bonesMap.spine);
    assert.ok(bonesMap.chest);
    assert.ok(bonesMap.head);
    assert.ok(bonesMap.headTop);
    assert.ok(bonesMap.leftShoulder);
    assert.ok(bonesMap.leftArm);
    assert.ok(bonesMap.leftHand);
    assert.ok(bonesMap.rightShoulder);
    assert.ok(bonesMap.rightArm);
    assert.ok(bonesMap.rightHand);
    assert.ok(bonesMap.leftHip);
    assert.ok(bonesMap.leftLeg);
    assert.ok(bonesMap.leftFoot);
    assert.ok(bonesMap.rightHip);
    assert.ok(bonesMap.rightLeg);
    assert.ok(bonesMap.rightFoot);

    assert.equal(bonesMap.pelvis.parent, bonesMap.root);
    assert.equal(bonesMap.spine.parent, bonesMap.pelvis);
    assert.equal(bonesMap.chest.parent, bonesMap.spine);
    assert.equal(bonesMap.head.parent, bonesMap.chest);
    assert.equal(bonesMap.headTop.parent, bonesMap.head);
    assert.equal(bonesMap.rightArm.parent, bonesMap.rightShoulder);
    assert.equal(bonesMap.rightHand.parent, bonesMap.rightArm);
    assert.equal(bonesMap.leftArm.parent, bonesMap.leftShoulder);
    assert.equal(bonesMap.leftHand.parent, bonesMap.leftArm);
    assert.equal(bonesMap.leftFoot.parent, bonesMap.leftLeg);
    assert.equal(bonesMap.rightFoot.parent, bonesMap.rightLeg);
  });

  it('should apply normalized manual landmarks while keeping bilateral joints mirrored', () => {
    const detected = analyzeHumanoidGeometry(new THREE.BoxGeometry(0.2, 1, 0.2));
    const config = normalizeCustomModelConfig({
      manualLandmarks: {
        pelvis: { x: 0, y: 0.4, z: 0.01 },
        chest: { x: 0, y: 0.66, z: 0.015 },
        neck: { x: 0, y: 0.82, z: 0.01 },
        leftShoulder: { x: -0.13, y: 0.65, z: 0 },
        leftElbow: { x: -0.28, y: 0.6, z: 0 },
        leftWrist: { x: -0.41, y: 0.56, z: 0 },
        leftHip: { x: -0.09, y: 0.38, z: 0 },
        leftKnee: { x: -0.09, y: 0.2, z: 0 },
        leftAnkle: { x: -0.09, y: 0.03, z: 0 }
      }
    });
    const layout = applyManualRigLandmarks(detected, config.manualLandmarks);
    const { root, bonesMap } = buildHumanoidSkeleton(layout);
    root.updateMatrixWorld(true);

    const leftShoulder = bonesMap.leftShoulder.getWorldPosition(new THREE.Vector3());
    const rightShoulder = bonesMap.rightShoulder.getWorldPosition(new THREE.Vector3());
    const leftElbow = bonesMap.leftArm.getWorldPosition(new THREE.Vector3());
    const rightElbow = bonesMap.rightArm.getWorldPosition(new THREE.Vector3());
    const leftWrist = bonesMap.leftHand.getWorldPosition(new THREE.Vector3());
    const rightWrist = bonesMap.rightHand.getWorldPosition(new THREE.Vector3());

    assert.ok(leftShoulder.x < 0 && rightShoulder.x > 0);
    assert.ok(Math.abs(leftShoulder.x + rightShoulder.x) < 1e-5);
    assert.ok(Math.abs(leftElbow.x + rightElbow.x) < 1e-5);
    assert.ok(Math.abs(leftWrist.x + rightWrist.x) < 1e-5);
    assert.ok(Math.abs(leftShoulder.y - 0.65) < 1e-5);
    assert.ok(Math.abs(leftElbow.y - 0.6) < 1e-5);
    assert.ok(Math.abs(leftWrist.y - 0.56) < 1e-5);
  });

  it('should restore persisted manual skin weights by bone name and normalize their sum', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const root = new THREE.Bone();
    root.name = 'root';
    const arm = new THREE.Bone();
    arm.name = 'leftArm';
    const skeleton = new THREE.Skeleton([root, arm]);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = 'body';
    mesh.bind(skeleton);

    const config = normalizeCustomModelConfig({
      manualWeightEdits: [{
        meshIndex: 0,
        meshName: 'body',
        vertexIndex: 0,
        influences: [
          { boneName: 'root', weight: 0.4 },
          { boneName: 'leftArm', weight: 0.6 }
        ]
      }]
    });
    applyManualSkinWeightEdits([{
      mesh,
      toonMat: material,
      texturedMat: material,
      outlineMesh: null
    }], config.manualWeightEdits);

    const skinIndex = geometry.attributes.skinIndex;
    const skinWeight = geometry.attributes.skinWeight;
    const armSlot = Array.from({ length: 4 }, (_, slot) => slot).find(
      slot => skeleton.bones[skinIndex.getComponent(0, slot)] === arm
    );
    assert.notEqual(armSlot, undefined);
    assert.ok(skinWeight.getComponent(0, armSlot!) > 0.59);
    const total = Array.from({ length: 4 }, (_, slot) => skinWeight.getComponent(0, slot))
      .reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 0.001);
    geometry.dispose();
    material.dispose();
  });

  it('should assign normalized 4-weight skinning to all vertices', () => {
    const box = new THREE.BoxGeometry(0.8, 1.0, 0.4, 4, 8, 4);
    box.translate(0, 0.5, 0);

    applyAnatomicalSkinWeights(box);

    const skinIndex = box.attributes.skinIndex;
    const skinWeight = box.attributes.skinWeight;

    assert.ok(skinIndex, 'skinIndex attribute must exist');
    assert.ok(skinWeight, 'skinWeight attribute must exist');
    assert.equal(skinIndex.count, box.attributes.position.count);
    assert.equal(skinWeight.count, box.attributes.position.count);

    for (let i = 0; i < skinWeight.count; i++) {
      const sum =
        skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
      assert.ok(Math.abs(sum - 1.0) < 0.001, `Vertex ${i} weights must sum to 1.0, got ${sum}`);

      for (const idx of [
        skinIndex.getX(i),
        skinIndex.getY(i),
        skinIndex.getZ(i),
        skinIndex.getW(i)
      ]) {
        assert.ok(idx >= 0 && idx < 18);
      }
    }
  });

  it('should construct valid IDLE, ATTACK, WALK, and HIT animation clips', () => {
    const clips = createRigAnimationClips();

    assert.ok(clips.idle);
    assert.ok(clips.attack);
    assert.ok(clips.walk);
    assert.ok(clips.hit);
    assert.ok(clips.idle.duration >= 2.0);
    assert.ok(clips.idle.tracks.length >= 6);
    assert.ok(clips.attack.duration >= 0.8 && clips.attack.duration <= 1.2);
    assert.ok(clips.attack.tracks.length >= 8);

    const geo = new THREE.BoxGeometry(0.8, 1.0, 0.4, 2, 4, 2);
    geo.translate(0, 0.5, 0);
    applyAnatomicalSkinWeights(geo);

    const { root, skeleton } = buildHumanoidSkeleton();
    const mat = new THREE.MeshBasicMaterial();
    const skinnedMesh = new THREE.SkinnedMesh(geo, mat);
    skinnedMesh.add(root);
    skinnedMesh.bind(skeleton);

    const mixer = new THREE.AnimationMixer(skinnedMesh);
    const idleAction = mixer.clipAction(clips.idle);
    idleAction.play();
    mixer.update(0.16);
    assert.ok(idleAction.isRunning());

    const atkAction = mixer.clipAction(clips.attack);
    idleAction.crossFadeTo(atkAction, 0.1, true);
    atkAction.play();
    mixer.update(0.3);
    assert.ok(atkAction.isRunning());
  });

  it('should preserve native skeleton, multi-mesh skin weights, outline binding, and embedded animations without mesh deformation', () => {
    const { scene } = buildTestSkinnedCharacterScene();

    const idleClip = new THREE.AnimationClip('Idle_Loop', 1.2, [
      new THREE.QuaternionKeyframeTrack('mixamorig:Spine.quaternion', [0, 0.6, 1.2], [
        0, 0, 0, 1,
        0.04, 0, 0, 0.9992,
        0, 0, 0, 1
      ])
    ]);
    const walkClip = new THREE.AnimationClip('Walk_Forward', 0.8, [
      new THREE.QuaternionKeyframeTrack('mixamorig:Spine.quaternion', [0, 0.4, 0.8], [
        0, 0, 0, 1,
        0, 0.05, 0, 0.9987,
        0, 0, 0, 1
      ])
    ]);
    const atkClip = new THREE.AnimationClip('Slash_Attack', 0.9, [
      new THREE.QuaternionKeyframeTrack('mixamorig:RightArm.quaternion', [0, 0.45, 0.9], [
        0, 0, 0, 1,
        0.3, 0, 0, 0.9539,
        0, 0, 0, 1
      ])
    ]);
    const hitClip = new THREE.AnimationClip('Take_Damage', 0.4, [
      new THREE.QuaternionKeyframeTrack('mixamorig:Head.quaternion', [0, 0.2, 0.4], [
        0, 0, 0, 1,
        -0.2, 0, 0, 0.9798,
        0, 0, 0, 1
      ])
    ]);
    const extraClip = new THREE.AnimationClip('Victory_Dance', 1.0, [
      new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, 0.5, 1.0], [
        0, 0, 0, 1,
        0, 0.2, 0, 0.9798,
        0, 0, 0, 1
      ])
    ]);

    const fakeGltf = {
      scene,
      scenes: [scene],
      animations: [idleClip, walkClip, atkClip, hitClip, extraClip],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as unknown,
      userData: {}
    } as unknown as GLTF;

    const controller = createControllerFromGltf(fakeGltf, {
      isPlayer: true,
      outlinesEnabled: true,
      modelName: 'knight.glb'
    });

    // Preserves native skeleton & both meshes
    assert.equal(controller.metadata.rigSource, 'native_skeleton');
    assert.equal(controller.metadata.animationSource, 'embedded');
    assert.equal(controller.metadata.meshCount, 2);
    assert.equal(controller.metadata.boneCount, 6);
    assert.equal(controller.meshEntries.length, 2);

    // SkeletonHelper must actually discover all 6 bones (previously found 0!)
    assert.equal(controller.skeletonHelper.bones.length, 6);

    // Original skin weights must be intact (not overwritten with 13-bone indices!)
    const bodySkinIdx = controller.skinnedMesh.geometry.attributes.skinIndex;
    let sawOriginalHeadOrChest = false;
    for (let i = 0; i < bodySkinIdx.count; i++) {
      const idx = bodySkinIdx.getX(i);
      assert.ok(idx < 6, `Skin index ${idx} must stay within original 6-bone skeleton`);
      if (idx === 4 || idx === 5) sawOriginalHeadOrChest = true;
    }
    assert.ok(sawOriginalHeadOrChest);

    // Outline mesh must use scale=1 and match bindMatrix (no scale drift!)
    const outline = controller.meshEntries[0].outlineMesh as THREE.SkinnedMesh;
    assert.ok(outline);
    assert.equal(outline.scale.x, 1);
    assert.equal(outline.scale.y, 1);
    assert.equal(outline.scale.z, 1);
    assert.ok(outline.bindMatrix.equals(controller.skinnedMesh.bindMatrix));

    // Grounded to y = 0 and normalized to height ~ 1.0 via wrapper (remove optional weapon attachment before measuring mesh bounds)
    controller.weaponGroup?.removeFromParent();
    controller.shieldMesh?.removeFromParent();
    controller.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(controller.modelRoot);
    assert.ok(Math.abs(bounds.min.y) < 0.05, `Expected minY ~ 0, got ${bounds.min.y}`);
    assert.ok(
      Math.abs(bounds.max.y - bounds.min.y - 1.0) < 0.08,
      `Expected height ~ 1.0, got ${bounds.max.y - bounds.min.y}`
    );

    // Play embedded animations + custom clip
    assert.equal(controller.clips.idle.name, 'Idle_Loop');
    assert.equal(controller.clips.walk.name, 'Walk_Forward');
    assert.equal(controller.clips.attack.name, 'Slash_Attack');
    assert.equal(controller.clips.hit.name, 'Take_Damage');

    controller.playClipByName('Victory_Dance', 0);
    controller.update(0.25);
    assert.equal(controller.currentClipName, 'Victory_Dance');

    controller.dispose();
  });

  it('should generate rest-pose-relative fallback animations when a rigged model has 0 clips', () => {
    const { scene } = buildTestSkinnedCharacterScene();

    const fakeGltf = {
      scene,
      scenes: [scene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as unknown,
      userData: {}
    } as unknown as GLTF;

    const controller = createControllerFromGltf(fakeGltf, {
      isPlayer: true,
      outlinesEnabled: false,
      modelName: 'static_rigged.glb'
    });

    assert.equal(controller.metadata.rigSource, 'native_skeleton');
    assert.equal(controller.metadata.animationSource, 'procedural');

    const hips = controller.bones.pelvis;
    const leftArm = controller.bones.leftArm;
    assert.ok(hips && leftArm);

    const restArmQuat = leftArm.quaternion.clone();
    controller.update(0.0);

    // Hips must stay near original 95cm rest height (NOT snapped to 0.42!)
    assert.ok(hips.position.y > 80, `Expected hips near 95, got ${hips.position.y}`);
    // Bone scale must never be non-uniformly distorted
    assert.equal(controller.bones.chest.scale.x, 1);
    assert.equal(controller.bones.chest.scale.y, 1);

    controller.playAttack(undefined, 0);
    controller.update(0.38);
    // Left arm should deviate moderately from its rest orientation without collapsing
    assert.ok(leftArm.quaternion.angleTo(restArmQuat) > 0.05);
    assert.ok(leftArm.quaternion.length() > 0.99);

    controller.dispose();
  });

  it('should use generated arm animations for static auto-rigs even when the GLB has unrelated idle tracks', () => {
    const scene = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1, 0.3, 4, 8, 2),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    body.name = 'Body';
    body.position.y = 0.5;
    scene.add(body);
    const sourceIdle = new THREE.AnimationClip('Idle_Reference', 1, [
      new THREE.VectorKeyframeTrack('Body.position', [0, 1], [0, 0.5, 0, 0, 0.6, 0])
    ]);

    const controller = createControllerFromGltf(
      {
        scene,
        scenes: [scene],
        animations: [sourceIdle],
        cameras: [],
        asset: {}
      } as unknown as GLTF,
      { modelName: 'static_with_object_idle.glb', outlinesEnabled: false }
    );

    assert.equal(controller.metadata.rigSource, 'auto_rig');
    assert.equal(controller.metadata.animationSource, 'procedural');
    assert.ok(!controller.metadata.availableClipNames.includes('Idle_Reference'));
    const leftShoulder = controller.bones.leftShoulder;
    assert.ok(leftShoulder);
    const restQuaternion = leftShoulder.quaternion.clone();
    controller.update(0.4);
    assert.ok(
      1 - Math.abs(restQuaternion.dot(leftShoulder.quaternion)) > 0.001,
      'Generated idle should rotate the auto-rig shoulder away from the static T-pose'
    );
    controller.dispose();
  });

  it('should fit T-pose sleeves and head cleanly without tearing on unrigged static meshes', () => {
    // Build synthetic T-pose static mesh mirroring model01.glb proportions
    const positions: number[] = [];
    // Torso/legs core: x in [-0.11, 0.11], y in [0, 0.72]
    for (let y = 0.02; y <= 0.70; y += 0.08) {
      for (const x of [-0.10, 0.0, 0.10]) {
        positions.push(x, y, 0);
      }
    }
    // Wide T-pose sleeves/arms: x in [-0.44..-0.16] and [0.16..0.44], y in [0.52..0.70]
    for (const x of [-0.42, -0.35, -0.26, -0.18, 0.18, 0.26, 0.35, 0.42]) {
      for (const y of [0.52, 0.60, 0.68]) {
        positions.push(x, y, 0);
      }
    }
    // Head + ears: x in [-0.17, 0.17], y in [0.76..1.0]
    for (const y of [0.78, 0.86, 0.96]) {
      for (const x of [-0.16, 0.0, 0.16]) {
        positions.push(x, y, 0);
      }
    }

    const rawGeo = new THREE.BufferGeometry();
    rawGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Apply rotation + scale + translation on mesh node to test full matrixWorld baking
    const rawMesh = new THREE.Mesh(rawGeo, new THREE.MeshBasicMaterial());
    rawMesh.position.set(2, -5, 1);
    rawMesh.rotation.y = Math.PI / 4;
    rawMesh.scale.setScalar(10);
    rawMesh.updateMatrixWorld(true);

    const normGeo = normalizeModelGeometry(rawMesh);
    const layout = analyzeHumanoidGeometry(normGeo);

    // Shoulder must fit in upper torso [0.58..0.74], NOT inside the head!
    assert.ok(layout.shoulderY >= 0.56 && layout.shoulderY <= 0.74, `shoulderY=${layout.shoulderY}`);

    // Probe sleeve vertex & ear vertex directly
    const probe = new THREE.BufferGeometry();
    probe.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.35, 0.53, 0, // lower sleeve vertex (previously torn to spine!)
           0.35, 0.53, 0, // right lower sleeve vertex
          -0.16, 0.84, 0, // left ear/hair vertex (previously torn to arm!)
          0.12, 0.62, 0   // right bust/chest vertex must remain on the torso
        ],
        3
      )
    );
    applyAnatomicalSkinWeights(probe, layout);
    const idx = probe.attributes.skinIndex;
    const wgt = probe.attributes.skinWeight;

    // Lower left sleeve -> leftShoulder (6), leftArm (7), or leftHand (8)
    assert.ok(
      idx.getX(0) === 6 || idx.getX(0) === 7 || idx.getX(0) === 8,
      `Left sleeve bound to bone ${idx.getX(0)}`
    );
    assert.ok(wgt.getX(0) > 0.5);

    // Lower right sleeve -> rightShoulder (9), rightArm (10), or rightHand (11)
    assert.ok(
      idx.getX(1) === 9 || idx.getX(1) === 10 || idx.getX(1) === 11,
      `Right sleeve bound to bone ${idx.getX(1)}`
    );

    // Left ear/hair -> predominantly head (4)
    assert.equal(idx.getX(2), 4, `Head/ear vertex bound to bone ${idx.getX(2)}`);

    // Chest/bust vertices remain attached to the torso, never leaking into arm bones
    assert.ok(
      idx.getX(3) === 1 || idx.getX(3) === 2 || idx.getX(3) === 3,
      `Bust/chest vertex bound to arm bone ${idx.getX(3)}`
    );

    // Verify full createControllerFromGltf on static mesh does NOT shift vertices by bone positions!
    const staticScene = new THREE.Group();
    staticScene.add(rawMesh);
    const staticCtrl = createControllerFromGltf(
      { scene: staticScene, scenes: [staticScene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { outlinesEnabled: true, modelName: 'tpose.glb' }
    );
    staticCtrl.setWeightPreview(true);
    let previewCount = 0;
    staticCtrl.group.traverse(obj => {
      if (obj.name.endsWith('_weight_preview')) previewCount++;
    });
    assert.ok(previewCount > 0, 'Weight preview should create skinned influence overlays');
    staticCtrl.setWeightPreview(false);
    let remainingPreviewCount = 0;
    staticCtrl.group.traverse(obj => {
      if (obj.name.endsWith('_weight_preview')) remainingPreviewCount++;
    });
    assert.equal(remainingPreviewCount, 0, 'Disabling preview should remove its overlays');

    const paintMesh = staticCtrl.skinnedMesh;
    const paintGeometry = paintMesh.geometry;
    const skinIndex = paintGeometry.attributes.skinIndex;
    const skinWeight = paintGeometry.attributes.skinWeight;
    const firstBone = paintMesh.skeleton.bones[skinIndex.getX(0)];
    const targetBone = paintMesh.skeleton.bones.find(bone => bone !== firstBone);
    assert.ok(targetBone, 'Auto-rig should expose multiple editable bones');
    const previousInfluence = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (paintMesh.skeleton.bones[skinIndex.getComponent(0, slot)] === targetBone ? weight : 0);
    }, 0);
    const brushPoint = paintMesh.getVertexPosition(0, new THREE.Vector3());
    paintMesh.localToWorld(brushPoint);
    staticCtrl.beginWeightPaintStroke();
    assert.ok(
      staticCtrl.paintWeightsAt(brushPoint, targetBone.name, 0.02, 1, 'paint', false) > 0,
      'Weight brush should edit vertices within its radius'
    );
    const afterPaint = staticCtrl.endWeightPaintStroke();
    assert.ok(afterPaint > 0);
    assert.ok(staticCtrl.canUndoWeightPaint);
    const paintedInfluence = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (paintMesh.skeleton.bones[skinIndex.getComponent(0, slot)] === targetBone ? weight : 0);
    }, 0);
    assert.ok(paintedInfluence > previousInfluence);
    const paintedWeightSum = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(paintedWeightSum - 1) < 0.001);
    assert.ok(staticCtrl.metadata.appliedConfig.manualWeightEdits.length > 0);
    const replayScene = new THREE.Group();
    replayScene.add(rawMesh.clone());
    const replayCtrl = createControllerFromGltf(
      { scene: replayScene, scenes: [replayScene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { outlinesEnabled: true, modelName: 'tpose.glb', config: staticCtrl.metadata.appliedConfig }
    );
    const replayBone = replayCtrl.skinnedMesh.skeleton.bones.find(
      bone => bone.name === targetBone.name
    );
    assert.ok(replayBone);
    const replaySkinIndex = replayCtrl.skinnedMesh.geometry.attributes.skinIndex;
    const replaySkinWeight = replayCtrl.skinnedMesh.geometry.attributes.skinWeight;
    const replayInfluence = Array.from({ length: 4 }, (_, slot) =>
      replaySkinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (
        replayCtrl.skinnedMesh.skeleton.bones[replaySkinIndex.getComponent(0, slot)] === replayBone
          ? weight
          : 0
      );
    }, 0);
    assert.ok(Math.abs(replayInfluence - paintedInfluence) < 0.001);
    replayCtrl.dispose();
    assert.ok(staticCtrl.undoWeightPaintStroke() > 0, 'Last paint stroke should be undoable');
    const restoredInfluence = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (paintMesh.skeleton.bones[skinIndex.getComponent(0, slot)] === targetBone ? weight : 0);
    }, 0);
    assert.ok(Math.abs(restoredInfluence - previousInfluence) < 0.001);
    assert.equal(staticCtrl.canUndoWeightPaint, false);
    assert.equal(staticCtrl.metadata.appliedConfig.manualWeightEdits.length, 0);

    const firstBoneInfluence = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (paintMesh.skeleton.bones[skinIndex.getComponent(0, slot)] === firstBone ? weight : 0);
    }, 0);
    staticCtrl.beginWeightPaintStroke();
    assert.ok(
      staticCtrl.paintWeightsAt(brushPoint, firstBone.name, 0.02, 1, 'erase', false) > 0,
      'Erase mode should reduce a bone influence'
    );
    staticCtrl.endWeightPaintStroke();
    const erasedInfluence = Array.from({ length: 4 }, (_, slot) =>
      skinWeight.getComponent(0, slot)
    ).reduce((sum, weight, slot) => {
      return sum + (paintMesh.skeleton.bones[skinIndex.getComponent(0, slot)] === firstBone ? weight : 0);
    }, 0);
    assert.ok(erasedInfluence < firstBoneInfluence);
    staticCtrl.undoWeightPaintStroke();

    const persistedWeightConfig = normalizeCustomModelConfig(staticCtrl.metadata.appliedConfig);
    assert.deepEqual(
      persistedWeightConfig.manualWeightEdits,
      staticCtrl.metadata.appliedConfig.manualWeightEdits
    );

    staticCtrl.group.updateMatrixWorld(true);
    staticCtrl.skeleton.update();
    const skinnedPos = new THREE.Vector3();
    for (let i = 0; i < staticCtrl.skinnedMesh.geometry.attributes.position.count; i++) {
      skinnedPos.fromBufferAttribute(staticCtrl.skinnedMesh.geometry.attributes.position, i);
      const rawY = skinnedPos.y;
      staticCtrl.skinnedMesh.applyBoneTransform(i, skinnedPos);
      assert.ok(
        Math.abs(skinnedPos.y - rawY) < 0.05,
        `Vertex ${i} drifted from y=${rawY} to y=${skinnedPos.y} (broken boneInverses!)`
      );
    }
    staticCtrl.dispose();
  });

  it('should align skeleton bones along Z centroids and lower/swing T-pose arms in idle, walk, and attack', () => {
    const positions: number[] = [];
    // Body shifted forward to z = +0.06 with a small back ponytail at z = -0.14 so bbox center != body Z
    for (let y = 0.02; y <= 0.70; y += 0.06) {
      for (const x of [-0.09, 0.0, 0.09]) {
        positions.push(x, y, 0.06);
      }
    }
    for (const x of [-0.42, -0.32, -0.22, 0.22, 0.32, 0.42]) {
      for (const y of [0.55, 0.62, 0.67]) {
        positions.push(x, y, 0.04);
      }
    }
    for (const y of [0.76, 0.86, 0.96]) {
      for (const x of [-0.10, 0.0, 0.10]) {
        positions.push(x, y, 0.06);
      }
    }
    // Small ponytail far in -Z
    positions.push(0, 0.80, -0.14);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    const scene = new THREE.Group();
    scene.add(mesh);

    const ctrl = createControllerFromGltf(
      { scene, scenes: [scene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { modelName: 'tpose_zshift.glb' }
    );

    ctrl.group.updateMatrixWorld(true);
    const pelvisWorld = new THREE.Vector3();
    const leftHandWorld = new THREE.Vector3();
    const rightHandWorld = new THREE.Vector3();

    // At frame 0 (before idle update or right at idle t=0), check Z alignment of pelvis matches normalized body centroid
    ctrl.bones.pelvis.getWorldPosition(pelvisWorld);
    assert.ok(pelvisWorld.z > 0.02, `Expected pelvisZ shifted forward toward body mesh, got ${pelvisWorld.z}`);

    // 1. IDLE: T-pose arms must drop significantly downward (below rest y ~ 0.61)
    ctrl.playIdle(0);
    ctrl.update(0.6);
    ctrl.group.updateMatrixWorld(true);
    ctrl.bones.leftHand.getWorldPosition(leftHandWorld);
    ctrl.bones.rightHand.getWorldPosition(rightHandWorld);
    assert.ok(leftHandWorld.y < 0.48, `Expected leftHand lowered in idle, got y=${leftHandWorld.y}`);
    assert.ok(rightHandWorld.y < 0.48, `Expected rightHand lowered in idle, got y=${rightHandWorld.y}`);

    // 2. WALK: Arms must swing forward (+Z) and backward (-Z) cleanly across stride
    ctrl.playWalk(0);
    ctrl.update(0.0);
    ctrl.group.updateMatrixWorld(true);
    const leftWalkT0 = new THREE.Vector3();
    ctrl.bones.leftHand.getWorldPosition(leftWalkT0);

    ctrl.update(0.4);
    ctrl.group.updateMatrixWorld(true);
    const leftWalkT4 = new THREE.Vector3();
    ctrl.bones.leftHand.getWorldPosition(leftWalkT4);

    const walkSwingZ = Math.abs(leftWalkT4.z - leftWalkT0.z);
    assert.ok(walkSwingZ > 0.12, `Expected leftHand forward/back swing > 0.12 in walk, got ${walkSwingZ}`);

    // 3. ATTACK: Right sword arm must wind up high and slash forward dynamically
    ctrl.playAttack(undefined, 0);
    ctrl.update(0.22); // windup
    ctrl.group.updateMatrixWorld(true);
    const rightWindup = new THREE.Vector3();
    ctrl.bones.rightHand.getWorldPosition(rightWindup);

    ctrl.update(0.18); // t = 0.40 slash peak
    ctrl.group.updateMatrixWorld(true);
    const rightSlash = new THREE.Vector3();
    ctrl.bones.rightHand.getWorldPosition(rightSlash);

    assert.ok(rightWindup.y > 0.65, `Expected rightHand raised high during attack windup, got y=${rightWindup.y}`);
    assert.ok(
      rightSlash.z - rightWindup.z > 0.15,
      `Expected rightHand to swing forward during slash (windup z=${rightWindup.z}, slash z=${rightSlash.z})`
    );

    ctrl.dispose();
  });

  it('should import a real binary GLB ArrayBuffer with skin and animations via importRiggedModelFromBuffer', async () => {
    const glbBuffer = buildMinimalGlbBufferWithRigAndAnim();
    const controller = await importRiggedModelFromBuffer(glbBuffer, {
      isPlayer: true,
      outlinesEnabled: true,
      modelName: 'test_char.glb'
    });

    assert.equal(controller.metadata.modelName, 'test_char.glb');
    assert.equal(controller.metadata.rigSource, 'native_skeleton');
    assert.equal(controller.metadata.animationSource, 'hybrid');
    assert.equal(controller.metadata.boneCount, 2);
    assert.ok(controller.metadata.availableClipNames.includes('Custom_Idle'));

    controller.update(0.25);
    assert.ok(controller.skeleton.bones.length === 2);
    controller.dispose();
  });

  it('should import a Wavefront OBJ starting with "# Soul Doll" without JSON SyntaxError and preserve UVs', async () => {
    const objContent = [
      '# Soul Doll Character Export',
      'o SoulDoll',
      'v -0.2 0.0 0.0',
      'v  0.2 0.0 0.0',
      'v  0.2 1.0 0.0',
      'v -0.2 1.0 0.0',
      'vt 0.0 0.0',
      'vt 1.0 0.0',
      'vt 1.0 1.0',
      'vt 0.0 1.0',
      'f 1/1 2/2 3/3',
      'f 1/1 3/3 4/4'
    ].join('\n');

    const objBuf = new TextEncoder().encode(objContent).buffer;
    assert.equal(detectModelFormat(objBuf, 'Soul Doll.obj'), 'obj');

    const controller = await importRiggedModelFromBuffer(objBuf, {
      isPlayer: true,
      outlinesEnabled: true,
      modelName: 'Soul Doll.obj'
    });

    assert.equal(controller.metadata.rigSource, 'auto_rig');
    assert.equal(controller.metadata.hasNativeUvs, true);
    assert.equal(controller.metadata.boneCount, 18);

    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    controller.applyCustomTexture(tex);
    controller.setMaterialMode('textured');
    const activeMat = controller.skinnedMesh.material as THREE.MeshStandardMaterial;
    assert.equal(activeMat.map, tex);
    assert.equal(controller.metadata.hasNativeTextures, true);
    controller.dispose();
  });

  it('should preserve original textures on MeshBasicMaterial (unlit) and MeshPhongMaterial models', () => {
    const geo = new THREE.BoxGeometry(0.4, 1.0, 0.3);
    const tex = new THREE.DataTexture(new Uint8Array([0, 255, 128, 255]), 1, 1);
    tex.needsUpdate = true;

    const unlitMat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, unlitMat);
    const scene = new THREE.Group();
    scene.add(mesh);

    const ctrl = createControllerFromGltf(
      { scene, scenes: [scene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { modelName: 'unlit_char.glb' }
    );

    assert.equal(ctrl.metadata.hasNativeTextures, true);
    assert.equal(ctrl.metadata.hasNativeUvs, true);
    assert.equal(ctrl.currentMaterialMode, 'textured');

    const mat = ctrl.skinnedMesh.material as THREE.MeshBasicMaterial;
    assert.ok(mat.map, 'Textured material must keep original map on MeshBasicMaterial');

    ctrl.setMaterialMode('toon');
    const toonMat = ctrl.skinnedMesh.material as THREE.MeshToonMaterial;
    assert.ok(toonMat.map, 'Toon material must also preserve original map when UVs exist');
    ctrl.dispose();
  });

  it('should reject unknown binary/text formats with a clear descriptive error instead of SyntaxError', async () => {
    const badBuf = new TextEncoder().encode('NOT_A_MODEL_FILE_FORMAT_XYZ').buffer;
    await assert.rejects(
      () => importRiggedModelFromBuffer(badBuf, { modelName: 'unknown.xyz' }),
      (err: Error) => {
        assert.ok(err.message.includes('formato 3D compatible'));
        return true;
      }
    );
  });

  it('should prevent invisibility on quantized Int16 meshes, microscopic scales, and opacity=0/transmission=1 materials', () => {
    // 1. Quantized Int16 position attribute with node scale 0.001 + invalid group materialIndex + broken physical material
    const qGeo = new THREE.BufferGeometry();
    qGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Int16Array([-250, 0, 0, 250, 0, 0, 0, 1000, 0]), 3, false)
    );
    qGeo.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array([0, 0, 65535, 0, 32768, 65535]), 2, true));
    qGeo.addGroup(0, 3, 2); // invalid materialIndex for single-material mesh

    const brokenMat = new THREE.MeshPhysicalMaterial({
      opacity: 0,
      transparent: true,
      transmission: 1.0,
      alphaTest: 1.0,
      visible: false
    });
    const qMesh = new THREE.Mesh(qGeo, brokenMat);
    qMesh.scale.setScalar(0.001);
    const qScene = new THREE.Group();
    qScene.add(qMesh);

    const qCtrl = createControllerFromGltf(
      { scene: qScene, scenes: [qScene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { modelName: 'quantized_broken.glb' }
    );

    const normPos = qCtrl.skinnedMesh.geometry.attributes.position;
    assert.ok(normPos.array instanceof Float32Array, 'Quantized Int16 must unpack to Float32Array');
    qCtrl.skinnedMesh.geometry.computeBoundingBox();
    const qBox = qCtrl.skinnedMesh.geometry.boundingBox!;
    assert.ok(qBox.max.y - qBox.min.y > 0.9, `Quantized mesh collapsed! height=${qBox.max.y - qBox.min.y}`);
    assert.equal(qCtrl.skinnedMesh.frustumCulled, false);
    assert.equal(qCtrl.skinnedMesh.geometry.groups.length, 0);

    const toonMat = qCtrl.skinnedMesh.material as THREE.MeshToonMaterial;
    assert.equal(toonMat.visible, true);
    assert.equal(toonMat.opacity, 1);
    assert.equal(toonMat.transparent, false);
    assert.equal(toonMat.side, THREE.DoubleSide);

    qCtrl.setMaterialMode('textured');
    const activeMat = qCtrl.skinnedMesh.material as THREE.MeshPhysicalMaterial;
    assert.equal(activeMat.visible, true);
    assert.equal(activeMat.opacity, 1);
    assert.equal(activeMat.transparent, false);
    assert.equal(activeMat.transmission, 0);
    assert.equal(activeMat.side, THREE.DoubleSide);
    qCtrl.dispose();

    // 2. Microscopic 0.00002m model (previously skipped normalization when height <= 0.0001)
    const microGeo = new THREE.BoxGeometry(0.00001, 0.00002, 0.00001);
    microGeo.translate(0, 0.00001, 0);
    const microMesh = new THREE.Mesh(microGeo, new THREE.MeshBasicMaterial());
    const microScene = new THREE.Group();
    microScene.add(microMesh);

    const mCtrl = createControllerFromGltf(
      { scene: microScene, scenes: [microScene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      { modelName: 'micro.glb' }
    );
    mCtrl.skinnedMesh.geometry.computeBoundingBox();
    const mBox = mCtrl.skinnedMesh.geometry.boundingBox!;
    assert.ok(Math.abs(mBox.max.y - mBox.min.y - 1.0) < 0.01, `Micro mesh failed to scale to 1.0m: ${mBox.max.y - mBox.min.y}`);
    mCtrl.dispose();
  });

  it('should auto-detect tall 1:6 humanoid, A-pose arms, floating halo, and isolate rear wings (-Z) to torso instead of arms', () => {
    const positions: number[] = [];

    // 1. Tall legs with central gap (y in 0.02..0.48)
    for (let y = 0.02; y <= 0.47; y += 0.05) {
      for (const x of [-0.07, -0.05, 0.05, 0.07]) {
        positions.push(x, y, 0.02);
      }
    }
    // Feet sticking slightly forward (+Z)
    for (const x of [-0.06, 0.06]) {
      positions.push(x, 0.02, 0.08);
    }

    // 2. Torso core (y in 0.50..0.79, narrow waist/neck around 0.81)
    for (let y = 0.50; y <= 0.78; y += 0.04) {
      for (const x of [-0.08, 0.0, 0.08]) {
        positions.push(x, y, 0.02);
        positions.push(x, y, -0.02);
      }
    }
    // Narrow neck slice (y = 0.80..0.83)
    for (let y = 0.80; y <= 0.83; y += 0.015) {
      for (const x of [-0.035, 0.0, 0.035]) {
        positions.push(x, y, 0.01);
      }
    }
    // Head skull (y = 0.85..0.93)
    for (let y = 0.85; y <= 0.93; y += 0.02) {
      for (const x of [-0.07, 0.0, 0.07]) {
        positions.push(x, y, 0.01);
      }
    }
    // Floating halo at y = 0.98..1.00 (gap at 0.94..0.97)
    for (const x of [-0.09, -0.04, 0.04, 0.09]) {
      positions.push(x, 0.99, 0.0);
    }

    // 3. A-pose arms sloping downward from shoulder (0.75) to hand (0.50) near z = +0.02
    for (const t of [0.2, 0.4, 0.6, 0.8, 1.0]) {
      const ax = 0.12 + t * 0.20;
      const ay = 0.75 - t * 0.25;
      positions.push(-ax, ay, 0.02, ax, ay, 0.02);
    }

    // 4. Large rear wings at -Z (z = -0.18, x in +/- 0.16..0.42, y in 0.52..0.86)
    for (const x of [-0.38, -0.30, -0.22, -0.16, 0.16, 0.22, 0.30, 0.38]) {
      for (const y of [0.54, 0.64, 0.74, 0.84]) {
        positions.push(x, y, -0.18);
      }
    }

    const rawGeo = new THREE.BufferGeometry();
    rawGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(rawGeo, new THREE.MeshBasicMaterial());
    const normGeo = normalizeModelGeometry(mesh);
    const layout = analyzeHumanoidGeometry(normGeo);

    assert.equal(layout.proportionClass, 'tall_humanoid');
    assert.equal(layout.armPose, 'a-pose');
    assert.equal(layout.hasBackAppendages, true);
    assert.equal(layout.hasFloatingHalo, true);
    assert.ok(layout.pelvisY > 0.46, `Expected tall pelvisY > 0.46, got ${layout.pelvisY}`);
    assert.ok(layout.neckY > 0.78, `Expected tall neckY > 0.78, got ${layout.neckY}`);

    // Probe wing vertex (-Z) vs front A-pose hand vertex (+Z)
    const probe = new THREE.BufferGeometry();
    probe.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.34, 0.70, layout.backAppendageZ! - 0.06, // left rear wing -> chest (3) or spine (2), NOT arm!
          -0.30, 0.54, 0.04 // front A-pose hand -> leftArm (7) or leftHand (8)
        ],
        3
      )
    );
    applyAnatomicalSkinWeights(probe, layout);
    const idx = probe.attributes.skinIndex;

    assert.ok(
      idx.getX(0) === 2 || idx.getX(0) === 3 || idx.getX(0) === 1,
      `Rear wing must bind to torso (spine/chest/pelvis), got bone ${idx.getX(0)}`
    );
    assert.ok(
      idx.getX(1) === 7 || idx.getX(1) === 8 || idx.getX(1) === 6,
      `Front A-pose hand must bind to left arm chain, got bone ${idx.getX(1)}`
    );
  });

  it('should apply CustomModelConfig calibration transforms and resolve CustomModelLibrary unit/job assignments & JSON export', async () => {
    resetCustomModelLibraryForTests();

    const geo = new THREE.BoxGeometry(0.4, 1.0, 0.25);
    geo.translate(0, 0.5, 0);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));

    const ctrl = createControllerFromGltf(
      { scene, scenes: [scene], animations: [], cameras: [], asset: {} } as unknown as GLTF,
      {
        modelName: 'valkyrie.glb',
        config: { scale: 1.25, facingYawDeg: 90, groundOffsetY: 0.05 }
      }
    );

    assert.ok(Math.abs(ctrl.transformGroup.scale.x - 1.25) < 1e-4);
    assert.ok(Math.abs(ctrl.transformGroup.rotation.y - Math.PI / 2) < 1e-4);
    assert.ok(Math.abs(ctrl.transformGroup.position.y - 0.05) < 1e-4);

    ctrl.applyDisplayConfig({ scale: 0.9, facingYawDeg: 180 });
    assert.ok(Math.abs(ctrl.transformGroup.scale.x - 0.9) < 1e-4);
    assert.ok(Math.abs(ctrl.transformGroup.rotation.y - Math.PI) < 1e-4);
    ctrl.dispose();

    // Library persistence + priority resolution: hero > job > faction > default_glb
    const dummyBuf = new Uint8Array([1, 2, 3, 4]).buffer;
    const manualLandmarks = {
      leftShoulder: { x: -0.13, y: 0.65, z: 0.01 }
    };
    const manualWeightEdits = [{
      meshIndex: 0,
      meshName: 'BodyMesh',
      vertexIndex: 14,
      influences: [{ boneName: 'leftArm', weight: 1 }]
    }];
    const valkyrieEntry = await saveCustomModelEntry({
      id: 'mdl_valk',
      name: 'Valkiria',
      fileName: 'valkyrie.glb',
      buffer: dummyBuf,
      companions: [],
      textureBuffer: null,
      config: {
        ...ctrl.metadata.appliedConfig,
        scale: 1.15,
        facingYawDeg: 180,
        manualLandmarks,
        manualWeightEdits
      },
      autoProfile: ctrl.metadata.autoProfile ?? null
    });
    await assignCustomModelToSlot('hero:hero_2', valkyrieEntry.id);

    const lyra = resolveCustomModelForEntity({
      id: 'hero_2',
      name: 'Lyra',
      jobId: 'arcanist',
      faction: 'player'
    });
    assert.equal(lyra?.source, 'library');
    if (lyra?.source === 'library') {
      assert.equal(lyra.entry.id, 'mdl_valk');
      assert.equal(lyra.config.scale, 1.15);
      assert.deepEqual(lyra.config.manualLandmarks, manualLandmarks);
      assert.deepEqual(lyra.config.manualWeightEdits, manualWeightEdits);
    }

    // hero_1 falls back to default_glb when unassigned
    const valerius = resolveCustomModelForEntity({
      id: 'hero_1',
      name: 'Valerius',
      jobId: 'guard',
      faction: 'player'
    });
    assert.equal(valerius?.source, 'default_glb');

    // JSON export / import round-trip
    const payload = buildExportConfigPayload(
      'Valkiria',
      valkyrieEntry.config,
      valkyrieEntry.autoProfile,
      ['hero:hero_2']
    );
    const parsed = parseImportedConfigJson(JSON.stringify(payload));
    assert.equal(parsed.config.scale, 1.15);
    assert.equal(parsed.config.facingYawDeg, 180);
    assert.deepEqual(parsed.config.manualLandmarks, manualLandmarks);
    assert.deepEqual(parsed.config.manualWeightEdits, manualWeightEdits);
    assert.deepEqual(parsed.assignments, ['hero:hero_2']);

    resetCustomModelLibraryForTests();
  });
});
