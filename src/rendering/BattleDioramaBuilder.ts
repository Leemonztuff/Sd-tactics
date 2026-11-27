import * as THREE from 'three';
import { BattleBiome, TileData } from '../types/game';
import { GridSystem } from '../world/GridSystem';
import {
  BRAWL_PALETTE,
  QualityPreset,
  attachInvertedHullOutline,
  getBrawlToonGradientTexture
} from './BrawlStyleSystem';

export const BATTLE_ELEVATION_STEP = 0.52;

export interface BiomePalette {
  biome: BattleBiome;
  bgHex: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  plinthHex: number;
  rimBoardHex: number;
  pedestalHex: number;
  grassTopHex: number;
  grassAltHex: number;
  highTopHex: number;
  stoneTopHex: number;
  waterHex: number;
  mudHex: number;
  hazardHex: number;
  hazardGlowHex: number;
  rockHex: number;
}

export function resolveBattleBiome(elevationSeed: number): BattleBiome {
  if (elevationSeed >= 400) return 'dungeon';
  if (elevationSeed === 2) return 'ruins';
  if (elevationSeed >= 3) return 'caldera';
  return 'lowlands';
}

export function getBiomePalette(biome: BattleBiome): BiomePalette {
  if (biome === 'dungeon') {
    return {
      biome,
      bgHex: 0x05070c,
      fogDensity: 0.0175,
      sunColor: 0xffd7a3,
      sunIntensity: 1.08,
      hemiSky: 0x475569,
      hemiGround: 0x161b26,
      hemiIntensity: 0.56,
      rimColor: 0xf59e0b,
      plinthHex: 0x0c1018,
      rimBoardHex: 0x1e2533,
      pedestalHex: 0x262b36,
      grassTopHex: 0x4b5568,
      grassAltHex: 0x3e4657,
      highTopHex: 0x626c80,
      stoneTopHex: 0x586275,
      waterHex: 0x0369a1,
      mudHex: 0x3a2e2a,
      hazardHex: 0xf97316,
      hazardGlowHex: 0xea580c,
      rockHex: 0x1b202b
    };
  }
  if (biome === 'ruins') {
    return {
      biome,
      bgHex: 0x0f1d30,
      fogDensity: 0.012,
      sunColor: 0xffe0ad,
      sunIntensity: 1.24,
      hemiSky: 0x7dd3fc,
      hemiGround: 0x30263b,
      hemiIntensity: 0.64,
      rimColor: 0x38bdf8,
      plinthHex: 0x152033,
      rimBoardHex: 0x474036,
      pedestalHex: 0x5c5347,
      grassTopHex: 0x3e8249,
      grassAltHex: 0x33703f,
      highTopHex: 0x9e9072,
      stoneTopHex: 0xa89f8b,
      waterHex: 0x0ea5e9,
      mudHex: 0x5c4838,
      hazardHex: 0xf59e0b,
      hazardGlowHex: 0xd97706,
      rockHex: 0x424a5e
    };
  }
  if (biome === 'caldera') {
    return {
      biome,
      bgHex: 0x160f20,
      fogDensity: 0.0135,
      sunColor: 0xffc091,
      sunIntensity: 1.22,
      hemiSky: 0xa78bfa,
      hemiGround: 0x33141d,
      hemiIntensity: 0.62,
      rimColor: 0xf97316,
      plinthHex: 0x171122,
      rimBoardHex: 0x35263d,
      pedestalHex: 0x2f283d,
      grassTopHex: 0x434959,
      grassAltHex: 0x383e4d,
      highTopHex: 0x5d546b,
      stoneTopHex: 0x53586b,
      waterHex: 0x0284c7,
      mudHex: 0x422c27,
      hazardHex: 0xfb923c,
      hazardGlowHex: 0xea580c,
      rockHex: 0x261f33
    };
  }
  // Lowlands
  return {
    biome,
    bgHex: 0x101c2e,
    fogDensity: 0.0115,
    sunColor: 0xffe8c4,
    sunIntensity: 1.22,
    hemiSky: 0x93c5fd,
    hemiGround: 0x262d42,
    hemiIntensity: 0.64,
    rimColor: 0x60a5fa,
    plinthHex: 0x162236,
    rimBoardHex: 0x2f3e57,
    pedestalHex: 0x4f4339,
    grassTopHex: 0x3d8f40,
    grassAltHex: 0x337b39,
    highTopHex: 0x7ba356,
    stoneTopHex: 0x919dad,
    waterHex: 0x0ea5e9,
    mudHex: 0x634530,
    hazardHex: 0xf59e0b,
    hazardGlowHex: 0xb45309,
    rockHex: 0x2b3950
  };
}

