'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import QRCode from '@/components/QRCode';
import Gallery from '@/components/Gallery';
import {
  getEventBySlug,
  isDemoMode,
  listSubmissions,
  subscribeToSubmissions,
  updateEvent,
} from '@/lib/demo-store';
import {
  getSupabase,
  isSupabaseConfigured,
  type EventRow,
  type SubmissionRow,
} from '@/lib/supabase';
import { downloadAsZip } from '@/lib/zip';
import { getTier } from '@/lib/tiers';
import { constantTimeEqual, LIMITS, safeFilenamePart } from '@/lib/validate';
import { updateWelcomeAction } from './actions';

type Access = 'loading' | 'ok' | 'denied' | 'missing';

export default function CouplePortalPage() {
  const params = useParams<{ slug: string; token: string }>();
  const slug = params?.slug ?? '';
  const token = params?.token ?? '';

  const [access, setAccess] = useState<Access>('loading');
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [origin, setOrigin] = useState('');
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeSaved, setWelcomeSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    async function load() {
      // demo always works with token "demo-portal"
      if (slug === 'demo') {
        if (!constantTimeEqual(token, 'demo-portal')) {
          setAccess('denied');
          return;
        }
        const demoEvent: EventRow = {
          id: 'demo-event',
          slug: 'demo',
          couple_names: 'Sarah & James',
          wedding_date: new Date().toISOString().slice(0, 10),
          welcome_message:
            'A small note from us — capture anything that makes you smile tonight.',
          tier: 'signature',
          manage_token: 'demo-portal',
          created_at: new Date().toISOString(),
        };
        setEvent(demoEvent);
        setWelcomeDraft(demoEvent.welcome_message ?? '');
        setItems(listSubmissions('demo-event'));
        unsub = subscribeToSubmissions('demo-event', setItems);
        setAccess('ok');
        return;
      }

      // local demo store
      const local = getEventBySlug(slug);
      if (local) {
        if (!constantTimeEqual(local.manage_token, token)) {
          setAccess('denied');
          return;
        }
        setEvent(local);
        setWelcomeDraft(local.welcome_message ?? '');
        setItems(listSubmissions(local.id));
        unsub = subscribeToSubmissions(local.id, setItems);
        setAccess('ok');
        return;
      }

      // supabase
      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase()!;
        const { data: ev } = await sb
          .from('events')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled) return;
        if (!ev) {
          setAccess('missing');
          return;
        }
        if (!constantTimeEqual((ev as EventRow).manage_token, token)) {
          setAccess('denied');
          return;
        }
        const row = ev as EventRow;
        setEvent(row);
        setWelcomeDraft(row.welcome_message ?? '');

        const { data: subs } = await sb
          .from('submissions')
          .select('*')
          .eq('event_id', row.id)
          .eq('approved', true)
          .order('created_at', { ascending: false });
        if (!cancelled) setItems((subs ?? []) as SubmissionRow[]);

        const channel = sb
          .channel(`portal-${row.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'submissions',
              filter: `event_id=eq.${row.id}`,
            },
            (payload) => {
              const r = payload.new as SubmissionRow;
              if (r.approved) setItems((curr) => [r, ...curr]);
            },
          )
          .subscribe();
        unsub = () => sb.removeChannel(channel);
        setAccess('ok');
        return;
      }

      setAccess('missing');
    }

    load();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [slug, token]);

  const captureUrl = useMemo(
    () => (origin ? `${origin}/event/${slug}` : `/event/${slug}`),
    [origin, slug],
  );
  const galleryShareUrl = useMemo(
    () => (origin ? `${origin}/event/${slug}/gallery` : `/event/${slug}/gallery`),
    [origin, slug],
  );

  const dateLabel = useMemo(() => {
    if (!event) return '';
    try {
      return new Date(event.wedding_date).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return event.wedding_date;
    }
  }, [event]);

  const tier = useMemo(() => getTier(event?.tier), [event]);

  async function copyToClipboard(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore; user can long-press to copy
    }
  }

  async function saveWelcome() {
    if (!event) return;
    setSavingWelcome(true);
    try {
      const next = welcomeDraft.trim() || null;
      // local store
      const local = getEventBySlug(slug);
      if (local) {
        updateEvent(local.id, { welcome_message: next });
        setEvent({ ...event, welcome_message: next });
        setWelcomeSaved(true);
        setTimeout(() => setWelcomeSaved(false), 1500);
        return;
      }
      // supabase via server action — verifies the token server-side
      if (isSupabaseConfigured && !isDemoMode() && event.id !== 'demo-event') {
        const res = await updateWelcomeAction({
          slug,
          token,
          message: welcomeDraft,
        });
        if (!res.ok) {
          alert(res.error || 'Could not save.');
          return;
        }
        setEvent({ ...event, welcome_message: next });
        setWelcomeSaved(true);
        setTimeout(() => setWelcomeSaved(false), 1500);
      }
    } finally {
      setSavingWelcome(false);
    }
  }

  async function handleDownloadZip() {
    if (items.length === 0) return;
    setDownloading(true);
    try {
      const zipped = items.map((it, i) => {
        const ext = it.media_type === 'photo' ? 'jpg' : 'webm';
        const kind = it.media_type === 'boomerang' ? 'boomerang' : it.media_type;
        const filter = safeFilenamePart(it.filter_name);
        const who = safeFilenamePart(it.guest_name);
        const name = `${String(i + 1).padStart(3, '0')}-${kind}-${filter}-${who}.${ext}`;
        return { url: it.media_url, filename: name };
      });
      await downloadAsZip(zipped, `${slug}-gallery.zip`);
    } finally {
      setDownloading(false);
    }
  }

  // --- render ----------------------------------------------------

  if (access === 'loading') {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">opening your portal…</p>
      </main>
    );
  }

  if (access === 'denied' || access === 'missing') {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif italic text-3xl">
            {access === 'denied' ? 'this link is no longer valid' : 'we couldn’t find your event'}
          </h1>
          <p className="mt-3 text-ink/60 leading-relaxed">
            {access === 'denied'
              ? 'Your studio may have rotated this link. Ask them to send you the new one.'
              : 'Double-check the URL or reach out to your studio for a fresh link.'}
          </p>
          <Link
            href="/"
            className="mt-8 inline-block text-xs uppercase tracking-widest border-b border-gold pb-1"
          >
            go home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="px-6 pt-8 flex items-center gap-3">
        <Logo className="h-5 w-8 text-ink" />
        <span className="text-[11px] tracking-widest uppercase text-ink/70">
          your portal
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-gold">
          private link
        </span>
      </header>

      <section className="px-6 pt-10 pb-6 text-center max-w-2xl mx-auto">
        <p className="text-[11px] tracking-widest uppercase text-ink/50">{dateLabel}</p>
        <h1 className="mt-3 font-serif italic text-5xl text-ink leading-tight">
          {event?.couple_names}
        </h1>
        <p className="mt-4 font-serif italic text-ink/65 text-lg">
          everything for your evening, in one quiet place
        </p>
        <p className="mt-4 inline-flex items-center text-[10px] uppercase tracking-widest border border-gold text-gold px-2 py-1 rounded-sm">
          {tier.label} tier
        </p>
      </section>

      {/* QR card */}
      <section className="px-6 py-10">
        <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-10 items-start">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-4">
              your guest qr
            </p>
            <QRCode
              value={captureUrl}
              label={captureUrl.replace(/^https?:\/\//, '')}
              fileName={`${slug}-guest-qr.png`}
            />
            <p className="mt-4 text-xs text-ink/55 leading-relaxed max-w-xs">
              Print this on your table cards. Each guest scans, the camera opens —
              no app, no account.
            </p>
            <a
              href={`/event/${slug}/qr`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[10px] uppercase tracking-widest text-ink/70 underline decoration-gold/60 underline-offset-4 hover:text-ink"
            >
              open print-ready 4×6 table card
            </a>
            <a
              href={`/event/${slug}/display`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[10px] uppercase tracking-widest text-ink/70 underline decoration-gold/60 underline-offset-4 hover:text-ink"
            >
              open slideshow on a tv / projector
            </a>
          </div>

          <div className="md:pt-8">
            <p className="text-[10px] uppercase tracking-widest text-ink/50">
              moments captured
            </p>
            <p className="font-serif italic text-6xl text-ink mt-1 leading-none">
              {items.length}
            </p>

            <button
              onClick={handleDownloadZip}
              disabled={downloading || items.length === 0}
              className="mt-8 bg-ink text-cream py-3 px-5 text-xs uppercase tracking-widest disabled:opacity-50 block"
            >
              {downloading ? 'preparing zip…' : 'download all as zip'}
            </button>

            <button
              onClick={() => copyToClipboard(galleryShareUrl, 'gallery')}
              className="mt-3 border border-ink py-3 px-5 text-xs uppercase tracking-widest block w-fit hover:bg-ink hover:text-cream transition-colors"
            >
              {copied === 'gallery' ? 'copied ✦' : 'copy gallery link'}
            </button>
            <p className="mt-2 text-[11px] text-ink/50">
              Share this read-only link with family who couldn’t be there.
            </p>
          </div>
        </div>
      </section>

      {/* Welcome message editor */}
      <section className="px-6 pb-10">
        <div className="max-w-2xl mx-auto border-t border-warm-gray-light pt-10">
          <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-3">
            welcome message for your guests
          </p>
          <textarea
            value={welcomeDraft}
            onChange={(e) => setWelcomeDraft(e.target.value)}
            maxLength={LIMITS.WELCOME_MESSAGE}
            rows={3}
            placeholder="A short note your guests will see before they open the camera…"
            className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold outline-none py-2 resize-none"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveWelcome}
              disabled={savingWelcome}
              className="text-[10px] uppercase tracking-widest border-b border-gold pb-0.5 disabled:opacity-50"
            >
              {savingWelcome ? 'saving…' : 'save'}
            </button>
            {welcomeSaved && (
              <span className="font-serif italic text-ink/60 text-sm">saved ✦</span>
            )}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="pb-16">
        <div className="px-6 mb-6 text-center">
          <h2 className="font-serif italic text-3xl text-ink">your gallery</h2>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-ink/50">
            updates as guests capture
          </p>
        </div>
        <Gallery items={items} eventId={event?.id} coupleNames={event?.couple_names} />
      </section>

      <footer className="px-6 py-8 text-center text-[10px] tracking-widest uppercase text-ink/40 border-t border-warm-gray-light">
        private link · share only with people you want in your gallery
      </footer>
    </main>
  );
}
