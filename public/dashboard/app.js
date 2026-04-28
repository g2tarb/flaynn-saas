/**
 * Flaynn Dashboard — app.js
 * Routeur vanilla, D3 (ESM), zero innerHTML pour le contenu dynamique.
 * Gestion auth localStorage : demo mode si non connecté.
 */

const D3_ESM = 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
let d3Cache = null;
async function loadD3() {
  if (!d3Cache) d3Cache = await import(D3_ESM);
  return d3Cache;
}

/* ── Dénominateurs par pilier (source de vérité) ─────────────────────── */
const PILLAR_MAX = {
  'Market': 25,
  'Solution/Product': 20,
  'Product': 20,
  'Traction': 25,
  'Team': 20,
  'Execution': 10,
};

/** Retourne le dénominateur d'un pilier : champ max > lookup > 100 */
function getPillarMax(p) {
  if (p.max != null && Number.isFinite(p.max) && p.max > 0) return p.max;
  return PILLAR_MAX[p.name] || 100;
}

/* ── Mapping nom pilier → clé pillar_pct (V6.1) ───────────────────────── */
const PILLAR_NAME_TO_KEY = {
  'Market':            'market',
  'Solution/Product':  'solution_product',
  'Product':           'solution_product',
  'Traction':          'traction',
  'Team':              'team',
  'Execution':         'execution_ask',
};

/**
 * Pourcentage canonique d'un pilier (Delta 14, fix S1).
 * Cascade : pillar_pct (V6.1+) → score/max legacy → null.
 * Renvoie { pct: number|null, source: 'v6.1'|'legacy'|'unavailable' }.
 */
function getPillarPct(pillar, pillarPctMap) {
  const key = PILLAR_NAME_TO_KEY[pillar.name];
  // Cascade niveau 1 : V6.1+ pillar_pct
  if (key && pillarPctMap && typeof pillarPctMap[key] === 'number' && Number.isFinite(pillarPctMap[key])) {
    return { pct: Math.max(0, Math.min(100, Math.round(pillarPctMap[key]))), source: 'v6.1' };
  }
  // Cascade niveau 2 (validée Q2 utilisateur) : `score_breakdown_raw` avec PILLAR_MAX
  // canonique. Champ ABSENT du contrat actuel (vérifié en codebase). Garde la branche
  // pour une éventuelle V6.2 — décommenter si le workflow n8n l'expose un jour.
  //
  // const rawBreakdown = pillar.scoreBreakdownRaw;  // injecté depuis data.score_breakdown_raw[key]
  // const canonMax = { market: 25, solution_product: 20, traction: 25, team: 20, execution_ask: 10 }[key];
  // if (typeof rawBreakdown === 'number' && canonMax) {
  //   return { pct: Math.round((rawBreakdown / canonMax) * 100), source: 'legacy-raw' };
  // }
  //
  // Cascade niveau 3 : "—" + tooltip. On n'utilise PAS score_breakdown post-adjustRatio
  // en fallback (cf. brief §3 et bug d'affichage S1 sur Execution).
  return { pct: null, source: 'unavailable' };
}

/* ── Couleurs verdict & ordre piliers (Delta 14) ──────────────────────── */
const VERDICT_COLORS = {
  'Strong Yes': 'var(--accent-emerald)',
  'Yes':        'var(--accent-emerald)',
  'Almost':     'var(--accent-amber)',
  'Not yet':    'var(--accent-rose)',
  'Ready':      'var(--accent-emerald)',
};
const VERDICT_LABELS_FR = {
  'Strong Yes': 'Strong Yes',
  'Yes':        'Yes',
  'Almost':     'Almost',
  'Not yet':    'Not yet',
};
// ARCHITECT-PRIME: Delta 14 — clés JSONB depuis pillar_pct (V6.1+).
// Ordre figé : aligné sur PILLAR_ORDER de public-cards.js + buildPillarRows ordering.
const LIST_PILLARS = [
  { key: 'market',           label: 'Marché',    color: 'var(--accent-violet)'  },
  { key: 'solution_product', label: 'Produit',   color: 'var(--accent-blue)'    },
  { key: 'traction',         label: 'Traction',  color: 'var(--accent-emerald)' },
  { key: 'team',             label: 'Team',      color: 'var(--accent-violet)'  },
  { key: 'execution_ask',    label: 'Exécution', color: 'var(--accent-amber)'   },
];

/* ── Auth ──────────────────────────────────────────────────────────────── */
function getAuth() {
  try { return JSON.parse(localStorage.getItem('flaynn_auth') || 'null'); }
  catch { return null; }
}

function clearAuth() {
  localStorage.removeItem('flaynn_auth');
}

async function syncAuthFromSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!res.ok) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    localStorage.setItem('flaynn_auth', JSON.stringify(data.user));
    return data.user;
  } catch {
    return getAuth();
  }
}

/* ── Demo data ─────────────────────────────────────────────────────────── */
const DEMO_DATA = {
  isDemo: true,
  startupName: 'Exemple Startup',
  score: 74,
  scorePrev: 67,
  level: 'Potentiel Élevé',
  updatedAt: new Date().toISOString(),
  stage: 'Seed',
  sector: 'SaaS / B2B',
  pillars: [
    { name: 'Market',    score: 20, max: 25, prev: 19, color: 'var(--accent-violet)',
      insight: 'TAM solide, positionnement différencié. Renforcer la défensibilité sur le segment mid-market.' },
    { name: 'Product',   score: 14, max: 20, prev: 13, color: 'var(--accent-blue)',
      insight: 'MVP validé, proposition de valeur claire. Roadmap 12 mois à documenter pour rassurer les investisseurs.' },
    { name: 'Traction',  score: 17, max: 25, prev: 14, color: 'var(--accent-emerald)',
      insight: 'Croissance MoM positive (+15%) mais churn élevé (8%). Priorité : réduire le churn sous 3%.' },
    { name: 'Team',      score: 17, max: 20, prev: 16, color: 'var(--accent-violet)',
      insight: 'Équipe fondatrice complémentaire et expérimentée. Advisory board à structurer avant la levée.' },
    { name: 'Execution', score: 6,  max: 10, prev: 5,  color: 'var(--accent-amber)',
      insight: 'Point faible identifié. Mettre en place des OKRs trimestriels et un reporting hebdomadaire structuré.' },
  ],
  history: [
    { label: 'Audit #1', date: 'Oct 2024', score: 52 },
    { label: 'Audit #2', date: 'Jan 2025', score: 67 },
    { label: 'Audit #3', date: 'Avr 2025', score: 74 },
  ],
  recommendations: [
    { priority: 'high',   pillar: 'Execution', title: 'Structurer la cadence opérationnelle',       desc: 'Mettre en place des OKRs trimestriels et un reporting hebdomadaire. Les investisseurs Série A exigent une rigueur process démontrée.' },
    { priority: 'high',   pillar: 'Traction',  title: 'Réduire le churn mensuel',                   desc: 'Churn actuel : 8% - objectif : < 3%. Identifier et adresser les 3 principales causes de résiliation en priorité.' },
    { priority: 'medium', pillar: 'Product',   title: 'Documenter la roadmap 12 mois',              desc: 'Manque de visibilité sur les prochaines releases. Ce point freine la confiance des investisseurs lors du premier call.' },
    { priority: 'low',    pillar: 'Team',      title: 'Structurer un advisory board',               desc: 'Ajouter 2–3 advisors sectoriels reconnus. Signal fort de crédibilité pour les investisseurs institutionnels.' },
  ],
  investorReadiness: [
    { status: 'ok',      label: 'Pitch deck à jour' },
    { status: 'ok',      label: 'Métriques financières documentées' },
    { status: 'warn',    label: 'Data room partielle - compléter' },
    { status: 'warn',    label: 'Prévisions 3 ans à affiner' },
    { status: 'missing', label: 'Cap table non communiquée' },
  ],
  market: { tam: '€2.4B', sam: '€340M', som: '€28M' },
  graph: {
    nodes: [
      { id: 'you',  label: 'Vous',        type: 'user' },
      { id: 'c1',   label: 'Concurrent A', type: 'competitor' },
      { id: 'c2',   label: 'Concurrent B', type: 'competitor' },
      { id: 'c3',   label: 'Concurrent C', type: 'competitor' },
      { id: 'p1',   label: 'Partenaire X', type: 'partner' },
      { id: 'p2',   label: 'Marché FR',    type: 'partner' },
    ],
    links: [
      { source: 'you', target: 'c1', strength: 1.5 },
      { source: 'you', target: 'c2', strength: 1.2 },
      { source: 'you', target: 'c3', strength: 0.9 },
      { source: 'you', target: 'p1', strength: 0.8 },
      { source: 'you', target: 'p2', strength: 0.6 },
      { source: 'c1',  target: 'c2', strength: 0.4 },
    ]
  }
};

/* ── Market value helpers (TAM/SAM/SOM parsing & formatting) ──────────── */

/** Parse une valeur marché type "€2.4B" / "$340M" / "28M€" en nombre brut */
function parseMarketValue(str) {
  if (!str || typeof str !== 'string') return 0;
  const cleaned = str.replace(/[^0-9.,BMKbmk]/g, '');
  const num = parseFloat(cleaned.replace(',', '.'));
  if (isNaN(num)) return 0;
  const upper = str.toUpperCase();
  if (upper.includes('B')) return num * 1_000_000_000;
  if (upper.includes('M')) return num * 1_000_000;
  if (upper.includes('K')) return num * 1_000;
  return num;
}

/** Formate un nombre en valeur marché lisible (ex: 480000000 → "€480M") */
function formatMarketValue(num) {
  if (!Number.isFinite(num) || num <= 0) return '—';
  if (num >= 1_000_000_000) return `€${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (num >= 1_000_000) return `€${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `€${(num / 1_000).toFixed(0)}K`;
  return `€${Math.round(num)}`;
}

/* ── DOM helpers ───────────────────────────────────────────────────────── */
function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'textContent') node.textContent = v;
    else if (k === 'id') node.id = v;
    else node.setAttribute(k, v);
  }
  return node;
}

function clearEl(node) { node.replaceChildren(); }

/* ── ARCHITECT-PRIME Delta 15 — Helpers SVG/sparkline/variation ──────────── */

/** Crée un nœud SVG via createElementNS (pas d'innerHTML, conformité §4.1). */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v);
  }
  return node;
}

/**
 * Sparkline inline (60×20). Retourne null si <2 valeurs (le KPI affiche
 * alors juste la valeur sans courbe). titleText rend le SVG accessible.
 */
