import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOverworldQuestProgress } from '../overworld/WesnothOverworldMap';
import { OverworldManager } from '../overworld/OverworldManager';
import { calculateMissionStars, evaluateCombatSynergies, calculateDamagePreview } from '../combat/CombatFormulas';
import { CombatManager } from '../combat/CombatManager';
import { EntityManager } from '../entities/EntityManager';
import { GridSystem } from '../world/GridSystem';
import { ABILITIES, TERRAIN_RULES } from '../game/GameConfig';
import { createStarterSaveData, serializeSaveData, validateSaveData } from '../utils/SaveSystem';

test('computeOverworldQuestProgress tracks 3-Seal campaign completion', () => {
  const initial = computeOverworldQuestProgress(new Set(), new Set(), 9);
  assert.equal(initial.sealsRestored, 0);
  assert.equal(initial.totalSeals, 3);
  assert.equal(initial.totalVillages, 9);
  assert.equal(initial.totalBounties, 4);
  assert.equal(initial.campaignComplete, false);

  const mid = computeOverworldQuestProgress(
    new Set(['vil_oakhaven', 'vil_highwatch', 'vil_pinehollow']),
    new Set(['boss_orc_bastion']),
    6
  );
  assert.equal(mid.sealsRestored, 2);
  assert.equal(mid.bountiesCleared, 1);
  assert.equal(mid.campaignComplete, false);

  const done = computeOverworldQuestProgress(
    new Set(['vil_oakhaven', 'vil_highwatch', 'vil_pinehollow']),
    new Set(['boss_frost_keep', 'boss_orc_bastion', 'boss_dune_fortress', 'boss_eclipse_citadel']),
    0
  );
  assert.equal(done.sealsRestored, 3);
  assert.equal(done.bountiesCleared, 4);
  assert.equal(done.campaignComplete, true);
});

test('OverworldManager discovers POIs and clears them from active list', () => {
  const mgr = new OverworldManager({ heroX: 6, heroY: 7, movetype: 'smallfoot' });
  const beforeCount = mgr.getActivePois().length;
  assert.equal(beforeCount, 11);

  const inspectBefore = mgr.getTileInspectInfo(7, 7);
  assert.equal(inspectBefore?.poi?.id, 'poi_ford_cache');
  assert.equal(inspectBefore?.regionName, 'Valen Heartland');

  const res = mgr.moveToHex(7, 7);
  assert.equal(res.moved, true);
  assert.equal(res.poiDiscovered?.id, 'poi_ford_cache');
  assert.equal(mgr.pendingPoi?.id, 'poi_ford_cache');
  assert.equal(mgr.collectedPois.has('poi_ford_cache'), true);
  assert.equal(mgr.getActivePois().length, beforeCount - 1);
  assert.equal(mgr.getTileInspectInfo(7, 7)?.poi, null);
});

test('calculateMissionStars computes 1-3 star mastery and bonus gold multipliers', () => {
  const threeStar = calculateMissionStars(0, 8, 10);
  assert.equal(threeStar.stars, 3);
  assert.equal(threeStar.bonusMultiplier, 0.5);
  assert.equal(threeStar.noFallen, true);
  assert.equal(threeStar.withinPar, true);

  const twoStarOverPar = calculateMissionStars(0, 14, 10);
  assert.equal(twoStarOverPar.stars, 2);
  assert.equal(twoStarOverPar.bonusMultiplier, 0.25);

  const twoStarFallen = calculateMissionStars(1, 9, 10);
  assert.equal(twoStarFallen.stars, 2);
  assert.equal(twoStarFallen.bonusMultiplier, 0.25);

  const oneStar = calculateMissionStars(2, 16, 10);
  assert.equal(oneStar.stars, 1);
  assert.equal(oneStar.bonusMultiplier, 0);
});

