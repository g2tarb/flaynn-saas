function n8nConnectOrigin() {
  // ARCHITECT-PRIME: aligné avec le nom dans envSchema (server.js) et render.yaml
  const u = process.env.N8N_WEBHOOK_URL;
  if (!u) return [];
  try {
    return [new URL(u).origin];
  } catch {
    return [];
  }
}

// ARCHITECT-PRIME: directives CSP partagées (helmet config + override /score/:slug).
// Exposées séparément pour que les routes Score Card publique puissent construire
// un header CSP scoped incluant un hash SHA-256 du JSON-LD inline (delta 9 J4).
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://js.stripe.com'],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https://*.stripe.com"],
  connectSrc: [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://api.stripe.com',
    ...n8nConnectOrigin()
  ],
  frameSrc: ["'self'", "https://js.stripe.com"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: []
};

function kebabCase(camel) {
  return camel.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function serializeCspDirectives(directives) {
  const parts = [];
  for (const [key, values] of Object.entries(directives)) {
    const name = kebabCase(key);
    if (!values || values.length === 0) {
      parts.push(name);
    } else {
      parts.push(`${name} ${values.join(' ')}`);
    }
  }
  return parts.join('; ');
}

// Construit un header CSP identique à celui posé par helmet, + éventuellement
// des hashes additionnels dans script-src (format 'sha256-BASE64' SANS les
// apostrophes — elles sont ajoutées ici). Scoped : utilisé uniquement pour
// /score/:slug qui a besoin d'autoriser un <script type="application/ld+json">.
export function buildCspHeader(extraScriptSrcHashes = []) {
  const directives = { ...CSP_DIRECTIVES };
  if (extraScriptSrcHashes.length > 0) {
    directives.scriptSrc = [
      ...CSP_DIRECTIVES.scriptSrc,
      ...extraScriptSrcHashes.map((h) => `'${h}'`)
    ];
  }
  return serializeCspDirectives(directives);
}

export const helmetConfig = {
  contentSecurityPolicy: {
    directives: CSP_DIRECTIVES
  },
  /* COEP désactivée : import dynamique Three/GSAP depuis jsDelivr + WebGL sinon souvent bloqués */
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
};

// ARCHITECT-PRIME: allowlist multi-origines (flaynn.tech = SaaS, flaynn.com = investors landing,
// flaynn.fr = legacy). CORS_ORIGIN peut surcharger via CSV en prod.
// Defaults inclus pour résister à un déploiement sans variable correctement set
// (le pire serait de bloquer le frontend en silence — ici on garantit au minimum
// les domaines connus, et toute origine non-listée reste rejetée).
const DEFAULT_PROD_ORIGINS = [
  'https://flaynn.tech',
  'https://flaynn.com',
  'https://flaynn.fr'
];

function parseOriginList(raw) {
  if (!raw) return DEFAULT_PROD_ORIGINS;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

const prodAllowlist = parseOriginList(process.env.CORS_ORIGIN);

function prodOriginCheck(origin, cb) {
  // Requêtes server-to-server / curl / health checks sans header Origin → autorisées
  if (!origin) return cb(null, true);
  if (prodAllowlist.includes(origin)) return cb(null, true);
  return cb(new Error(`Origin not allowed by CORS: ${origin}`), false);
}

export const corsConfig = {
  origin: process.env.NODE_ENV === 'production' ? prodOriginCheck : true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Flaynn-Source'],
  credentials: true
};
