import type { FilterId } from './filters';
import { parseWeddingDate } from './dates';

export type TierId = 'glimpse' | 'signature' | 'studio';
export type StickerSetId = 'essential' | 'full' | 'full-with-custom';

export type TierFeatures = {
  filters: FilterId[];
  allowVideo: boolean;
  allowBoomerang: boolean;
  stickerSet: StickerSetId | null;
  customCoupleOverlay: boolean;
  // disposable-camera-style: hide the guest gallery until the couple's
  // chosen reveal time (the couple's portal still always shows the
  // gallery, since this is anticipation theatre, not access control).
  revealMode: boolean;
  // audio guestbook — guests can leave a voice note instead of a photo
  voiceNotes: boolean;
  // /event/[slug]/display fullscreen carousel for reception screens
  liveSlideshow: boolean;
  // per-photo comments in the gallery lightbox
  comments: boolean;
  // photobooth mode — capture a sequence of stills composited into a
  // framed strip/film-strip/polaroid collage for the couple
  photobooth: boolean;
  // moderation queue — couple opts in to approve every capture before
  // it appears in the gallery (auto_approve defaults to false on
  // event create, the toggle still lives in the portal regardless)
  moderationQueue: boolean;
  galleryDays: number;
  // days after the wedding when every photo, video, voice note and
  // comment is permanently deleted (storage AND the off-site backup).
  // Always longer than galleryDays so the couple has time to download
  // their ZIP after guests lose access. Mirrored in supabase/schema.sql.
  retentionDays: number;
  customBranding: boolean;
  prioritySupport: boolean;
};

export type TierDef = {
  id: TierId;
  label: string;
  italic: string;            // small italic descriptor under the name
  price: number;             // CAD
  blurb: string;             // one-line positioning
  bullets: string[];         // feature list for the pricing card
  features: TierFeatures;
};

const ALL_FILTERS: FilterId[] = [
  'none',
  'portra-400',
  'cinestill-800t',
  'kodak-gold-200',
  'ilford-hp5',
  'fuji-pro-400h',
];

export const TIERS: Record<TierId, TierDef> = {
  glimpse: {
    id: 'glimpse',
    label: 'Glimpse',
    italic: 'a small, warm offering',
    price: 69,
    blurb: 'For intimate gatherings — photos only, kept simple.',
    bullets: [
      'Photos only',
      'Two warm filters (Portra · Kodak Gold)',
      'Four essential stickers + free emoji',
      'Photobooth strips — classic · film · polaroid',
      'Per-photo comments from guests',
      'Guests save their captures to their phone',
      'Printable 4×6 QR table card',
      'Live shared gallery for 7 days',
      'Originals kept 60 days for you to download',
      'Download all as a single ZIP',
      'Unlimited guests',
    ],
    features: {
      filters: ['none', 'portra-400', 'kodak-gold-200'],
      allowVideo: false,
      allowBoomerang: false,
      stickerSet: 'essential',
      customCoupleOverlay: false,
      revealMode: false,
      voiceNotes: false,
      liveSlideshow: false,
      comments: true,
      photobooth: true,
      moderationQueue: false,
      galleryDays: 7,
      retentionDays: 60,
      customBranding: false,
      prioritySupport: false,
    },
  },
  signature: {
    id: 'signature',
    label: 'Signature',
    italic: 'most couples choose this',
    price: 169,
    blurb: 'The full evening — every filter, sound, voice notes and a slideshow for the room.',
    bullets: [
      'Everything in Glimpse',
      '15-second films with sound',
      'Eight-second boomerangs (looping)',
      'All five film filters',
      'Full sticker library',
      'Voice notes — an audio guestbook for shy guests',
      'Live slideshow for a TV or projector at the reception',
      'Optional "developing overnight" reveal — gallery unlocks at a time you choose',
      'Custom welcome message for guests',
      'Live shared gallery for 30 days',
      'Originals kept 90 days for you to download',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
      allowBoomerang: true,
      stickerSet: 'full',
      customCoupleOverlay: false,
      revealMode: true,
      voiceNotes: true,
      liveSlideshow: true,
      comments: true,
      photobooth: true,
      moderationQueue: false,
      galleryDays: 30,
      retentionDays: 90,
      customBranding: false,
      prioritySupport: false,
    },
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    italic: 'a keepsake, held longer',
    price: 299,
    blurb: 'For larger weddings and couples who want every detail curated.',
    bullets: [
      'Everything in Signature',
      'Your names in script — burned into every photo, film & boomerang',
      'Wedding date stamp on every capture',
      'Pre-approve every capture before guests see it (moderation queue)',
      'Live shared gallery for a full year',
      'Originals kept 13 months for you to download',
      'No Golden Glance footer',
      'Priority same-day support',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
      allowBoomerang: true,
      stickerSet: 'full-with-custom',
      customCoupleOverlay: true,
      revealMode: true,
      voiceNotes: true,
      liveSlideshow: true,
      comments: true,
      photobooth: true,
      moderationQueue: true,
      galleryDays: 365,
      retentionDays: 395,
      customBranding: true,
      prioritySupport: true,
    },
  },
};

