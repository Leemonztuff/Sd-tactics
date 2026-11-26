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
  OVERWORLD_POIS,
  OVERWORLD_VILLAGES,
  OverworldPatrolSpec,
  OverworldPoiSpec,
  OverworldQuestProgress,
  OverworldVillageSpec,
  VALEN_WESNOTH_MAP_TEXT,
  computeOverworldQuestProgress,
  getOverworldRegion
} from './WesnothOverworldMap';
import {
  WESNOTH_MOVETYPES,
  WesnothMovetypeId,
  getWesnothDefensePct,
  getWesnothMovementCost
} from './WesnothTerrain';
import {
  ActiveWorldEventNode,
  OverworldWorldEvent,
  buildWorldEventFromTemplate,
  getTileWorldEventChance,
  isTileEligibleForWorldEvent,
  pickTemplateForTile,
  spawnDailyWorldEvents
} from './OverworldEvents';

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
  poiDiscovered: OverworldPoiSpec | null;
  worldEvent: OverworldWorldEvent | null;
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
  public collectedPois: Set<string> = new Set();
  public patrols: ActivePatrolState[] = [];
  public activeWorldEvents: ActiveWorldEventNode[] = [];
  public reachable: ReachableHex[] = [];
  public pendingEncounter: OverworldEncounter | null = null;
  public pendingPoi: OverworldPoiSpec | null = null;
  public pendingWorldEvent: OverworldWorldEvent | null = null;
  public worldEventMeter: number = 0;
  public worldEventCooldown: number = 3;
  public triggeredEventHexesToday: Set<string> = new Set();
  public lastSafeHex: HexCoord;
  public eventLog: string[] = [];
  private rng: () => number;

  constructor(initial?: {
    heroX?: number;
    heroY?: number;
    day?: number;
    movetype?: WesnothMovetypeId;
    visitedVillages?: string[];
    clearedEncounters?: string[];
    collectedPois?: string[];
    activeWorldEvents?: ActiveWorldEventNode[];
    worldEventCooldown?: number;
    rng?: () => number;
  }) {
    this.rng = initial?.rng ?? Math.random;
    this.map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
    const startKeep = this.map.startingPositions.get(1) ?? { x: 2, y: 3 };

    this.heroX = initial?.heroX ?? startKeep.x;
    this.heroY = initial?.heroY ?? startKeep.y;
    this.lastSafeHex = { x: this.heroX, y: this.heroY };
    this.day = initial?.day ?? 1;
    this.movetype = initial?.movetype ?? 'smallfoot';
    this.maxMp = WESNOTH_MOVETYPES[this.movetype].maxMp;
    this.currentMp = this.maxMp;
    this.worldEventCooldown = initial?.worldEventCooldown ?? 3;

    if (initial?.visitedVillages) {
      initial.visitedVillages.forEach(v => this.visitedVillages.add(v));
    }
    if (initial?.clearedEncounters) {
      initial.clearedEncounters.forEach(c => this.clearedEncounters.add(c));
    }
    if (initial?.collectedPois) {
      initial.collectedPois.forEach(p => this.collectedPois.add(p));
    }

    this.patrols = INITIAL_OVERWORLD_PATROLS.filter(p => !this.clearedEncounters.has(p.id)).map(p => ({
      ...p,
      routeIndex: 0
    }));

    if (initial?.activeWorldEvents) {
      this.activeWorldEvents = initial.activeWorldEvents.map(ev => ({ ...ev }));
    } else {
      this.activeWorldEvents = this.buildDailyWorldEvents();
    }

    this.recomputeReachable();
    this.log(`Arrived at Valen Royal Keep (${this.heroX}, ${this.heroY}).`);
  }

  private getOccupiedEventKeys(): Set<string> {
    const keys = new Set<string>();
    OVERWORLD_VILLAGES.forEach(v => keys.add(`${v.x},${v.y}`));
    this.getActivePois().forEach(p => keys.add(`${p.x},${p.y}`));
    this.patrols.forEach(p => keys.add(`${p.x},${p.y}`));
    keys.add(`${this.heroX},${this.heroY}`);
    return keys;
  }

  private buildDailyWorldEvents(): ActiveWorldEventNode[] {
    return spawnDailyWorldEvents(
      this.map,
      this.day,
      this.getOccupiedEventKeys(),
      { x: this.heroX, y: this.heroY },
      this.rng
    );
  }

  public getQuestProgress(): OverworldQuestProgress {
    return computeOverworldQuestProgress(this.visitedVillages, this.clearedEncounters, this.patrols.length);
  }

  public getActivePois(): OverworldPoiSpec[] {
    return OVERWORLD_POIS.filter(p => !this.collectedPois.has(p.id));
  }

  public log(msg: string) {
    this.eventLog.unshift(msg);
    if (this.eventLog.length > 24) this.eventLog.length = 24;
  }

  public getCurrentTile(): WesnothHexTile | null {
    return getHexTile(this.map, this.heroX, this.heroY);
  }

  public getCurrentRegion(): string {
    const tile = this.getCurrentTile();
    if (!tile) return 'Valen Heartland';
    return getOverworldRegion(this.heroX, this.heroY, tile.terrain);
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
    regionName: string;
    moveCost: number;
    defensePct: number;
    patrol: ActivePatrolState | null;
    village: OverworldVillageSpec | null;
    poi: OverworldPoiSpec | null;
    worldEventNode: ActiveWorldEventNode | null;
  } | null {
    const tile = getHexTile(this.map, x, y);
    if (!tile) return null;
    const regionName = getOverworldRegion(x, y, tile.terrain);
    const moveCost = getWesnothMovementCost(tile.terrain, this.movetype);
    const defensePct = getWesnothDefensePct(tile.terrain, this.movetype);
    const patrol = this.patrols.find(p => p.x === x && p.y === y) ?? null;
    const village = OVERWORLD_VILLAGES.find(v => v.x === x && v.y === y) ?? null;
    const poi = OVERWORLD_POIS.find(p => p.x === x && p.y === y && !this.collectedPois.has(p.id)) ?? null;
    const worldEventNode = this.activeWorldEvents.find(e => e.x === x && e.y === y) ?? null;
    return { tile, regionName, moveCost, defensePct, patrol, village, poi, worldEventNode };
  }

  /**
   * Moves the hero along a reachable Wesnoth hex path (or single adjacent step).
   */
  public moveToHex(goalX: number, goalY: number): MoveStepResult {
    if (this.pendingEncounter || this.pendingPoi || this.pendingWorldEvent) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }
    if (goalX === this.heroX && goalY === this.heroY) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }

    const targetReach = this.reachable.find(r => r.x === goalX && r.y === goalY);
    if (!targetReach || targetReach.path.length < 2) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }

    return this.applyPathMove(targetReach.path);
  }

  /**
   * Moves 1 step in a direction (for WASD/Arrow exploration), automatically resting for next day if MP=0 and tile is adjacent.
   */
  public stepByDirection(dx: number, dy: number): MoveStepResult {
    if (this.pendingEncounter || this.pendingPoi || this.pendingWorldEvent) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }
    const targetX = this.heroX + dx;
    const targetY = this.heroY + dy;
    const tile = getHexTile(this.map, targetX, targetY);
    if (!tile) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }
    const stepCost = getWesnothMovementCost(tile.terrain, this.movetype);
    if (stepCost >= 99) {
      this.log(`${tile.terrain.name} is impassable for ${WESNOTH_MOVETYPES[this.movetype].name}.`);
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }

    if (this.currentMp < stepCost) {
      // Auto-advance day if out of MP during keyboard exploration
      this.endDay();
    }

    const direct = findHexPath(this.map, this.heroX, this.heroY, targetX, targetY, this.movetype);
    if (!direct || direct.totalCost > this.currentMp) {
      return {
        moved: false,
        path: [],
        cost: 0,
        villageVisited: null,
        firstVillageVisit: false,
        poiDiscovered: null,
        worldEvent: null,
        encounter: null
      };
    }
    return this.applyPathMove(direct.path);
  }

  private applyPathMove(path: HexCoord[]): MoveStepResult {
    let totalCost = 0;
    let villageVisited: OverworldVillageSpec | null = null;
    let firstVillageVisit = false;
    let poiDiscovered: OverworldPoiSpec | null = null;
    let worldEvent: OverworldWorldEvent | null = null;
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
      }

      // Check POI (Recruit, Wayshrine, or Supply Cache)
      const poi = OVERWORLD_POIS.find(p => p.x === step.x && p.y === step.y && !this.collectedPois.has(p.id));
      if (poi) {
        this.collectedPois.add(poi.id);
        poiDiscovered = poi;
        this.pendingPoi = poi;
        this.ambushMeter = 0;
        this.log(`Discovered ${poi.name}!`);
        break;
      }

      // Check visible spawned world event node on this hex
      const activeEvIdx = this.activeWorldEvents.findIndex(e => e.x === step.x && e.y === step.y);
      if (activeEvIdx >= 0) {
        const node = this.activeWorldEvents[activeEvIdx];
        this.activeWorldEvents.splice(activeEvIdx, 1);
        this.triggeredEventHexesToday.add(`${step.x},${step.y}`);
        worldEvent = buildWorldEventFromTemplate(node.templateId, tile, this.day, this.rng);
        this.pendingWorldEvent = worldEvent;
        this.ambushMeter = 0;
        this.worldEventMeter = 0;
        this.worldEventCooldown = 4;
        this.log(`World Event: ${worldEvent.title} at (${step.x}, ${step.y})!`);
        break;
      }

      // Check random tile-entry world event on eligible tiles
      const hexKey = `${step.x},${step.y}`;
      if (!vil && isTileEligibleForWorldEvent(tile, new Set())) {
        if (this.worldEventCooldown > 0) {
          this.worldEventCooldown -= 1;
        } else if (!this.triggeredEventHexesToday.has(hexKey)) {
          const { chance, meterGain } = getTileWorldEventChance(tile.terrain);
          this.worldEventMeter += meterGain;
          if (this.rng() < chance || this.worldEventMeter >= 100) {
            this.worldEventMeter = 0;
            this.worldEventCooldown = 4;
            this.triggeredEventHexesToday.add(hexKey);
            const tpl = pickTemplateForTile(tile, this.rng);
            worldEvent = buildWorldEventFromTemplate(tpl, tile, this.day, this.rng);
            this.pendingWorldEvent = worldEvent;
            this.ambushMeter = 0;
            this.log(`World Event: ${worldEvent.title} at (${step.x}, ${step.y})!`);
            break;
          }
        }
      }

      if (!vil) {
        if (tile.terrain.encounterChance <= 0.03) {
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
    }

    this.currentMp = Math.max(0, this.currentMp - totalCost);
    this.recomputeReachable();

    return {
      moved: traversedPath.length > 1,
      path: traversedPath,
      cost: totalCost,
      villageVisited,
      firstVillageVisit,
      poiDiscovered,
      worldEvent,
      encounter
    };
  }

  private createWildAmbushSpec(tile: WesnothHexTile, x: number, y: number): OverworldPatrolSpec {
    const isSwamp = tile.terrain.baseCategory === 'swamp_water';
    const isSnow = tile.terrain.baseCategory === 'snow';
    const isVolcanic = tile.terrain.baseCategory === 'volcanic';
    const isSand = tile.terrain.baseCategory === 'sand';
    const isForest = tile.terrain.overlayCategory === 'forest';
    const region = getOverworldRegion(x, y, tile.terrain);

    return {
      id: `ambush_${this.day}_${x}_${y}`,
      name: isSwamp
        ? 'Mire Ambushers'
        : isSnow
          ? 'Frostpeak Stalkers'
          : isVolcanic
            ? 'Caldera Zealots'
            : isSand
              ? 'Sunfire Brigands'
              : isForest
                ? 'Shadowwood Raiders'
                : 'Borderland Marauders',
      subtitle: `${region} · ${tile.terrain.name}`,
      spriteAsset: isSwamp
        ? 'skeleton_idle'
        : isVolcanic
          ? 'undead_deathknight'
          : isForest || isSand
            ? 'orc_archer'
            : 'orc_warrior',
      x,
      y,
      patrolRoute: [{ x, y }],
      isBoss: false,
      difficulty: isVolcanic || isSnow || isSand ? 2 : 1,
      rewardGold: isVolcanic ? 210 : isSnow || isSand ? 175 : 130,
      rewardExp: isVolcanic ? 140 : isSnow || isSand ? 115 : 85,
      rewardJp: isVolcanic ? 65 : isSnow || isSand ? 55 : 45,
      enemies: isSwamp
        ? [
            { jobId: 'arcanist', level: 1, name: 'Bog Acolyte', aiRole: 'mage' },
            { jobId: 'guard', level: 1, name: 'Sunken Guard', aiRole: 'defender' }
          ]
        : isVolcanic
          ? [
              { jobId: 'arcanist', level: 3, name: 'Caldera Pyromancer', aiRole: 'mage' },
              { jobId: 'duelist', level: 2, name: 'Ashen Zealot', aiRole: 'melee' }
            ]
          : isSnow || isSand
            ? [
                { jobId: 'explorador', level: 2, name: isSnow ? 'Frost Stalker' : 'Dune Raider', aiRole: 'melee' },
                { jobId: 'tirador', level: 2, name: isSnow ? 'Glacier Marksman' : 'Sand Marksman', aiRole: 'ranged' }
              ]
            : [
                { jobId: 'explorador', level: 1, name: 'Wild Skirmisher', aiRole: 'melee' },
                { jobId: 'tirador', level: 1, name: 'Grove Marksman', aiRole: 'ranged' }
              ]
    };
  }

  /**
   * Ends current overworld day: restores Wesnoth MP, rotates active world events, and advances roaming patrols.
   */
  public endDay(): { encounter: OverworldEncounter | null } {
    this.day += 1;
    this.currentMp = this.maxMp;
    this.triggeredEventHexesToday.clear();
    if (this.worldEventCooldown > 1) {
      this.worldEventCooldown = 1;
    }

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

    this.activeWorldEvents = this.buildDailyWorldEvents();
    this.recomputeReachable();
    this.log(`Day ${this.day} begins — ${this.currentMp} MP restored; new caravans & caches sighted.`);
    return { encounter };
  }

  public dismissPendingWorldEvent() {
    this.pendingWorldEvent = null;
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
