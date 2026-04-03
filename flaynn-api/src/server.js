import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { errorHandler } from './middleware/error-handler.js';
import dashboardApiRoutes from './routes/dashboard-api.js';
import scoringRoutes from './routes/scoring.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: true,
    disableRequestLogging: true
  });

  fastify.setErrorHandler(errorHandler);

  // Configuration CSP stricte (v5.0 Errata)
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'", "'strict-dynamic'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        fontSrc: ["'self'", "https://fonts.bunny.net", "https://api.fontshare.com"],
        connectSrc: ["'self'", "https://api.anthropic.com", "https://n8n.flaynn.fr"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false, // Désactivé par défaut pour éviter de casser les Web Fonts (v5)
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
    xContentTypeOptions: true,
    xFrameOptions: { action: "deny" },
    xXssProtection: false
  });

  await fastify.register(cors, { origin: process.env.NODE_ENV === 'production' ? 'https://flaynn.fr' : true });
  await fastify.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' });

  await fastify.register(dashboardApiRoutes);
  await fastify.register(scoringRoutes);

  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return fastify;
}