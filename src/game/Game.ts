import {
  SaveData,
  EntityData,
  MissionData,
  BattlePhase,
  Direction,
  FloatingTextEvent,
  JobId,
  TileData
} from '../types/game';
import { ABILITIES, CAMPAIGN_MISSIONS, ITEMS, JOBS, TERRAIN_RULES } from './GameConfig';
import { GridSystem, ReachableTile } from '../world/GridSystem';
import { EntityManager } from '../entities/EntityManager';
import { TurnManager } from '../combat/TurnManager';
import { CombatManager } from '../combat/CombatManager';
import { AIManager } from '../combat/AIManager';
import { SceneManager } from '../rendering/SceneManager';
import { soundManager } from '../utils/SoundManager';
import { calculateDamagePreview, DamagePreview } from '../combat/CombatFormulas';
import { loadSaveFromStorage, writeSaveToStorage, clearSaveStorage } from '../utils/SaveSystem';
import { OverworldManager, OverworldEncounter, ActivePatrolState } from '../overworld/OverworldManager';
import { OverworldSceneManager } from '../overworld/OverworldSceneManager';
import { WesnothHexTile, HexCoord } from '../overworld/WesnothMapSystem';
import { WesnothMovetypeId } from '../overworld/WesnothTerrain';
import { OverworldVillageSpec, buildEncounterMission } from '../overworld/WesnothOverworldMap';

export type GameScreen = 'menu' | 'overworld' | 'campaign_select' | 'roster' | 'battle' | 'victory' | 'defeat';

export interface ProjectedUnitMarker {
  id: string;
  name: string;
  faction: 'player' | 'enemy';
  hp: number;
  maxHp: number;
  ct: number;
  sx: number;
  sy: number;
  visible: boolean;
  isActive: boolean;
}

export interface BattleSummary {
  missionTitle: string;
  turnsElapsed: number;
  damageDealt: number;
  enemiesDefeated: number;
  rewardExp: number;
  rewardJp: number;
  rewardGold: number;
  levelUps: string[];
}

export class Game {
  public state: GameScreen = 'menu';
  public saveData: SaveData;
  public currentMission: MissionData | null = null;
  public currentMissionIndex: number = 0;
  public grid: GridSystem | null = null;
  public entityManager: EntityManager | null = null;
  public turnManager: TurnManager | null = null;
  public combatManager: CombatManager = new CombatManager();
  public aiManager: AIManager = new AIManager();
  public sceneManager: SceneManager | null = null;

  public activeUnit: EntityData | null = null;
  public cursor = { x: 0, z: 0 };
  public hoveredTile: TileData | null = null;
  public hoveredUnit: EntityData | null = null;
  public targetPreview: { target: EntityData; preview: DamagePreview } | null = null;

  public phase: BattlePhase = 'ct_tick';
  public prePausePhase: BattlePhase = 'action_hub';
  public isPaused: boolean = false;

  public hasMovedThisTurn = false;
  public hasActedThisTurn = false;
  public preMovePos: { x: number; z: number; y: number; facing: Direction } | null = null;
  public lastActionCtCost = 100;

  public reachableTiles: ReachableTile[] = [];
  public targetableTiles: TileData[] = [];
  public selectedAbilityId: string | null = null;
  public combatLog: string[] = [];
  public floatingTexts: FloatingTextEvent[] = [];

  // Battle summary counters
  public battleDamageDealt = 0;
  public battleEnemiesDefeated = 0;
  public lastSummary: BattleSummary | null = null;

  // Overworld state (Wesnoth map & movement)
  public overworldManager: OverworldManager | null = null;
  public overworldScene: OverworldSceneManager | null = null;
  public hoveredHexInfo: {
    tile: WesnothHexTile;
    moveCost: number;
    defensePct: number;
    patrol: ActivePatrolState | null;
    village: OverworldVillageSpec | null;
  } | null = null;
  public hoveredHexPath: { path: HexCoord[]; cost: number; withinMp: boolean } | null = null;
  public overworldMoving = false;
  public activeEncounterPatrolId: string | null = null;
  public returnToOverworldAfterBattle = false;

  private timers: number[] = [];
  public onStateChange: (() => void) | null = null;

  constructor() {
    this.saveData = loadSaveFromStorage();
    this.syncBodyState();
  }

  public setOnStateChange(cb: (() => void) | null) {
    this.onStateChange = cb;
  }

  private syncBodyState() {
    if (typeof document === 'undefined') return;
    if (this.state === 'menu' || this.state === 'campaign_select' || this.state === 'roster') {
      document.body.dataset.state = 'title';
    } else if (this.state === 'overworld') {
      document.body.dataset.state = this.isPaused ? 'paused' : 'playing';
    } else if (this.state === 'battle') {
      document.body.dataset.state = this.isPaused ? 'paused' : 'playing';
    } else if (this.state === 'victory' || this.state === 'defeat') {
      document.body.dataset.state = 'gameover';
    }
  }

  private notify() {
    this.syncBodyState();
    if (this.onStateChange) this.onStateChange();
  }

  private schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  public clearPendingTimers() {
    this.timers.forEach(id => clearTimeout(id));
    this.timers = [];
  }

