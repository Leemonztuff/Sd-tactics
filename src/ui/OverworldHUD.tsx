import React, { useState } from 'react';
import { game } from '../game/Game';
import { ITEMS, JOBS } from '../game/GameConfig';
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
  Swords,
  Compass,
  Sparkles,
  CheckCircle2,
  Circle,
  ShoppingBag,
  PackageOpen,
  X
} from 'lucide-react';
import { OVERWORLD_VILLAGES } from '../overworld/WesnothOverworldMap';
import { ValenMeter } from './brand/ValenMeter';

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
  castle: '#94a3b8',
  snow: '#a8c7ea',
  volcanic: '#57484e',
  lava: '#d9480f'
};

export const OverworldHUD: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [showQuests, setShowQuests] = useState(false);
  const mgr = game.overworldManager;
  if (!mgr) return null;

  const inspect = game.hoveredHexInfo ?? mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
  const pathPreview = game.hoveredHexPath;
  const enc = mgr.pendingEncounter;
  const poi = mgr.pendingPoi;
  const worldEvent = mgr.pendingWorldEvent;
  const quest = mgr.getQuestProgress();
  const activePois = mgr.getActivePois();
  const activeWorldEvents = mgr.activeWorldEvents;
  const nextSeal = quest.seals.find(s => !s.completed);
  const currentRegion = mgr.getCurrentRegion();

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* TOP PERIMETER: Region/MP/Seals + Controls (Left) | Wesnoth Hex Minimap (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-2 w-full">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="valen-plaque valen-bevel px-3.5 py-2 flex items-center gap-3 sm:gap-4">
            <div>
              <div className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] leading-tight tracking-wide">
                {currentRegion}
              </div>
              <div className="text-[11px] text-[#cbd5e1] font-mono-num mt-0.5">
                Day <span className="text-[#f3cf7a] font-bold">{mgr.day}</span> ·{' '}
                <span className="text-[#f3cf7a] font-bold">{game.saveData.gold} G</span> ·{' '}
                <span className={quest.campaignComplete ? 'text-emerald-300 font-semibold' : 'text-sky-300'}>
                  Seals {quest.sealsRestored}/{quest.totalSeals}
                </span>
              </div>
              <div className="hidden lg:block text-[10px] text-[#8a99b3] mt-0.5 truncate max-w-[230px]">
                {quest.campaignComplete
                  ? 'All 3 Seals Restored · Realm Liberated!'
                  : `Next: ${nextSeal?.detail ?? ''}`}
              </div>
            </div>

            <div className="w-20 sm:w-24">
              <div className="flex justify-between text-[11px] font-mono-num text-[#cbd5e1] mb-0.5">
                <span>MP</span>
                <span className="text-emerald-300 font-semibold">
                  {mgr.currentMp}/{mgr.maxMp}
                </span>
              </div>
              <ValenMeter
                value={mgr.currentMp}
                max={mgr.maxMp}
                heightClass="h-1.5 sm:h-2"
                fillClass="bg-emerald-400"
                ghostClass="bg-amber-200/60"
              />
            </div>

            <div className="hidden md:block text-[11px] font-mono-num text-[#cbd5e1]">
              Threat{' '}
              <span className={mgr.ambushMeter >= 70 ? 'text-rose-400 font-bold' : 'text-[#f3cf7a]'}>
                {mgr.ambushMeter}%
              </span>
            </div>
          </div>

          {/* Utility Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Quest Seals"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                setShowQuests(v => !v);
              }}
              className={`px-2.5 h-9 flex items-center gap-1.5 valen-plaque-quiet valen-bevel text-xs font-semibold cursor-pointer ${
                showQuests ? 'text-[#f3cf7a]' : 'text-[#f6eedb] hover:text-[#f3cf7a]'
              }`}
            >
              <Compass size={14} /> <span className="hidden sm:inline">Quests</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Rotate Camera Left"
              onClick={e => {
                e.currentTarget.blur();
                game.overworldScene?.rotateCamera(-Math.PI / 5);
              }}
              className="w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
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
              className="hidden sm:flex w-9 h-9 items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
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
              className="hidden sm:flex w-9 h-9 items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
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
              className="px-2.5 h-9 flex items-center gap-1.5 valen-plaque-quiet valen-bevel text-[#f6eedb] hover:text-[#f3cf7a] text-xs font-semibold cursor-pointer"
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
              className="px-2.5 h-9 flex items-center gap-1.5 valen-plaque-quiet valen-bevel text-[#f6eedb] hover:text-[#f3cf7a] text-xs font-semibold cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#f3cf7a] cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
            >
              <Pause size={15} />
            </button>
          </div>
        </div>

        {/* Top-Right Compact Wesnoth Hex Minimap */}
        <div className="hidden md:block valen-plaque valen-bevel p-2 pointer-events-auto">
          <svg
            width={mgr.map.width * 6 + 6}
            height={mgr.map.height * 6 + 6}
            viewBox={`0 0 ${mgr.map.width * 6 + 6} ${mgr.map.height * 6 + 6}`}
            aria-label="Wesnoth Overworld Minimap"
            className="cursor-pointer"
          >
            {mgr.map.tiles.map((row, ry) =>
              row.map((t, rx) => {
                const cx = rx * 6 + 4;
                const cy = ry * 6 + (rx & 1 ? 6 : 3);
                const fill =
                  t.terrain.overlayCategory === 'forest'
                    ? t.terrain.baseCategory === 'snow'
                      ? '#557d82'
                      : '#27592c'
                    : TERRAIN_MINIMAP_COLORS[t.terrain.baseCategory] ?? '#4d7c3f';
                return (
                  <rect
                    key={`${rx}_${ry}`}
                    x={cx - 2.5}
                    y={cy - 2.5}
                    width={5}
                    height={5}
                    rx={1}
                    fill={fill}
                    onClick={() => game.overworldScene?.focusOnHex(rx, ry, mgr.map)}
                  />
                );
              })
            )}
            {OVERWORLD_VILLAGES.map(v => (
              <rect
                key={v.id}
                x={v.x * 6 + 2.2}
                y={v.y * 6 + (v.x & 1 ? 4.2 : 1.2)}
                width={3.6}
                height={3.6}
                rx={0.5}
                fill={mgr.visitedVillages.has(v.id) ? '#34d399' : '#f59e0b'}
                onClick={() => game.overworldScene?.focusOnHex(v.x, v.y, mgr.map)}
              />
            ))}
            {activePois.map(p => (
              <circle
                key={p.id}
                cx={p.x * 6 + 4}
                cy={p.y * 6 + (p.x & 1 ? 6 : 3)}
                r={2.1}
                fill={p.kind === 'recruit' ? '#34d399' : '#facc15'}
                onClick={() => game.overworldScene?.focusOnHex(p.x, p.y, mgr.map)}
              />
            ))}
            {activeWorldEvents.map(ev => {
              const cx = ev.x * 6 + 4;
              const cy = ev.y * 6 + (ev.x & 1 ? 6 : 3);
              return (
                <polygon
                  key={ev.id}
                  points={`${cx},${cy - 2.8} ${cx + 2.8},${cy} ${cx},${cy + 2.8} ${cx - 2.8},${cy}`}
                  fill={ev.category === 'merchant' ? '#fb923c' : '#2dd4bf'}
                  stroke="#0f172a"
                  strokeWidth={0.6}
                  onClick={() => game.overworldScene?.focusOnHex(ev.x, ev.y, mgr.map)}
                />
              );
            })}
            {mgr.patrols.map(p => (
              <circle
                key={p.id}
                cx={p.x * 6 + 4}
                cy={p.y * 6 + (p.x & 1 ? 6 : 3)}
                r={p.isBoss ? 3 : 2.3}
                fill={p.isBoss ? '#f59e0b' : '#ef4444'}
                onClick={() => game.overworldScene?.focusOnHex(p.x, p.y, mgr.map)}
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

      {/* Collapsible Quest Seal Checklist */}
      {showQuests && (
        <div className="self-start valen-plaque valen-bevel p-4 w-80 pointer-events-auto space-y-3 my-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-display font-bold text-[#f3cf7a] tracking-wide">Aether Seal Campaign</span>
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                setShowQuests(false);
              }}
              className="text-[#8a99b3] hover:text-[#f6eedb] cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="space-y-2.5">
            {quest.seals.map(seal => (
              <div key={seal.id} className="flex items-start gap-2 text-xs">
                {seal.completed ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle size={14} className="text-[#8a99b3] shrink-0 mt-0.5" />
                )}
                <div>
                  <div className={seal.completed ? 'font-semibold text-emerald-300' : 'font-semibold text-[#f6eedb]'}>
                    {seal.label}
                  </div>
                  <div className="text-[11px] text-[#8a99b3]">{seal.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="valen-divider" />
          <div className="text-[11px] text-[#cbd5e1] font-mono-num space-y-1">
            <div className="flex justify-between">
              <span>Cities &amp; Towns: {quest.villagesLiberated}/{quest.totalVillages}</span>
              <span>Keeps: {quest.bountiesCleared}/{quest.totalBounties}</span>
            </div>
            <div className="flex justify-between text-[#8a99b3]">
              <span>Recruits/Caches: {activePois.length}</span>
              <span>Patrols: {quest.patrolsRemaining}</span>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM PERIMETER: Wesnoth Terrain Inspector (Left) + Stance & End Day (Right) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-2 w-full">
        {/* Terrain & Patrol Inspector */}
        {inspect && (
          <div className="valen-plaque valen-bevel px-3 py-2 sm:p-3.5 w-full sm:w-80 pointer-events-auto space-y-1">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] truncate">
                  {inspect.tile.terrain.name}
                </span>
                <span className="font-mono-num text-[11px] text-[#f3cf7a]">
                  {inspect.tile.terrain.code}
                </span>
              </div>
              <span className="font-mono-num text-[11px] text-[#8a99b3] shrink-0">
                ({inspect.tile.x},{inspect.tile.y})
              </span>
            </div>

            <div className="hidden sm:block text-[11px] text-sky-300 font-medium truncate">
              {inspect.regionName}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs font-mono-num text-[#cbd5e1]">
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
                <span className={pathPreview.withinMp ? 'text-[#f3cf7a]' : 'text-[#8a99b3]'}>
                  Path: {pathPreview.cost} MP
                </span>
              )}
            </div>

            {inspect.patrol && (
              <div className="text-xs text-rose-300 font-semibold pt-0.5">
                Hostile Patrol: {inspect.patrol.name} ({inspect.patrol.enemies.length} units)
              </div>
            )}
            {inspect.poi && (
              <div className="text-xs text-[#f3cf7a] font-semibold pt-0.5">
                {inspect.poi.kind === 'recruit' ? 'Ally Recruit: ' : 'Discovery: '}
                {inspect.poi.name}
              </div>
            )}
            {inspect.worldEventNode && (
              <div className="text-xs text-teal-300 font-semibold pt-0.5">
                {inspect.worldEventNode.category === 'merchant' ? 'Caravan: ' : 'World Event: '}
                {inspect.worldEventNode.title}
              </div>
            )}
            {inspect.village && (
              <div className="text-xs text-emerald-300 font-medium pt-0.5">
                {inspect.village.cityTier === 'city'
                  ? 'City: '
                  : inspect.village.cityTier === 'port'
                    ? 'Harbor: '
                    : 'Village: '}
                {inspect.village.name} · Restores HP/MP
              </div>
            )}
            {!inspect.patrol && !inspect.village && !inspect.poi && !inspect.worldEventNode && mgr.eventLog[0] && (
              <div className="hidden sm:block text-[11px] text-[#8a99b3] truncate">{mgr.eventLog[0]}</div>
            )}
          </div>
        )}

        {/* Right: Movetype Stance Switcher + End Day */}
        <div className="valen-plaque valen-bevel p-1.5 sm:p-2 flex items-center gap-1 sm:gap-1.5 pointer-events-auto">
          {(['smallfoot', 'mounted', 'woodland'] as WesnothMovetypeId[]).map((mtId, idx) => {
            const active = mgr.movetype === mtId;
            const label = mtId === 'smallfoot' ? 'Foot' : mtId === 'mounted' ? 'Mounted' : 'Ranger';
            return (
              <button
                key={mtId}
                type="button"
                title={WESNOTH_MOVETYPES[mtId].description}
                onClick={e => {
                  e.currentTarget.blur();
                  soundManager.playClick();
                  game.setOverworldMovetype(mtId);
                  onUpdate();
                }}
                className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2.5 sm:px-3 py-2 text-xs font-semibold valen-bevel flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                  active ? 'bg-sky-600 text-white' : 'valen-btn-steel text-[#cbd5e1]'
                }`}
              >
                <span>{label}</span>
                <span className="hidden sm:inline font-mono-num text-[10px] opacity-70">[{idx + 1}]</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              game.endOverworldDay();
              onUpdate();
            }}
            className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2 valen-btn-gold valen-bevel text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Sun size={14} /> End Day
          </button>
        </div>
      </div>

      {/* OVERWORLD DISCOVERY / RECRUIT MODAL */}
      {poi && !enc && (
        <div className="fixed inset-0 bg-[#090d16]/80 flex items-center justify-center p-4 z-40 pointer-events-auto">
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 valen-plaque-quiet valen-bevel flex items-center justify-center text-emerald-300 shrink-0">
                <Sparkles size={24} />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  {poi.subtitle}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{poi.name}</h2>
              </div>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{poi.lore}</p>

            <div className="valen-divider" />

            <div className="space-y-1.5 text-xs font-mono-num">
              {poi.recruit && (
                <div className="flex justify-between items-center text-emerald-300 font-semibold">
                  <span>
                    New Hero: {poi.recruit.name} ({JOBS[poi.recruit.jobId].name})
                  </span>
                  <span>Lv.{poi.recruit.level}</span>
                </div>
              )}
              {poi.rewardGold && (
                <div className="text-[#f3cf7a] font-semibold">+{poi.rewardGold} Gold</div>
              )}
              {poi.rewardJpAll && (
                <div className="text-sky-300 font-semibold">+{poi.rewardJpAll} JP to All Heroes</div>
              )}
              {poi.rewardItem && (
                <div className="text-[#f3cf7a] font-semibold">
                  +{poi.rewardItem.count}× {ITEMS[poi.rewardItem.itemId]?.name}
                </div>
              )}
            </div>

            <button
              type="button"
              data-start="true"
              onClick={e => {
                e.currentTarget.blur();
                game.resolvePendingPoi();
                onUpdate();
              }}
              className="w-full py-3 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
            >
              {poi.recruit ? 'Recruit to Squad' : 'Claim Discovery'}
            </button>
          </div>
        </div>
      )}

      {/* RANDOM WORLD EVENT MODAL */}
      {worldEvent && !enc && !poi && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={worldEvent.title}
          className="fixed inset-0 bg-[#090d16]/80 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-lg w-full valen-plaque valen-bevel p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 valen-plaque-quiet valen-bevel flex items-center justify-center shrink-0 ${
                    worldEvent.category === 'merchant' ? 'text-[#f3cf7a]' : 'text-teal-300'
                  }`}
                >
                  {worldEvent.category === 'merchant' ? (
                    <ShoppingBag size={24} />
                  ) : worldEvent.category === 'supply_cache' ? (
                    <PackageOpen size={24} />
                  ) : (
                    <Sparkles size={24} />
                  )}
                </div>
                <div>
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      worldEvent.category === 'merchant' ? 'text-[#d89b32]' : 'text-teal-300'
                    }`}
                  >
                    {worldEvent.subtitle}
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-[#f6eedb]">
                    {worldEvent.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close World Event"
                onClick={e => {
                  e.currentTarget.blur();
                  game.dismissPendingWorldEvent();
                  onUpdate();
                }}
                className="w-8 h-8 valen-btn-steel valen-bevel flex items-center justify-center cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{worldEvent.description}</p>

            <div className="valen-divider" />

            <div className="flex items-center justify-between text-xs font-mono-num">
              <span className="text-[#8a99b3]">
                Hex ({worldEvent.x},{worldEvent.y}) · {worldEvent.terrainCode}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[#f3cf7a] font-semibold">Gold: {game.saveData.gold} G</span>
                <span className="text-emerald-300 font-semibold">
                  MP: {mgr.currentMp}/{mgr.maxMp}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {worldEvent.choices.map(choice => {
                const isPurchased = Boolean(choice.offer?.purchased);
                const cantAffordGold = Boolean(choice.costGold && game.saveData.gold < choice.costGold);
                const cantAffordMp = Boolean(choice.costMp && mgr.currentMp < choice.costMp);
                const disabled = isPurchased || cantAffordGold || cantAffordMp;

                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={disabled}
                    onClick={e => {
                      e.currentTarget.blur();
                      game.resolveWorldEventChoice(choice.id);
                      onUpdate();
                    }}
                    className={`w-full text-left p-3 valen-bevel transition-colors ${
                      isPurchased
                        ? 'bg-emerald-950/30 border border-emerald-600/40 text-emerald-300/75 cursor-default'
                        : disabled
                          ? 'bg-[#090d16]/70 border border-white/10 text-slate-500 cursor-not-allowed'
                          : 'valen-btn-steel cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#f6eedb]">{choice.label}</span>
                      <div className="flex items-center gap-1.5 font-mono-num text-[11px] shrink-0">
                        {isPurchased && <span className="text-emerald-300 font-bold">Purchased</span>}
                        {!isPurchased && choice.costGold && (
                          <span className={cantAffordGold ? 'text-rose-400 font-bold' : 'text-[#f3cf7a] font-bold'}>
                            -{choice.costGold} G
                          </span>
                        )}
                        {!isPurchased && choice.costMp && (
                          <span className={cantAffordMp ? 'text-rose-400 font-bold' : 'text-sky-300 font-bold'}>
                            -{choice.costMp} MP
                          </span>
                        )}
                        {choice.rewardGold && (
                          <span className="text-[#f3cf7a] font-bold">+{choice.rewardGold} G</span>
                        )}
                        {choice.rewardMp && (
                          <span className="text-emerald-300 font-bold">+{choice.rewardMp} MP</span>
                        )}
                        {choice.rewardJpAll && (
                          <span className="text-sky-300 font-bold">+{choice.rewardJpAll} JP</span>
                        )}
                        {choice.rewardItem && (
                          <span className="text-[#f3cf7a] font-semibold">
                            +{choice.rewardItem.count}× {ITEMS[choice.rewardItem.itemId]?.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-[#8a99b3] mt-0.5">{choice.description}</div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                game.dismissPendingWorldEvent();
                onUpdate();
              }}
              className="w-full py-2.5 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
            >
              {worldEvent.category === 'merchant' ? 'Depart Caravan' : 'Leave Site'}
            </button>
          </div>
        </div>
      )}

      {/* OVERWORLD ENCOUNTER MODAL */}
      {enc && (
        <div className="fixed inset-0 bg-[#090d16]/80 flex items-center justify-center p-4 z-40 pointer-events-auto">
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 valen-plaque-quiet valen-bevel flex items-center justify-center shrink-0">
                <img
                  src={WESNOTH_ASSET_URLS[enc.patrol.spriteAsset]}
                  alt={enc.patrol.name}
                  className="w-14 h-14 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">
                  {enc.reason === 'boss'
                    ? 'Keep Siege Encounter'
                    : enc.reason === 'ambush'
                      ? 'Wilderness Ambush'
                      : 'Hostile Patrol Intercepted'}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{enc.patrol.name}</h2>
                <p className="text-xs text-[#cbd5e1] mt-0.5">
                  {enc.tile.terrain.name} ({enc.tile.terrain.code}) · {enc.patrol.enemies.length} Hostiles
                </p>
              </div>
            </div>

            <div className="valen-divider" />

            <div className="grid grid-cols-3 divide-x divide-white/10 font-mono-num text-center text-xs">
              <div className="px-2">
                <div className="text-[10px] text-[#8a99b3] uppercase tracking-wider">Gold</div>
                <div className="text-base font-bold text-[#f3cf7a] mt-0.5">+{enc.patrol.rewardGold}</div>
              </div>
              <div className="px-2">
                <div className="text-[10px] text-[#8a99b3] uppercase tracking-wider">EXP</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">+{enc.patrol.rewardExp}</div>
              </div>
              <div className="px-2">
                <div className="text-[10px] text-[#8a99b3] uppercase tracking-wider">JP</div>
                <div className="text-base font-bold text-sky-400 mt-0.5">+{enc.patrol.rewardJp}</div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={e => {
                  e.currentTarget.blur();
                  soundManager.playClick();
                  game.engagePendingEncounter();
                  onUpdate();
                }}
                className="flex-1 py-3 valen-btn-gold valen-bevel font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Swords size={16} /> Engage Battle
              </button>
              {!enc.patrol.isBoss && (
                <button
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    game.evadePendingEncounter();
                    onUpdate();
                  }}
                  className="px-4 py-3 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
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

