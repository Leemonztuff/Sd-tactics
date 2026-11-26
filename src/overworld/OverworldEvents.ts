import { ITEMS } from '../game/GameConfig';
import { HexCoord, WesnothHexTile, WesnothMapData, hexDistance } from './WesnothMapSystem';
import { getOverworldRegion } from './WesnothOverworldMap';
import { WesnothTerrainInfo } from './WesnothTerrain';

export type WorldEventCategory = 'merchant' | 'supply_cache' | 'wayfarer' | 'omen';

export interface ActiveWorldEventNode {
  id: string;
  templateId: string;
  category: WorldEventCategory;
  title: string;
  subtitle: string;
  x: number;
  y: number;
}

export interface WorldEventOffer {
  itemId: string;
  count: number;
  priceGold: number;
  discountPct: number;
  purchased?: boolean;
}

export interface WorldEventChoice {
  id: string;
  label: string;
  description: string;
  costGold?: number;
  costMp?: number;
  rewardGold?: number;
  rewardJpAll?: number;
  rewardMp?: number;
  reduceAmbushPct?: number;
  rewardItem?: { itemId: string; count: number };
  offer?: WorldEventOffer;
}

export interface OverworldWorldEvent {
  id: string;
  templateId: string;
  category: WorldEventCategory;
  title: string;
  subtitle: string;
  description: string;
  x: number;
  y: number;
  terrainCode: string;
  regionName: string;
  choices: WorldEventChoice[];
}

function makeOfferChoice(
  id: string,
  itemId: string,
  discountPct: number,
  count = 1
): WorldEventChoice {
  const item = ITEMS[itemId];
  const basePrice = item?.price ?? 100;
  const priceGold = Math.max(25, Math.round((basePrice * (100 - discountPct)) / 100 / 5) * 5);
  return {
    id,
    label: `Buy ${item?.name ?? itemId}${count > 1 ? ` ×${count}` : ''}`,
    description: `${item?.description ?? 'Discounted caravan stock.'} (${discountPct}% off)`,
    costGold: priceGold,
    offer: {
      itemId,
      count,
      priceGold,
      discountPct,
      purchased: false
    }
  };
}

export function isTileEligibleForWorldEvent(
  tile: WesnothHexTile,
  occupiedKeys: Set<string>
): boolean {
  const key = `${tile.x},${tile.y}`;
  if (occupiedKeys.has(key)) return false;

  const t = tile.terrain;
  if (t.isKeep || t.isVillage || t.isWater) return false;
  if (t.overlayCategory === 'bridge') return false;
  if (
    t.baseCategory === 'deep_water' ||
    t.baseCategory === 'shallow_water' ||
    t.baseCategory === 'lava' ||
    t.baseCategory === 'castle'
  ) {
    return false;
  }
  return true;
}

export function getTileWorldEventChance(terrain: WesnothTerrainInfo): { chance: number; meterGain: number } {
  if (terrain.baseCode === 'Rr' || terrain.baseCode === 'Re') {
    return { chance: 0.18, meterGain: 24 };
  }
  if (
    terrain.baseCategory === 'snow' ||
    terrain.baseCategory === 'sand' ||
    terrain.baseCategory === 'volcanic'
  ) {
    return { chance: 0.17, meterGain: 24 };
  }
  if (terrain.overlayCategory === 'forest' || terrain.baseCategory === 'hills') {
    return { chance: 0.15, meterGain: 22 };
  }
  if (terrain.baseCategory === 'mountains' || terrain.baseCategory === 'swamp_water') {
    return { chance: 0.13, meterGain: 18 };
  }
  return { chance: 0.11, meterGain: 16 };
}

