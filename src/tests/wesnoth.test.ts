import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWesnothTerrain,
  getWesnothMovementCost,
  getWesnothDefensePct
} from '../overworld/WesnothTerrain';
import {
  parseWesnothMap,
  getAdjacentHexes,
  hexDistance,
  getHexTile,
  computeReachableHexes,
  findHexPath
} from '../overworld/WesnothMapSystem';
import {
  VALEN_WESNOTH_MAP_TEXT,
  OVERWORLD_VILLAGES,
  buildEncounterMission
} from '../overworld/WesnothOverworldMap';
import { OverworldManager } from '../overworld/OverworldManager';
import {
  pickWesnothBaseVariant,
  computeHexAutoTilePlan,
  computeReachableFrontierEdges
} from '../overworld/WesnothAutoTiler';

test('parseWesnothMap parses 25x20 Wesnoth .map with 5 keeps and base^overlay codes', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  assert.equal(map.width, 25);
  assert.equal(map.height, 20);
  for (let y = 0; y < map.height; y++) {
    assert.equal(map.tiles[y].length, map.width, `Row ${y} must have width ${map.width}`);
    for (let x = 0; x < map.width; x++) {
      assert.ok(map.tiles[y][x]?.terrain?.code, `Tile (${x},${y}) must have valid terrain`);
    }
  }

  assert.deepEqual(map.startingPositions.get(1), { x: 2, y: 3 });
  assert.deepEqual(map.startingPositions.get(2), { x: 19, y: 9 });
  assert.deepEqual(map.startingPositions.get(3), { x: 21, y: 2 });
  assert.deepEqual(map.startingPositions.get(4), { x: 11, y: 2 });
  assert.deepEqual(map.startingPositions.get(5), { x: 20, y: 16 });

  const keepTile = getHexTile(map, 2, 3);
  assert.equal(keepTile?.terrain.code, 'Kh');
  assert.equal(keepTile?.terrain.isKeep, true);
  assert.equal(keepTile?.startingPosition, 1);

  const bridgeTile = getHexTile(map, 9, 5);
  assert.equal(bridgeTile?.terrain.code, 'Ww^Bw|');
  assert.equal(bridgeTile?.terrain.overlayCategory, 'bridge');
  assert.equal(bridgeTile?.terrain.isWater, false);

  const magmaBridge = getHexTile(map, 16, 3);
  assert.equal(magmaBridge?.terrain.code, 'Qlf^Bw|');
  assert.equal(magmaBridge?.terrain.overlayCategory, 'bridge');
  assert.equal(magmaBridge?.terrain.isLava, false);
});

test('Wesnoth odd-q hex adjacency and cube distance match location.cpp', () => {
  // Even column (x=2, y=3): N=(2,2), NE=(3,2), SE=(3,3), S=(2,4), SW=(1,3), NW=(1,2)
  const evenAdj = getAdjacentHexes(2, 3, 20, 14);
  assert.deepEqual(evenAdj, [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 3, y: 3 },
    { x: 2, y: 4 },
    { x: 1, y: 3 },
    { x: 1, y: 2 }
  ]);

  // Odd column (x=3, y=3): N=(3,2), NE=(4,3), SE=(4,4), S=(3,4), SW=(2,4), NW=(2,3)
  const oddAdj = getAdjacentHexes(3, 3, 20, 14);
  assert.deepEqual(oddAdj, [
    { x: 3, y: 2 },
    { x: 4, y: 3 },
    { x: 4, y: 4 },
    { x: 3, y: 4 },
    { x: 2, y: 4 },
    { x: 2, y: 3 }
  ]);

  // Symmetry: every neighbor must have hexDistance === 1
  for (const n of evenAdj) {
    assert.equal(hexDistance(2, 3, n.x, n.y), 1);
  }
  for (const n of oddAdj) {
    assert.equal(hexDistance(3, 3, n.x, n.y), 1);
  }
  assert.equal(hexDistance(2, 3, 2, 3), 0);
});

