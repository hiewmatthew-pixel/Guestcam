// Bakes stickers into the final still image before submit. Renders the
// source image at full resolution onto an offscreen canvas, then draws
// each sticker at its normalized position with the user's scale/rotation.

import {
  getStickerById,
  renderStickerSvg,
  stickerToDataUrl,
} from './stickers';
import type { PlacedSticker } from '@/components/StickerEditor';

const STICKER_BASE_PX = 140; // matches the on-screen sticker render size

export async function compositePhoto(
  sourceBlob: Blob,
  placed: PlacedSticker[],
  event?: { couple_names?: string; wedding_date?: string },
): Promise<Blob> {
  if (placed.length === 0) return sourceBlob;

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
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 60)}…`));
    img.src = src;
  });
}
