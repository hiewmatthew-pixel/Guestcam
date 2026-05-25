// Bakes stickers and (Studio-tier) the couple-name overlay into the
// final still image before submit. Renders the source image at full
// resolution onto an offscreen canvas, then draws each sticker at its
// normalized position with the user's scale/rotation.

import {
  getStickerById,
  renderStickerSvg,
  stickerToDataUrl,
} from './stickers';
import { drawCoupleOverlay } from './overlay';
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

  // resolve library sticker images in parallel (emojis don't need preloading)
  const resolved = await Promise.all(
    placed.map(async (p) => {
      if (p.kind === 'emoji') return { placement: p, img: null as null };
      const def = getStickerById(p.id);
      if (!def) return null;
      const url = stickerToDataUrl(renderStickerSvg(def, event), def.tone);
      const stickerImg = await loadImage(url);
      return { placement: p, img: stickerImg };
    }),
  );

  // base sticker size scaled to canvas (assume on-screen image was rendered
  // at ~75vh; map STICKER_BASE_PX to the same proportion of the image height)
  const baseHeight = canvas.height * (STICKER_BASE_PX / 800);
  for (const r of resolved) {
    if (!r) continue;
    const { placement } = r;
    const cx = placement.x * canvas.width;
    const cy = placement.y * canvas.height;

    if (placement.kind === 'emoji') {
      // 110px on-screen at scale=1 -> map to image-proportional size
      const fontPx = canvas.height * (110 / 800) * placement.scale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(placement.rotation);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${fontPx}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(placement.emoji, 0, 0);
      ctx.restore();
      continue;
    }

    if (!r.img) continue;
    const si = r.img;
    const aspect = si.naturalWidth / si.naturalHeight;
    const h = baseHeight * placement.scale;
    const w = h * aspect;
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
    img.onerror = () => reject(new Error(`could not load image`));
    img.src = src;
  });
}
