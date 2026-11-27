import type { JobId } from '../types/game';
import type { WorldEventCategory } from './OverworldEvents';
import type { OverworldPoiSpec, OverworldVillageSpec } from './WesnothOverworldMap';

/**
 * Pure key mappings from Valen Tactics domain entities (Abilities, Jobs, Passives,
 * Reactions, Items, Overworld POIs, World Events, and Landmarks) to bundled
 * Battle for Wesnoth PNG asset keys loaded by `WesnothAssetLoader.ts`.
 *
 * Intentionally free of Vite `import.meta.glob` so Node unit tests (`tsx --test`)
 * can import and verify 100% asset coverage directly.
 */

export const ABILITY_WESNOTH_ICON: Record<string, string> = {
  // Valen Vanguard (Guard)
  slash: 'atk_sword_human',
  shield_bash: 'atk_heater_shield',
  fortify: 'atk_rect_shield',
  guardian_vow: 'icon_shield_tower',

  // Blade Dancer (Duelist)
  quick_strike: 'atk_sword_steel',
  dash_slash: 'atk_saber_human',
  evade_stance: 'atk_foot_boot',
  flurry: 'atk_greatsword_human',

  // Aether Mage (Arcanist)
  fireball: 'atk_fireball',
  lightning_bolt: 'atk_lightning',
  aether_shield: 'atk_magic_missile',
  chrono_slow: 'atk_iceball',

  // Solar Priest (Devoto)
  heal: 'atk_touch_faerie',
  sanctuary: 'atk_faerie_fire',
  holy_smite: 'atk_lightbeam',
  solar_haste: 'atk_sword_flaming',

  // Wild Scout (Explorador)
  poison_dart: 'atk_dagger_poison',
  trap_snare: 'atk_entangle',
  focus: 'atk_gaze',
  leap_strike: 'atk_greatsword_human',

  // Kingdom Arbalist (Tirador)
  aimed_shot: 'atk_crossbow_human',
  snipe: 'atk_crossbow_iron',
  volley: 'atk_bow_elven',
  pinning_bolt: 'atk_crossbow_iron',

  // Rift Alchemist (Alquimista)
  acid_flask: 'atk_mud_glob',
  elixir: 'icon_potion_green',
  smoke_bomb: 'atk_ember',
  volatile_brew: 'atk_fire_blast',

  // Astral Summoner (Invocador)
  astral_flare: 'atk_faerie_fire',
  spirit_bond: 'atk_staff_magic',
  meteor_shard: 'atk_fire_blast',
  starlight_mending: 'atk_touch_faerie'
};

export const JOB_WESNOTH_ICON: Record<JobId, string> = {
  guard: 'icon_shield_polished',
  duelist: 'atk_saber_human',
  arcanist: 'atk_fireball',
  devoto: 'icon_ankh_necklace',
  explorador: 'atk_bow_elven',
  tirador: 'atk_crossbow_human',
  alquimista: 'icon_potion_green',
  invocador: 'atk_staff_magic'
};

export const PASSIVE_WESNOTH_ICON: Record<JobId, string> = {
  guard: 'icon_steel_armor',
  duelist: 'atk_foot_boot',
  arcanist: 'icon_book',
  devoto: 'icon_ankh_necklace',
  explorador: 'icon_boots_elven',
  tirador: 'atk_gaze',
  alquimista: 'icon_potion_green',
  invocador: 'icon_scroll_red'
};

export const REACTION_WESNOTH_ICON: Record<JobId, string> = {
  guard: 'atk_rect_shield',
  duelist: 'atk_frenzy',
  arcanist: 'atk_magic_missile',
  devoto: 'atk_lightbeam',
  explorador: 'atk_entangle',
  tirador: 'atk_crossbow_human',
  alquimista: 'atk_ember',
  invocador: 'atk_curse'
};

export const ITEM_WESNOTH_ICON: Record<string, string> = {
  // Weapons
  iron_sword: 'item_sword',
  valen_greatsword: 'item_flame_sword',
  steel_rapier: 'item_sword_short',
  crystal_staff: 'item_staff_magic',
  solar_censer: 'item_sceptre_fire',
  composite_bow: 'item_crossbow',

  // Armor
  leather_armor: 'icon_leather_armor',
  plate_armor: 'icon_steel_armor',
  mage_robes: 'icon_tunic_elven',

  // Accessories
  ring_of_speed: 'icon_ring_gold',
  amulet_vitality: 'icon_necklace_amber',
  boots_of_striding: 'icon_boots_elven',

  // Consumables
  healing_draught: 'item_potion_red',
  aether_tonic: 'item_potion_blue',
  ember_bomb: 'item_bomb'
};

