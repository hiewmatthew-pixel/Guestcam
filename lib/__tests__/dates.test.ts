// Run under America/Toronto: a UTC-midnight parse of '2026-06-20' lands
// on June 19 there, which is exactly the bug these helpers exist to stop.
// TZ must be set before the first Date is constructed in this worker.
process.env.TZ = 'America/Toronto';

import { describe, it, expect } from 'vitest';
import { formatWeddingDate, parseWeddingDate, todayYmd } from '../dates';
import { formatOverlayDate } from '../overlay';
import { galleryExpiresAt, TIERS } from '../tiers';

describe('timezone precondition', () => {
  it('is running west of UTC (the naive parse really is off by one)', () => {
    expect(new Date('2026-06-20').getTimezoneOffset()).toBeGreaterThan(0);
    expect(new Date('2026-06-20').getDate()).toBe(19);
  });
});

describe('parseWeddingDate', () => {
  it('keeps the calendar day in a negative-offset timezone', () => {
    const d = parseWeddingDate('2026-06-20')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(12);
  });

  it('handles Jan 1 / Dec 31 and DST-change days', () => {
    expect(parseWeddingDate('2027-01-01')!.getDate()).toBe(1);
    expect(parseWeddingDate('2026-12-31')!.getDate()).toBe(31);
    // Toronto springs forward 2026-03-08, falls back 2026-11-01
    expect(parseWeddingDate('2026-03-08')!.getDate()).toBe(8);
    expect(parseWeddingDate('2026-11-01')!.getDate()).toBe(1);
  });

  it('uses only the date part of a full ISO timestamp', () => {
    expect(parseWeddingDate('2026-06-20T00:00:00Z')!.getDate()).toBe(20);
  });

  it('rejects junk and impossible dates', () => {
    expect(parseWeddingDate('')).toBeNull();
    expect(parseWeddingDate(undefined)).toBeNull();
    expect(parseWeddingDate(null)).toBeNull();
    expect(parseWeddingDate('not-a-date')).toBeNull();
    expect(parseWeddingDate('2026-02-31')).toBeNull();
    expect(parseWeddingDate('2026-13-01')).toBeNull();
    expect(parseWeddingDate('06/20/2026')).toBeNull();
  });
});

describe('formatWeddingDate', () => {
  it('dot styles', () => {
    expect(formatWeddingDate('2026-06-20', 'dots')).toBe('06 · 20 · 2026');
    expect(formatWeddingDate('2026-06-20', 'dots-short')).toBe('06 · 20 · 26');
    expect(formatWeddingDate('2030-01-05', 'dots-short')).toBe('01 · 05 · 30');
  });

  it('long styles', () => {
    expect(formatWeddingDate('2026-06-20', 'long', 'en-US')).toBe('June 20, 2026');
    expect(formatWeddingDate('2026-06-20', 'weekday-long', 'en-US')).toBe(
      'Saturday, June 20, 2026',
    );
  });

  it('returns null for unparseable input', () => {
    expect(formatWeddingDate('garbage', 'dots')).toBeNull();
    expect(formatWeddingDate(undefined, 'long')).toBeNull();
  });

  it('the couple overlay uses the same day', () => {
    expect(formatOverlayDate('2026-06-20')).toBe('06 · 20 · 2026');
  });
});

describe('todayYmd', () => {
  it('uses the local day, not the UTC day', () => {
    // 9pm Toronto on June 20 is already June 21 in UTC
    const lateEvening = new Date(2026, 5, 20, 21, 0, 0);
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-06-21');
    expect(todayYmd(lateEvening)).toBe('2026-06-20');
  });
});

describe('galleryExpiresAt (local calendar days)', () => {
  it('closes at local midnight after wedding_date + galleryDays', () => {
    const exp = galleryExpiresAt({ tier: 'glimpse', wedding_date: '2026-06-20' })!;
    const days = TIERS.glimpse.features.galleryDays; // 7
    // open through the whole of June 27 locally, closed from June 28 00:00
    expect(exp.getFullYear()).toBe(2026);
    expect(exp.getMonth()).toBe(5);
    expect(exp.getDate()).toBe(20 + days + 1);
    expect(exp.getHours()).toBe(0);
    expect(exp.getMinutes()).toBe(0);
  });
});
