import { getActiveDataset } from './data.mock.js';
import { mountSidebar }     from './components/Sidebar/Sidebar.js';
import { mountTopBar }      from './components/TopBar/TopBar.js';
import { mountKpiRow }      from './components/KpiCard/KpiCard.js';
import { mountHeatmap }     from './components/HeatmapChart/HeatmapChart.js';
import { mountLineChart }   from './components/LineChart/LineChart.js';
import { mountSources }     from './components/SourceCard/SourceCard.js';
import { mountPillars }     from './components/PillarsTable/PillarsTable.js';

const ROOTS = {
  sidebar:   document.getElementById('sidebar-root'),
  topbar:    document.getElementById('topbar-root'),
  kpis:      document.getElementById('kpis-root'),
  heatmap:   document.getElementById('heatmap-root'),
  linechart: document.getElementById('linechart-root'),
  sources:   document.getElementById('sources-root'),
  pillars:   document.getElementById('pillars-root'),
};

function setBusy(el, busy) {
  if (!el) return;
  el.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function stateFor(dataset) {
  if (dataset.loading) return { kind: 'loading' };
  if (dataset.error)   return { kind: 'error', message: dataset.message };
  if (dataset.empty)   return { kind: 'empty' };
  return { kind: 'ready' };
}

function render(dataset) {
  const isLoading = !!dataset.loading;
  const state = stateFor(dataset);

  mountSidebar(ROOTS.sidebar, { activeId: 'dashboard' });
  mountTopBar(ROOTS.topbar, { user: dataset.user, meta: dataset.meta });

  Object.values(ROOTS)
    .filter(r => r !== ROOTS.sidebar && r !== ROOTS.topbar)
    .forEach(r => setBusy(r, isLoading));

  mountKpiRow   (ROOTS.kpis,      { items: dataset.kpis,                state, onRetry: () => boot('normal') });
  mountHeatmap  (ROOTS.heatmap,   { data:  dataset.viewsHeatmap,         state, onRetry: () => boot('normal') });
  mountLineChart(ROOTS.linechart, { data:  dataset.trafficPerformance,   state, onRetry: () => boot('normal') });
  mountSources  (ROOTS.sources,   { items: dataset.trafficSources,        state, onRetry: () => boot('normal') });
  mountPillars  (ROOTS.pillars,   { items: dataset.pillars,                state, onRetry: () => boot('normal') });

  Object.values(ROOTS)
    .filter(r => r !== ROOTS.sidebar && r !== ROOTS.topbar)
    .forEach(r => setBusy(r, false));
}

function boot(forcedKey) {
  if (forcedKey) {
    const url = new URL(window.location.href);
    url.searchParams.set('dataset', forcedKey);
    window.history.replaceState(null, '', url);
  }
  render(getActiveDataset());
}

document.addEventListener('DOMContentLoaded', () => boot());
