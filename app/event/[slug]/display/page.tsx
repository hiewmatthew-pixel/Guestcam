'use client';

import { watchSubmissions } from '@/lib/live-submissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from '@/components/QRCode';
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
import { filterLabel } from '@/lib/filters';
import { getTier, isGalleryExpired } from '@/lib/tiers';

const PHOTO_DURATION_MS = 6000;
// boomerangs loop forever; advance after they've played for a beat.
const BOOMERANG_DURATION_MS = 6000;
// videos advance on `ended`; this is the safety net for a clip that
// can't decode or whose autoplay is blocked (clips are capped at 15s)
const VIDEO_FALLBACK_MS = 20000;
// realtime pushes new rows; the poll is only a safety net for a TV that
// sits on venue wifi for hours (dropped sockets)
const POLL_MS = 60_000;

const byOldest = (a: SubmissionRow, b: SubmissionRow) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;

export default function DisplaySlideshowPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [guestUrl, setGuestUrl] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setGuestUrl(`${window.location.origin}/event/${slug}`);
  }, [slug]);

  // load + subscribe ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    // the TV is public: never project pending (unmoderated) captures
    const onLocal = (rows: SubmissionRow[]) => setItems(rows.filter((r) => r.approved));

    async function load() {
      if (slug === 'demo') {
        const demoEvent = makeDemoEvent();
        setEvent(demoEvent);
        onLocal(listSubmissions(DEMO_EVENT_ID));
        unsub = subscribeToSubmissions(DEMO_EVENT_ID, onLocal);
        return;
      }

      const local = getEventBySlug(slug);
      if (local) {
        setEvent(local);
        onLocal(listSubmissions(local.id));
        unsub = subscribeToSubmissions(local.id, onLocal);
        return;
      }

      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase()!;
        const ev = await fetchPublicEventBySlug(sb, slug);
        if (cancelled || !ev) return;
        setEvent(ev);
        unsub = watchSubmissions({
          eventId: ev.id,
          // one event's approved, open photos via get_gallery(slug); the
          // anon key can't read the submissions table directly
          load: async () => {
            const { data, error } = await sb.rpc('get_gallery', { p_slug: slug });
            if (error) throw error;
            return (data ?? []) as SubmissionRow[];
          },
          onRows: setItems,
          pollMs: POLL_MS,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug]);

  // playable items, oldest first — the TV slideshow can't render voice notes
  const playable = useMemo(
    () => items.filter((it) => it.media_type !== 'voice').sort(byOldest),
    [items],
  );

  // --- playback order ---------------------------------------------------
  // The loop walks `playable` oldest -> newest. Anything that arrives
  // while the show is running jumps the queue and plays next, so a guest
  // sees their capture on the big screen within one slide; afterwards the
  // loop resumes where it left off.
  const [currentId, setCurrentId] = useState<string | null>(null);
  // bumps on every advance so a one-item slideshow still replays
  const [cycle, setCycle] = useState(0);
  const playableRef = useRef<SubmissionRow[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<string[]>([]);
  const loopIdRef = useRef<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  playableRef.current = playable;
  currentIdRef.current = currentId;

  const advance = useCallback(() => {
    const list = playableRef.current;
    const ids = new Set(list.map((it) => it.id));
    // 1) fresh arrivals first
    while (queueRef.current.length) {
      const next = queueRef.current.shift()!;
      if (ids.has(next)) {
        setCurrentId(next);
        setCycle((c) => c + 1);
        return;
      }
    }
    // 2) otherwise continue the oldest-first loop
    if (list.length === 0) {
      setCurrentId(null);
      return;
    }
    const at = list.findIndex((it) => it.id === loopIdRef.current);
    const next = list[(at + 1) % list.length];
    loopIdRef.current = next.id;
    setCurrentId(next.id);
    setCycle((c) => c + 1);
  }, []);

  const back = useCallback(() => {
    const list = playableRef.current;
    if (list.length === 0) return;
    const at = list.findIndex((it) => it.id === currentIdRef.current);
    const prev = list[(at - 1 + list.length) % list.length];
    loopIdRef.current = prev.id;
    setCurrentId(prev.id);
    setCycle((c) => c + 1);
  }, []);

  // reconcile the queue whenever the list changes
  useEffect(() => {
    const ids = playable.map((it) => it.id);
    if (seenRef.current === null) {
      // first non-empty load: everything is "seen", start the loop
      if (ids.length === 0) return;
      seenRef.current = new Set(ids);
      loopIdRef.current = ids[0];
      setCurrentId(ids[0]);
      return;
    }
    const seen = seenRef.current;
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        queueRef.current.push(id);
      }
    }
    const present = new Set(ids);
    queueRef.current = queueRef.current.filter((id) => present.has(id));
    // current slide was hidden/removed, or the show was idle (empty)
    const cur = currentIdRef.current;
    if (!cur || !present.has(cur)) advance();
  }, [playable, advance]);

  const current = playable.find((it) => it.id === currentId) ?? null;
  const position = current ? playable.indexOf(current) + 1 : 0;

  // schedule the next advance. Keyed on the current item's identity so
  // a realtime insert that grows `playable` doesn't restart the timer
  // for the slide that's currently on screen.
  //   - photos:    timer-driven (6s)
  //   - boomerang: timer-driven (6s, loops in background)
  //   - video:     <video onEnded/onError> drives advance; 20s fallback.
  const currentKind = current?.media_type;
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

  if (!event) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream">
        <p role="status" className="font-serif italic text-2xl text-cream/70">
          loading…
        </p>
      </main>
    );
  }

  // gate by tier — slideshow is a Signature+ feature
  if (!getTier(event.tier).features.liveSlideshow) {
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8">
        <div className="max-w-md">
          <p className="text-base uppercase tracking-[0.4em] text-cream/70">slideshow mode</p>
          <h1 className="mt-6 font-serif italic text-4xl">available on Signature and Studio</h1>
          <p className="mt-4 text-lg text-cream/70 leading-relaxed">
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
          <p className="text-base uppercase tracking-[0.4em] text-cream/70">
            the gallery has closed
          </p>
          <h1 className="mt-6 font-serif italic text-5xl">{event.couple_names}</h1>
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
          <p className="text-base uppercase tracking-[0.4em] text-cream/70">still developing</p>
          <h1 className="mt-6 font-serif italic text-5xl">{event.couple_names}</h1>
          <p className="mt-4 text-xl text-cream/70">
            the gallery is being kept in the dark until the couple opens it.
          </p>
        </div>
      </main>
    );
  }

  if (!current) {
    // waiting for the first capture: make joining the obvious next step
    return (
      <main className="min-h-screen grid place-items-center bg-black text-cream text-center px-8 py-10">
        <div className="flex flex-col items-center">
          <h1 className="font-serif italic text-6xl md:text-7xl">{event.couple_names}</h1>
          <p className="mt-4 text-xl uppercase tracking-[0.35em] text-cream/70">
            the night is just beginning
          </p>
          {guestUrl && (
            <div className="mt-10">
              <QRCode value={guestUrl} size={300} showDownload={false} />
            </div>
          )}
          <p className="mt-6 font-serif italic text-4xl text-cream">scan to add yours</p>
          {guestUrl && (
            <p className="mt-2 text-xl text-cream/70">{guestUrl.replace(/^https?:\/\//, '')}</p>
          )}
        </div>
      </main>
    );
  }

  const filter = filterLabel(current.filter_name);

  return (
    <main className="fixed inset-0 bg-black text-cream overflow-hidden select-none">
      <h1 className="sr-only">{event.couple_names} — live slideshow</h1>

      <SlideMedia key={`${current.id}-${cycle}`} item={current} onEnded={advance} paused={paused} />

      {/* caption + persistent join QR */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-12 pb-10 pt-24 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
        <div className="flex items-end justify-between gap-8">
          <div className="min-w-0">
            <p className="font-serif italic text-4xl md:text-5xl text-cream truncate">
              {current.guest_name ?? 'anonymous'}
            </p>
            <p className="mt-2 text-2xl uppercase tracking-[0.2em] text-cream/75">
              {filter ? `${filter} · ` : ''}
              {labelFor(current.media_type)}
            </p>
          </div>
          <div className="flex items-end gap-8 shrink-0">
            <div className="text-right">
              <p className="font-serif italic text-3xl text-cream/85">{event.couple_names}</p>
              <p className="mt-1 text-lg uppercase tracking-[0.3em] text-cream/70">
                {position} / {playable.length}
              </p>
            </div>
            {guestUrl && (
              <div className="flex flex-col items-center">
                <QRCode value={guestUrl} size={120} showDownload={false} />
                <p className="mt-2 text-xl font-serif italic text-cream">scan to add yours</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* paused overlay hint (upper-left) */}
      {paused && (
        <div
          role="status"
          className="absolute top-6 left-6 z-20 text-lg uppercase tracking-[0.3em] text-cream/85 border border-cream/40 bg-black/50 rounded-full px-4 py-2"
        >
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

  const desc = `${labelFor(item.media_type)} by ${item.guest_name ?? 'an anonymous guest'}`;

  if (item.media_type === 'photo') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.media_url}
        alt={desc}
        className="absolute inset-0 w-full h-full object-contain animate-slide-in"
      />
    );
  }
  return (
    <video
      ref={videoRef}
      src={item.media_url}
      aria-label={desc}
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
      aria-hidden={!visible}
      className={[
        'absolute top-6 right-6 z-20 text-base uppercase tracking-[0.25em] text-cream/75 bg-black/40 rounded-full px-4 py-2 transition-opacity duration-500',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      space · pause &nbsp;·&nbsp; ← → · step &nbsp;·&nbsp; f · fullscreen
    </div>
  );
}

const labelFor = labelForMediaType;
