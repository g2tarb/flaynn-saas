/**
 * PillarsTable Flaynn — table 5 piliers (Market/Product/Traction/Team/Execution).
 * Colonnes : PILIER / SCORE (avec mini-bar) / ÉVOLUTION / BENCHMARK / CONFIANCE
 *
 * mountPillars(root, { items, state, onRetry })
 */

const NF = new Intl.NumberFormat('fr-FR');

const COLUMNS = [
  { key: 'name',       label: 'Pilier',     align: 'left'  },
  { key: 'score',      label: 'Score',      align: 'right' },
  { key: 'evolution',  label: 'Évolution',  align: 'right' },
  { key: 'benchmark',  label: 'Benchmark',  align: 'right' },
  { key: 'confidence', label: 'Confiance',  align: 'right' },
];

const PILLAR_ICON = {
  market:    '<path d="M3 3v18h18M7 14l4-4 4 4 5-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  product:   '<path d="M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-13L3 8m9 5L3 8m9 5v8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  traction:  '<path d="M22 7 12 17l-5-5L1 18M22 7h-7M22 7v7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  team:      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-11a4 4 0 1 1 0 8m6 3v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  execution: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor"/>',
};

const CONFIDENCE_LABEL = {
  high:   'Haute',
  medium: 'Moyenne',
  low:    'Faible',
};

