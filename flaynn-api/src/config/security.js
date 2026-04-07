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

export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
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
    }
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

// ARCHITECT-PRIME: flaynn.tech est le domaine de production (pas flaynn.fr)
const prodOrigin = process.env.CORS_ORIGIN || 'https://flaynn.tech';

export const corsConfig = {
  origin: process.env.NODE_ENV === 'production' ? prodOrigin : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Flaynn-Source'],
  credentials: true
};
