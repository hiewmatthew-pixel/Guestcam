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

export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap' | 'unsupported' | 'failed' | 'in-app';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * In-app browsers (Instagram, Facebook, WhatsApp, the Google app…) on
 * Android ignore downloads entirely, so "save" would silently do nothing.
 */
export function isAndroidInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return false;
  return /\b(FBAN|FBAV|Instagram|Line|WhatsApp|Twitter|TikTok|Snapchat|Pinterest|FB_IAB|GSA)\b/i.test(ua) || /(^|;)\s*wv\s*(;|\))/i.test(ua);
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
  if (isAndroidInAppBrowser()) {
    // downloads are ignored here: hand the file to the share sheet instead
    return canShareFiles(file) ? openShareSheet({ files: [file] }) : 'in-app';
  }
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
        : `${thing} saved · in Gallery it’s in the “Download” album; in Google Photos, Library › Download`;
    case 'in-app':
      return 'this app’s browser can’t save files · tap ⋮ and “Open in Chrome”, then save';
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

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
}

export type Platform = 'ios' | 'android' | 'other';
export function currentPlatform(): Platform {
  return isIOS() ? 'ios' : isAndroid() ? 'android' : 'other';
}

/**
 * What to tell the guest after "save to photos" in the gallery: did it
 * work, and where on their phone to find it. `ok` drives the tick.
 */
export function saveOutcome(
  r: SaveResult,
  kind: 'photo' | 'video' | 'voice',
  platform: Platform,
): { ok: boolean; title: string; detail: string } {
  const thing = kind === 'voice' ? 'voice note' : kind;
  const saveWord = kind === 'photo' ? '“Save Image”' : '“Save Video”';
  switch (r) {
    case 'shared':
      return kind === 'voice'
        ? { ok: true, title: 'done', detail: 'if you chose “Save to Files” it’s in the Files app' }
        : { ok: true, title: 'done', detail: `if you tapped ${saveWord}, it’s in Photos › Recents` };
    case 'downloaded':
      if (platform === 'android')
        return kind === 'voice'
          ? { ok: true, title: 'saved to your phone', detail: 'find it in Files › Downloads' }
          : {
              ok: true,
              title: 'saved to your Gallery',
              detail: 'Gallery app: “Download” album · Google Photos: Library › Download',
            };
      if (platform === 'ios')
        return {
          ok: true,
          title: 'saved to Files',
          detail:
            kind === 'video'
              ? 'this video’s format can’t go in Photos · it’s in Files › Downloads'
              : 'it’s in Files › Downloads',
        };
      return { ok: true, title: 'downloaded', detail: 'it’s in your Downloads folder' };
    case 'cancelled':
      return {
        ok: false,
        title: 'not saved yet',
        detail: platform === 'ios' && kind !== 'voice' ? `tap save again and choose ${saveWord}` : 'tap save to try again',
      };
    case 'needs-tap':
      return { ok: false, title: 'ready', detail: `tap save once more to finish saving this ${thing}` };
    case 'in-app':
      return {
        ok: false,
        title: 'this app can’t save files',
        detail: 'tap ⋮ › “Open in Chrome”, then save · or send it to yourself below',
      };
    default:
      return { ok: false, title: 'that didn’t work', detail: 'check your connection and tap save again' };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Save several captures at once. iPhone: one share sheet ("Save N
 * Images" puts them all in Photos); formats Photos can't hold go to
 * Files. Android/desktop: one download each (Chrome asks once to allow
 * multiple downloads), which Gallery / Google Photos pick up.
 */
export async function saveManyToPhotos(files: File[]): Promise<SaveResult> {
  if (files.length === 0) return 'failed';
  if (files.length === 1) return saveToPhotos(files[0]);
  const nav = navigator as ShareNav;
  const canShareAll = (fs: File[]) => {
    try {
      return fs.length > 0 && typeof nav.share === 'function' && !!nav.canShare?.({ files: fs });
    } catch {
      return false;
    }
  };
  if (isIOS()) {
    const photos = files.filter(photosCanHold);
    if (canShareAll(photos)) {
      const r = await openShareSheet({ files: photos });
      if (r === 'shared') for (const f of files.filter((f) => !photosCanHold(f))) downloadFile(f);
      return r;
    }
  }
  if (isAndroidInAppBrowser()) return canShareAll(files) ? openShareSheet({ files }) : 'in-app';
  let ok = 0;
  for (const f of files) {
    if (downloadFile(f) === 'downloaded') ok++;
    // browsers drop downloads fired in the same instant
    await wait(350);
  }
  return ok > 0 ? 'downloaded' : 'failed';
}

/** One-line toast after saving `n` captures from the gallery. */
export function saveManyMessage(r: SaveResult, n: number, platform: Platform): string {
  switch (r) {
    case 'shared':
      return platform === 'ios' ? 'done · if you tapped “Save”, they’re in Photos › Recents' : 'done';
    case 'downloaded':
      return platform === 'android'
        ? `${n} saved · Gallery “Download” album · Google Photos › Library › Download`
        : platform === 'ios'
          ? `${n} saved to Files › Downloads`
          : `${n} downloaded · check your Downloads folder`;
    case 'cancelled':
      return platform === 'ios' ? 'not saved yet · tap save again and choose “Save Images”' : 'not saved yet';
    case 'needs-tap':
      return 'ready · tap save once more';
    case 'in-app':
      return 'this app can’t save files · tap ⋮ › “Open in Chrome”, then save';
    default:
      return 'that didn’t work · please try again';
  }
}
