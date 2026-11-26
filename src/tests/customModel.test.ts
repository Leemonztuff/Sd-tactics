import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildHumanoidSkeleton,
  applyAnatomicalSkinWeights,
  createRigAnimationClips
} from '../rendering/CustomModelRig';

describe('Custom 3D Model Rig & Animation Tests', () => {
  it('should construct a valid 13-bone humanoid skeletal hierarchy', () => {
    const { root, skeleton, bonesMap } = buildHumanoidSkeleton();

    assert.equal(skeleton.bones.length, 13);
    assert.ok(bonesMap.root);
    assert.ok(bonesMap.pelvis);
    assert.ok(bonesMap.spine);
    assert.ok(bonesMap.chest);
    assert.ok(bonesMap.head);
    assert.ok(bonesMap.leftArm);
    assert.ok(bonesMap.rightArm);
    assert.ok(bonesMap.leftLeg);
    assert.ok(bonesMap.rightLeg);

    // Verify parentage
    assert.equal(bonesMap.pelvis.parent, bonesMap.root);
    assert.equal(bonesMap.spine.parent, bonesMap.pelvis);
    assert.equal(bonesMap.chest.parent, bonesMap.spine);
    assert.equal(bonesMap.head.parent, bonesMap.chest);
    assert.equal(bonesMap.rightArm.parent, bonesMap.rightShoulder);
    assert.equal(bonesMap.leftArm.parent, bonesMap.leftShoulder);
  });

  it('should assign normalized 4-weight skinning to all vertices', () => {
    const box = new THREE.BoxGeometry(0.8, 1.0, 0.4, 4, 8, 4);
    // Ground box
    box.translate(0, 0.5, 0);

    applyAnatomicalSkinWeights(box);

    const skinIndex = box.attributes.skinIndex;
    const skinWeight = box.attributes.skinWeight;

    assert.ok(skinIndex, 'skinIndex attribute must exist');
    assert.ok(skinWeight, 'skinWeight attribute must exist');
    assert.equal(skinIndex.count, box.attributes.position.count);
    assert.equal(skinWeight.count, box.attributes.position.count);

    // Verify each vertex weights sum to 1.0 within float precision
    for (let i = 0; i < skinWeight.count; i++) {
      const w0 = skinWeight.getX(i);
      const w1 = skinWeight.getY(i);
      const w2 = skinWeight.getZ(i);
      const w3 = skinWeight.getW(i);
      const sum = w0 + w1 + w2 + w3;

      assert.ok(Math.abs(sum - 1.0) < 0.001, `Vertex ${i} weights must sum to 1.0, got ${sum}`);

      const idx0 = skinIndex.getX(i);
      const idx1 = skinIndex.getY(i);
      const idx2 = skinIndex.getZ(i);
      const idx3 = skinIndex.getW(i);

      assert.ok(idx0 >= 0 && idx0 < 13);
      assert.ok(idx1 >= 0 && idx1 < 13);
      assert.ok(idx2 >= 0 && idx2 < 13);
      assert.ok(idx3 >= 0 && idx3 < 13);
    }
  });

  it('should construct valid IDLE, ATTACK, WALK, and HIT animation clips', () => {
    const clips = createRigAnimationClips();

    assert.ok(clips.idle);
    assert.ok(clips.attack);
    assert.ok(clips.walk);
    assert.ok(clips.hit);

    // Idle
    assert.ok(clips.idle.duration >= 2.0);
    assert.ok(clips.idle.tracks.length >= 6);

    // Attack
    assert.ok(clips.attack.duration >= 0.8 && clips.attack.duration <= 1.2);
    assert.ok(clips.attack.tracks.length >= 8);

    // Verify clips can be played on a SkinnedMesh
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
});
