'use client';

import { watchSubmissions } from '@/lib/live-submissions';
import { extensionFor } from '@/lib/media';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from '@/components/QRCode';
import Gallery from '@/components/Gallery';
import {
  getEventBySlug,
  isDemoMode,
  listSubmissions,
  rotateManageToken,
  setSubmissionApproval,
  subscribeToSubmissions,
  updateEvent,
} from '@/lib/demo-store';
import {
  getSupabase,
  isSupabaseConfigured,
  type EventRow,
  type SubmissionRow,
} from '@/lib/supabase';
import { eventKeyDates, formatDay, formatDayTime, formatPriceCAD, getTier } from '@/lib/tiers';
import { safeFilenamePart } from '@/lib/validate';
import { formatWeddingDate } from '@/lib/dates';
import {
  adminGetEventBySlugAction,
  adminListSubmissionsAction,
  adminSetSubmissionApprovedAction,
  rotateTokenAction,
  updateEventAction,
} from '../event-actions';
import EditEventForm, { type EventPatch } from './EditEventForm';

type Props = { slug: string };

export default function AdminEventDetail({ slug }: Props) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

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
        // event + submissions read through admin server actions: the
        // manage_token and pending rows aren't visible to the anon key.
        const ev = await adminGetEventBySlugAction(slug);
        if (cancelled) return;
        if (ev) {
          setEvent(ev);
          unsub = watchSubmissions({
            eventId: ev.id,
            load: () => adminListSubmissionsAction(ev.id),
            onRows: setItems,
            pollMs: 15_000,
          });
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
  const portalUrl = useMemo(
    () =>
      event
        ? `${origin || ''}/event/${slug}/portal/${event.manage_token}`
        : '',
    [origin, slug, event],
  );
  const tier = useMemo(() => getTier(event?.tier), [event]);

  // ready-to-paste note for the couple: their private link plus the dates
  // that matter (matches the "your dates" panel in their portal)
  const coupleMessage = useMemo(() => {
    if (!event || !portalUrl) return '';
    const d = eventKeyDates(event);
    const lines = [
      `Hi ${event.couple_names},`,
      '',
      'Here is your private GlanceCam portal. It has your guest QR code, your live gallery and a download-everything button:',
      portalUrl,
      '',
      'Your guest camera link (this is what the QR code opens):',
      captureUrl,
    ];
    if (d) {
      lines.push(
        '',
        'Your dates:',
        `• Guest link opens: ${formatDay(d.cameraOpens)} (two weeks early, so you can test it)`,
      );
      if (d.revealAt) lines.push(`• Gallery reveals to guests: ${formatDayTime(d.revealAt)}`);
      lines.push(
        `• Guest gallery open until: ${formatDay(d.galleryLastDay)}`,
        `• Download your originals by: ${formatDay(d.downloadBy)} (after that everything is permanently deleted)`,
      );
    }
    lines.push('', 'Please keep the portal link private. Anyone with it can manage your gallery.');
    return lines.join('\n');
  }, [event, portalUrl, captureUrl]);

  const [copied, setCopied] = useState<string | null>(null);
  async function copy(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  async function handleRotateToken() {
    if (!event) return;
    if (
      !confirm(
        'Rotate the couple’s portal link? Their current link will stop working. You’ll need to send them the new one.',
      )
    )
      return;
    // demo store path
    const local = getEventBySlug(slug);
    if (local) {
      const updated = rotateManageToken(local.id);
      if (updated) setEvent(updated);
      return;
    }
    // supabase path → go through server action so service-role + admin gate apply
    if (isSupabaseConfigured && !isDemoMode()) {
      const res = await rotateTokenAction(event.id);
      if (res.ok) {
        setEvent({ ...event, manage_token: res.manage_token });
      } else {
        alert(res.error);
      }
    }
  }

  /** Returns an error message, or null once saved. */
  async function handleSaveEvent(patch: EventPatch): Promise<string | null> {
    if (!event) return 'Event not loaded.';
    const local = getEventBySlug(slug);
    if (local) {
      const updated = updateEvent(local.id, patch);
      if (!updated) return 'Could not save the event.';
      setEvent(updated);
    } else {
      const res = await updateEventAction({ id: event.id, ...patch });
      if (!res.ok) return res.error;
      setEvent(res.event);
    }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    return null;
  }

  async function handleSetApproved(submissionId: string, approved: boolean) {
    const prev = items;
    setItems((cur) =>
      cur.map((c) => (c.id === submissionId ? { ...c, approved } : c)),
    );
    if (isSupabaseConfigured && !isDemoMode() && event && event.id !== 'demo-event') {
      const res = await adminSetSubmissionApprovedAction({
        submission_id: submissionId,
        approved,
      });
      if (!res.ok) {
        alert(res.error || 'Could not update.');
        setItems(prev);
      }
    } else {
      setSubmissionApproval(submissionId, approved);
    }
  }

  async function handleDownloadZip() {
    if (items.length === 0) return;
    setDownloading(true);
    try {
      const zipped = items.map((it, i) => {
        const ext = extensionFor(it);
        const kind = it.media_type === 'boomerang' ? 'boomerang' : it.media_type;
        const filter = safeFilenamePart(it.filter_name);
        const who = safeFilenamePart(it.guest_name);
        const name = `${String(i + 1).padStart(3, '0')}-${kind}-${filter}-${who}.${ext}`;
        return { url: it.media_url, filename: name };
      });
      const { downloadAsZip } = await import('@/lib/zip');
      await downloadAsZip(zipped, `${slug}-gallery.zip`);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-center font-serif italic text-ink/70">
        loading…
      </p>
    );
  }

  if (!event) {
    return (
      <div className="text-center max-w-md mx-auto">
        <p className="font-serif italic text-2xl">event not found</p>
        <Link href="/admin" className="mt-6 inline-flex items-center min-h-11 text-[10px] uppercase tracking-widest">
          <span className="border-b border-gold">back to events</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/admin" className="inline-flex items-center min-h-11 text-[10px] uppercase tracking-widest text-ink/70 hover:text-ink">
        <span aria-hidden>←&nbsp;</span>all events
      </Link>

      <header className="mt-4">
        <p className="text-[10px] uppercase tracking-widest text-ink/70">
          {formatWeddingDate(event.wedding_date, 'weekday-long') ?? event.wedding_date}
        </p>
        <h1 className="font-serif italic text-4xl mt-1">{event.couple_names}</h1>
        {event.welcome_message && (
          <p className="mt-3 text-ink/70 max-w-xl">{event.welcome_message}</p>
        )}
        <p className="mt-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest border border-gold text-gold-deep px-2 py-1 rounded-sm">
          {tier.label} tier · {formatPriceCAD(tier.price)} ·{' '}
          {tier.features.allowVideo ? 'photo + video' : 'photo only'} ·{' '}
          {tier.features.filters.length >= 6
            ? 'all filters'
            : `${tier.features.filters.length} filters`}
        </p>
        {event.reveal_at && tier.features.revealMode && (
          <p className="mt-3 text-[11px] text-ink/70">
            gallery reveals{' '}
            {new Date(event.reveal_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        )}
        <div className="mt-4 flex items-center gap-4">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 text-[10px] uppercase tracking-widest"
            >
              <span className="border-b border-gold pb-0.5">edit event details</span>
            </button>
          )}
          <span role="status" className="font-serif italic text-ink/70 text-sm">
            {saved ? 'saved ✦' : ''}
          </span>
        </div>
        {editing && (
          <EditEventForm event={event} onSave={handleSaveEvent} onCancel={() => setEditing(false)} />
        )}
      </header>

      <div className="mt-10 grid md:grid-cols-2 gap-10 items-start">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink/70 mb-4">
            scan to capture
          </p>
          <QRCode
            value={captureUrl}
            label={`${captureUrl.replace(/^https?:\/\//, '')}`}
            fileName={`${slug}-qr.png`}
          />
          <a
            href={`/event/${slug}/qr`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-[10px] uppercase tracking-widest text-ink/70 underline decoration-gold/60 underline-offset-4 hover:text-ink"
          >
            open print-ready 4×6 table card
          </a>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink/70">submissions</p>
          <p className="font-serif italic text-3xl mt-1">{items.length}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/event/${slug}/gallery`}
              className="inline-flex items-center min-h-11 text-[10px] uppercase tracking-widest w-fit"
            >
              <span className="border-b border-gold pb-0.5">open live gallery →</span>
            </Link>
            <button
              onClick={handleDownloadZip}
              disabled={downloading || items.length === 0}
              type="button"
              className="min-h-11 bg-ink text-cream py-3 px-5 text-xs uppercase tracking-widest disabled:opacity-50 w-fit"
            >
              {downloading ? 'zipping…' : 'download all (zip)'}
            </button>
          </div>
        </div>
      </div>

      {/* Share with couple ------------------------------------------------ */}
      <section className="mt-16 border-t border-warm-gray-light pt-10">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink/70">
              share with the couple
            </p>
            <h2 className="font-serif italic text-2xl mt-1">two links, two purposes</h2>
          </div>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 text-[10px] uppercase tracking-widest"
          >
            <span className="border-b border-gold pb-0.5">preview the couple’s view →</span>
          </a>
        </header>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* Guest capture link (public) */}
          <div className="border border-warm-gray-light p-5 rounded-sm">
            <p className="text-[10px] uppercase tracking-widest text-ink/70">
              for guests (public)
            </p>
            <p className="font-serif italic text-lg text-ink mt-1">
              what the QR code points to
            </p>
            <p className="mt-3 font-mono text-xs text-ink/70 break-all bg-cream/70 p-2 rounded-sm border border-warm-gray-light">
              {captureUrl}
            </p>
            <button
              type="button"
              onClick={() => copy('capture', captureUrl)}
              className="mt-1 min-h-11 text-[10px] uppercase tracking-widest"
            >
              <span className="border-b border-ink/40 pb-0.5">
                {copied === 'capture' ? 'copied ✦' : 'copy guest link'}
              </span>
            </button>
          </div>

          {/* Couple's portal (private) */}
          <div className="border border-gold/60 bg-gold/5 p-5 rounded-sm">
            <p className="text-[10px] uppercase tracking-widest text-gold-deep">
              for the couple (private)
            </p>
            <p className="font-serif italic text-lg text-ink mt-1">
              their own dashboard — QR, gallery, ZIP, welcome message
            </p>
            <p className="mt-3 font-mono text-xs text-ink/70 break-all bg-cream/70 p-2 rounded-sm border border-warm-gray-light">
              {portalUrl}
            </p>
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={() => copy('portal', portalUrl)}
                className="min-h-11 text-[10px] uppercase tracking-widest"
              >
                <span className="border-b border-gold pb-0.5">
                  {copied === 'portal' ? 'copied ✦' : 'copy couple link'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => copy('message', coupleMessage)}
                className="min-h-11 text-[10px] uppercase tracking-widest"
              >
                <span className="border-b border-gold pb-0.5">
                  {copied === 'message' ? 'copied ✦' : 'copy message with dates'}
                </span>
              </button>
              <button
                type="button"
                onClick={handleRotateToken}
                className="min-h-11 text-[10px] uppercase tracking-widest text-ink/70 hover:text-ink"
              >
                rotate link
              </button>
            </div>
            <p className="mt-3 text-[11px] text-ink/70 leading-relaxed">
              “Copy message with dates” gives you a ready-to-send note with both links,
              when the guest link opens, when the gallery closes and the download
              deadline. Anyone with this link can view and download, so share it carefully.
            </p>
          </div>
        </div>
      </section>

      <p role="status" className="sr-only">
        {copied ? 'link copied to clipboard' : ''}
      </p>

      <div className="mt-16">
        <p className="text-[10px] uppercase tracking-widest text-ink/70 mb-6 text-center">
          recent moments
        </p>
        <Gallery
          items={items}
          eventId={event.id}
          coupleNames={event.couple_names}
          canModerate
          onSetApproved={handleSetApproved}
          showComments={getTier(event.tier).features.comments}
        />
      </div>
    </div>
  );
}
