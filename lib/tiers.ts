import type { FilterId } from './filters';

export type TierId = 'glimpse' | 'signature' | 'studio';
export type StickerSetId = 'essential' | 'full' | 'full-with-custom';

export type TierFeatures = {
  filters: FilterId[];
  allowVideo: boolean;
  allowBoomerang: boolean;
  stickerSet: StickerSetId | null;
  customCoupleOverlay: boolean;
  galleryDays: number;
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
      'Four essential stickers',
      'Live shared gallery for 7 days',
      'Download all as a single ZIP',
      'Unlimited guests',
    ],
    features: {
      filters: ['portra-400', 'kodak-gold-200'],
      allowVideo: false,
      allowBoomerang: false,
      stickerSet: 'essential',
      customCoupleOverlay: false,
      galleryDays: 7,
      customBranding: false,
      prioritySupport: false,
    },
  },
  signature: {
    id: 'signature',
    label: 'Signature',
    italic: 'most couples choose this',
    price: 169,
    blurb: 'The full evening — every filter, photos, film and boomerang.',
    bullets: [
      'Photos and 15-second films',
      'Eight-second boomerangs (looping)',
      'All five film filters',
      'Full sticker library',
      'Live shared gallery for 30 days',
      'Custom welcome message for guests',
      'Download all as a single ZIP',
      'Unlimited guests',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
      allowBoomerang: true,
      stickerSet: 'full',
      customCoupleOverlay: false,
      galleryDays: 30,
      customBranding: false,
      prioritySupport: false,
    },
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    italic: 'a keepsake, held longer',
    price: 299,
    blurb: 'For larger weddings and couples who want everything kept.',
    bullets: [
      'Everything in Signature',
      'Your names in script — burned into every photo, film & boomerang',
      'Wedding date stamp on every capture',
      'Live shared gallery for a full year',
      'No Golden Glance footer',
      'Priority same-day support',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
      allowBoomerang: true,
      stickerSet: 'full-with-custom',
      customCoupleOverlay: true,
      galleryDays: 365,
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
