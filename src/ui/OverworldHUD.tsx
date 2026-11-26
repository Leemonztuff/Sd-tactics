import React, { useState } from 'react';
import { game } from '../game/Game';
import { WESNOTH_MOVETYPES, WesnothMovetypeId } from '../overworld/WesnothTerrain';
import { WESNOTH_ASSET_URLS } from '../overworld/WesnothAssetLoader';
import { soundManager } from '../utils/SoundManager';
import {
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Pause,
  Users,
  Map as MapIcon,
  Sun,
  Swords
} from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

const TERRAIN_MINIMAP_COLORS: Record<string, string> = {
  flat: '#4d7c3f',
  sand: '#c4ab74',
  shallow_water: '#2b6cb0',
  deep_water: '#15325b',
  swamp_water: '#3d5845',
  hills: '#7a7254',
  mountains: '#64748b',
  castle: '#94a3b8'
};

export const OverworldHUD: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const mgr = game.overworldManager;
  if (!mgr) return null;

  const inspect = game.hoveredHexInfo ?? mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
  const pathPreview = game.hoveredHexPath;
  const enc = mgr.pendingEncounter;
  const mpPct = mgr.maxMp > 0 ? Math.round((mgr.currentMp / mgr.maxMp) * 100) : 0;

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* TOP PERIMETER: Day/MP/Treasury + Controls (Left) | Wesnoth Hex Minimap (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-2 w-full">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="tactical-panel rounded-lg px-3.5 py-2 flex items-center gap-4">
            <div>
              <div className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] leading-tight">
                Valen Overworld
              </div>
              <div className="text-[11px] text-slate-300 font-mono-num">
                Day <span className="text-[#e2b95b]">{mgr.day}</span> ·{' '}
                <span className="text-[#e2b95b]">{game.saveData.gold} G</span>
              </div>
            </div>

            <div className="w-24 sm:w-28">
              <div className="flex justify-between text-[11px] font-mono-num text-slate-200 mb-0.5">
                <span>MP</span>
                <span className="text-emerald-300">
                  {mgr.currentMp}/{mgr.maxMp}
                </span>
              </div>
              <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${mpPct}%` }} />
              </div>
            </div>

            <div className="hidden md:block text-[11px] font-mono-num text-slate-300">
              Threat <span className={mgr.ambushMeter >= 70 ? 'text-rose-400 font-bold' : 'text-amber-300'}>{mgr.ambushMeter}%</span>
            </div>
          </div>

          {/* Utility Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Rotate Camera Left"
              onClick={e => {
                e.currentTarget.blur();
                game.overworldScene?.rotateCamera(-Math.PI / 5);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Rotate Camera Right"
              onClick={e => {
                e.currentTarget.blur();
                game.overworldScene?.rotateCamera(Math.PI / 5);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Zoom In"
              onClick={e => {
                e.currentTarget.blur();
                game.overworldScene?.adjustZoom(-2.0);
              }}
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Zoom Out"
              onClick={e => {
                e.currentTarget.blur();
                game.overworldScene?.adjustZoom(2.0);
              }}
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Barracks & Armory"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                game.setScreen('roster');
                onUpdate();
              }}
              className="px-2.5 h-9 flex items-center gap-1.5 rounded-lg tactical-panel-subtle text-[#ede8dc] hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <Users size={14} /> <span className="hidden sm:inline">Barracks</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Tactical Battles"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                game.setScreen('campaign_select');
                onUpdate();
              }}
              className="px-2.5 h-9 flex items-center gap-1.5 rounded-lg tactical-panel-subtle text-[#ede8dc] hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <MapIcon size={14} /> <span className="hidden sm:inline">Battles</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
              onClick={e => {
                e.currentTarget.blur();
                setSoundEnabled(soundManager.toggleSound());
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-[#e2b95b] hover:bg-slate-800 cursor-pointer"
            >
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-slate-400" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Overworld"
              onClick={e => {
                e.currentTarget.blur();
                game.togglePause();
                onUpdate();
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <Pause size={15} />
            </button>
          </div>
        </div>

        {/* Top-Right Compact Wesnoth Hex Minimap */}
        <div className="hidden md:block tactical-panel rounded-lg p-2 pointer-events-auto">
          <svg
            width={mgr.map.width * 6 + 6}
            height={mgr.map.height * 6 + 6}
            viewBox={`0 0 ${mgr.map.width * 6 + 6} ${mgr.map.height * 6 + 6}`}
            aria-label="Wesnoth Overworld Minimap"
          >
            {mgr.map.tiles.map((row, ry) =>
              row.map((t, rx) => {
                const cx = rx * 6 + 4;
                const cy = ry * 6 + (rx & 1 ? 6 : 3);
                const fill =
                  t.terrain.overlayCategory === 'forest'
                    ? '#27592c'
                    : TERRAIN_MINIMAP_COLORS[t.terrain.baseCategory] ?? '#4d7c3f';
                return <rect key={`${rx}_${ry}`} x={cx - 2.5} y={cy - 2.5} width={5} height={5} rx={1} fill={fill} />;
              })
            )}
            {mgr.patrols.map(p => (
              <circle
                key={p.id}
                cx={p.x * 6 + 4}
                cy={p.y * 6 + (p.x & 1 ? 6 : 3)}
                r={p.isBoss ? 3 : 2.3}
                fill={p.isBoss ? '#f59e0b' : '#ef4444'}
              />
            ))}
            <circle
              cx={mgr.heroX * 6 + 4}
              cy={mgr.heroY * 6 + (mgr.heroX & 1 ? 6 : 3)}
              r={3.2}
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth={1}
            />
          </svg>
        </div>
      </div>

      {/* BOTTOM PERIMETER: Wesnoth Terrain Inspector (Left) + Stance & End Day (Right) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-2 w-full">
        {/* Terrain & Patrol Inspector */}
        {inspect && (
          <div className="tactical-panel rounded-lg p-3 w-full sm:w-80 pointer-events-auto space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-bold text-sm text-[#f6eedb] truncate">
                  {inspect.tile.terrain.name}
                </span>
                <span className="font-mono-num text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[#e2b95b]">
                  {inspect.tile.terrain.code}
                </span>
              </div>
              <span className="font-mono-num text-xs text-slate-400 shrink-0">
                ({inspect.tile.x},{inspect.tile.y})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num text-slate-300">
              <span>
                Cost:{' '}
                <strong className={inspect.moveCost >= 99 ? 'text-rose-400' : 'text-emerald-300'}>
                  {inspect.moveCost >= 99 ? 'Impassable' : `${inspect.moveCost} MP`}
                </strong>
              </span>
              <span>
                Cover: <strong className="text-sky-300">{inspect.defensePct}%</strong>
              </span>
              {pathPreview && pathPreview.path.length > 1 && (
                <span className={pathPreview.withinMp ? 'text-amber-300' : 'text-slate-400'}>
                  Path: {pathPreview.cost} MP
                </span>
              )}
            </div>

            {inspect.patrol && (
              <div className="text-xs text-rose-300 font-semibold pt-0.5">
                Hostile Patrol: {inspect.patrol.name} ({inspect.patrol.enemies.length} units)
              </div>
            )}
            {inspect.village && (
              <div className="text-xs text-emerald-300 font-medium pt-0.5">
                {inspect.village.name} · Restores HP/MP
              </div>
            )}
            {!inspect.patrol && !inspect.village && mgr.eventLog[0] && (
              <div className="hidden sm:block text-[11px] text-slate-400 truncate">{mgr.eventLog[0]}</div>
            )}
          </div>
        )}

        {/* Right: Wesnoth Movetype Stance Switcher + End Day */}
        <div className="tactical-panel rounded-lg p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {(['smallfoot', 'mounted', 'woodland'] as WesnothMovetypeId[]).map(mtId => {
            const active = mgr.movetype === mtId;
            const label = mtId === 'smallfoot' ? 'Foot' : mtId === 'mounted' ? 'Mounted' : 'Ranger';
            return (
              <button
                key={mtId}
                type="button"
                title={WESNOTH_MOVETYPES[mtId].description}
                onClick={() => {
                  game.setOverworldMovetype(mtId);
                  onUpdate();
                }}
                className={`px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              game.endOverworldDay();
              onUpdate();
            }}
            className="px-3 sm:px-4 py-2 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] text-xs font-bold rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Sun size={14} /> End Day
          </button>
        </div>
      </div>

      {/* OVERWORLD ENCOUNTER MODAL */}
      {enc && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-40 pointer-events-auto">
          <div className="max-w-md w-full tactical-panel rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-900 border border-[#c98b2c]/40 flex items-center justify-center shrink-0">
                <img
                  src={WESNOTH_ASSET_URLS[enc.patrol.spriteAsset]}
                  alt={enc.patrol.name}
                  className="w-14 h-14 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  {enc.reason === 'boss'
                    ? 'Keep Siege Encounter'
                    : enc.reason === 'ambush'
                      ? 'Wilderness Ambush'
                      : 'Hostile Patrol Intercepted'}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{enc.patrol.name}</h2>
                <p className="text-xs text-slate-300">
                  {enc.tile.terrain.name} ({enc.tile.terrain.code}) · {enc.patrol.enemies.length} Hostiles
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono-num text-center text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">Gold</div>
                <div className="text-sm font-bold text-[#e2b95b]">+{enc.patrol.rewardGold}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">EXP</div>
                <div className="text-sm font-bold text-emerald-400">+{enc.patrol.rewardExp}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">JP</div>
                <div className="text-sm font-bold text-sky-400">+{enc.patrol.rewardJp}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  soundManager.playClick();
                  game.engagePendingEncounter();
                  onUpdate();
                }}
                className="flex-1 py-3 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Swords size={16} /> Engage Battle
              </button>
              {!enc.patrol.isBoss && (
                <button
                  type="button"
                  onClick={() => {
                    game.evadePendingEncounter();
                    onUpdate();
                  }}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  Evade
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
