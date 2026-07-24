import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { mediaUrl } from '../config.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth, resolveProfile);

const geminiCache = new Map();

function fetchTailoredBatchInBackground(profileName, contentType, uncachedItems) {
  const apiKey = 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  const prompt = `You are a personalized AI recommender for NEXUS Play. We want to rewrite the titles and descriptions of the following ${contentType} items for a specific user profile named "${profileName}".
Original Items:
${JSON.stringify(uncachedItems.map(i => ({ id: i.id, title: i.title, description: i.description })), null, 2)}

Rewrite the titles and descriptions to be highly tailored, engaging, and suitable for the profile "${profileName}"'s potential preference and style. Keep the content theme exactly the same (e.g. if it is a movie about Spider-Man, it must remain about Spider-Man; if it is news, it must remain news).
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
  const profileId = req.profile.id;
  const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
  const profileName = prof ? prof.name : 'Guest';

  // 1. Get followed creators to personalize reels
  const followedRows = db.prepare('SELECT creator_id FROM follows WHERE profile_id = ?').all(profileId);
  const followedIds = followedRows.map(r => r.creator_id);

  let reels = [];
  if (followedIds.length > 0) {
    const placeholders = followedIds.map(() => '?').join(',');
    const followedReels = db.prepare(`
      SELECT r.*, c.name AS creator_name, c.handle, c.avatar_file
      FROM reels r 
      JOIN creators c ON c.id = r.creator_id
      WHERE r.creator_id IN (${placeholders})
      ORDER BY r.likes DESC LIMIT 10
    `).all(...followedIds);
    reels.push(...followedReels);
  }

  // Fetch general trending reels to mix in or fill the feed
  const trendingReels = db.prepare(`
    SELECT r.*, c.name AS creator_name, c.handle, c.avatar_file
    FROM reels r 
    JOIN creators c ON c.id = r.creator_id
    ${followedIds.length > 0 ? `WHERE r.creator_id NOT IN (${followedIds.map(() => '?').join(',')})` : ''}
    ORDER BY r.likes DESC, r.views DESC LIMIT 20
  `).all(...(followedIds.length > 0 ? followedIds : []));

  reels.push(...trendingReels);

  // De-duplicate reels
  const uniqueReels = [];
  const seenReels = new Set();
  for (const r of reels) {
    if (!seenReels.has(r.id)) {
      seenReels.add(r.id);
      uniqueReels.push(r);
    }
  }

  const reelsSlice = uniqueReels.slice(0, 15);
  let tailoredReels = reelsSlice.map(r => ({ id: r.id, title: r.title, description: r.description }));
  if (profileName !== 'Guest') {
    tailoredReels = await getTailoredBatch(profileName, 'reel', tailoredReels);
  }
  const tailoredReelsMap = new Map(tailoredReels.map(t => [t.id, t]));

  const serializedReels = reelsSlice.map((row) => {
    const liked = !!db.prepare('SELECT 1 FROM reel_likes WHERE profile_id = ? AND reel_id = ?').get(profileId, row.id);
    const isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE profile_id = ? AND creator_id = ?').get(profileId, row.creator_id);
    
    const tailored = tailoredReelsMap.get(row.id) || row;

    return {
      id: row.id,
      videoUrl: mediaUrl(req, 'reels', row.video_file),
      thumbnailUrl: `https://picsum.photos/seed/${profileName}_${row.id}/400/700`,
      title: tailored.title,
      description: tailored.description,
      duration: row.duration,
      creator: {
        id: row.creator_id,
        name: row.creator_name,
        handle: row.handle,
        avatar: row.avatar_file ? mediaUrl(req, 'avatars', row.avatar_file) : null,
        isFollowing,
      },
      stats: { likes: row.likes, comments: row.comments, shares: row.shares, views: row.views },
      liked
    };
  });

  // 2. Fetch movies recommendations based on watchlist history (genres)
  const watchlistGenres = db.prepare(`
    SELECT m.genre, COUNT(*) as count 
    FROM watchlist w 
    JOIN movies m ON w.content_id = m.id
    WHERE w.profile_id = ? AND w.content_type = 'movie' AND w.deleted = 0
    GROUP BY m.genre 
    ORDER BY count DESC 
    LIMIT 3
  `).all(profileId);

  let movies = [];
  if (watchlistGenres.length > 0) {
    const favoriteGenres = watchlistGenres.map(g => g.genre);
    const placeholders = favoriteGenres.map(() => '?').join(',');
    const recommendedMovies = db.prepare(`
      SELECT * FROM movies 
      WHERE genre IN (${placeholders})
      ORDER BY rating DESC LIMIT 10
    `).all(...favoriteGenres);
    movies.push(...recommendedMovies);
  }

  // Fallback to top rated movies
  const topMovies = db.prepare('SELECT * FROM movies ORDER BY rating DESC LIMIT 15').all();
  movies.push(...topMovies);

  // De-duplicate movies
  const uniqueMovies = [];
  const seenMovies = new Set();
  for (const m of movies) {
    if (!seenMovies.has(m.id)) {
      seenMovies.add(m.id);
      uniqueMovies.push(m);
    }
  }

  const moviesSlice = uniqueMovies.slice(0, 15);
  let tailoredMovies = moviesSlice.map(m => ({ id: m.id, title: m.title, description: m.description }));
  if (profileName !== 'Guest') {
    tailoredMovies = await getTailoredBatch(profileName, 'movie', tailoredMovies);
  }
  const tailoredMoviesMap = new Map(tailoredMovies.map(t => [t.id, t]));

  const serializedMovies = moviesSlice.map((m) => {
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
    };
  });

  res.json({
    reels: serializedReels,
    movies: serializedMovies
  });
});

