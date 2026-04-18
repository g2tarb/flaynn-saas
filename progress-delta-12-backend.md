# Delta 12 — Backend (flaynn-saas) — Progress

Suivi atomique des étapes de la checklist 9.A du doc d'architecture V2.

| # | Étape | Statut | Commit |
|---|-------|--------|--------|
| 0 | Découverte + rapport | ✅ | (chat) |
| 1 | Tracker de progression | ✅ | step-1 |
| 2 | Migration DB : `business_angels`, `intro_requests`, `ba_digests` | ⬜ | — |
| 3 | CORS : autoriser `https://flaynn.com` | ⬜ | — |
| 4 | `src/lib/intro-token.js` (HMAC sign/verify) | ⬜ | — |
| 5 | Env vars (`STRIPE_PRICE_BA_SUBSCRIPTION`, `INTRO_TOKEN_SECRET`, `ADMIN_EMAILS`) | ⬜ | — |
| 6 | `routes/ba-apply.js` (Zod strict, dedup, Stripe Checkout subscription) | ⬜ | — |
| 7 | Extension `/api/webhooks/stripe` pour 3 events BA | ⬜ | — |
| 8 | `routes/ba-intro-request.js` (verify token + n8n bridge) | ⬜ | — |
| 9 | `routes/admin-ba.js` (validation manuelle + refund) | ⬜ | — |
| 10 | Wiring server.js + `.env.example` + `render.yaml` | ⬜ | — |

## Décisions prises (défauts validés)

- **Auth admin** : whitelist email via env `ADMIN_EMAILS=email1,email2` + check sur `request.user.email` après `fastify.authenticate`.
- **Stripe webhook** : extension de `/api/webhooks/stripe` existant (un seul endpoint Stripe), routage par `client_reference_id`/metadata `source`.
- **n8n** : workflows JSON non versionnés dans le repo. Notif admin + email welcome délégués à n8n via `n8nBridge`.
- **`public_cards` (delta 9)** absent → table `intro_requests` créée **sans FK** vers `public_cards`, avec check applicatif. TODO comment laissé.
- **DB migrations** : extension de `initDB` (option A) — pas de runner externe.
- **CORS** : ajout de `https://flaynn.com`. `credentials: true` conservé (compat existant) ; les requêtes BA n'envoient pas de cookies de toute façon.

## Sécurité — points à reviewer ligne par ligne (rappel)

1. Webhook Stripe — signature verification (rawBody buffer + `stripe.webhooks.constructEvent`)
2. Intro token HMAC — `timingSafeEqual` côté verify, expiration 30j, secret env ≥ 32 chars
3. Validation server-side du formulaire BA — Zod `.strict()`, regex LinkedIn, `ticket_min ≤ ticket_max`, dedup email
4. CORS — pas de `origin: '*'`, méthodes restreintes, allowlist explicite
