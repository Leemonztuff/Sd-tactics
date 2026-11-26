import React, { useEffect, useState } from 'react';
import { game } from '../game/Game';
import { soundManager } from '../utils/SoundManager';
import { Volume2, VolumeX } from 'lucide-react';
import { VALEN_BRAND } from './brand/BrandKit';
import { ValenCrestSvg } from './brand/ValenIcons';
import { ModelViewerModal } from './ModelViewerModal';

interface Props {
  onUpdate: () => void;
}

export const MainMenu: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [imgFailed, setImgFailed] = useState(false);
  const [showModelTester, setShowModelTester] = useState(false);

  const handleStartOverworld = () => {
    soundManager.playClick();
    game.startOverworld();
    onUpdate();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStartOverworld();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearedCount = game.saveData.completedMissions.length;
  const squadCount = game.getActiveSquadIds().length;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#090d16] text-[#f6eedb] flex flex-col justify-between">
      {/* Illustrated Key-Art Backdrop with directional dusk scrim */}
      {!imgFailed && (
        <img
          src="/src/assets/images/valen_title_bg_1795621015625.jpg"
          alt="Terraced stone fortress of Valen at golden dusk"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover scale-105 pointer-events-none select-none"
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(9,13,22,0.97) 0%, rgba(9,13,22,0.86) 36%, rgba(9,13,22,0.34) 70%, rgba(9,13,22,0.52) 100%), linear-gradient(180deg, rgba(9,13,22,0.45) 0%, transparent 25%, rgba(9,13,22,0.72) 100%)'
        }}
      />

      {/* Top right sound utility */}
      <div className="relative z-10 flex justify-end p-5 sm:p-6">
        <button
          type="button"
          tabIndex={-1}
          aria-label={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
          onClick={e => {
            e.currentTarget.blur();
            setSoundEnabled(soundManager.toggleSound());
          }}
          className="w-10 h-10 flex items-center justify-center valen-plaque-quiet valen-bevel text-[#f3cf7a] hover:border-[#d89b32]/60 transition-colors cursor-pointer"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-slate-400" />}
        </button>
      </div>

      {/* Left-third Title Lockup & Menu Actions */}
      <div className="relative z-10 max-w-xl px-7 sm:px-14 my-auto">
        <ValenCrestSvg className="w-16 h-16 mb-5 drop-shadow-[0_6px_16px_rgba(0,0,0,0.85)]" />

        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#d89b32]">
          {VALEN_BRAND.edition} · {VALEN_BRAND.subtitle}
        </p>

        <h1
          className="font-display text-4xl sm:text-6xl font-extrabold tracking-wide text-[#f6eedb] leading-[1.06] mt-1.5 text-balance"
          style={{ textShadow: '0 4px 24px rgba(0, 0, 0, 0.85)' }}
        >
          {VALEN_BRAND.title}
        </h1>

        <p className="mt-3 text-sm sm:text-base text-[#cbd5e1] max-w-md leading-relaxed">
          3D Hex Realm Expedition &amp; Tactical Turn-Based RPG
        </p>

        <div className="valen-divider w-48 my-5" />

        <p className="font-mono-num text-xs text-[#8a99b3] tracking-wide mb-6">
          Active Squad {squadCount}/4 · Treasury {game.saveData.gold} G · Chapters {clearedCount}/4
        </p>

        <div className="flex flex-col sm:flex-row sm:flex-nowrap items-stretch sm:items-center gap-3 max-w-2xl">
          <button
            type="button"
            data-start="true"
            onClick={e => {
              e.currentTarget.blur();
              handleStartOverworld();
            }}
            className="px-7 py-3.5 valen-btn-gold valen-bevel font-bold text-sm tracking-wide whitespace-nowrap shrink-0 cursor-pointer"
          >
            Explore Overworld
          </button>

          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              game.setScreen('campaign_select');
              onUpdate();
            }}
            className="px-5 py-3.5 valen-btn-steel valen-bevel font-semibold text-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            Campaign Missions
          </button>

          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              game.setScreen('roster');
              onUpdate();
            }}
            className="px-5 py-3.5 valen-btn-steel valen-bevel font-semibold text-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            Barracks &amp; Armory
          </button>

          <button
            type="button"
            onClick={e => {
              e.currentTarget.blur();
              soundManager.playClick();
              setShowModelTester(true);
            }}
            className="px-5 py-3.5 valen-btn-steel valen-bevel font-semibold text-sm whitespace-nowrap shrink-0 cursor-pointer border border-[#d89b32]/60 text-[#f3cf7a] hover:bg-[#d89b32]/15"
          >
            🎮 Probar Modelo 3D
          </button>
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

      {/* Bottom safe margin: single flat borderless control hint */}
      <footer className="relative z-10 px-7 sm:px-14 pb-6">
        <p className="text-xs text-[#8a99b3] tracking-wide font-mono-num">
          WASD / Click Select · [1–5] Actions · Enter Confirm · Q/E Rotate · Esc Cancel / Pause
        </p>
      </footer>
    </main>
  );
};

