'use client';

import { useEffect, useState } from 'react';
import type { SubmissionRow } from '@/lib/supabase';

type Props = {
  items: SubmissionRow[];
};

export default function Gallery({ items }: Props) {
  const [open, setOpen] = useState<SubmissionRow | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-serif italic text-2xl text-ink/60">
          no moments yet
        </p>
        <p className="mt-2 text-sm text-ink/50">
          the gallery fills as guests capture the night
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 sm:columns-3 md:columns-4 gap-3 px-3">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setOpen(it)}
            className="mb-3 block w-full overflow-hidden rounded-sm bg-warm-gray-light/40 break-inside-avoid"
          >
            {it.media_type === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.media_url}
                alt={it.guest_name ?? 'guest capture'}
                className="block w-full h-auto"
                loading="lazy"
              />
            ) : (
              <video
                src={it.media_url}
                className="block w-full h-auto"
                muted
                playsInline
                loop
                onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
              />
            )}
            {it.guest_name && (
              <span className="block px-1 py-2 text-[11px] uppercase tracking-widest text-ink/60">
                {it.guest_name}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/95 grid place-items-center p-4"
          onClick={() => setOpen(null)}
        >
          <div className="max-w-3xl w-full">
            {open.media_type === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.media_url} alt="" className="w-full h-auto" />
            ) : (
              <video src={open.media_url} className="w-full h-auto" controls autoPlay playsInline />
            )}
            <div className="mt-4 text-center text-cream/80 text-sm tracking-widest uppercase">
              {open.guest_name ? `— ${open.guest_name}` : '— anonymous'} · {open.filter_name}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
