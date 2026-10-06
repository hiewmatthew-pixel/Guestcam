// Re-encode a photo picked from the guest's library before it is shared.
// Drawing it through a canvas drops all metadata, including EXIF GPS
// coordinates (the bucket is public), applies the EXIF rotation, and caps
// the size so full-resolution phone photos aren't rejected as too large.

const MAX_EDGE = 2560;

export async function reencodePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!out) throw new Error('encode failed');
    return out;
  } finally {
    bitmap.close();
  }
}
