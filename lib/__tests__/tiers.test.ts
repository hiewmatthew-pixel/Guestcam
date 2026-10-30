import { describe, it, expect } from 'vitest';
import { getTier, galleryExpiresAt, isGalleryExpired, mediaDeletesAt, eventKeyDates, TIER_LIST, TIERS } from '../tiers';

describe('getTier', () => {
  it('returns the matching tier', () => {
    expect(getTier('glimpse').id).toBe('glimpse');
    expect(getTier('studio').id).toBe('studio');
  });
  it('falls back to the default for unknown/empty', () => {
    expect(getTier('nope').id).toBe('signature');
    expect(getTier(null).id).toBe('signature');
    expect(getTier(undefined).id).toBe('signature');
  });
});

describe('gallery expiry', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('is open the day after a wedding on a 30-day tier', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ev = { tier: 'signature', wedding_date: iso(yesterday) };
    expect(isGalleryExpired(ev)).toBe(false);
  });

  it('is closed well past a 7-day Glimpse window', () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    const ev = { tier: 'glimpse', wedding_date: iso(old) };
    expect(isGalleryExpired(ev)).toBe(true);
  });

  it('stays open within the 365-day Studio window', () => {
    const months = new Date();
    months.setDate(months.getDate() - 100);
    const ev = { tier: 'studio', wedding_date: iso(months) };
    expect(isGalleryExpired(ev)).toBe(false);
  });

  it('treats an unparseable date as not-expired (fail open for display)', () => {
    const ev = { tier: 'glimpse', wedding_date: 'not-a-date' };
    expect(galleryExpiresAt(ev)).toBeNull();
    expect(isGalleryExpired(ev)).toBe(false);
  });

  it('expiry honours the tier galleryDays', () => {
    const wedding = '2026-01-01';
    const glimpse = galleryExpiresAt({ tier: 'glimpse', wedding_date: wedding })!;
    const studio = galleryExpiresAt({ tier: 'studio', wedding_date: wedding })!;
    expect(studio.getTime()).toBeGreaterThan(glimpse.getTime());
    // glimpse closes ~8 days out (7 + 1), studio ~366
    const dayMs = 24 * 60 * 60 * 1000;
    const glimpseDays = (glimpse.getTime() - new Date(wedding).getTime()) / dayMs;
    expect(Math.round(glimpseDays)).toBe(TIERS.glimpse.features.galleryDays + 1);
  });
});

describe('mediaDeletesAt', () => {
  it('deletes after each tier’s retention, always after the gallery closes', () => {
    expect(mediaDeletesAt({ tier: 'glimpse', wedding_date: '2026-06-20' })?.toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(mediaDeletesAt({ tier: 'signature', wedding_date: '2026-06-20' })?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(mediaDeletesAt({ tier: 'studio', wedding_date: '2026-06-20' })?.toISOString()).toBe('2027-07-20T00:00:00.000Z');
    for (const t of TIER_LIST) expect(t.features.retentionDays).toBeGreaterThan(t.features.galleryDays + 14);
  });
  it('returns null for a bad date', () => {
    expect(mediaDeletesAt({ tier: 'glimpse', wedding_date: 'nope' })).toBeNull();
  });
});

describe('eventKeyDates', () => {
  it('gives the couple-facing calendar days', () => {
    const d = eventKeyDates({ tier: 'glimpse', wedding_date: '2026-06-20' })!;
    const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
    expect(ymd(d.cameraOpens)).toBe('2026-6-6');
    expect(ymd(d.galleryLastDay)).toBe('2026-6-27');
    expect(ymd(d.downloadBy)).toBe('2026-8-18');
    expect(d.revealAt).toBeNull();
  });
  it('only reports a reveal time on tiers that have it', () => {
    expect(eventKeyDates({ tier: 'glimpse', wedding_date: '2026-06-20', reveal_at: '2026-06-21T14:00:00Z' })!.revealAt).toBeNull();
    expect(eventKeyDates({ tier: 'studio', wedding_date: '2026-06-20', reveal_at: '2026-06-21T14:00:00Z' })!.revealAt).not.toBeNull();
  });
});
