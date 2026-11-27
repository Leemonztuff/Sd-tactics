import { DungeonSaveState } from '../types/game';
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
  DUNGEON_FLOORS,
  DungeonAllySpec,
  DungeonEnemySpec,
  DungeonFloorSpec,
  DungeonSanctuarySpec,
  DungeonTrapSpec,
  DungeonTreasureSpec,
  OVERWORLD_RUINS,
  OverworldRuinSpec,
  parseDungeonFloorMap
} from './WesnothDungeonMaps';
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
import { computeDungeonVisibility } from './WesnothAutoTiler';
import { OVERWORLD_LANDMARKS, OverworldLandmarkSpec } from './WesnothIconRegistry';

export interface ActivePatrolState extends Omit<OverworldPatrolSpec, 'spriteAsset'> {
  spriteAsset: OverworldPatrolSpec['spriteAsset'] | DungeonEnemySpec['spriteAsset'];
  routeIndex: number;
  dungeonFloor?: 1 | 2 | 3 | 4;
}

export interface OverworldEncounter {
  patrol: ActivePatrolState;
  tile: WesnothHexTile;
  reason: 'patrol' | 'ambush' | 'boss';
  dungeonFloor?: 1 | 2 | 3 | 4;
}

export interface DungeonStairPrompt {
  direction: 'up' | 'down';
  targetFloor: 1 | 2 | 3 | 4 | null; // null when exiting Floor 1 back to Overworld
  blockedByWardenName?: string;
}

export interface MoveStepResult {
  moved: boolean;
  path: HexCoord[];
  cost: number;
  villageVisited: OverworldVillageSpec | null;
  firstVillageVisit: boolean;
  poiDiscovered: OverworldPoiSpec | null;
  worldEvent: OverworldWorldEvent | null;
  ruinEntered: OverworldRuinSpec | null;
  trapTriggered: DungeonTrapSpec | null;
  dungeonTreasure: DungeonTreasureSpec | null;
  dungeonAlly: DungeonAllySpec | null;
  sanctuaryVisited: DungeonSanctuarySpec | null;
  stairsReached: DungeonStairPrompt | null;
  encounter: OverworldEncounter | null;
}

export interface TileInspectInfo {
  tile: WesnothHexTile;
  regionName: string;
  moveCost: number;
  defensePct: number;
  shrouded: boolean;
  fogged: boolean;
  patrol: ActivePatrolState | null;
  village: OverworldVillageSpec | null;
  poi: OverworldPoiSpec | null;
  worldEventNode: ActiveWorldEventNode | null;
  landmark: OverworldLandmarkSpec | null;
  ruin: OverworldRuinSpec | null;
  trap: DungeonTrapSpec | null;
  treasure: DungeonTreasureSpec | null;
  ally: DungeonAllySpec | null;
  sanctuary: DungeonSanctuarySpec | null;
  stairs: 'up' | 'down' | null;
}

export class OverworldManager {
  public surfaceMap: WesnothMapData;
  public dungeonMaps: Map<1 | 2 | 3 | 4, WesnothMapData> = new Map();
  public activeZone: 'surface' | 'dungeon' = 'surface';
  public currentDungeonFloor: 1 | 2 | 3 | 4 = 1;
  public unlockedDungeonFloors: Set<number> = new Set([1]);

  public heroX: number;
  public heroY: number;
  public surfaceReturnX: number;
  public surfaceReturnY: number;
  public facingEast = true;
  public movetype: WesnothMovetypeId = 'smallfoot';
  public currentMp: number;
  public maxMp: number;
  public day: number = 1;
  public ambushMeter: number = 0;

  // Surface state
  public visitedVillages: Set<string> = new Set();
  public clearedEncounters: Set<string> = new Set();
  public collectedPois: Set<string> = new Set();
  public surfacePatrols: ActivePatrolState[] = [];
  public activeWorldEvents: ActiveWorldEventNode[] = [];
  public worldEventMeter: number = 0;
  public worldEventCooldown: number = 3;
  public triggeredEventHexesToday: Set<string> = new Set();

  // Dungeon state
  public dungeonWoundPct: number = 0;
  public exploredByFloor: Map<number, Set<string>> = new Map([
    [1, new Set()],
    [2, new Set()],
    [3, new Set()],
    [4, new Set()]
  ]);
  public visibleDungeonHexes: Set<string> = new Set();
  public resolvedTraps: Set<string> = new Set();
  public collectedDungeonTreasures: Set<string> = new Set();
  public rescuedDungeonAllies: Set<string> = new Set();
  public clearedDungeonEnemies: Set<string> = new Set();
  public visitedSanctuaries: Set<string> = new Set();
  public dungeonPatrolsByFloor: Map<number, ActivePatrolState[]> = new Map();

