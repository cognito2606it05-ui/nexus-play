import { Router } from '../server.js';
import { db, detectRegionAndDistrict } from '../db.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaUrl, absUrl, PROJECT_ROOT } from '../config.js';
import { moderateUploadContent } from '../moderation.js';
import { getDefaultThumbnailFilename } from '../thumbnail.js';

export const DEVOTIONAL_SUBCATEGORIES = [
  'Temple News', 'Spiritual News', 'Hindu Dharma', 'Festivals', 'Pooja & Rituals',
  'Pilgrimage', 'Devotional Songs', 'Bhajans', 'Slokas', 'Vedas & Upanishads',
  'Bhagavad Gita', 'Ramayana', 'Mahabharata', 'Puranas', 'Saints & Gurus',
  'Astrology', 'Panchangam', 'Daily Horoscope', 'Meditation', 'Yoga',
  'Quotes & Teachings', 'Religious Events', 'Temple Festivals', 'Charity & Seva',
  'Spiritual Discourses', 'Devotional'
];

export const router = Router();
router.use((req, res, next) => {
  if (req.method === 'GET') {
    return next();
  }
  requireAuth(req, res, next);
});

const geminiCache = new Map();

function fetchTailoredBatchInBackground(profileName, contentType, uncachedItems) {
  const apiKey = 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  const prompt = `You are a personalized AI recommender for NEXUS Play. We want to rewrite the titles and descriptions of the following ${contentType} items for a specific user profile named "${profileName}".
Original Items:
${JSON.stringify(uncachedItems.map(i => ({ id: i.id, title: i.title, description: i.description })), null, 2)}

Rewrite the titles and descriptions to be highly tailored, engaging, and suitable for the profile "${profileName}"'s potential preference and style. Keep the content theme exactly the same.
Return a raw JSON array of objects only, matching this exact structure:
[
  {"id": ..., "title": "...", "description": "..."},
  ...
]
No markdown formatting, no backticks, no other text.`;

  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  })
    .then(res => {
      if (!res.ok) throw new Error('Gemini API returned status ' + res.status);
      return res.json();
    })
    .then(data => {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              if (row.id !== undefined && row.title && row.description) {
                const cacheKey = `${profileName}_${contentType}_${row.id}`;
                geminiCache.set(cacheKey, { title: row.title, description: row.description });
              }
            }
          }
        } catch (jsonErr) {
          console.error('Failed to parse Gemini background batch response:', jsonErr);
        }
      }
    })
    .catch(err => {
      console.error('Failed to background tailor content with Gemini:', err);
    });
}

async function getTailoredBatch(profileName, contentType, items) {
  if (items.length === 0) return items;

  const results = {};
  const uncachedItems = [];

  for (const item of items) {
    const cacheKey = `${profileName}_${contentType}_${item.id}`;
    if (geminiCache.has(cacheKey)) {
      results[item.id] = geminiCache.get(cacheKey);
    } else {
      uncachedItems.push(item);
    }
  }

  if (uncachedItems.length > 0) {
    fetchTailoredBatchInBackground(profileName, contentType, uncachedItems);
  }

  return items.map(item => {
    const cached = results[item.id];
    return {
      ...item,
      title: cached ? cached.title : item.title,
      description: cached ? cached.description : item.description
    };
  });
}

