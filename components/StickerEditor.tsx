'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type StickerDef,
  type StickerId,
  getStickersForSet,
  renderStickerSvg,
  stickerToDataUrl,
} from '@/lib/stickers';
import type { StickerSetId } from '@/lib/tiers';

export type PlacedSticker = {
  uid: string;             // unique placement id
  x: number;               // 0..1 (normalized to image width)
  y: number;               // 0..1 (normalized to image height)
  scale: number;           // 0.1..2 ish
  rotation: number;        // radians
} & (
  | { kind: 'library'; id: StickerId }
  | { kind: 'emoji'; emoji: string }
);

type Props = {
  // photo to overlay on
  src: string;
  // bounds for the sticker library
  set: StickerSetId | null;
  // event metadata for custom stickers
  event?: { couple_names?: string; wedding_date?: string };
  // existing placements (for re-edit)
  initial?: PlacedSticker[];
  // called whenever placements change
  onChange?: (placed: PlacedSticker[]) => void;
};

const MAX_STICKERS = 5;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function angle(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export default function StickerEditor({ src, set, event, initial, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<PlacedSticker[]>(initial ?? []);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  const library = useMemo(() => getStickersForSet(set), [set]);

  useEffect(() => {
    onChange?.(placed);
  }, [placed, onChange]);

  function addSticker(s: StickerDef) {
    if (placed.length >= MAX_STICKERS) return;
    const next: PlacedSticker = {
      uid: uid(),
      kind: 'library',
      id: s.id,
      x: 0.5,
      y: 0.5,
      scale: 0.6,
      rotation: 0,
    };
    setPlaced((p) => [...p, next]);
    setActiveUid(next.uid);
    setTrayOpen(false);
  }

  function addEmoji(emoji: string) {
    if (placed.length >= MAX_STICKERS) return;
    const trimmed = emoji.trim();
    if (!trimmed) return;
    const next: PlacedSticker = {
      uid: uid(),
      kind: 'emoji',
      emoji: trimmed,
      x: 0.5,
      y: 0.5,
      scale: 0.6,
      rotation: 0,
    };
    setPlaced((p) => [...p, next]);
    setActiveUid(next.uid);
    setTrayOpen(false);
  }

  function removeSticker(uidToRemove: string) {
    setPlaced((p) => p.filter((s) => s.uid !== uidToRemove));
    if (activeUid === uidToRemove) setActiveUid(null);
  }

  function clearAll() {
    setPlaced([]);
    setActiveUid(null);
  }

  // pointer/touch handling for a single sticker
  const dragStateRef = useRef<{
    uid: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    twoFingers: boolean;
    initialDistance: number;
    initialAngle: number;
    initialScale: number;
    initialRotation: number;
    points: Map<number, { x: number; y: number }>;
  } | null>(sloppy());

  function sloppy(): null { return null; }

  function rectOf(): DOMRect | null {
    return containerRef.current?.getBoundingClientRect() ?? null;
  }

  function onPointerDown(e: React.PointerEvent, uidStart: string) {
    e.stopPropagation();
    setActiveUid(uidStart);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rect = rectOf();
    if (!rect) return;
    const s = placed.find((p) => p.uid === uidStart);
    if (!s) return;
    const points =
      dragStateRef.current?.uid === uidStart
        ? dragStateRef.current.points
        : new Map<number, { x: number; y: number }>();
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (points.size === 2) {
      const [a, b] = Array.from(points.values());
      dragStateRef.current = {
        uid: uidStart,
        startX: 0,
        startY: 0,
        origX: s.x,
        origY: s.y,
        twoFingers: true,
        initialDistance: distance(a, b),
        initialAngle: angle(a, b),
        initialScale: s.scale,
        initialRotation: s.rotation,
        points,
      };
    } else {
      dragStateRef.current = {
        uid: uidStart,
        startX: e.clientX,
        startY: e.clientY,
        origX: s.x,
        origY: s.y,
        twoFingers: false,
        initialDistance: 0,
        initialAngle: 0,
        initialScale: s.scale,
        initialRotation: s.rotation,
        points,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragStateRef.current;
    if (!drag) return;
    if (!drag.points.has(e.pointerId)) return;
    drag.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = rectOf();
    if (!rect) return;

    if (drag.points.size >= 2 && !drag.twoFingers) {
      // upgrade to two-finger gesture
      const [a, b] = Array.from(drag.points.values());
      drag.twoFingers = true;
      drag.initialDistance = distance(a, b);
      drag.initialAngle = angle(a, b);
      const cur = placed.find((p) => p.uid === drag.uid);
      drag.initialScale = cur?.scale ?? 1;
      drag.initialRotation = cur?.rotation ?? 0;
    }

    if (drag.twoFingers && drag.points.size >= 2) {
      const [a, b] = Array.from(drag.points.values());
      const d = distance(a, b);
      const ang = angle(a, b);
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, drag.initialScale * (d / Math.max(drag.initialDistance, 1))),
      );
      const newRot = drag.initialRotation + (ang - drag.initialAngle);
      setPlaced((arr) =>
        arr.map((s) => (s.uid === drag.uid ? { ...s, scale: newScale, rotation: newRot } : s)),
      );
    } else {
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const nx = Math.max(0, Math.min(1, drag.origX + dx));
      const ny = Math.max(0, Math.min(1, drag.origY + dy));
      setPlaced((arr) =>
        arr.map((s) => (s.uid === drag.uid ? { ...s, x: nx, y: ny } : s)),
      );
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragStateRef.current;
    if (!drag) return;
    drag.points.delete(e.pointerId);
    if (drag.points.size === 0) {
      dragStateRef.current = null;
    } else if (drag.points.size < 2) {
      drag.twoFingers = false;
      // reset baseline for whichever pointer remains
      const [remain] = Array.from(drag.points.values());
      drag.startX = remain.x;
      drag.startY = remain.y;
      const cur = placed.find((p) => p.uid === drag.uid);
      drag.origX = cur?.x ?? 0.5;
      drag.origY = cur?.y ?? 0.5;
    }
  }

  if (!set || library.length === 0) {
    // nothing to do — render the image plain
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="max-h-[70vh] w-auto" />;
  }

  return (
    <div className="relative inline-block max-w-full">
      <div
        ref={containerRef}
        className="relative inline-block max-w-full"
        onPointerDown={() => setActiveUid(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="block max-h-[70vh] w-auto pointer-events-none select-none"
          draggable={false}
        />

        {placed.map((s) => {
          const isActive = activeUid === s.uid;
          let inner: React.ReactNode = null;
          if (s.kind === 'emoji') {
            inner = (
              <span
                className="block select-none pointer-events-none leading-none"
                style={{ fontSize: 110 }}
              >
                {s.emoji}
              </span>
            );
          } else {
            const def = library.find((l) => l.id === s.id);
            if (!def) return null;
            const url = stickerToDataUrl(renderStickerSvg(def, event), def.tone);
            inner = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={def.label}
                draggable={false}
                className="block select-none pointer-events-none"
                style={{ width: 140, height: 'auto' }}
              />
            );
          }
          return (
            <div
              key={s.uid}
              onPointerDown={(e) => onPointerDown(e, s.uid)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: 'absolute',
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${s.rotation}rad) scale(${s.scale})`,
                touchAction: 'none',
                cursor: 'grab',
              }}
              className={isActive ? 'outline outline-1 outline-gold/80' : ''}
            >
              {inner}
              {isActive && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSticker(s.uid);
                  }}
                  className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-cream text-ink text-xs grid place-items-center border border-ink/30"
                  aria-label="remove sticker"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Tray buttons + emoji input (always visible) */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTrayOpen((v) => !v)}
          className="text-[10px] uppercase tracking-widest border-b border-gold pb-0.5"
        >
          {trayOpen ? 'close stickers' : `add a sticker (${placed.length}/${MAX_STICKERS})`}
        </button>
        {placed.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] uppercase tracking-widest text-cream/60 hover:text-cream"
          >
            clear all
          </button>
        )}
      </div>

      <EmojiPicker
        disabled={placed.length >= MAX_STICKERS}
        onPick={addEmoji}
      />

      <p className="mt-2 text-[10px] uppercase tracking-widest text-cream/40">
        drag · pinch to resize · two fingers to rotate
      </p>

      {trayOpen && (
        <div className="mt-3 p-2 bg-black/40 rounded-sm">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
            {library.map((def) => {
              const url = stickerToDataUrl(renderStickerSvg(def, event), def.tone);
              const disabled = placed.length >= MAX_STICKERS;
              return (
                <button
                  key={def.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => addSticker(def)}
                  className="aspect-square bg-cream/95 rounded-sm grid place-items-center p-2 disabled:opacity-40"
                  title={def.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={def.label} className="max-w-full max-h-full" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EmojiPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (emoji: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-3 flex items-stretch gap-2">
      <div
        className={[
          'flex-1 flex items-center gap-2 bg-cream text-ink rounded-sm px-3 py-2 border border-gold/60',
          disabled ? 'opacity-40 pointer-events-none' : '',
        ].join(' ')}
      >
        <span className="text-xl leading-none" aria-hidden>
          😊
        </span>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="tap and pick an emoji from your keyboard"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            // any non-whitespace input -> place it and clear
            if (next && next.trim().length > 0) {
              onPick(next);
              setValue('');
            }
          }}
          className="flex-1 bg-transparent text-ink placeholder:text-ink/45 outline-none text-[12px] tracking-wide"
          aria-label="emoji input"
        />
      </div>
    </div>
  );
}

