// Native share with a copy-link fallback. Tries the Web Share API
// (raises the OS share sheet on iOS / Android / modern Edge); falls
// back to copying the media URL on desktop browsers without it.

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareMedia(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareResult> {
  // Web Share API path
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as any).share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      // fall through to copy fallback
    }
  }

  // Clipboard fallback
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(opts.url);
      return 'copied';
    }
  } catch {
    /* fall through */
  }

  // Last-resort fallback: open the asset in a new tab so the viewer can
  // long-press / right-click to save or share manually.
  if (typeof window !== 'undefined') {
    window.open(opts.url, '_blank', 'noopener,noreferrer');
    return 'copied';
  }
  return 'failed';
}