function serialize(n, req) {
  let regions = [];
  try {
    if (n.blur_regions) {
      regions = JSON.parse(n.blur_regions);
    }
  } catch (e) {}

  return {
    id: n.id,
    title: n.title,
    summary: n.summary,
    body: n.body,
    category: n.category,
    source: n.source,
    isBreaking: !!n.is_breaking,
    imageUrl: req ? absUrl(req, n.image_url) : n.image_url,
    videoUrl: n.video_url || null,
    readMinutes: n.read_minutes || 1,
    publishedAt: n.published_at,
    region: n.region || null,
    state: n.state || n.region || null,
    district: n.district || null,
    city: n.city || null,
    location: n.location || null,
    subcategory: n.subcategory || null,
    language: n.language || 'en',
    isFeatured: !!n.is_featured,
    priority: n.priority || 0,
    publishStatus: n.publish_status || 'published',
    updatedAt: n.updated_at || null,
    likes: n.likes || 0,
    shares: n.shares || 0,
    views: n.views || 0,
    comments: n.comments || 0,
    reporter: n.source || 'NEXUS Reporter',
    thumbnail: req ? absUrl(req, n.image_url) : n.image_url,
    video: n.video_url || null,
    tags: n.tags || null,
    sentiment: n.sentiment || null,
    seoHeadline: n.seo_headline || null,
    needsBlur: n.needs_blur === 1,
    blurReason: n.blur_reason || null,
    blurRegions: regions,
    ocrText: n.ocr_text || null,
    translatedText: n.translated_text || null,
    neutralizedText: n.neutralized_text || null,
  };
}

// Hacker News Cache
let hnCache = {
  data: [],
  lastFetch: 0
};

// Fetch HN top stories asynchronously in the background so API requests respond instantly
async function fetchHNNews() {
  const now = Date.now();
  if (now - hnCache.lastFetch < 5 * 60 * 1000 && hnCache.data.length > 0) {
    return hnCache.data;
  }

  const currentCached = hnCache.data;

  // Background refresh without blocking synchronous request handling
  (async () => {
    try {
      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
        signal: AbortSignal.timeout(3000)
      });
      if (!topRes.ok) return;
      const ids = await topRes.json();
      const topIds = ids.slice(0, 10);
      
      const stories = await Promise.all(
        topIds.map(async (id) => {
          try {
            const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
              signal: AbortSignal.timeout(2000)
            });
            if (!itemRes.ok) return null;
            return await itemRes.json();
          } catch {
            return null;
          }
        })
      );
      
      const formatted = stories.filter(Boolean).map((s) => ({
        id: `hn-${s.id}`,
        title: s.title,
        summary: s.text ? s.text.slice(0, 150) + '...' : `Tech discussion on Hacker News. ${s.url ? 'Link: ' + s.url : ''}`,
        body: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        category: 'Tech',
        source: 'Hacker News',
        is_breaking: s.score > 250 ? 1 : 0,
        image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60',
        read_minutes: Math.max(1, Math.round((s.descendants || 5) / 5)),
        published_at: new Date(s.time * 1000).toISOString()
      }));
      
      hnCache = {
        data: formatted,
        lastFetch: Date.now()
      };
    } catch (err) {
      console.error('Failed to background fetch HN stories:', err);
    }
  })();

  return currentCached;
}

