import { JobId, MissionData, Direction } from '../types/game';
import { HexCoord } from './WesnothMapSystem';
import { WesnothTerrainInfo } from './WesnothTerrain';

/**
 * Authentic Wesnoth `.map` format (25x20 continent of Valen: 8 distinct biomes & 5 keeps).
 *   1 Kh = Royal Valen Keep (Start), 2 Kh = Orcish Bastion, 3 Kh = Eclipse Citadel,
 *   4 Kh = Icewind Jarldom, 5 Kh = Crimson Sands Citadel
 *   Aa/Ha/Ms = Frostpeak Highlands, Dd/Hd = Sunfire Dunes & Mesas,
 *   Rd/Qlf/Qlf^Bw| = Ashen Caldera & Magma Chasm + Obsidian Span
 */
export const VALEN_WESNOTH_MAP_TEXT = `
border_size=0
usage=map

Wo, Wo, Mm, Mm, Hh, Ha, Ms, Ms, Ha, Aa, Aa, Ms, Ms, Aa^Fp, Ha, Mm, Ms, Qlf, Qlf, Qlf, Mm, Mm, Qlf, Wo, Wo
Wo, Gg^Fp, Mm, Hh, Hh, Gg^Fp, Aa, Ha, Hh^Vhh, Aa, Aa^Fp, Ch, Ch, Aa, Aa, Ha, Rd, Rd, Qlf, Ch, Ch, Ch, Qlf, Wo, Wo
Wo, Gg, Ch, Ch, Gg, Gg, Hh, Aa, Aa, Aa, Ch, 4 Kh, Ch, Aa, Aa^Fp, Rd, Qlf, Rd, Rd, Ch, Ch, 3 Kh, Ch, Wo, Wo
Gg, Ch, 1 Kh, Ch, Rr, Gg^Vh, Rr, Rr, Gg, Aa, Rr, Ch, Aa, Aa^Vh, Rr, Rd, Qlf^Bw|, Rd, Rd, Rr, Ch, Rd, Rd, Wo, Wo
Gg, Gg, Ch, Rr, Rr, Gg, Gg^Fp, Rr, Wwf, Gg^Fp, Rr, Aa, Gs, Gg, Gg, Rd, Rd, Rd^Vhh, Rr, Rd, Rd, Mm, Wo, Wo, Wo
Gg^Fp, Gg, Gg, Rr, Gs, Gs^Fds, Gg, Ww, Rr, Ww^Bw|, Rr, Rr, Gs, Hh, Gg^Fp, Rd, Gs, Gg, Rr, Hh, Mm, Wo, Wo, Wo, Wo
Gg^Fp, Gg^Fds, Gs, Rr, Rr, Gg, Ww, Ww, Wwf, Ww, Gs, Gg^Fp, Gg^Vh, Rr, Hh, Rr, Hh^Vhh, Rr, Gg, Hh, Ch, Gs, Wo, Wo, Wo
Hh, Gg^Fds, Gg, Gs, Rr, Re, Ww, Ds, Gg, Ww, Ss, Gs, Rr, Rr, Gs, Rr, Gg, Ch, Ch, Ch, Gg, Ds, Ww, Wo, Wo
Hh, Hh, Gg^Vh, Gs, Re, Re, Wwf, Ds, Ss, Ww, Ss, Ss, Ss, Rr, Gs, Hh, Ch, Ch, Ch, Ch, Hh, Ds, Ww, Wo, Wo
Mm, Hh, Gg, Gg^Fp, Re, Gs, Ds, Ds, Ww, Ss, Ss, Ss, Gg^Fds, Rr, Gg, Hh, Ch, Ch, Ch, 2 Kh, Ch, Ds, Ww, Wo, Wo
Mm, Hh, Gg^Fp, Gg^Fds, Rr, Gg, Gs, Ds, Wwf, Ss, Ss, Ss, Ss, Rr, Gs, Hh, Gg, Ch, Ch, Ch, Hh, Ds, Ww, Wo, Wo
Gg^Fp, Gg^Fds, Gg^Fp, Rr, Rr, Gg^Fds, Gg, Ww, Wwf, Ss, Ss, Ss, Gg, Rr, Hd, Hd, Hh, Gg, Gs, Hh, Ds, Ww, Wo, Wo, Wo
Gg^Fp, Gs^Fds, Gg, Rr, Gs, Gg^Fp, Ds, Ww, Ss, Ss, Gs, Gg^Fds, Rr, Rr, Hd, Hd, Dd, Hd, Dd, Ds, Ww, Wo, Wo, Wo, Wo
Hh, Gs, Gg^Fds, Rr, Rr, Ds, Ds, Ww, Wwf, Gs, Gs^Fds, Rr, Rr, Dd, Dd, Hd, Dd, Dd, Dd, Dd, Ds, Ww, Wo, Wo, Wo
Hh, Ds, Ds, Ds, Ds^Vh, Ds, Ww, Ww, Wwf, Gg, Rr, Rr, Dd, Dd, Gs^Fds, Dd, Dd, Dd, Dd, Hd, Dd, Ds, Ww, Wo, Wo
Wo, Ds, Ds, Ww, Ww, Ds, Wwf, Ww, Ww, Gs, Ds, Rr, Dd, Gs^Fds, Ww, Ww, Dd, Dd, Dd, Ch, Ch, Dd, Ds, Ww, Wo
Wo, Wo, Ww, Ww, Ww, Ww, Ww, Wwf, Ds, Ww, Ds, Ds, Dd, Dd, Dd, Dd^Vh, Dd, Dd, Ch, Ch, 5 Kh, Ch, Dd, Ww, Wo
Wo, Wo, Wo, Ww, Ww, Ww, Ds, Ds, Ds, Ww, Ww, Ds, Dd, Dd, Hd, Dd, Dd, Dd, Ch, Ch, Ch, Dd, Ds, Ww, Wo
Wo, Wo, Wo, Wo, Ww, Ww, Ww, Ds, Ww, Ww, Wo, Ww, Ds, Dd, Dd, Hd, Hd, Dd, Dd, Dd, Dd, Ds, Ww, Wo, Wo
Wo, Wo, Wo, Wo, Wo, Wo, Wo, Ww, Ww, Wo, Wo, Wo, Ww, Ds, Ds, Ds, Ds, Ds, Ww, Ww, Ww, Wo, Wo, Wo, Wo
`;

