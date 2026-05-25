// Bakes stickers and (Studio-tier) the couple-name overlay into the
// final still image before submit. Renders the source image at full
// resolution onto an offscreen canvas, then draws each sticker at its
// normalized position with the user's scale/rotation.

import {
  getStickerById,
  renderStickerSvg,
  stickerToDataUrl,
} from './stickers';
import type { PlacedSticker } from '@/components/StickerEditor';

const STICKER_BASE_PX = 140; // matches the on-screen sticker render size

export type CompositeOptions = {
  // when true, paint couple names + date along the bottom of the photo
  burnCoupleOverlay?: boolean;
};

export async function compositePhoto(
  sourceBlob: Blob,
  placed: PlacedSticker[],
  event?: { couple_names?: string; wedding_date?: string },
  opts: CompositeOptions = {},
): Promise<Blob> {
  const hasOverlay =
    !!opts.burnCoupleOverlay && (!!event?.couple_names || !!event?.wedding_date);
  if (placed.length === 0 && !hasOverlay) return sourceBlob;

  const img = await blobToImage(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceBlob;
  ctx.drawImage(img, 0, 0);

  // resolve sticker images in parallel
  const resolved = await Promise.all(
    placed.map(async (p) => {
      const def = getStickerById(p.id);
      if (!def) return null;
      const url = stickerToDataUrl(renderStickerSvg(def, event), def.tone);
      const stickerImg = await loadImage(url);
      return { placement: p, img: stickerImg };
    }),
  );

  // base sticker size scaled to canvas (assume on-screen image was rendered
  // at ~75vh; map STICKER_BASE_PX to the same proportion of the image height)
  const baseHeight = canvas.height * (STICKER_BASE_PX / 800); // rough but consistent
  for (const r of resolved) {
    if (!r) continue;
    const { placement, img: si } = r;
    const aspect = si.naturalWidth / si.naturalHeight;
    const h = baseHeight * placement.scale;
    const w = h * aspect;
    const cx = placement.x * canvas.width;
    const cy = placement.y * canvas.height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(placement.rotation);
    ctx.drawImage(si, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  if (hasOverlay) {
    drawCoupleOverlay(ctx, canvas.width, canvas.height, event!);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode composite image.'))),
      'image/jpeg',
      0.92,
    );
  });
}

function drawCoupleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  event: { couple_names?: string; wedding_date?: string },
) {
  const names = event.couple_names?.trim();
  const date = formatDate(event.wedding_date);

  // baseline: 6% up from the bottom of the photo
  const bottomPad = height * 0.06;
  const namesSize = Math.round(height * 0.055); // ~5.5% of height
  const dateSize = Math.round(height * 0.018); // ~1.8%
  const gap = Math.round(height * 0.015);
  const gold = '#B8956A';

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // subtle drop shadow so the type reads on busy backgrounds
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(4, height * 0.005);
  ctx.shadowOffsetY = Math.max(1, height * 0.0015);
  ctx.fillStyle = gold;

  let cursorY = height - bottomPad;

  if (date) {
    ctx.font = `400 ${dateSize}px "Cormorant Garamond", "Times New Roman", serif`;
    // letter-spacing isn't supported on 2D context across all browsers,
    // so emulate by spacing characters manually
    const tracked = date.split('').join('  ');
    ctx.fillText(tracked.toUpperCase(), width / 2, cursorY);
    cursorY -= dateSize + gap;
  }

  if (names) {
    ctx.font = `italic 500 ${namesSize}px "Cormorant Garamond", "Times New Roman", serif`;
    ctx.fillText(names, width / 2, cursorY);
  }

  ctx.restore();
}

function formatDate(input?: string): string | null {
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

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return loadImage(url).finally(() => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 60)}…`));
    img.src = src;
  });
}