function buildIcon(id) {
  const wrap = document.createElement('span');
  wrap.className = `pillars__icon pillars__icon--${id}`;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${PILLAR_ICON[id] || PILLAR_ICON.market}</svg>`;
  return wrap;
}

function buildEvolution(value) {
  const up = value >= 0;
  const span = document.createElement('span');
  span.className = 'pillars__evol ' + (up ? 'pillars__evol--up' : 'pillars__evol--down');
  span.setAttribute('aria-label',
    `Évolution ${up ? 'positive' : 'négative'} de ${Math.abs(value)} points`);
  const ns = 'http://www.w3.org/2000/svg';
  const ico = document.createElementNS(ns, 'svg');
  ico.setAttribute('class', 'pillars__evol-icon');
  ico.setAttribute('viewBox', '0 0 12 12');
  ico.setAttribute('aria-hidden', 'true');
  ico.innerHTML = up
    ? '<path d="M3 9 L9 3 M9 3 H5 M9 3 V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M3 3 L9 9 M9 9 H5 M9 9 V5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  span.appendChild(ico);
  const txt = document.createElement('span');
  txt.textContent = `${up ? '+' : ''}${value} pts`;
  span.appendChild(txt);
  return span;
}

function buildScore(score) {
  const wrap = document.createElement('span');
  wrap.className = 'pillars__score-bar';

  const track = document.createElement('span');
  track.className = 'pillars__score-track';
  const fill = document.createElement('span');
  fill.className = 'pillars__score-fill';
  /* Largeur dynamique du fill : seule manière propre, custom property pilotée. */
  fill.style.setProperty('--w', `${Math.max(0, Math.min(100, score))}%`);
  track.appendChild(fill);

  const num = document.createElement('span');
  num.textContent = String(score);

  wrap.append(track, num);
  return wrap;
}

function buildBenchmark(score, benchmark) {
  const wrap = document.createElement('span');
  wrap.className = 'pillars__bench';
  wrap.textContent = String(benchmark);
  const delta = score - benchmark;
  const d = document.createElement('span');
  d.className = 'pillars__bench-delta';
  d.textContent = `(${delta >= 0 ? '+' : ''}${delta})`;
  wrap.appendChild(d);
  return wrap;
}

function buildConfidence(level) {
  const span = document.createElement('span');
  span.className = `pillars__confidence pillars__confidence--${level}`;
  const dot = document.createElement('span');
  dot.className = 'pillars__confidence-dot';
  span.appendChild(dot);
  const txt = document.createElement('span');
  txt.textContent = CONFIDENCE_LABEL[level] || level;
  span.appendChild(txt);
  return span;
}

function buildRow(item) {
  const tr = document.createElement('tr');
  tr.className = 'pillars__row';

  const tdName = document.createElement('td');
  tdName.className = 'pillars__td';
  const wrap = document.createElement('span');
  wrap.className = 'pillars__pillar';
  wrap.appendChild(buildIcon(item.id));
  const name = document.createElement('span');
  name.textContent = item.name;
  wrap.appendChild(name);
  tdName.appendChild(wrap);
  tr.appendChild(tdName);

  const tdScore = document.createElement('td');
  tdScore.className = 'pillars__td pillars__td--num';
  tdScore.appendChild(buildScore(item.score));
  tr.appendChild(tdScore);

  const tdEvol = document.createElement('td');
  tdEvol.className = 'pillars__td pillars__td--num';
  tdEvol.appendChild(buildEvolution(item.evolution));
  tr.appendChild(tdEvol);

  const tdBench = document.createElement('td');
  tdBench.className = 'pillars__td pillars__td--num';
  tdBench.appendChild(buildBenchmark(item.score, item.benchmark));
  tr.appendChild(tdBench);

  const tdConf = document.createElement('td');
  tdConf.className = 'pillars__td pillars__td--num';
  tdConf.appendChild(buildConfidence(item.confidence));
  tr.appendChild(tdConf);

  return tr;
}

function buildSkeletonRow() {
  const tr = document.createElement('tr');
  tr.className = 'pillars__skeleton-row';
  for (let i = 0; i < COLUMNS.length; i++) {
    const td = document.createElement('td');
    const sk = document.createElement('div');
    sk.className = 'skeleton pillars__skeleton-cell';
    td.appendChild(sk);
    tr.appendChild(td);
  }
  return tr;
}

function buildState(kind, message, onRetry) {
  const block = document.createElement('div');
  block.className = 'state-block';
  if (kind === 'error') block.setAttribute('role', 'alert');

  const titleMap = { empty: 'Aucun scoring', error: 'Erreur de chargement' };
  const msgMap = {
    empty: "Tu n'as pas encore reçu de scoring complet. Soumets un dossier pour démarrer.",
    error: message || 'Une erreur est survenue.',
  };
  block.innerHTML = `
    <div class="state-block__title">${titleMap[kind] || ''}</div>
    <div class="state-block__msg">${msgMap[kind] || ''}</div>
  `;
  if (kind === 'error' && typeof onRetry === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'state-block__retry';
    btn.textContent = 'Réessayer';
    btn.addEventListener('click', onRetry);
    block.appendChild(btn);
  }
  return block;
}

function buildTable(items, isLoading) {
  const scroll = document.createElement('div');
  scroll.className = 'pillars-scroll';

  const table = document.createElement('table');
  table.className = 'pillars';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  COLUMNS.forEach(c => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'pillars__th' + (c.align === 'right' ? ' pillars__th--num' : '');
    th.textContent = c.label.toUpperCase();
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (isLoading) {
    for (let i = 0; i < 5; i++) tbody.appendChild(buildSkeletonRow());
  } else {
    items.forEach(item => tbody.appendChild(buildRow(item)));
  }
  table.appendChild(tbody);

  scroll.appendChild(table);
  return scroll;
}

/**
 * @param {HTMLElement} root
 * @param {{ items: any[], state: any, onRetry?: () => void }} props
 */
export function mountPillars(root, { items, state, onRetry }) {
  root.innerHTML = '';
  root.classList.add('card');

  const wrapper = document.createElement('div');
  wrapper.className = 'pillars-wrap';

  const head = document.createElement('div');
  head.className = 'card__head';
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = 'Détail des piliers';
  head.appendChild(title);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'card__action';
  action.textContent = 'Voir le rapport';
  head.appendChild(action);
  wrapper.appendChild(head);

  if (state.kind === 'loading') {
    wrapper.appendChild(buildTable([], true));
  } else if (state.kind === 'ready' && items && items.length) {
    wrapper.appendChild(buildTable(items, false));
  } else {
    const kind = state.kind === 'ready' ? 'empty' : state.kind;
    wrapper.appendChild(buildState(kind, state.message, onRetry));
  }

  root.appendChild(wrapper);
}
