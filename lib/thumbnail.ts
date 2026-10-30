// Small JPEG previews for the gallery grid, made on the guest's phone.
//
// A 4 MB photo becomes a ~60 KB preview; a video gets its first frame as a
// poster. Gallery tiles load these instead of the originals, which cuts
// Supabase download traffic (egress) by ~95% on a busy gallery. Strictly
// best effort: any failure returns null and the gallery falls back to the
// original file.

import type { MediaType } from './supabase';

const MAX_EDGE = 640; // sharp on a 2x phone tile, ~40-80 KB as JPEG
const QUALITY = 0.72;
const VIDEO_TIMEOUT_MS = 8_000;

function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, cw, ch);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
}

async function photoThumb(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    try {
      return await toJpeg(bmp, bmp.width, bmp.height);
    } finally {
      bmp.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function videoThumb(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), VIDEO_TIMEOUT_MS);
    const grab = () => {
      if (!v.videoWidth || !v.videoHeight) return finish(null);
      toJpeg(v, v.videoWidth, v.videoHeight).then(finish, () => finish(null));
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => finish(null);
    v.onloadeddata = () => {
      // a frame just in (the very first is often black on fade-in)
      const t = Number.isFinite(v.duration) ? Math.min(0.25, v.duration / 2) : 0.25;
      v.onseeked = grab;
      try {
        v.currentTime = t;
      } catch {
        grab();
      }
    };
    v.src = url;
  });
}

export async function makeThumbnail(blob: Blob, mediaType: MediaType): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  try {
    if (mediaType === 'photo') return await photoThumb(blob);
    if (mediaType === 'video' || mediaType === 'boomerang') return await videoThumb(blob);
  } catch {
    /* fall through */
  }
  return null;
}
