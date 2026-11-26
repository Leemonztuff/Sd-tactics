import React, { useEffect, useState } from 'react';
import { game } from '../game/Game';
import { soundManager } from '../utils/SoundManager';
import { Volume2, VolumeX } from 'lucide-react';

interface Props {
  onUpdate: () => void;
}

export const MainMenu: React.FC<Props> = ({ onUpdate }) => {
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [imgFailed, setImgFailed] = useState(false);

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

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0d1017] text-[#ede8dc] flex flex-col justify-between">
      {/* Illustrated Key-Art Backdrop with seamless gradient scrim */}
      {!imgFailed && (
        <img
          src="/src/assets/images/valen_title_bg_1795621015625.jpg"
          alt="Terraced stone fortress of Valen at golden dusk"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover scale-110 pointer-events-none select-none"
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(13,16,23,0.96) 0%, rgba(13,16,23,0.88) 38%, rgba(13,16,23,0.38) 72%, rgba(13,16,23,0.55) 100%)'
        }}
      />

      {/* Top right sound utility */}
      <div className="relative z-10 flex justify-end p-6">
        <button
          type="button"
          tabIndex={-1}
          aria-label={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
          onClick={e => {
            e.currentTarget.blur();
            setSoundEnabled(soundManager.toggleSound());
          }}
          className="w-10 h-10 flex items-center justify-center rounded-lg tactical-panel-subtle text-[#e2b95b] hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-slate-400" />}
        </button>
      </div>

      {/* Left-third Title Lockup & Menu Actions */}
      <div className="relative z-10 max-w-xl px-8 md:px-14 my-auto">
        {/* Bespoke inline SVG Valen Crest Emblem */}
        <svg
          viewBox="0 0 88 88"
          className="w-16 h-16 mb-5 text-[#e2b95b]"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M44 6L74 18V42C74 61 60 76 44 82C28 76 14 61 14 42V18L44 6Z"
            fill="rgba(22,27,39,0.9)"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M44 16L64 24V42C64 56 54 67 44 72C34 67 24 56 24 42V24L44 16Z"
            stroke="rgba(226,185,91,0.4)"
            strokeWidth="1.2"
          />
          <path d="M44 22V64M33 34H55" stroke="#f8fafc" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="44" cy="34" r="4.5" fill="currentColor" />
        </svg>

        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-wide text-[#f6eedb] leading-tight text-balance">
          Valen Tactics
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[#cbd5e1] max-w-md leading-relaxed">
          Chronicles of the Realm · 3D Hex Overworld & Tactical RPG
        </p>

        <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 max-w-lg">
          <button
            type="button"
            data-start="true"
            onClick={handleStartOverworld}
            className="px-7 py-3.5 bg-[#c98b2c] hover:bg-[#dc9d38] text-[#0d1017] font-bold rounded-lg shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Explore Overworld
          </button>

          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              game.setScreen('campaign_select');
              onUpdate();
            }}
            className="px-5 py-3.5 tactical-panel hover:bg-slate-800 text-[#ede8dc] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Campaign Missions
          </button>

          <button
            type="button"
            onClick={() => {
              soundManager.playClick();
              game.setScreen('roster');
              onUpdate();
            }}
            className="px-5 py-3.5 tactical-panel hover:bg-slate-800 text-[#ede8dc] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Barracks & Armory
          </button>
        </div>
      </div>

      {/* Bottom safe margin: single flat borderless control hint */}
      <footer className="relative z-10 px-8 md:px-14 pb-6">
        <p className="text-xs text-slate-400 tracking-wide">
          Click / WASD Select Tile · Enter Confirm · Q / E Rotate Camera · Esc Cancel / Pause
        </p>
      </footer>
    </main>
  );
};
