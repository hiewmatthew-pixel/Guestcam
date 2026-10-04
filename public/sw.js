/* GlanceCam service worker.
 *
 * Deliberately conservative for a camera/upload app:
 *  - only same-origin GET requests are ever handled
 *  - never touches Supabase (cross-origin), /admin, private portals,
 *    API routes, or Next RSC / server-action requests
 *  - cache-first only for immutable hashed assets + icons
 *  - network-first for navigations, falling back to /offline
 * Bump VERSION to invalidate all caches on the next deploy.
 */
const VERSION = 'v1';
const STATIC_CACHE = `glancecam-static-${VERSION}`;
const PAGES_CACHE = `glancecam-pages-${VERSION}`;
const OFFLINE_URL = '/offline';
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('glancecam-') && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivateOrDynamic(url, request) {
  const path = url.pathname;
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (/^\/event\/[^/]+\/portal(\/|$)/.test(path)) return true;
  if (path.startsWith('/api/')) return true;
  if (path === '/sw.js') return true;
  if (url.searchParams.has('_rsc')) return true;
  const h = request.headers;
  if (h.has('RSC') || h.has('Next-Action') || h.has('Next-Router-State-Tree') || h.has('Next-Router-Prefetch')) {
    return true;
  }
  return false;
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pwa-icons/') ||
    url.pathname === '/icon' ||
    url.pathname === '/apple-icon'
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(PAGES_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase API/storage/realtime etc.
  if (isPrivateOrDynamic(url, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else: fall through to the network untouched.
});
