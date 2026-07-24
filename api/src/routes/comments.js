import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth);

// Wrapper for routes requiring a profile
function withProfile(handler) {
  return (req, res) => {
    resolveProfile(req, res, () => {
      handler(req, res);
    });
  };
}

// GET /api/comments?reelId=...
router.get('/', (req, res) => {
  const { reelId } = req.query;
  if (!reelId) {
    return res.status(400).json({ error: 'reelId is required' });
  }

  const rows = db.prepare('SELECT * FROM comments WHERE reel_id = ? ORDER BY created_at DESC').all(reelId);
  const formatted = rows.map(r => ({
    id: r.id,
    reelId: r.reel_id,
    profileId: r.profile_id,
    name: r.name,
    avatar: r.avatar,
    body: r.body,
    likes: r.likes,
    createdAt: r.created_at
  }));

  res.json({ data: formatted });
});

async function moderateCommentWithGemini(commentBody) {
  const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  const prompt = `You are a content moderator for NEXUS Play, a news and video platform. Evaluate the following user comment:
"${commentBody}"

Determine if it contains spam, extreme toxicity, hate speech, severe harassment, or highly explicit content.
Return a raw JSON object matching this structure exactly (no markdown formatting, no backticks, no other text):
{
  "isApproved": true,
  "reason": "short reason if rejected"
}
If the comment is appropriate, set "isApproved" to true. Otherwise, set it to false and specify the reason.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      console.error('Gemini Moderation API returned status', res.status);
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    }
  } catch (err) {
    console.error('Failed to run Gemini comment moderation:', err);
  }
  return null;
}

// POST /api/comments?reelId=...
router.post('/', withProfile(async (req, res) => {
  const { reelId } = req.query;
  const { body } = req.body || {};

  if (!reelId) {
    return res.status(400).json({ error: 'reelId query parameter is required' });
  }
  if (!body) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelId);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(reelId);
  const news = db.prepare('SELECT * FROM news WHERE id = ?').get(reelId);
  if (!reel && !post && !news) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  // Moderate comment with Gemini
  const moderation = await moderateCommentWithGemini(body);
  if (moderation && !moderation.isApproved) {
    return res.status(400).json({ error: `Comment blocked by moderator: ${moderation.reason}` });
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO comments (id, reel_id, profile_id, name, avatar, body, likes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, reelId, req.profile.id, req.profile.name, req.profile.avatarUrl || null, body, now);

  // Increment comments count on the appropriate content type
  if (post) {
    db.prepare('UPDATE posts SET comments = comments + 1 WHERE id = ?').run(reelId);
  } else if (reel) {
    db.prepare('UPDATE reels SET comments = comments + 1 WHERE id = ?').run(reelId);
  }

  const comment = {
    id,
    reelId,
    profileId: req.profile.id,
    name: req.profile.name,
    avatar: req.profile.avatarUrl || null,
    body,
    likes: 0,
    createdAt: now
  };

  res.status(201).json(comment);
}));
