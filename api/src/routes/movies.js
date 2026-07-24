import { Router } from '../server.js';
import { db } from '../db.js';
import { mediaUrl } from '../config.js';
import { requireAuth } from '../auth.js';

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

router.get('/', async (req, res) => {
  const { genre } = req.query;
  const rows = genre
    ? db.prepare('SELECT * FROM movies WHERE genre = ? ORDER BY sort_order').all(genre)
    : db.prepare('SELECT * FROM movies ORDER BY sort_order').all();

  const profileId = req.get('x-profile-id');
  let profileName = 'Guest';
  if (profileId) {
    const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
    if (prof) profileName = prof.name;
  }

  const genres = db.prepare('SELECT DISTINCT genre FROM movies ORDER BY genre').all().map((r) => r.genre);

  let tailoredMovies = rows.map(m => ({ id: m.id, title: m.title, description: m.description || '' }));
  if (profileName !== 'Guest') {
    tailoredMovies = await getTailoredBatch(profileName, 'movie', tailoredMovies);
  }
  const tailoredMoviesMap = new Map(tailoredMovies.map(t => [t.id, t]));

  const data = rows.map((m) => {
    const tailored = tailoredMoviesMap.get(m.id) || m;
    return {
      id: m.id,
      title: tailored.title,
      year: m.year,
      genre: m.genre,
      rating: m.rating,
      posterUrl: m.poster_url,
      backdropUrl: m.backdrop_url,
      videoUrl: m.video_file ? (m.video_file.startsWith('http') ? m.video_file : mediaUrl(req, 'reels', m.video_file)) : null,
      description: tailored.description,
      duration: m.duration,
      is_upcoming: m.is_upcoming,
    };
  });

  res.json({ data, genres });
});

router.get('/:id', async (req, res) => {
  const m = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Movie not found' });

  const profileId = req.get('x-profile-id');
  let profileName = 'Guest';
  if (profileId) {
    const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
    if (prof) profileName = prof.name;
  }

  let title = m.title;
  let description = m.description || '';
  if (profileName !== 'Guest') {
    const tailoredList = await getTailoredBatch(profileName, 'movie', [{ id: m.id, title: m.title, description }]);
    if (tailoredList && tailoredList[0]) {
      title = tailoredList[0].title;
      description = tailoredList[0].description;
    }
  }

  const base = {
    id: m.id,
    title,
    year: m.year,
    genre: m.genre,
    rating: m.rating,
    posterUrl: m.poster_url,
    backdropUrl: m.backdrop_url,
    videoUrl: m.video_file ? (m.video_file.startsWith('http') ? m.video_file : mediaUrl(req, 'reels', m.video_file)) : null,
    description,
    duration: m.duration,
    is_upcoming: m.is_upcoming,
  };

  res.json(base);
});
