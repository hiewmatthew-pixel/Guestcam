'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '@/components/Logo';
import { getEventBySlug, isDemoMode } from '@/lib/demo-store';
import {
  fetchPublicEventBySlug,
  getSupabase,
  isSupabaseConfigured,
  type EventRow,
} from '@/lib/supabase';

export default function EventQRPrintPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [event, setEvent] = useState<EventRow | null>(null);
  const [captureUrl, setCaptureUrl] = useState('');

  useEffect(() => {
    setCaptureUrl(`${window.location.origin}/event/${slug}`);

    if (slug === 'demo') {
      setEvent({
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
      });
      return;
    }
    const local = getEventBySlug(slug);
    if (local) {
      setEvent(local);
      return;
    }
    if (isSupabaseConfigured && !isDemoMode()) {
      fetchPublicEventBySlug(getSupabase()!, slug).then((ev) => {
        if (ev) setEvent(ev);
      });
    }
  }, [slug]);

  if (!event) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">loading…</p>
      </main>
    );
  }

  const date = (() => {
    try {
      return new Date(event.wedding_date).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return event.wedding_date;
    }
  })();

  return (
    <main className="min-h-screen bg-cream text-ink">
      {/* on-screen controls (hidden when printing) */}
      <header className="print:hidden px-6 py-4 flex items-center justify-between border-b border-warm-gray-light">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-6 text-ink" />
          <span className="text-[10px] uppercase tracking-widest text-ink/60">
            table card · {event.couple_names}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={`/admin/${slug}`}
            className="text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink"
          >
            back
          </a>
          <button
            onClick={() => window.print()}
            className="text-[10px] uppercase tracking-widest bg-ink text-cream px-4 py-2 rounded-full"
          >
            print this card
          </button>
        </div>
      </header>

      {/* card (centered on screen, fills page when printed) */}
      <div className="px-6 py-10 grid place-items-center print:p-0">
        <article
          className="print-card bg-cream border border-warm-gray-light rounded-md p-10 text-center max-w-md w-full"
          style={{ aspectRatio: '4 / 6' }}
        >
          <Logo className="h-5 w-8 mx-auto text-ink" />
          <p className="mt-4 text-[10px] uppercase tracking-[0.4em] text-ink/55">
            join the guest cam
          </p>
          <h1 className="mt-6 font-serif italic text-4xl leading-tight">
            {event.couple_names}
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-ink/60">
            {date}
          </p>

          <div className="mt-8 flex justify-center">
            <div className="bg-cream p-3 border border-ink/15 rounded-sm">
              <QRCodeSVG
                value={captureUrl}
                size={220}
                bgColor="#F5F1EA"
                fgColor="#1A1A1A"
                level="H"
              />
            </div>
          </div>

          <p className="mt-6 font-serif italic text-ink/75 text-lg">
            scan to capture a moment
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-ink/45 break-all">
            {captureUrl.replace(/^https?:\/\//, '')}
          </p>
        </article>
      </div>

      {/* print styles: 4x6 card centered on the page, no margins/headers */}
      <style jsx global>{`
        @media print {
          @page {
            size: 4in 6in;
            margin: 0;
          }
          html,
          body {
            background: #f5f1ea !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-card {
            width: 4in !important;
            height: 6in !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0.45in !important;
            page-break-inside: avoid;
            box-shadow: none !important;
            margin: 0 auto !important;
          }
        }
      `}</style>
    </main>
  );
}
