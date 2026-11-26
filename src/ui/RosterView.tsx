import React, { useState } from 'react';
import { game } from '../game/Game';
import { JOBS, ITEMS, ABILITIES } from '../game/GameConfig';
import { EntityManager } from '../entities/EntityManager';
import { soundManager } from '../utils/SoundManager';
import { JobId } from '../types/game';
import { ArrowLeft, Lock, ShoppingBag, Eye } from 'lucide-react';
import { JOB_ACCENT } from './brand/BrandKit';
import { JobCrestGlyph } from './brand/ValenIcons';
import { ValenMeter } from './brand/ValenMeter';
import { ModelViewerModal } from './ModelViewerModal';

interface Props {
  onUpdate: () => void;
}

export const RosterView: React.FC<Props> = ({ onUpdate }) => {
  const [selectedHeroId, setSelectedHeroId] = useState<string>(game.saveData.roster[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'jobs' | 'gear' | 'shop'>('jobs');
  const [showModelTester, setShowModelTester] = useState(false);

  const selectedHero = game.saveData.roster.find(h => h.id === selectedHeroId) || game.saveData.roster[0];
  const activeSquadIds = game.getActiveSquadIds();
  const consumables = game.getBattleConsumables();
  const em = new EntityManager();

  return (
    <main className="w-full h-full bg-[#090d16] text-[#f6eedb] flex flex-col overflow-y-auto p-5 sm:p-8">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={e => {
                e.currentTarget.blur();
                soundManager.playClick();
                if (game.overworldManager) {
                  game.startOverworld();
                } else {
                  game.setScreen('campaign_select');
                }
                onUpdate();
              }}
              className="flex items-center gap-2 px-4 py-2 valen-btn-steel valen-bevel text-sm font-semibold cursor-pointer"
            >
              <ArrowLeft size={16} /> {game.overworldManager ? 'Overworld' : 'War Map'}
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f6eedb] tracking-wide">
              Barracks &amp; Armory
            </h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 text-sm font-mono-num">
            <button
              type="button"
              onClick={() => {
                soundManager.playClick();
                setShowModelTester(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 valen-btn-steel valen-bevel text-xs font-bold text-[#f3cf7a] border border-[#d89b32]/50 hover:bg-[#d89b32]/15 cursor-pointer"
            >
              <Eye size={14} />
              <span>Probar Modelo 3D</span>
            </button>
            <span className="text-sky-300 font-semibold">
              Squad: {activeSquadIds.length}/4
            </span>
            <span className="text-[#f3cf7a] font-bold">Gold: {game.saveData.gold} G</span>
          </div>
        </header>

        <div className="valen-divider" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Hero Roster */}
          <div className="lg:col-span-4 space-y-2.5">
            <h2 className="text-[11px] font-semibold text-[#8a99b3] uppercase tracking-[0.18em] mb-1">
              Squad Roster ({game.saveData.roster.length} Heroes)
            </h2>
            {game.saveData.roster.map(hero => {
              const job = JOBS[hero.jobId];
              const isSelected = hero.id === selectedHero?.id;
              const isDeployed = activeSquadIds.includes(hero.id);
              return (
                <div
                  key={hero.id}
                  onClick={() => {
                    soundManager.playClick();
                    setSelectedHeroId(hero.id);
                  }}
                  className={`w-full text-left p-3.5 valen-bevel transition-colors cursor-pointer ${
                    isSelected
                      ? 'valen-plaque text-white'
                      : 'valen-plaque-quiet hover:border-[#d89b32]/45 text-[#cbd5e1]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <JobCrestGlyph jobId={hero.jobId} className="w-5 h-5 shrink-0" />
                      <span className="font-display font-bold text-base sm:text-lg text-[#f6eedb] truncate">
                        {hero.name}
                      </span>
                    </div>
                    <span className="font-mono-num text-xs text-[#f3cf7a] shrink-0">
                      Lv.{hero.level} · {hero.jp} JP
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="text-xs text-[#8a99b3] font-mono-num">
                      {job.name} · HP {hero.stats.maxHp} · MP {hero.stats.maxMp}
                    </p>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        soundManager.playClick();
                        game.toggleSquadDeployment(hero.id);
                        onUpdate();
                      }}
                      className={`px-2.5 py-0.5 text-[11px] font-semibold valen-bevel cursor-pointer ${
                        isDeployed
                          ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                          : 'valen-btn-steel text-[#8a99b3]'
                      }`}
                    >
                      {isDeployed ? 'Deployed' : 'Reserve'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Hero Details + Tabs */}
          {selectedHero && (
            <div className="lg:col-span-8 valen-plaque valen-bevel p-5 sm:p-6 space-y-5">
              {/* Hero Summary */}
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 valen-plaque-quiet valen-bevel flex items-center justify-center shrink-0">
                    <JobCrestGlyph jobId={selectedHero.jobId} className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#f6eedb]">
                      {selectedHero.name}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#f3cf7a]">
                      {JOBS[selectedHero.jobId].name} · {JOB_ACCENT[selectedHero.jobId].tag} ·{' '}
                      <span className="text-[#8a99b3]">{JOBS[selectedHero.jobId].role}</span>
                    </p>
                  </div>
                </div>

                <div className="w-44 space-y-1.5 font-mono-num text-xs">
                  <div className="flex justify-between text-[#8a99b3]">
                    <span>EXP</span>
                    <span className="text-[#cbd5e1]">
                      {selectedHero.exp} / {selectedHero.level * 100}
                    </span>
                  </div>
                  <ValenMeter
                    value={selectedHero.exp}
                    max={selectedHero.level * 100}
                    heightClass="h-1.5"
                    fillClass="bg-[#d89b32]"
                    ghostClass="bg-amber-200/50"
                  />
                  <div className="text-right text-[#f3cf7a] font-bold pt-0.5">
                    Available JP: {selectedHero.jp}
                  </div>
                </div>
              </div>

              <div className="valen-divider" />

              {/* Single-Surface 8-Stat Tabular Strip (zero nested mini-boxes) */}
              <div className="grid grid-cols-4 sm:grid-cols-8 divide-x divide-white/10 text-center font-mono-num">
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
                  <div key={String(label)} className="py-1 px-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#8a99b3]">{label}</div>
                    <div className="text-sm sm:text-base font-bold text-[#f6eedb] mt-0.5">{val}</div>
                  </div>
                ))}
              </div>

              {/* Navigation Tabs (Clean underline tabs, no pill capsules) */}
              <div className="flex items-center gap-6 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('jobs')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-[0.14em] border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'jobs'
                      ? 'border-[#f3cf7a] text-[#f3cf7a]'
                      : 'border-transparent text-[#8a99b3] hover:text-[#f6eedb]'
                  }`}
                >
                  Jobs &amp; Skills
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('gear')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-[0.14em] border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'gear'
                      ? 'border-[#f3cf7a] text-[#f3cf7a]'
                      : 'border-transparent text-[#8a99b3] hover:text-[#f6eedb]'
                  }`}
                >
                  Equipment
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('shop')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-[0.14em] border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'shop'
                      ? 'border-[#f3cf7a] text-[#f3cf7a]'
                      : 'border-transparent text-[#8a99b3] hover:text-[#f6eedb]'
                  }`}
                >
                  <ShoppingBag size={13} /> Armory Shop
                </button>
              </div>

              {/* TAB 1: JOBS & SKILLS */}
              {activeTab === 'jobs' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-[#8a99b3] uppercase tracking-[0.18em] mb-3">
                      Available Jobs
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                            onClick={e => {
                              e.currentTarget.blur();
                              soundManager.playClick();
                              game.changeHeroJob(selectedHero.id, jobId);
                              onUpdate();
                            }}
                            className={`p-3 valen-bevel text-left transition-colors ${
                              isCurrent
                                ? 'border border-[#d89b32] bg-[#d89b32]/15 cursor-default'
                                : unlocked
                                  ? 'valen-btn-steel cursor-pointer'
                                  : 'border border-white/10 bg-[#090d16]/70 opacity-55 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="flex items-center gap-2 font-semibold text-sm text-[#f6eedb]">
                                <JobCrestGlyph jobId={jobId} className="w-4 h-4 shrink-0" />
                                {job.name}
                              </span>
                              {isCurrent ? (
                                <span className="text-xs text-[#f3cf7a] font-bold">Active</span>
                              ) : !unlocked ? (
                                <Lock size={13} className="text-[#8a99b3]" />
                              ) : (
                                <span className="text-xs text-sky-400 font-semibold">Switch</span>
                              )}
                            </div>
                            <p className="text-xs text-[#8a99b3] mt-1">
                              {unlocked ? job.description : `Requires: ${reqText}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Current Job Abilities Unlock & Equip */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-[#8a99b3] uppercase tracking-[0.18em] mb-2">
                      {JOBS[selectedHero.jobId].name} Abilities · Equipped ({selectedHero.equippedAbilities.length}/4)
                    </h3>
                    <div className="divide-y divide-white/10">
                      {JOBS[selectedHero.jobId].allowedAbilities.map(abId => {
                        const ab = ABILITIES[abId];
                        if (!ab) return null;
                        const isLearned = selectedHero.unlockedAbilities.includes(abId);
                        const isEquipped = selectedHero.equippedAbilities.includes(abId);

                        return (
                          <div
                            key={abId}
                            className="py-3 flex items-center justify-between gap-3"
                          >
                            <div>
                              <div className="text-sm font-semibold text-[#f6eedb]">{ab.name}</div>
                              <div className="text-xs text-[#8a99b3] font-mono-num mt-0.5">
                                {ab.description.replace(/\.$/, '')} · {ab.mpCost} MP · Rng {ab.range}
                              </div>
                            </div>
                            {isLearned ? (
                              <button
                                type="button"
                                onClick={e => {
                                  e.currentTarget.blur();
                                  soundManager.playClick();
                                  game.toggleHeroAbility(selectedHero.id, abId);
                                  onUpdate();
                                }}
                                className={`px-3.5 py-1.5 valen-bevel text-xs font-semibold shrink-0 cursor-pointer ${
                                  isEquipped
                                    ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/45'
                                    : 'valen-btn-steel text-[#cbd5e1]'
                                }`}
                              >
                                {isEquipped ? 'Equipped' : 'Equip'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={selectedHero.jp < ab.jpCost}
                                onClick={e => {
                                  e.currentTarget.blur();
                                  soundManager.playClick();
                                  game.unlockHeroAbility(selectedHero.id, abId);
                                  onUpdate();
                                }}
                                className="px-3.5 py-1.5 valen-btn-gold valen-bevel disabled:opacity-40 text-xs font-bold font-mono-num shrink-0 cursor-pointer"
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
                    {(['weapon', 'armor', 'accessory'] as const).map(slot => {
                      const equippedId = selectedHero.equipment[slot];
                      const equippedItem = equippedId ? ITEMS[equippedId] : null;
                      const available = game.saveData.inventory.filter(
                        inv => inv.count > 0 && ITEMS[inv.itemId]?.slot === slot
                      );

                      return (
                        <div key={slot} className="py-3 sm:py-0 sm:px-4 first:sm:pl-0 last:sm:pr-0 space-y-3">
                          <div className="text-[11px] text-[#8a99b3] uppercase tracking-[0.16em]">
                            {slot}
                          </div>
                          <div className="font-semibold text-sm text-[#f6eedb]">
                            {equippedItem ? equippedItem.name : 'None Equipped'}
                          </div>
                          {equippedItem && (
                            <button
                              type="button"
                              onClick={e => {
                                e.currentTarget.blur();
                                soundManager.playClick();
                                game.equipRosterItem(selectedHero.id, null, slot);
                                onUpdate();
                              }}
                              className="text-xs text-rose-400 hover:underline cursor-pointer"
                            >
                              Unequip
                            </button>
                          )}

                          <div className="valen-divider" />
                          <div className="space-y-1.5">
                            <div className="text-[11px] text-[#8a99b3] font-mono-num">
                              Inventory ({available.length})
                            </div>
                            {available.length === 0 ? (
                              <div className="text-xs text-[#8a99b3]">No {slot}s in bag</div>
                            ) : (
                              available.map(inv => {
                                const it = ITEMS[inv.itemId];
                                return (
                                  <button
                                    key={inv.itemId}
                                    type="button"
                                    onClick={e => {
                                      e.currentTarget.blur();
                                      soundManager.playClick();
                                      game.equipRosterItem(selectedHero.id, inv.itemId, slot);
                                      onUpdate();
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 valen-btn-steel valen-bevel text-xs flex justify-between items-center cursor-pointer"
                                  >
                                    <span>{it.name}</span>
                                    <span className="font-mono-num text-[#f3cf7a]">×{inv.count}</span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="valen-divider" />

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8a99b3] uppercase tracking-[0.16em] font-semibold">
                        Shared Battle Bag
                      </span>
                      <span className="text-[#8a99b3]">Usable by any deployed hero in combat</span>
                    </div>
                    {consumables.length === 0 ? (
                      <div className="text-xs text-[#8a99b3]">
                        No consumables in Battle Bag. Visit Armory Shop to restock.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                        {consumables.map(entry => (
                          <div key={entry.itemId}>
                            <span className="font-semibold text-[#f6eedb]">{ITEMS[entry.itemId]?.name}</span>{' '}
                            <span className="font-mono-num text-emerald-300 font-bold">×{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: ARMORY SHOP */}
              {activeTab === 'shop' && (
                <div className="divide-y divide-white/10">
                  {Object.values(ITEMS).map(item => {
                    const owned = game.saveData.inventory.find(i => i.itemId === item.id)?.count ?? 0;
                    const canAfford = game.saveData.gold >= item.price;
                    return (
                      <div
                        key={item.id}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#f6eedb]">
                            {item.name}{' '}
                            {owned > 0 && (
                              <span className="text-xs text-emerald-400 font-mono-num">(Owned {owned})</span>
                            )}
                          </div>
                          <div className="text-xs text-[#8a99b3] mt-0.5">{item.description}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={e => {
                            e.currentTarget.blur();
                            soundManager.playClick();
                            game.buyShopItem(item.id);
                            onUpdate();
                          }}
                          className="px-4 py-2 valen-btn-gold valen-bevel disabled:opacity-40 text-xs font-bold font-mono-num shrink-0 cursor-pointer"
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

      <ModelViewerModal
        isOpen={showModelTester}
        onClose={() => setShowModelTester(false)}
        onEnterBattle={() => {
          setShowModelTester(false);
          game.startMission(0);
          onUpdate();
        }}
      />
    </main>
  );
};

