// Uploads a capture to a one-time signed upload URL issued by the server
// (requestUploadAction). XHR rather than fetch so we get upload progress
// for 30 MB videos on venue Wi-Fi, with a timeout so a stalled connection
// (common on iOS after the screen locks) fails fast and the queue retries
// instead of hanging at "sending… 43%" forever.

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retriable = false,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export function uploadToSignedUrl(opts: {
  signedUrl: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.signedUrl, true);
    if (ANON_KEY) {
      xhr.setRequestHeader('apikey', ANON_KEY);
      xhr.setRequestHeader('authorization', `Bearer ${ANON_KEY}`);
    }
    xhr.setRequestHeader('content-type', opts.contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    // 60 s plus 1 s per 100 KB: generous for slow links, finite for dead ones
    xhr.timeout = 60_000 + Math.ceil(opts.blob.size / 100_000) * 1000;

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
        return;
      }
      // 409 = the object already exists, i.e. an earlier attempt landed
      if (xhr.status === 409 || /already exists/i.test(xhr.responseText)) {
        resolve();
        return;
      }
      // 400/403 here usually means the signed URL expired: get a new one
      const retriable = xhr.status === 429 || xhr.status >= 500 || xhr.status === 400 || xhr.status === 403;
      reject(new UploadError(`Upload failed (${xhr.status})`, xhr.status, retriable));
    };
    xhr.onerror = () => reject(new UploadError('Network error during upload.', undefined, true));
    xhr.ontimeout = () => reject(new UploadError('Upload timed out.', undefined, true));
    xhr.send(opts.blob);
  });
}