export function getOverworldRegion(x: number, y: number, terrain: WesnothTerrainInfo): string {
  if (terrain.baseCategory === 'snow' || (y <= 3 && x >= 6 && x <= 14)) {
    return 'Frostpeak Highlands';
  }
  if (terrain.baseCategory === 'volcanic' || terrain.baseCategory === 'lava' || (y <= 5 && x >= 15)) {
    return 'Ashen Caldera';
  }
  if (x >= 13 && y >= 12) {
    return 'Sunfire Dunes';
  }
  if (y >= 14 && x <= 12) {
    return 'Azure Coral Bay';
  }
  if (terrain.baseCategory === 'swamp_water' || (x >= 8 && x <= 13 && y >= 8 && y <= 13)) {
    return 'Duskwater Fens';
  }
  if (x >= 15 && y >= 6 && y <= 12) {
    return 'Orcish Borderlands';
  }
  if (x <= 6 && y >= 6 && y <= 13) {
    return 'Whispering Pinewoods';
  }
  return 'Valen Heartland';
}

export interface OverworldVillageSpec {
  id: string;
  name: string;
  cityTier: 'village' | 'city' | 'port';
  x: number;
  y: number;
  lore: string;
  rewardGold: number;
}

export const OVERWORLD_VILLAGES: OverworldVillageSpec[] = [
  {
    id: 'vil_oakhaven',
    name: 'Oakhaven Town',
    cityTier: 'village',
    x: 5,
    y: 3,
    lore: 'Borderland farmers tend the western meadows and share provisions with the Order of the Dawn.',
    rewardGold: 90
  },
  {
    id: 'vil_highwatch',
    name: 'Highwatch Ridge',
    cityTier: 'village',
    x: 8,
    y: 1,
    lore: 'Watchers on the northern crags guard the mountain pass into the Frostpeaks.',
    rewardGold: 115
  },
  {
    id: 'vil_frosthaven',
    name: 'Frosthaven Citadel',
    cityTier: 'city',
    x: 13,
    y: 3,
    lore: 'An alpine stone city heated by geothermal springs, rallying northern rangers against Icewind.',
    rewardGold: 140
  },
  {
    id: 'vil_sunbrook',
    name: 'Sunbrook Market City',
    cityTier: 'city',
    x: 12,
    y: 6,
    lore: 'A bustling river trade city at the central crossroads, supplying armorers and alchemists.',
    rewardGold: 120
  },
  {
    id: 'vil_pinehollow',
    name: 'Pinehollow Glade',
    cityTier: 'village',
    x: 2,
    y: 8,
    lore: 'Woodcutters and herbalists offering restorative tonics to weary knights.',
    rewardGold: 95
  },
  {
    id: 'vil_eastwatch',
    name: 'Eastwatch Stonehold',
    cityTier: 'village',
    x: 16,
    y: 6,
    lore: 'Hillfolk clinging to the stone terraces above Warlord Kragg’s bastion.',
    rewardGold: 125
  },
  {
    id: 'vil_port_solis',
    name: 'Port Solis Harbor',
    cityTier: 'port',
    x: 4,
    y: 14,
    lore: 'A sun-drenched coastal port whose mariners ferry Dawn scouts toward the Coral Archipelago.',
    rewardGold: 135
  },
  {
    id: 'vil_mirage_oasis',
    name: 'Mirage Oasis City',
    cityTier: 'city',
    x: 15,
    y: 16,
    lore: 'Emerald palm gardens encircle an ancient desert spring amid the burning Sunfire Dunes.',
    rewardGold: 150
  },
  {
    id: 'vil_cinderwatch',
    name: 'Cinderwatch Outpost',
    cityTier: 'village',
    x: 17,
    y: 4,
    lore: 'Basalt-walled vanguard outpost holding the eastern approach beyond the Obsidian Span.',
    rewardGold: 160
  }
];

