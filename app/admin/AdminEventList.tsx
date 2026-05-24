'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  createEvent,
  deleteEvent,
  isDemoMode,
  listEvents,
  setDemoMode,
} from '@/lib/demo-store';
import {
  getSupabase,
  isSupabaseConfigured,
  type EventRow,
} from '@/lib/supabase';
import { DEFAULT_TIER, TIER_LIST, TierId, formatPriceCAD, getTier } from '@/lib/tiers';

function toSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AdminEventList() {
  const searchParams = useSearchParams();
  const initialTier = (searchParams?.get('tier') as TierId | null) ?? DEFAULT_TIER;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [demo, setDemo] = useState<boolean>(true);
  const [coupleNames, setCoupleNames] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [welcome, setWelcome] = useState('');
  const [tier, setTier] = useState<TierId>(
    TIER_LIST.some((t) => t.id === initialTier) ? initialTier : DEFAULT_TIER,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const d = !isSupabaseConfigured || isDemoMode();
    setDemo(d);
    refresh(d);
  }, []);

  async function refresh(useDemo = demo) {
    if (useDemo || !isSupabaseConfigured) {
      setEvents(listEvents());
      return;
    }
    const sb = getSupabase()!;
    const { data } = await sb.from('events').select('*').order('created_at', { ascending: false });
    setEvents((data ?? []) as EventRow[]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!coupleNames.trim() || !weddingDate) {
      setErr('Couple names and date are required.');
      return;
    }
    const slug = `${toSlug(coupleNames)}-${weddingDate.slice(0, 4)}`;
    setBusy(true);
    try {
      if (demo || !isSupabaseConfigured) {
        createEvent({
          slug,
          couple_names: coupleNames.trim(),
          wedding_date: weddingDate,
          welcome_message: welcome.trim() || null,
          tier,
        });
      } else {
        const sb = getSupabase()!;
        const { error } = await sb.from('events').insert({
          slug,
          couple_names: coupleNames.trim(),
          wedding_date: weddingDate,
          welcome_message: welcome.trim() || null,
          tier,
        });
        if (error) throw error;
      }
      setCoupleNames('');
      setWeddingDate('');
      setWelcome('');
      setTier(DEFAULT_TIER);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || 'Could not create event.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event and its submissions?')) return;
    if (demo || !isSupabaseConfigured) {
      deleteEvent(id);
    } else {
      const sb = getSupabase()!;
      await sb.from('submissions').delete().eq('event_id', id);
      await sb.from('events').delete().eq('id', id);
    }
    await refresh();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-serif italic text-3xl">events</h2>
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-ink/60">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => {
              setDemo(e.target.checked);
              setDemoMode(e.target.checked);
              refresh(e.target.checked);
            }}
          />
          demo mode
        </label>
      </div>

      <form onSubmit={handleCreate} className="mt-8 grid gap-4 border border-warm-gray-light p-5 rounded-sm">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-ink/60 mb-2">
            couple names
          </label>
          <input
            value={coupleNames}
            onChange={(e) => setCoupleNames(e.target.value)}
            placeholder="Sarah & James"
            className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold outline-none py-2"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-ink/60 mb-2">
            wedding date
          </label>
          <input
            type="date"
            value={weddingDate}
            onChange={(e) => setWeddingDate(e.target.value)}
            className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold outline-none py-2"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-ink/60 mb-2">
            welcome message <span className="text-ink/40 lowercase">(optional)</span>
          </label>
          <textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            placeholder="A short note to your guests…"
            className="w-full bg-transparent border-b border-warm-gray-light focus:border-gold outline-none py-2 resize-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-ink/60 mb-3">
            tier
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TIER_LIST.map((t) => {
              const isActive = tier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  className={[
                    'text-left rounded-sm border p-3 transition-colors',
                    isActive
                      ? 'border-gold bg-gold/10'
                      : 'border-warm-gray-light hover:border-ink/30',
                  ].join(' ')}
                  aria-pressed={isActive}
                >
                  <p className="font-serif text-lg text-ink leading-none">{t.label}</p>
                  <p className="font-serif italic text-sm text-ink/60 mt-1">
                    {formatPriceCAD(t.price)}
                  </p>
                  <p className="text-[10px] text-ink/55 mt-2 leading-snug">
                    {t.features.allowVideo ? 'photo + video' : 'photo only'} ·{' '}
                    {t.features.filters.length === 5
                      ? 'all filters'
                      : `${t.features.filters.length} filters`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button
          disabled={busy}
          className="bg-ink text-cream py-3 text-xs uppercase tracking-widest disabled:opacity-60"
        >
          {busy ? 'creating…' : 'create event'}
        </button>
      </form>

      <ul className="mt-10 divide-y divide-warm-gray-light">
        {events.length === 0 && (
          <li className="py-10 text-center text-ink/50 italic font-serif">
            no events yet
          </li>
        )}
        {events.map((ev) => {
          const t = getTier(ev.tier);
          return (
            <li key={ev.id} className="py-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-serif italic text-xl">{ev.couple_names}</p>
                <p className="text-[11px] uppercase tracking-widest text-ink/50">
                  {ev.wedding_date} · /{ev.slug}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-widest border border-warm-gray-light text-ink/60 px-2 py-1 rounded-sm">
                {t.label}
              </span>
              <Link
                href={`/admin/${ev.slug}`}
                className="text-[10px] uppercase tracking-widest border-b border-gold pb-0.5"
              >
                open
              </Link>
              <button
                onClick={() => handleDelete(ev.id)}
                className="text-[10px] uppercase tracking-widest text-ink/50"
              >
                delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
