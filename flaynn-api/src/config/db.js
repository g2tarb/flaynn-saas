import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Requis pour se connecter à PostgreSQL sur Render en production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function initDB(logger) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(254) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scores (
        reference_id VARCHAR(50) PRIMARY KEY,
        user_email VARCHAR(254) REFERENCES users(email),
        startup_name VARCHAR(100),
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('[ARCHITECT-PRIME] PostgreSQL : Tables "users" et "scores" synchronisées et prêtes.');
  } catch (err) {
    logger.error(err, '[FATAL] Erreur d\'initialisation PostgreSQL.');
    throw err;
  }
}