export interface OverworldRecruitSpec {
  heroId: string;
  name: string;
  jobId: JobId;
  level: number;
  weaponId?: string;
  armorId?: string;
  accessoryId?: string;
}

export interface OverworldPoiSpec {
  id: string;
  name: string;
  subtitle: string;
  kind: 'chest' | 'shrine' | 'recruit';
  x: number;
  y: number;
  lore: string;
  rewardGold?: number;
  rewardJpAll?: number;
  rewardItem?: { itemId: string; count: number };
  recruit?: OverworldRecruitSpec;
}

export const OVERWORLD_POIS: OverworldPoiSpec[] = [
  {
    id: 'poi_pinehollow_scout',
    name: 'Vesper the Pathfinder',
    subtitle: 'Pinehollow Glade Ally',
    kind: 'recruit',
    x: 2,
    y: 8,
    lore: 'Ranger Vesper pledges her bow and cliff-striding scouts to the Order of the Dawn.',
    recruit: {
      heroId: 'hero_vesper',
      name: 'Vesper',
      jobId: 'explorador',
      level: 2,
      weaponId: 'composite_bow',
      armorId: 'leather_armor'
    }
  },
  {
    id: 'poi_sunbrook_alchemist',
    name: 'Sera the Transmuter',
    subtitle: 'Sunbrook City Ally',
    kind: 'recruit',
    x: 12,
    y: 6,
    lore: 'Alchemist Sera brings corrosive phials and restorative elixirs to breach the eastern keeps.',
    recruit: {
      heroId: 'hero_sera',
      name: 'Sera',
      jobId: 'alquimista',
      level: 2,
      weaponId: 'steel_rapier',
      armorId: 'leather_armor'
    }
  },
  {
    id: 'poi_frosthaven_duelist',
    name: 'Thorne the Frostblade',
    subtitle: 'Frostpeak Pass Ally',
    kind: 'recruit',
    x: 9,
    y: 3,
    lore: 'Exiled royal fencer Thorne joins your vanguard to break Icewind’s blockade in the snowfields.',
    recruit: {
      heroId: 'hero_thorne',
      name: 'Thorne',
      jobId: 'duelist',
      level: 2,
      weaponId: 'steel_rapier',
      armorId: 'leather_armor'
    }
  },
  {
    id: 'poi_solis_arbalist',
    name: 'Mira of Port Solis',
    subtitle: 'Azure Harbor Ally',
    kind: 'recruit',
    x: 4,
    y: 14,
    lore: 'Harbor sharpshooter Mira lends her heavy arbalest to sweep the southern coasts and dunes.',
    recruit: {
      heroId: 'hero_mira',
      name: 'Mira',
      jobId: 'tirador',
      level: 3,
      weaponId: 'composite_bow',
      accessoryId: 'ring_of_speed'
    }
  },
  {
    id: 'poi_ford_cache',
    name: 'Sunken Supply Chest',
    subtitle: 'Riverbank Salvage',
    kind: 'chest',
    x: 7,
    y: 7,
    lore: 'A stranded Dawn supply barge holds intact provisions and healing draughts.',
    rewardGold: 120,
    rewardItem: { itemId: 'healing_draught', count: 2 }
  },
  {
    id: 'poi_sunwell_shrine',
    name: 'Sunwell Wayshrine',
    subtitle: 'Ancient Concord Pillar',
    kind: 'shrine',
    x: 10,
    y: 5,
    lore: 'Touching the golden ley-stone infuses every hero with renewed tactical insight.',
    rewardJpAll: 45,
    rewardItem: { itemId: 'aether_tonic', count: 1 }
  },
  {
    id: 'poi_watchtower_cache',
    name: 'Northern Watch Cache',
    subtitle: 'Abandoned Armorer Vault',
    kind: 'chest',
    x: 14,
    y: 4,
    lore: 'Border scouts hid alchemical ember flasks here before retreating from Malakor.',
    rewardGold: 150,
    rewardItem: { itemId: 'ember_bomb', count: 1 }
  },
  {
    id: 'poi_glacial_obelisk',
    name: 'Glacial Ley-Obelisk',
    subtitle: 'Frostpeak Runestone',
    kind: 'shrine',
    x: 14,
    y: 1,
    lore: 'Ancient frost runes hum cleanly beneath the snow, sharpening your squad’s arcane arts.',
    rewardJpAll: 65,
    rewardItem: { itemId: 'aether_tonic', count: 1 }
  },
  {
    id: 'poi_coral_wreck',
    name: 'Gilded Galleon Wreck',
    subtitle: 'Coral Isle Salvage',
    kind: 'chest',
    x: 8,
    y: 17,
    lore: 'Across the coral shoals lies a royal treasury chest intact inside a beached caravel.',
    rewardGold: 220,
    rewardItem: { itemId: 'amulet_vitality', count: 1 }
  },
  {
    id: 'poi_oasis_vault',
    name: 'Sunfire Relic Vault',
    subtitle: 'Sunken Dune Shrine',
    kind: 'chest',
    x: 17,
    y: 17,
    lore: 'Buried beneath desert sandstone sit gilded coin coffers and volatile ember charges.',
    rewardGold: 200,
    rewardItem: { itemId: 'ember_bomb', count: 2 }
  },
  {
    id: 'poi_caldera_altar',
    name: 'Aether Rift Altar',
    subtitle: 'Obsidian Sanctum Shrine',
    kind: 'shrine',
    x: 19,
    y: 4,
    lore: 'Purifying this fractured ley-altar empowers your entire company for the siege of Malakor.',
    rewardJpAll: 80,
    rewardItem: { itemId: 'healing_draught', count: 2 }
  }
];

