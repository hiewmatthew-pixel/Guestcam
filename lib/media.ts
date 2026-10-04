// File-extension helpers shared by capture, download and ZIP export.
// Safari records video/mp4 and audio/mp4, everything else webm, so the
// extension has to follow the actual bytes or files won't open on iOS.

import type { SubmissionRow } from './supabase';

/** Extension for a freshly captured blob. */
export function extForBlob(blob: Blob, mediaType: SubmissionRow['media_type']): string {
  if (mediaType === 'photo') return 'jpg';
  const mp4 = blob.type.includes('mp4');
  if (mediaType === 'voice') return mp4 ? 'm4a' : 'webm';
  return mp4 ? 'mp4' : 'webm';
}

/** Extension for a stored submission, read from its URL (or data: mime). */
export function extensionFor(it: Pick<SubmissionRow, 'media_type' | 'media_url'>): string {
  if (it.media_type === 'photo') return 'jpg';
  const data = it.media_url.match(/^data:[a-z]+\/([a-z0-9]+)/i);
  if (data) {
    const sub = data[1].toLowerCase();
    if (sub === 'mp4') return it.media_type === 'voice' ? 'm4a' : 'mp4';
    return sub;
  }
  const m = it.media_url.match(/\.([a-z0-9]{2,4})(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : 'webm';
}
