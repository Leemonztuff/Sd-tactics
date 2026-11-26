import * as THREE from 'three';
import { Direction, EntityData } from '../types/game';
import {
  BRAWL_PALETTE,
  attachInvertedHullOutline,
  getBrawlToonGradientTexture
} from './BrawlStyleSystem';

// Chunky Brawl-Tactics proportions for crisp mobile readability at top-down isometric angles
const SHADOW_GEO = new THREE.CircleGeometry(0.45, 20);
const BASE_RING_GEO = new THREE.RingGeometry(0.34, 0.43, 24);
const CHEVRON_GEO = new THREE.ConeGeometry(0.14, 0.24, 3);
const BOOT_GEO = new THREE.BoxGeometry(0.15, 0.19, 0.21);
const TORSO_GEO = new THREE.CylinderGeometry(0.21, 0.25, 0.41, 10);
const CHEST_PLATE_GEO = new THREE.BoxGeometry(0.42, 0.3, 0.28);
const PAULDRON_GEO = new THREE.SphereGeometry(0.13, 10, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.185, 12, 10);
const VISOR_BAND_GEO = new THREE.BoxGeometry(0.24, 0.065, 0.08);
const EYE_GEO = new THREE.BoxGeometry(0.045, 0.045, 0.03);
const HELM_GEO = new THREE.CylinderGeometry(0.185, 0.205, 0.17, 10);
const WIZARD_HAT_GEO = new THREE.ConeGeometry(0.26, 0.38, 10);
const CAPE_GEO = new THREE.BoxGeometry(0.36, 0.4, 0.07);
const SWORD_BLADE_GEO = new THREE.BoxGeometry(0.085, 0.62, 0.038);
const HILT_GEO = new THREE.BoxGeometry(0.22, 0.05, 0.05);
const SHIELD_GEO = new THREE.BoxGeometry(0.075, 0.42, 0.32);
const STAFF_SHAFT_GEO = new THREE.CylinderGeometry(0.032, 0.036, 0.88, 8);
const ORB_GEO = new THREE.OctahedronGeometry(0.115, 0);
const BOW_LIMB_GEO = new THREE.BoxGeometry(0.4, 0.05, 0.065);
const BOW_STOCK_GEO = new THREE.BoxGeometry(0.075, 0.065, 0.38);

const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x050814,
  transparent: true,
  opacity: 0.44,
  depthWrite: false
});

const VISOR_MAT = new THREE.MeshBasicMaterial({ color: 0x161229 });

export function directionToYaw(dir: Direction): number {
  switch (dir) {
    case 'south':
      return 0;
    case 'east':
      return Math.PI / 2;
    case 'north':
      return Math.PI;
    case 'west':
      return -Math.PI / 2;
  }
}

