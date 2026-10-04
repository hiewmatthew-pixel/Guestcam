import { renderMonogram } from './pwa-icons/brand';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Full-bleed square: iOS applies its own rounded mask.
export default function AppleIcon() {
  return renderMonogram({ size: 180, scale: 0.46 });
}
