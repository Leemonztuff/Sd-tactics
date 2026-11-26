import {
  HexCoord,
  ReachableHex,
  WesnothHexTile,
  WesnothMapData,
  computeReachableHexes,
  findHexPath,
  getHexTile,
  hexDistance,
  parseWesnothMap
} from './WesnothMapSystem';
import {
  INITIAL_OVERWORLD_PATROLS,
  OVERWORLD_VILLAGES,
  OverworldPatrolSpec,
  OverworldVillageSpec,
  VALEN_WESNOTH_MAP_TEXT
} from './WesnothOverworldMap';
import {
  WESNOTH_MOVETYPES,
  WesnothMovetypeId,
  getWesnothDefensePct,
  getWesnothMovementCost
} from './WesnothTerrain';

export interface ActivePatrolState extends OverworldPatrolSpec {
  routeIndex: number;
}

export interface OverworldEncounter {
  patrol: OverworldPatrolSpec;
  tile: WesnothHexTile;
  reason: 'patrol' | 'ambush' | 'boss';
}

export interface MoveStepResult {
  moved: boolean;
  path: HexCoord[];
  cost: number;
  villageVisited: OverworldVillageSpec | null;
  firstVillageVisit: boolean;
  encounter: OverworldEncounter | null;
}

export class OverworldManager {
  public map: WesnothMapData;
  public heroX: number;
  public heroY: number;
  public facingEast = true;
  public movetype: WesnothMovetypeId = 'smallfoot';
  public currentMp: number;
  public maxMp: number;
  public day: number = 1;
  public ambushMeter: number = 0;

  public visitedVillages: Set<string> = new Set();
  public clearedEncounters: Set<string> = new Set();
  public patrols: ActivePatrolState[] = [];
  public reachable: ReachableHex[] = [];
  public pendingEncounter: OverworldEncounter | null = null;
  public lastSafeHex: HexCoord;
  public eventLog: string[] = [];

  constructor(initial?: {
    heroX?: number;
    heroY?: number;
    day?: number;
    movetype?: WesnothMovetypeId;
    visitedVillages?: string[];
    clearedEncounters?: string[];
  }) {
    this.map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
    const startKeep = this.map.startingPositions.get(1) ?? { x: 2, y: 3 };

    this.heroX = initial?.heroX ?? startKeep.x;
    this.heroY = initial?.heroY ?? startKeep.y;
    this.lastSafeHex = { x: this.heroX, y: this.heroY };
    this.day = initial?.day ?? 1;
    this.movetype = initial?.movetype ?? 'smallfoot';
    this.maxMp = WESNOTH_MOVETYPES[this.movetype].maxMp;
    this.currentMp = this.maxMp;

    if (initial?.visitedVillages) {
      initial.visitedVillages.forEach(v => this.visitedVillages.add(v));
    }
    if (initial?.clearedEncounters) {
      initial.clearedEncounters.forEach(c => this.clearedEncounters.add(c));
    }

    this.patrols = INITIAL_OVERWORLD_PATROLS.filter(p => !this.clearedEncounters.has(p.id)).map(p => ({
      ...p,
      routeIndex: 0
    }));

    this.recomputeReachable();
    this.log(`Arrived at Valen Royal Keep (${this.heroX}, ${this.heroY}).`);
  }

  public log(msg: string) {
    this.eventLog.unshift(msg);
    if (this.eventLog.length > 24) this.eventLog.length = 24;
  }

  public getCurrentTile(): WesnothHexTile | null {
    return getHexTile(this.map, this.heroX, this.heroY);
  }

  public setMovetype(mt: WesnothMovetypeId) {
    if (this.movetype === mt) return;
    const oldMax = this.maxMp;
    this.movetype = mt;
    this.maxMp = WESNOTH_MOVETYPES[mt].maxMp;
    const ratio = oldMax > 0 ? this.currentMp / oldMax : 1;
    this.currentMp = Math.max(0, Math.min(this.maxMp, Math.round(this.maxMp * ratio)));
    this.recomputeReachable();
    this.log(`Switched march stance to ${WESNOTH_MOVETYPES[mt].name} (${this.maxMp} MP).`);
  }

  public getBlockedKeys(): Set<string> {
    // Allow stepping directly ONTO a patrol hex to initiate combat,
    // so only non-target patrols could block, or keep empty so paths directly target patrols
    return new Set();
  }

  public recomputeReachable() {
    this.reachable = computeReachableHexes(
      this.map,
      this.heroX,
      this.heroY,
      this.currentMp,
      this.movetype,
      this.getBlockedKeys()
    );
  }

