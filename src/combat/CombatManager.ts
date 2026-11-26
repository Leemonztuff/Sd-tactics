import { EntityData, StatusType } from '../types/game';
import { ABILITIES, TERRAIN_RULES } from '../game/GameConfig';
import { GridSystem } from '../world/GridSystem';
import { EntityManager } from '../entities/EntityManager';
import { calculateDamagePreview, AttackAngle } from './CombatFormulas';

export interface TargetOutcome {
  targetId: string;
  targetName: string;
  x: number;
  z: number;
  y: number;
  damage: number; // negative = heal
  isCrit: boolean;
  isHit: boolean;
  angle: AttackAngle;
  statusApplied?: StatusType;
  pushedTo?: { x: number; z: number; y: number };
  defeated: boolean;
}

export interface CombatResult {
  success: boolean;
  abilityId: string;
  outcomes: TargetOutcome[];
  message: string;
  expGained: number;
  jpGained: number;
}

export class CombatManager {
  constructor() {}

  public tickUnitStartOfTurn(unit: EntityData, grid: GridSystem): string[] {
    const logs: string[] = [];

    // Poison damage tick
    const poison = unit.statusEffects.find(s => s.type === 'poison' && s.duration > 0);
    if (poison && unit.isAlive) {
      const dmg = Math.max(6, Math.round(unit.stats.maxHp * 0.1));
      unit.stats.hp = Math.max(0, unit.stats.hp - dmg);
      logs.push(`${unit.name} suffers ${dmg} poison damage!`);
      if (unit.stats.hp === 0) {
        unit.isAlive = false;
        grid.setOccupant(unit.x, unit.z, null);
        logs.push(`${unit.name} succumbed to poison!`);
      }
    }

    // Terrain hazard damage tick
    const tile = grid.getTile(unit.x, unit.z);
    if (tile && unit.isAlive) {
      const rule = TERRAIN_RULES[tile.terrain];
      if (rule.hazardDamage > 0) {
        unit.stats.hp = Math.max(0, unit.stats.hp - rule.hazardDamage);
        logs.push(`${unit.name} takes ${rule.hazardDamage} damage from ${rule.name}!`);
        if (unit.stats.hp === 0) {
          unit.isAlive = false;
          grid.setOccupant(unit.x, unit.z, null);
          logs.push(`${unit.name} fell on ${rule.name}!`);
        }
      }
    }

    // Decrement durations
    unit.statusEffects = unit.statusEffects
      .map(s => ({ ...s, duration: s.duration - 1 }))
      .filter(s => s.duration > 0);

    return logs;
  }

