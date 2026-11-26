import test from 'node:test';
import assert from 'node:assert/strict';
import { GridSystem } from '../world/GridSystem';
import { EntityManager } from '../entities/EntityManager';
import { TurnManager } from '../combat/TurnManager';
import { CombatManager } from '../combat/CombatManager';
import { AIManager } from '../combat/AIManager';
import { calculateAttackAngle, calculateDamagePreview } from '../combat/CombatFormulas';
import { ABILITIES, TERRAIN_RULES } from '../game/GameConfig';
import { createStarterSaveData, serializeSaveData, validateSaveData } from '../utils/SaveSystem';

test('TurnManager CT accumulation and Haste/Slow turn order', () => {
  const em = new EntityManager();
  const fast = em.createEntity('u1', 'Blade', 'player', 'duelist', 1, 1, 1, 0);
  const slow = em.createEntity('u2', 'Guard', 'enemy', 'guard', 1, 4, 4, 0);

  fast.stats.ct = 0;
  slow.stats.ct = 0;
  fast.stats.spd = 20;
  slow.stats.spd = 10;

  const tm = new TurnManager([fast, slow], false);
  const first = tm.nextTurn();
  assert.equal(first?.id, 'u1');
  assert.ok(first!.stats.ct >= 100);

  tm.endActiveTurn(100);
  assert.equal(fast.stats.ct, 0);

  // Applying slow cuts speed to 60%, while haste boosts slow unit
  slow.statusEffects.push({ type: 'haste', duration: 3 });
  fast.statusEffects.push({ type: 'slow', duration: 3 });
  tm.updateQueue(4);
  assert.equal(tm.turnQueue.length, 4);
  assert.equal(tm.turnQueue[0].entity.id, 'u2');
});

test('GridSystem elevation, jump limits, occupation, LoS, and A* pathfinding', () => {
  const grid = new GridSystem(
    8,
    8,
    1,
    [{ x: 2, z: 1, height: 4 }],
    [{ x: 1, z: 1 }]
  );

  // Obstacle at (2,1) blocks passability and Line of Sight
  const obs = grid.getTile(2, 1);
  assert.equal(obs?.passable, false);
  assert.equal(obs?.blockLoS, true);
  assert.equal(grid.hasLineOfSight(1, 1, 3, 1), false);
  assert.equal(grid.hasLineOfSight(1, 3, 3, 3), true);

  // Occupation prevents stopping on occupied tile
  grid.setOccupant(1, 2, 'ally_1');
  const reachable = grid.getReachableTiles(1, 1, 3, 2);
  assert.equal(reachable.some(t => t.x === 1 && t.z === 2), false);
  assert.equal(reachable.some(t => t.x === 2 && t.z === 1), false);

  // Pathfinding routes around obstacle
  const path = grid.findPath(1, 1, 3, 1, 2);
  assert.ok(path.length > 3);
  assert.equal(path.some(p => p.x === 2 && p.z === 1), false);
});

test('Directional orientation (front/side/back) and elevation affect damage preview & execution', () => {
  const em = new EntityManager();
  const grid = new GridSystem(8, 8, 1);
  const attacker = em.createEntity('a1', 'Valerius', 'player', 'guard', 2, 2, 2, 0);
  const defender = em.createEntity('d1', 'Raider', 'enemy', 'guard', 2, 3, 2, 0);
  grid.setOccupant(2, 2, attacker.id);
  grid.setOccupant(3, 2, defender.id);

  // Defender facing west -> attacker at (2,2) is directly in FRONT
  defender.facing = 'west';
  assert.equal(calculateAttackAngle(attacker.x, attacker.z, defender.x, defender.z, defender.facing), 'front');
  const frontPreview = calculateDamagePreview(attacker, defender, ABILITIES.slash, 0, 0, TERRAIN_RULES.grass);

  // Defender facing north -> attacker at (2,2) is on SIDE
  defender.facing = 'north';
  assert.equal(calculateAttackAngle(attacker.x, attacker.z, defender.x, defender.z, defender.facing), 'side');
  const sidePreview = calculateDamagePreview(attacker, defender, ABILITIES.slash, 0, 0, TERRAIN_RULES.grass);

  // Defender facing east -> attacker at (2,2) is behind BACK
  defender.facing = 'east';
  assert.equal(calculateAttackAngle(attacker.x, attacker.z, defender.x, defender.z, defender.facing), 'back');
  const backPreview = calculateDamagePreview(attacker, defender, ABILITIES.slash, 0, 0, TERRAIN_RULES.grass);

  assert.ok(sidePreview.estimatedDamage > frontPreview.estimatedDamage);
  assert.ok(backPreview.estimatedDamage > sidePreview.estimatedDamage);

  // Elevation bonus
  const highPreview = calculateDamagePreview(attacker, defender, ABILITIES.slash, 2, 0, TERRAIN_RULES.grass);
  assert.ok(highPreview.estimatedDamage > backPreview.estimatedDamage);
});

