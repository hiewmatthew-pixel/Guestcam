import { ImageResponse } from 'next/og';

// Brand palette — mirrors tailwind.config.ts (ink / cream / gold).
export const BRAND = {
  ink: '#1A1A1A',
  cream: '#F5F1EA',
  gold: '#B8956A',
} as const;

type MonogramOptions = {
  size: number;
  /** Fraction of the canvas the monogram glyphs should span (font size). */
  scale?: number;
  /** Rounded corners (favicon) vs. full-bleed square (OS applies its own mask). */
  radius?: number;
};

/**
 * Renders the "GG" monogram as a PNG. Uses ImageResponse's bundled default
 * font (no network fetch at build or runtime) and fakes the serif-italic
 * lean of the Logo component with a skew so it stays on-brand.
 */
export function renderMonogram({ size, scale = 0.5, radius = 0 }: MonogramOptions) {
  const fontSize = Math.round(size * scale);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.ink,
          borderRadius: radius,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: BRAND.gold,
            fontSize,
            letterSpacing: -Math.round(fontSize * 0.08),
            lineHeight: 1,
            transform: 'skewX(-12deg)',
            marginTop: -Math.round(fontSize * 0.06),
          }}
        >
          GG
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