  public setScreen(screen: GameScreen) {
    if (screen !== 'battle' && screen !== 'overworld') {
      this.clearPendingTimers();
    }
    this.state = screen;
    this.isPaused = false;
    this.notify();
  }

  public saveGame() {
    if (this.overworldManager) {
      this.saveData.overworld = {
        heroX: this.overworldManager.heroX,
        heroY: this.overworldManager.heroY,
        day: this.overworldManager.day,
        movetype: this.overworldManager.movetype,
        visitedVillages: Array.from(this.overworldManager.visitedVillages),
        clearedEncounters: Array.from(this.overworldManager.clearedEncounters)
      };
    }
    writeSaveToStorage(this.saveData);
  }

  public resetCampaignProgress() {
    this.saveData = clearSaveStorage();
    this.overworldManager = null;
    this.notify();
  }

  // ===== OVERWORLD (WESNOTH MAP & ENCOUNTERS) =====
  public startOverworld() {
    this.clearPendingTimers();
    if (!this.overworldManager) {
      this.overworldManager = new OverworldManager(this.saveData.overworld);
    }
    if (this.activeEncounterPatrolId) {
      // Returning from battle without clearing the patrol (Retreat / Defeat): step safely back off the patrol hex
      this.overworldManager.dismissEncounter();
      this.activeEncounterPatrolId = null;
    }
    this.returnToOverworldAfterBattle = false;
    this.overworldMoving = false;
    this.isPaused = false;
    this.state = 'overworld';
    const cur = this.overworldManager.getTileInspectInfo(this.overworldManager.heroX, this.overworldManager.heroY);
    this.hoveredHexInfo = cur;
    this.notify();
  }

  public initOverworldScene(container: HTMLElement) {
    if (!this.overworldManager) {
      this.overworldManager = new OverworldManager(this.saveData.overworld);
    }
    if (this.overworldScene) {
      this.overworldScene.dispose();
      this.overworldScene = null;
    }

    const mgr = this.overworldManager;
    const scene = new OverworldSceneManager(container);
    this.overworldScene = scene;
    scene.buildOverworldScene(mgr.map);
    scene.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    scene.snapCameraToHero(mgr.heroX, mgr.heroY, mgr.map);
    scene.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
    scene.setHoveredHex(mgr.heroX, mgr.heroY, mgr.map);
    scene.renderNow();

    scene.onHexHover = (x, y) => this.handleOverworldHexHover(x, y);
    scene.onHexClick = (x, y) => this.handleOverworldHexClick(x, y);

    this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
    this.notify();
  }

  public disposeOverworldScene() {
    this.clearPendingTimers();
    if (this.overworldScene) {
      this.overworldScene.dispose();
      this.overworldScene = null;
    }
  }

  public handleOverworldHexHover(x: number, y: number) {
    if (!this.overworldManager || this.isPaused || this.overworldMoving || this.overworldManager.pendingEncounter) return;
    const info = this.overworldManager.getTileInspectInfo(x, y);
    if (!info) return;
    this.hoveredHexInfo = info;
    this.hoveredHexPath = this.overworldManager.getPathPreview(x, y);
    this.overworldScene?.setHoveredHex(x, y, this.overworldManager.map);
    if (this.hoveredHexPath && this.hoveredHexPath.path.length > 1) {
      this.overworldScene?.showPathPreview(this.hoveredHexPath.path, this.overworldManager.map);
    } else {
      this.overworldScene?.showPathPreview([], this.overworldManager.map);
    }
    this.notify();
  }

  public handleOverworldHexClick(x: number, y: number) {
    if (!this.overworldManager || this.isPaused || this.overworldMoving || this.overworldManager.pendingEncounter) return;
    const res = this.overworldManager.moveToHex(x, y);
    if (!res.moved) {
      // Allow clicking on current hex if patrol shares it, or inspect
      this.handleOverworldHexHover(x, y);
      return;
    }
    this.animateOverworldStep(res.path, res.villageVisited ? res.firstVillageVisit ? res.villageVisited.rewardGold : 0 : 0, res.encounter);
  }

  public stepOverworldDirection(dx: number, dy: number) {
    if (!this.overworldManager || this.state !== 'overworld' || this.isPaused || this.overworldMoving || this.overworldManager.pendingEncounter) return;
    const res = this.overworldManager.stepByDirection(dx, dy);
    if (!res.moved) {
      this.notify();
      return;
    }
    this.animateOverworldStep(res.path, res.villageVisited && res.firstVillageVisit ? res.villageVisited.rewardGold : 0, res.encounter);
  }

