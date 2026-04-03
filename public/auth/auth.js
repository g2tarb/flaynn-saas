/**
 * Flaynn Auth — localStorage simulé (pas de backend requis pour la démo)
 * Structure stockée : { name, email, token }
 */

/* ── Helpers auth ──────────────────────────────────────────────────────── */
function getAuth() {
  try {
    return JSON.parse(localStorage.getItem('flaynn_auth') || 'null');
  } catch { return null; }
}

function setAuth(data) {
  localStorage.setItem('flaynn_auth', JSON.stringify(data));
}

/* Redirection si déjà connecté */
if (getAuth()) {
  window.location.replace('/dashboard/');
}

/* ── Références DOM ────────────────────────────────────────────────────── */
const tabLogin     = /** @type {HTMLButtonElement}  */ (document.getElementById('tab-login'));
const tabRegister  = /** @type {HTMLButtonElement}  */ (document.getElementById('tab-register'));
const panelLogin   = /** @type {HTMLElement}        */ (document.getElementById('panel-login'));
const panelRegister = /** @type {HTMLElement}       */ (document.getElementById('panel-register'));
const alertEl      = /** @type {HTMLElement}        */ (document.getElementById('auth-alert'));
const tabs         = /** @type {HTMLElement}        */ (document.querySelector('.auth-tabs'));

/* ── Tabs ──────────────────────────────────────────────────────────────── */
function activateTab(tab) {
  const isLogin = tab === 'login';

  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  tabLogin.classList.toggle('auth-tab--active', isLogin);
  tabRegister.classList.toggle('auth-tab--active', !isLogin);

  panelLogin.hidden   = !isLogin;
  panelRegister.hidden = isLogin;

  if (tabs) tabs.dataset.active = isLogin ? 'login' : 'register';

  hideAlert();
}

tabLogin.addEventListener('click',    () => activateTab('login'));
tabRegister.addEventListener('click', () => activateTab('register'));

/* ── Alerte ────────────────────────────────────────────────────────────── */
function showAlert(msg, type = 'error') {
  if (!alertEl) return;
  alertEl.textContent = msg;
  alertEl.className   = `auth-alert auth-alert--${type}`;
  alertEl.hidden      = false;
}

function hideAlert() {
  if (!alertEl) return;
  alertEl.hidden = true;
}

/* ── Validation inline ─────────────────────────────────────────────────── */
function validateField(input) {
  const field = input.closest('.field');
  if (!field || !field.dataset.validate) return true;
  const rules = field.dataset.validate.split('|');
  const value = input.value.trim();
  let error   = '';

  for (const rule of rules) {
    if (rule === 'required' && !value) { error = 'Ce champ est requis.'; break; }
    if (rule === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { error = 'Email invalide.'; break; }
    if (rule.startsWith('min:') && value.length < Number(rule.split(':')[1])) { error = `Minimum ${rule.split(':')[1]} caractères.`; break; }
    if (rule.startsWith('max:') && value.length > Number(rule.split(':')[1])) { error = `Maximum ${rule.split(':')[1]} caractères.`; break; }
  }

  field.classList.toggle('field--valid', !error && !!value);
  field.classList.toggle('field--error', !!error);
  const errEl = field.querySelector('.field__error');
  if (errEl) errEl.textContent = error;
  return !error;
}

document.querySelectorAll('.field__input').forEach((input) => {
  input.addEventListener('blur',  () => validateField(input));
  input.addEventListener('input', () => validateField(input));
});

/* ── Toggle mot de passe ───────────────────────────────────────────────── */
document.querySelectorAll('.auth-toggle-pw').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const inp = /** @type {HTMLInputElement|null} */ (document.getElementById(targetId || ''));
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.setAttribute('aria-label', inp.type === 'password' ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
  });
});

/* ── Indicateur de force (inscription) ────────────────────────────────── */
const regPasswordInput = /** @type {HTMLInputElement|null} */ (document.getElementById('reg-password'));
const strengthFill     = document.getElementById('pw-strength-fill');
const strengthLabel    = document.getElementById('pw-strength-label');

if (regPasswordInput) {
  regPasswordInput.addEventListener('input', () => {
    const val = regPasswordInput.value;
    if (!strengthFill || !strengthLabel) return;

    let score = 0;
    if (val.length >= 8)  score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^a-zA-Z0-9]/.test(val)) score++;

    const levels = ['', 'weak', 'medium', 'strong', 'strong'];
    const labels = ['', 'Faible', 'Moyen', 'Fort', 'Fort'];

    strengthFill.className = `auth-pw-strength__fill auth-pw-strength__fill--${levels[score] || 'weak'}`;
    strengthLabel.textContent = val.length ? labels[score] || 'Faible' : '';
  });
}

/* ── Connexion ─────────────────────────────────────────────────────────── */
const formLogin = document.getElementById('form-login');
formLogin?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email    = /** @type {HTMLInputElement} */ (document.getElementById('login-email'));
  const password = /** @type {HTMLInputElement} */ (document.getElementById('login-password'));
  const btn      = /** @type {HTMLButtonElement} */ (document.getElementById('btn-login'));

  let ok = true;
  if (!validateField(email))    ok = false;
  if (!validateField(password)) ok = false;
  if (!ok) return;

  /* Simulation : vérifie si un compte existe en localStorage */
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem('flaynn_accounts') || '{}');
    } catch { return {}; }
  })();

  const account = stored[email.value.trim().toLowerCase()];
  if (!account || account.password !== password.value) {
    showAlert('Email ou mot de passe incorrect.');
    return;
  }

  if (btn) { btn.disabled = true; }
  const label = btn?.querySelector('.btn-form__text');
  if (label) label.textContent = 'Connexion…';

  setAuth({ name: account.name, email: account.email, token: `tok-${Date.now()}` });
  window.setTimeout(() => { window.location.replace('/dashboard/'); }, 400);
});

/* ── Inscription ───────────────────────────────────────────────────────── */
const formRegister = document.getElementById('form-register');
formRegister?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name     = /** @type {HTMLInputElement} */ (document.getElementById('reg-name'));
  const email    = /** @type {HTMLInputElement} */ (document.getElementById('reg-email'));
  const password = /** @type {HTMLInputElement} */ (document.getElementById('reg-password'));
  const btn      = /** @type {HTMLButtonElement} */ (document.getElementById('btn-register'));

  let ok = true;
  if (!validateField(name))     ok = false;
  if (!validateField(email))    ok = false;
  if (!validateField(password)) ok = false;
  if (!ok) return;

  if (password.value.length < 8) {
    showAlert('Le mot de passe doit faire au moins 8 caractères.');
    return;
  }

  /* Stockage du compte */
  const accounts = (() => {
    try { return JSON.parse(localStorage.getItem('flaynn_accounts') || '{}'); } catch { return {}; }
  })();
  const key = email.value.trim().toLowerCase();
  if (accounts[key]) {
    showAlert('Un compte existe déjà avec cet email. Connectez-vous.');
    activateTab('login');
    return;
  }

  accounts[key] = { name: name.value.trim(), email: key, password: password.value };
  localStorage.setItem('flaynn_accounts', JSON.stringify(accounts));

  if (btn) btn.disabled = true;
  const label = btn?.querySelector('.btn-form__text');
  if (label) label.textContent = 'Création…';

  setAuth({ name: name.value.trim(), email: key, token: `tok-${Date.now()}` });
  window.setTimeout(() => { window.location.replace('/dashboard/'); }, 400);
});
