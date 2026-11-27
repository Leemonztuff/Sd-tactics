/**
 * Extracted and adapted from Battle for Wesnoth (`data/core/terrain.cfg` and `data/core/units.cfg`).
 * Implements Wesnoth terrain codes, base^overlay composition, movetype movement costs, and defense %.
 */

export type WesnothMovetypeId = 'smallfoot' | 'mounted' | 'woodland' | 'orcishfoot';

export type WesnothBaseCategory =
  | 'flat'
  | 'sand'
  | 'shallow_water'
  | 'deep_water'
  | 'swamp_water'
  | 'hills'
  | 'mountains'
  | 'castle'
  | 'snow'
  | 'volcanic'
  | 'lava'
  | 'dungeon'
  | 'cave'
  | 'chasm'
  | 'wall';

export type WesnothOverlayCategory = 'none' | 'forest' | 'village' | 'bridge' | 'mushrooms' | 'rails';

export interface WesnothMovetypeSpec {
  id: WesnothMovetypeId;
  name: string;
  description: string;
  maxMp: number;
  movementCosts: Record<WesnothBaseCategory | 'forest' | 'village' | 'mushrooms', number>;
  /** Wesnoth defense = % chance to avoid being hit (100 - hitChance) */
  defense: Record<WesnothBaseCategory | 'forest' | 'village' | 'mushrooms', number>;
}

/**
 * Exact movement_costs and defense tables extracted from `wesnoth/data/core/units.cfg`.
 * Note: In Wesnoth WML `[defense] 40` means 40% chance to be hit (60% defense).
 * Here we store `avoidancePct` = 100 - hitChance (so mountains=60% def for smallfoot, flat=40% def).
 */
export const WESNOTH_MOVETYPES: Record<WesnothMovetypeId, WesnothMovetypeSpec> = {
  smallfoot: {
    id: 'smallfoot',
    name: 'Vanguard Foot',
    description: 'Balanced infantry march: nimble in castles/villages, steady across hills & catacombs.',
    maxMp: 5,
    movementCosts: {
      flat: 1,
      sand: 2,
      shallow_water: 3,
      deep_water: 99,
      swamp_water: 3,
      hills: 2,
      mountains: 3,
      castle: 1,
      snow: 2,
      volcanic: 1,
      lava: 99,
      dungeon: 1,
      cave: 2,
      chasm: 99,
      wall: 99,
      forest: 2,
      village: 1,
      mushrooms: 2
    },
    defense: {
      flat: 40,
      sand: 30,
      shallow_water: 20,
      deep_water: 0,
      swamp_water: 20,
      hills: 50,
      mountains: 60,
      castle: 60,
      snow: 30,
      volcanic: 40,
      lava: 0,
      dungeon: 50,
      cave: 40,
      chasm: 0,
      wall: 0,
      forest: 50,
      village: 60,
      mushrooms: 50
    }
  },
  mounted: {
    id: 'mounted',
    name: 'Cavalry Stride',
    description: 'Fast 7 MP across roads & plains; slowed by forests, caves & impassable mountains.',
    maxMp: 7,
    movementCosts: {
      flat: 1,
      sand: 2,
      shallow_water: 4,
      deep_water: 99,
      swamp_water: 4,
      hills: 2,
      mountains: 99,
      castle: 1,
      snow: 2,
      volcanic: 2,
      lava: 99,
      dungeon: 1,
      cave: 3,
      chasm: 99,
      wall: 99,
      forest: 3,
      village: 1,
      mushrooms: 3
    },
    defense: {
      flat: 40,
      sand: 30,
      shallow_water: 20,
      deep_water: 0,
      swamp_water: 20,
      hills: 40,
      mountains: 0,
      castle: 40,
      snow: 30,
      volcanic: 35,
      lava: 0,
      dungeon: 40,
      cave: 30,
      chasm: 0,
      wall: 0,
      forest: 30,
      village: 40,
      mushrooms: 30
    }
  },
  woodland: {
    id: 'woodland',
    name: 'Woodland Ranger',
    description: '1 MP through forests & mushrooms with 70% cover and keen subterranean trap sense.',
    maxMp: 6,
    movementCosts: {
      flat: 1,
      sand: 2,
      shallow_water: 3,
      deep_water: 99,
      swamp_water: 2,
      hills: 2,
      mountains: 3,
      castle: 1,
      snow: 2,
      volcanic: 1,
      lava: 99,
      dungeon: 1,
      cave: 2,
      chasm: 99,
      wall: 99,
      forest: 1,
      village: 1,
      mushrooms: 1
    },
    defense: {
      flat: 40,
      sand: 30,
      shallow_water: 20,
      deep_water: 0,
      swamp_water: 30,
      hills: 50,
      mountains: 60,
      castle: 60,
      snow: 40,
      volcanic: 45,
      lava: 0,
      dungeon: 50,
      cave: 45,
      chasm: 0,
      wall: 0,
      forest: 70,
      village: 60,
      mushrooms: 65
    }
  },
  orcishfoot: {
    id: 'orcishfoot',
    name: 'Orcish March',
    description: 'Hardened rough-terrain march: 1 MP hills & caverns, 2 MP mountains.',
    maxMp: 5,
    movementCosts: {
      flat: 1,
      sand: 2,
      shallow_water: 3,
      deep_water: 99,
      swamp_water: 3,
      hills: 1,
      mountains: 2,
      castle: 1,
      snow: 2,
      volcanic: 1,
      lava: 99,
      dungeon: 1,
      cave: 1,
      chasm: 99,
      wall: 99,
      forest: 2,
      village: 1,
      mushrooms: 2
    },
    defense: {
      flat: 40,
      sand: 30,
      shallow_water: 20,
      deep_water: 0,
      swamp_water: 30,
      hills: 50,
      mountains: 60,
      castle: 60,
      snow: 35,
      volcanic: 50,
      lava: 0,
      dungeon: 50,
      cave: 50,
      chasm: 0,
      wall: 0,
      forest: 50,
      village: 60,
      mushrooms: 50
    }
  }
};

