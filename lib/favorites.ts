// Per-device personal favourites for the gallery. Stored in localStorage
// keyed by event id, no server round-trip needed. Each viewer's hearts
// are private to their browser — not visible to anyone else.

const KEY_PREFIX = 'ggc:favs:';

function key(eventId: string) {
  return `${KEY_PREFIX}${eventId}`;
}

function read(eventId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key(eventId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function write(eventId: string, set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(eventId), JSON.stringify(Array.from(set)));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export function listFavorites(eventId: string): Set<string> {
  return read(eventId);
}

export function toggleFavorite(eventId: string, submissionId: string): boolean {
  const cur = read(eventId);
  const next = new Set(cur);
  const added = !next.has(submissionId);
  if (added) next.add(submissionId);
  else next.delete(submissionId);
  write(eventId, next);
  return added;
}

export function isFavorite(eventId: string, submissionId: string): boolean {
  return read(eventId).has(submissionId);
}
