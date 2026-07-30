import { Router } from '../server.js';
import { db, isPg, supabase } from '../db.js';
import { requireAuth, requireRole, resolveProfile } from '../auth.js';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaUrl, absUrl, PROJECT_ROOT } from '../config.js';
import { getIo } from '../services/relay.js';
import { optimizeImageJimp } from '../thumbnail-processor.js';

export const router = Router();

// Helper: Upload file to Supabase or local disk fallback
async function uploadMediaFile(filename, base64Data, contentType) {
  const buffer = Buffer.from(base64Data, 'base64');
  
  if (supabase) {
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) throw listError;
      if (!buckets.find((b) => b.name === 'top-stories')) {
        await supabase.storage.createBucket('top-stories', { public: true });
      }
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('top-stories')
        .upload(filename, buffer, { contentType, cacheControl: '3600', upsert: true });
      
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage
        .from('top-stories')
        .getPublicUrl(filename);
      return publicUrlData.publicUrl;
    } catch (err) {
      console.warn('[Top Stories Upload] Supabase storage upload failed, falling back to local:', err.message);
    }
  }

  // Fallback to local storage
  const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
  writeFileSync(filepath, buffer);
  return `/media/uploads/${filename}`;
}

// Helper: Compress/Optimize image using Jimp, then upload to Supabase or local disk
async function uploadAndOptimizeImage(filename, base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  const tempPath = resolve(PROJECT_ROOT, 'uploads', `temp-${filename}`);
  const finalPath = resolve(PROJECT_ROOT, 'uploads', filename);
  
  writeFileSync(tempPath, buffer);
  try {
    await optimizeImageJimp(tempPath, finalPath, 800);
    try { unlinkSync(tempPath); } catch (e) {}
  } catch (err) {
    console.warn('[Top Stories Upload] Jimp optimization failed, copying raw instead:', err.message);
    writeFileSync(finalPath, buffer);
    try { unlinkSync(tempPath); } catch (e) {}
  }

  if (supabase) {
    try {
      const optimizedBuffer = readFileSync(finalPath);
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) throw listError;
      if (!buckets.find((b) => b.name === 'top-stories')) {
        await supabase.storage.createBucket('top-stories', { public: true });
      }
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('top-stories')
        .upload(filename, optimizedBuffer, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      
      // Cleanup local optimized image
      try { unlinkSync(finalPath); } catch (e) {}
      
      const { data: publicUrlData } = supabase.storage
        .from('top-stories')
        .getPublicUrl(filename);
      return publicUrlData.publicUrl;
    } catch (err) {
      console.warn('[Top Stories Upload] Supabase optimized upload failed, using local optimized:', err.message);
    }
  }

  return `/media/uploads/${filename}`;
}

// Helper: Delete asset from Supabase or local storage
async function deleteMediaFile(imageUrl) {
  if (!imageUrl) return;
  if (supabase && imageUrl.includes('/top-stories/')) {
    try {
      const filename = imageUrl.split('/top-stories/').pop();
      if (filename) {
        await supabase.storage.from('top-stories').remove([filename]);
        console.log(`[Top Stories] Deleted file from Supabase storage: ${filename}`);
      }
    } catch (e) {
      console.warn('[Top Stories] Failed to delete file from Supabase:', e.message);
    }
  } else if (imageUrl.includes('/uploads/')) {
    try {
      const filename = imageUrl.split('/uploads/').pop();
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      if (existsSync(filepath)) {
        unlinkSync(filepath);
        console.log(`[Top Stories] Deleted local file: ${filename}`);
      }
    } catch (e) {}
  }
}

// Helper: Trigger realtime reload across connected clients
function broadcastUpdate(action) {
  const io = getIo();
  if (io) {
    io.emit('top-stories-update', { action });
    console.log(`[Realtime] Broadcasted top-stories-update: ${action}`);
  }
}