export interface SealStepProgress {
  id: string;
  label: string;
  detail: string;
  completed: boolean;
}

export interface OverworldQuestProgress {
  sealsRestored: number;
  totalSeals: number;
  villagesLiberated: number;
  totalVillages: number;
  bountiesCleared: number;
  totalBounties: number;
  patrolsRemaining: number;
  campaignComplete: boolean;
  seals: SealStepProgress[];
}

export function computeOverworldQuestProgress(
  visitedVillages: Set<string>,
  clearedEncounters: Set<string>,
  remainingPatrolCount: number
): OverworldQuestProgress {
  const villagesLiberated = OVERWORLD_VILLAGES.filter(v => visitedVillages.has(v.id)).length;
  const sealFrontier = villagesLiberated >= 3;
  const sealBastion = clearedEncounters.has('boss_orc_bastion');
  const sealCitadel = clearedEncounters.has('boss_eclipse_citadel');

  const regionalBossIds = ['boss_frost_keep', 'boss_orc_bastion', 'boss_dune_fortress', 'boss_eclipse_citadel'];
  const bountiesCleared = regionalBossIds.filter(id => clearedEncounters.has(id)).length;

  const seals: SealStepProgress[] = [
    {
      id: 'seal_frontier',
      label: 'Hearth Seal',
      detail: `Liberate 3+ Settlements (${villagesLiberated}/${OVERWORLD_VILLAGES.length})`,
      completed: sealFrontier
    },
    {
      id: 'seal_bastion',
      label: 'Bastion Seal',
      detail: "Defeat Warlord Kragg's Bastion",
      completed: sealBastion
    },
    {
      id: 'seal_citadel',
      label: 'Eclipse Seal',
      detail: 'Conquer Eclipse Dread Citadel',
      completed: sealCitadel
    }
  ];

  const sealsRestored = seals.filter(s => s.completed).length;
  return {
    sealsRestored,
    totalSeals: 3,
    villagesLiberated,
    totalVillages: OVERWORLD_VILLAGES.length,
    bountiesCleared,
    totalBounties: regionalBossIds.length,
    patrolsRemaining: remainingPatrolCount,
    campaignComplete: sealsRestored === 3,
    seals
  };
}