function renderSparkline(values, color = 'currentColor', titleText = '') {
  if (!Array.isArray(values) || values.length < 2) return null;
  const w = 60, h = 20, p = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - p * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = p + i * step;
    const y = h - p - ((v - min) / range) * (h - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const svg = svgEl('svg', {
    width: String(w), height: String(h),
    viewBox: `0 0 ${w} ${h}`, class: 'sparkline',
  });
  if (titleText) {
    const t = svgEl('title');
    t.textContent = titleText;
    svg.appendChild(t);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', titleText);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.appendChild(svgEl('polyline', {
    points, fill: 'none', stroke: color, 'stroke-width': '1.5',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
  return svg;
}

/**
 * Chip de variation (+5 / -3 / 0). Retourne null si delta non-fini.
 * Couleur conditionnelle (positive/negative/neutral) + flèche pour
 * daltonisme (cf §13). `suffix` ex : ' pts' pour scores, '' pour counts.
 */
function renderVariationChip(delta, options = {}) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const suffix = options.suffix || '';
  const round = options.round !== false;
  const value = round ? Math.round(delta) : delta;
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'positive' : (value < 0 ? 'negative' : 'neutral');
  const arrow = value > 0 ? '↑' : (value < 0 ? '↓' : '·');
  const chip = el('span', `dashboard-variation dashboard-variation--${tone}`);
  chip.appendChild(el('span', 'dashboard-variation__arrow', {
    textContent: arrow, 'aria-hidden': 'true',
  }));
  chip.appendChild(el('span', 'dashboard-variation__value', {
    textContent: `${sign}${value}${suffix}`,
  }));
  return chip;
}

/**
 * Donut score (Delta 15 Pass 3). SVG inline, taille paramétrable.
 * Track gris + arc coloré + valeur centrée. font-family/size via classe CSS
 * (var(--font-mono) ne se résout pas dans un attribut SVG).
 */
function renderDonutScore(score, color = 'var(--accent-violet)', size = 60) {
  const safe = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const r = Math.floor(size / 2 - 4);
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (safe / 100) * circumference;

  const svg = svgEl('svg', {
    width: String(size), height: String(size),
    viewBox: `0 0 ${size} ${size}`,
    class: 'score-donut',
    role: 'img',
    'aria-label': `Score ${safe} sur 100`,
  });
  svg.appendChild(svgEl('circle', {
    cx: String(cx), cy: String(cx), r: String(r),
    fill: 'none', stroke: 'var(--glass-border)', 'stroke-width': '3',
  }));
  svg.appendChild(svgEl('circle', {
    cx: String(cx), cy: String(cx), r: String(r),
    fill: 'none', stroke: color, 'stroke-width': '3',
    'stroke-dasharray': String(circumference),
    'stroke-dashoffset': String(offset),
    'stroke-linecap': 'round',
    transform: `rotate(-90 ${cx} ${cx})`,
    class: 'score-donut__arc',
  }));
  const text = svgEl('text', {
    x: String(cx), y: String(cx),
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    class: 'score-donut__value',
    fill: 'currentColor',
  });
  text.textContent = String(safe);
  svg.appendChild(text);
  return svg;
}

/**
 * Icône SVG outline 16×16 (Heroicons MIT). Pas de librairie.
 * Retourne un nœud SVG avec stroke="currentColor" → la couleur est
 * pilotée par le CSS de l'élément parent (pattern hérité Heroicons).
 */
const DASHBOARD_ICON_PATHS = {
  user: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  logout: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75',
};
function dashboardIcon(name) {
  const d = DASHBOARD_ICON_PATHS[name];
  if (!d) return null;
  const svg = svgEl('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none', viewBox: '0 0 24 24',
    'stroke-width': '1.5', stroke: 'currentColor',
    class: 'dashboard-user-menu__item-icon',
    'aria-hidden': 'true',
  });
  svg.appendChild(svgEl('path', {
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', d,
  }));
  return svg;
}

/**
 * Annote chaque item avec ses deltas vs l'analyse précédente du MÊME
 * startup_name (option A validée Q4). Mute in-place :
 *   item._scoreDelta = curr.score - prev.score (ou absent si indispo)
 *   item._pillarDeltas[pillar_key] = curr.pillar_pct[k] - prev.pillar_pct[k]
 * Premier item d'un groupe → aucune annotation (pas de précédent).
 */
function annotateItemsWithDeltas(items) {
  const byName = new Map();
  items.forEach((it) => {
    const key = (it.startup_name || it.reference_id || '').toLowerCase().trim();
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(it);
  });
  byName.forEach((arr) => {
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const curr = arr[i];
      if (typeof curr.score === 'number' && typeof prev.score === 'number') {
        curr._scoreDelta = curr.score - prev.score;
      }
      if (curr.pillar_pct && prev.pillar_pct) {
        curr._pillarDeltas = {};
        Object.keys(curr.pillar_pct).forEach((k) => {
          const c = curr.pillar_pct[k];
          const p = prev.pillar_pct[k];
          if (typeof c === 'number' && typeof p === 'number') {
            curr._pillarDeltas[k] = Math.round(c - p);
          }
        });
      }
    }
  });
  return items;
}

/** Counts d'analyses par mois sur N mois (chronologique ASC, index 0 = +ancien). */
function monthlyAnalysisCounts(items, monthsBack = 6) {
  const buckets = new Array(monthsBack).fill(0);
  const now = new Date();
  items.forEach((it) => {
    if (!it.created_at) return;
    const d = new Date(it.created_at);
    if (Number.isNaN(d.getTime())) return;
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12
                    + (now.getMonth() - d.getMonth());
    if (monthsAgo >= 0 && monthsAgo < monthsBack) {
      buckets[monthsBack - 1 - monthsAgo]++;
    }
  });
  return buckets;
}

/** Série des scores triés par created_at ASC, filtrés sur scores valides. */
function scoreSeriesByDate(items) {
  return items
    .filter((it) => typeof it.score === 'number' && it.score > 0 && it.created_at)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((it) => it.score);
}

let activeForceSimulation = null;
function stopForceSimulation() {
  if (activeForceSimulation) { activeForceSimulation.stop(); activeForceSimulation = null; }
}

/* ── Renderers D3 ──────────────────────────────────────────────────────── */

/** Score radial animé */
function renderScoreRadial(container, score, d3) {
  const size = 200, thick = 14, radius = (size - thick) / 2;
  const circ = 2 * Math.PI * radius;
  const stroke = score >= 70 ? 'var(--accent-emerald)' : score >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('role', 'img')
    .attr('aria-label', `Score global ${score} sur 100`);

  svg.append('circle').attr('cx', size/2).attr('cy', size/2).attr('r', radius)
    .attr('fill', 'none').attr('stroke', 'var(--surface-overlay)').attr('stroke-width', thick);

  const arc = svg.append('circle').attr('cx', size/2).attr('cy', size/2).attr('r', radius)
    .attr('fill', 'none').attr('stroke', stroke).attr('stroke-width', thick)
    .attr('stroke-linecap', 'round')
    .attr('stroke-dasharray', circ).attr('stroke-dashoffset', circ)
    .attr('transform', `rotate(-90 ${size/2} ${size/2})`);

  arc.transition().duration(1400).ease(d3.easeCubicOut)
    .attr('stroke-dashoffset', circ - (score / 100) * circ);

  const scoreText = svg.append('text').attr('x', size/2).attr('y', size/2 - 6)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('class', 'score-radial__value').text('0');

  const subText = svg.append('text').attr('x', size/2).attr('y', size/2 + 22)
    .attr('text-anchor', 'middle').attr('font-size', '11').attr('fill', 'var(--text-tertiary)')
    .attr('font-family', 'var(--font-mono)').text('/100');

  d3.transition().duration(1400).ease(d3.easeCubicOut).tween('text', () => {
    const i = d3.interpolateNumber(0, score);
    return (t) => { scoreText.text(String(Math.round(i(t)))); };
  });

  void subText; /* silence lint */
}

/** Radar 5 piliers */
function renderPillarRadar(container, pillars, d3, pillarPctMap) {
  const size = 300, center = size / 2, maxR = 110;
  const angle = (i) => ((2 * Math.PI) / pillars.length) * i - Math.PI / 2;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('role', 'img')
    .attr('aria-label', 'Radar des cinq piliers de scoring');

  /* Grilles concentriques */
  for (let i = 1; i <= 5; i++) {
    svg.append('circle').attr('cx', center).attr('cy', center).attr('r', (maxR/5)*i)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.08)').attr('stroke-dasharray', '3 3');
  }

  /* Axes + labels */
  pillars.forEach((p, i) => {
    const a = angle(i);
    const x = center + maxR * Math.cos(a), y = center + maxR * Math.sin(a);
    svg.append('line').attr('x1', center).attr('y1', center).attr('x2', x).attr('y2', y)
      .attr('stroke', 'rgba(255,255,255,0.08)');
    svg.append('text')
      .attr('x', center + (maxR + 22) * Math.cos(a))
      .attr('y', center + (maxR + 22) * Math.sin(a))
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('class', 'pillar-radar__label').text(p.name);
  });

  // Delta 14 : rayon basé sur pillar_pct V6.1 si dispo (fix S1), fallback score/max legacy.
  const radiusFor = (p) => {
    const { pct } = getPillarPct(p, pillarPctMap);
    if (pct != null) return (pct / 100) * maxR;
    // Si pillar_pct indispo, fallback legacy pour ne pas casser le radar (sinon polygone à 0).
    return (p.score / getPillarMax(p)) * maxR;
  };

  const pts = pillars.map((p, i) => {
    const a = angle(i), r = radiusFor(p);
    return `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`;
  }).join(' ');

  /* Zone remplie animée */
  const fill = svg.append('polygon')
    .attr('points', pillars.map(() => `${center},${center}`).join(' '))
    .attr('fill', 'rgba(139,92,246,0.15)').attr('stroke', 'var(--accent-violet)').attr('stroke-width', 2);

  fill.transition().duration(1000).ease(d3.easeCubicOut).attr('points', pts);

  /* Dots sur les sommets */
  pillars.forEach((p, i) => {
    const a = angle(i), r = radiusFor(p);
    const dot = svg.append('circle')
      .attr('cx', center).attr('cy', center).attr('r', 4)
      .attr('fill', 'var(--accent-violet)').attr('stroke', 'var(--surface-void)').attr('stroke-width', 2);
    dot.transition().duration(1000).ease(d3.easeCubicOut)
      .attr('cx', center + r * Math.cos(a)).attr('cy', center + r * Math.sin(a));
  });
}

/** Historique des scores — ligne + aire gradient */
function renderScoreHistory(container, history, d3) {
  const w = Math.max(container.clientWidth || 360, 280);
  const h = 140;
  const m = { top: 12, right: 16, bottom: 32, left: 36 };

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img')
    .attr('aria-label', 'Historique des scores — ' + history.map(d => `${d.label} : ${d.score}`).join(', '));

  /* Dégradé sous la courbe */
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', 'hist-grad')
    .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
  grad.append('stop').attr('offset', '0%').attr('stop-color', 'var(--accent-violet)').attr('stop-opacity', 0.25);
  grad.append('stop').attr('offset', '100%').attr('stop-color', 'var(--accent-violet)').attr('stop-opacity', 0);

  const x = d3.scalePoint().range([m.left, w - m.right]).padding(0.4).domain(history.map(d => d.label));
  const y = d3.scaleLinear().range([h - m.bottom, m.top]).domain([0, 100]);

  /* Axe Y discret */
  [0, 25, 50, 75, 100].forEach(v => {
    svg.append('line')
      .attr('x1', m.left).attr('y1', y(v))
      .attr('x2', w - m.right).attr('y2', y(v))
      .attr('stroke', 'var(--border-subtle)').attr('stroke-dasharray', '3 3');
    svg.append('text').attr('x', m.left - 6).attr('y', y(v))
      .attr('text-anchor', 'end').attr('dominant-baseline', 'central')
      .attr('font-size', '9').attr('fill', 'var(--text-tertiary)').attr('font-family', 'var(--font-mono)')
      .text(v);
  });

  /* Axe X labels */
  history.forEach(d => {
    svg.append('text').attr('x', x(d.label)).attr('y', h - m.bottom + 14)
      .attr('text-anchor', 'middle').attr('font-size', '9').attr('fill', 'var(--text-tertiary)')
      .attr('font-family', 'var(--font-body)').text(d.label);
    svg.append('text').attr('x', x(d.label)).attr('y', h - m.bottom + 24)
      .attr('text-anchor', 'middle').attr('font-size', '8').attr('fill', 'var(--text-tertiary)')
      .attr('font-family', 'var(--font-body)').attr('opacity', 0.6).text(d.date);
  });

  const line = d3.line().x(d => x(d.label)).y(d => y(d.score)).curve(d3.curveCatmullRom);
  const area = d3.area().x(d => x(d.label)).y0(h - m.bottom).y1(d => y(d.score)).curve(d3.curveCatmullRom);

  /* Aire (opacité faible) */
  svg.append('path').datum(history).attr('fill', 'url(#hist-grad)').attr('d', area);

  /* Ligne principale animée */
  const path = svg.append('path').datum(history)
    .attr('fill', 'none').attr('stroke', 'var(--accent-violet)')
    .attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('d', line);

  const totalLen = path.node().getTotalLength();
  path.attr('stroke-dasharray', totalLen).attr('stroke-dashoffset', totalLen)
    .transition().duration(1200).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0);

  /* Points + valeurs */
  history.forEach(d => {
    const cx = x(d.label), cy = y(d.score);
    const dot = svg.append('circle').attr('cx', cx).attr('cy', h - m.bottom)
      .attr('r', 5).attr('fill', 'var(--accent-violet)')
      .attr('stroke', 'var(--surface-void)').attr('stroke-width', 2);
    dot.transition().delay(900).duration(400).ease(d3.easeBackOut).attr('cy', cy);

    const vText = svg.append('text').attr('x', cx).attr('y', h - m.bottom)
      .attr('text-anchor', 'middle').attr('font-size', '10').attr('font-weight', '700')
      .attr('fill', 'var(--text-primary)').attr('font-family', 'var(--font-mono)').text(d.score);
    vText.transition().delay(900).duration(400).attr('y', cy - 12);
  });
}

