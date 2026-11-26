import React, { useState } from 'react';
import { game } from '../game/Game';
import { CAMPAIGN_MISSIONS, WORLD_LORE } from '../game/GameConfig';
import { soundManager } from '../utils/SoundManager';
import { ArrowLeft, Play, Users, RotateCcw } from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const CampaignSelect: React.FC<Props> = ({ onUpdate }) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <main className="w-full h-full bg-[#0d1017] text-[#ede8dc] flex flex-col overflow-y-auto p-6 md:p-10">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                game.setScreen('menu');
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 tactical-panel-subtle hover:bg-slate-800 rounded-lg text-sm text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#f6eedb]">Campaign War Map</h1>
              <p className="text-xs text-slate-400">
                {WORLD_LORE.worldName} · {WORLD_LORE.era}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono-num text-sm font-semibold text-[#e2b95b]">
              Treasury: {game.saveData.gold} G
            </span>
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                game.setScreen('roster');
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 tactical-panel hover:bg-slate-800 rounded-lg text-sm font-semibold text-[#ede8dc] transition-colors cursor-pointer"
            >
              <Users size={16} /> Barracks & Armory
            </button>
          </div>
        </div>

        {/* Lore summary */}
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          {WORLD_LORE.summary}
        </p>

        {/* Missions List */}
        <div className="space-y-4">
          {CAMPAIGN_MISSIONS.map((mission, index) => {
            const completed = game.saveData.completedMissions.includes(mission.id);
            return (
              <section
                key={mission.id}
                className="tactical-panel rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
              >
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-[#e2b95b]">Chapter 0{index + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span>{mission.region}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">
                      {mission.mapWidth}×{mission.mapHeight} Grid
                    </span>
                    {completed && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-semibold">Cleared</span>
                      </>
                    )}
                  </div>

                  <h2 className="font-display text-xl font-bold text-[#f6eedb]">{mission.title}</h2>
                  <p className="text-sm text-slate-300 leading-relaxed">{mission.description}</p>
                  <p className="text-xs text-slate-400">
                    Objective: <span className="text-slate-200">{mission.victoryCondition}</span> · Enemies:{' '}
                    <span className="font-mono-num text-slate-200">{mission.enemies.length}</span>
                  </p>
                </div>

                <div className="flex items-center gap-6 self-end md:self-center shrink-0">
                  <div className="text-right text-xs text-slate-400 font-mono-num space-y-1">
                    <div className="text-[#e2b95b]">+{mission.rewardGold} G</div>
                    <div>
                      +{mission.rewardExp} EXP · +{mission.rewardJp} JP
                    </div>
                  </div>

                  <button
                    type="button"
                    data-start={index === 0 ? 'true' : undefined}
                    onClick={() => {
                      soundManager.playClick();
                      game.startMission(index);
                      onUpdate();
                    }}
                    className="px-6 py-3 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Play size={16} /> Deploy Squad
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        {/* Save reset utility */}
        <div className="pt-4 border-t border-slate-800/80 flex justify-end">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset Campaign Save
            </button>
          ) : (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-300">Erase progress and restart?</span>
              <button
                type="button"
                onClick={() => {
                  game.resetCampaignProgress();
                  setConfirmReset(false);
                  onUpdate();
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 tactical-panel-subtle text-slate-300 rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
