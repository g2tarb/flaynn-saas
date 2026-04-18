import { z } from 'zod';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { isDbUnavailableError } from '../utils/errors.js';
import { n8nBridge } from '../services/n8n-bridge.js';

// ARCHITECT-PRIME: enums alignés avec le doc Delta 12 §2A.5.
// Si tu ajoutes un secteur/géographie côté frontend, il DOIT être ajouté ici aussi
// sinon Zod le rejette avec 422 (volontaire, pas une régression).
const SECTOR_VALUES = [
  'HealthTech', 'SaaS B2B', 'FinTech', 'ClimateTech', 'EdTech', 'Consumer',
  'DeepTech', 'AI/ML', 'Marketplaces', 'Cybersecurity', 'Autre'
];

const STAGE_VALUES = ['pre-seed', 'seed', 'series-a'];

const GEOGRAPHY_VALUES = [
  'France', 'Belgique', 'Luxembourg', 'Suisse romande',
  'Québec', 'Maroc', 'Tunisie', 'Côte d\'Ivoire', 'Sénégal',
  'Europe (autre)', 'Autre'
];

const ESG_VALUES = [
  'Mixité fondateurs', 'Impact climat', 'Inclusion sociale', 'Économie locale'
];

const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/[\w\-_%.]+\/?$/;

// ARCHITECT-PRIME: .strict() rejette toute clé inattendue (anti mass-assignment).
const BaApplySchema = z.object({
  first_name:      z.string().trim().min(2).max(80),
  last_name:       z.string().trim().min(2).max(80),
  email:           z.string().trim().toLowerCase().email().max(254),
  linkedin_url:    z.string().trim().max(500).regex(LINKEDIN_RE, 'URL LinkedIn invalide.'),
  exit_context:    z.string().trim().max(2000).optional().default(''),
  sectors:         z.array(z.enum(SECTOR_VALUES)).min(1).max(6),
  stages:          z.array(z.enum(STAGE_VALUES)).min(1).max(3),
  ticket_min:      z.number().int().min(5_000).max(500_000),
  ticket_max:      z.number().int().min(5_000).max(500_000),
  geography:       z.array(z.enum(GEOGRAPHY_VALUES)).min(1).max(GEOGRAPHY_VALUES.length),
  esg_preferences: z.array(z.enum(ESG_VALUES)).max(4).optional().default([]),
  weekly_capacity: z.number().int().min(1).max(3),
  referral_source: z.string().trim().max(200).optional().default(''),
  consent_rgpd:    z.literal(true)
}).strict();

