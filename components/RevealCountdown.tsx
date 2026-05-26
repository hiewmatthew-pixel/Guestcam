'use client';

import { useEffect, useState } from 'react';

type Props = {
  revealAt: string;          // ISO timestamp
  coupleNames: string;
  guestCount?: number;       // optional — number of submissions in queue
};

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function breakdown(ms: number) {
  if (ms < 0) ms = 0;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((ms % (60 * 1000)) / 1000);
  return { days, hours, minutes, seconds };
}

export default function RevealCountdown({ revealAt, coupleNames, guestCount }: Props) {
  const target = new Date(revealAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(target - Date.now());
    tick();
    const i = window.setInterval(tick, 1000);
    return () => window.clearInterval(i);
  }, [target]);

  const { days, hours, minutes, seconds } = breakdown(remaining);
  const revealDate = (() => {
    try {
      const d = new Date(revealAt);
      return d.toLocaleString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return revealAt;
    }
  })();

  return (
    <section className="py-20 px-6 max-w-2xl mx-auto text-center">
      <p className="text-[10px] uppercase tracking-[0.4em] text-ink/45">
        a slow develop
      </p>
      <h2 className="mt-6 font-serif italic text-4xl md:text-5xl leading-tight">
        the gallery for {coupleNames}
        <br />
        is still developing
      </h2>
      <p className="mt-6 text-ink/65 leading-relaxed">
        Like a roll of film, every guest's moment is being kept in the dark
        until the couple opens it. The first glimpse will appear
        <br />
        <span className="font-serif italic text-ink"> {revealDate}</span>.
      </p>

      <div className="mt-12 flex justify-center gap-6 sm:gap-10">
        <TimeBlock value={days} label="days" />
        <TimeBlock value={hours} label="hours" />
        <TimeBlock value={minutes} label="minutes" />
        <TimeBlock value={seconds} label="seconds" />
      </div>

      {typeof guestCount === 'number' && guestCount > 0 && (
        <p className="mt-12 font-serif italic text-ink/55">
          {guestCount} {guestCount === 1 ? 'moment' : 'moments'} already
          captured · waiting to be shared
        </p>
      )}
    </section>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-serif text-4xl sm:text-5xl text-ink tabular-nums">
        {pad(value)}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-ink/45">
        {label}
      </p>
    </div>
  );
}
