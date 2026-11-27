import { Direction, JobId, MissionData } from '../types/game';
import { HexCoord, WesnothMapData, parseWesnothMap } from './WesnothMapSystem';
import { OverworldRecruitSpec } from './WesnothOverworldMap';
import { WesnothTerrainInfo } from './WesnothTerrain';

export interface OverworldRuinSpec {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  assetKey: string;
  scale: number;
  recommendedFloor: 1 | 2 | 3 | 4;
  lore: string;
}

export const OVERWORLD_RUINS: OverworldRuinSpec[] = [
  {
    id: 'ruin_valen_catacombs',
    name: 'Sunken Catacombs of Valen',
    subtitle: 'Ancient Dungeon Entrance',
    x: 6,
    y: 4,
    assetKey: 'scenery_castle_ruins2',
    scale: 1.38,
    recommendedFloor: 1,
    lore: 'Crumbling moss-draped arches conceal a stone stairwell descending into the forgotten 4-tier Vaults beneath Valen.'
  },
  {
    id: 'ruin_dwarven_mine',
    name: 'Abandoned Dwarven Shaft',
    subtitle: 'Subterranean Chasm Gate',
    x: 15,
    y: 5,
    assetKey: 'scenery_mine_abandoned',
    scale: 1.36,
    recommendedFloor: 2,
    lore: 'Rusted iron rails vanish beneath basalt cliffs into the flooded chasms and dwarven galleries below.'
  },
  {
    id: 'ruin_bone_ossuary',
    name: 'Duskwater Sunken Temple',
    subtitle: 'Crypt Descent Portal',
    x: 12,
    y: 10,
    assetKey: 'scenery_temple_cracked',
    scale: 1.34,
    recommendedFloor: 3,
    lore: 'Half-sunken obelisks mark an ancient necropolis stairway plunging toward the Subterranean Sea.'
  },
  {
    id: 'ruin_sunfire_vault',
    name: 'Sunfire Obsidian Ruins',
    subtitle: 'Abyssal Citadel Waygate',
    x: 18,
    y: 12,
    assetKey: 'scenery_ruins',
    scale: 1.34,
    recommendedFloor: 4,
    lore: 'Scorched sandstone monoliths hum with dark ley-energy, linking directly to unlocked depths of Vaelgor’s Abyss.'
  }
];

export type DungeonTrapKind = 'spike_plate' | 'fire_rune' | 'poison_vent' | 'frost_snare' | 'alarm_sigil';

export interface DungeonTrapSpec {
  id: string;
  name: string;
  kind: DungeonTrapKind;
  x: number;
  y: number;
  assetKey: string;
  woundPct: number;
  mpDrain: number;
  disarmGold: number;
  disarmJp: number;
  description: string;
}

export interface DungeonTreasureSpec {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  assetKey: string;
  openedAssetKey: string;
  rewardGold: number;
  rewardJpAll: number;
  rewardItem?: { itemId: string; count: number };
  lore: string;
}

export interface DungeonAllySpec {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  spriteAsset: string;
  lore: string;
  recruit: OverworldRecruitSpec;
}

