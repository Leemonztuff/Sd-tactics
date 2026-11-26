export type TerrainType = 'grass' | 'stone' | 'water' | 'mud' | 'high_ground' | 'hazard';

export interface TileData {
  x: number;
  z: number;
  y: number; // discrete elevation (0..4)
  terrain: TerrainType;
  movementCost: number;
  passable: boolean;
  blockLoS: boolean;
  occupantId: string | null;
  hasObstacle?: boolean;
}

export interface TerrainRule {
  name: string;
  movementCost: number;
  evasionBonus: number;
  defenseBonus: number;
  hazardDamage: number;
  passable: boolean;
}

export type Direction = 'north' | 'south' | 'east' | 'west';

export type JobId =
  | 'guard'
  | 'duelist'
  | 'arcanist'
  | 'devoto'
  | 'explorador'
  | 'tirador'
  | 'alquimista'
  | 'invocador';

export type BattleBiome = 'lowlands' | 'ruins' | 'caldera';

export type StatusType =
  | 'haste'
  | 'slow'
  | 'poison'
  | 'burn'
  | 'fortify'
  | 'aether_shield'
  | 'evade'
  | 'focus'
  | 'acid'
  | 'snare';

export interface StatusEffect {
  type: StatusType;
  duration: number;
}

export interface JobRequirement {
  jobId: JobId;
  level: number;
}

export interface JobDefinition {
  id: JobId;
  name: string;
  role: string;
  description: string;
  weaponType: string;
  armorType: string;
  requirements: JobRequirement[];
  statMultipliers: {
    hp: number;
    mp: number;
    atk: number;
    matk: number;
    def: number;
    mdef: number;
    spd: number;
    acc: number;
    eva: number;
    mov: number;
    jmp: number;
  };
  allowedAbilities: string[];
  passiveSkill: { id: string; name: string; description: string };
  reactionSkill: { id: string; name: string; description: string };
}

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  ctCost: number; // CT deducted after turn or action
  jpCost: number;
  range: number;
  aoeRadius: number; // 0 = single target, 1+ = diamond radius
  minHeightDiff: number;
  maxHeightDiff: number;
  requiresLoS: boolean;
  targetType: 'enemy' | 'ally' | 'self' | 'tile';
  type: 'physical' | 'magical' | 'heal' | 'buff' | 'debuff';
  power: number;
  hitBonus?: number;
  pushDistance?: number;
  element?: 'steel' | 'fire' | 'lightning' | 'solar' | 'venom' | 'acid' | 'astral';
  statusEffect?: StatusType;
  statusDuration?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory' | 'consumable';
  slot: 'weapon' | 'armor' | 'accessory' | 'consumable';
  price: number;
  allowedJobs?: JobId[];
  stats: {
    atk?: number;
    matk?: number;
    def?: number;
    mdef?: number;
    spd?: number;
    acc?: number;
    eva?: number;
    hp?: number;
    mp?: number;
    mov?: number;
    jmp?: number;
  };
  consumableEffect?: {
    targetType: 'ally' | 'enemy';
    range: number;
    aoeRadius: number;
    healHp?: number;
    healMp?: number;
    damage?: number;
    cureStatuses?: boolean;
  };
  description: string;
}

export interface CharacterStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  spd: number;
  acc: number;
  eva: number;
  mov: number;
  jmp: number;
  ct: number; // 0 to 100+
}

export interface EntityData {
  id: string;
  name: string;
  faction: 'player' | 'enemy';
  jobId: JobId;
  level: number;
  exp: number;
  jp: number;
  jobLevels: Partial<Record<JobId, number>>;
  x: number;
  z: number;
  y: number;
  facing: Direction;
  stats: CharacterStats;
  equipment: {
    weapon: string | null;
    armor: string | null;
    accessory: string | null;
  };
  equippedAbilities: string[];
  unlockedJobs: JobId[];
  unlockedAbilities: string[];
  passiveEquipped: string | null;
  reactionEquipped: string | null;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  aiRole?: 'melee' | 'ranged' | 'mage' | 'healer' | 'defender' | 'boss';
}

export interface MissionObstacle {
  x: number;
  z: number;
  height?: number;
}

export interface MissionData {
  id: string;
  title: string;
  description: string;
  loreBriefing: string;
  region: string;
  mapWidth: number;
  mapHeight: number;
  elevationSeed: number;
  playerSpawns: { x: number; z: number }[];
  obstacles: MissionObstacle[];
  enemies: {
    jobId: JobId;
    level: number;
    x: number;
    z: number;
    facing: Direction;
    name: string;
    aiRole: 'melee' | 'ranged' | 'mage' | 'healer' | 'defender' | 'boss';
    isLeader?: boolean;
  }[];
  objectiveType: 'defeat_all' | 'defeat_leader' | 'survive';
  surviveTurns?: number;
  parTurns?: number;
  victoryCondition: string;
  defeatCondition: string;
  rewardExp: number;
  rewardJp: number;
  rewardGold: number;
}

export interface OverworldSaveState {
  heroX: number;
  heroY: number;
  day: number;
  movetype: 'smallfoot' | 'mounted' | 'woodland' | 'orcishfoot';
  visitedVillages: string[];
  clearedEncounters: string[];
  collectedPois?: string[];
  activeWorldEvents?: {
    id: string;
    templateId: string;
    category: 'merchant' | 'supply_cache' | 'wayfarer' | 'omen';
    title: string;
    subtitle: string;
    x: number;
    y: number;
  }[];
  worldEventCooldown?: number;
}

export interface SaveData {
  version: number;
  gold: number;
  day: number;
  currentMissionIndex: number;
  roster: EntityData[];
  activeSquadIds?: string[];
  inventory: { itemId: string; count: number }[];
  completedMissions: string[];
  missionStars?: Record<string, number>;
  overworld?: OverworldSaveState;
  qualityTier?: 'eco' | 'balanced' | 'high';
}

export type BattlePhase =
  | 'ct_tick'
  | 'action_hub'
  | 'move_select'
  | 'moving'
  | 'action_select'
  | 'bag_select'
  | 'target_select'
  | 'resolving'
  | 'facing_select'
  | 'enemy_turn'
  | 'paused'
  | 'victory'
  | 'defeat';

export interface FloatingTextEvent {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  color: 'damage' | 'crit' | 'heal' | 'miss' | 'status';
  timestamp: number;
}
