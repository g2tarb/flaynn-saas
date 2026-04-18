# Delta 9 — Flaynn Score Card publique partageable — Progress

Suivi atomique des étapes du plan d'exécution (section 11 du doc d'architecture V2).
Stack réelle : table `scores(reference_id VARCHAR, data JSONB)`, dashboard SPA vanilla,
Fastify 5 ESM. Voir rapport de découverte pour divergences avec le doc.

| # | Étape | Statut | Commit |
|---|-------|--------|--------|
| 1 | DB + slug + route SSR stub `/score/:slug` | ⬜ | — |
| 2 | API `POST/DELETE` publish/unpublish | ⬜ | — |
| 3 | OG image Satori + route `/og/:slug.png` + warm-up boot | ⬜ | — |
| 4 | Meta OG/Twitter/JSON-LD + sitemap dynamique + CSP nonce/hash JSON-LD | ⬜ | — |
| 5 | CSS card publique (`public/css/score-card.css`) + responsive | ⬜ | — |
| 6 | Toggle dashboard (3 états) injecté dans `app.js` (el() helper) | ⬜ | — |
| 7 | Polish copywriting + A11y + tests cross-platform partage | ⬜ | — |

## Décisions prises (validées phase 1)

- **Table des reports** : `scores(reference_id VARCHAR(50), data JSONB)`, pas `reports(id INTEGER)`.
- **FK** : `public_cards.reference_id VARCHAR(50) REFERENCES scores(reference_id) ON DELETE RESTRICT`.
  `public_cards.id SERIAL` conservé pour la FK future de `intro_requests.card_id` (delta 12).
- **Endpoints** : `POST /api/dashboard/:id/publish` + `DELETE /api/dashboard/:id/publish/:cardId`
  (`:id` = `reference_id`, pattern `/api/dashboard/:id/pdf` existant).
- **Verdicts publiables** : `{'Ready', 'Almost', 'Yes', 'Strong Yes'}`. Seul `'Not yet'` refusé.
- **noindex** : `verdict === 'Almost' && score < 70`. `score` = `data->>'score'`, fallback `data->>'overall_score'`.
- **Piliers** : clés EN en DB (`market, solution_product, traction, team, execution_ask`), labels FR à l'affichage.
- **Forces/challenges** : `data.top_3_strengths[]` et `data.top_3_risks[]`. Publish bloqué si < 3.
- **UI dashboard** : injectée dans `public/dashboard/app.js` via `el()` helper, pas dans HTML statique.
- **Starfield** : réutilisation du script existant (`public/js/starfield.js`), `defer` + check CWV post-deploy.
- **Warm-up Satori** : render fantôme 100×100 jeté au boot (loadFonts + render) pour éviter cold path.
- **Sitemap** : route dynamique enregistrée AVANT `fastifyStatic`. Suppression `public/sitemap.xml` en J4.
- **BA CTA** : simple `<a href="https://flaynn.com/rejoindre">`, site statique Vercel séparé. Zéro cross-origin.
- **Migrations** : extension de `initDB()` (pattern delta 12), pas de runner externe.

## TODO / Dette connue

- **FK `intro_requests.card_id → public_cards(id)`** : la table `public_cards` existe dès J1, mais l'ALTER
  d'ajout de la FK est laissé à une étape d'intégration explicite (séparée) pour éviter de modifier un schéma
  delta 12 sans accord. TODO restera jusqu'à décision.
- **CSP + JSON-LD** : `script-src 'self'` bloque les `<script type="application/ld+json">` inline côté navigateur
  (bots SEO non affectés). J1 n'émet pas de JSON-LD. J4 doit trancher : hash SHA-256 par card, nonce, ou accepter
  le warning console (crawlers lisent quand même).
- **OG PNG sur filesystem Render éphémère** : accepté. Lazy re-render dans `GET /og/:slug.png` (J3).
- **Trailing slash canonical** : `/score/:slug/` → 301 `/score/:slug`. Traitement J4.

## Points sensibles à relire ligne par ligne (rappel user)

1. Génération slug — escape + unicité : [flaynn-api/src/lib/slug.js](flaynn-api/src/lib/slug.js)
2. Génération OG Satori : [flaynn-api/src/lib/og-render.js](flaynn-api/src/lib/og-render.js) (J3)
3. Warm-up Satori au boot : [flaynn-api/src/server.js](flaynn-api/src/server.js) (J3)
