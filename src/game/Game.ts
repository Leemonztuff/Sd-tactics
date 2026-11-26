import {
  SaveData,
  EntityData,
  MissionData,
  BattlePhase,
  Direction,
  FloatingTextEvent,
  JobId,
  TileData,
  AbilityDefinition
} from '../types/game';
import { ABILITIES, CAMPAIGN_MISSIONS, ITEMS, JOBS, TERRAIN_RULES } from './GameConfig';
import { GridSystem, ReachableTile } from '../world/GridSystem';
import { EntityManager } from '../entities/EntityManager';
import { TurnManager } from '../combat/TurnManager';
import { CombatManager } from '../combat/CombatManager';
import { AIManager } from '../combat/AIManager';
import { SceneManager } from '../rendering/SceneManager';
import { SkillVfxElement } from '../rendering/BattleVfxSystem';
import { soundManager } from '../utils/SoundManager';
import { calculateDamagePreview, DamagePreview, calculateMissionStars, MissionStarEvaluation, SynergyTag } from '../combat/CombatFormulas';
import { loadSaveFromStorage, writeSaveToStorage, clearSaveStorage } from '../utils/SaveSystem';
import { OverworldManager, OverworldEncounter, ActivePatrolState } from '../overworld/OverworldManager';
import { ActiveWorldEventNode } from '../overworld/OverworldEvents';
import { OverworldSceneManager } from '../overworld/OverworldSceneManager';
import { WesnothHexTile, HexCoord } from '../overworld/WesnothMapSystem';
import { WesnothMovetypeId } from '../overworld/WesnothTerrain';
import { OverworldPoiSpec, OverworldVillageSpec, buildEncounterMission } from '../overworld/WesnothOverworldMap';
import { QUALITY_PRESETS, QualityTier, probeClientDeviceTier } from '../rendering/BrawlStyleSystem';

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

export { calculateMissionStars };
export type { MissionStarEvaluation };

