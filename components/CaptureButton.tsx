'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  mode: 'photo' | 'video' | 'boomerang';
  recording: boolean;
  maxSeconds?: number;
  onTap: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
};

export default function CaptureButton({
  mode,
  recording,
  maxSeconds = 15,
  onTap,
}: Props) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if ((mode === 'video' || mode === 'boomerang') && recording) {
      startRef.current = performance.now();
      const tick = () => {
        const now = performance.now();
        const elapsed = (now - (startRef.current ?? now)) / 1000;
        setProgress(Math.min(elapsed / maxSeconds, 1));
        if (elapsed < maxSeconds) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setProgress(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, recording, maxSeconds]);

  const ringSize = 84;
  const stroke = 3;
  const r = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * progress;

  return (
    <button
      onClick={onTap}
      aria-label={mode === 'photo' ? 'take photo' : recording ? 'stop video' : 'start video'}
      className="relative grid place-items-center select-none"
      style={{ width: ringSize, height: ringSize }}
    >
      <svg
        width={ringSize}
        height={ringSize}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={r}
          stroke="rgba(245,241,234,0.6)"
          strokeWidth={stroke}
          fill="none"
        />
        {(mode === 'video' || mode === 'boomerang') && recording && (
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            stroke="#B8956A"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${circ - dash}`}
          />
        )}
      </svg>
      <span
        className={[
          'block rounded-full transition-all duration-200',
          (mode === 'video' || mode === 'boomerang') && recording
            ? 'bg-red-500 h-7 w-7 rounded-md'
            : 'bg-gold h-16 w-16',
        ].join(' ')}
      />
    </button>
  );
}
