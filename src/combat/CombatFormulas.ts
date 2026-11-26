import { AbilityDefinition, Direction, EntityData, TerrainRule, TerrainType } from '../types/game';
import { TERRAIN_RULES } from '../game/GameConfig';

export type AttackAngle = 'front' | 'side' | 'back';

export interface SynergyTag {
  id:
    | 'conductive_water'
    | 'ignite_terrain'
    | 'thermal_blast'
    | 'corrosive_shatter'
    | 'venom_shock'
    | 'chrono_rupture'
    | 'solar_steam'
    | 'pincer_flank'
    | 'high_ground'
    | 'backstab';
  label: string;
  bonusLabel: string;
  multiplier: number;
  hitBonus?: number;
  accent: 'sky' | 'amber' | 'emerald' | 'purple' | 'rose';
}

export interface SynergyContext {
  defenderTerrainType?: TerrainType;
  allies?: EntityData[];
}

export interface DamagePreview {
  estimatedDamage: number;
  isHeal: boolean;
  hitChance: number; // 0..100
  critChance: number; // 0..100
  angle: AttackAngle;
  heightDiff: number;
  facingBonus: number;
  elevationBonus: number;
  synergies: SynergyTag[];
  synergyMultiplier: number;
}

export function hasStatus(entity: EntityData, statusType: string): boolean {
  return entity.statusEffects.some(s => s.type === statusType && s.duration > 0);
}

export function getEffectiveSpeed(entity: EntityData): number {
  let spd = entity.stats.spd;
  if (hasStatus(entity, 'haste')) spd = Math.round(spd * 1.5);
  if (hasStatus(entity, 'slow') || hasStatus(entity, 'snare')) spd = Math.max(4, Math.round(spd * 0.6));
  return spd;
}

export function calculateAttackAngle(
  attackerX: number,
  attackerZ: number,
  defenderX: number,
  defenderZ: number,
  defenderFacing: Direction
): AttackAngle {
  if (attackerX === defenderX && attackerZ === defenderZ) return 'front';

  const dx = defenderX - attackerX;
  const dz = defenderZ - attackerZ;

  // Determine the cardinal direction from attacker -> defender
  let approachDir: Direction;
  if (Math.abs(dx) >= Math.abs(dz)) {
    approachDir = dx > 0 ? 'east' : 'west';
  } else {
    approachDir = dz > 0 ? 'south' : 'north';
  }

  // If attacker moves east into a defender facing east, attacker is behind the defender
  if (approachDir === defenderFacing) {
    return 'back';
  }

  const opposite: Record<Direction, Direction> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  };

  if (approachDir === opposite[defenderFacing]) {
    return 'front';
  }

  return 'side';
}

export function getAngleMultiplier(angle: AttackAngle): number {
  if (angle === 'back') return 1.5;
  if (angle === 'side') return 1.25;
  return 1.0;
}

export function hasPincerAlly(
  attacker: EntityData,
  defender: EntityData,
  allies: EntityData[] = []
): boolean {
  return allies.some(
    ally =>
      ally.isAlive &&
      ally.id !== attacker.id &&
      ally.id !== defender.id &&
      ally.faction === attacker.faction &&
      Math.abs(ally.x - defender.x) + Math.abs(ally.z - defender.z) === 1
  );
}

