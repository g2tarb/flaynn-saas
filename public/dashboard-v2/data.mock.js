/**
 * Données simulées du dashboard Flaynn — fondateur ayant publié sa card publique.
 *
 * @typedef {Object} Meta
 * @property {{ from: string, to: string }} range
 * @property {string} updatedAt
 *
 * @typedef {Object} User
 * @property {string} name
 * @property {string|null} avatar
 * @property {string} initials
 * @property {string} startup
 *
 * @typedef {'score'|'count'|'percent'} KpiFormat
 *   score   → valeur sur 100, suffixe '/100', trend en points
 *   count   → entier formaté
 *   percent → suffixe %, trend en points
 *
 * @typedef {Object} Kpi
 * @property {string} id
 * @property {string} label
 * @property {number} value
 * @property {KpiFormat} format
 * @property {number} trend
 * @property {string} [range]
 *
 * @typedef {Object} Heatmap
 * @property {string[]} hours
 * @property {string[]} days
 * @property {number[][]} matrix
 *
 * @typedef {Object} LineSeries
 * @property {string} id
 * @property {string} label
 * @property {number[]} data
 *
 * @typedef {Object} TrafficPerformance
 * @property {string[]} months
 * @property {LineSeries[]} series
 *
 * @typedef {Object} Source
 * @property {string} code
 * @property {string} name
 * @property {number} visits
 *
 * @typedef {Object} Pillar
 * @property {string} id
 * @property {string} name
 * @property {number} score        sur 100
 * @property {number} evolution    en points (vs scoring précédent)
 * @property {number} benchmark    moyenne sectorielle sur 100
 * @property {'low'|'medium'|'high'} confidence
 *
 * @typedef {Object} Dataset
 * @property {Meta} meta
 * @property {User} user
 * @property {Kpi[]} kpis
 * @property {Heatmap} viewsHeatmap
 * @property {TrafficPerformance} trafficPerformance
 * @property {Source[]} trafficSources
 * @property {Pillar[]} pillars
 * @property {boolean} [loading]
 * @property {boolean} [empty]
 * @property {boolean} [error]
 * @property {string}  [message]
 */

const META = {
  range: { from: '2026-04-01', to: '2026-04-29' },
  updatedAt: '2026-04-29T10:00:00Z',
};

const USER = {
  name: 'Erwin D.',
  avatar: null,
  initials: 'ED',
  startup: 'Flaynn',
};

/** Vues card publique : 7 plages horaires × 7 jours */
const VIEWS_MATRIX = [
  [  4,   8,  12,  18,  22,  10,   3],  // 6-9h
  [ 14,  28,  42,  58,  64,  18,   6],  // 9-12h
  [ 32,  68,  94, 124, 148,  44,  12],  // 12-15h
  [ 48,  92, 134, 188, 224,  62,  18],  // 15-18h
  [ 38,  72, 108, 154, 184,  58,  24],  // 18-21h
  [ 16,  32,  48,  72,  86,  44,  18],  // 21-00h
  [  3,   6,  10,  14,  18,  12,   4],  // 00-6h
];

/** @type {Dataset} */
export const normal = {
  meta: META,
  user: USER,
  kpis: [
    { id: 'score',       label: 'Score Flaynn',     value: 78,    format: 'score',   trend:  5.0, range: 'Avril 2026' },
    { id: 'views',       label: 'Vues publiques',   value: 1240,  format: 'count',   trend: 18.4, range: 'Avril 2026' },
    { id: 'introBA',     label: 'Demandes BA',      value: 24,    format: 'count',   trend: 12.0, range: 'Avril 2026' },
    { id: 'conversion',  label: 'Taux conversion',  value: 1.9,   format: 'percent', trend:  0.4, range: 'Avril 2026' },
  ],
  viewsHeatmap: {
    hours: ['00-6h', '21-00h', '18-21h', '15-18h', '12-15h', '9-12h', '6-9h'],
    days:  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    matrix: VIEWS_MATRIX,
  },
  trafficPerformance: {
    months: ['Nov', 'Déc', 'Jan', 'Fév', 'Mar', 'Avr'],
    series: [
      { id: 'views',   label: 'Vues card publique', data: [120, 280, 410, 680, 920, 1240] },
      { id: 'introBA', label: 'Demandes BA',        data: [  2,   4,   8,  12,  18,   24] },
    ],
  },
  trafficSources: [
    { code: 'linkedin', name: 'LinkedIn',  visits: 482 },
    { code: 'twitter',  name: 'Twitter / X', visits: 318 },
    { code: 'direct',   name: 'Direct',    visits: 214 },
    { code: 'email',    name: 'Email',     visits: 142 },
    { code: 'google',   name: 'Google',    visits:  58 },
    { code: 'other',    name: 'Autres',    visits:  26 },
  ],
  pillars: [
    { id: 'market',    name: 'Market',    score: 84, evolution:  6, benchmark: 71, confidence: 'high'   },
    { id: 'product',   name: 'Product',   score: 76, evolution:  4, benchmark: 68, confidence: 'high'   },
    { id: 'traction',  name: 'Traction',  score: 62, evolution:  8, benchmark: 58, confidence: 'medium' },
    { id: 'team',      name: 'Team',      score: 88, evolution:  2, benchmark: 74, confidence: 'high'   },
    { id: 'execution', name: 'Execution', score: 71, evolution: -3, benchmark: 65, confidence: 'medium' },
  ],
};

/** @type {Dataset} */
export const loading = {
  meta: META,
  user: USER,
  kpis: [],
  viewsHeatmap: { hours: [], days: [], matrix: [] },
  trafficPerformance: { months: [], series: [] },
  trafficSources: [],
  pillars: [],
  loading: true,
};

/** @type {Dataset} */
export const empty = {
  meta: META,
  user: USER,
  kpis: normal.kpis.map(k => ({ ...k, value: 0, trend: 0 })),
  viewsHeatmap: { hours: normal.viewsHeatmap.hours, days: normal.viewsHeatmap.days, matrix: [] },
  trafficPerformance: { months: normal.trafficPerformance.months, series: [] },
  trafficSources: [],
  pillars: [],
  empty: true,
};

/** @type {Dataset} */
export const errorDataset = {
  meta: META,
  user: USER,
  kpis: [],
  viewsHeatmap: { hours: [], days: [], matrix: [] },
  trafficPerformance: { months: [], series: [] },
  trafficSources: [],
  pillars: [],
  error: true,
  message: 'Impossible de charger vos données. Vérifiez votre connexion.',
};

/** @type {Record<'normal'|'loading'|'empty'|'error', Dataset>} */
export const datasets = {
  normal,
  loading,
  empty,
  error: errorDataset,
};

/**
 * Sélection via ?dataset=normal|loading|empty|error
 * @returns {Dataset}
 */
export function getActiveDataset() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('dataset');
  if (key && Object.prototype.hasOwnProperty.call(datasets, key)) {
    return datasets[key];
  }
  return datasets.normal;
}
