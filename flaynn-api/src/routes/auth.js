import { z } from 'zod';
import argon2 from 'argon2';
import { pool } from '../config/db.js';

// Schémas Zod stricts
const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(100)
}).strict();

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(100)
}).strict();

export default async function authRoutes(fastify) {
  // Route de connexion
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: { max: 5, timeWindow: '15 minutes' }
    }
  }, async (request, reply) => {
    try {
      const parsed = LoginSchema.parse(request.body);
      
      // 1. On cherche l'utilisateur dans la base de données
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [parsed.email]);
      if (rows.length === 0) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Email ou mot de passe incorrect.' });
      }
      const user = rows[0];

      // 2. On vérifie la signature cryptographique du mot de passe
      const isPasswordValid = await argon2.verify(user.password_hash, parsed.password);
      if (!isPasswordValid) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Email ou mot de passe incorrect.' });
      }

      // 3. Génération du JWT sécurisé
      const token = fastify.jwt.sign(
        { email: user.email, name: user.name },
        { expiresIn: '7d' } // Valide 7 jours
      );

      return reply.code(200).send({
        success: true,
        token,
        user: { name: user.name, email: user.email }
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', message: 'Email ou mot de passe invalide.' });
      }
      request.log.error(err);
      return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' });
    }
  });

  // Route d'inscription
  fastify.post('/api/auth/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '15 minutes' }
    }
  }, async (request, reply) => {
    try {
      const parsed = RegisterSchema.parse(request.body);
      
      // 1. On vérifie l'existence de l'email dans la base de données
      const { rowCount } = await pool.query('SELECT id FROM users WHERE email = $1', [parsed.email]);
      if (rowCount > 0) {
        return reply.code(409).send({ error: 'CONFLICT', message: 'Cet email est déjà utilisé.' });
      }

      // 2. On hache le mot de passe avec Argon2 (salage inclus automatiquement)
      const passwordHash = await argon2.hash(parsed.password);
      
      // 3. Sauvegarde dans PostgreSQL
      await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
        [parsed.name, parsed.email, passwordHash]
      );

      // 4. Génération du JWT sécurisé pour connexion immédiate
      const token = fastify.jwt.sign(
        { email: parsed.email, name: parsed.name },
        { expiresIn: '7d' }
      );

      return reply.code(200).send({
        success: true,
        token,
        user: { name: parsed.name, email: parsed.email }
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(422).send({ error: 'VALIDATION_FAILED', message: 'Veuillez vérifier les champs.' });
      }
      request.log.error(err);
      return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' });
    }
  });
}