export interface DioramaBuildResult {
  group: THREE.Group;
  pickMeshes: THREE.Mesh[];
  waterMat: THREE.MeshStandardMaterial;
  hazardMat: THREE.MeshStandardMaterial;
  animatedProps: THREE.Object3D[];
  disposableTextures: THREE.Texture[];
}

function createSurfaceTexture(
  baseHex: string,
  accentHex: string,
  mode: 'grass' | 'stone' | 'cliff' | 'water' | 'hazard',
  anisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 128, 128);

  if (mode === 'grass') {
    for (let i = 0; i < 220; i++) {
      const x = (i * 47) % 124;
      const y = (i * 83) % 124;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(10,35,12,0.12)';
      ctx.fillRect(x, y, i % 4 === 0 ? 6 : 3, 3);
    }
    ctx.strokeStyle = 'rgba(16, 42, 20, 0.24)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 126);
  } else if (mode === 'stone') {
    for (let i = 0; i < 120; i++) {
      const x = (i * 53) % 124;
      const y = (i * 97) % 124;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, y, 6, 4);
    }
    ctx.strokeStyle = 'rgba(25, 32, 46, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 126);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(128, 64);
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 64);
    ctx.moveTo(32, 64);
    ctx.lineTo(32, 128);
    ctx.stroke();
  } else if (mode === 'cliff') {
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y, 128, 6);
    }
    for (let i = 0; i < 90; i++) {
      const x = (i * 61) % 124;
      const y = (i * 37) % 124;
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(x, y, 8, 4);
    }
  } else if (mode === 'water') {
    for (let i = 0; i < 14; i++) {
      const y = i * 9 + 3;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(186,230,253,0.14)';
      ctx.fillRect((i * 19) % 70, y, 42, 3);
    }
  } else {
    // hazard magma/rift cracks
    ctx.fillStyle = '#291510';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(14, 18);
    ctx.lineTo(54, 58);
    ctx.lineTo(110, 34);
    ctx.moveTo(54, 58);
    ctx.lineTo(76, 108);
    ctx.moveTo(22, 96);
    ctx.lineTo(64, 72);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, anisotropy);
  return tex;
}

function createCompositeObstacle(
  biome: BattleBiome,
  gradientMap: THREE.DataTexture,
  outlinesEnabled: boolean
): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshToonMaterial({
    color:
      biome === 'caldera'
        ? 0x453b54
        : biome === 'dungeon'
          ? 0x4b5568
          : biome === 'ruins'
            ? 0xb5a88d
            : 0x7d8a9e,
    gradientMap
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color:
      biome === 'caldera'
        ? 0xf97316
        : biome === 'dungeon'
          ? 0xf59e0b
          : biome === 'ruins'
            ? 0xeab308
            : 0x38bdf8,
    emissive:
      biome === 'caldera'
        ? 0xea580c
        : biome === 'dungeon'
          ? 0xd97706
          : biome === 'ruins'
            ? 0xa16207
            : 0x0284c7,
    emissiveIntensity: biome === 'dungeon' ? 0.65 : 0.45,
    roughness: 0.25,
    metalness: 0.45
  });

  const addOl = (m: THREE.Mesh, s: number = 1.07) => {
    m.castShadow = true;
    m.receiveShadow = true;
    const ol = attachInvertedHullOutline(m, s, BRAWL_PALETTE.battle.outlineHex);
    ol.visible = outlinesEnabled;
  };

  if (biome === 'dungeon') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.2, 0.76), stoneMat);
    base.position.y = 0.1;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.74, 0.54), stoneMat);
    shaft.position.y = 0.55;
    const ironBand = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.11, 0.62), trimMat);
    ironBand.position.y = 0.74;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.18, 6), stoneMat);
    bowl.position.y = 1.0;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), trimMat);
    flame.position.y = 1.24;
    [base, shaft, ironBand, bowl, flame].forEach(p => addOl(p));
    g.add(base, shaft, ironBand, bowl, flame);
  } else if (biome === 'caldera') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.22, 6), stoneMat);
    plinth.position.y = 0.11;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.96, 6), stoneMat);
    spire.position.y = 0.66;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), trimMat);
    shard.position.set(0.16, 0.56, 0.14);
    shard.rotation.z = -0.35;
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), trimMat);
    crown.position.y = 1.24;
    [plinth, spire, shard, crown].forEach(p => addOl(p));
    g.add(plinth, spire, shard, crown);
  } else if (biome === 'ruins') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.74), stoneMat);
    base.position.y = 0.1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.76, 8), stoneMat);
    shaft.position.y = 0.58;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.09, 8), trimMat);
    band.position.y = 0.78;
    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.62), stoneMat);
    capital.position.y = 1.02;
    capital.rotation.y = 0.22;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), trimMat);
    crystal.position.y = 1.26;
    [base, shaft, band, capital, crystal].forEach(p => addOl(p));
    g.add(base, shaft, band, capital, crystal);
  } else {
    // Mossy Rune Monolith
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.22, 6), stoneMat);
    base.position.y = 0.11;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.46), stoneMat);
    shaft.position.y = 0.54;
    shaft.rotation.y = 0.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), trimMat);
    band.position.y = 0.68;
    band.rotation.y = 0.25;
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), stoneMat);
    cap.position.y = 1.04;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), trimMat);
    gem.position.y = 1.32;
    [base, shaft, band, cap, gem].forEach(p => addOl(p));
    g.add(base, shaft, band, cap, gem);
  }
  return g;
}

