import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { n8nBridge } from '../services/n8n-bridge.js';
import { pool } from '../config/db.js';
import { ScoreSubmissionSchema } from '../schemas/scoring.js';

export default async function stripeRoutes(fastify) {

  if (!process.env.STRIPE_SECRET_KEY) {
    fastify.log.warn('[ARCHITECT-PRIME] STRIPE_SECRET_KEY absent — routes Stripe désactivées.');
    return;
  }

  // Initialisation de Stripe DOIT être dans la fonction pour garantir que dotenv a chargé les variables
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });

  // ARCHITECT-PRIME: Capture rawBody UNIQUEMENT pour le webhook Stripe (pas globalement)
  // Le content type parser scopé au plugin intercepte le JSON brut pour la verification de signature
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (req, body, done) {
      req.rawBody = body;
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err);
      }
    }
  );

  // 1. ENDPOINT DE CHECKOUT : Reçoit le formulaire, enregistre en base, redirige vers Stripe
  fastify.post('/api/checkout', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    bodyLimit: 16 * 1024 * 1024
  }, async (request, reply) => {
    try {
      const parsed = ScoreSubmissionSchema.parse(request.body);
      let userEmail = null;

      // Récupération de l'email via le token JWT si l'utilisateur est connecté
      const accessToken = request.cookies?.flaynn_at;
      if (accessToken) {
        try {
          const decoded = fastify.jwt.verify(accessToken);
          userEmail = decoded.email;
        } catch {
          request.log.warn('Token invalide lors du checkout.');
        }
      }

      // Fallback : on cherche dans la base de données
      if (!userEmail) {
        try {
          const userCheck = await pool.query('SELECT email FROM users WHERE email = $1', [parsed.email]);
          if (userCheck.rowCount > 0) userEmail = userCheck.rows[0].email;
        } catch {
          request.log.warn('Erreur vérification utilisateur.');
        }
      }

      // Génération de la référence unique
      const reference = `FLY-${randomBytes(4).toString('hex').toUpperCase()}`;

      // Enregistrement initial en base (STATUT : pending_payment)
      const initialData = {
        status: 'pending_payment', // En attente de paiement
        pitch_deck_base64: parsed.pitch_deck_base64 || null,
        payload: parsed
      };

      await pool.query(
        'INSERT INTO scores (reference_id, user_email, startup_name, data) VALUES ($1, $2, $3, $4::jsonb)',
        [reference, userEmail, parsed.nom_startup, JSON.stringify(initialData)]
      );

      const baseUrl = process.env.APP_URL || 'https://flaynn.tech';

      // Création de la session Stripe
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Audit Scoring Flaynn',
                description: 'Analyse IA + validation humaine sur 5 piliers',
              },
              unit_amount: 2900, // 29.00€ (en centimes)
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/scoring/succes?session_id={CHECKOUT_SESSION_ID}`, // Redirection après succès
        cancel_url: `${baseUrl}/#scoring-form`, // Redirection si annulation
        customer_email: parsed.email,
        metadata: {
          reference: reference // Indispensable pour lier le paiement au dossier
        }
      });

      // On renvoie l'URL de paiement au frontend
      return reply.code(200).send({ checkout_url: session.url, reference });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', details: err.flatten().fieldErrors });
      }
      request.log.error({ err }, 'Erreur lors du checkout Stripe');
      return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur lors de la création du paiement.' });
    }
  });


  // 2. ENDPOINT SESSION : Récupère référence et email depuis une session Stripe
  fastify.get('/api/checkout/session/:sessionId', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const sessionId = request.params.sessionId;
    if (!sessionId || sessionId.length > 200 || !/^cs_/.test(sessionId)) {
      return reply.code(400).send({ error: 'INVALID_SESSION', message: 'Identifiant de session invalide.' });
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const reference = session.metadata?.reference || '';
      const email = session.customer_email || '';
      return reply.send({ reference, email });
    } catch (err) {
      request.log.warn({ err: err.message }, 'Erreur récupération session Stripe');
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Session introuvable.' });
    }
  });

  // 3. ENDPOINT WEBHOOK : Écoute Stripe en arrière-plan pour valider le paiement
  fastify.post('/api/webhooks/stripe', {
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];

    let event;

    try {
      // 👇 MODIFICATION DU PARSER RAWBODY ICI 👇
      const rawBodyBuffer = Buffer.isBuffer(request.rawBody)
        ? request.rawBody
        : Buffer.from(JSON.stringify(request.body));

      event = stripe.webhooks.constructEvent(
        rawBodyBuffer, 
        sig, 
        process.env.STRIPE_WEBHOOK_SECRET
      );
      // 👆 FIN DE LA MODIFICATION 👆

    } catch (err) {
      request.log.warn({ err: err.message }, 'Webhook Stripe : Signature invalide');
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    // Gestion du succès du paiement
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const reference = session.metadata.reference;

      request.log.info(`Paiement validé pour la référence : ${reference}`);

      try {
        // 1. On récupère le dossier en base
        const scoreRecord = await pool.query('SELECT data FROM scores WHERE reference_id = $1', [reference]);
        
        if (scoreRecord.rowCount === 0) {
          request.log.error(`Webhook : Dossier introuvable pour la ref ${reference}`);
          return reply.code(200).send(); // On renvoie 200 à Stripe pour qu'il arrête de retry
        }

        const data = scoreRecord.rows[0].data;
        const parsedPayload = data.payload;

        // 2. On met à jour le statut en base (pending_payment -> pending_analysis)
        await pool.query(
          `UPDATE scores SET data = jsonb_set(data, '{status}', '"pending_analysis"') WHERE reference_id = $1`,
          [reference]
        );

        // 3. On construit l'URL du deck PDF (comme dans scoring.js)
        const host = request.headers['x-forwarded-host'] || request.headers.host || 'flaynn.tech';
        const protocol = request.headers['x-forwarded-proto'] || 'https';
        const deckUrl = data.pitch_deck_base64
          ? `${protocol}://${host}/api/decks/${reference}`
          : '';

        // 4. On déclenche n8n SANS le base64 (pour ne pas surcharger)
        const { pitch_deck_base64, ...payloadWithoutBase64 } = parsedPayload;
        
        n8nBridge.submitScore({
          ...payloadWithoutBase64,
          reference,
          pitch_deck_url: deckUrl
        }, request.id).catch(async (err) => {
            request.log.error(err, `Échec envoi n8n post-paiement pour ${reference}`);
            await pool.query(
              `UPDATE scores SET data = jsonb_set(data, '{status}', '"error"') WHERE reference_id = $1`,
              [reference]
            );
        });

      } catch (dbErr) {
        request.log.error({ err: dbErr }, `Erreur base de données traitement webhook pour ${reference}`);
      }
    }

    // On répond 200 à Stripe pour confirmer la réception
    reply.code(200).send({ received: true });
  });
}