// GET /api/news (Supports state, region, category, district, city, subcategory, language, status, search, sort, page, limit)
router.get('/', async (req, res) => {
  const { category, region, state, district, city, subcategory, language, status, search, sort, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(Math.max(1, Number(limit) || 50), 100);
  const offset = (pageNum - 1) * limitNum;

  // Region / State mapping helper
  const targetState = state || (region === 'AP' ? 'Andhra Pradesh' : region === 'Delhi/North' ? 'Delhi' : region);

  // Fetch HN Tech stories if applicable
  let hnStories = [];
  if (!category || category === 'All' || category === 'Tech') {
    const rawHn = await fetchHNNews();
    hnStories = rawHn.map(story => {
      const { region: hnReg, district: hnDist } = detectRegionAndDistrict(story.title, story.summary);
      return {
        ...story,
        region: hnReg,
        state: hnReg === 'AP' ? 'Andhra Pradesh' : hnReg === 'Delhi/North' ? 'Delhi' : hnReg,
        district: hnDist
      };
    });
  }

  let sql = 'SELECT * FROM news WHERE 1=1';
  const params = [];

  if (targetState === 'Past Live Streams' || region === 'Past Live Streams') {
    sql += " AND category = 'Past Live Streams'";
  } else {
    sql += " AND category != 'Past Live Streams'";
    if (targetState && targetState !== 'All' && targetState !== 'All States') {
      sql += " AND (state = ? OR region = ? OR (state IS NULL AND region = ?))";
      const regAlt = targetState === 'Andhra Pradesh' ? 'AP' : targetState === 'Delhi' ? 'Delhi/North' : targetState;
      params.push(targetState, regAlt, regAlt);
    }
  }

  if (district && district !== 'All' && district !== 'All Districts') {
    sql += ' AND district = ?';
    params.push(district);
  }

  if (city && city !== 'All') {
    sql += ' AND city = ?';
    params.push(city);
  }

  if (subcategory && subcategory !== 'All') {
    sql += ' AND subcategory = ?';
    params.push(subcategory);
  }

  if (language && language !== 'All') {
    sql += ' AND language = ?';
    params.push(language);
  }

  if (status && status !== 'All') {
    sql += ' AND (publish_status = ? OR (publish_status IS NULL AND ? = "published"))';
    params.push(status, status);
  }

  if (category && category.toLowerCase() === 'devotional') {
    const placeholders = DEVOTIONAL_SUBCATEGORIES.map(() => '?').join(', ');
    sql += ` AND category IN (${placeholders})`;
    params.push(...DEVOTIONAL_SUBCATEGORIES);
  } else if (category && category !== 'All') {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(body) LIKE ? OR LOWER(tags) LIKE ?)';
    params.push(q, q, q, q);
  }

  if (sort === 'popular') {
    sql += ' ORDER BY views DESC, likes DESC, published_at DESC';
  } else if (sort === 'trending') {
    sql += ' ORDER BY is_breaking DESC, likes DESC, published_at DESC';
  } else {
    sql += ' ORDER BY published_at DESC';
  }

  sql += ' LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const rows = db.prepare(sql).all(...params);
  let newsList = rows.map(r => serialize(r, req));

  // Mix in HN stories when searching/filtering Tech
  if (hnStories.length > 0) {
    let filteredHn = hnStories;
    if (category && category !== 'All' && category !== 'Tech') {
      filteredHn = [];
    }
    if (targetState && targetState !== 'All' && targetState !== 'All States') {
      filteredHn = filteredHn.filter(story => story.state === targetState || story.region === targetState);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredHn = filteredHn.filter(s => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
    }
    if (filteredHn.length > 0) {
      newsList = [...newsList, ...filteredHn.map(r => serialize(r, req))];
    }
  }

  if (sort === 'popular') {
    newsList.sort((a, b) => b.views - a.views);
  } else if (sort === 'trending') {
    newsList.sort((a, b) => (b.isBreaking ? 1 : 0) - (a.isBreaking ? 1 : 0) || b.likes - a.likes);
  } else {
    newsList.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  const profileId = req.get('x-profile-id');
  let profileName = 'Guest';
  if (profileId) {
    const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
    if (prof) profileName = prof.name;
  }

  let tailoredNews = newsList.map(n => ({ id: n.id, title: n.title, description: n.summary }));
  if (profileName !== 'Guest') {
    tailoredNews = await getTailoredBatch(profileName, 'news', tailoredNews);
  }
  const tailoredNewsMap = new Map(tailoredNews.map(t => [t.id, t]));

  const tailoredList = newsList.map((n) => {
    const tailored = tailoredNewsMap.get(n.id) || n;
    return {
      ...n,
      title: tailored.title,
      summary: tailored.description,
    };
  });

  const categories = db.prepare('SELECT DISTINCT category FROM news').all().map((r) => r.category);
  if (!categories.includes('Tech')) categories.push('Tech');

  res.json({
    data: tailoredList,
    categories: ['All', ...categories],
    page: pageNum,
    limit: limitNum,
    total: tailoredList.length
  });
});

// GET /api/news/breaking-news
router.get('/breaking-news', async (req, res) => {
  const rows = db.prepare('SELECT * FROM news WHERE is_breaking = 1 ORDER BY published_at DESC LIMIT 20').all();
  res.json({ data: rows.map(r => serialize(r, req)) });
});

router.get('/breaking', async (req, res) => {
  const rows = db.prepare('SELECT * FROM news WHERE is_breaking = 1 ORDER BY published_at DESC LIMIT 20').all();
  res.json({ data: rows.map(r => serialize(r, req)) });
});

// GET /api/news/featured-news
router.get('/featured-news', async (req, res) => {
  const rows = db.prepare('SELECT * FROM news WHERE is_featured = 1 ORDER BY published_at DESC LIMIT 20').all();
  res.json({ data: rows.map(r => serialize(r, req)) });
});

router.get('/featured', async (req, res) => {
  const rows = db.prepare('SELECT * FROM news WHERE is_featured = 1 ORDER BY published_at DESC LIMIT 20').all();
  res.json({ data: rows.map(r => serialize(r, req)) });
});

// GET /api/news/state/:state
router.get('/state/:state', async (req, res) => {
  const state = req.params.state;
  const regAlt = state === 'Andhra Pradesh' ? 'AP' : state === 'Delhi' ? 'Delhi/North' : state;
  const rows = db.prepare('SELECT * FROM news WHERE state = ? OR region = ? ORDER BY published_at DESC LIMIT 50').all(state, regAlt);
  res.json({ data: rows.map(r => serialize(r, req)) });
});

// GET /api/news/category/:category
router.get('/category/:category', async (req, res) => {
  const cat = req.params.category;
  const rows = db.prepare('SELECT * FROM news WHERE category = ? ORDER BY published_at DESC LIMIT 50').all(cat);
  res.json({ data: rows.map(r => serialize(r, req)) });
});

// GET /api/news/state/:state/category/:category
router.get('/state/:state/category/:category', async (req, res) => {
  const { state, category } = req.params;
  const regAlt = state === 'Andhra Pradesh' ? 'AP' : state === 'Delhi' ? 'Delhi/North' : state;
  const rows = db.prepare('SELECT * FROM news WHERE (state = ? OR region = ?) AND category = ? ORDER BY published_at DESC LIMIT 50').all(state, regAlt, category);
  res.json({ data: rows.map(r => serialize(r, req)) });
});

// GET /api/news/ticker
router.get('/ticker', async (req, res) => {
  try {
    // 1. Fetch live CMS UI ticker labels
    const tickerLabels = db.prepare("SELECT key AS id, value AS title, 'NEXUS Ticker' AS source, 1 AS isBreaking FROM cms_ui_labels WHERE label_type = 'ticker_item' AND is_active = 1").all();
    
    // 2. Fetch single-module breaking news items
    const newsRows = db.prepare("SELECT id, title, source, 1 AS isBreaking FROM news WHERE module = 'breaking_news' OR is_breaking = 1 ORDER BY published_at DESC LIMIT 10").all();
    
    const combined = [...tickerLabels, ...newsRows].slice(0, 15);
    res.json({ data: combined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (id.startsWith('hn-')) {
    // Find in cache
    const cached = hnCache.data.find(s => s.id === id);
    if (cached) {
      return res.json(serialize(cached, req));
    }
    // Try to fetch specific HN item if not in cache
    try {
      const hnId = id.slice(3);
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${hnId}.json`);
      if (!itemRes.ok) return res.status(404).json({ error: 'Article not found' });
      const s = await itemRes.json();
      const n = {
        id,
        title: s.title,
        summary: s.text ? s.text.slice(0, 150) + '...' : `Tech discussion on Hacker News. ${s.url ? 'Link: ' + s.url : ''}`,
        body: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        category: 'Tech',
        source: 'Hacker News',
        is_breaking: s.score > 250 ? 1 : 0,
        image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60',
        read_minutes: Math.max(1, Math.round((s.descendants || 5) / 5)),
        published_at: new Date(s.time * 1000).toISOString()
      };
      return res.json(serialize(n, req));
    } catch {
      return res.status(404).json({ error: 'Article not found' });
    }
  }

  const n = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!n) return res.status(404).json({ error: 'Article not found' });
  res.json(serialize(n, req));
});

async function analyzeNewsWithGemini(title, body) {
  const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  const prompt = `Analyze the following news submission:
Title: "${title}"
Body: "${body}"

Perform content intelligence and moderation analysis.
1. Determine if it is spam, toxic (contains hate speech, harassment, explicit content), or has high fake news risk.
2. Auto-categorize it into a suitable category (e.g. latest, tech, sports, business, world, trending, etc.).
3. Summarize it in 1-2 sentences.
4. Suggest an SEO optimized title/headline.
5. Perform sentiment analysis (positive, neutral, negative).
6. Generate 3-5 tags.

Return a raw JSON object only matching this structure exactly (no markdown formatting, no backticks, no other text):
{
  "isApproved": true,
  "spamOrToxicOrFakeReason": "",
  "category": "categoryName",
  "summary": "brief summary",
  "optimizedHeadline": "SEO title",
  "sentiment": "positive/neutral/negative",
  "tags": ["tag1", "tag2", "tag3"]
}
If the news contains spam, toxicity, or fake news, set "isApproved" to false and provide the reason in "spamOrToxicOrFakeReason".`;

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
      console.error('Gemini API returned status', res.status);
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    }
  } catch (err) {
    console.error('Failed to run Gemini news analysis:', err);
  }
  return null;
}

// POST /api/news - Create news article
router.post('/', requireRole(['super_admin', 'news_reader', 'user', 'reporter']), resolveProfile, async (req, res) => {
  const {
    title, summary, body, category, subcategory, region, state, district, city, location,
    language = 'en', isBreaking, breakingNews, isFeatured, featured, priority = 0,
    status = 'published', publishStatus = 'published', publishDate, reporter, tags,
    imageData, imageName, videoData, videoName, targetLang
  } = req.body || {};

  if (!title || !body || !category) {
    return res.status(400).json({ error: 'title, body, and category are required' });
  }

  const aiResult = await moderateUploadContent(title, body, imageData || null, targetLang, imageName || null, videoData || null);
  const continueAnyway = req.body.continueAnyway === true;
  if (aiResult) {
    if ((!aiResult.isApproved || aiResult.needsBlur) && !continueAnyway) {
      return res.status(400).json({ error: `News blocked by AI moderation: ${aiResult.blurReason || aiResult.rejectReason || 'Sensitive content detected.'}` });
    }
  }

  try {
    const newsId = randomUUID();
    const isDevotional = category && (category.toLowerCase() === 'devotional' || DEVOTIONAL_SUBCATEGORIES.some(ds => ds.toLowerCase() === category.toLowerCase()));
    const finalCategory = isDevotional ? category : ((aiResult && aiResult.category) || category);
    
    let imageUrl = 'https://picsum.photos/seed/' + newsId + '/800/450';
    if (!imageData) {
      const fallbackFile = getDefaultThumbnailFilename(finalCategory, 'news');
      imageUrl = mediaUrl(req, 'uploads', fallbackFile);
    }

    let imageToUse = imageData;
    if (Array.isArray(imageData)) {
      imageToUse = imageData[0];
    }

    if (imageToUse) {
      const filename = `news-cover-${newsId}.jpg`;
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      const tempPath = resolve(PROJECT_ROOT, 'uploads', `temp-news-cover-${newsId}.jpg`);
      const buffer = Buffer.from(imageToUse, 'base64');
      writeFileSync(tempPath, buffer);
      
      import('../thumbnail-processor.js').then(async ({ optimizeImageJimp }) => {
        try {
          await optimizeImageJimp(tempPath, filepath, 800);
          try { unlinkSync(tempPath); } catch (e) {}
        } catch (err) {
          console.error('Failed to optimize news image:', err);
          writeFileSync(filepath, buffer);
        }
      });

      imageUrl = mediaUrl(req, 'uploads', filename);
    }

    let videoUrl = null;
    let videoFilepathOnDisk = '';
    if (videoData) {
      const ext = (videoName && videoName.toLowerCase().endsWith('.mov')) ? 'mov' : 'mp4';
      const filename = `news-video-${newsId}.${ext}`;
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      const buffer = Buffer.from(videoData, 'base64');
      writeFileSync(filepath, buffer);
      videoFilepathOnDisk = filepath;

      const introUrl = mediaUrl(req, 'uploads', 'intro.mp4');
      const originalUrl = mediaUrl(req, 'uploads', filename);
      const postUrl = mediaUrl(req, 'uploads', 'post.mp4');
      videoUrl = JSON.stringify([introUrl, originalUrl, postUrl]);

      if (!imageData) {
        const fallbackFile = getDefaultThumbnailFilename(finalCategory, 'news');
        imageUrl = mediaUrl(req, 'uploads', fallbackFile);
      }
    }

    const now = publishDate ? new Date(publishDate).toISOString() : new Date().toISOString();
    const source = reporter || req.profile?.name || 'NEXUS Reporter';
    const finalState = state || (region === 'AP' ? 'Andhra Pradesh' : region === 'Delhi/North' ? 'Delhi' : region) || 'National';
    const finalRegion = region || (finalState === 'Andhra Pradesh' ? 'AP' : finalState === 'Delhi' ? 'Delhi/North' : finalState);

    const finalTitle = (aiResult && aiResult.neutralizedTitle) || title;
    const finalSummary = (aiResult && aiResult.neutralizedSummary) || summary || title;
    const finalTags = (aiResult && aiResult.tags) ? aiResult.tags.join(', ') : (Array.isArray(tags) ? tags.join(', ') : tags || null);
    const finalSentiment = (aiResult && aiResult.sentiment) || null;
    const finalSeoHeadline = (aiResult && aiResult.neutralizedTitle) || null;
    const finalNeedsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
    const finalBlurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
    const finalBlurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
    const finalOcrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
    const finalTranslatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
    const finalNeutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

    db.prepare(`
      INSERT INTO news (
        id, title, summary, body, category, subcategory, source, is_breaking, is_featured, priority,
        publish_status, image_url, video_url, read_minutes, published_at, state, region, district,
        city, location, language, tags, sentiment, seo_headline, needs_blur, blur_reason, blur_regions,
        ocr_text, translated_text, neutralized_text, likes, shares, views, comments
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
    `).run(
      newsId,
      finalTitle,
      finalSummary,
      finalNeutralizedText || body,
      finalCategory,
      subcategory || null,
      source,
      (isBreaking || breakingNews) ? 1 : 0,
      (isFeatured || featured) ? 1 : 0,
      Number(priority) || 0,
      status || publishStatus || 'published',
      imageUrl,
      videoUrl,
      Math.max(1, Math.round(body.split(/\s+/).length / 200)),
      now,
      finalState,
      finalRegion,
      district || 'All Districts',
      city || null,
      location || null,
      language || 'en',
      finalTags,
      finalSentiment,
      finalSeoHeadline,
      finalNeedsBlur,
      finalBlurReason,
      finalBlurRegions,
      finalOcrText,
      finalTranslatedText,
      finalNeutralizedText
    );

    if (!imageToUse && videoData) {
      const filename = `news-cover-${newsId}.jpg`;
      import('../thumbnail-processor.js').then(async ({ generateAutoThumbnail }) => {
        try {
          await generateAutoThumbnail({
            videoPath: videoFilepathOnDisk,
            category: finalCategory,
            title: finalTitle,
            outputFilename: filename
          });
          const coverUrl = mediaUrl(req, 'uploads', filename);
          db.prepare('UPDATE news SET image_url = ? WHERE id = ?').run(coverUrl, newsId);
        } catch (err) {
          console.error(`Auto-thumbnail failed for news video ${newsId}:`, err);
        }
      }).catch((e) => {});
    }

    const newArticle = db.prepare('SELECT * FROM news WHERE id = ?').get(newsId);
    res.status(201).json(serialize(newArticle, req));
  } catch (err) {
    console.error('Failed to create news article:', err);
    res.status(500).json({ error: 'Failed to create news article' });
  }
});

// PUT /api/news/:id - Update news article
router.put('/:id', requireRole(['super_admin', 'reporter']), resolveProfile, async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Article not found' });
  }

  const {
    title, summary, body, category, subcategory, state, region, district, city, location,
    language, isBreaking, breakingNews, isFeatured, featured, priority, publishStatus, status,
    reporter, tags
  } = req.body || {};

  const updatedState = state || existing.state || existing.region;
  const updatedRegion = region || existing.region || (updatedState === 'Andhra Pradesh' ? 'AP' : updatedState === 'Delhi' ? 'Delhi/North' : updatedState);
  const updatedTitle = title || existing.title;
  const updatedSummary = summary !== undefined ? summary : existing.summary;
  const updatedBody = body || existing.body;
  const updatedCategory = category || existing.category;
  const updatedSubcategory = subcategory !== undefined ? subcategory : existing.subcategory;
  const updatedSource = reporter || existing.source;
  const updatedIsBreaking = (isBreaking !== undefined ? isBreaking : breakingNews !== undefined ? breakingNews : existing.is_breaking) ? 1 : 0;
  const updatedIsFeatured = (isFeatured !== undefined ? isFeatured : featured !== undefined ? featured : existing.is_featured) ? 1 : 0;
  const updatedPriority = priority !== undefined ? Number(priority) : existing.priority;
  const updatedStatus = publishStatus || status || existing.publish_status || 'published';
  const updatedDistrict = district || existing.district;
  const updatedCity = city !== undefined ? city : existing.city;
  const updatedLocation = location !== undefined ? location : existing.location;
  const updatedLanguage = language || existing.language || 'en';
  const updatedTags = Array.isArray(tags) ? tags.join(', ') : (tags !== undefined ? tags : existing.tags);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE news SET
      title = ?, summary = ?, body = ?, category = ?, subcategory = ?, source = ?,
      is_breaking = ?, is_featured = ?, priority = ?, publish_status = ?, state = ?,
      region = ?, district = ?, city = ?, location = ?, language = ?, tags = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updatedTitle, updatedSummary, updatedBody, updatedCategory, updatedSubcategory, updatedSource,
    updatedIsBreaking, updatedIsFeatured, updatedPriority, updatedStatus, updatedState,
    updatedRegion, updatedDistrict, updatedCity, updatedLocation, updatedLanguage, updatedTags, now,
    id
  );

  const updated = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  res.json(serialize(updated, req));
});

// POST /api/news/:id/like - Like news article
router.post('/:id/like', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Article not found' });
  const newLikes = (existing.likes || 0) + 1;
  db.prepare('UPDATE news SET likes = ? WHERE id = ?').run(newLikes, id);
  res.json({ success: true, likes: newLikes });
});

// POST /api/news/:id/view - Record article view
router.post('/:id/view', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Article not found' });
  const newViews = (existing.views || 0) + 1;
  db.prepare('UPDATE news SET views = ? WHERE id = ?').run(newViews, id);
  res.json({ success: true, views: newViews });
});

// POST /api/news/:id/share - Record article share
router.post('/:id/share', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Article not found' });
  const newShares = (existing.shares || 0) + 1;
  db.prepare('UPDATE news SET shares = ? WHERE id = ?').run(newShares, id);
  res.json({ success: true, shares: newShares });
});

// DELETE /api/news/:id - Delete news article
router.delete('/:id', resolveProfile, (req, res) => {
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'News article not found' });
  }

  if (item.category === 'Past Live Streams') {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admins are allowed to delete live stream recordings' });
    }
  } else {
    const isCreator = item.source === req.profile?.name;
    const isAdmin = req.user.role === 'super_admin';
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to delete this news article' });
    }
  }

  if (item.image_url && item.image_url.includes('/uploads/')) {
    try {
      const filename = item.image_url.split('/uploads/').pop();
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      unlinkSync(filepath);
    } catch (e) {}
  }

  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