  private animateOverworldStep(path: HexCoord[], bonusGold: number, encounter: OverworldEncounter | null) {
    if (!this.overworldManager) return;
    const mgr = this.overworldManager;
    this.overworldMoving = true;
    this.overworldScene?.showPathPreview([], mgr.map);

    if (bonusGold > 0) {
      this.saveData.gold += bonusGold;
    }

    let idx = 1;
    const stepVisual = () => {
      if (!this.overworldManager || this.state !== 'overworld') {
        this.overworldMoving = false;
        return;
      }
      if (idx >= path.length) {
        this.overworldMoving = false;
        this.overworldScene?.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
        this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
        this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
        if (encounter) {
          soundManager.playSlash();
        }
        this.saveGame();
        this.notify();
        return;
      }

      const node = path[idx];
      const prevNode = path[idx - 1];
      const stepEast = node.x > prevNode.x ? true : node.x < prevNode.x ? false : mgr.facingEast;
      soundManager.playClick();
      this.overworldScene?.syncHeroAndPatrols(node.x, node.y, stepEast, mgr.movetype, mgr.map, mgr.patrols);
      idx++;
      this.schedule(stepVisual, 135);
    };

    stepVisual();
  }

  public setOverworldMovetype(mt: WesnothMovetypeId) {
    if (!this.overworldManager || this.overworldMoving) return;
    soundManager.playClick();
    this.overworldManager.setMovetype(mt);
    const mgr = this.overworldManager;
    this.overworldScene?.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
    this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
    this.saveGame();
    this.notify();
  }

  public endOverworldDay() {
    if (!this.overworldManager || this.overworldMoving || this.overworldManager.pendingEncounter) return;
    soundManager.playClick();
    const { encounter } = this.overworldManager.endDay();
    const mgr = this.overworldManager;
    this.overworldScene?.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
    if (encounter) soundManager.playSlash();
    this.saveGame();
    this.notify();
  }

  public engagePendingEncounter() {
    if (!this.overworldManager?.pendingEncounter) return;
    const enc = this.overworldManager.pendingEncounter;
    const mission = buildEncounterMission(enc.patrol, enc.tile.terrain, enc.tile.x, enc.tile.y);
    this.overworldManager.pendingEncounter = null;
    this.activeEncounterPatrolId = enc.patrol.id;
    this.returnToOverworldAfterBattle = true;
    this.startCustomMission(mission, true);
  }

  public evadePendingEncounter() {
    if (!this.overworldManager) return;
    soundManager.playClick();
    this.overworldManager.dismissEncounter();
    const mgr = this.overworldManager;
    this.overworldScene?.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
    this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
    this.saveGame();
    this.notify();
  }

  // ===== BARRACKS & ARMORY ACTIONS =====
  public equipRosterItem(heroId: string, itemId: string | null, slot: 'weapon' | 'armor' | 'accessory') {
    const hero = this.saveData.roster.find(h => h.id === heroId);
    if (!hero) return;

    const em = new EntityManager();
    const prevId = hero.equipment[slot];

    if (itemId !== null) {
      const invEntry = this.saveData.inventory.find(i => i.itemId === itemId && i.count > 0);
      if (!invEntry) return;
      invEntry.count -= 1;
    }

    if (prevId) {
      const existing = this.saveData.inventory.find(i => i.itemId === prevId);
      if (existing) existing.count += 1;
      else this.saveData.inventory.push({ itemId: prevId, count: 1 });
    }

    this.saveData.inventory = this.saveData.inventory.filter(i => i.count > 0);
    em.equipItem(hero, itemId, slot);
    this.saveGame();
    this.notify();
  }

  public buyShopItem(itemId: string): boolean {
    const item = ITEMS[itemId];
    if (!item || this.saveData.gold < item.price) return false;
    this.saveData.gold -= item.price;
    const existing = this.saveData.inventory.find(i => i.itemId === itemId);
    if (existing) existing.count += 1;
    else this.saveData.inventory.push({ itemId, count: 1 });
    this.saveGame();
    this.notify();
    return true;
  }

  public changeHeroJob(heroId: string, newJobId: JobId): boolean {
    const hero = this.saveData.roster.find(h => h.id === heroId);
    if (!hero) return false;
    const em = new EntityManager();
    const ok = em.changeJob(hero, newJobId);
    if (ok) {
      this.saveGame();
      this.notify();
    }
    return ok;
  }

  public unlockHeroAbility(heroId: string, abilityId: string): boolean {
    const hero = this.saveData.roster.find(h => h.id === heroId);
    if (!hero) return false;
    const em = new EntityManager();
    const ok = em.unlockAbility(hero, abilityId);
    if (ok) {
      this.saveGame();
      this.notify();
    }
    return ok;
  }

  public toggleHeroAbility(heroId: string, abilityId: string): boolean {
    const hero = this.saveData.roster.find(h => h.id === heroId);
    if (!hero) return false;
    const em = new EntityManager();
    const ok = em.toggleEquipAbility(hero, abilityId);
    if (ok) {
      this.saveGame();
      this.notify();
    }
    return ok;
  }

  // ===== BATTLE INITIALIZATION =====
  public startMission(missionIndex: number) {
    const mission = CAMPAIGN_MISSIONS[missionIndex];
    if (!mission) return;
    this.currentMissionIndex = missionIndex;
    this.activeEncounterPatrolId = null;
    this.returnToOverworldAfterBattle = false;
    this.startCustomMission(mission, false);
  }

