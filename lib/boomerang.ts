// Instagram-style boomerang: a quick burst of stills, played forward then
// backward at double speed, looped a few times, recorded to a short video.
//
// Capturing stills (rather than recording video) gives the stop-motion
// "rapid photos" feel and lets the loop be built frame-exact. Frames are
// kept as small canvases (max 960 px long edge), ~60 MB for a 3 s burst.

export const BOOMERANG_FPS = 10; // stills per second while capturing
export const BOOMERANG_PLAY_FPS = 20; // playback speed: 2x, like Instagram
export const BOOMERANG_SECONDS = [1, 2, 3] as const;
export type BoomerangSeconds = (typeof BOOMERANG_SECONDS)[number];
const MAX_EDGE = 960;
// the saved clip loops this long-ish, so it also reads as a boomerang when
// shared to apps that don't loop video (Messages, Mail)
const TARGET_CLIP_SECONDS = 4.5;

/** Frame order for one ping-pong cycle: 0..n-1 then back down to 1. */
export function pingPong(n: number): number[] {
  if (n <= 1) return [0];
  const fwd = Array.from({ length: n }, (_, i) => i);
  const back = fwd.slice(1, -1).reverse();
  return [...fwd, ...back];
}

/** How many cycles to record so the clip lasts about TARGET_CLIP_SECONDS (2 to 6). */
export function cyclesFor(frames: number, playFps = BOOMERANG_PLAY_FPS): number {
  const cycleSeconds = pingPong(frames).length / playFps;
  return Math.max(2, Math.min(6, Math.ceil(TARGET_CLIP_SECONDS / cycleSeconds)));
}

export const BOOMERANG_VIDEO_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickVideoMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return BOOMERANG_VIDEO_TYPES.find((c) => {
    try {
      return MediaRecorder.isTypeSupported(c);
    } catch {
      return false;
    }
  });
}

function scaledSize(w: number, h: number) {
  const s = Math.min(1, MAX_EDGE / Math.max(w, h));
  // even dimensions keep H.264 encoders happy
  return { w: Math.max(2, Math.round((w * s) / 2) * 2), h: Math.max(2, Math.round((h * s) / 2) * 2) };
}

/**
 * Snap stills from the live (filtered) canvas. Each still is also painted
 * onto `preview`, so the viewfinder stutters like a camera firing a burst.
 * Resolves when `seconds` have passed, or early (but never before 1 s)
 * once `shouldStop()` turns true.
 */
export function captureBurst(opts: {
  source: HTMLCanvasElement;
  preview?: HTMLCanvasElement | null;
  seconds: number;
  shouldStop?: () => boolean;
  onFrame?: (index: number, total: number) => void;
  // part of the frame to keep (the guest's chosen shape); whole frame if absent
  crop?: () => { x: number; y: number; w: number; h: number };
}): Promise<HTMLCanvasElement[]> {
  const { source, preview, seconds } = opts;
  const total = Math.round(seconds * BOOMERANG_FPS);
  const minFrames = BOOMERANG_FPS; // 1 second
  const frames: HTMLCanvasElement[] = [];
  return new Promise((resolve) => {
    const started = performance.now();
    const snap = () => {
      if (!source.width || !source.height) return;
      const r = opts.crop?.() ?? { x: 0, y: 0, w: source.width, h: source.height };
      const { w, h } = scaledSize(r.w, r.h);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')?.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, w, h);
      frames.push(c);
      if (preview) {
        if (preview.width !== w || preview.height !== h) {
          preview.width = w;
          preview.height = h;
        }
        preview.getContext('2d')?.drawImage(c, 0, 0);
      }
      opts.onFrame?.(frames.length, total);
    };
    const tick = () => {
      const due = Math.floor(((performance.now() - started) / 1000) * BOOMERANG_FPS) + 1;
      while (frames.length < Math.min(due, total)) snap();
      const done = frames.length >= total || (frames.length >= minFrames && opts.shouldStop?.());
      if (done) resolve(frames);
      else requestAnimationFrame(tick);
    };
    snap();
    requestAnimationFrame(tick);
  });
}

/**
 * Record the ping-pong loop to a video. `canvas` is drawn on as the clip
 * plays, so showing it gives a live preview of the boomerang while it
 * "develops". `decorate` paints extras (the couple's names) on each frame.
 */
export function encodeBoomerang(opts: {
  frames: HTMLCanvasElement[];
  canvas: HTMLCanvasElement;
  decorate?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  onProgress?: (fraction: number) => void;
}): Promise<Blob> {
  const { frames, canvas } = opts;
  return new Promise((resolve, reject) => {
    const first = frames[0];
    const ctx = canvas.getContext('2d');
    const stream = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(
      BOOMERANG_PLAY_FPS,
    );
    if (!first || !ctx || !stream || typeof MediaRecorder === 'undefined') {
      reject(new Error('Boomerangs are not supported on this browser.'));
      return;
    }
    canvas.width = first.width;
    canvas.height = first.height;
    const draw = (i: number) => {
      ctx.drawImage(frames[i], 0, 0);
      opts.decorate?.(ctx, canvas.width, canvas.height);
    };
    draw(0);

    const order = pingPong(frames.length);
    const sequence = Array.from({ length: cyclesFor(frames.length) }, () => order).flat();
    const mimeType = pickVideoMime();
    let rec: MediaRecorder;
    try {
      rec = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream);
    } catch (e) {
      reject(e);
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: (rec.mimeType || mimeType || 'video/webm').split(';')[0] }));
    };
    rec.onerror = () => reject(new Error('Could not record the boomerang.'));
    rec.start(250);

    const frameMs = 1000 / BOOMERANG_PLAY_FPS;
    let started = 0;
    let shown = -1;
    const tick = (now: number) => {
      if (!started) started = now;
      const i = Math.floor((now - started) / frameMs);
      if (i >= sequence.length) {
        opts.onProgress?.(1);
        // hold the last frame one beat so the recorder catches it
        setTimeout(() => rec.state !== 'inactive' && rec.stop(), frameMs * 2);
        return;
      }
      if (i !== shown) {
        draw(sequence[i]);
        shown = i;
        opts.onProgress?.(i / sequence.length);
      }
      requestAnimationFrame(tick);
    };
    // give the recorder a moment to start before the first change
    setTimeout(() => requestAnimationFrame(tick), 120);
  });
}