  public executeAbility(
    attacker: EntityData,
    targetX: number,
    targetZ: number,
    abilityId: string,
    grid: GridSystem,
    entityManager: EntityManager,
    rng: () => number = Math.random
  ): CombatResult {
    const ability = ABILITIES[abilityId];
    if (!ability) {
      return { success: false, abilityId, outcomes: [], message: 'Invalid ability.', expGained: 0, jpGained: 0 };
    }

    if (attacker.stats.mp < ability.mpCost) {
      return { success: false, abilityId, outcomes: [], message: 'Not enough MP!', expGained: 0, jpGained: 0 };
    }

    // Collect affected tiles (single target or AoE)
    const affectedTiles =
      ability.aoeRadius > 0
        ? grid.getAoeTiles(targetX, targetZ, ability.aoeRadius)
        : [grid.getTile(targetX, targetZ)].filter(Boolean);

    const targets: EntityData[] = [];
    for (const tile of affectedTiles) {
      if (!tile) continue;
      const occupant = entityManager.getEntityAt(tile.x, tile.z);
      if (!occupant || !occupant.isAlive) continue;

      if (ability.targetType === 'self' && occupant.id === attacker.id) {
        targets.push(occupant);
      } else if (ability.targetType === 'ally' && occupant.faction === attacker.faction) {
        targets.push(occupant);
      } else if (ability.targetType === 'enemy' && occupant.faction !== attacker.faction) {
        targets.push(occupant);
      } else if (ability.targetType === 'tile' && occupant.id !== attacker.id) {
        targets.push(occupant);
      }
    }

    if (targets.length === 0) {
      return {
        success: false,
        abilityId,
        outcomes: [],
        message: `No valid targets in area for ${ability.name}.`,
        expGained: 0,
        jpGained: 0
      };
    }

    attacker.stats.mp -= ability.mpCost;
    const attackerTile = grid.getTile(attacker.x, attacker.z);
    const attackerY = attackerTile ? attackerTile.y : attacker.y;

    const outcomes: TargetOutcome[] = [];
    const messages: string[] = [];
    let expGained = 0;
    let jpGained = 0;

    for (const defender of targets) {
      const defTile = grid.getTile(defender.x, defender.z);
      const defenderY = defTile ? defTile.y : defender.y;
      const terrainRule = defTile ? TERRAIN_RULES[defTile.terrain] : TERRAIN_RULES.grass;

      const preview = calculateDamagePreview(attacker, defender, ability, attackerY, defenderY, terrainRule);

      // Hit check
      const roll = rng() * 100;
      if (roll > preview.hitChance) {
        outcomes.push({
          targetId: defender.id,
          targetName: defender.name,
          x: defender.x,
          z: defender.z,
          y: defenderY,
          damage: 0,
          isCrit: false,
          isHit: false,
          angle: preview.angle,
          defeated: false
        });
        messages.push(`${attacker.name}'s ${ability.name} missed ${defender.name}!`);
        continue;
      }

      if (ability.type === 'heal') {
        const healAmt = preview.estimatedDamage;
        defender.stats.hp = Math.min(defender.stats.maxHp, defender.stats.hp + healAmt);
        if (ability.id === 'elixir') {
          defender.statusEffects = defender.statusEffects.filter(s => s.type !== 'poison' && s.type !== 'slow' && s.type !== 'acid');
        }
        outcomes.push({
          targetId: defender.id,
          targetName: defender.name,
          x: defender.x,
          z: defender.z,
          y: defenderY,
          damage: -healAmt,
          isCrit: false,
          isHit: true,
          angle: 'front',
          defeated: false
        });
        messages.push(`${attacker.name} cast ${ability.name} on ${defender.name} (+${healAmt} HP).`);
        expGained += 20;
        jpGained += 12;
        continue;
      }

      if (ability.type === 'buff') {
        if (ability.statusEffect) {
          this.applyStatus(defender, ability.statusEffect, ability.statusDuration ?? 3);
        }
        outcomes.push({
          targetId: defender.id,
          targetName: defender.name,
          x: defender.x,
          z: defender.z,
          y: defenderY,
          damage: 0,
          isCrit: false,
          isHit: true,
          angle: 'front',
          statusApplied: ability.statusEffect,
          defeated: false
        });
        messages.push(`${attacker.name} applied ${ability.statusEffect?.toUpperCase()} to ${defender.name}!`);
        expGained += 15;
        jpGained += 10;
        continue;
      }

      // Physical / Magical / Debuff damage
      const isCrit = rng() * 100 < preview.critChance;
      const variance = 0.92 + rng() * 0.16;
      let dmg = Math.max(1, Math.round(preview.estimatedDamage * variance * (isCrit ? 1.45 : 1.0)));

      // Reaction skill mitigation: Shield Brace reduces frontal damage
      if (defender.reactionEquipped === 'brace_counter' && preview.angle === 'front' && ability.type === 'physical') {
        dmg = Math.max(1, Math.round(dmg * 0.85));
      }

      defender.stats.hp = Math.max(0, defender.stats.hp - dmg);
      let defeated = false;
      if (defender.stats.hp === 0) {
        defender.isAlive = false;
        defeated = true;
        grid.setOccupant(defender.x, defender.z, null);
      }

      let statusApplied: StatusType | undefined;
      if (ability.statusEffect && defender.isAlive) {
        this.applyStatus(defender, ability.statusEffect, ability.statusDuration ?? 3);
        statusApplied = ability.statusEffect;
      }

      let pushedTo: { x: number; z: number; y: number } | undefined;
      if (ability.pushDistance && ability.pushDistance > 0 && defender.isAlive) {
        pushedTo = this.tryKnockback(attacker, defender, ability.pushDistance, grid);
      }

      outcomes.push({
        targetId: defender.id,
        targetName: defender.name,
        x: defender.x,
        z: defender.z,
        y: defender.y,
        damage: dmg,
        isCrit,
        isHit: true,
        angle: preview.angle,
        statusApplied,
        pushedTo,
        defeated
      });

      const tags: string[] = [];
      if (isCrit) tags.push('CRIT');
      if (preview.angle === 'back') tags.push('BACK 1.5x');
      else if (preview.angle === 'side') tags.push('SIDE 1.25x');
      if (preview.heightDiff > 0) tags.push(`HIGH +${preview.heightDiff}`);
      if (pushedTo) tags.push('PUSHED');
      if (defeated) tags.push('KO');

      const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
      messages.push(`${attacker.name} used ${ability.name} on ${defender.name} for ${dmg} DMG${tagStr}.`);
      expGained += defeated ? 45 : 25;
      jpGained += defeated ? 25 : 15;
    }

    return {
      success: true,
      abilityId,
      outcomes,
      message: messages.join(' '),
      expGained,
      jpGained
    };
  }

  private applyStatus(target: EntityData, type: StatusType, duration: number) {
    const existing = target.statusEffects.find(s => s.type === type);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
    } else {
      target.statusEffects.push({ type, duration });
    }
  }

  private tryKnockback(
    attacker: EntityData,
    defender: EntityData,
    distance: number,
    grid: GridSystem
  ): { x: number; z: number; y: number } | undefined {
    const dx = Math.sign(defender.x - attacker.x);
    const dz = Math.sign(defender.z - attacker.z);
    // Normalize to cardinal axis
    const stepX = Math.abs(defender.x - attacker.x) >= Math.abs(defender.z - attacker.z) ? dx : 0;
    const stepZ = stepX === 0 ? dz : 0;
    if (stepX === 0 && stepZ === 0) return undefined;

    for (let i = 0; i < distance; i++) {
      const nx = defender.x + stepX;
      const nz = defender.z + stepZ;
      const nextTile = grid.getTile(nx, nz);
      const currTile = grid.getTile(defender.x, defender.z);
      if (!nextTile || !currTile || !nextTile.passable || nextTile.occupantId !== null) {
        break;
      }
      if (nextTile.y - currTile.y > 1) break; // Cannot knock up a tall cliff

      grid.setOccupant(defender.x, defender.z, null);
      defender.x = nx;
      defender.z = nz;
      defender.y = nextTile.y;
      grid.setOccupant(nx, nz, defender.id);
    }

    return { x: defender.x, z: defender.z, y: defender.y };
  }
}