export interface DungeonEnemySpec {
  id: string;
  name: string;
  subtitle: string;
  spriteAsset:
    | 'dun_enemy_rat'
    | 'dun_enemy_spider'
    | 'dun_enemy_firewisp'
    | 'dun_enemy_deathblade'
    | 'dun_enemy_draug'
    | 'dun_enemy_banebow'
    | 'dun_enemy_boneknight'
    | 'dun_enemy_sorcerer'
    | 'dun_enemy_lich'
    | 'skeleton_idle'
    | 'undead_deathknight';
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

export interface DungeonPropSpec {
  x: number;
  y: number;
  assetKey: string;
  scale?: number;
  flatDecal?: boolean;
}

export interface DungeonSanctuarySpec {
  id: string;
  name: string;
  x: number;
  y: number;
  lore: string;
}

export interface DungeonFloorSpec {
  floor: 1 | 2 | 3 | 4;
  name: string;
  subtitle: string;
  difficultyLabel: string;
  visionRadius: number;
  ambushScale: number;
  mapText: string;
  stairsUp: HexCoord;
  stairsDown: HexCoord | null;
  wardenEnemyId: string;
  enemies: DungeonEnemySpec[];
  traps: DungeonTrapSpec[];
  treasures: DungeonTreasureSpec[];
  allies: DungeonAllySpec[];
  sanctuaries: DungeonSanctuarySpec[];
  props: DungeonPropSpec[];
}

/**
 * Floor 1 (24x18): Sunken Catacombs of Valen
 * Stone catacomb corridors (Iyd/Iya), dark flagstones (Urb), ossuary & torchlit walls (Xoc/Xol/Xos).
 */
const FLOOR_1_MAP = `
border_size=0
usage=map

Xos, Xos, Xol, Xos, Xos, Xoc, Xos, Xos, Xol, Xos, Xos, Xos, Xoc, Xol, Xos, Xos, Xos, Xol, Xos, Xoc, Xos, Xol, Xos, Xos
Xos, Iyd, Iyd, Iyd, Xos, Iya, Iya, Urb, Iyd, Xos, Urb, Urb, Urb, Xos, Iyd, Iyd, Iya, Iyd, Xos, Iya, Iya, Iya, Iyd, Xos
Xol, Iyd, 1 Iyd, Iyd, Iyd, Iya, Xos, Urb, Iyd, Xol, Urb, Iya, Urb, Iyd, Iyd, Xos, Iya, Iyd, Iyd, Iya, Xoc, Xoc, Iyd, Xos
Xos, Iyd, Iyd, Iyd, Xos, Iya, Xos, Xos, Iyd, Xos, Xos, Urb, Xos, Xos, Iyd, Xos, Urb, Urb, Xos, Iya, Iyd, Iyd, Iyd, Xol
Xos, Xos, Iyd, Xos, Xos, Iyd, Iyd, Iyd, Iyd, Iyd, Xoc, Urb, Xoc, Iyd, Iyd, Xos, Urb, Urb, Iyd, Iyd, Iyd, Xos, Xos, Xos
Xos, Urb, Urb, Iyd, Xol, Iyd, Xoc, Xos, Xos, Iyd, Xos, Urb, Xos, Iyd, Xos, Xos, Xol, Urb, Xos, Xos, Iyd, Iyd, Iya, Xos
Xoc, Urb, Iya, Iyd, Iyd, Iyd, Iyd, Iyd, Xos, Iyd, Iyd, Urb, Iyd, Iyd, Iyd, Iyd, Iyd, Urb, Iyd, Xos, Iya, Iya, Iyd, Xol
Xos, Urb, Urb, Xos, Xos, Xos, Xol, Iyd, Xos, Xos, Iyd, Xos, Xos, Xol, Xos, Xos, Iyd, Xos, Iyd, Iyd, Iyd, Iya, Iyd, Xos
Xos, Xos, Iyd, Iyd, Iya, Xos, Iyd, Iyd, Iyd, Urb, Urb, Urb, Urb, Iyd, Xos, Iya, Iyd, Xos, Xos, Xoc, Xos, Xos, Iyd, Xos
Xol, Iyd, Iyd, Xos, Iya, Iya, Iya, Xos, Xos, Urb, Xoc, Xoc, Urb, Xos, Xos, Iya, Iyd, Iyd, Iyd, Iyd, Iyd, Xos, Iyd, Xol
Xos, Iyd, Xoc, Xos, Xos, Xol, Iya, Iyd, Iyd, Urb, Iyd, Iyd, Urb, Iyd, Iyd, Iya, Xos, Xos, Xol, Iyd, Iya, Iyd, Iyd, Xos
Xos, Iyd, Iyd, Iyd, Iyd, Iyd, Iya, Xos, Xos, Iyd, Iyd, Iyd, Iyd, Xos, Xos, Iyd, Iyd, Urb, Urb, Iyd, Xoc, Xos, Iyd, Xos
Xos, Xos, Xol, Xos, Xos, Iyd, Xos, Xos, Urb, Urb, Iya, Iya, Urb, Urb, Xos, Iyd, Xoc, Urb, Urb, Iyd, Iyd, Iyd, Iyd, Xol
Xos, Iya, Iya, Iyd, Xos, Iyd, Iyd, Iyd, Urb, Xos, Xos, Xol, Xos, Urb, Iyd, Iyd, Xos, Urb, Iya, Iyd, Xoc, Xos, Xos, Xos
Xol, Iya, Urb, Iyd, Iyd, Iyd, Xos, Xos, Iyd, Iyd, Iyd, Iyd, Xos, Urb, Urb, Iyd, Xos, Xol, Iya, Iyd, Iyd, Urb, Urb, Xos
Xos, Iya, Iya, Iyd, Xos, Iyd, Iyd, Xol, Iyd, Xos, Xoc, Iyd, Iyd, Iyd, Urb, Iyd, Iyd, Iyd, Iya, Iyd, Urb, Urb, 2 Urb, Xol
Xos, Xos, Xoc, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xol, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos
Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos
`;

/**
 * Floor 2 (24x18): Dwarven Chasm & Forgotten Mine
 * Abyssal chasm (Qxu), arched triple stone bridges (^Bsb/), minecart rails (^Br| / ^Br/), magma (Qlf), dwarven keeps (Cud/Kud), mushrooms (Uu^Uf), cave sanctuary (Uu^Vu).
 */
const FLOOR_2_MAP = `
border_size=0
usage=map

Xuc, Xuc, Xum, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc
Xuc, Uu, 1 Ur, Ur, Uu, Xum, Qxu, Qxu, Uu, Uu^Uf, Uu, Xuc, Cud, Kud, Cud, Xuc, Uu, Ur^Br|, Uu, Xum, Uu, Uu^Uf, Uu, Xuc
Xum, Uu, Ur, Xuc, Uu, Uu, Qxu^Bsb/, Qxu^Bsb/, Uu, Ur, Ur, Ur, Cud, Cud, Uu, Xuc, Uu, Ur^Br|, Uu, Ur, Ur, Uu, Uu, Xuc
Xuc, Uu^Uf, Ur, Xuc, Uu, Qxu, Qxu, Qxu, Qxu, Ur, Xum, Ur, Uu, Uu, Uu, Uu, Ur, Ur^Br/, Ur, Uu, Xuc, Uu, Uu, Xum
Xuc, Uu, Ur, Ur, Ur, Qxu, Qlf, Qlf, Qxu, Ur, Uu, Ur, Uu^Uf, Xuc, Xuc, Uu, Ur, Qxu, Qxu^Br|, Qxu, Xuc, Uu^Vu, Uu, Xuc
Xuc, Xuc, Xum, Xuc, Ur, Qxu^Bsb|, Qlf, Qxu, Qxu, Ur, Xuc, Uu, Uu, Uu, Uu, Uu, Ur, Qxu, Qxu^Br|, Qxu, Xuc, Uu, Xuc, Xuc
Xuc, Uu, Uu, Uu, Ur, Qxu, Qxu, Qxu, Uu, Ur, Xuc, Xum, Xuc, Uu, Uu^Uf, Ur, Ur, Qxu, Qxu^Br|, Qxu, Uu, Uu, Uu, Xuc
Xum, Uu, Uue, Uu, Ur, Ur, Uu, Uu, Uu, Ur, Ur, Ur, Uu, Uu, Ur, Ur, Uu, Qxu, Uu^Br|, Uu, Uu, Xum, Uu, Xuc
Xuc, Uue, Uue^Uf, Uue, Xuc, Ur, Uu^Uf, Xuc, Xuc, Xuc, Uu, Ur, Xuc, Uu, Ur, Xuc, Qxu, Qxu, Uu^Br/, Ur, Ur, Uu, Uu, Xum
Xuc, Uue, Uue, Xuc, Xuc, Ur, Uu, Uu, Uu, Uu, Uu, Ur, Uu, Uu, Ur, Uu, Uu, Uu, Ur^Br/, Uu, Xuc, Xuc, Uu, Xuc
Xuc, Xuc, Uue, Uu, Uu, Ur, Xuc, Xum, Uu, Cud, Cud, Ur, Uu, Xum, Ur, Uu^Uf, Uu, Ur, Ur, Uu, Uu, Uu, Uu, Xuc
Xuc, Uu, Uu, Uu, Xuc, Uu, Uu, Uu, Uu, Cud, Uu, Ur, Uu, Uu, Ur, Uu, Qxu, Qxu, Qxu, Qxu, Uu, Xuc, Uu, Xum
Xum, Uu, Uu^Uf, Uu, Uu, Uu, Qxu, Qxu, Qxu, Qxu, Uu, Ur, Ur, Uu, Ur, Qxu, Qxu^Bsb/, Qxu^Bsb/, Qxu, Uu, Uu, Uu, Uu, Xuc
Xuc, Xuc, Xuc, Uu, Xuc, Qxu, Qxu^Bsb/, Qxu^Bsb/, Qxu, Uu, Uu, Uu, Ur, Uu, Ur, Qxu, Qlf, Qlf, Qxu, Uu, Xuc, Uu, Uu, Xuc
Xuc, Uu, Uu, Uu, Uu, Qxu, Qxu, Qxu, Uu, Uu, Uu^Uf, Uu, Ur, Uu, Ur, Qxu, Qxu, Qxu, Uu, Uu, Uu, Cud, Cud, Xuc
Xuc, Uu, Uu^Uf, Uu, Uu, Uu, Uu, Uu, Uu, Xum, Xuc, Uu, Ur, Ur, Ur, Uu, Uu, Uu, Uu, Cud, Cud, 2 Kud, Cud, Xuc
Xuc, Xuc, Xum, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc
Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc, Xuc
`;

/**
 * Floor 3 (24x18): Bone Sanctum & Subterranean Sea
 * Dark flagstones (Urb), earthy caverns (Uue), underground sea (Ww) with stone bridges (^Bsb| / ^Bw/), ossuary keeps (Cud/Kud).
 */
const FLOOR_3_MAP = `
border_size=0
usage=map

Xoc, Xos, Xoc, Xos, Xos, Xuc, Xuc, Xuc, Xos, Xoc, Xos, Xos, Xoc, Xos, Xos, Xuc, Xuc, Xos, Xoc, Xos, Xos, Xoc, Xos, Xoc
Xos, Urb, 1 Urb, Urb, Uue, Xuc, Ww, Ww, Ww, Uue, Urb, Urb, Urb, Uue, Xoc, Ww, Ww, Uue, Urb, Urb, Uue, Uue^Uf, Uue, Xos
Xoc, Urb, Uue, Urb, Uue, Ww, Ww, Ww, Ww, Uue, Urb, Xos, Urb, Uue, Uue, Ww, Ww, Uue, Urb, Xos, Xoc, Uue, Urb, Xos
Xos, Uue, Uue^Uf, Urb, Uue, Ww^Bsb/, Ww^Bsb/, Ww, Uue, Uue, Urb, Xoc, Urb, Urb, Uue, Ww^Bw|, Uue, Uue, Urb, Urb, Urb, Uue, Urb, Xoc
Xos, Xoc, Xos, Urb, Uue, Ww, Ww, Ww, Uue, Urb, Urb, Uue, Uue, Urb, Xos, Ww, Ww, Uue, Xos, Xos, Urb, Xos, Urb, Xos
Xos, Uue, Urb, Urb, Uue, Uue, Ww, Ww, Uue, Uue^Uf, Xos, Uue, Uue, Urb, Uue, Uue, Uue, Uue, Urb, Urb, Urb, Xos, Urb, Xos
Xoc, Uue, Urb, Xos, Xoc, Urb, Urb, Urb, Urb, Uue, Uue, Uue, Xos, Urb, Urb, Urb, Xoc, Urb, Urb, Xos, Uue, Uue, Urb, Xoc
Xos, Uue, Urb, Urb, Urb, Urb, Xos, Xos, Urb, Xos, Xos, Uue, Uue, Uue, Qxu, Urb, Uue, Uue, Uue, Uue, Uue^Vu, Uue, Urb, Xos
Xos, Xos, Xoc, Xos, Urb, Uue, Uue, Uue, Urb, Urb, Urb, Urb, Uue, Qxu, Qxu, Urb, Xos, Xoc, Xos, Uue, Uue, Xos, Urb, Xos
Xos, Uue, Uue^Uf, Uue, Urb, Uue, Qxu, Qxu, Urb, Xoc, Xoc, Urb, Uue, Qxu^Bsb|, Qxu, Urb, Urb, Urb, Uue, Uue, Xos, Uue, Urb, Xos
Xoc, Uue, Urb, Urb, Urb, Qxu, Qxu, Ww, Urb, Uue, Uue, Urb, Uue, Uue, Uue, Uue, Xos, Urb, Urb, Uue, Uue, Uue, Urb, Xoc
Xos, Uue, Urb, Xos, Xos, Ww, Ww, Ww, Urb, Urb, Urb, Urb, Urb, Xos, Uue, Uue^Uf, Uue, Uue, Urb, Xos, Xos, Uue, Urb, Xos
Xos, Urb, Urb, Uue, Uue, Ww, Ww, Ww^Bw|, Ww, Ww, Uue, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Uue, Uue, Urb, Xos
Xoc, Urb, Xos, Xos, Uue, Uue, Ww, Ww, Ww, Uue, Uue, Xos, Urb, Xos, Xoc, Xos, Urb, Xos, Xos, Urb, Uue, Cud, Cud, Xos
Xos, Urb, Urb, Urb, Uue, Uue^Uf, Uue, Ww, Uue, Uue, Urb, Urb, Urb, Uue, Uue, Uue, Urb, Urb, Uue, Urb, Cud, Cud, Kud, Xos
Xos, Uue, Uue, Urb, Urb, Urb, Uue, Uue, Uue, Urb, Urb, Xos, Uue, Uue, Uue^Uf, Uue, Uue, Urb, Urb, Urb, Cud, 2 Kud, Cud, Xoc
Xos, Xoc, Xos, Xos, Xos, Xoc, Xos, Xos, Xos, Xos, Xoc, Xos, Xos, Xos, Xos, Xoc, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos
Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos
`;

/**
 * Floor 4 (24x18): Obsidian Abyss & Citadel of Vaelgor
 * Magma & chasm canyons (Qlf / Qxu), obsidian bridges (^Bsb| / ^Bsb/), torchlit dark citadels (Cud/Kud/Xol/Xos).
 */
const FLOOR_4_MAP = `
border_size=0
usage=map

Xos, Xol, Xos, Xos, Xoc, Xos, Xol, Xos, Xos, Xos, Xol, Xos, Xos, Xol, Xos, Xos, Xoc, Xos, Xol, Xos, Xos, Xol, Xos, Xos
Xos, Urb, 1 Urb, Urb, Xos, Urb, Urb, Urb, Qxu, Qlf, Qlf, Qxu, Urb, Urb, Urb, Xol, Urb, Urb, Urb, Urb, Xos, Urb, Urb, Xos
Xol, Urb, Iya, Urb, Urb, Urb, Xos, Urb, Qxu^Bsb|, Qlf, Qxu, Qxu, Urb, Xos, Urb, Urb, Urb, Xos, Xos, Urb, Urb, Urb, Iya, Xol
Xos, Urb, Urb, Xos, Xoc, Urb, Urb, Urb, Qxu, Qxu, Qlf, Qxu, Urb, Xos, Xoc, Urb, Iya, Urb, Xos, Urb, Xos, Xoc, Urb, Xos
Xos, Xos, Urb, Xos, Urb, Urb, Qxu, Qxu, Qxu, Qlf, Qlf, Qxu, Urb, Urb, Urb, Urb, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Xos
Xos, Iya, Urb, Urb, Urb, Qxu, Qxu, Qlf, Qlf, Qlf, Qxu, Qxu, Xol, Xos, Xos, Urb, Urb, Urb, Xos, Xol, Xos, Xos, Urb, Xol
Xol, Iya, Iya, Xos, Urb, Qxu^Bsb/, Qxu^Bsb/, Qlf, Qxu, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Qxu, Qxu, Qxu, Qlf, Qlf, Qxu, Urb, Xos
Xos, Urb, Urb, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Xos, Xoc, Urb, Xos, Xos, Urb, Qxu^Bsb|, Qlf, Qlf^Bsb|, Qlf, Qxu, Qxu, Urb, Xos
Xos, Urb, Xos, Xos, Xol, Urb, Xos, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Qxu, Qlf, Qxu, Qxu, Urb, Urb, Urb, Xos
Xos, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Xos, Xol, Xos, Urb, Xos, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Xos, Urb, Xol
Xol, Urb, Xoc, Xos, Urb, Qxu, Qxu, Qxu, Urb, Urb, Urb, Urb, Urb, Urb, Cud, Cud, Urb, Xos, Xoc, Urb, Xos, Xos, Urb, Xos
Xos, Urb, Urb, Urb, Urb, Qxu, Qlf, Qxu, Qxu, Xos, Urb, Xos, Xoc, Urb, Cud, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Xos
Xos, Xos, Xol, Xos, Urb, Qxu^Bsb|, Qlf, Qlf, Qxu, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Xos, Xos, Xol, Xos, Urb, Cud, Cud, Xos
Xos, Urb, Urb, Urb, Urb, Qxu, Qlf, Qxu, Qxu, Urb, Xos, Xol, Xos, Qxu, Qxu, Qlf, Qlf, Qxu, Urb, Urb, Cud, Cud, Kud, Xol
Xol, Urb, Uu^Vu, Urb, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Qxu^Bsb|, Qxu, Qlf, Qxu, Qxu, Urb, Cud, Cud, 2 Kud, Cud, Xos
Xos, Urb, Urb, Urb, Urb, Urb, Xoc, Xos, Urb, Urb, Urb, Xos, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Urb, Cud, Cud, Cud, Xos
Xos, Xos, Xol, Xos, Xos, Xos, Xos, Xos, Xos, Xol, Xos, Xos, Xos, Xoc, Xos, Xos, Xol, Xos, Xos, Xos, Xol, Xos, Xos, Xos
Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos, Xos
`;

export const DUNGEON_FLOORS: Record<1 | 2 | 3 | 4, DungeonFloorSpec> = {
  1: {
    floor: 1,
    name: 'Level 1 · Sunken Catacombs',
    subtitle: 'Valen Crypt Halls',
    difficultyLabel: 'Tier I · Lv.1–2',
    visionRadius: 4,
    ambushScale: 1,
    mapText: FLOOR_1_MAP,
    stairsUp: { x: 2, y: 2 },
    stairsDown: { x: 22, y: 15 },
    wardenEnemyId: 'dun_f1_warden',
    enemies: [
      {
        id: 'dun_f1_rats',
        name: 'Crypt Plague Pack',
        subtitle: 'Catacomb Scavengers',
        spriteAsset: 'dun_enemy_rat',
        x: 8,
        y: 3,
        patrolRoute: [
          { x: 8, y: 3 },
          { x: 8, y: 4 },
          { x: 7, y: 4 }
        ],
        isBoss: false,
        difficulty: 1,
        rewardGold: 135,
        rewardExp: 90,
        rewardJp: 45,
        enemies: [
          { jobId: 'explorador', level: 1, name: 'Plague Rat', aiRole: 'melee' },
          { jobId: 'explorador', level: 1, name: 'Crypt Nibbler', aiRole: 'melee' }
        ]
      },
      {
        id: 'dun_f1_sentries',
        name: 'Catacomb Bone Guard',
        subtitle: 'Risen Ossuary Watch',
        spriteAsset: 'skeleton_idle',
        x: 11,
        y: 6,
        patrolRoute: [
          { x: 11, y: 6 },
          { x: 11, y: 5 },
          { x: 12, y: 6 }
        ],
        isBoss: false,
        difficulty: 1,
        rewardGold: 160,
        rewardExp: 110,
        rewardJp: 55,
        enemies: [
          { jobId: 'guard', level: 1, name: 'Ossuary Shield', aiRole: 'defender' },
          { jobId: 'duelist', level: 1, name: 'Risen Pikeman', aiRole: 'melee' }
        ]
      },
      {
        id: 'dun_f1_banebow',
        name: 'Hollow Tomb Marksmen',
        subtitle: 'Skeletal Crossbow Squad',
        spriteAsset: 'dun_enemy_banebow',
        x: 6,
        y: 9,
        patrolRoute: [
          { x: 6, y: 9 },
          { x: 6, y: 10 },
          { x: 7, y: 10 }
        ],
        isBoss: false,
        difficulty: 2,
        rewardGold: 175,
        rewardExp: 120,
        rewardJp: 60,
        enemies: [
          { jobId: 'tirador', level: 2, name: 'Bone Arbalist', aiRole: 'ranged' },
          { jobId: 'guard', level: 1, name: 'Tomb Sentinel', aiRole: 'defender' }
        ]
      },
      {
        id: 'dun_f1_wisp',
        name: 'Brazier Wisp Choir',
        subtitle: 'Cursed Tomb Sparks',
        spriteAsset: 'dun_enemy_firewisp',
        x: 16,
        y: 6,
        patrolRoute: [
          { x: 16, y: 6 },
          { x: 17, y: 6 },
          { x: 17, y: 5 }
        ],
        isBoss: false,
        difficulty: 2,
        rewardGold: 185,
        rewardExp: 130,
        rewardJp: 65,
        enemies: [
          { jobId: 'arcanist', level: 2, name: 'Tomb Firewisp', aiRole: 'mage' },
          { jobId: 'duelist', level: 2, name: 'Crypt Stalker', aiRole: 'melee' }
        ]
      },
      {
        id: 'dun_f1_warden',
        name: 'Bone Warden Karth',
        subtitle: 'Level 1 Stairwell Boss',
        spriteAsset: 'undead_deathknight',
        x: 20,
        y: 14,
        patrolRoute: [{ x: 20, y: 14 }],
        isBoss: true,
        difficulty: 2,
        rewardGold: 280,
        rewardExp: 190,
        rewardJp: 95,
        enemies: [
          { jobId: 'guard', level: 2, name: 'Crypt Halberdier', aiRole: 'defender' },
          { jobId: 'tirador', level: 2, name: 'Ossuary Marksman', aiRole: 'ranged' },
          { jobId: 'guard', level: 2, name: 'Bone Warden Karth', aiRole: 'boss', isLeader: true }
        ]
      }
    ],
    traps: [
      {
        id: 'trap_f1_1',
        name: 'Rusted Spike Plate',
        kind: 'spike_plate',
        x: 4,
        y: 2,
        assetKey: 'scenery_slab',
        woundPct: 12,
        mpDrain: 1,
        disarmGold: 30,
        disarmJp: 25,
        description: 'Hidden iron floor pins spring upward when weight depresses the flagstone.'
      },
      {
        id: 'trap_f1_2',
        name: 'Ember Sigil Tile',
        kind: 'fire_rune',
        x: 11,
        y: 3,
        assetKey: 'scenery_rune2_glow',
        woundPct: 14,
        mpDrain: 1,
        disarmGold: 35,
        disarmJp: 30,
        description: 'Scorched masonry runes detonate a flash of crypt flame.'
      },
      {
        id: 'trap_f1_3',
        name: 'Miasma Dart Vent',
        kind: 'poison_vent',
        x: 14,
        y: 6,
        assetKey: 'scenery_rune3_glow',
        woundPct: 14,
        mpDrain: 2,
        disarmGold: 35,
        disarmJp: 30,
        description: 'Wall slits fire corroded needles coated in crypt venom.'
      },
      {
        id: 'trap_f1_4',
        name: 'Snare Tripwire',
        kind: 'frost_snare',
        x: 9,
        y: 9,
        assetKey: 'scenery_rune5_glow',
        woundPct: 10,
        mpDrain: 2,
        disarmGold: 30,
        disarmJp: 28,
        description: 'Taut copper wire seals the passage and chills intruders.'
      },
      {
        id: 'trap_f1_5',
        name: 'Necrotic Alarm Rune',
        kind: 'alarm_sigil',
        x: 18,
        y: 11,
        assetKey: 'scenery_rune6_glow',
        woundPct: 15,
        mpDrain: 1,
        disarmGold: 45,
        disarmJp: 35,
        description: 'Dread ward saps squad stamina and echoes through the crypt.'
      },
      {
        id: 'trap_f1_6',
        name: 'Vault Needle Trap',
        kind: 'spike_plate',
        x: 4,
        y: 11,
        assetKey: 'scenery_slab',
        woundPct: 12,
        mpDrain: 1,
        disarmGold: 40,
        disarmJp: 30,
        description: 'Rigged iron teeth protecting the western sarcophagus.'
      }
    ],
    treasures: [
      {
        id: 'tres_f1_1',
        name: 'Watchman’s Coffer',
        subtitle: 'Catacomb Treasury',
        x: 1,
        y: 5,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 110,
        rewardJpAll: 25,
        rewardItem: { itemId: 'healing_draught', count: 2 },
        lore: 'Sealed brass coffer left beside the western gatehouse.'
      },
      {
        id: 'tres_f1_2',
        name: 'Noble Sarcophagus',
        subtitle: 'Sunken Crypt',
        x: 12,
        y: 1,
        assetKey: 'item_coffin_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 130,
        rewardJpAll: 30,
        rewardItem: { itemId: 'steel_rapier', count: 1 },
        lore: 'Inside rests an engraved Valen officer’s rapier and silver coins.'
      },
      {
        id: 'tres_f1_3',
        name: 'Crypt Scholar’s Lectern',
        subtitle: 'Ancient Tome Cache',
        x: 22,
        y: 1,
        assetKey: 'item_book',
        openedAssetKey: 'item_book',
        rewardGold: 75,
        rewardJpAll: 55,
        rewardItem: { itemId: 'aether_tonic', count: 1 },
        lore: 'Weathered tactical codices preserve Valen’s lost shield formations.'
      },
      {
        id: 'tres_f1_4',
        name: 'Western Ossuary Chest',
        subtitle: 'Forgotten Cache',
        x: 1,
        y: 14,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 140,
        rewardJpAll: 25,
        rewardItem: { itemId: 'leather_armor', count: 1 },
        lore: 'Well-oiled Brigandine armor hidden inside a dry crypt alcove.'
      },
      {
        id: 'tres_f1_5',
        name: 'Ritual Chamber Vault',
        subtitle: 'Gilded Reliquary',
        x: 11,
        y: 11,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 180,
        rewardJpAll: 40,
        rewardItem: { itemId: 'ember_bomb', count: 2 },
        lore: 'Gilded temple chest shimmering beside the central summoning circle.'
      },
      {
        id: 'tres_f1_6',
        name: 'Warden’s Offering Urn',
        subtitle: 'Catacomb Spoils',
        x: 14,
        y: 14,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 160,
        rewardJpAll: 35,
        rewardItem: { itemId: 'healing_draught', count: 1 },
        lore: 'Tribute coins & Dawn draughts stacked beside the eastern stairwell.'
      }
    ],
    allies: [
      {
        id: 'ally_f1_garrick',
        name: 'Garrick the Ironbound',
        subtitle: 'Captive Royal Vanguard',
        x: 17,
        y: 2,
        spriteAsset: 'hero_lieutenant',
        lore: 'Captured during an earlier Dawn expedition, Garrick shatters the iron cage bars and pledges his tower shield.',
        recruit: {
          heroId: 'hero_garrick',
          name: 'Garrick',
          jobId: 'guard',
          level: 2,
          weaponId: 'iron_sword',
          armorId: 'plate_armor'
        }
      }
    ],
    sanctuaries: [],
    props: [
      { x: 4, y: 1, assetKey: 'scenery_gate_se', scale: 1.1 },
      { x: 9, y: 6, assetKey: 'scenery_dwarven_doors', scale: 1.05 },
      { x: 11, y: 10, assetKey: 'scenery_summoning', scale: 1.18, flatDecal: true },
      { x: 3, y: 2, assetKey: 'item_torch', scale: 0.72 },
      { x: 10, y: 2, assetKey: 'item_brazier_lit', scale: 0.85 },
      { x: 20, y: 3, assetKey: 'item_bones', scale: 0.82 },
      { x: 7, y: 12, assetKey: 'item_bonestack', scale: 0.88 },
      { x: 18, y: 14, assetKey: 'scenery_gate_sw', scale: 1.1 }
    ]
  },

  2: {
    floor: 2,
    name: 'Level 2 · Dwarven Chasm & Mine',
    subtitle: 'Abyssal Bridges & Galleries',
    difficultyLabel: 'Tier II · Lv.2–3',
    visionRadius: 4,
    ambushScale: 1.25,
    mapText: FLOOR_2_MAP,
    stairsUp: { x: 2, y: 1 },
    stairsDown: { x: 21, y: 15 },
    wardenEnemyId: 'dun_f2_warden',
    enemies: [
      {
        id: 'dun_f2_spiders',
        name: 'Chasm Brood Swarm',
        subtitle: 'Giant Cave Arachnids',
        spriteAsset: 'dun_enemy_spider',
        x: 9,
        y: 3,
        patrolRoute: [
          { x: 9, y: 3 },
          { x: 9, y: 4 },
          { x: 10, y: 2 }
        ],
        isBoss: false,
        difficulty: 2,
        rewardGold: 200,
        rewardExp: 145,
        rewardJp: 70,
        enemies: [
          { jobId: 'explorador', level: 2, name: 'Abyssal Weaver', aiRole: 'melee' },
          { jobId: 'alquimista', level: 2, name: 'Venom Spitter', aiRole: 'mage' }
        ]
      },
      {
        id: 'dun_f2_trestle_wisp',
        name: 'Magma Forge Wisps',
        subtitle: 'Overheated Mine Spirits',
        spriteAsset: 'dun_enemy_firewisp',
        x: 18,
        y: 4,
        patrolRoute: [
          { x: 18, y: 4 },
          { x: 18, y: 5 },
          { x: 17, y: 3 }
        ],
        isBoss: false,
        difficulty: 2,
        rewardGold: 220,
        rewardExp: 160,
        rewardJp: 75,
        enemies: [
          { jobId: 'arcanist', level: 2, name: 'Cinder Wisp', aiRole: 'mage' },
          { jobId: 'arcanist', level: 2, name: 'Slag Spark', aiRole: 'mage' }
        ]
      },
      {
        id: 'dun_f2_deathblades',
        name: 'Deep Tunnel Revenants',
        subtitle: 'Cursed Mine Vanguard',
        spriteAsset: 'dun_enemy_deathblade',
        x: 5,
        y: 7,
        patrolRoute: [
          { x: 5, y: 7 },
          { x: 4, y: 7 },
          { x: 5, y: 8 }
        ],
        isBoss: false,
        difficulty: 2,
        rewardGold: 235,
        rewardExp: 170,
        rewardJp: 80,
        enemies: [
          { jobId: 'duelist', level: 2, name: 'Mine Deathblade', aiRole: 'melee' },
          { jobId: 'tirador', level: 2, name: 'Tunnel Crossbow', aiRole: 'ranged' }
        ]
      },
      {
        id: 'dun_f2_bridge_guard',
        name: 'Dwarven Keep Undead',
        subtitle: 'Bastion Spectral Guard',
        spriteAsset: 'dun_enemy_draug',
        x: 10,
        y: 10,
        patrolRoute: [
          { x: 10, y: 10 },
          { x: 11, y: 9 },
          { x: 9, y: 10 }
        ],
        isBoss: false,
        difficulty: 3,
        rewardGold: 260,
        rewardExp: 190,
        rewardJp: 90,
        enemies: [
          { jobId: 'guard', level: 3, name: 'Iron Draug', aiRole: 'defender' },
          { jobId: 'duelist', level: 2, name: 'Vault Blade', aiRole: 'melee' },
          { jobId: 'devoto', level: 2, name: 'Dark Runepriest', aiRole: 'healer' }
        ]
      },
      {
        id: 'dun_f2_warden',
        name: 'Foreman Dregor the Damned',
        subtitle: 'Level 2 Dwarven Keep Boss',
        spriteAsset: 'undead_deathknight',
        x: 20,
        y: 14,
        patrolRoute: [{ x: 20, y: 14 }],
        isBoss: true,
        difficulty: 3,
        rewardGold: 360,
        rewardExp: 250,
        rewardJp: 120,
        enemies: [
          { jobId: 'guard', level: 3, name: 'Bastion Shieldbreaker', aiRole: 'defender' },
          { jobId: 'arcanist', level: 3, name: 'Magma Arcanist', aiRole: 'mage' },
          { jobId: 'duelist', level: 3, name: 'Foreman Dregor', aiRole: 'boss', isLeader: true }
        ]
      }
    ],
    traps: [
      {
        id: 'trap_f2_1',
        name: 'Span Trip-Plate',
        kind: 'spike_plate',
        x: 6,
        y: 2,
        assetKey: 'scenery_slab',
        woundPct: 14,
        mpDrain: 1,
        disarmGold: 40,
        disarmJp: 35,
        description: 'Pressure latch built into the northern chasm bridge.'
      },
      {
        id: 'trap_f2_2',
        name: 'Blasting Cap Rune',
        kind: 'fire_rune',
        x: 15,
        y: 3,
        assetKey: 'scenery_rune2_glow',
        woundPct: 16,
        mpDrain: 1,
        disarmGold: 45,
        disarmJp: 35,
        description: 'Unstable dwarven blasting powder linked to a spark glyph.'
      },
      {
        id: 'trap_f2_3',
        name: 'Spore Cloud Snare',
        kind: 'poison_vent',
        x: 9,
        y: 5,
        assetKey: 'scenery_rune3_glow',
        woundPct: 14,
        mpDrain: 2,
        disarmGold: 40,
        disarmJp: 35,
        description: 'Toxic cavern spores erupt from cracked subterranean stone.'
      },
      {
        id: 'trap_f2_4',
        name: 'Trestle Shock Rail',
        kind: 'frost_snare',
        x: 18,
        y: 7,
        assetKey: 'scenery_rune5_glow',
        woundPct: 14,
        mpDrain: 2,
        disarmGold: 45,
        disarmJp: 40,
        description: 'Electrified rail tie locks boots in place.'
      },
      {
        id: 'trap_f2_5',
        name: 'Southern Bridge Ward',
        kind: 'fire_rune',
        x: 7,
        y: 13,
        assetKey: 'scenery_rune2_glow',
        woundPct: 16,
        mpDrain: 1,
        disarmGold: 50,
        disarmJp: 40,
        description: 'Molten rune guarding the lower chasm crossing.'
      },
      {
        id: 'trap_f2_6',
        name: 'Keep Alarm Seal',
        kind: 'alarm_sigil',
        x: 16,
        y: 12,
        assetKey: 'scenery_rune6_glow',
        woundPct: 15,
        mpDrain: 2,
        disarmGold: 50,
        disarmJp: 40,
        description: 'Echoing runestone warning the dwarven garrison below.'
      },
      {
        id: 'trap_f2_7',
        name: 'Mire Spore Trap',
        kind: 'poison_vent',
        x: 2,
        y: 9,
        assetKey: 'scenery_rune3_glow',
        woundPct: 14,
        mpDrain: 1,
        disarmGold: 40,
        disarmJp: 35,
        description: 'Venomous subterranean mushroom spores concealed in dark earth.'
      }
    ],
    treasures: [
      {
        id: 'tres_f2_1',
        name: 'Dwarven Keep Vault',
        subtitle: 'Northern Stronghold',
        x: 13,
        y: 1,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 220,
        rewardJpAll: 45,
        rewardItem: { itemId: 'plate_armor', count: 1 },
        lore: 'Forged dwarven breastplate preserved behind the upper keep battlements.'
      },
      {
        id: 'tres_f2_2',
        name: 'Minecart Paychest',
        subtitle: 'Eastern Track',
        x: 22,
        y: 2,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 185,
        rewardJpAll: 35,
        rewardItem: { itemId: 'ember_bomb', count: 2 },
        lore: 'Powder kegs and miners’ gold wages stacked beside the tracks.'
      },
      {
        id: 'tres_f2_3',
        name: 'Runic Forge Anvil',
        subtitle: 'Ancient Shrine',
        x: 14,
        y: 6,
        assetKey: 'item_hammer_runic',
        openedAssetKey: 'item_altar',
        rewardGold: 140,
        rewardJpAll: 65,
        rewardItem: { itemId: 'ring_of_speed', count: 1 },
        lore: 'Runic hammer shrine pulsing with dwarven haste enchantments.'
      },
      {
        id: 'tres_f2_4',
        name: 'Western Mushroom Cache',
        subtitle: 'Grove Salvage',
        x: 1,
        y: 11,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 170,
        rewardJpAll: 35,
        rewardItem: { itemId: 'healing_draught', count: 2 },
        lore: 'Herbalists’ packs hidden beneath luminous cavern fungi.'
      },
      {
        id: 'tres_f2_5',
        name: 'Trestle Smuggler’s Box',
        subtitle: 'Chasm Ledge',
        x: 22,
        y: 9,
        assetKey: 'item_box',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 195,
        rewardJpAll: 40,
        rewardItem: { itemId: 'aether_tonic', count: 2 },
        lore: 'Aether flasks stowed inside an iron-strapped smuggling crate.'
      },
      {
        id: 'tres_f2_6',
        name: 'Lower Gallery Coffer',
        subtitle: 'Mining Treasury',
        x: 3,
        y: 14,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 230,
        rewardJpAll: 45,
        rewardItem: { itemId: 'amulet_vitality', count: 1 },
        lore: 'Gem-inlaid amulet resting in a dusty dwarven vault.'
      },
      {
        id: 'tres_f2_7',
        name: 'Obsidian Ledger Tome',
        subtitle: 'Foreman’s Archive',
        x: 11,
        y: 15,
        assetKey: 'item_book',
        openedAssetKey: 'item_book',
        rewardGold: 120,
        rewardJpAll: 70,
        lore: 'Deep-mine survey charts detailing arcane ley-currents.'
      }
    ],
    allies: [
      {
        id: 'ally_f2_bram',
        name: 'Bram Stonebolt',
        subtitle: 'Captive Dwarven Marksman',
        x: 19,
        y: 10,
        spriteAsset: 'ally_dwarven_explorer',
        lore: 'Trapped by Cave Spiders in the eastern gallery, veteran marksman Bram joins your company with his steel arbalest.',
        recruit: {
          heroId: 'hero_bram',
          name: 'Bram',
          jobId: 'tirador',
          level: 3,
          weaponId: 'composite_bow',
          armorId: 'plate_armor'
        }
      }
    ],
    sanctuaries: [
      {
        id: 'sanc_f2_1',
        name: 'Glowcap Miners’ Refuge',
        x: 21,
        y: 4,
        lore: 'Warm geothermal vents and clean spring water mend wounds and restore squad vigor.'
      }
    ],
    props: [
      { x: 13, y: 2, assetKey: 'item_brazier_lit', scale: 0.85 },
      { x: 12, y: 1, assetKey: 'scenery_dwarven_doors', scale: 1.05 },
      { x: 20, y: 15, assetKey: 'item_brazier_lit', scale: 0.85 },
      { x: 6, y: 14, assetKey: 'item_dragonstatue', scale: 1.05 },
      { x: 1, y: 7, assetKey: 'scenery_rubble', scale: 0.9 },
      { x: 11, y: 7, assetKey: 'item_torch', scale: 0.72 },
      { x: 22, y: 12, assetKey: 'item_bonestack', scale: 0.85 }
    ]
  },

  3: {
    floor: 3,
    name: 'Level 3 · Bone Sanctum & Dark Sea',
    subtitle: 'Subterranean Sea & Ossuary',
    difficultyLabel: 'Tier III · Lv.3–4',
    visionRadius: 3,
    ambushScale: 1.5,
    mapText: FLOOR_3_MAP,
    stairsUp: { x: 2, y: 1 },
    stairsDown: { x: 21, y: 15 },
    wardenEnemyId: 'dun_f3_warden',
    enemies: [
      {
        id: 'dun_f3_sea_arbalists',
        name: 'Darkwater Banebows',
        subtitle: 'Shoreline Phantom Archers',
        spriteAsset: 'dun_enemy_banebow',
        x: 8,
        y: 6,
        patrolRoute: [
          { x: 8, y: 6 },
          { x: 7, y: 6 },
          { x: 8, y: 8 }
        ],
        isBoss: false,
        difficulty: 3,
        rewardGold: 260,
        rewardExp: 200,
        rewardJp: 95,
        enemies: [
          { jobId: 'tirador', level: 3, name: 'Banebow Deadeye', aiRole: 'ranged' },
          { jobId: 'guard', level: 3, name: 'Sea Crypt Guard', aiRole: 'defender' }
        ]
      },
      {
        id: 'dun_f3_sorcerers',
        name: 'Sanctum Dark Coven',
        subtitle: 'Necromantic Ritualists',
        spriteAsset: 'dun_enemy_sorcerer',
        x: 15,
        y: 6,
        patrolRoute: [
          { x: 15, y: 6 },
          { x: 14, y: 6 },
          { x: 15, y: 5 }
        ],
        isBoss: false,
        difficulty: 3,
        rewardGold: 280,
        rewardExp: 215,
        rewardJp: 105,
        enemies: [
          { jobId: 'arcanist', level: 3, name: 'Dark Sorcerer', aiRole: 'mage' },
          { jobId: 'devoto', level: 3, name: 'Cursed Acolyte', aiRole: 'healer' },
          { jobId: 'duelist', level: 3, name: 'Bone Duelist', aiRole: 'melee' }
        ]
      },
      {
        id: 'dun_f3_draugs',
        name: 'Ossuary Draug Cohort',
        subtitle: 'Heavy Undead Champions',
        spriteAsset: 'dun_enemy_draug',
        x: 11,
        y: 11,
        patrolRoute: [
          { x: 11, y: 11 },
          { x: 10, y: 11 },
          { x: 12, y: 11 }
        ],
        isBoss: false,
        difficulty: 3,
        rewardGold: 300,
        rewardExp: 230,
        rewardJp: 110,
        enemies: [
          { jobId: 'guard', level: 3, name: 'Draug Champion', aiRole: 'defender' },
          { jobId: 'duelist', level: 3, name: 'Deathblade Stalker', aiRole: 'melee' }
        ]
      },
      {
        id: 'dun_f3_knights',
        name: 'Bone Knight Patrol',
        subtitle: 'Risen Dread Lancers',
        spriteAsset: 'dun_enemy_boneknight',
        x: 17,
        y: 12,
        patrolRoute: [
          { x: 17, y: 12 },
          { x: 16, y: 12 },
          { x: 18, y: 12 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 320,
        rewardExp: 250,
        rewardJp: 120,
        enemies: [
          { jobId: 'guard', level: 4, name: 'Bone Knight', aiRole: 'defender' },
          { jobId: 'tirador', level: 3, name: 'Abyssal Arbalist', aiRole: 'ranged' }
        ]
      },
      {
        id: 'dun_f3_spiders',
        name: 'Deep Sea Crawlers',
        subtitle: 'Cavern Web-Spinners',
        spriteAsset: 'dun_enemy_spider',
        x: 3,
        y: 14,
        patrolRoute: [
          { x: 3, y: 14 },
          { x: 4, y: 14 },
          { x: 3, y: 15 }
        ],
        isBoss: false,
        difficulty: 3,
        rewardGold: 270,
        rewardExp: 205,
        rewardJp: 95,
        enemies: [
          { jobId: 'explorador', level: 3, name: 'Gloom Crawler', aiRole: 'melee' },
          { jobId: 'alquimista', level: 3, name: 'Acid Arachnid', aiRole: 'mage' }
        ]
      },
      {
        id: 'dun_f3_warden',
        name: 'High Cultist Maelis',
        subtitle: 'Level 3 Sanctum Boss',
        spriteAsset: 'dun_enemy_sorcerer',
        x: 20,
        y: 14,
        patrolRoute: [{ x: 20, y: 14 }],
        isBoss: true,
        difficulty: 4,
        rewardGold: 450,
        rewardExp: 320,
        rewardJp: 150,
        enemies: [
          { jobId: 'guard', level: 4, name: 'Sanctum Draug', aiRole: 'defender' },
          { jobId: 'arcanist', level: 3, name: 'Void Conduit', aiRole: 'mage' },
          { jobId: 'invocador', level: 4, name: 'High Cultist Maelis', aiRole: 'boss', isLeader: true }
        ]
      }
    ],
    traps: [
      {
        id: 'trap_f3_1',
        name: 'Lake Bridge Rune',
        kind: 'fire_rune',
        x: 6,
        y: 3,
        assetKey: 'scenery_rune2_glow',
        woundPct: 16,
        mpDrain: 1,
        disarmGold: 50,
        disarmJp: 45,
        description: 'Arcane mine set along the arched stone causeway.'
      },
      {
        id: 'trap_f3_2',
        name: 'Ossuary Floor Blades',
        kind: 'spike_plate',
        x: 11,
        y: 4,
        assetKey: 'scenery_slab',
        woundPct: 16,
        mpDrain: 2,
        disarmGold: 55,
        disarmJp: 45,
        description: 'Razor-edged bone scythes concealed beneath dark flagstones.'
      },
      {
        id: 'trap_f3_3',
        name: 'Void Frost Seal',
        kind: 'frost_snare',
        x: 13,
        y: 9,
        assetKey: 'scenery_rune5_glow',
        woundPct: 14,
        mpDrain: 2,
        disarmGold: 55,
        disarmJp: 45,
        description: 'Freezing ward binding trespassers above the abyssal chasm.'
      },
      {
        id: 'trap_f3_4',
        name: 'Foul Sea Spore Vent',
        kind: 'poison_vent',
        x: 18,
        y: 6,
        assetKey: 'scenery_rune3_glow',
        woundPct: 16,
        mpDrain: 2,
        disarmGold: 50,
        disarmJp: 45,
        description: 'Sulfurous gas erupts from cracked cavern flagstones.'
      },
      {
        id: 'trap_f3_5',
        name: 'Crypt Bell Sigil',
        kind: 'alarm_sigil',
        x: 14,
        y: 12,
        assetKey: 'scenery_rune6_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 60,
        disarmJp: 50,
        description: 'Tolls an eerie psychic chime that drains squad resolve.'
      },
      {
        id: 'trap_f3_6',
        name: 'Southern Pier Snare',
        kind: 'spike_plate',
        x: 7,
        y: 12,
        assetKey: 'scenery_slab',
        woundPct: 16,
        mpDrain: 1,
        disarmGold: 55,
        disarmJp: 45,
        description: 'Barbed underwater bridge trap guarding the southern passage.'
      },
      {
        id: 'trap_f3_7',
        name: 'Sanctum Hellfire Seal',
        kind: 'fire_rune',
        x: 19,
        y: 13,
        assetKey: 'scenery_rune2_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 65,
        disarmJp: 50,
        description: 'High-voltage crimson rune protecting the stairwell keep.'
      },
      {
        id: 'trap_f3_8',
        name: 'West Gallery Ward',
        kind: 'poison_vent',
        x: 2,
        y: 7,
        assetKey: 'scenery_rune3_glow',
        woundPct: 15,
        mpDrain: 2,
        disarmGold: 50,
        disarmJp: 45,
        description: 'Noxious needle trap guarding the western corridor.'
      }
    ],
    treasures: [
      {
        id: 'tres_f3_1',
        name: 'Obsidian Lake Chest',
        subtitle: 'Northern Shore',
        x: 12,
        y: 1,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 240,
        rewardJpAll: 55,
        rewardItem: { itemId: 'mage_robes', count: 1 },
        lore: 'Silk-lined arcane vestments sealed inside a waterproof vault.'
      },
      {
        id: 'tres_f3_2',
        name: 'Eastern Crypt Coffin',
        subtitle: 'Sovereign Tomb',
        x: 22,
        y: 2,
        assetKey: 'item_coffin_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 260,
        rewardJpAll: 50,
        rewardItem: { itemId: 'valen_greatsword', count: 1 },
        lore: 'An ancient Dawn champion’s Valen Greatsword rests atop velvet cushions.'
      },
      {
        id: 'tres_f3_3',
        name: 'Necromancer’s Grimoire',
        subtitle: 'Dark Altar Cache',
        x: 11,
        y: 9,
        assetKey: 'item_book',
        openedAssetKey: 'item_book',
        rewardGold: 160,
        rewardJpAll: 80,
        rewardItem: { itemId: 'aether_tonic', count: 2 },
        lore: 'Forbidden ley-line treatises yield immense tactical insight.'
      },
      {
        id: 'tres_f3_4',
        name: 'Gilded Chasm Reliquary',
        subtitle: 'Southern Abyss',
        x: 1,
        y: 15,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 280,
        rewardJpAll: 55,
        rewardItem: { itemId: 'boots_of_striding', count: 1 },
        lore: 'Winged silver boots crafted for subterranean scouts.'
      },
      {
        id: 'tres_f3_5',
        name: 'Sunken Sea Strongbox',
        subtitle: 'Submerged Spoils',
        x: 11,
        y: 14,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 230,
        rewardJpAll: 50,
        rewardItem: { itemId: 'healing_draught', count: 2 },
        lore: 'Alchemical restoratives and coin hoards recovered from the shore.'
      },
      {
        id: 'tres_f3_6',
        name: 'Dark Key Treasury',
        subtitle: 'Vault of Shadows',
        x: 18,
        y: 15,
        assetKey: 'item_key_dark',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 290,
        rewardJpAll: 60,
        rewardItem: { itemId: 'ember_bomb', count: 2 },
        lore: 'Obsidian vault key opening the cultists’ war chest.'
      },
      {
        id: 'tres_f3_7',
        name: 'Western Bone Cache',
        subtitle: 'Silent Alcove',
        x: 1,
        y: 9,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 210,
        rewardJpAll: 45,
        rewardItem: { itemId: 'solar_censer', count: 1 },
        lore: 'A consecrated Solar Censer hidden far from the cultists.'
      },
      {
        id: 'tres_f3_8',
        name: 'Crystal Staff Pedestal',
        subtitle: 'Runic Alcove',
        x: 15,
        y: 14,
        assetKey: 'item_staff_magic',
        openedAssetKey: 'item_altar',
        rewardGold: 200,
        rewardJpAll: 65,
        rewardItem: { itemId: 'crystal_staff', count: 1 },
        lore: 'A pristine Crystal Staff humming above the dark stone plinth.'
      }
    ],
    allies: [
      {
        id: 'ally_f3_orin',
        name: 'Orin Runebrew',
        subtitle: 'Captive Dwarven Arcanist',
        x: 18,
        y: 2,
        spriteAsset: 'ally_dwarven_arcanister',
        lore: 'Dwarven scholar Orin breaks free of his iron cage and lends alchemical blasts and tonics to your vanguard.',
        recruit: {
          heroId: 'hero_orin',
          name: 'Orin',
          jobId: 'alquimista',
          level: 3,
          weaponId: 'steel_rapier',
          armorId: 'mage_robes'
        }
      }
    ],
    sanctuaries: [
      {
        id: 'sanc_f3_1',
        name: 'Silent Grotto Sanctuary',
        x: 20,
        y: 7,
        lore: 'A hidden dwarven shrine untouched by the cultists restores health and clarity.'
      }
    ],
    props: [
      { x: 10, y: 10, assetKey: 'item_altar_evil', scale: 1.0 },
      { x: 14, y: 10, assetKey: 'item_bonestack', scale: 0.9 },
      { x: 5, y: 6, assetKey: 'item_bones', scale: 0.85 },
      { x: 16, y: 3, assetKey: 'scenery_gate_se', scale: 1.08 },
      { x: 18, y: 8, assetKey: 'item_dragonstatue', scale: 1.08 },
      { x: 21, y: 13, assetKey: 'item_brazier_lit', scale: 0.88 }
    ]
  },

  4: {
    floor: 4,
    name: 'Level 4 · Obsidian Abyss & Lich Citadel',
    subtitle: 'Throne of Arch-Lich Vaelgor',
    difficultyLabel: 'Tier IV · Lv.4–5 Boss',
    visionRadius: 3,
    ambushScale: 1.75,
    mapText: FLOOR_4_MAP,
    stairsUp: { x: 2, y: 1 },
    stairsDown: null,
    wardenEnemyId: 'dun_f4_lich_boss',
    enemies: [
      {
        id: 'dun_f4_bridge_draug',
        name: 'Obsidian Span Phalanx',
        subtitle: 'Abyssal Chasm Defenders',
        spriteAsset: 'dun_enemy_draug',
        x: 7,
        y: 2,
        patrolRoute: [
          { x: 7, y: 2 },
          { x: 7, y: 3 },
          { x: 6, y: 3 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 330,
        rewardExp: 260,
        rewardJp: 125,
        enemies: [
          { jobId: 'guard', level: 4, name: 'Obsidian Draug', aiRole: 'defender' },
          { jobId: 'tirador', level: 4, name: 'Abyssal Banebow', aiRole: 'ranged' }
        ]
      },
      {
        id: 'dun_f4_firewisps',
        name: 'Hellfire Rift Elemental',
        subtitle: 'Magma Conduits',
        spriteAsset: 'dun_enemy_firewisp',
        x: 15,
        y: 2,
        patrolRoute: [
          { x: 15, y: 2 },
          { x: 16, y: 2 },
          { x: 15, y: 4 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 340,
        rewardExp: 270,
        rewardJp: 130,
        enemies: [
          { jobId: 'arcanist', level: 4, name: 'Hellfire Wisp', aiRole: 'mage' },
          { jobId: 'alquimista', level: 4, name: 'Magma Alchemist', aiRole: 'mage' }
        ]
      },
      {
        id: 'dun_f4_boneknights',
        name: 'Vaelgor’s Bone Knights',
        subtitle: 'Citadel Dread Cavalry',
        spriteAsset: 'dun_enemy_boneknight',
        x: 12,
        y: 8,
        patrolRoute: [
          { x: 12, y: 8 },
          { x: 11, y: 8 },
          { x: 13, y: 8 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 380,
        rewardExp: 300,
        rewardJp: 145,
        enemies: [
          { jobId: 'guard', level: 4, name: 'Dread Bone Knight', aiRole: 'defender' },
          { jobId: 'duelist', level: 4, name: 'Abyssal Deathblade', aiRole: 'melee' },
          { jobId: 'devoto', level: 4, name: 'Lich Prelate', aiRole: 'healer' }
        ]
      },
      {
        id: 'dun_f4_deathblades',
        name: 'Twin Abyssal Assassins',
        subtitle: 'Shadow Blade Coven',
        spriteAsset: 'dun_enemy_deathblade',
        x: 18,
        y: 9,
        patrolRoute: [
          { x: 18, y: 9 },
          { x: 17, y: 9 },
          { x: 19, y: 9 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 360,
        rewardExp: 290,
        rewardJp: 140,
        enemies: [
          { jobId: 'duelist', level: 4, name: 'Shadow Deathblade', aiRole: 'melee' },
          { jobId: 'explorador', level: 4, name: 'Rift Stalker', aiRole: 'melee' },
          { jobId: 'tirador', level: 4, name: 'Lich Sniper', aiRole: 'ranged' }
        ]
      },
      {
        id: 'dun_f4_sorcerers',
        name: 'Obsidian Circle Conclave',
        subtitle: 'Abyssal Spellcasters',
        spriteAsset: 'dun_enemy_sorcerer',
        x: 9,
        y: 14,
        patrolRoute: [
          { x: 9, y: 14 },
          { x: 8, y: 14 },
          { x: 10, y: 14 }
        ],
        isBoss: false,
        difficulty: 4,
        rewardGold: 390,
        rewardExp: 310,
        rewardJp: 150,
        enemies: [
          { jobId: 'invocador', level: 4, name: 'Abyssal Summoner', aiRole: 'mage' },
          { jobId: 'arcanist', level: 4, name: 'Dread Warlock', aiRole: 'mage' },
          { jobId: 'guard', level: 4, name: 'Citadel Sentinel', aiRole: 'defender' }
        ]
      },
      {
        id: 'dun_f4_lich_boss',
        name: 'Arch-Lich Vaelgor',
        subtitle: 'Sovereign of the Deep Vaults',
        spriteAsset: 'dun_enemy_lich',
        x: 21,
        y: 14,
        patrolRoute: [{ x: 21, y: 14 }],
        isBoss: true,
        difficulty: 5,
        rewardGold: 850,
        rewardExp: 550,
        rewardJp: 260,
        enemies: [
          { jobId: 'guard', level: 4, name: 'Vaelgor Honor Guard', aiRole: 'defender' },
          { jobId: 'tirador', level: 4, name: 'Sovereign Banebow', aiRole: 'ranged' },
          { jobId: 'devoto', level: 4, name: 'Lich Choir Priest', aiRole: 'healer' },
          { jobId: 'invocador', level: 5, name: 'Arch-Lich Vaelgor', aiRole: 'boss', isLeader: true }
        ]
      }
    ],
    traps: [
      {
        id: 'trap_f4_1',
        name: 'Chasm Glyph Mine',
        kind: 'fire_rune',
        x: 5,
        y: 2,
        assetKey: 'scenery_rune2_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 70,
        disarmJp: 55,
        description: 'High-energy flame ward etched before the northern chasm span.'
      },
      {
        id: 'trap_f4_2',
        name: 'Shatter-Blade Plate',
        kind: 'spike_plate',
        x: 13,
        y: 1,
        assetKey: 'scenery_slab',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 75,
        disarmJp: 55,
        description: 'Obsidian spikes spring across the upper stone corridor.'
      },
      {
        id: 'trap_f4_3',
        name: 'Abyssal Frost Seal',
        kind: 'frost_snare',
        x: 19,
        y: 4,
        assetKey: 'scenery_rune5_glow',
        woundPct: 16,
        mpDrain: 2,
        disarmGold: 70,
        disarmJp: 55,
        description: 'Deep-cold ward freezes armor joints near the eastern turn.'
      },
      {
        id: 'trap_f4_4',
        name: 'Magma Span Sigil',
        kind: 'fire_rune',
        x: 6,
        y: 6,
        assetKey: 'scenery_rune2_glow',
        woundPct: 20,
        mpDrain: 2,
        disarmGold: 80,
        disarmJp: 60,
        description: 'Searing magma glyph etched onto the central stone bridge.'
      },
      {
        id: 'trap_f4_5',
        name: 'Venom Mist Vent',
        kind: 'poison_vent',
        x: 15,
        y: 8,
        assetKey: 'scenery_rune3_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 75,
        disarmJp: 55,
        description: 'Corrosive fumes vent across the central obsidian hall.'
      },
      {
        id: 'trap_f4_6',
        name: 'Lich Alarm Ward',
        kind: 'alarm_sigil',
        x: 11,
        y: 10,
        assetKey: 'scenery_rune6_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 80,
        disarmJp: 60,
        description: 'Soul-draining obelisk warning Vaelgor’s citadel guard.'
      },
      {
        id: 'trap_f4_7',
        name: 'Southern Span Rune',
        kind: 'fire_rune',
        x: 5,
        y: 12,
        assetKey: 'scenery_rune2_glow',
        woundPct: 18,
        mpDrain: 2,
        disarmGold: 75,
        disarmJp: 55,
        description: 'Hellfire trigger planted above the molten chasm.'
      },
      {
        id: 'trap_f4_8',
        name: 'Citadel Approach Spikes',
        kind: 'spike_plate',
        x: 16,
        y: 15,
        assetKey: 'scenery_slab',
        woundPct: 20,
        mpDrain: 2,
        disarmGold: 85,
        disarmJp: 60,
        description: 'Heavy bone-tipped spikes guarding the Lich Citadel causeway.'
      },
      {
        id: 'trap_f4_9',
        name: 'Sanctuary Guard Seal',
        kind: 'frost_snare',
        x: 3,
        y: 14,
        assetKey: 'scenery_rune5_glow',
        woundPct: 15,
        mpDrain: 2,
        disarmGold: 70,
        disarmJp: 55,
        description: 'Rime glyph protecting the hidden lower cavern refuge.'
      }
    ],
    treasures: [
      {
        id: 'tres_f4_1',
        name: 'Sovereign Reliquary',
        subtitle: 'Abyssal Relic Vault',
        x: 22,
        y: 2,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 420,
        rewardJpAll: 85,
        rewardItem: { itemId: 'valen_greatsword', count: 1 },
        lore: 'Masterwork Valen Greatsword and ancient royal coinage.'
      },
      {
        id: 'tres_f4_2',
        name: 'Magma Span Strongbox',
        subtitle: 'Forgotten Cache',
        x: 1,
        y: 6,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 320,
        rewardJpAll: 65,
        rewardItem: { itemId: 'plate_armor', count: 1 },
        lore: 'Heat-forged royal plate resting inside the basalt alcove.'
      },
      {
        id: 'tres_f4_3',
        name: 'Vaelgor’s Astral Codex',
        subtitle: 'Lich Archive',
        x: 14,
        y: 11,
        assetKey: 'item_book',
        openedAssetKey: 'item_book',
        rewardGold: 220,
        rewardJpAll: 110,
        rewardItem: { itemId: 'aether_tonic', count: 2 },
        lore: 'Bound in blackened silver, this codex reveals forgotten astral arts.'
      },
      {
        id: 'tres_f4_4',
        name: 'Solar Relic Sarcophagus',
        subtitle: 'High Tomb',
        x: 16,
        y: 3,
        assetKey: 'item_coffin_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 340,
        rewardJpAll: 70,
        rewardItem: { itemId: 'solar_censer', count: 1 },
        lore: 'Radiant priestly censer sealed away from the Lich’s touch.'
      },
      {
        id: 'tres_f4_5',
        name: 'Abyssal Ordnance Vault',
        subtitle: 'War Cache',
        x: 1,
        y: 15,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 300,
        rewardJpAll: 65,
        rewardItem: { itemId: 'ember_bomb', count: 3 },
        lore: 'Volatile ember flasks stockpiled for a final siege.'
      },
      {
        id: 'tres_f4_6',
        name: 'Crown Jewelry Chest',
        subtitle: 'Royal Treasury',
        x: 22,
        y: 9,
        assetKey: 'item_chest_gold',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 450,
        rewardJpAll: 75,
        rewardItem: { itemId: 'ring_of_speed', count: 1 },
        lore: 'Enchanted signet ring stolen from Valen’s vaults generations ago.'
      },
      {
        id: 'tres_f4_7',
        name: 'Vitality Reliquary',
        subtitle: 'Citadel Shrine',
        x: 11,
        y: 12,
        assetKey: 'item_chest_closed',
        openedAssetKey: 'item_coffin_open',
        rewardGold: 290,
        rewardJpAll: 70,
        rewardItem: { itemId: 'amulet_vitality', count: 1 },
        lore: 'Warm amber amulet gleaming beside an ancient dwarven bastion.'
      },
      {
        id: 'tres_f4_8',
        name: 'Lich Throne Phylactery',
        subtitle: 'Sanctum Altar',
        x: 22,
        y: 13,
        assetKey: 'item_sceptre_fire',
        openedAssetKey: 'item_altar',
        rewardGold: 500,
        rewardJpAll: 120,
        rewardItem: { itemId: 'healing_draught', count: 3 },
        lore: 'Shattering Vaelgor’s golden reliquary floods the squad with arcane mastery.'
      }
    ],
    allies: [
      {
        id: 'ally_f4_seraphina',
        name: 'Seraphina Dawnweaver',
        subtitle: 'Captive Astral Summoner',
        x: 15,
        y: 5,
        spriteAsset: 'ally_duelist',
        lore: 'Rescued from the Abyssal Citadel cells, Astral Summoner Seraphina unleashes meteoric starfire against Vaelgor.',
        recruit: {
          heroId: 'hero_seraphina',
          name: 'Seraphina',
          jobId: 'invocador',
          level: 4,
          weaponId: 'crystal_staff',
          armorId: 'mage_robes',
          accessoryId: 'ring_of_speed'
        }
      }
    ],
    sanctuaries: [
      {
        id: 'sanc_f4_1',
        name: 'Emberlight Refuge',
        x: 2,
        y: 14,
        lore: 'A blessed Dawn brazier wards off the Abyssal chill and mends every wound.'
      }
    ],
    props: [
      { x: 14, y: 10, assetKey: 'item_brazier_lit', scale: 0.88 },
      { x: 20, y: 14, assetKey: 'item_altar_evil', scale: 1.05 },
      { x: 22, y: 15, assetKey: 'item_dragonstatue', scale: 1.1 },
      { x: 10, y: 9, assetKey: 'item_brazier_lit', scale: 0.85 },
      { x: 18, y: 2, assetKey: 'item_bonestack', scale: 0.9 },
      { x: 3, y: 2, assetKey: 'item_torch', scale: 0.72 },
      { x: 19, y: 14, assetKey: 'scenery_gate_sw', scale: 1.1 }
    ]
  }
};

export function parseDungeonFloorMap(floor: 1 | 2 | 3 | 4): WesnothMapData {
  return parseWesnothMap(DUNGEON_FLOORS[floor].mapText);
}

/**
 * Generates a dark subterranean tactical MissionData battle arena for Dungeon encounters!
 */
export function buildDungeonEncounterMission(
  enemy: Omit<DungeonEnemySpec, 'spriteAsset'> & { spriteAsset: string },
  floor: DungeonFloorSpec,
  terrain: WesnothTerrainInfo,
  hexX: number,
  hexY: number,
  squadWoundPct: number = 0
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
    floor.floor === 2 || floor.floor === 4
      ? [
          { x: 4, z: 1 },
          { x: 4, z: 6 },
          { x: 5, z: 3 }
        ]
      : [
          { x: 4, z: 2 },
          { x: 5, z: 5 }
        ];

  const woundNote =
    squadWoundPct > 0 ? ` Squad carries ${squadWoundPct}% trap fatigue.` : '';

  return {
    id: `dungeon_f${floor.floor}_${enemy.id}_${hexX}_${hexY}`,
    title: enemy.name,
    description: `${floor.name} · ${enemy.subtitle} in ${terrain.name}.${woundNote}`,
    loreBriefing: `Torchlight flickers across ${floor.name} (${hexX}, ${hexY}) as ${enemy.name} emerge from the shroud.`,
    region: floor.name,
    mapWidth: 10,
    mapHeight: 8,
    // Encode dungeon biome unambiguously (`>= 400`) for BattleDioramaBuilder
    elevationSeed: 400 + floor.floor * 13 + hexX * 5 + hexY * 7,
    playerSpawns: spawnCoords,
    obstacles,
    enemies: enemy.enemies.map((e, i) => {
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
    objectiveType: enemy.isBoss ? 'defeat_leader' : 'defeat_all',
    parTurns: enemy.isBoss ? 12 : 9,
    victoryCondition: enemy.isBoss ? 'Defeat the Floor Warden' : 'Destroy all dungeon foes',
    defeatCondition: 'All allied heroes fall in the depths',
    rewardExp: enemy.rewardExp,
    rewardJp: enemy.rewardJp,
    rewardGold: enemy.rewardGold
  };
}