test('Wesnoth movetype movement costs and defense percentages respect aliases', () => {
  const ocean = resolveWesnothTerrain('Wo');
  const mountain = resolveWesnothTerrain('Mm');
  const pineForest = resolveWesnothTerrain('Gg^Fp');
  const bridge = resolveWesnothTerrain('Ww^Bw|');
  const village = resolveWesnothTerrain('Gg^Vh');

  // Deep ocean is impassable (99)
  assert.equal(getWesnothMovementCost(ocean, 'smallfoot'), 99);
  assert.equal(getWesnothMovementCost(ocean, 'mounted'), 99);
  assert.equal(getWesnothMovementCost(ocean, 'woodland'), 99);

  // Mountains are impassable for mounted, 3 MP for smallfoot
  assert.equal(getWesnothMovementCost(mountain, 'mounted'), 99);
  assert.equal(getWesnothMovementCost(mountain, 'smallfoot'), 3);
  assert.equal(getWesnothDefensePct(mountain, 'smallfoot'), 60);

  // Woodland moves through forest for 1 MP and gets 70% defense
  assert.equal(getWesnothMovementCost(pineForest, 'woodland'), 1);
  assert.equal(getWesnothDefensePct(pineForest, 'woodland'), 70);
  assert.equal(getWesnothMovementCost(pineForest, 'mounted'), 3);
  assert.equal(getWesnothDefensePct(pineForest, 'mounted'), 30);

  // Bridge takes best of water & flat (1 MP and 40% defense)
  assert.equal(getWesnothMovementCost(bridge, 'smallfoot'), 1);
  assert.equal(getWesnothMovementCost(bridge, 'mounted'), 1);
  assert.equal(getWesnothDefensePct(bridge, 'smallfoot'), 40);

  // Village gives 1 MP and 60% cover for smallfoot
  assert.equal(getWesnothMovementCost(village, 'smallfoot'), 1);
  assert.equal(getWesnothDefensePct(village, 'smallfoot'), 60);

  // New biomes: Frostpeak snow, Sunfire dunes, Magma chasm, and Obsidian Span
  const snow = resolveWesnothTerrain('Aa');
  const dunes = resolveWesnothTerrain('Dd');
  const magma = resolveWesnothTerrain('Qlf');
  const magmaBridge = resolveWesnothTerrain('Qlf^Bw|');
  assert.equal(getWesnothMovementCost(snow, 'smallfoot'), 2);
  assert.equal(getWesnothMovementCost(dunes, 'mounted'), 2);
  assert.equal(getWesnothMovementCost(magma, 'smallfoot'), 99);
  assert.equal(getWesnothMovementCost(magmaBridge, 'smallfoot'), 1);
});

test('computeReachableHexes and findHexPath respect MP limits, impassable terrain, and new regions', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  const reachable = computeReachableHexes(map, 2, 3, 5, 'smallfoot');

  // Should never include Deep Ocean (0,0) or distant coordinates
  assert.equal(reachable.some(r => r.x === 0 && r.y === 0), false);
  // Village Oakhaven at (5,3) is along castle/road within 5 MP
  const oak = reachable.find(r => r.x === 5 && r.y === 3);
  assert.ok(oak !== undefined);
  assert.ok(oak.cost <= 5);
  assert.equal(oak.path[0].x, 2);
  assert.equal(oak.path[0].y, 3);

  // Path across bridge from (7,4) to (10,5) routes through bridge (9,5) for mounted
  const bridgePath = findHexPath(map, 7, 4, 10, 5, 'mounted');
  assert.ok(bridgePath !== null);
  assert.ok(bridgePath!.totalCost < 15);
  // Path across Obsidian Span (16,3) reaches Eclipse Citadel (21,2)
  assert.ok(findHexPath(map, 2, 3, 21, 2, 'smallfoot') !== null);
  // Path to Coral Isle (8,17) & Mirage Oasis (15,16) & Frosthaven (13,3) all resolve cleanly
  assert.ok(findHexPath(map, 2, 3, 8, 17, 'smallfoot') !== null);
  assert.ok(findHexPath(map, 2, 3, 15, 16, 'mounted') !== null);
  assert.ok(findHexPath(map, 2, 3, 13, 3, 'smallfoot') !== null);
  // Path to deep ocean (0,0) must fail
  assert.equal(findHexPath(map, 2, 3, 0, 0, 'smallfoot'), null);
});

