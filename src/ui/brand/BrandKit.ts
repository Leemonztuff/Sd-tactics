import { JobId, StatusType } from '../../types/game';
import type { GameScreen } from '../../game/Game';
import type { SkillVfxElement } from '../../rendering/BattleVfxSystem';

export type BodyDatasetState = 'title' | 'playing' | 'paused' | 'gameover';

export function resolveBodyDatasetState(state: GameScreen, isPaused: boolean): BodyDatasetState {
  if (state === 'victory' || state === 'defeat') return 'gameover';
  if (state === 'overworld' || state === 'battle') {
    return isPaused ? 'paused' : 'playing';
  }
  return 'title';
}

export const VALEN_BRAND = {
  title: 'Valen Tactics',
  subtitle: 'Chronicles of the Realm',
  edition: 'Order of the Dawn',
  palette: {
    canvas: '#090d16',
    plaque: 'rgba(13, 18, 30, 0.94)',
    plaqueElevated: 'rgba(18, 25, 41, 0.96)',
    plaqueQuiet: 'rgba(13, 18, 30, 0.88)',
    gold: '#d89b32',
    goldBright: '#f3cf7a',
    goldMuted: 'rgba(216, 155, 50, 0.34)',
    ivory: '#f6eedb',
    slateText: '#cbd5e1',
    slateMuted: '#8a99b3',
    ally: '#38bdf8',
    enemy: '#f43f5e',
    vitality: '#34d399',
    amber: '#f59e0b',
    astral: '#c084fc'
  },
  typography: {
    display: "'Cinzel', Georgia, serif",
    sans: "'Plus Jakarta Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace"
  },
  motion: {
    snappy: '140ms cubic-bezier(0.16, 1, 0.3, 1)',
    ghostDrain: '520ms cubic-bezier(0.22, 1, 0.36, 1)'
  }
} as const;

export const ELEMENT_STYLE: Record<
  SkillVfxElement,
  { label: string; colorClass: string; hex: string }
> = {
  steel: { label: 'Steel', colorClass: 'text-slate-200', hex: '#cbd5e1' },
  fire: { label: 'Pyre', colorClass: 'text-orange-400', hex: '#fb923c' },
  lightning: { label: 'Tempest', colorClass: 'text-sky-300', hex: '#38bdf8' },
  solar: { label: 'Solar', colorClass: 'text-amber-300', hex: '#facc15' },
  venom: { label: 'Venom', colorClass: 'text-lime-400', hex: '#a3e635' },
  acid: { label: 'Acid', colorClass: 'text-emerald-300', hex: '#34d399' },
  astral: { label: 'Astral', colorClass: 'text-purple-300', hex: '#c084fc' },
  heal: { label: 'Mend', colorClass: 'text-emerald-300', hex: '#34d399' },
  buff: { label: 'Blessing', colorClass: 'text-sky-300', hex: '#60a5fa' }
};

export const STATUS_LABEL: Record<StatusType, { label: string; colorClass: string }> = {
  poison: { label: 'Poison', colorClass: 'text-lime-300' },
  burn: { label: 'Burn', colorClass: 'text-orange-300' },
  acid: { label: 'Acid', colorClass: 'text-emerald-300' },
  haste: { label: 'Haste', colorClass: 'text-sky-300' },
  slow: { label: 'Slow', colorClass: 'text-purple-300' },
  snare: { label: 'Snare', colorClass: 'text-amber-300' },
  fortify: { label: 'Fortify', colorClass: 'text-amber-200' },
  aether_shield: { label: 'Ward', colorClass: 'text-sky-200' },
  evade: { label: 'Evade', colorClass: 'text-teal-300' },
  focus: { label: 'Focus', colorClass: 'text-amber-300' }
};

export const JOB_ACCENT: Record<JobId, { color: string; tag: string }> = {
  guard: { color: '#60a5fa', tag: 'Vanguard' },
  duelist: { color: '#38bdf8', tag: 'Skirmisher' },
  arcanist: { color: '#a855f7', tag: 'Artillery' },
  devoto: { color: '#facc15', tag: 'Concord' },
  explorador: { color: '#34d399', tag: 'Outrider' },
  tirador: { color: '#fb923c', tag: 'Marksman' },
  alquimista: { color: '#a3e635', tag: 'Transmuter' },
  invocador: { color: '#e879f9', tag: 'Celestial' }
};

