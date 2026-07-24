import { Router } from '../server.js';
import { db } from '../db.js';
import { mediaUrl, PROJECT_ROOT } from '../config.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth, resolveProfile);

// GET /api/stories - Get active stories (younger than 24 hours) grouped by profile
router.get('/', (req, res) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const rows = db.prepare(`
      SELECT s.*, p.name AS profile_name, p.avatar_url, p.color
      FROM stories s
      JOIN profiles p ON s.profile_id = p.id
      WHERE s.created_at > ?
      ORDER BY s.created_at DESC
    `).all(cutoff);

    // Group stories by profile
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.profile_id]) {
        grouped[r.profile_id] = {
          profileId: r.profile_id,
          name: r.profile_name,
          avatarUrl: r.avatar_url ? r.avatar_url : null,
          color: r.color || '#fff',
          stories: []
        };
      }
      let reactions = {};
      try {
        if (r.reactions) reactions = JSON.parse(r.reactions);
      } catch (e) {}

      grouped[r.profile_id].stories.push({
        id: r.id,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        content: r.content || null,
        expiresAt: r.expires_at,
        views: r.views,
        reactions,
        createdAt: r.created_at
      });
    }

    res.json({ data: Object.values(grouped) });
  } catch (err) {
    console.error('Failed to get stories:', err);
    res.status(500).json({ error: 'Failed to retrieve stories' });
  }
});

// POST /api/stories - Publish a new story (Temporary 24h photo/video)
router.post('/', (req, res) => {
  const { mediaData, mediaType, content } = req.body || {};
  if (!mediaData || !mediaType) {
    return res.status(400).json({ error: 'mediaData and mediaType are required' });
  }

  const id = randomUUID();
  try {
    const isVideo = mediaType === 'video';
    const ext = isVideo ? 'mp4' : 'png';
    const filename = `story-media-${id}.${ext}`;
    const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
    const commaIndex = mediaData.indexOf(',');
    const base64Content = commaIndex !== -1 ? mediaData.slice(commaIndex + 1) : mediaData;
    const buffer = Buffer.from(base64Content, 'base64');
    
    writeFileSync(filepath, buffer);
    const mediaUrlPath = mediaUrl(req, 'uploads', filename);

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours expiry

    db.prepare(`
      INSERT INTO stories (id, profile_id, media_url, media_type, content, expires_at, views, reactions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?)
    `).run(id, req.profile.id, mediaUrlPath, mediaType, content || '', expiresAt, now);

    res.status(201).json({
      id,
      profileId: req.profile.id,
      mediaUrl: mediaUrlPath,
      mediaType,
      content: content || null,
      expiresAt,
      views: 0,
      reactions: {},
      createdAt: now
    });
  } catch (err) {
    console.error('Failed to publish story:', err);
    res.status(500).json({ error: 'Failed to publish story' });
  }
});

// POST /api/stories/:id/view - Log a view on a story
router.post('/:id/view', (req, res) => {
  try {
    db.prepare('UPDATE stories SET views = views + 1 WHERE id = ?').run(req.params.id);
    const updated = db.prepare('SELECT views FROM stories WHERE id = ?').get(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Story not found' });
    res.json({ views: updated.views });
  } catch (err) {
    console.error('Failed to log story view:', err);
    res.status(500).json({ error: 'Failed to update story views' });
  }
});

// POST /api/stories/:id/react - React to a story
router.post('/:id/react', (req, res) => {
  const { reaction } = req.body || {}; // e.g. '❤️', '🔥', '😮'
  if (!reaction) {
    return res.status(400).json({ error: 'Reaction is required' });
  }

  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });

  try {
    let reactions = {};
    try {
      if (story.reactions) reactions = JSON.parse(story.reactions);
    } catch (e) {}

    reactions[reaction] = (reactions[reaction] || 0) + 1;
    const serializedReactions = JSON.stringify(reactions);

    db.prepare('UPDATE stories SET reactions = ? WHERE id = ?').run(serializedReactions, story.id);
    res.json({ reactions });
  } catch (err) {
    console.error('Failed to react to story:', err);
    res.status(500).json({ error: 'Failed to react to story' });
  }
});

// DELETE /api/stories/:id - Delete a story
router.delete('/:id', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });

  if (story.profile_id !== req.profile.id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Unauthorized to delete this story' });
  }

  try {
    if (story.media_url && story.media_url.includes('/uploads/')) {
      try {
        const filename = story.media_url.split('/uploads/').pop();
        const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
        unlinkSync(filepath);
      } catch (e) {}
    }
    db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete story:', err);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});
