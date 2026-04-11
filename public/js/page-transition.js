(function() {
  // Intercepte uniquement les liens internes
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') ||
        href.startsWith('mailto') || link.target === '_blank') return;

    e.preventDefault();

    // Accélère le starfield
    if (window.starfield?.setSpeed) {
      window.starfield.setSpeed(15);
    }

    // Navigue après 400ms
    setTimeout(() => {
      window.location.href = href;
    }, 400);
  });

  // Décélère le starfield au chargement de la nouvelle page
  window.addEventListener('pageshow', function() {
    if (window.starfield?.setSpeed) {
      window.starfield.setSpeed(1, 600);
    }
  });
})();