function createPerimeterLandmark(
  biome: BattleBiome,
  variant: number,
  gradientMap: THREE.DataTexture
): THREE.Group {
  const g = new THREE.Group();
  const moundMat = new THREE.MeshLambertMaterial({
    color:
      biome === 'caldera'
        ? 0x2c2238
        : biome === 'dungeon'
          ? 0x1b202b
          : biome === 'ruins'
            ? 0x4f5248
            : 0x2c5c39
  });
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.14, 7), moundMat);
  mound.position.y = 0.05;
  g.add(mound);

  if (biome === 'dungeon') {
    // Subterranean Dungeon Torch Brazier & Crypt Column
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3b4252 });
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const flameMat = new THREE.MeshBasicMaterial({ color: variant % 2 === 0 ? 0xf59e0b : 0xfbbf24 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.48), stoneMat);
    plinth.position.y = 0.18;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.72, 6), stoneMat);
    shaft.position.y = 0.65;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.18, 6), ironMat);
    bowl.position.y = 1.08;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), flameMat);
    flame.position.y = 1.28;
    g.add(plinth, shaft, bowl, flame);
  } else if (biome === 'lowlands') {
    // Composite Brawl-style Layered Pine / Oak Tree on mossy mound
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3e2a });
    const leafMat = new THREE.MeshToonMaterial({
      color: variant % 2 === 0 ? 0x276e3c : 0x337e42,
      gradientMap
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.55, 7), trunkMat);
    trunk.position.y = 0.34;
    const tier1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.68, 7), leafMat);
    tier1.position.y = 0.78;
    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.55, 7), leafMat);
    tier2.position.y = 1.15;
    const tier3 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 7), leafMat);
    tier3.position.y = 1.46;
    g.add(trunk, tier1, tier2, tier3);
  } else if (biome === 'ruins') {
    // Temple Brazier / Broken Column
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6f675c });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.32, 8), stoneMat);
    base.position.y = 0.24;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.65, 8), stoneMat);
    col.position.y = 0.7;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.18, 8), stoneMat);
    bowl.position.y = 1.08;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), flameMat);
    flame.position.y = 1.28;
    g.add(base, col, bowl, flame);
  } else {
    // Obsidian Crystal Crag
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x292036, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 0.7,
      roughness: 0.2
    });
    const crag = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 5), rockMat);
    crag.position.y = 0.62;
    const sideCrag = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 5), rockMat);
    sideCrag.position.set(0.24, 0.42, 0.12);
    sideCrag.rotation.z = -0.3;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), crystalMat);
    gem.position.set(-0.18, 0.62, 0.18);
    g.add(crag, sideCrag, gem);
  }
  return g;
}