export default async function baApplyRoutes(fastify) {
  // ARCHITECT-PRIME: gracieuse dégradation — si Stripe pas configuré, on désactive
  // entièrement la route (pattern existant dans routes/stripe.js).
  if (!process.env.STRIPE_SECRET_KEY) {
    fastify.log.warn('[BA] STRIPE_SECRET_KEY absent — route /api/ba/apply désactivée.');
    return;
  }
  if (!process.env.STRIPE_PRICE_BA_SUBSCRIPTION) {
    fastify.log.warn('[BA] STRIPE_PRICE_BA_SUBSCRIPTION absent — route /api/ba/apply désactivée.');
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });

  fastify.post('/api/ba/apply', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (request, reply) => {
    let body;
    try {
      body = BaApplySchema.parse(request.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(422).send({
          error: 'VALIDATION_FAILED',
          details: err.flatten().fieldErrors
        });
      }
      throw err;
    }

    if (body.ticket_min > body.ticket_max) {
      return reply.code(400).send({
        error: 'INVALID_RANGE',
        message: 'ticket_min doit être inférieur ou égal à ticket_max.'
      });
    }

    // Dédup applicative — un dossier vivant suffit. Ceinture : SELECT.
    // Bretelles : UNIQUE INDEX partiel en DB capturé via code 23505 ci-dessous.
    try {
      const { rows: existing } = await pool.query(
        `SELECT id, status FROM business_angels
         WHERE email = $1 AND status IN ('pending', 'active', 'paused')
         LIMIT 1`,
        [body.email]
      );
      if (existing.length > 0) {
        return reply.code(409).send({
          error: 'ALREADY_APPLIED',
          status: existing[0].status,
          message: 'Une candidature existe déjà pour cet email.'
        });
      }
    } catch (err) {
      if (isDbUnavailableError(err)) {
        request.log.error({ err }, 'ba_apply_db_unavailable_dedup');
        return reply.code(503).send({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Service temporairement indisponible.'
        });
      }
      throw err;
    }

    const thesis = {
      version: 1,
      sectors: body.sectors,
      stages: body.stages,
      ticket_range: { min: body.ticket_min, max: body.ticket_max },
      geography: body.geography,
      esg_preferences: body.esg_preferences,
      weekly_capacity: body.weekly_capacity
    };

    let ba;
    try {
      const { rows } = await pool.query(
        `INSERT INTO business_angels
           (first_name, last_name, email, linkedin_url, exit_context,
            thesis, referral_source, status, consent_rgpd_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending', NOW())
         RETURNING id, email, first_name, last_name`,
        [
          body.first_name,
          body.last_name,
          body.email,
          body.linkedin_url,
          body.exit_context || null,
          JSON.stringify(thesis),
          body.referral_source || null
        ]
      );
      ba = rows[0];
    } catch (err) {
      if (err && err.code === '23505') {
        // Race condition entre SELECT dédup et INSERT — l'index UNIQUE partiel a tranché.
        request.log.warn({ email: body.email }, 'ba_apply_race_23505');
        return reply.code(409).send({
          error: 'ALREADY_APPLIED',
          message: 'Une candidature existe déjà pour cet email.'
        });
      }
      if (isDbUnavailableError(err)) {
        request.log.error({ err }, 'ba_apply_db_unavailable_insert');
        return reply.code(503).send({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Service temporairement indisponible.'
        });
      }
      throw err;
    }

    // Notif admin → déléguée à n8n. Fail-open : si n8n down, on n'empêche pas
    // le BA de poursuivre vers Stripe.
    n8nBridge.submitScore({
      event: 'ba.applied',
      ba_id: ba.id,
      email: ba.email,
      first_name: ba.first_name,
      last_name: ba.last_name,
      thesis
    }, request.id).catch((err) => {
      request.log.warn({ err: err.message, ba_id: ba.id }, 'ba_apply_n8n_notify_failed');
    });

    // Stripe Checkout — subscription mode.
    // ARCHITECT-PRIME: client_reference_id = ba.id est la clé de jointure côté webhook.
    // metadata.source permet au webhook de différencier les abonnements BA des paiements scoring.
    const baseUrl = process.env.BA_PUBLIC_BASE_URL || 'https://flaynn.com';
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        locale: 'fr',
        customer_email: ba.email,
        client_reference_id: String(ba.id),
        line_items: [{
          price: process.env.STRIPE_PRICE_BA_SUBSCRIPTION,
          quantity: 1
        }],
        subscription_data: {
          metadata: {
            ba_id: String(ba.id),
            source: 'rejoindre-v1'
          }
        },
        metadata: {
          ba_id: String(ba.id),
          source: 'rejoindre-v1'
        },
        success_url: `${baseUrl}/rejoindre/merci?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/rejoindre?cancelled=true`,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true }
      });
    } catch (err) {
      request.log.error({ err: err.message, ba_id: ba.id }, 'ba_apply_stripe_session_failed');
      // Le row business_angels reste en status='pending' sans stripe_*.
      // L'admin pourra le relancer ou le purger via la route admin (étape 9).
      return reply.code(502).send({
        error: 'STRIPE_UNAVAILABLE',
        message: 'Impossible de créer la session de paiement. Réessayez dans quelques instants.'
      });
    }

    return reply.code(200).send({
      ba_id: ba.id,
      checkout_url: session.url
    });
  });
}
