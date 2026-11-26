import { HexCoord, WesnothHexTile, WesnothMapData, getAdjacentHexes, getHexTile } from './WesnothMapSystem';

export type HexDirection = 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw';

export const HEX_DIRECTIONS: readonly HexDirection[] = ['n', 'ne', 'se', 's', 'sw', 'nw'] as const;

export type TransitionFamily =
  | 'water_ford'
  | 'sand_beach'
  | 'flat_bank'
  | 'swamp_water'
  | 'flat_dirt'
  | 'flat_road'
  | 'grass_green_long'
  | 'grass_green_medium'
  | 'grass_semi_dry_medium'
  | 'hills_regular'
  | 'hills_water';

export interface TileTransitionLayer {
  family: TransitionFamily;
  dir: HexDirection;
  assetKey: string;
}

export interface HexAutoTilePlan {
  baseAsset: string;
  transitions: TileTransitionLayer[];
  /** Outer perimeter edges for connected Ch/Kh castle walls, ordered by HexDirection */
  castleOuterDirs: HexDirection[];
}

export interface FrontierEdgeSegment {
  x: number;
  y: number;
  dir: HexDirection;
  elevation: number;
  isEnemyEdge: boolean;
}

const GRASS_GREEN_VARIANTS = ['grass_green', 'grass_green2', 'grass_green3', 'grass_green4'] as const;
const GRASS_SEMI_VARIANTS = ['grass_semi_dry', 'grass_semi_dry2', 'grass_semi_dry3'] as const;
const ROAD_VARIANTS = ['flat_road', 'flat_road2', 'flat_road3'] as const;
const SAND_VARIANTS = ['sand_beach', 'sand_beach2'] as const;
const HILLS_VARIANTS = ['hills_regular', 'hills_regular2', 'hills_regular3'] as const;

function deterministicHash(x: number, y: number): number {
  let n = (x * 73856093) ^ (y * 19349663);
  n = ((n >> 13) ^ n) * 1274126177;
  return (n ^ (n >> 16)) >>> 0;
}

export function pickWesnothBaseVariant(tile: WesnothHexTile): string {
  const h = deterministicHash(tile.x, tile.y);
  const code = tile.terrain.baseCode;

  if (code === 'Gg') return GRASS_GREEN_VARIANTS[h % GRASS_GREEN_VARIANTS.length];
  if (code === 'Gs' || code === 'Aa') return GRASS_SEMI_VARIANTS[h % GRASS_SEMI_VARIANTS.length];
  if (code === 'Rr') return ROAD_VARIANTS[h % ROAD_VARIANTS.length];
  if (code === 'Ds' || code === 'Dd') return SAND_VARIANTS[h % SAND_VARIANTS.length];
  if (code === 'Hh' || code === 'Mm' || code === 'Hd' || code === 'Ha' || code === 'Ms') {
    return HILLS_VARIANTS[h % HILLS_VARIANTS.length];
  }
  if (code === 'Ch') return 'castle_cobbles';
  return tile.terrain.baseAsset;
}

/**
 * Returns the 6 directional neighbors of (x, y) matching exact Wesnoth odd-q geometry:
 * [n, ne, se, s, sw, nw]. Out-of-bounds neighbors have tile = null.
 */
export function getDirectionalNeighbors(
  map: WesnothMapData,
  x: number,
  y: number
): Array<{ dir: HexDirection; coord: HexCoord; tile: WesnothHexTile | null }> {
  const coords = getAdjacentHexes(x, y);
  return HEX_DIRECTIONS.map((dir, i) => {
    const coord = coords[i];
    return {
      dir,
      coord,
      tile: getHexTile(map, coord.x, coord.y)
    };
  });
}

function isLandBase(code: string): boolean {
  return (
    code === 'Gg' ||
    code === 'Gs' ||
    code === 'Rr' ||
    code === 'Re' ||
    code === 'Hh' ||
    code === 'Mm' ||
    code === 'Ch' ||
    code === 'Kh' ||
    code === 'Aa' ||
    code === 'Ha' ||
    code === 'Ms' ||
    code === 'Dd' ||
    code === 'Hd' ||
    code === 'Rd'
  );
}

function isWaterBase(code: string): boolean {
  return code === 'Ww' || code === 'Wo' || code === 'Wwf' || code === 'Qlf';
}

/**
 * Computes authentic Battle for Wesnoth multi-layer directional transitions
 * (ordered bottom-to-top per Wesnoth `terrain-graphics.cfg` layer priority).
 */
