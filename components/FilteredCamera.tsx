'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterId, VERTEX_SHADER, getFilter } from '@/lib/filters';
import { drawCoupleOverlay } from '@/lib/overlay';

export type CaptureMode = 'photo' | 'video' | 'boomerang';

type Props = {
  filter: FilterId;
  // 0..1, blends the filter's graded look back toward the raw frame
  strength?: number;
  facing: 'user' | 'environment';
  onPhotoCaptured: (blob: Blob) => void;
  onVideoCaptured: (blob: Blob, kind: 'video' | 'boomerang') => void;
  mode: CaptureMode;
  recording: boolean;
  // when set, the recorded video / boomerang has couple names + wedding
  // date burned into the bottom of each frame via a 2D output canvas.
  overlay?: { couple_names?: string; wedding_date?: string };
  onRecorderError?: (msg: string) => void;
  onMicUnavailable?: () => void;
  onWebGLUnavailable?: () => void;
};

type CameraError = {
  kind:
    | 'permission'
    | 'no-camera'
    | 'in-use'
    | 'overconstrained'
    | 'insecure'
    | 'unsupported'
    | 'iframe-blocked'
    | 'autoplay'
    | 'unknown';
  message: string;
};

// Detect in-app browsers (Instagram, Facebook, WhatsApp, TikTok, etc.)
// where getUserMedia is commonly restricted regardless of permission.
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /\b(FBAN|FBAV|Instagram|Line|WhatsApp|Twitter|TikTok|Snapchat|Pinterest|FB_IAB|GSA)\b/i.test(
    ua,
  ) || /(^|;)\s*wv\s*(;|\))/i.test(ua); // Android WebView flag
}

function classifyError(e: any): CameraError {
  const name = e?.name as string | undefined;
  const msg = String(e?.message || '');
  if (name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
    // in-app browsers often surface a permission error even when the
    // real fix is to reopen the link in a full browser
    if (isInAppBrowser()) {
      return {
        kind: 'permission',
        message:
          'Your in-app browser is blocking the camera. Tap the ••• menu and choose "Open in Safari" or "Open in Chrome", then try again.',
      };
    }
    return {
      kind: 'permission',
      message:
        'Camera permission was denied. Open your browser’s site settings for this page, allow Camera, then reload.',
    };
  }
  if (name === 'NotFoundError' || /not.?found/i.test(msg)) {
    return { kind: 'no-camera', message: 'No camera was found on this device.' };
  }
  if (name === 'NotReadableError' || /in use|busy/i.test(msg)) {
    return {
      kind: 'in-use',
      message: 'The camera is being used by another app. Close other apps using the camera and try again.',
    };
  }
  if (name === 'OverconstrainedError') {
    return { kind: 'overconstrained', message: 'No camera matches the requested settings. Try flipping the camera.' };
  }
  if (name === 'SecurityError') {
    return {
      kind: 'insecure',
      message: 'Camera blocked because the page is not on HTTPS or is in a restricted frame.',
    };
  }
  return { kind: 'unknown', message: msg || 'Could not access the camera.' };
}

const MAX_VIDEO_SECONDS = 15;
const MAX_BOOMERANG_SECONDS = 8;
const MAX_VIDEO_HEIGHT = 720;

export type FilteredCameraHandle = {
  capturePhoto: () => Promise<Blob | null>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
};