  // Shared active turn state
  public reachable: ReachableHex[] = [];
  public pendingEncounter: OverworldEncounter | null = null;
  public pendingPoi: OverworldPoiSpec | null = null;
  public pendingWorldEvent: OverworldWorldEvent | null = null;
  public pendingRuin: OverworldRuinSpec | null = null;
  public pendingTrap: DungeonTrapSpec | null = null;
  public pendingDungeonTreasure: DungeonTreasureSpec | null = null;
  public pendingDungeonAlly: DungeonAllySpec | null = null;
  public pendingStairs: DungeonStairPrompt | null = null;

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
    dungeon?: DungeonSaveState;
    rng?: () => number;
  }) {
    this.rng = initial?.rng ?? Math.random;
    this.surfaceMap = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
    ([1, 2, 3, 4] as const).forEach(f => {
      this.dungeonMaps.set(f, parseDungeonFloorMap(f));
    });

    const startKeep = this.surfaceMap.startingPositions.get(1) ?? { x: 2, y: 3 };
    const surfX = initial?.heroX ?? startKeep.x;
    const surfY = initial?.heroY ?? startKeep.y;
    this.surfaceReturnX = initial?.dungeon?.surfaceReturnX ?? surfX;
    this.surfaceReturnY = initial?.dungeon?.surfaceReturnY ?? surfY;

    this.day = initial?.day ?? 1;
    this.movetype = initial?.movetype ?? 'smallfoot';
    this.maxMp = WESNOTH_MOVETYPES[this.movetype].maxMp;
    this.currentMp = this.maxMp;
    this.worldEventCooldown = initial?.worldEventCooldown ?? 3;

    initial?.visitedVillages?.forEach(v => this.visitedVillages.add(v));
    initial?.clearedEncounters?.forEach(c => this.clearedEncounters.add(c));
    initial?.collectedPois?.forEach(p => this.collectedPois.add(p));

    this.surfacePatrols = INITIAL_OVERWORLD_PATROLS.filter(p => !this.clearedEncounters.has(p.id)).map(p => ({
      ...p,
      routeIndex: 0
    }));

    const dun = initial?.dungeon;
    if (dun) {
      this.activeZone = dun.activeZone;
      this.currentDungeonFloor = dun.currentFloor;
      dun.unlockedFloors.forEach(f => this.unlockedDungeonFloors.add(f));
      this.dungeonWoundPct = dun.dungeonWoundPct ?? 0;
      for (const [fKey, hexList] of Object.entries(dun.exploredByFloor ?? {})) {
        this.exploredByFloor.set(Number(fKey), new Set(hexList));
      }
      dun.resolvedTraps?.forEach(id => this.resolvedTraps.add(id));
      dun.collectedTreasures?.forEach(id => this.collectedDungeonTreasures.add(id));
      dun.rescuedAllies?.forEach(id => this.rescuedDungeonAllies.add(id));
      dun.clearedDungeonEnemies?.forEach(id => this.clearedDungeonEnemies.add(id));
      dun.visitedSanctuaries?.forEach(id => this.visitedSanctuaries.add(id));
    }

    ([1, 2, 3, 4] as const).forEach(f => {
      const floorEnemies = DUNGEON_FLOORS[f].enemies
        .filter(e => !this.clearedDungeonEnemies.has(e.id))
        .map(e => ({
          ...e,
          routeIndex: 0,
          dungeonFloor: f
        }));
      this.dungeonPatrolsByFloor.set(f, floorEnemies);
    });

    if (this.activeZone === 'dungeon' && dun) {
      this.heroX = dun.dungeonHeroX;
      this.heroY = dun.dungeonHeroY;
      this.updateDungeonVisibility();
    } else {
      this.activeZone = 'surface';
      this.heroX = surfX;
      this.heroY = surfY;
    }
    this.lastSafeHex = { x: this.heroX, y: this.heroY };

    if (initial?.activeWorldEvents) {
      this.activeWorldEvents = initial.activeWorldEvents.map(ev => ({ ...ev }));
    } else {
      this.activeWorldEvents = this.buildDailyWorldEvents();
    }

    this.recomputeReachable();
    if (this.activeZone === 'dungeon') {
      this.log(`Resumed in ${this.getCurrentFloorSpec().name} (${this.heroX}, ${this.heroY}).`);
    } else {
      this.log(`Arrived at Valen Royal Keep (${this.heroX}, ${this.heroY}).`);
    }
  }

  public get map(): WesnothMapData {
    return this.activeZone === 'dungeon'
      ? this.dungeonMaps.get(this.currentDungeonFloor)!
      : this.surfaceMap;
  }

  public get patrols(): ActivePatrolState[] {
    return this.activeZone === 'dungeon'
      ? this.dungeonPatrolsByFloor.get(this.currentDungeonFloor) ?? []
      : this.surfacePatrols;
  }

  public getCurrentFloorSpec(): DungeonFloorSpec {
    return DUNGEON_FLOORS[this.currentDungeonFloor];
  }

  public getVisionRadius(): number {
    if (this.activeZone !== 'dungeon') return 99;
    const base = this.getCurrentFloorSpec().visionRadius;
    return this.movetype === 'woodland' ? base + 1 : base;
  }

  public getCurrentExploredSet(): Set<string> {
    let set = this.exploredByFloor.get(this.currentDungeonFloor);
    if (!set) {
      set = new Set();
      this.exploredByFloor.set(this.currentDungeonFloor, set);
    }
    return set;
  }

  public isHexExplored(x: number, y: number): boolean {
    if (this.activeZone !== 'dungeon') return true;
    return this.getCurrentExploredSet().has(`${x},${y}`);
  }

  public isHexVisible(x: number, y: number): boolean {
    if (this.activeZone !== 'dungeon') return true;
    return this.visibleDungeonHexes.has(`${x},${y}`);
  }

  public hasAnyPendingPrompt(): boolean {
    return Boolean(
      this.pendingEncounter ||
        this.pendingPoi ||
        this.pendingWorldEvent ||
        this.pendingRuin ||
        this.pendingTrap ||
        this.pendingDungeonTreasure ||
        this.pendingDungeonAlly ||
        this.pendingStairs
    );
  }

  public updateDungeonVisibility() {
    if (this.activeZone !== 'dungeon') return;
    const explored = this.getCurrentExploredSet();
    const visible = computeDungeonVisibility(
      this.map,
      this.heroX,
      this.heroY,
      this.getVisionRadius(),
      explored
    );
    this.visibleDungeonHexes = visible;
    for (const key of visible) {
      explored.add(key);
    }
  }

  public getActiveDungeonTraps(): DungeonTrapSpec[] {
    if (this.activeZone !== 'dungeon') return [];
    return this.getCurrentFloorSpec().traps.filter(t => !this.resolvedTraps.has(t.id));
  }

  public getDetectedTraps(): DungeonTrapSpec[] {
    if (this.activeZone !== 'dungeon') return [];
    const detectRange = this.movetype === 'woodland' ? 3 : 2;
    return this.getActiveDungeonTraps().filter(t => {
      const dist = hexDistance(this.heroX, this.heroY, t.x, t.y);
      return dist <= detectRange && this.isHexVisible(t.x, t.y);
    });
  }

  public getAdjacentDetectedTrap(): DungeonTrapSpec | null {
    return (
      this.getDetectedTraps().find(t => hexDistance(this.heroX, this.heroY, t.x, t.y) === 1) ?? null
    );
  }

  public getActiveDungeonTreasures(): DungeonTreasureSpec[] {
    if (this.activeZone !== 'dungeon') return [];
    return this.getCurrentFloorSpec().treasures.filter(t => !this.collectedDungeonTreasures.has(t.id));
  }

  public getActiveDungeonAllies(): DungeonAllySpec[] {
    if (this.activeZone !== 'dungeon') return [];
    return this.getCurrentFloorSpec().allies.filter(a => !this.rescuedDungeonAllies.has(a.id));
  }

  public disarmTrap(trapId: string): DungeonTrapSpec | null {
    if (this.activeZone !== 'dungeon') return null;
    const trap = this.getActiveDungeonTraps().find(t => t.id === trapId);
    if (!trap) return null;
    if (hexDistance(this.heroX, this.heroY, trap.x, trap.y) > 2) return null;
    if (this.currentMp < 1) {
      this.log('Need at least 1 MP to disarm a trap!');
      return null;
    }

    this.currentMp = Math.max(0, this.currentMp - 1);
    this.resolvedTraps.add(trap.id);
    this.recomputeReachable();
    this.log(`Disarmed ${trap.name} (+${trap.disarmGold} G, +${trap.disarmJp} JP).`);
    return trap;
  }

  public enterDungeon(floor: 1 | 2 | 3 | 4 = 1, entryPoint: 'up' | 'down' = 'up') {
    const wasSurface = this.activeZone === 'surface';
    if (wasSurface) {
      this.surfaceReturnX = this.heroX;
      this.surfaceReturnY = this.heroY;
    }
    this.activeZone = 'dungeon';
    this.currentDungeonFloor = floor;
    this.unlockedDungeonFloors.add(floor);
    this.pendingRuin = null;
    this.pendingStairs = null;
    this.pendingEncounter = null;
    this.ambushMeter = 0;
    if (wasSurface) {
      this.currentMp = this.maxMp;
    }

    const spec = this.getCurrentFloorSpec();
    const spawn = entryPoint === 'down' && spec.stairsDown ? spec.stairsDown : spec.stairsUp;
    this.heroX = spawn.x;
    this.heroY = spawn.y;
    this.lastSafeHex = { x: spawn.x, y: spawn.y };
    this.updateDungeonVisibility();
    this.recomputeReachable();
    this.log(`Descended into ${spec.name}. Dark shroud blankets the halls!`);
  }

  public exitDungeonToSurface() {
    if (this.activeZone !== 'dungeon') return;
    this.activeZone = 'surface';
    this.heroX = this.surfaceReturnX;
    this.heroY = this.surfaceReturnY;
    this.lastSafeHex = { x: this.heroX, y: this.heroY };
    this.dungeonWoundPct = 0;
    this.ambushMeter = 0;
    this.pendingStairs = null;
    this.pendingTrap = null;
    this.pendingDungeonTreasure = null;
    this.pendingDungeonAlly = null;
    this.pendingEncounter = null;
    this.recomputeReachable();
    this.log(`Emerged from the sunken ruins at (${this.heroX}, ${this.heroY}).`);
  }

  public isFloorWardenCleared(floor: 1 | 2 | 3 | 4): boolean {
    const spec = DUNGEON_FLOORS[floor];
    return this.clearedDungeonEnemies.has(spec.wardenEnemyId);
  }

  public descendToNextFloor(): boolean {
    if (this.activeZone !== 'dungeon' || this.currentDungeonFloor >= 4) return false;
    const nextFloor = (this.currentDungeonFloor + 1) as 1 | 2 | 3 | 4;
    this.enterDungeon(nextFloor, 'up');
    return true;
  }

  public ascendDungeonFloor(): boolean {
    if (this.activeZone !== 'dungeon') return false;
    if (this.currentDungeonFloor === 1) {
      this.exitDungeonToSurface();
      return true;
    }
    const prevFloor = (this.currentDungeonFloor - 1) as 1 | 2 | 3 | 4;
    this.enterDungeon(prevFloor, 'down');
    return true;
  }

  private getOccupiedEventKeys(): Set<string> {
    const keys = new Set<string>();
    OVERWORLD_VILLAGES.forEach(v => keys.add(`${v.x},${v.y}`));
    OVERWORLD_LANDMARKS.forEach(l => keys.add(`${l.x},${l.y}`));
    OVERWORLD_RUINS.forEach(r => keys.add(`${r.x},${r.y}`));
    this.getActivePois().forEach(p => keys.add(`${p.x},${p.y}`));
    this.surfacePatrols.forEach(p => keys.add(`${p.x},${p.y}`));
    keys.add(`${this.heroX},${this.heroY}`);
    return keys;
  }

  private buildDailyWorldEvents(): ActiveWorldEventNode[] {
    return spawnDailyWorldEvents(
      this.surfaceMap,
      this.day,
      this.getOccupiedEventKeys(),
      { x: this.heroX, y: this.heroY },
      this.rng
    );
  }

  public getQuestProgress(): OverworldQuestProgress {
    return computeOverworldQuestProgress(
      this.visitedVillages,
      this.clearedEncounters,
      this.surfacePatrols.length
    );
  }

  public getDungeonProgress(): {
    floorsUnlocked: number;
    enemiesCleared: number;
    totalEnemies: number;
    trapsResolved: number;
    totalTraps: number;
    treasuresClaimed: number;
    totalTreasures: number;
    alliesRescued: number;
    totalAllies: number;
    bossDefeated: boolean;
  } {
    const floors = [1, 2, 3, 4] as const;
    return {
      floorsUnlocked: this.unlockedDungeonFloors.size,
      enemiesCleared: this.clearedDungeonEnemies.size,
      totalEnemies: floors.reduce((s, f) => s + DUNGEON_FLOORS[f].enemies.length, 0),
      trapsResolved: this.resolvedTraps.size,
      totalTraps: floors.reduce((s, f) => s + DUNGEON_FLOORS[f].traps.length, 0),
      treasuresClaimed: this.collectedDungeonTreasures.size,
      totalTreasures: floors.reduce((s, f) => s + DUNGEON_FLOORS[f].treasures.length, 0),
      alliesRescued: this.rescuedDungeonAllies.size,
      totalAllies: floors.reduce((s, f) => s + DUNGEON_FLOORS[f].allies.length, 0),
      bossDefeated: this.clearedDungeonEnemies.has('dun_f4_lich_boss')
    };
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
    if (this.activeZone === 'dungeon') {
      return this.getCurrentFloorSpec().name;
    }
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
    if (this.activeZone === 'dungeon') {
      this.updateDungeonVisibility();
    }
    this.recomputeReachable();
    this.log(`Switched march stance to ${WESNOTH_MOVETYPES[mt].name} (${this.maxMp} MP).`);
  }

  public getBlockedKeys(): Set<string> {
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
    if (this.activeZone === 'dungeon' && !this.isHexExplored(goalX, goalY)) {
      // Allow stepping adjacent onto visible/explored edge, block path preview into deep pitch-black shroud
      const goalTile = getHexTile(this.map, goalX, goalY);
      if (!goalTile) return null;
    }
    const inRange = this.reachable.find(r => r.x === goalX && r.y === goalY);
    if (inRange) {
      return { path: inRange.path, cost: inRange.cost, withinMp: true };
    }
    if (this.activeZone === 'dungeon' && !this.isHexExplored(goalX, goalY)) {
      return null;
    }
    const full = findHexPath(this.map, this.heroX, this.heroY, goalX, goalY, this.movetype);
    if (!full) return null;
    return { path: full.path, cost: full.totalCost, withinMp: false };
  }

  public getTileInspectInfo(x: number, y: number): TileInspectInfo | null {
    const tile = getHexTile(this.map, x, y);
    if (!tile) return null;

    if (this.activeZone === 'dungeon') {
      const explored = this.isHexExplored(x, y);
      const visible = this.isHexVisible(x, y);
      if (!explored) {
        return {
          tile,
          regionName: this.getCurrentFloorSpec().name,
          moveCost: 99,
          defensePct: 0,
          shrouded: true,
          fogged: false,
          patrol: null,
          village: null,
          poi: null,
          worldEventNode: null,
          landmark: null,
          ruin: null,
          trap: null,
          treasure: null,
          ally: null,
          sanctuary: null,
          stairs: null
        };
      }

      const floorSpec = this.getCurrentFloorSpec();
      const moveCost = getWesnothMovementCost(tile.terrain, this.movetype);
      const defensePct = getWesnothDefensePct(tile.terrain, this.movetype);
      const patrol = visible ? this.patrols.find(p => p.x === x && p.y === y) ?? null : null;
      const trap = this.getDetectedTraps().find(t => t.x === x && t.y === y) ?? null;
      const treasure = this.getActiveDungeonTreasures().find(t => t.x === x && t.y === y) ?? null;
      const ally = this.getActiveDungeonAllies().find(a => a.x === x && a.y === y) ?? null;
      const sanctuary = floorSpec.sanctuaries.find(s => s.x === x && s.y === y) ?? null;
      const stairs =
        floorSpec.stairsUp.x === x && floorSpec.stairsUp.y === y
          ? 'up'
          : floorSpec.stairsDown && floorSpec.stairsDown.x === x && floorSpec.stairsDown.y === y
            ? 'down'
            : null;

      return {
        tile,
        regionName: floorSpec.name,
        moveCost,
        defensePct,
        shrouded: false,
        fogged: !visible,
        patrol,
        village: null,
        poi: null,
        worldEventNode: null,
        landmark: null,
        ruin: null,
        trap,
        treasure,
        ally,
        sanctuary,
        stairs
      };
    }

    const regionName = getOverworldRegion(x, y, tile.terrain);
    const moveCost = getWesnothMovementCost(tile.terrain, this.movetype);
    const defensePct = getWesnothDefensePct(tile.terrain, this.movetype);
    const patrol = this.surfacePatrols.find(p => p.x === x && p.y === y) ?? null;
    const village = OVERWORLD_VILLAGES.find(v => v.x === x && v.y === y) ?? null;
    const poi = OVERWORLD_POIS.find(p => p.x === x && p.y === y && !this.collectedPois.has(p.id)) ?? null;
    const worldEventNode = this.activeWorldEvents.find(e => e.x === x && e.y === y) ?? null;
    const landmark = OVERWORLD_LANDMARKS.find(l => l.x === x && l.y === y) ?? null;
    const ruin = OVERWORLD_RUINS.find(r => r.x === x && r.y === y) ?? null;
    return {
      tile,
      regionName,
      moveCost,
      defensePct,
      shrouded: false,
      fogged: false,
      patrol,
      village,
      poi,
      worldEventNode,
      landmark,
      ruin,
      trap: null,
      treasure: null,
      ally: null,
      sanctuary: null,
      stairs: null
    };
  }

  private emptyMoveResult(): MoveStepResult {
    return {
      moved: false,
      path: [],
      cost: 0,
      villageVisited: null,
      firstVillageVisit: false,
      poiDiscovered: null,
      worldEvent: null,
      ruinEntered: null,
      trapTriggered: null,
      dungeonTreasure: null,
      dungeonAlly: null,
      sanctuaryVisited: null,
      stairsReached: null,
      encounter: null
    };
  }

  /**
   * Moves the hero along a reachable Wesnoth hex path (or single adjacent step).
   */
  public moveToHex(goalX: number, goalY: number): MoveStepResult {
    if (this.hasAnyPendingPrompt()) {
      return this.emptyMoveResult();
    }
    if (goalX === this.heroX && goalY === this.heroY) {
      return this.emptyMoveResult();
    }

    const targetReach = this.reachable.find(r => r.x === goalX && r.y === goalY);
    if (!targetReach || targetReach.path.length < 2) {
      return this.emptyMoveResult();
    }

    return this.applyPathMove(targetReach.path);
  }

  /**
   * Moves 1 step in a direction (for WASD/Arrow exploration), automatically resting for next day if MP=0 and tile is adjacent.
   */
  public stepByDirection(dx: number, dy: number): MoveStepResult {
    if (this.hasAnyPendingPrompt()) {
      return this.emptyMoveResult();
    }
    const targetX = this.heroX + dx;
    const targetY = this.heroY + dy;
    const tile = getHexTile(this.map, targetX, targetY);
    if (!tile) {
      return this.emptyMoveResult();
    }
    const stepCost = getWesnothMovementCost(tile.terrain, this.movetype);
    if (stepCost >= 99) {
      this.log(`${tile.terrain.name} is impassable for ${WESNOTH_MOVETYPES[this.movetype].name}.`);
      return this.emptyMoveResult();
    }

    if (this.currentMp < stepCost) {
      this.endDay();
    }

    const direct = findHexPath(this.map, this.heroX, this.heroY, targetX, targetY, this.movetype);
    if (!direct || direct.totalCost > this.currentMp) {
      return this.emptyMoveResult();
    }
    return this.applyPathMove(direct.path);
  }

  private applyPathMove(path: HexCoord[]): MoveStepResult {
    let totalCost = 0;
    let villageVisited: OverworldVillageSpec | null = null;
    let firstVillageVisit = false;
    let poiDiscovered: OverworldPoiSpec | null = null;
    let worldEvent: OverworldWorldEvent | null = null;
    let ruinEntered: OverworldRuinSpec | null = null;
    let trapTriggered: DungeonTrapSpec | null = null;
    let dungeonTreasure: DungeonTreasureSpec | null = null;
    let dungeonAlly: DungeonAllySpec | null = null;
    let sanctuaryVisited: DungeonSanctuarySpec | null = null;
    let stairsReached: DungeonStairPrompt | null = null;
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

      if (this.activeZone === 'dungeon') {
        this.updateDungeonVisibility();
      }

      // Check patrol/enemy collision immediately
      const patrol = this.patrols.find(p => p.x === step.x && p.y === step.y);
      if (patrol) {
        this.lastSafeHex = prevHex;
        encounter = {
          patrol,
          tile,
          reason: patrol.isBoss ? 'boss' : 'patrol',
          dungeonFloor: this.activeZone === 'dungeon' ? this.currentDungeonFloor : undefined
        };
        this.pendingEncounter = encounter;
        this.log(`Encountered ${patrol.name} at (${step.x}, ${step.y})!`);
        break;
      }
      this.lastSafeHex = { x: this.heroX, y: this.heroY };

      if (this.activeZone === 'dungeon') {
        const floorSpec = this.getCurrentFloorSpec();

        // 1. Check armed Trap on this hex
        const trap = this.getActiveDungeonTraps().find(t => t.x === step.x && t.y === step.y);
        if (trap) {
          this.resolvedTraps.add(trap.id);
          trapTriggered = trap;
          this.pendingTrap = trap;
          this.dungeonWoundPct = Math.min(50, this.dungeonWoundPct + trap.woundPct);
          totalCost = Math.min(this.currentMp, totalCost + trap.mpDrain);
          this.ambushMeter = Math.min(95, this.ambushMeter + 20);
          this.log(`Sprung ${trap.name}! -${trap.mpDrain} MP, ${this.dungeonWoundPct}% squad trap fatigue.`);
          break;
        }

        // 2. Check Dungeon Sanctuary (^Vu)
        const sanc = floorSpec.sanctuaries.find(s => s.x === step.x && s.y === step.y);
        if (sanc) {
          sanctuaryVisited = sanc;
          this.visitedSanctuaries.add(sanc.id);
          this.dungeonWoundPct = 0;
          this.ambushMeter = 0;
          this.log(`Rested at ${sanc.name}; squad wounds mended!`);
        }

        // 3. Check Dungeon Treasure
        const tres = this.getActiveDungeonTreasures().find(t => t.x === step.x && t.y === step.y);
        if (tres) {
          this.collectedDungeonTreasures.add(tres.id);
          dungeonTreasure = tres;
          this.pendingDungeonTreasure = tres;
          this.ambushMeter = 0;
          this.log(`Opened ${tres.name}!`);
          break;
        }

        // 4. Check Captive Dungeon Ally
        const ally = this.getActiveDungeonAllies().find(a => a.x === step.x && a.y === step.y);
        if (ally) {
          this.rescuedDungeonAllies.add(ally.id);
          dungeonAlly = ally;
          this.pendingDungeonAlly = ally;
          this.ambushMeter = 0;
          this.log(`Freed captive ally ${ally.name}!`);
          break;
        }

        // 5. Check Stairs Down or Stairs Up
        if (floorSpec.stairsDown && floorSpec.stairsDown.x === step.x && floorSpec.stairsDown.y === step.y) {
          const warden = floorSpec.enemies.find(e => e.id === floorSpec.wardenEnemyId);
          const wardenAlive = !this.isFloorWardenCleared(this.currentDungeonFloor);
          const nextFloor = (this.currentDungeonFloor + 1) as 1 | 2 | 3 | 4;
          if (!wardenAlive) {
            this.unlockedDungeonFloors.add(nextFloor);
          }
          stairsReached = {
            direction: 'down',
            targetFloor: nextFloor,
            blockedByWardenName: wardenAlive ? warden?.name : undefined
          };
          this.pendingStairs = stairsReached;
          this.log(`Reached stairwell descending to Level ${nextFloor}.`);
          break;
        }
        if (floorSpec.stairsUp.x === step.x && floorSpec.stairsUp.y === step.y && i === path.length - 1) {
          const targetFloor = this.currentDungeonFloor > 1 ? ((this.currentDungeonFloor - 1) as 1 | 2 | 3 | 4) : null;
          stairsReached = {
            direction: 'up',
            targetFloor
          };
          this.pendingStairs = stairsReached;
          break;
        }

        // 6. Ambient dungeon ambush pressure
        if (!sanc && tile.terrain.encounterChance > 0) {
          this.ambushMeter += Math.round(tile.terrain.encounterChance * 100 * floorSpec.ambushScale);
          if (this.ambushMeter >= 100) {
            this.ambushMeter = 0;
            const ambushSpec = this.createDungeonAmbushSpec(tile, step.x, step.y, floorSpec);
            encounter = {
              patrol: ambushSpec,
              tile,
              reason: 'ambush',
              dungeonFloor: this.currentDungeonFloor
            };
            this.pendingEncounter = encounter;
            this.log(`Dungeon ambush in ${floorSpec.name} (${step.x}, ${step.y})!`);
            break;
          }
        }
        continue;
      }

      // ===== SURFACE OVERWORLD LOGIC =====
      const vil = OVERWORLD_VILLAGES.find(v => v.x === step.x && v.y === step.y);
      if (vil) {
        villageVisited = vil;
        this.ambushMeter = 0;
        this.dungeonWoundPct = 0;
        if (!this.visitedVillages.has(vil.id)) {
          this.visitedVillages.add(vil.id);
          firstVillageVisit = true;
          this.log(`Liberated ${vil.name} (+${vil.rewardGold} G, squad rested).`);
        } else {
          this.log(`Rested at ${vil.name}; squad healed.`);
        }
      }

      // Overworld Ruins Portal (opens dungeon descent prompt)
      const ruin = OVERWORLD_RUINS.find(r => r.x === step.x && r.y === step.y);
      if (ruin) {
        ruinEntered = ruin;
        this.pendingRuin = ruin;
        this.ambushMeter = 0;
        this.log(`Reached ${ruin.name} — ancient dungeon stairways lie open.`);
        break;
      }

      const poi = OVERWORLD_POIS.find(p => p.x === step.x && p.y === step.y && !this.collectedPois.has(p.id));
      if (poi) {
        this.collectedPois.add(poi.id);
        poiDiscovered = poi;
        this.pendingPoi = poi;
        this.ambushMeter = 0;
        this.log(`Discovered ${poi.name}!`);
        break;
      }

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
      ruinEntered,
      trapTriggered,
      dungeonTreasure,
      dungeonAlly,
      sanctuaryVisited,
      stairsReached,
      encounter
    };
  }

  private createDungeonAmbushSpec(
    tile: WesnothHexTile,
    x: number,
    y: number,
    floor: DungeonFloorSpec
  ): ActivePatrolState {
    const lv = floor.floor;
    return {
      id: `dun_ambush_f${lv}_d${this.day}_${x}_${y}`,
      name:
        lv === 1
          ? 'Crypt Ambushers'
          : lv === 2
            ? 'Chasm Stalkers'
            : lv === 3
              ? 'Sanctum Wraiths'
              : 'Abyssal Dreadpack',
      subtitle: `${floor.name} · ${tile.terrain.name}`,
      spriteAsset:
        lv === 1 ? 'dun_enemy_rat' : lv === 2 ? 'dun_enemy_spider' : lv === 3 ? 'dun_enemy_deathblade' : 'dun_enemy_draug',
      x,
      y,
      patrolRoute: [{ x, y }],
      isBoss: false,
      difficulty: lv,
      rewardGold: 115 + lv * 45,
      rewardExp: 80 + lv * 35,
      rewardJp: 40 + lv * 18,
      routeIndex: 0,
      dungeonFloor: floor.floor,
      enemies: [
        { jobId: 'duelist', level: lv, name: 'Shadow Skirmisher', aiRole: 'melee' },
        { jobId: lv >= 3 ? 'arcanist' : 'tirador', level: lv, name: lv >= 3 ? 'Crypt Warlock' : 'Bone Arbalist', aiRole: lv >= 3 ? 'mage' : 'ranged' }
      ]
    };
  }

  private createWildAmbushSpec(tile: WesnothHexTile, x: number, y: number): ActivePatrolState {
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
      routeIndex: 0,
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
   * Ends current turn/day: restores Wesnoth MP, rotates active world events (on surface), and advances roaming patrols.
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
          encounter = {
            patrol: p,
            tile,
            reason: 'patrol',
            dungeonFloor: this.activeZone === 'dungeon' ? this.currentDungeonFloor : undefined
          };
          this.pendingEncounter = encounter;
          this.log(`${p.name} intercepted your camp!`);
        }
      }
    }

    if (this.activeZone === 'surface') {
      this.activeWorldEvents = this.buildDailyWorldEvents();
      this.log(`Day ${this.day} begins — ${this.currentMp} MP restored; new caravans & caches sighted.`);
    } else {
      this.log(`Torch watch ${this.day} — ${this.currentMp} MP restored in ${this.getCurrentFloorSpec().name}.`);
    }
    this.recomputeReachable();
    return { encounter };
  }

  public dismissPendingWorldEvent() {
    this.pendingWorldEvent = null;
  }

  public resolveEncounterVictory(patrolId: string) {
    this.pendingEncounter = null;
    if (this.activeZone === 'dungeon') {
      this.clearedDungeonEnemies.add(patrolId);
      const list = this.dungeonPatrolsByFloor.get(this.currentDungeonFloor) ?? [];
      this.dungeonPatrolsByFloor.set(
        this.currentDungeonFloor,
        list.filter(p => p.id !== patrolId)
      );
      const spec = this.getCurrentFloorSpec();
      if (patrolId === spec.wardenEnemyId && this.currentDungeonFloor < 4) {
        this.unlockedDungeonFloors.add(this.currentDungeonFloor + 1);
        this.log(`Defeated ${spec.name} Warden! Stairwell to Level ${this.currentDungeonFloor + 1} unlocked.`);
      }
    } else {
      this.clearedEncounters.add(patrolId);
      this.surfacePatrols = this.surfacePatrols.filter(p => p.id !== patrolId);
    }
    this.recomputeReachable();
  }

  public dismissEncounter() {
    this.pendingEncounter = null;
    const onPatrolHex = this.patrols.some(p => p.x === this.heroX && p.y === this.heroY);
    if (onPatrolHex) {
      this.heroX = this.lastSafeHex.x;
      this.heroY = this.lastSafeHex.y;
      if (this.activeZone === 'dungeon') {
        this.updateDungeonVisibility();
      }
      this.recomputeReachable();
      this.log(`Retreated safely to (${this.heroX}, ${this.heroY}).`);
    }
  }
}
