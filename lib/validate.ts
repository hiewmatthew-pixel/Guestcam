// Server-side input validation + sanitation. Everything that goes into
// the database or filesystem path goes through here.

export const LIMITS = {
  COUPLE_NAMES: 100,
  WELCOME_MESSAGE: 500,
  GUEST_NAME: 80,
  SLUG: 80,
  TOKEN: 60,
} as const;

export class ValidationError extends Error {}

/** Trim + collapse whitespace + strip control characters. */
export function cleanString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Constant-time string equality. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // still walk one side to keep timing closer to constant
    let _ = 0;
    for (let i = 0; i < a.length; i++) _ |= a.charCodeAt(i);
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Slugify couple names + year into a stable, safe URL slug. */
export function toSlug(s: string, year: string): string {
  const base = s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base}-${year}`;
}

/** Filename-safe version of a string for ZIP entries (no path traversal). */
export function safeFilenamePart(s: string | null | undefined): string {
  if (!s) return 'guest';
  return s
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'guest';
}

/** Defense-in-depth: sleep to slow down brute-force loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
