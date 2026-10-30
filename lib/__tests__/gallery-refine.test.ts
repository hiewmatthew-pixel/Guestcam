import { describe, it, expect } from 'vitest';
import { ALL, ANONYMOUS, DEFAULT_REFINE, guestOptions, lookOptions, refineItems } from '../gallery-refine';
import type { SubmissionRow } from '../supabase';

const row = (id: string, guest: string | null, minute: number, filter = 'portra-400', type: SubmissionRow['media_type'] = 'photo'): SubmissionRow => ({
  id,
  event_id: 'e',
  media_url: `https://x/${id}.jpg`,
  media_type: type,
  filter_name: filter,
  guest_name: guest,
  approved: true,
  created_at: new Date(Date.UTC(2026, 5, 20, 20, minute)).toISOString(),
});

const items = [
  row('a', 'Zoe', 1),
  row('b', null, 2),
  row('c', 'aunt May', 3, 'kodak-gold-200'),
  row('d', ' Aunt  May ', 4),
  row('e', 'Ben', 5, 'none'),
  row('f', null, 6, 'voice', 'voice'),
];
const ids = (r: SubmissionRow[]) => r.map((x) => x.id).join('');

describe('refineItems', () => {
  it('sorts by capture time', () => {
    expect(ids(refineItems(items, DEFAULT_REFINE))).toBe('fedcba');
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, sort: 'oldest' }))).toBe('abcdef');
  });
  it('sorts by guest name, anonymous last, newest first within a guest', () => {
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, sort: 'name-asc' }))).toBe('dceafb');
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, sort: 'name-desc' }))).toBe('aedcfb');
  });
  it('filters by guest (case and spacing insensitive) and by look', () => {
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, guest: 'aunt may' }))).toBe('dc');
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, guest: ANONYMOUS }))).toBe('fb');
    expect(ids(refineItems(items, { ...DEFAULT_REFINE, look: 'kodak-gold-200' }))).toBe('c');
    expect(ids(refineItems(items, { sort: 'oldest', guest: ALL, look: 'portra-400' }))).toBe('abd');
  });
});

describe('options', () => {
  it('lists guests A–Z with counts, anonymous last', () => {
    expect(guestOptions(items).map((g) => `${g.label}:${g.count}`)).toEqual(['aunt May:2', 'Ben:1', 'Zoe:1', 'anonymous:2']);
  });
  it('lists only real film looks', () => {
    expect(lookOptions(items).map((l) => `${l.key}:${l.count}`)).toEqual(['kodak-gold-200:1', 'portra-400:3']);
  });
});
