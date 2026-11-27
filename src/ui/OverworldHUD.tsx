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
  CheckCircle2,
  Circle,
  X,
  Flame,
  ShieldAlert,
  LogOut,
  Lock,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { OVERWORLD_VILLAGES } from '../overworld/WesnothOverworldMap';
import { DUNGEON_FLOORS, OVERWORLD_RUINS } from '../overworld/WesnothDungeonMaps';
import {
  UI_WESNOTH_ICONS,
  getItemWesnothIcon,
  getJobWesnothIcon,
  getPoiWesnothAsset,
  getVillageWesnothIcon,
  getWorldEventWesnothAsset
} from '../overworld/WesnothIconRegistry';
import { ValenMeter } from './brand/ValenMeter';
import { WesnothIcon } from './brand/WesnothIcon';

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
  lava: '#d9480f',
  dungeon: '#3f3b38',
  cave: '#342e2a',
  chasm: '#0b0e14',
  wall: '#1a1c22'
};

export const OverworldHUD: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [showQuests, setShowQuests] = useState(false);
  const [selectedRuinFloor, setSelectedRuinFloor] = useState<1 | 2 | 3 | 4 | null>(null);
  const mgr = game.overworldManager;
  if (!mgr) return null;

  const isDungeon = mgr.activeZone === 'dungeon';
  const floorSpec = isDungeon ? mgr.getCurrentFloorSpec() : null;
  const dungeonProgress = mgr.getDungeonProgress();
  const adjacentTrap = isDungeon ? mgr.getAdjacentDetectedTrap() : null;
  const detectedTraps = isDungeon ? mgr.getDetectedTraps() : [];
  const activeTreasures = isDungeon ? mgr.getActiveDungeonTreasures() : [];
  const activeAllies = isDungeon ? mgr.getActiveDungeonAllies() : [];

  const inspect = game.hoveredHexInfo ?? mgr.getTileInspectInfo(mgr.heroX, mgr.heroY);
  const pathPreview = game.hoveredHexPath;
  const enc = mgr.pendingEncounter;
  const poi = mgr.pendingPoi;
  const worldEvent = mgr.pendingWorldEvent;
  const pendingRuin = mgr.pendingRuin;
  const pendingTrap = mgr.pendingTrap;
  const pendingTreasure = mgr.pendingDungeonTreasure;
  const pendingAlly = mgr.pendingDungeonAlly;
  const pendingStairs = mgr.pendingStairs;

  const quest = mgr.getQuestProgress();
  const activePois = mgr.getActivePois();
  const activeWorldEvents = mgr.activeWorldEvents;
  const nextSeal = quest.seals.find(s => !s.completed);
  const currentRegion = mgr.getCurrentRegion();

  const chosenRuinFloor: 1 | 2 | 3 | 4 = pendingRuin
    ? selectedRuinFloor && mgr.unlockedDungeonFloors.has(selectedRuinFloor)
      ? selectedRuinFloor
      : mgr.unlockedDungeonFloors.has(pendingRuin.recommendedFloor)
        ? pendingRuin.recommendedFloor
        : 1
    : 1;

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* TOP PERIMETER: Region/MP/Seals + Controls (Left) | Wesnoth Hex Minimap (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-2 w-full">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="valen-plaque valen-bevel px-3.5 py-2 flex items-center gap-3 sm:gap-4">
            <div>
              <div className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] leading-tight tracking-wide flex items-center gap-2">
                <span>{currentRegion}</span>
                {isDungeon && floorSpec && (
                  <span className="text-[10px] font-mono-num text-amber-300 font-semibold">
                    {floorSpec.difficultyLabel}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#cbd5e1] font-mono-num mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>
                  {isDungeon ? 'Watch' : 'Day'} <span className="text-[#f3cf7a] font-bold">{mgr.day}</span>
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-[#f3cf7a] font-bold">
                  <WesnothIcon assetKey={UI_WESNOTH_ICONS.gold} alt="Gold" size={14} />
                  <span>{game.saveData.gold} G</span>
                </span>
                <span>·</span>
                {isDungeon ? (
                  <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                    <Flame size={12} />
                    <span>Torch {mgr.getVisionRadius()}</span>
                  </span>
                ) : (
                  <span className={quest.campaignComplete ? 'text-emerald-300 font-semibold' : 'text-sky-300'}>
                    Seals {quest.sealsRestored}/{quest.totalSeals}
                  </span>
                )}
                {isDungeon && mgr.dungeonWoundPct > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-rose-400 font-bold">Fatigue -{mgr.dungeonWoundPct}%</span>
                  </>
                )}
              </div>
              <div className="hidden lg:block text-[10px] text-[#8a99b3] mt-0.5 truncate max-w-[260px]">
                {isDungeon
                  ? `Foes ${dungeonProgress.enemiesCleared}/${dungeonProgress.totalEnemies} · Chests ${dungeonProgress.treasuresClaimed}/${dungeonProgress.totalTreasures} · Allies ${dungeonProgress.alliesRescued}/${dungeonProgress.totalAllies}`
                  : quest.campaignComplete
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
              <WesnothIcon assetKey={UI_WESNOTH_ICONS.quests} alt="Quests" size={16} />
              <span className="hidden sm:inline">Quests</span>
            </button>
            {isDungeon && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Exit Dungeon to Surface"
                onClick={e => {
                  e.currentTarget.blur();
                  game.exitDungeonToSurface();
                  onUpdate();
                }}
                className="px-2.5 h-9 flex items-center gap-1.5 valen-plaque-quiet valen-bevel text-xs font-semibold text-sky-300 hover:text-[#f3cf7a] cursor-pointer"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Surface</span>
              </button>
            )}
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

        {/* Top-Right Compact Wesnoth Hex Minimap (Shroud-aware inside Dungeon) */}
        <div className="hidden md:block valen-plaque valen-bevel p-2 pointer-events-auto">
          <svg
            width={mgr.map.width * 6 + 6}
            height={mgr.map.height * 6 + 6}
            viewBox={`0 0 ${mgr.map.width * 6 + 6} ${mgr.map.height * 6 + 6}`}
            aria-label={isDungeon ? 'Dungeon Shroud Minimap' : 'Wesnoth Overworld Minimap'}
            className="cursor-pointer bg-black"
          >
            {mgr.map.tiles.map((row, ry) =>
              row.map((t, rx) => {
                const cx = rx * 6 + 4;
                const cy = ry * 6 + (rx & 1 ? 6 : 3);
                const explored = !isDungeon || mgr.isHexExplored(rx, ry);
                const visible = !isDungeon || mgr.isHexVisible(rx, ry);
                const fill = !explored
                  ? '#000000'
                  : t.terrain.overlayCategory === 'forest'
                    ? t.terrain.baseCategory === 'snow'
                      ? '#557d82'
                      : '#27592c'
                    : t.terrain.overlayCategory === 'mushrooms'
                      ? '#4c3e66'
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
                    fillOpacity={!explored ? 1 : visible ? 1 : 0.4}
                    onClick={() => game.overworldScene?.focusOnHex(rx, ry, mgr.map)}
                  />
                );
              })
            )}

            {!isDungeon &&
              OVERWORLD_VILLAGES.map(v => (
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

            {!isDungeon &&
              OVERWORLD_RUINS.map(r => {
                const cx = r.x * 6 + 4;
                const cy = r.y * 6 + (r.x & 1 ? 6 : 3);
                return (
                  <polygon
                    key={r.id}
                    points={`${cx},${cy - 3.1} ${cx + 3.1},${cy} ${cx},${cy + 3.1} ${cx - 3.1},${cy}`}
                    fill="#a855f7"
                    stroke="#f3cf7a"
                    strokeWidth={0.7}
                    onClick={() => game.overworldScene?.focusOnHex(r.x, r.y, mgr.map)}
                  />
                );
              })}

            {!isDungeon &&
              activePois.map(p => (
                <circle
                  key={p.id}
                  cx={p.x * 6 + 4}
                  cy={p.y * 6 + (p.x & 1 ? 6 : 3)}
                  r={2.1}
                  fill={p.kind === 'recruit' ? '#34d399' : '#facc15'}
                  onClick={() => game.overworldScene?.focusOnHex(p.x, p.y, mgr.map)}
                />
              ))}

            {!isDungeon &&
              activeWorldEvents.map(ev => {
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

            {isDungeon && floorSpec && mgr.isHexExplored(floorSpec.stairsUp.x, floorSpec.stairsUp.y) && (
              <rect
                x={floorSpec.stairsUp.x * 6 + 2}
                y={floorSpec.stairsUp.y * 6 + (floorSpec.stairsUp.x & 1 ? 4 : 1)}
                width={4}
                height={4}
                rx={0.5}
                fill="#38bdf8"
              />
            )}

            {isDungeon &&
              floorSpec?.stairsDown &&
              mgr.isHexExplored(floorSpec.stairsDown.x, floorSpec.stairsDown.y) && (
                <rect
                  x={floorSpec.stairsDown.x * 6 + 2}
                  y={floorSpec.stairsDown.y * 6 + (floorSpec.stairsDown.x & 1 ? 4 : 1)}
                  width={4}
                  height={4}
                  rx={0.5}
                  fill="#facc15"
                />
              )}

            {isDungeon &&
              floorSpec?.sanctuaries
                .filter(s => mgr.isHexExplored(s.x, s.y))
                .map(s => (
                  <circle
                    key={s.id}
                    cx={s.x * 6 + 4}
                    cy={s.y * 6 + (s.x & 1 ? 6 : 3)}
                    r={2.3}
                    fill="#34d399"
                  />
                ))}

            {isDungeon &&
              activeTreasures
                .filter(t => mgr.isHexExplored(t.x, t.y))
                .map(t => (
                  <circle
                    key={t.id}
                    cx={t.x * 6 + 4}
                    cy={t.y * 6 + (t.x & 1 ? 6 : 3)}
                    r={2.1}
                    fill="#facc15"
                  />
                ))}

            {isDungeon &&
              activeAllies
                .filter(a => mgr.isHexExplored(a.x, a.y))
                .map(a => (
                  <circle
                    key={a.id}
                    cx={a.x * 6 + 4}
                    cy={a.y * 6 + (a.x & 1 ? 6 : 3)}
                    r={2.3}
                    fill="#34d399"
                  />
                ))}

            {isDungeon &&
              detectedTraps.map(tr => (
                <circle
                  key={tr.id}
                  cx={tr.x * 6 + 4}
                  cy={tr.y * 6 + (tr.x & 1 ? 6 : 3)}
                  r={2.0}
                  fill="#f97316"
                />
              ))}

            {mgr.patrols
              .filter(p => !isDungeon || mgr.isHexVisible(p.x, p.y))
              .map(p => (
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

      {/* Collapsible Quest Seal & Dungeon Progress Checklist */}
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
          <div className="valen-divider" />
          <div className="space-y-1 text-[11px] font-mono-num text-[#cbd5e1]">
            <div className="font-display font-bold text-purple-300 text-xs">Sunken Vaults (4 Tiers)</div>
            <div className="flex justify-between">
              <span>Floors Unlocked: {dungeonProgress.floorsUnlocked}/4</span>
              <span>Foes: {dungeonProgress.enemiesCleared}/{dungeonProgress.totalEnemies}</span>
            </div>
            <div className="flex justify-between text-[#8a99b3]">
              <span>Treasures: {dungeonProgress.treasuresClaimed}/{dungeonProgress.totalTreasures}</span>
              <span>Allies Freed: {dungeonProgress.alliesRescued}/{dungeonProgress.totalAllies}</span>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM PERIMETER: Wesnoth Terrain Inspector (Left) + Stance & End Day (Right) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-2 w-full">
        {/* Terrain, Landmark & Shroud Inspector */}
        {inspect && (() => {
          if (inspect.shrouded) {
            return (
              <div className="valen-plaque valen-bevel px-3 py-2 sm:p-3.5 w-full sm:w-88 pointer-events-auto flex items-center gap-3">
                <WesnothIcon
                  assetKey="shroud_void"
                  alt="Unexplored Shroud"
                  size={42}
                  framed
                  frameTone="steel"
                  className="shrink-0 bg-black"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] truncate">
                      Unexplored Shroud
                    </span>
                    <span className="font-mono-num text-[11px] text-[#8a99b3] shrink-0">
                      ({inspect.tile.x},{inspect.tile.y})
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8a99b3]">
                    Beyond torchlight · Move closer to peel back the darkness
                  </div>
                </div>
              </div>
            );
          }

          const inspectIconKey = inspect.patrol
            ? inspect.patrol.spriteAsset
            : inspect.trap
              ? inspect.trap.assetKey
              : inspect.ally
                ? inspect.ally.spriteAsset
                : inspect.treasure
                  ? inspect.treasure.assetKey
                  : inspect.stairs
                    ? inspect.stairs === 'down'
                      ? 'scenery_trapdoor_open'
                      : 'scenery_trapdoor_closed'
                    : inspect.sanctuary
                      ? 'dun_village_cave'
                      : inspect.ruin
                        ? inspect.ruin.assetKey
                        : inspect.poi
                          ? getPoiWesnothAsset(inspect.poi)
                          : inspect.worldEventNode
                            ? getWorldEventWesnothAsset(
                                inspect.worldEventNode.templateId,
                                inspect.worldEventNode.category
                              )
                            : inspect.landmark
                              ? inspect.landmark.assetKey
                              : inspect.village
                                ? getVillageWesnothIcon(inspect.village)
                                : inspect.tile.terrain.code === 'Kh' || inspect.tile.terrain.code === 'Ke'
                                  ? UI_WESNOTH_ICONS.brazier
                                  : null;
          const inspectTone = inspect.patrol || inspect.trap
            ? 'crimson'
            : inspect.ruin || inspect.poi || inspect.worldEventNode || inspect.treasure
              ? 'gold'
              : inspect.village || inspect.ally || inspect.sanctuary
                ? 'emerald'
                : inspect.tile.terrain.code === 'Kh'
                  ? 'gold'
                  : 'steel';

          return (
            <div className="valen-plaque valen-bevel px-3 py-2 sm:p-3.5 w-full sm:w-96 pointer-events-auto flex items-center gap-3">
              {inspectIconKey && (
                <WesnothIcon
                  assetKey={inspectIconKey}
                  alt={inspect.tile.terrain.name}
                  size={42}
                  framed
                  frameTone={inspectTone}
                  className="shrink-0"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] truncate">
                      {inspect.tile.terrain.name}
                    </span>
                    <span className="font-mono-num text-[11px] text-[#f3cf7a]">
                      {inspect.tile.terrain.code}
                    </span>
                    {inspect.fogged && (
                      <span className="text-[10px] font-mono-num text-slate-400">· Fog</span>
                    )}
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
                  <div className="text-xs text-rose-300 font-semibold pt-0.5 truncate">
                    {inspect.patrol.isBoss ? 'Floor Warden: ' : 'Hostile Patrol: '}
                    {inspect.patrol.name} ({inspect.patrol.enemies.length} units)
                  </div>
                )}
                {inspect.trap && (
                  <div className="text-xs text-orange-300 font-semibold pt-0.5 truncate">
                    Detected Trap: {inspect.trap.name} (-{inspect.trap.woundPct}% HP)
                  </div>
                )}
                {inspect.ally && (
                  <div className="text-xs text-emerald-300 font-semibold pt-0.5 truncate">
                    Captive Ally: {inspect.ally.name}
                  </div>
                )}
                {inspect.treasure && (
                  <div className="text-xs text-[#f3cf7a] font-semibold pt-0.5 truncate">
                    Treasure Cache: {inspect.treasure.name}
                  </div>
                )}
                {inspect.sanctuary && (
                  <div className="text-xs text-emerald-300 font-semibold pt-0.5 truncate">
                    Sanctuary: {inspect.sanctuary.name} · Mends Wounds
                  </div>
                )}
                {inspect.stairs && (
                  <div className="text-xs text-sky-300 font-semibold pt-0.5 truncate">
                    {inspect.stairs === 'down'
                      ? 'Stairwell Down · Deeper Vaults'
                      : mgr.currentDungeonFloor === 1
                        ? 'Stairwell Up · Valen Surface'
                        : `Stairwell Up · Level ${mgr.currentDungeonFloor - 1}`}
                  </div>
                )}
                {inspect.ruin && (
                  <div className="text-xs text-purple-300 font-semibold pt-0.5 truncate">
                    Ancient Ruins: {inspect.ruin.name} · 4-Tier Dungeon
                  </div>
                )}
                {inspect.poi && (
                  <div className="text-xs text-[#f3cf7a] font-semibold pt-0.5 truncate">
                    {inspect.poi.kind === 'recruit' ? 'Ally Recruit: ' : 'Discovery: '}
                    {inspect.poi.name}
                  </div>
                )}
                {inspect.worldEventNode && (
                  <div className="text-xs text-teal-300 font-semibold pt-0.5 truncate">
                    {inspect.worldEventNode.category === 'merchant' ? 'Caravan: ' : 'World Event: '}
                    {inspect.worldEventNode.title}
                  </div>
                )}
                {inspect.landmark && !inspect.poi && !inspect.worldEventNode && !inspect.ruin && (
                  <div className="text-xs text-[#f3cf7a] font-medium pt-0.5 truncate">
                    Landmark: {inspect.landmark.name}
                  </div>
                )}
                {inspect.village && (
                  <div className="text-xs text-emerald-300 font-medium pt-0.5 truncate">
                    {inspect.village.cityTier === 'city'
                      ? 'City: '
                      : inspect.village.cityTier === 'port'
                        ? 'Harbor: '
                        : 'Village: '}
                    {inspect.village.name} · Restores HP/MP
                  </div>
                )}
                {adjacentTrap && !mgr.hasAnyPendingPrompt() && (
                  <button
                    type="button"
                    disabled={mgr.currentMp < 1}
                    onClick={e => {
                      e.currentTarget.blur();
                      game.disarmAdjacentTrap(adjacentTrap.id);
                      onUpdate();
                    }}
                    className={`mt-1 px-2.5 py-1.5 valen-bevel text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                      mgr.currentMp >= 1
                        ? 'valen-btn-gold text-[#0b101b]'
                        : 'valen-btn-steel opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <ShieldAlert size={13} />
                    <span>
                      Disarm {adjacentTrap.name} (1 MP · +{adjacentTrap.disarmGold}G)
                    </span>
                  </button>
                )}
                {!inspect.patrol &&
                  !inspect.village &&
                  !inspect.poi &&
                  !inspect.worldEventNode &&
                  !inspect.landmark &&
                  !inspect.ruin &&
                  !inspect.trap &&
                  !inspect.treasure &&
                  !inspect.ally &&
                  !inspect.sanctuary &&
                  !inspect.stairs &&
                  mgr.eventLog[0] && (
                    <div className="hidden sm:block text-[11px] text-[#8a99b3] truncate">{mgr.eventLog[0]}</div>
                  )}
              </div>
            </div>
          );
        })()}

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
              <WesnothIcon
                assetKey={getPoiWesnothAsset(poi)}
                alt={poi.name}
                size={56}
                framed
                frameTone={poi.kind === 'recruit' ? 'emerald' : 'gold'}
              />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  {poi.subtitle}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{poi.name}</h2>
              </div>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{poi.lore}</p>

            <div className="valen-divider" />

            <div className="space-y-2 text-xs font-mono-num">
              {poi.recruit && (
                <div className="flex justify-between items-center text-emerald-300 font-semibold">
                  <span className="flex items-center gap-2">
                    <WesnothIcon assetKey={getJobWesnothIcon(poi.recruit.jobId)} alt={poi.recruit.name} size={22} framed frameTone="emerald" />
                    <span>
                      New Hero: {poi.recruit.name} ({JOBS[poi.recruit.jobId].name})
                    </span>
                  </span>
                  <span>Lv.{poi.recruit.level}</span>
                </div>
              )}
              {poi.rewardGold && (
                <div className="text-[#f3cf7a] font-semibold flex items-center gap-2">
                  <WesnothIcon assetKey={UI_WESNOTH_ICONS.gold} alt="Gold" size={20} framed frameTone="gold" />
                  <span>+{poi.rewardGold} Gold</span>
                </div>
              )}
              {poi.rewardJpAll && (
                <div className="text-sky-300 font-semibold flex items-center gap-2">
                  <WesnothIcon assetKey={UI_WESNOTH_ICONS.jp} alt="JP" size={20} framed frameTone="steel" />
                  <span>+{poi.rewardJpAll} JP to All Heroes</span>
                </div>
              )}
              {poi.rewardItem && (
                <div className="text-[#f3cf7a] font-semibold flex items-center gap-2">
                  <WesnothIcon
                    assetKey={getItemWesnothIcon(poi.rewardItem.itemId)}
                    alt={ITEMS[poi.rewardItem.itemId]?.name ?? poi.rewardItem.itemId}
                    size={24}
                    framed
                    frameTone="gold"
                  />
                  <span>
                    +{poi.rewardItem.count}× {ITEMS[poi.rewardItem.itemId]?.name}
                  </span>
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
                <WesnothIcon
                  assetKey={getWorldEventWesnothAsset(worldEvent.templateId, worldEvent.category)}
                  alt={worldEvent.title}
                  size={56}
                  framed
                  frameTone={worldEvent.category === 'merchant' ? 'gold' : 'emerald'}
                />
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
                <span className="text-[#f3cf7a] font-semibold flex items-center gap-1">
                  <WesnothIcon assetKey={UI_WESNOTH_ICONS.gold} alt="Gold" size={14} />
                  <span>{game.saveData.gold} G</span>
                </span>
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
                const choiceItemId = choice.offer?.itemId ?? choice.rewardItem?.itemId;
                const choiceIconKey = choiceItemId
                  ? getItemWesnothIcon(choiceItemId)
                  : choice.rewardJpAll
                    ? UI_WESNOTH_ICONS.jp
                    : choice.rewardGold
                      ? UI_WESNOTH_ICONS.gold
                      : choice.rewardMp
                        ? 'atk_foot_boot'
                        : UI_WESNOTH_ICONS.quests;

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
                    className={`w-full text-left p-3 valen-bevel flex items-center gap-3 transition-colors ${
                      isPurchased
                        ? 'bg-emerald-950/30 border border-emerald-600/40 text-emerald-300/75 cursor-default'
                        : disabled
                          ? 'bg-[#090d16]/70 border border-white/10 text-slate-500 cursor-not-allowed'
                          : 'valen-btn-steel cursor-pointer'
                    }`}
                  >
                    <WesnothIcon
                      assetKey={choiceIconKey}
                      alt={choice.label}
                      size={36}
                      framed
                      frameTone={choice.offer ? 'gold' : 'steel'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#f6eedb] truncate">{choice.label}</span>
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
                    </div>
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

      {/* 1. ANCIENT RUINS DUNGEON ENTRANCE MODAL */}
      {pendingRuin && !enc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pendingRuin.name}
          className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-lg w-full valen-plaque valen-bevel p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <WesnothIcon
                  assetKey={pendingRuin.assetKey}
                  alt={pendingRuin.name}
                  size={56}
                  framed
                  frameTone="gold"
                />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-300">
                    {pendingRuin.subtitle}
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#f6eedb]">{pendingRuin.name}</h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close Ruins Portal"
                onClick={e => {
                  e.currentTarget.blur();
                  setSelectedRuinFloor(null);
                  game.dismissPendingRuin();
                  onUpdate();
                }}
                className="w-8 h-8 valen-btn-steel valen-bevel flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{pendingRuin.lore}</p>

            <div className="valen-divider" />

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-[#8a99b3] font-semibold">
                Select Dungeon Depth
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([1, 2, 3, 4] as const).map(f => {
                  const spec = DUNGEON_FLOORS[f];
                  const unlocked = mgr.unlockedDungeonFloors.has(f);
                  const active = chosenRuinFloor === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      disabled={!unlocked}
                      onClick={e => {
                        e.currentTarget.blur();
                        soundManager.playClick();
                        setSelectedRuinFloor(f);
                      }}
                      className={`p-2.5 valen-bevel text-left flex items-center justify-between gap-2 transition-colors ${
                        !unlocked
                          ? 'bg-[#090d16]/70 border border-white/10 text-slate-500 cursor-not-allowed'
                          : active
                            ? 'bg-sky-700/80 border border-sky-300 text-white cursor-pointer'
                            : 'valen-btn-steel cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{spec.name}</div>
                        <div className="text-[10px] opacity-80 font-mono-num">{spec.difficultyLabel}</div>
                      </div>
                      {!unlocked && <Lock size={13} className="shrink-0 text-slate-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={e => {
                  e.currentTarget.blur();
                  setSelectedRuinFloor(null);
                  game.enterDungeonFromRuin(chosenRuinFloor);
                  onUpdate();
                }}
                className="flex-1 py-3 valen-btn-gold valen-bevel font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowDown size={16} /> Descend to Level {chosenRuinFloor}
              </button>
              <button
                type="button"
                onClick={e => {
                  e.currentTarget.blur();
                  setSelectedRuinFloor(null);
                  game.dismissPendingRuin();
                  onUpdate();
                }}
                className="px-4 py-3 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
              >
                Stay on Surface
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. DUNGEON TRAP SPRUNG MODAL */}
      {pendingTrap && !enc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pendingTrap.name}
          className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <WesnothIcon
                assetKey={pendingTrap.assetKey}
                alt={pendingTrap.name}
                size={56}
                framed
                frameTone="crimson"
              />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                  Dungeon Trap Triggered
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{pendingTrap.name}</h2>
              </div>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{pendingTrap.description}</p>

            <div className="valen-divider" />

            <div className="grid grid-cols-2 gap-3 text-xs font-mono-num">
              <div className="valen-plaque-quiet valen-bevel p-2.5 text-center">
                <div className="text-[10px] text-[#8a99b3] uppercase">Squad Fatigue</div>
                <div className="text-base font-bold text-rose-400 mt-0.5">
                  +{pendingTrap.woundPct}% ({mgr.dungeonWoundPct}% Total)
                </div>
              </div>
              <div className="valen-plaque-quiet valen-bevel p-2.5 text-center">
                <div className="text-[10px] text-[#8a99b3] uppercase">March Stamina</div>
                <div className="text-base font-bold text-amber-300 mt-0.5">-{pendingTrap.mpDrain} MP</div>
              </div>
            </div>

            <button
              type="button"
              data-start="true"
              onClick={e => {
                e.currentTarget.blur();
                game.dismissPendingTrap();
                onUpdate();
              }}
              className="w-full py-3 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
            >
              Press Onward
            </button>
          </div>
        </div>
      )}

      {/* 3. DUNGEON TREASURE CACHE MODAL */}
      {pendingTreasure && !enc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pendingTreasure.name}
          className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <WesnothIcon
                assetKey={pendingTreasure.assetKey}
                alt={pendingTreasure.name}
                size={56}
                framed
                frameTone="gold"
              />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3cf7a]">
                  {pendingTreasure.subtitle}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{pendingTreasure.name}</h2>
              </div>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{pendingTreasure.lore}</p>

            <div className="valen-divider" />

            <div className="space-y-2 text-xs font-mono-num">
              <div className="text-[#f3cf7a] font-semibold flex items-center gap-2">
                <WesnothIcon assetKey={UI_WESNOTH_ICONS.gold} alt="Gold" size={20} framed frameTone="gold" />
                <span>+{pendingTreasure.rewardGold} Gold</span>
              </div>
              {pendingTreasure.rewardJpAll > 0 && (
                <div className="text-sky-300 font-semibold flex items-center gap-2">
                  <WesnothIcon assetKey={UI_WESNOTH_ICONS.jp} alt="JP" size={20} framed frameTone="steel" />
                  <span>+{pendingTreasure.rewardJpAll} JP to All Heroes</span>
                </div>
              )}
              {pendingTreasure.rewardItem && (
                <div className="text-[#f3cf7a] font-semibold flex items-center gap-2">
                  <WesnothIcon
                    assetKey={getItemWesnothIcon(pendingTreasure.rewardItem.itemId)}
                    alt={ITEMS[pendingTreasure.rewardItem.itemId]?.name ?? pendingTreasure.rewardItem.itemId}
                    size={24}
                    framed
                    frameTone="gold"
                  />
                  <span>
                    +{pendingTreasure.rewardItem.count}× {ITEMS[pendingTreasure.rewardItem.itemId]?.name}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              data-start="true"
              onClick={e => {
                e.currentTarget.blur();
                game.resolvePendingDungeonTreasure();
                onUpdate();
              }}
              className="w-full py-3 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
            >
              Claim Dungeon Spoils
            </button>
          </div>
        </div>
      )}

      {/* 4. CAPTIVE ALLY RESCUE MODAL */}
      {pendingAlly && !enc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pendingAlly.name}
          className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <WesnothIcon
                assetKey={pendingAlly.spriteAsset}
                alt={pendingAlly.name}
                size={56}
                framed
                frameTone="emerald"
              />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
                  {pendingAlly.subtitle}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">{pendingAlly.name}</h2>
              </div>
            </div>

            <p className="text-sm text-[#cbd5e1] leading-relaxed">{pendingAlly.lore}</p>

            <div className="valen-divider" />

            <div className="flex justify-between items-center text-xs font-mono-num text-emerald-300 font-semibold">
              <span className="flex items-center gap-2">
                <WesnothIcon
                  assetKey={getJobWesnothIcon(pendingAlly.recruit.jobId)}
                  alt={pendingAlly.recruit.name}
                  size={24}
                  framed
                  frameTone="emerald"
                />
                <span>
                  {pendingAlly.recruit.name} ({JOBS[pendingAlly.recruit.jobId].name})
                </span>
              </span>
              <span>Lv.{pendingAlly.recruit.level}</span>
            </div>

            <button
              type="button"
              data-start="true"
              onClick={e => {
                e.currentTarget.blur();
                game.resolvePendingDungeonAlly();
                onUpdate();
              }}
              className="w-full py-3 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
            >
              Free &amp; Recruit Ally
            </button>
          </div>
        </div>
      )}

      {/* 5. DUNGEON STAIRWELL MODAL */}
      {pendingStairs && !enc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dungeon Stairwell"
          className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-4 z-40 pointer-events-auto"
        >
          <div className="max-w-md w-full valen-plaque valen-bevel p-6 space-y-5">
            <div className="flex items-center gap-4">
              <WesnothIcon
                assetKey={
                  pendingStairs.direction === 'down' ? 'scenery_trapdoor_open' : 'scenery_trapdoor_closed'
                }
                alt="Dungeon Stairwell"
                size={56}
                framed
                frameTone={pendingStairs.blockedByWardenName ? 'crimson' : 'gold'}
              />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                  {pendingStairs.direction === 'down' ? 'Descent Stairwell' : 'Ascent Stairwell'}
                </div>
                <h2 className="font-display text-xl font-bold text-[#f6eedb]">
                  {pendingStairs.direction === 'down'
                    ? `Descend to Level ${pendingStairs.targetFloor}`
                    : pendingStairs.targetFloor === null
                      ? 'Ascend to Valen Surface'
                      : `Ascend to Level ${pendingStairs.targetFloor}`}
                </h2>
              </div>
            </div>

            {pendingStairs.blockedByWardenName ? (
              <div className="valen-plaque-quiet valen-bevel p-3 text-xs text-rose-300 flex items-start gap-2">
                <Lock size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span>
                  Arcane seal active: Defeat <strong>{pendingStairs.blockedByWardenName}</strong> guarding
                  this stairwell to descend deeper.
                </span>
              </div>
            ) : (
              <p className="text-sm text-[#cbd5e1] leading-relaxed">
                {pendingStairs.direction === 'down'
                  ? `Torchlight flickers down carved basalt steps into ${DUNGEON_FLOORS[pendingStairs.targetFloor!].name}.`
                  : pendingStairs.targetFloor === null
                    ? 'Fresh surface air drifts down from the ruined archway above.'
                    : `Stone stairs climb back toward ${DUNGEON_FLOORS[pendingStairs.targetFloor].name}.`}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              {!pendingStairs.blockedByWardenName && (
                <button
                  type="button"
                  data-start="true"
                  onClick={e => {
                    e.currentTarget.blur();
                    game.confirmStairsTransition();
                    onUpdate();
                  }}
                  className="flex-1 py-3 valen-btn-gold valen-bevel font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {pendingStairs.direction === 'down' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
                  <span>
                    {pendingStairs.targetFloor === null
                      ? 'Emerge to Surface'
                      : pendingStairs.direction === 'down'
                        ? `Descend to Level ${pendingStairs.targetFloor}`
                        : `Ascend to Level ${pendingStairs.targetFloor}`}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={e => {
                  e.currentTarget.blur();
                  game.dismissPendingStairs();
                  onUpdate();
                }}
                className={`${pendingStairs.blockedByWardenName ? 'w-full' : 'px-4'} py-3 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer`}
              >
                {pendingStairs.blockedByWardenName ? 'Return to Dungeon' : 'Stay Here'}
              </button>
            </div>
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
                    ? enc.dungeonFloor
                      ? `Level ${enc.dungeonFloor} Warden Encounter`
                      : 'Keep Siege Encounter'
                    : enc.reason === 'ambush'
                      ? enc.dungeonFloor
                        ? 'Dungeon Shroud Ambush'
                        : 'Wilderness Ambush'
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

