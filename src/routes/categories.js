import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';

export const categoriesRouter = express.Router();

/**
 * GET /api/categories
 * Returns system default categories combined with user-specific custom categories.
 */
categoriesRouter.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT id, name, type, icon, color, is_custom, user_id
      FROM categories
      WHERE user_id IS NULL OR user_id = ?
      ORDER BY type, name
    `).all(req.user.id);

    return res.json({ categories });
  } catch (err) {
    console.error('Fetch categories error:', err);
    return res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

/**
 * POST /api/categories
 * Add a custom category for the user
 */
categoriesRouter.post('/', requireAuth, (req, res) => {
  try {
    const { name, type, icon, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const validTypes = ['income', 'need', 'want', 'savings'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}.` });
    }

    const db = getDb();
    const id = `cat_custom_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO categories (id, user_id, name, type, icon, color, is_custom, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(id, req.user.id, name.trim(), type, icon || 'tag', color || '#173F35', now);

    return res.status(201).json({
      message: 'Category created successfully',
      category: {
        id,
        user_id: req.user.id,
        name: name.trim(),
        type,
        icon: icon || 'tag',
        color: color || '#173F35',
        is_custom: 1
      }
    });
  } catch (err) {
    console.error('Create category error:', err);
    return res.status(500).json({ error: 'Failed to create category.' });
  }
});
