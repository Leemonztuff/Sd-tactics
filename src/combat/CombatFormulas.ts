import { AbilityDefinition, Direction, EntityData, TerrainRule } from '../types/game';
import { TERRAIN_RULES } from '../game/GameConfig';

export type AttackAngle = 'front' | 'side' | 'back';

export interface DamagePreview {
  estimatedDamage: number;
  isHeal: boolean;
  hitChance: number; // 0..100
  critChance: number; // 0..100
  angle: AttackAngle;
  heightDiff: number;
  facingBonus: number;
  elevationBonus: number;
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

export function calculateHitChance(
  attacker: EntityData,
  defender: EntityData,
  ability: AbilityDefinition,
  defenderTerrain: TerrainRule,
  angle: AttackAngle,
  heightDiff: number
): number {
  if (ability.type === 'heal' || ability.type === 'buff' || ability.targetType === 'self') {
    return 100;
  }

  let acc = attacker.stats.acc + (ability.hitBonus ?? 0);
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
  defenderTerrain: TerrainRule = TERRAIN_RULES.grass
): DamagePreview {
  const heightDiff = attackerY - defenderY;
  const angle = calculateAttackAngle(attacker.x, attacker.z, defender.x, defender.z, defender.facing);
  const facingBonus = getAngleMultiplier(angle);
  const elevationBonus = 1.0 + Math.max(-0.15, Math.min(0.3, heightDiff * 0.1));
  const hitChance = calculateHitChance(attacker, defender, ability, defenderTerrain, angle, heightDiff);

  let critChance = 12;
  if (hasStatus(attacker, 'focus')) critChance += 20;
  if (angle === 'back') critChance += 15;

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
      elevationBonus: 1.0
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
      elevationBonus: 1.0
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

  const finalDmg = Math.max(4, Math.round(raw * facingBonus * elevationBonus));

  return {
    estimatedDamage: finalDmg,
    isHeal: false,
    hitChance,
    critChance: Math.min(80, critChance),
    angle,
    heightDiff,
    facingBonus,
    elevationBonus
  };
}
