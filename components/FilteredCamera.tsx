'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterId, VERTEX_SHADER, getFilter } from '@/lib/filters';

type Props = {
  filter: FilterId;
  facing: 'user' | 'environment';
  onPhotoCaptured: (blob: Blob) => void;
  onVideoCaptured: (blob: Blob) => void;
  mode: 'photo' | 'video';
  recording: boolean;
  onRecorderError?: (msg: string) => void;
  onWebGLUnavailable?: () => void;
};

const MAX_VIDEO_SECONDS = 15;
const MAX_VIDEO_HEIGHT = 720;

export type FilteredCameraHandle = {
  capturePhoto: () => Promise<Blob | null>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
};

export default function FilteredCamera({
  filter,
  facing,
  onPhotoCaptured,
  onVideoCaptured,
  mode,
  recording,
  onRecorderError,
  onWebGLUnavailable,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const currentFilterRef = useRef<FilterId>(filter);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoStopTimerRef = useRef<number | null>(null);

  const [glReady, setGlReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('WebGL not available — filters disabled on this device.');
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
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera API not supported in this browser.');
          return;
        }
        // stop previous
        streamRef.current?.getTracks().forEach((t) => t.stop());

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
        await v.play().catch(() => {});
        videoRef.current = v;
      } catch (e: any) {
        console.warn('camera open failed:', e);
        setError(e?.message || 'Could not access camera. Check browser permissions.');
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
          gl.uniform1f(uTime, (performance.now() - startedAtRef.current) / 1000);
          gl.uniform2f(uRes, vw, vh);

          gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    // capture the visible (filtered) canvas as a stream
    const captureStream =
      (canvas as any).captureStream?.(30) as MediaStream | undefined;
    if (!captureStream) {
      onRecorderError?.('Video recording not supported on this device.');
      return;
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

    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      onVideoCaptured(blob);
    };
    recorder.start(250);
    recorderRef.current = recorder;

    if (videoStopTimerRef.current) clearTimeout(videoStopTimerRef.current);
    videoStopTimerRef.current = window.setTimeout(() => {
      stopRecordingInternal();
    }, MAX_VIDEO_SECONDS * 1000);
  }, [onRecorderError, onVideoCaptured]);

  const stopRecordingInternal = useCallback(() => {
    if (videoStopTimerRef.current) {
      clearTimeout(videoStopTimerRef.current);
      videoStopTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }, []);

  // driven from parent via mode/recording props
  useEffect(() => {
    if (mode === 'video') {
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

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />
      {/* film grain overlay */}
      <div className="grain absolute inset-0 pointer-events-none" />
      {error && (
        <div className="absolute inset-x-0 top-0 p-4 text-xs text-cream/90 text-center bg-black/60">
          {error}
        </div>
      )}
    </div>
  );
}
