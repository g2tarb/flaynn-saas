const CACHE_NAME = 'flaynn-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/defaut.css',
  '/script.js',
  '/auth/',
  '/auth/app.js',
  '/auth/auth.css',
  '/dashboard/',
  '/dashboard/app.js',
  '/dashboard/dashboard.css',
  '/register-sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // ARCHITECT-PRIME: on laisse le navigateur gérer les CDN externes.
  // Sinon le SW intercepte les fontes cross-origin et amplifie les erreurs CSP.
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith('/api/')
  ) {
    return;
  }

  // ARCHITECT-PRIME: cache-first avec fallback offline (jamais de page d'erreur navigateur)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          // Offline : servir la page d'accueil cachée pour les navigations HTML
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
