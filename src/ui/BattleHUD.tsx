import React, { useEffect, useState } from 'react';
import { game, ProjectedUnitMarker } from '../game/Game';
import { ABILITIES, JOBS, TERRAIN_RULES } from '../game/GameConfig';
import { soundManager } from '../utils/SoundManager';
import { Direction } from '../types/game';
import {
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ScrollText,
  Undo2
} from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const BattleHUD: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [showLog, setShowLog] = useState(false);
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

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* Projected Unit Mini-HP Bars & Floating Combat Text */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {markers.map(m => {
          if (!m.visible) return null;
          const pct = Math.max(0, Math.min(100, Math.round((m.hp / m.maxHp) * 100)));
          return (
            <div
              key={m.id}
              style={{ left: `${m.sx}px`, top: `${m.sy}px`, transform: 'translate(-50%, -100%)' }}
              className="absolute flex flex-col items-center"
            >
              <span
                className={`text-[10px] font-semibold px-1 rounded leading-tight ${
                  m.isActive ? 'bg-[#c98b2c] text-[#0d1017]' : 'bg-black/75 text-slate-200'
                }`}
              >
                {m.name}
              </span>
              <div className="w-12 h-1.5 bg-slate-950 border border-slate-700 rounded-sm overflow-hidden mt-0.5">
                <div
                  className={m.faction === 'player' ? 'bg-sky-400 h-full' : 'bg-rose-500 h-full'}
                  style={{ width: `${pct}%` }}
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
              ? 'text-amber-300 text-lg font-extrabold'
              : ft.color === 'heal'
                ? 'text-emerald-400 text-base font-bold'
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
                textShadow: '0 2px 6px rgba(0,0,0,0.95)'
              }}
              className={`absolute font-mono-num floating-dmg ${colorCls}`}
            >
              {ft.text}
            </div>
          );
        })}
      </div>

      {/* TOP PERIMETER: Mission Info + Utility Buttons (Left) | CT Turn Order (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-1.5 sm:gap-2 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="tactical-panel rounded-lg px-2.5 py-1.5 sm:px-3.5 sm:py-2">
            <div className="font-display font-bold text-xs sm:text-sm text-[#f6eedb] leading-tight">
              {game.currentMission?.title}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-300 mt-0.5">
              <span className="hidden sm:inline">{game.currentMission?.victoryCondition} · </span>Turn{' '}
              <span className="font-mono-num text-[#e2b95b]">
                {game.turnManager?.totalTurnsElapsed ?? 1}
              </span>
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
                game.sceneManager?.rotateCamera(Math.PI / 4);
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
                game.sceneManager?.adjustZoom(-1.5);
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
                game.sceneManager?.adjustZoom(1.5);
              }}
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-[#e2b95b] hover:bg-slate-800 cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
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
              className="w-9 h-9 flex items-center justify-center rounded-lg tactical-panel-subtle text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <Pause size={15} />
            </button>
          </div>
        </div>

        {/* CT Turn Order Queue */}
        <div className="tactical-panel rounded-lg px-3 py-2 pointer-events-auto flex items-center gap-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline">
            CT Queue
          </span>
          <div className="flex items-center gap-1.5">
            {game.turnManager?.turnQueue.slice(0, 6).map((entry, idx) => (
              <div
                key={`${entry.entity.id}_${idx}`}
                title={`${entry.entity.name} · SPD ${entry.entity.stats.spd} · CT ${entry.projectedCt}`}
                className={`px-2 py-1 rounded text-xs font-semibold font-mono-num border ${
                  idx === 0
                    ? 'border-[#e2b95b] bg-[#c98b2c]/25 text-[#f6eedb]'
                    : entry.entity.faction === 'player'
                      ? 'border-sky-500/40 bg-sky-950/70 text-sky-200'
                      : 'border-rose-500/40 bg-rose-950/70 text-rose-200'
                }`}
              >
                {entry.entity.name.slice(0, 3)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible Combat Log Drawer (top right below queue) */}
      {showLog && (
        <div className="self-end tactical-panel rounded-lg p-3 w-80 max-h-48 overflow-y-auto pointer-events-auto space-y-1.5 my-2">
          <div className="flex justify-between items-center text-xs font-semibold text-[#e2b95b]">
            <span>Battle Chronicle</span>
            <button type="button" onClick={() => setShowLog(false)} className="text-slate-400 hover:text-white cursor-pointer">
              Close
            </button>
          </div>
          {game.combatLog.slice(0, 8).map((line, i) => (
            <p key={i} className="text-xs text-slate-300 border-t border-slate-800 pt-1">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* BOTTOM PERIMETER: Unit/Target Inspector (Left) + Unified Command Dock (Center/Right) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-2 sm:gap-3 w-full">
        {/* Left: Active Unit & Hovered Terrain/Target Inspector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pointer-events-auto">
          {activeUnit && (
            <div className="tactical-panel rounded-lg p-2.5 sm:p-3.5 w-full sm:w-64 space-y-1.5 sm:space-y-2">
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-display font-bold text-sm sm:text-base text-[#f6eedb] truncate">
                    {activeUnit.name}
                  </span>
                  <span className="text-[11px] text-slate-400 sm:hidden truncate">
                    {JOBS[activeUnit.jobId].name}
                  </span>
                </div>
                <span className="font-mono-num text-[11px] sm:text-xs text-[#e2b95b] shrink-0">
                  Lv.{activeUnit.level} · {activeUnit.facing.toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-xs text-slate-400">
                {JOBS[activeUnit.jobId].name} · MOV {activeUnit.stats.mov} · JMP {activeUnit.stats.jmp}
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono-num text-[11px] sm:text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 mb-0.5">
                    <span>HP</span>
                    <span>
                      {activeUnit.stats.hp}/{activeUnit.stats.maxHp}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all"
                      style={{ width: `${Math.round((activeUnit.stats.hp / activeUnit.stats.maxHp) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-slate-300 mb-0.5">
                    <span>MP</span>
                    <span>
                      {activeUnit.stats.mp}/{activeUnit.stats.maxMp}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all"
                      style={{ width: `${Math.round((activeUnit.stats.mp / activeUnit.stats.maxMp) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {activeUnit.statusEffects.length > 0 && (
                <div className="text-[11px] text-amber-300">
                  Effects: {activeUnit.statusEffects.map(s => `${s.type}(${s.duration})`).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Contextual Tile / Combat Preview Card (passive tile hover hidden on small screens to preserve 3D viewport) */}
          {(targetPreview || hoveredTile) && (
            <div
              className={`tactical-panel-subtle rounded-lg p-2.5 sm:p-3 w-full sm:w-56 text-xs space-y-1 ${
                targetPreview ? '' : 'hidden sm:block'
              }`}
            >
              {targetPreview ? (
                <>
                  <div className="font-semibold text-[#f6eedb] flex justify-between">
                    <span>{targetPreview.target.name}</span>
                    <span className="font-mono-num text-[#e2b95b]">
                      {targetPreview.preview.hitChance}% Hit
                    </span>
                  </div>
                  <div className="font-mono-num text-sm font-bold text-amber-300">
                    {targetPreview.preview.isHeal
                      ? `Restore +${targetPreview.preview.estimatedDamage} HP`
                      : targetPreview.preview.estimatedDamage > 0
                        ? `Est. ${targetPreview.preview.estimatedDamage} DMG`
                        : 'Apply Status'}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Angle: {targetPreview.preview.angle.toUpperCase()} ({targetPreview.preview.facingBonus}×) · Elev{' '}
                    {targetPreview.preview.heightDiff >= 0 ? `+${targetPreview.preview.heightDiff}` : targetPreview.preview.heightDiff}
                  </div>
                </>
              ) : (
                hoveredTile &&
                hoveredTerrain && (
                  <>
                    <div className="font-semibold text-[#f6eedb] flex justify-between">
                      <span>{hoveredTerrain.name}</span>
                      <span className="font-mono-num text-slate-300">
                        ({hoveredTile.x},{hoveredTile.z}) H:{hoveredTile.y}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Move {hoveredTerrain.movementCost} · DEF +{hoveredTerrain.defenseBonus} · EVA{' '}
                      {hoveredTerrain.evasionBonus >= 0 ? `+${hoveredTerrain.evasionBonus}` : hoveredTerrain.evasionBonus}%
                    </div>
                    {game.hoveredUnit && (
                      <div className="text-[11px] text-sky-300 font-medium pt-0.5">
                        Unit: {game.hoveredUnit.name} ({game.hoveredUnit.stats.hp}/{game.hoveredUnit.stats.maxHp} HP)
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </div>

        {/* Center/Right: Contextual Action Dock */}
        <div className="pointer-events-auto">
          {!isPlayerTurn && (
            <div className="tactical-panel rounded-lg px-5 py-3 text-xs font-semibold text-amber-300">
              {game.phase === 'moving'
                ? 'Unit advancing...'
                : game.phase === 'resolving'
                  ? 'Resolving action...'
                  : `${activeUnit?.name ?? 'Enemy'} taking turn...`}
            </div>
          )}

          {isPlayerTurn && game.phase === 'action_hub' && (
            <div className="tactical-panel rounded-lg p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2">
              {!game.hasMovedThisTurn ? (
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    game.enterMoveSelect();
                    onUpdate();
                  }}
                  className="flex-1 sm:flex-initial px-2.5 sm:px-4 py-2 sm:py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  Move
                </button>
              ) : (
                !game.hasActedThisTurn && (
                  <button
                    type="button"
                    onClick={() => {
                      game.undoMove();
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Undo2 size={14} /> Undo
                  </button>
                )
              )}

              {!game.hasActedThisTurn && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      game.selectAbility(primaryAttackId);
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial px-2.5 sm:px-4 py-2 sm:py-2.5 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] text-xs font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Attack
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      game.enterActionSelect();
                      onUpdate();
                    }}
                    className="flex-1 sm:flex-initial px-2.5 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-[#f6eedb] text-xs font-semibold rounded-md border border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Abilities
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  game.enterFacingSelect();
                  onUpdate();
                }}
                className="flex-1 sm:flex-initial px-2.5 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <span className="sm:hidden">Wait</span>
                <span className="hidden sm:inline">Wait / Face</span>
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'move_select' && (
            <div className="tactical-panel rounded-lg p-2.5 flex items-center gap-3">
              <span className="text-xs text-sky-300 font-medium">Select a highlighted blue tile</span>
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  game.cancelSubMenu();
                  onUpdate();
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'action_select' && activeUnit && (
            <div className="tactical-panel rounded-lg p-3 space-y-2 max-w-md">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-[#e2b95b]">Select Ability</span>
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    game.cancelSubMenu();
                    onUpdate();
                  }}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {activeUnit.equippedAbilities.map(abId => {
                  const ab = ABILITIES[abId];
                  if (!ab) return null;
                  const enoughMp = activeUnit.stats.mp >= ab.mpCost;
                  return (
                    <button
                      key={abId}
                      type="button"
                      disabled={!enoughMp}
                      onClick={() => {
                        soundManager.playClick();
                        game.selectAbility(abId);
                        onUpdate();
                      }}
                      className="p-2.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-45 border border-slate-700 text-left cursor-pointer"
                    >
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-xs font-bold text-[#f6eedb] truncate">{ab.name}</span>
                        <span className="font-mono-num text-[11px] text-sky-400 shrink-0">{ab.mpCost} MP</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Rng {ab.range} · AoE {ab.aoeRadius} · CT {ab.ctCost}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPlayerTurn && game.phase === 'target_select' && (
            <div className="tactical-panel rounded-lg p-2.5 flex items-center gap-3">
              <span className="text-xs text-amber-300 font-medium">
                {ABILITIES[game.selectedAbilityId || '']?.name} · Select target tile
              </span>
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  game.cancelSubMenu();
                  onUpdate();
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {isPlayerTurn && game.phase === 'facing_select' && (
            <div className="tactical-panel rounded-lg p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#e2b95b] mr-1">Choose Facing:</span>
              {(['north', 'south', 'east', 'west'] as Direction[]).map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    game.confirmFacingAndEndTurn(dir);
                    onUpdate();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-[#c98b2c] hover:text-[#0d1017] text-[#f6eedb] text-xs font-bold uppercase rounded-md border border-slate-700 transition-colors cursor-pointer"
                >
                  {dir}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
