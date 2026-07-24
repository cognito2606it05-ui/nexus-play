import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth, resolveProfile);

// POST /api/moderation/report - Report/Flag sensitive content (news, reel, post, comment)
router.post('/report', (req, res) => {
  const { contentType, contentId, reason, aiScore } = req.body || {};
  if (!contentType || !contentId) {
    return res.status(400).json({ error: 'contentType and contentId are required' });
  }

  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO moderation_reports (id, profile_id, content_type, content_id, reason, ai_score, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, req.profile.id, contentType, contentId, reason || null, aiScore || null, Date.now());

    res.status(201).json({ id, contentType, contentId, status: 'pending' });
  } catch (err) {
    console.error('Failed to submit moderation report:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// GET /api/moderation/reports - Get all pending reports (Admin only)
router.get('/reports', requireRole(['super_admin']), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, p.name AS reporter_name
      FROM moderation_reports r
      LEFT JOIN profiles p ON r.profile_id = p.id
      ORDER BY r.created_at DESC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('Failed to get moderation reports:', err);
    res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

// PATCH /api/moderation/reports/:id - Update status of a report (Admin only)
router.patch('/reports/:id', requireRole(['super_admin']), (req, res) => {
  const report = db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const { status } = req.body || {}; // 'pending', 'resolved', 'ignored'
  if (!status) return res.status(400).json({ error: 'status is required' });

  try {
    db.prepare('UPDATE moderation_reports SET status = ? WHERE id = ?').run(status, report.id);
    res.json({ id: report.id, status });
  } catch (err) {
    console.error('Failed to update report:', err);
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

// DELETE /api/moderation/reports/:id - Delete a report entry (Admin only)
router.delete('/reports/:id', requireRole(['super_admin']), (req, res) => {
  try {
    const info = db.prepare('DELETE FROM moderation_reports WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Report not found' });
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete report:', err);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});
