import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { publishAll, notify } from '../events.js';
import { randomUUID } from 'node:crypto';
import { updateMasterBroadcast, stopMasterBroadcast } from '../video-compositor.js';

export const router = Router();
router.use(requireAuth);

function withProfile(handler) {
  return (req, res) => {
    resolveProfile(req, res, () => {
      handler(req, res);
    });
  };
}

// 1. POST /api/studio/keys - Generate a new stream key for a reporter profile
router.post('/keys', requireRole(['super_admin', 'news_reader', 'user', 'reporter']), withProfile(async (req, res) => {
  const profileId = req.profile.id;
  
  // Disable existing active keys for this profile
  db.prepare('UPDATE stream_keys SET is_active = 0 WHERE profile_id = ?').run(profileId);

  // Generate a random key
  const id = randomUUID();
  const streamKey = `nexus_${randomUUID().split('-')[0]}`;
  const now = Date.now();

  try {
    db.prepare(`
      INSERT INTO stream_keys (id, profile_id, stream_key, is_active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(id, profileId, streamKey, now);

    // Ensure they have a record in reporter_streams
    const existing = db.prepare('SELECT id FROM reporter_streams WHERE profile_id = ?').get(profileId);
    if (!existing) {
      db.prepare(`
        INSERT INTO reporter_streams (id, profile_id, stream_key, title, status, viewers, started_at, last_seen)
        VALUES (?, ?, ?, ?, 'offline', 0, NULL, NULL)
      `).run(`stream-${profileId}`, profileId, streamKey, `Live Broadcast from ${req.profile.name}`);
    } else {
      db.prepare('UPDATE reporter_streams SET stream_key = ? WHERE profile_id = ?').run(streamKey, profileId);
    }

    res.status(201).json({ success: true, streamKey });
  } catch (err) {
    console.error('Failed to create stream key:', err);
    res.status(500).json({ error: 'Failed to generate stream key' });
  }
}));

// 2. GET /api/studio/keys - Get current active stream key
router.get('/keys', withProfile((req, res) => {
  const profileId = req.profile.id;
  try {
    const keyRow = db.prepare('SELECT stream_key FROM stream_keys WHERE profile_id = ? AND is_active = 1').get(profileId);
    res.json({ success: true, streamKey: keyRow ? keyRow.stream_key : null });
  } catch (err) {
    console.error('Failed to fetch stream key:', err);
    res.status(500).json({ error: 'Failed to retrieve stream key' });
  }
}));

// 3. POST /api/studio/broadcast/start - Start master composition broadcast (Producers only)
router.post('/broadcast/start', requireRole(['super_admin', 'news_reader']), withProfile(async (req, res) => {
  const broadcastId = randomUUID();
  const now = Date.now();

  try {
    // End any active broadcasts first
    db.prepare("UPDATE studio_broadcasts SET status = 'ended', ended_at = ? WHERE status = 'broadcasting'").run(now);

    db.prepare(`
      INSERT INTO studio_broadcasts (id, layout_mode, promoted_streams, ticker_text, show_logo, breaking_news, status, started_at)
      VALUES (?, 'single', '[]', 'BREAKING NEWS - Nexus Play Live In Studio', 1, 0, 'broadcasting', ?)
    `).run(broadcastId, now);

    // Spawn the composite feed generator in background
    await updateMasterBroadcast(broadcastId);

    // Notify all viewers/profiles about master TV feed activation
    publishAll({
      type: 'master_broadcast_started',
      payload: { id: broadcastId, status: 'broadcasting' }
    });

    res.status(201).json({ success: true, broadcastId });
  } catch (err) {
    console.error('Failed to start master broadcast:', err);
    res.status(500).json({ error: 'Failed to launch master composition feed' });
  }
}));

// 4. POST /api/studio/broadcast/layout - Update Master Composite Layout (Producers only)
router.post('/broadcast/layout', requireRole(['super_admin', 'news_reader']), withProfile(async (req, res) => {
  const { broadcastId, layoutMode, promotedStreams, tickerText, showLogo, breakingNews } = req.body || {};
  if (!broadcastId) {
    return res.status(400).json({ error: 'broadcastId is required' });
  }

  const broadcast = db.prepare('SELECT * FROM studio_broadcasts WHERE id = ?').get(broadcastId);
  if (!broadcast) {
    return res.status(404).json({ error: 'Broadcast session not found' });
  }

  try {
    const updatedLayout = layoutMode ?? broadcast.layout_mode;
    const updatedPromoted = promotedStreams ? JSON.stringify(promotedStreams) : broadcast.promoted_streams;
    const updatedTicker = tickerText ?? broadcast.ticker_text;
    const updatedLogo = showLogo !== undefined ? (showLogo ? 1 : 0) : broadcast.show_logo;
    const updatedBreaking = breakingNews !== undefined ? (breakingNews ? 1 : 0) : broadcast.breaking_news;

    db.prepare(`
      UPDATE studio_broadcasts
      SET layout_mode = ?, promoted_streams = ?, ticker_text = ?, show_logo = ?, breaking_news = ?
      WHERE id = ?
    `).run(updatedLayout, updatedPromoted, updatedTicker, updatedLogo, updatedBreaking, broadcastId);

    // Hot-reload compositor process with the new layout and stream parameters
    await updateMasterBroadcast(broadcastId);

    // Notify dashboard listeners of configuration change
    publishAll({
      type: 'master_broadcast_updated',
      payload: {
        id: broadcastId,
        layoutMode: updatedLayout,
        promotedStreams: JSON.parse(updatedPromoted),
        tickerText: updatedTicker,
        showLogo: !!updatedLogo,
        breakingNews: !!updatedBreaking
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update broadcast configuration:', err);
    res.status(500).json({ error: 'Failed to update master composite layout' });
  }
}));

// 5. POST /api/studio/broadcast/stop - Stop Master Broadcast (Producers only)
router.post('/broadcast/stop', requireRole(['super_admin', 'news_reader']), withProfile(async (req, res) => {
  const { broadcastId } = req.body || {};
  if (!broadcastId) {
    return res.status(400).json({ error: 'broadcastId is required' });
  }

  try {
    await stopMasterBroadcast(broadcastId, req);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to stop master broadcast:', err);
    res.status(500).json({ error: 'Failed to terminate master broadcast session' });
  }
}));

// 6. GET /api/studio/reporters - Fetch list of active/offline reporters
router.get('/reporters', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, p.name AS reporter_name, p.avatar_url AS reporter_avatar
      FROM reporter_streams r
      JOIN profiles p ON r.profile_id = p.id
      ORDER BY r.status DESC, r.started_at DESC
    `).all();

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Failed to fetch reporters:', err);
    res.status(500).json({ error: 'Failed to retrieve reporter list' });
  }
});

// 7. GET /api/studio/broadcast/current - Get details of active broadcast session
router.get('/broadcast/current', (req, res) => {
  try {
    const active = db.prepare("SELECT * FROM studio_broadcasts WHERE status = 'broadcasting' LIMIT 1").get();
    if (!active) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: {
        ...active,
        promoted_streams: JSON.parse(active.promoted_streams || '[]')
      }
    });
  } catch (err) {
    console.error('Failed to fetch active broadcast:', err);
    res.status(500).json({ error: 'Failed to retrieve active broadcast state' });
  }
});

