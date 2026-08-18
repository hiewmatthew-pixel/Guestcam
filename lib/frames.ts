// Photobooth frame layouts. Each layout takes N captured stills (already
// filtered — they come straight off the WebGL canvas) and composites
// them into a single framed collage image for the couple's gallery.
//
// V1 is photo-only (a strip of stills). A video collage can reuse the
// same layout geometry later by compositing per-frame onto a canvas that
// MediaRecorder captures.

export type FrameId = 'strip' | 'filmstrip' | 'polaroid';

export type FrameDef = {
  id: FrameId;
  label: string;
  blurb: string;
  shots: number; // how many stills the booth captures
};

export const FRAMES: FrameDef[] = [
  { id: 'strip', label: 'Classic strip', blurb: 'three shots · cream border', shots: 3 },
  { id: 'filmstrip', label: 'Film strip', blurb: 'three shots · 35mm sprockets', shots: 3 },
  { id: 'polaroid', label: 'Polaroid', blurb: 'two shots · stacked prints', shots: 2 },
];

export function getFrame(id: FrameId): FrameDef {
  return FRAMES.find((f) => f.id === id) ?? FRAMES[0];
}

const GOLD = '#B8956A';
const CREAM = '#F5F1EA';
const INK = '#1A1A1A';

type EventMeta = { couple_names?: string; wedding_date?: string };

function formatDate(input?: string): string | null {
  if (!input) return null;
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d
      .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
      .replace(/\//g, ' · ');
  } catch {
    return null;
  }
}

// draw an image cropped to fill a target rect (object-fit: cover)
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function loadImages(blobs: Blob[]): Promise<HTMLImageElement[]> {
  return Promise.all(
    blobs.map(
      (b) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(b);
          const img = new Image();
          img.onload = () => {
            resolve(img);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          };
          img.onerror = () => reject(new Error('could not load booth frame'));
          img.src = url;
        }),
    ),
  );
}

/**
 * Compose the captured stills into the chosen frame layout and return a
 * JPEG blob. `blobs.length` should match the layout's `shots`, but the
 * renderers clamp gracefully if there are fewer/more.
 */
export async function composeFrame(
  frameId: FrameId,
  blobs: Blob[],
  event?: EventMeta,
): Promise<Blob> {
  const images = await loadImages(blobs);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  if (frameId === 'filmstrip') renderFilmstrip(ctx, canvas, images, event);
  else if (frameId === 'polaroid') renderPolaroid(ctx, canvas, images, event);
  else renderStrip(ctx, canvas, images, event);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode collage'))),
      'image/jpeg',
      0.92,
    );
  });
}

// ---- Classic vertical strip (2"x6" booth proportions) -----------------
function renderStrip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  images: HTMLImageElement[],
  event?: EventMeta,
) {
  const W = 720;
  const pad = 44; // outer cream border
  const gap = 24; // between frames
  const cellW = W - pad * 2;
  const cellH = Math.round(cellW * 0.82); // each shot slightly landscape
  const shots = Math.max(1, images.length);
  const footer = 150;
  const H = pad + shots * cellH + (shots - 1) * gap + footer;
  canvas.width = W;
  canvas.height = H;

  // cream background
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  images.forEach((img, i) => {
    const y = pad + i * (cellH + gap);
    // thin ink hairline around each shot
    ctx.fillStyle = INK;
    ctx.fillRect(pad - 2, y - 2, cellW + 4, cellH + 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, y, cellW, cellH);
    ctx.clip();
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight, pad, y, cellW, cellH);
    ctx.restore();
  });

  // footer: couple names + date
  const cx = W / 2;
  const footerTop = pad + shots * cellH + (shots - 1) * gap;
  ctx.textAlign = 'center';
  const names = event?.couple_names?.trim();
  const date = formatDate(event?.wedding_date);
  if (names) {
    ctx.fillStyle = INK;
    ctx.font = 'italic 500 46px "Cormorant Garamond", "Times New Roman", serif';
    ctx.fillText(names, cx, footerTop + 70);
  }
  if (date) {
    ctx.fillStyle = GOLD;
    ctx.font = '400 20px "Cormorant Garamond", serif';
    ctx.fillText(spaced(date), cx, footerTop + 106);
  }
}

