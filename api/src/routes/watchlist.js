import { Router } from '../server.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { absUrl } from '../config.js';

export const router = Router();
router.use(requireAuth, resolveProfile);

function serialize(req, w) {
  let thumb = w.thumbnail_url;
  if (thumb && (thumb.startsWith('/media/') || thumb.startsWith('/uploads/'))) {
    thumb = absUrl(req, thumb);
  }
  return {
    id: w.id,
    contentType: w.content_type,
    contentId: w.content_id,
    title: w.title,
    thumbnailUrl: thumb,
    category: w.category,
    progressSec: w.progress_sec,
    lastModified: w.last_modified,
    deleted: !!w.deleted,
  };
}

// Upsert a single item, keyed by (profile, contentType, contentId), LWW on last_modified.
function upsert(profileId, item) {
  const lastModified = item.lastModified || Date.now();
  db.prepare(`
    INSERT INTO watchlist (id, profile_id, content_type, content_id, title, thumbnail_url, category, progress_sec, last_modified, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (profile_id, content_type, content_id) DO UPDATE SET
      title         = excluded.title,
      thumbnail_url = excluded.thumbnail_url,
      category      = excluded.category,
      progress_sec  = excluded.progress_sec,
      last_modified = excluded.last_modified,
      deleted       = excluded.deleted
    WHERE excluded.last_modified > watchlist.last_modified
  `).run(
    randomUUID(),
    profileId,
    item.contentType,
    item.contentId,
    item.title ?? null,
    item.thumbnailUrl ?? null,
    item.category || 'later',
    item.progressSec || 0,
    lastModified,
    item.deleted ? 1 : 0
  );
}

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM watchlist WHERE profile_id = ? AND deleted = 0 ORDER BY last_modified DESC')
    .all(req.profile.id);
  res.json({ data: rows.map((w) => serialize(req, w)), serverTime: Date.now() });
});

router.post('/', (req, res) => {
  const item = req.body || {};
  if (!item.contentType || !item.contentId) {
    return res.status(400).json({ error: 'contentType and contentId are required' });
  }
  item.lastModified = Date.now();
  upsert(req.profile.id, item);
  const row = db
    .prepare('SELECT * FROM watchlist WHERE profile_id = ? AND content_type = ? AND content_id = ?')
    .get(req.profile.id, item.contentType, item.contentId);
  res.status(201).json(serialize(req, row));
});

router.delete('/:contentType/:contentId', (req, res) => {
  upsert(req.profile.id, {
    contentType: req.params.contentType,
    contentId: req.params.contentId,
    deleted: true,
    lastModified: Date.now(),
  });
  res.status(204).end();
});

// Incremental cross-device sync.
// Body: { since?: number, changes?: WatchlistItem[] }
// Returns server-side changes after `since`, plus current server time.
router.post('/sync', (req, res) => {
  const { since = 0, changes = [] } = req.body || {};
  for (const item of changes) {
    if (item && item.contentType && item.contentId) upsert(req.profile.id, item);
  }
  const serverChanges = db
    .prepare('SELECT * FROM watchlist WHERE profile_id = ? AND last_modified > ? ORDER BY last_modified')
    .all(req.profile.id, Number(since) || 0)
    .map((w) => serialize(req, w));

  res.json({ changes: serverChanges, serverTime: Date.now() });
});
