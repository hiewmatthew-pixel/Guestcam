'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from '@/components/QRCode';
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
import { downloadAsZip } from '@/lib/zip';
import { formatPriceCAD, getTier } from '@/lib/tiers';

type Props = { slug: string };

export default function AdminEventDetail({ slug }: Props) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    async function load() {
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
        if (ev) {
          setEvent(ev as EventRow);
          const { data: subs } = await sb
            .from('submissions')
            .select('*')
            .eq('event_id', (ev as EventRow).id)
            .order('created_at', { ascending: false });
          setItems((subs ?? []) as SubmissionRow[]);

          const channel = sb
            .channel(`admin-sub-${(ev as EventRow).id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'submissions',
                filter: `event_id=eq.${(ev as EventRow).id}`,
              },
              (payload) => {
                setItems((curr) => [payload.new as SubmissionRow, ...curr]);
              },
            )
            .subscribe();
          unsub = () => sb.removeChannel(channel);
        }
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug]);

  const captureUrl = useMemo(() => (origin ? `${origin}/event/${slug}` : `/event/${slug}`), [origin, slug]);
  const tier = useMemo(() => getTier(event?.tier), [event]);

  async function handleDownloadZip() {
    if (items.length === 0) return;
    setDownloading(true);
    try {
      const zipped = items.map((it, i) => {
        const ext = it.media_type === 'photo' ? 'jpg' : 'webm';
        const name = `${String(i + 1).padStart(3, '0')}-${it.filter_name}-${it.guest_name ?? 'guest'}.${ext}`;
        return { url: it.media_url, filename: name };
      });
      await downloadAsZip(zipped, `${slug}-gallery.zip`);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return <p className="text-center font-serif italic text-ink/60">loading…</p>;
  }

  if (!event) {
    return (
      <div className="text-center max-w-md mx-auto">
        <p className="font-serif italic text-2xl">event not found</p>
        <Link href="/admin" className="mt-6 inline-block text-[10px] uppercase tracking-widest border-b border-gold">
          back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/admin" className="text-[10px] uppercase tracking-widest text-ink/60">
        ← all events
      </Link>

      <header className="mt-4">
        <p className="text-[10px] uppercase tracking-widest text-ink/50">{event.wedding_date}</p>
        <h1 className="font-serif italic text-4xl mt-1">{event.couple_names}</h1>
        {event.welcome_message && (
          <p className="mt-3 text-ink/60 max-w-xl">{event.welcome_message}</p>
        )}
        <p className="mt-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest border border-gold text-gold px-2 py-1 rounded-sm">
          {tier.label} tier · {formatPriceCAD(tier.price)} ·{' '}
          {tier.features.allowVideo ? 'photo + video' : 'photo only'} ·{' '}
          {tier.features.filters.length === 5
            ? 'all filters'
            : `${tier.features.filters.length} filters`}
        </p>
      </header>

      <div className="mt-10 grid md:grid-cols-2 gap-10 items-start">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-4">
            scan to capture
          </p>
          <QRCode
            value={captureUrl}
            label={`${captureUrl.replace(/^https?:\/\//, '')}`}
            fileName={`${slug}-qr.png`}
          />
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink/50">submissions</p>
          <p className="font-serif italic text-3xl mt-1">{items.length}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/event/${slug}/gallery`}
              className="text-[10px] uppercase tracking-widest border-b border-gold pb-0.5 w-fit"
            >
              open live gallery →
            </Link>
            <button
              onClick={handleDownloadZip}
              disabled={downloading || items.length === 0}
              className="bg-ink text-cream py-3 px-5 text-xs uppercase tracking-widest disabled:opacity-50 w-fit"
            >
              {downloading ? 'zipping…' : 'download all (zip)'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-16">
        <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-6 text-center">
          recent moments
        </p>
        <Gallery items={items} />
      </div>
    </div>
  );
}