export interface WesnothTerrainInfo {
  code: string;
  baseCode: string;
  overlayCode: string | null;
  name: string;
  baseCategory: WesnothBaseCategory;
  overlayCategory: WesnothOverlayCategory;
  elevation: number;
  sideColor: number;
  baseAsset: string;
  overlayAsset: string | null;
  biomeTint?: string;
  biomeTintAlpha?: number;
  isLava?: boolean;
  isChasm?: boolean;
  isWall?: boolean;
  blocksLos?: boolean;
  emitsLight?: boolean;
  isKeep: boolean;
  isVillage: boolean;
  isWater: boolean;
  encounterChance: number; // 0..1 ambient encounter risk
  battleBiomeSeed: number;
}

interface BaseTerrainDef {
  name: string;
  category: WesnothBaseCategory;
  elevation: number;
  sideColor: number;
  asset: string;
  biomeTint?: string;
  biomeTintAlpha?: number;
  isLava?: boolean;
  isChasm?: boolean;
  isWall?: boolean;
  blocksLos?: boolean;
  emitsLight?: boolean;
  isKeep?: boolean;
  isWater?: boolean;
  encounterChance: number;
}

const BASE_TERRAIN_DEFS: Record<string, BaseTerrainDef> = {
  Gg: {
    name: 'Green Grass',
    category: 'flat',
    elevation: 0.26,
    sideColor: 0x3b5c34,
    asset: 'grass_green',
    encounterChance: 0.08
  },
  Gs: {
    name: 'Semi-dry Grass',
    category: 'flat',
    elevation: 0.26,
    sideColor: 0x526138,
    asset: 'grass_semi_dry',
    encounterChance: 0.1
  },
  Rr: {
    name: 'Cobble Road',
    category: 'flat',
    elevation: 0.26,
    sideColor: 0x5d5750,
    asset: 'flat_road',
    encounterChance: 0.02
  },
  Re: {
    name: 'Dirt Trail',
    category: 'flat',
    elevation: 0.26,
    sideColor: 0x624d3b,
    asset: 'flat_dirt',
    encounterChance: 0.05
  },
  Ds: {
    name: 'Beach Sand',
    category: 'sand',
    elevation: 0.22,
    sideColor: 0x9c895e,
    asset: 'sand_beach',
    encounterChance: 0.08
  },
  Dd: {
    name: 'Sunfire Dunes',
    category: 'sand',
    elevation: 0.28,
    sideColor: 0xa6743c,
    asset: 'sand_beach',
    biomeTint: '#eab354',
    biomeTintAlpha: 0.42,
    encounterChance: 0.14
  },
  Hd: {
    name: 'Redstone Mesas',
    category: 'hills',
    elevation: 0.5,
    sideColor: 0x8f4e39,
    asset: 'hills_regular',
    biomeTint: '#d9774b',
    biomeTintAlpha: 0.48,
    encounterChance: 0.18
  },
  Aa: {
    name: 'Frostpeak Snow',
    category: 'snow',
    elevation: 0.34,
    sideColor: 0x6b82a6,
    asset: 'grass_semi_dry',
    biomeTint: '#bdd6f5',
    biomeTintAlpha: 0.68,
    encounterChance: 0.14
  },
  Ha: {
    name: 'Glacial Hills',
    category: 'snow',
    elevation: 0.52,
    sideColor: 0x566c91,
    asset: 'hills_regular',
    biomeTint: '#b4cef2',
    biomeTintAlpha: 0.62,
    encounterChance: 0.18
  },
  Ms: {
    name: 'Snowcap Peaks',
    category: 'mountains',
    elevation: 0.78,
    sideColor: 0x637696,
    asset: 'hills_regular',
    biomeTint: '#c2d8f5',
    biomeTintAlpha: 0.58,
    encounterChance: 0.16
  },
  Rd: {
    name: 'Ashen Barrens',
    category: 'volcanic',
    elevation: 0.32,
    sideColor: 0x45393e,
    asset: 'flat_dirt',
    biomeTint: '#594b52',
    biomeTintAlpha: 0.55,
    encounterChance: 0.2
  },
  Qlf: {
    name: 'Magma Chasm',
    category: 'lava',
    elevation: 0.07,
    sideColor: 0xb83314,
    asset: 'dun_lava',
    isLava: true,
    encounterChance: 0
  },
  Ww: {
    name: 'Shallow Water',
    category: 'shallow_water',
    elevation: 0.1,
    sideColor: 0x1d4e78,
    asset: 'water_coast',
    isWater: true,
    encounterChance: 0.04
  },
  Wo: {
    name: 'Deep Ocean',
    category: 'deep_water',
    elevation: 0.04,
    sideColor: 0x0f2d4f,
    asset: 'water_ocean',
    isWater: true,
    encounterChance: 0
  },
  Wwf: {
    name: 'River Ford',
    category: 'shallow_water',
    elevation: 0.14,
    sideColor: 0x2c6183,
    asset: 'water_ford',
    isWater: true,
    encounterChance: 0.1
  },
  Ss: {
    name: 'Swamp Mire',
    category: 'swamp_water',
    elevation: 0.16,
    sideColor: 0x354a3b,
    asset: 'swamp_water',
    encounterChance: 0.2
  },
  Hh: {
    name: 'Rolling Hills',
    category: 'hills',
    elevation: 0.46,
    sideColor: 0x5c5746,
    asset: 'hills_regular',
    encounterChance: 0.18
  },
  Mm: {
    name: 'Craggy Mountains',
    category: 'mountains',
    elevation: 0.74,
    sideColor: 0x4b5563,
    asset: 'hills_regular',
    encounterChance: 0.15
  },
  Ch: {
    name: 'Human Castle',
    category: 'castle',
    elevation: 0.38,
    sideColor: 0x64748b,
    asset: 'castle_tile',
    encounterChance: 0
  },
  Kh: {
    name: 'Royal Keep',
    category: 'castle',
    elevation: 0.52,
    sideColor: 0x788496,
    asset: 'keep_tile',
    isKeep: true,
    encounterChance: 0
  },
  Iyd: {
    name: 'Catacomb Stone',
    category: 'dungeon',
    elevation: 0.26,
    sideColor: 0x3f3934,
    asset: 'dun_stone_floor',
    encounterChance: 0.04
  },
  Iya: {
    name: 'Ancient Paving',
    category: 'dungeon',
    elevation: 0.26,
    sideColor: 0x383430,
    asset: 'dun_stone_ancient',
    encounterChance: 0.04
  },
  Urb: {
    name: 'Dark Flagstones',
    category: 'dungeon',
    elevation: 0.26,
    sideColor: 0x2b3038,
    asset: 'dun_flagstones',
    encounterChance: 0.05
  },
  Ur: {
    name: 'Cavern Path',
    category: 'dungeon',
    elevation: 0.26,
    sideColor: 0x473d35,
    asset: 'dun_cave_path',
    encounterChance: 0.05
  },
  Uu: {
    name: 'Cavern Floor',
    category: 'cave',
    elevation: 0.28,
    sideColor: 0x3b3532,
    asset: 'dun_cave_floor',
    encounterChance: 0.08
  },
  Uue: {
    name: 'Earthy Cavern',
    category: 'cave',
    elevation: 0.28,
    sideColor: 0x4b3c31,
    asset: 'dun_cave_earthy',
    encounterChance: 0.09
  },
  Qxu: {
    name: 'Abyssal Chasm',
    category: 'chasm',
    elevation: 0.02,
    sideColor: 0x050609,
    asset: 'dun_chasm',
    isChasm: true,
    encounterChance: 0
  },
  Cud: {
    name: 'Dwarven Bastion',
    category: 'castle',
    elevation: 0.36,
    sideColor: 0x626973,
    asset: 'dun_dwarven_castle',
    encounterChance: 0
  },
  Kud: {
    name: 'Dwarven Keep',
    category: 'castle',
    elevation: 0.48,
    sideColor: 0x767f8c,
    asset: 'dun_dwarven_keep',
    isKeep: true,
    encounterChance: 0
  },
  Xos: {
    name: 'Catacomb Wall',
    category: 'wall',
    elevation: 0.82,
    sideColor: 0x242830,
    asset: 'dun_wall_stone',
    isWall: true,
    blocksLos: true,
    encounterChance: 0
  },
  Xol: {
    name: 'Torchlit Wall',
    category: 'wall',
    elevation: 0.82,
    sideColor: 0x3b2c1f,
    asset: 'dun_wall_stone_lit',
    isWall: true,
    blocksLos: true,
    emitsLight: true,
    encounterChance: 0
  },
  Xoc: {
    name: 'Ossuary Wall',
    category: 'wall',
    elevation: 0.82,
    sideColor: 0x332d2b,
    asset: 'dun_wall_catacomb',
    isWall: true,
    blocksLos: true,
    encounterChance: 0
  },
  Xuc: {
    name: 'Cavern Rock Wall',
    category: 'wall',
    elevation: 0.86,
    sideColor: 0x262324,
    asset: 'dun_wall_rough',
    isWall: true,
    blocksLos: true,
    encounterChance: 0
  },
  Xum: {
    name: 'Mine Timber Wall',
    category: 'wall',
    elevation: 0.84,
    sideColor: 0x3c2c20,
    asset: 'dun_wall_mine',
    isWall: true,
    blocksLos: true,
    encounterChance: 0
  }
};

