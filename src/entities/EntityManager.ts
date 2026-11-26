import { EntityData, JobId, CharacterStats } from '../types/game';
import { JOBS, ITEMS, ABILITIES } from '../game/GameConfig';

export class EntityManager {
  public entities: Map<string, EntityData> = new Map();

  constructor() {}

  public createEntity(
    id: string,
    name: string,
    faction: 'player' | 'enemy',
    jobId: JobId,
    level: number,
    x: number,
    z: number,
    y: number
  ): EntityData {
    const job = JOBS[jobId];
    const mult = job.statMultipliers;

    const baseHp = Math.floor((100 + level * 25) * mult.hp);
    const baseMp = Math.floor((40 + level * 10) * mult.mp);
    const baseAtk = Math.floor((15 + level * 5) * mult.atk);
    const baseMatk = Math.floor((15 + level * 5) * mult.matk);
    const baseDef = Math.floor((10 + level * 3) * mult.def);
    const baseMdef = Math.floor((10 + level * 3) * mult.mdef);
    const baseSpd = Math.floor((10 + level * 1.2) * mult.spd);
    const baseAcc = Math.floor(88 * mult.acc + level);
    const baseEva = Math.floor(8 * mult.eva + level * 0.5);

    const stats: CharacterStats = {
      hp: baseHp,
      maxHp: baseHp,
      mp: baseMp,
      maxMp: baseMp,
      atk: baseAtk,
      matk: baseMatk,
      def: baseDef,
      mdef: baseMdef,
      spd: baseSpd,
      acc: baseAcc,
      eva: baseEva,
      mov: mult.mov,
      jmp: mult.jmp,
      ct: 0
    };

    const starterAbilities = job.allowedAbilities.slice(0, 3);

    const entity: EntityData = {
      id,
      name,
      faction,
      jobId,
      level,
      exp: 0,
      jp: 50,
      jobLevels: { [jobId]: 1 },
      x,
      z,
      y,
      facing: faction === 'player' ? 'east' : 'west',
      stats,
      equipment: {
        weapon: null,
        armor: null,
        accessory: null
      },
      equippedAbilities: [...starterAbilities],
      unlockedJobs: [jobId],
      unlockedAbilities: [...starterAbilities],
      passiveEquipped: job.passiveSkill.id,
      reactionEquipped: job.reactionSkill.id,
      isAlive: true,
      statusEffects: []
    };

    this.entities.set(id, entity);
    return entity;
  }

  public addExistingEntity(entity: EntityData): EntityData {
    const copy: EntityData = JSON.parse(JSON.stringify(entity));
    this.recalculateStats(copy);
    copy.stats.hp = copy.stats.maxHp;
    copy.stats.mp = copy.stats.maxMp;
    copy.stats.ct = 0;
    copy.isAlive = true;
    copy.statusEffects = [];
    this.entities.set(copy.id, copy);
    return copy;
  }

  public getEntity(id: string): EntityData | undefined {
    return this.entities.get(id);
  }

  public getAllEntities(): EntityData[] {
    return Array.from(this.entities.values());
  }

  public getEntityAt(x: number, z: number): EntityData | undefined {
    for (const entity of this.entities.values()) {
      if (entity.isAlive && entity.x === x && entity.z === z) {
        return entity;
      }
    }
    return undefined;
  }

  public equipItem(entity: EntityData, itemId: string | null, slot: 'weapon' | 'armor' | 'accessory'): string | null {
    const prev = entity.equipment[slot];
    if (itemId === null) {
      entity.equipment[slot] = null;
      this.recalculateStats(entity);
      return prev;
    }

    const item = ITEMS[itemId];
    if (!item || item.slot !== slot) return prev;

    entity.equipment[slot] = itemId;
    this.recalculateStats(entity);
    return prev;
  }

