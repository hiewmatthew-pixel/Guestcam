'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BirdLogo from '@/components/BirdLogo';
import Gallery from '@/components/Gallery';
import {
  getEventBySlug,
  isDemoMode,
  listSubmissions,
  subscribeToSubmissions,
} from '@/lib/demo-store';
import {
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

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    async function load() {
      // demo event
      if (slug === 'demo') {
        const demoEvent: EventRow = {
          id: 'demo-event',
          slug: 'demo',
          couple_names: 'Sarah & James',
          wedding_date: new Date().toISOString().slice(0, 10),
          welcome_message: null,
          created_at: new Date().toISOString(),
        };
        setEvent(demoEvent);
        setItems(listSubmissions('demo-event'));
        unsub = subscribeToSubmissions('demo-event', setItems);
        setLoading(false);
        return;
      }

      const local = getEventBySlug(slug);
      if (local) {
        setEvent(local);
        setItems(listSubmissions(local.id));
        unsub = subscribeToSubmissions(local.id, setItems);
        setLoading(false);
        return;
      }

      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase()!;
        const { data: ev } = await sb
          .from('events')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled) return;
        if (!ev) {
          setLoading(false);
          return;
        }
        setEvent(ev as EventRow);
        const { data: subs } = await sb
          .from('submissions')
          .select('*')
          .eq('event_id', (ev as EventRow).id)
          .eq('approved', true)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        setItems((subs ?? []) as SubmissionRow[]);

        // realtime
        const channel = sb
          .channel(`sub-${(ev as EventRow).id}`)
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
              if (row.approved) setItems((curr) => [row, ...curr]);
            },
          )
          .subscribe();
        unsub = () => {
          sb.removeChannel(channel);
        };
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">loading the gallery…</p>
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
        <BirdLogo className="h-5 w-8 text-ink" />
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

      <Gallery items={items} />
    </main>
  );
}