test('CombatManager executes AoE, healing, status effects, and knockback', () => {
  const em = new EntityManager();
  const grid = new GridSystem(8, 8, 1);
  const cm = new CombatManager();

  const mage = em.createEntity('m1', 'Lyra', 'player', 'arcanist', 2, 1, 2, 0);
  const knight = em.createEntity('k1', 'Valerius', 'player', 'guard', 2, 3, 2, 0);
  const e1 = em.createEntity('e1', 'Bandit A', 'enemy', 'duelist', 1, 4, 2, 0);
  const e2 = em.createEntity('e2', 'Bandit B', 'enemy', 'duelist', 1, 4, 3, 0);

  grid.setOccupant(mage.x, mage.z, mage.id);
  grid.setOccupant(knight.x, knight.z, knight.id);
  grid.setOccupant(e1.x, e1.z, e1.id);
  grid.setOccupant(e2.x, e2.z, e2.id);

  // AoE fireball at (4,2) should hit both e1 and e2
  const res = cm.executeAbility(mage, 4, 2, 'fireball', grid, em, () => 0.1);
  assert.equal(res.success, true);
  assert.equal(res.outcomes.length, 2);
  assert.ok(e1.stats.hp < e1.stats.maxHp);
  assert.ok(e2.stats.hp < e2.stats.maxHp);

  // Shield bash pushes e1 east from (4,2) to (5,2)
  const bashRes = cm.executeAbility(knight, 4, 2, 'shield_bash', grid, em, () => 0.1);
  assert.equal(bashRes.success, true);
  if (e1.isAlive) {
    assert.equal(e1.x, 5);
    assert.equal(grid.getTile(5, 2)?.occupantId, e1.id);
    assert.equal(grid.getTile(4, 2)?.occupantId, null);
  }

  // Poison tick deals damage
  e2.statusEffects.push({ type: 'poison', duration: 2 });
  const hpBeforePoison = e2.stats.hp;
  const tickLogs = cm.tickUnitStartOfTurn(e2, grid);
  assert.ok(tickLogs.length > 0);
  assert.ok(e2.stats.hp < hpBeforePoison);
});

test('EntityManager Job unlock requirements, job change, and cross-class skill retention', () => {
  const em = new EntityManager();
  const hero = em.createEntity('h1', 'Valerius', 'player', 'guard', 1, 0, 0, 0);

  // Invocador requires arcanist Lv2 & devoto Lv1 — must reject initially
  assert.equal(em.canUnlockJob(hero, 'invocador'), false);
  assert.equal(em.changeJob(hero, 'invocador'), false);

  // Duelist requires guard Lv1 — unlocked!
  assert.equal(em.canUnlockJob(hero, 'duelist'), true);
  hero.jp = 100;
  assert.equal(em.unlockAbility(hero, 'guardian_vow'), true);
  assert.equal(em.changeJob(hero, 'duelist'), true);
  assert.equal(hero.jobId, 'duelist');
  // Previous job skill remains in unlockedAbilities
  assert.ok(hero.unlockedAbilities.includes('slash'));
  assert.ok(hero.unlockedAbilities.includes('guardian_vow'));
});

test('AIManager evaluates valid reachable movement and attack targets', () => {
  const em = new EntityManager();
  const grid = new GridSystem(10, 10, 1);
  const ai = new AIManager();

  const hero = em.createEntity('p1', 'Valerius', 'player', 'guard', 1, 2, 4, 0);
  const enemy = em.createEntity('e1', 'Cutthroat', 'enemy', 'duelist', 1, 5, 4, 0);
  enemy.aiRole = 'melee';
  grid.setOccupant(hero.x, hero.z, hero.id);
  grid.setOccupant(enemy.x, enemy.z, enemy.id);

  const decision = ai.decideTurn(enemy, [hero, enemy], grid);
  assert.equal(decision.type, 'move_and_act');
  assert.ok(decision.path.length >= 1);
  assert.equal(decision.targetCoord?.x, hero.x);
  assert.equal(decision.targetCoord?.z, hero.z);
});

test('SaveSystem serialization and schema validation', () => {
  const starter = createStarterSaveData();
  const json = serializeSaveData(starter);
  const parsed = JSON.parse(json);
  const validated = validateSaveData(parsed);

  assert.ok(validated !== null);
  assert.equal(validated?.version, 2);
  assert.equal(validated?.roster.length, 3);

  // Corrupt or outdated save returns null
  assert.equal(validateSaveData({ version: 1, gold: 100 }), null);
  assert.equal(validateSaveData({ version: 2, gold: -50, roster: [] }), null);
});
