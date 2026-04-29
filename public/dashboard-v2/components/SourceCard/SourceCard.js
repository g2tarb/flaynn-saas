/**
 * SourceCard — sources de trafic vers la card publique Flaynn.
 *
 * mountSources(root, { items, state, onRetry })
 *   items: [{ code, name, visits }]
 */

const NF = new Intl.NumberFormat('fr-FR');

/** Icônes SVG inline (pas de CDN). */
const SOURCE_ICON = {
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/>',
  twitter:  '<path d="M22 4.01s-2 1.4-3.5 1.5C16.85 4.04 14.75 3.5 13 4.5c-2.5 1.5-2.5 4-2.5 5.5C6 10.5 3 7 3 7s-3 6 4 9c-1.5 1-3.5 1.5-6 1.5C5 19 9 19 11 18c4-2 6-6 6-11 1.5-.5 3-1.5 5-3z" fill="currentColor"/>',
  direct:   '<path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zm9-9v18M3 12h18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  email:    '<path d="M3 8l9 6 9-6M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  google:   '<path d="M21.35 11.1H12v3.8h5.35c-.5 2.4-2.6 4.1-5.35 4.1a6 6 0 1 1 0-12c1.5 0 2.85.55 3.9 1.45l2.85-2.85A9.95 9.95 0 0 0 12 2a10 10 0 1 0 9.5 13.1c.4-1.4.5-2.7.35-4z" fill="currentColor"/>',
  other:    '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
};

function buildIcon(code) {
  const wrap = document.createElement('div');
  wrap.className = `source-card__icon source-card__icon--${code}`;
  wrap.setAttribute('aria-hidden', 'true');
  const inner = SOURCE_ICON[code] || SOURCE_ICON.other;
  wrap.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  return wrap;
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = 'source-card';

  const head = document.createElement('div');
  head.className = 'source-card__head';
  head.appendChild(buildIcon(item.code));
  const name = document.createElement('span');
  name.className = 'source-card__name';
  name.textContent = item.name;
  head.appendChild(name);
  card.appendChild(head);

  const value = document.createElement('div');
  value.className = 'source-card__value';
  value.textContent = NF.format(item.visits);
  card.appendChild(value);

  const label = document.createElement('span');
  label.className = 'source-card__label';
  label.textContent = 'visite' + (item.visits > 1 ? 's' : '');
  card.appendChild(label);

  return card;
}

function buildState(kind, message, onRetry) {
  if (kind === 'loading') {
    const grid = document.createElement('div');
    grid.className = 'sources__grid';
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton sources__skeleton-card';
      grid.appendChild(sk);
    }
    return grid;
  }

  const block = document.createElement('div');
  block.className = 'state-block';
  if (kind === 'error') block.setAttribute('role', 'alert');

  const titleMap = { empty: 'Aucune source', error: 'Erreur de chargement' };
  const msgMap = {
    empty: 'Pas encore de visiteur. Partage le lien de ta card pour générer du trafic.',
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
 * @param {{ items: any[], state: any, onRetry?: () => void }} props
 */
export function mountSources(root, { items, state, onRetry }) {
  root.innerHTML = '';
  root.classList.add('card');

  const wrapper = document.createElement('div');
  wrapper.className = 'sources';

  const head = document.createElement('div');
  head.className = 'card__head';
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = 'Sources de trafic';
  head.appendChild(title);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'card__action';
  action.textContent = 'Voir tout';
  head.appendChild(action);
  wrapper.appendChild(head);

  if (state.kind === 'ready' && items && items.length) {
    const grid = document.createElement('div');
    grid.className = 'sources__grid';
    items.forEach(s => grid.appendChild(buildCard(s)));
    wrapper.appendChild(grid);
  } else {
    const kind = state.kind === 'ready' ? 'empty' : state.kind;
    wrapper.appendChild(buildState(kind, state.message, onRetry));
  }

  root.appendChild(wrapper);
}
