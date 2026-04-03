/**
 * Enregistrement SW — partagé landing + dashboard (évite duplication dans script.js)
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