  public getPathPreview(goalX: number, goalY: number): { path: HexCoord[]; cost: number; withinMp: boolean } | null {
    const inRange = this.reachable.find(r => r.x === goalX && r.y === goalY);
    if (inRange) {
      return { path: inRange.path, cost: inRange.cost, withinMp: true };
    }
    const full = findHexPath(this.map, this.heroX, this.heroY, goalX, goalY, this.movetype);
    if (!full) return null;
    return { path: full.path, cost: full.totalCost, withinMp: false };
  }

  public getTileInspectInfo(x: number, y: number): {
    tile: WesnothHexTile;
    moveCost: number;
    defensePct: number;
    patrol: ActivePatrolState | null;
    village: OverworldVillageSpec | null;
  } | null {
    const tile = getHexTile(this.map, x, y);
    if (!tile) return null;
    const moveCost = getWesnothMovementCost(tile.terrain, this.movetype);
    const defensePct = getWesnothDefensePct(tile.terrain, this.movetype);
    const patrol = this.patrols.find(p => p.x === x && p.y === y) ?? null;
    const village = OVERWORLD_VILLAGES.find(v => v.x === x && v.y === y) ?? null;
    return { tile, moveCost, defensePct, patrol, village };
  }

  /**
   * Moves the hero along a reachable Wesnoth hex path (or single adjacent step).
   */
  public moveToHex(goalX: number, goalY: number): MoveStepResult {
    if (this.pendingEncounter) {
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }
    if (goalX === this.heroX && goalY === this.heroY) {
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }

    const targetReach = this.reachable.find(r => r.x === goalX && r.y === goalY);
    if (!targetReach || targetReach.path.length < 2) {
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }

    return this.applyPathMove(targetReach.path);
  }

  /**
   * Moves 1 step in a direction (for WASD/Arrow exploration), automatically resting for next day if MP=0 and tile is adjacent.
   */
  public stepByDirection(dx: number, dy: number): MoveStepResult {
    const targetX = this.heroX + dx;
    const targetY = this.heroY + dy;
    const tile = getHexTile(this.map, targetX, targetY);
    if (!tile) {
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }
    const stepCost = getWesnothMovementCost(tile.terrain, this.movetype);
    if (stepCost >= 99) {
      this.log(`${tile.terrain.name} is impassable for ${WESNOTH_MOVETYPES[this.movetype].name}.`);
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }

    if (this.currentMp < stepCost) {
      // Auto-advance day if out of MP during keyboard exploration
      this.endDay();
    }

    const direct = findHexPath(this.map, this.heroX, this.heroY, targetX, targetY, this.movetype);
    if (!direct || direct.totalCost > this.currentMp) {
      return { moved: false, path: [], cost: 0, villageVisited: null, firstVillageVisit: false, encounter: null };
    }
    return this.applyPathMove(direct.path);
  }

  private applyPathMove(path: HexCoord[]): MoveStepResult {
    let totalCost = 0;
    let villageVisited: OverworldVillageSpec | null = null;
    let firstVillageVisit = false;
    let encounter: OverworldEncounter | null = null;
    const traversedPath: HexCoord[] = [path[0]];

    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      const tile = getHexTile(this.map, step.x, step.y);
      if (!tile) break;

      const cost = getWesnothMovementCost(tile.terrain, this.movetype);
      if (cost >= 99 || totalCost + cost > this.currentMp) break;

      if (step.x > this.heroX) this.facingEast = true;
      else if (step.x < this.heroX) this.facingEast = false;

      const prevHex = { x: this.heroX, y: this.heroY };
      this.heroX = step.x;
      this.heroY = step.y;
      totalCost += cost;
      traversedPath.push(step);

      // Check patrol collision immediately
      const patrol = this.patrols.find(p => p.x === step.x && p.y === step.y);
      if (patrol) {
        this.lastSafeHex = prevHex;
        encounter = {
          patrol,
          tile,
          reason: patrol.isBoss ? 'boss' : 'patrol'
        };
        this.pendingEncounter = encounter;
        this.log(`Encountered ${patrol.name} at (${step.x}, ${step.y})!`);
        break;
      }
      this.lastSafeHex = { x: this.heroX, y: this.heroY };

      // Check village entry
      const vil = OVERWORLD_VILLAGES.find(v => v.x === step.x && v.y === step.y);
      if (vil) {
        villageVisited = vil;
        this.ambushMeter = 0;
        if (!this.visitedVillages.has(vil.id)) {
          this.visitedVillages.add(vil.id);
          firstVillageVisit = true;
          this.log(`Liberated ${vil.name} (+${vil.rewardGold} G, squad rested).`);
        } else {
          this.log(`Rested at ${vil.name}; squad healed.`);
        }
      } else if (tile.terrain.encounterChance <= 0.03) {
        // Roads & castles are safe
        this.ambushMeter = Math.max(0, this.ambushMeter - 15);
      } else {
        this.ambushMeter += Math.round(tile.terrain.encounterChance * 100);
        if (this.ambushMeter >= 100) {
          this.ambushMeter = 0;
          const ambushSpec = this.createWildAmbushSpec(tile, step.x, step.y);
          encounter = {
            patrol: ambushSpec,
            tile,
            reason: 'ambush'
          };
          this.pendingEncounter = encounter;
          this.log(`Wild ambush in ${tile.terrain.name} (${step.x}, ${step.y})!`);
          break;
        }
      }
    }

