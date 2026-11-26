import * as THREE from 'three';
import { Direction, EntityData } from '../types/game';

const SHADOW_GEO = new THREE.CircleGeometry(0.42, 20);
const BASE_RING_GEO = new THREE.RingGeometry(0.32, 0.4, 24);
const CHEVRON_GEO = new THREE.ConeGeometry(0.14, 0.24, 3);
const BOOT_GEO = new THREE.BoxGeometry(0.13, 0.18, 0.18);
const TORSO_GEO = new THREE.CylinderGeometry(0.19, 0.23, 0.42, 8);
const CHEST_PLATE_GEO = new THREE.BoxGeometry(0.38, 0.28, 0.26);
const PAULDRON_GEO = new THREE.SphereGeometry(0.11, 8, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.155, 12, 10);
const HELM_GEO = new THREE.CylinderGeometry(0.16, 0.175, 0.16, 8);
const WIZARD_HAT_GEO = new THREE.ConeGeometry(0.22, 0.34, 8);
const CAPE_GEO = new THREE.BoxGeometry(0.32, 0.4, 0.06);
const SWORD_BLADE_GEO = new THREE.BoxGeometry(0.06, 0.56, 0.025);
const HILT_GEO = new THREE.BoxGeometry(0.18, 0.04, 0.04);
const SHIELD_GEO = new THREE.BoxGeometry(0.06, 0.38, 0.28);
const STAFF_SHAFT_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6);
const ORB_GEO = new THREE.OctahedronGeometry(0.09, 0);
const BOW_LIMB_GEO = new THREE.BoxGeometry(0.36, 0.04, 0.05);
const BOW_STOCK_GEO = new THREE.BoxGeometry(0.06, 0.05, 0.36);

const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x05070c,
  transparent: true,
  opacity: 0.42,
  depthWrite: false
});

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

