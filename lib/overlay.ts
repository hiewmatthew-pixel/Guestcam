// Single source of truth for painting the Studio-tier couple overlay
// onto a 2D canvas. Used both by lib/composite.ts (still photos) and
// by components/FilteredCamera.tsx (live video / boomerang recording).

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
    ctx.font = `400 ${dateSize}px "Cormorant Garamond", "Times New Roman", serif`;
    // 2D context letterSpacing is uneven across browsers — emulate
    // by injecting double spaces between glyphs.
    const tracked = date.split('').join('  ');
    ctx.fillText(tracked.toUpperCase(), width / 2, cursorY);
    cursorY -= dateSize + gap;
  }

  if (names) {
    ctx.font = `italic 500 ${namesSize}px "Cormorant Garamond", "Times New Roman", serif`;
    ctx.fillText(names, width / 2, cursorY);
  }

  ctx.restore();
}

export function formatOverlayDate(input?: string): string | null {
  if (!input) return null;
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    const parts = d
      .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      .split('/');
    return parts.join(' · ');
  } catch {
    return null;
  }
}
