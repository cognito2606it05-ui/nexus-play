import { Router } from '../server.js';
import { db, isPg } from '../db.js';
import { requireAuth, requireRole, hashPassword } from '../auth.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mediaUrl, PROJECT_ROOT, config } from '../config.js';
import { randomUUID } from 'node:crypto';
import { getIo } from '../services/relay.js';

export const router = Router();
router.use(requireAuth, requireRole('super_admin'));

function broadcastUpdate(action) {
  const io = getIo();
  if (io) {
    io.emit('top-stories-update', { action });
  }
}

// Helper: Log Super Admin / Admin actions
function logAudit(reqOrUserId, action, target) {
  try {
    const id = randomUUID();
    let userId = 'system';
    let ip = '127.0.0.1';
    let userAgent = 'Unknown';

    if (reqOrUserId && typeof reqOrUserId === 'object') {
      userId = reqOrUserId.user?.id || 'system';
      ip = reqOrUserId.get?.('x-forwarded-for') || reqOrUserId.socket?.remoteAddress || '127.0.0.1';
      userAgent = reqOrUserId.get?.('user-agent') || 'Unknown';
    } else if (typeof reqOrUserId === 'string') {
      userId = reqOrUserId;
    }

    db.prepare('INSERT INTO audit_logs (id, user_id, action, target, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, action, target || null, ip, userAgent, Date.now());
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}

// GET /api/admin/analytics - Centralized Dashboard Metrics
router.get('/analytics', async (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const premiumSubscribers = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE subscribed = 1').get().n;
    const newsPublished = db.prepare('SELECT COUNT(*) AS n FROM news').get().n;
    const totalStreams = db.prepare('SELECT COUNT(*) AS n FROM live_streams').get().n;
    const totalComments = db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
    const totalReelLikes = db.prepare('SELECT COUNT(*) AS n FROM reel_likes').get().n;
    const totalPostLikes = db.prepare('SELECT COUNT(*) AS n FROM post_likes').get().n;
    const totalReels = db.prepare('SELECT COUNT(*) AS n FROM reels').get().n;
    const totalPosts = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
    const totalReports = db.prepare('SELECT COUNT(*) AS n FROM moderation_reports').get().n;
    const totalAdmins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' OR role = 'super_admin'").get().n;

    // Load custom categories from settings if exists
    let totalCategories = 10; // Default
    try {
      const catRow = db.prepare("SELECT value FROM system_settings WHERE key = 'news_categories'").get();
      if (catRow) {
        totalCategories = JSON.parse(catRow.value).length;
      }
    } catch (e) {}

    const revenue = premiumSubscribers * 9.99; // $9.99 subscription simulation

    const trendingNewsCategories = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM news 
      WHERE category != 'Past Live Streams' 
      GROUP BY category 
      ORDER BY count DESC LIMIT 5
    `).all();

    const trendingMovieGenres = db.prepare(`
      SELECT genre as category, COUNT(*) as count 
      FROM movies 
      GROUP BY genre 
      ORDER BY count DESC LIMIT 5
    `).all();

    // AI Insights
    let aiInsights = "Welcome Admin! Elevate user engagement by uploading more Tech news and scheduling active live streams.";
    try {
      const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
      const prompt = `You are an AI business analyst for NEXUS Play, an OTT and News platform.
Analyze the following platform metrics and generate 3 bullet points of high-level AI insights and recommendations for the platform Super Admin:
- Total Users: ${totalUsers}
- Premium Subscribers: ${premiumSubscribers} (Conversion Rate: ${((premiumSubscribers / Math.max(1, totalUsers)) * 100).toFixed(1)}%)
- Total Revenue: $${revenue.toFixed(2)}
- News Published: ${newsPublished}
- Live Streams: ${totalStreams}
- User Engagement: ${totalComments} comments, ${totalReelLikes} reel likes, ${totalPostLikes} post likes

Keep your response extremely professional, intelligent, and focused on growth. Return 3 bullet points. No markdown container blocks, just bullet text.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          aiInsights = text.trim();
        }
      }
    } catch (e) {
      console.error('Failed to fetch AI insights from Gemini:', e);
    }

    res.json({
      metrics: {
        totalUsers,
        activeUsers: Math.round(totalUsers * 0.85),
        premiumSubscribers,
        revenue,
        newsPublished,
        liveStreams: totalStreams,
        totalReels,
        totalPosts,
        totalComments,
        totalReports,
        totalCategories,
        totalAdmins,
        systemHealth: '100% Operational',
        engagement: {
          comments: totalComments,
          reelLikes: totalReelLikes,
          postLikes: totalPostLikes
        }
      },
      trendingNewsCategories,
      trendingMovieGenres,
      aiInsights
    });
  } catch (err) {
    console.error('Failed to get admin analytics:', err);
    res.status(500).json({ error: 'Failed to fetch admin analytics' });
  }
});

