import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth, resolveProfile);

// POST /api/analytics/event - Log a user activity/engagement event
router.post('/event', (req, res) => {
  const { eventType, targetId, metadata } = req.body || {};
  if (!eventType) {
    return res.status(400).json({ error: 'eventType is required' });
  }

  const profileId = req.profile?.id;
  if (!profileId) {
    return res.status(400).json({ error: 'Profile is required to log events' });
  }

  try {
    const id = randomUUID();
    const serializedMeta = metadata ? JSON.stringify(metadata) : '{}';

    db.prepare(`
      INSERT INTO analytics_events (id, profile_id, event_type, target_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, profileId, eventType, targetId || null, serializedMeta, Date.now());

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Failed to log analytics event:', err);
    res.status(500).json({ error: 'Failed to record event' });
  }
});
