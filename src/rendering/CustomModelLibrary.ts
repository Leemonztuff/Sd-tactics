import { EntityData } from '../types/game';
import {
  AutoRigProfile,
  CompanionModelFile,
  CustomModelConfig,
  DEFAULT_CUSTOM_MODEL_CONFIG,
  getCustomHeroModelOverride,
  normalizeCustomModelConfig
} from './CustomModelRig';

export interface ModelAssignmentSlot {
  key: string;
  label: string;
  group: 'Héroes' | 'Clases' | 'Facción';
}

export const MODEL_ASSIGNMENT_SLOTS: ModelAssignmentSlot[] = [
  { key: 'hero:hero_1', label: 'Valerius (Líder · Vanguard)', group: 'Héroes' },
  { key: 'hero:hero_2', label: 'Lyra (Aether Mage)', group: 'Héroes' },
  { key: 'hero:hero_3', label: 'Kaelen (Solar Priest)', group: 'Héroes' },
  { key: 'job:guard', label: 'Clase: Valen Vanguard', group: 'Clases' },
  { key: 'job:duelist', label: 'Clase: Blade Dancer', group: 'Clases' },
  { key: 'job:arcanist', label: 'Clase: Aether Mage', group: 'Clases' },
  { key: 'job:devoto', label: 'Clase: Solar Priest', group: 'Clases' },
  { key: 'job:explorador', label: 'Clase: Wild Scout', group: 'Clases' },
  { key: 'job:tirador', label: 'Clase: Kingdom Arbalist', group: 'Clases' },
  { key: 'job:alquimista', label: 'Clase: Rift Alchemist', group: 'Clases' },
  { key: 'job:invocador', label: 'Clase: Astral Summoner', group: 'Clases' },
  { key: 'faction:player', label: 'Todos los Aliados (Fallback)', group: 'Facción' },
  { key: 'faction:enemy', label: 'Todos los Enemigos (Fallback)', group: 'Facción' }
];

export interface SavedCustomModelEntry {
  id: string;
  name: string;
  fileName: string;
  buffer: ArrayBuffer;
  companions: CompanionModelFile[];
  textureBuffer: ArrayBuffer | null;
  config: CustomModelConfig;
  autoProfile: AutoRigProfile | null;
  updatedAt: number;
}

export interface ExportedModelConfigFile {
  schemaVersion: 1;
  modelName: string;
  autoProfile: AutoRigProfile | null;
  config: CustomModelConfig;
  assignments: string[];
  exportedAt: string;
}

export type ResolvedEntityModel =
  | {
      source: 'library';
      signature: string;
      entry: SavedCustomModelEntry;
      config: CustomModelConfig;
    }
  | {
      source: 'preview_override';
      signature: string;
      buffer: ArrayBuffer;
      fileName: string;
      companions: CompanionModelFile[];
      textureBuffer: ArrayBuffer | null;
      config: CustomModelConfig;
    }
  | {
      source: 'default_glb';
      signature: string;
      url: string;
      config: CustomModelConfig;
    };

const DB_NAME = 'valen_tactics_model_studio_v1';
const DB_VERSION = 1;
const STORE_MODELS = 'models';
const STORE_META = 'meta';
const ASSIGNMENTS_KEY = 'assignments';

let initialized = false;
let initPromise: Promise<void> | null = null;
const modelsMap = new Map<string, SavedCustomModelEntry>();
let assignmentsMap: Record<string, string> = {};
let libraryRevision = 0;

function cloneEntry(entry: SavedCustomModelEntry): SavedCustomModelEntry {
  return {
    ...entry,
    companions: entry.companions.map(c => ({ ...c })),
    config: normalizeCustomModelConfig(entry.config),
    autoProfile: entry.autoProfile ? { ...entry.autoProfile } : null
  };
}

function openStudioDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MODELS)) {
          db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persistModelToDb(entry: SavedCustomModelEntry): Promise<void> {
  const db = await openStudioDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      tx.objectStore(STORE_MODELS).put(entry);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function deleteModelFromDb(id: string): Promise<void> {
  const db = await openStudioDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      tx.objectStore(STORE_MODELS).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function persistAssignmentsToDb(): Promise<void> {
  const db = await openStudioDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ ...assignmentsMap }, ASSIGNMENTS_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function initCustomModelLibrary(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await openStudioDb();
    if (!db) {
      initialized = true;
      return;
    }

    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction([STORE_MODELS, STORE_META], 'readonly');
        const modelsReq = tx.objectStore(STORE_MODELS).getAll();
        const assignReq = tx.objectStore(STORE_META).get(ASSIGNMENTS_KEY);

        tx.oncomplete = () => {
          const rows = (modelsReq.result ?? []) as SavedCustomModelEntry[];
          for (const row of rows) {
            if (row && row.id && row.buffer) {
              modelsMap.set(row.id, cloneEntry(row));
            }
          }
          const loadedAssign = assignReq.result as Record<string, string> | undefined;
          if (loadedAssign && typeof loadedAssign === 'object') {
            assignmentsMap = { ...loadedAssign };
          }
          initialized = true;
          libraryRevision++;
          db.close();
          resolve();
        };
        tx.onerror = () => {
          initialized = true;
          db.close();
          resolve();
        };
      } catch {
        initialized = true;
        db.close();
        resolve();
      }
    });
  })();

  return initPromise;
}

export function getLibraryRevision(): number {
  return libraryRevision;
}

