import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import { n8nBridge } from '../services/n8n-bridge.js';
import { pool } from '../config/db.js';
import { ScoreSubmissionSchema } from '../schemas/scoring.js';
import { putObject } from '../lib/r2-storage.js';

// ARCHITECT-PRIME: Delta 13 — helpers privés pour upload R2 depuis POST /api/score.
const ALLOWED_EXTRA_EXTENSIONS = new Set(['.pdf', '.pptx', '.docx']);

// Mapping partagé extension → MIME pour extra_docs (upload R2 + route legacy GET).
const EXTRA_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function extractBase64Payload(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('base64 payload empty');
  }
  let contentType = null;
  let b64 = input;
  // Support optionnel du data URI "data:application/pdf;base64,XXX".
  if (input.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.+)$/.exec(input);
    if (!match) throw new Error('invalid data URI');
    contentType = match[1];
    b64 = match[2];
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) {
    throw new Error('base64 decode produced empty buffer');
  }
  return { buffer, contentType };
}

function sanitizeExtension(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return '.pdf';
  const ext = extname(filename).toLowerCase();
  return ALLOWED_EXTRA_EXTENSIONS.has(ext) ? ext : '.pdf';
}

export default async function scoringRoutes(fastify) {

  // Servir un document additionnel par index
  fastify.get('/api/decks/:ref/extra/:index', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { ref, index } = request.params;
    const idx = Number(index);
    if (!ref || ref.length > 64 || !Number.isInteger(idx) || idx < 0 || idx > 4) {
      return reply.code(400).send({ error: 'INVALID_PARAMS' });
    }
    try {
      const { rows } = await pool.query(
        "SELECT data->'extra_docs' as extra_docs FROM scores WHERE reference_id = $1",
        [ref]
      );
      if (rows.length === 0 || !rows[0].extra_docs) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const docs = rows[0].extra_docs;
      if (!Array.isArray(docs) || idx >= docs.length || !docs[idx]?.base64) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      const doc = docs[idx];
      const buf = Buffer.from(doc.base64, 'base64');
      if (buf.length < 100) {
        return reply.code(404).send({ error: 'INVALID_FILE' });
      }
      const ext = doc.filename?.toLowerCase()?.slice(doc.filename.lastIndexOf('.')) || '';
      return reply
        .header('Content-Type', EXTRA_MIME_MAP[ext] || 'application/octet-stream')
        .header('Cache-Control', 'private, max-age=3600')
        .send(buf);
    } catch (err) {
      request.log.error(err, 'Erreur serving extra doc');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  // Servir le pitch deck PDF stocke en base pour Mistral OCR
  const OCR_BYPASS_TOKEN = process.env.OCR_BYPASS_TOKEN || 'flaynn-ocr-secret-2026';

  fastify.get('/api/decks/:ref', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const ref = request.params.ref;
    if (!ref || ref.length > 64) {
      return reply.code(400).send({ error: 'INVALID_REF' });
    }

    // ARCHITECT-PRIME: bypass auth pour les appels OCR internes (n8n/Mistral)
    const isOcrBypass = request.query.ocr_token === OCR_BYPASS_TOKEN;
    if (!isOcrBypass) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Token OCR invalide ou manquant.' });
    }

    try {
      // ->> retourne du texte brut (pas du JSON avec guillemets)
      const { rows } = await pool.query(
        "SELECT COALESCE(data->>'pitch_deck_base64', data->'payload'->>'pitch_deck_base64') as pdf_b64 FROM scores WHERE reference_id = $1",
        [ref]
      );
      if (rows.length === 0 || !rows[0].pdf_b64) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      let pdfBase64 = rows[0].pdf_b64;
      // Supprimer le préfixe data URI si présent
      if (pdfBase64.includes(',')) {
        pdfBase64 = pdfBase64.split(',')[1];
      }
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      if (pdfBuffer.length < 100) {
        request.log.warn(`PDF trop petit pour ref ${ref} (${pdfBuffer.length} bytes)`);
        return reply.code(404).send({ error: 'INVALID_PDF' });
      }
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Encoding', 'identity')
        .header('Cache-Control', 'private, max-age=3600')
        .send(pdfBuffer);
    } catch (err) {
      request.log.error(err, 'Erreur serving deck PDF');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  // ARCHITECT-PRIME: endpoint public pour afficher le pitch deck en inline (pas de téléchargement)
  // Pas d'auth requise — le reference_id (FLY-XXXX) sert d'identifiant opaque
  fastify.get('/api/decks/:ref/view', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const ref = request.params.ref;
    if (!ref || !/^FLY-[A-F0-9]{4,16}$/i.test(ref)) {
      return reply.code(400).send({ error: 'INVALID_REF', message: 'Référence invalide.' });
    }

    try {
      const { rows } = await pool.query(
        "SELECT COALESCE(data->>'pitch_deck_base64', data->'payload'->>'pitch_deck_base64') as pdf_b64, startup_name FROM scores WHERE reference_id = $1",
        [ref]
      );
      if (rows.length === 0 || !rows[0].pdf_b64) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Pitch deck introuvable.' });
      }

      let pdfBase64 = rows[0].pdf_b64;
      if (pdfBase64.includes(',')) {
        pdfBase64 = pdfBase64.split(',')[1];
      }
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      if (pdfBuffer.length < 100) {
        return reply.code(404).send({ error: 'INVALID_PDF', message: 'Le PDF semble corrompu.' });
      }

      const safeName = (rows[0].startup_name || ref).replace(/[^a-zA-Z0-9_\-]/g, '_');

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="Pitch-${safeName}.pdf"`)
        .header('Content-Encoding', 'identity')
        .header('Cache-Control', 'public, max-age=86400, immutable')
        .header('X-Content-Type-Options', 'nosniff')
        .send(pdfBuffer);
    } catch (err) {
      request.log.error(err, 'Erreur serving deck view');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  fastify.post('/api/score', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    bodyLimit: 90 * 1024 * 1024
  }, async (request, reply) => {
    try {
      const parsed = ScoreSubmissionSchema.parse(request.body);
      let userEmail = null;

      const accessToken = request.cookies?.flaynn_at;
      if (accessToken) {
        try {
          const decoded = fastify.jwt.verify(accessToken);
          userEmail = decoded.email;
        } catch {
          request.log.warn('Token invalide ou expire lors du scoring.');
        }
      }

      if (!userEmail) {
        try {
          const userCheck = await pool.query('SELECT email FROM users WHERE email = $1', [parsed.email]);
          if (userCheck.rowCount > 0) userEmail = userCheck.rows[0].email;
        } catch {
          request.log.warn('Erreur verification utilisateur existant.');
        }
      }

      const reference = `FLY-${randomBytes(4).toString('hex').toUpperCase()}`;

      // ARCHITECT-PRIME: Delta 13 — Upload R2 AVANT persist DB. La DB ne stocke plus
      // de base64, uniquement des métadonnées légères. En cas d'échec partiel (ex: 2/5
      // extras uploadés puis 3e KO) on laisse des orphelins R2 acceptés pour ce step ;
      // cleanup V2 (cf. progress-delta-13.md).
      let pitchDeckStorage = null;
      const extraDocsStorage = [];
      try {
        if (parsed.pitch_deck_base64) {
          const { buffer } = extractBase64Payload(parsed.pitch_deck_base64);
          const key = `decks/${reference}.pdf`;
          const meta = await putObject(key, buffer, 'application/pdf', { logger: request.log });
          pitchDeckStorage = {
            kind: 'r2',
            key: meta.key,
            size: meta.size,
            content_type: 'application/pdf',
            uploaded_at: new Date().toISOString(),
          };
        }

        if (Array.isArray(parsed.extra_docs) && parsed.extra_docs.length > 0) {
          for (let i = 0; i < parsed.extra_docs.length; i++) {
            const doc = parsed.extra_docs[i];
            if (!doc?.base64) {
              request.log.warn(
                { reference, index: i, filename: doc?.filename },
                'extra_doc sans base64, skip'
              );
              continue;
            }
            const { buffer, contentType } = extractBase64Payload(doc.base64);
            const ext = sanitizeExtension(doc.filename);
            const key = `extras/${reference}/${i}${ext}`;
            // Cascade MIME : data URI valide → mapping extension → fallback PDF
            // (cohérent avec sanitizeExtension qui retombe sur .pdf si ext inconnue).
            const mime = contentType || EXTRA_MIME_MAP[ext] || 'application/pdf';
            const meta = await putObject(key, buffer, mime, { logger: request.log });
            extraDocsStorage.push({
              kind: 'r2',
              key: meta.key,
              size: meta.size,
              filename: doc.filename,
              content_type: mime,
              uploaded_at: new Date().toISOString(),
            });
          }
        }
      } catch (uploadErr) {
        request.log.error({ err: uploadErr, reference }, 'Echec upload R2 pendant /api/score');
        return reply.code(502).send({
          error: 'STORAGE_UNAVAILABLE',
          message: 'Le stockage des documents est temporairement indisponible. Réessayez dans quelques instants.',
        });
      }

      // Payload sans base64 : réutilisé pour DB + n8n (aucun blob persisté/envoyé deux fois).
      const { pitch_deck_base64: _pdb, extra_docs: _ed, ...payloadWithoutBase64 } = parsed;

      const initialData = {
        status: 'pending_analysis',
        pitch_deck_storage: pitchDeckStorage,
        extra_docs: extraDocsStorage,
        payload: payloadWithoutBase64,
      };

      await pool.query(
        'INSERT INTO scores (reference_id, user_email, startup_name, data) VALUES ($1, $2, $3, $4::jsonb)',
        [reference, userEmail, parsed.nom_startup, JSON.stringify(initialData)]
      );

      // Construire l URL du deck pour n8n/Mistral
      const host = request.headers['x-forwarded-host'] || request.headers.host || 'flaynn.tech';
      const protocol = request.headers['x-forwarded-proto'] || 'https';
      const deckUrl = pitchDeckStorage
        ? `${protocol}://${host}/api/decks/${reference}`
        : '';

      // Construire les URLs des docs additionnels pour n8n
      const extraDocsUrls = extraDocsStorage.map((_, i) =>
        `${protocol}://${host}/api/decks/${reference}/extra/${i}`
      );

      // Envoyer a n8n SANS le base64, avec l URL du deck + extra docs
      n8nBridge.submitScore({
        ...payloadWithoutBase64,
        reference,
        pitch_deck_url: deckUrl,
        extra_docs_urls: extraDocsUrls
      }, request.id)
        .catch(async (err) => {
          request.log.error(err, `Echec envoi n8n pour ${reference}`);
          await pool.query(
            `UPDATE scores SET data = jsonb_set(data, '{status}', '"error"') WHERE reference_id = $1`,
            [reference]
          ).catch(dbErr => request.log.error(dbErr, 'Echec sauvegarde statut erreur'));
        });

      return reply.code(200).send({ success: true, reference });
    } catch (err) {
      if (err instanceof z.ZodError) {
        request.log.warn({ zodErrors: err.flatten().fieldErrors }, 'Validation Zod echouee');
        return reply.code(422).send({ error: 'VALIDATION_FAILED', details: err.flatten().fieldErrors });
      }
      request.log.error({ err }, 'Erreur lors du scoring');
      return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur interne lors du scoring.' });
    }
  });
}