test('CombatManager executes Battle Bag consumables cleanly', () => {
  const em = new EntityManager();
  const grid = new GridSystem(8, 8, 1);
  const cm = new CombatManager();

  const user = em.createEntity('p1', 'Valerius', 'player', 'guard', 2, 1, 2, 0);
  const ally = em.createEntity('p2', 'Lyra', 'player', 'arcanist', 2, 2, 2, 0);
  const enemy = em.createEntity('e1', 'Orc', 'enemy', 'duelist', 1, 3, 2, 0);

  grid.setOccupant(user.x, user.z, user.id);
  grid.setOccupant(ally.x, ally.z, ally.id);
  grid.setOccupant(enemy.x, enemy.z, enemy.id);

  ally.stats.hp = 20;
  ally.stats.mp = 5;
  ally.statusEffects.push({ type: 'poison', duration: 3 });

  const healRes = cm.executeConsumable(user, ally.x, ally.z, 'healing_draught', grid, em);
  assert.equal(healRes.success, true);
  assert.equal(ally.stats.hp, Math.min(ally.stats.maxHp, 105));
  assert.equal(ally.statusEffects.some(s => s.type === 'poison'), false);

  const mpRes = cm.executeConsumable(user, ally.x, ally.z, 'aether_tonic', grid, em);
  assert.equal(mpRes.success, true);
  assert.equal(ally.stats.mp, Math.min(ally.stats.maxMp, 40));

  const hpBeforeBomb = enemy.stats.hp;
  const bombRes = cm.executeConsumable(user, enemy.x, enemy.z, 'ember_bomb', grid, em);
  assert.equal(bombRes.success, true);
  assert.ok(enemy.stats.hp < hpBeforeBomb);
});

test('CombatManager applies lightning-water conductivity and riposte/mana_ward reactions', () => {
  const em = new EntityManager();
  const grid = new GridSystem(8, 8, 1);
  const cm = new CombatManager();

  // Place two enemies on water tiles at (3,2) and (3,3)
  const mage = em.createEntity('m1', 'Lyra', 'player', 'arcanist', 2, 1, 2, 0);
  const eWater1 = em.createEntity('ew1', 'Ford Guard', 'enemy', 'guard', 1, 3, 2, 0);
  const eWater2 = em.createEntity('ew2', 'Ford Scout', 'enemy', 'explorador', 1, 3, 3, 0);
  grid.setOccupant(mage.x, mage.z, mage.id);
  grid.setOccupant(eWater1.x, eWater1.z, eWater1.id);
  grid.setOccupant(eWater2.x, eWater2.z, eWater2.id);

  // Tile (3,2) and (3,3) in seed 1 are water tiles
  assert.equal(grid.getTile(3, 2)?.terrain, 'water');
  assert.equal(grid.getTile(3, 3)?.terrain, 'water');

  const hpWater2Before = eWater2.stats.hp;
  const shockRes = cm.executeAbility(mage, 3, 2, 'lightning_bolt', grid, em, () => 0.1);
  assert.equal(shockRes.success, true);
  assert.ok(shockRes.message.includes('CONDUCTIVE'));
  assert.ok(eWater2.stats.hp < hpWater2Before, 'Conductive splash should shock adjacent unit on water');

  // Test Riposte reaction on adjacent range-1 physical attack
  const knight = em.createEntity('k1', 'Valerius', 'player', 'guard', 2, 5, 2, 0);
  const fencer = em.createEntity('f1', 'Fencer', 'enemy', 'duelist', 2, 6, 2, 0);
  fencer.reactionEquipped = 'riposte';
  grid.setOccupant(knight.x, knight.z, knight.id);
  grid.setOccupant(fencer.x, fencer.z, fencer.id);

  const knightHpBefore = knight.stats.hp;
  const slashRes = cm.executeAbility(knight, 6, 2, 'slash', grid, em, () => 0.1);
  assert.equal(slashRes.success, true);
  assert.ok(knight.stats.hp < knightHpBefore, 'Riposte should counter-poke adjacent physical attacker');
  assert.equal(fencer.statusEffects.some(s => s.type === 'evade'), true);
});

test('SaveSystem persists activeSquadIds, missionStars, and collectedPois', () => {
  const starter = createStarterSaveData();
  starter.activeSquadIds = ['hero_1', 'hero_3'];
  starter.missionStars = { mission_1: 3 };
  starter.overworld = {
    heroX: 7,
    heroY: 7,
    day: 4,
    movetype: 'mounted',
    visitedVillages: ['vil_oakhaven'],
    clearedEncounters: ['patrol_bridge_orcs'],
    collectedPois: ['poi_ford_cache'],
    activeWorldEvents: [
      {
        id: 'daily_merchant_d4_10_5',
        templateId: 'dawn_caravan_merchant',
        category: 'merchant',
        title: 'Dawn Caravan Merchant',
        subtitle: 'Traveling Caravan',
        x: 10,
        y: 5
      }
    ],
    worldEventCooldown: 2
  };

  const validated = validateSaveData(JSON.parse(serializeSaveData(starter)));
  assert.ok(validated);
  assert.deepEqual(validated?.activeSquadIds, ['hero_1', 'hero_3']);
  assert.equal(validated?.missionStars?.mission_1, 3);
  assert.deepEqual(validated?.overworld?.collectedPois, ['poi_ford_cache']);
  assert.equal(validated?.overworld?.activeWorldEvents?.length, 1);
  assert.equal(validated?.overworld?.worldEventCooldown, 2);
});

