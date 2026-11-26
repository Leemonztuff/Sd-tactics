import { JobId, MissionData, Direction } from '../types/game';
import { HexCoord } from './WesnothMapSystem';
import { WesnothTerrainInfo } from './WesnothTerrain';

/**
 * Authentic Wesnoth `.map` format (20x14 region of Valen & Wesnoth Bordermarch).
 * Uses real Wesnoth terrain codes:
 *   1 Kh = Royal Valen Keep (Player Start), 2 Kh = Orcish Bastion, 3 Kh = Eclipse Citadel
 *   Ch = Castle walls, Rr = Cobble Road, Re = Dirt Trail
 *   Gg / Gs = Green / Semi-dry Grass, Gg^Fp = Pine Forest, Gs^Fds = Deciduous Woods
 *   Hh = Hills, Mm = Impassable Mountains, Ds = Beach Sand
 *   Ww = Shallow Water, Wo = Deep Ocean, Wwf = River Ford, Ww^Bw| = Stone Bridge, Ss = Swamp
 *   Gg^Vh / Hh^Vhh = Villages
 */
export const VALEN_WESNOTH_MAP_TEXT = `
border_size=0
usage=map

Wo, Wo, Mm, Mm, Mm, Hh, Gg^Fp, Gg^Fp, Hh, Hh^Vhh, Mm, Mm, Gg^Fp, Gg^Fp, Hh, Mm, Mm, Wo, Wo, Wo
Wo, Gg^Fp, Gg^Fp, Hh, Gg^Fp, Gg, Gg^Fp, Gs, Rr, Rr, Hh, Gg^Fp, Gs, Gs^Fds, Hh, Ch, Ch, Mm, Wo, Wo
Wo, Gg, Ch, Ch, Gg, Gg^Vh, Gg, Rr, Rr, Gg, Rr, Gs, Ss, Ss, Rr, Ch, 3 Kh, Ch, Wo, Wo
Gg, Ch, 1 Kh, Ch, Rr, Rr, Rr, Rr, Gg, Gg^Fp, Rr, Gg^Fds, Ss, Gg, Rr, Rr, Ch, Gs, Ds, Wo
Gg, Gg, Ch, Rr, Rr, Gg, Gg^Fp, Gg, Ww, Wwf, Rr, Gs, Gg^Vh, Gg, Gs^Fds, Rr, Gs, Ds, Ww, Wo
Gg^Fp, Gg, Gg, Rr, Gs, Gs^Fds, Gg, Ww, Ww, Ww^Bw|, Rr, Rr, Rr, Gg, Hh, Rr, Gs, Ds, Ww, Wo
Gg^Fp, Gg^Fds, Gs, Rr, Rr, Gg, Ww, Ww, Wwf, Ww, Gs, Gg^Fp, Rr, Hh, Hh^Vhh, Rr, Gg, Ds, Ww, Wo
Hh, Gg^Fds, Gg, Gs, Rr, Re, Ww, Ds, Gg, Ww, Gg^Vh, Gs, Rr, Rr, Ch, Ch, Gg, Ds, Ww, Wo
Hh, Hh, Gg^Vh, Gs, Re, Re, Wwf, Ds, Gs, Ww, Gg, Ss, Ss, Rr, Ch, 2 Kh, Ch, Ds, Ww, Wo
Mm, Hh, Gg, Gg^Fp, Re, Gs, Ds, Ds, Ww, Ww, Ss, Ss, Gg^Fds, Rr, Gg, Ch, Gs, Ds, Ww, Wo
Mm, Mm, Hh, Gg^Fp, Gs^Fds, Ds, Ds, Ww, Ww, Wo, Ww, Gg, Gg^Fp, Gg, Gs, Ds, Ds, Ww, Wo, Wo
Wo, Mm, Mm, Hh, Ds, Ds, Ww, Ww, Wo, Wo, Ww, Ds, Ds, Ds, Ds, Ww, Ww, Wo, Wo, Wo
Wo, Wo, Wo, Ds, Ds, Ww, Wo, Wo, Wo, Wo, Wo, Ww, Ww, Ww, Ww, Wo, Wo, Wo, Wo, Wo
Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo, Wo
`;