export interface OverworldPatrolSpec {
  id: string;
  name: string;
  subtitle: string;
  spriteAsset: 'orc_warrior' | 'orc_archer' | 'orc_warlord' | 'skeleton_idle' | 'undead_deathknight';
  x: number;
  y: number;
  patrolRoute: HexCoord[];
  isBoss: boolean;
  difficulty: number;
  rewardGold: number;
  rewardExp: number;
  rewardJp: number;
  enemies: {
    jobId: JobId;
    level: number;
    name: string;
    aiRole: 'melee' | 'ranged' | 'mage' | 'healer' | 'defender' | 'boss';
    isLeader?: boolean;
  }[];
}

export const INITIAL_OVERWORLD_PATROLS: OverworldPatrolSpec[] = [
  {
    id: 'patrol_bridge_orcs',
    name: 'Bridge Raiders',
    subtitle: 'Orcish Vanguard Band',
    spriteAsset: 'orc_warrior',
    x: 8,
    y: 5,
    patrolRoute: [
      { x: 8, y: 5 },
      { x: 9, y: 5 },
      { x: 7, y: 4 }
    ],
    isBoss: false,
    difficulty: 1,
    rewardGold: 180,
    rewardExp: 110,
    rewardJp: 55,
    enemies: [
      { jobId: 'guard', level: 1, name: 'Orcish Grunt', aiRole: 'defender' },
      { jobId: 'duelist', level: 1, name: 'Orcish Prowler', aiRole: 'melee' },
      { jobId: 'tirador', level: 1, name: 'Orcish Crossbow', aiRole: 'ranged' }
    ]
  },
  {
    id: 'patrol_forest_archers',
    name: 'Shadowwood Scouts',
    subtitle: 'Outlaw Ambush Pack',
    spriteAsset: 'orc_archer',
    x: 4,
    y: 7,
    patrolRoute: [
      { x: 4, y: 7 },
      { x: 5, y: 8 },
      { x: 3, y: 7 }
    ],
    isBoss: false,
    difficulty: 1,
    rewardGold: 165,
    rewardExp: 100,
    rewardJp: 50,
    enemies: [
      { jobId: 'tirador', level: 1, name: 'Shadow Arbalist', aiRole: 'ranged' },
      { jobId: 'explorador', level: 1, name: 'Forest Trapper', aiRole: 'melee' }
    ]
  },
  {
    id: 'patrol_mire_undead',
    name: 'Mire Revenants',
    subtitle: 'Risen Marsh Cohort',
    spriteAsset: 'skeleton_idle',
    x: 11,
    y: 10,
    patrolRoute: [
      { x: 11, y: 10 },
      { x: 12, y: 9 },
      { x: 10, y: 11 }
    ],
    isBoss: false,
    difficulty: 2,
    rewardGold: 220,
    rewardExp: 145,
    rewardJp: 70,
    enemies: [
      { jobId: 'guard', level: 2, name: 'Bone Sentinel', aiRole: 'defender' },
      { jobId: 'arcanist', level: 2, name: 'Mire Necromancer', aiRole: 'mage' },
      { jobId: 'explorador', level: 2, name: 'Marsh Stalker', aiRole: 'melee' }
    ]
  },
  {
    id: 'patrol_frost_clan',
    name: 'Frostfang Marauders',
    subtitle: 'Highland Snow Raiders',
    spriteAsset: 'orc_warrior',
    x: 10,
    y: 1,
    patrolRoute: [
      { x: 10, y: 1 },
      { x: 11, y: 3 },
      { x: 9, y: 2 }
    ],
    isBoss: false,
    difficulty: 2,
    rewardGold: 230,
    rewardExp: 155,
    rewardJp: 75,
    enemies: [
      { jobId: 'guard', level: 2, name: 'Glacier Shieldbearer', aiRole: 'defender' },
      { jobId: 'explorador', level: 2, name: 'Frostfang Tracker', aiRole: 'melee' },
      { jobId: 'tirador', level: 2, name: 'Icewind Skirmisher', aiRole: 'ranged' }
    ]
  },
  {
    id: 'patrol_dune_corsairs',
    name: 'Sunfire Corsairs',
    subtitle: 'Desert Sandbandits',
    spriteAsset: 'orc_archer',
    x: 17,
    y: 14,
    patrolRoute: [
      { x: 17, y: 14 },
      { x: 18, y: 15 },
      { x: 16, y: 14 }
    ],
    isBoss: false,
    difficulty: 2,
    rewardGold: 250,
    rewardExp: 170,
    rewardJp: 85,
    enemies: [
      { jobId: 'duelist', level: 2, name: 'Dune Scimitar', aiRole: 'melee' },
      { jobId: 'alquimista', level: 2, name: 'Ash Alchemist', aiRole: 'mage' },
      { jobId: 'tirador', level: 2, name: 'Sandhawk Sniper', aiRole: 'ranged' }
    ]
  },
  {
    id: 'boss_frost_keep',
    name: 'Jarldom of Icewind',
    subtitle: 'Frostpeak Alpine Keep',
    spriteAsset: 'orc_warlord',
    x: 11,
    y: 2,
    patrolRoute: [{ x: 11, y: 2 }],
    isBoss: true,
    difficulty: 2,
    rewardGold: 340,
    rewardExp: 210,
    rewardJp: 105,
    enemies: [
      { jobId: 'guard', level: 2, name: 'Icewall Huskarl', aiRole: 'defender' },
      { jobId: 'devoto', level: 2, name: 'Rime Shaman', aiRole: 'healer' },
      { jobId: 'duelist', level: 3, name: 'Thane Vorn', aiRole: 'boss', isLeader: true }
    ]
  },
  {
    id: 'boss_orc_bastion',
    name: "Warlord Kragg's Bastion",
    subtitle: 'Fortified Keep Garrison',
    spriteAsset: 'orc_warlord',
    x: 19,
    y: 9,
    patrolRoute: [{ x: 19, y: 9 }],
    isBoss: true,
    difficulty: 2,
    rewardGold: 360,
    rewardExp: 220,
    rewardJp: 110,
    enemies: [
      { jobId: 'guard', level: 2, name: 'Bastion Shieldwall', aiRole: 'defender' },
      { jobId: 'tirador', level: 2, name: 'Bastion Marksman', aiRole: 'ranged' },
      { jobId: 'duelist', level: 3, name: 'Warlord Kragg', aiRole: 'boss', isLeader: true }
    ]
  },
  {
    id: 'boss_dune_fortress',
    name: 'Crimson Sands Citadel',
    subtitle: 'Sunfire Desert Fortress',
    spriteAsset: 'undead_deathknight',
    x: 20,
    y: 16,
    patrolRoute: [{ x: 20, y: 16 }],
    isBoss: true,
    difficulty: 3,
    rewardGold: 440,
    rewardExp: 270,
    rewardJp: 135,
    enemies: [
      { jobId: 'guard', level: 3, name: 'Redstone Guardian', aiRole: 'defender' },
      { jobId: 'alquimista', level: 3, name: 'Solar Pyromancer', aiRole: 'mage' },
      { jobId: 'invocador', level: 3, name: 'Sandlord Kaelis', aiRole: 'boss', isLeader: true }
    ]
  },
  {
    id: 'boss_eclipse_citadel',
    name: 'Eclipse Dread Citadel',
    subtitle: 'Ashen Caldera Stronghold',
    spriteAsset: 'undead_deathknight',
    x: 21,
    y: 2,
    patrolRoute: [{ x: 21, y: 2 }],
    isBoss: true,
    difficulty: 3,
    rewardGold: 520,
    rewardExp: 320,
    rewardJp: 160,
    enemies: [
      { jobId: 'guard', level: 3, name: 'Dread Knight', aiRole: 'defender' },
      { jobId: 'arcanist', level: 3, name: 'Eclipse Conduit', aiRole: 'mage' },
      { jobId: 'devoto', level: 3, name: 'Bone Prelate', aiRole: 'healer' },
      { jobId: 'invocador', level: 4, name: 'Lord Malakor', aiRole: 'boss', isLeader: true }
    ]
  }
];

