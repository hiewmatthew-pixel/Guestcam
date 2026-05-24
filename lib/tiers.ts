import type { FilterId } from './filters';

export type TierId = 'glimpse' | 'signature' | 'studio';

export type TierFeatures = {
  filters: FilterId[];
  allowVideo: boolean;
  galleryDays: number;       // display copy; expiration is not enforced yet
  customBranding: boolean;   // hides "powered by Golden Glance" footer
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
    price: 59,
    blurb: 'For intimate gatherings — photos only, kept simple.',
    bullets: [
      'Photos only',
      'Two warm filters (Portra · Kodak Gold)',
      'Live shared gallery for 7 days',
      'Download all as a single ZIP',
      'Unlimited guests',
    ],
    features: {
      filters: ['portra-400', 'kodak-gold-200'],
      allowVideo: false,
      galleryDays: 7,
      customBranding: false,
      prioritySupport: false,
    },
  },
  signature: {
    id: 'signature',
    label: 'Signature',
    italic: 'most couples choose this',
    price: 149,
    blurb: 'The full evening — every filter, photos and short film.',
    bullets: [
      'Photos and 15-second films',
      'All five film filters',
      'Live shared gallery for 30 days',
      'Custom welcome message for guests',
      'Download all as a single ZIP',
      'Unlimited guests',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
      galleryDays: 30,
      customBranding: false,
      prioritySupport: false,
    },
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    italic: 'a keepsake, held longer',
    price: 279,
    blurb: 'For larger weddings and couples who want everything kept.',
    bullets: [
      'Everything in Signature',
      'Your names and colours throughout',
      'Live shared gallery for a full year',
      'No Golden Glance footer',
      'Priority same-day support',
    ],
    features: {
      filters: ALL_FILTERS,
      allowVideo: true,
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
