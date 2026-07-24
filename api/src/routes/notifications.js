import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

export const router = Router();
router.use(requireAuth);

// GET /api/notifications - Get list of notifications for the authenticated user
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const formatted = rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    data: r.data ? JSON.parse(r.data) : null,
    read: !!r.read,
    createdAt: r.created_at
  }));

  res.json({ data: formatted });
});

// POST /api/notifications/:id/read - Mark a notification as read
router.post('/:id/read', (req, res) => {
  const info = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  res.json({ success: true });
});

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});