export function createEntityGroup(entity: EntityData, outlinesEnabled: boolean = true): THREE.Group {
  const root = new THREE.Group();
  root.name = `unit_${entity.id}`;

  const isPlayer = entity.faction === 'player';
  const primaryHex = isPlayer ? 0x2563eb : 0xdc2626;
  const trimHex = isPlayer ? 0xfacc15 : 0xf97316;
  const clothHex = isPlayer ? 0x1e3a8a : 0x5c1118;
  const gradientMap = getBrawlToonGradientTexture();

  // Contact shadow disc grounded at y = 0.015 (always active even in Eco mode)
  const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  // Inner rotating body group (rotates for North/South/East/West facing)
  const actor = new THREE.Group();
  actor.name = 'actorBody';
  actor.rotation.y = directionToYaw(entity.facing);
  root.add(actor);

  // Facing ring + chevron pointing forward (+Z in local actor space)
  const ringMat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0x38bdf8 : 0xf87171,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(BASE_RING_GEO, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  actor.add(ring);

  const chevMat = new THREE.MeshBasicMaterial({
    color: isPlayer ? 0xfacc15 : 0xfca5a5
  });
  const chevron = new THREE.Mesh(CHEVRON_GEO, chevMat);
  chevron.rotation.x = Math.PI / 2;
  chevron.position.set(0, 0.04, 0.47);
  actor.add(chevron);

  // Brawl-Tactics 3-band toon materials (low-end GPU friendly, vibrant color separation)
  const clothMat = new THREE.MeshToonMaterial({ color: clothHex, gradientMap });
  const armorMat = new THREE.MeshToonMaterial({ color: primaryHex, gradientMap });
  const trimMat = new THREE.MeshToonMaterial({ color: trimHex, gradientMap });
  const skinMat = new THREE.MeshToonMaterial({ color: 0xf4c48a, gradientMap });
  const steelMat = new THREE.MeshToonMaterial({ color: 0xdbe3ee, gradientMap });
  const eyeMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0x7dd3fc : 0xfde047 });

  const addWithOutline = (mesh: THREE.Mesh, scale: number = 1.08) => {
    mesh.castShadow = true;
    actor.add(mesh);
    const ol = attachInvertedHullOutline(mesh, scale, BRAWL_PALETTE.battle.outlineHex);
    ol.visible = outlinesEnabled;
  };

  // 1. Chunky Boots
  const bootL = new THREE.Mesh(BOOT_GEO, clothMat);
  bootL.position.set(-0.11, 0.095, 0);
  addWithOutline(bootL, 1.1);

  const bootR = new THREE.Mesh(BOOT_GEO, clothMat);
  bootR.position.set(0.11, 0.095, 0);
  addWithOutline(bootR, 1.1);

  // 2. Torso
  const torso = new THREE.Mesh(TORSO_GEO, clothMat);
  torso.position.y = 0.37;
  addWithOutline(torso, 1.075);

  // 3. Chest armor or robe overlay
  const isCaster = entity.jobId === 'arcanist' || entity.jobId === 'devoto' || entity.jobId === 'invocador';
  const chest = new THREE.Mesh(CHEST_PLATE_GEO, isCaster ? clothMat : armorMat);
  chest.position.y = 0.44;
  addWithOutline(chest, 1.075);

  // 4. Broad Brawl-style Shoulder Pauldrons
  const pauldronL = new THREE.Mesh(PAULDRON_GEO, trimMat);
  pauldronL.position.set(-0.25, 0.54, 0);
  addWithOutline(pauldronL, 1.12);

  const pauldronR = new THREE.Mesh(PAULDRON_GEO, trimMat);
  pauldronR.position.set(0.25, 0.54, 0);
  addWithOutline(pauldronR, 1.12);

  // 5. Cape / Back ornament
  const cape = new THREE.Mesh(CAPE_GEO, clothMat);
  cape.position.set(0, 0.39, -0.17);
  cape.rotation.x = 0.16;
  addWithOutline(cape, 1.08);

  // 6. Heroic Oversized Head + Expressive Eyes / Visor
  const head = new THREE.Mesh(HEAD_GEO, skinMat);
  head.position.y = 0.74;
  addWithOutline(head, 1.08);

  const visorBand = new THREE.Mesh(VISOR_BAND_GEO, VISOR_MAT);
  visorBand.position.set(0, 0.75, 0.145);
  actor.add(visorBand);

  const eyeL = new THREE.Mesh(EYE_GEO, eyeMat);
  eyeL.position.set(-0.06, 0.75, 0.18);
  actor.add(eyeL);

  const eyeR = new THREE.Mesh(EYE_GEO, eyeMat);
  eyeR.position.set(0.06, 0.75, 0.18);
  actor.add(eyeR);

  // 7. Job-distinct Chunky Headgear
  if (entity.jobId === 'guard' || entity.jobId === 'tirador') {
    const helm = new THREE.Mesh(HELM_GEO, steelMat);
    helm.position.y = 0.82;
    addWithOutline(helm, 1.08);

    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.16, 0.25), trimMat);
    crest.position.y = 0.95;
    addWithOutline(crest, 1.12);
  } else if (entity.jobId === 'arcanist' || entity.jobId === 'invocador') {
    const hat = new THREE.Mesh(WIZARD_HAT_GEO, armorMat);
    hat.position.y = 1.0;
    addWithOutline(hat, 1.08);
  } else if (entity.jobId === 'devoto') {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 6, 16), trimMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.89;
    addWithOutline(crown, 1.12);
  } else {
    const hood = new THREE.Mesh(HELM_GEO, clothMat);
    hood.position.set(0, 0.82, -0.02);
    addWithOutline(hood, 1.08);
  }

  // 8. Job-distinct Oversized Weapon & Offhand
  if (entity.jobId === 'guard') {
    const blade = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    blade.position.set(0.31, 0.6, 0.2);
    blade.rotation.x = 0.35;
    addWithOutline(blade, 1.12);

    const hilt = new THREE.Mesh(HILT_GEO, trimMat);
    hilt.position.set(0.31, 0.34, 0.09);
    actor.add(hilt);

    const shield = new THREE.Mesh(SHIELD_GEO, armorMat);
    shield.position.set(-0.31, 0.45, 0.16);
    shield.rotation.y = 0.25;
    addWithOutline(shield, 1.09);
  } else if (entity.jobId === 'duelist' || entity.jobId === 'explorador') {
    const bladeR = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    bladeR.scale.set(0.8, 0.95, 0.8);
    bladeR.position.set(0.3, 0.5, 0.22);
    bladeR.rotation.x = 0.65;
    addWithOutline(bladeR, 1.12);

    const bladeL = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    bladeL.scale.set(0.8, 0.8, 0.8);
    bladeL.position.set(-0.3, 0.46, 0.18);
    bladeL.rotation.x = 0.5;
    addWithOutline(bladeL, 1.12);
  } else if (entity.jobId === 'tirador') {
    const stock = new THREE.Mesh(BOW_STOCK_GEO, clothMat);
    stock.position.set(0.28, 0.48, 0.24);
    addWithOutline(stock, 1.1);

    const limb = new THREE.Mesh(BOW_LIMB_GEO, steelMat);
    limb.position.set(0.28, 0.48, 0.4);
    addWithOutline(limb, 1.1);
  } else {
    // Arcanist / Devoto / Alquimista / Invocador -> Chunky Staff with glowing crystal
    const shaft = new THREE.Mesh(STAFF_SHAFT_GEO, trimMat);
    shaft.position.set(0.3, 0.48, 0.16);
    shaft.rotation.x = 0.12;
    addWithOutline(shaft, 1.12);

    const orbColor =
      entity.jobId === 'devoto' ? 0xfef08a : entity.jobId === 'alquimista' ? 0x4ade80 : 0x38bdf8;
    const orbMat = new THREE.MeshToonMaterial({
      color: orbColor,
      emissive: orbColor,
      emissiveIntensity: 0.72,
      gradientMap
    });
    const orb = new THREE.Mesh(ORB_GEO, orbMat);
    orb.position.set(0.3, 0.96, 0.21);
    addWithOutline(orb, 1.14);
  }

  return root;
}