/** Graphe force-directed concurrentiel */
function renderCompetitiveGraph(container, data, d3) {
  stopForceSimulation();
  const w = Math.max(container.clientWidth || 400, 320), h = 420;
  const nodes = data.nodes.map(d => ({ ...d }));
  const links = data.links.map(d => ({ ...d }));

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${w} ${h}`)
    .attr('role', 'img')
    .attr('aria-label', 'Graphe de marché — positionnement relatif concurrents et partenaires');

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(110))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(w/2, h/2))
    .force('collision', d3.forceCollide(46));

  const link = svg.selectAll('.link').data(links).enter().append('line')
    .attr('stroke', 'var(--border-default)')
    .attr('stroke-width', d => (d.strength ?? 1) * 1.8)
    .attr('stroke-opacity', 0.4);

  const node = svg.selectAll('.node').data(nodes).enter().append('g')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.35).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append('circle')
    .attr('r', d => d.type === 'user' ? 22 : 14)
    .attr('fill', d => d.type === 'user' ? 'var(--accent-violet)' : d.type === 'competitor' ? 'var(--accent-rose)' : 'var(--accent-blue)')
    .attr('stroke', 'var(--surface-base)').attr('stroke-width', 2);

  node.append('text').text(d => d.label)
    .attr('dy', d => d.type === 'user' ? 35 : 27)
    .attr('text-anchor', 'middle').attr('class', 'graph-node__label');

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  activeForceSimulation = sim;
}

/* ── Builders DOM (zero innerHTML) ────────────────────────────────────── */

/** Bannière démo (non connecté) */
function buildDemoBanner() {
  const wrap = el('div', 'demo-banner');

  const text = el('div', 'demo-banner__text');
  const title = el('p', 'demo-banner__title', { textContent: 'Mode démo - données illustratives' });
  const sub = el('p', 'demo-banner__sub', {
    textContent: 'Connectez-vous ou créez un compte pour accéder à votre analyse personnalisée, basée sur vos données réelles.'
  });
  text.appendChild(title);
  text.appendChild(sub);

  const actions = el('div', 'demo-banner__actions');
  const loginBtn = el('a', 'btn-primary btn-gradient', { href: '/auth/', textContent: 'Se connecter' });
  loginBtn.style.minHeight = '40px';
  loginBtn.style.fontSize  = '0.875rem';
  const regBtn = el('a', 'btn-ghost btn-ghost--hero', { href: '/auth/', textContent: 'Créer un compte' });
  regBtn.style.minHeight = '40px';
  regBtn.style.fontSize  = '0.875rem';
  actions.appendChild(loginBtn);
  actions.appendChild(regBtn);

  wrap.appendChild(text);
  wrap.appendChild(actions);
  return wrap;
}

/** Chip trend +/- */
function buildTrendChip(curr, prev) {
  const diff = curr - prev;
  const chip = el('span', `trend-chip trend-chip--${diff >= 0 ? 'up' : 'down'}`);
  chip.textContent = `${diff >= 0 ? '+' : ''}${diff} pts`;
  return chip;
}

/** Card récapitulative latérale (niveau, delta, stage) */
function buildSummaryCard(label, value, sub) {
  const card = el('article', 'card-glass score-summary-card');
  card.appendChild(el('span', 'score-summary-card__label', { textContent: label }));
  card.appendChild(el('p',    'score-summary-card__value', { textContent: value }));
  if (sub) card.appendChild(el('p', 'score-summary-card__sub', { textContent: sub }));
  return card;
}

/** Cards recommandations */
function buildRecommendations(list) {
  const reco = el('div', 'reco-list');
  list.forEach(r => {
    const card = el('div', `reco-card reco-card--${r.priority}`);
    const body = el('div', 'reco-card__body');
    const header = el('div', 'reco-card__header');

    const pBadge = el('span', `priority-badge priority-badge--${r.priority}`,
      { textContent: r.priority === 'high' ? 'Critique' : r.priority === 'medium' ? 'Moyen' : 'Faible' });
    const pTag = el('span', 'pillar-tag', { textContent: r.pillar });
    const title = el('p', 'reco-card__title', { textContent: r.title });
    const desc  = el('p', 'reco-card__desc',  { textContent: r.desc });

    header.appendChild(pBadge);
    header.appendChild(pTag);
    body.appendChild(header);
    body.appendChild(title);
    body.appendChild(desc);
    card.appendChild(body);
    reco.appendChild(card);
  });
  return reco;
}

/** Barres piliers (overview) — Delta 14 : pillar_pct V6.1 prioritaire, fallback "—" */
function buildPillarRows(pillars, pillarPctMap) {
  const wrap = el('div', 'pillar-rows');
  pillars.forEach(p => {
    const max = getPillarMax(p);
    const { pct, source } = getPillarPct(p, pillarPctMap);
    const row = el('div', 'pillar-row');
    const nameEl = el('span', 'pillar-row__name', { textContent: p.name });
    const track  = el('div', 'pillar-row__track');
    const fill   = el('div', 'pillar-row__fill');
    fill.style.background = p.color;
    track.appendChild(fill);
    // Score brut conservé (info utile en absolu) ; pct affiché à droite uniquement si dispo.
    const scoreEl = el('span', 'pillar-row__score', { textContent: `${p.score}/${max}` });
    scoreEl.style.color = p.color;
    row.appendChild(nameEl);
    row.appendChild(track);
    row.appendChild(scoreEl);
    if (source === 'unavailable') {
      // Fallback visuel : barre vide + tooltip légende.
      track.title = 'Détail pourcentage indisponible — re-scorez pour la ventilation V6.1';
      row.classList.add('pillar-row--legacy');
    }
    row.appendChild(buildTrendChip(p.score, p.prev));
    wrap.appendChild(row);

    /* Animate bar après insertion (uniquement si pct dispo) */
    if (pct != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
      });
    }
  });
  return wrap;
}

/** Carte investor readiness */
function buildInvestorReadiness(items) {
  const card = el('article', 'card-glass investor-readiness-card');
  card.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Investor Readiness' }));

  const list = el('ul', 'investor-readiness-list', { role: 'list' });
  items.forEach(item => {
    const li = el('li', 'investor-readiness-item');
    const dot = el('span', `readiness-dot readiness-dot--${item.status}`);
    dot.setAttribute('aria-hidden', 'true');
    const label = el('span', '', { textContent: item.label });
    li.appendChild(dot);
    li.appendChild(label);
    list.appendChild(li);
  });

  const barWrap = el('div', 'readiness-bar-wrap');
  const okCount = items.filter(i => i.status === 'ok').length;
  const pct = Math.round((okCount / items.length) * 100);

  const barLabel = el('div', 'readiness-bar-label');
  barLabel.appendChild(el('span', '', { textContent: 'Préparation globale' }));
  barLabel.appendChild(el('span', '', { textContent: `${pct}%` }));
  const track = el('div', 'readiness-bar-track');
  const fill  = el('div', 'readiness-bar-fill');
  track.appendChild(fill);
  barWrap.appendChild(barLabel);
  barWrap.appendChild(track);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  });

  card.appendChild(list);
  card.appendChild(barWrap);
  return card;
}

/* ── Sanitize detail data ─────────────────────────────────────────────── */
function sanitizeDetailData(data) {
  data.score = Number.isFinite(data.score) ? data.score : 0;
  data.scorePrev = Number.isFinite(data.scorePrev) ? data.scorePrev : data.score;
  data.level = data.level || '—';
  data.stage = data.stage || '—';
  data.sector = data.sector || '—';
  data.updatedAt = data.updatedAt || new Date().toISOString();
  data.pillars = Array.isArray(data.pillars) && data.pillars.length > 0 ? data.pillars : [];
  data.pillars.forEach(p => {
    p.score = Number.isFinite(p.score) ? p.score : 0;
    p.prev = Number.isFinite(p.prev) ? p.prev : p.score;
    p.name = p.name || 'Pilier';
    p.color = p.color || 'var(--accent-violet)';
    p.insight = p.insight || '';
  });
  data.history = Array.isArray(data.history) && data.history.length > 0 ? data.history : [
    { label: 'Actuel', date: new Date().toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }), score: data.score }
  ];
  data.recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
  data.investorReadiness = Array.isArray(data.investorReadiness) ? data.investorReadiness : [];
  data.market = data.market || {};
  data.graph = data.graph && data.graph.nodes ? data.graph : {
    nodes: [{ id: 'you', label: 'Vous', type: 'user' }],
    links: []
  };
}

/* ── Delta 14 : Chip consensus IA + Trust block méthodologie ─────────── */

/**
 * Chip discrète qui matérialise le niveau de consensus IA (V6.1).
 * Mapping high/medium/low → label FR + couleur. Tolère le legacy `confidence_level`
 * (string vide ou non-canonique) en passant par alias backend.
 * Renvoie null si le signal est absent → frontend skip l'affichage.
 */
function buildConsensusChip(rawConfidence) {
  if (!rawConfidence || typeof rawConfidence !== 'string') return null;
  const lvl = rawConfidence.toLowerCase().trim();
  const map = {
    high:   { label: 'Consensus IA solide',                          color: 'var(--accent-emerald)' },
    medium: { label: 'Consensus IA partiel',                         color: 'var(--accent-amber)'   },
    low:    { label: 'Consensus IA divisé — analyste a tranché',     color: 'var(--accent-rose)'    },
  };
  const conf = map[lvl];
  if (!conf) return null;
  const chip = el('span', 'verdict-banner__consensus');
  chip.textContent = conf.label;
  chip.style.color = conf.color;
  chip.style.borderColor = `color-mix(in srgb, ${conf.color} 35%, transparent)`;
  chip.title = 'Niveau d\'accord entre les agents IA Flaynn lors du scoring V6.1.';
  return chip;
}

/**
 * Trust block méthodologie (Delta 14) : carte sobre en bas du détail.
 * Affiche methodology_version + benchmark_snapshot_date + benchmark_coverage si dispo.
 * Renvoie null si AUCUN signal présent (pré-V6.1) → ne pas polluer la vue.
 */
function buildTrustBlock(data) {
  const methodo = data.methodology_version || data.flaynn_intelligence_version || '';
  const bSnap = data.benchmark_snapshot_date || '';
  const bCov = data.benchmark_coverage || '';
  if (!methodo && !bSnap && !bCov) return null;

  const card = el('article', 'card-glass dashboard-trust-block');
  card.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Méthodologie Flaynn Intelligence' }));

  const list = el('dl', 'dashboard-trust-block__list');
  if (methodo) {
    list.appendChild(el('dt', 'dashboard-trust-block__label', { textContent: 'Version' }));
    list.appendChild(el('dd', 'dashboard-trust-block__value', { textContent: methodo }));
  }
  if (bSnap) {
    let formatted = bSnap;
    try {
      const d = new Date(bSnap);
      if (!Number.isNaN(d.getTime())) {
        formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch { /* keep raw */ }
    list.appendChild(el('dt', 'dashboard-trust-block__label', { textContent: 'Benchmark' }));
    list.appendChild(el('dd', 'dashboard-trust-block__value', { textContent: `Snapshot ${formatted}` }));
  }
  if (bCov) {
    const covLabel = ({ high: 'Couverture solide', medium: 'Couverture partielle', low: 'Couverture limitée' })[String(bCov).toLowerCase()] || `Couverture ${bCov}`;
    list.appendChild(el('dt', 'dashboard-trust-block__label', { textContent: 'Couverture' }));
    list.appendChild(el('dd', 'dashboard-trust-block__value', { textContent: covLabel }));
  }
  card.appendChild(list);

  // Anchor /methodology — page non encore créée (out of scope Delta 14).
  // Lien fallback vers /#methodology sur la home (anchor existant ou à venir).
  const link = el('a', 'dashboard-trust-block__link', {
    href: '/#methodology',
    textContent: 'Comprendre la méthodologie →',
  });
  card.appendChild(link);

  return card;
}

/* ── Delta 9 : section Partage public (Flaynn Card publique) ──────────── */
// Delta 14 : Almost retiré du set côté frontend (brief Pass 3.D + §3 contrat de données).
// Backend public-cards.js conserve Almost pour rétrocompat des cards déjà publiées,
// mais le frontend ne propose plus la publication d'un dossier Almost.
const PUBLISHABLE_VERDICTS = new Set(['Ready', 'Yes', 'Strong Yes']);

function buildPublicShareSection(data) {
  const canPublish = PUBLISHABLE_VERDICTS.has(data.verdict);
  const card = data.publicCard;

  const wrap = el('article', 'card-glass dashboard-public-share');
  const titleRow = el('div', 'dashboard-public-share__title-row');
  titleRow.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Partage public' }));

  if (card && card.url) {
    /* État 3 : carte publiée */
    wrap.classList.add('dashboard-public-share--live');
    const status = el('span', 'dashboard-public-share__status');
    status.appendChild(el('span', 'dashboard-public-share__status-dot'));
    status.appendChild(document.createTextNode('En ligne'));
    titleRow.appendChild(status);
    wrap.appendChild(titleRow);

    const linkRow = el('div', 'dashboard-public-share__link-row');
    const linkInput = el('input', 'dashboard-public-share__link', {
      type: 'text',
      readonly: 'readonly',
      value: card.url,
      'aria-label': 'URL publique de votre Flaynn Card'
    });
    const copyBtn = el('button', 'dashboard-public-share__btn', {
      type: 'button',
      textContent: 'Copier'
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(card.url);
        copyBtn.textContent = 'Copié ✓';
        setTimeout(() => { copyBtn.textContent = 'Copier'; }, 2000);
      } catch {
        linkInput.select();
      }
    });
    linkRow.appendChild(linkInput);
    linkRow.appendChild(copyBtn);
    wrap.appendChild(linkRow);

    const actions = el('div', 'dashboard-public-share__actions');
    const openLink = el('a', 'dashboard-public-share__open', {
      href: card.url,
      target: '_blank',
      rel: 'noopener',
      textContent: 'Ouvrir la page publique →'
    });
    const unpubBtn = el('button', 'dashboard-public-share__btn dashboard-public-share__btn--danger', {
      type: 'button',
      textContent: 'Dépublier'
    });
    unpubBtn.addEventListener('click', async () => {
      if (!window.confirm('Dépublier cette Flaynn Card ? Le lien deviendra inaccessible.')) return;
      unpubBtn.disabled = true;
      unpubBtn.textContent = 'Dépublication…';
      try {
        const res = await fetch(
          `/api/dashboard/${encodeURIComponent(data.id)}/publish/${card.card_id}`,
          { method: 'DELETE', credentials: 'same-origin' }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Erreur serveur' }));
          const ref = err.reference ? ` (réf. ${err.reference})` : '';
          throw new Error((err.message || err.error || 'Erreur inconnue') + ref);
        }
        window.location.reload();
      } catch (err) {
        alert('Dépublication impossible : ' + err.message);
        unpubBtn.disabled = false;
        unpubBtn.textContent = 'Dépublier';
      }
    });
    actions.appendChild(openLink);
    actions.appendChild(unpubBtn);
    wrap.appendChild(actions);

    const meta = el('p', 'dashboard-public-share__meta');
    const publishedAt = new Date(card.created_at).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const viewLabel = card.view_count === 1 ? 'vue' : 'vues';
    meta.textContent = `Publiée le ${publishedAt} · ${card.view_count} ${viewLabel}` +
      (card.og_pending ? ' · image de partage en cours de génération' : '');
    wrap.appendChild(meta);

  } else if (canPublish) {
    /* État 2 : publiable non publié */
    wrap.appendChild(titleRow);
    wrap.appendChild(el('p', 'dashboard-public-share__lead', {
      textContent: 'Publiez une version brandée et auditée de votre scoring. Partageable sur LinkedIn, utilisable dans vos dossiers investisseurs.'
    }));
    const publishBtn = el('button', 'btn-primary dashboard-public-share__publish-btn', {
      type: 'button',
      textContent: 'Publier ma Flaynn Card'
    });
    publishBtn.addEventListener('click', async () => {
      publishBtn.disabled = true;
      publishBtn.textContent = 'Publication en cours…';
      try {
        const res = await fetch(
          `/api/dashboard/${encodeURIComponent(data.id)}/publish`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Erreur serveur' }));
          const ref = err.reference ? ` (réf. ${err.reference})` : '';
          throw new Error((err.message || err.error || 'Erreur inconnue') + ref);
        }
        window.location.reload();
      } catch (err) {
        alert('Publication impossible : ' + err.message);
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publier ma Flaynn Card';
      }
    });
    wrap.appendChild(publishBtn);

  } else {
    /* État 1 : verrouillé (verdict Almost / Not yet / Error / absent) — Delta 14 */
    wrap.classList.add('dashboard-public-share--disabled');
    wrap.appendChild(titleRow);
    wrap.appendChild(el('p', 'dashboard-public-share__lead', {
      textContent: 'Votre Flaynn Card publique permet de partager votre scoring en un lien.',
    }));

    // Hint contextualisé selon le verdict (brief Pass 3.D).
    let hintText;
    if (data.verdict === 'Almost') {
      hintText = 'Publication réservée aux verdicts Yes ou Strong Yes. Re-scorez pour faire évoluer votre dossier.';
    } else if (data.verdict === 'Not yet') {
      hintText = 'Verdict "Not yet" — la publication est désactivée. Renforcez votre dossier puis re-scorez.';
    } else {
      hintText = 'Débloquez le partage public en améliorant votre score par un nouveau scoring.';
    }
    wrap.appendChild(el('p', 'dashboard-public-share__hint', { textContent: hintText }));

    // Bouton désactivé visible (signal de l'action verrouillée + tooltip explicatif).
    const lockedBtn = el('button', 'btn-primary dashboard-public-share__publish-btn', {
      type: 'button',
      textContent: 'Publier ma Flaynn Card',
      disabled: 'disabled',
      'aria-disabled': 'true',
    });
    lockedBtn.title = 'Publication réservée aux verdicts Yes ou Strong Yes';
    wrap.appendChild(lockedBtn);
  }

  return wrap;
}

/* ── Liste : helpers Delta 14 ──────────────────────────────────────────── */

/** Header de la liste : titre + CTA "Nouveau scoring" persistant (toujours visible) */
function buildListHeader() {
  const wrap = el('div', 'dashboard-list-header');
  wrap.appendChild(el('h2', 'heading-section dashboard-list-header__title', { textContent: 'Mes Analyses' }));
  const cta = el('a', 'btn-primary dashboard-list-header__cta', {
    href: '/scoring/',
    textContent: 'Nouveau scoring',
  });
  wrap.appendChild(cta);
  return wrap;
}

/**
 * Bandeau KPI premium (Delta 15 Pass 2) : 3 cards glassmorphism avec
 * sparklines inline + variation chips. Calculs locaux uniquement (pas de
 * backend touché, cf brief §11 Q3).
 *
 * Seuil de pertinence stats : si <4 analyses, on n'affiche ni delta ni
 * sparkline (signal trop bruité). Le KPI affiche alors juste sa valeur.
 */
function buildKpiStrip(items) {
  const total = items.length;
  const scored = items.filter((it) => typeof it.score === 'number' && it.score > 0);
  const avgScore = scored.length
    ? Math.round(scored.reduce((acc, it) => acc + it.score, 0) / scored.length)
    : null;
  // items déjà triés DESC par created_at côté backend → [0] = le plus récent.
  const lastWithVerdict = items.find((it) => it.verdict);
  const lastVerdictKey = lastWithVerdict ? lastWithVerdict.verdict : null;
  const lastVerdict = lastVerdictKey
    ? (VERDICT_LABELS_FR[lastVerdictKey] || lastVerdictKey)
    : '—';
  const lastVerdictColor = lastVerdictKey
    ? (VERDICT_COLORS[lastVerdictKey] || 'var(--text-secondary)')
    : 'var(--text-secondary)';
  const lastTrack = lastWithVerdict ? (lastWithVerdict.track || '') : '';

  const enoughData = total >= 4;
  let totalDelta = null, totalSeries = null;
  let scoreDelta = null, scoreSeries = null;
  if (enoughData) {
    const counts = monthlyAnalysisCounts(items, 6);
    totalSeries = counts;
    // Delta = nb d'analyses du dernier mois - mois précédent.
    totalDelta = counts[counts.length - 1] - counts[counts.length - 2];

    const series = scoreSeriesByDate(items);
    if (series.length >= 4) {
      scoreSeries = series;
      const mid = Math.floor(series.length / 2);
      const oldAvg = series.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const newAvg = series.slice(mid).reduce((a, b) => a + b, 0) / (series.length - mid);
      scoreDelta = Math.round(newAvg - oldAvg);
    }
  }

  const strip = el('div', 'dashboard-kpi-strip');

  // KPI 1 : Analyses totales
  strip.appendChild(buildKpiCard({
    label: 'Analyses totales',
    value: String(total),
    variation: renderVariationChip(totalDelta),
    sparkline: totalSeries
      ? renderSparkline(totalSeries, 'var(--accent-violet)',
          `Évolution sur 6 mois : ${totalSeries.join(', ')}`)
      : null,
  }));

  // KPI 2 : Score moyen
  strip.appendChild(buildKpiCard({
    label: 'Score moyen',
    value: avgScore != null ? `${avgScore}/100` : '—',
    variation: renderVariationChip(scoreDelta, { suffix: ' pts' }),
    sparkline: scoreSeries
      ? renderSparkline(scoreSeries, 'var(--accent-rose)',
          `Évolution des scores : ${scoreSeries.join(', ')}`)
      : null,
  }));

  // KPI 3 : Dernier verdict (catégoriel — badge coloré + track, pas de sparkline)
  const verdictBadge = el('span', 'dashboard-kpi__verdict-badge', { textContent: lastVerdict });
  verdictBadge.style.color = lastVerdictColor;
  verdictBadge.style.borderColor = lastVerdictColor;
  strip.appendChild(buildKpiCard({
    label: 'Dernier verdict',
    valueNode: verdictBadge,
    sublabel: lastTrack ? `Track · ${lastTrack}` : null,
    variant: 'verdict',
  }));

  return strip;
}

/** Construit une card KPI individuelle (factorisation des 3 KPIs ci-dessus). */
function buildKpiCard({ label, value, valueNode, variation, sparkline, sublabel, variant }) {
  const card = el('div', `dashboard-kpi${variant ? ` dashboard-kpi--${variant}` : ''}`);
  const header = el('div', 'dashboard-kpi__header');
  header.appendChild(el('span', 'dashboard-kpi__label', { textContent: label }));
  if (variation) header.appendChild(variation);
  card.appendChild(header);
  if (valueNode) {
    card.appendChild(valueNode);
  } else {
    card.appendChild(el('p', 'dashboard-kpi__value', { textContent: value }));
  }
  if (sublabel) {
    card.appendChild(el('span', 'dashboard-kpi__sublabel', { textContent: sublabel }));
  }
  if (sparkline) {
    const wrap = el('div', 'dashboard-kpi__sparkline-wrap');
    wrap.appendChild(sparkline);
    card.appendChild(wrap);
  }
  return card;
}

/**
 * Card analyse premium (Delta 15 Pass 3) :
 *   ┌──────────────────────────────────────────┐
 *   │  ┌────┐  Startup name        [Almost]    │  ← __top : donut + content
 *   │  │ 48 │  saas · pre-seed · 21 avril       │
 *   │  └────┘                                    │
 *   │  Market    ████████░░  65%  [+8]           │  ← pillars + variation
 *   │  ...                                       │
 *   │  ─────────────────────────────────         │
 *   │  Track : De-risk         [● Publiée]       │  ← footer : track + pub
 *   └──────────────────────────────────────────┘
 *
 * Variations piliers : item._pillarDeltas (rempli par annotateItemsWithDeltas).
 * Indicateur publié : déplacé du badges header vers le footer (clarité).
 */
function buildAnalysisCard(item) {
  const card = el('article', 'card-glass dashboard-analysis-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `Ouvrir l'analyse ${item.startup_name || item.reference_id}`);
  const goDetail = () => {
    history.pushState(null, '', `/dashboard/?id=${encodeURIComponent(item.reference_id)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  card.addEventListener('click', goDetail);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetail(); }
  });

  const isPending = item.status === 'pending_analysis' || item.status === 'pending_webhook' || item.status === 'under_review';
  const isError = item.status === 'error';
  const hasScore = typeof item.score === 'number' && item.score > 0;

  /* Top : (donut score à gauche si scoré) + (titre + verdict/status badge + meta) */
  const top = el('div', 'dashboard-analysis-card__top');

  if (hasScore) {
    const donutWrap = el('div', 'dashboard-analysis-card__donut');
    donutWrap.appendChild(renderDonutScore(item.score, scoreColorFromValue(item.score), 60));
    donutWrap.style.color = scoreColorFromValue(item.score);
    top.appendChild(donutWrap);
  }

  const topContent = el('div', 'dashboard-analysis-card__top-content');
  const header = el('div', 'dashboard-analysis-card__header');
  header.appendChild(el('h3', 'dashboard-analysis-card__title', {
    textContent: item.startup_name || item.reference_id,
  }));

  const badges = el('div', 'dashboard-analysis-card__badges');
  if (isPending) {
    const b = el('span', 'dashboard-analysis-card__status dashboard-analysis-card__status--pending', {
      textContent: item.status === 'under_review' ? 'Certification' : 'En cours',
    });
    b.setAttribute('aria-label', 'Analyse en cours');
    badges.appendChild(b);
  } else if (isError) {
    badges.appendChild(el('span', 'dashboard-analysis-card__status dashboard-analysis-card__status--error', {
      textContent: 'Erreur',
    }));
  } else if (item.verdict) {
    const verdictColor = VERDICT_COLORS[item.verdict] || 'var(--accent-violet)';
    const b = el('span', 'dashboard-analysis-card__verdict', {
      textContent: VERDICT_LABELS_FR[item.verdict] || item.verdict,
    });
    b.style.color = verdictColor;
    b.style.borderColor = verdictColor;
    badges.appendChild(b);
  }
  header.appendChild(badges);
  topContent.appendChild(header);

  const metaParts = [];
  if (item.sector) metaParts.push(item.sector);
  if (item.stage) metaParts.push(item.stage);
  metaParts.push(new Date(item.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }));
  topContent.appendChild(el('p', 'dashboard-analysis-card__meta', { textContent: metaParts.join(' · ') }));

  top.appendChild(topContent);
  card.appendChild(top);

  /* Body : mini-bars piliers (+ variation chips) OU message d'état */
  if (isPending) {
    card.appendChild(el('p', 'dashboard-analysis-card__state-msg', {
      textContent: item.status === 'under_review'
        ? 'Certification analyste en cours…'
        : 'Analyse IA en cours…',
    }));
    card.classList.add('dashboard-analysis-card--muted');
  } else if (isError) {
    card.appendChild(el('p', 'dashboard-analysis-card__state-msg', {
      textContent: 'Une erreur est survenue lors du scoring. Ouvrez l\'analyse pour plus d\'infos.',
    }));
    card.classList.add('dashboard-analysis-card--error');
  } else if (item.pillar_pct) {
    const bars = el('div', 'dashboard-analysis-card__pillars');
    LIST_PILLARS.forEach((p) => {
      const raw = item.pillar_pct[p.key];
      const pct = (typeof raw === 'number' && Number.isFinite(raw))
        ? Math.max(0, Math.min(100, Math.round(raw)))
        : 0;
      const row = el('div', 'dashboard-analysis-card__pillar-row');
      row.appendChild(el('span', 'dashboard-analysis-card__pillar-label', { textContent: p.label }));
      const track = el('div', 'dashboard-analysis-card__pillar-track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-label', `${p.label} : ${pct}%`);
      const fill = el('div', 'dashboard-analysis-card__pillar-fill');
      fill.style.background = p.color;
      track.appendChild(fill);
      row.appendChild(track);
      const val = el('span', 'dashboard-analysis-card__pillar-value', { textContent: `${pct}%` });
      val.style.color = p.color;
      row.appendChild(val);

      // Variation chip (Delta 15) : depuis _pillarDeltas[k] si renseigné par
      // annotateItemsWithDeltas. Absent pour la 1re analyse d'un dossier.
      const delta = item._pillarDeltas ? item._pillarDeltas[p.key] : null;
      const chip = renderVariationChip(delta);
      if (chip) {
        chip.classList.add('dashboard-analysis-card__pillar-variation');
        row.appendChild(chip);
      } else {
        // Placeholder vide pour conserver l'alignement de la grille.
        row.appendChild(el('span', 'dashboard-analysis-card__pillar-variation-empty'));
      }

      bars.appendChild(row);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
      });
    });
    card.appendChild(bars);
  } else {
    const msg = el('p', 'dashboard-analysis-card__state-msg', {
      textContent: 'Détail piliers indisponible — re-scorez pour voir la ventilation.',
    });
    msg.title = 'Re-scorez ce dossier pour voir les détails par pilier';
    card.appendChild(msg);
  }

  /* Footer : track (gauche) + indicateur publié (droite). Visible si scoré. */
  if (hasScore || item.is_published) {
    const footer = el('div', 'dashboard-analysis-card__footer');
    if (item.track) {
      footer.appendChild(el('span', 'dashboard-analysis-card__track', {
        textContent: `Track · ${item.track}`,
      }));
    } else {
      // Spacer pour pousser l'indicateur publié à droite si pas de track.
      footer.appendChild(el('span', 'dashboard-analysis-card__track-spacer'));
    }
    if (item.is_published) {
      const pub = el('span', 'dashboard-analysis-card__published', {
        textContent: 'Publiée',
      });
      pub.setAttribute('aria-label', 'Cette analyse est publiée publiquement');
      pub.title = 'Carte publique active';
      footer.appendChild(pub);
    }
    card.appendChild(footer);
  }

  return card;
}

/** Couleur du score selon la convention Dark Clarity (§5 CLAUDE.md) */
function scoreColorFromValue(score) {
  if (score < 40) return 'var(--accent-rose)';
  if (score < 70) return 'var(--accent-amber)';
  return 'var(--accent-emerald)';
}

/**
 * Filtres + recherche. Visibles uniquement si items.length >= 4 (cf. brief §5.2.D).
 * Re-rend `gridEl` en place via `renderItems(filtered)`.
 */
function buildListFilters(items, gridEl, renderItems) {
  const wrap = el('div', 'dashboard-list-filters');
  wrap.setAttribute('role', 'toolbar');
  wrap.setAttribute('aria-label', 'Filtrer et rechercher les analyses');

  const state = { verdict: 'all', search: '' };

  /* Toggles verdicts présents dans la liste (+ "Tous") */
  const presentVerdicts = Array.from(new Set(items.map((it) => it.verdict).filter(Boolean)));
  // Ordre canonique d'affichage
  const canonicalOrder = ['Strong Yes', 'Yes', 'Almost', 'Not yet'];
  const orderedVerdicts = canonicalOrder.filter((v) => presentVerdicts.includes(v));

  const toggleGroup = el('div', 'dashboard-list-filters__verdicts');
  const verdictButtons = [];

  function makeVerdictBtn(verdictKey, label, color) {
    const btn = el('button', 'dashboard-list-filters__btn', { type: 'button' });
    btn.textContent = label;
    btn.dataset.verdict = verdictKey;
    if (color) btn.style.setProperty('--filter-accent', color);
    btn.addEventListener('click', () => {
      state.verdict = verdictKey;
      verdictButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.verdict === verdictKey));
      apply();
    });
    return btn;
  }
  const allBtn = makeVerdictBtn('all', 'Tous');
  allBtn.classList.add('is-active');
  toggleGroup.appendChild(allBtn);
  verdictButtons.push(allBtn);
  orderedVerdicts.forEach((v) => {
    const btn = makeVerdictBtn(v, VERDICT_LABELS_FR[v] || v, VERDICT_COLORS[v]);
    toggleGroup.appendChild(btn);
    verdictButtons.push(btn);
  });
  wrap.appendChild(toggleGroup);

  /* Recherche texte */
  const searchWrap = el('div', 'dashboard-list-filters__search-wrap');
  const searchInput = el('input', 'dashboard-list-filters__search', {
    type: 'search',
    placeholder: 'Rechercher une startup…',
    'aria-label': 'Rechercher une startup par nom',
  });
  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = searchInput.value.trim().toLowerCase();
      apply();
    }, 150);
  });
  searchWrap.appendChild(searchInput);
  wrap.appendChild(searchWrap);

  function apply() {
    const filtered = items.filter((it) => {
      if (state.verdict !== 'all' && it.verdict !== state.verdict) return false;
      if (state.search) {
        const name = (it.startup_name || '').toLowerCase();
        if (!name.includes(state.search)) return false;
      }
      return true;
    });
    renderItems(filtered);
  }

  return wrap;
}

/** Vue compte : identité read-only + Zone de danger (déplacée depuis la liste, brief §5.2.E) */
function buildAccountView(auth) {
  const section = el('section', 'dashboard-app__section');
  section.appendChild(el('h2', 'heading-section', { textContent: 'Mon compte' }));

  const idCard = el('article', 'card-glass dashboard-account-card');
  idCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Identité' }));
  if (auth) {
    const list = el('dl', 'dashboard-account-list');
    if (auth.name) {
      list.appendChild(el('dt', 'dashboard-account-list__label', { textContent: 'Nom' }));
      list.appendChild(el('dd', 'dashboard-account-list__value', { textContent: auth.name }));
    }
    if (auth.email) {
      list.appendChild(el('dt', 'dashboard-account-list__label', { textContent: 'Email' }));
      list.appendChild(el('dd', 'dashboard-account-list__value', { textContent: auth.email }));
    }
    idCard.appendChild(list);
  } else {
    idCard.appendChild(el('p', 'dashboard-meta', { textContent: 'Mode démo : connectez-vous pour voir votre identité.' }));
  }
  section.appendChild(idCard);

  if (auth) section.appendChild(buildDangerZone(auth));
  return section;
}

/**
 * Zone de danger (suppression compte). Extraite de la liste racine vers la vue Account.
 * Double confirmation : (1) confirm() initial, (2) typer le nom du compte.
 */
function buildDangerZone(auth) {
  const card = el('article', 'card-glass dashboard-danger-card');
  const title = el('h3', 'dashboard-card-title', { textContent: 'Zone de danger' });
  title.style.color = 'var(--accent-rose)';
  card.appendChild(title);
  card.appendChild(el('p', 'dashboard-meta', {
    textContent: 'La suppression du compte est définitive. Toutes vos analyses, scorings publics et données associées seront effacés.',
  }));

  const deleteBtn = el('button', 'dashboard-logout-btn dashboard-danger-card__btn', { type: 'button' });
  deleteBtn.textContent = 'Supprimer mon compte';
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) return;
    const expectedName = (auth && auth.name) ? auth.name.trim() : (auth && auth.email) || '';
    if (expectedName) {
      const typed = window.prompt(`Pour confirmer, tapez exactement : ${expectedName}`);
      if (!typed || typed.trim() !== expectedName) {
        alert('Confirmation non valide — suppression annulée.');
        return;
      }
    }
    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) { clearAuth(); window.location.replace('/'); }
      else alert('Suppression impossible. Réessayez plus tard.');
    } catch {
      alert('Suppression impossible (réseau).');
    }
  });
  card.appendChild(deleteBtn);
  return card;
}

/* ── Handlers de routes ────────────────────────────────────────────────── */
function buildRoutes(data) {
  return [
    /* ── VUE D'ENSEMBLE ── */
    {
      path: /^\/dashboard\/?$/,
      async handler(root) {
        // ARCHITECT-PRIME: re-fetch dynamique selon l'URL pour supporter la navigation SPA
        const id = new URLSearchParams(window.location.search).get('id');
        if (!id && !data.isList) {
          // Retour à la liste depuis une vue détail
          try {
            const res = await fetch('/api/dashboard/list', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
            if (res.status === 401 || res.status === 403) { clearAuth(); window.location.replace('/auth/?expired=1'); return; }
            if (res.ok) {
              const listData = await res.json();
              Object.keys(data).forEach(k => delete data[k]);
              Object.assign(data, { isDemo: false, isList: true, items: listData });
            }
          } catch { /* garde les données actuelles */ }
        } else if (id && (data.isList || data.id !== id)) {
          // Navigation vers un détail depuis la liste (ou changement de détail)
          try {
            const res = await fetch(`/api/dashboard/${encodeURIComponent(id)}`, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
            if (res.status === 401 || res.status === 403) { clearAuth(); window.location.replace('/auth/?expired=1'); return; }
            if (res.ok) {
              const apiData = await res.json();
              Object.keys(data).forEach(k => delete data[k]);
              Object.assign(data, apiData, { isDemo: false, isList: false });
              sanitizeDetailData(data);
            }
          } catch { /* garde les données actuelles */ }
        }

        const section = el('section', 'dashboard-app__section');

        if (data.isList) {
          // ARCHITECT-PRIME: Delta 14 — refonte liste : header avec CTA persistant,
          // KPI strip, cards enrichies, filtres conditionnels (N≥4). Zone de danger
          // déplacée vers /dashboard/account (cf. buildAccountView / buildDangerZone).
          section.appendChild(buildListHeader());

          if (!data.items || data.items.length === 0) {
            // Empty state : illustration sobre + CTA primaire vers /scoring/ + lien démo
            const emptyWrap = el('div', 'dashboard-empty-state');
            emptyWrap.appendChild(el('p', 'dashboard-app__lead', {
              textContent: 'Vous n\'avez pas encore soumis de startup. Lancez votre premier scoring pour obtenir un verdict en 24h.',
            }));
            const ctaPrimary = el('a', 'btn-primary dashboard-empty-state__cta', {
              href: '/scoring/',
              textContent: 'Lancer mon premier scoring',
            });
            emptyWrap.appendChild(ctaPrimary);
            section.appendChild(emptyWrap);
            root.appendChild(section);
            return;
          }

          /* Pre-process : annoter chaque item avec ses deltas vs analyse précédente
             du même startup_name (Delta 15 Pass 3, option A frontend-only). */
          annotateItemsWithDeltas(data.items);

          /* KPI strip (toujours visible si N≥1) */
          section.appendChild(buildKpiStrip(data.items));

          /* Grid + filtres (filtres uniquement si N≥4) */
          const grid = el('div', 'dashboard-analysis-grid');
          const renderItems = (list) => {
            clearEl(grid);
            if (list.length === 0) {
              const empty = el('p', 'dashboard-meta dashboard-analysis-grid__empty', {
                textContent: 'Aucune analyse ne correspond à ces filtres.',
              });
              grid.appendChild(empty);
              return;
            }
            list.forEach((item) => grid.appendChild(buildAnalysisCard(item)));
          };

          if (data.items.length >= 4) {
            section.appendChild(buildListFilters(data.items, grid, renderItems));
          }

          renderItems(data.items);
          section.appendChild(grid);

          root.appendChild(section);
          return;
        }

        // ARCHITECT-PRIME: Bouton retour vers la liste
        const backLink = el('button', 'dashboard-back-btn', { type: 'button' });
        backLink.textContent = '← Retour aux analyses';
        backLink.addEventListener('click', () => { history.pushState(null, '', '/dashboard/'); window.dispatchEvent(new PopStateEvent('popstate')); });
        section.appendChild(backLink);

        // ARCHITECT-PRIME : Gestion des états asynchrones (En cours / Certification / Erreur)
        const isAiPending = data.status === 'pending_analysis' || data.status === 'pending_webhook';
        const isUnderReview = data.status === 'under_review';
        if (isAiPending || isUnderReview) {
          const heading = isUnderReview ? 'Certification en cours' : 'Analyse en cours...';
          const leadMsg = isUnderReview
            ? 'Votre scoring IA est terminé. Un analyste Flaynn valide actuellement le dossier avant publication. Délai habituel : moins de 24h.'
            : 'Notre IA est en train d\'évaluer vos données. Cela prend généralement moins de 30 secondes.';
          const spinnerMsg = isUnderReview ? 'Validation humaine en cours...' : 'Évaluation en cours...';
          const pollIntervalMs = isUnderReview ? 15000 : 3000;
          const pollMaxCount = isUnderReview ? 240 : 60;

          section.appendChild(el('h2', 'heading-section', { textContent: heading }));
          section.appendChild(el('p', 'dashboard-app__lead', { textContent: leadMsg }));

          const spinner = el('div', 'polling-spinner');
          const spinnerDot = el('span', 'polling-spinner__dot');
          const spinnerLabel = el('span', 'polling-spinner__label', { textContent: spinnerMsg });
          spinner.appendChild(spinnerDot);
          spinner.appendChild(spinnerLabel);
          section.appendChild(spinner);

          root.appendChild(section);

          let pollCount = 0;
          const pollInterval = setInterval(async () => {
            if (!document.body.contains(section)) {
              clearInterval(pollInterval);
              return;
            }
            pollCount++;
            if (pollCount > pollMaxCount) {
              clearInterval(pollInterval);
              spinnerLabel.textContent = isUnderReview
                ? 'La certification prend plus de temps que prévu. Vous recevrez un email dès que votre rapport sera disponible.'
                : 'L\'analyse prend plus de temps que prévu. Rafraîchissez la page dans quelques minutes.';
              return;
            }
            try {
              const res = await fetch(`/api/dashboard/${encodeURIComponent(data.id)}`, { credentials: 'same-origin' });
              if (res.ok) {
                const newData = await res.json();
                const stillPending = newData.status === 'pending_analysis' || newData.status === 'pending_webhook' || newData.status === 'under_review';
                if (!stillPending) {
                  clearInterval(pollInterval);
                  spinnerLabel.textContent = 'Analyse certifiée - chargement des résultats...';
                  spinnerDot.classList.add('polling-spinner__dot--done');
                  window.setTimeout(() => window.location.reload(), 800);
                }
              }
            } catch (err) {}
          }, pollIntervalMs);

          return;
        }

        if (data.status === 'error') {
          section.appendChild(el('h2', 'heading-section', { textContent: 'Analyse échouée' }));
          const errLead = el('p', 'dashboard-app__lead', { textContent: 'Un problème technique est survenu lors de l\'évaluation de votre dossier par l\'IA. Veuillez nous contacter ou relancer un audit.' });
          errLead.style.color = 'var(--accent-rose)';
          section.appendChild(errLead);
          root.appendChild(section);
          return;
        }

        const d3 = await loadD3();
        /* Demo banner */
        if (data.isDemo) section.appendChild(buildDemoBanner());

        /* Score summary row */
        const summaryRow = el('div', 'score-summary-row');

        const radialCard = el('article', 'card-glass score-summary-card score-radial-wrap');
        const radialViz  = el('div', 'dashboard-viz');
        radialCard.appendChild(radialViz);
        summaryRow.appendChild(radialCard);

        const diff = data.score - data.scorePrev;
        summaryRow.appendChild(buildSummaryCard('Niveau', data.level, `${data.stage} · ${data.sector}`));
        summaryRow.appendChild(buildSummaryCard('Évolution', `${diff >= 0 ? '+' : ''}${diff} pts`,
          `vs audit précédent (${data.scorePrev}/100)`));
        summaryRow.appendChild(buildSummaryCard('Mis à jour',
          new Date(data.updatedAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }),
          'Dernière analyse'));

        section.appendChild(summaryRow);

        /* Verdict banner */
        if (data.verdict) {
          const verdictCard = el('article', 'card-glass verdict-banner');
          const verdictColors = {
            'Strong Yes': 'var(--accent-emerald)',
            'Yes':        'var(--accent-emerald)',
            'Almost':     'var(--accent-amber)',
            'Not yet':    'var(--accent-rose)',
            'Ready':      'var(--accent-emerald)'
          };
          const verdictColor = verdictColors[data.verdict] || 'var(--accent-violet)';
          verdictCard.style.borderLeft = `4px solid ${verdictColor}`;

          const verdictHeader = el('div', 'verdict-banner__header');
          const verdictBadge = el('span', 'verdict-banner__badge');
          verdictBadge.textContent = data.verdict;
          verdictBadge.style.color = verdictColor;
          verdictBadge.style.border = `1px solid ${verdictColor}`;
          verdictHeader.appendChild(verdictBadge);
          if (data.track) {
            const trackBadge = el('span', 'verdict-banner__track');
            trackBadge.textContent = `Track : ${data.track}`;
            verdictHeader.appendChild(trackBadge);
          }
          // ARCHITECT-PRIME: Delta 14 — chip consensus IA (signal V6.1).
          // Discrète, à droite du track. Skipée si champ absent (pré-V6.1).
          const consensusChip = buildConsensusChip(data.consensus_confidence);
          if (consensusChip) verdictHeader.appendChild(consensusChip);
          verdictCard.appendChild(verdictHeader);

          if (data.track_reason) {
            verdictCard.appendChild(el('p', 'verdict-banner__reason', { textContent: data.track_reason }));
          }
          section.appendChild(verdictCard);
        }

        /* Delta 9 : section Partage public (Flaynn Card publique) */
        section.appendChild(buildPublicShareSection(data));

        /* Pillar rows */
        const pillarCard = el('article', 'card-glass');
        pillarCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Cinq piliers - synthèse' }));
        pillarCard.appendChild(buildPillarRows(data.pillars, data.pillar_pct));
        section.appendChild(pillarCard);

        /* Résumé exécutif */
        if (data.resume_executif && data.resume_executif.length > 20) {
          const resumeCard = el('article', 'card-glass resume-card');
          resumeCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Résumé exécutif' }));
          if (data.score_context) {
            const ctx = el('p', 'resume-card__context', { textContent: data.score_context });
            resumeCard.appendChild(ctx);
          }
          const resumeText = el('p', 'resume-card__text', { textContent: data.resume_executif });
          resumeCard.appendChild(resumeText);
          section.appendChild(resumeCard);
        }

        /* 2-col: historique + investor readiness */
        const grid = el('div', 'dashboard-grid-2');

        const histCard = el('article', 'card-glass');
        histCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Évolution des scores' }));
        const histViz = el('div', 'chart-container');
        histCard.appendChild(histViz);
        grid.appendChild(histCard);

        grid.appendChild(buildInvestorReadiness(data.investorReadiness));
        section.appendChild(grid);

        /* Recommandations */
        const recoCard = el('article', 'card-glass');
        recoCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Recommandations prioritaires' }));
        recoCard.appendChild(buildRecommendations(data.recommendations));
        section.appendChild(recoCard);

        /* Prochaine étape fondateur */
        if (data.next_action_founder_title) {
          const actionCard = el('article', 'card-glass next-action-card');
          actionCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Prochaine étape' }));
          actionCard.appendChild(el('p', 'next-action-card__title', { textContent: data.next_action_founder_title }));
          if (data.next_action_founder_why) {
            actionCard.appendChild(el('p', 'next-action-card__why', { textContent: data.next_action_founder_why }));
          }
          /* Bloc resubmission */
          if (data.recommended_resubmission_date || data.resubmission_condition) {
            const resubBlock = el('div', 'next-action-card__resub');
            if (data.resubmission_intro) {
              resubBlock.appendChild(el('p', 'next-action-card__resub-intro', { textContent: data.resubmission_intro }));
            }
            if (data.resubmission_condition) {
              const condRow = el('div', 'next-action-card__resub-row');
              condRow.appendChild(el('span', 'next-action-card__resub-label', { textContent: 'Condition' }));
              condRow.appendChild(el('span', '', { textContent: data.resubmission_condition }));
              resubBlock.appendChild(condRow);
            }
            if (data.recommended_resubmission_date) {
              const dateRow = el('div', 'next-action-card__resub-row');
              dateRow.appendChild(el('span', 'next-action-card__resub-label', { textContent: 'Fenêtre' }));
              dateRow.appendChild(el('span', '', { textContent: data.recommended_resubmission_window || data.recommended_resubmission_date }));
              resubBlock.appendChild(dateRow);
            }
            if (data.progression_goal) {
              const goalRow = el('div', 'next-action-card__resub-row');
              goalRow.appendChild(el('span', 'next-action-card__resub-label', { textContent: 'Objectif' }));
              goalRow.appendChild(el('span', '', { textContent: data.progression_goal }));
              resubBlock.appendChild(goalRow);
            }
            actionCard.appendChild(resubBlock);
          }
          section.appendChild(actionCard);
        }

        /* Questions qu'un investisseur poserait */
        if (data.questions_for_founder_call && data.questions_for_founder_call.length > 0) {
          const qCard = el('article', 'card-glass questions-card');
          qCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Questions qu\'un investisseur vous poserait' }));
          const qList = el('ol', 'questions-card__list');
          data.questions_for_founder_call.forEach(q => {
            qList.appendChild(el('li', 'questions-card__item', { textContent: q }));
          });
          qCard.appendChild(qList);
          section.appendChild(qCard);
        }

        /* Bouton téléchargement PDF */
        if (data.has_pdf) {
          const pdfRow = el('div', 'dashboard-pdf-row');
          const pdfBtn = el('a', 'btn-primary btn-large');
          pdfBtn.href = `/api/dashboard/${encodeURIComponent(data.id)}/pdf`;
          pdfBtn.setAttribute('download', '');
          pdfBtn.textContent = 'Télécharger mon rapport PDF';
          pdfBtn.style.display = 'inline-flex';
          pdfBtn.style.gap = '10px';
          pdfBtn.style.alignItems = 'center';
          pdfBtn.style.marginTop = 'var(--space-6)';
          pdfRow.appendChild(pdfBtn);
          section.appendChild(pdfRow);
        }

        // ARCHITECT-PRIME: Delta 14 — trust block méthodologie en bas du détail.
        // Renvoie null si aucun signal V6.1 disponible (dossier legacy) → pas de carte vide.
        const trustBlock = buildTrustBlock(data);
        if (trustBlock) section.appendChild(trustBlock);

        root.appendChild(section);

        /* D3 renders */
        renderScoreRadial(radialViz, data.score, d3);
        renderScoreHistory(histViz, data.history, d3);
      }
    },

    /* ── PILIERS DÉTAIL ── */
    {
      path: /^\/dashboard\/pillars$/,
      async handler(root) {
        const section = el('section', 'dashboard-app__section');
        if (data.isList) {
          section.appendChild(el('p', 'dashboard-meta', { textContent: 'Veuillez sélectionner une analyse dans l\'onglet Overview.' }));
          root.appendChild(section);
          return;
        }
        if (data.status === 'pending_analysis' || data.status === 'pending_webhook' || data.status === 'under_review' || data.status === 'error') {
          section.style.color = 'var(--text-primary)';
          section.appendChild(el('p', 'dashboard-meta', { textContent: 'Données indisponibles. Consultez l\'onglet Overview pour voir le statut de l\'analyse.' }));
          root.appendChild(section);
          return;
        }
        const d3 = await loadD3();
        if (data.isDemo) section.appendChild(buildDemoBanner());

        section.appendChild(el('h2', 'heading-section', { textContent: 'Analyse par pilier' }));
        section.appendChild(el('p', 'dashboard-app__lead', {
          textContent: 'Chaque pilier est noté sur son propre barème et benchmarké contre des entreprises comparables à votre stade et secteur.'
        }));

        /* Radar centré */
        const radarCard = el('article', 'card-glass');
        radarCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Radar des piliers' }));
        const radarViz = el('div', 'dashboard-viz dashboard-viz--wide');
        radarCard.appendChild(radarViz);
        section.appendChild(radarCard);

        /* Cards détail — Delta 14 : pillar_pct V6.1 prioritaire pour la barre */
        const detailGrid = el('div', 'pillar-detail-grid');
        data.pillars.forEach(p => {
          const max = getPillarMax(p);
          const { pct, source } = getPillarPct(p, data.pillar_pct);
          const card = el('article', 'card-glass pillar-detail-card');

          const header = el('div', 'pillar-detail-card__header');
          const name   = el('h3', 'pillar-detail-card__name', { textContent: p.name });
          const swrap  = el('div', 'pillar-detail-card__score-wrap');
          const score  = el('span', 'pillar-detail-card__score', { textContent: String(p.score) });
          score.style.color = p.color;
          swrap.appendChild(score);
          swrap.appendChild(el('span', 'pillar-detail-card__score-max', { textContent: `/${max}` }));
          header.appendChild(name);
          header.appendChild(swrap);

          const track = el('div', 'pillar-detail-card__track');
          const fill  = el('div', 'pillar-detail-card__fill');
          fill.style.background = p.color;
          track.appendChild(fill);
          if (source === 'unavailable') {
            track.title = 'Détail pourcentage indisponible — re-scorez pour la ventilation V6.1';
            card.classList.add('pillar-detail-card--legacy');
          }

          const meta = el('div', '', { style: 'display:flex;align-items:center;gap:8px;margin-top:2px' });
          meta.appendChild(buildTrendChip(p.score, p.prev));
          meta.appendChild(el('span', 'dashboard-meta', { textContent: `Précédent : ${p.prev}/${max}` }));

          card.appendChild(header);
          card.appendChild(track);
          card.appendChild(meta);
          card.appendChild(el('p', 'pillar-detail-card__insight', { textContent: p.insight }));
          detailGrid.appendChild(card);

          if (pct != null) {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
            });
          }
        });

        section.appendChild(detailGrid);
        root.appendChild(section);
        if (data.pillars.length > 0) renderPillarRadar(radarViz, data.pillars, d3, data.pillar_pct);
      }
    },

    /* ── MARCHÉ ── */
    {
      path: /^\/dashboard\/network$/,
      async handler(root) {
        const section = el('section', 'dashboard-app__section');
        if (data.isList) {
          section.appendChild(el('p', 'dashboard-meta', { textContent: 'Veuillez sélectionner une analyse dans l\'onglet Overview.' }));
          root.appendChild(section);
          return;
        }
        if (data.status === 'pending_analysis' || data.status === 'pending_webhook' || data.status === 'under_review' || data.status === 'error') {
          section.style.color = 'var(--text-primary)';
          section.appendChild(el('p', 'dashboard-meta', { textContent: 'Données indisponibles. Consultez l\'onglet Overview pour voir le statut de l\'analyse.' }));
          root.appendChild(section);
          return;
        }
        const d3 = await loadD3();
        if (data.isDemo) section.appendChild(buildDemoBanner());

        section.appendChild(el('h2', 'heading-section', { textContent: 'Analyse de marché' }));
        section.appendChild(el('p', 'dashboard-app__lead', {
          textContent: 'Estimation du marché adressable et positionnement concurrentiel — données illustratives benchmarkées sur votre secteur.'
        }));

        /* TAM / SAM / SOM — fallback dynamique si SAM/SOM absents */
        const statsGrid = el('div', 'market-stats-grid');
        const rawMarket = data.market || {};
        const tamStr = rawMarket.tam || rawMarket.TAM || rawMarket.tam_value || '—';
        let samStr = rawMarket.sam || rawMarket.SAM || rawMarket.sam_value || '';
        let somStr = rawMarket.som || rawMarket.SOM || rawMarket.som_value || '';

        // ARCHITECT-PRIME: fallback SAM = TAM × 20%, SOM = SAM × 5% si absents
        if ((!samStr || !somStr) && tamStr && tamStr !== '—') {
          const tamNum = parseMarketValue(tamStr);
          if (tamNum > 0) {
            const samNum = samStr ? parseMarketValue(samStr) : tamNum * 0.20;
            if (!samStr) samStr = formatMarketValue(samNum);
            if (!somStr) somStr = formatMarketValue((samStr ? parseMarketValue(samStr) : samNum) * 0.05);
          }
        }

        const marketDefs = [
          { label: 'TAM — Marché total',     value: tamStr || '—', sub: 'Marché global adressable' },
          { label: 'SAM — Marché accessible', value: samStr || '—', sub: 'Votre segment cible réaliste' },
          { label: 'SOM — Part atteignable',  value: somStr || '—', sub: 'Objectif 3 ans (5% SAM)' },
        ];
        const allEmpty = marketDefs.every(m => m.value === '—');
        marketDefs.forEach((m, idx) => {
          const card = el('article', 'card-glass market-stat-card');
          card.appendChild(el('span', 'market-stat-card__label', { textContent: m.label }));
          const val = el('p', 'market-stat-card__value', { textContent: m.value });
          val.style.color = ['var(--accent-violet)', 'var(--accent-blue)', 'var(--accent-emerald)'][idx];
          card.appendChild(val);
          card.appendChild(el('p', 'market-stat-card__sub', { textContent: m.sub }));
          statsGrid.appendChild(card);
        });
        section.appendChild(statsGrid);
        if (allEmpty) {
          const notice = el('p', 'dashboard-meta', { textContent: 'Les données de marché ne sont pas encore disponibles pour cette analyse.' });
          notice.style.marginTop = 'var(--space-2)';
          section.appendChild(notice);
        }

        /* Graphe force-directed */
        const graphCard = el('article', 'card-glass');
        graphCard.appendChild(el('h3', 'dashboard-card-title', { textContent: 'Carte concurrentielle' }));
        const graphViz = el('div', 'dashboard-viz dashboard-viz--wide');
        graphCard.appendChild(graphViz);
        section.appendChild(graphCard);

        /* Légende */
        const legend = el('div', '', { style: 'display:flex;gap:16px;flex-wrap:wrap;margin-top:12px' });
        [
          { c: 'var(--accent-violet)', l: 'Votre startup' },
          { c: 'var(--accent-rose)',   l: 'Concurrent' },
          { c: 'var(--accent-blue)',   l: 'Partenaire' },
        ].forEach(({ c, l }) => {
          const item = el('div', '', { style: 'display:flex;align-items:center;gap:6px' });
          const dot  = el('span', '', { style: `width:10px;height:10px;border-radius:50%;background:${c};display:inline-block` });
          item.appendChild(dot);
          item.appendChild(el('span', 'dashboard-meta', { textContent: l }));
          legend.appendChild(item);
        });
        graphCard.appendChild(legend);

        root.appendChild(section);
        if (data.graph.nodes.length > 0) {
          renderCompetitiveGraph(graphViz, data.graph, d3);
        }
      }
    },

    /* ── COMPTE (Delta 14) ── */
    {
      path: /^\/dashboard\/account\/?$/,
      async handler(root) {
        // ARCHITECT-PRIME: vue Settings minimaliste (identité + zone de danger).
        // Auth lue à l'instant via getAuth() pour rester synchronisé après changement.
        const auth = getAuth();
        root.appendChild(buildAccountView(auth));
      }
    }
  ];
}

/* ── Routeur ───────────────────────────────────────────────────────────── */
function normalizePath(pathname) {
  return pathname === '/dashboard' ? '/dashboard/' : pathname;
}

class FlaynnRouter {
  constructor(routes, root) {
    this.routes = routes;
    this.root   = root;
    window.addEventListener('popstate', () => this.#resolve());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-route]');
      if (!link) return;
      if (typeof navigator.vibrate === 'function') navigator.vibrate(15);
      e.preventDefault();
      const path = link.getAttribute('data-route');
      if (path) this.navigate(path);
    });
    this.#resolve();
  }

  navigate(path) { history.pushState(null, '', path); this.#resolve(); }

  async #resolve() {
    const path = normalizePath(window.location.pathname);
    const match = this.routes.find(r =>
      typeof r.path === 'string' ? r.path === path : r.path.test(path)
    );
    if (!match) {
      if (path.startsWith('/dashboard')) {
        window.history.replaceState(null, '', '/dashboard/');
        return this.#resolve();
      }
      return;
    }
    stopForceSimulation();
    this.root.setAttribute('aria-busy', 'true');

    // ARCHITECT-PRIME: fade out before clearing content
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduced) {
      this.root.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      this.root.style.opacity = '0';
      this.root.style.transform = 'translateY(8px)';
      await new Promise(r => setTimeout(r, 200));
    }

    clearEl(this.root);

    // ARCHITECT-PRIME: skeleton inline pendant le handler async (zéro écran vide)
    const skel = el('div', 'dashboard-skeleton');
    for (let i = 0; i < 2; i++) {
      const c = el('div', 'card-glass skeleton-card');
      c.style.cssText = 'padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-3)';
      c.appendChild(el('div', 'skeleton skeleton-title'));
      c.appendChild(el('div', 'skeleton skeleton-text'));
      c.appendChild(el('div', 'skeleton skeleton-bar'));
      skel.appendChild(c);
    }
    this.root.appendChild(skel);

    // ARCHITECT-PRIME: show skeleton with opacity restored
    if (!prefersReduced) {
      this.root.style.opacity = '1';
      this.root.style.transform = 'translateY(0)';
    }

    try {
      clearEl(this.root);
      await match.handler(this.root, path);
    } finally { this.root.setAttribute('aria-busy', 'false'); }
    this.#syncNav(path);

    // ARCHITECT-PRIME: fade in new content
    if (!prefersReduced) {
      this.root.style.opacity = '0';
      this.root.style.transform = 'translateY(12px)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.root.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          this.root.style.opacity = '1';
          this.root.style.transform = 'translateY(0)';
        });
      });
    }

    initDashboardReveal(this.root);
    this.root.focus();
  }

  #syncNav(path) {
    const p = path === '/dashboard' ? '/dashboard/' : path;
    document.querySelectorAll('[data-route]').forEach(el => {
      el.classList.toggle('is-active', el.getAttribute('data-route') === p);
    });

    // ARCHITECT-PRIME: Delta 14 — nav contextuelle.
    // Liens Piliers + Marché n'ont de sens qu'en vue détail (?id=X présent dans l'URL).
    // Sur la liste racine et /dashboard/account : on les masque pour éviter de cliquer
    // dans le vide ("Veuillez sélectionner une analyse").
    const hasDetailId = !!(new URLSearchParams(window.location.search).get('id'));
    const isRootList = (p === '/dashboard/' || p === '/dashboard') && !hasDetailId;
    const isAccount = /^\/dashboard\/account\/?$/.test(p);
    const hideContextual = isRootList || isAccount;
    document.querySelectorAll('[data-route="/dashboard/pillars"], [data-route="/dashboard/network"]').forEach((link) => {
      link.classList.toggle('is-context-hidden', hideContextual);
    });
  }
}

/* ── Topbar : user info / logout ───────────────────────────────────────── */
function initTopbar(auth) {
  const topbar = document.getElementById('dashboard-startup-name');
  if (!topbar) return;
  topbar.replaceChildren();

  if (auth) {
    // ARCHITECT-PRIME: Delta 14 — dropdown user menu (Mon compte + Déconnexion).
    // Pattern a11y : aria-expanded, aria-haspopup="menu", Escape ferme, focus trap léger.
    const wrap = el('div', 'dashboard-topbar-actions dashboard-user-menu');

    const trigger = el('button', 'dashboard-user-menu__trigger', { type: 'button' });
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    const avatar = el('span', 'dashboard-avatar', { 'aria-hidden': 'true' });
    avatar.textContent = auth.name ? auth.name.charAt(0).toUpperCase() : '?';
    const firstName = (auth.name || '').split(' ')[0] || auth.email;
    const nameSpan = el('span', 'dashboard-topbar__title', { textContent: firstName });
    const caret = el('span', 'dashboard-user-menu__caret', { 'aria-hidden': 'true', textContent: '▾' });
    trigger.appendChild(avatar);
    trigger.appendChild(nameSpan);
    trigger.appendChild(caret);

    const menu = el('div', 'dashboard-user-menu__panel');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const accountLink = el('a', 'dashboard-user-menu__item', {
      href: '/dashboard/account',
      'data-route': '/dashboard/account',
      role: 'menuitem',
    });
    const userIcon = dashboardIcon('user');
    if (userIcon) accountLink.appendChild(userIcon);
    accountLink.appendChild(el('span', 'dashboard-user-menu__item-label', { textContent: 'Mon compte' }));

    const logoutBtn = el('button', 'dashboard-user-menu__item dashboard-user-menu__item--danger', { type: 'button' });
    logoutBtn.setAttribute('role', 'menuitem');
    const logoutIcon = dashboardIcon('logout');
    if (logoutIcon) logoutBtn.appendChild(logoutIcon);
    logoutBtn.appendChild(el('span', 'dashboard-user-menu__item-label', { textContent: 'Déconnexion' }));
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } catch {
        /* On efface quand même l'état local */
      }
      clearAuth();
      window.location.replace('/');
    });

    menu.appendChild(accountLink);
    menu.appendChild(logoutBtn);

    function close() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
    function open() {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Focus premier item pour accessibilité clavier
      accountLink.focus();
    }
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); }
    });
    // Close menu after navigating via the data-route link
    accountLink.addEventListener('click', () => close());

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    topbar.appendChild(wrap);
  } else {
    const demoTag = el('span', 'hero-badge', { textContent: '● Mode démo' });
    const loginLink = el('a', 'btn-primary', { href: '/auth/', textContent: 'Se connecter' });
    loginLink.style.minHeight = '36px';
    loginLink.style.fontSize  = '0.8125rem';
    topbar.appendChild(demoTag);
    topbar.appendChild(loginLink);
    topbar.style.display = 'flex';
    topbar.style.alignItems = 'center';
    topbar.style.gap = 'var(--space-3)';
  }
}

/* ── Animations d'apparition (Reveal) ──────────────────────────────────── */
function initDashboardReveal(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0 });

  // Sélection dynamique des blocs à animer lors du rendu de la vue
  const elements = root.querySelectorAll('.heading-section, .dashboard-app__lead, .card-glass, .demo-banner');
  
  elements.forEach((el, index) => {
    el.classList.add('reveal-native');
    el.style.transitionDelay = `${Math.min(index, 12) * 60}ms`; // Stagger en cascade (max 12 éléments pour éviter d'attendre trop longtemps)
    observer.observe(el);
  });
}

/* ── Liquid UX ─────────────────────────────────────────────────────────── */
function initLiquidUX() {
  const applyGlow = () => {
    document.querySelectorAll('.card-glass').forEach(card => {
      if (card.dataset.glowBound) return;
      card.dataset.glowBound = 'true';
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
      });
    });
  };
  applyGlow();
  let glowTimer = null;
  new MutationObserver(() => {
    if (glowTimer) return;
    glowTimer = setTimeout(() => { applyGlow(); glowTimer = null; }, 200);
  }).observe(document.body, { childList: true, subtree: true });

  const interactives = 'button, a, .dashboard-nav-side__link, .dashboard-nav-mobile__item';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest(interactives);
    if (t && !t.disabled) { t.style.transform = 'scale(0.96)'; t.style.transition = 'transform 0.1s ease'; }
  });
  const reset = (e) => {
    const t = e.target.closest(interactives);
    if (t) { t.style.transform = ''; t.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)'; }
  };
  document.addEventListener('pointerup',     reset);
  document.addEventListener('pointercancel', reset);
  document.addEventListener('pointerout',    reset);
}

/* ── Main ──────────────────────────────────────────────────────────────── */
async function main() {
  const app = document.getElementById('app');
  if (!app) return;

  const auth = await syncAuthFromSession();
  initTopbar(auth);

  clearEl(app);
  app.setAttribute('aria-busy', 'true');

  // Skeleton loading 2026
  const skeleton = el('div', 'dashboard-skeleton');
  skeleton.setAttribute('role', 'status');
  skeleton.setAttribute('aria-label', 'Chargement');
  for (let i = 0; i < 3; i++) {
    const card = el('div', 'card-glass skeleton-card');
    card.style.padding = 'var(--space-5)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = 'var(--space-3)';
    card.appendChild(el('div', 'skeleton skeleton-title'));
    card.appendChild(el('div', 'skeleton skeleton-text'));
    card.appendChild(el('div', 'skeleton skeleton-text'));
    const bar = el('div', 'skeleton skeleton-bar');
    bar.style.width = `${50 + i * 15}%`;
    card.appendChild(bar);
    skeleton.appendChild(card);
  }
  app.appendChild(skeleton);

  let data;

  if (!auth) {
    /* Mode démo : pas de fetch API */
    data = DEMO_DATA;
    clearEl(app);
    app.setAttribute('aria-busy', 'false');
  } else {
    /* Utilisateur connecté : tente l'API, fallback démo si indisponible */
    try {
      const id = new URLSearchParams(window.location.search).get('id');
      
      if (id && id !== 'demo') {
        const res = await fetch(`/api/dashboard/${encodeURIComponent(id)}`, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
        if (res.status === 401 || res.status === 403) {
          clearAuth();
          window.location.replace('/auth/?expired=1');
          return;
        }
        if (!res.ok) throw new Error('API indisponible');
        const apiData = await res.json();
        data = { ...apiData, isDemo: false, isList: false };
      } else {
        const res = await fetch(`/api/dashboard/list`, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
        if (res.status === 401 || res.status === 403) {
          clearAuth();
          window.location.replace('/auth/?expired=1');
          return;
        }
        if (!res.ok) throw new Error('API indisponible');
        const listData = await res.json();
        data = { isDemo: false, isList: true, items: listData };
      }
    } catch {
      /* Fallback démo si API pas prête */
      data = { ...DEMO_DATA, isDemo: true };
    }
    clearEl(app);
    app.setAttribute('aria-busy', 'false');
  }

  // ARCHITECT-PRIME: sanitize data — fallbacks pour champs vides/manquants
  if (!data.isList) {
    sanitizeDetailData(data);
  }

  const routes = buildRoutes(data);
  new FlaynnRouter(routes, app);
}

initLiquidUX();

// Swipe navigation mobile (gauche/droite entre les vues)
function initSwipeNav() {
  const routes = ['/dashboard/', '/dashboard/pillars', '/dashboard/network'];
  let startX = 0, startY = 0, tracking = false;

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking || e.changedTouches.length !== 1) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    const current = routes.indexOf(normalizePath(window.location.pathname));
    if (current === -1) return;

    const next = dx < 0 ? current + 1 : current - 1;
    if (next < 0 || next >= routes.length) return;

    if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
    history.pushState(null, '', routes[next]);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, { passive: true });
}
initSwipeNav();

main();