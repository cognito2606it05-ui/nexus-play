import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth, resolveProfile);

// GET /api/search/history - Fetch search history for active profile
router.get('/history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, query, created_at 
      FROM search_history 
      WHERE profile_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all(req.profile.id);
    
    res.json({ data: rows });
  } catch (err) {
    console.error('Failed to get search history:', err);
    res.status(500).json({ error: 'Failed to retrieve search history' });
  }
});

// POST /api/search/history - Log a search query
router.post('/history', (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }
  const cleanQuery = query.trim();

  try {
    // Prevent duplicate entries for the exact same query in rapid succession
    db.prepare('DELETE FROM search_history WHERE profile_id = ? AND LOWER(query) = LOWER(?)').run(req.profile.id, cleanQuery);

    const id = randomUUID();
    db.prepare(`
      INSERT INTO search_history (id, profile_id, query, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, req.profile.id, cleanQuery, Date.now());

    res.status(201).json({ id, query: cleanQuery, createdAt: Date.now() });
  } catch (err) {
    console.error('Failed to save search history:', err);
    res.status(500).json({ error: 'Failed to save search query' });
  }
});

// DELETE /api/search/history/:id - Delete a specific search term
router.delete('/history/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM search_history WHERE id = ? AND profile_id = ?').run(req.params.id, req.profile.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Search term not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete search term:', err);
    res.status(500).json({ error: 'Failed to delete search term' });
  }
});

// DELETE /api/search/history - Clear all search history for active profile
router.delete('/history', (req, res) => {
  try {
    db.prepare('DELETE FROM search_history WHERE profile_id = ?').run(req.profile.id);
    res.status(204).end();
  } catch (err) {
    console.error('Failed to clear search history:', err);
    res.status(500).json({ error: 'Failed to clear search history' });
  }
});

// GET /api/search/trending - Aggregate and return top trending searches dynamically
router.get('/trending', (req, res) => {
  try {
    // Get top 5 queries searched in the last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = db.prepare(`
      SELECT query, COUNT(*) AS search_count 
      FROM search_history 
      WHERE created_at > ?
      GROUP BY query 
      ORDER BY search_count DESC 
      LIMIT 5
    `).all(cutoff);

    // Fallback default searches if DB is empty
    const trending = rows.length > 0 
      ? rows.map(r => r.query) 
      : ['Modi Ji currency reserves', 'Spider-Man trailer', 'Quantum computing chipsets', 'Action movies', 'Climate summit'];

    res.json({ data: trending });
  } catch (err) {
    console.error('Failed to get trending searches:', err);
    // Return defaults on error rather than crashing
    res.json({ data: ['Modi Ji currency reserves', 'Spider-Man trailer', 'Quantum computing chipsets', 'Action movies', 'Climate summit'] });
  }
});
