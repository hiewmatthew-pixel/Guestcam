/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseOrigin = (() => {
  try { return supabaseUrl ? new URL(supabaseUrl).origin : ''; } catch { return ''; }
})();

// Content Security Policy. Strict-ish — allows our own bundles + Supabase
// for storage/realtime + Google Fonts (used by next/font) + data: blobs
// (used by the demo store to inline media into <img>).
// Google Analytics (opt-in) runs only on the public marketing pages, so
// only they may talk to Google; cameras, galleries and portals can't.
const GA_SCRIPT = 'https://www.googletagmanager.com';
const GA_CONNECT = 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com';
const buildCsp = (analytics) => [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${analytics ? ` ${GA_SCRIPT}` : ''}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src 'self' data: blob: ${supabaseOrigin}${analytics ? ` ${GA_CONNECT}` : ''}`,
  `media-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https:', 'wss:')}${analytics ? ` ${GA_CONNECT}` : ''}`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].filter(Boolean).join('; ');
const csp = buildCsp(false);
const PUBLIC_PAGES = ['/', '/pricing', '/terms', '/privacy'];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async rewrites() {
    // Browsers and crawlers still probe /favicon.ico directly; serve the
    // generated PNG icon (app/icon.tsx) there instead of a 404.
    return [{ source: '/favicon.ico', destination: '/icon' }];
  },
  async headers() {
    return [
      // global security headers
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // public marketing pages: same headers, plus Google Analytics (last match wins)
      ...PUBLIC_PAGES.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: buildCsp(true) }],
      })),
      // service worker: always revalidate so new deploys are picked up promptly
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      // private portal pages: don't leak the magic-link token via Referer
      {
        source: '/event/:slug/portal/:token*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
