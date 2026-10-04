import { renderMonogram } from './pwa-icons/brand';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return renderMonogram({ size: 32, scale: 0.6, radius: 6 });
}
