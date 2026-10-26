import express from 'express';
import { getDb } from '../database/db.js';

export const healthRouter = express.Router();

healthRouter.get('/', (req, res) => {
  try {
    const db = getDb();
    const test = db.prepare('SELECT 1 as alive').get();
    return res.json({
      status: 'healthy',
      database: test.alive === 1 ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (err) {
    return res.status(500).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});
