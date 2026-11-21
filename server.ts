import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './src/server/db.js';
import { apiRouter } from './src/server/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || process.env.API_PORT || '8000', 10);

// CORS support for production domains (e.g., nbe-rsca.duckdns.org)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const configured = process.env.CORS_ORIGINS;
  if (configured) {
    const allowed = configured.split(',').map(s => s.trim());
    if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 1. Initialize persistent SQLite database
initDatabase();

// 2. Mount API Router
app.use('/api', apiRouter);

// Health check endpoint for Docker, Coolify, and monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'nbe-rcsa-platform', timestamp: new Date().toISOString() });
});

// 3. Mount Vite Dev Server or Static Assets
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode');
  } else {
    const staticDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(staticDir, 'index.html'));
    });
    console.log(`[Server] Serving production static assets from ${staticDir}`);
  }

  app.listen(PORT, () => {
    console.log(`[Server] NBE RCSA Platform running at http://0.0.0.0:${PORT}`);
  });

  // Also bind secondary port (3000 or 8000) so Coolify works regardless of port configuration
  const secondaryPort = PORT === 8000 ? 3000 : 8000;
  try {
    const secondary = app.listen(secondaryPort, () => {
      console.log(`[Server] Secondary listener active on port ${secondaryPort}`);
    });
    secondary.on('error', () => {});
  } catch (err) {}
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
