import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '../config/db.js';
import { FlaynnError } from '../utils/errors.js';

const WebhookPayloadSchema = z.object({
  reference: z.string(),
  data: z.record(z.any())
}).strict();

const PdfPayloadSchema = z.object({
  reference: z.string(),
  pdf_base64: z.string()
}).strict();

function verifySignature(signature, expected) {
  if (!signature || !expected || signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export default async function webhookRoutes(fastify) {

  // Endpoint 1 : Recevoir le scoring de n8n
  fastify.post('/api/webhooks/n8n/score', {
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const signature = request.headers['x-flaynn-signature'];
    if (!verifySignature(signature, process.env.N8N_SECRET_TOKEN)) {
      request.log.warn('[SECOPS] Tentative d\'acces non autorisee au webhook n8n/score');
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Signature invalide.' });
    }

    const parsed = WebhookPayloadSchema.parse(request.body);

    await pool.query(
      'INSERT INTO scores (reference_id, data) VALUES ($1, $2) ON CONFLICT (reference_id) DO UPDATE SET data = $2',
      [parsed.reference, JSON.stringify(parsed.data)]
    );

    return reply.code(200).send({ success: true, message: 'Score mis a jour avec succes.' });
  });

  // Endpoint 2 : Recevoir le PDF du rapport depuis n8n
  fastify.post('/api/webhooks/n8n/pdf', {
    config: { rateLimit: { max: 50, timeWindow: '1 minute' } },
    bodyLimit: 10 * 1024 * 1024
  }, async (request, reply) => {
    const signature = request.headers['x-flaynn-signature'];
    if (!verifySignature(signature, process.env.N8N_SECRET_TOKEN)) {
      request.log.warn('[SECOPS] Tentative d\'acces non autorisee au webhook n8n/pdf');
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Signature invalide.' });
    }

    const parsed = PdfPayloadSchema.parse(request.body);

    const { rowCount } = await pool.query(
      `UPDATE scores SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{pdf_base64}', $1::jsonb) WHERE reference_id = $2`,
      [JSON.stringify(parsed.pdf_base64), parsed.reference]
    );

    if (rowCount === 0) {
      throw new FlaynnError('Reference introuvable', 404, 'NOT_FOUND');
    }

    return reply.code(200).send({ success: true, message: 'PDF stocke avec succes.' });
  });
}