export function createEntityGroup(entity: EntityData): THREE.Group {
  const root = new THREE.Group();
  root.name = `unit_${entity.id}`;

  const isPlayer = entity.faction === 'player';
  const primaryHex = isPlayer ? 0x2563eb : 0xb91c1c;
  const trimHex = isPlayer ? 0xeab308 : 0x94a3b8;
  const clothHex = isPlayer ? 0x1e3a8a : 0x450a0a;

  // Contact shadow disc grounded at y = 0.015
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
    color: isPlayer ? 0x60a5fa : 0xf87171,
    transparent: true,
    opacity: 0.78,
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
  chevron.position.set(0, 0.04, 0.44);
  actor.add(chevron);

  // Materials with roughness contrast (>= 0.25 difference between cloth & metal)
  const clothMat = new THREE.MeshStandardMaterial({
    color: clothHex,
    roughness: 0.82,
    metalness: 0.05
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.35,
    metalness: 0.55
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimHex,
    roughness: 0.25,
    metalness: 0.85
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf1c27d,
    roughness: 0.65,
    metalness: 0.02
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.22,
    metalness: 0.9
  });

  // 1. Boots
  const bootL = new THREE.Mesh(BOOT_GEO, clothMat);
  bootL.position.set(-0.1, 0.09, 0);
  bootL.castShadow = true;
  actor.add(bootL);

  const bootR = new THREE.Mesh(BOOT_GEO, clothMat);
  bootR.position.set(0.1, 0.09, 0);
  bootR.castShadow = true;
  actor.add(bootR);

  // 2. Torso
  const torso = new THREE.Mesh(TORSO_GEO, clothMat);
  torso.position.y = 0.38;
  torso.castShadow = true;
  actor.add(torso);

  // 3. Chest armor or robe overlay
  const chest = new THREE.Mesh(
    CHEST_PLATE_GEO,
    entity.jobId === 'arcanist' || entity.jobId === 'devoto' || entity.jobId === 'invocador' ? clothMat : armorMat
  );
  chest.position.y = 0.45;
  chest.castShadow = true;
  actor.add(chest);

  // 4. Shoulder Pauldrons
  const pauldronL = new THREE.Mesh(PAULDRON_GEO, trimMat);
  pauldronL.position.set(-0.23, 0.54, 0);
  pauldronL.castShadow = true;
  actor.add(pauldronL);

  const pauldronR = new THREE.Mesh(PAULDRON_GEO, trimMat);
  pauldronR.position.set(0.23, 0.54, 0);
  pauldronR.castShadow = true;
  actor.add(pauldronR);

  // 5. Cape / Back ornament
  const cape = new THREE.Mesh(CAPE_GEO, clothMat);
  cape.position.set(0, 0.39, -0.16);
  cape.rotation.x = 0.14;
  cape.castShadow = true;
  actor.add(cape);

  // 6. Head
  const head = new THREE.Mesh(HEAD_GEO, skinMat);
  head.position.y = 0.72;
  head.castShadow = true;
  actor.add(head);

  // 7. Job-distinct Headgear
  if (entity.jobId === 'guard' || entity.jobId === 'tirador') {
    const helm = new THREE.Mesh(HELM_GEO, steelMat);
    helm.position.y = 0.78;
    helm.castShadow = true;
    actor.add(helm);

    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.22), trimMat);
    crest.position.y = 0.9;
    actor.add(crest);
  } else if (entity.jobId === 'arcanist' || entity.jobId === 'invocador') {
    const hat = new THREE.Mesh(WIZARD_HAT_GEO, armorMat);
    hat.position.y = 0.94;
    hat.castShadow = true;
    actor.add(hat);
  } else if (entity.jobId === 'devoto') {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), trimMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.84;
    actor.add(crown);
  } else {
    const hood = new THREE.Mesh(HELM_GEO, clothMat);
    hood.position.set(0, 0.79, -0.02);
    actor.add(hood);
  }

  // 8. Job-distinct Weapon & Offhand
  if (entity.jobId === 'guard') {
    const blade = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    blade.position.set(0.28, 0.58, 0.18);
    blade.rotation.x = 0.35;
    actor.add(blade);

    const hilt = new THREE.Mesh(HILT_GEO, trimMat);
    hilt.position.set(0.28, 0.34, 0.08);
    actor.add(hilt);

    const shield = new THREE.Mesh(SHIELD_GEO, armorMat);
    shield.position.set(-0.28, 0.44, 0.15);
    shield.rotation.y = 0.25;
    shield.castShadow = true;
    actor.add(shield);
  } else if (entity.jobId === 'duelist' || entity.jobId === 'explorador') {
    const bladeR = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    bladeR.scale.set(0.7, 0.9, 0.7);
    bladeR.position.set(0.27, 0.48, 0.2);
    bladeR.rotation.x = 0.65;
    actor.add(bladeR);

    const bladeL = new THREE.Mesh(SWORD_BLADE_GEO, steelMat);
    bladeL.scale.set(0.7, 0.75, 0.7);
    bladeL.position.set(-0.27, 0.45, 0.16);
    bladeL.rotation.x = 0.5;
    actor.add(bladeL);
  } else if (entity.jobId === 'tirador') {
    const stock = new THREE.Mesh(BOW_STOCK_GEO, clothMat);
    stock.position.set(0.24, 0.46, 0.24);
    actor.add(stock);

    const limb = new THREE.Mesh(BOW_LIMB_GEO, steelMat);
    limb.position.set(0.24, 0.46, 0.38);
    actor.add(limb);
  } else {
    // Arcanist / Devoto / Alquimista / Invocador -> Staff with glowing crystal
    const shaft = new THREE.Mesh(STAFF_SHAFT_GEO, trimMat);
    shaft.position.set(0.27, 0.46, 0.14);
    shaft.rotation.x = 0.12;
    actor.add(shaft);

    const orbColor =
      entity.jobId === 'devoto' ? 0xfef08a : entity.jobId === 'alquimista' ? 0x4ade80 : 0x38bdf8;
    const orbMat = new THREE.MeshStandardMaterial({
      color: orbColor,
      emissive: orbColor,
      emissiveIntensity: 0.7,
      roughness: 0.15
    });
    const orb = new THREE.Mesh(ORB_GEO, orbMat);
    orb.position.set(0.27, 0.92, 0.19);
    actor.add(orb);
  }

  return root;
}