// ==========================================
// PUBLIC API: Get top stories for homepage
// ==========================================
router.get('/public', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM top_stories WHERE status = 'published' ORDER BY priority ASC, created_at DESC").all();
    const serialized = rows.map(item => ({
      ...item,
      // Map to frontend naming conventions
      title: item.headline,
      summary: item.description,
      body: item.article,
      imageUrl: item.image_url ? absUrl(req, item.image_url) : null,
      thumbnailUrl: item.thumbnail_url ? absUrl(req, item.thumbnail_url) : null,
      videoUrl: item.video_url ? absUrl(req, item.video_url) : null,
      galleryUrls: item.gallery_urls ? JSON.parse(item.gallery_urls).map(url => absUrl(req, url)) : [],
      publishedAt: item.publish_date || item.created_at,
      readMinutes: item.priority || 5 // Fallback to 5 or mapping field
    }));
    res.json({ data: serialized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SECURED ADMINISTRATIVE CMS ENDPOINTS
// ==========================================
router.use((req, res, next) => {
  if (req.method === 'GET') {
    return next();
  }
  requireAuth(req, res, () => {
    requireRole(['super_admin', 'admin', 'editor'])(req, res, next);
  });
});

// GET /api/admin/top-stories - List all stories
router.get('/', (req, res) => {
  const { search, category, status, isBreaking, isTopStory, isTrending, sortBy } = req.query;
  try {
    let sql = 'SELECT * FROM top_stories WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (headline LIKE ? OR author LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (isBreaking !== undefined) {
      sql += ' AND is_breaking = ?';
      params.push(Number(isBreaking));
    }
    if (isTopStory !== undefined) {
      sql += ' AND is_top_story = ?';
      params.push(Number(isTopStory));
    }
    if (isTrending !== undefined) {
      sql += ' AND is_trending = ?';
      params.push(Number(isTrending));
    }

    // Sort order
    if (sortBy === 'newest') {
      sql += ' ORDER BY created_at DESC';
    } else if (sortBy === 'oldest') {
      sql += ' ORDER BY created_at ASC';
    } else if (sortBy === 'views') {
      sql += ' ORDER BY views DESC';
    } else if (sortBy === 'publish_date') {
      sql += ' ORDER BY publish_date DESC';
    } else {
      sql += ' ORDER BY priority ASC, created_at DESC';
    }

    const rows = db.prepare(sql).all(...params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/top-stories/:id - Get single story
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM top_stories WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Top story not found' });
    res.json({ data: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/top-stories - Add a story
router.post('/', async (req, res) => {
  console.log('[Top Stories POST] req.body:', req.body);
  const {
    headline, description, article, category, subcategory, language, author, source, tags,
    readingTime, location, publishDate, seoTitle, seoDescription, seoKeywords,
    isBreaking, isTopStory, isTrending, priority, status,
    imageData, videoData, galleryImagesData
  } = req.body || {};

  if (!headline) return res.status(400).json({ error: 'Headline is required' });

  try {
    const storyId = randomUUID();
    const nowStr = new Date().toISOString();

    // 1. Upload Cover Image (Optimize via Jimp)
    let imageUrl = null;
    let thumbnailUrl = null;
    if (imageData) {
      const filename = `topstory-cover-${storyId}.jpg`;
      imageUrl = await uploadAndOptimizeImage(filename, imageData);
      thumbnailUrl = imageUrl; // Can map to same or compressed smaller
    }

    // 2. Upload Video
    let videoUrl = null;
    if (videoData) {
      const filename = `topstory-video-${storyId}.mp4`;
      videoUrl = await uploadMediaFile(filename, videoData, 'video/mp4');
    }

    // 3. Upload Gallery Images
    const galleryUrlsList = [];
    if (Array.isArray(galleryImagesData)) {
      for (let i = 0; i < galleryImagesData.length; i++) {
        const filename = `topstory-gallery-${storyId}-${i + 1}.jpg`;
        const url = await uploadAndOptimizeImage(filename, galleryImagesData[i]);
        galleryUrlsList.push(url);
      }
    }

    db.prepare(`
      INSERT INTO top_stories (
        id, headline, description, article, category, subcategory, language, author, source,
        image_url, gallery_urls, video_url, thumbnail_url, priority, is_breaking, is_top_story, is_trending,
        status, views, likes, comments, publish_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
    `).run(
      storyId,
      headline,
      description || null,
      article || null,
      category || 'General',
      subcategory || null,
      language || 'English',
      author || req.user?.display_name || 'Admin',
      source || 'NEXUS Network',
      imageUrl,
      JSON.stringify(galleryUrlsList),
      videoUrl,
      thumbnailUrl,
      Number(priority) || 0,
      isBreaking ? 1 : 0,
      isTopStory !== false ? 1 : 0,
      isTrending ? 1 : 0,
      status || 'draft',
      publishDate || nowStr,
      nowStr,
      nowStr
    );

    broadcastUpdate('add');
    res.status(201).json({ success: true, id: storyId });
  } catch (err) {
    console.error('Failed to create top story:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/top-stories/:id - Edit a story
router.put('/:id', async (req, res) => {
  const storyId = req.params.id;
  const {
    headline, description, article, category, subcategory, language, author, source, tags,
    readingTime, location, publishDate, seoTitle, seoDescription, seoKeywords,
    isBreaking, isTopStory, isTrending, priority, status,
    imageData, videoData, galleryImagesData
  } = req.body || {};

  try {
    const existing = db.prepare('SELECT * FROM top_stories WHERE id = ?').get(storyId);
    if (!existing) return res.status(404).json({ error: 'Top story not found' });

    const nowStr = new Date().toISOString();

    // 1. Image upload updates
    let imageUrl = existing.image_url;
    let thumbnailUrl = existing.thumbnail_url;
    if (imageData) {
      // Delete old cover
      await deleteMediaFile(existing.image_url);
      const filename = `topstory-cover-${storyId}-${Date.now()}.jpg`;
      imageUrl = await uploadAndOptimizeImage(filename, imageData);
      thumbnailUrl = imageUrl;
    }

    // 2. Video upload updates
    let videoUrl = existing.video_url;
    if (videoData) {
      await deleteMediaFile(existing.video_url);
      const filename = `topstory-video-${storyId}-${Date.now()}.mp4`;
      videoUrl = await uploadMediaFile(filename, videoData, 'video/mp4');
    }

    // 3. Gallery upload updates
    let galleryUrls = existing.gallery_urls;
    if (Array.isArray(galleryImagesData)) {
      // Clean old gallery files
      try {
        const oldUrls = JSON.parse(existing.gallery_urls || '[]');
        for (const url of oldUrls) {
          await deleteMediaFile(url);
        }
      } catch (e) {}

      const galleryUrlsList = [];
      for (let i = 0; i < galleryImagesData.length; i++) {
        const filename = `topstory-gallery-${storyId}-${i + 1}-${Date.now()}.jpg`;
        const url = await uploadAndOptimizeImage(filename, galleryImagesData[i]);
        galleryUrlsList.push(url);
      }
      galleryUrls = JSON.stringify(galleryUrlsList);
    }

    db.prepare(`
      UPDATE top_stories SET
        headline = ?, description = ?, article = ?, category = ?, subcategory = ?, language = ?,
        author = ?, source = ?, image_url = ?, gallery_urls = ?, video_url = ?, thumbnail_url = ?,
        priority = ?, is_breaking = ?, is_top_story = ?, is_trending = ?, status = ?,
        publish_date = ?, updated_at = ?
      WHERE id = ?
    `).run(
      headline !== undefined ? headline : existing.headline,
      description !== undefined ? description : existing.description,
      article !== undefined ? article : existing.article,
      category !== undefined ? category : existing.category,
      subcategory !== undefined ? subcategory : existing.subcategory,
      language !== undefined ? language : existing.language,
      author !== undefined ? author : existing.author,
      source !== undefined ? source : existing.source,
      imageUrl,
      galleryUrls,
      videoUrl,
      thumbnailUrl,
      priority !== undefined ? Number(priority) : existing.priority,
      isBreaking !== undefined ? (isBreaking ? 1 : 0) : existing.is_breaking,
      isTopStory !== undefined ? (isTopStory ? 1 : 0) : existing.is_top_story,
      isTrending !== undefined ? (isTrending ? 1 : 0) : existing.is_trending,
      status !== undefined ? status : existing.status,
      publishDate !== undefined ? publishDate : existing.publish_date,
      nowStr,
      storyId
    );

    broadcastUpdate('edit');
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update top story:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/top-stories/:id - Delete a story
router.delete('/:id', async (req, res) => {
  const storyId = req.params.id;
  try {
    const existing = db.prepare('SELECT * FROM top_stories WHERE id = ?').get(storyId);
    if (!existing) return res.status(404).json({ error: 'Top story not found' });

    // Clean up related images/videos from storage (Supabase or disk)
    await deleteMediaFile(existing.image_url);
    await deleteMediaFile(existing.video_url);
    try {
      const oldUrls = JSON.parse(existing.gallery_urls || '[]');
      for (const url of oldUrls) {
        await deleteMediaFile(url);
      }
    } catch (e) {}

    db.prepare('DELETE FROM top_stories WHERE id = ?').run(storyId);
    broadcastUpdate('delete');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/top-stories/reorder - Drag and drop order update
router.post('/reorder', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array is required' });

  try {
    const stmt = db.prepare('UPDATE top_stories SET priority = ?, updated_at = ? WHERE id = ?');
    const nowStr = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, nowStr, ids[i]);
    }
    broadcastUpdate('reorder');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/top-stories/bulk-upload - Bulk upload images and auto-create cards
router.post('/bulk-upload', async (req, res) => {
  const { images, category } = req.body || {}; // array of { filename, base64 }
  if (!Array.isArray(images)) return res.status(400).json({ error: 'images array is required' });

  try {
    const nowStr = new Date().toISOString();
    const targetCategory = category || 'General';
    
    const uploadPromises = images.map(async (img, i) => {
      const storyId = randomUUID();
      const cleanName = img.filename.replace(/\.[^/.]+$/, ""); // strip extension
      const headline = cleanName.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const uniqueFilename = `topstory-bulk-${storyId}.jpg`;
      const imageUrl = await uploadAndOptimizeImage(uniqueFilename, img.base64);

      db.prepare(`
        INSERT INTO top_stories (
          id, headline, description, article, category, subcategory, language, author, source,
          image_url, gallery_urls, video_url, thumbnail_url, priority, is_breaking, is_top_story, is_trending,
          status, views, likes, comments, publish_date, created_at, updated_at
        ) VALUES (?, ?, 'Auto-uploaded image story', null, ?, null, 'English', ?, 'NEXUS Network', ?, '[]', null, ?, ?, 0, 1, 0, 'published', 0, 0, 0, ?, ?, ?)
      `).run(
        storyId,
        headline,
        targetCategory,
        req.user?.display_name || 'Admin',
        imageUrl,
        imageUrl,
        i, // priority
        nowStr,
        nowStr,
        nowStr
      );

      return { id: storyId, headline, category: targetCategory, imageUrl };
    });

    const createdStories = await Promise.all(uploadPromises);

    broadcastUpdate('bulk-upload');
    res.status(201).json({ success: true, count: createdStories.length, data: createdStories });
  } catch (err) {
    console.error('Bulk upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/top-stories/bulk-import - Import CSV / JSON / Excel rows
router.post('/bulk-import', (req, res) => {
  const { rows } = req.body || {}; // array of { headline, description, category, author, imageUrl, publishDate, tags }
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array is required' });

  try {
    const nowStr = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO top_stories (
        id, headline, description, article, category, subcategory, language, author, source,
        image_url, gallery_urls, video_url, thumbnail_url, priority, is_breaking, is_top_story, is_trending,
        status, views, likes, comments, publish_date, created_at, updated_at
      ) VALUES (?, ?, ?, null, ?, null, 'English', ?, 'NEXUS Network', ?, '[]', null, ?, ?, 0, 1, 0, 'published', 0, 0, 0, ?, ?, ?)
    `);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const storyId = randomUUID();
      stmt.run(
        storyId,
        row.headline || 'Untitled Import',
        row.description || null,
        row.category || 'General',
        row.author || req.user?.display_name || 'Admin',
        row.imageUrl || null,
        row.imageUrl || null, // thumbnail_url
        i, // priority
        row.publishDate || nowStr,
        nowStr,
        nowStr
      );
    }

    broadcastUpdate('bulk-import');
    res.status(201).json({ success: true, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