export function buildBattleDiorama(
  grid: GridSystem,
  biome: BattleBiome,
  preset: QualityPreset,
  isSoftwareGl: boolean,
  anisotropy: number
): DioramaBuildResult {
  const pal = getBiomePalette(biome);
  const group = new THREE.Group();
  const pickMeshes: THREE.Mesh[] = [];
  const animatedProps: THREE.Object3D[] = [];
  const disposableTextures: THREE.Texture[] = [];

  const gradientMap = getBrawlToonGradientTexture();
  const grassTex = createSurfaceTexture(
    '#ffffff',
    biome === 'dungeon' ? '#1e2430' : '#2d5e2f',
    biome === 'dungeon' ? 'stone' : 'grass',
    anisotropy
  );
  const stoneTex = createSurfaceTexture('#ffffff', biome === 'dungeon' ? '#1e293b' : '#475569', 'stone', anisotropy);
  const cliffTex = createSurfaceTexture('#ffffff', biome === 'dungeon' ? '#111827' : '#332924', 'cliff', anisotropy);
  const waterTex = createSurfaceTexture('#0ea5e9', '#bae6fd', 'water', anisotropy);
  const hazardTex = createSurfaceTexture('#2e1310', '#f97316', 'hazard', anisotropy);
  disposableTextures.push(grassTex, stoneTex, cliffTex, waterTex, hazardTex);

  // Outer diorama terraced plinth
  const centerX = (grid.width - 1) / 2;
  const centerZ = (grid.height - 1) / 2;

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 7.5, 1.5, grid.height + 7.5),
    new THREE.MeshLambertMaterial({ color: pal.plinthHex })
  );
  plinth.position.set(centerX, -0.84, centerZ);
  plinth.receiveShadow = true;
  group.add(plinth);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(grid.width + 0.68, 0.24, grid.height + 0.68),
    new THREE.MeshLambertMaterial({ color: pal.rimBoardHex })
  );
  rim.position.set(centerX, -0.08, centerZ);
  rim.receiveShadow = true;
  group.add(rim);

  // Sculpted Bronze & Stone Corner Lantern Bollards on diorama frame
  const bollardBaseGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.38, 6);
  const bollardBaseMat = new THREE.MeshLambertMaterial({ color: pal.pedestalHex });
  const bollardCapGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.1, 6);
  const bollardCapMat = new THREE.MeshStandardMaterial({ color: 0xc98b2c, roughness: 0.35, metalness: 0.55 });
  const lanternGeo = new THREE.OctahedronGeometry(0.11, 0);
  const lanternMat = new THREE.MeshBasicMaterial({
    color:
      biome === 'caldera'
        ? 0xf97316
        : biome === 'dungeon'
          ? 0xf59e0b
          : biome === 'ruins'
            ? 0xfacc15
            : 0x38bdf8
  });
  const hw = grid.width / 2 + 0.24;
  const hh = grid.height / 2 + 0.24;
  [
    [centerX - hw, centerZ - hh],
    [centerX + hw, centerZ - hh],
    [centerX - hw, centerZ + hh],
    [centerX + hw, centerZ + hh]
  ].forEach(([cx, cz]) => {
    const post = new THREE.Mesh(bollardBaseGeo, bollardBaseMat);
    post.position.set(cx, 0.08, cz);
    const cap = new THREE.Mesh(bollardCapGeo, bollardCapMat);
    cap.position.set(cx, 0.3, cz);
    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.set(cx, 0.44, cz);
    group.add(post, cap, lantern);
  });

  // Tile materials
  const matPedestal = new THREE.MeshLambertMaterial({ map: cliffTex, color: pal.pedestalHex });
  const matGrass = new THREE.MeshLambertMaterial({ map: grassTex, color: 0xffffff });
  const matStone = new THREE.MeshLambertMaterial({ map: stoneTex, color: pal.stoneTopHex });
  const matHigh = new THREE.MeshLambertMaterial({ map: stoneTex, color: pal.highTopHex });
  const matMud = new THREE.MeshLambertMaterial({ map: cliffTex, color: pal.mudHex });
  const matWater = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0x38bdf8,
    emissive: 0x0369a1,
    emissiveIntensity: 0.28,
    roughness: 0.16,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9
  });
  const matHazard = new THREE.MeshStandardMaterial({
    map: hazardTex,
    color: pal.hazardHex,
    emissive: pal.hazardGlowHex,
    emissiveIntensity: 0.72,
    roughness: 0.35
  });

  const allTiles = grid.getAllTiles();
  const shadowsOn = preset.shadowsEnabled && !isSoftwareGl;

  // Instanced Pedestals (bottom stone/earth block for every tile)
  const pedGeo = new THREE.BoxGeometry(0.95, 1.0, 0.95);
  const pedInst = new THREE.InstancedMesh(pedGeo, matPedestal, allTiles.length);
  pedInst.receiveShadow = true;
  pedInst.castShadow = shadowsOn;

  // Separate InstancedMeshes for top caps by terrain for clean variation + zero Z-fighting
  const grassTiles: TileData[] = [];
  const stoneTiles: TileData[] = [];
  const highTiles: TileData[] = [];
  const mudTiles: TileData[] = [];
  const waterTiles: TileData[] = [];
  const hazardTiles: TileData[] = [];

  allTiles.forEach(t => {
    if (t.terrain === 'stone') stoneTiles.push(t);
    else if (t.terrain === 'high_ground') highTiles.push(t);
    else if (t.terrain === 'mud') mudTiles.push(t);
    else if (t.terrain === 'water') waterTiles.push(t);
    else if (t.terrain === 'hazard') hazardTiles.push(t);
    else grassTiles.push(t);
  });

  const dummy = new THREE.Object3D();
  const tmpCol = new THREE.Color();

  allTiles.forEach((tile, idx) => {
    const fullHeight = (tile.y + 1) * BATTLE_ELEVATION_STEP;
    const pedHeight = tile.terrain === 'water' ? Math.max(0.24, fullHeight - 0.16) : Math.max(0.28, fullHeight - 0.11);
    dummy.position.set(tile.x, pedHeight * 0.5, tile.z);
    dummy.scale.set(1, pedHeight, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pedInst.setMatrixAt(idx, dummy.matrix);

    const shade = 0.94 + ((tile.x * 7 + tile.z * 13) % 5) * 0.03;
    tmpCol.setHex(pal.pedestalHex).multiplyScalar(shade);
    pedInst.setColorAt(idx, tmpCol);
  });
  pedInst.instanceMatrix.needsUpdate = true;
  if (pedInst.instanceColor) pedInst.instanceColor.needsUpdate = true;
  pedInst.computeBoundingSphere();
  group.add(pedInst);

  const buildCapLayer = (
    list: TileData[],
    mat: THREE.Material,
    baseColorHex: number,
    altColorHex: number | null,
    capThickness: number,
    yOffset: number
  ) => {
    if (list.length === 0) return;
    const capGeo = new THREE.BoxGeometry(0.985, capThickness, 0.985);
    const inst = new THREE.InstancedMesh(capGeo, mat, list.length);
    inst.receiveShadow = true;
    inst.castShadow = shadowsOn;
    list.forEach((tile, idx) => {
      const topY = (tile.y + 1) * BATTLE_ELEVATION_STEP + yOffset;
      dummy.position.set(tile.x, topY - capThickness * 0.5, tile.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);

      const useAlt = altColorHex !== null && (tile.x + tile.z) % 2 === 1;
      tmpCol.setHex(useAlt ? altColorHex! : baseColorHex);
      const jitter = 0.96 + ((tile.x * 3 + tile.z * 5) % 4) * 0.025;
      tmpCol.multiplyScalar(jitter);
      inst.setColorAt(idx, tmpCol);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  };

  buildCapLayer(
    grassTiles,
    biome === 'dungeon' ? matStone : matGrass,
    pal.grassTopHex,
    pal.grassAltHex,
    0.13,
    0
  );
  buildCapLayer(stoneTiles, matStone, 0xffffff, 0xe8edf2, 0.13, 0);
  buildCapLayer(highTiles, matHigh, 0xffffff, 0xe8f0da, 0.14, 0.01);
  buildCapLayer(mudTiles, matMud, 0xffffff, 0xe0cbb8, 0.11, -0.02);
  buildCapLayer(waterTiles, matWater, 0x38bdf8, 0x7dd3fc, 0.08, -0.09);
  buildCapLayer(hazardTiles, matHazard, 0xffffff, null, 0.13, 0);

  // Subtle decorative grass/pebble tufts along grass edge tiles for tactile depth
  if (biome !== 'caldera' && biome !== 'dungeon' && grassTiles.length > 0) {
    const tuftTiles = grassTiles.filter(
      t => !t.hasObstacle && !t.occupantId && (t.x * 7 + t.z * 11) % 5 === 0
    );
    if (tuftTiles.length > 0) {
      const tuftGeo = new THREE.ConeGeometry(0.085, 0.16, 4);
      const tuftMat = new THREE.MeshLambertMaterial({ color: pal.grassAltHex });
      const tuftInst = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftTiles.length * 2);
      tuftTiles.forEach((tile, i) => {
        const topY = (tile.y + 1) * BATTLE_ELEVATION_STEP;
        dummy.position.set(tile.x - 0.28, topY + 0.06, tile.z + 0.26);
        dummy.rotation.set(0, i * 0.8, 0.12);
        dummy.scale.setScalar(0.95);
        dummy.updateMatrix();
        tuftInst.setMatrixAt(i * 2, dummy.matrix);

        dummy.position.set(tile.x + 0.27, topY + 0.05, tile.z - 0.28);
        dummy.rotation.set(0, i * 1.4, -0.1);
        dummy.scale.setScalar(0.8);
        dummy.updateMatrix();
        tuftInst.setMatrixAt(i * 2 + 1, dummy.matrix);
      });
      tuftInst.instanceMatrix.needsUpdate = true;
      group.add(tuftInst);
    }
  }

  // Lowlands wooden ford planks on bridge tiles (x === 3 && (z === 4 || z === 5))
  if (biome === 'lowlands') {
    const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x5c3a21 });
    for (const tile of stoneTiles) {
      if (tile.x === 3 && (tile.z === 4 || tile.z === 5)) {
        const topY = (tile.y + 1) * BATTLE_ELEVATION_STEP + 0.01;
        for (let p = -1; p <= 1; p++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.24), plankMat);
          plank.position.set(tile.x, topY + 0.02, tile.z + p * 0.3);
          group.add(plank);
        }
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), railMat);
        postL.position.set(tile.x - 0.42, topY + 0.14, tile.z);
        const postR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), railMat);
        postR.position.set(tile.x + 0.42, topY + 0.14, tile.z);
        group.add(postL, postR);
      }
    }
  }

  // Invisible Raycast Pick Planes + Composite Obstacles
  const topPickGeo = new THREE.PlaneGeometry(0.98, 0.98);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });

  allTiles.forEach(tile => {
    const topY = (tile.y + 1) * BATTLE_ELEVATION_STEP;
    const pickPlane = new THREE.Mesh(topPickGeo, pickMat);
    pickPlane.rotation.x = -Math.PI / 2;
    pickPlane.position.set(tile.x, topY + 0.008, tile.z);
    pickPlane.userData = { gridX: tile.x, gridZ: tile.z };
    group.add(pickPlane);
    pickMeshes.push(pickPlane);

    if (tile.hasObstacle) {
      const obs = createCompositeObstacle(biome, gradientMap, preset.outlinesEnabled);
      obs.position.set(tile.x, topY, tile.z);
      group.add(obs);
      animatedProps.push(obs);
    }
  });

  // Perimeter Diorama Props (Trees / Temple Braziers / Obsidian Crags + Base Rocks)
  const landmarkCount = 16;
  for (let i = 0; i < landmarkCount; i++) {
    const angle = (i / landmarkCount) * Math.PI * 2 + 0.15;
    const radX = grid.width * 0.64 + (i % 3) * 0.52;
    const radZ = grid.height * 0.64 + ((i + 1) % 3) * 0.52;
    const lm = createPerimeterLandmark(biome, i, gradientMap);
    lm.position.set(centerX + Math.cos(angle) * radX, -0.02, centerZ + Math.sin(angle) * radZ);
    lm.rotation.y = angle * 1.7;
    lm.scale.setScalar(0.85 + (i % 3) * 0.18);
    group.add(lm);
  }

  return {
    group,
    pickMeshes,
    waterMat: matWater,
    hazardMat: matHazard,
    animatedProps,
    disposableTextures
  };
}
