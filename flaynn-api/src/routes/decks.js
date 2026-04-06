import { pool } from '../config/db.js';

export default async function deckRoutes(fastify) {
  fastify.get('/api/decks/:reference', async (request, reply) => {
    const ref = request.params.reference;
    const { rows } = await pool.query(
      "SELECT data->>'pitch_deck_base64' as pdf FROM scores WHERE reference_id = $1",
      [ref]
    );
    if (!rows.length || !rows[0].pdf) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const pdfBuffer = Buffer.from(rows[0].pdf, 'base64');
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${ref}.pdf"`)
      .send(pdfBuffer);
  });
}
