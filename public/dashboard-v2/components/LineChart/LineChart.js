/**
 * LineChart Flaynn — SVG natif, courbes Catmull-Rom → cubic Bezier, 2 axes Y.
 *
 * Les deux séries (vues / demandes BA) ont des ordres de grandeur très
 * différents → on dessine chacune sur sa propre échelle Y. Les labels Y
 * gauche correspondent à la série principale (id série 0), les labels Y
 * droite correspondent à la série secondaire (id série 1).
 *
 * mountLineChart(root, { data, state, onRetry })
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 640;
const VIEW_H = 320;
const PAD_L  = 52;
const PAD_R  = 52;
const PAD_T  = 16;
const PAD_B  = 32;
const TICK_COUNT = 5;

const NF = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function svg(el, attrs = {}) {
  const node = document.createElementNS(SVG_NS, el);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function xFor(i, n) {
  if (n <= 1) return PAD_L;
  return PAD_L + (i / (n - 1)) * (VIEW_W - PAD_L - PAD_R);
}
function yFor(v, max) {
  return VIEW_H - PAD_B - (v / max) * (VIEW_H - PAD_T - PAD_B);
}

/** Plus petit "joli" multiple supérieur à v (ex: 24 → 30, 1240 → 1500). */
function niceCeil(v) {
  if (v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const r = v / base;
  let nice;
  if      (r <= 1)   nice = 1;
  else if (r <= 1.5) nice = 1.5;
  else if (r <= 2)   nice = 2;
  else if (r <= 3)   nice = 3;
  else if (r <= 5)   nice = 5;
  else               nice = 10;
  return nice * base;
}

function ticksFor(max) {
  const out = [];
  for (let i = 0; i <= TICK_COUNT - 1; i++) out.push(Math.round((i / (TICK_COUNT - 1)) * max));
  return out;
}

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPath(points) {
  if (points.length < 2) return '';
  return `${smoothPath(points)} L ${points[points.length - 1].x} ${VIEW_H - PAD_B} L ${points[0].x} ${VIEW_H - PAD_B} Z`;
}

function buildSvg(data, tooltipEl) {
  const wrap = document.createElement('div');
  wrap.className = 'line-chart__svg-wrap';

  const root = svg('svg', {
    class: 'line-chart__svg',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': 'Évolution des vues publiques et des demandes investisseurs',
  });

  const seriesLeft  = data.series[0];
  const seriesRight = data.series[1];
  const yMaxLeft  = niceCeil(Math.max(...seriesLeft.data));
  const yMaxRight = seriesRight ? niceCeil(Math.max(...seriesRight.data)) : 0;

  // Y grid + labels gauche (série principale)
  const ticksLeft = ticksFor(yMaxLeft);
  ticksLeft.forEach(t => {
    const y = yFor(t, yMaxLeft);
    root.appendChild(svg('line', {
      class: 'line-chart__grid-line',
      x1: PAD_L, y1: y, x2: VIEW_W - PAD_R, y2: y,
    }));
    const lbl = svg('text', {
      class: 'line-chart__axis-label',
      x: PAD_L - 8, y: y + 4,
      'text-anchor': 'end',
    });
    lbl.textContent = NF.format(t);
    root.appendChild(lbl);
  });

  // Y labels droite (série secondaire)
  if (seriesRight) {
    const ticksRight = ticksFor(yMaxRight);
    ticksRight.forEach(t => {
      const y = yFor(t, yMaxRight);
      const lbl = svg('text', {
        class: 'line-chart__axis-label',
        x: VIEW_W - PAD_R + 8, y: y + 4,
        'text-anchor': 'start',
      });
      lbl.textContent = NF.format(t);
      root.appendChild(lbl);
    });
  }

  // X labels
  data.months.forEach((m, i) => {
    const x = xFor(i, data.months.length);
    const lbl = svg('text', {
      class: 'line-chart__axis-label',
      x, y: VIEW_H - PAD_B + 18,
      'text-anchor': 'middle',
    });
    lbl.textContent = m;
    root.appendChild(lbl);
  });

  // Compute points per series with its own scale
  const seriesPoints = data.series.map((s, idx) => ({
    series: s,
    points: s.data.map((v, i) => ({
      x: xFor(i, data.months.length),
      y: yFor(v, idx === 0 ? yMaxLeft : yMaxRight),
      v,
      label: data.months[i],
    })),
  }));

  // Areas
  seriesPoints.forEach(({ series, points }) => {
    root.appendChild(svg('path', {
      d: areaPath(points),
      class: `line-chart__area line-chart__area--${series.id}`,
    }));
  });

  // Lines
  seriesPoints.forEach(({ series, points }) => {
    root.appendChild(svg('path', {
      d: smoothPath(points),
      class: `line-chart__series line-chart__series--${series.id}`,
    }));
  });

  // Hover line
  const hoverLine = svg('line', {
    class: 'line-chart__hover-line',
    y1: PAD_T, y2: VIEW_H - PAD_B,
    x1: 0, x2: 0,
  });
  root.appendChild(hoverLine);

  // Dots
  const dotsPerSeries = seriesPoints.map(({ series, points }) =>
    points.map(p => {
      const c = svg('circle', {
        class: `line-chart__dot line-chart__dot--${series.id}`,
        cx: p.x, cy: p.y, r: 0,
      });
      root.appendChild(c);
      return c;
    })
  );

  // Hit area
  const hit = svg('rect', {
    class: 'line-chart__hit',
    x: PAD_L, y: PAD_T,
    width: VIEW_W - PAD_L - PAD_R,
    height: VIEW_H - PAD_T - PAD_B,
  });
  root.appendChild(hit);

  function onMove(evt) {
    const rect = root.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const localX = (evt.clientX - rect.left) * scaleX;
    const n = data.months.length;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const x = xFor(i, n);
      const d = Math.abs(x - localX);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    const xSnap = xFor(nearest, n);
    hoverLine.setAttribute('x1', xSnap);
    hoverLine.setAttribute('x2', xSnap);
    hoverLine.classList.add('is-visible');

    dotsPerSeries.forEach(ds => ds.forEach((c, i) => c.setAttribute('r', i === nearest ? 5 : 0)));

    const monthLabel = data.months[nearest];
    const rows = data.series.map(s => `
      <div class="line-chart__tooltip-row">
        <span class="line-chart__tooltip-name">
          <span class="line-chart__legend-dot line-chart__legend-dot--${s.id}"></span>${s.label}
        </span>
        <span class="line-chart__tooltip-value">${NF.format(s.data[nearest])}</span>
      </div>
    `).join('');
    tooltipEl.innerHTML = `
      <div class="line-chart__tooltip-date">${monthLabel} 2026</div>
      ${rows}
    `;
    const ratio = xSnap / VIEW_W;
    const px = ratio * rect.width;
    tooltipEl.style.setProperty('--tt-x', `${px}px`);
    tooltipEl.style.setProperty('--tt-y', `${(PAD_T / VIEW_H) * rect.height}px`);
    tooltipEl.classList.add('is-visible');
  }
  function onLeave() {
    hoverLine.classList.remove('is-visible');
    tooltipEl.classList.remove('is-visible');
    dotsPerSeries.forEach(ds => ds.forEach(c => c.setAttribute('r', 0)));
  }
  hit.addEventListener('mousemove', onMove);
  hit.addEventListener('mouseleave', onLeave);

  wrap.appendChild(root);
  return wrap;
}

function buildState(kind, message, onRetry) {
  const block = document.createElement('div');
  block.className = 'state-block line-chart__state';
  if (kind === 'error') block.setAttribute('role', 'alert');

  if (kind === 'loading') {
    const sk = document.createElement('div');
    sk.className = 'skeleton line-chart__skeleton';
    block.appendChild(sk);
    return block;
  }

  const titleMap = { empty: 'Aucune donnée', error: 'Erreur de chargement' };
  const msgMap = {
    empty: "Aucune activité enregistrée sur la période. Publie ta card pour commencer à collecter des vues.",
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

/**
 * @param {HTMLElement} root
 * @param {{ data: any, state: { kind: string, message?: string }, onRetry?: () => void }} props
 */
export function mountLineChart(root, { data, state, onRetry }) {
  root.innerHTML = '';
  root.classList.add('card');

  const wrapper = document.createElement('div');
  wrapper.className = 'line-chart';

  const head = document.createElement('div');
  head.className = 'card__head';
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = 'Trafic & demandes investisseurs';
  head.appendChild(title);

  if (state.kind === 'ready' && data.series && data.series.length) {
    const legend = document.createElement('div');
    legend.className = 'line-chart__legend';
    data.series.forEach(s => {
      const item = document.createElement('span');
      item.className = 'line-chart__legend-item';
      const dot = document.createElement('span');
      dot.className = `line-chart__legend-dot line-chart__legend-dot--${s.id}`;
      const txt = document.createElement('span');
      txt.textContent = s.label;
      item.append(dot, txt);
      legend.appendChild(item);
    });
    head.appendChild(legend);
  }
  wrapper.appendChild(head);

  if (state.kind === 'ready' && data.series && data.series.length) {
    const tooltip = document.createElement('div');
    tooltip.className = 'line-chart__tooltip';
    tooltip.setAttribute('role', 'status');
    const svgWrap = buildSvg(data, tooltip);
    svgWrap.appendChild(tooltip);
    wrapper.appendChild(svgWrap);
  } else {
    const stateBlock = buildState(state.kind === 'ready' ? 'empty' : state.kind, state.message, onRetry);
    wrapper.appendChild(stateBlock);
  }

  root.appendChild(wrapper);
}