export function listSavedCustomModels(): SavedCustomModelEntry[] {
  return Array.from(modelsMap.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(cloneEntry);
}

export function getSavedCustomModel(id: string): SavedCustomModelEntry | null {
  const found = modelsMap.get(id);
  return found ? cloneEntry(found) : null;
}

export async function saveCustomModelEntry(
  input: Omit<SavedCustomModelEntry, 'updatedAt'>
): Promise<SavedCustomModelEntry> {
  await initCustomModelLibrary();
  const entry: SavedCustomModelEntry = {
    ...input,
    companions: input.companions.map(c => ({ ...c })),
    config: normalizeCustomModelConfig(input.config),
    autoProfile: input.autoProfile ? { ...input.autoProfile } : null,
    updatedAt: Date.now()
  };
  modelsMap.set(entry.id, cloneEntry(entry));
  libraryRevision++;
  await persistModelToDb(entry);
  return cloneEntry(entry);
}

export async function deleteCustomModelEntry(id: string): Promise<void> {
  await initCustomModelLibrary();
  modelsMap.delete(id);
  let changedAssign = false;
  for (const [slot, mId] of Object.entries(assignmentsMap)) {
    if (mId === id) {
      delete assignmentsMap[slot];
      changedAssign = true;
    }
  }
  libraryRevision++;
  await deleteModelFromDb(id);
  if (changedAssign) {
    await persistAssignmentsToDb();
  }
}

export function getModelAssignments(): Record<string, string> {
  return { ...assignmentsMap };
}

export function getSlotsForModel(modelId: string): string[] {
  return Object.entries(assignmentsMap)
    .filter(([, mId]) => mId === modelId)
    .map(([slot]) => slot);
}

export async function assignCustomModelToSlot(
  slotKey: string,
  modelId: string | null
): Promise<void> {
  await initCustomModelLibrary();
  if (!modelId) {
    delete assignmentsMap[slotKey];
  } else {
    assignmentsMap[slotKey] = modelId;
  }
  libraryRevision++;
  await persistAssignmentsToDb();
}

export function resolveCustomModelForEntity(
  entity: Pick<EntityData, 'id' | 'name' | 'jobId' | 'faction'>
): ResolvedEntityModel | null {
  // 1. Exact hero ID or name slot
  const heroSlotKey = `hero:${entity.id}`;
  const heroModelId = assignmentsMap[heroSlotKey];
  if (heroModelId && modelsMap.has(heroModelId)) {
    const entry = cloneEntry(modelsMap.get(heroModelId)!);
    return {
      source: 'library',
      signature: `lib:${entry.id}:${entry.updatedAt}:${JSON.stringify(entry.config)}`,
      entry,
      config: entry.config
    };
  }

  // 2. Job slot (applies cleanly to units of that job)
  const jobSlotKey = `job:${entity.jobId}`;
  const jobModelId = assignmentsMap[jobSlotKey];
  if (jobModelId && modelsMap.has(jobModelId)) {
    const entry = cloneEntry(modelsMap.get(jobModelId)!);
    return {
      source: 'library',
      signature: `lib:${entry.id}:${entry.updatedAt}:${JSON.stringify(entry.config)}`,
      entry,
      config: entry.config
    };
  }

  // 3. Faction default slot
  const factionSlotKey = `faction:${entity.faction}`;
  const factionModelId = assignmentsMap[factionSlotKey];
  if (factionModelId && modelsMap.has(factionModelId)) {
    const entry = cloneEntry(modelsMap.get(factionModelId)!);
    return {
      source: 'library',
      signature: `lib:${entry.id}:${entry.updatedAt}:${JSON.stringify(entry.config)}`,
      entry,
      config: entry.config
    };
  }

  // 4. Unsaved quick-test preview override for squad leader (Valerius / hero_1)
  if (entity.id === 'hero_1' || entity.name === 'Valerius') {
    const preview = getCustomHeroModelOverride();
    if (preview) {
      const cfg = normalizeCustomModelConfig(preview.config ?? DEFAULT_CUSTOM_MODEL_CONFIG);
      return {
        source: 'preview_override',
        signature: `preview:${preview.name}:${preview.buffer.byteLength}:${JSON.stringify(cfg)}`,
        buffer: preview.buffer,
        fileName: preview.name,
        companions: preview.companions,
        textureBuffer: preview.textureBuffer,
        config: cfg
      };
    }

    // 5. Default built-in rigged hero model01.glb
    return {
      source: 'default_glb',
      signature: 'default:/models/model01.glb',
      url: '/models/model01.glb',
      config: { ...DEFAULT_CUSTOM_MODEL_CONFIG, weaponsEnabled: true }
    };
  }

  return null;
}

export function buildExportConfigPayload(
  modelName: string,
  config: CustomModelConfig,
  autoProfile: AutoRigProfile | null,
  assignments: string[]
): ExportedModelConfigFile {
  return {
    schemaVersion: 1,
    modelName,
    autoProfile: autoProfile ? { ...autoProfile } : null,
    config: normalizeCustomModelConfig(config),
    assignments: [...assignments],
    exportedAt: new Date().toISOString()
  };
}

export function parseImportedConfigJson(jsonText: string): {
  config: CustomModelConfig;
  assignments: string[];
  modelName?: string;
} {
  const parsed = JSON.parse(jsonText) as Partial<ExportedModelConfigFile> & Partial<CustomModelConfig>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON de configuración inválido');
  }
  const rawConfig = parsed.config && typeof parsed.config === 'object' ? parsed.config : parsed;
  return {
    config: normalizeCustomModelConfig(rawConfig),
    assignments: Array.isArray(parsed.assignments)
      ? parsed.assignments.filter((s): s is string => typeof s === 'string')
      : [],
    modelName: typeof parsed.modelName === 'string' ? parsed.modelName : undefined
  };
}

export function resetCustomModelLibraryForTests(): void {
  initialized = false;
  initPromise = null;
  modelsMap.clear();
  assignmentsMap = {};
  libraryRevision = 0;
}
