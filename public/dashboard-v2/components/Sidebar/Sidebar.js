/**
 * Sidebar Flaynn — navigation fondateur.
 * @typedef {{ id: string, label: string, icon: string }} NavItem
 */

const ICON = {
  dashboard:  '<path d="M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  scorings:   '<path d="M12 2 L3 7 v10 l9 5 9-5 V7 z M12 12 V22 M3 7 l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  publicCard: '<path d="M4 4h16v12H4zM4 20h16M9 8l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  investors:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-11a4 4 0 1 1 0 8m6 3v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  inbox:      '<path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  resources:  '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  settings:   '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  help:       '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 17h.01" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};

/** @type {NavItem[]} */
const PRIMARY = [
  { id: 'dashboard',  label: 'Dashboard',         icon: 'dashboard'  },
  { id: 'scorings',   label: 'Mes scorings',      icon: 'scorings'   },
  { id: 'publicCard', label: 'Card publique',     icon: 'publicCard' },
  { id: 'investors',  label: 'Investisseurs',     icon: 'investors'  },
  { id: 'inbox',      label: 'Demandes intro',    icon: 'inbox'      },
  { id: 'resources',  label: 'Ressources',        icon: 'resources'  },
];

/** @type {NavItem[]} */
const FOOTER = [
  { id: 'settings', label: 'Paramètres', icon: 'settings' },
  { id: 'help',     label: 'Aide',       icon: 'help'     },
];

function iconSvg(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sidebar__icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICON[name] || '';
  return svg;
}

function buildItem(item, isActive) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar__item' + (isActive ? ' sidebar__item--active' : '');
  if (isActive) btn.setAttribute('aria-current', 'page');
  btn.dataset.navId = item.id;

  btn.appendChild(iconSvg(item.icon));

  const label = document.createElement('span');
  label.className = 'sidebar__label';
  label.textContent = item.label;
  btn.appendChild(label);

  return btn;
}

function buildBrand() {
  const brand = document.createElement('div');
  brand.className = 'sidebar__brand';

  const logo = document.createElement('div');
  logo.className = 'sidebar__logo';
  /* Logo Flaynn — symbole "F" stylisé en gradient violet→rose Flaynn. */
  logo.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <defs>
        <linearGradient id="sb-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stop-color="#7B2D8E"/>
          <stop offset="100%" stop-color="#E8651A"/>
        </linearGradient>
      </defs>
      <path d="M5 4 H19 V8 H10 V11 H17 V15 H10 V20 H5 Z"
            fill="url(#sb-grad)"/>
    </svg>`;

  const name = document.createElement('span');
  name.className = 'sidebar__brand-name';
  name.textContent = 'Flaynn';

  brand.append(logo, name);
  return brand;
}

/**
 * @param {HTMLElement} root
 * @param {{ activeId: string }} props
 */
export function mountSidebar(root, { activeId }) {
  root.innerHTML = '';
  const nav = document.createElement('nav');
  nav.className = 'sidebar';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Navigation principale');

  nav.appendChild(buildBrand());

  const primary = document.createElement('div');
  primary.className = 'sidebar__nav';
  PRIMARY.forEach(item => primary.appendChild(buildItem(item, item.id === activeId)));
  nav.appendChild(primary);

  const footer = document.createElement('div');
  footer.className = 'sidebar__footer';
  FOOTER.forEach(item => footer.appendChild(buildItem(item, item.id === activeId)));
  nav.appendChild(footer);

  root.appendChild(nav);
}
