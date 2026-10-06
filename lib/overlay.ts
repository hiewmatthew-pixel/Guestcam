// Single source of truth for painting the Studio-tier couple overlay
// onto a 2D canvas. Used both by lib/composite.ts (still photos) and
// by components/FilteredCamera.tsx (live video / boomerang recording).

import { formatWeddingDate } from './dates';
import { ensureCanvasFonts, serifFont } from './fonts';

export type CoupleOverlayPayload = {
  couple_names?: string;
  wedding_date?: string;
};

export function drawCoupleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  event: CoupleOverlayPayload,
) {
  const names = event.couple_names?.trim();
  const date = formatOverlayDate(event.wedding_date);
  if (!names && !date) return;
  // Synchronous per-frame callers (live video) can't await; kick off the
  // font load so later frames use Cormorant. Still-photo callers should
  // `await ensureCanvasFonts()` first (lib/composite.ts does).
  void ensureCanvasFonts();

  const bottomPad = height * 0.06;
  const namesSize = Math.round(height * 0.055);
  const dateSize = Math.round(height * 0.018);
  const gap = Math.round(height * 0.015);
  const gold = '#B8956A';

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(4, height * 0.005);
  ctx.shadowOffsetY = Math.max(1, height * 0.0015);
  ctx.fillStyle = gold;

  let cursorY = height - bottomPad;

  if (date) {
    ctx.font = serifFont(dateSize);
    // 2D context letterSpacing is uneven across browsers — emulate
    // by injecting double spaces between glyphs.
    const tracked = date.split('').join('  ');
    ctx.fillText(tracked.toUpperCase(), width / 2, cursorY);
    cursorY -= dateSize + gap;
  }

  if (names) {
    ctx.font = serifFont(namesSize, { italic: true, weight: 500 });
    ctx.fillText(names, width / 2, cursorY);
  }

  ctx.restore();
}

/** "06 · 20 · 2026" — the wedding date as a local calendar day. */
export function formatOverlayDate(input?: string): string | null {
  return formatWeddingDate(input, 'dots');
}