  public startCustomMission(mission: MissionData, fromOverworld: boolean) {
    this.clearPendingTimers();
    this.currentMission = mission;
    this.returnToOverworldAfterBattle = fromOverworld;
    this.isPaused = false;
    this.battleDamageDealt = 0;
    this.battleEnemiesDefeated = 0;
    this.lastSummary = null;
    this.floatingTexts = [];

    const protectedSpawns = [
      ...mission.playerSpawns,
      ...mission.enemies.map(e => ({ x: e.x, z: e.z }))
    ];

    this.grid = new GridSystem(
      mission.mapWidth,
      mission.mapHeight,
      mission.elevationSeed,
      mission.obstacles,
      protectedSpawns
    );
    this.entityManager = new EntityManager();

    // Spawn player roster at mission spawn points
    this.saveData.roster.forEach((hero, index) => {
      const spawn = mission.playerSpawns[index] ?? { x: 1 + index, z: 2 };
      const tile = this.grid!.getTile(spawn.x, spawn.z);
      const ent = this.entityManager!.addExistingEntity(hero);
      ent.x = spawn.x;
      ent.z = spawn.z;
      ent.y = tile ? tile.y : 0;
      ent.facing = 'east';
      this.grid!.setOccupant(ent.x, ent.z, ent.id);
    });

    // Spawn enemies
    mission.enemies.forEach((enemy, index) => {
      const id = `enemy_${index}`;
      const tile = this.grid!.getTile(enemy.x, enemy.z);
      const ent = this.entityManager!.createEntity(
        id,
        enemy.name,
        'enemy',
        enemy.jobId,
        enemy.level,
        enemy.x,
        enemy.z,
        tile ? tile.y : 0
      );
      ent.facing = enemy.facing;
      ent.aiRole = enemy.aiRole;
      this.grid!.setOccupant(enemy.x, enemy.z, id);
    });

    this.turnManager = new TurnManager(this.entityManager.getAllEntities(), true);
    this.state = 'battle';
    this.phase = 'ct_tick';
    this.combatLog = [`Mission Begun: ${mission.title} — ${mission.victoryCondition}`];

    this.advanceTurn();
    this.notify();
  }

  public initScene(container: HTMLElement) {
    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    this.sceneManager = new SceneManager(container);
    this.sceneManager.onTileClick = (x, z) => this.handleTileClick(x, z);
    this.sceneManager.onTileHover = (x, z) => this.handleTileHover(x, z);

    if (this.grid) {
      this.sceneManager.buildGridScene(this.grid);
      this.sceneManager.syncEntities(this.entityManager?.getAllEntities() || []);
    }
    this.refreshPhaseVisuals();
  }

  public disposeScene() {
    this.clearPendingTimers();
    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
  }

  // ===== TURN & PHASE MACHINE =====
  public advanceTurn() {
    if (!this.turnManager || !this.entityManager || !this.grid) return;

    if (this.checkVictoryOrDefeat()) return;

    const next = this.turnManager.nextTurn();
    if (!next) return;

    this.activeUnit = next;
    this.hasMovedThisTurn = false;
    this.hasActedThisTurn = false;
    this.lastActionCtCost = 100;
    this.selectedAbilityId = null;
    this.targetPreview = null;
    this.preMovePos = { x: next.x, z: next.z, y: next.y, facing: next.facing };
    this.cursor = { x: next.x, z: next.z };
    this.hoveredTile = this.grid.getTile(next.x, next.z) ?? null;
    this.hoveredUnit = next;

    // Start-of-turn ticks (poison, hazard terrain)
    const startLogs = this.combatManager.tickUnitStartOfTurn(next, this.grid);
    if (startLogs.length > 0) {
      startLogs.forEach(l => this.combatLog.unshift(l));
      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
      if (!next.isAlive) {
        this.turnManager.endActiveTurn(100);
        this.schedule(() => this.advanceTurn(), 500);
        this.notify();
        return;
      }
    }

    if (next.faction === 'enemy') {
      this.phase = 'enemy_turn';
      this.refreshPhaseVisuals();
      this.notify();
      this.schedule(() => this.executeAITurn(), 650);
    } else {
      this.phase = 'action_hub';
      this.computeReachableForActive();
      this.refreshPhaseVisuals();
      this.notify();
    }
  }

