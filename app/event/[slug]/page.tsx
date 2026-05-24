'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import FilteredCamera from '@/components/FilteredCamera';
import FilterSelector from '@/components/FilterSelector';
import CaptureButton from '@/components/CaptureButton';
import { FILTERS, FilterId } from '@/lib/filters';
import { addSubmission, getEventBySlug, isDemoMode, setDemoMode } from '@/lib/demo-store';
import { getSupabase, isSupabaseConfigured, type EventRow } from '@/lib/supabase';
import { getTier } from '@/lib/tiers';

type Stage = 'welcome' | 'capture' | 'review';

export default function EventCapturePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('welcome');
  const [guestName, setGuestName] = useState('');
  const [filter, setFilter] = useState<FilterId>('portra-400');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingType, setPendingType] = useState<'photo' | 'video'>('photo');
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);
  const [demo, setDemo] = useState<boolean>(true);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true);
    }
  }, []);

  // demo flag init
  useEffect(() => {
    const d = !isSupabaseConfigured || isDemoMode();
    setDemo(d);
  }, []);

  // load event (demo store first, then Supabase)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // demo special-case: /event/demo always works
      if (slug === 'demo') {
        const demoEvent: EventRow = {
          id: 'demo-event',
          slug: 'demo',
          couple_names: 'Sarah & James',
          wedding_date: new Date().toISOString().slice(0, 10),
          welcome_message: null,
          tier: 'signature',
          created_at: new Date().toISOString(),
        };
        if (!cancelled) {
          setEvent(demoEvent);
          setLoading(false);
        }
        return;
      }

      const local = getEventBySlug(slug);
      if (local) {
        if (!cancelled) {
          setEvent(local);
          setLoading(false);
        }
        return;
      }
      if (isSupabaseConfigured && !isDemoMode()) {
        const sb = getSupabase();
        const { data } = await sb!.from('events').select('*').eq('slug', slug).maybeSingle();
        if (!cancelled) {
          setEvent((data as EventRow) ?? null);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // clean up preview URL when leaving review
  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

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

  // keep filter/mode within the tier's allowed feature set
  useEffect(() => {
    if (!event) return;
    if (!tier.features.filters.includes(filter)) {
      setFilter(tier.features.filters[0]);
    }
    if (mode === 'video' && !tier.features.allowVideo) {
      setMode('photo');
      setRecording(false);
    }
  }, [event, tier, filter, mode]);

  function onCaptureTap() {
    if (mode === 'photo') {
      const fn = (window as any).__ggcCapturePhoto;
      if (typeof fn === 'function') fn();
    } else {
      setRecording((r) => !r);
    }
  }

  function handlePhoto(blob: Blob) {
    const url = URL.createObjectURL(blob);
    setPendingBlob(blob);
    setPendingType('photo');
    setPendingUrl(url);
    setStage('review');
  }

  function handleVideo(blob: Blob) {
    const url = URL.createObjectURL(blob);
    setPendingBlob(blob);
    setPendingType('video');
    setPendingUrl(url);
    setRecording(false);
    setStage('review');
  }

  async function submitPending() {
    if (!pendingBlob || !event) return;
    setSubmitting(true);
    try {
      const useSupabase = isSupabaseConfigured && !demo && event.id !== 'demo-event';
      if (useSupabase) {
        const sb = getSupabase()!;
        const ext = pendingType === 'photo' ? 'jpg' : 'webm';
        const path = `${event.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await sb.storage.from('submissions').upload(path, pendingBlob, {
          contentType: pendingBlob.type || (pendingType === 'photo' ? 'image/jpeg' : 'video/webm'),
          upsert: false,
        });
        if (up.error) throw up.error;
        const { data: pub } = sb.storage.from('submissions').getPublicUrl(path);
        const insert = await sb.from('submissions').insert({
          event_id: event.id,
          media_url: pub.publicUrl,
          media_type: pendingType,
          filter_name: filter,
          guest_name: guestName.trim() || null,
          approved: true,
        });
        if (insert.error) throw insert.error;
      } else {
        await addSubmission({
          event_id: event.id,
          blob: pendingBlob,
          media_type: pendingType,
          filter_name: filter,
          guest_name: guestName.trim() || null,
        });
      }
      setSubmittedOk(true);
      setPendingBlob(null);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingUrl(null);
      setTimeout(() => {
        setSubmittedOk(false);
        setStage('capture');
      }, 1800);
    } catch (e: any) {
      alert(e?.message || 'Could not save your capture. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setPendingBlob(null);
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingUrl(null);
    setStage('capture');
  }

  // --- render ----------------------------------------------------

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="font-serif italic text-ink/60">loading…</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif italic text-3xl">event not found</h1>
          <p className="mt-3 text-ink/60">
            Double-check the link or QR code from your hosts.
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

  // Welcome
  if (stage === 'welcome') {
    return (
      <main className="min-h-screen flex flex-col">
        <header className="px-6 pt-8 flex items-center gap-3">
          <Logo className="h-5 w-8 text-ink" />
          <span className="text-[11px] tracking-widest uppercase text-ink/60">
            Guest Cam
          </span>
          {slug === 'demo' && (
            <span className="ml-auto text-[10px] uppercase tracking-widest text-gold">
              demo mode
            </span>
          )}
        </header>

        <section className="flex-1 grid place-items-center px-6 py-12">
          <div className="max-w-md w-full text-center animate-fade-up">
            <p className="text-[11px] tracking-widest uppercase text-ink/50">
              {dateLabel}
            </p>
            <h1 className="mt-4 font-serif italic text-4xl sm:text-5xl leading-tight">
              {event.couple_names}
            </h1>
            <p className="mt-6 font-serif text-xl text-ink/70 italic">
              invited you to capture their day
            </p>
            {event.welcome_message && (
              <p className="mt-6 text-ink/60 leading-relaxed">
                {event.welcome_message}
              </p>
            )}

            <div className="mt-10 text-left">
              <label className="block text-[10px] uppercase tracking-widest text-ink/60 mb-2">
                your name <span className="text-ink/40 lowercase">(optional)</span>
              </label>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="how should we credit you?"
                className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold outline-none py-2 placeholder:text-ink/30"
              />
            </div>

            <p className="mt-10 text-xs text-ink/50 leading-relaxed">
              Your captures will be shared with the couple.
            </p>

            {inIframe && (
              <div className="mt-8 border border-gold/40 bg-gold/10 p-4 text-left rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-gold mb-2">
                  preview notice
                </p>
                <p className="text-xs text-ink/75 leading-relaxed">
                  Cameras are blocked inside embedded previews (StackBlitz, CodeSandbox).
                  Open this page in a new tab to use the camera.
                </p>
                <button
                  onClick={() =>
                    window.open(window.location.href, '_blank', 'noopener,noreferrer')
                  }
                  className="mt-3 text-[10px] uppercase tracking-widest border-b border-gold pb-0.5"
                >
                  open in a new tab →
                </button>
              </div>
            )}

            <button
              onClick={() => setStage('capture')}
              className="mt-8 w-full bg-ink text-cream py-4 rounded-sm text-xs uppercase tracking-widest"
            >
              open the camera
            </button>

            <div className="mt-6 flex items-center justify-center gap-4 text-[10px] uppercase tracking-widest text-ink/40">
              <Link href={`/event/${slug}/gallery`} className="hover:text-ink/70">
                see the gallery
              </Link>
              <span>·</span>
              <button
                onClick={() => {
                  const next = !demo;
                  setDemo(next);
                  setDemoMode(next);
                }}
                className="hover:text-ink/70"
              >
                demo mode: {demo ? 'on' : 'off'}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Review
  if (stage === 'review' && pendingUrl) {
    return (
      <main className="min-h-screen flex flex-col bg-ink text-cream">
        <header className="px-6 pt-6 flex items-center justify-between">
          <button
            onClick={retake}
            className="text-[10px] uppercase tracking-widest text-cream/80"
          >
            ← retake
          </button>
          <span className="text-[10px] uppercase tracking-widest text-cream/60">
            review
          </span>
          <span className="w-12" />
        </header>

        <div className="flex-1 grid place-items-center p-4">
          {pendingType === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingUrl} alt="" className="max-h-[70vh] w-auto" />
          ) : (
            <video
              src={pendingUrl}
              className="max-h-[70vh] w-auto"
              controls
              autoPlay
              playsInline
              loop
            />
          )}
        </div>

        <div className="px-6 pb-10 pt-4">
          {submittedOk ? (
            <p className="text-center font-serif italic text-2xl text-gold-soft">
              Your moment is saved ✦
            </p>
          ) : (
            <button
              onClick={submitPending}
              disabled={submitting}
              className="w-full bg-gold text-ink py-4 rounded-sm text-xs uppercase tracking-widest disabled:opacity-60"
            >
              {submitting ? 'sending…' : 'send to the couple'}
            </button>
          )}
        </div>
      </main>
    );
  }

  // Capture
  return (
    <main className="min-h-screen flex flex-col bg-ink text-cream">
      <header className="px-4 pt-3 pb-2 flex items-center justify-between">
        <button
          onClick={() => setStage('welcome')}
          className="text-[10px] uppercase tracking-widest text-cream/80"
        >
          ← exit
        </button>
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-6 text-cream" />
          <span className="text-[10px] uppercase tracking-widest text-cream/70">
            {event.couple_names}
          </span>
        </div>
        <button
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="flip camera"
          className="text-[10px] uppercase tracking-widest text-cream/80"
        >
          flip
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <FilteredCamera
          filter={filter}
          facing={facing}
          mode={mode}
          recording={recording}
          onPhotoCaptured={handlePhoto}
          onVideoCaptured={handleVideo}
          onRecorderError={(m) => alert(m)}
        />

        {/* current filter blurb */}
        <div className="absolute top-3 inset-x-0 text-center pointer-events-none">
          <p className="font-serif italic text-cream/85 text-base">
            {FILTERS.find((f) => f.id === filter)?.label}
          </p>
          <p className="text-[10px] tracking-widest uppercase text-cream/55">
            {FILTERS.find((f) => f.id === filter)?.blurb}
          </p>
        </div>
      </div>

      <div className="bg-ink/95 pb-6">
        <FilterSelector active={filter} onSelect={setFilter} allowed={tier.features.filters} />

        <div className="px-6 pt-2 flex items-center justify-between">
          {/* mode toggle (video hidden on photo-only tiers) */}
          {tier.features.allowVideo ? (
            <div className="flex gap-1 text-[10px] uppercase tracking-widest">
              <button
                onClick={() => {
                  setMode('photo');
                  setRecording(false);
                }}
                className={mode === 'photo' ? 'text-gold' : 'text-cream/60'}
              >
                photo
              </button>
              <span className="text-cream/30">/</span>
              <button
                onClick={() => setMode('video')}
                className={mode === 'video' ? 'text-gold' : 'text-cream/60'}
              >
                video
              </button>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-cream/40">
              photo
            </span>
          )}

          <CaptureButton
            mode={mode}
            recording={recording}
            maxSeconds={15}
            onTap={onCaptureTap}
          />

          <Link
            href={`/event/${slug}/gallery`}
            className="text-[10px] uppercase tracking-widest text-cream/60"
          >
            gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
