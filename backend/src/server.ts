import { app } from './app.js';
import { prisma } from './prisma.js';
import { ensureDefaultAdmin } from './admin-bootstrap.js';
import "dotenv/config";

const port = Number(process.env.API_PORT ?? 4000);

async function startServer() {
  const adminState = await ensureDefaultAdmin();
  if (adminState.reason && adminState.reason !== 'The default administrator already exists.') {
    console.log(`[Admin bootstrap] ${adminState.reason}`);
  }

  const server = app.listen(port, '0.0.0.0', () => console.log(`Church CMS API listening on http://localhost:${port}`));

  async function shutdown() {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('[Server startup] Failed to start the backend:', error);
  process.exit(1);
});
