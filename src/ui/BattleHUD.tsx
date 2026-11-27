import React, { useEffect, useState } from 'react';
import { game, ProjectedUnitMarker } from '../game/Game';
import { ABILITIES, ITEMS, JOBS, TERRAIN_RULES } from '../game/GameConfig';
import { soundManager } from '../utils/SoundManager';
import { Direction } from '../types/game';
import type { SkillVfxElement } from '../rendering/BattleVfxSystem';
import {
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ScrollText,
  Eye
} from 'lucide-react';
import { ELEMENT_STYLE, STATUS_LABEL } from './brand/BrandKit';
import { ActionGlyph, ElementGlyph, JobCrestGlyph } from './brand/ValenIcons';
import { ValenMeter } from './brand/ValenMeter';
import { ModelViewerModal } from './ModelViewerModal';

interface Props {
  onUpdate: () => void;
}

function getSynergyElement(synId: string): SkillVfxElement | 'pincer' | 'high' {
  if (synId === 'thermal_blast' || synId === 'ignite_terrain') return 'fire';
  if (synId === 'conductive_shock') return 'lightning';
  if (synId === 'solar_steam') return 'solar';
  if (synId === 'chrono_rupture') return 'astral';
  if (synId === 'corrosive_shatter') return 'acid';
  if (synId === 'toxic_expose') return 'venom';
  if (synId === 'pincer_flank') return 'pincer';
  if (synId === 'high_ground') return 'high';
  return 'steel';
}

function getAbilityElement(abId: string): SkillVfxElement {
  const ab = ABILITIES[abId];
  if (!ab) return 'steel';
  if (ab.element) return ab.element;
  if (ab.type === 'heal') return 'heal';
  if (ab.type === 'buff') return 'buff';
  return 'steel';
}