export interface OverworldVillageSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  lore: string;
  rewardGold: number;
}

export const OVERWORLD_VILLAGES: OverworldVillageSpec[] = [
  {
    id: 'vil_oakhaven',
    name: 'Oakhaven Cottage',
    x: 5,
    y: 2,
    lore: 'Borderland farmers tend the western meadows and share provisions with the Order of the Dawn.',
    rewardGold: 80
  },
  {
    id: 'vil_highwatch',
    name: 'Highwatch Ridge',
    x: 9,
    y: 0,
    lore: 'Watchers on the northern crags track orcish warbands across the river.',
    rewardGold: 110
  },
  {
    id: 'vil_sunbrook',
    name: 'Sunbrook Hamlet',
    x: 12,
    y: 4,
    lore: 'A fortified river hamlet guarding the eastern cobble road.',
    rewardGold: 95
  },
  {
    id: 'vil_pinehollow',
    name: 'Pinehollow Glade',
    x: 2,
    y: 8,
    lore: 'Woodcutters and herbalists offering restorative tonics to weary knights.',
    rewardGold: 85
  },
  {
    id: 'vil_eastwatch',
    name: 'Eastwatch Stonehold',
    x: 14,
    y: 6,
    lore: 'Hillfolk clinging to the stone terraces above the orcish bastion.',
    rewardGold: 120
  }
];

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
    x: 7,
    y: 3,
    patrolRoute: [
      { x: 7, y: 3 },
      { x: 8, y: 2 },
      { x: 6, y: 3 }
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
    id: 'patrol_mire_undead',
    name: 'Mire Revenants',
    subtitle: 'Risen Marsh Cohort',
    spriteAsset: 'skeleton_idle',
    x: 11,
    y: 8,
    patrolRoute: [
      { x: 11, y: 8 },
      { x: 12, y: 7 },
      { x: 10, y: 9 }
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
    id: 'patrol_forest_archers',
    name: 'Shadowwood Scouts',
    subtitle: 'Outlaw Ambush Pack',
    spriteAsset: 'orc_archer',
    x: 4,
    y: 6,
    patrolRoute: [
      { x: 4, y: 6 },
      { x: 5, y: 7 },
      { x: 3, y: 6 }
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
    id: 'boss_orc_bastion',
    name: "Warlord Kragg's Bastion",
    subtitle: 'Fortified Keep Garrison',
    spriteAsset: 'orc_warlord',
    x: 15,
    y: 8,
    patrolRoute: [{ x: 15, y: 8 }],
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
    id: 'boss_eclipse_citadel',
    name: 'Eclipse Dread Citadel',
    subtitle: 'Northern Keep Stronghold',
    spriteAsset: 'undead_deathknight',
    x: 16,
    y: 2,
    patrolRoute: [{ x: 16, y: 2 }],
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
  patrol: OverworldPatrolSpec,
  terrain: WesnothTerrainInfo,
  hexX: number,
  hexY: number
): MissionData {
  const spawnCoords = [
    { x: 1, z: 3 },
    { x: 1, z: 5 },
    { x: 2, z: 4 }
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
      : terrain.baseCategory === 'castle'
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
    loreBriefing: `Scouts clash at Wesnoth sector (${hexX}, ${hexY}) amidst ${terrain.name}.`,
    region: terrain.name,
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
    victoryCondition: patrol.isBoss ? 'Defeat the enemy commander' : 'Defeat all encounter foes',
    defeatCondition: 'All allied heroes fall in battle',
    rewardExp: patrol.rewardExp,
    rewardJp: patrol.rewardJp,
    rewardGold: patrol.rewardGold
  };
}
