/**
 * Extracted from Battle for Wesnoth (`src/map/location.cpp` & `.map` parser).
 * Implements Wesnoth `.map` parsing, exact 6-neighbor odd-q hex adjacency,
 * Dijkstra reachable-MP range, and A* shortest-MP pathfinding.
 */

import {
  WesnothMovetypeId,
  WesnothTerrainInfo,
  getWesnothMovementCost,
  resolveWesnothTerrain
} from './WesnothTerrain';

export interface HexCoord {
  x: number;
  y: number;
}

export interface WesnothHexTile {
  x: number;
  y: number;
  terrain: WesnothTerrainInfo;
  startingPosition: number | null; // e.g., 1 for `1 Kh`, 2 for `2 Kh`
}

export interface WesnothMapData {
  width: number;
  height: number;
  tiles: WesnothHexTile[][]; // indexed [y][x]
  startingPositions: Map<number, HexCoord>;
}

export interface ReachableHex {
  x: number;
  y: number;
  cost: number;
  remainingMp: number;
  path: HexCoord[];
}

export const HEX_RADIUS = 0.92;
export const HEX_SQRT3 = Math.sqrt(3);

/**
 * Parses a standard Battle for Wesnoth `.map` string (comma-separated hex rows,
 * optional metadata header separated by blank line, and optional `<side> <terrain>` prefixes).
 */
export function parseWesnothMap(rawMap: string): WesnothMapData {
  const lines = rawMap
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.includes('='));

  const tiles: WesnothHexTile[][] = [];
  const startingPositions = new Map<number, HexCoord>();

  lines.forEach((line, y) => {
    const cells = line
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const row: WesnothHexTile[] = [];
    cells.forEach((cell, x) => {
      let startingPosition: number | null = null;
      let code = cell;

      // Wesnoth player/side keep prefix, e.g. "1 Kh" or "2 Kh"
      const match = /^(\d+)\s+(.+)$/.exec(cell);
      if (match) {
        startingPosition = parseInt(match[1], 10);
        code = match[2].trim();
        startingPositions.set(startingPosition, { x, y });
      }

      row.push({
        x,
        y,
        terrain: resolveWesnothTerrain(code),
        startingPosition
      });
    });

    if (row.length > 0) {
      tiles.push(row);
    }
  });

  const height = tiles.length;
  const width = height > 0 ? tiles[0].length : 0;

  return { width, height, tiles, startingPositions };
}

/**
 * Exact translation of Wesnoth `get_adjacent_tiles()` from `src/map/location.cpp`:
 * Odd columns (`x & 1 === 1`) are shifted +0.5 hex height south (+Z).
 */
export function getAdjacentHexes(x: number, y: number, width?: number, height?: number): HexCoord[] {
  const even = (x & 1) === 0;
  const candidates: HexCoord[] = [
    { x, y: y - 1 }, // N
    { x: x + 1, y: y - (even ? 1 : 0) }, // NE
    { x: x + 1, y: y + (even ? 0 : 1) }, // SE
    { x, y: y + 1 }, // S
    { x: x - 1, y: y + (even ? 0 : 1) }, // SW
    { x: x - 1, y: y - (even ? 1 : 0) } // NW
  ];

  if (width !== undefined && height !== undefined) {
    return candidates.filter(c => c.x >= 0 && c.y >= 0 && c.x < width && c.y < height);
  }
  return candidates;
}

/**
 * Converts Wesnoth odd-q offset coordinates to cube coordinates (q, r, s) for exact hex distance.
 */
export function offsetToCube(x: number, y: number): { q: number; r: number; s: number } {
  const q = x;
  const r = y - ((x - (x & 1)) >> 1);
  const s = -q - r;
  return { q, r, s };
}

export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const a = offsetToCube(ax, ay);
  const b = offsetToCube(bx, by);
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

/**
 * Converts Wesnoth hex (x, y) to 3D world center (wx, wz) for flat-top hexagons.
 */
export function hexToWorld(x: number, y: number, radius: number = HEX_RADIUS): { wx: number; wz: number } {
  const wx = x * (1.5 * radius);
  const hexHeight = HEX_SQRT3 * radius;
  const wz = (y + (x & 1 ? 0.5 : 0)) * hexHeight;
  return { wx, wz };
}