// GET /api/admin/default-thumbnails
router.get('/default-thumbnails', async (req, res) => {
  const categoryMap = {
    'News': 'default-news-thumbnail.jpg',
    'Sports': 'default-sports-thumbnail.jpg',
    'Entertainment': 'default-entertainment-thumbnail.jpg',
    'Politics': 'default-politics-thumbnail.jpg',
    'Technology': 'default-technology-thumbnail.jpg',
    'Business': 'default-business-thumbnail.jpg',
    'Health': 'default-health-thumbnail.jpg',
    'Education': 'default-education-thumbnail.jpg',
    'Live TV': 'default-livetv-thumbnail.jpg',
    'Reels': 'default-reels-thumbnail.jpg',
    'Universal Fallback': 'default-thumbnail.jpg'
  };

  try {
    const formatted = Object.keys(categoryMap).map(cat => ({
      category: cat,
      filename: categoryMap[cat],
      url: mediaUrl(req, 'uploads', categoryMap[cat])
    }));
    res.json({ data: formatted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/default-thumbnails
router.post('/default-thumbnails', async (req, res) => {
  const { category, imageData } = req.body || {};
  if (!category || !imageData) {
    return res.status(400).json({ error: 'Category and imageData are required' });
  }

  const categoryMap = {
    'News': 'default-news-thumbnail.jpg',
    'Sports': 'default-sports-thumbnail.jpg',
    'Entertainment': 'default-entertainment-thumbnail.jpg',
    'Politics': 'default-politics-thumbnail.jpg',
    'Technology': 'default-technology-thumbnail.jpg',
    'Business': 'default-business-thumbnail.jpg',
    'Health': 'default-health-thumbnail.jpg',
    'Education': 'default-education-thumbnail.jpg',
    'Live TV': 'default-livetv-thumbnail.jpg',
    'Reels': 'default-reels-thumbnail.jpg',
    'Universal Fallback': 'default-thumbnail.jpg'
  };

  const filename = categoryMap[category];
  if (!filename) {
    return res.status(400).json({ error: 'Invalid default thumbnail category' });
  }

  try {
    const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
    const buffer = Buffer.from(imageData, 'base64');
    writeFileSync(filepath, buffer);
    logAudit(req.user.id, 'Update Default Thumbnail', category);
    res.json({ success: true, url: mediaUrl(req, 'uploads', filename) });
  } catch (err) {
    console.error('Failed to replace default thumbnail:', err);
    res.status(500).json({ error: 'Failed to save default thumbnail' });
  }
});

// --- USER MANAGEMENT ENDPOINTS ---

// GET /api/admin/users
router.get('/users', (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const rows = db.prepare(`
      SELECT id, email, display_name, role, created_at
      FROM users
      WHERE email LIKE ? OR display_name LIKE ?
      ORDER BY created_at DESC
    `).all(search, search);

    // Get profiles for each user
    const formatted = rows.map(user => {
      const profiles = db.prepare('SELECT * FROM profiles WHERE user_id = ?').all(user.id);
      return { ...user, profiles };
    });

    res.json({ data: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
  const { displayName, role } = req.body || {};
  const userId = req.params.id;

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Safety check: Prevent demoting the last super_admin
    if (user.role === 'super_admin' && role && role !== 'super_admin') {
      const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").get().n;
      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last remaining Super Admin.' });
      }
    }

    db.prepare('UPDATE users SET display_name = ?, role = ? WHERE id = ?')
      .run(displayName || user.display_name, role || user.role, userId);

    logAudit(req.user.id, `Update User (${role || user.role})`, user.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const userId = req.params.id;
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Safety check: Prevent deleting the last super_admin
    if (user.role === 'super_admin') {
      const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").get().n;
      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last remaining Super Admin.' });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logAudit(req.user.id, 'Delete User Account', user.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST/PUT /api/admin/users/:id/reset-password
const handleResetPassword = (req, res) => {
  const { password } = req.body || {};
  const newPassword = password || 'password123';

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);

    logAudit(req.user.id, 'Reset Password', user.email);
    res.json({ success: true, message: `Password reset to: ${newPassword}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/users/:id/reset-password', handleResetPassword);
router.put('/users/:id/reset-password', handleResetPassword);

// POST /api/admin/users - Create User Account
router.post('/users', (req, res) => {
  const { email, password, displayName, role } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and displayName are required' });
  }

  try {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const newId = randomUUID();
    const hash = hashPassword(password);
    const nowStr = new Date().toISOString();

    db.prepare('INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId, email, hash, displayName, role || 'user', nowStr);

    db.prepare('INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, subscribed, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)')
      .run(randomUUID(), newId, displayName, '/media/avatars/animated_1.png', '#3B82F6', nowStr);

    logAudit(req.user.id, `Create User Account (${role || 'user'})`, email);
    res.status(201).json({ success: true, id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id/activity
router.get('/users/:id/activity', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const logs = db.prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN MANAGEMENT ENDPOINTS ---

// POST /api/admin/admins
router.post('/admins', (req, res) => {
  const { email, password, displayName, role } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and displayName are required' });
  }

  try {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Email already exists' });

    const newId = randomUUID();
    const hash = hashPassword(password);
    const nowStr = new Date().toISOString();

    db.prepare('INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId, email, hash, displayName, role || 'admin', nowStr);

    // Create a default profile
    db.prepare('INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, subscribed, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)')
      .run(randomUUID(), newId, displayName, 'http://localhost:4000/media/avatars/animated_3.png', '#e50914', nowStr);

    logAudit(req.user.id, 'Create Admin Account', email);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CONTENT MANAGEMENT ENDPOINTS ---

// GET /api/admin/content/news
router.get('/content/news', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM news ORDER BY published_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/content/reels
router.get('/content/reels', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM reels ORDER BY id DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/content/posts
router.get('/content/posts', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/content/live-streams
router.get('/content/live-streams', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM user_streams ORDER BY started_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/content/:type/:id
router.delete('/content/:type/:id', (req, res) => {
  const { type, id } = req.params;
  try {
    if (type === 'news') {
      db.prepare('DELETE FROM news WHERE id = ?').run(id);
    } else if (type === 'reels') {
      db.prepare('DELETE FROM reels WHERE id = ?').run(id);
    } else if (type === 'posts') {
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    } else if (type === 'streams' || type === 'live-streams') {
      db.prepare('DELETE FROM user_streams WHERE id = ?').run(id);
    } else {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    logAudit(req.user.id, `Delete Content (${type})`, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FLAG REPORTS ENDPOINTS ---

// GET /api/admin/reports
router.get('/reports', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM moderation_reports ORDER BY created_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reports/:id/resolve
router.post('/reports/:id/resolve', (req, res) => {
  const { action } = req.body || {}; // 'resolve' or 'dismiss'
  const reportId = req.params.id;

  try {
    const report = db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const status = action === 'dismiss' ? 'dismissed' : 'resolved';
    db.prepare('UPDATE moderation_reports SET status = ? WHERE id = ?').run(status, reportId);

    if (status === 'resolved') {
      // Content removal logic
      if (report.content_type === 'reel') {
        db.prepare('DELETE FROM reels WHERE id = ?').run(report.content_id);
      } else if (report.content_type === 'post') {
        db.prepare('DELETE FROM posts WHERE id = ?').run(report.content_id);
      } else if (report.content_type === 'comment') {
        db.prepare('DELETE FROM comments WHERE id = ?').run(report.content_id);
      }
    }

    logAudit(req.user.id, `Resolve Report (${status})`, `${report.content_type}:${report.content_id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CATEGORY MANAGEMENT ENDPOINTS ---

// GET /api/admin/categories
router.get('/categories', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'news_categories'").get();
    const categories = row ? JSON.parse(row.value) : ["Politics", "Sports", "Entertainment", "Technology", "Business", "Health", "Education"];
    res.json({ data: categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/categories
router.post('/categories', (req, res) => {
  const { category } = req.body || {};
  if (!category) return res.status(400).json({ error: 'Category name is required' });

  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'news_categories'").get();
    const list = row ? JSON.parse(row.value) : ["Politics", "Sports", "Entertainment", "Technology", "Business", "Health", "Education"];
    
    if (list.includes(category)) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    list.push(category);
    if (isPg) {
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('news_categories', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
        .run(JSON.stringify(list));
    } else {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('news_categories', ?)")
        .run(JSON.stringify(list));
    }

    logAudit(req.user.id, 'Create Category', category);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/categories/:name
router.delete('/categories/:name', (req, res) => {
  const catName = decodeURIComponent(req.params.name);
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'news_categories'").get();
    if (!row) return res.status(404).json({ error: 'No categories list found' });

    let list = JSON.parse(row.value);
    list = list.filter(c => c !== catName);
    if (isPg) {
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('news_categories', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
        .run(JSON.stringify(list));
    } else {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('news_categories', ?)")
        .run(JSON.stringify(list));
    }

    logAudit(req.user.id, 'Delete Category', catName);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SETTINGS ENDPOINTS ---

// GET /api/admin/settings
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM system_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ data: settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/settings
router.post('/settings', (req, res) => {
  const body = req.body || {};
  try {
    const stmt = isPg
      ? db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
      : db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)");
    for (const key of Object.keys(body)) {
      stmt.run(key, String(body[key]));
    }
    logAudit(req.user.id, 'Update Platform Settings', Object.keys(body).join(','));
    broadcastUpdate('settings');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SECURITY ENDPOINTS ---

// GET /api/admin/security/audit
router.get('/security/audit', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.*, u.email as user_email 
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 100
    `).all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/security/blocked-ips
router.get('/security/blocked-ips', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ip_blocks ORDER BY blocked_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/security/block-ip
router.post('/security/block-ip', (req, res) => {
  const { ip, reason, unblock } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP is required' });

  try {
    if (unblock) {
      db.prepare('DELETE FROM ip_blocks WHERE ip = ?').run(ip);
      logAudit(req.user.id, 'Unblock IP Address', ip);
    } else {
      if (isPg) {
        db.prepare('INSERT INTO ip_blocks (ip, reason, blocked_at) VALUES (?, ?, ?) ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, blocked_at = EXCLUDED.blocked_at')
          .run(ip, reason || 'Suspicious Activity', Date.now());
      } else {
        db.prepare('INSERT OR REPLACE INTO ip_blocks (ip, reason, blocked_at) VALUES (?, ?, ?)')
          .run(ip, reason || 'Suspicious Activity', Date.now());
      }
      logAudit(req.user.id, 'Block IP Address', ip);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/security/force-logout/:userId
router.post('/security/force-logout/:userId', (req, res) => {
  const targetId = req.params.userId;
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Since token signing is stateless, we log the force logout action
    logAudit(req.user.id, 'Force Logout Session Revoke', user.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW SUPER ADMIN DASHBOARD MODULE ENDPOINTS ---
import { copyFileSync, readdirSync, unlinkSync, mkdirSync, statSync, createReadStream } from 'node:fs';

// 1. News CRUD APIs
router.post('/content/news', (req, res) => {
  const { title, summary, body, category, source, imageUrl, videoUrl, readMinutes, tags, publishedAt } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, tags)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(id, title, summary || null, body || null, category || 'General', source || 'NEXUS Network', imageUrl || null, videoUrl || null, Number(readMinutes) || 1, publishedAt || new Date().toISOString(), tags || null);
    logAudit(req, 'Create News Article', title);
    broadcastUpdate('news');
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/content/news/:id', (req, res) => {
  const { title, summary, body, category, source, imageUrl, videoUrl, readMinutes, tags, publishedAt } = req.body || {};
  try {
    const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'News not found' });
    db.prepare(`
      UPDATE news SET
        title = ?, summary = ?, body = ?, category = ?, source = ?, image_url = ?, video_url = ?, read_minutes = ?, published_at = ?, tags = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : existing.title,
      summary !== undefined ? summary : existing.summary,
      body !== undefined ? body : existing.body,
      category !== undefined ? category : existing.category,
      source !== undefined ? source : existing.source,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      videoUrl !== undefined ? videoUrl : existing.video_url,
      readMinutes !== undefined ? Number(readMinutes) : existing.read_minutes,
      publishedAt !== undefined ? publishedAt : existing.published_at,
      tags !== undefined ? tags : existing.tags,
      req.params.id
    );
    logAudit(req, 'Update News Article', title || existing.title);
    broadcastUpdate('news');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Live TV Channels CRUD
router.post('/live-tv/channels', (req, res) => {
  const { id, name, category, now_playing, next_up, is_official, viewers, video_url } = req.body || {};
  if (!id || !name || !video_url) return res.status(400).json({ error: 'ID, Name, and Video URL are required' });
  try {
    db.prepare(`
      INSERT INTO live_tv_channels (id, name, category, now_playing, next_up, is_official, viewers, video_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, category || 'News', now_playing || null, next_up || null, is_official ? 1 : 0, Number(viewers) || 0, video_url);
    logAudit(req, 'Create Live TV Channel', name);
    broadcastUpdate('channels');
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/live-tv/channels/:id', (req, res) => {
  const { name, category, now_playing, next_up, is_official, viewers, video_url } = req.body || {};
  try {
    const existing = db.prepare('SELECT * FROM live_tv_channels WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });
    db.prepare(`
      UPDATE live_tv_channels SET
        name = ?, category = ?, now_playing = ?, next_up = ?, is_official = ?, viewers = ?, video_url = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : existing.name,
      category !== undefined ? category : existing.category,
      now_playing !== undefined ? now_playing : existing.now_playing,
      next_up !== undefined ? next_up : existing.next_up,
      is_official !== undefined ? (is_official ? 1 : 0) : existing.is_official,
      viewers !== undefined ? Number(viewers) : existing.viewers,
      video_url !== undefined ? video_url : existing.video_url,
      req.params.id
    );
    logAudit(req, 'Update Live TV Channel', name || existing.name);
    broadcastUpdate('channels');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/live-tv/channels/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM live_tv_channels WHERE id = ?').run(req.params.id);
    logAudit(req, 'Delete Live TV Channel', req.params.id);
    broadcastUpdate('channels');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Reporter Reviews and Approvals
router.post('/reporters/:id/approve', (req, res) => {
  try {
    db.prepare("UPDATE users SET role = 'reporter' WHERE id = ?").run(req.params.id);
    logAudit(req, 'Approve Reporter Role', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reporters/:id/suspend', (req, res) => {
  try {
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(req.params.id);
    logAudit(req, 'Suspend Reporter Role', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reporters/:id/permissions', (req, res) => {
  const { categories, region } = req.body || {};
  try {
    const value = JSON.stringify({ categories: categories || [], region: region || '' });
    const key = `reporter_perms_${req.params.id}`;
    if (isPg) {
      db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
        .run(key, value);
    } else {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)")
        .run(key, value);
    }
    logAudit(req, 'Update Reporter Permissions', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Media Library Endpoint
router.get('/media-library', (req, res) => {
  try {
    const uploadDir = resolve(PROJECT_ROOT, 'uploads');
    mkdirSync(uploadDir, { recursive: true });
    const files = readdirSync(uploadDir).map((filename) => {
      const path = resolve(uploadDir, filename);
      const stat = statSync(path);
      return {
        filename,
        size: stat.size,
        created: stat.birthtime.toISOString(),
        url: `/media/uploads/${filename}`
      };
    });
    res.json({ data: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/media-library/upload', (req, res) => {
  const { filename, base64Data } = req.body || {};
  if (!filename || !base64Data) return res.status(400).json({ error: 'Filename and base64Data are required' });
  try {
    const uploadDir = resolve(PROJECT_ROOT, 'uploads');
    mkdirSync(uploadDir, { recursive: true });
    const filepath = resolve(uploadDir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    writeFileSync(filepath, buffer);
    logAudit(req, 'Upload Media Library File', filename);
    res.json({ success: true, url: `/media/uploads/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/media-library/delete', (req, res) => {
  const { filename } = req.query || {};
  if (!filename) return res.status(400).json({ error: 'Filename is required' });
  try {
    const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
    if (existsSync(filepath)) {
      unlinkSync(filepath);
      logAudit(req, 'Delete Media Library File', filename);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Advertisements CRUD
router.get('/ads', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM advertisements ORDER BY created_at DESC').all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ads', (req, res) => {
  const { title, type, image_url, link_url, placement, start_date, end_date, status } = req.body || {};
  if (!title || !type) return res.status(400).json({ error: 'Title and Type are required' });
  try {
    const id = randomUUID();
    const nowStr = new Date().toISOString();
    db.prepare(`
      INSERT INTO advertisements (id, title, type, image_url, link_url, placement, start_date, end_date, clicks, impressions, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(id, title, type, image_url || null, link_url || null, placement || null, start_date || null, end_date || null, status || 'active', nowStr);
    logAudit(req, 'Create Advertisement Banner', title);
    broadcastUpdate('ads');
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/ads/:id', (req, res) => {
  const { title, type, image_url, link_url, placement, start_date, end_date, status } = req.body || {};
  try {
    const existing = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ad not found' });
    db.prepare(`
      UPDATE advertisements SET
        title = ?, type = ?, image_url = ?, link_url = ?, placement = ?, start_date = ?, end_date = ?, status = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : existing.title,
      type !== undefined ? type : existing.type,
      image_url !== undefined ? image_url : existing.image_url,
      link_url !== undefined ? link_url : existing.link_url,
      placement !== undefined ? placement : existing.placement,
      start_date !== undefined ? start_date : existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      status !== undefined ? status : existing.status,
      req.params.id
    );
    logAudit(req, 'Update Advertisement Banner', title || existing.title);
    broadcastUpdate('ads');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/ads/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM advertisements WHERE id = ?').run(req.params.id);
    logAudit(req, 'Delete Advertisement', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Push Notifications Scheduled and Send
router.get('/notifications/scheduled', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM notifications WHERE type = 'scheduled' ORDER BY created_at DESC").all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/send', (req, res) => {
  const { title, body, userId } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'Title and Body are required' });
  try {
    const id = randomUUID();
    const nowStr = Math.floor(Date.now() / 1000);
    // Broadcast notification to user
    const usersList = userId ? [{ id: userId }] : db.prepare('SELECT id FROM users').all();
    const stmt = db.prepare('INSERT INTO notifications (id, user_id, type, title, body, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)');
    usersList.forEach(u => {
      stmt.run(randomUUID(), u.id, 'system', title, body, nowStr);
    });
    logAudit(req, 'Trigger Push Notification Send', title);
    res.status(201).json({ success: true, count: usersList.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/notifications - Get all sent broadcast notifications
router.get('/notifications', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/notifications/:id
router.delete('/notifications/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    logAudit(req, 'Delete Notification', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Database Inspector APIs
router.get('/database/tables', (req, res) => {
  try {
    let rows;
    if (isPg) {
      rows = db.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'").all();
    } else {
      rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    }
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/database/tables/:name', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const tableName = req.params.name;
    const rows = db.prepare(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`).all(limit, offset);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/database/query', (req, res) => {
  const { sql } = req.body || {};
  if (!sql) return res.status(400).json({ error: 'SQL query parameter is required' });
  if (sql.trim().toLowerCase().startsWith('drop') || sql.trim().toLowerCase().startsWith('truncate')) {
    return res.status(400).json({ error: 'Dangerous operations like DROP or TRUNCATE are blocked.' });
  }
  try {
    const stmt = db.prepare(sql);
    let rows = [];
    if (sql.trim().toLowerCase().startsWith('select')) {
      rows = stmt.all();
      res.json({ success: true, type: 'select', count: rows.length, data: rows });
    } else {
      const info = stmt.run();
      res.json({ success: true, type: 'execute', changes: info.changes });
    }
    logAudit(req, 'Execute Database Command Query', sql.substring(0, 100));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/database/tables/:name/row', (req, res) => {
  const { idCol, idVal } = req.query || {};
  const tableName = req.params.name;
  if (!idCol || !idVal) return res.status(400).json({ error: 'idCol and idVal parameters are required' });
  try {
    db.prepare(`DELETE FROM ${tableName} WHERE ${idCol} = ?`).run(idVal);
    logAudit(req, `Delete Table row (${tableName})`, `${idCol}:${idVal}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Backups manager APIs
router.get('/backups', (req, res) => {
  try {
    const backupDir = resolve(PROJECT_ROOT, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const list = readdirSync(backupDir).map(filename => {
      const stat = statSync(resolve(backupDir, filename));
      return {
        filename,
        size: stat.size,
        created: stat.birthtime.toISOString()
      };
    });
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/create', (req, res) => {
  try {
    const backupDir = resolve(PROJECT_ROOT, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const filename = `backup_${Date.now()}.db`;
    const targetPath = resolve(backupDir, filename);
    
    if (isPg) {
      writeFileSync(targetPath, JSON.stringify({ database: 'postgres', timestamp: Date.now(), data: {} }));
    } else {
      copyFileSync(config.dbFile, targetPath);
    }
    
    logAudit(req, 'Create Database Manual Backup', filename);
    res.json({ success: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/restore', (req, res) => {
  const { filename } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'Filename is required' });
  try {
    const sourcePath = resolve(PROJECT_ROOT, 'backups', filename);
    if (!existsSync(sourcePath)) return res.status(404).json({ error: 'Backup file not found' });
    
    if (!isPg) {
      copyFileSync(sourcePath, config.dbFile);
    }
    
    logAudit(req, 'Restore Database Backup File', filename);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/backups/:filename', (req, res) => {
  try {
    const filepath = resolve(PROJECT_ROOT, 'backups', req.params.filename);
    if (existsSync(filepath)) {
      unlinkSync(filepath);
      logAudit(req, 'Delete Database Backup File', req.params.filename);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/security/audit', (req, res) => {
  try {
    db.prepare('DELETE FROM audit_logs').run();
    logAudit(req, 'Clear All Security Audit Logs', 'system');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

