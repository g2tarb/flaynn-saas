import { z } from 'zod';

const scoreSchema = z
  .object({
    startup_name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[\p{L}\p{N}\s\-'.&]+$/u),
    sector: z.enum([
      'fintech',
      'healthtech',
      'saas',
      'marketplace',
      'deeptech',
      'greentech',
      'other'
    ]),
    stage: z.enum(['idea', 'mvp', 'seed', 'serieA', 'serieB_plus']),
    pitch: z.string().trim().min(50).max(2000),
    email: z.string().email().max(254),
    url: z.string().trim().url().max(500).optional(),
    revenue_monthly: z.number().nonnegative().max(100_000_000).optional(),
    team_size: z.number().int().min(1).max(10_000).optional()
  })
  .strict();

export default async function scoringRoutes(fastify) {
  fastify.post('/api/score', async (request, reply) => {
    const parsed = scoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'VALIDATION_FAILED',
        details: parsed.error.flatten()
      });
    }

    const reference = `FL-${Date.now().toString(36).toUpperCase()}`;

    const webhook = process.env.N8N_SCORE_WEBHOOK_URL;
    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...parsed.data, reference })
        });
        if (!res.ok) {
          fastify.log.warn({ status: res.status }, 'n8n webhook non-OK');
        }
      } catch (err) {
        fastify.log.error(err, 'n8n webhook failed');
      }
    }

    return reply.send({
      ok: true,
      reference,
      message: 'Accepted'
    });
  });
}
