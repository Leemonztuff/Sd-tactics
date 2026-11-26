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
  | 'castle';

export type WesnothOverlayCategory = 'none' | 'forest' | 'village' | 'bridge';

export interface WesnothMovetypeSpec {
  id: WesnothMovetypeId;
  name: string;
  description: string;
  maxMp: number;
  movementCosts: Record<WesnothBaseCategory | 'forest' | 'village', number>;
  /** Wesnoth defense = % chance to avoid being hit (100 - hitChance) */
  defense: Record<WesnothBaseCategory | 'forest' | 'village', number>;
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
    description: 'Balanced infantry march: nimble in castles/villages, steady across hills.',
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
      forest: 2,
      village: 1
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
      forest: 50,
      village: 60
    }
  },
  mounted: {
    id: 'mounted',
    name: 'Cavalry Stride',
    description: 'Fast 7 MP across roads & plains; slowed by forests & impassable mountains.',
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
      forest: 3,
      village: 1
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
      forest: 30,
      village: 40
    }
  },
  woodland: {
    id: 'woodland',
    name: 'Woodland Ranger',
    description: '1 MP through forests with 70% forest cover defense.',
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
      forest: 1,
      village: 1
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
      forest: 70,
      village: 60
    }
  },
  orcishfoot: {
    id: 'orcishfoot',
    name: 'Orcish March',
    description: 'Hardened rough-terrain march: 1 MP hills, 2 MP mountains.',
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
      forest: 2,
      village: 1
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
      forest: 50,
      village: 60
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

  if (baseCode === 'Mm') {
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
  } else if (overlayCode === '^Vh') {
    overlayCategory = 'village';
    overlayAsset = 'village_human';
    name = 'Village Cottage';
    isVillage = true;
    encounterChance = 0;
  } else if (overlayCode === '^Vhh') {
    overlayCategory = 'village';
    overlayAsset = 'village_hills';
    name = 'Hill Stone Village';
    isVillage = true;
    encounterChance = 0;
  } else if (overlayCode === '^Bw|' || overlayCode === '^Bw/' || overlayCode === '^Bw\\') {
    overlayCategory = 'bridge';
    overlayAsset = 'bridge_stone';
    name = 'Stone Bridge';
    elevation = Math.max(elevation, 0.24);
    encounterChance = 0.03;
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
    isKeep: Boolean(baseDef.isKeep),
    isVillage,
    isWater: Boolean(baseDef.isWater && overlayCategory !== 'bridge'),
    encounterChance,
    battleBiomeSeed: baseCode.charCodeAt(0) * 17 + (overlayCode?.charCodeAt(1) ?? 0)
  };
}

/**
 * Wesnoth alias resolution (`aliasof`):
 * - Bridges (`^Bw*`) take the BEST (minimum cost / maximum defense) of underlying water and flat!
 * - Forests/Villages use their overlay category if it imposes higher cost or better defense,
 *   matching Wesnoth `mvt_alias=-,_bas,Ft` (combined max cost with base, or village=1).
 */
export function getWesnothMovementCost(terrain: WesnothTerrainInfo, movetypeId: WesnothMovetypeId): number {
  const mt = WESNOTH_MOVETYPES[movetypeId];
  const baseCost = mt.movementCosts[terrain.baseCategory];

  if (terrain.overlayCategory === 'bridge') {
    return Math.min(baseCost, mt.movementCosts.flat);
  }
  if (terrain.overlayCategory === 'village') {
    return mt.movementCosts.village;
  }
  if (terrain.overlayCategory === 'forest') {
    // Wesnoth mvt_alias=-,_bas,Ft takes max of base and forest (e.g., forest on hills = max(2,2) = 2)
    return Math.max(baseCost, mt.movementCosts.forest);
  }
  return baseCost;
}

export function getWesnothDefensePct(terrain: WesnothTerrainInfo, movetypeId: WesnothMovetypeId): number {
  const mt = WESNOTH_MOVETYPES[movetypeId];
  const baseDef = mt.defense[terrain.baseCategory];

  if (terrain.overlayCategory === 'bridge') {
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
  return baseDef;
}