test('OverworldManager spawns daily world events and triggers events on spawned & random tile entry', () => {
  const ow = new OverworldManager({ rng: () => 0.25 });
  assert.equal(ow.activeWorldEvents.length, 3);
  assert.ok(ow.activeWorldEvents.some(e => e.category === 'merchant'));
  assert.ok(ow.activeWorldEvents.some(e => e.category === 'supply_cache'));

  // Place hero beside a spawned Traveling Merchant node and step onto it
  const merchantNode = ow.activeWorldEvents.find(e => e.category === 'merchant')!;
  const mgrSpawnTest = new OverworldManager({
    heroX: merchantNode.x - 1,
    heroY: merchantNode.y,
    movetype: 'mounted',
    activeWorldEvents: [merchantNode],
    rng: () => 0.99
  });
  const enterNodeRes = mgrSpawnTest.moveToHex(merchantNode.x, merchantNode.y);
  assert.equal(enterNodeRes.moved, true);
  assert.ok(enterNodeRes.worldEvent !== null);
  assert.equal(enterNodeRes.worldEvent?.category, 'merchant');
  assert.ok(enterNodeRes.worldEvent!.choices.length >= 3);
  assert.equal(mgrSpawnTest.pendingWorldEvent?.id, enterNodeRes.worldEvent?.id);
  assert.equal(mgrSpawnTest.activeWorldEvents.length, 0);

  // Movement is paused while a world event modal is pending until dismissed
  const blockedMove = mgrSpawnTest.stepByDirection(1, 0);
  assert.equal(blockedMove.moved, false);
  mgrSpawnTest.dismissPendingWorldEvent();
  assert.equal(mgrSpawnTest.pendingWorldEvent, null);

  // Deterministic tile-entry random roll in Frostpeak Highlands snow hex (9,2)
  const frostMgr = new OverworldManager({
    heroX: 8,
    heroY: 2,
    movetype: 'mounted',
    activeWorldEvents: [],
    worldEventCooldown: 0,
    rng: () => 0.01
  });
  const frostRes = frostMgr.moveToHex(9, 2);
  assert.equal(frostRes.moved, true);
  assert.ok(frostRes.worldEvent !== null);
  assert.equal(frostRes.worldEvent?.regionName, 'Frostpeak Highlands');
  assert.equal(frostMgr.worldEventCooldown, 4);

  // End day restores MP, clears daily hex lockout, and spawns fresh daily world events
  frostMgr.dismissPendingWorldEvent();
  frostMgr.endDay();
  assert.equal(frostMgr.day, 2);
  assert.equal(frostMgr.triggeredEventHexesToday.size, 0);
  assert.equal(frostMgr.activeWorldEvents.length, 3);
});

