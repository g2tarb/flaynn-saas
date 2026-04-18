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

    // ARCHITECT-PRIME: routage par event.type ET par metadata.source pour distinguer
    // les flux scoring (29€ one-shot) et BA subscription (350€/mois).
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const isBaFlow = session.mode === 'subscription'
            || session.metadata?.source === 'rejoindre-v1';

          if (isBaFlow) {
            await handleBaCheckoutCompleted(session, request);
          } else {
            await handleScoringCheckoutCompleted(session, request);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await handleBaSubscriptionDeleted(sub, request);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          await handleBaInvoicePaymentFailed(invoice, request);
          break;
        }

        default:
          // Stripe envoie beaucoup d'events qu'on ignore volontairement.
          request.log.debug({ type: event.type }, 'stripe_event_ignored');
      }
    } catch (err) {
      // ARCHITECT-PRIME: on log mais on renvoie 200 à Stripe pour ne pas déclencher
      // un retry agressif sur une erreur métier non-récupérable. Les erreurs DB
      // récupérables (503) sont traitées dans chaque handler avec leur propre logique.
      request.log.error({ err: err.message, type: event.type }, 'stripe_webhook_handler_error');
    }

    return reply.code(200).send({ received: true });
  });

  // ----------------------------------------------------------------------------
  // Handlers — scoring (existant, extrait tel quel pour clarté)
  // ----------------------------------------------------------------------------
  async function handleScoringCheckoutCompleted(session, request) {
    const reference = session.metadata?.reference;
    if (!reference) {
      request.log.warn({ session_id: session.id }, 'scoring_checkout_missing_reference');
      return;
    }

    request.log.info(`Paiement validé pour la référence : ${reference}`);

    const scoreRecord = await pool.query('SELECT data FROM scores WHERE reference_id = $1', [reference]);
    if (scoreRecord.rowCount === 0) {
      request.log.error(`Webhook : Dossier introuvable pour la ref ${reference}`);
      return;
    }

    const data = scoreRecord.rows[0].data;
    const parsedPayload = data.payload;

    await pool.query(
      `UPDATE scores SET data = jsonb_set(data, '{status}', '"pending_analysis"') WHERE reference_id = $1`,
      [reference]
    );

    const host = request.headers['x-forwarded-host'] || request.headers.host || 'flaynn.tech';
    const protocol = request.headers['x-forwarded-proto'] || 'https';
    const deckUrl = data.pitch_deck_base64
      ? `${protocol}://${host}/api/decks/${reference}`
      : '';

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
  }

  // ----------------------------------------------------------------------------
  // Handlers — Delta 12 BA subscription
  // ----------------------------------------------------------------------------
  async function handleBaCheckoutCompleted(session, request) {
    // ARCHITECT-PRIME: client_reference_id défini par /api/ba/apply (étape 6).
    const baIdRaw = session.client_reference_id;
    const baId = Number.parseInt(baIdRaw, 10);

    if (!Number.isInteger(baId) || baId <= 0) {
      request.log.warn({ session_id: session.id, client_reference_id: baIdRaw }, 'ba_checkout_invalid_ref');
      return;
    }
    if (!session.customer || !session.subscription) {
      request.log.warn({ session_id: session.id, ba_id: baId }, 'ba_checkout_missing_customer_or_sub');
      return;
    }

    // UPDATE conditionnel : seulement si status='pending'. Idempotent — un retry
    // Stripe sur le même event laisse le row inchangé.
    const { rowCount, rows } = await pool.query(
      `UPDATE business_angels
       SET stripe_customer_id = $1, stripe_subscription_id = $2,
           status = 'active', activated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING id, email, first_name, last_name`,
      [session.customer, session.subscription, baId]
    );

    if (rowCount === 0) {
      request.log.warn({ ba_id: baId, session_id: session.id }, 'ba_checkout_no_pending_row');
      return;
    }

    request.log.info({ ba_id: baId }, 'ba_activated');

    // Notif welcome déléguée à n8n. Fail-open : si n8n down, l'admin verra
    // l'event d'activation côté logs et pourra renvoyer manuellement.
    n8nBridge.submitScore({
      event: 'ba.activated',
      ba_id: rows[0].id,
      email: rows[0].email,
      first_name: rows[0].first_name,
      last_name: rows[0].last_name
    }, request.id).catch((err) => {
      request.log.warn({ err: err.message, ba_id: baId }, 'ba_activated_n8n_notify_failed');
    });
  }

  async function handleBaSubscriptionDeleted(sub, request) {
    if (!sub.id) {
      request.log.warn({ sub_id: sub.id }, 'ba_sub_deleted_missing_id');
      return;
    }
    const { rowCount, rows } = await pool.query(
      `UPDATE business_angels
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE stripe_subscription_id = $1
         AND status IN ('active', 'paused')
       RETURNING id, email`,
      [sub.id]
    );

    if (rowCount === 0) {
      request.log.debug({ sub_id: sub.id }, 'ba_sub_deleted_no_match');
      return;
    }

    request.log.info({ ba_id: rows[0].id, sub_id: sub.id }, 'ba_cancelled');

    n8nBridge.submitScore({
      event: 'ba.cancelled',
      ba_id: rows[0].id,
      email: rows[0].email
    }, request.id).catch((err) => {
      request.log.warn({ err: err.message, ba_id: rows[0].id }, 'ba_cancelled_n8n_notify_failed');
    });
  }

  async function handleBaInvoicePaymentFailed(invoice, request) {
    if (!invoice.customer) {
      request.log.warn({ invoice_id: invoice.id }, 'ba_invoice_failed_missing_customer');
      return;
    }
    const { rowCount, rows } = await pool.query(
      `UPDATE business_angels
       SET status = 'paused', paused_at = NOW()
       WHERE stripe_customer_id = $1
         AND status = 'active'
       RETURNING id, email`,
      [invoice.customer]
    );

    if (rowCount === 0) {
      request.log.debug({ customer_id: invoice.customer }, 'ba_invoice_failed_no_active_match');
      return;
    }

    request.log.info({ ba_id: rows[0].id, customer_id: invoice.customer }, 'ba_paused');

    n8nBridge.submitScore({
      event: 'ba.paused',
      ba_id: rows[0].id,
      email: rows[0].email,
      attempt_count: invoice.attempt_count || 1
    }, request.id).catch((err) => {
      request.log.warn({ err: err.message, ba_id: rows[0].id }, 'ba_paused_n8n_notify_failed');
    });
  }
}
