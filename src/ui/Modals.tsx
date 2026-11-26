import React from 'react';
import { game } from '../game/Game';
import { QUALITY_PRESETS, QualityTier } from '../rendering/BrawlStyleSystem';
import { soundManager } from '../utils/SoundManager';
import { Trophy, ShieldAlert, Pause, Star, CheckCircle2, Circle } from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const PauseModal: React.FC<Props> = ({ onUpdate }) => {
  const isOverworld = game.state === 'overworld';

  return (
    <div className="fixed inset-0 bg-[#090d16]/80 flex items-center justify-center p-6 z-50">
      <div className="max-w-sm w-full valen-plaque valen-bevel p-7 text-center space-y-5">
        <div className="inline-flex p-3 valen-plaque-quiet valen-bevel text-[#f3cf7a]">
          <Pause size={26} />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-[#f6eedb] tracking-wide">
            {isOverworld ? 'Expedition Paused' : 'Battle Paused'}
          </h2>
          <p className="text-xs text-[#8a99b3] mt-1 font-mono-num">
            {isOverworld ? `Day ${game.overworldManager?.day ?? 1} · Valen Overworld` : game.currentMission?.title}
          </p>
        </div>

        <div className="valen-divider" />

        <div className="space-y-2 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a99b3]">
            Graphics Quality
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['eco', 'balanced', 'high'] as QualityTier[]).map(tier => {
              const active = game.qualityTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={e => {
                    e.currentTarget.blur();
                    soundManager.playClick();
                    game.setQualityTier(tier);
                    onUpdate();
                  }}
                  className={`min-h-[40px] px-2 py-1.5 valen-bevel text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active ? 'bg-sky-600 text-white' : 'valen-btn-steel text-[#cbd5e1]'
                  }`}
                >
                  {QUALITY_PRESETS[tier].shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              game.togglePause();
              onUpdate();
            }}
            className="w-full py-3 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
          >
            {isOverworld ? 'Resume Exploration' : 'Resume Battle'}
          </button>

          {!isOverworld && (
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                if (game.currentMission && game.returnToOverworldAfterBattle) {
                  game.startCustomMission(game.currentMission, true);
                } else {
                  game.startMission(game.currentMissionIndex);
                }
                onUpdate();
              }}
              className="w-full py-3 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
            >
              Restart Encounter
            </button>
          )}

          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              if (isOverworld) {
                game.setScreen('menu');
              } else if (game.returnToOverworldAfterBattle) {
                game.startOverworld();
              } else {
                game.setScreen('campaign_select');
              }
              onUpdate();
            }}
            className="w-full py-3 valen-btn-steel valen-bevel text-[#8a99b3] hover:text-[#f6eedb] font-medium text-sm cursor-pointer"
          >
            {isOverworld
              ? 'Return to Title'
              : game.returnToOverworldAfterBattle
                ? 'Retreat to Overworld'
                : 'Retreat to War Map'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const VictoryModal: React.FC<Props> = ({ onUpdate }) => {
  const summary = game.lastSummary;
  const fromOverworld = game.returnToOverworldAfterBattle;

  return (
    <div className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-6 z-50">
      <div className="max-w-md w-full valen-plaque valen-bevel p-7 sm:p-8 text-center space-y-5">
        <div className="inline-flex p-4 valen-plaque-quiet valen-bevel text-[#f3cf7a]">
          <Trophy size={38} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold text-[#f6eedb] tracking-wide">
            {summary?.campaignComplete ? 'Realm Restored' : 'Victory'}
          </h2>
          <p className="text-sm text-[#cbd5e1] mt-1">{summary?.missionTitle ?? 'Objective Secured'}</p>
          <div className="flex items-center justify-center gap-1.5 mt-3" aria-label={`${summary?.starsEarned ?? 1} of 3 stars`}>
            {[1, 2, 3].map(n => (
              <Star
                key={n}
                size={22}
                className={n <= (summary?.starsEarned ?? 1) ? 'text-[#f3cf7a] fill-[#f3cf7a]' : 'text-slate-600'}
              />
            ))}
          </div>
        </div>

        <div className="valen-divider" />

        <div className="text-left text-xs space-y-1.5 px-1">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={14} /> <span>Objective Secured</span>
          </div>
          <div className={`flex items-center gap-2 ${summary?.starCriteria.noFallen ? 'text-emerald-300' : 'text-[#8a99b3]'}`}>
            {summary?.starCriteria.noFallen ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            <span>No Fallen Allies</span>
          </div>
          <div className={`flex items-center gap-2 ${summary?.starCriteria.withinPar ? 'text-emerald-300' : 'text-[#8a99b3]'}`}>
            {summary?.starCriteria.withinPar ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            <span>Swift Tactics (≤ {summary?.parTurns ?? 12} Turns)</span>
          </div>
        </div>

        <div className="valen-divider" />

        <div className="grid grid-cols-3 divide-x divide-white/10 font-mono-num text-center">
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">Gold</div>
            <div className="text-base font-bold text-[#f3cf7a] mt-0.5">+{summary?.rewardGold ?? 0}</div>
            {summary && summary.bonusGold > 0 && (
              <div className="text-[10px] text-emerald-400">+{summary.bonusGold} Mastery</div>
            )}
          </div>
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">EXP / JP</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              +{summary?.rewardExp ?? 0} / +{summary?.rewardJp ?? 0}
            </div>
          </div>
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">Turns</div>
            <div className="text-base font-bold text-[#f6eedb] mt-0.5">
              {summary?.turnsElapsed ?? 1}/{summary?.parTurns ?? 12}
            </div>
          </div>
        </div>

        {summary && summary.levelUps.length > 0 && (
          <div className="text-xs text-emerald-300 space-y-1 font-mono-num">
            {summary.levelUps.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              if (fromOverworld) {
                game.startOverworld();
              } else {
                game.setScreen('campaign_select');
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
          >
            {fromOverworld ? 'Return to Overworld' : 'Continue Campaign'}
          </button>
          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              game.setScreen('roster');
              onUpdate();
            }}
            className="flex-1 py-3.5 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
          >
            Barracks
          </button>
        </div>
      </div>
    </div>
  );
};

export const DefeatModal: React.FC<Props> = ({ onUpdate }) => {
  const summary = game.lastSummary;
  const fromOverworld = game.returnToOverworldAfterBattle;

  return (
    <div className="fixed inset-0 bg-[#090d16]/85 flex items-center justify-center p-6 z-50">
      <div className="max-w-md w-full valen-plaque valen-bevel p-7 sm:p-8 text-center space-y-5">
        <div className="inline-flex p-4 valen-plaque-quiet valen-bevel text-rose-400">
          <ShieldAlert size={38} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold text-rose-400 tracking-wide">Defeat</h2>
          <p className="text-sm text-[#cbd5e1] mt-1">
            Your vanguard fell at {summary?.missionTitle ?? 'battle'}. Regroup and strike again.
          </p>
        </div>

        <div className="valen-divider" />

        <div className="grid grid-cols-2 divide-x divide-white/10 font-mono-num text-center">
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">Enemies Felled</div>
            <div className="text-base font-bold text-[#f6eedb] mt-0.5">{summary?.enemiesDefeated ?? 0}</div>
          </div>
          <div className="px-2">
            <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">Total Damage</div>
            <div className="text-base font-bold text-[#f6eedb] mt-0.5">{summary?.damageDealt ?? 0}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              if (fromOverworld && game.currentMission) {
                game.startCustomMission(game.currentMission, true);
              } else {
                game.startMission(game.currentMissionIndex);
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 valen-btn-gold valen-bevel font-bold text-sm cursor-pointer"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              if (fromOverworld) {
                game.startOverworld();
              } else {
                game.setScreen('campaign_select');
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 valen-btn-steel valen-bevel font-semibold text-sm cursor-pointer"
          >
            {fromOverworld ? 'Overworld' : 'War Map'}
          </button>
        </div>
      </div>
    </div>
  );
};

