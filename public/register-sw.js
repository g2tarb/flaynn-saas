/**
 * Enregistrement SW + détection de mise à jour + PWA install prompt
 */
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

if ('serviceWorker' in navigator) {
  // ARCHITECT-PRIME: auto-reload quand un nouveau SW prend le contrôle.
  // Le nouveau SW appelle skipWaiting() + clients.claim(), ce qui déclenche
  // controllerchange sur les onglets ouverts. Le guard `refreshing` empêche
  // les boucles de reload infinies.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });

      // Vérifier les mises à jour du SW toutes les 30 minutes
      // (en complément de la vérification automatique du navigateur à chaque navigation)
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch {
      // Dégradation gracieuse : le site fonctionne sans SW
    }
  });
}

// PWA install prompt — capture l'événement et propose l'installation
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Affiche un bouton d'installation discret après 30s
  setTimeout(() => {
    if (!deferredPrompt) return;
    const banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.setAttribute('role', 'alert');

    const text = document.createElement('span');
    text.className = 'pwa-install-banner__text';
    text.textContent = 'Installer Flaynn sur votre appareil';

    const btn = document.createElement('button');
    btn.className = 'pwa-install-banner__btn';
    btn.textContent = 'Installer';
    btn.addEventListener('click', async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.remove();
    });

    const close = document.createElement('button');
    close.className = 'pwa-install-banner__close';
    close.setAttribute('aria-label', 'Fermer');
    close.textContent = '\u00D7';
    close.addEventListener('click', () => banner.remove());

    banner.appendChild(text);
    banner.appendChild(btn);
    banner.appendChild(close);
    document.body.appendChild(banner);

    requestAnimationFrame(() => banner.classList.add('is-visible'));
  }, 30000);
});
