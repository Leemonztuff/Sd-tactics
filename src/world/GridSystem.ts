import { TileData, TerrainType, AbilityDefinition, MissionObstacle } from '../types/game';
import { TERRAIN_RULES } from '../game/GameConfig';

export interface ReachableTile {
  x: number;
  z: number;
  y: number;
  cost: number;
  path: { x: number; z: number }[];
}

export class GridSystem {
  public width: number;
  public height: number;
  public tiles: Map<string, TileData> = new Map();

  constructor(
    width: number,
    height: number,
    elevationSeed: number = 1,
    obstacles: MissionObstacle[] = [],
    protectedSpawns: { x: number; z: number }[] = []
  ) {
    this.width = width;
    this.height = height;
    this.generateMap(elevationSeed, obstacles, protectedSpawns);
  }

  private generateMap(
    seed: number,
    obstacles: MissionObstacle[],
    protectedSpawns: { x: number; z: number }[]
  ) {
    const protectedSet = new Set(protectedSpawns.map(p => `${p.x},${p.z}`));
    const obstacleMap = new Map(obstacles.map(o => [`${o.x},${o.z}`, o]));

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        const key = `${x},${z}`;
        const obs = obstacleMap.get(key);

        // Deterministic elevation profile creating clear tactical terraces
        let y = 0;
        if (seed === 1) {
          // Oakhaven Crossing: low river trench in middle-left, elevated eastern ridge
          if (x >= 7) y = 2;
          else if (x >= 5 && z >= 2 && z <= 7) y = 1;
          else if (x <= 2 && z >= 5) y = 1;
        } else if (seed === 2) {
          // Solaria Ruins: stepped central altar plateau
          const distFromCenter = Math.abs(x - Math.floor(this.width / 2)) + Math.abs(z - Math.floor(this.height / 2));
          if (distFromCenter <= 2) y = 2;
          else if (distFromCenter <= 4) y = 1;
          if (x >= 8) y = Math.max(y, 2);
        } else {
          // Obsidian Spire: stepped caldera ascending eastwards
          y = Math.min(3, Math.floor((x + (z % 3 === 0 ? 1 : 0)) / 3));
        }

        let terrain: TerrainType = 'grass';
        if (seed === 1) {
          if (x === 3 && z >= 1 && z <= 8 && z !== 4 && z !== 5) terrain = 'water';
          else if ((x === 3 && (z === 4 || z === 5)) || (x >= 5 && x <= 6 && z === 4)) terrain = 'stone';
          else if (x === 4 && z >= 6) terrain = 'mud';
          else if (y >= 2) terrain = 'high_ground';
        } else if (seed === 2) {
          if (y === 2) terrain = 'stone';
          else if ((x === 3 || x === 7) && z >= 2 && z <= 8 && z % 2 === 0) terrain = 'water';
          else if (y === 1) terrain = 'high_ground';
          else if ((x + z) % 7 === 0) terrain = 'mud';
        } else {
          if (y >= 2) terrain = 'stone';
          else if (y === 1) terrain = 'high_ground';
          if ((x === 6 && z === 4) || (x === 6 && z === 7) || (x === 9 && z === 6)) {
            terrain = 'hazard';
          }
        }

        let passable = true;
        let blockLoS = false;
        let hasObstacle = false;

        if (obs && !protectedSet.has(key)) {
          passable = false;
          blockLoS = true;
          hasObstacle = true;
          y = obs.height ?? y + 2;
          terrain = 'stone';
        }

        // Ensure spawn points are always passable & clear
        if (protectedSet.has(key)) {
          passable = true;
          blockLoS = false;
          hasObstacle = false;
          if (terrain === 'hazard' || terrain === 'water') terrain = 'stone';
        }

        const rule = TERRAIN_RULES[terrain];
        this.tiles.set(key, {
          x,
          z,
          y,
          terrain,
          movementCost: rule.movementCost,
          passable,
          blockLoS,
          occupantId: null,
          hasObstacle
        });
      }
    }
  }

  public gridToWorld(x: number, z: number): { wx: number; wy: number; wz: number } {
    const tile = this.getTile(x, z);
    const y = tile ? tile.y : 0;
    return {
      wx: x,
      wy: y * 0.55 + 0.5,
      wz: z
    };
  }

  public worldToGrid(wx: number, wz: number): { x: number; z: number } {
    return {
      x: Math.round(wx),
      z: Math.round(wz)
    };
  }

  public getTile(x: number, z: number): TileData | undefined {
    return this.tiles.get(`${x},${z}`);
  }

  public getAllTiles(): TileData[] {
    return Array.from(this.tiles.values());
  }

  public getTerrainModifiers(x: number, z: number) {
    const tile = this.getTile(x, z);
    if (!tile) return TERRAIN_RULES.grass;
    return TERRAIN_RULES[tile.terrain];
  }

  public setOccupant(x: number, z: number, occupantId: string | null) {
    const tile = this.getTile(x, z);
    if (tile) {
      tile.occupantId = occupantId;
    }
  }

  public hasLineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const startTile = this.getTile(x0, z0);
    const endTile = this.getTile(x1, z1);
    if (!startTile || !endTile) return false;
    if (x0 === x1 && z0 === z1) return true;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let cx = x0;
    let cz = z0;

    const totalSteps = Math.max(dx, dz);
    let step = 0;

    while (!(cx === x1 && cz === z1)) {
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cz += sz;
      }
      step++;
      if (cx === x1 && cz === z1) break;

      const midTile = this.getTile(cx, cz);
      if (!midTile) return false;
      if (midTile.blockLoS) return false;

      // Elevation check: an intermediate tile significantly taller than the sightline blocks LoS
      const t = step / totalSteps;
      const sightHeight = startTile.y + (endTile.y - startTile.y) * t + 1.2;
      if (midTile.y > sightHeight) {
        return false;
      }
    }

    return true;
  }

  public getReachableTiles(
    startX: number,
    startZ: number,
    maxMove: number,
    maxJump: number,
    ignoreRoughTerrain: boolean = false
  ): ReachableTile[] {
    const reachable: Map<string, ReachableTile> = new Map();
    const queue: ReachableTile[] = [];

    const startTile = this.getTile(startX, startZ);
    if (!startTile) return [];

    const startEntry: ReachableTile = {
      x: startX,
      z: startZ,
      y: startTile.y,
      cost: 0,
      path: [{ x: startX, z: startZ }]
    };
    queue.push(startEntry);
    reachable.set(`${startX},${startZ}`, startEntry);

    const dirs = [
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: -1, z: 0 }
    ];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      const currentTile = this.getTile(current.x, current.z);
      if (!currentTile) continue;

      for (const d of dirs) {
        const nx = current.x + d.x;
        const nz = current.z + d.z;
        const neighbor = this.getTile(nx, nz);

        if (!neighbor || !neighbor.passable) continue;
        // Cannot stop on or pass through tiles occupied by other units
        if (neighbor.occupantId !== null && (nx !== startX || nz !== startZ)) continue;

        const heightDiff = Math.abs(neighbor.y - currentTile.y);
        if (heightDiff > maxJump) continue;

        const baseMoveCost = ignoreRoughTerrain && neighbor.terrain === 'mud' ? 1 : neighbor.movementCost;
        const totalCost = current.cost + baseMoveCost;

        if (totalCost <= maxMove) {
          const key = `${nx},${nz}`;
          const existing = reachable.get(key);
          if (!existing || totalCost < existing.cost) {
            const entry: ReachableTile = {
              x: nx,
              z: nz,
              y: neighbor.y,
              cost: totalCost,
              path: [...current.path, { x: nx, z: nz }]
            };
            reachable.set(key, entry);
            queue.push(entry);
          }
        }
      }
    }

    return Array.from(reachable.values());
  }

  public getAbilityTargetTiles(
    originX: number,
    originZ: number,
    ability: AbilityDefinition
  ): TileData[] {
    const originTile = this.getTile(originX, originZ);
    if (!originTile) return [];

    const results: TileData[] = [];
    for (let x = originX - ability.range; x <= originX + ability.range; x++) {
      for (let z = originZ - ability.range; z <= originZ + ability.range; z++) {
        const dist = Math.abs(x - originX) + Math.abs(z - originZ);
        if (dist > ability.range) continue;
        if (ability.targetType === 'self' && dist > 0) continue;

        const tile = this.getTile(x, z);
        if (!tile || tile.hasObstacle) continue;

        const heightDiff = tile.y - originTile.y;
        if (heightDiff < ability.minHeightDiff || heightDiff > ability.maxHeightDiff) continue;

        if (ability.requiresLoS && dist > 1 && !this.hasLineOfSight(originX, originZ, x, z)) {
          continue;
        }

        results.push(tile);
      }
    }
    return results;
  }

  public getAoeTiles(centerX: number, centerZ: number, radius: number): TileData[] {
    const results: TileData[] = [];
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        if (Math.abs(x - centerX) + Math.abs(z - centerZ) <= radius) {
          const tile = this.getTile(x, z);
          if (tile && !tile.hasObstacle) results.push(tile);
        }
      }
    }
    return results;
  }

  public findPath(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    maxJump: number
  ): { x: number; z: number }[] {
    interface PathNode {
      x: number;
      z: number;
      g: number;
      h: number;
      f: number;
      parent: PathNode | null;
    }

    const openSet: PathNode[] = [];
    const closedSet: Set<string> = new Set();

    const startTile = this.getTile(startX, startZ);
    const targetTile = this.getTile(targetX, targetZ);
    if (!startTile || !targetTile || !targetTile.passable) return [];

    const startNode: PathNode = {
      x: startX,
      z: startZ,
      g: 0,
      h: Math.abs(targetX - startX) + Math.abs(targetZ - startZ),
      f: 0,
      parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    const dirs = [
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: -1, z: 0 }
    ];

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.z}`;

      if (current.x === targetX && current.z === targetZ) {
        const path: { x: number; z: number }[] = [];
        let curr: PathNode | null = current;
        while (curr) {
          path.unshift({ x: curr.x, z: curr.z });
          curr = curr.parent;
        }
        return path;
      }

      closedSet.add(currentKey);
      const currentTile = this.getTile(current.x, current.z);
      if (!currentTile) continue;

      for (const d of dirs) {
        const nx = current.x + d.x;
        const nz = current.z + d.z;
        const neighborKey = `${nx},${nz}`;

        if (closedSet.has(neighborKey)) continue;

        const neighbor = this.getTile(nx, nz);
        if (!neighbor || !neighbor.passable) continue;
        if (neighbor.occupantId !== null && (nx !== targetX || nz !== targetZ)) continue;

        const heightDiff = Math.abs(neighbor.y - currentTile.y);
        if (heightDiff > maxJump) continue;

        const tentativeG = current.g + neighbor.movementCost;

        const existing = openSet.find(n => n.x === nx && n.z === nz);
        if (!existing) {
          const h = Math.abs(targetX - nx) + Math.abs(targetZ - nz);
          openSet.push({
            x: nx,
            z: nz,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current
          });
        } else if (tentativeG < existing.g) {
          existing.g = tentativeG;
          existing.f = existing.g + existing.h;
          existing.parent = current;
        }
      }
    }

    return [];
  }
}