export function buildWorldEventFromTemplate(
  templateId: string,
  tile: WesnothHexTile,
  day: number,
  rng: () => number = Math.random
): OverworldWorldEvent {
  const regionName = getOverworldRegion(tile.x, tile.y, tile.terrain);
  const eventId = `we_${templateId}_d${day}_${tile.x}_${tile.y}`;
  const gearRoll = rng();

  switch (templateId) {
    case 'dawn_caravan_merchant': {
      const rareGearId =
        gearRoll < 0.34
          ? 'steel_rapier'
          : gearRoll < 0.68
            ? 'ring_of_speed'
            : 'boots_of_striding';
      return {
        id: eventId,
        templateId,
        category: 'merchant',
        title: 'Dawn Caravan Merchant',
        subtitle: `Traveling Peddler · ${regionName}`,
        description:
          'A heavily laden Dawn merchant wagon pauses beside the trail, lanterns swaying as the trader unrolls rare wares at field discount.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          makeOfferChoice('buy_draught', 'healing_draught', 27),
          makeOfferChoice('buy_tonic', 'aether_tonic', 28),
          makeOfferChoice('buy_gear', rareGearId, 25),
          {
            id: 'trade_rations',
            label: 'Restock Road Provisions',
            description: 'Trade 25 G for fresh horse feed and water skins (+2 MP immediately).',
            costGold: 25,
            rewardMp: 2
          }
        ]
      };
    }

    case 'dune_relic_peddler': {
      const duneGear = gearRoll < 0.5 ? 'amulet_vitality' : 'composite_bow';
      return {
        id: eventId,
        templateId,
        category: 'merchant',
        title: 'Sunfire Caravan Peddler',
        subtitle: `Nomad Trader · ${regionName}`,
        description:
          'Shaded beneath scarlet silk awnings, a dune merchant offers alchemical charges and sun-forged gear.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          makeOfferChoice('buy_ember', 'ember_bomb', 29),
          makeOfferChoice('buy_draught', 'healing_draught', 25),
          makeOfferChoice('buy_dune_gear', duneGear, 25),
          {
            id: 'buy_dune_map',
            label: 'Consult Sand-Chart',
            description: 'Exchange local trail notes (+35 Gold & -30% Threat).',
            rewardGold: 35,
            reduceAmbushPct: 30
          }
        ]
      };
    }

    case 'alpine_fur_merchant': {
      const alpineGear = gearRoll < 0.5 ? 'leather_armor' : 'boots_of_striding';
      return {
        id: eventId,
        templateId,
        category: 'merchant',
        title: 'Frostpeak Quartermaster',
        subtitle: `Highland Trader · ${regionName}`,
        description:
          'An alpine sleigh trader hauling wool cloaks and tempered blades halts to barter with your vanguard.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          makeOfferChoice('buy_tonic', 'aether_tonic', 28),
          makeOfferChoice('buy_draught', 'healing_draught', 27),
          makeOfferChoice('buy_alpine_gear', alpineGear, 25)
        ]
      };
    }

    case 'frost_supply_sled': {
      return {
        id: eventId,
        templateId,
        category: 'supply_cache',
        title: 'Frostbound Supply Sled',
        subtitle: `Fallen Cache · ${regionName}`,
        description:
          'Half-buried in drifting frost sits an intact expedition sled bearing the solar crest of Valen.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'claim_sled_quick',
            label: 'Claim Sealed Crates',
            description: 'Recover intact coin pouches and a preserved tonic without slowing down.',
            rewardGold: 110,
            rewardItem: { itemId: 'aether_tonic', count: 1 }
          },
          {
            id: 'excavate_sled',
            label: 'Chip Out Frozen Armory',
            description: 'Spend 1 MP excavating deep snow to recover extra gold, a Dawn Draught, and tactical manuals.',
            costMp: 1,
            rewardGold: 155,
            rewardJpAll: 30,
            rewardItem: { itemId: 'healing_draught', count: 1 }
          }
        ]
      };
    }

    case 'ashen_ordnance_cache': {
      return {
        id: eventId,
        templateId,
        category: 'supply_cache',
        title: 'Fallen Vanguard Pack',
        subtitle: `Caldera Salvage · ${regionName}`,
        description:
          'Behind a basalt ridge lies an ironbound pack left behind by Dawn vanguard sappers.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'salvage_ordnance',
            label: 'Salvage Ember Ordnance',
            description: 'Grab loose coin and an intact Ember Flask.',
            rewardGold: 115,
            rewardItem: { itemId: 'ember_bomb', count: 1 }
          },
          {
            id: 'extract_ley_core',
            label: 'Extract Resonant Core',
            description: 'Spend 1 MP dismantling the pack carefully for +165 Gold and +35 JP to all heroes.',
            costMp: 1,
            rewardGold: 165,
            rewardJpAll: 35
          }
        ]
      };
    }

    case 'tide_cargo_cache': {
      return {
        id: eventId,
        templateId,
        category: 'supply_cache',
        title: 'Drifted Supply Trunk',
        subtitle: `Shoreline Salvage · ${regionName}`,
        description:
          'Brass-strapped naval stores washed into the shallows after a storm off Port Solis.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'pry_brass_lock',
            label: 'Pry Open Brass Latch',
            description: 'Collect salvaged harbor coinage and a sealed Dawn Draught.',
            rewardGold: 115,
            rewardItem: { itemId: 'healing_draught', count: 1 }
          },
          {
            id: 'scour_shoals',
            label: 'Scour Nearby Reef',
            description: 'Spend 1 MP searching the tidepools for +160 Gold, +25 JP, and an Ember Flask.',
            costMp: 1,
            rewardGold: 160,
            rewardJpAll: 25,
            rewardItem: { itemId: 'ember_bomb', count: 1 }
          }
        ]
      };
    }

    case 'order_scout_dispatch': {
      return {
        id: eventId,
        templateId,
        category: 'wayfarer',
        title: 'Order Outrider Dispatch',
        subtitle: `Field Intelligence · ${regionName}`,
        description:
          'A mud-splashed Dawn courier reins in beside your banner, offering fresh remounts or reconnaissance charts.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'accept_remounts',
            label: 'Accept Fresh Remounts',
            description: 'Restore +2 MP immediately and shake off pursuers (-35% Threat).',
            rewardMp: 2,
            reduceAmbushPct: 35
          },
          {
            id: 'study_patrol_routes',
            label: 'Study Enemy Movements',
            description: 'Brief the company on enemy formations (+40 JP to All Heroes, -25% Threat).',
            rewardJpAll: 40,
            reduceAmbushPct: 25
          }
        ]
      };
    }

    case 'ancient_way_cairn': {
      return {
        id: eventId,
        templateId,
        category: 'omen',
        title: 'Solar Concord Cairn',
        subtitle: `Ancient Ley-Stone · ${regionName}`,
        description:
          'Runes carved into weathered stone glow warmly beneath your boots, humming with forgotten battle hymns.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'attune_cairn',
            label: 'Attune Squad to the Ley-Line',
            description: 'Grant +45 JP to every hero in your roster.',
            rewardJpAll: 45
          },
          {
            id: 'harvest_cairn_shard',
            label: 'Harvest Condensed Aether',
            description: 'Collect +1 Aether Tonic and +75 Gold from offerings left at the base.',
            rewardGold: 75,
            rewardItem: { itemId: 'aether_tonic', count: 1 }
          }
        ]
      };
    }

    case 'fallen_supply_cache':
    default: {
      return {
        id: eventId,
        templateId: 'fallen_supply_cache',
        category: 'supply_cache',
        title: 'Fallen Supply Cache',
        subtitle: `Quartermaster Drop · ${regionName}`,
        description:
          'Splintered crates bearing the Order insignia rest beside a broken axle—abandoned in haste, yet the wax seals hold.',
        x: tile.x,
        y: tile.y,
        terrainCode: tile.terrain.code,
        regionName,
        choices: [
          {
            id: 'quick_salvage',
            label: 'Quick Salvage',
            description: 'Recover +85 Gold and +1 Dawn Draught without delaying the march.',
            rewardGold: 85,
            rewardItem: { itemId: 'healing_draught', count: 1 }
          },
          {
            id: 'thorough_salvage',
            label: 'Search Hidden Compartment',
            description: 'Spend 1 MP to uncover +135 Gold, +25 JP to all heroes, and +1 Ember Flask.',
            costMp: 1,
            rewardGold: 135,
            rewardJpAll: 25,
            rewardItem: { itemId: 'ember_bomb', count: 1 }
          }
        ]
      };
    }
  }
}

