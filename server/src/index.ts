import 'dotenv/config';
import { Server } from 'http';
import { PORT } from './config/env';
import { runMigration } from './db/migrate';
import { runSeed } from './db/seed';
import { startListening, closeAllClients } from './services/sseHub';
import { pool } from './db/pool';
import { createApp } from './app';

const app = createApp();
let httpServer: Server | null = null;

async function waitForDatabase(retries = 10, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`Waiting for PostgreSQL (attempt ${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function bootstrap() {
  try {
    await waitForDatabase();
    await runMigration();
    await runSeed();
    await startListening();
    httpServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('Shutting down gracefully...');
  await closeAllClients();
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  }
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

bootstrap();
