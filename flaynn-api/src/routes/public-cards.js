import { pool } from '../config/db.js';

// ARCHITECT-PRIME — Delta 9 step 1 : route SSR publique /score/:slug (stub).
// Le rendu HTML est minimal et vérifiable via curl. Le CSS complet (J5) et le JS
// de partage (J6) s'ajouteront par-dessus sans casser l'API de rendu.
//
// Sécurité — toute valeur dynamique injectée dans le HTML passe par escapeHtml().
// La route ne produit AUCUN script inline (CSP script-src 'self' respectée).
// JSON-LD volontairement omis en J1 : le traitement CSP (hash SHA-256 par card
// ou nonce) est tranché en J4.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// Slug format garant : [a-z0-9-]{1,80}. Valide à la fois côté entrée URL et côté
// lecture DB (cohérent avec la contrainte implicite de slugify()).
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function getPublicBaseUrl() {
  return process.env.APP_URL || 'https://flaynn.tech';
}

function getBaJoinUrl() {
  const base = process.env.BA_PUBLIC_BASE_URL || 'https://flaynn.com';
  return `${base}/rejoindre`;
}

function formatFrDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Flaynn · Carte introuvable</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/defaut.css">
</head>
<body class="dashboard-body">
<main style="max-width:720px;margin:96px auto;padding:48px 24px;text-align:center">
  <h1 style="font-size:48px;margin:0 0 16px">Carte introuvable</h1>
  <p style="color:var(--text-secondary);margin:0 0 32px">
    Cette Flaynn Card n'existe pas ou n'a jamais été publiée.
  </p>
  <a href="/" style="color:var(--accent-violet);text-decoration:none;font-weight:600">← Retour à l'accueil Flaynn</a>
</main>
</body>
</html>`;
}

function renderUnpublishedPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Flaynn · Carte dépubliée</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/defaut.css">
</head>
<body class="dashboard-body">
<main style="max-width:720px;margin:96px auto;padding:48px 24px;text-align:center">
  <h1 style="font-size:48px;margin:0 0 16px">Carte dépubliée</h1>
  <p style="color:var(--text-secondary);margin:0 0 32px">
    Cette Flaynn Card a été dépubliée par son fondateur.
  </p>
  <a href="/" style="color:var(--accent-violet);text-decoration:none;font-weight:600">← Retour à l'accueil Flaynn</a>
</main>
</body>
</html>`;
}

