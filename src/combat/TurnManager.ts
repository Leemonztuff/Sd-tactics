import { EntityData } from '../types/game';
import { getEffectiveSpeed } from './CombatFormulas';

export interface TurnQueueEntry {
  entity: EntityData;
  projectedCt: number;
  ticksUntilTurn: number;
}

export class TurnManager {
  public entities: EntityData[] = [];
  public activeUnit: EntityData | null = null;
  public turnQueue: TurnQueueEntry[] = [];
  public totalTurnsElapsed: number = 0;

  constructor(entities: EntityData[], randomizeInitialCt: boolean = true) {
    this.entities = entities.filter(e => e.isAlive);
    this.initCt(randomizeInitialCt);
  }

  private initCt(randomize: boolean) {
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (randomize) {
        // Player units start slightly ahead for crisp opening initiative
        const base = e.faction === 'player' ? 35 : 20;
        e.stats.ct = base + ((i * 11) % 25);
      }
    }
    this.updateQueue();
  }

  public syncEntities(entities: EntityData[]) {
    this.entities = entities.filter(e => e.isAlive);
    this.updateQueue();
  }

  public updateQueue(limit: number = 8) {
    const alive = this.entities.filter(e => e.isAlive);
    if (alive.length === 0) {
      this.turnQueue = [];
      return;
    }

    const queue: TurnQueueEntry[] = [];
    const sim = alive.map(e => ({
      entity: e,
      ct: e.stats.ct,
      spd: Math.max(1, getEffectiveSpeed(e))
    }));

    let accumulatedTicks = 0;

    for (let i = 0; i < limit; i++) {
      let minTicks = Infinity;
      let chosen: (typeof sim)[number] | null = null;

      // First check if anyone is already >= 100
      for (const s of sim) {
        if (s.ct >= 100) {
          if (!chosen || s.ct > chosen.ct || (s.ct === chosen.ct && s.spd > chosen.spd)) {
            chosen = s;
            minTicks = 0;
          }
        }
      }

      if (!chosen) {
        for (const s of sim) {
          const ticks = Math.ceil((100 - s.ct) / s.spd);
          if (
            ticks < minTicks ||
            (ticks === minTicks && chosen && s.ct + s.spd * ticks > chosen.ct + chosen.spd * ticks)
          ) {
            minTicks = ticks;
            chosen = s;
          }
        }
      }

      if (!chosen) break;

      if (minTicks > 0) {
        accumulatedTicks += minTicks;
        for (const s of sim) {
          s.ct += s.spd * minTicks;
        }
      }

      queue.push({
        entity: chosen.entity,
        projectedCt: Math.round(chosen.ct),
        ticksUntilTurn: accumulatedTicks
      });

      chosen.ct -= 100;
    }

    this.turnQueue = queue;
  }

  public nextTurn(): EntityData | null {
    this.entities = this.entities.filter(e => e.isAlive);
    if (this.entities.length === 0) return null;

    let readyUnit: EntityData | null = null;

    // Check if any unit is already >= 100 CT
    const alreadyReady = this.entities.filter(e => e.stats.ct >= 100);
    if (alreadyReady.length > 0) {
      alreadyReady.sort((a, b) => b.stats.ct - a.stats.ct || getEffectiveSpeed(b) - getEffectiveSpeed(a));
      readyUnit = alreadyReady[0];
    }

    // Advance CT ticks until at least one unit hits >= 100
    let safety = 0;
    while (!readyUnit && safety < 200) {
      safety++;
      for (const e of this.entities) {
        e.stats.ct += Math.max(1, getEffectiveSpeed(e));
      }
      const candidates = this.entities.filter(e => e.stats.ct >= 100);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.stats.ct - a.stats.ct || getEffectiveSpeed(b) - getEffectiveSpeed(a));
        readyUnit = candidates[0];
      }
    }

    this.activeUnit = readyUnit;
    this.totalTurnsElapsed++;
    this.updateQueue();
    return readyUnit;
  }

  public endActiveTurn(ctCost: number = 100) {
    if (this.activeUnit) {
      this.activeUnit.stats.ct = Math.max(0, this.activeUnit.stats.ct - ctCost);
      this.activeUnit = null;
    }
    this.updateQueue();
  }
}
