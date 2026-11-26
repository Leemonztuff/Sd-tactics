import { EntityData, StatusType, TileData } from '../types/game';
import { ABILITIES, ITEMS, TERRAIN_RULES } from '../game/GameConfig';
import { GridSystem } from '../world/GridSystem';
import { EntityManager } from '../entities/EntityManager';
import { calculateDamagePreview, AttackAngle, SynergyTag } from './CombatFormulas';

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
  synergies?: SynergyTag[];
}

export interface ChainArcEvent {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  colorHex: number;
}

export interface CombatResult {
  success: boolean;
  abilityId: string;
  outcomes: TargetOutcome[];
  chainArcs?: ChainArcEvent[];
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

    // Burn damage tick
    const burn = unit.statusEffects.find(s => s.type === 'burn' && s.duration > 0);
    if (burn && unit.isAlive) {
      const dmg = Math.max(5, Math.round(unit.stats.maxHp * 0.08));
      unit.stats.hp = Math.max(0, unit.stats.hp - dmg);
      logs.push(`${unit.name} takes ${dmg} burn damage!`);
      if (unit.stats.hp === 0) {
        unit.isAlive = false;
        grid.setOccupant(unit.x, unit.z, null);
        logs.push(`${unit.name} fell to scorching flames!`);
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

  public getConsumableTargetTiles(originX: number, originZ: number, itemId: string, grid: GridSystem): TileData[] {
    const item = ITEMS[itemId];
    if (!item?.consumableEffect) return [];
    const { range } = item.consumableEffect;
    const results: TileData[] = [];
    for (let x = originX - range; x <= originX + range; x++) {
      for (let z = originZ - range; z <= originZ + range; z++) {
        if (Math.abs(x - originX) + Math.abs(z - originZ) > range) continue;
        const tile = grid.getTile(x, z);
        if (tile && !tile.hasObstacle) results.push(tile);
      }
    }
    return results;
  }

  public executeConsumable(
    user: EntityData,
    targetX: number,
    targetZ: number,
    itemId: string,
    grid: GridSystem,
    entityManager: EntityManager
  ): CombatResult {
    const item = ITEMS[itemId];
    const effect = item?.consumableEffect;
    if (!item || !effect) {
      return { success: false, abilityId: itemId, outcomes: [], message: 'Invalid consumable item.', expGained: 0, jpGained: 0 };
    }

    const affectedTiles =
      effect.aoeRadius > 0
        ? grid.getAoeTiles(targetX, targetZ, effect.aoeRadius)
        : [grid.getTile(targetX, targetZ)].filter(Boolean);

    const targets: EntityData[] = [];
    for (const tile of affectedTiles) {
      if (!tile) continue;
      const occupant = entityManager.getEntityAt(tile.x, tile.z);
      if (!occupant || !occupant.isAlive) continue;
      if (effect.targetType === 'ally' && occupant.faction === user.faction) {
        targets.push(occupant);
      } else if (effect.targetType === 'enemy' && occupant.faction !== user.faction) {
        targets.push(occupant);
      }
    }

    if (targets.length === 0) {
      return {
        success: false,
        abilityId: itemId,
        outcomes: [],
        message: `No valid targets in range for ${item.name}.`,
        expGained: 0,
        jpGained: 0
      };
    }

    const outcomes: TargetOutcome[] = [];
    const messages: string[] = [];

    for (const target of targets) {
      if (effect.damage && effect.damage > 0) {
        const defTile = grid.getTile(target.x, target.z);
        const igniteBonus = defTile && (defTile.terrain === 'grass' || defTile.terrain === 'mud') ? 1.2 : 1.0;
        const dmg = Math.max(1, Math.round(effect.damage * igniteBonus));
        target.stats.hp = Math.max(0, target.stats.hp - dmg);
        const defeated = target.stats.hp === 0;
        if (defeated) {
          target.isAlive = false;
          grid.setOccupant(target.x, target.z, null);
        } else if (igniteBonus > 1) {
          this.applyStatus(target, 'burn', 2);
        }
        outcomes.push({
          targetId: target.id,
          targetName: target.name,
          x: target.x,
          z: target.z,
          y: target.y,
          damage: dmg,
          isCrit: false,
          isHit: true,
          angle: 'front',
          statusApplied: !defeated && igniteBonus > 1 ? 'burn' : undefined,
          defeated
        });
        const tag = igniteBonus > 1 ? ' [IGNITE]' : '';
        messages.push(`${user.name} threw ${item.name} at ${target.name} for ${dmg} DMG${tag}.`);
      } else {
        let healedHp = 0;
        if (effect.healHp && effect.healHp > 0) {
          const before = target.stats.hp;
          target.stats.hp = Math.min(target.stats.maxHp, target.stats.hp + effect.healHp);
          healedHp = target.stats.hp - before;
        }
        if (effect.healMp && effect.healMp > 0) {
          target.stats.mp = Math.min(target.stats.maxMp, target.stats.mp + effect.healMp);
        }
        if (effect.cureStatuses) {
          target.statusEffects = target.statusEffects.filter(
            s => s.type !== 'poison' && s.type !== 'burn' && s.type !== 'slow' && s.type !== 'acid' && s.type !== 'snare'
          );
        }
        outcomes.push({
          targetId: target.id,
          targetName: target.name,
          x: target.x,
          z: target.z,
          y: target.y,
          damage: healedHp > 0 ? -healedHp : 0,
          isCrit: false,
          isHit: true,
          angle: 'front',
          statusApplied: effect.healMp ? 'focus' : undefined,
          defeated: false
        });
        const detail = effect.healHp
          ? `+${effect.healHp} HP`
          : effect.healMp
            ? `+${effect.healMp} MP`
            : 'Restored';
        messages.push(`${user.name} used ${item.name} on ${target.name} (${detail}).`);
      }
    }

    return {
      success: true,
      abilityId: itemId,
      outcomes,
      message: messages.join(' '),
      expGained: 15,
      jpGained: 10
    };
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
    const allUnits = entityManager.getAllEntities();

    const outcomes: TargetOutcome[] = [];
    const chainArcs: ChainArcEvent[] = [];
    const messages: string[] = [];
    let expGained = 0;
    let jpGained = 0;

    for (const defender of targets) {
      const defTile = grid.getTile(defender.x, defender.z);
      const defenderY = defTile ? defTile.y : defender.y;
      const terrainRule = defTile ? TERRAIN_RULES[defTile.terrain] : TERRAIN_RULES.grass;

      const preview = calculateDamagePreview(
        attacker,
        defender,
        ability,
        attackerY,
        defenderY,
        terrainRule,
        {
          defenderTerrainType: defTile?.terrain,
          allies: allUnits
        }
      );

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
          defender.statusEffects = defender.statusEffects.filter(
            s => s.type !== 'poison' && s.type !== 'burn' && s.type !== 'slow' && s.type !== 'acid'
          );
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
        if (ability.id === 'spirit_bond') {
          this.applyStatus(defender, 'aether_shield', ability.statusDuration ?? 3);
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

      // Physical / Magical / Debuff damage (synergies already folded into preview.estimatedDamage)
      const isCrit = rng() * 100 < preview.critChance;
      const variance = 0.92 + rng() * 0.16;
      let dmg = Math.max(1, Math.round(preview.estimatedDamage * variance * (isCrit ? 1.45 : 1.0)));

      const tags: string[] = [];
      for (const syn of preview.synergies) {
        if (syn.id === 'conductive_water') tags.push('CONDUCTIVE');
        else if (syn.id === 'ignite_terrain') tags.push('IGNITE');
        else if (syn.id === 'thermal_blast') tags.push('THERMAL BLAST');
        else if (syn.id === 'corrosive_shatter') tags.push('SHATTER');
        else if (syn.id === 'venom_shock') tags.push('VENOM SHOCK');
        else if (syn.id === 'chrono_rupture') tags.push('CHRONO RUPTURE');
        else if (syn.id === 'solar_steam') tags.push('SOLAR STEAM');
        else if (syn.id === 'pincer_flank') tags.push('PINCER');
      }

      // Reaction skill mitigation
      if (defender.reactionEquipped === 'brace_counter' && preview.angle === 'front' && ability.type === 'physical') {
        dmg = Math.max(1, Math.round(dmg * 0.85));
        tags.push('BRACED');
      } else if (defender.reactionEquipped === 'mana_ward' && ability.type === 'magical') {
        dmg = Math.max(1, Math.round(dmg * 0.8));
        tags.push('MANA WARD');
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

      // Secondary synergy status triggers
      if (defender.isAlive) {
        if (preview.synergies.some(s => s.id === 'ignite_terrain')) {
          this.applyStatus(defender, 'burn', 2);
          statusApplied = statusApplied ?? 'burn';
        } else if (preview.synergies.some(s => s.id === 'solar_steam')) {
          this.applyStatus(defender, 'slow', 1);
          statusApplied = statusApplied ?? 'slow';
        }
      }

      // Pincer Flank visual beam between flanking ally and target
      if (preview.synergies.some(s => s.id === 'pincer_flank')) {
        const flanker = allUnits.find(
          u =>
            u.isAlive &&
            u.id !== attacker.id &&
            u.id !== defender.id &&
            u.faction === attacker.faction &&
            Math.abs(u.x - defender.x) + Math.abs(u.z - defender.z) === 1
        );
        if (flanker) {
          chainArcs.push({
            fromX: flanker.x,
            fromY: flanker.y,
            fromZ: flanker.z,
            toX: defender.x,
            toY: defenderY,
            toZ: defender.z,
            colorHex: 0xfacc15
          });
        }
      }

      // Reaction reflex triggers when surviving a hit
      if (defender.isAlive) {
        if (defender.reactionEquipped === 'smoke_screen') {
          this.applyStatus(defender, 'evade', 1);
          tags.push('SMOKESCREEN');
        } else if (defender.reactionEquipped === 'riposte') {
          this.applyStatus(defender, 'evade', 1);
          tags.push('REFLEX');
        }
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
        defeated,
        synergies: preview.synergies
      });

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

      // Conductive water chain splash onto orthogonally adjacent water-bound units
      const isConductiveWater = preview.synergies.some(s => s.id === 'conductive_water');
      if (isConductiveWater) {
        const splashDmg = Math.max(4, Math.round(dmg * 0.5));
        const adj = [
          { x: defender.x + 1, z: defender.z },
          { x: defender.x - 1, z: defender.z },
          { x: defender.x, z: defender.z + 1 },
          { x: defender.x, z: defender.z - 1 }
        ];
        for (const pos of adj) {
          const adjTile = grid.getTile(pos.x, pos.z);
          if (!adjTile || adjTile.terrain !== 'water') continue;
          const chainTarget = entityManager.getEntityAt(pos.x, pos.z);
          if (!chainTarget || !chainTarget.isAlive || chainTarget.id === defender.id || chainTarget.id === attacker.id) {
            continue;
          }
          chainTarget.stats.hp = Math.max(0, chainTarget.stats.hp - splashDmg);
          const chainKo = chainTarget.stats.hp === 0;
          if (chainKo) {
            chainTarget.isAlive = false;
            grid.setOccupant(chainTarget.x, chainTarget.z, null);
          }
          chainArcs.push({
            fromX: defender.x,
            fromY: defenderY,
            fromZ: defender.z,
            toX: chainTarget.x,
            toY: chainTarget.y,
            toZ: chainTarget.z,
            colorHex: 0x38bdf8
          });
          outcomes.push({
            targetId: chainTarget.id,
            targetName: chainTarget.name,
            x: chainTarget.x,
            z: chainTarget.z,
            y: chainTarget.y,
            damage: splashDmg,
            isCrit: false,
            isHit: true,
            angle: 'front',
            defeated: chainKo
          });
          messages.push(`Water conducts ${splashDmg} shock DMG to ${chainTarget.name}!`);
        }
      }

      // Riposte counter-poke against adjacent physical attacks
      const distAfter = Math.abs(attacker.x - defender.x) + Math.abs(attacker.z - defender.z);
      if (
        defender.isAlive &&
        attacker.isAlive &&
        defender.reactionEquipped === 'riposte' &&
        ability.type === 'physical' &&
        ability.range === 1 &&
        distAfter === 1
      ) {
        const counterDmg = Math.max(5, Math.round(defender.stats.atk * 0.35));
        attacker.stats.hp = Math.max(0, attacker.stats.hp - counterDmg);
        const atkKo = attacker.stats.hp === 0;
        if (atkKo) {
          attacker.isAlive = false;
          grid.setOccupant(attacker.x, attacker.z, null);
        }
        outcomes.push({
          targetId: attacker.id,
          targetName: attacker.name,
          x: attacker.x,
          z: attacker.z,
          y: attacker.y,
          damage: counterDmg,
          isCrit: false,
          isHit: true,
          angle: 'front',
          defeated: atkKo
        });
        messages.push(`${defender.name} counters with Riposte for ${counterDmg} DMG!`);
      }
    }

    return {
      success: true,
      abilityId,
      outcomes,
      chainArcs: chainArcs.length > 0 ? chainArcs : undefined,
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
