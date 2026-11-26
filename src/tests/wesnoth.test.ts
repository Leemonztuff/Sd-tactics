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

test('parseWesnothMap parses 20x14 Wesnoth .map with keeps and base^overlay codes', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  assert.equal(map.width, 20);
  assert.equal(map.height, 14);
  for (let y = 0; y < map.height; y++) {
    assert.equal(map.tiles[y].length, map.width, `Row ${y} must have width ${map.width}`);
    for (let x = 0; x < map.width; x++) {
      assert.ok(map.tiles[y][x]?.terrain?.code, `Tile (${x},${y}) must have valid terrain`);
    }
  }

  const p1 = map.startingPositions.get(1);
  const p2 = map.startingPositions.get(2);
  const p3 = map.startingPositions.get(3);
  assert.deepEqual(p1, { x: 2, y: 3 });
  assert.deepEqual(p2, { x: 15, y: 8 });
  assert.deepEqual(p3, { x: 16, y: 2 });

  const keepTile = getHexTile(map, 2, 3);
  assert.equal(keepTile?.terrain.code, 'Kh');
  assert.equal(keepTile?.terrain.isKeep, true);
  assert.equal(keepTile?.startingPosition, 1);

  const bridgeTile = getHexTile(map, 9, 5);
  assert.equal(bridgeTile?.terrain.code, 'Ww^Bw|');
  assert.equal(bridgeTile?.terrain.overlayCategory, 'bridge');
  assert.equal(bridgeTile?.terrain.isWater, false);
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
});

test('computeReachableHexes and findHexPath respect MP limits and impassable terrain', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  const reachable = computeReachableHexes(map, 2, 3, 5, 'smallfoot');

  // Should never include Deep Ocean (0,0) or distant coordinates
  assert.equal(reachable.some(r => r.x === 0 && r.y === 0), false);
  // Village Oakhaven at (5,2) is along castle/road within 5 MP
  const oak = reachable.find(r => r.x === 5 && r.y === 2);
  assert.ok(oak !== undefined);
  assert.ok(oak.cost <= 5);
  assert.equal(oak.path[0].x, 2);
  assert.equal(oak.path[0].y, 3);

  // Path across bridge from (7,4) to (10,5) routes through bridge (9,5) for mounted
  const bridgePath = findHexPath(map, 7, 4, 10, 5, 'mounted');
  assert.ok(bridgePath !== null);
  assert.ok(bridgePath!.totalCost < 15);
  // Path to deep ocean (0,0) must fail
  assert.equal(findHexPath(map, 2, 3, 0, 0, 'smallfoot'), null);
});

test('OverworldManager handles movement, village liberation, day cycling, and battle encounters', () => {
  const ow = new OverworldManager();
  assert.equal(ow.heroX, 2);
  assert.equal(ow.heroY, 3);
  assert.equal(ow.currentMp, 5);

  // Move toward Oakhaven village (5,2)
  const moveRes = ow.moveToHex(5, 2);
  assert.equal(moveRes.moved, true);
  assert.equal(ow.heroX, 5);
  assert.equal(ow.heroY, 2);
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
  const atkRes = ow.moveToHex(bridgePatrol!.x, bridgePatrol!.y);
  assert.equal(atkRes.moved, true);
  assert.ok(atkRes.encounter !== null);
  assert.equal(atkRes.encounter?.patrol.id, 'patrol_bridge_orcs');
  assert.ok(ow.pendingEncounter !== null);

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
  ow.dismissEncounter();
  assert.equal(ow.pendingEncounter, null);
  assert.notEqual(ow.heroX, bridgePatrol!.x);

  // Re-engaging onto patrol and resolving victory clears patrol & pending encounter
  const atkRes2 = ow.moveToHex(bridgePatrol!.x, bridgePatrol!.y);
  assert.ok(atkRes2.encounter !== null);
  ow.resolveEncounterVictory('patrol_bridge_orcs');
  assert.equal(ow.pendingEncounter, null);
  assert.equal(ow.patrols.some(p => p.id === 'patrol_bridge_orcs'), false);
  assert.equal(ow.clearedEncounters.has('patrol_bridge_orcs'), true);
});

test('WesnothAutoTiler picks deterministic variants, generates multi-layer transitions, and connects castles', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);

  // Deterministic variant selection & castle cobbles for Ch
  const roadTile = getHexTile(map, 4, 3)!;
  const castleTile = getHexTile(map, 1, 3)!;
  assert.equal(pickWesnothBaseVariant(roadTile), pickWesnothBaseVariant(roadTile));
  assert.ok(pickWesnothBaseVariant(roadTile).startsWith('flat_road'));
  assert.equal(pickWesnothBaseVariant(castleTile), 'castle_cobbles');

  // Cobble Road (4,3) next to Green Grass N=(4,2) & NE=(5,2) receives grass_green_medium transitions
  const roadPlan = computeHexAutoTilePlan(map, 4, 3);
  assert.ok(roadPlan.transitions.some(t => t.assetKey === 'grass_green_medium_n'));
  assert.ok(roadPlan.transitions.some(t => t.assetKey === 'grass_green_medium_ne'));

  // Shallow water (7,10) next to Beach Sand NW=(6,10) receives sand_beach_nw, and (8,4) next to land gets flat_bank
  const beachWaterPlan = computeHexAutoTilePlan(map, 7, 10);
  assert.ok(beachWaterPlan.transitions.some(t => t.assetKey === 'sand_beach_nw'));
  const riverWaterPlan = computeHexAutoTilePlan(map, 8, 4);
  assert.ok(riverWaterPlan.transitions.some(t => t.assetKey === 'flat_bank_n'));
  assert.ok(riverWaterPlan.transitions.some(t => t.assetKey === 'flat_bank_sw'));

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
