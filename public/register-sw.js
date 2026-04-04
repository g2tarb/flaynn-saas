/**
 * Enregistrement SW — partagé landing + dashboard (évite duplication dans script.js)
 */
const SW_URL = '/sw.js';
const SW_SCOPE = '/';
const SW_CACHE_VERSION = 'flaynn-cache-v3';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .then(() => {
        if (
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
        ) {
          console.info(`[Flaynn SW] actif: ${SW_CACHE_VERSION}`);
        }
      })
      .catch(() => {});
  });
}
