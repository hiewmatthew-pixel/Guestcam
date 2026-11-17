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
const MAX_SCALE = 4;
const START_SCALE = 1;
const ROTATE_STEP = Math.PI / 12; // 15°
// On-screen size at scale 1, as a share of the photo's height. lib/composite
// uses the same proportions (110/800 for emoji, 140/800 for stickers), so
// what the guest sees is what gets saved.
const EMOJI_UNIT = 110 / 800;
const STICKER_UNIT = 140 / 800;

const clampScale = (v: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type Pt = { x: number; y: number };
const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);

// What the pointers on the photo are doing right now.
type Gesture =
  | { mode: 'idle' }
  | { mode: 'tap-photo'; start: Pt } // may become a deselect
  | { mode: 'drag'; uid: string; start: Pt; origX: number; origY: number }
  | { mode: 'pinch'; uid: string; dist: number; ang: number; scale: number; rotation: number }
  | { mode: 'handle'; uid: string; center: Pt; dist: number; ang: number; scale: number; rotation: number };

export default function StickerEditor({ src, set, event, initial, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [placed, setPlaced] = useState<PlacedSticker[]>(initial ?? []);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [photoH, setPhotoH] = useState(0);

  const library = useMemo(() => getStickersForSet(set), [set]);
  const active = placed.find((p) => p.uid === activeUid) ?? null;

  useEffect(() => {
    onChange?.(placed);
  }, [placed, onChange]);

  // stickers are sized against the photo as shown, so track its height
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setPhotoH(img.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => ro.disconnect();
  }, [src]);

  function place(sticker: { kind: 'library'; id: StickerId } | { kind: 'emoji'; emoji: string }) {
    if (placed.length >= MAX_STICKERS) return;
    const next = { ...sticker, uid: uid(), x: 0.5, y: 0.5, scale: START_SCALE, rotation: 0 } as PlacedSticker;
    setPlaced((p) => [...p, next]);
    setActiveUid(next.uid);
    setTrayOpen(false);
  }

  function addSticker(s: StickerDef) {
    place({ kind: 'library', id: s.id });
  }

  function addEmoji(emoji: string) {
    const trimmed = emoji.trim();
    if (trimmed) place({ kind: 'emoji', emoji: trimmed });
  }

  function update(uidToChange: string, patch: Partial<Pick<PlacedSticker, 'x' | 'y' | 'scale' | 'rotation'>>) {
    setPlaced((arr) => arr.map((s) => (s.uid === uidToChange ? ({ ...s, ...patch } as PlacedSticker) : s)));
  }

  function removeSticker(uidToRemove: string) {
    setPlaced((p) => p.filter((s) => s.uid !== uidToRemove));
    if (activeUid === uidToRemove) setActiveUid(null);
  }

  function clearAll() {
    setPlaced([]);
    setActiveUid(null);
  }

  // --- gestures ---------------------------------------------------------
  // One finger on a sticker moves it. Two fingers ANYWHERE on the photo
  // resize + rotate the selected sticker (no need to land both on a small
  // emoji). The ⤡ corner handle does the same with one finger or a mouse.
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture>({ mode: 'idle' });

  function startPinch(targetUid: string) {
    const s = placed.find((p) => p.uid === targetUid);
    const [a, b] = Array.from(pointers.current.values());
    if (!s || !a || !b) return;
    gesture.current = { mode: 'pinch', uid: targetUid, dist: distance(a, b), ang: angle(a, b), scale: s.scale, rotation: s.rotation };
  }

  function onPointerDown(e: React.PointerEvent) {
    const pt = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, pt);
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const target = e.target as HTMLElement;
    const handleUid = target.closest<HTMLElement>('[data-handle]')?.dataset.handle;
    const stickerUid = target.closest<HTMLElement>('[data-uid]')?.dataset.uid;

    if (pointers.current.size >= 2) {
      const g = gesture.current;
      const targetUid = g.mode === 'drag' || g.mode === 'handle' ? g.uid : activeUid;
      if (targetUid) startPinch(targetUid);
      return;
    }
    if (handleUid) {
      const s = placed.find((p) => p.uid === handleUid);
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-uid="${handleUid}"]`);
      if (!s || !el) return;
      const r = el.getBoundingClientRect();
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      gesture.current = {
        mode: 'handle',
        uid: handleUid,
        center,
        dist: Math.max(distance(center, pt), 1),
        ang: angle(center, pt),
        scale: s.scale,
        rotation: s.rotation,
      };
      return;
    }
    if (stickerUid) {
      const s = placed.find((p) => p.uid === stickerUid);
      if (!s) return;
      setActiveUid(stickerUid);
      gesture.current = { mode: 'drag', uid: stickerUid, start: pt, origX: s.x, origY: s.y };
      return;
    }
    gesture.current = { mode: 'tap-photo', start: pt };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, pt);
    const g = gesture.current;
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      update(g.uid, {
        scale: clampScale(g.scale * (distance(a, b) / Math.max(g.dist, 1))),
        rotation: g.rotation + (angle(a, b) - g.ang),
      });
    } else if (g.mode === 'handle') {
      update(g.uid, {
        scale: clampScale(g.scale * (distance(g.center, pt) / g.dist)),
        rotation: g.rotation + (angle(g.center, pt) - g.ang),
      });
    } else if (g.mode === 'drag') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      update(g.uid, {
        x: Math.max(0, Math.min(1, g.origX + (pt.x - g.start.x) / rect.width)),
        y: Math.max(0, Math.min(1, g.origY + (pt.y - g.start.y) / rect.height)),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const last = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      // a plain tap on the photo (no drag, no pinch) puts the sticker down
      if (g.mode === 'tap-photo' && last && distance(last, g.start) < 8) setActiveUid(null);
      gesture.current = { mode: 'idle' };
      return;
    }
    if (g.mode === 'pinch') {
      // one finger still down: carry on moving from where it is
      const [remain] = Array.from(pointers.current.values());
      const s = placed.find((p) => p.uid === g.uid);
      gesture.current = s ? { mode: 'drag', uid: g.uid, start: remain, origX: s.x, origY: s.y } : { mode: 'idle' };
    }
  }

  if (!set || library.length === 0) {
    // nothing to do — render the image plain
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="max-h-[max(200px,calc(100dvh-340px))] short:max-h-[55dvh] max-w-full w-auto" />;
  }

  const describeSticker = (s: PlacedSticker) =>
    s.kind === 'emoji' ? s.emoji : library.find((l) => l.id === s.id)?.label ?? 'sticker';

  return (
    <div className="relative inline-block max-w-full">
      <div
        ref={containerRef}
        className="relative block w-fit mx-auto max-w-full select-none"
        style={{ touchAction: placed.length ? 'none' : 'auto' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt=""
          onLoad={(e) => setPhotoH(e.currentTarget.getBoundingClientRect().height)}
          className="block max-h-[max(200px,calc(100dvh-340px))] short:max-h-[55dvh] max-w-full w-auto pointer-events-none select-none"
          draggable={false}
        />

        {placed.map((s) => {
          const isActive = activeUid === s.uid;
          const h = photoH || 400;
          let inner: React.ReactNode = null;
          if (s.kind === 'emoji') {
            inner = (
              <span
                className="block select-none pointer-events-none leading-none"
                style={{ fontSize: h * EMOJI_UNIT * s.scale }}
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
                className="block select-none pointer-events-none max-w-none"
                style={{ height: h * STICKER_UNIT * s.scale, width: 'auto' }}
              />
            );
          }
          return (
            <div
              key={s.uid}
              data-uid={s.uid}
              style={{
                position: 'absolute',
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${s.rotation}rad)`,
                cursor: 'grab',
              }}
              className={`p-2 rounded-sm ${isActive ? 'outline-dashed outline-2 outline-gold z-10' : ''}`}
            >
              {inner}
              {isActive && (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSticker(s.uid);
                    }}
                    className="absolute -top-4 -left-4 w-8 h-8 rounded-full bg-cream text-ink text-base leading-none grid place-items-center border border-ink/30 shadow before:absolute before:-inset-1.5 before:content-['']"
                    aria-label={`remove ${describeSticker(s)}`}
                  >
                    ×
                  </button>
                  <span
                    data-handle={s.uid}
                    aria-hidden
                    className="absolute -bottom-4 -right-4 w-8 h-8 rounded-full bg-gold text-ink text-base leading-none grid place-items-center border border-cream shadow before:absolute before:-inset-1.5 before:content-['']"
                    style={{ cursor: 'nwse-resize', touchAction: 'none' }}
                  >
                    ⤡
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* size / rotate controls for the selected sticker: a reliable
          alternative to gestures, and the only way by keyboard */}
      {active && (
        <div
          role="group"
          aria-label={`adjust ${describeSticker(active)}`}
          className="mt-3 rounded-sm border border-cream/15 bg-black/30 px-3 py-2 text-cream"
        >
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[10px] uppercase tracking-widest text-cream/70">size</span>
            <button
              type="button"
              onClick={() => update(active.uid, { scale: clampScale(active.scale / 1.15) })}
              className="w-11 h-11 shrink-0 grid place-items-center rounded-full border border-cream/30 text-lg leading-none"
              aria-label="smaller"
            >
              −
            </button>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={active.scale}
              onChange={(e) => update(active.uid, { scale: clampScale(Number(e.target.value)) })}
              aria-label="size"
              className="flex-1 min-w-0 h-11 accent-[#B8956A]"
            />
            <button
              type="button"
              onClick={() => update(active.uid, { scale: clampScale(active.scale * 1.15) })}
              className="w-11 h-11 shrink-0 grid place-items-center rounded-full border border-cream/30 text-lg leading-none"
              aria-label="bigger"
            >
              +
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="w-12 shrink-0 text-[10px] uppercase tracking-widest text-cream/70">rotate</span>
            <button
              type="button"
              onClick={() => update(active.uid, { rotation: active.rotation - ROTATE_STEP })}
              className="w-11 h-11 grid place-items-center rounded-full border border-cream/30 text-lg leading-none"
              aria-label="rotate left"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={() => update(active.uid, { rotation: active.rotation + ROTATE_STEP })}
              className="w-11 h-11 grid place-items-center rounded-full border border-cream/30 text-lg leading-none"
              aria-label="rotate right"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={() => update(active.uid, { rotation: 0, scale: START_SCALE })}
              className="min-h-11 px-2 text-[10px] uppercase tracking-widest text-cream/75 hover:text-cream"
            >
              reset
            </button>
            <button
              type="button"
              onClick={() => setActiveUid(null)}
              className="ml-auto min-h-11 px-3 rounded-full bg-gold text-ink text-[10px] uppercase tracking-widest"
            >
              done
            </button>
          </div>
        </div>
      )}

      {/* Tray buttons + emoji input (always visible) */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTrayOpen((v) => !v)}
          aria-expanded={trayOpen}
          className="min-h-11 text-[10px] uppercase tracking-widest"
        >
          <span className="border-b border-gold pb-0.5">
            {trayOpen ? 'close stickers' : `add a sticker (${placed.length}/${MAX_STICKERS})`}
          </span>
        </button>
        {placed.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 px-1 text-[10px] uppercase tracking-widest text-cream/65 hover:text-cream"
          >
            clear all
          </button>
        )}
      </div>

      <EmojiPicker
        disabled={placed.length >= MAX_STICKERS}
        onPick={addEmoji}
      />

      {placed.length > 0 && (
        <p className="mt-2 text-[10px] uppercase tracking-widest text-cream/65">
          {active
            ? 'drag to move · pinch anywhere on the photo, or drag ⤡, to resize & turn'
            : 'tap a sticker to move, resize or turn it'}
        </p>
      )}

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
                  aria-label={`add ${def.label} sticker`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-w-full max-h-full" />
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
          'flex-1 flex items-center gap-2 bg-cream text-ink rounded-sm px-3 py-2 border border-gold/60 focus-within:ring-2 focus-within:ring-gold-deep focus-within:ring-offset-1',
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
          placeholder="pick an emoji from your keyboard"
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
          className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-ink/70 focus:outline-none focus-visible:outline-none text-base tracking-wide"
          aria-label="emoji input"
        />
      </div>
    </div>
  );
}

