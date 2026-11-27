import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ABILITIES, ITEMS, JOBS } from '../game/GameConfig';
import { JobId } from '../types/game';
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
  OVERWORLD_POIS,
  INITIAL_OVERWORLD_PATROLS,
  buildEncounterMission
} from '../overworld/WesnothOverworldMap';
import { OverworldManager } from '../overworld/OverworldManager';
import {
  pickWesnothBaseVariant,
  computeHexAutoTilePlan,
  computeReachableFrontierEdges
} from '../overworld/WesnothAutoTiler';
import {
  ABILITY_WESNOTH_ICON,
  ITEM_WESNOTH_ICON,
  JOB_WESNOTH_ICON,
  OVERWORLD_LANDMARKS,
  PASSIVE_WESNOTH_ICON,
  REACTION_WESNOTH_ICON,
  UI_WESNOTH_ICONS,
  getPoiWesnothAsset,
  getWorldEventWesnothAsset
} from '../overworld/WesnothIconRegistry';
import {
  DUNGEON_FLOORS,
  OVERWORLD_RUINS,
  buildDungeonEncounterMission,
  parseDungeonFloorMap
} from '../overworld/WesnothDungeonMaps';
import {
  computeDungeonVisibility,
  hasDungeonHexLineOfSight
} from '../overworld/WesnothAutoTiler';
import {
  createStarterSaveData,
  serializeSaveData,
  validateSaveData
} from '../utils/SaveSystem';

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

test('WesnothIconRegistry covers 100% of abilities, items, jobs, POIs, world events, and non-colliding landmarks on disk', () => {
  const wesnothDir = path.resolve(process.cwd(), 'src/assets/wesnoth');
  const foundKeys = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.png')) {
        const key = entry.name.replace(/\.png$/i, '');
        assert.equal(foundKeys.has(key), false, `Duplicate Wesnoth asset basename detected: ${key}`);
        foundKeys.set(key, full);
      }
    }
  };
  walk(wesnothDir);

  const assertAssetExists = (key: string, context: string) => {
    assert.ok(foundKeys.has(key), `Missing Wesnoth PNG asset "${key}" for ${context}`);
  };

  for (const abId of Object.keys(ABILITIES)) {
    assertAssetExists(ABILITY_WESNOTH_ICON[abId], `ability ${abId}`);
  }
  for (const itemId of Object.keys(ITEMS)) {
    assertAssetExists(ITEM_WESNOTH_ICON[itemId], `item ${itemId}`);
  }
  for (const jobId of Object.keys(JOBS) as JobId[]) {
    assertAssetExists(JOB_WESNOTH_ICON[jobId], `job ${jobId}`);
    assertAssetExists(PASSIVE_WESNOTH_ICON[jobId], `passive ${jobId}`);
    assertAssetExists(REACTION_WESNOTH_ICON[jobId], `reaction ${jobId}`);
  }
  for (const [uiKey, assetKey] of Object.entries(UI_WESNOTH_ICONS)) {
    assertAssetExists(assetKey, `UI icon ${uiKey}`);
  }
  for (const poi of OVERWORLD_POIS) {
    assertAssetExists(getPoiWesnothAsset(poi), `POI ${poi.id}`);
  }
  const eventSamples: Array<[string, 'merchant' | 'supply_cache' | 'wayfarer' | 'omen']> = [
    ['dawn_caravan_merchant', 'merchant'],
    ['dune_relic_peddler', 'merchant'],
    ['alpine_fur_merchant', 'merchant'],
    ['frost_supply_sled', 'supply_cache'],
    ['ashen_ordnance_cache', 'supply_cache'],
    ['tide_cargo_cache', 'supply_cache'],
    ['order_scout_dispatch', 'wayfarer'],
    ['ancient_way_cairn', 'omen'],
    ['fallen_supply_cache', 'supply_cache']
  ];
  for (const [tpl, cat] of eventSamples) {
    assertAssetExists(getWorldEventWesnothAsset(tpl, cat), `world event ${tpl}`);
  }

  // Verify landmarks sit on valid map hexes and never collide with villages, POIs, or keeps
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  const occupied = new Set<string>();
  OVERWORLD_VILLAGES.forEach(v => occupied.add(`${v.x},${v.y}`));
  OVERWORLD_POIS.forEach(p => occupied.add(`${p.x},${p.y}`));
  INITIAL_OVERWORLD_PATROLS.forEach(p => occupied.add(`${p.x},${p.y}`));
  map.startingPositions.forEach(pos => occupied.add(`${pos.x},${pos.y}`));

  for (const lm of OVERWORLD_LANDMARKS) {
    assertAssetExists(lm.assetKey, `landmark ${lm.id}`);
    const tile = getHexTile(map, lm.x, lm.y);
    assert.ok(tile !== null, `Landmark ${lm.id} out of map bounds`);
    assert.equal(
      occupied.has(`${lm.x},${lm.y}`),
      false,
      `Landmark ${lm.id} collides with village/POI/patrol/keep at (${lm.x},${lm.y})`
    );
  }

  const ow = new OverworldManager();
  const millInspect = ow.getTileInspectInfo(4, 2);
  assert.equal(millInspect?.landmark?.id, 'lm_oakhaven_windmill');
});

