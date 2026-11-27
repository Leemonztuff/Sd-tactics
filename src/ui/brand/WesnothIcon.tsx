import React from 'react';
import { WESNOTH_ASSET_URLS } from '../../overworld/WesnothAssetLoader';

interface WesnothIconProps {
  assetKey: string;
  alt: string;
  size?: number;
  framed?: boolean;
  frameTone?: 'steel' | 'gold' | 'emerald' | 'crimson' | 'astral';
  className?: string;
}

const FRAME_TONE_CLASS: Record<NonNullable<WesnothIconProps['frameTone']>, string> = {
  steel: 'border-slate-500/45 bg-[#0d1424]/90',
  gold: 'border-[#d89b32]/65 bg-[#1b150d]/90',
  emerald: 'border-emerald-500/55 bg-[#0b1b18]/90',
  crimson: 'border-rose-500/55 bg-[#1d0f17]/90',
  astral: 'border-purple-400/55 bg-[#161026]/90'
};

export const WesnothIcon: React.FC<WesnothIconProps> = ({
  assetKey,
  alt,
  size = 36,
  framed = false,
  frameTone = 'steel',
  className = ''
}) => {
  const src = WESNOTH_ASSET_URLS[assetKey];
  if (!src) return null;

  if (!framed) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
        className={`object-contain shrink-0 select-none ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center shrink-0 border valen-bevel overflow-hidden shadow-inner ${FRAME_TONE_CLASS[frameTone]} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className="w-[84%] h-[84%] object-contain select-none"
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    </span>
  );
};