  public canUnlockJob(entity: EntityData, targetJobId: JobId): boolean {
    if (entity.unlockedJobs.includes(targetJobId)) return true;
    const job = JOBS[targetJobId];
    if (!job) return false;
    return job.requirements.every(req => (entity.jobLevels[req.jobId] ?? 0) >= req.level);
  }

  public checkJobUnlocks(entity: EntityData): JobId[] {
    const newlyUnlocked: JobId[] = [];
    (Object.keys(JOBS) as JobId[]).forEach(jobId => {
      if (!entity.unlockedJobs.includes(jobId) && this.canUnlockJob(entity, jobId)) {
        entity.unlockedJobs.push(jobId);
        newlyUnlocked.push(jobId);
      }
    });
    return newlyUnlocked;
  }

  public changeJob(entity: EntityData, newJobId: JobId): boolean {
    if (!this.canUnlockJob(entity, newJobId)) return false;
    if (!entity.unlockedJobs.includes(newJobId)) {
      entity.unlockedJobs.push(newJobId);
    }

    entity.jobId = newJobId;
    if (!entity.jobLevels[newJobId]) {
      entity.jobLevels[newJobId] = 1;
    }

    const newJob = JOBS[newJobId];
    // Guarantee the basic ability of the new job is unlocked and preserved alongside learned skills
    const basicAbility = newJob.allowedAbilities[0];
    if (basicAbility && !entity.unlockedAbilities.includes(basicAbility)) {
      entity.unlockedAbilities.push(basicAbility);
    }

    // Equip up to 4 abilities, prioritizing new job's unlocked skills + retained cross-class skills
    const jobUnlocked = newJob.allowedAbilities.filter(id => entity.unlockedAbilities.includes(id));
    const crossClass = entity.equippedAbilities.filter(id => !jobUnlocked.includes(id) && entity.unlockedAbilities.includes(id));
    entity.equippedAbilities = [...jobUnlocked, ...crossClass].slice(0, 4);

    entity.passiveEquipped = newJob.passiveSkill.id;
    entity.reactionEquipped = newJob.reactionSkill.id;

    this.recalculateStats(entity);
    entity.stats.hp = entity.stats.maxHp;
    entity.stats.mp = entity.stats.maxMp;
    return true;
  }

  public unlockAbility(entity: EntityData, abilityId: string): boolean {
    const ability = ABILITIES[abilityId];
    if (!ability) return false;
    if (entity.unlockedAbilities.includes(abilityId)) return false;
    if (entity.jp < ability.jpCost) return false;

    entity.jp -= ability.jpCost;
    entity.unlockedAbilities.push(abilityId);
    if (entity.equippedAbilities.length < 4 && !entity.equippedAbilities.includes(abilityId)) {
      entity.equippedAbilities.push(abilityId);
    }
    return true;
  }

  public toggleEquipAbility(entity: EntityData, abilityId: string): boolean {
    if (!entity.unlockedAbilities.includes(abilityId)) return false;
    const idx = entity.equippedAbilities.indexOf(abilityId);
    if (idx >= 0) {
      if (entity.equippedAbilities.length <= 1) return false;
      entity.equippedAbilities.splice(idx, 1);
      return true;
    }
    if (entity.equippedAbilities.length >= 4) {
      entity.equippedAbilities.shift();
    }
    entity.equippedAbilities.push(abilityId);
    return true;
  }

  public awardExperience(entity: EntityData, expGain: number, jpGain: number): { leveledUp: boolean; unlockedJobs: JobId[] } {
    entity.exp += expGain;
    entity.jp += jpGain;

    let leveledUp = false;
    while (entity.exp >= entity.level * 100) {
      entity.exp -= entity.level * 100;
      entity.level += 1;
      entity.jobLevels[entity.jobId] = (entity.jobLevels[entity.jobId] ?? 1) + 1;
      leveledUp = true;
    }

    if (leveledUp) {
      this.recalculateStats(entity);
      entity.stats.hp = entity.stats.maxHp;
      entity.stats.mp = entity.stats.maxMp;
    }

    const unlockedJobs = this.checkJobUnlocks(entity);
    return { leveledUp, unlockedJobs };
  }

