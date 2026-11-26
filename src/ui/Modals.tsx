import React from 'react';
import { game } from '../game/Game';
import { soundManager } from '../utils/SoundManager';
import { Trophy, ShieldAlert, Pause } from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const PauseModal: React.FC<Props> = ({ onUpdate }) => {
  const isOverworld = game.state === 'overworld';

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-6 z-50">
      <div className="max-w-sm w-full tactical-panel rounded-xl p-7 text-center space-y-6">
        <div className="inline-flex p-3 rounded-lg bg-slate-900 border border-[#c98b2c]/40 text-[#e2b95b]">
          <Pause size={28} />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-[#f6eedb]">
            {isOverworld ? 'Expedition Paused' : 'Battle Paused'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isOverworld ? `Day ${game.overworldManager?.day ?? 1} · Valen Overworld` : game.currentMission?.title}
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              game.togglePause();
              onUpdate();
            }}
            className="w-full py-3 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg transition-colors cursor-pointer"
          >
            {isOverworld ? 'Resume Exploration' : 'Resume Battle'}
          </button>

          {!isOverworld && (
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                if (game.currentMission && game.returnToOverworldAfterBattle) {
                  game.startCustomMission(game.currentMission, true);
                } else {
                  game.startMission(game.currentMissionIndex);
                }
                onUpdate();
              }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-[#ede8dc] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Restart Encounter
            </button>
          )}

          <button
            type="button"
            onClick={() => {
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
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium rounded-lg border border-slate-800 transition-colors cursor-pointer"
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="max-w-md w-full tactical-panel rounded-xl p-8 text-center space-y-6">
        <div className="inline-flex p-4 rounded-xl bg-[#c98b2c]/15 border border-[#c98b2c]/50 text-[#e2b95b]">
          <Trophy size={40} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold text-[#f6eedb]">Victory</h2>
          <p className="text-sm text-slate-300 mt-1">{summary?.missionTitle ?? 'Objective Secured'}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 font-mono-num text-center">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Gold</div>
            <div className="text-base font-bold text-[#e2b95b]">+{summary?.rewardGold ?? 0}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">EXP / JP</div>
            <div className="text-base font-bold text-emerald-400">
              +{summary?.rewardExp ?? 0} / +{summary?.rewardJp ?? 0}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Turns</div>
            <div className="text-base font-bold text-[#f6eedb]">{summary?.turnsElapsed ?? 1}</div>
          </div>
        </div>

        {summary && summary.levelUps.length > 0 && (
          <div className="text-xs text-emerald-300 space-y-1">
            {summary.levelUps.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            data-start="true"
            onClick={() => {
              soundManager.playClick();
              if (fromOverworld) {
                game.startOverworld();
              } else {
                game.setScreen('campaign_select');
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg transition-colors cursor-pointer"
          >
            {fromOverworld ? 'Return to Overworld' : 'Continue Campaign'}
          </button>
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              game.setScreen('roster');
              onUpdate();
            }}
            className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-[#ede8dc] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="max-w-md w-full tactical-panel rounded-xl p-8 text-center space-y-6">
        <div className="inline-flex p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400">
          <ShieldAlert size={40} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold text-rose-400">Defeat</h2>
          <p className="text-sm text-slate-300 mt-1">
            Your vanguard fell at {summary?.missionTitle ?? 'battle'}. Regroup and strike again.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono-num text-center">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Enemies Felled</div>
            <div className="text-base font-bold text-[#f6eedb]">{summary?.enemiesDefeated ?? 0}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Total Damage</div>
            <div className="text-base font-bold text-[#f6eedb]">{summary?.damageDealt ?? 0}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            data-start="true"
            onClick={() => {
              soundManager.playClick();
              if (fromOverworld && game.currentMission) {
                game.startCustomMission(game.currentMission, true);
              } else {
                game.startMission(game.currentMissionIndex);
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg transition-colors cursor-pointer"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              if (fromOverworld) {
                game.startOverworld();
              } else {
                game.setScreen('campaign_select');
              }
              onUpdate();
            }}
            className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-[#ede8dc] font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            {fromOverworld ? 'Overworld' : 'War Map'}
          </button>
        </div>
      </div>
    </div>
  );
};