export function resolveWesnothTerrain(rawCode: string): WesnothTerrainInfo {
  const clean = rawCode.trim();
  const [rawBase, rawOverlay] = clean.split('^');
  const baseCode = BASE_TERRAIN_DEFS[rawBase] ? rawBase : 'Gg';
  const baseDef = BASE_TERRAIN_DEFS[baseCode];
  const overlayCode = rawOverlay ? `^${rawOverlay}` : null;

  let overlayCategory: WesnothOverlayCategory = 'none';
  let overlayAsset: string | null = null;
  let name = baseDef.name;
  let elevation = baseDef.elevation;
  let encounterChance = baseDef.encounterChance;
  let isVillage = false;

  if (baseCode === 'Mm' || baseCode === 'Ms') {
    overlayAsset = 'mountains_basic';
  }

  if (overlayCode === '^Fp') {
    overlayCategory = 'forest';
    overlayAsset = 'forest_pine';
    name = `${baseDef.name} · Pine Forest`;
    encounterChance = Math.max(encounterChance, 0.22);
  } else if (overlayCode === '^Fds') {
    overlayCategory = 'forest';
    overlayAsset = 'forest_deciduous';
    name = `${baseDef.name} · Deciduous Woods`;
    encounterChance = Math.max(encounterChance, 0.2);
  } else if (overlayCode === '^Uf') {
    overlayCategory = 'mushrooms';
    overlayAsset = 'dun_mushrooms';
    name = `${baseDef.name} · Mushroom Grove`;
    encounterChance = Math.max(encounterChance, 0.1);
  } else if (overlayCode === '^Vh') {
    overlayCategory = 'village';
    overlayAsset = 'village_human';
    name =
      baseCode === 'Aa'
        ? 'Alpine Citadel Town'
        : baseCode === 'Dd'
          ? 'Oasis Bazaar Town'
          : baseCode === 'Ds'
            ? 'Harbor Port Town'
            : 'Village Cottage';
    isVillage = true;
    encounterChance = 0;
  } else if (overlayCode === '^Vhh') {
    overlayCategory = 'village';
    overlayAsset = 'village_hills';
    name = baseCode === 'Rd' ? 'Caldera Watch Outpost' : 'Hill Stone Village';
    isVillage = true;
    encounterChance = 0;
  } else if (overlayCode === '^Vu') {
    overlayCategory = 'village';
    overlayAsset = 'dun_village_cave';
    name = 'Subterranean Sanctuary';
    isVillage = true;
    encounterChance = 0;
  } else if (overlayCode === '^Bw|' || overlayCode === '^Bw/' || overlayCode === '^Bw\\') {
    overlayCategory = 'bridge';
    overlayAsset = 'bridge_stone';
    name = baseCode === 'Qlf' ? 'Obsidian Span' : 'Stone Bridge';
    elevation = Math.max(elevation, baseCode === 'Qlf' ? 0.28 : 0.24);
    encounterChance = 0.03;
  } else if (overlayCode === '^Bsb|' || overlayCode === '^Bsb/' || overlayCode === '^Bsb\\') {
    overlayCategory = 'bridge';
    overlayAsset =
      overlayCode === '^Bsb/'
        ? 'dun_bridge_chasm_ne'
        : overlayCode === '^Bsb\\'
          ? 'dun_bridge_chasm_nw'
          : 'dun_bridge_chasm_ns';
    name = baseCode === 'Qlf' ? 'Abyssal Magma Span' : 'Arched Chasm Bridge';
    elevation = Math.max(elevation, 0.27);
    encounterChance = 0.02;
  } else if (overlayCode === '^Br|' || overlayCode === '^Br/' || overlayCode === '^Br\\') {
    const spansHazard = baseDef.isChasm || baseDef.isLava || baseDef.isWater;
    overlayCategory = spansHazard ? 'bridge' : 'rails';
    overlayAsset =
      overlayCode === '^Br/'
        ? 'dun_rails_ne'
        : overlayCode === '^Br\\'
          ? 'dun_rails_nw'
          : 'dun_rails_ns';
    name = spansHazard ? 'Minecart Trestle' : `${baseDef.name} · Rails`;
    if (spansHazard) elevation = Math.max(elevation, 0.27);
    encounterChance = 0.02;
  }

  return {
    code: clean,
    baseCode,
    overlayCode,
    name,
    baseCategory: baseDef.category,
    overlayCategory,
    elevation,
    sideColor: baseDef.sideColor,
    baseAsset: baseDef.asset,
    overlayAsset,
    biomeTint: baseDef.biomeTint,
    biomeTintAlpha: baseDef.biomeTintAlpha,
    isLava: Boolean(baseDef.isLava && overlayCategory !== 'bridge'),
    isChasm: Boolean(baseDef.isChasm && overlayCategory !== 'bridge'),
    isWall: Boolean(baseDef.isWall),
    blocksLos: Boolean(baseDef.blocksLos),
    emitsLight: Boolean(baseDef.emitsLight),
    isKeep: Boolean(baseDef.isKeep),
    isVillage,
    isWater: Boolean(baseDef.isWater && overlayCategory !== 'bridge'),
    encounterChance,
    battleBiomeSeed:
      baseDef.category === 'dungeon' || baseDef.category === 'cave' || baseDef.category === 'chasm' || baseCode === 'Cud' || baseCode === 'Kud'
        ? 400 + baseCode.charCodeAt(0) * 17 + baseCode.charCodeAt(1) * 7
        : baseCode.charCodeAt(0) * 17 + baseCode.charCodeAt(1) * 7 + (overlayCode?.charCodeAt(1) ?? 0)
  };
}

