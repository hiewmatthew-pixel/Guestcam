'use client';

import { watchSubmissions } from '@/lib/live-submissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getEventBySlug,
  isDemoMode,
  listSubmissions,
  subscribeToSubmissions,
} from '@/lib/demo-store';
import { DEMO_EVENT_ID, makeDemoEvent } from '@/lib/demo-store';
import {
  fetchPublicEventBySlug,
  getSupabase,
  isSupabaseConfigured,
  labelForMediaType,
  type EventRow,
  type SubmissionRow,
} from '@/lib/supabase';
import { getTier, isGalleryExpired } from '@/lib/tiers';

const PHOTO_DURATION_MS = 6000;
// boomerangs loop forever; advance after they've played for a beat.
const BOOMERANG_DURATION_MS = 6000;
// videos advance on `ended`; this is the safety net for a clip that
// can't decode or whose autoplay is blocked (clips are capped at 15s)
const VIDEO_FALLBACK_MS = 20000;

export default function DisplaySlideshowPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  // load + subscribe ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    async function load() {
      if (slug === 'demo') {
        const demoEvent = makeDemoEvent();
        setEvent(demoEvent);
        setItems(listSubmissions(DEMO_EVENT_ID));
        unsub = subscribeToSubmissions(DEMO_EVENT_ID, setItems);
        return;
      }

      const local = getEventBySlug(slug);
      if (local) {
        setEvent(local);
        setItems(listSubmissions(local.id));
        unsub = subscribeToSubmissions(local.id, setItems);
        return;
      }

      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase()!;
        const ev = await fetchPublicEventBySlug(sb, slug);
        if (cancelled || !ev) return;
        setEvent(ev);
        unsub = watchSubmissions({
          eventId: ev.id,
          load: async () => {
            const { data, error } = await sb
              .from('submissions')
              .select('*')
              .eq('event_id', ev.id)
              .eq('approved', true)
              .order('created_at', { ascending: false });
            if (error) throw error;
            return (data ?? []) as SubmissionRow[];
          },
          onRows: setItems,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug]);

  // playable items — the TV slideshow can't render voice notes
  const playable = useMemo(
    () => items.filter((it) => it.media_type !== 'voice'),
    [items],
  );

  // clamp idx if the list shrinks
  useEffect(() => {
    if (idx >= playable.length && playable.length > 0) setIdx(0);
  }, [playable.length, idx]);

  // bumps on every advance so a one-item slideshow still replays
  const [cycle, setCycle] = useState(0);
  const advance = useCallback(() => {
    setIdx((cur) => (playable.length === 0 ? 0 : (cur + 1) % playable.length));
    setCycle((c) => c + 1);
  }, [playable.length]);

  const back = useCallback(() => {
    setIdx((cur) =>
      playable.length === 0 ? 0 : (cur - 1 + playable.length) % playable.length,
    );
  }, [playable.length]);

  // schedule the next advance. Keyed on the current item's identity so
  // a realtime insert that grows `playable` doesn't restart the timer
  // for the slide that's currently on screen.
  //   - photos:    timer-driven (6s)
  //   - boomerang: timer-driven (6s, loops in background)
  //   - video:     <video onEnded/onError> drives advance; 20s fallback.
  const currentId = playable[idx]?.id;
  const currentKind = playable[idx]?.media_type;
  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (paused || !currentId) return;
    let ms = 0;
    if (currentKind === 'photo') ms = PHOTO_DURATION_MS;
    else if (currentKind === 'boomerang') ms = BOOMERANG_DURATION_MS;
    else ms = VIDEO_FALLBACK_MS;
    timerRef.current = window.setTimeout(advance, ms) as unknown as number;
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [currentId, currentKind, paused, advance, cycle]);

  // keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'ArrowRight') {
        advance();
      } else if (e.key === 'ArrowLeft') {
        back();
      } else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, back]);

  const current = playable[idx];

  if (!event) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream">
        <p className="font-serif italic text-cream/60">loading…</p>
      </main>
    );
  }

  // gate by tier — slideshow is a Signature+ feature
  if (!getTier(event.tier).features.liveSlideshow) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8">
        <div className="max-w-md">
          <p className="text-[10px] uppercase tracking-[0.4em] text-cream/55">
            slideshow mode
          </p>
          <p className="mt-6 font-serif italic text-4xl">
            available on Signature and Studio
          </p>
          <p className="mt-4 text-cream/65 leading-relaxed">
            The reception slideshow projects every guest's capture as it
            arrives. Upgrade your event to turn it on.
          </p>
        </div>
      </main>
    );
  }

  // the slideshow URL is public; once the gallery window closes, stop
  // serving it (keeps old events from being projected indefinitely).
  if (isGalleryExpired(event)) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-cream/55">
            the gallery has closed
          </p>
          <p className="mt-6 font-serif italic text-5xl">{event.couple_names}</p>
        </div>
      </main>
    );
  }

  // honour the reveal lock — the slideshow URL is public, so during the
  // disposable-camera window we render the same hush message guests get.
  if (event.reveal_at && new Date(event.reveal_at).getTime() > Date.now()) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-cream/55">
            still developing
          </p>
          <p className="mt-6 font-serif italic text-5xl">{event.couple_names}</p>
          <p className="mt-4 text-cream/65">
            the gallery is being kept in the dark until the couple opens it.
          </p>
        </div>
      </main>
    );
  }

  if (playable.length === 0) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8">
        <div>
          <p className="font-serif italic text-5xl">{event.couple_names}</p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.35em] text-cream/55">
            the night is just beginning
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 bg-black text-cream overflow-hidden select-none">
      {/* Layered current + previous for cross-fade */}
      <SlideMedia key={`${current!.id}-${cycle}`} item={current!} onEnded={advance} paused={paused} />

      {/* caption */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-12 pb-10 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-serif italic text-3xl md:text-4xl text-cream">
              {current!.guest_name ?? 'anonymous'}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-cream/60">
              {current!.filter_name} · {labelFor(current!.media_type)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-serif italic text-2xl text-cream/80">
              {event.couple_names}
            </p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-cream/40">
              {idx + 1} / {playable.length}
            </p>
          </div>
        </div>
      </div>

      {/* paused overlay hint (lower-left) */}
      {paused && (
        <div className="absolute top-6 left-6 z-20 text-[10px] uppercase tracking-[0.35em] text-cream/70 border border-cream/30 rounded-full px-3 py-1.5">
          paused · press space to resume
        </div>
      )}

      {/* controls hint (top right, faded; visible briefly on mouse-move) */}
      <ControlsHint />
    </main>
  );
}

