/**
 * KpiCard Flaynn — formats : score (/100), count, percent.
 * Trend toujours en points (pas %) pour éviter l'ambiguïté avec les KPI percent.
 *
 * mountKpiRow(root, { items, state, onRetry })
 */

const NF_INT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const NF_DEC = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatValue(value, format) {
  if (value == null || isNaN(value)) return '—';
  if (format === 'score')   return NF_INT.format(value);
  if (format === 'percent') return `${NF_DEC.format(value)}%`;
  return NF_INT.format(value);
}

function trendIcon(up) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'kpi-card__trend-icon');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = up
    ? '<path d="M3 9 L9 3 M9 3 H5 M9 3 V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M3 3 L9 9 M9 9 H5 M9 9 V5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = 'kpi-card';
  card.dataset.kpiId = item.id;

  const head = document.createElement('div');
  head.className = 'kpi-card__head';

  const label = document.createElement('span');
  label.className = 'kpi-card__label';
  label.textContent = item.label;
  head.appendChild(label);

  const trendUp = item.trend >= 0;
  const trend = document.createElement('span');
  trend.className = 'kpi-card__trend ' + (trendUp ? 'kpi-card__trend--up' : 'kpi-card__trend--down');
  trend.appendChild(trendIcon(trendUp));
  const tnum = document.createElement('span');
  /* score → tendance en points absolus ; percent → +0.4 pts ; count → +x% */
  let trendLabel;
  if (item.format === 'score' || item.format === 'percent') {
    trendLabel = `${trendUp ? '+' : ''}${NF_DEC.format(item.trend)} pts`;
  } else {
    trendLabel = `${trendUp ? '+' : ''}${NF_DEC.format(item.trend)}%`;
  }
  tnum.textContent = trendLabel;
  trend.appendChild(tnum);
  trend.setAttribute('aria-label',
    `Tendance ${trendUp ? 'positive' : 'négative'} de ${Math.abs(item.trend)} ${item.format === 'count' ? 'pourcent' : 'points'}`);
  head.appendChild(trend);

  card.appendChild(head);

  const value = document.createElement('div');
  value.className = 'kpi-card__value';
  value.textContent = formatValue(item.value, item.format);
  if (item.format === 'score') {
    const suffix = document.createElement('span');
    suffix.className = 'kpi-card__suffix';
    suffix.textContent = '/100';
    value.appendChild(suffix);
  }
  card.appendChild(value);

  if (item.range) {
    const range = document.createElement('span');
    range.className = 'kpi-card__range';
    range.textContent = item.range;
    card.appendChild(range);
  }

  return card;
}

function buildSkeleton() {
  const card = document.createElement('article');
  card.className = 'kpi-card kpi-card--loading';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = `
    <div class="kpi-card__head">
      <div class="kpi-card__skeleton-line skeleton"></div>
      <div class="kpi-card__skeleton-tag skeleton"></div>
    </div>
    <div class="kpi-card__skeleton-value skeleton"></div>
    <div class="kpi-card__skeleton-line kpi-card__skeleton-line--short skeleton"></div>
  `;
  return card;
}

function buildErrorBlock(message, onRetry) {
  const block = document.createElement('div');
  block.className = 'state-block kpi-row__error';
  block.setAttribute('role', 'alert');
  block.innerHTML = `
    <div class="state-block__title">Erreur de chargement</div>
    <div class="state-block__msg">${message || 'Une erreur est survenue.'}</div>
  `;
  if (typeof onRetry === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'state-block__retry';
    btn.textContent = 'Réessayer';
    btn.addEventListener('click', onRetry);
    block.appendChild(btn);
  }
  return block;
}

/**
 * @param {HTMLElement} root
 * @param {{ items: any[], state: { kind: string, message?: string }, onRetry?: () => void }} props
 */
export function mountKpiRow(root, { items, state, onRetry }) {
  root.innerHTML = '';

  if (state.kind === 'loading') {
    for (let i = 0; i < 4; i++) root.appendChild(buildSkeleton());
    return;
  }

  if (state.kind === 'error') {
    root.appendChild(buildErrorBlock(state.message, onRetry));
    return;
  }

  (items || []).forEach(item => root.appendChild(buildCard(item)));
}
