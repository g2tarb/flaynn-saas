import { z } from 'zod';

export const ScoreSubmissionSchema = z.object({
  previous_ref: z.string().trim().max(50).optional(),
  nom_fondateur: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  pays: z.string().trim().min(2).max(100),
  ville: z.string().trim().min(2).max(100),
  nom_startup: z.string().trim().min(2).max(100).regex(/^[\p{L}\p{N}\s\-'.&]+$/u),
  pitch_une_phrase: z.string().trim().min(5).max(300),
  probleme: z.string().trim().min(10).max(2000),
  solution: z.string().trim().min(10).max(2000),
  secteur: z.enum([
    'fintech', 'healthtech', 'saas', 'marketplace', 'deeptech',
    'greentech', 'edtech', 'proptech', 'legaltech', 'foodtech', 'other'
  ]),
  type_client: z.enum(['b2b', 'b2c', 'b2b2c', 'b2g', 'other']),
  tam_usd: z.enum(['<1M', '1M-10M', '10M-100M', '100M-1B', '>1B']),
  estimation_tam: z.string().trim().min(5).max(500),
  acquisition_clients: z.string().trim().min(10).max(2000),
  concurrents: z.string().trim().min(10).max(2000),
  stade: z.enum(['idea', 'mvp', 'seed', 'serieA', 'serieB_plus']),
  revenus: z.enum(['oui', 'non']),
  mrr: z.number().nonnegative().max(100_000_000).optional(),
  clients_payants: z.number().int().nonnegative().max(1_000_000).optional(),
  pourquoi_vous: z.string().trim().min(10).max(2000),
  equipe_temps_plein: z.enum(['oui', 'non']),
  priorite_6_mois: z.enum([
    'produit', 'croissance', 'recrutement', 'levee', 'rentabilite', 'international', 'other'
  ]),
  montant_leve: z.string().trim().min(1).max(100),
  jalons_18_mois: z.string().trim().min(10).max(2000),
  utilisation_fonds: z.string().trim().min(10).max(2000),
  vision_5_ans: z.string().trim().min(10).max(2000),
  pitch_deck_base64: z.string().max(15_000_000).optional(),
  pitch_deck_filename: z.string().max(200).optional(),
  doc_supplementaire_url: z.string().url().max(500).optional(),
}).strip();
