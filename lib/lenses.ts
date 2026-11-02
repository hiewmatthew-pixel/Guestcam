// Which camera lenses a phone exposes to the browser, as the chips a
// native camera app shows (0.5x, 1x, zoom). Browsers only reveal device
// labels after camera permission is granted, so this runs once the
// camera is open.
//
// iPhones name their lenses ("Back Ultra Wide Camera", "Back Telephoto
// Camera"). Android usually names them "camera2 0, facing back" with no
// hint of focal length: extra back lenses get plain numbered chips, and a
// phone that exposes a single back camera with a zoom range gets zoom
// steps instead (see zoomSteps).

export type Facing = 'user' | 'environment';
export type LensKind = 'ultra' | 'wide' | 'tele' | 'other';
export type Lens = { deviceId: string; label: string; kind: LensKind; chip: string };

const FRONT_RE = /front|facing front|user|selfie|true ?depth/i;
const BACK_RE = /back|rear|facing back|environment|world/i;
// iOS virtual cameras switch lenses on their own; listing them alongside
// the real lenses would just duplicate them
const VIRTUAL_RE = /dual|triple|desk ?view/i;

export function lensFacing(label: string): Facing | null {
  if (FRONT_RE.test(label)) return 'user';
  if (BACK_RE.test(label)) return 'environment';
  return null;
}

function kindOf(label: string): LensKind {
  if (/ultra ?wide|0\.5/i.test(label)) return 'ultra';
  if (/tele/i.test(label)) return 'tele';
  if (/^(back|front|rear)( camera)?$/i.test(label.trim()) || /\bwide\b/i.test(label)) return 'wide';
  return 'other';
}

const ORDER: Record<LensKind, number> = { ultra: 0, wide: 1, other: 2, tele: 3 };

/**
 * The lenses for one side of the phone, widest first. Returns [] when
 * there's nothing to choose between (one lens, or labels hidden).
 */
export function lensesFor(devices: { deviceId: string; label: string; kind?: string }[], facing: Facing): Lens[] {
  const cams = devices.filter((d) => (!d.kind || d.kind === 'videoinput') && d.deviceId && d.label);
  const known = cams.filter((d) => lensFacing(d.label) !== null);
  // laptops / webcams report no facing at all: treat them all as one side
  const pool = known.length ? known.filter((d) => lensFacing(d.label) === facing) : cams;
  const real = pool.filter((d) => !VIRTUAL_RE.test(d.label));
  if (real.length < 2) return [];

  const named = real.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: kindOf(d.label) }));
  const anyNamed = named.some((l) => l.kind === 'ultra' || l.kind === 'tele');
  if (!anyNamed) {
    // Android: "camera2 0, facing back", "camera2 2, facing back"…
    // keep the system's order; the first is the main camera
    const byIndex = [...named].sort((a, b) => cameraIndex(a.label) - cameraIndex(b.label));
    return byIndex.map((l, i) => ({ ...l, kind: i === 0 ? 'wide' : 'other', chip: i === 0 ? '1×' : `lens ${i + 1}` }));
  }
  return named
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
    // the ultra-wide (0.5x on iPhone) is what guests call "wide"
    .map((l) => ({ ...l, chip: l.kind === 'ultra' ? 'wide' : l.kind === 'tele' ? 'zoom' : l.kind === 'wide' ? '1×' : 'lens' }));
}

function cameraIndex(label: string): number {
  // "camera2 0, facing back" -> 0 (not the 2 in the API name "camera2")
  const m = /camera\d*\s+(\d+)/i.exec(label) ?? /(\d+)\s*,/.exec(label) ?? /(\d+)/.exec(label);
  return m ? Number(m[1]) : 99;
}

/** Zoom chips for a camera that reports a zoom range (mostly Android Chrome). */
export function zoomSteps(range: { min?: number; max?: number } | undefined): number[] {
  if (!range || !range.max || !range.min || range.max < 2) return [];
  const steps = new Set<number>();
  if (range.min < 0.95) steps.add(Math.round(range.min * 10) / 10);
  steps.add(1);
  for (const z of [2, 3, 5]) if (z <= range.max) steps.add(z);
  return [...steps].filter((z) => z >= range.min! && z <= range.max!).sort((a, b) => a - b);
}

/** Below 1x is the ultra-wide lens: labelled "wide", like the iPhone chips. */
export const zoomChip = (z: number) => (z < 1 ? 'wide' : `${Number.isInteger(z) ? z : z.toFixed(1)}×`);
