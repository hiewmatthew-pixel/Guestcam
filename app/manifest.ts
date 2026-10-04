import type { MetadataRoute } from 'next';
import { BRAND } from './pwa-icons/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'GlanceCam · Golden Glance',
    short_name: 'GlanceCam',
    description:
      'Capture film-look photos and short videos for the couple — one shared gallery, kept forever.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND.ink,
    theme_color: BRAND.ink,
    icons: [
      { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
