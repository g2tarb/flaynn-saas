/**
 * TopBar — search + datepicker + bell + avatar.
 * Props: { user: { name, initials, avatar }, meta: { range: { from, to } } }
 */

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_NAMES = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function formatRangeEnd(meta) {
  if (!meta || !meta.range || !meta.range.to) return "Aujourd'hui";
  const d = new Date(meta.range.to + 'T00:00:00Z');
  if (isNaN(d.getTime())) return meta.range.to;
  const day = DAY_NAMES[d.getUTCDay()].slice(0, 3);
  return `${day}. ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function buildSearch() {
  const wrap = document.createElement('div');
  wrap.className = 'topbar__search';
  wrap.setAttribute('role', 'search');

  wrap.innerHTML = `
    <svg class="topbar__search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'topbar__search-input';
  input.placeholder = 'Rechercher un investisseur, un secteur…';
  input.setAttribute('aria-label', 'Rechercher');
  wrap.appendChild(input);

  return wrap;
}

function buildDatePicker(meta) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'topbar__datepicker';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');

  btn.innerHTML = `
    <svg class="topbar__datepicker-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span class="topbar__datepicker-label">${formatRangeEnd(meta)}</span>
  `;
  return btn;
}

function buildBell() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'topbar__icon-btn';
  btn.setAttribute('aria-label', 'Notifications (3 non lues)');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span class="topbar__badge" aria-hidden="true"></span>
  `;
  return btn;
}

function buildAvatar(user) {
  const div = document.createElement('div');
  div.className = 'topbar__avatar';
  div.setAttribute('role', 'img');
  div.setAttribute('aria-label', `Compte de ${user.name}`);
  div.textContent = user.initials || user.name.slice(0, 2).toUpperCase();
  return div;
}

/**
 * @param {HTMLElement} root
 * @param {{ user: { name: string, initials?: string, avatar?: string|null }, meta: any }} props
 */
export function mountTopBar(root, { user, meta }) {
  root.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'topbar';

  bar.appendChild(buildSearch());

  const actions = document.createElement('div');
  actions.className = 'topbar__actions';
  actions.appendChild(buildDatePicker(meta));
  actions.appendChild(buildBell());
  actions.appendChild(buildAvatar(user));
  bar.appendChild(actions);

  root.appendChild(bar);
}
