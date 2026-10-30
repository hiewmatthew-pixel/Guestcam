// "Your dates" panel for the couple's portal (and the studio's admin view):
// when the guest link opens, when the gallery reveals and closes, and the
// last day to download originals. Past dates are marked as such.

import { eventKeyDates, formatDay, formatDayTime } from '@/lib/tiers';

type Ev = { tier: string; wedding_date: string; reveal_at?: string | null };

export default function KeyDates({ event, className = '' }: { event: Ev; className?: string }) {
  const d = eventKeyDates(event);
  if (!d) return null;
  const now = Date.now();
  const endOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1).getTime();

  const rows: { label: string; value: string; note: string; past: boolean }[] = [
    {
      label: 'guest link opens',
      value: formatDay(d.cameraOpens),
      note: 'Two weeks early, so you can test the camera and print your cards.',
      past: d.cameraOpens.getTime() <= now,
    },
  ];
  if (d.revealAt) {
    rows.push({
      label: 'gallery reveals',
      value: formatDayTime(d.revealAt),
      note: 'Guests see a countdown until then. You can see everything here any time.',
      past: d.revealAt.getTime() <= now,
    });
  }
  rows.push(
    {
      label: 'guest gallery open until',
      value: formatDay(d.galleryLastDay),
      note: 'After this day guests can no longer view or send captures. Your portal stays open.',
      past: endOf(d.galleryLastDay) <= now,
    },
    {
      label: 'download your originals by',
      value: formatDay(d.downloadBy),
      note: 'After this day every photo, film and voice note is permanently deleted.',
      past: endOf(d.downloadBy) <= now,
    },
  );

  return (
    <section aria-labelledby="key-dates-title" className={className}>
      <h2 id="key-dates-title" className="text-[10px] uppercase tracking-widest text-ink/70">
        your dates
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="border-l-2 border-gold/70 pl-4">
            <dt className="text-[10px] uppercase tracking-widest text-ink/70">
              {r.label}
              {r.past && <span className="ml-2 normal-case tracking-normal italic">(passed)</span>}
            </dt>
            <dd className={`mt-1 font-serif text-xl ${r.past ? 'text-ink/60' : 'text-ink'}`}>{r.value}</dd>
            <dd className="mt-1 text-[11px] leading-relaxed text-ink/70">{r.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