/**
 * Wesnoth alias resolution (`aliasof`):
 * - Bridges (`^Bw*`, `^Bsb*`, hazard `^Br*`) take the BEST (minimum cost / maximum defense) of underlying tile and flat!
 * - Minecart rails (`^Br*` on cave/floor) move like flat stone (1 MP).
 * - Forests/Mushrooms/Villages use their overlay category if it imposes higher cost or better defense.
 */
export function getWesnothMovementCost(terrain: WesnothTerrainInfo, movetypeId: WesnothMovetypeId): number {
  const mt = WESNOTH_MOVETYPES[movetypeId];
  const baseCost = mt.movementCosts[terrain.baseCategory];

  if (terrain.overlayCategory === 'bridge' || terrain.overlayCategory === 'rails') {
    return Math.min(baseCost, mt.movementCosts.flat);
  }
  if (terrain.overlayCategory === 'village') {
    return mt.movementCosts.village;
  }
  if (terrain.overlayCategory === 'forest') {
    return Math.max(baseCost, mt.movementCosts.forest);
  }
  if (terrain.overlayCategory === 'mushrooms') {
    return Math.max(baseCost, mt.movementCosts.mushrooms);
  }
  return baseCost;
}

export function getWesnothDefensePct(terrain: WesnothTerrainInfo, movetypeId: WesnothMovetypeId): number {
  const mt = WESNOTH_MOVETYPES[movetypeId];
  const baseDef = mt.defense[terrain.baseCategory];

  if (terrain.overlayCategory === 'bridge' || terrain.overlayCategory === 'rails') {
    return Math.max(baseDef, mt.defense.flat);
  }
  if (terrain.overlayCategory === 'village') {
    return Math.max(baseDef, mt.defense.village);
  }
  if (terrain.overlayCategory === 'forest') {
    return terrain.baseCategory === 'flat'
      ? mt.defense.forest
      : Math.max(baseDef, mt.defense.forest);
  }
  if (terrain.overlayCategory === 'mushrooms') {
    return Math.max(baseDef, mt.defense.mushrooms);
  }
  return baseDef;
}
