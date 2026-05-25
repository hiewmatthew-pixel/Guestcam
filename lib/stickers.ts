// Sticker library. Each sticker is an inline SVG string — keeps them
// crisp at any scale and lets us tint by passing currentColor.

import type { StickerSetId } from './tiers';

export type StickerId =
  | 'rings'
  | 'heart'
  | 'sparkle'
  | 'champagne'
  | 'star'
  | 'leaves'
  | 'florals'
  | 'vow'
  | 'love'
  | 'cheers'
  | 'forever'
  | 'kiss'
  | 'date-stamp'
  | 'couple-names';

export type StickerDef = {
  id: StickerId;
  label: string;
  svg: string;        // raw SVG markup, currentColor for fill/stroke
  tone: 'gold' | 'ink';
  // categories
  essential?: boolean;  // included in the Glimpse tier
  custom?: boolean;     // Studio-only: rendered from event data
};

const STICKERS: StickerDef[] = [
  {
    id: 'rings',
    label: 'Rings',
    tone: 'gold',
    essential: true,
    svg: `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="30" r="22" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="62" cy="30" r="22" fill="none" stroke="currentColor" stroke-width="3"/>
    </svg>`,
  },
  {
    id: 'heart',
    label: 'Heart',
    tone: 'gold',
    essential: true,
    svg: `<svg viewBox="0 0 64 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 54 C 6 36, 4 20, 12 12 C 20 4, 30 8, 32 16 C 34 8, 44 4, 52 12 C 60 20, 58 36, 32 54 Z"
            fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    tone: 'gold',
    essential: true,
    svg: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 4 L 33 27 L 56 30 L 33 33 L 30 56 L 27 33 L 4 30 L 27 27 Z" fill="currentColor"/>
      <circle cx="50" cy="10" r="3" fill="currentColor"/>
      <circle cx="10" cy="48" r="2" fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'champagne',
    label: 'Champagne',
    tone: 'gold',
    essential: true,
    svg: `<svg viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 8 L 50 8 L 46 36 C 46 46, 38 50, 35 50 C 32 50, 24 46, 24 36 Z"
            fill="none" stroke="currentColor" stroke-width="2.5"/>
      <line x1="35" y1="50" x2="35" y2="72" stroke="currentColor" stroke-width="2.5"/>
      <line x1="22" y1="72" x2="48" y2="72" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="30" cy="20" r="2" fill="currentColor"/>
      <circle cx="40" cy="26" r="2" fill="currentColor"/>
      <circle cx="36" cy="14" r="1.5" fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'star',
    label: 'Star',
    tone: 'gold',
    svg: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 4 L 37 22 L 56 24 L 41 36 L 47 56 L 30 45 L 13 56 L 19 36 L 4 24 L 23 22 Z"
            fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'leaves',
    label: 'Leaves',
    tone: 'gold',
    svg: `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 50 Q 20 20, 40 30 Q 60 40, 70 10"
            fill="none" stroke="currentColor" stroke-width="2"/>
      <ellipse cx="22" cy="34" rx="6" ry="3" fill="currentColor" transform="rotate(-35 22 34)"/>
      <ellipse cx="35" cy="30" rx="6" ry="3" fill="currentColor" transform="rotate(-15 35 30)"/>
      <ellipse cx="50" cy="32" rx="6" ry="3" fill="currentColor" transform="rotate(20 50 32)"/>
      <ellipse cx="62" cy="22" rx="6" ry="3" fill="currentColor" transform="rotate(40 62 22)"/>
    </svg>`,
  },
  {
    id: 'florals',
    label: 'Florals',
    tone: 'gold',
    svg: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="30" cy="30" r="4" fill="currentColor"/>
        <ellipse cx="30" cy="18" rx="5" ry="9"/>
        <ellipse cx="30" cy="42" rx="5" ry="9"/>
        <ellipse cx="18" cy="30" rx="9" ry="5"/>
        <ellipse cx="42" cy="30" rx="9" ry="5"/>
        <ellipse cx="21" cy="21" rx="6" ry="4" transform="rotate(-45 21 21)"/>
        <ellipse cx="39" cy="21" rx="6" ry="4" transform="rotate(45 39 21)"/>
        <ellipse cx="21" cy="39" rx="6" ry="4" transform="rotate(45 21 39)"/>
        <ellipse cx="39" cy="39" rx="6" ry="4" transform="rotate(-45 39 39)"/>
      </g>
    </svg>`,
  },
  {
    id: 'vow',
    label: 'Vow',
    tone: 'ink',
    svg: `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="36" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="40" fill="currentColor">vow</text>
    </svg>`,
  },
  {
    id: 'love',
    label: 'Love',
    tone: 'ink',
    svg: `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="36" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="40" fill="currentColor">love</text>
    </svg>`,
  },
  {
    id: 'cheers',
    label: 'Cheers',
    tone: 'ink',
    svg: `<svg viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
      <text x="70" y="36" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="40" fill="currentColor">cheers</text>
    </svg>`,
  },
  {
    id: 'forever',
    label: 'Forever',
    tone: 'ink',
    svg: `<svg viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
      <text x="80" y="36" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="40" fill="currentColor">forever</text>
    </svg>`,
  },
  {
    id: 'kiss',
    label: 'Kiss',
    tone: 'gold',
    svg: `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 38 Q 30 30, 18 32 Q 14 40, 20 46 Q 32 50, 40 42 Q 48 50, 60 46 Q 66 40, 62 32 Q 50 30, 40 38 Z"
            fill="currentColor"/>
    </svg>`,
  },
  // Custom-rendered, Studio tier only. The SVG below is a placeholder;
  // the real markup is generated at draw time with the event's names.
  {
    id: 'couple-names',
    label: 'Couple names',
    tone: 'gold',
    custom: true,
    svg: `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
      <text x="100" y="42" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="36" fill="currentColor">your names</text>
    </svg>`,
  },
  {
    id: 'date-stamp',
    label: 'Date stamp',
    tone: 'ink',
    custom: true,
    svg: `<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg">
      <text x="100" y="34" text-anchor="middle"
            font-family="Cormorant Garamond, serif"
            font-weight="400" font-size="28" letter-spacing="6" fill="currentColor">05 · 25 · 26</text>
    </svg>`,
  },
];

export function getStickersForSet(set: StickerSetId | null): StickerDef[] {
  if (!set) return [];
  if (set === 'essential') return STICKERS.filter((s) => s.essential);
  if (set === 'full') return STICKERS.filter((s) => !s.custom);
  return STICKERS; // full-with-custom
}

export function getStickerById(id: StickerId): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}

/**
 * For the two custom stickers, render dynamic SVG from event data.
 * Returns the standard SVG markup if the sticker is not custom.
 */
export function renderStickerSvg(
  sticker: StickerDef,
  event?: { couple_names?: string; wedding_date?: string },
): string {
  if (sticker.id === 'couple-names' && event?.couple_names) {
    const safe = event.couple_names.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<svg viewBox="0 0 320 60" xmlns="http://www.w3.org/2000/svg">
      <text x="160" y="42" text-anchor="middle"
            font-family="Cormorant Garamond, serif" font-style="italic"
            font-weight="500" font-size="40" fill="currentColor">${safe}</text>
    </svg>`;
  }
  if (sticker.id === 'date-stamp' && event?.wedding_date) {
    try {
      const d = new Date(event.wedding_date);
      const fmt = d
        .toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })
        .replace(/[\/.]/g, ' · ');
      return `<svg viewBox="0 0 240 50" xmlns="http://www.w3.org/2000/svg">
        <text x="120" y="34" text-anchor="middle"
              font-family="Cormorant Garamond, serif"
              font-weight="400" font-size="28" letter-spacing="6" fill="currentColor">${fmt}</text>
      </svg>`;
    } catch {
      /* fall through */
    }
  }
  return sticker.svg;
}

export function stickerToDataUrl(svgMarkup: string, tone: 'gold' | 'ink'): string {
  const color = tone === 'gold' ? '#B8956A' : '#1A1A1A';
  // inject color into a wrapper so currentColor cascades
  const wrapped = svgMarkup.replace(
    '<svg ',
    `<svg style="color:${color}" `,
  );
  const encoded = encodeURIComponent(wrapped)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;utf8,${encoded}`;
}