// ---- Film strip with sprocket holes -----------------------------------
function renderFilmstrip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  images: HTMLImageElement[],
  event?: EventMeta,
) {
  const W = 720;
  const sprocket = 56; // dark rail width on each side
  const pad = 26; // gap between rail and image
  const gap = 20;
  const cellW = W - (sprocket + pad) * 2;
  const cellH = Math.round(cellW * 0.82);
  const shots = Math.max(1, images.length);
  const footer = 130;
  const topPad = 30;
  const H = topPad + shots * cellH + (shots - 1) * gap + footer;
  canvas.width = W;
  canvas.height = H;

  // black film base
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // sprocket holes down both rails
  ctx.fillStyle = CREAM;
  const holeW = 26;
  const holeH = 34;
  const holeGap = 30;
  for (let y = 18; y < H - holeH; y += holeH + holeGap) {
    roundRect(ctx, (sprocket - holeW) / 2, y, holeW, holeH, 6);
    ctx.fill();
    roundRect(ctx, W - sprocket + (sprocket - holeW) / 2, y, holeW, holeH, 6);
    ctx.fill();
  }

  images.forEach((img, i) => {
    const x = sprocket + pad;
    const y = topPad + i * (cellH + gap);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellW, cellH);
    ctx.clip();
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight, x, y, cellW, cellH);
    ctx.restore();
  });

  const cx = W / 2;
  const footerTop = topPad + shots * cellH + (shots - 1) * gap;
  ctx.textAlign = 'center';
  const names = event?.couple_names?.trim();
  const date = formatDate(event?.wedding_date);
  if (names) {
    ctx.fillStyle = CREAM;
    ctx.font = 'italic 500 44px "Cormorant Garamond", "Times New Roman", serif';
    ctx.fillText(names, cx, footerTop + 64);
  }
  if (date) {
    ctx.fillStyle = GOLD;
    ctx.font = '400 19px "Cormorant Garamond", serif';
    ctx.fillText(spaced(date), cx, footerTop + 98);
  }
}

// ---- Two overlapping polaroids ----------------------------------------
function renderPolaroid(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  images: HTMLImageElement[],
  event?: EventMeta,
) {
  const W = 760;
  const H = 900;
  canvas.width = W;
  canvas.height = H;

  // warm paper background
  ctx.fillStyle = '#ECE6DA';
  ctx.fillRect(0, 0, W, H);

  const pol = 360; // polaroid photo square
  const borderX = 26;
  const borderTop = 26;
  const borderBottom = 96; // thick bottom lip
  const cardW = pol + borderX * 2;
  const cardH = pol + borderTop + borderBottom;

  const shots = images.slice(0, 2);
  const placements = [
    { x: W * 0.5 - cardW * 0.86, y: H * 0.18, rot: -0.09 },
    { x: W * 0.5 - cardW * 0.14, y: H * 0.36, rot: 0.07 },
  ];

  shots.forEach((img, i) => {
    const p = placements[i] ?? placements[0];
    ctx.save();
    ctx.translate(p.x + cardW / 2, p.y + cardH / 2);
    ctx.rotate(p.rot);
    ctx.translate(-cardW / 2, -cardH / 2);

    // drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cardW, cardH);
    ctx.shadowColor = 'transparent';

    // photo
    ctx.save();
    ctx.beginPath();
    ctx.rect(borderX, borderTop, pol, pol);
    ctx.clip();
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight, borderX, borderTop, pol, pol);
    ctx.restore();
    ctx.restore();
  });

  // caption in the paper's lower area
  const cx = W / 2;
  ctx.textAlign = 'center';
  const names = event?.couple_names?.trim();
  const date = formatDate(event?.wedding_date);
  if (names) {
    ctx.fillStyle = INK;
    ctx.font = 'italic 500 52px "Cormorant Garamond", "Times New Roman", serif';
    ctx.fillText(names, cx, H - 96);
  }
  if (date) {
    ctx.fillStyle = GOLD;
    ctx.font = '400 22px "Cormorant Garamond", serif';
    ctx.fillText(spaced(date), cx, H - 56);
  }
}

// letter-spacing helper (2D context letterSpacing is uneven across browsers)
function spaced(s: string): string {
  return s.split('').join(' ');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