export const UI_WESNOTH_ICONS = {
  gold: 'icon_coins_copper',
  jp: 'icon_book',
  quests: 'icon_scroll_red',
  bag: 'icon_bag',
  attack: 'icon_crossed_swords',
  abilities: 'atk_staff_magic',
  defense: 'icon_shield_polished',
  chest: 'item_chest_closed',
  chestGold: 'item_chest_gold',
  brazier: 'item_brazier_lit',
  pack: 'item_leather_pack',
  tentMerchant: 'scenery_tent_red',
  tentShop: 'scenery_tent_shop',
  ruins: 'scenery_castle_ruins2',
  trap: 'scenery_rune2_glow',
  stairsDown: 'scenery_trapdoor_open',
  stairsUp: 'scenery_trapdoor_closed',
  torch: 'item_torch',
  cage: 'item_cage',
  coffin: 'item_coffin_closed'
} as const;

export function getAbilityWesnothIcon(abilityId: string): string {
  return ABILITY_WESNOTH_ICON[abilityId] ?? 'atk_sword_human';
}

export function getItemWesnothIcon(itemId: string): string {
  return ITEM_WESNOTH_ICON[itemId] ?? 'item_leather_pack';
}

export function getJobWesnothIcon(jobId: JobId): string {
  return JOB_WESNOTH_ICON[jobId] ?? 'icon_shield_polished';
}

export function getPoiWesnothAsset(poi: Pick<OverworldPoiSpec, 'id' | 'kind' | 'recruit'>): string {
  if (poi.kind === 'recruit' && poi.recruit) {
    if (poi.recruit.jobId === 'explorador') return 'ally_ranger';
    if (poi.recruit.jobId === 'duelist') return 'ally_duelist';
    if (poi.recruit.jobId === 'tirador') return 'ally_arbalist';
    if (poi.recruit.jobId === 'alquimista') return 'ally_alchemist';
    return 'hero_lieutenant';
  }
  if (poi.id === 'poi_coral_wreck') return 'scenery_shipwreck';
  if (poi.id === 'poi_sunwell_shrine') return 'scenery_monolith1';
  if (poi.id === 'poi_glacial_obelisk') return 'scenery_monolith2';
  if (poi.id === 'poi_caldera_altar') return 'scenery_rune4_glow';
  if (poi.id === 'poi_oasis_vault') return 'item_chest_gold';
  if (poi.id === 'poi_watchtower_cache') return 'item_box';
  if (poi.kind === 'shrine') return 'scenery_monolith1';
  return 'item_chest_closed';
}

export function getWorldEventWesnothAsset(
  templateId: string,
  category: WorldEventCategory
): string {
  switch (templateId) {
    case 'dawn_caravan_merchant':
      return 'scenery_tent_red';
    case 'dune_relic_peddler':
    case 'alpine_fur_merchant':
      return 'scenery_tent_shop';
    case 'frost_supply_sled':
      return 'item_barrel';
    case 'ashen_ordnance_cache':
      return 'item_bomb';
    case 'tide_cargo_cache':
      return 'item_chest_closed';
    case 'order_scout_dispatch':
      return 'ally_arbalist';
    case 'ancient_way_cairn':
      return 'scenery_rune1_glow';
    case 'fallen_supply_cache':
      return 'item_leather_pack';
    default:
      return category === 'merchant'
        ? 'scenery_tent_red'
        : category === 'wayfarer'
          ? 'ally_ranger'
          : category === 'omen'
            ? 'scenery_rune1_glow'
            : 'item_leather_pack';
  }
}

export function getVillageWesnothIcon(village: Pick<OverworldVillageSpec, 'cityTier'>): string {
  if (village.cityTier === 'port') return 'scenery_lighthouse';
  if (village.cityTier === 'city') return 'village_hills';
  return 'village_human';
}

export interface OverworldLandmarkSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  assetKey: string;
  scale: number;
  yOffset?: number;
  description: string;
}

/**
 * Curated Wesnoth scenic landmarks & environmental props anchored across the 25x20 Valen continent.
 * Coordinates are chosen to complement villages, keeps, roads, harbors, shrines, and wilderness passes
 * without overlapping interactive POIs or starting keeps.
 */
