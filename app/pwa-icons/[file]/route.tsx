import { renderMonogram } from '../brand';

// Static PNG icons referenced by app/manifest.ts:
//   /pwa-icons/icon-192.png, /pwa-icons/icon-512.png, /pwa-icons/maskable-512.png
const ICONS: Record<string, { size: number; scale: number }> = {
  'icon-192.png': { size: 192, scale: 0.5 },
  'icon-512.png': { size: 512, scale: 0.5 },
  // Maskable: keep the glyphs well inside the 80% safe zone.
  'maskable-512.png': { size: 512, scale: 0.36 },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export function GET(_req: Request, { params }: { params: { file: string } }) {
  const icon = ICONS[params.file];
  if (!icon) return new Response('Not found', { status: 404 });
  return renderMonogram(icon);
}
