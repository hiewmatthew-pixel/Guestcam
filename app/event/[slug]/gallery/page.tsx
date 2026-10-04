'use client';

import { watchSubmissions } from '@/lib/live-submissions';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import Gallery from '@/components/Gallery';
import RevealCountdown from '@/components/RevealCountdown';
import { getTier, isGalleryExpired } from '@/lib/tiers';
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
  type EventRow,
  type SubmissionRow,
} from '@/lib/supabase';

export default function EventGalleryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    setLoading(true);
    setLoadError(false);

    async function load() {
      // demo event
      if (slug === 'demo') {
        const demoEvent = makeDemoEvent();
        setEvent(demoEvent);
        const onChange = (rows: SubmissionRow[]) =>
          setItems(rows.filter((r) => r.approved));
        onChange(listSubmissions(DEMO_EVENT_ID));
        unsub = subscribeToSubmissions(DEMO_EVENT_ID, onChange);
        setLoading(false);
        return;
      }

      const local = getEventBySlug(slug);
      if (local) {
        setEvent(local);
        const onChange = (rows: SubmissionRow[]) =>
          setItems(rows.filter((r) => r.approved));
        onChange(listSubmissions(local.id));
        unsub = subscribeToSubmissions(local.id, onChange);
        setLoading(false);
        return;
      }

      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase()!;
        const ev = await fetchPublicEventBySlug(sb, slug);
        if (cancelled) return;
        if (!ev) {
          setLoading(false);
          return;
        }
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
          onRows: (rows) => {
            setItems(rows);
            setLoading(false);
          },
          onError: () => {
            setLoadError(true);
            setLoading(false);
          },
        });
        return;
      }
      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        setLoadError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug, reloadKey]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">loading the gallery…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="text-center max-w-sm">
          <p className="font-serif italic text-2xl text-ink/70">
            we couldn’t load the gallery
          </p>
          <p className="mt-2 text-sm text-ink/50">
            Check your connection and try again.
          </p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-6 text-[10px] uppercase tracking-widest border-b border-gold pb-0.5"
          >
            try again
          </button>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">event not found</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="px-6 pt-8 pb-6 flex items-center gap-3">
        <Link href="/" aria-label="back to home" className="shrink-0">
          <Logo className="h-5 w-8 text-ink" />
        </Link>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-ink/50">
            live gallery
          </p>
          <h1 className="font-serif italic text-2xl">{event.couple_names}</h1>
        </div>
        <Link
          href={`/event/${slug}`}
          className="text-[10px] uppercase tracking-widest border-b border-gold pb-0.5"
        >
          capture
        </Link>
      </header>

      {isGalleryExpired(event) ? (
        <section className="py-24 px-6 text-center max-w-md mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-ink/45">
            the gallery has closed
          </p>
          <h2 className="mt-6 font-serif italic text-3xl leading-tight">
            these moments have been
            <br />
            handed back to the couple
          </h2>
          <p className="mt-6 text-ink/60 leading-relaxed">
            The shared gallery for {event.couple_names} stayed open for{' '}
            {getTier(event.tier).features.galleryDays} days after the wedding
            and has now closed. The couple keeps every capture.
          </p>
        </section>
      ) : event.reveal_at && new Date(event.reveal_at).getTime() > Date.now() ? (
        <RevealCountdown
          revealAt={event.reveal_at}
          coupleNames={event.couple_names}
          guestCount={items.length}
        />
      ) : (
        <Gallery
          items={items}
          eventId={event.id}
          coupleNames={event.couple_names}
          showComments={getTier(event.tier).features.comments}
        />
      )}
    </main>
  );
}
