import React from 'react';

interface ValenMeterProps {
  value: number;
  max: number;
  fillClass: string;
  ghostClass?: string;
  heightClass?: string;
}

/**
 * Dual-layer vitality/resource meter with a delayed trailing ghost drain bar
 * matching AAA action-tactics damage feedback.
 */
export const ValenMeter: React.FC<ValenMeterProps> = ({
  value,
  max,
  fillClass,
  ghostClass = 'bg-amber-200/55',
  heightClass = 'h-2'
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className={`relative w-full ${heightClass} bg-[#070a12] border border-white/10 rounded-[3px] overflow-hidden`}>
      <div
        className={`absolute inset-y-0 left-0 ${ghostClass} transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
      <div
        className={`relative h-full ${fillClass} transition-[width] duration-150 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