test('CombatFormulas & CombatManager evaluate elemental combos, terrain ignite burn, and pincer flank', () => {
  const em = new EntityManager();
  const grid = new GridSystem(8, 8, 1);
  const cm = new CombatManager();

  const mage = em.createEntity('m1', 'Lyra', 'player', 'arcanist', 2, 1, 5, 0);
  const vanguard = em.createEntity('v1', 'Valerius', 'player', 'guard', 2, 2, 4, 0);
  const target = em.createEntity('e1', 'Orc Raider', 'enemy', 'duelist', 2, 2, 5, 0);
  target.facing = 'south'; // mage at (1,5) is side, vanguard at (2,4) is adjacent for Pincer Flank
  target.stats.hp = 200;
  target.stats.maxHp = 200;

  grid.setOccupant(mage.x, mage.z, mage.id);
  grid.setOccupant(vanguard.x, vanguard.z, vanguard.id);
  grid.setOccupant(target.x, target.z, target.id);

  // 1. Thermal Blast (fireball on poisoned enemy) + Pincer Flank (vanguard adjacent) + Ignite Terrain (grass)
  target.statusEffects.push({ type: 'poison', duration: 2 });
  const tile = grid.getTile(target.x, target.z)!;
  tile.terrain = 'grass';

  const syn = evaluateCombatSynergies(mage, target, ABILITIES.fireball, 'side', 0, {
    defenderTerrainType: 'grass',
    allies: em.getAllEntities()
  });
  assert.ok(syn.tags.some(t => t.id === 'thermal_blast'));
  assert.ok(syn.tags.some(t => t.id === 'ignite_terrain'));
  assert.ok(syn.tags.some(t => t.id === 'pincer_flank'));
  assert.ok(syn.damageMultiplier > 1.7);
  assert.equal(syn.hitBonus, 10);

  const fireRes = cm.executeAbility(mage, target.x, target.z, 'fireball', grid, em, () => 0.5);
  assert.equal(fireRes.success, true);
  assert.ok((fireRes.chainArcs?.length ?? 0) >= 1, 'Pincer Flank should emit a golden link arc');
  assert.equal(fireRes.chainArcs?.[0].colorHex, 0xfacc15);
  assert.equal(target.statusEffects.some(s => s.type === 'burn'), true, 'Ignite Terrain should apply burn');

  // Burn DoT tick at start of target turn
  const hpBeforeBurn = target.stats.hp;
  const burnLogs = cm.tickUnitStartOfTurn(target, grid);
  assert.ok(burnLogs.some(l => l.includes('burn')));
  assert.ok(target.stats.hp < hpBeforeBurn);

  // 2. Corrosive Shatter (physical slash on acid enemy)
  target.statusEffects.push({ type: 'acid', duration: 2 });
  const basePreview = calculateDamagePreview(vanguard, { ...target, statusEffects: [] }, ABILITIES.slash, 0, 0, TERRAIN_RULES.grass);
  const acidPreview = calculateDamagePreview(vanguard, target, ABILITIES.slash, 0, 0, TERRAIN_RULES.grass, {
    defenderTerrainType: 'grass',
    allies: em.getAllEntities()
  });
  assert.ok(acidPreview.synergies.some(s => s.id === 'corrosive_shatter'));
  assert.ok(acidPreview.estimatedDamage > basePreview.estimatedDamage);

  // 3. Chrono Rupture (astral_flare on slowed enemy)
  target.statusEffects.push({ type: 'slow', duration: 2 });
  const chronoPreview = calculateDamagePreview(mage, target, ABILITIES.astral_flare, 0, 0, TERRAIN_RULES.grass, {
    defenderTerrainType: 'grass',
    allies: em.getAllEntities()
  });
  assert.ok(chronoPreview.synergies.some(s => s.id === 'chrono_rupture'));
});

test('BrandKit maps body dataset states and defines tokens for every job, element, and status', async () => {
  const { resolveBodyDatasetState, JOB_ACCENT, ELEMENT_STYLE, STATUS_LABEL } = await import('../ui/brand/BrandKit');
  const { JOBS } = await import('../game/GameConfig');

  assert.equal(resolveBodyDatasetState('menu', false), 'title');
  assert.equal(resolveBodyDatasetState('campaign_select', false), 'title');
  assert.equal(resolveBodyDatasetState('roster', false), 'title');
  assert.equal(resolveBodyDatasetState('overworld', false), 'playing');
  assert.equal(resolveBodyDatasetState('battle', false), 'playing');
  assert.equal(resolveBodyDatasetState('overworld', true), 'paused');
  assert.equal(resolveBodyDatasetState('battle', true), 'paused');
  assert.equal(resolveBodyDatasetState('victory', false), 'gameover');
  assert.equal(resolveBodyDatasetState('defeat', false), 'gameover');

  for (const jobId of Object.keys(JOBS)) {
    assert.ok(JOB_ACCENT[jobId as keyof typeof JOB_ACCENT], `Missing JOB_ACCENT for ${jobId}`);
  }
  for (const elem of ['steel', 'fire', 'lightning', 'solar', 'venom', 'acid', 'astral', 'heal', 'buff'] as const) {
    assert.ok(ELEMENT_STYLE[elem]?.hex, `Missing ELEMENT_STYLE for ${elem}`);
  }
  for (const st of ['poison', 'burn', 'acid', 'haste', 'slow', 'snare', 'fortify', 'aether_shield', 'evade', 'focus'] as const) {
    assert.ok(STATUS_LABEL[st]?.label, `Missing STATUS_LABEL for ${st}`);
  }
});
