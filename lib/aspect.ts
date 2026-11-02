// Photo / video shapes guests can pick, like a phone camera's ratio
// button. Ratios are written for a phone held upright (3:4 = taller than
// wide) and flip automatically when the camera frame is landscape.

export const ASPECTS = ['3:4', '4:5', '1:1', '9:16', 'full'] as const;
export type AspectKey = (typeof ASPECTS)[number];
export const DEFAULT_ASPECT: AspectKey = '3:4';

const PORTRAIT_RATIO: Record<Exclude<AspectKey, 'full'>, number> = {
  '3:4': 3 / 4,
  '4:5': 4 / 5,
  '1:1': 1,
  '9:16': 9 / 16,
};

/** Width / height for this shape, given the camera frame's orientation. null = keep the full frame. */
export function aspectRatio(key: AspectKey, portrait: boolean): number | null {
  if (key === 'full') return null;
  const r = PORTRAIT_RATIO[key];
  return portrait ? r : 1 / r;
}

/** The label as the guest should read it ("3:4" upright, "4:3" sideways). */
export function aspectLabel(key: AspectKey, portrait: boolean): string {
  if (key === 'full' || key === '1:1' || portrait) return key;
  const [a, b] = key.split(':');
  return `${b}:${a}`;
}

export function nextAspect(key: AspectKey): AspectKey {
  return ASPECTS[(ASPECTS.indexOf(key) + 1) % ASPECTS.length];
}

/** The centred crop of a w × h frame with the given ratio (even sizes, for video encoders). */
export function cropRect(w: number, h: number, ratio: number | null) {
  if (!ratio || !w || !h) return { x: 0, y: 0, w, h };
  let cw = w;
  let ch = h;
  if (w / h > ratio) cw = h * ratio;
  else ch = w / ratio;
  cw = Math.max(2, Math.floor(cw / 2) * 2);
  ch = Math.max(2, Math.floor(ch / 2) * 2);
  return { x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), w: cw, h: ch };
}