test('OVERWORLD_RUINS sit on non-colliding passable hexes and 4 dungeon floors parse to 24x18 with full corridor reachability', () => {
  const wesnothDir = path.resolve(process.cwd(), 'src/assets/wesnoth');
  const foundKeys = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.png')) {
        foundKeys.add(entry.name.replace(/\.png$/i, ''));
      }
    }
  };
  walk(wesnothDir);

  const assertAsset = (key: string, ctx: string) => {
    assert.ok(foundKeys.has(key), `Missing Wesnoth PNG "${key}" for ${ctx}`);
  };

  // Shroud, Fog, Trapdoor, Cage, and Dungeon UI assets exist
  for (const key of [
    'shroud_void',
    'shroud_void_n',
    'shroud_void_ne',
    'shroud_void_se',
    'shroud_void_s',
    'shroud_void_sw',
    'shroud_void_nw',
    'fog_center',
    'scenery_trapdoor_open',
    'scenery_trapdoor_closed',
    'item_cage'
  ]) {
    assertAsset(key, 'dungeon core overlay');
  }

  // Surface ruins exist on passable hexes without collisions and are reachable from Keep (2,3)
  const surfMap = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  const surfOccupied = new Set<string>();
  OVERWORLD_VILLAGES.forEach(v => surfOccupied.add(`${v.x},${v.y}`));
  OVERWORLD_POIS.forEach(p => surfOccupied.add(`${p.x},${p.y}`));
  INITIAL_OVERWORLD_PATROLS.forEach(p => surfOccupied.add(`${p.x},${p.y}`));
  OVERWORLD_LANDMARKS.forEach(l => surfOccupied.add(`${l.x},${l.y}`));
  surfMap.startingPositions.forEach(pos => surfOccupied.add(`${pos.x},${pos.y}`));

  assert.equal(OVERWORLD_RUINS.length, 4);
  for (const ruin of OVERWORLD_RUINS) {
    assertAsset(ruin.assetKey, `ruin ${ruin.id}`);
    const tile = getHexTile(surfMap, ruin.x, ruin.y);
    assert.ok(tile !== null, `Ruin ${ruin.id} out of bounds`);
    assert.equal(surfOccupied.has(`${ruin.x},${ruin.y}`), false, `Ruin ${ruin.id} collides at (${ruin.x},${ruin.y})`);
    assert.ok(getWesnothMovementCost(tile!.terrain, 'smallfoot') < 99, `Ruin ${ruin.id} sits on impassable hex`);
    assert.ok(findHexPath(surfMap, 2, 3, ruin.x, ruin.y, 'smallfoot') !== null, `Ruin ${ruin.id} unreachable from Keep`);
  }

  // Validate all 4 dungeon floors (24x18, stairs, warden, assets, and pathfinding to every entity)
  for (const floorNum of [1, 2, 3, 4] as const) {
    const spec = DUNGEON_FLOORS[floorNum];
    const dMap = parseDungeonFloorMap(floorNum);
    assert.equal(dMap.width, 24, `Floor ${floorNum} width must be 24`);
    assert.equal(dMap.height, 18, `Floor ${floorNum} height must be 18`);
    for (let y = 0; y < dMap.height; y++) {
      assert.equal(dMap.tiles[y].length, 24, `Floor ${floorNum} row ${y} must have 24 tiles`);
    }

    assert.deepEqual(dMap.startingPositions.get(1), spec.stairsUp, `Floor ${floorNum} '1' spawn mismatch`);
    if (spec.stairsDown) {
      assert.deepEqual(dMap.startingPositions.get(2), spec.stairsDown, `Floor ${floorNum} '2' stairsDown mismatch`);
      assert.ok(
        findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, spec.stairsDown.x, spec.stairsDown.y, 'smallfoot') !== null,
        `Floor ${floorNum} stairsDown unreachable from stairsUp`
      );
    } else {
      assert.ok(dMap.startingPositions.has(2), `Floor ${floorNum} keep/throne '2' missing`);
    }

    assert.ok(spec.enemies.some(e => e.id === spec.wardenEnemyId), `Floor ${floorNum} missing wardenEnemyId`);

    for (const enemy of spec.enemies) {
      assertAsset(enemy.spriteAsset, `floor ${floorNum} enemy ${enemy.id}`);
      const p = findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, enemy.x, enemy.y, 'smallfoot');
      assert.ok(p !== null, `Floor ${floorNum} enemy ${enemy.id} at (${enemy.x},${enemy.y}) unreachable`);
      for (const pt of enemy.patrolRoute) {
        const ptTile = getHexTile(dMap, pt.x, pt.y);
        assert.ok(ptTile !== null && getWesnothMovementCost(ptTile.terrain, 'smallfoot') < 99, `Floor ${floorNum} patrol route (${pt.x},${pt.y}) impassable`);
      }
    }

    for (const trap of spec.traps) {
      assertAsset(trap.assetKey, `floor ${floorNum} trap ${trap.id}`);
      const p = findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, trap.x, trap.y, 'smallfoot');
      assert.ok(p !== null, `Floor ${floorNum} trap ${trap.id} at (${trap.x},${trap.y}) unreachable`);
    }

    for (const tres of spec.treasures) {
      assertAsset(tres.assetKey, `floor ${floorNum} treasure ${tres.id}`);
      assertAsset(tres.openedAssetKey, `floor ${floorNum} opened treasure ${tres.id}`);
      const p = findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, tres.x, tres.y, 'smallfoot');
      assert.ok(p !== null, `Floor ${floorNum} treasure ${tres.id} at (${tres.x},${tres.y}) unreachable`);
    }

    for (const ally of spec.allies) {
      assertAsset(ally.spriteAsset, `floor ${floorNum} ally ${ally.id}`);
      const p = findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, ally.x, ally.y, 'smallfoot');
      assert.ok(p !== null, `Floor ${floorNum} ally ${ally.id} at (${ally.x},${ally.y}) unreachable`);
    }

    for (const sanc of spec.sanctuaries) {
      const p = findHexPath(dMap, spec.stairsUp.x, spec.stairsUp.y, sanc.x, sanc.y, 'smallfoot');
      assert.ok(p !== null, `Floor ${floorNum} sanctuary ${sanc.id} at (${sanc.x},${sanc.y}) unreachable`);
    }

    for (const prop of spec.props) {
      assertAsset(prop.assetKey, `floor ${floorNum} prop at (${prop.x},${prop.y})`);
    }
  }
});

