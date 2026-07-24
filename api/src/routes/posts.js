import { Router } from '../server.js';
import { db } from '../db.js';
import { mediaUrl, PROJECT_ROOT } from '../config.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { moderateUploadContent } from '../moderation.js';

export const router = Router();
router.use(requireAuth, resolveProfile);

function serialize(req, row, profileId) {
  const liked = !!db
    .prepare('SELECT 1 FROM post_likes WHERE profile_id = ? AND post_id = ?')
    .get(profileId, row.id);

  let regions = [];
  try {
    if (row.blur_regions) {
      regions = JSON.parse(row.blur_regions);
    }
  } catch (e) {}

  return {
    id: row.id,
    content: row.content,
    location: row.location || null,
    imageUrl: row.image_url || null,
    likes: row.likes,
    comments: row.comments,
    createdAt: row.created_at,
    profile: {
      id: row.profile_id,
      name: row.profile_name,
      avatarUrl: row.avatar_url || null,
      color: row.color || '#fff',
    },
    liked,
    needsBlur: row.needs_blur === 1,
    blurReason: row.blur_reason || null,
    blurRegions: regions,
    ocrText: row.ocr_text || null,
    translatedText: row.translated_text || null,
    neutralizedText: row.neutralized_text || null,
  };
}

// GET /api/posts
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*, prof.name AS profile_name, prof.avatar_url, prof.color
      FROM posts p
      JOIN profiles prof ON prof.id = p.profile_id
      ORDER BY p.created_at DESC
    `).all();

    res.json({
      data: rows.map((r) => serialize(req, r, req.profile.id)),
    });
  } catch (err) {
    console.error('Failed to get posts:', err);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// POST /api/posts - Create a new post
router.post('/', async (req, res) => {
  const { content, location, imageData, targetLang, imageName } = req.body || {};
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  // Run AI Content Moderation & Sensitive Content Check
  const aiResult = await moderateUploadContent('', content, imageData || null, targetLang, imageName || null);
  const continueAnyway = req.body.continueAnyway === true;
  if (aiResult) {
    if ((!aiResult.isApproved || aiResult.needsBlur) && !continueAnyway) {
      return res.status(400).json({ error: `Post blocked by AI moderation: ${aiResult.blurReason || aiResult.rejectReason || 'Sensitive content detected.'}` });
    }
  }

  try {
    const postId = randomUUID();
    let imageUrl = null;

    if (imageData) {
      const filename = `post-image-${postId}.png`;
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      const buffer = Buffer.from(imageData, 'base64');
      writeFileSync(filepath, buffer);
      imageUrl = mediaUrl(req, 'uploads', filename);
    }

    const now = new Date().toISOString();
    const finalNeedsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
    const finalBlurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
    const finalBlurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
    const finalOcrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
    const finalTranslatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
    const finalNeutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

    db.prepare(`
      INSERT INTO posts (id, profile_id, content, location, image_url, likes, comments, created_at, needs_blur, blur_reason, blur_regions, ocr_text, translated_text, neutralized_text)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      postId,
      req.profile.id,
      finalNeutralizedText || content,
      location || null,
      imageUrl,
      now,
      finalNeedsBlur,
      finalBlurReason,
      finalBlurRegions,
      finalOcrText,
      finalTranslatedText,
      finalNeutralizedText
    );

    const newPost = db.prepare(`
      SELECT p.*, prof.name AS profile_name, prof.avatar_url, prof.color
      FROM posts p
      JOIN profiles prof ON prof.id = p.profile_id
      WHERE p.id = ?
    `).get(postId);

    res.status(201).json(serialize(req, newPost, req.profile.id));
  } catch (err) {
    console.error('Failed to create post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// DELETE /api/posts/:id - Delete user post
router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Deletion rules: Creator or Super Admin can delete
  const isCreator = post.profile_id === req.profile.id;
  const isAdmin = req.user.role === 'super_admin';
  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: 'You are not authorized to delete this post' });
  }

  // Delete attached image file if present
  if (post.image_url && post.image_url.includes('/uploads/')) {
    try {
      const filename = post.image_url.split('/uploads/').pop();
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      unlinkSync(filepath);
    } catch (e) {
      // Ignore
    }
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/posts/:id/like - Like or unlike a post
router.post('/:id/like', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  try {
    const already = db
      .prepare('SELECT 1 FROM post_likes WHERE profile_id = ? AND post_id = ?')
      .get(req.profile.id, post.id);

    if (already) {
      db.prepare('DELETE FROM post_likes WHERE profile_id = ? AND post_id = ?').run(req.profile.id, post.id);
      db.prepare('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(post.id);
    } else {
      db.prepare('INSERT INTO post_likes (profile_id, post_id) VALUES (?, ?)').run(req.profile.id, post.id);
      db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(post.id);
    }

    const likes = db.prepare('SELECT likes FROM posts WHERE id = ?').get(post.id).likes;
    res.json({ liked: !already, likes });
  } catch (err) {
    console.error('Failed to like post:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});
