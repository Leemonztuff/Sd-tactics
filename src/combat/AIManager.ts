import { Direction, EntityData } from '../types/game';
import { GridSystem } from '../world/GridSystem';
import { ABILITIES, TERRAIN_RULES } from '../game/GameConfig';
import { calculateDamagePreview } from './CombatFormulas';

export interface AIAction {
  type: 'move_and_act' | 'wait';
  targetTile: { x: number; z: number };
  path: { x: number; z: number }[];
  abilityId?: string;
  targetCoord?: { x: number; z: number };
  newFacing: Direction;
}

export class AIManager {
  constructor() {}

  public decideTurn(
    enemy: EntityData,
    allEntities: EntityData[],
    grid: GridSystem
  ): AIAction {
    const alivePlayers = allEntities.filter(e => e.faction === 'player' && e.isAlive);
    const aliveAllies = allEntities.filter(e => e.faction === enemy.faction && e.isAlive);

    if (alivePlayers.length === 0) {
      return {
        type: 'wait',
        targetTile: { x: enemy.x, z: enemy.z },
        path: [{ x: enemy.x, z: enemy.z }],
        newFacing: enemy.facing
      };
    }

    const role = enemy.aiRole ?? 'melee';
    const reachable = grid.getReachableTiles(enemy.x, enemy.z, enemy.stats.mov, enemy.stats.jmp);

    let bestScore = -Infinity;
    let bestPlan: AIAction | null = null;

    // 1. Healer AI checks injured allies first
    if (role === 'healer') {
      const injured = aliveAllies
        .filter(a => a.stats.hp < a.stats.maxHp * 0.72)
        .sort((a, b) => a.stats.hp / a.stats.maxHp - b.stats.hp / b.stats.maxHp);

      const healSkillId = enemy.equippedAbilities.find(id => {
        const ab = ABILITIES[id];
        return ab && ab.type === 'heal' && enemy.stats.mp >= ab.mpCost;
      });

      if (injured.length > 0 && healSkillId) {
        const healAbility = ABILITIES[healSkillId];
        const patient = injured[0];
        for (const tile of reachable) {
          const validTargets = grid.getAbilityTargetTiles(tile.x, tile.z, healAbility);
          if (validTargets.some(t => t.x === patient.x && t.z === patient.z)) {
            return {
              type: 'move_and_act',
              targetTile: { x: tile.x, z: tile.z },
              path: tile.path,
              abilityId: healSkillId,
              targetCoord: { x: patient.x, z: patient.z },
              newFacing: this.computeFacingTowards(tile.x, tile.z, patient.x, patient.z, enemy.facing)
            };
          }
        }
      }
    }

    // 2. Evaluate all reachable tiles x usable offensive abilities x target enemies
    const usableAbilities = enemy.equippedAbilities
      .map(id => ABILITIES[id])
      .filter(ab => ab && (ab.type === 'physical' || ab.type === 'magical' || ab.type === 'debuff') && enemy.stats.mp >= ab.mpCost);

    for (const tile of reachable) {
      const tileData = grid.getTile(tile.x, tile.z);
      const tileY = tileData ? tileData.y : 0;

      for (const ab of usableAbilities) {
        const targetableTiles = grid.getAbilityTargetTiles(tile.x, tile.z, ab);

        for (const targetPlayer of alivePlayers) {
          if (!targetableTiles.some(t => t.x === targetPlayer.x && t.z === targetPlayer.z)) continue;

          // Score this attack plan
          const defTile = grid.getTile(targetPlayer.x, targetPlayer.z);
          const defRule = defTile ? TERRAIN_RULES[defTile.terrain] : TERRAIN_RULES.grass;
          const tempEnemy: EntityData = { ...enemy, x: tile.x, z: tile.z, y: tileY };
          const preview = calculateDamagePreview(
            tempEnemy,
            targetPlayer,
            ab,
            tileY,
            defTile ? defTile.y : 0,
            defRule,
            { defenderTerrainType: defTile?.terrain, allies: allEntities }
          );

          let score = preview.estimatedDamage * (preview.hitChance / 100);
          if (preview.estimatedDamage >= targetPlayer.stats.hp) score += 120; // Finish off priority
          if (preview.angle === 'back') score += 30;
          else if (preview.angle === 'side') score += 15;
          if (tileY > (defTile?.y ?? 0)) score += 12; // High ground advantage

          // Ranged / Mage prefer distance from melee threat
          const distToPlayer = Math.abs(tile.x - targetPlayer.x) + Math.abs(tile.z - targetPlayer.z);
          if (role === 'ranged' || role === 'mage' || role === 'boss') {
            score += Math.min(4, distToPlayer) * 6;
          }

          // Avoid standing on hazard tiles
          if (tileData?.terrain === 'hazard') score -= 40;

          // AoE bonus
          if (ab.aoeRadius > 0) {
            const aoe = grid.getAoeTiles(targetPlayer.x, targetPlayer.z, ab.aoeRadius);
            const extraHits = alivePlayers.filter(
              p => p.id !== targetPlayer.id && aoe.some(at => at.x === p.x && at.z === p.z)
            ).length;
            score += extraHits * 45;
          }

          if (score > bestScore) {
            bestScore = score;
            bestPlan = {
              type: 'move_and_act',
              targetTile: { x: tile.x, z: tile.z },
              path: tile.path,
              abilityId: ab.id,
              targetCoord: { x: targetPlayer.x, z: targetPlayer.z },
              newFacing: this.computeFacingTowards(tile.x, tile.z, targetPlayer.x, targetPlayer.z, enemy.facing)
            };
          }
        }
      }
    }

    if (bestPlan) return bestPlan;

    // 3. No target in attack range: advance toward closest player using reachable tiles
    let closestPlayer = alivePlayers[0];
    let closestDist = Infinity;
    for (const p of alivePlayers) {
      const d = Math.abs(p.x - enemy.x) + Math.abs(p.z - enemy.z);
      if (d < closestDist) {
        closestDist = d;
        closestPlayer = p;
      }
    }

    let bestMoveTile = reachable[0] ?? { x: enemy.x, z: enemy.z, y: enemy.y, cost: 0, path: [{ x: enemy.x, z: enemy.z }] };
    let bestTileScore = -Infinity;

    for (const tile of reachable) {
      const dist = Math.abs(closestPlayer.x - tile.x) + Math.abs(closestPlayer.z - tile.z);
      const tileData = grid.getTile(tile.x, tile.z);
      let s = -dist * 10 + (tileData?.y ?? 0) * 3;
      if (tileData?.terrain === 'hazard') s -= 30;
      if (s > bestTileScore) {
        bestTileScore = s;
        bestMoveTile = tile;
      }
    }

    return {
      type: 'move_and_act',
      targetTile: { x: bestMoveTile.x, z: bestMoveTile.z },
      path: bestMoveTile.path,
      newFacing: this.computeFacingTowards(bestMoveTile.x, bestMoveTile.z, closestPlayer.x, closestPlayer.z, enemy.facing)
    };
  }

  private computeFacingTowards(fromX: number, fromZ: number, toX: number, toZ: number, fallback: Direction): Direction {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    if (dx === 0 && dz === 0) return fallback;
    if (Math.abs(dx) >= Math.abs(dz)) {
      return dx > 0 ? 'east' : 'west';
    }
    return dz > 0 ? 'south' : 'north';
  }
}
