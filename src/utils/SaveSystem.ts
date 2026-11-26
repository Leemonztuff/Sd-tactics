import { SaveData, EntityData, JobId } from '../types/game';
import { EntityManager } from '../entities/EntityManager';

export const SAVE_VERSION = 2;
const STORAGE_KEY = 'valen_tactics_save_v2';

export function createStarterSaveData(): SaveData {
  const em = new EntityManager();

  const valerius = em.createEntity('hero_1', 'Valerius', 'player', 'guard', 1, 1, 2, 0);
  em.equipItem(valerius, 'iron_sword', 'weapon');
  em.equipItem(valerius, 'plate_armor', 'armor');
  valerius.jp = 65;

  const lyra = em.createEntity('hero_2', 'Lyra', 'player', 'arcanist', 1, 1, 4, 0);
  em.equipItem(lyra, 'crystal_staff', 'weapon');
  em.equipItem(lyra, 'mage_robes', 'armor');
  lyra.jp = 65;

  const kaelen = em.createEntity('hero_3', 'Kaelen', 'player', 'devoto', 1, 2, 3, 0);
  em.equipItem(kaelen, 'solar_censer', 'weapon');
  em.equipItem(kaelen, 'amulet_vitality', 'accessory');
  kaelen.jp = 65;

  return {
    version: SAVE_VERSION,
    gold: 450,
    day: 1,
    currentMissionIndex: 0,
    roster: [valerius, lyra, kaelen],
    inventory: [
      { itemId: 'steel_rapier', count: 1 },
      { itemId: 'composite_bow', count: 1 },
      { itemId: 'leather_armor', count: 1 },
      { itemId: 'ring_of_speed', count: 1 }
    ],
    completedMissions: [],
    overworld: {
      heroX: 2,
      heroY: 3,
      day: 1,
      movetype: 'smallfoot',
      visitedVillages: [],
      clearedEncounters: []
    }
  };
}

export function validateSaveData(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<SaveData>;

  if (data.version !== SAVE_VERSION) return null;
  if (typeof data.gold !== 'number' || !Number.isFinite(data.gold) || data.gold < 0) return null;
  if (!Array.isArray(data.roster) || data.roster.length === 0) return null;
  if (!Array.isArray(data.inventory)) return null;
  if (!Array.isArray(data.completedMissions)) return null;

  const validJobs: Set<JobId> = new Set([
    'guard',
    'duelist',
    'arcanist',
    'devoto',
    'explorador',
    'tirador',
    'alquimista',
    'invocador'
  ]);

  for (const unit of data.roster) {
    if (!unit || typeof unit !== 'object') return null;
    if (typeof unit.id !== 'string' || typeof unit.name !== 'string') return null;
    if (!validJobs.has(unit.jobId)) return null;
    if (typeof unit.level !== 'number' || unit.level < 1) return null;
    if (!unit.stats || typeof unit.stats.maxHp !== 'number') return null;
  }

  return data as SaveData;
}

export function serializeSaveData(data: SaveData): string {
  const cleanRoster: EntityData[] = data.roster.map(u => ({
    ...u,
    statusEffects: [],
    isAlive: true,
    stats: {
      ...u.stats,
      hp: u.stats.maxHp,
      mp: u.stats.maxMp,
      ct: 0
    }
  }));

  const payload: SaveData = {
    version: SAVE_VERSION,
    gold: Math.max(0, Math.round(data.gold)),
    day: data.day ?? 1,
    currentMissionIndex: data.currentMissionIndex ?? 0,
    roster: cleanRoster,
    inventory: data.inventory.filter(i => i.count > 0),
    completedMissions: [...data.completedMissions],
    overworld: data.overworld
      ? {
          heroX: data.overworld.heroX,
          heroY: data.overworld.heroY,
          day: data.overworld.day,
          movetype: data.overworld.movetype,
          visitedVillages: [...data.overworld.visitedVillages],
          clearedEncounters: [...data.overworld.clearedEncounters]
        }
      : undefined
  };

  return JSON.stringify(payload);
}

export function loadSaveFromStorage(): SaveData {
  try {
    if (typeof localStorage === 'undefined') return createStarterSaveData();
    const rawStr = localStorage.getItem(STORAGE_KEY);
    if (!rawStr) return createStarterSaveData();
    const parsed = JSON.parse(rawStr);
    const validated = validateSaveData(parsed);
    return validated ?? createStarterSaveData();
  } catch {
    return createStarterSaveData();
  }
}

export function writeSaveToStorage(data: SaveData): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(STORAGE_KEY, serializeSaveData(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSaveStorage(): SaveData {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return createStarterSaveData();
}