  private checkVictoryOrDefeat(): boolean {
    if (!this.entityManager || !this.currentMission) return false;
    const players = this.entityManager.getAllEntities().filter(e => e.faction === 'player' && e.isAlive);
    const enemies = this.entityManager.getAllEntities().filter(e => e.faction === 'enemy' && e.isAlive);

    const leaderSpec = this.currentMission.enemies.find(e => e.isLeader);
    const leaderAlive = leaderSpec
      ? enemies.some(e => e.name === leaderSpec.name && e.isAlive)
      : enemies.length > 0;

    const won =
      this.currentMission.objectiveType === 'defeat_leader'
        ? !leaderAlive || enemies.length === 0
        : enemies.length === 0;

    if (won) {
      soundManager.playVictory();
      this.phase = 'victory';
      this.state = 'victory';
      this.saveData.gold += this.currentMission.rewardGold;
      if (this.activeEncounterPatrolId && this.overworldManager) {
        this.overworldManager.resolveEncounterVictory(this.activeEncounterPatrolId);
        this.activeEncounterPatrolId = null;
      } else if (!this.saveData.completedMissions.includes(this.currentMission.id)) {
        this.saveData.completedMissions.push(this.currentMission.id);
      }

      // Persist earned EXP/JP & Level Ups back to roster
      const levelUps: string[] = [];
      const em = new EntityManager();
      for (const rosterHero of this.saveData.roster) {
        const battleEnt = this.entityManager.getEntity(rosterHero.id);
        if (battleEnt) {
          rosterHero.exp = battleEnt.exp;
          rosterHero.jp = battleEnt.jp;
          rosterHero.level = battleEnt.level;
          rosterHero.jobLevels = { ...battleEnt.jobLevels };
          rosterHero.unlockedJobs = [...battleEnt.unlockedJobs];
        }
        const res = em.awardExperience(rosterHero, this.currentMission.rewardExp, this.currentMission.rewardJp);
        if (res.leveledUp) {
          levelUps.push(`${rosterHero.name} reached Lv.${rosterHero.level}!`);
        }
      }

      this.lastSummary = {
        missionTitle: this.currentMission.title,
        turnsElapsed: this.turnManager?.totalTurnsElapsed ?? 1,
        damageDealt: this.battleDamageDealt,
        enemiesDefeated: this.battleEnemiesDefeated,
        rewardExp: this.currentMission.rewardExp,
        rewardJp: this.currentMission.rewardJp,
        rewardGold: this.currentMission.rewardGold,
        levelUps
      };

      this.saveGame();
      this.notify();
      return true;
    }

    if (players.length === 0) {
      this.phase = 'defeat';
      this.state = 'defeat';
      this.lastSummary = {
        missionTitle: this.currentMission.title,
        turnsElapsed: this.turnManager?.totalTurnsElapsed ?? 1,
        damageDealt: this.battleDamageDealt,
        enemiesDefeated: this.battleEnemiesDefeated,
        rewardExp: 0,
        rewardJp: 0,
        rewardGold: 0,
        levelUps: []
      };
      this.notify();
      return true;
    }

    return false;
  }

  private computeReachableForActive() {
    if (!this.activeUnit || !this.grid) {
      this.reachableTiles = [];
      return;
    }
    const ignoreRough = this.activeUnit.passiveEquipped === 'cliff_strider';
    this.reachableTiles = this.grid.getReachableTiles(
      this.activeUnit.x,
      this.activeUnit.z,
      this.activeUnit.stats.mov,
      this.activeUnit.stats.jmp,
      ignoreRough
    );
  }

  public refreshPhaseVisuals() {
    if (!this.sceneManager || !this.grid) return;

    const tile = this.grid.getTile(this.cursor.x, this.cursor.z);
    this.sceneManager.setCursor(this.cursor.x, this.cursor.z, tile?.y ?? 0);

    if (this.activeUnit && this.activeUnit.isAlive) {
      this.sceneManager.setActiveUnitBeacon(this.activeUnit.x, this.activeUnit.z, this.activeUnit.y, true);
      this.sceneManager.focusOnTile(this.activeUnit.x, this.activeUnit.z, this.activeUnit.y);
    } else {
      this.sceneManager.setActiveUnitBeacon(0, 0, 0, false);
    }

    if (
      this.activeUnit?.faction === 'player' &&
      (this.phase === 'move_select' || (this.phase === 'action_hub' && !this.hasMovedThisTurn))
    ) {
      const hl = this.reachableTiles
        .filter(t => !(t.x === this.activeUnit!.x && t.z === this.activeUnit!.z))
        .map(t => ({ x: t.x, z: t.z, y: t.y, color: 0x3b82f6 }));
      this.sceneManager.showHighlights(hl, 0x3b82f6);
    } else if (this.phase === 'target_select' && this.selectedAbilityId) {
      const ab = ABILITIES[this.selectedAbilityId];
      const baseColor = ab?.targetType === 'ally' || ab?.targetType === 'self' ? 0x10b981 : 0xef4444;
      const hl: { x: number; z: number; y: number; color: number }[] = this.targetableTiles.map(t => ({
        x: t.x,
        z: t.z,
        y: t.y,
        color: baseColor
      }));

      // Overlay AoE blast preview on hovered tile
      if (ab && ab.aoeRadius > 0 && this.hoveredTile && this.targetableTiles.some(t => t.x === this.hoveredTile!.x && t.z === this.hoveredTile!.z)) {
        const aoeTiles = this.grid.getAoeTiles(this.hoveredTile.x, this.hoveredTile.z, ab.aoeRadius);
        aoeTiles.forEach(at => {
          const idx = hl.findIndex(item => item.x === at.x && item.z === at.z);
          if (idx >= 0) hl[idx].color = 0xf59e0b;
          else hl.push({ x: at.x, z: at.z, y: at.y, color: 0xf59e0b });
        });
      }

      this.sceneManager.showHighlights(hl, baseColor);
    } else {
      this.sceneManager.clearHighlights();
    }
  }

  // ===== PLAYER COMMANDS =====
  public enterMoveSelect() {
    if (!this.activeUnit || this.activeUnit.faction !== 'player' || this.hasMovedThisTurn || this.isPaused) return;
    this.phase = 'move_select';
    this.computeReachableForActive();
    this.refreshPhaseVisuals();
    this.notify();
  }

