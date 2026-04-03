import { buildServer } from './src/server.js';

async function start() {
  try {
    const app = await buildServer();
    const port = process.env.PORT || 3000;
    
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`🚀 API Flaynn démarrée sur le port ${port}`);
  } catch (err) {
    console.error('Erreur fatale au démarrage:', err);
    process.exit(1);
  }
}

start();