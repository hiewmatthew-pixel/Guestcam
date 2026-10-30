// Sort + narrow a gallery: by capture time or guest name, by guest, and
// by film look. Pure functions so the gallery and tests share them.

import type { SubmissionRow } from './supabase';
import { filterLabel } from './filters';

export type SortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
export const ANONYMOUS = '__anonymous__';
export const ALL = '__all__';

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'newest first',
  oldest: 'oldest first',
  'name-asc': 'guest name A–Z',
  'name-desc': 'guest name Z–A',
};

export type Refine = { sort: SortKey; guest: string; look: string };
export const DEFAULT_REFINE: Refine = { sort: 'newest', guest: ALL, look: ALL };

/** Grouping key for a guest: names typed with different case or spacing are one guest. */
export function guestKey(name: string | null | undefined): string {
  const n = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return n || ANONYMOUS;
}

const time = (it: SubmissionRow) => Date.parse(it.created_at) || 0;

/** Guests in A–Z order with how many captures each sent (anonymous last). */
export function guestOptions(items: SubmissionRow[]): { key: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const it of items) {
    const key = guestKey(it.guest_name);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { label: key === ANONYMOUS ? 'anonymous' : (it.guest_name ?? '').trim(), count: 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) =>
      a.key === ANONYMOUS ? 1 : b.key === ANONYMOUS ? -1 : a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );
}

/** Film looks used at this event (voice notes and "normal" have none). */
export function lookOptions(items: SubmissionRow[]): { key: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const it of items) {
    const label = filterLabel(it.filter_name);
    if (!label) continue;
    const cur = map.get(it.filter_name);
    if (cur) cur.count++;
    else map.set(it.filter_name, { label, count: 1 });
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.label.localeCompare(b.label));
}

export function refineItems(items: SubmissionRow[], r: Refine): SubmissionRow[] {
  let out = items;
  if (r.guest !== ALL) out = out.filter((it) => guestKey(it.guest_name) === r.guest);
  if (r.look !== ALL) out = out.filter((it) => it.filter_name === r.look);
  const byNewest = (a: SubmissionRow, b: SubmissionRow) => time(b) - time(a);
  const sorted = [...out];
  if (r.sort === 'newest') sorted.sort(byNewest);
  else if (r.sort === 'oldest') sorted.sort((a, b) => time(a) - time(b));
  else {
    const dir = r.sort === 'name-asc' ? 1 : -1;
    sorted.sort((a, b) => {
      const ka = guestKey(a.guest_name);
      const kb = guestKey(b.guest_name);
      // anonymous captures always sit at the end, newest first
      if (ka === ANONYMOUS || kb === ANONYMOUS) {
        if (ka === kb) return byNewest(a, b);
        return ka === ANONYMOUS ? 1 : -1;
      }
      return dir * ka.localeCompare(kb) || byNewest(a, b);
    });
  }
  return sorted;
}

export const isRefined = (r: Refine) => r.sort !== 'newest' || r.guest !== ALL || r.look !== ALL;