export function evaluateCombatSynergies(
  attacker: EntityData,
  defender: EntityData,
  ability: AbilityDefinition,
  angle: AttackAngle,
  heightDiff: number,
  context?: SynergyContext
): { tags: SynergyTag[]; damageMultiplier: number; hitBonus: number } {
  const tags: SynergyTag[] = [];
  let damageMultiplier = 1.0;
  let hitBonus = 0;

  if (ability.type === 'heal' || ability.type === 'buff' || ability.targetType === 'self') {
    return { tags, damageMultiplier, hitBonus };
  }

  const defTerrain = context?.defenderTerrainType;

  // 1. Elemental Terrain Synergies
  if (ability.element === 'lightning' && defTerrain === 'water') {
    tags.push({
      id: 'conductive_water',
      label: 'Conductive Water',
      bonusLabel: '+25% · Chain',
      multiplier: 1.25,
      accent: 'sky'
    });
    damageMultiplier *= 1.25;
  } else if (ability.element === 'fire' && (defTerrain === 'grass' || defTerrain === 'mud')) {
    tags.push({
      id: 'ignite_terrain',
      label: 'Ignite Terrain',
      bonusLabel: '+20% · Burn',
      multiplier: 1.2,
      accent: 'amber'
    });
    damageMultiplier *= 1.2;
  } else if (ability.element === 'solar' && defTerrain === 'water') {
    tags.push({
      id: 'solar_steam',
      label: 'Solar Steam',
      bonusLabel: '+15% · Dazzle',
      multiplier: 1.15,
      accent: 'amber'
    });
    damageMultiplier *= 1.15;
  }

  // 2. Elemental & Status Combo Synergies
  if (ability.element === 'fire' && (hasStatus(defender, 'poison') || hasStatus(defender, 'acid'))) {
    tags.push({
      id: 'thermal_blast',
      label: 'Thermal Blast',
      bonusLabel: '+30% Combo',
      multiplier: 1.3,
      accent: 'rose'
    });
    damageMultiplier *= 1.3;
  }

  if (ability.type === 'physical' && hasStatus(defender, 'acid')) {
    tags.push({
      id: 'corrosive_shatter',
      label: 'Corrosive Shatter',
      bonusLabel: '+20% Crush',
      multiplier: 1.2,
      accent: 'emerald'
    });
    damageMultiplier *= 1.2;
  }

  if (ability.element === 'lightning' && (hasStatus(defender, 'poison') || hasStatus(defender, 'snare'))) {
    tags.push({
      id: 'venom_shock',
      label: 'Venom Shock',
      bonusLabel: '+20% Surge',
      multiplier: 1.2,
      accent: 'sky'
    });
    damageMultiplier *= 1.2;
  }

  if (ability.element === 'astral' && (hasStatus(defender, 'slow') || hasStatus(defender, 'snare'))) {
    tags.push({
      id: 'chrono_rupture',
      label: 'Chrono Rupture',
      bonusLabel: '+25% Astral',
      multiplier: 1.25,
      accent: 'purple'
    });
    damageMultiplier *= 1.25;
  }

  // 3. Squad Coordinated Pincer Flank
  if (hasPincerAlly(attacker, defender, context?.allies)) {
    tags.push({
      id: 'pincer_flank',
      label: 'Pincer Flank',
      bonusLabel: '+15% · +10 Hit',
      multiplier: 1.15,
      hitBonus: 10,
      accent: 'amber'
    });
    damageMultiplier *= 1.15;
    hitBonus += 10;
  }

  // 4. Positional Tactical Callouts (already factored into angle/elevation, surfaced cleanly)
  if (angle === 'back') {
    tags.push({
      id: 'backstab',
      label: 'Backstab',
      bonusLabel: '1.5× Angle',
      multiplier: 1.0,
      accent: 'rose'
    });
  }
  if (heightDiff > 0) {
    tags.push({
      id: 'high_ground',
      label: 'High Ground',
      bonusLabel: `+${Math.min(30, heightDiff * 10)}%`,
      multiplier: 1.0,
      accent: 'emerald'
    });
  }

  return { tags, damageMultiplier, hitBonus };
}

export function calculateHitChance(
  attacker: EntityData,
  defender: EntityData,
  ability: AbilityDefinition,
  defenderTerrain: TerrainRule,
  angle: AttackAngle,
  heightDiff: number,
  extraHitBonus: number = 0
): number {
  if (ability.type === 'heal' || ability.type === 'buff' || ability.targetType === 'self') {
    return 100;
  }

  let acc = attacker.stats.acc + (ability.hitBonus ?? 0) + extraHitBonus;
  if (hasStatus(attacker, 'focus')) acc += 15;
  if (heightDiff > 0) acc += Math.min(12, heightDiff * 6);

  let eva = defender.stats.eva + defenderTerrain.evasionBonus;
  if (hasStatus(defender, 'evade')) eva += 20;

  // Flanking negates evasion
  if (angle === 'side') eva = Math.floor(eva * 0.6);
  if (angle === 'back') eva = Math.floor(eva * 0.2);

  const chance = Math.max(45, Math.min(100, Math.round(acc - eva * 0.5)));
  return chance;
}