test('hasDungeonHexLineOfSight and computeDungeonVisibility enforce pitch-black Shroud behind dungeon walls', () => {
  const f1Map = parseDungeonFloorMap(1);
  // Hero starts at (2,2); wall Xos/Xoc at (4,4) & row 3 wall (4,3)
  assert.equal(hasDungeonHexLineOfSight(f1Map, 2, 2, 3, 2), true);
  // Deep distant hall (20, 14) is blocked behind dungeon walls from (2,2)
  assert.equal(hasDungeonHexLineOfSight(f1Map, 2, 2, 7, 2), false);

  const visible = computeDungeonVisibility(f1Map, 2, 2, 4);
  assert.equal(visible.has('2,2'), true);
  assert.equal(visible.has('3,2'), true);
  assert.equal(visible.has('20,14'), false);
  // Wall at (4,3) is adjacent-ish within vision, while corridor past closed wall (10,2) is invisible
  assert.equal(visible.has('10,2'), false);
});

test('OverworldManager dungeon lifecycle: ruin entry, shroud/fog, trap trigger & disarm, warden gate, stairs, and SaveSystem round-trip', () => {
  const ow = new OverworldManager({ heroX: 5, heroY: 4, movetype: 'mounted' });

  // Step onto Sunken Catacombs ruin at (6,4) -> opens ruin portal prompt
  const ruinStep = ow.moveToHex(6, 4);
  assert.equal(ruinStep.moved, true);
  assert.equal(ruinStep.ruinEntered?.id, 'ruin_valen_catacombs');
  assert.equal(ow.pendingRuin?.id, 'ruin_valen_catacombs');

  // Descend to Floor 1
  ow.enterDungeon(1, 'up');
  assert.equal(ow.activeZone, 'dungeon');
  assert.equal(ow.currentDungeonFloor, 1);
  assert.deepEqual({ x: ow.heroX, y: ow.heroY }, { x: 2, y: 2 });
  assert.equal(ow.isHexExplored(2, 2), true);
  assert.equal(ow.isHexVisible(2, 2), true);
  assert.equal(ow.isHexExplored(20, 14), false);

  // Shrouded inspection conceals terrain & patrol info
  const shroudedInspect = ow.getTileInspectInfo(20, 14);
  assert.equal(shroudedInspect?.shrouded, true);
  assert.equal(shroudedInspect?.patrol, null);

  // Walk to (3,2): detects adjacent trap_f1_1 at (4,2) within range 2
  ow.moveToHex(3, 2);
  const adjTrap = ow.getAdjacentDetectedTrap();
  assert.equal(adjTrap?.id, 'trap_f1_1');

  // Disarm trap_f1_1 costs 1 MP and resolves trap cleanly
  const mpBeforeDisarm = ow.currentMp;
  const disarmed = ow.disarmTrap('trap_f1_1');
  assert.equal(disarmed?.id, 'trap_f1_1');
  assert.equal(ow.currentMp, mpBeforeDisarm - 1);
  assert.equal(ow.resolvedTraps.has('trap_f1_1'), true);

  // Trigger another trap (trap_f1_2 at (11,3)) directly to verify woundPct accumulation
  const owTrap = new OverworldManager();
  owTrap.enterDungeon(1, 'up');
  owTrap.heroX = 10;
  owTrap.heroY = 3;
  owTrap.updateDungeonVisibility();
  owTrap.recomputeReachable();
  // (10,3) is Xos wall, use passable (11,2)
  owTrap.heroX = 11;
  owTrap.heroY = 2;
  owTrap.updateDungeonVisibility();
  owTrap.recomputeReachable();
  const trapStep = owTrap.moveToHex(11, 3);
  assert.equal(trapStep.trapTriggered?.id, 'trap_f1_2');
  assert.equal(owTrap.dungeonWoundPct, 14);

  // Stepping on stairsDown while Warden alive shows blockedByWardenName
  const owStairs = new OverworldManager({ movetype: 'mounted' });
  owStairs.enterDungeon(1, 'up');
  owStairs.heroX = 21;
  owStairs.heroY = 15;
  owStairs.updateDungeonVisibility();
  owStairs.recomputeReachable();
  const blockedStairs = owStairs.moveToHex(22, 15);
  assert.ok(blockedStairs.stairsReached?.blockedByWardenName);
  assert.equal(owStairs.unlockedDungeonFloors.has(2), false);

  // Defeating Floor 1 Warden unlocks Floor 2 and builds a subterranean mission (elevationSeed >= 400)
  const f1Spec = DUNGEON_FLOORS[1];
  const wardenSpec = f1Spec.enemies.find(e => e.id === 'dun_f1_warden')!;
  const mission = buildDungeonEncounterMission(
    wardenSpec,
    f1Spec,
    getHexTile(owStairs.map, 20, 14)!.terrain,
    20,
    14,
    14
  );
  assert.ok(mission.elevationSeed >= 400);
  assert.ok(mission.description.includes('14% trap fatigue'));

  owStairs.pendingStairs = null;
  owStairs.resolveEncounterVictory('dun_f1_warden');
  assert.equal(owStairs.isFloorWardenCleared(1), true);
  assert.equal(owStairs.unlockedDungeonFloors.has(2), true);
  assert.equal(owStairs.descendToNextFloor(), true);
  assert.equal(owStairs.currentDungeonFloor, 2);

  // SaveSystem preserves dungeon state across serialize + validate round-trip
  const save = createStarterSaveData();
  save.overworld = {
    heroX: owStairs.surfaceReturnX,
    heroY: owStairs.surfaceReturnY,
    day: owStairs.day,
    movetype: owStairs.movetype,
    visitedVillages: [],
    clearedEncounters: [],
    collectedPois: [],
    dungeon: {
      activeZone: owStairs.activeZone,
      currentFloor: owStairs.currentDungeonFloor,
      unlockedFloors: Array.from(owStairs.unlockedDungeonFloors),
      surfaceReturnX: owStairs.surfaceReturnX,
      surfaceReturnY: owStairs.surfaceReturnY,
      dungeonHeroX: owStairs.heroX,
      dungeonHeroY: owStairs.heroY,
      dungeonWoundPct: 14,
      exploredByFloor: {
        1: Array.from(owStairs.exploredByFloor.get(1) ?? []),
        2: Array.from(owStairs.exploredByFloor.get(2) ?? [])
      },
      resolvedTraps: ['trap_f1_1'],
      collectedTreasures: ['tres_f1_1'],
      rescuedAllies: ['ally_f1_garrick'],
      clearedDungeonEnemies: ['dun_f1_warden'],
      visitedSanctuaries: []
    }
  };
  const roundTripped = validateSaveData(JSON.parse(serializeSaveData(save)));
  assert.ok(roundTripped?.overworld?.dungeon !== undefined);
  assert.equal(roundTripped!.overworld!.dungeon!.currentFloor, 2);
  assert.equal(roundTripped!.overworld!.dungeon!.dungeonWoundPct, 14);
  assert.deepEqual(roundTripped!.overworld!.dungeon!.resolvedTraps, ['trap_f1_1']);

  // Emerging to surface clears dungeon zone & trap fatigue cleanly
  owStairs.exitDungeonToSurface();
  assert.equal(owStairs.activeZone, 'surface');
  assert.equal(owStairs.dungeonWoundPct, 0);
});
