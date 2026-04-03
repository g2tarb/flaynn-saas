import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { helmetConfig, corsConfig } from './config/security.js';
import { errorHandler } from './middleware/error-handler.js';
import scoringRoutes from './routes/scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(__dirname, '..', '..', 'public');

dotenv.config();

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
  },
  disableRequestLogging: true,
  bodyLimit: 1048576
});

await fastify.register(helmet, helmetConfig);
await fastify.register(cors, corsConfig);
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1']
});

fastify.setErrorHandler(errorHandler);

fastify.get('/api/health', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: { status: { type: 'string' }, version: { type: 'string' } }
      }
    }
  }
}, async () => {
  return { status: 'ok', version: '1.0.0' };
});

await fastify.register(scoringRoutes);

await fastify.register(fastifyStatic, {
  root: siteRoot,
  prefix: '/',
  index: ['index.html']
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`[ARCHITECT-PRIME] Serveur SaaS Flaynn actif sur le port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
