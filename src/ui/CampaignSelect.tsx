import React, { useState } from 'react';
import { game } from '../game/Game';
import { CAMPAIGN_MISSIONS, WORLD_LORE } from '../game/GameConfig';
import { soundManager } from '../utils/SoundManager';
import { ArrowLeft, Play, Users, RotateCcw, Star } from 'lucide-react';
import { ValenCrestSvg } from './brand/ValenIcons';

interface Props {
  onUpdate: () => void;
}

export const CampaignSelect: React.FC<Props> = ({ onUpdate }) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <main className="w-full h-full bg-[#090d16] text-[#f6eedb] flex flex-col overflow-y-auto p-5 sm:p-10">
      <div className="max-w-5xl mx-auto w-full space-y-7">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                game.setScreen('menu');
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 valen-btn-steel valen-bevel text-sm font-semibold cursor-pointer"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <ValenCrestSvg className="w-10 h-10 hidden sm:block shrink-0" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f6eedb] tracking-wide">
                Campaign War Map
              </h1>
              <p className="text-xs text-[#8a99b3]">
                {WORLD_LORE.worldName} · {WORLD_LORE.era}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono-num text-sm font-bold text-[#f3cf7a]">
              Treasury: {game.saveData.gold} G
            </span>
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                game.setScreen('roster');
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 valen-btn-steel valen-bevel text-sm font-semibold cursor-pointer"
            >
              <Users size={16} /> Barracks &amp; Armory
            </button>
          </div>
        </header>

        <div className="valen-divider" />

        {/* Lore summary */}
        <p className="text-sm text-[#cbd5e1] leading-relaxed max-w-3xl">
          {WORLD_LORE.summary}
        </p>

        {/* Missions List */}
        <div className="space-y-4">
          {CAMPAIGN_MISSIONS.map((mission, index) => {
            const completed = game.saveData.completedMissions.includes(mission.id);
            const stars = game.saveData.missionStars?.[mission.id] ?? 0;
            return (
              <section
                key={mission.id}
                className="valen-plaque valen-bevel p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
              >
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#8a99b3]">
                    <span className="font-bold uppercase tracking-[0.14em] text-[#d89b32]">
                      Chapter 0{index + 1}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#cbd5e1]">{mission.region}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">
                      {mission.mapWidth}×{mission.mapHeight} Grid
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">Par {mission.parTurns ?? 12} Turns</span>
                    {completed && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-semibold">Cleared</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-xl font-bold text-[#f6eedb] tracking-wide">
                      {mission.title}
                    </h2>
                    {stars > 0 && (
                      <div className="flex items-center gap-0.5" aria-label={`${stars} of 3 stars`}>
                        {[1, 2, 3].map(n => (
                          <Star
                            key={n}
                            size={14}
                            className={n <= stars ? 'text-[#f3cf7a] fill-[#f3cf7a]' : 'text-slate-600'}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-[#cbd5e1] leading-relaxed">{mission.description}</p>
                  <p className="text-xs text-[#8a99b3]">
                    Objective: <span className="text-[#f6eedb]">{mission.victoryCondition}</span> · Enemies:{' '}
                    <span className="font-mono-num text-[#f6eedb]">{mission.enemies.length}</span>
                  </p>
                </div>

                <div className="flex items-center gap-6 self-end md:self-center shrink-0">
                  <div className="text-right text-xs text-[#8a99b3] font-mono-num space-y-1">
                    <div className="text-[#f3cf7a] font-bold">+{mission.rewardGold} G</div>
                    <div>
                      +{mission.rewardExp} EXP · +{mission.rewardJp} JP
                    </div>
                  </div>

                  <button
                    type="button"
                    data-start={index === 0 ? 'true' : undefined}
                    onClick={e => {
                      e.currentTarget.blur();
                      soundManager.playClick();
                      game.startMission(index);
                      onUpdate();
                    }}
                    className="px-6 py-3 valen-btn-gold valen-bevel font-bold text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Play size={16} /> Deploy Squad
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <div className="valen-divider" />

        {/* Save reset utility */}
        <div className="flex justify-end pb-4">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#8a99b3] hover:text-rose-400 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset Campaign Save
            </button>
          ) : (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#cbd5e1]">Erase progress and restart?</span>
              <button
                type="button"
                onClick={() => {
                  game.resetCampaignProgress();
                  setConfirmReset(false);
                  onUpdate();
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold valen-bevel cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 valen-btn-steel valen-bevel text-[#cbd5e1] cursor-pointer"
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