export function getHexTile(map: WesnothMapData, x: number, y: number): WesnothHexTile | null {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return null;
  return map.tiles[y]?.[x] ?? null;
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Computes all reachable hexes within `availableMp` using Wesnoth movement costs & impassable rules.
 */
export function computeReachableHexes(
  map: WesnothMapData,
  startX: number,
  startY: number,
  availableMp: number,
  movetype: WesnothMovetypeId,
  blockedKeys: Set<string> = new Set()
): ReachableHex[] {
  const bestCost = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const queue: { x: number; y: number; cost: number }[] = [{ x: startX, y: startY, cost: 0 }];

  const startKey = keyOf(startX, startY);
  bestCost.set(startKey, 0);
  parent.set(startKey, null);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const curr = queue.shift()!;
    const currKey = keyOf(curr.x, curr.y);
    if (curr.cost > (bestCost.get(currKey) ?? Infinity)) continue;

    const neighbors = getAdjacentHexes(curr.x, curr.y, map.width, map.height);
    for (const n of neighbors) {
      const nKey = keyOf(n.x, n.y);
      const tile = getHexTile(map, n.x, n.y);
      if (!tile) continue;

      const stepCost = getWesnothMovementCost(tile.terrain, movetype);
      if (stepCost >= 99) continue; // impassable (e.g., deep ocean, mountain for mounted)

      const nextCost = curr.cost + stepCost;
      if (nextCost > availableMp) continue;

      // Cannot pass through blocked hexes, though can step onto an enemy tile to trigger encounter
      const isBlocked = blockedKeys.has(nKey);
      if (nextCost < (bestCost.get(nKey) ?? Infinity)) {
        bestCost.set(nKey, nextCost);
        parent.set(nKey, currKey);
        if (!isBlocked) {
          queue.push({ x: n.x, y: n.y, cost: nextCost });
        }
      }
    }
  }

  const results: ReachableHex[] = [];
  for (const [k, cost] of bestCost.entries()) {
    const [xs, ys] = k.split(',');
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);

    const path: HexCoord[] = [];
    let trace: string | null = k;
    while (trace) {
      const [tx, ty] = trace.split(',');
      path.unshift({ x: parseInt(tx, 10), y: parseInt(ty, 10) });
      trace = parent.get(trace) ?? null;
    }

    results.push({
      x,
      y,
      cost,
      remainingMp: Math.max(0, availableMp - cost),
      path
    });
  }

  return results;
}

/**
 * Wesnoth A* pathfinding across the hex map respecting terrain movement costs.
 */
export function findHexPath(
  map: WesnothMapData,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  movetype: WesnothMovetypeId,
  blockedKeys: Set<string> = new Set()
): { path: HexCoord[]; totalCost: number } | null {
  const goalTile = getHexTile(map, goalX, goalY);
  if (!goalTile) return null;
  if (getWesnothMovementCost(goalTile.terrain, movetype) >= 99) return null;

  const startKey = keyOf(startX, startY);
  const goalKey = keyOf(goalX, goalY);

  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, hexDistance(startX, startY, goalX, goalY)]]);
  const parent = new Map<string, string | null>([[startKey, null]]);
  const open: { x: number; y: number; key: string }[] = [{ x: startX, y: startY, key: startKey }];
  const closed = new Set<string>();

  while (open.length > 0) {
    open.sort((a, b) => (fScore.get(a.key) ?? Infinity) - (fScore.get(b.key) ?? Infinity));
    const curr = open.shift()!;

    if (curr.key === goalKey) {
      const path: HexCoord[] = [];
      let trace: string | null = goalKey;
      while (trace) {
        const [tx, ty] = trace.split(',');
        path.unshift({ x: parseInt(tx, 10), y: parseInt(ty, 10) });
        trace = parent.get(trace) ?? null;
      }
      return { path, totalCost: gScore.get(goalKey) ?? 0 };
    }

    closed.add(curr.key);

    for (const n of getAdjacentHexes(curr.x, curr.y, map.width, map.height)) {
      const nKey = keyOf(n.x, n.y);
      if (closed.has(nKey)) continue;
      if (blockedKeys.has(nKey) && nKey !== goalKey) continue;

      const tile = getHexTile(map, n.x, n.y);
      if (!tile) continue;

      const stepCost = getWesnothMovementCost(tile.terrain, movetype);
      if (stepCost >= 99) continue;

      const tentativeG = (gScore.get(curr.key) ?? Infinity) + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        parent.set(nKey, curr.key);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + hexDistance(n.x, n.y, goalX, goalY));
        if (!open.some(o => o.key === nKey)) {
          open.push({ x: n.x, y: n.y, key: nKey });
        }
      }
    }
  }

  return null;
}