export default function FilteredCamera({
  filter,
  strength = 1,
  facing,
  onPhotoCaptured,
  onVideoCaptured,
  mode,
  recording,
  overlay,
  onRecorderError,
  onMicUnavailable,
  onWebGLUnavailable,
}: Props) {
  // ref-mirror so the draw loop reads the latest value without
  // re-installing the program on every slider tick
  const strengthRef = useRef<number>(strength);
  useEffect(() => {
    strengthRef.current = strength;
  }, [strength]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 2D output canvas used during recording when an overlay is active:
  // WebGL frame is blitted onto it, the overlay is painted on top, and
  // the recorder captures from this canvas instead of the WebGL one.
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputRafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ref-mirror so the overlay RAF always reads the latest value without
  // tearing down + recreating the loop on each parent re-render
  const overlayRef = useRef<Props['overlay']>(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const currentFilterRef = useRef<FilterId>(filter);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  // Mic is acquired only while recording video — keeps the OS mic
  // indicator dark during photo and boomerang capture.
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoStopTimerRef = useRef<number | null>(null);
  const videoPlayingRef = useRef<boolean>(false);

  const [glReady, setGlReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true); // cross-origin throws — that means we're in a frame
    }
  }, []);

  // --- helpers ----------------------------------------------------

  const compileShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const buildProgram = useCallback((gl: WebGLRenderingContext, fragmentSrc: string) => {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }, []);

  const setupGeometry = useCallback((gl: WebGLRenderingContext, program: WebGLProgram) => {
    // full-screen quad
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // tex coords (flip Y so the video isn't upside-down)
    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW,
    );
    const aTex = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 0, 0);
  }, []);

  const installFilter = useCallback(
    (id: FilterId) => {
      const gl = glRef.current;
      if (!gl) return;
      const def = getFilter(id);
      const program = buildProgram(gl, def.fragmentShader);
      if (!program) return;
      gl.useProgram(program);
      programRef.current = program;
      setupGeometry(gl, program);

      // texture (re-bind in case program changed)
      if (!textureRef.current) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        textureRef.current = tex;
      } else {
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
      }

      const uImage = gl.getUniformLocation(program, 'u_image');
      gl.uniform1i(uImage, 0);
      currentFilterRef.current = id;
    },
    [buildProgram, setupGeometry],
  );

  // --- effect: init GL once --------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl =
      (canvas.getContext('webgl', { preserveDrawingBuffer: true }) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true }) as WebGLRenderingContext | null);
    if (!gl) {
      setError({
        kind: 'unsupported',
        message: 'WebGL is not available on this device — filters are disabled.',
      });
      onWebGLUnavailable?.();
      return;
    }
    glRef.current = gl;
    installFilter(filter);
    setGlReady(true);
    // capture initial filter via ref so the first render is correct
    currentFilterRef.current = filter;
    startedAtRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-install program when filter changes
  useEffect(() => {
    if (!glReady) return;
    installFilter(filter);
  }, [filter, glReady, installFilter]);

  // --- effect: open camera ---------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        if (typeof window === 'undefined') return;
        if (!window.isSecureContext) {
          setError({
            kind: 'insecure',
            message: 'Camera requires HTTPS. Open this site over https:// (or use ngrok / Vercel).',
          });
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setError({
            kind: 'unsupported',
            message: 'This browser does not expose getUserMedia. Try Safari or Chrome.',
          });
          return;
        }
        // stop previous
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setError(null);
        videoPlayingRef.current = false;
        setVideoPlaying(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const v = document.createElement('video');
        v.playsInline = true;
        v.muted = true;
        v.autoplay = true;
        v.srcObject = stream;
        try {
          await v.play();
          setVideoPlaying(true);
          setNeedsTap(false);
        } catch (playErr) {
          console.warn('video.play() rejected — needs user gesture', playErr);
          setNeedsTap(true);
        }
        videoRef.current = v;
      } catch (e: any) {
        console.warn('camera open failed:', e);
        const classified = classifyError(e);
        // when blocked inside an iframe (StackBlitz/CodeSandbox preview),
        // permission errors usually mean the parent frame stripped permission
        let kind = classified.kind;
        try {
          if (kind === 'permission' && window.self !== window.top) {
            kind = 'iframe-blocked';
          }
        } catch {
          kind = 'iframe-blocked';
        }
        setError({
          kind,
          message:
            kind === 'iframe-blocked'
              ? 'Camera is blocked inside this embedded preview. Open the preview in a new tab.'
              : classified.message,
        });
      }
    }

    open();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
    };
  }, [facing]);

  // --- render loop -----------------------------------------------

  useEffect(() => {
    function draw() {
      const gl = glRef.current;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const program = programRef.current;
      const tex = textureRef.current;

      if (gl && canvas && video && program && tex && video.readyState >= 2) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
            gl.viewport(0, 0, vw, vh);
          }
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

          const uTime = gl.getUniformLocation(program, 'u_time');
          const uRes = gl.getUniformLocation(program, 'u_resolution');
          const uStrength = gl.getUniformLocation(program, 'u_strength');
          gl.uniform1f(uTime, (performance.now() - startedAtRef.current) / 1000);
          gl.uniform2f(uRes, vw, vh);
          // uStrength may be null on the pass-through shader (uniform
          // optimised out); uniform1f(null, ...) is a safe no-op.
          gl.uniform1f(uStrength, Math.max(0, Math.min(1, strengthRef.current)));

          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!videoPlayingRef.current) {
            videoPlayingRef.current = true;
            setVideoPlaying(true);
          }
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // --- capture: photo --------------------------------------------

  const capturePhoto = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
  }, []);

  // --- capture: video --------------------------------------------

  const startRecording = useCallback(async () => {
    const webglCanvas = canvasRef.current;
    if (!webglCanvas) return;

    // If a couple-name overlay is active, blit the WebGL canvas onto a
    // hidden 2D output canvas every frame and paint the overlay on top,
    // then record from that canvas so the overlay is baked into the file.
    let recordSource: HTMLCanvasElement = webglCanvas;
    const activeOverlay = overlayRef.current;
    const overlayActive =
      !!activeOverlay && (!!activeOverlay.couple_names || !!activeOverlay.wedding_date);

    if (overlayActive) {
      if (!outputCanvasRef.current) {
        outputCanvasRef.current = document.createElement('canvas');
      }
      const outCanvas = outputCanvasRef.current;
      outCanvas.width = webglCanvas.width;
      outCanvas.height = webglCanvas.height;
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
        const tick = () => {
          if (!outputCanvasRef.current) return;
          outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
          outCtx.drawImage(webglCanvas, 0, 0, outCanvas.width, outCanvas.height);
          const ov = overlayRef.current;
          if (ov) {
            drawCoupleOverlay(outCtx, outCanvas.width, outCanvas.height, ov);
          }
          outputRafRef.current = requestAnimationFrame(tick);
        };
        outputRafRef.current = requestAnimationFrame(tick);
        recordSource = outCanvas;
      }
    }

    // capture the chosen canvas as a stream
    const captureStream =
      (recordSource as any).captureStream?.(30) as MediaStream | undefined;
    if (!captureStream) {
      onRecorderError?.('Video recording not supported on this device.');
      return;
    }

    // Attach the microphone only for full video. Boomerangs loop in the
    // gallery so audio would be jarring; keep them silent. The mic is
    // requested on demand so the OS mic indicator stays dark during
    // photo / boomerang capture, and a guest who denies mic permission
    // can still record a silent video instead of losing the camera.
    if (mode === 'video') {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        micStreamRef.current = mic;
        for (const t of mic.getAudioTracks()) {
          try {
            captureStream.addTrack(t);
          } catch {
            /* already attached */
          }
        }
      } catch {
        // mic denied or unavailable — record silently but tell the guest
        // so they aren't surprised by a soundless clip
        onMicUnavailable?.();
      }
    }

    // pick a supported mime type
    const candidates = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = candidates.find((c) => {
      try {
        return MediaRecorder.isTypeSupported(c);
      } catch {
        return false;
      }
    });

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(captureStream, { mimeType, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(captureStream);
    } catch (e: any) {
      onRecorderError?.(e?.message || 'Could not start recorder.');
      return;
    }

    const isBoomerang = mode === 'boomerang';
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      onVideoCaptured(blob, isBoomerang ? 'boomerang' : 'video');
    };
    recorder.start(250);
    recorderRef.current = recorder;

    const cap = isBoomerang ? MAX_BOOMERANG_SECONDS : MAX_VIDEO_SECONDS;
    if (videoStopTimerRef.current) clearTimeout(videoStopTimerRef.current);
    videoStopTimerRef.current = window.setTimeout(() => {
      stopRecordingInternal();
    }, cap * 1000);
  }, [onRecorderError, onVideoCaptured, onMicUnavailable, mode]);

  const stopRecordingInternal = useCallback(() => {
    if (videoStopTimerRef.current) {
      clearTimeout(videoStopTimerRef.current);
      videoStopTimerRef.current = null;
    }
    if (outputRafRef.current) {
      cancelAnimationFrame(outputRafRef.current);
      outputRafRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
    // release the mic immediately so the OS indicator goes dark
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  // driven from parent via mode/recording props
  useEffect(() => {
    if (mode === 'video' || mode === 'boomerang') {
      if (recording) {
        startRecording();
      } else {
        stopRecordingInternal();
      }
    }
  }, [mode, recording, startRecording, stopRecordingInternal]);

  // imperative-ish: parent calls onPhotoCaptured via a refless contract.
  // We expose capture via a small effect that watches a "request" prop.
  // Simpler: also expose on window for the parent to call.
  useEffect(() => {
    (window as any).__ggcCapturePhoto = async () => {
      const blob = await capturePhoto();
      if (blob) onPhotoCaptured(blob);
    };
    return () => {
      delete (window as any).__ggcCapturePhoto;
    };
  }, [capturePhoto, onPhotoCaptured]);

  function openInNewTab() {
    try {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    } catch {
      /* noop */
    }
  }

  function tryEnableVideo() {
    const v = videoRef.current;
    if (!v) return;
    v.play()
      .then(() => {
        setVideoPlaying(true);
        setNeedsTap(false);
      })
      .catch((e) => {
        console.warn('manual play failed:', e);
      });
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />
      {/* film grain overlay */}
      <div className="grain absolute inset-0 pointer-events-none" />

      {/* video-playback gesture required (rare on iOS in iframes) */}
      {!error && needsTap && (
        <button
          onClick={tryEnableVideo}
          className="absolute inset-0 grid place-items-center bg-black/60 text-cream"
        >
          <span className="font-serif italic text-2xl">tap to start camera</span>
        </button>
      )}

      {/* loading hint until the first frame is drawn */}
      {!error && !needsTap && !videoPlaying && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <p className="font-serif italic text-cream/70 text-lg">opening camera…</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
          <div className="max-w-sm">
            <p className="font-serif italic text-cream text-2xl">
              {error.kind === 'iframe-blocked'
                ? 'camera blocked in preview'
                : error.kind === 'permission'
                ? 'camera permission needed'
                : error.kind === 'insecure'
                ? 'https required'
                : 'camera unavailable'}
            </p>
            <p className="mt-4 text-cream/75 text-sm leading-relaxed">
              {error.message}
            </p>

            {(error.kind === 'iframe-blocked' || inIframe) && (
              <button
                onClick={openInNewTab}
                className="mt-6 bg-gold text-ink px-5 py-3 text-xs uppercase tracking-widest"
              >
                open in a new tab
              </button>
            )}

            {error.kind !== 'iframe-blocked' && (
              <button
                onClick={() => window.location.reload()}
                className="mt-6 ml-2 border border-cream/40 text-cream px-5 py-3 text-xs uppercase tracking-widest"
              >
                try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
