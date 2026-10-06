'use client';

// Small status pill for the background send queue (lib/upload-queue.ts).
// Hidden when nothing is pending. Tells guests their capture is safe on
// the phone while the venue Wi-Fi catches up, and offers retry / save for
// anything the server turned down for good.

import { useEffect, useState } from 'react';
import {
  discardItem,
  firstFailedItem,
  retryFailed,
  subscribeQueue,
  type QueueState,
} from '@/lib/upload-queue';

export default function UploadQueueStatus({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [s, setS] = useState<QueueState | null>(null);
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => subscribeQueue(setS), []);

  // brief "all sent" confirmation after the queue drains
  useEffect(() => {
    if (!s || s.pending > 0 || s.failed > 0 || s.sentCount === 0) return;
    setJustFinished(true);
    const t = setTimeout(() => setJustFinished(false), 3000);
    return () => clearTimeout(t);
  }, [s?.pending, s?.failed, s?.sentCount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || (s.pending === 0 && s.failed === 0 && !justFinished)) return null;

  // One capture per tap: iOS blocks a burst of downloads, so saving them
  // all at once silently dropped the rest. Prefer the share sheet ("Save
  // to Photos"); fall back to a download. Removed only once handed over.
  async function saveNextFailed() {
    const it = await firstFailedItem();
    if (!it) return;
    const name = `glancecam-${it.mediaType}.${it.ext}`;
    const file = new File([it.blob], name, { type: it.contentType });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        await discardItem(it.id);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // guest closed the sheet: keep it
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    await discardItem(it.id);
  }

  const base =
    tone === 'dark'
      ? 'bg-black/80 text-cream border-cream/20'
      : 'bg-ink text-cream border-ink';
  let text: string;
  if (s.failed > 0) {
    text = `${s.failed} couldn’t send${s.lastError ? ` · ${s.lastError}` : ''}`;
  } else if (s.pending > 0) {
    const pct = s.progress !== null && s.sendingId ? ` · ${Math.round(s.progress * 100)}%` : '';
    text =
      s.sendingId !== null
        ? `sending ${s.pending}${pct}`
        : s.persistent
          ? `${s.pending} saved on this phone · will send when the signal returns`
          : `${s.pending} waiting to send · keep this page open`;
  } else {
    text = 'all sent ✓';
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ top: 'calc(3.25rem + env(safe-area-inset-top, 0px))' }}>
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-[11px] shadow-lg ${base}`}
      >
        <span className="truncate">{text}</span>
        {s.failed > 0 && (
          <>
            <button onClick={() => retryFailed()} className="min-h-11 px-2 underline underline-offset-2">
              retry
            </button>
            <button onClick={saveNextFailed} className="min-h-11 px-2 underline underline-offset-2">
              save {s.failed > 1 ? 'one' : 'it'} to phone
            </button>
          </>
        )}
      </div>
    </div>
  );
}