  public undoMove() {
    if (!this.activeUnit || !this.preMovePos || !this.grid || !this.hasMovedThisTurn || this.hasActedThisTurn) return;
    this.grid.setOccupant(this.activeUnit.x, this.activeUnit.z, null);
    this.activeUnit.x = this.preMovePos.x;
    this.activeUnit.z = this.preMovePos.z;
    this.activeUnit.y = this.preMovePos.y;
    this.activeUnit.facing = this.preMovePos.facing;
    this.grid.setOccupant(this.activeUnit.x, this.activeUnit.z, this.activeUnit.id);

    this.hasMovedThisTurn = false;
    this.phase = 'action_hub';
    this.computeReachableForActive();
    this.sceneManager?.syncEntities(this.entityManager?.getAllEntities() || []);
    this.refreshPhaseVisuals();
    soundManager.playClick();
    this.notify();
  }

  public enterActionSelect() {
    if (!this.activeUnit || this.activeUnit.faction !== 'player' || this.hasActedThisTurn || this.isPaused) return;
    this.phase = 'action_select';
    this.refreshPhaseVisuals();
    this.notify();
  }

  public selectAbility(abilityId: string) {
    if (!this.activeUnit || !this.grid || this.hasActedThisTurn || this.isPaused) return;
    const ability = ABILITIES[abilityId];
    if (!ability) return;

    if (this.activeUnit.stats.mp < ability.mpCost) {
      this.combatLog.unshift(`Not enough MP for ${ability.name}.`);
      this.notify();
      return;
    }

    this.selectedAbilityId = abilityId;
    this.targetableTiles = this.grid.getAbilityTargetTiles(this.activeUnit.x, this.activeUnit.z, ability);

    // Self-target skills can highlight current tile immediately
    if (ability.targetType === 'self') {
      this.updateTargetPreviewAt(this.activeUnit.x, this.activeUnit.z);
    }

    this.phase = 'target_select';
    this.refreshPhaseVisuals();
    this.notify();
  }

  public cancelSubMenu() {
    if (this.isPaused) {
      this.togglePause();
      return;
    }
    if (this.phase === 'move_select' || this.phase === 'action_select' || this.phase === 'target_select') {
      this.selectedAbilityId = null;
      this.targetPreview = null;
      this.phase = 'action_hub';
      this.sceneManager?.clearPathPreview();
      this.refreshPhaseVisuals();
      this.notify();
    }
  }

  public enterFacingSelect() {
    if (!this.activeUnit || this.activeUnit.faction !== 'player' || this.isPaused) return;
    this.phase = 'facing_select';
    this.sceneManager?.clearHighlights();
    this.notify();
  }

  public confirmFacingAndEndTurn(dir: Direction) {
    if (!this.activeUnit || this.phase !== 'facing_select') return;
    this.activeUnit.facing = dir;
    this.sceneManager?.syncEntities(this.entityManager?.getAllEntities() || []);

    const ctCost = this.hasActedThisTurn
      ? this.lastActionCtCost
      : this.hasMovedThisTurn
        ? 85
        : 70; // Waiting without acting preserves CT!

    this.turnManager?.endActiveTurn(ctCost);
    this.advanceTurn();
  }

  public togglePause() {
    if (this.state !== 'battle' && this.state !== 'overworld') return;
    if (!this.isPaused) {
      this.prePausePhase = this.phase;
      this.isPaused = true;
    } else {
      this.isPaused = false;
      this.phase = this.prePausePhase;
    }
    this.notify();
  }

  // ===== TILE HOVER & CLICK =====
  public handleTileHover(x: number, z: number) {
    if (!this.grid || !this.entityManager || this.isPaused) return;
    const tile = this.grid.getTile(x, z);
    if (!tile) return;

    this.cursor = { x, z };
    this.hoveredTile = tile;
    this.hoveredUnit = this.entityManager.getEntityAt(x, z) ?? null;
    this.sceneManager?.setCursor(x, z, tile.y);

    if (
      this.activeUnit?.faction === 'player' &&
      (this.phase === 'move_select' || (this.phase === 'action_hub' && !this.hasMovedThisTurn))
    ) {
      const reach = this.reachableTiles.find(t => t.x === x && t.z === z);
      if (reach && reach.path.length > 1) {
        this.sceneManager?.showPathPreview(reach.path, this.grid);
      } else {
        this.sceneManager?.clearPathPreview();
      }
    }

    if (this.phase === 'target_select') {
      this.updateTargetPreviewAt(x, z);
      this.refreshPhaseVisuals();
    }

    this.notify();
  }