export function computeHexAutoTilePlan(map: WesnothMapData, x: number, y: number): HexAutoTilePlan {
  const tile = getHexTile(map, x, y);
  if (!tile) {
    return { baseAsset: 'grass_green', transitions: [], castleOuterDirs: [] };
  }

  const baseAsset = pickWesnothBaseVariant(tile);
  const selfCode = tile.terrain.baseCode;
  const selfIsBridge = tile.terrain.overlayCategory === 'bridge';
  const neighbors = getDirectionalNeighbors(map, x, y);

  const layerBuckets: Array<{ layer: number; item: TileTransitionLayer }> = [];
  const push = (layer: number, family: TransitionFamily, dir: HexDirection) => {
    layerBuckets.push({ layer, item: { family, dir, assetKey: `${family}_${dir}` } });
  };

  const castleOuterDirs: HexDirection[] = [];

  for (const { dir, tile: nb } of neighbors) {
    if (!nb) {
      if (selfCode === 'Ch' || selfCode === 'Kh') castleOuterDirs.push(dir);
      continue;
    }

    const nbCode = nb.terrain.baseCode;

    if ((selfCode === 'Ch' || selfCode === 'Kh') && nbCode !== 'Ch' && nbCode !== 'Kh') {
      castleOuterDirs.push(dir);
    }

    if (nbCode === selfCode && !selfIsBridge) continue;

    // 1. River ford ripples over deep/shallow water (-515)
    if ((selfCode === 'Ww' || selfCode === 'Wo') && nbCode === 'Wwf') {
      push(10, 'water_ford', dir);
    }

    // 2. Beach/Dune sand spills softly onto water & flat grass/roads (-510 / -319)
    if (
      (nbCode === 'Ds' || nbCode === 'Dd') &&
      (isWaterBase(selfCode) || selfCode === 'Gg' || selfCode === 'Gs' || selfCode === 'Rr' || selfCode === 'Re')
    ) {
      push(20, 'sand_beach', dir);
    }

    // 3. Earthy riverbank / shoreline drawn onto water bordering raised land (-300)
    if ((isWaterBase(selfCode) || selfCode === 'Ss') && isLandBase(nbCode) && !selfIsBridge) {
      push(30, 'flat_bank', dir);
    }

    // 4. Swamp mire transitions onto adjacent flat/water (-230)
    if (
      nbCode === 'Ss' &&
      (selfCode === 'Gg' || selfCode === 'Gs' || selfCode === 'Rr' || selfCode === 'Re' || selfCode === 'Ds' || isWaterBase(selfCode))
    ) {
      push(40, 'swamp_water', dir);
    }

    // 5. Dirt/Ashen trail blends onto grass & sand (-379)
    if ((nbCode === 'Re' || nbCode === 'Rd') && (selfCode === 'Gg' || selfCode === 'Gs' || selfCode === 'Ds' || selfCode === 'Dd' || selfCode === 'Ss')) {
      push(50, 'flat_dirt', dir);
    }

    // 6. Cobble road & castle cobbles blend onto dirt/sand/grass/water-edge (-300)
    if ((nbCode === 'Rr' || nbCode === 'Ch' || nbCode === 'Kh') && (selfCode === 'Re' || selfCode === 'Ds' || selfCode === 'Dd' || selfCode === 'Rd')) {
      push(60, 'flat_road', dir);
    }

    // 7. Green grass transitions softly into semi-dry grass (-256)
    if (nbCode === 'Gg' && selfCode === 'Gs') {
      push(70, 'grass_green_long', dir);
    }

    // 8. Grass blades spill organically onto roads, dirt, sand, and castle aprons (-261 / -260)
    if (nbCode === 'Gg' && (selfCode === 'Rr' || selfCode === 'Re' || selfCode === 'Ds' || selfCode === 'Ch')) {
      push(80, 'grass_green_medium', dir);
    }
    if (nbCode === 'Gs' && (selfCode === 'Rr' || selfCode === 'Re' || selfCode === 'Ds' || selfCode === 'Ch')) {
      push(78, 'grass_semi_dry_medium', dir);
    }

    // 9. Hills & mountains spill slopes onto adjacent flat & water tiles (-180 / -482)
    if (
      (nbCode === 'Hh' || nbCode === 'Mm' || nbCode === 'Hd' || nbCode === 'Ha' || nbCode === 'Ms') &&
      (selfCode === 'Gg' || selfCode === 'Gs' || selfCode === 'Rr' || selfCode === 'Re' || selfCode === 'Ds' || selfCode === 'Dd' || selfCode === 'Aa' || selfCode === 'Rd' || selfCode === 'Ss')
    ) {
      push(90, 'hills_regular', dir);
    }
    if ((nbCode === 'Hh' || nbCode === 'Mm' || nbCode === 'Hd' || nbCode === 'Ha' || nbCode === 'Ms') && isWaterBase(selfCode)) {
      push(92, 'hills_water', dir);
    }
  }

  layerBuckets.sort((a, b) => a.layer - b.layer);
  return {
    baseAsset,
    transitions: layerBuckets.map(b => b.item),
    castleOuterDirs
  };
}

/**
 * Computes ONLY the outer perimeter boundary edges of the reachable hex zone
 * (so interior tiles remain 100% clean without noisy per-hex rings).
 */
export function computeReachableFrontierEdges(
  map: WesnothMapData,
  reachableCoords: HexCoord[],
  enemyCoords: HexCoord[] = []
): FrontierEdgeSegment[] {
  const reachSet = new Set(reachableCoords.map(c => `${c.x},${c.y}`));
  const enemySet = new Set(enemyCoords.map(c => `${c.x},${c.y}`));
  const edges: FrontierEdgeSegment[] = [];

  for (const c of reachableCoords) {
    const tile = getHexTile(map, c.x, c.y);
    if (!tile) continue;
    const isEnemy = enemySet.has(`${c.x},${c.y}`);
    const neighbors = getDirectionalNeighbors(map, c.x, c.y);
    for (const { dir, coord } of neighbors) {
      if (!reachSet.has(`${coord.x},${coord.y}`)) {
        edges.push({
          x: c.x,
          y: c.y,
          dir,
          elevation: tile.terrain.elevation,
          isEnemyEdge: isEnemy
        });
      }
    }
  }
  return edges;
}