export const TIER_LIST: TierDef[] = [TIERS.glimpse, TIERS.signature, TIERS.studio];

export const DEFAULT_TIER: TierId = 'signature';

export function getTier(id: string | null | undefined): TierDef {
  if (id && id in TIERS) return TIERS[id as TierId];
  return TIERS[DEFAULT_TIER];
}

export function formatPriceCAD(n: number): string {
  return `$${n} CAD`;
}

/**
 * When the guest-facing gallery closes: wedding_date + the tier's
 * galleryDays. Returns null if the date can't be parsed (treat as open).
 * The couple's portal is intentionally NOT subject to this — they keep
 * access to their own photos.
 */
export function galleryExpiresAt(event: {
  tier: string;
  wedding_date: string;
}): Date | null {
  // wedding_date is a calendar day — parse it as local, not UTC midnight
  const base = parseWeddingDate(event.wedding_date);
  if (!base) return null;
  const days = getTier(event.tier).features.galleryDays;
  // expire at the END of the last day (local start-of-wedding-day + days + 1)
  const expires = new Date(base);
  expires.setHours(0, 0, 0, 0);
  expires.setDate(expires.getDate() + days + 1);
  return expires;
}

export function isGalleryExpired(event: {
  tier: string;
  wedding_date: string;
}): boolean {
  const expires = galleryExpiresAt(event);
  return expires ? Date.now() > expires.getTime() : false;
}

/**
 * When everything captured at this event is permanently deleted:
 * wedding_date + the tier's retentionDays (start of that day, UTC, the
 * same moment the daily lifecycle job uses). Null if the date can't be
 * parsed.
 */
export function mediaDeletesAt(event: { tier: string; wedding_date: string }): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.wedding_date);
  if (!m) return null;
  const days = getTier(event.tier).features.retentionDays;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
}

export type EventKeyDates = {
  cameraOpens: Date; // guest link starts accepting captures
  revealAt: Date | null; // guest gallery unlocks (reveal tiers only)
  galleryLastDay: Date; // last full day guests can view the gallery
  downloadBy: Date; // last day before originals are permanently deleted
};

/**
 * The dates a couple needs, as local calendar days. Mirrors the server:
 * captures from two weeks before the wedding (lib/guest-writes.ts), the
 * guest gallery through wedding + galleryDays (galleryExpiresAt), and
 * deletion at wedding + retentionDays (mediaDeletesAt).
 */
export function eventKeyDates(event: {
  tier: string;
  wedding_date: string;
  reveal_at?: string | null;
}): EventKeyDates | null {
  const wedding = parseWeddingDate(event.wedding_date);
  const expires = galleryExpiresAt(event);
  const deletes = mediaDeletesAt(event);
  if (!wedding || !expires || !deletes) return null;
  const day = (base: Date, offset: number) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + offset);
    return d;
  };
  const reveal = event.reveal_at && getTier(event.tier).features.revealMode ? new Date(event.reveal_at) : null;
  return {
    cameraOpens: day(wedding, -14),
    revealAt: reveal && !Number.isNaN(reveal.getTime()) ? reveal : null,
    galleryLastDay: day(expires, -1),
    // deletes is midnight UTC; the day before is safe in every Canadian zone
    downloadBy: day(new Date(deletes.getUTCFullYear(), deletes.getUTCMonth(), deletes.getUTCDate()), -1),
  };
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatDayTime(d: Date): string {
  return d.toLocaleString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
