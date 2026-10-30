'use client';

// Inline editor for an existing event: names, date, package, reveal time
// and welcome note. The guest link (slug) and couple's portal link never
// change, so printed QR cards keep working. Shows what the new date and
// package mean before saving.

import { useMemo, useState } from 'react';
import type { EventRow } from '@/lib/supabase';
import { TIER_LIST, formatPriceCAD, galleryExpiresAt, getTier, mediaDeletesAt, type TierId } from '@/lib/tiers';
import { formatWeddingDate, parseWeddingDate } from '@/lib/dates';
import { LIMITS } from '@/lib/validate';

const field = 'w-full bg-transparent border-b border-warm-gray-light focus:border-gold-deep py-2';
const label = 'block text-[10px] uppercase tracking-widest text-ink/70 mb-2';

/** ISO timestamp -> value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayLabel(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export type EventPatch = {
  couple_names: string;
  wedding_date: string;
  welcome_message: string | null;
  tier: TierId;
  reveal_at: string | null;
};

export default function EditEventForm({
  event,
  onSave,
  onCancel,
}: {
  event: EventRow;
  onSave: (patch: EventPatch) => Promise<string | null>; // error message or null
  onCancel: () => void;
}) {
  const [coupleNames, setCoupleNames] = useState(event.couple_names);
  const [weddingDate, setWeddingDate] = useState(event.wedding_date);
  const [welcome, setWelcome] = useState(event.welcome_message ?? '');
  const [tier, setTier] = useState<TierId>(getTier(event.tier).id);
  const [revealAt, setRevealAt] = useState(toLocalInput(event.reveal_at));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const t = getTier(tier);
  const dateOk = !!parseWeddingDate(weddingDate);
  const dateChanged = weddingDate !== event.wedding_date;
  const tierChanged = tier !== getTier(event.tier).id;

  const preview = useMemo(() => {
    if (!dateOk) return null;
    const opens = parseWeddingDate(weddingDate)!;
    opens.setDate(opens.getDate() - 14);
    return {
      opens,
      closes: galleryExpiresAt({ tier, wedding_date: weddingDate }),
      deletes: mediaDeletesAt({ tier, wedding_date: weddingDate }),
    };
  }, [tier, weddingDate, dateOk]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!coupleNames.trim()) return setErr('Couple names are required.');
    if (!dateOk) return setErr('Choose a valid wedding date.');
    if (
      preview?.deletes &&
      preview.deletes.getTime() < Date.now() &&
      !confirm(
        'With this date and package the deletion date is already in the past, so tonight’s cleanup will permanently delete every capture for this event. Save anyway?',
      )
    ) {
      return;
    }
    setBusy(true);
    const error = await onSave({
      couple_names: coupleNames.trim(),
      wedding_date: weddingDate,
      welcome_message: welcome.trim() || null,
      tier,
      reveal_at: t.features.revealMode && revealAt ? new Date(revealAt).toISOString() : null,
    });
    setBusy(false);
    if (error) setErr(error);
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="edit-event-title"
      className="mt-6 grid gap-5 border border-gold/60 bg-gold/5 p-5 rounded-sm"
    >
      <h2 id="edit-event-title" className="font-serif italic text-2xl">
        edit event
      </h2>

      <div>
        <label htmlFor="edit-couple-names" className={label}>couple names</label>
        <input
          id="edit-couple-names"
          value={coupleNames}
          onChange={(e) => setCoupleNames(e.target.value)}
          maxLength={LIMITS.COUPLE_NAMES}
          className={field}
          required
        />
      </div>

      <div>
        <label htmlFor="edit-wedding-date" className={label}>wedding date</label>
        <input
          id="edit-wedding-date"
          type="date"
          value={weddingDate}
          onChange={(e) => setWeddingDate(e.target.value)}
          className={field}
          required
        />
      </div>

      <div>
        <p id="edit-tier-label" className={label}>package</p>
        <div role="group" aria-labelledby="edit-tier-label" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIER_LIST.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTier(x.id)}
              aria-pressed={tier === x.id}
              className={[
                'text-left rounded-sm border p-3 min-h-11 transition-colors',
                tier === x.id ? 'border-gold bg-gold/10' : 'border-warm-gray-light hover:border-ink/30',
              ].join(' ')}
            >
              <span className="block font-serif text-lg text-ink leading-none">{x.label}</span>
              <span className="block font-serif italic text-sm text-ink/70 mt-1">{formatPriceCAD(x.price)}</span>
            </button>
          ))}
        </div>
      </div>

      {t.features.revealMode && (
        <div>
          <label htmlFor="edit-reveal-at" className={label}>
            reveal at <span className="lowercase">(optional · leave empty for no countdown)</span>
          </label>
          <div className="flex items-end gap-3">
            <input
              id="edit-reveal-at"
              type="datetime-local"
              value={revealAt}
              onChange={(e) => setRevealAt(e.target.value)}
              className={field}
            />
            {revealAt && (
              <button
                type="button"
                onClick={() => setRevealAt('')}
                className="min-h-11 shrink-0 text-[10px] uppercase tracking-widest text-ink/70 hover:text-ink"
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="edit-welcome" className={label}>
          welcome message <span className="lowercase">(optional)</span>
        </label>
        <textarea
          id="edit-welcome"
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
          maxLength={LIMITS.WELCOME_MESSAGE}
          rows={3}
          className={`${field} resize-none`}
        />
      </div>

      {preview && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3 text-sm border-t border-warm-gray-light pt-4">
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-ink/70">camera opens</dt>
            <dd className="mt-1">{dayLabel(preview.opens)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-ink/70">guest gallery closes</dt>
            <dd className="mt-1">{dayLabel(preview.closes)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-ink/70">everything deleted</dt>
            <dd className="mt-1">{dayLabel(preview.deletes)}</dd>
          </div>
        </dl>
      )}

      {(dateChanged || tierChanged) && (
        <p className="text-[11px] text-ink/70 leading-relaxed">
          The guest link, QR cards and couple’s portal link stay the same.
          {dateChanged && ` Guests will see ${formatWeddingDate(weddingDate, 'long') ?? weddingDate}.`}
          {tierChanged && ` Features switch to ${t.label} straight away.`}
        </p>
      )}

      {err && (
        <p role="alert" className="text-sm text-red-700">
          {err}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 bg-ink text-cream py-3 px-5 text-xs uppercase tracking-widest disabled:opacity-50"
        >
          {busy ? 'saving…' : 'save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 text-[10px] uppercase tracking-widest text-ink/70 hover:text-ink"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