function renderCardPage(card) {
  const baseUrl = getPublicBaseUrl();
  const baJoinUrl = getBaJoinUrl();
  const snapshot = card.snapshot_data || {};

  const startupName = card.startup_name || 'Startup';
  const score = Number(snapshot.score) || 0;
  const verdict = snapshot.verdict || '';
  const sector = snapshot.sector || 'Startup';
  const track = snapshot.track || '';
  const methodology = snapshot.methodology_version || '';
  const scoredAtIso = snapshot.scored_at || card.created_at;
  const scoredAtFr = formatFrDate(scoredAtIso);

  const forces = Array.isArray(snapshot.forces) ? snapshot.forces.slice(0, 3) : [];
  const challenges = Array.isArray(snapshot.challenges) ? snapshot.challenges.slice(0, 3) : [];

  const pageUrl = `${baseUrl}/score/${card.slug}`;
  const ogImage = card.og_image_path
    ? `${baseUrl}${card.og_image_path}`
    : `${baseUrl}/og-image.png`; // placeholder existant public/og-image.png jusqu'à J3

  const title = `${startupName} · Flaynn Score ${score}/100`;
  const firstChallenge = challenges[0] || '';
  const description = `${startupName} a été scorée ${score}/100 par Flaynn Intelligence. ` +
    `Verdict : ${verdict || '—'}. Secteur : ${sector}. ` +
    (firstChallenge ? `Zone à renforcer : ${firstChallenge}` : 'Analyse en 5 piliers.');

  const robotsTag = card.index_seo
    ? ''
    : '<meta name="robots" content="noindex, nofollow">';

  const forcesHtml = forces.length
    ? `<ol>${forces.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ol>`
    : '<p style="color:var(--text-secondary)">Aucune force listée.</p>';

  const challengesHtml = challenges.length
    ? `<ol>${challenges.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol>`
    : '<p style="color:var(--text-secondary)">Aucune zone listée.</p>';

  const metaLine = [sector, track, scoredAtFr ? `Scoré le ${scoredAtFr}` : '']
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${robotsTag}

<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Flaynn">
<meta property="og:locale" content="fr_FR">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<link rel="canonical" href="${escapeHtml(pageUrl)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/defaut.css">
</head>
<body class="dashboard-body">
<main style="max-width:920px;margin:0 auto;padding:48px 24px 96px">
  <header style="display:flex;justify-content:space-between;align-items:center;padding-bottom:32px;border-bottom:1px solid var(--border-default);margin-bottom:48px">
    <a href="/" style="font-weight:700;font-size:24px;letter-spacing:-0.02em;background:var(--gradient-violet-rose);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-decoration:none">FLAYNN</a>
    <span style="padding:8px 20px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent-emerald);border:1px solid var(--accent-emerald)">${escapeHtml(verdict)}</span>
  </header>

  <section style="margin-bottom:64px">
    <div style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:16px">${metaLine}</div>
    <h1 style="font-size:clamp(40px,6vw,72px);font-weight:700;line-height:1.05;letter-spacing:-0.03em;margin:0 0 40px">${escapeHtml(startupName)}</h1>
    <div style="display:flex;align-items:baseline;gap:12px">
      <span style="font-size:14px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-secondary);margin-right:8px">Flaynn Score</span>
      <span style="font-size:clamp(80px,12vw,160px);font-weight:700;line-height:1;letter-spacing:-0.05em">${score}</span>
      <span style="font-size:clamp(40px,6vw,80px);color:var(--text-secondary);font-weight:400">/100</span>
    </div>
  </section>

  <section style="margin-bottom:48px">
    <h2 style="font-size:18px;font-weight:700;margin:0 0 24px">✓ Trois forces identifiées</h2>
    ${forcesHtml}
  </section>

  <section style="margin-bottom:48px">
    <h2 style="font-size:18px;font-weight:700;margin:0 0 24px">⏳ Trois zones à renforcer</h2>
    ${challengesHtml}
  </section>

  ${methodology ? `<section style="margin-bottom:48px;color:var(--text-secondary);font-size:13px;letter-spacing:0.05em">Validé par l'analyste Flaynn · Méthodologie ${escapeHtml(methodology)}</section>` : ''}

  <section style="display:flex;flex-direction:column;gap:16px;margin-bottom:64px">
    <a href="/#scoring" style="padding:20px 32px;border-radius:12px;font-weight:700;text-align:center;font-size:17px;background:var(--gradient-violet-rose);color:#fff;text-decoration:none">Obtenir votre scoring · 29€</a>
    <a href="${escapeHtml(baJoinUrl)}" style="padding:14px 24px;border-radius:12px;font-weight:500;text-align:center;font-size:14px;border:1px solid var(--border-default);color:var(--text-primary);text-decoration:none;letter-spacing:0.02em">Vous êtes investisseur ? Rejoindre Flaynn →</a>
  </section>

  <footer style="padding-top:48px;border-top:1px solid var(--border-default);font-size:12px;color:var(--text-secondary);letter-spacing:0.08em;text-transform:uppercase">
    Flaynn · Infrastructure du capital sélectif francophone
  </footer>
</main>
</body>
</html>`;
}

export default async function publicCardsRoutes(fastify) {
  fastify.get('/score/:slug', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { slug } = request.params;

    if (!isValidSlug(slug)) {
      return reply
        .code(404)
        .type('text/html; charset=utf-8')
        .send(renderNotFoundPage());
    }

    let card;
    try {
      const { rows } = await pool.query(
        `SELECT id, slug, reference_id, user_email, startup_name, snapshot_data,
                og_image_path, is_active, index_seo, view_count, created_at, unpublished_at
         FROM public_cards WHERE slug = $1 LIMIT 1`,
        [slug]
      );
      card = rows[0];
    } catch (err) {
      request.log.error({ err, slug }, 'public_card_lookup_failed');
      return reply
        .code(503)
        .type('text/html; charset=utf-8')
        .send(renderNotFoundPage());
    }

    if (!card) {
      return reply
        .code(404)
        .type('text/html; charset=utf-8')
        .send(renderNotFoundPage());
    }

    if (!card.is_active) {
      return reply
        .code(410)
        .type('text/html; charset=utf-8')
        .send(renderUnpublishedPage());
    }

    // Incrément view_count fire-and-forget — ne bloque pas la réponse.
    pool.query(
      'UPDATE public_cards SET view_count = view_count + 1 WHERE id = $1',
      [card.id]
    ).catch((err) => {
      request.log.warn({ err, cardId: card.id }, 'public_card_view_count_failed');
    });

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(renderCardPage(card));
  });
}
