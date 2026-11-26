import React, { useState } from 'react';
import { game } from '../game/Game';
import { JOBS, ITEMS, ABILITIES } from '../game/GameConfig';
import { EntityManager } from '../entities/EntityManager';
import { soundManager } from '../utils/SoundManager';
import { JobId } from '../types/game';
import { ArrowLeft, Check, Lock, ShoppingBag } from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const RosterView: React.FC<Props> = ({ onUpdate }) => {
  const [selectedHeroId, setSelectedHeroId] = useState<string>(game.saveData.roster[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'jobs' | 'gear' | 'shop'>('jobs');

  const selectedHero = game.saveData.roster.find(h => h.id === selectedHeroId) || game.saveData.roster[0];
  const em = new EntityManager();

  return (
    <main className="w-full h-full bg-[#0d1017] text-[#ede8dc] flex flex-col overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                game.setScreen('campaign_select');
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 tactical-panel-subtle hover:bg-slate-800 rounded-lg text-sm text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> War Map
            </button>
            <h1 className="font-display text-2xl font-bold text-[#f6eedb]">Barracks & Armory</h1>
          </div>

          <div className="flex items-center gap-4 text-sm font-mono-num">
            <span className="text-[#e2b95b] font-semibold">Gold: {game.saveData.gold} G</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Hero Roster */}
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Squad Roster</h2>
            {game.saveData.roster.map(hero => {
              const job = JOBS[hero.jobId];
              const isSelected = hero.id === selectedHero?.id;
              return (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setSelectedHeroId(hero.id);
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'tactical-panel border-[#c98b2c] text-white'
                      : 'tactical-panel-subtle hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-baseline">
                    <span className="font-display font-bold text-lg text-[#f6eedb]">{hero.name}</span>
                    <span className="font-mono-num text-xs text-[#e2b95b]">
                      Lv.{hero.level} · {hero.jp} JP
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {job.name} · HP {hero.stats.maxHp} · MP {hero.stats.maxMp}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Column: Hero Details + Tabs */}
          {selectedHero && (
            <div className="lg:col-span-8 tactical-panel rounded-xl p-6 space-y-6">
              {/* Hero Summary & Stats */}
              <div className="flex flex-wrap justify-between items-start gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#f6eedb]">{selectedHero.name}</h2>
                  <p className="text-sm text-[#e2b95b]">
                    {JOBS[selectedHero.jobId].name} · {JOBS[selectedHero.jobId].role}
                  </p>
                </div>
                <div className="text-right font-mono-num text-xs text-slate-400 space-y-1">
                  <div>EXP: {selectedHero.exp} / {selectedHero.level * 100}</div>
                  <div className="text-[#e2b95b] font-semibold">Available JP: {selectedHero.jp}</div>
                </div>
              </div>

              {/* Compact 8-Stat Strip */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center font-mono-num">
                {[
                  ['HP', selectedHero.stats.maxHp],
                  ['MP', selectedHero.stats.maxMp],
                  ['ATK', selectedHero.stats.atk],
                  ['MATK', selectedHero.stats.matk],
                  ['DEF', selectedHero.stats.def],
                  ['SPD', selectedHero.stats.spd],
                  ['MOV', selectedHero.stats.mov],
                  ['JMP', selectedHero.stats.jmp]
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-900/90 border border-slate-800 rounded-lg py-2 px-1">
                    <div className="text-[11px] text-slate-400">{label}</div>
                    <div className="text-sm font-bold text-[#f6eedb]">{val}</div>
                  </div>
                ))}
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('jobs')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'jobs' ? 'bg-[#c98b2c] text-[#0d1017]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Jobs & Skills
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('gear')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'gear' ? 'bg-[#c98b2c] text-[#0d1017]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Equipment
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('shop')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'shop' ? 'bg-[#c98b2c] text-[#0d1017]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <ShoppingBag size={14} /> Armory Shop
                </button>
              </div>

              {/* TAB 1: JOBS & SKILLS */}
              {activeTab === 'jobs' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Available Jobs
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(Object.keys(JOBS) as JobId[]).map(jobId => {
                        const job = JOBS[jobId];
                        const unlocked = em.canUnlockJob(selectedHero, jobId);
                        const isCurrent = selectedHero.jobId === jobId;
                        const reqText = job.requirements
                          .map(r => `${JOBS[r.jobId].name} Lv.${r.level}`)
                          .join(', ');

                        return (
                          <button
                            key={jobId}
                            type="button"
                            disabled={!unlocked || isCurrent}
                            onClick={() => {
                              soundManager.playClick();
                              game.changeHeroJob(selectedHero.id, jobId);
                              onUpdate();
                            }}
                            className={`p-3 rounded-lg border text-left transition-colors ${
                              isCurrent
                                ? 'border-[#c98b2c] bg-[#c98b2c]/15 cursor-default'
                                : unlocked
                                  ? 'border-slate-700 bg-slate-900 hover:border-slate-500 cursor-pointer'
                                  : 'border-slate-800 bg-slate-950/60 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm text-[#f6eedb]">{job.name}</span>
                              {isCurrent ? (
                                <span className="text-xs text-[#e2b95b] font-semibold">Active</span>
                              ) : !unlocked ? (
                                <Lock size={13} className="text-slate-500" />
                              ) : (
                                <span className="text-xs text-sky-400">Switch</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              {unlocked ? job.description : `Requires: ${reqText}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Current Job Abilities Unlock & Equip */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      {JOBS[selectedHero.jobId].name} Abilities · Equipped ({selectedHero.equippedAbilities.length}/4)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {JOBS[selectedHero.jobId].allowedAbilities.map(abId => {
                        const ab = ABILITIES[abId];
                        if (!ab) return null;
                        const isLearned = selectedHero.unlockedAbilities.includes(abId);
                        const isEquipped = selectedHero.equippedAbilities.includes(abId);

                        return (
                          <div
                            key={abId}
                            className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div>
                              <div className="text-sm font-semibold text-[#f6eedb]">{ab.name}</div>
                              <div className="text-xs text-slate-400">
                                {ab.description} ({ab.mpCost} MP · Rng {ab.range})
                              </div>
                            </div>
                            {isLearned ? (
                              <button
                                type="button"
                                onClick={() => {
                                  soundManager.playClick();
                                  game.toggleHeroAbility(selectedHero.id, abId);
                                  onUpdate();
                                }}
                                className={`px-3 py-1.5 rounded text-xs font-semibold shrink-0 cursor-pointer ${
                                  isEquipped
                                    ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {isEquipped ? 'Equipped' : 'Equip'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={selectedHero.jp < ab.jpCost}
                                onClick={() => {
                                  soundManager.playClick();
                                  game.unlockHeroAbility(selectedHero.id, abId);
                                  onUpdate();
                                }}
                                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#c98b2c] disabled:bg-slate-800 disabled:text-slate-500 text-[#0d1017] shrink-0 cursor-pointer"
                              >
                                Learn {ab.jpCost} JP
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EQUIPMENT */}
              {activeTab === 'gear' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(['weapon', 'armor', 'accessory'] as const).map(slot => {
                      const equippedId = selectedHero.equipment[slot];
                      const equippedItem = equippedId ? ITEMS[equippedId] : null;
                      const available = game.saveData.inventory.filter(
                        inv => inv.count > 0 && ITEMS[inv.itemId]?.slot === slot
                      );

                      return (
                        <div key={slot} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="text-xs text-slate-400 uppercase tracking-wider">{slot}</div>
                          <div className="font-semibold text-sm text-[#f6eedb]">
                            {equippedItem ? equippedItem.name : 'None Equipped'}
                          </div>
                          {equippedItem && (
                            <button
                              type="button"
                              onClick={() => {
                                soundManager.playClick();
                                game.equipRosterItem(selectedHero.id, null, slot);
                                onUpdate();
                              }}
                              className="text-xs text-rose-400 hover:underline cursor-pointer"
                            >
                              Unequip
                            </button>
                          )}

                          <div className="pt-2 border-t border-slate-800 space-y-1.5">
                            <div className="text-[11px] text-slate-500">Inventory ({available.length})</div>
                            {available.length === 0 ? (
                              <div className="text-xs text-slate-500">No {slot}s in bag</div>
                            ) : (
                              available.map(inv => {
                                const it = ITEMS[inv.itemId];
                                return (
                                  <button
                                    key={inv.itemId}
                                    type="button"
                                    onClick={() => {
                                      soundManager.playClick();
                                      game.equipRosterItem(selectedHero.id, inv.itemId, slot);
                                      onUpdate();
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex justify-between items-center cursor-pointer"
                                  >
                                    <span>{it.name}</span>
                                    <span className="font-mono-num text-[#e2b95b]">×{inv.count}</span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: ARMORY SHOP */}
              {activeTab === 'shop' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.values(ITEMS).map(item => {
                    const owned = game.saveData.inventory.find(i => i.itemId === item.id)?.count ?? 0;
                    const canAfford = game.saveData.gold >= item.price;
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#f6eedb]">
                            {item.name}{' '}
                            {owned > 0 && <span className="text-xs text-emerald-400 font-mono-num">(Owned {owned})</span>}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() => {
                            soundManager.playClick();
                            game.buyShopItem(item.id);
                            onUpdate();
                          }}
                          className="px-3.5 py-2 rounded-lg text-xs font-bold font-mono-num bg-[#c98b2c] hover:bg-[#dc9d38] disabled:bg-slate-800 disabled:text-slate-500 text-[#0d1017] shrink-0 cursor-pointer"
                        >
                          {item.price} G
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
