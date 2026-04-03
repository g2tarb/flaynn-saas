import { z } from 'zod';

// Schéma Zod strict - Red Team Policy
const ScoreSubmissionSchema = z.object({
  startup_name: z.string().trim().min(2).max(100).regex(/^[\p{L}\p{N}\s\-'.&]+$/u),
  url: z.union([z.string().trim().url().max(500), z.literal('').transform(() => undefined)]).optional(),
  email: z.string().email().max(254),
  sector: z.enum(['fintech','healthtech','saas','marketplace','deeptech','greentech','other']),
  stage: z.enum(['idea','mvp','seed','serieA','serieB_plus']),
  pitch: z.string().trim().min(50).max(2000),
  revenue_monthly: z.number().nonnegative().max(100_000_000).optional(),
  team_size: z.number().int().min(1).max(10000).optional()
}).strict();

export default async function scoringRoutes(fastify) {
  fastify.post('/api/score', {
    config: {
      rateLimit: { max: 3, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    try {
      const parsed = ScoreSubmissionSchema.parse(request.body);

      // Webhook n8n asynchrone (v5.0 Errata)
      const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.flaynn.fr/webhook/scoring-submit';
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Flaynn-Source': 'web-api',
          'X-Flaynn-Signature': process.env.N8N_SECRET_TOKEN || 'dev-secret'
        },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) throw new Error('WEBHOOK_FAILED');

      const reference = `FLY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      return reply.code(200).send({ success: true, reference });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', details: err.flatten().fieldErrors });
      }
      request.log.error(err);
      return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur interne lors du scoring.' });
    }
  });
}