test('OverworldManager handles movement, village liberation, day cycling, and battle encounters', () => {
  const ow = new OverworldManager();
  assert.equal(ow.heroX, 2);
  assert.equal(ow.heroY, 3);
  assert.equal(ow.currentMp, 5);

  // Move toward Oakhaven village (5,3)
  const moveRes = ow.moveToHex(5, 3);
  assert.equal(moveRes.moved, true);
  assert.equal(ow.heroX, 5);
  assert.equal(ow.heroY, 3);
  assert.equal(moveRes.villageVisited?.id, OVERWORLD_VILLAGES[0].id);
  assert.equal(moveRes.firstVillageVisit, true);
  assert.ok(ow.visitedVillages.has('vil_oakhaven'));

  // Switch movetype to mounted (7 MP max) and endDay restores full 7 MP and advances day
  ow.setMovetype('mounted');
  const dayRes = ow.endDay();
  assert.equal(ow.day, 2);
  assert.equal(ow.currentMp, 7);
  assert.equal(dayRes.encounter, null);

  // Move onto Bridge Raiders patrol current location to trigger encounter
  const bridgePatrol = ow.patrols.find(p => p.id === 'patrol_bridge_orcs');
  assert.ok(bridgePatrol !== undefined);
  const owAttack = new OverworldManager({ heroX: 7, heroY: 4, movetype: 'mounted' });
  const atkRes = owAttack.moveToHex(bridgePatrol!.x, bridgePatrol!.y);
  assert.equal(atkRes.moved, true);
  assert.ok(atkRes.encounter !== null);
  assert.equal(atkRes.encounter?.patrol.id, 'patrol_bridge_orcs');
  assert.ok(owAttack.pendingEncounter !== null);

  // Build MissionData from the encounter
  const mission = buildEncounterMission(
    atkRes.encounter!.patrol,
    atkRes.encounter!.tile.terrain,
    bridgePatrol!.x,
    bridgePatrol!.y
  );
  assert.equal(mission.enemies.length, 3);
  assert.equal(mission.rewardGold, bridgePatrol!.rewardGold);

  // Evading / dismissing encounter steps hero safely back off patrol hex
  owAttack.dismissEncounter();
  assert.equal(owAttack.pendingEncounter, null);
  assert.notEqual(owAttack.heroX, bridgePatrol!.x);

  // Re-engaging onto patrol and resolving victory clears patrol & pending encounter
  const atkRes2 = owAttack.moveToHex(bridgePatrol!.x, bridgePatrol!.y);
  assert.ok(atkRes2.encounter !== null);
  owAttack.resolveEncounterVictory('patrol_bridge_orcs');
  assert.equal(owAttack.pendingEncounter, null);
  assert.equal(owAttack.patrols.some(p => p.id === 'patrol_bridge_orcs'), false);
  assert.equal(owAttack.clearedEncounters.has('patrol_bridge_orcs'), true);
});

test('WesnothAutoTiler picks deterministic variants, generates multi-layer transitions, and connects castles', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);

  // Deterministic variant selection & castle cobbles for Ch
  const roadTile = getHexTile(map, 4, 3)!;
  const castleTile = getHexTile(map, 1, 3)!;
  assert.equal(pickWesnothBaseVariant(roadTile), pickWesnothBaseVariant(roadTile));
  assert.ok(pickWesnothBaseVariant(roadTile).startsWith('flat_road'));
  assert.equal(pickWesnothBaseVariant(castleTile), 'castle_cobbles');

  // Cobble Road (4,3) next to Green Grass N=(4,2) & S=(4,4) receives grass_green_medium transitions
  const roadPlan = computeHexAutoTilePlan(map, 4, 3);
  assert.ok(roadPlan.transitions.some(t => t.assetKey === 'grass_green_medium_n'));

  // Shallow water (7,15) next to Beach Sand NW=(6,14) receives sand_beach, and (7,5) next to land gets flat_bank
  const riverWaterPlan = computeHexAutoTilePlan(map, 7, 5);
  assert.ok(riverWaterPlan.transitions.some(t => t.assetKey === 'flat_bank_nw'));

  // Grass (4,2) adjacent to Hills NW=(3,1) receives hills_regular_nw
  const hillEdgePlan = computeHexAutoTilePlan(map, 4, 2);
  assert.ok(hillEdgePlan.transitions.some(t => t.assetKey === 'hills_regular_nw'));

  // Connected castle: Ch at (1,3) borders Kh at NE=(2,3) and Ch at SE=(2,4) -> interior walls omitted
  const chPlan = computeHexAutoTilePlan(map, 1, 3);
  assert.deepEqual(chPlan.castleOuterDirs, ['n', 's', 'sw', 'nw']);
  const khPlan = computeHexAutoTilePlan(map, 2, 3);
  assert.deepEqual(khPlan.castleOuterDirs, ['nw']);
});

test('computeReachableFrontierEdges emits only outer boundary edges of reachable hex cluster', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  // Two adjacent hexes: (4,3) and (5,3). (5,3) is SE of (4,3), and (4,3) is NW of (5,3).
  const edges = computeReachableFrontierEdges(
    map,
    [
      { x: 4, y: 3 },
      { x: 5, y: 3 }
    ],
    [{ x: 5, y: 3 }]
  );

  // Two adjacent hexes share 1 edge, leaving 5 outer edges each = 10 total frontier segments
  assert.equal(edges.length, 10);
  assert.equal(edges.some(e => e.x === 4 && e.y === 3 && e.dir === 'se'), false);
  assert.equal(edges.some(e => e.x === 5 && e.y === 3 && e.dir === 'nw'), false);
  // Enemy hex outer edges are flagged
  const enemyEdges = edges.filter(e => e.x === 5 && e.y === 3);
  assert.equal(enemyEdges.length, 5);
  assert.ok(enemyEdges.every(e => e.isEnemyEdge));
});