// Helpers for Gemini API calls with error mapping and automatic retries
function mapGeminiError(status, errorData, exception) {
  if (exception) {
    const msg = exception.message || '';
    if (msg.includes('timeout') || exception.name === 'AbortError') {
      return { status: 408, error: 'Request timeout' };
    }
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { status: 502, error: 'Network connection failed' };
    }
    return { status: 500, error: 'Internal server error' };
  }

  const errorMsg = errorData?.error?.message || '';
  if (status === 400 || status === 403) {
    if (errorMsg.toLowerCase().includes('key') || errorMsg.toLowerCase().includes('invalid')) {
      return { status: 403, error: 'Invalid API Key' };
    }
    return { status: 400, error: 'Invalid API Key' };
  }

  if (status === 429) {
    return { status: 429, error: 'Gemini API quota exceeded' };
  }

  if (status === 503 || status === 504) {
    return { status: 503, error: 'Backend service unavailable' };
  }

  return { status: status || 500, error: errorMsg || 'Internal server error' };
}

async function callGeminiWithRetry(contents, systemPrompt, apiKey) {
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt++;
    const model = 'gemini-2.5-flash';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

    try {
      if (attempt > 1) {
        // Wait 500ms before retrying on the second attempt
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          return { success: true, reply: replyText };
        }
      }

      const errorText = await response.text();
      let errorData;
      try { errorData = JSON.parse(errorText); } catch {}
      console.error(`[AI Assistant] Gemini API attempt ${attempt} using ${model} returned status ${response.status}:`, errorText);

      if (attempt === maxAttempts) {
        return { success: false, ...mapGeminiError(response.status, errorData, null) };
      }

    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`[AI Assistant] Gemini API attempt ${attempt} using ${model} failed with exception:`, err);
      
      if (attempt === maxAttempts) {
        return { success: false, ...mapGeminiError(null, null, err) };
      }
    }
  }
}

function generateOfflineFallbackResponse(message, isSubscribed, userRole) {
  const lowercase = message.toLowerCase();
  let movies = [];
  let news = [];
  try {
    movies = db.prepare('SELECT title, genre, rating FROM movies ORDER BY rating DESC LIMIT 3').all();
    news = db.prepare("SELECT title, category FROM news WHERE category != 'Past Live Streams' ORDER BY published_at DESC LIMIT 3").all();
  } catch (e) {}

  let reply = `🤖 **Nexus Offline Assistant** (Gemini server currently over capacity): \n\n`;

  if (lowercase.includes('movie') || lowercase.includes('watch') || lowercase.includes('film') || lowercase.includes('cinema')) {
    reply += `I recommend checking out these popular movies from our database:\n`;
    movies.forEach(m => {
      reply += `- **${m.title}** (${m.genre}) - Rating: ⭐ ${m.rating}\n`;
    });
    reply += `\nYou can find these in the Movies tab!`;
  } else if (lowercase.includes('news') || lowercase.includes('read') || lowercase.includes('article') || lowercase.includes('headline')) {
    reply += `Here are the latest news headlines today:\n`;
    news.forEach(n => {
      reply += `- **${n.title}** [${n.category}]\n`;
    });
    reply += `\nCheck out the News hub tab for full articles and live broadcast streams!`;
  } else if (lowercase.includes('premium') || lowercase.includes('subscribe') || lowercase.includes('upgrade') || lowercase.includes('pay') || lowercase.includes('membership')) {
    reply += `Nexus Play Premium costs a one-time fee and unlocks:\n`;
    reply += `- 🚫 Ad-free experience\n`;
    reply += `- 📺 Unlimited live streaming trial (free is capped at 5 minutes)\n`;
    reply += `- 👑 Premium verified profile badge\n\n`;
    reply += `To subscribe, head over to your **Profile Screen** and click the **Upgrade to Premium** button!`;
  } else if (lowercase.includes('hello') || lowercase.includes('hi') || lowercase.includes('hey')) {
    reply += `Hello there! I am your Nexus AI assistant. How can I help you today? I can tell you about movies, local news, or how to upgrade your subscription!`;
  } else if (lowercase.includes('who are you') || lowercase.includes('your name') || lowercase.includes('nexus assistant')) {
    reply += `I am the Nexus AI Assistant, your smart companion for all things movies, news, and streaming on NEXUS Play!`;
  } else {
    reply += `That's an interesting question! While our main Gemini server is currently experiencing heavy load, here's what you can do on NEXUS Play:\n\n`;
    reply += `- 🎬 Browse the latest blockbusters in the Movies tab\n`;
    reply += `- 📰 Read localized breaking news in the News hub\n`;
    reply += `- 💬 Participate in live broadcasts and chats\n\n`;
    reply += `Is there anything specific about our movies or news catalog you would like to know?`;
  }

  return reply;
}

