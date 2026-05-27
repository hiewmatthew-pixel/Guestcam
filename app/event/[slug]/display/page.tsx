'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getEventBySlug,
  isDemoMode,
  listSubmissions,
  subscribeToSubmissions,
} from '@/lib/demo-store';
import {
  getSupabase,
  isSupabaseConfigured,
  labelForMediaType,
  type EventRow,
  type SubmissionRow,
} from '@/lib/supabase';

const PHOTO_DURATION_MS = 6000;
// boomerangs loop forever; advance after they've played for a beat.
const BOOMERANG_DURATION_MS = 6000;

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
        const demoEvent: EventRow = {
          id: 'demo-event',
          slug: 'demo',
          couple_names: 'Sarah & James',
          wedding_date: new Date().toISOString().slice(0, 10),
          welcome_message: null,
          tier: 'signature',
          manage_token: 'demo-portal',
          reveal_at: null,
          auto_approve: true,
          created_at: new Date().toISOString(),
        };
        setEvent(demoEvent);
        setItems(listSubmissions('demo-event'));
        unsub = subscribeToSubmissions('demo-event', setItems);
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
        const { data: ev } = await sb
          .from('events')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled || !ev) return;
        setEvent(ev as EventRow);
        const { data: subs } = await sb
          .from('submissions')
          .select('*')
          .eq('event_id', (ev as EventRow).id)
          .eq('approved', true)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        setItems((subs ?? []) as SubmissionRow[]);

        const channel = sb
          .channel(`display-${(ev as EventRow).id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'submissions',
              filter: `event_id=eq.${(ev as EventRow).id}`,
            },
            (payload) => {
              const row = payload.new as SubmissionRow;
              if (row.approved) {
                setItems((cur) =>
                  cur.some((c) => c.id === row.id) ? cur : [row, ...cur],
                );
              }
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'submissions',
              filter: `event_id=eq.${(ev as EventRow).id}`,
            },
            (payload) => {
              const row = payload.new as SubmissionRow;
              setItems((cur) => {
                const has = cur.some((c) => c.id === row.id);
                if (row.approved) {
                  return has
                    ? cur.map((c) => (c.id === row.id ? row : c))
                    : [row, ...cur];
                }
                return has ? cur.filter((c) => c.id !== row.id) : cur;
              });
            },
          )
          .subscribe();
        unsub = () => {
          sb.removeChannel(channel);
        };
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

  const advance = useCallback(() => {
    setIdx((cur) => (playable.length === 0 ? 0 : (cur + 1) % playable.length));
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
  //   - video:     <video onEnded> drives advance; no timer needed.
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
    else return; // 'video' — onEnded drives it
    timerRef.current = window.setTimeout(advance, ms) as unknown as number;
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [currentId, currentKind, paused, advance]);

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
      <SlideMedia key={current!.id} item={current!} onEnded={advance} paused={paused} />

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
      src={item.media_url}
      className="absolute inset-0 w-full h-full object-contain animate-slide-in"
      autoPlay={!paused}
      playsInline
      loop={item.media_type === 'boomerang'}
      muted={item.media_type === 'boomerang'}
      onEnded={() => {
        if (item.media_type !== 'boomerang') onEnded();
      }}
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
