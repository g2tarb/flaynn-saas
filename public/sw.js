/**
 * Service Worker — Cache-First pour assets statiques ; réseau seul pour /api ; HTML en réseau d’abord.
 * Incrémenter CACHE à chaque déploiement pour invalider les anciens bundles.
 */
const CACHE = 'flaynn-paroxysm-v3';
const PRECACHE = [
  '/',
  '/defaut.css',
  '/script.js',
  '/register-sw.js',
  '/favicon.svg',
  '/manifest.json',
  '/seo.json',
  '/sitemap.xml',
  '/robots.txt',
  '/js/three-neural.js',
  '/js/landing-motion.js',
  '/dashboard/',
  '/dashboard/index.html',
  '/dashboard/app.js',
  '/dashboard/dashboard.css'
];

const ASSET_PATH_RE = /\.(css|m?js|svg|json|woff2?|xml|txt)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void cache.put(request, copy);
  }
  return response;
}

async function networkFirstHtml(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback =
      (await caches.match(request)) ||
      (await caches.match('/')) ||
      (await caches.match('/dashboard/index.html'));
    if (fallback) return fallback;
    return new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  const path = url.pathname;
  const looksLikeAsset = ASSET_PATH_RE.test(path) || path.startsWith('/js/');

  if (looksLikeAsset) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const wantsDoc = request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html');
  if (wantsDoc) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
