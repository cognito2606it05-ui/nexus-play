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
router.use(requireAuth);

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
    readMinutes: n.read_minutes,
    publishedAt: n.published_at,
    region: n.region || null,
    district: n.district || null,
    location: n.location || null,
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

// Fetch HN top stories, format them, and cache them for 5 minutes
async function fetchHNNews() {
  const now = Date.now();
  // 5-minute cache
  if (now - hnCache.lastFetch < 5 * 60 * 1000 && hnCache.data.length > 0) {
    return hnCache.data;
  }
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!topRes.ok) throw new Error('HN top stories returned status ' + topRes.status);
    const ids = await topRes.json();
    const topIds = ids.slice(0, 10); // get top 10 stories
    
    const stories = await Promise.all(
      topIds.map(async (id) => {
        try {
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
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
      image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60', // generic tech image
      read_minutes: Math.max(1, Math.round((s.descendants || 5) / 5)),
      published_at: new Date(s.time * 1000).toISOString()
    }));
    
    hnCache = {
      data: formatted,
      lastFetch: now
    };
    return formatted;
  } catch (err) {
    console.error('Failed to fetch HN stories:', err);
    return hnCache.data; // Return stale cache on failure
  }
}

// GET /api/news?category=Tech&region=AP&district=Guntur&limit=20
router.get('/', async (req, res) => {
  const { category, region, district } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  
  // Fetch HN Tech stories (classify dynamically using detectRegionAndDistrict)
  let hnStories = [];
  if (!category || category === 'All' || category === 'Tech') {
    const rawHn = await fetchHNNews();
    hnStories = rawHn.map(story => {
      const { region: hnReg, district: hnDist } = detectRegionAndDistrict(story.title, story.summary);
      return {
        ...story,
        region: hnReg,
        district: hnDist
      };
    });
  }

  // Build dynamic SQL query for local DB news stories
  let sql = 'SELECT * FROM news WHERE 1=1';
  const params = [];

  if (region === 'Past Live Streams') {
    sql += " AND category = 'Past Live Streams'";
  } else if (region) {
    sql += " AND region = ? AND category != 'Past Live Streams'";
    params.push(region);
    if ((region === 'AP' || region === 'Telangana' || region === 'Delhi/North') && district && district !== 'All Districts') {
      sql += ' AND district = ?';
      params.push(district);
    }
  } else {
    sql += " AND category != 'Past Live Streams'";
  }

  // DEVOTIONAL_SUBCATEGORIES is now defined at the module-level.

  if (category && category.toLowerCase() === 'devotional') {
    const placeholders = DEVOTIONAL_SUBCATEGORIES.map(() => '?').join(', ');
    sql += ` AND category IN (${placeholders})`;
    params.push(...DEVOTIONAL_SUBCATEGORIES);
  } else if (category && category !== 'All') {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY published_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  
  // Serialize local news
  let newsList = rows.map(r => serialize(r, req));

  // Mix in HN stories, filtering them by category, region, and district as well!
  if (hnStories.length > 0) {
    let filteredHn = hnStories;
    
    if (category === 'Tech') {
      // already filtered by Tech
    } else if (category && category !== 'All') {
      filteredHn = [];
    }
    
    if (region === 'Past Live Streams') {
      filteredHn = [];
    } else if (region) {
      filteredHn = filteredHn.filter(story => story.region === region);
      if (region === 'AP' && district && district !== 'All Districts') {
        filteredHn = filteredHn.filter(story => story.district === district);
      }
    }
    
    if (filteredHn.length > 0) {
      newsList = [...newsList, ...filteredHn.map(r => serialize(r, req))];
    }
  }

  // Sort by publishedAt DESC
  newsList.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  
  // Limit total output
  newsList = newsList.slice(0, limit);

  // Resolve profile name
  const profileId = req.get('x-profile-id');
  let profileName = 'Guest';
  if (profileId) {
    const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
    if (prof) profileName = prof.name;
  }

  // Asynchronously tailor news content in batch
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

  // Get distinct categories from database
  const categories = db.prepare('SELECT DISTINCT category FROM news').all().map((r) => r.category);
  if (!categories.includes('Tech')) {
    categories.push('Tech');
  }

  res.json({ data: tailoredList, categories: ['All', ...categories] });
});

// GET /api/news/ticker -> breaking headlines for the scrolling ticker
router.get('/ticker', async (req, res) => {
  const rows = db
    .prepare('SELECT * FROM news WHERE is_breaking = 1 ORDER BY published_at DESC LIMIT 12')
    .all();
  
  let newsList = rows.map((n) => ({ id: n.id, title: n.title, source: n.source, isBreaking: true }));

  // Mix in breaking HN stories if any
  const hnStories = await fetchHNNews();
  const breakingHn = hnStories.filter(s => s.is_breaking).map(n => ({ id: n.id, title: n.title, source: n.source, isBreaking: true }));
  
  newsList = [...newsList, ...breakingHn].slice(0, 12);

  res.json({ data: newsList });
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
  const { title, summary, body, category, region, district, location, imageData, imageName, videoData, videoName, targetLang } = req.body || {};
  if (!title || !body || !category) {
    return res.status(400).json({ error: 'title, body, and category are required' });
  }

  // Run Gemini Content Moderation & Intelligence (with visual sensitive content scanning)
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
      
      // Optimize in background
      import('../thumbnail-processor.js').then(async ({ optimizeImageJimp }) => {
        try {
          await optimizeImageJimp(tempPath, filepath, 800);
          try { unlinkSync(tempPath); } catch (e) {}
        } catch (err) {
          console.error('Failed to optimize news image:', err);
          writeFileSync(filepath, buffer); // Fallback
        }
      });

      imageUrl = mediaUrl(req, 'uploads', filename);
    }

    let videoUrl = null;
    let autoNewsThumb = false;
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
        autoNewsThumb = true;
        const fallbackFile = getDefaultThumbnailFilename(finalCategory, 'news');
        imageUrl = mediaUrl(req, 'uploads', fallbackFile);
      }
    }

    const now = new Date().toISOString();
    const source = req.profile?.name || 'NEXUS Member';

    const finalTitle = (aiResult && aiResult.neutralizedTitle) || title;
    const finalSummary = (aiResult && aiResult.neutralizedSummary) || summary || title;
    const finalTags = (aiResult && aiResult.tags) ? aiResult.tags.join(', ') : null;
    const finalSentiment = (aiResult && aiResult.sentiment) || null;
    const finalSeoHeadline = (aiResult && aiResult.neutralizedTitle) || null;
    const finalNeedsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
    const finalBlurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
    const finalBlurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
    const finalOcrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
    const finalTranslatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
    const finalNeutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

    db.prepare(`
      INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district, location, tags, sentiment, seo_headline, needs_blur, blur_reason, blur_regions, ocr_text, translated_text, neutralized_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newsId,
      finalTitle,
      finalSummary,
      finalNeutralizedText || body,
      finalCategory,
      source,
      0,
      imageUrl,
      videoUrl,
      Math.max(1, Math.round(body.split(/\s+/).length / 200)),
      now,
      region || 'Delhi/North',
      district || 'All Districts',
      location || null,
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
      // Run automatic thumbnail generation in the background
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
          console.log(`[Thumbnail System] Auto-generated cover for news video ${newsId}: ${filename}`);
        } catch (err) {
          console.error(`[Thumbnail System] Auto-thumbnail generation failed for news video ${newsId}:`, err);
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

// DELETE /api/news/:id - Delete news article
router.delete('/:id', resolveProfile, (req, res) => {
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'News article not found' });
  }

  // Deletion permission logic:
  if (item.category === 'Past Live Streams') {
    // Only Super Admin can delete stream recordings
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admins are allowed to delete live stream recordings' });
    }
  } else {
    // Standard news: creator or admin
    const isCreator = item.source === req.profile?.name;
    const isAdmin = req.user.role === 'super_admin';
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to delete this news article' });
    }
  }

  // Delete attached files if present
  if (item.image_url && item.image_url.includes('/uploads/')) {
    try {
      const filename = item.image_url.split('/uploads/').pop();
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      unlinkSync(filepath);
    } catch (e) {
      // Ignore
    }
  }

  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