export const OVERWORLD_LANDMARKS: OverworldLandmarkSpec[] = [
  {
    id: 'lm_oakhaven_windmill',
    name: 'Oakhaven Grain Mill',
    x: 4,
    y: 2,
    assetKey: 'scenery_windmill',
    scale: 1.42,
    description: 'Timber windmill supplying grain to the Royal Valen Keep garrison.'
  },
  {
    id: 'lm_valen_well',
    name: 'Dawn Courtyard Well',
    x: 1,
    y: 4,
    assetKey: 'scenery_well',
    scale: 0.92,
    description: 'Deep spring well carved beside the southern curtain wall.'
  },
  {
    id: 'lm_oakhaven_signpost',
    name: 'King’s Road Signpost',
    x: 6,
    y: 3,
    assetKey: 'scenery_signpost',
    scale: 0.88,
    description: 'Carved milestone pointing east toward Sunbrook and north to Frostpeak.'
  },
  {
    id: 'lm_heartland_oak',
    name: 'Ancient Concord Oak',
    x: 1,
    y: 5,
    assetKey: 'scenery_oak',
    scale: 1.25,
    description: 'Centuries-old oak marking the edge of Whispering Pinewoods.'
  },
  {
    id: 'lm_pinehollow_oak',
    name: 'Elder Pinehollow Tree',
    x: 3,
    y: 8,
    assetKey: 'scenery_oak',
    scale: 1.2,
    description: 'Mossy landmark tree watched by local forest rangers.'
  },
  {
    id: 'lm_frost_cairn',
    name: 'Highland Pass Cairn',
    x: 6,
    y: 1,
    assetKey: 'scenery_cairn',
    scale: 0.95,
    description: 'Stacked stone marker guiding travelers safely over icy crags.'
  },
  {
    id: 'lm_sunbrook_bazaar',
    name: 'Sunbrook Quartermaster Tent',
    x: 13,
    y: 6,
    assetKey: 'scenery_tent_shop',
    scale: 1.15,
    description: 'Trade pavilion stocked with armor and field provisions.'
  },
  {
    id: 'lm_crossroads_signpost',
    name: 'Crossroads Milepost',
    x: 13,
    y: 7,
    assetKey: 'scenery_signpost',
    scale: 0.88,
    description: 'Waypost splitting the road toward Duskwater Fens and Sunfire Dunes.'
  },
  {
    id: 'lm_bastion_ruins',
    name: 'Shattered Watchtower',
    x: 15,
    y: 8,
    assetKey: 'scenery_ruins',
    scale: 1.22,
    description: 'Crumbling stone bastion overlooking Warlord Kragg’s approach.'
  },
  {
    id: 'lm_caldera_brazier',
    name: 'Obsidian Span Beacon',
    x: 15,
    y: 3,
    assetKey: 'item_brazier_lit',
    scale: 0.9,
    description: 'Iron fire-brazier lighting the basalt approach across Magma Chasm.'
  },
  {
    id: 'lm_caldera_summoning',
    name: 'Eclipse Ritual Ring',
    x: 18,
    y: 3,
    assetKey: 'scenery_summoning',
    scale: 1.18,
    description: 'Scorched arcane sigil etched into the caldera approach.'
  },
  {
    id: 'lm_port_solis_lighthouse',
    name: 'Port Solis Lighthouse',
    x: 3,
    y: 14,
    assetKey: 'scenery_lighthouse',
    scale: 1.48,
    description: 'Coastal stone beacon guiding Dawn vessels through Coral Bay.'
  },
  {
    id: 'lm_port_solis_galleon',
    name: 'Dawn Flagship Galleon',
    x: 3,
    y: 15,
    assetKey: 'scenery_galleon',
    scale: 1.35,
    description: 'Anchored warship awaiting orders outside Port Solis harbor.'
  },
  {
    id: 'lm_solis_skiff',
    name: 'Harbor Ferry Skiff',
    x: 5,
    y: 14,
    assetKey: 'scenery_boat',
    scale: 0.92,
    description: 'Wooden fishing skiff moored along the sandy shoals.'
  },
  {
    id: 'lm_oasis_lagoon_boat',
    name: 'Oasis Shallows Boat',
    x: 14,
    y: 15,
    assetKey: 'scenery_boat',
    scale: 0.9,
    description: 'Flat-bottomed ferry drifting on the desert oasis spring.'
  },
  {
    id: 'lm_dune_temple',
    name: 'Sunken Sunfire Temple',
    x: 13,
    y: 13,
    assetKey: 'scenery_temple',
    scale: 1.32,
    description: 'Sand-swept sandstone shrine guarding the western desert gate.'
  },
  {
    id: 'lm_mirage_altar',
    name: 'Sandstone Offering Altar',
    x: 15,
    y: 17,
    assetKey: 'item_altar',
    scale: 0.95,
    description: 'Carved stone altar near Mirage Oasis City.'
  },
  {
    id: 'lm_coral_rocks',
    name: 'Coral Reef Outcrop',
    x: 7,
    y: 17,
    assetKey: 'scenery_rock1',
    scale: 0.92,
    description: 'Jagged coastal boulders framing the sunken galleon wreck.'
  }
];