export function pickTemplateForTile(
  tile: WesnothHexTile,
  rng: () => number = Math.random
): string {
  const t = tile.terrain;
  const roll = rng();

  if (t.baseCategory === 'snow') {
    return roll < 0.42 ? 'alpine_fur_merchant' : roll < 0.8 ? 'frost_supply_sled' : 'ancient_way_cairn';
  }
  if (t.baseCategory === 'volcanic') {
    return roll < 0.65 ? 'ashen_ordnance_cache' : 'ancient_way_cairn';
  }
  if (t.baseCategory === 'sand') {
    if (t.baseCode === 'Ds' && roll < 0.55) return 'tide_cargo_cache';
    return roll < 0.5 ? 'dune_relic_peddler' : 'fallen_supply_cache';
  }
  if (t.baseCode === 'Rr' || t.baseCode === 'Re') {
    return roll < 0.48
      ? 'dawn_caravan_merchant'
      : roll < 0.78
        ? 'order_scout_dispatch'
        : 'fallen_supply_cache';
  }
  if (t.overlayCategory === 'forest' || t.baseCategory === 'hills' || t.baseCategory === 'mountains') {
    return roll < 0.62 ? 'fallen_supply_cache' : 'ancient_way_cairn';
  }
  return roll < 0.5 ? 'fallen_supply_cache' : roll < 0.8 ? 'dawn_caravan_merchant' : 'order_scout_dispatch';
}