export function calculateDamagePreview(
  attacker: EntityData,
  defender: EntityData,
  ability: AbilityDefinition,
  attackerY: number,
  defenderY: number,
  defenderTerrain: TerrainRule = TERRAIN_RULES.grass,
  synergyContext?: SynergyContext
): DamagePreview {
  const heightDiff = attackerY - defenderY;
  const angle = calculateAttackAngle(attacker.x, attacker.z, defender.x, defender.z, defender.facing);
  const facingBonus = getAngleMultiplier(angle);
  const elevationBonus = 1.0 + Math.max(-0.15, Math.min(0.3, heightDiff * 0.1));
  const syn = evaluateCombatSynergies(attacker, defender, ability, angle, heightDiff, synergyContext);
  const hitChance = calculateHitChance(attacker, defender, ability, defenderTerrain, angle, heightDiff, syn.hitBonus);

  let critChance = 12;
  if (hasStatus(attacker, 'focus')) critChance += 20;
  if (angle === 'back') critChance += 15;
  if (syn.tags.some(t => t.id === 'pincer_flank')) critChance += 8;

  if (ability.type === 'heal') {
    const baseHeal = Math.max(12, Math.round(attacker.stats.matk * ability.power * 1.45));
    return {
      estimatedDamage: baseHeal,
      isHeal: true,
      hitChance: 100,
      critChance: 10,
      angle: 'front',
      heightDiff,
      facingBonus: 1.0,
      elevationBonus: 1.0,
      synergies: [],
      synergyMultiplier: 1.0
    };
  }

  if (ability.type === 'buff') {
    return {
      estimatedDamage: 0,
      isHeal: false,
      hitChance: 100,
      critChance: 0,
      angle: 'front',
      heightDiff,
      facingBonus: 1.0,
      elevationBonus: 1.0,
      synergies: [],
      synergyMultiplier: 1.0
    };
  }

  const defFactor = hasStatus(defender, 'acid') ? 0.65 : 1.0;
  const fortifyFactor = hasStatus(defender, 'fortify') ? 1.35 : 1.0;
  const wardFactor = hasStatus(defender, 'aether_shield') ? 1.35 : 1.0;

  let raw = 0;
  if (ability.type === 'physical') {
    const effDef = (defender.stats.def + defenderTerrain.defenseBonus) * defFactor * fortifyFactor;
    raw = attacker.stats.atk * ability.power * 1.6 - effDef * 0.65;
  } else {
    const effMdef = defender.stats.mdef * wardFactor;
    raw = attacker.stats.matk * ability.power * 1.65 - effMdef * 0.6;
  }

  const baseDmg = Math.max(4, Math.round(raw * facingBonus * elevationBonus));
  const finalDmg = Math.max(4, Math.round(baseDmg * syn.damageMultiplier));

  return {
    estimatedDamage: finalDmg,
    isHeal: false,
    hitChance,
    critChance: Math.min(80, critChance),
    angle,
    heightDiff,
    facingBonus,
    elevationBonus,
    synergies: syn.tags,
    synergyMultiplier: Number(syn.damageMultiplier.toFixed(2))
  };
}

export interface MissionStarEvaluation {
  stars: 1 | 2 | 3;
  bonusMultiplier: number;
  noFallen: boolean;
  withinPar: boolean;
}

export function calculateMissionStars(
  alliesFallen: number,
  turnsElapsed: number,
  parTurns: number
): MissionStarEvaluation {
  const noFallen = alliesFallen === 0;
  const withinPar = turnsElapsed <= parTurns;
  const stars = (1 + (noFallen ? 1 : 0) + (withinPar ? 1 : 0)) as 1 | 2 | 3;
  const bonusMultiplier = stars === 3 ? 0.5 : stars === 2 ? 0.25 : 0;
  return { stars, bonusMultiplier, noFallen, withinPar };
}
