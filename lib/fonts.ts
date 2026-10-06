// Canvas text can't see the font-family name you'd write in CSS: next/font
// registers Cormorant Garamond under a hashed family (e.g.
// '__Cormorant_Garamond_3c1b2a') and exposes it through the
// --font-cormorant custom property on <html> (see app/layout.tsx). A
// ctx.font of "Cormorant Garamond" therefore silently falls back to Times.
// These helpers resolve the real family at runtime and make sure the
// faces are loaded before anything is painted onto a canvas.

const SERIF_FALLBACK = '"Cormorant Garamond", "Times New Roman", serif';

let resolvedFamily: string | null = null;

/** The CSS font-family list for the brand serif, usable in ctx.font. */
export function serifFamily(): string {
  if (resolvedFamily) return resolvedFamily;
  if (typeof document === 'undefined') return SERIF_FALLBACK;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-cormorant')
    .trim();
  if (!v) return SERIF_FALLBACK;
  resolvedFamily = `${v}, ${SERIF_FALLBACK}`;
  return resolvedFamily;
}

/** Build a ctx.font shorthand for the brand serif. */
export function serifFont(
  sizePx: number,
  opts: { italic?: boolean; weight?: 400 | 500 | 600 } = {},
): string {
  const style = opts.italic ? 'italic ' : '';
  return `${style}${opts.weight ?? 400} ${Math.round(sizePx)}px ${serifFamily()}`;
}

/** Just the first (hashed, real) family from --font-cormorant. */
function primaryFamily(): string | null {
  if (typeof document === 'undefined') return null;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-cormorant')
    .trim();
  const first = v.split(',')[0]?.trim();
  return first || null;
}

let fontsPromise: Promise<void> | null = null;
const LOAD_TIMEOUT_MS = 3000;
// latin + latin-ext glyphs so both unicode-range subsets get fetched
// (accented couple names live in latin-ext)
const SAMPLE_TEXT = 'Aa&·0123 ÀàÉéÑñ ĀāŁłŠš';

/**
 * Resolve once the serif faces the canvas renderers use are available.
 * Never rejects and never blocks longer than ~3s (offline / blocked font
 * CSS) — in that case drawing proceeds with the fallback.
 *
 * Only the primary hashed family is loaded: next/font's metric-matched
 * fallback face is `src: local("Times New Roman")`, which errors where
 * that font isn't installed and would reject a load() of the full list.
 */
export function ensureCanvasFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve();
  }
  if (fontsPromise) return fontsPromise;
  const fam = primaryFamily();
  if (!fam) return Promise.resolve();
  const load = Promise.allSettled([
    document.fonts.load(`italic 400 48px ${fam}`, SAMPLE_TEXT),
    document.fonts.load(`italic 500 48px ${fam}`, SAMPLE_TEXT),
    document.fonts.load(`400 48px ${fam}`, SAMPLE_TEXT),
  ]).then(() => undefined);
  fontsPromise = Promise.race([
    load,
    new Promise<void>((r) => setTimeout(r, LOAD_TIMEOUT_MS)),
  ]);
  return fontsPromise;
}
