import { z } from 'zod';
import { pool } from '../config/db.js';

const refSchema = z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/);

/**
 * Route GET /api/decks/:reference
 * Retourne le PDF base64 stocké pour une référence donnée.
 * Utilisé par n8n pour récupérer le pitch deck et le passer à Mistral OCR.
 * Sécurisé par le token interne N8N_SECRET_TOKEN (header x-flaynn-signature).
 */
export default async function decksRoutes(fastify) {
  fastify.get('/api/decks/:reference', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    // Vérification du token interne — seul n8n peut accéder à cette route
    const signature = request.headers['x-flaynn-signature'];
    if (!signature || signature !== process.env.N8N_SECRET_TOKEN) {
      request.log.warn('[SECOPS] Accès non autorisé à /api/decks/:reference');
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Signature invalide.' });
    }

    const parsed = refSchema.safeParse(request.params.reference);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_REF', message: 'Référence invalide.' });
    }

    const { rows } = await pool.query(
      "SELECT data->>'pitch_deck_base64' AS pdf_base64, startup_name FROM scores WHERE reference_id = $1",
      [parsed.data]
    );

    if (rows.length === 0 || !rows[0].pdf_base64) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'PDF non disponible pour cette référence.' });
    }

    // Retourne le PDF en binaire (Content-Type: application/pdf)
    const pdfBuffer = Buffer.from(rows[0].pdf_base64, 'base64');
    const filename = `Flaynn-Deck-${rows[0].startup_name || parsed.data}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(pdfBuffer);
  });
}