/**
 * Generates a tactical MissionData battle arena matching the Wesnoth hex where the encounter occurred!
 */
export function buildEncounterMission(
  patrol: Omit<OverworldPatrolSpec, 'spriteAsset'> & { spriteAsset: string },
  terrain: WesnothTerrainInfo,
  hexX: number,
  hexY: number
): MissionData {
  const spawnCoords = [
    { x: 1, z: 2 },
    { x: 1, z: 5 },
    { x: 2, z: 4 },
    { x: 2, z: 6 }
  ];
  const enemySlots = [
    { x: 7, z: 2, facing: 'west' as Direction },
    { x: 7, z: 5, facing: 'west' as Direction },
    { x: 6, z: 4, facing: 'west' as Direction },
    { x: 8, z: 3, facing: 'west' as Direction }
  ];

  const obstacles =
    terrain.overlayCategory === 'forest'
      ? [
          { x: 4, z: 2 },
          { x: 5, z: 6 },
          { x: 3, z: 4 }
        ]
      : terrain.baseCategory === 'castle' || terrain.baseCategory === 'volcanic'
        ? [
            { x: 4, z: 1 },
            { x: 4, z: 6 }
          ]
        : [
            { x: 4, z: 3 },
            { x: 5, z: 5 }
          ];

  return {
    id: `encounter_${patrol.id}_${hexX}_${hexY}`,
    title: patrol.name,
    description: `${patrol.subtitle} intercepted in ${terrain.name} (${terrain.code}).`,
    loreBriefing: `Scouts clash at ${getOverworldRegion(hexX, hexY, terrain)} (${hexX}, ${hexY}) amidst ${terrain.name}.`,
    region: getOverworldRegion(hexX, hexY, terrain),
    mapWidth: 10,
    mapHeight: 8,
    elevationSeed: terrain.battleBiomeSeed + hexX * 7 + hexY * 13,
    playerSpawns: spawnCoords,
    obstacles,
    enemies: patrol.enemies.map((e, i) => {
      const slot = enemySlots[i % enemySlots.length];
      return {
        jobId: e.jobId,
        level: e.level,
        x: slot.x,
        z: slot.z,
        facing: slot.facing,
        name: e.name,
        aiRole: e.aiRole,
        isLeader: e.isLeader
      };
    }),
    objectiveType: patrol.isBoss ? 'defeat_leader' : 'defeat_all',
    parTurns: patrol.isBoss ? 12 : 9,
    victoryCondition: patrol.isBoss ? 'Defeat the enemy commander' : 'Defeat all encounter foes',
    defeatCondition: 'All allied heroes fall in battle',
    rewardExp: patrol.rewardExp,
    rewardJp: patrol.rewardJp,
    rewardGold: patrol.rewardGold
  };
}