export const BattleHUD: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [showLog, setShowLog] = useState(false);
  const [showModelTester, setShowModelTester] = useState(false);
  const [markers, setMarkers] = useState<ProjectedUnitMarker[]>([]);

  // Lightweight 10Hz projection refresh for overhead unit HP bars & floating numbers
  useEffect(() => {
    const id = window.setInterval(() => {
      if (game.state === 'battle' && game.sceneManager) {
        setMarkers(game.getProjectedUnitMarkers());
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  const activeUnit = game.activeUnit;
  const isPlayerTurn = activeUnit?.faction === 'player' && !game.isPaused;
  const hoveredTile = game.hoveredTile;
  const hoveredTerrain = hoveredTile ? TERRAIN_RULES[hoveredTile.terrain] : null;
  const targetPreview = game.targetPreview;

  const primaryAttackId = activeUnit?.jobId === 'tirador' ? 'aimed_shot' : 'slash';
  const battleConsumables = game.getBattleConsumables();
  const parTurns = game.currentMission?.parTurns ?? 12;

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* Projected Unit Mini-HP Bars & Floating Combat Text */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {markers.map(m => {
          if (!m.visible) return null;
          return (
            <div
              key={m.id}
              style={{ left: `${m.sx}px`, top: `${m.sy}px`, transform: 'translate(-50%, -100%)' }}
              className="absolute flex flex-col items-center"
            >
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 leading-none tracking-wide ${
                  m.isActive
                    ? 'bg-[#d89b32] text-[#090d16] font-bold'
                    : 'bg-[#090d16]/85 text-[#f6eedb]'
                }`}
              >
                {m.name}
              </span>
              <div className="w-14 mt-0.5">
                <ValenMeter
                  value={m.hp}
                  max={m.maxHp}
                  heightClass="h-1.5"
                  fillClass={m.faction === 'player' ? 'bg-sky-400' : 'bg-rose-500'}
                  ghostClass="bg-amber-200/70"
                />
              </div>
            </div>
          );
        })}

        {game.floatingTexts.map(ft => {
          const proj = game.sceneManager?.projectWorldToScreen(ft.x, ft.y, ft.z);
          if (!proj || !proj.visible) return null;
          const colorCls =
            ft.color === 'crit'
              ? 'text-[#f3cf7a] text-xl font-extrabold'
              : ft.color === 'heal'
                ? 'text-emerald-300 text-base font-bold'
                : ft.color === 'miss'
                  ? 'text-slate-300 text-sm font-semibold'
                  : ft.color === 'status'
                    ? 'text-purple-300 text-xs font-bold'
                    : 'text-rose-400 text-base font-bold';

          return (
            <div
              key={ft.id}
              style={{
                left: `${proj.sx}px`,
                top: `${proj.sy - 14}px`,
                textShadow: '0 2px 8px rgba(0,0,0,0.95)'
              }}
              className={`absolute font-mono-num floating-dmg ${colorCls}`}
            >
              {ft.text}
            </div>
          );
        })}
      </div>

      {/* TOP PERIMETER: Mission Crest Plaque + Utility Cluster (Left) | Segmented CT Turn Order (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-1.5 sm:gap-2 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="valen-plaque valen-bevel px-3 py-1.5 sm:px-4 sm:py-2 max-w-[165px] sm:max-w-none">
            <div className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] leading-tight tracking-wide truncate">
              {game.currentMission?.title}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#8a99b3] mt-0.5">
              <span className="hidden sm:inline text-[#cbd5e1]">{game.currentMission?.victoryCondition} · </span>
              Turn{' '}
              <span className="font-mono-num font-bold text-[#f3cf7a]">
                {game.turnManager?.totalTurnsElapsed ?? 1}
              </span>
              <span className="font-mono-num text-[#8a99b3]"> / Par {parTurns}</span>
            </div>
          </div>

          {/* Utility Icon Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Rotate Camera Left"
              onClick={e => {
                e.currentTarget.blur();
                game.sceneManager?.rotateCamera(-Math.PI / 4);
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
                game.sceneManager?.rotateCamera(Math.PI / 4);
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
                game.sceneManager?.adjustZoom(-1.5);
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
                game.sceneManager?.adjustZoom(1.5);
              }}
              className="hidden sm:flex w-9 h-9 items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
            >
              <ZoomOut size={15} />
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
              aria-label="Combat Log"
              onClick={e => {
                e.currentTarget.blur();
                setShowLog(v => !v);
              }}
              className={`w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel cursor-pointer ${
                showLog ? 'text-[#f3cf7a]' : 'text-[#cbd5e1] hover:text-[#f3cf7a]'
              }`}
            >
              <ScrollText size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Battle"
              onClick={e => {
                e.currentTarget.blur();
                game.togglePause();
                onUpdate();
              }}
              className="w-9 h-9 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#cbd5e1] hover:text-[#f3cf7a] cursor-pointer"
            >
              <Pause size={15} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Probar Modelo 3D"
              title="Probar Modelo 3D (Rig & Animaciones)"
              onClick={e => {
                e.currentTarget.blur();
                setShowModelTester(true);
              }}
              className="flex items-center gap-1.5 px-2.5 h-9 valen-plaque-quiet valen-bevel text-[#f3cf7a] hover:bg-[#d89b32]/25 font-bold text-xs cursor-pointer border border-[#d89b32]/50 shadow-sm"
            >
              <Eye size={15} />
              <span className="hidden sm:inline">Modelo 3D</span>
            </button>
          </div>
        </div>

        {/* CT Turn Order Segmented Strip (No pill borders around every chip) */}
        <div className="valen-plaque valen-bevel px-3 py-1.5 pointer-events-auto flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#8a99b3] uppercase tracking-[0.18em] hidden sm:inline">
            CT Order
          </span>
          <div className="flex items-stretch divide-x divide-white/10">
            {game.turnManager?.turnQueue.slice(0, 6).map((entry, idx) => (
              <div
                key={`${entry.entity.id}_${idx}`}
                title={`${entry.entity.name} · SPD ${entry.entity.stats.spd} · CT ${entry.projectedCt}`}
                className={`px-2 py-0.5 text-[11px] font-semibold font-mono-num relative ${
                  idx === 0
                    ? 'bg-[#d89b32]/20 text-[#f3cf7a] border-b-2 border-[#f3cf7a]'
                    : entry.entity.faction === 'player'
                      ? 'text-sky-300 border-b-2 border-sky-500/40'
                      : 'text-rose-300 border-b-2 border-rose-500/40'
                }`}
              >
                {entry.entity.name.slice(0, 3)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible Battle Chronicle */}
      {showLog && (
        <div className="self-end valen-plaque valen-bevel p-3.5 w-80 max-h-48 overflow-y-auto pointer-events-auto space-y-2 my-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-display font-bold text-[#f3cf7a] tracking-wide">Battle Chronicle</span>
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                setShowLog(false);
              }}
              className="text-[#8a99b3] hover:text-[#f6eedb] cursor-pointer"
            >
              Close
            </button>
          </div>
          {game.combatLog.slice(0, 8).map((line, i) => (
            <div key={i} className="space-y-1.5">
              <div className="valen-divider" />
              <p className="text-xs text-[#cbd5e1]">{line}</p>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM PERIMETER: Unit Dossier + Forecast (Left) | Unified Command Bar (Right) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-2 sm:gap-3 w-full">
        {/* Left: Active Unit Dossier & Contextual Duel Forecast / Terrain */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pointer-events-auto">
          {activeUnit && (
            <div className="valen-plaque valen-bevel px-3 py-2 sm:p-3.5 w-full sm:w-64 space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <JobCrestGlyph jobId={activeUnit.jobId} className="w-5 h-5 shrink-0" />
                  <span className="font-display font-bold text-sm sm:text-base text-[#f6eedb] truncate">
                    {activeUnit.name}
                  </span>
                </div>
                <span className="font-mono-num text-[11px] text-[#f3cf7a] shrink-0">
                  Lv.{activeUnit.level} · {activeUnit.facing.slice(0, 1).toUpperCase()}
                </span>
              </div>

              <div className="hidden sm:flex items-center justify-between text-[11px] text-[#8a99b3]">
                <span>{JOBS[activeUnit.jobId].name}</span>
                <span className="font-mono-num">
                  MOV {activeUnit.stats.mov} · JMP {activeUnit.stats.jmp}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono-num text-[11px]">
                <div>
                  <div className="flex justify-between text-[#cbd5e1] mb-0.5">
                    <span>HP</span>
                    <span>
                      {activeUnit.stats.hp}/{activeUnit.stats.maxHp}
                    </span>
                  </div>
                  <ValenMeter
                    value={activeUnit.stats.hp}
                    max={activeUnit.stats.maxHp}
                    heightClass="h-1.5 sm:h-2"
                    fillClass="bg-rose-500"
                    ghostClass="bg-amber-200/65"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[#cbd5e1] mb-0.5">
                    <span>MP</span>
                    <span>
                      {activeUnit.stats.mp}/{activeUnit.stats.maxMp}
                    </span>
                  </div>
                  <ValenMeter
                    value={activeUnit.stats.mp}
                    max={activeUnit.stats.maxMp}
                    heightClass="h-1.5 sm:h-2"
                    fillClass="bg-sky-400"
                    ghostClass="bg-cyan-200/60"
                  />
                </div>
              </div>

              {activeUnit.statusEffects.length > 0 && (
                <div className="text-[11px] font-mono-num flex flex-wrap gap-x-2">
                  {activeUnit.statusEffects.map((s, idx) => {
                    const meta = STATUS_LABEL[s.type];
                    return (
                      <span key={`${s.type}_${idx}`} className={meta.colorClass}>
                        {meta.label}({s.duration})
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Contextual Duel Forecast / Passive Terrain Card */}
          {(targetPreview || hoveredTile) && (
            <div
              className={`valen-plaque-quiet valen-bevel p-2.5 sm:p-3.5 w-full sm:w-68 text-xs space-y-1.5 ${
                targetPreview ? '' : 'hidden sm:block'
              }`}
            >
              {targetPreview ? (
                <>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-display font-bold text-[#f6eedb] truncate">
                      {targetPreview.target.name}
                    </span>
                    <span className="font-mono-num text-[#f3cf7a] shrink-0">
                      {targetPreview.preview.hitChance}% Hit · {targetPreview.preview.critChance}% Crit
                    </span>
                  </div>

                  <div className="font-mono-num text-sm font-bold text-[#f3cf7a] flex items-baseline justify-between">
                    <span>
                      {targetPreview.preview.isHeal
                        ? game.selectedItemId && ITEMS[game.selectedItemId]?.consumableEffect?.healMp
                          ? `Restore +${targetPreview.preview.estimatedDamage} MP`
                          : `Restore +${targetPreview.preview.estimatedDamage} HP`
                        : targetPreview.preview.estimatedDamage > 0
                          ? `Est. ${targetPreview.preview.estimatedDamage} DMG`
                          : 'Apply Status'}
                    </span>
                    {targetPreview.preview.synergyMultiplier > 1 && (
                      <span className="text-[11px] text-emerald-300">
                        ×{targetPreview.preview.synergyMultiplier.toFixed(2)} Synergy
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-[#8a99b3] font-mono-num">
                    {targetPreview.preview.angle.toUpperCase()} ({targetPreview.preview.facingBonus}×) · Elev{' '}
                    {targetPreview.preview.heightDiff >= 0
                      ? `+${targetPreview.preview.heightDiff}`
                      : targetPreview.preview.heightDiff}
                  </div>

                  {/* Unboxed inline synergy callouts with bespoke SVG glyphs (zero pill capsules) */}
                  {targetPreview.preview.synergies.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <div className="valen-divider mb-1" />
                      {targetPreview.preview.synergies.map(syn => {
                        const elem = getSynergyElement(syn.id);
                        const colorCls =
                          syn.accent === 'sky'
                            ? 'text-sky-300'
                            : syn.accent === 'amber'
                              ? 'text-[#f3cf7a]'
                              : syn.accent === 'emerald'
                                ? 'text-emerald-300'
                                : syn.accent === 'purple'
                                  ? 'text-purple-300'
                                  : 'text-rose-300';
                        return (
                          <div
                            key={syn.id}
                            className={`flex items-center justify-between gap-2 text-[11px] font-semibold font-mono-num ${colorCls}`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <ElementGlyph element={elem} className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{syn.label}</span>
                            </span>
                            <span className="shrink-0">{syn.bonusLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                hoveredTile &&
                hoveredTerrain && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="font-display font-bold text-[#f6eedb]">{hoveredTerrain.name}</span>
                      <span className="font-mono-num text-[#8a99b3]">
                        ({hoveredTile.x},{hoveredTile.z}) H:{hoveredTile.y}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#cbd5e1] font-mono-num">
                      Move {hoveredTerrain.movementCost} · DEF +{hoveredTerrain.defenseBonus} · EVA{' '}
                      {hoveredTerrain.evasionBonus >= 0
                        ? `+${hoveredTerrain.evasionBonus}`
                        : hoveredTerrain.evasionBonus}
                      %
                      {hoveredTerrain.hazardDamage > 0 ? ` · Hazard -${hoveredTerrain.hazardDamage} HP` : ''}
                    </div>
                    {game.hoveredUnit && (
                      <div className="pt-1 space-y-0.5">
                        <div className="valen-divider mb-1" />
                        <div className="text-[11px] text-sky-300 font-medium flex justify-between font-mono-num">
                          <span>
                            {game.hoveredUnit.name} ({game.hoveredUnit.facing.toUpperCase()})
                          </span>
                          <span>
                            {game.hoveredUnit.stats.hp}/{game.hoveredUnit.stats.maxHp} HP
                          </span>
                        </div>
                        {game.hoveredUnit.statusEffects.length > 0 && (
                          <div className="text-[10px] text-[#f3cf7a] font-mono-num">
                            {game.hoveredUnit.statusEffects
                              .map(s => `${STATUS_LABEL[s.type].label}(${s.duration})`)
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </div>

        {/* Center/Right: Unified Tactical Command Dock */}
        <div className="pointer-events-auto">
          {!isPlayerTurn && (
            <div className="valen-plaque valen-bevel px-5 py-3 text-xs font-semibold text-[#f3cf7a]">
              {game.phase === 'moving'
                ? 'Unit advancing...'
                : game.phase === 'resolving'
                  ? 'Resolving action...'
                  : `${activeUnit?.name ?? 'Enemy'} taking turn...`}
            </div>
          )}

          {isPlayerTurn && game.phase === 'action_hub' && (
            <div className="valen-plaque valen-bevel p-1.5 sm:p-2 flex items-center gap-1 sm:gap-1.5">
              {!game.hasMovedThisTurn ? (
                <button
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    soundManager.playClick();
                    game.enterMoveSelect();
                    onUpdate();
                  }}
                  className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-[11px] sm:text-xs font-bold valen-bevel flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ActionGlyph kind="move" className="w-3.5 h-3.5 hidden sm:block" />
                  <span>Move</span>
                  <span className="hidden sm:inline font-mono-num text-[10px] opacity-80">[1]</span>
                </button>
              ) : (
                !game.hasActedThisTurn && (
                  <button
                    type="button"
                    onClick={e => {
                      e.currentTarget.blur();
                      soundManager.playClick();
                      game.undoMove();
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-2.5 valen-btn-steel valen-bevel text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ActionGlyph kind="undo" className="w-3.5 h-3.5" />
                    <span>Undo</span>
                    <span className="hidden sm:inline font-mono-num text-[10px] opacity-70">[U]</span>
                  </button>
                )
              )}

              {!game.hasActedThisTurn && (
                <>
                  <button
                    type="button"
                    onClick={e => {
                      e.currentTarget.blur();
                      soundManager.playClick();
                      game.selectAbility(primaryAttackId);
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-4 py-2 sm:py-2.5 valen-btn-gold valen-bevel text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ActionGlyph kind="attack" className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Attack</span>
                    <span className="hidden sm:inline font-mono-num text-[10px] opacity-75">[2]</span>
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.currentTarget.blur();
                      soundManager.playClick();
                      game.enterActionSelect();
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-2.5 valen-btn-steel valen-bevel text-[#f6eedb] text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ActionGlyph kind="abilities" className="w-3.5 h-3.5 text-[#f3cf7a] hidden sm:block" />
                    <span className="sm:hidden">Skills</span>
                    <span className="hidden sm:inline">Abilities</span>
                    <span className="hidden sm:inline font-mono-num text-[10px] opacity-70">[3]</span>
                  </button>
                  <button
                    type="button"
                    disabled={battleConsumables.length === 0}
                    onClick={e => {
                      e.currentTarget.blur();
                      soundManager.playClick();
                      game.enterBagSelect();
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-2.5 valen-btn-steel valen-bevel disabled:opacity-40 text-emerald-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ActionGlyph kind="bag" className="w-3.5 h-3.5 hidden sm:block" />
                    <span>Bag</span>
                    <span className="hidden sm:inline font-mono-num text-[10px] opacity-70">[4]</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={e => {
                  e.currentTarget.blur();
                  soundManager.playClick();
                  game.enterFacingSelect();
                  onUpdate();
                }}
                className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 px-2 sm:px-3.5 py-2 sm:py-2.5 valen-btn-steel valen-bevel text-[#cbd5e1] text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ActionGlyph kind="wait" className="w-3.5 h-3.5 hidden sm:block" />
                <span className="sm:hidden">Wait</span>
                <span className="hidden sm:inline">Wait / Face</span>
                <span className="hidden sm:inline font-mono-num text-[10px] opacity-70">[5]</span>
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'move_select' && (
            <div className="valen-plaque valen-bevel px-3.5 py-2.5 flex items-center gap-3">
              <span className="text-xs text-sky-300 font-medium">Select a highlighted blue tile</span>
              <button
                type="button"
                onClick={e => {
                  e.currentTarget.blur();
                  soundManager.playClick();
                  game.cancelSubMenu();
                  onUpdate();
                }}
                className="px-3.5 py-2 valen-btn-steel valen-bevel text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'action_select' && activeUnit && (
            <div className="valen-plaque valen-bevel p-3.5 space-y-2.5 max-w-md">
              <div className="flex justify-between items-center text-xs">
                <span className="font-display font-bold text-[#f3cf7a] tracking-wide">Select Ability</span>
                <button
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    soundManager.playClick();
                    game.cancelSubMenu();
                    onUpdate();
                  }}
                  className="text-[#8a99b3] hover:text-[#f6eedb] cursor-pointer"
                >
                  Cancel [Esc]
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {activeUnit.equippedAbilities.map(abId => {
                  const ab = ABILITIES[abId];
                  if (!ab) return null;
                  const enoughMp = activeUnit.stats.mp >= ab.mpCost;
                  const elem = getAbilityElement(abId);
                  const elemMeta = ELEMENT_STYLE[elem];
                  const synHint =
                    ab.element === 'fire'
                      ? 'Ignites · Thermal Combo'
                      : ab.element === 'lightning'
                        ? 'Chain Water · Shock'
                        : ab.element === 'astral'
                          ? 'Chrono Combo'
                          : ab.element === 'solar'
                            ? ab.type === 'heal'
                              ? 'Restores Squad HP'
                              : 'Solar Steam on Water'
                            : ab.element === 'acid'
                              ? 'Armor Break Combo'
                              : ab.element === 'venom'
                                ? 'Toxic Setup'
                                : ab.type === 'physical'
                                  ? 'Shatters Acid · Pincer'
                                  : ab.statusEffect
                                    ? ab.statusEffect.toUpperCase()
                                    : 'Support';
                  return (
                    <button
                      key={abId}
                      type="button"
                      disabled={!enoughMp}
                      onClick={e => {
                        e.currentTarget.blur();
                        soundManager.playClick();
                        game.selectAbility(abId);
                        onUpdate();
                      }}
                      className="p-2.5 valen-btn-steel valen-bevel disabled:opacity-45 text-left cursor-pointer"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#f6eedb] truncate">
                          <ElementGlyph element={elem} className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{ab.name}</span>
                        </span>
                        <span className="font-mono-num text-[11px] text-sky-400 shrink-0">{ab.mpCost} MP</span>
                      </div>
                      <div className="text-[10px] text-[#8a99b3] mt-1 font-mono-num">
                        Rng {ab.range} · AoE {ab.aoeRadius} · CT {ab.ctCost}
                      </div>
                      <div className={`text-[10px] mt-0.5 truncate ${elemMeta.colorClass}`}>
                        {elemMeta.label} · {synHint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPlayerTurn && game.phase === 'bag_select' && activeUnit && (
            <div className="valen-plaque valen-bevel p-3.5 space-y-2.5 max-w-md">
              <div className="flex justify-between items-center text-xs">
                <span className="font-display font-bold text-emerald-300 tracking-wide">Battle Bag</span>
                <button
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    soundManager.playClick();
                    game.cancelSubMenu();
                    onUpdate();
                  }}
                  className="text-[#8a99b3] hover:text-[#f6eedb] cursor-pointer"
                >
                  Cancel [Esc]
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {battleConsumables.map(entry => {
                  const item = ITEMS[entry.itemId];
                  const eff = item?.consumableEffect;
                  if (!item || !eff) return null;
                  return (
                    <button
                      key={entry.itemId}
                      type="button"
                      onClick={e => {
                        e.currentTarget.blur();
                        soundManager.playClick();
                        game.selectConsumable(entry.itemId);
                        onUpdate();
                      }}
                      className="p-2.5 valen-btn-steel valen-bevel text-left cursor-pointer"
                    >
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-xs font-bold text-[#f6eedb] truncate">{item.name}</span>
                        <span className="font-mono-num text-[11px] text-emerald-300 shrink-0">×{entry.count}</span>
                      </div>
                      <div className="text-[10px] text-[#8a99b3] mt-0.5 font-mono-num">
                        Rng {eff.range} ·{' '}
                        {eff.damage ? `${eff.damage} DMG AoE` : eff.healHp ? `+${eff.healHp} HP` : `+${eff.healMp} MP`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPlayerTurn && game.phase === 'target_select' && (
            <div className="valen-plaque valen-bevel px-3.5 py-2.5 flex items-center gap-3">
              <span className="text-xs text-[#f3cf7a] font-medium">
                {(game.selectedItemId
                  ? ITEMS[game.selectedItemId]?.name
                  : ABILITIES[game.selectedAbilityId || '']?.name) ?? 'Action'}{' '}
                · Select target tile
              </span>
              <button
                type="button"
                onClick={e => {
                  e.currentTarget.blur();
                  soundManager.playClick();
                  game.cancelSubMenu();
                  onUpdate();
                }}
                className="px-3.5 py-2 valen-btn-steel valen-bevel text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'facing_select' && (
            <div className="valen-plaque valen-bevel p-2.5 sm:p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-display font-bold text-[#f3cf7a] mr-1">Choose Facing:</span>
              {(['north', 'south', 'east', 'west'] as Direction[]).map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    soundManager.playClick();
                    game.confirmFacingAndEndTurn(dir);
                    onUpdate();
                  }}
                  className="px-3.5 py-2 valen-btn-steel valen-bevel hover:border-[#f3cf7a] hover:text-[#f3cf7a] text-xs font-bold uppercase cursor-pointer"
                >
                  {dir}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ModelViewerModal
        isOpen={showModelTester}
        onClose={() => {
          setShowModelTester(false);
          if (game.sceneManager && game.entityManager) {
            game.sceneManager.syncEntities(game.entityManager.getAllEntities());
          }
        }}
      />
    </div>
  );
};

