import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config/index.js';
import { getDb, initDb, closeDb } from './database/db.js';
import { setSecurityHeaders } from './middleware/security.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { cleanupExpiredSessions } from './services/sessionStore.js';

import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { transactionsRouter } from './routes/transactions.js';
import { budgetsRouter } from './routes/budgets.js';
import { goalsRouter } from './routes/goals.js';
import { categoriesRouter } from './routes/categories.js';
import { syncRouter } from './routes/sync.js';
import { advisorRouter } from './routes/advisor.js';

export function createApp() {
  const app = express();

  // Initialize SQLite database and default categories
  const db = getDb();
  initDb(db);

  // Security Headers
  app.use(setSecurityHeaders);

  // CORS configuration
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // Body and cookie parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // General API rate limiting
  app.use('/api', apiRateLimiter);

  // Serve static assets from frontend/dist (React+Vite) or fallback public/
  const frontendDist = path.join(config.rootDir, 'frontend', 'dist');
  const publicDir = fs.existsSync(frontendDist)
    ? frontendDist
    : path.join(config.rootDir, 'public');

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Mount API endpoints
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/goals', goalsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/advisor', advisorRouter);

  // SPA fallback: Route non-API GET requests to index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found.' });
    }
    next();
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({ error: 'Internal server error occurred.' });
  });

  return app;
}

export function startServer() {
  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    console.log(`SmartPocket server running at http://${config.host}:${config.port}`);
    console.log(`Environment: ${config.env}`);
    console.log(`Database: SQLite via node:sqlite (${config.dbFile})`);
  });

  // Cleanup expired sessions every hour
  const sessionCleanupInterval = setInterval(() => {
    cleanupExpiredSessions();
  }, 60 * 60 * 1000);

  function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down SmartPocket gracefully...`);
    clearInterval(sessionCleanupInterval);
    server.close(() => {
      closeDb();
      console.log('Database connection closed. Server terminated.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return { server, app };
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}