    this.currentMp = Math.max(0, this.currentMp - totalCost);
    this.recomputeReachable();

    return {
      moved: traversedPath.length > 1,
      path: traversedPath,
      cost: totalCost,
      villageVisited,
      firstVillageVisit,
      encounter
    };
  }

  private createWildAmbushSpec(tile: WesnothHexTile, x: number, y: number): OverworldPatrolSpec {
    const isSwamp = tile.terrain.baseCategory === 'swamp_water';
    const isForest = tile.terrain.overlayCategory === 'forest';
    return {
      id: `ambush_${this.day}_${x}_${y}`,
      name: isSwamp ? 'Mire Ambushers' : isForest ? 'Shadowwood Raiders' : 'Borderland Marauders',
      subtitle: `${tile.terrain.name} Skirmish`,
      spriteAsset: isSwamp ? 'skeleton_idle' : isForest ? 'orc_archer' : 'orc_warrior',
      x,
      y,
      patrolRoute: [{ x, y }],
      isBoss: false,
      difficulty: 1,
      rewardGold: 130,
      rewardExp: 85,
      rewardJp: 45,
      enemies: isSwamp
        ? [
            { jobId: 'arcanist', level: 1, name: 'Bog Acolyte', aiRole: 'mage' },
            { jobId: 'guard', level: 1, name: 'Sunken Guard', aiRole: 'defender' }
          ]
        : [
            { jobId: 'explorador', level: 1, name: 'Wild Skirmisher', aiRole: 'melee' },
            { jobId: 'tirador', level: 1, name: 'Grove Marksman', aiRole: 'ranged' }
          ]
    };
  }

  /**
   * Ends current overworld day: restores Wesnoth MP and advances roaming patrols along their routes.
   */
  public endDay(): { encounter: OverworldEncounter | null } {
    this.day += 1;
    this.currentMp = this.maxMp;

    let encounter: OverworldEncounter | null = null;

    for (const p of this.patrols) {
      if (p.isBoss || p.patrolRoute.length <= 1) continue;
      p.routeIndex = (p.routeIndex + 1) % p.patrolRoute.length;
      const nextPos = p.patrolRoute[p.routeIndex];
      p.x = nextPos.x;
      p.y = nextPos.y;

      if (hexDistance(p.x, p.y, this.heroX, this.heroY) === 0) {
        const tile = getHexTile(this.map, this.heroX, this.heroY);
        if (tile) {
          encounter = { patrol: p, tile, reason: 'patrol' };
          this.pendingEncounter = encounter;
          this.log(`${p.name} intercepted your camp!`);
        }
      }
    }

    this.recomputeReachable();
    this.log(`Day ${this.day} begins — ${this.currentMp} MP restored.`);
    return { encounter };
  }

  public resolveEncounterVictory(patrolId: string) {
    this.pendingEncounter = null;
    this.clearedEncounters.add(patrolId);
    this.patrols = this.patrols.filter(p => p.id !== patrolId);
    this.recomputeReachable();
  }

  public dismissEncounter() {
    this.pendingEncounter = null;
    const onPatrolHex = this.patrols.some(p => p.x === this.heroX && p.y === this.heroY);
    if (onPatrolHex) {
      this.heroX = this.lastSafeHex.x;
      this.heroY = this.lastSafeHex.y;
      this.recomputeReachable();
      this.log(`Retreated safely to (${this.heroX}, ${this.heroY}).`);
    }
  }
}
