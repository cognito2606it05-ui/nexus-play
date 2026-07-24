import { Router } from '../server.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { absUrl } from '../config.js';
import { requireAuth } from '../auth.js';

export const router = Router();
router.use(requireAuth);

const MAX_PROFILES = 4;

function serialize(req, p) {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatar_url ? absUrl(req, p.avatar_url) : null,
    color: p.color,
    isKids: !!p.is_kids,
    subscribed: !!p.subscribed,
    bio: p.bio || '',
    website: p.website || '',
    location: p.location || '',
    joinDate: p.join_date || 'Joined July 2026',
  };
}

router.get('/avatar-options', (req, res) => {
  const makeAbs = (path) => absUrl(req, path);
  res.json({
    categories: {
      Male: [
        { name: 'Male Avatar 1', path: makeAbs('/media/avatars/male_1.png') },
        { name: 'Male Avatar 2', path: makeAbs('/media/avatars/male_2.png') },
        { name: 'Male Avatar 3', path: makeAbs('/media/avatars/male_3.png') }
      ],
      Female: [
        { name: 'Female Avatar 1', path: makeAbs('/media/avatars/female_1.png') },
        { name: 'Female Avatar 2', path: makeAbs('/media/avatars/female_2.png') },
        { name: 'Female Avatar 3', path: makeAbs('/media/avatars/female_3.png') }
      ],
      Professional: [
        { name: 'Professional 1', path: makeAbs('/media/avatars/professional_1.png') },
        { name: 'Professional 2', path: makeAbs('/media/avatars/professional_2.png') },
        { name: 'Professional 3', path: makeAbs('/media/avatars/professional_3.png') }
      ],
      'News Reader': [
        { name: 'News Reader 1', path: makeAbs('/media/avatars/newsreader_1.png') },
        { name: 'News Reader 2', path: makeAbs('/media/avatars/newsreader_2.png') },
        { name: 'News Reader 3', path: makeAbs('/media/avatars/newsreader_3.png') }
      ],
      'Modern/Animated Characters': [
        { name: 'Animated 1', path: makeAbs('/media/avatars/animated_1.png') },
        { name: 'Animated 2', path: makeAbs('/media/avatars/animated_2.png') },
        { name: 'Animated 3', path: makeAbs('/media/avatars/animated_3.png') }
      ]
    }
  });
});

router.get('/all', (req, res) => {
  const rows = db.prepare('SELECT * FROM profiles ORDER BY name').all();
  res.json({ profiles: rows.map((p) => serialize(req, p)) });
});

router.get('/:id/activity', (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Profile not found' });

  // Comments
  const comments = db.prepare(`
    SELECT c.*, 
           COALESCE(r.title, p.content, n.title) AS content_title,
           CASE 
             WHEN r.id IS NOT NULL THEN 'reel'
             WHEN p.id IS NOT NULL THEN 'post'
             WHEN n.id IS NOT NULL THEN 'news'
             ELSE 'unknown'
           END AS content_type
    FROM comments c
    LEFT JOIN reels r ON c.reel_id = r.id
    LEFT JOIN posts p ON c.reel_id = p.id
    LEFT JOIN news n ON c.reel_id = n.id
    WHERE c.profile_id = ?
    ORDER BY c.created_at DESC LIMIT 20
  `).all(p.id);

  // Followed Creators
  const follows = db.prepare(`
    SELECT c.id, c.name, c.handle, c.avatar_file
    FROM follows f
    JOIN creators c ON f.creator_id = c.id
    WHERE f.profile_id = ?
  `).all(p.id);

  // Liked Reels
  const likedReels = db.prepare(`
    SELECT r.id, r.title, r.video_file
    FROM reel_likes rl
    JOIN reels r ON rl.reel_id = r.id
    WHERE rl.profile_id = ?
  `).all(p.id);

  // Liked Posts
  const likedPosts = db.prepare(`
    SELECT p.id, p.content, p.image_url
    FROM post_likes pl
    JOIN posts p ON pl.post_id = p.id
    WHERE pl.profile_id = ?
  `).all(p.id);

  // Watchlist (movies/shows watched)
  const watchlist = db.prepare(`
    SELECT w.*
    FROM watchlist w
    WHERE w.profile_id = ? AND w.deleted = 0
    ORDER BY w.last_modified DESC
  `).all(p.id);

  res.json({
    comments,
    follows,
    likedReels,
    likedPosts,
    watchlist
  });
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at')
    .all(req.user.id);
  res.json({ profiles: rows.map((p) => serialize(req, p)), max: MAX_PROFILES });
});

router.post('/', (req, res) => {
  const { name, color, isKids, avatarUrl, bio, website, location } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(req.user.id).n;
  if (count >= MAX_PROFILES) {
    return res.status(409).json({ error: `A maximum of ${MAX_PROFILES} profiles is allowed` });
  }

  let savedAvatarUrl = avatarUrl || null;
  if (savedAvatarUrl && savedAvatarUrl.includes('/media/avatars/')) {
    savedAvatarUrl = '/media/avatars/' + savedAvatarUrl.split('/media/avatars/')[1];
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, bio, website, location, join_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user.id,
    name,
    savedAvatarUrl,
    color || '#888',
    isKids ? 1 : 0,
    bio || '',
    website || '',
    location || '',
    'Joined ' + new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    new Date().toISOString()
  );

  const p = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  res.status(201).json(serialize(req, p));
});

router.patch('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Profile not found' });

  const { name, color, isKids, avatarUrl, bio, website, location, joinDate } = req.body || {};
  
  let savedAvatarUrl = avatarUrl === undefined ? p.avatar_url : avatarUrl;
  if (savedAvatarUrl && savedAvatarUrl.includes('/media/avatars/')) {
    savedAvatarUrl = '/media/avatars/' + savedAvatarUrl.split('/media/avatars/')[1];
  }

  db.prepare(
    'UPDATE profiles SET name = ?, color = ?, is_kids = ?, avatar_url = ?, bio = ?, website = ?, location = ?, join_date = ? WHERE id = ?'
  ).run(
    name ?? p.name,
    color ?? p.color,
    isKids === undefined ? p.is_kids : isKids ? 1 : 0,
    savedAvatarUrl,
    bio === undefined ? p.bio : bio,
    website === undefined ? p.website : website,
    location === undefined ? p.location : location,
    joinDate === undefined ? p.join_date : joinDate,
    p.id
  );
  res.json(serialize(req, db.prepare('SELECT * FROM profiles WHERE id = ?').get(p.id)));
});

router.delete('/:id', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(req.user.id).n;
  if (count <= 1) return res.status(409).json({ error: 'You must keep at least one profile' });
  const info = db.prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Profile not found' });
  res.status(204).end();
});

router.post('/:id/subscribe', (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Profile not found' });
  db.prepare('UPDATE profiles SET subscribed = 1 WHERE id = ?').run(p.id);
  res.json({ success: true, subscribed: true });
});
