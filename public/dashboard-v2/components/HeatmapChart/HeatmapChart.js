/**
 * HeatmapChart Flaynn — vues card publique par jour × plage horaire.
 *
 * mountHeatmap(root, { data, state, onRetry })
 *   data: { hours: string[], days: string[], matrix: number[][] }
 *   matrix[hourIdx][dayIdx] = value (vues)
 *
 * Paliers calibrés vues : <10 / 10-49 / 50-99 / 100-199 / >=200
 */

const NF = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function bucketFor(v) {
  if (v == null || v < 10)   return 0;
  if (v < 50)                return 1;
  if (v < 100)               return 2;
  if (v < 200)               return 3;
  return 4;
}

function buildLegend() {
  const legend = document.createElement('div');
  legend.className = 'heatmap__legend';
  legend.setAttribute('aria-label', 'Légende paliers de couleur');

  const labels = ['10+', '50+', '100+', '200+'];
  labels.forEach((label, i) => {
    const item = document.createElement('span');
    item.className = 'heatmap__legend-item';
    const dot = document.createElement('span');
    dot.className = `heatmap__legend-dot heatmap__legend-dot--${i + 1}`;
    const txt = document.createElement('span');
    txt.textContent = label;
    item.append(dot, txt);
    legend.appendChild(item);
  });
  return legend;
}

function buildGrid(data, tooltipEl) {
  const wrap = document.createElement('div');
  wrap.className = 'heatmap__grid-wrap';

  // Y axis (hours)
  const yAxis = document.createElement('div');
  yAxis.className = 'heatmap__y-axis';
  data.hours.forEach(h => {
    const lbl = document.createElement('span');
    lbl.className = 'heatmap__axis-label heatmap__axis-label--y';
    lbl.textContent = h;
    yAxis.appendChild(lbl);
  });
  wrap.appendChild(yAxis);

  // Grid cells
  const grid = document.createElement('div');
  grid.className = 'heatmap__grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Volume de commandes par heure et jour');

  data.matrix.forEach((row, hIdx) => {
    row.forEach((v, dIdx) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      const bucket = bucketFor(v);
      cell.className = `heatmap__cell heatmap__cell--${bucket}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${data.days[dIdx]} ${data.hours[hIdx]} : ${v} vues`);
      cell.dataset.value = String(v);
      cell.dataset.day = data.days[dIdx];
      cell.dataset.hour = data.hours[hIdx];

      const showTooltip = (evt) => {
        const rect = wrap.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        const x = cellRect.left - rect.left + cellRect.width / 2;
        const y = cellRect.top - rect.top;
        tooltipEl.innerHTML = `
          <div class="heatmap__tooltip-meta">${cell.dataset.day} · ${cell.dataset.hour}</div>
          <div class="heatmap__tooltip-value">${NF.format(v)} vue${v > 1 ? 's' : ''}</div>
        `;
        tooltipEl.style.setProperty('--tt-x', `${x}px`);
        tooltipEl.style.setProperty('--tt-y', `${y}px`);
        tooltipEl.classList.add('is-visible');
      };
      const hideTooltip = () => tooltipEl.classList.remove('is-visible');

      cell.addEventListener('mouseenter', showTooltip);
      cell.addEventListener('focus', showTooltip);
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('blur', hideTooltip);

      grid.appendChild(cell);
    });
  });
  wrap.appendChild(grid);

  // X axis (days)
  const xAxis = document.createElement('div');
  xAxis.className = 'heatmap__x-axis';
  data.days.forEach(d => {
    const lbl = document.createElement('span');
    lbl.className = 'heatmap__axis-label';
    lbl.textContent = d;
    xAxis.appendChild(lbl);
  });
  wrap.appendChild(xAxis);

  // Tooltip
  wrap.appendChild(tooltipEl);

  return wrap;
}

function buildState(kind, message, onRetry) {
  const block = document.createElement('div');
  block.className = 'state-block';
  if (kind === 'error') block.setAttribute('role', 'alert');

  if (kind === 'loading') {
    const sk = document.createElement('div');
    sk.className = 'skeleton heatmap__skeleton';
    block.appendChild(sk);
    return block;
  }

  const titleMap = {
    empty: 'Aucune vue',
    error: 'Erreur de chargement',
  };
  const msgMap = {
    empty: "Aucune vue de ta card publique sur la période.",
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
 * @param {{ data: any, state: any, onRetry?: () => void }} props
 */
export function mountHeatmap(root, { data, state, onRetry }) {
  root.innerHTML = '';
  root.classList.add('card');

  const wrapper = document.createElement('div');
  wrapper.className = 'heatmap';

  const head = document.createElement('div');
  head.className = 'card__head';
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = 'Vues card publique';
  head.appendChild(title);

  if (state.kind === 'ready' && data.matrix && data.matrix.length) {
    head.appendChild(buildLegend());
  }
  wrapper.appendChild(head);

  if (state.kind === 'ready' && data.matrix && data.matrix.length) {
    const tooltip = document.createElement('div');
    tooltip.className = 'heatmap__tooltip';
    tooltip.setAttribute('role', 'status');
    wrapper.appendChild(buildGrid(data, tooltip));
  } else {
    const stateKind = state.kind === 'ready' ? 'empty' : state.kind;
    wrapper.appendChild(buildState(stateKind, state.message, onRetry));
  }

  root.appendChild(wrapper);
}
