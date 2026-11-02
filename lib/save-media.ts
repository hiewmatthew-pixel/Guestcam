// Saving and sharing captures from the browser.
//
// Web pages can't write into the Photos app directly. On iPhone/iPad the
// system share sheet can ("Save Image" / "Save Video"), whereas a plain
// download lands in the Files app, so iOS saves go through the share
// sheet. Android saves as a download, which Gallery and Google Photos
// show automatically. "Share" always opens the share sheet (Messages,
// WhatsApp, Mail, Instagram…) with the actual file.
//
// Browsers only open the share sheet straight from a tap. If preparing
// the file took too long and the tap "expired", the caller gets
// 'needs-tap' and asks the guest to tap once more (the file is ready by
// then, so the second tap opens instantly).

export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap' | 'unsupported' | 'failed';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

type ShareNav = Navigator & { canShare?: (d: ShareData) => boolean };

export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as ShareNav;
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  const probe = file ?? new File([new Uint8Array([0])], 'probe.jpg', { type: 'image/jpeg' });
  try {
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function openShareSheet(data: ShareData): Promise<SaveResult> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needs-tap';
    return 'failed';
  }
}

export function downloadFile(file: File): SaveResult {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** iPhone Photos can't hold WebM video (some Android phones record it). */
export const photosCanHold = (file: File) => !(isIOS() && /webm/i.test(file.type));

/** Put the capture in the phone's photo library (as close as the web allows). */
export async function saveToPhotos(file: File): Promise<SaveResult> {
  if (isIOS() && photosCanHold(file) && canShareFiles(file)) return openShareSheet({ files: [file] });
  return downloadFile(file);
}

/** Send the capture to another app: Messages, WhatsApp, Mail, Instagram… */
export async function shareCapture(file: File, opts: { title?: string; text?: string } = {}): Promise<SaveResult> {
  if (!canShareFiles(file)) return 'unsupported';
  return openShareSheet({ files: [file], title: opts.title, text: opts.text });
}

/** A short, human message for each result (shown in a status line). */
export function saveMessage(r: SaveResult, kind: 'photo' | 'video'): string {
  const thing = kind === 'photo' ? 'photo' : 'video';
  switch (r) {
    case 'downloaded':
      return isIOS()
        ? `${thing} saved to Files › Downloads${kind === 'video' ? ' (this video’s format can’t go in Photos)' : ''}`
        : `${thing} saved · find it in your Gallery or Photos (Downloads)`;
    case 'needs-tap':
      return 'ready · tap again to open your phone’s options';
    case 'unsupported':
      return 'sharing isn’t available in this browser · save it, then share from your photos';
    case 'failed':
      return 'that didn’t work · please try again';
    default:
      return '';
  }
}

export function fileFrom(blob: Blob, name: string): File {
  return new File([blob], name, { type: (blob.type || 'application/octet-stream').split(';')[0] });
}