  public recalculateStats(entity: EntityData) {
    const job = JOBS[entity.jobId];
    const mult = job.statMultipliers;

    const baseHp = Math.floor((100 + entity.level * 25) * mult.hp);
    const baseMp = Math.floor((40 + entity.level * 10) * mult.mp);
    const baseAtk = Math.floor((15 + entity.level * 5) * mult.atk);
    const baseMatk = Math.floor((15 + entity.level * 5) * mult.matk);
    const baseDef = Math.floor((10 + entity.level * 3) * mult.def);
    const baseMdef = Math.floor((10 + entity.level * 3) * mult.mdef);
    const baseSpd = Math.floor((10 + entity.level * 1.2) * mult.spd);
    const baseAcc = Math.floor(88 * mult.acc + entity.level);
    const baseEva = Math.floor(8 * mult.eva + entity.level * 0.5);

    let bonusAtk = 0,
      bonusMatk = 0,
      bonusDef = 0,
      bonusMdef = 0,
      bonusSpd = 0,
      bonusAcc = 0,
      bonusEva = 0,
      bonusHp = 0,
      bonusMp = 0,
      bonusMov = 0,
      bonusJmp = 0;

    Object.values(entity.equipment).forEach(itemId => {
      if (itemId && ITEMS[itemId]) {
        const stats = ITEMS[itemId].stats;
        if (stats.atk) bonusAtk += stats.atk;
        if (stats.matk) bonusMatk += stats.matk;
        if (stats.def) bonusDef += stats.def;
        if (stats.mdef) bonusMdef += stats.mdef;
        if (stats.spd) bonusSpd += stats.spd;
        if (stats.acc) bonusAcc += stats.acc;
        if (stats.eva) bonusEva += stats.eva;
        if (stats.hp) bonusHp += stats.hp;
        if (stats.mp) bonusMp += stats.mp;
        if (stats.mov) bonusMov += stats.mov;
        if (stats.jmp) bonusJmp += stats.jmp;
      }
    });

    // Passive job skill bonuses
    if (entity.passiveEquipped === 'iron_bulwark' && entity.equipment.armor) bonusDef += 4;
    if (entity.passiveEquipped === 'fleet_foot') {
      bonusMov += 1;
      bonusEva += 8;
    }
    if (entity.passiveEquipped === 'aether_reservoir') {
      bonusMp += 20;
      bonusMatk += 4;
    }
    if (entity.passiveEquipped === 'radiant_grace') bonusMdef += 5;
    if (entity.passiveEquipped === 'cliff_strider') bonusJmp += 1;
    if (entity.passiveEquipped === 'eagle_eye') bonusAcc += 8;
    if (entity.passiveEquipped === 'transmute_craft') {
      bonusHp += 15;
      bonusMp += 15;
    }
    if (entity.passiveEquipped === 'celestial_channel') {
      bonusMatk += 8;
      bonusMp += 25;
    }

    entity.stats.maxHp = baseHp + bonusHp;
    entity.stats.maxMp = baseMp + bonusMp;
    entity.stats.atk = baseAtk + bonusAtk;
    entity.stats.matk = baseMatk + bonusMatk;
    entity.stats.def = baseDef + bonusDef;
    entity.stats.mdef = baseMdef + bonusMdef;
    entity.stats.spd = Math.max(4, baseSpd + bonusSpd);
    entity.stats.acc = baseAcc + bonusAcc;
    entity.stats.eva = baseEva + bonusEva;
    entity.stats.mov = mult.mov + bonusMov;
    entity.stats.jmp = mult.jmp + bonusJmp;

    if (entity.stats.hp > entity.stats.maxHp) entity.stats.hp = entity.stats.maxHp;
    if (entity.stats.mp > entity.stats.maxMp) entity.stats.mp = entity.stats.maxMp;
  }
}