// POST /api/recommendations/assistant - AI Chat assistant
router.post('/assistant', async (req, res) => {
  const { message, history } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const profileName = req.profile?.name || 'Guest';
  const profileId = req.profile?.id;
  
  // Retrieve subscription status from database directly to be fresh
  let isSubscribed = false;
  if (profileId) {
    const profObj = db.prepare('SELECT subscribed FROM profiles WHERE id = ?').get(profileId);
    isSubscribed = profObj ? !!profObj.subscribed : false;
  }
  const userRole = req.user?.role || 'user';

  // Fetch available movies and news from db for context awareness
  const movies = db.prepare('SELECT id, title, genre, rating FROM movies ORDER BY rating DESC LIMIT 8').all();
  const news = db.prepare("SELECT id, title, category FROM news WHERE category != 'Past Live Streams' ORDER BY published_at DESC LIMIT 8").all();

  const systemPrompt = `You are "Nexus Assistant", the futuristic, intelligent, friendly, human-like AI companion of the NEXUS Play platform.
You are interacting with a user profile named "${profileName}".
Their subscription plan is: ${isSubscribed ? 'Premium' : 'Free'}.
Their user role is: ${userRole}.

Available Movies in our database (recommend these directly when asked for movie recommendations):
${JSON.stringify(movies.map(m => ({ id: m.id, title: m.title, genre: m.genre, rating: m.rating })), null, 2)}

Available News in our database (recommend these directly when asked for news recommendations):
${JSON.stringify(news.map(n => ({ id: n.id, title: n.title, category: n.category })), null, 2)}

Your responsibilities:
1. Provide professional, intelligent, friendly, and future-focused responses.
2. Recommend relevant content from the database. When recommending, explicitly provide the title and category/genre.
3. If they are on a Free plan, guide them on subscriptions. Explain that Free users are limited to 5-minute live stream trials, whereas Premium users enjoy unlimited live streaming, ad-free experience, early access news, etc. Recommend that they click the Upgrade to Premium button.
4. Keep answers concise, helpful, and natural.

Format your responses in clean Markdown.`;

  // Build the message contents for Gemini, keeping database history and adding current query
  const contents = [];
  if (profileId) {
    const historyRows = db.prepare('SELECT role, message AS text FROM chat_messages WHERE profile_id = ? ORDER BY created_at ASC LIMIT 15').all(profileId);
    if (historyRows.length > 0) {
      contents.push(...historyRows.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      })));
    } else if (history && Array.isArray(history)) {
      contents.push(...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.parts?.[0]?.text || h.text || '' }]
      })));
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AI Assistant] GEMINI_API_KEY is not defined in environment variables. Using default fallback key.');
  }
  const keyToUse = apiKey || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';

  const result = await callGeminiWithRetry(contents, systemPrompt, keyToUse);
  if (result.success) {
    if (profileId) {
      try {
        db.prepare('INSERT INTO chat_messages (id, profile_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), profileId, 'user', message, Date.now());
        db.prepare('INSERT INTO chat_messages (id, profile_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), profileId, 'model', result.reply, Date.now());
      } catch (dbErr) {
        console.error('Failed to log assistant chat message to database:', dbErr);
      }
    }
    res.json({ reply: result.reply });
  } else {
    console.warn(`[AI Assistant] Gemini failed (${result.error}). Falling back to local offline responder.`);
    const fallbackReply = generateOfflineFallbackResponse(message, isSubscribed, userRole);
    if (profileId) {
      try {
        db.prepare('INSERT INTO chat_messages (id, profile_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), profileId, 'user', message, Date.now());
        db.prepare('INSERT INTO chat_messages (id, profile_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), profileId, 'model', fallbackReply, Date.now());
      } catch (dbErr) {
        console.error('Failed to log assistant chat message to database:', dbErr);
      }
    }
    res.json({ reply: fallbackReply });
  }
});

// GET /api/recommendations/assistant/history - Retrieve AI chat history for active profile
router.get('/assistant/history', (req, res) => {
  const profileId = req.profile?.id;
  if (!profileId) {
    return res.status(400).json({ error: 'Profile is required to retrieve chat history' });
  }
  try {
    const rows = db.prepare('SELECT role, message AS text, created_at FROM chat_messages WHERE profile_id = ? ORDER BY created_at ASC').all(profileId);
    res.json({ data: rows });
  } catch (err) {
    console.error('Failed to get chat history:', err);
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});