  private updateTargetPreviewAt(x: number, z: number) {
    if (!this.activeUnit || !this.selectedAbilityId || !this.entityManager || !this.grid) {
      this.targetPreview = null;
      return;
    }
    const ab = ABILITIES[this.selectedAbilityId];
    if (!ab) {
      this.targetPreview = null;
      return;
    }
    const inRange = this.targetableTiles.some(t => t.x === x && t.z === z);
    const target = this.entityManager.getEntityAt(x, z);

    if (!inRange || !target) {
      this.targetPreview = null;
      return;
    }

    const validFaction =
      (ab.targetType === 'enemy' && target.faction !== this.activeUnit.faction) ||
      (ab.targetType === 'ally' && target.faction === this.activeUnit.faction) ||
      (ab.targetType === 'self' && target.id === this.activeUnit.id) ||
      ab.targetType === 'tile';

    if (!validFaction) {
      this.targetPreview = null;
      return;
    }

    const tile = this.grid.getTile(x, z);
    const rule = tile ? TERRAIN_RULES[tile.terrain] : TERRAIN_RULES.grass;
    const preview = calculateDamagePreview(this.activeUnit, target, ab, this.activeUnit.y, target.y, rule);
    this.targetPreview = { target, preview };
  }

  public handleTileClick(x: number, z: number) {
    if (!this.grid || !this.entityManager || !this.activeUnit || this.isPaused) return;
    if (this.activeUnit.faction !== 'player') return;

    this.cursor = { x, z };
    const tile = this.grid.getTile(x, z);
    if (tile) {
      this.hoveredTile = tile;
      this.sceneManager?.setCursor(x, z, tile.y);
    }

    // Move execution
    if (this.phase === 'move_select' || (this.phase === 'action_hub' && !this.hasMovedThisTurn)) {
      const reach = this.reachableTiles.find(t => t.x === x && t.z === z);
      if (reach && !(x === this.activeUnit.x && z === this.activeUnit.z)) {
        this.executeAnimatedMove(this.activeUnit, reach.path, () => {
          this.hasMovedThisTurn = true;
          this.phase = this.hasActedThisTurn ? 'facing_select' : 'action_hub';
          this.refreshPhaseVisuals();
          this.notify();
        });
        return;
      }
    }

    // Target execution
    if (this.phase === 'target_select' && this.selectedAbilityId) {
      const validTile = this.targetableTiles.some(t => t.x === x && t.z === z);
      if (!validTile) return;

      const ability = ABILITIES[this.selectedAbilityId];
      if (!ability) return;

      // Orient attacker toward target before firing
      if (x !== this.activeUnit.x || z !== this.activeUnit.z) {
        const dx = x - this.activeUnit.x;
        const dz = z - this.activeUnit.z;
        this.activeUnit.facing =
          Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
      }

      this.phase = 'resolving';
      this.sceneManager?.clearHighlights();
      this.sceneManager?.triggerAttackLunge(this.activeUnit.id);
      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
      this.notify();

      const res = this.combatManager.executeAbility(
        this.activeUnit,
        x,
        z,
        this.selectedAbilityId,
        this.grid,
        this.entityManager
      );

      if (!res.success) {
        this.combatLog.unshift(res.message);
        this.phase = 'target_select';
        this.refreshPhaseVisuals();
        this.notify();
        return;
      }

      this.hasActedThisTurn = true;
      this.lastActionCtCost = ability.ctCost;
      this.combatLog.unshift(res.message);

      if (ability.type === 'physical') soundManager.playSlash();
      else soundManager.playSpell();

      // Award EXP & JP to active unit
      if (res.expGained > 0 || res.jpGained > 0) {
        const prog = this.entityManager.awardExperience(this.activeUnit, res.expGained, res.jpGained);
        if (prog.leveledUp) {
          this.combatLog.unshift(`${this.activeUnit.name} leveled up to Lv.${this.activeUnit.level}!`);
        }
      }

      // Visual bursts & floating damage numbers
      res.outcomes.forEach(o => {
        if (!o.isHit) {
          this.pushFloatingText(o.x, o.y, o.z, 'MISS', 'miss');
          return;
        }
        if (o.damage < 0) {
          this.pushFloatingText(o.x, o.y, o.z, `+${Math.abs(o.damage)}`, 'heal');
          this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0x34d399, false);
        } else if (o.damage > 0) {
          this.battleDamageDealt += o.damage;
          if (o.defeated) this.battleEnemiesDefeated++;
          this.pushFloatingText(
            o.x,
            o.y,
            o.z,
            o.isCrit ? `CRIT ${o.damage}!` : `-${o.damage}`,
            o.isCrit ? 'crit' : 'damage'
          );
          const color = ability.element === 'fire' ? 0xf97316 : ability.element === 'lightning' ? 0x38bdf8 : 0xfacc15;
          this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, color, o.isCrit || o.defeated);
        } else if (o.statusApplied) {
          this.pushFloatingText(o.x, o.y, o.z, o.statusApplied.toUpperCase(), 'status');
          this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0xa855f7, false);
        }
      });

      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
      this.targetPreview = null;
      this.selectedAbilityId = null;

      this.schedule(() => {
        if (this.checkVictoryOrDefeat()) return;
        this.phase = 'facing_select';
        this.notify();
      }, 520);
    }
  }

  private executeAnimatedMove(unit: EntityData, path: { x: number; z: number }[], onDone: () => void) {
    if (!this.grid || !this.entityManager) {
      onDone();
      return;
    }

    this.phase = 'moving';
    this.sceneManager?.clearHighlights();
    this.notify();

    this.grid.setOccupant(unit.x, unit.z, null);
    let stepIdx = 1;

    const stepNext = () => {
      if (stepIdx >= path.length || !this.grid || !this.entityManager) {
        this.grid?.setOccupant(unit.x, unit.z, unit.id);
        onDone();
        return;
      }

      const prevX = unit.x;
      const prevZ = unit.z;
      const next = path[stepIdx];
      const tile = this.grid.getTile(next.x, next.z);

      const dx = next.x - prevX;
      const dz = next.z - prevZ;
      if (Math.abs(dx) >= Math.abs(dz)) unit.facing = dx > 0 ? 'east' : 'west';
      else unit.facing = dz > 0 ? 'south' : 'north';

      unit.x = next.x;
      unit.z = next.z;
      unit.y = tile ? tile.y : unit.y;
      soundManager.playClick();
      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
      this.sceneManager?.focusOnTile(unit.x, unit.z, unit.y);

      stepIdx++;
      this.schedule(stepNext, 130);
    };

    stepNext();
  }

  private executeAITurn() {
    if (!this.activeUnit || !this.entityManager || !this.grid) return;

    const enemy = this.activeUnit;
    const allUnits = this.entityManager.getAllEntities();
    const plan = this.aiManager.decideTurn(enemy, allUnits, this.grid);

    const afterMove = () => {
      if (!this.grid || !this.entityManager || !this.turnManager) return;

      enemy.facing = plan.newFacing;
      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());

      if (plan.abilityId && plan.targetCoord) {
        const ab = ABILITIES[plan.abilityId];
        this.sceneManager?.triggerAttackLunge(enemy.id);

        const res = this.combatManager.executeAbility(
          enemy,
          plan.targetCoord.x,
          plan.targetCoord.z,
          plan.abilityId,
          this.grid,
          this.entityManager
        );

        if (res.success) {
          this.combatLog.unshift(res.message);
          if (ab?.type === 'physical') soundManager.playSlash();
          else soundManager.playSpell();

          res.outcomes.forEach(o => {
            if (!o.isHit) {
              this.pushFloatingText(o.x, o.y, o.z, 'MISS', 'miss');
            } else if (o.damage < 0) {
              this.pushFloatingText(o.x, o.y, o.z, `+${Math.abs(o.damage)}`, 'heal');
              this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0x34d399, false);
            } else if (o.damage > 0) {
              this.pushFloatingText(o.x, o.y, o.z, `-${o.damage}`, o.isCrit ? 'crit' : 'damage');
              this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0xef4444, o.isCrit || o.defeated);
            }
          });
        }
        this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
        this.schedule(() => {
          this.turnManager?.endActiveTurn(ab?.ctCost ?? 100);
          this.advanceTurn();
        }, 620);
      } else {
        this.combatLog.unshift(`${enemy.name} holds position.`);
        this.schedule(() => {
          this.turnManager?.endActiveTurn(80);
          this.advanceTurn();
        }, 350);
      }
    };

    if (plan.path.length > 1) {
      this.executeAnimatedMove(enemy, plan.path, afterMove);
    } else {
      afterMove();
    }
  }

  private pushFloatingText(x: number, y: number, z: number, text: string, color: FloatingTextEvent['color']) {
    const id = `${Date.now()}_${Math.random()}`;
    this.floatingTexts.push({ id, x, y, z, text, color, timestamp: Date.now() });
    this.schedule(() => {
      this.floatingTexts = this.floatingTexts.filter(ft => ft.id !== id);
      this.notify();
    }, 1150);
  }

  // ===== KEYBOARD CURSOR & SHORTCUTS =====
  public moveCursorBy(dx: number, dz: number) {
    if (!this.grid || this.state !== 'battle' || this.isPaused) return;
    const nx = Math.max(0, Math.min(this.grid.width - 1, this.cursor.x + dx));
    const nz = Math.max(0, Math.min(this.grid.height - 1, this.cursor.z + dz));
    this.handleTileHover(nx, nz);
    this.sceneManager?.focusOnTile(nx, nz, this.grid.getTile(nx, nz)?.y ?? 0);
  }

  public confirmCursorAction() {
    if (this.state !== 'battle' || this.isPaused) return;
    if (this.phase === 'facing_select') {
      this.confirmFacingAndEndTurn(this.activeUnit?.facing ?? 'south');
      return;
    }
    this.handleTileClick(this.cursor.x, this.cursor.z);
  }

  public getProjectedUnitMarkers(): ProjectedUnitMarker[] {
    if (!this.entityManager || !this.sceneManager) return [];
    const markers: ProjectedUnitMarker[] = [];
    for (const unit of this.entityManager.getAllEntities()) {
      if (!unit.isAlive) continue;
      const proj = this.sceneManager.projectWorldToScreen(unit.x, unit.y, unit.z);
      markers.push({
        id: unit.id,
        name: unit.name,
        faction: unit.faction,
        hp: unit.stats.hp,
        maxHp: unit.stats.maxHp,
        ct: unit.stats.ct,
        sx: proj.sx,
        sy: proj.sy,
        visible: proj.visible,
        isActive: this.activeUnit?.id === unit.id
      });
    }
    return markers;
  }
}

export const game = new Game();
