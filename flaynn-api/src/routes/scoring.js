import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { n8nBridge } from '../services/n8n-bridge.js';
import { pool } from '../config/db.js';

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
      let userEmail = null;

      // 1. Tente de récupérer l'email depuis le cookie JWT s'il est présent
      const accessToken = request.cookies?.flaynn_at;
      if (accessToken) {
        try {
          const decoded = fastify.jwt.verify(accessToken);
          userEmail = decoded.email;
        } catch (err) {
          request.log.warn('Token invalide ou expiré lors du scoring, passage en mode invité.');
        }
      }

      // 2. Si non connecté, vérifie si l'email du formulaire existe déjà en base
      if (!userEmail) {
        try {
          const userCheck = await pool.query('SELECT email FROM users WHERE email = $1', [parsed.email]);
          if (userCheck.rowCount > 0) {
            userEmail = userCheck.rows[0].email;
          }
        } catch (err) {
          request.log.warn('Erreur lors de la vérification de l\'utilisateur existant.');
        }
      }

      const payload = { ...parsed, email: userEmail || parsed.email };
      // ARCHITECT-PRIME: randomBytes CSPRNG au lieu de Math.random() (prédictible)
      const reference = `FLY-${randomBytes(4).toString('hex').toUpperCase()}`;
      const initialData = { status: 'pending_analysis', payload };
      
      await pool.query(
        'INSERT INTO scores (reference_id, user_email, startup_name, data) VALUES ($1, $2, $3, $4::jsonb)',
        [reference, userEmail, payload.startup_name, JSON.stringify(initialData)]
      );

      // ARCHITECT-PRIME: n8n orchestre tout (Claude IA + Google Sheets + callback webhook)
      // Fire-and-forget — n8n rappellera POST /api/webhooks/n8n/score avec le résultat
      n8nBridge.submitScore({ ...payload, reference }, request.id)
        .catch(async (err) => {
          request.log.error(err, `Échec de l'envoi à n8n pour la référence ${reference}`);
          await pool.query(
            `UPDATE scores SET data = jsonb_set(data, '{status}', '"error"') WHERE reference_id = $1`,
            [reference]
          ).catch(dbErr => request.log.error(dbErr, 'Échec de la sauvegarde du statut d\'erreur'));
        });

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
