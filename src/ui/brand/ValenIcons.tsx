import React from 'react';
import { JobId } from '../../types/game';
import { SkillVfxElement } from '../../rendering/BattleVfxSystem';

export const ValenCrestSvg: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 96 96" className={className} fill="none" aria-hidden="true">
    {/* Outer shadow shield */}
    <path
      d="M48 6L82 20V46C82 67 66 83 48 90C30 83 14 67 14 46V20L48 6Z"
      fill="#0b101b"
      stroke="#d89b32"
      strokeWidth="2.5"
    />
    {/* Inner double bezel */}
    <path
      d="M48 14L74 25V46C74 62 61 75 48 81C35 75 22 62 22 46V25L48 14Z"
      fill="rgba(22,30,48,0.85)"
      stroke="rgba(243,207,122,0.4)"
      strokeWidth="1.2"
    />
    {/* Solar Concord Sunburst Rays */}
    <path
      d="M48 22L52 36L66 36L55 44L59 58L48 49L37 58L41 44L30 36L44 36L48 22Z"
      fill="rgba(216,155,50,0.22)"
      stroke="#f3cf7a"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    {/* Vertical Dawn Blade */}
    <path d="M48 18V72" stroke="#f6eedb" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M36 39H60" stroke="#f6eedb" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="48" cy="39" r="4.2" fill="#f3cf7a" stroke="#090d16" strokeWidth="1.4" />
  </svg>
);

export const ElementGlyph: React.FC<{ element: SkillVfxElement | 'pincer' | 'high'; className?: string }> = ({
  element,
  className = 'w-3.5 h-3.5'
}) => {
  switch (element) {
    case 'fire':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 2C12 2 18 7.5 18 13.5C18 17.6 15.3 21 12 21C8.7 21 6 17.6 6 13.5C6 10.6 7.4 8.3 9 6.8C9 6.8 9.2 9.4 10.8 10.2C10.8 7 12 2 12 2Z"
            fill="#fb923c"
            stroke="#090d16"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M12 12.5C13.5 14 14 16 12 18.2C10 16 10.5 14 12 12.5Z" fill="#fef08a" />
        </svg>
      );
    case 'lightning':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M13.5 2L5 13.5H11.5L10.5 22L19 10.5H12.5L13.5 2Z"
            fill="#38bdf8"
            stroke="#090d16"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'solar':
    case 'heal':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="5"
            fill={element === 'heal' ? '#34d399' : '#facc15'}
            stroke="#090d16"
            strokeWidth="1.6"
          />
          <path
            d="M12 2V5M12 19V22M2 12H5M19 12H22M4.9 4.9L7 7M17 17L19.1 19.1M19.1 4.9L17 7M7 17L4.9 19.1"
            stroke={element === 'heal' ? '#6ee7b7' : '#fde047'}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'astral':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z"
            fill="#c084fc"
            stroke="#090d16"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'acid':
    case 'venom':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 3C12 3 17.5 10.2 17.5 14.5C17.5 17.8 15 20.5 12 20.5C9 20.5 6.5 17.8 6.5 14.5C6.5 10.2 12 3 12 3Z"
            fill={element === 'acid' ? '#34d399' : '#a3e635'}
            stroke="#090d16"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'pincer':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M4 18L11 11M20 18L13 11M7 7L12 3L17 7"
            stroke="#facc15"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'high':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M4 18L12 6L20 18H4Z"
            fill="#34d399"
            stroke="#090d16"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M19 4L9 14L6 11L4 13L7 16L4 19L5 20L8 17L11 20L13 18L10 15L20 5L19 4Z"
            fill="#e2e8f0"
            stroke="#090d16"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};

export const ActionGlyph: React.FC<{
  kind: 'move' | 'attack' | 'abilities' | 'bag' | 'wait' | 'undo';
  className?: string;
}> = ({ kind, className = 'w-4 h-4' }) => {
  switch (kind) {
    case 'move':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 3L16 7H13V11H17V8L21 12L17 16V13H13V17H16L12 21L8 17H11V13H7V16L3 12L7 8V11H11V7H8L12 3Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'attack':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M19.5 3.5L10.5 12.5L8 10L6.5 11.5L9 14L5 18L6 19L10 15L12.5 17.5L14 16L11.5 13.5L20.5 4.5L19.5 3.5Z"
            fill="currentColor"
            stroke="rgba(9,13,22,0.75)"
            strokeWidth="1"
          />
        </svg>
      );
    case 'abilities':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'bag':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M8 7V6C8 4.3 9.8 3 12 3C14.2 3 16 4.3 16 6V7H19V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V7H8ZM10 7H14V6C14 5.4 13.1 5 12 5C10.9 5 10 5.4 10 6V7Z"
            fill="currentColor"
          />
          <path d="M9 12H15" stroke="#090d16" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'wait':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7.5V12L15.5 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'undo':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M9 7L4 12L9 17V13.5H14.5C16.7 13.5 18.5 15.1 18.5 17.2V18.5H20.5V17C20.5 13.8 17.8 11.5 14.5 11.5H9V7Z"
            fill="currentColor"
          />
        </svg>
      );
  }
};

export const JobCrestGlyph: React.FC<{ jobId: JobId; className?: string }> = ({
  jobId,
  className = 'w-5 h-5'
}) => {
  switch (jobId) {
    case 'guard':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M12 3L19 6V12C19 16.5 16 20 12 21.5C8 20 5 16.5 5 12V6L12 3Z"
            fill="#1e3a8a"
            stroke="#93c5fd"
            strokeWidth="1.7"
          />
          <path d="M12 7V17M8.5 11H15.5" stroke="#f6eedb" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'duelist':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M5 19L19 5M15 5H19V9" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 15L9 19" stroke="#f3cf7a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'arcanist':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7" stroke="#c084fc" strokeWidth="1.8" />
          <path d="M12 3V21M3 12H21" stroke="#e9d5ff" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2.5" fill="#c084fc" />
        </svg>
      );
    case 'devoto':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="#facc15" stroke="#090d16" strokeWidth="1.5" />
          <path d="M12 3V6M12 18V21M3 12H6M18 12H21" stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'explorador':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M12 3L19 18L12 15L5 18L12 3Z" fill="#10b981" stroke="#a7f3d0" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'tirador':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7" stroke="#fb923c" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.5" fill="#fb923c" />
          <path d="M12 2V6M12 18V22M2 12H6M18 12H22" stroke="#fed7aa" strokeWidth="1.5" />
        </svg>
      );
    case 'alquimista':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M9 4H15M10 4V9L5.5 17.5C5 18.5 5.7 20 7 20H17C18.3 20 19 18.5 18.5 17.5L14 9V4" stroke="#a3e635" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M7.5 15H16.5" stroke="#bef264" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'invocador':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#e879f9" stroke="#fae8ff" strokeWidth="1.3" />
        </svg>
      );
  }
};