function SlideMedia({
  item,
  onEnded,
  paused,
}: {
  item: SubmissionRow;
  onEnded: () => void;
  paused: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused]);

  if (item.media_type === 'photo') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.media_url}
        alt=""
        className="absolute inset-0 w-full h-full object-contain animate-slide-in"
      />
    );
  }
  return (
    <video
      ref={videoRef}
      src={item.media_url}
      className="absolute inset-0 w-full h-full object-contain animate-slide-in"
      autoPlay={!paused}
      playsInline
      loop={item.media_type === 'boomerang'}
      muted={item.media_type === 'boomerang'}
      onEnded={() => {
        if (item.media_type !== 'boomerang' && !paused) onEnded();
      }}
      onError={onEnded}
    />
  );
}

function ControlsHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let t: number;
    function ping() {
      setVisible(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setVisible(false), 2500) as unknown as number;
    }
    ping();
    window.addEventListener('mousemove', ping);
    return () => {
      window.removeEventListener('mousemove', ping);
      window.clearTimeout(t);
    };
  }, []);
  return (
    <div
      className={[
        'absolute top-6 right-6 z-20 text-[10px] uppercase tracking-[0.3em] text-cream/55 transition-opacity duration-500',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      space · pause &nbsp;·&nbsp; ← → · step &nbsp;·&nbsp; f · fullscreen
    </div>
  );
}

const labelFor = labelForMediaType;