export function spawnDailyWorldEvents(
  map: WesnothMapData,
  day: number,
  occupiedKeys: Set<string>,
  heroPos: HexCoord,
  rng: () => number = Math.random
): ActiveWorldEventNode[] {
  const roadCandidates: WesnothHexTile[] = [];
  const wildernessCandidates: WesnothHexTile[] = [];
  const frontierCandidates: WesnothHexTile[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y]?.[x];
      if (!tile) continue;
      if (hexDistance(x, y, heroPos.x, heroPos.y) <= 3) continue;
      if (hexDistance(x, y, 2, 3) <= 3) continue;
      if (!isTileEligibleForWorldEvent(tile, occupiedKeys)) continue;

      const t = tile.terrain;
      if (t.baseCode === 'Rr' || t.baseCode === 'Re') {
        roadCandidates.push(tile);
      } else if (t.baseCategory === 'snow' || t.baseCategory === 'sand' || t.baseCategory === 'volcanic') {
        frontierCandidates.push(tile);
      } else if (t.overlayCategory === 'forest' || t.baseCategory === 'hills' || t.baseCategory === 'flat') {
        wildernessCandidates.push(tile);
      }
    }
  }

  const pickFrom = (arr: WesnothHexTile[], exclude: Set<string>): WesnothHexTile | null => {
    const filtered = arr.filter(t => !exclude.has(`${t.x},${t.y}`));
    if (filtered.length === 0) return null;
    const idx = Math.min(filtered.length - 1, Math.floor(rng() * filtered.length));
    return filtered[idx];
  };

  const used = new Set<string>();
  const nodes: ActiveWorldEventNode[] = [];

  const roadTile = pickFrom(roadCandidates, used);
  if (roadTile) {
    used.add(`${roadTile.x},${roadTile.y}`);
    nodes.push({
      id: `daily_merchant_d${day}_${roadTile.x}_${roadTile.y}`,
      templateId: 'dawn_caravan_merchant',
      category: 'merchant',
      title: 'Dawn Caravan Merchant',
      subtitle: 'Traveling Caravan',
      x: roadTile.x,
      y: roadTile.y
    });
  }

  const cacheTile = pickFrom(wildernessCandidates, used);
  if (cacheTile) {
    used.add(`${cacheTile.x},${cacheTile.y}`);
    nodes.push({
      id: `daily_cache_d${day}_${cacheTile.x}_${cacheTile.y}`,
      templateId: 'fallen_supply_cache',
      category: 'supply_cache',
      title: 'Fallen Supply Cache',
      subtitle: 'Quartermaster Salvage',
      x: cacheTile.x,
      y: cacheTile.y
    });
  }

  const frontierTile = pickFrom(frontierCandidates, used);
  if (frontierTile) {
    used.add(`${frontierTile.x},${frontierTile.y}`);
    const tpl = pickTemplateForTile(frontierTile, rng);
    const preview = buildWorldEventFromTemplate(tpl, frontierTile, day, rng);
    nodes.push({
      id: `daily_frontier_d${day}_${frontierTile.x}_${frontierTile.y}`,
      templateId: tpl,
      category: preview.category,
      title: preview.title,
      subtitle: preview.regionName,
      x: frontierTile.x,
      y: frontierTile.y
    });
  }

  return nodes;
}
