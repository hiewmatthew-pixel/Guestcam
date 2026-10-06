// Wedding dates are stored as calendar days ("YYYY-MM-DD"), not instants.
// `new Date('2026-06-20')` parses that as UTC midnight, which renders as
// June 19 anywhere west of Greenwich (e.g. America/Toronto). Always go
// through these helpers for a date-only value so the day the couple
// typed is the day every guest sees.

const YMD = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * Parse a "YYYY-MM-DD" wedding date as a LOCAL calendar day (noon local,
 * so DST shifts and small tz offsets can never roll it to a neighbour
 * day). Accepts a full ISO timestamp too, but only its date part is used.
 * Returns null for anything that isn't a real calendar date.
 */
export function parseWeddingDate(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  // reject rollovers like 2026-02-31 -> March 3
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export type WeddingDateStyle =
  /** "06 · 20 · 2026" — couple overlay burned into captures */
  | 'dots'
  /** "06 · 20 · 26" — photobooth frames, date-stamp sticker */
  | 'dots-short'
  /** "June 20, 2026" (locale-aware) — QR card, portal header */
  | 'long'
  /** "Saturday, June 20, 2026" (locale-aware) */
  | 'weekday-long';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Format a "YYYY-MM-DD" wedding date. Returns null when unparseable so
 * callers can decide whether to hide the line or fall back to the raw
 * string. `locale` only affects the 'long' styles (dot styles are always
 * MM · DD · YY to match the printed brand).
 */
export function formatWeddingDate(
  ymd: string | null | undefined,
  style: WeddingDateStyle = 'long',
  locale?: string,
): string | null {
  const d = parseWeddingDate(ymd);
  if (!d) return null;
  switch (style) {
    case 'dots':
      return `${pad2(d.getMonth() + 1)} · ${pad2(d.getDate())} · ${d.getFullYear()}`;
    case 'dots-short':
      return `${pad2(d.getMonth() + 1)} · ${pad2(d.getDate())} · ${pad2(d.getFullYear() % 100)}`;
    case 'weekday-long':
      return d.toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    case 'long':
    default:
      return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  }
}

/** Today's LOCAL calendar day as "YYYY-MM-DD" (unlike toISOString, which is UTC). */
export function todayYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
