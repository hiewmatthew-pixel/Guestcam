'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 60;

type Phase = 'idle' | 'recording' | 'preview';

type Props = {
  guestName?: string;
  onSubmit: (blob: Blob, durationSec: number) => Promise<void>;
  onCancel: () => void;
};

export default function VoiceRecorder({ guestName, onSubmit, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // tear down on unmount
  useEffect(() => {
    return () => {
      stopAllInternal();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllInternal() {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickRef.current) {
      window.cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find((c) => {
        try {
          return MediaRecorder.isTypeSupported(c);
        } catch {
          return false;
        }
      });
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const out = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const url = URL.createObjectURL(out);
        setBlob(out);
        setPreviewUrl(url);
        setPhase('preview');
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start(250);
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase('recording');

      // tick the elapsed counter
      const tick = () => {
        const sec = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(sec);
        if (sec < MAX_SECONDS) tickRef.current = requestAnimationFrame(tick);
      };
      tickRef.current = requestAnimationFrame(tick);

      stopTimerRef.current = window.setTimeout(() => {
        stop();
      }, MAX_SECONDS * 1000) as unknown as number;
    } catch (e: any) {
      setError(e?.message || 'Could not start the microphone.');
    }
  }, []);

  const stop = useCallback(() => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickRef.current) {
      window.cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
    setPhase('idle');
  }

  async function submit() {
    if (!blob) return;
    setSubmitting(true);
    try {
      await onSubmit(blob, elapsed);
    } catch (e: any) {
      setError(e?.message || 'Could not send your voice note.');
    } finally {
      setSubmitting(false);
    }
  }

  const progress = Math.min(elapsed / MAX_SECONDS, 1);

  return (
    <div className="bg-cream text-ink rounded-sm border border-warm-gray-light p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink/60">
          leave a voice note {guestName && <span className="lowercase">— {guestName}</span>}
        </p>
        <button
          type="button"
          onClick={() => {
            stopAllInternal();
            onCancel();
          }}
          className="text-[10px] uppercase tracking-widest text-ink/45 hover:text-ink"
        >
          close
        </button>
      </div>

      {error && (
        <p className="mb-4 text-xs text-red-700">{error}</p>
      )}

      {phase === 'idle' && (
        <div className="text-center py-4">
          <p className="font-serif italic text-2xl text-ink leading-tight">
            tap to record a short message
            <br />
            <span className="text-ink/60">for the couple</span>
          </p>
          <p className="mt-3 text-[11px] uppercase tracking-widest text-ink/45">
            up to one minute
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-8 w-20 h-20 mx-auto rounded-full bg-gold grid place-items-center shadow-sm hover:scale-[1.03] transition-transform"
            aria-label="start recording"
          >
            <span className="block w-8 h-8 rounded-full bg-red-500" />
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="text-center py-4">
          <RecordingRing progress={progress} />
          <p className="mt-6 font-serif italic text-3xl tabular-nums">
            {formatSeconds(elapsed)}
            <span className="text-ink/40"> / 1:00</span>
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-widest text-red-600">
            ● recording
          </p>
          <button
            type="button"
            onClick={stop}
            className="mt-8 w-20 h-20 mx-auto rounded-full bg-ink text-cream grid place-items-center"
            aria-label="stop recording"
          >
            <span className="block w-6 h-6 rounded-sm bg-cream" />
          </button>
        </div>
      )}

      {phase === 'preview' && previewUrl && (
        <div className="text-center py-2">
          <p className="font-serif italic text-xl text-ink/75">
            give it a listen
          </p>
          <audio
            controls
            src={previewUrl}
            className="mt-4 w-full"
          />
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={discard}
              disabled={submitting}
              className="text-[10px] uppercase tracking-widest text-ink/55 hover:text-ink px-4 py-2 disabled:opacity-60"
            >
              re-record
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="bg-gold text-ink px-6 py-3 rounded-sm text-[10px] uppercase tracking-widest disabled:opacity-60"
            >
              {submitting ? 'sending…' : 'send to the couple'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecordingRing({ progress }: { progress: number }) {
  const size = 120;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  return (
    <svg width={size} height={size} className="mx-auto block">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#1A1A1A22"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#B8956A"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function formatSeconds(sec: number) {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