// 8. POST /api/studio/chat - Intercom chat message (Producers & Reporters)
router.post('/chat', withProfile((req, res) => {
  const { message } = req.body || {};
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message content required' });
  }

  const id = randomUUID();
  const role = req.user.role === 'super_admin' || req.user.role === 'news_reader' ? 'producer' : 'reporter';
  const name = req.profile.name || 'Staff';
  const now = Date.now();

  try {
    db.prepare(`
      INSERT INTO studio_reporter_chat (id, profile_id, role, name, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.profile.id, role, name, message, now);

    const chatPacket = { id, profileId: req.profile.id, role, name, message, createdAt: now };

    // Publish to all connected intercoms
    publishAll({
      type: 'studio_reporter_chat',
      payload: chatPacket
    });

    res.status(201).json({ success: true, data: chatPacket });
  } catch (err) {
    console.error('Failed to send coordinate message:', err);
    res.status(500).json({ error: 'Failed to send intercom message' });
  }
}));

// 9. GET /api/studio/chat - Fetch intercom chat logs
router.get('/chat', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM studio_reporter_chat 
      ORDER BY created_at ASC 
      LIMIT 100
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Failed to load intercom logs:', err);
    res.status(500).json({ error: 'Failed to fetch coordinate intercom logs' });
  }
});