export interface BattleSummary {
  missionTitle: string;
  turnsElapsed: number;
  parTurns: number;
  damageDealt: number;
  enemiesDefeated: number;
  rewardExp: number;
  rewardJp: number;
  rewardGold: number;
  bonusGold: number;
  starsEarned: 1 | 2 | 3;
  starCriteria: { victory: boolean; noFallen: boolean; withinPar: boolean };
  levelUps: string[];
  sealsRestored?: number;
  campaignComplete?: boolean;
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
  public selectedItemId: string | null = null;
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
    regionName: string;
    moveCost: number;
    defensePct: number;
    patrol: ActivePatrolState | null;
    village: OverworldVillageSpec | null;
    poi: OverworldPoiSpec | null;
    worldEventNode: ActiveWorldEventNode | null;
  } | null = null;
  public hoveredHexPath: { path: HexCoord[]; cost: number; withinMp: boolean } | null = null;
  public overworldMoving = false;
  public activeEncounterPatrolId: string | null = null;
  public returnToOverworldAfterBattle = false;

  private timers: number[] = [];
  public onStateChange: (() => void) | null = null;
  public qualityTier: QualityTier = 'balanced';

  constructor() {
    this.saveData = loadSaveFromStorage();
    this.qualityTier = this.saveData.qualityTier ?? probeClientDeviceTier(false);
    this.syncBodyState();
  }

  public setQualityTier(tier: QualityTier) {
    this.qualityTier = tier;
    this.saveData.qualityTier = tier;
    const preset = QUALITY_PRESETS[tier];
    this.overworldScene?.applyQualityPreset(preset);
    this.sceneManager?.applyQualityPreset(preset);
    this.saveGame();
    this.notify();
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
        clearedEncounters: Array.from(this.overworldManager.clearedEncounters),
        collectedPois: Array.from(this.overworldManager.collectedPois),
        activeWorldEvents: this.overworldManager.activeWorldEvents.map(e => ({ ...e })),
        worldEventCooldown: this.overworldManager.worldEventCooldown
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
    const preset = QUALITY_PRESETS[this.qualityTier];
    const scene = new OverworldSceneManager(container, preset);
    if (scene.isSoftwareGl && !this.saveData.qualityTier) {
      this.qualityTier = 'eco';
      scene.applyQualityPreset(QUALITY_PRESETS.eco);
    }
    this.overworldScene = scene;
    scene.buildOverworldScene(mgr.map);
    scene.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    scene.syncPois(mgr.getActivePois(), mgr.map);
    scene.syncWorldEvents(mgr.activeWorldEvents, mgr.map);
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
    if (
      !this.overworldManager ||
      this.isPaused ||
      this.overworldMoving ||
      this.overworldManager.pendingEncounter ||
      this.overworldManager.pendingPoi ||
      this.overworldManager.pendingWorldEvent
    ) {
      return;
    }
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
    if (
      !this.overworldManager ||
      this.isPaused ||
      this.overworldMoving ||
      this.overworldManager.pendingEncounter ||
      this.overworldManager.pendingPoi ||
      this.overworldManager.pendingWorldEvent
    ) {
      return;
    }
    const res = this.overworldManager.moveToHex(x, y);
    if (!res.moved) {
      this.handleOverworldHexHover(x, y);
      return;
    }
    this.animateOverworldStep(
      res.path,
      res.villageVisited && res.firstVillageVisit ? res.villageVisited.rewardGold : 0,
      res.encounter
    );
  }

  public stepOverworldDirection(dx: number, dy: number) {
    if (
      !this.overworldManager ||
      this.state !== 'overworld' ||
      this.isPaused ||
      this.overworldMoving ||
      this.overworldManager.pendingEncounter ||
      this.overworldManager.pendingPoi ||
      this.overworldManager.pendingWorldEvent
    ) {
      return;
    }
    const res = this.overworldManager.stepByDirection(dx, dy);
    if (!res.moved) {
      this.notify();
      return;
    }
    this.animateOverworldStep(
      res.path,
      res.villageVisited && res.firstVillageVisit ? res.villageVisited.rewardGold : 0,
      res.encounter
    );
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
        this.overworldScene?.syncPois(mgr.getActivePois(), mgr.map);
        this.overworldScene?.syncWorldEvents(mgr.activeWorldEvents, mgr.map);
        this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
        this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
        if (encounter) {
          soundManager.playSlash();
        } else if (mgr.pendingPoi || mgr.pendingWorldEvent) {
          soundManager.playSpell();
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

  public resolvePendingPoi() {
    if (!this.overworldManager?.pendingPoi) return;
    const poi = this.overworldManager.pendingPoi;
    soundManager.playClick();

    if (poi.rewardGold && poi.rewardGold > 0) {
      this.saveData.gold += poi.rewardGold;
    }
    if (poi.rewardItem) {
      const existing = this.saveData.inventory.find(i => i.itemId === poi.rewardItem!.itemId);
      if (existing) existing.count += poi.rewardItem.count;
      else this.saveData.inventory.push({ itemId: poi.rewardItem.itemId, count: poi.rewardItem.count });
    }
    const em = new EntityManager();
    if (poi.rewardJpAll && poi.rewardJpAll > 0) {
      for (const hero of this.saveData.roster) {
        em.awardExperience(hero, 0, poi.rewardJpAll);
      }
    }
    if (poi.recruit && !this.saveData.roster.some(h => h.id === poi.recruit!.heroId)) {
      const r = poi.recruit;
      const newHero = em.createEntity(r.heroId, r.name, 'player', r.jobId, r.level, 0, 0, 0);
      if (r.weaponId) em.equipItem(newHero, r.weaponId, 'weapon');
      if (r.armorId) em.equipItem(newHero, r.armorId, 'armor');
      if (r.accessoryId) em.equipItem(newHero, r.accessoryId, 'accessory');
      this.saveData.roster.push(newHero);
      const squad = this.getActiveSquadIds();
      if (squad.length < 4 && !squad.includes(newHero.id)) {
        this.saveData.activeSquadIds = [...squad, newHero.id];
      }
      this.overworldManager.log(`${newHero.name} joined the Order of the Dawn!`);
    }

    this.overworldManager.pendingPoi = null;
    this.overworldScene?.syncPois(this.overworldManager.getActivePois(), this.overworldManager.map);
    this.hoveredHexInfo = this.overworldManager.getTileInspectInfo(this.overworldManager.heroX, this.overworldManager.heroY);
    this.saveGame();
    this.notify();
  }

  public resolveWorldEventChoice(choiceId: string): boolean {
    const mgr = this.overworldManager;
    const ev = mgr?.pendingWorldEvent;
    if (!mgr || !ev) return false;

    const choice = ev.choices.find(c => c.id === choiceId);
    if (!choice) return false;
    if (choice.offer?.purchased) return false;
    if (choice.costGold && this.saveData.gold < choice.costGold) return false;
    if (choice.costMp && mgr.currentMp < choice.costMp) return false;

    soundManager.playClick();

    if (choice.costGold) {
      this.saveData.gold -= choice.costGold;
    }
    if (choice.costMp) {
      mgr.currentMp = Math.max(0, mgr.currentMp - choice.costMp);
    }
    if (choice.rewardGold) {
      this.saveData.gold += choice.rewardGold;
    }
    if (choice.rewardMp) {
      mgr.currentMp = Math.min(mgr.maxMp + 3, mgr.currentMp + choice.rewardMp);
    }
    if (choice.reduceAmbushPct) {
      mgr.ambushMeter = Math.max(0, mgr.ambushMeter - choice.reduceAmbushPct);
    }
    if (choice.rewardJpAll && choice.rewardJpAll > 0) {
      const em = new EntityManager();
      for (const hero of this.saveData.roster) {
        em.awardExperience(hero, 0, choice.rewardJpAll);
      }
    }

    const grantedItem = choice.offer
      ? { itemId: choice.offer.itemId, count: choice.offer.count }
      : choice.rewardItem;
    if (grantedItem) {
      const existing = this.saveData.inventory.find(i => i.itemId === grantedItem.itemId);
      if (existing) existing.count += grantedItem.count;
      else this.saveData.inventory.push({ itemId: grantedItem.itemId, count: grantedItem.count });
    }

    if (choice.offer) {
      choice.offer.purchased = true;
      const itemName = ITEMS[choice.offer.itemId]?.name ?? choice.offer.itemId;
      mgr.log(`Purchased ${itemName} (-${choice.offer.priceGold} G) from ${ev.title}.`);
      this.saveGame();
      this.notify();
      return true;
    }

    mgr.log(`${ev.title}: ${choice.label}.`);
    mgr.dismissPendingWorldEvent();
    mgr.recomputeReachable();
    this.overworldScene?.syncWorldEvents(mgr.activeWorldEvents, mgr.map);
    this.overworldScene?.showReachableHexes(mgr.reachable, mgr.map, mgr.patrols);
    this.hoveredHexInfo = mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
    this.saveGame();
    this.notify();
    return true;
  }

  public dismissPendingWorldEvent() {
    if (!this.overworldManager?.pendingWorldEvent) return;
    soundManager.playClick();
    this.overworldManager.dismissPendingWorldEvent();
    this.overworldManager.recomputeReachable();
    this.overworldScene?.syncWorldEvents(this.overworldManager.activeWorldEvents, this.overworldManager.map);
    this.overworldScene?.showReachableHexes(
      this.overworldManager.reachable,
      this.overworldManager.map,
      this.overworldManager.patrols
    );
    this.hoveredHexInfo = this.overworldManager.getTileInspectInfo(
      this.overworldManager.heroX,
      this.overworldManager.heroY
    );
    this.saveGame();
    this.notify();
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
    if (
      !this.overworldManager ||
      this.overworldMoving ||
      this.overworldManager.pendingEncounter ||
      this.overworldManager.pendingPoi ||
      this.overworldManager.pendingWorldEvent
    ) {
      return;
    }
    soundManager.playClick();
    const { encounter } = this.overworldManager.endDay();
    const mgr = this.overworldManager;
    this.overworldScene?.syncHeroAndPatrols(mgr.heroX, mgr.heroY, mgr.facingEast, mgr.movetype, mgr.map, mgr.patrols);
    this.overworldScene?.syncWorldEvents(mgr.activeWorldEvents, mgr.map);
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

  public getActiveSquadIds(): string[] {
    const rosterIds = new Set(this.saveData.roster.map(h => h.id));
    const configured = (this.saveData.activeSquadIds ?? []).filter(id => rosterIds.has(id));
    if (configured.length > 0) return configured.slice(0, 4);
    return this.saveData.roster.slice(0, 4).map(h => h.id);
  }

  public getDeployedSquad(): EntityData[] {
    const ids = new Set(this.getActiveSquadIds());
    return this.saveData.roster.filter(h => ids.has(h.id)).slice(0, 4);
  }

  public toggleSquadDeployment(heroId: string): boolean {
    if (!this.saveData.roster.some(h => h.id === heroId)) return false;
    const current = this.getActiveSquadIds();
    if (current.includes(heroId)) {
      if (current.length <= 1) return false;
      this.saveData.activeSquadIds = current.filter(id => id !== heroId);
    } else {
      if (current.length >= 4) return false;
      this.saveData.activeSquadIds = [...current, heroId];
    }
    this.saveGame();
    this.notify();
    return true;
  }

  public getBattleConsumables(): { itemId: string; count: number }[] {
    return this.saveData.inventory.filter(i => i.count > 0 && ITEMS[i.itemId]?.type === 'consumable');
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
    this.selectedItemId = null;
    this.selectedAbilityId = null;
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

    // Spawn active deployed squad (up to 4 heroes) at mission spawn points
    const squad = this.getDeployedSquad();
    squad.forEach((hero, index) => {
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
    const preset = QUALITY_PRESETS[this.qualityTier];
    this.sceneManager = new SceneManager(container, preset);
    if (this.sceneManager.isSoftwareGl && !this.saveData.qualityTier) {
      this.qualityTier = 'eco';
      this.sceneManager.applyQualityPreset(QUALITY_PRESETS.eco);
    }
    this.sceneManager.onTileClick = (x, z) => this.handleTileClick(x, z);
    this.sceneManager.onTileHover = (x, z) => this.handleTileHover(x, z);

    if (this.grid) {
      this.sceneManager.buildGridScene(this.grid, this.currentMission?.elevationSeed ?? 1);
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

      const fallenAllies = this.entityManager
        .getAllEntities()
        .filter(e => e.faction === 'player' && !e.isAlive).length;
      const turnsElapsed = this.turnManager?.totalTurnsElapsed ?? 1;
      const parTurns = this.currentMission.parTurns ?? 12;
      const starEval = calculateMissionStars(fallenAllies, turnsElapsed, parTurns);

      const bonusGold = Math.round(this.currentMission.rewardGold * starEval.bonusMultiplier);
      const totalGold = this.currentMission.rewardGold + bonusGold;
      const totalExp = Math.round(this.currentMission.rewardExp * (1 + starEval.bonusMultiplier));
      const totalJp = Math.round(this.currentMission.rewardJp * (1 + starEval.bonusMultiplier));

      this.saveData.gold += totalGold;
      if (this.activeEncounterPatrolId && this.overworldManager) {
        this.overworldManager.resolveEncounterVictory(this.activeEncounterPatrolId);
        this.activeEncounterPatrolId = null;
      } else if (!this.saveData.completedMissions.includes(this.currentMission.id)) {
        this.saveData.completedMissions.push(this.currentMission.id);
      }

      const prevStars = this.saveData.missionStars?.[this.currentMission.id] ?? 0;
      this.saveData.missionStars = {
        ...(this.saveData.missionStars ?? {}),
        [this.currentMission.id]: Math.max(prevStars, starEval.stars)
      };

      // Persist earned EXP/JP & Level Ups back to deployed squad
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
        const res = em.awardExperience(rosterHero, totalExp, totalJp);
        if (res.leveledUp) {
          levelUps.push(`${rosterHero.name} reached Lv.${rosterHero.level}!`);
        }
      }

      const quest = this.overworldManager?.getQuestProgress();
      const allChaptersDone = CAMPAIGN_MISSIONS.every(m => this.saveData.completedMissions.includes(m.id));

      this.lastSummary = {
        missionTitle: this.currentMission.title,
        turnsElapsed,
        parTurns,
        damageDealt: this.battleDamageDealt,
        enemiesDefeated: this.battleEnemiesDefeated,
        rewardExp: totalExp,
        rewardJp: totalJp,
        rewardGold: totalGold,
        bonusGold,
        starsEarned: starEval.stars,
        starCriteria: { victory: true, noFallen: starEval.noFallen, withinPar: starEval.withinPar },
        levelUps,
        sealsRestored: quest?.sealsRestored,
        campaignComplete: Boolean(quest?.campaignComplete || allChaptersDone)
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
        parTurns: this.currentMission.parTurns ?? 12,
        damageDealt: this.battleDamageDealt,
        enemiesDefeated: this.battleEnemiesDefeated,
        rewardExp: 0,
        rewardJp: 0,
        rewardGold: 0,
        bonusGold: 0,
        starsEarned: 1,
        starCriteria: { victory: false, noFallen: false, withinPar: false },
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
    } else if (this.phase === 'target_select' && (this.selectedAbilityId || this.selectedItemId)) {
      const ab = this.selectedAbilityId ? ABILITIES[this.selectedAbilityId] : null;
      const item = this.selectedItemId ? ITEMS[this.selectedItemId] : null;
      const isFriendly =
        ab ? ab.targetType === 'ally' || ab.targetType === 'self' : item?.consumableEffect?.targetType === 'ally';
      const aoeRadius = ab ? ab.aoeRadius : item?.consumableEffect?.aoeRadius ?? 0;
      const baseColor = isFriendly ? 0x10b981 : 0xef4444;
      const hl: { x: number; z: number; y: number; color: number }[] = this.targetableTiles.map(t => ({
        x: t.x,
        z: t.z,
        y: t.y,
        color: baseColor
      }));

      // Overlay AoE blast preview on hovered tile
      if (aoeRadius > 0 && this.hoveredTile && this.targetableTiles.some(t => t.x === this.hoveredTile!.x && t.z === this.hoveredTile!.z)) {
        const aoeTiles = this.grid.getAoeTiles(this.hoveredTile.x, this.hoveredTile.z, aoeRadius);
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

  public enterBagSelect() {
    if (!this.activeUnit || this.activeUnit.faction !== 'player' || this.hasActedThisTurn || this.isPaused) return;
    this.phase = 'bag_select';
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

    this.selectedItemId = null;
    this.selectedAbilityId = abilityId;
    this.targetableTiles = this.grid.getAbilityTargetTiles(this.activeUnit.x, this.activeUnit.z, ability);

    if (ability.targetType === 'self') {
      this.updateTargetPreviewAt(this.activeUnit.x, this.activeUnit.z);
    }

    this.phase = 'target_select';
    this.refreshPhaseVisuals();
    this.notify();
  }

  public selectConsumable(itemId: string) {
    if (!this.activeUnit || !this.grid || this.hasActedThisTurn || this.isPaused) return;
    const inv = this.saveData.inventory.find(i => i.itemId === itemId && i.count > 0);
    const item = ITEMS[itemId];
    if (!inv || !item?.consumableEffect) return;

    this.selectedAbilityId = null;
    this.selectedItemId = itemId;
    this.targetableTiles = this.combatManager.getConsumableTargetTiles(
      this.activeUnit.x,
      this.activeUnit.z,
      itemId,
      this.grid
    );
    if (item.consumableEffect.targetType === 'ally') {
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
    if (
      this.phase === 'move_select' ||
      this.phase === 'action_select' ||
      this.phase === 'bag_select' ||
      this.phase === 'target_select'
    ) {
      this.selectedAbilityId = null;
      this.selectedItemId = null;
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
    if (!this.activeUnit || (!this.selectedAbilityId && !this.selectedItemId) || !this.entityManager || !this.grid) {
      this.targetPreview = null;
      return;
    }

    const inRange = this.targetableTiles.some(t => t.x === x && t.z === z);
    const target = this.entityManager.getEntityAt(x, z);
    if (!inRange || !target) {
      this.targetPreview = null;
      return;
    }

    if (this.selectedItemId) {
      const item = ITEMS[this.selectedItemId];
      const eff = item?.consumableEffect;
      if (!eff) {
        this.targetPreview = null;
        return;
      }
      const validFaction =
        (eff.targetType === 'enemy' && target.faction !== this.activeUnit.faction) ||
        (eff.targetType === 'ally' && target.faction === this.activeUnit.faction);
      if (!validFaction) {
        this.targetPreview = null;
        return;
      }
      const isHeal = !eff.damage;
      const tile = this.grid.getTile(x, z);
      const igniteBonus = eff.damage && tile && (tile.terrain === 'grass' || tile.terrain === 'mud') ? 1.2 : 1.0;
      const estimatedDamage = eff.damage
        ? Math.round(eff.damage * igniteBonus)
        : eff.healHp ?? eff.healMp ?? 0;
      const synergies: SynergyTag[] = [];
      let synergyMultiplier = 1.0;
      if (igniteBonus > 1) {
        synergies.push({
          id: 'ignite_terrain',
          label: 'Ignite Terrain',
          bonusLabel: '+20% · Burn',
          multiplier: 1.2,
          accent: 'amber'
        });
        synergyMultiplier = 1.2;
      }
      this.targetPreview = {
        target,
        preview: {
          estimatedDamage,
          isHeal,
          hitChance: 100,
          critChance: 0,
          angle: 'front',
          heightDiff: this.activeUnit.y - target.y,
          facingBonus: 1.0,
          elevationBonus: 1.0,
          synergies,
          synergyMultiplier
        }
      };
      return;
    }

    const ab = ABILITIES[this.selectedAbilityId!];
    if (!ab) {
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
    const preview = calculateDamagePreview(this.activeUnit, target, ab, this.activeUnit.y, target.y, rule, {
      defenderTerrainType: tile?.terrain,
      allies: this.entityManager.getAllEntities()
    });
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

    // Target execution (Ability or Consumable)
    if (this.phase === 'target_select' && (this.selectedAbilityId || this.selectedItemId)) {
      const validTile = this.targetableTiles.some(t => t.x === x && t.z === z);
      if (!validTile) return;

      if (x !== this.activeUnit.x || z !== this.activeUnit.z) {
        const dx = x - this.activeUnit.x;
        const dz = z - this.activeUnit.z;
        this.activeUnit.facing =
          Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
      }

      if (this.selectedItemId) {
        const itemId = this.selectedItemId;
        const item = ITEMS[itemId];
        if (!item) return;

        this.phase = 'resolving';
        this.sceneManager?.clearHighlights();
        this.sceneManager?.triggerAttackLunge(this.activeUnit.id);
        this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
        this.notify();

        const res = this.combatManager.executeConsumable(this.activeUnit, x, z, itemId, this.grid, this.entityManager);
        if (!res.success) {
          this.combatLog.unshift(res.message);
          this.phase = 'target_select';
          this.refreshPhaseVisuals();
          this.notify();
          return;
        }

        const inv = this.saveData.inventory.find(i => i.itemId === itemId);
        if (inv) {
          inv.count -= 1;
          this.saveData.inventory = this.saveData.inventory.filter(i => i.count > 0);
        }

        this.hasActedThisTurn = true;
        this.lastActionCtCost = 85;
        this.combatLog.unshift(res.message);
        soundManager.playSpell();

        this.sceneManager?.triggerSkillCast({
          originX: this.activeUnit.x,
          originY: this.activeUnit.y,
          originZ: this.activeUnit.z,
          targetX: x,
          targetY: tile?.y ?? 0,
          targetZ: z,
          element: item.consumableEffect?.damage ? 'fire' : 'heal',
          isRanged: true,
          aoeRadius: item.consumableEffect?.aoeRadius ?? 0,
          heavy: Boolean(item.consumableEffect?.damage)
        });

        res.outcomes.forEach(o => {
          if (o.damage < 0) {
            this.pushFloatingText(o.x, o.y, o.z, `+${Math.abs(o.damage)}`, 'heal');
            this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0x34d399, false);
          } else if (o.damage > 0) {
            this.battleDamageDealt += o.damage;
            if (o.defeated) this.battleEnemiesDefeated++;
            this.pushFloatingText(o.x, o.y, o.z, `-${o.damage}`, 'damage');
            this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0xf97316, o.defeated);
          } else if (o.statusApplied) {
            this.pushFloatingText(o.x, o.y, o.z, '+35 MP', 'heal');
            this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0x38bdf8, false);
          }
        });

        this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
        this.targetPreview = null;
        this.selectedItemId = null;

        this.schedule(() => {
          if (this.checkVictoryOrDefeat()) return;
          this.phase = 'facing_select';
          this.notify();
        }, 520);
        return;
      }

      const ability = ABILITIES[this.selectedAbilityId!];
      if (!ability) return;

      this.phase = 'resolving';
      this.sceneManager?.clearHighlights();
      this.sceneManager?.triggerAttackLunge(this.activeUnit.id);
      this.sceneManager?.syncEntities(this.entityManager.getAllEntities());
      this.notify();

      const res = this.combatManager.executeAbility(
        this.activeUnit,
        x,
        z,
        this.selectedAbilityId!,
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

      // Visual bursts, 3D skill VFX, synergy chain arcs & floating damage numbers
      const vfxElement = this.resolveSkillVfxElement(ability);
      this.sceneManager?.triggerSkillCast({
        originX: this.activeUnit.x,
        originY: this.activeUnit.y,
        originZ: this.activeUnit.z,
        targetX: x,
        targetY: tile?.y ?? 0,
        targetZ: z,
        element: vfxElement,
        isRanged: ability.range > 1,
        aoeRadius: ability.aoeRadius,
        heavy: ability.aoeRadius > 0 || ability.power >= 1.4 || res.outcomes.some(o => o.isCrit || o.defeated)
      });

      res.chainArcs?.forEach(arc => {
        this.sceneManager?.spawnChainArc(arc.fromX, arc.fromY, arc.fromZ, arc.toX, arc.toY, arc.toZ, arc.colorHex);
      });

      const burstHex = this.resolveElementColor(vfxElement);
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
          this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, burstHex, o.isCrit || o.defeated);
          const leadSyn = o.synergies?.find(
            s => s.id !== 'high_ground' && s.id !== 'backstab'
          );
          if (leadSyn) {
            this.schedule(() => {
              this.pushFloatingText(o.x, o.y + 0.35, o.z, `${leadSyn.label.toUpperCase()}!`, 'status');
            }, 140);
          }
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

          const aiVfxEl = ab ? this.resolveSkillVfxElement(ab) : 'steel';
          const aiTargetTile = this.grid.getTile(plan.targetCoord.x, plan.targetCoord.z);
          this.sceneManager?.triggerSkillCast({
            originX: enemy.x,
            originY: enemy.y,
            originZ: enemy.z,
            targetX: plan.targetCoord.x,
            targetY: aiTargetTile?.y ?? 0,
            targetZ: plan.targetCoord.z,
            element: aiVfxEl,
            isRanged: (ab?.range ?? 1) > 1,
            aoeRadius: ab?.aoeRadius ?? 0,
            heavy: (ab?.aoeRadius ?? 0) > 0 || (ab?.power ?? 1) >= 1.4
          });

          res.chainArcs?.forEach(arc => {
            this.sceneManager?.spawnChainArc(arc.fromX, arc.fromY, arc.fromZ, arc.toX, arc.toY, arc.toZ, arc.colorHex);
          });

          const aiBurstHex = this.resolveElementColor(aiVfxEl);
          res.outcomes.forEach(o => {
            if (!o.isHit) {
              this.pushFloatingText(o.x, o.y, o.z, 'MISS', 'miss');
            } else if (o.damage < 0) {
              this.pushFloatingText(o.x, o.y, o.z, `+${Math.abs(o.damage)}`, 'heal');
              this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0x34d399, false);
            } else if (o.damage > 0) {
              this.pushFloatingText(o.x, o.y, o.z, `-${o.damage}`, o.isCrit ? 'crit' : 'damage');
              this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, aiBurstHex, o.isCrit || o.defeated);
            } else if (o.statusApplied) {
              this.pushFloatingText(o.x, o.y, o.z, o.statusApplied.toUpperCase(), 'status');
              this.sceneManager?.triggerHitEffect(o.targetId, o.x, o.y, o.z, 0xa855f7, false);
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

  private resolveSkillVfxElement(ability: AbilityDefinition): SkillVfxElement {
    if (ability.type === 'heal') return 'heal';
    if (ability.type === 'buff') return 'buff';
    if (ability.element) return ability.element;
    if (ability.statusEffect === 'poison') return 'venom';
    if (ability.statusEffect === 'acid') return 'acid';
    if (ability.statusEffect === 'slow' || ability.statusEffect === 'snare') return 'astral';
    return 'steel';
  }

  private resolveElementColor(el: SkillVfxElement): number {
    switch (el) {
      case 'fire':
        return 0xf97316;
      case 'lightning':
        return 0x38bdf8;
      case 'astral':
        return 0xc084fc;
      case 'solar':
        return 0xfacc15;
      case 'acid':
      case 'venom':
        return 0x84cc16;
      case 'heal':
        return 0x34d399;
      case 'buff':
        return 0x60a5fa;
      default:
        return 0xfef08a;
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
