// Direct-to-storage uploader for guest captures. The Supabase JS SDK's
// upload() doesn't expose progress, which matters for 30MB videos on
// venue wifi — a guest staring at a frozen "sending…" will close the
// tab. This posts straight to the storage REST endpoint via XHR so we
// get progress events, and retries transient failures with backoff.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type UploadOpts = {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void; // 0..1
  signal?: AbortSignal;
  maxAttempts?: number; // default 3
};

export class UploadError extends Error {
  constructor(message: string, readonly status?: number, readonly retriable = false) {
    super(message);
    this.name = 'UploadError';
  }
}

function publicUrlFor(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

function putOnce(opts: UploadOpts): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const endpoint = `${SUPABASE_URL}/storage/v1/object/${opts.bucket}/${encodeURI(opts.path)}`;
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('authorization', `Bearer ${ANON_KEY}`);
    xhr.setRequestHeader('apikey', ANON_KEY || '');
    xhr.setRequestHeader('content-type', opts.contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
      } else {
        // 429 / 5xx are worth retrying; 4xx (size, type, auth) are not
        const retriable = xhr.status === 429 || xhr.status >= 500;
        reject(new UploadError(`Upload failed (${xhr.status})`, xhr.status, retriable));
      }
    };
    xhr.onerror = () => reject(new UploadError('Network error during upload.', undefined, true));
    xhr.ontimeout = () => reject(new UploadError('Upload timed out.', undefined, true));

    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        reject(new UploadError('Upload cancelled.', undefined, false));
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.onabort = () => reject(new UploadError('Upload cancelled.', undefined, false));
    }

    xhr.send(opts.blob);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload a blob to Supabase storage with progress + retry. Returns the
 * public URL. Throws UploadError on permanent failure or cancellation.
 */
export async function uploadFileWithProgress(opts: UploadOpts): Promise<string> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new UploadError('Storage is not configured.');
  }
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: UploadError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await putOnce(opts);
      return publicUrlFor(opts.bucket, opts.path);
    } catch (e) {
      const err = e instanceof UploadError ? e : new UploadError(String(e), undefined, true);
      lastErr = err;
      // don't retry permanent failures or user cancellation
      if (!err.retriable || opts.signal?.aborted || attempt === maxAttempts) {
        throw err;
      }
      // reset progress and back off: 1s, 2s, 4s …
      opts.onProgress?.(0);
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr ?? new UploadError('Upload failed.');
}
