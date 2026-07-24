import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';

export const router = Router();
router.use(requireAuth, resolveProfile);

// Toggle follow for the active profile.
router.post('/:id/follow', (req, res) => {
  let creator = db.prepare('SELECT id FROM creators WHERE id = ?').get(req.params.id);
  if (!creator) {
    // Check if the id belongs to a profile!
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id);
    if (profile) {
      // Create a matching creator record dynamically!
      db.prepare(`
        INSERT INTO creators (id, name, handle, avatar_file)
        VALUES (?, ?, ?, ?)
      `).run(profile.id, profile.name, `@${profile.name.toLowerCase().replace(/\s+/g, '')}`, profile.avatar_url || null);
      creator = { id: profile.id };
    } else {
      return res.status(404).json({ error: 'Creator or profile not found' });
    }
  }

  const already = db
    .prepare('SELECT 1 FROM follows WHERE profile_id = ? AND creator_id = ?')
    .get(req.profile.id, creator.id);

  if (already) {
    db.prepare('DELETE FROM follows WHERE profile_id = ? AND creator_id = ?').run(req.profile.id, creator.id);
  } else {
    db.prepare('INSERT INTO follows (profile_id, creator_id) VALUES (?, ?)').run(req.profile.id, creator.id);
  }
  res.json({ isFollowing: !already });
});
