import { Router } from '../server.js';
import { db } from '../db.js';
import { mediaUrl, PROJECT_ROOT } from '../config.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { moderateUploadContent } from '../moderation.js';
import { generateReelThumbnails, getDefaultThumbnailFilename } from '../thumbnail.js';

export const router = Router();
router.use(requireAuth, resolveProfile);

function shuffle(array, seed) {
  let currentIndex = array.length, temporaryValue, randomIndex;
  let s = seed;
  const random = () => {
    let x = Math.sin(s++) * 10000;
    return x - Math.floor(x);
  };

  while (0 !== currentIndex) {
    randomIndex = Math.floor(random() * currentIndex);
    currentIndex -= 1;
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}

function serialize(req, row, profileId) {
  const liked = !!db
    .prepare('SELECT 1 FROM reel_likes WHERE profile_id = ? AND reel_id = ?')
    .get(profileId, row.id);
  const isFollowing = !!db
    .prepare('SELECT 1 FROM follows WHERE profile_id = ? AND creator_id = ?')
    .get(profileId, row.creator_id);
  
  const prof = db.prepare('SELECT name FROM profiles WHERE id = ?').get(profileId);
  const profileName = prof ? prof.name : 'Guest';

  let regions = [];
  try {
    if (row.blur_regions) {
      regions = JSON.parse(row.blur_regions);
    }
  } catch (e) {}

  return {
    id: row.id,
    videoUrl: mediaUrl(req, 'reels', row.video_file),
    thumbnailUrl: row.thumbnail_file 
      ? mediaUrl(req, 'uploads', row.thumbnail_file) 
      : mediaUrl(req, 'uploads', 'default-reels-thumbnail.jpg'),
    title: row.title,
    description: row.description,
    duration: row.duration,
    creator: {
      id: row.creator_id,
      name: row.creator_name,
      handle: row.handle,
      avatar: row.avatar_file ? mediaUrl(req, 'avatars', row.avatar_file) : null,
      isFollowing,
    },
    stats: { likes: row.likes, comments: row.comments, shares: row.shares, views: row.views },
    liked,
    location: row.location || null,
    needsBlur: row.needs_blur === 1,
    blurReason: row.blur_reason || null,
    blurRegions: regions,
    ocrText: row.ocr_text || null,
    translatedText: row.translated_text || null,
    neutralizedText: row.neutralized_text || null,
  };
}

const SELECT_REEL = `
  SELECT r.*, c.name AS creator_name, c.handle, c.avatar_file
  FROM reels r JOIN creators c ON c.id = r.creator_id
`;

// GET /api/reels?cursor=<offset>&limit=10  (seeded index pagination)
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 30);
  const cursor = req.query.cursor !== undefined && req.query.cursor !== '' ? Number(req.query.cursor) : 0;

  let rows;
  if (req.query.creatorName) {
    rows = db.prepare(`${SELECT_REEL} WHERE c.name = ? ORDER BY r.id DESC`).all(req.query.creatorName);
  } else {
    rows = db.prepare(`${SELECT_REEL} ORDER BY r.id`).all();
  }

  let finalRows = rows;
  let hasMore = false;
  let nextCursor = null;

  if (req.query.creatorName) {
    finalRows = rows.slice(cursor, cursor + limit);
    hasMore = rows.length > cursor + limit;
    nextCursor = hasMore ? cursor + limit : null;
  } else {
    // Hash the active profile ID to create a stable seed
    let seed = 0;
    if (req.profile?.id) {
      for (let i = 0; i < req.profile.id.length; i++) {
        seed += req.profile.id.charCodeAt(i);
      }
    }

    const shuffled = shuffle(rows, seed);
    finalRows = shuffled.slice(cursor, cursor + limit);
    hasMore = shuffled.length > cursor + limit;
    nextCursor = hasMore ? cursor + limit : null;
  }

  res.json({
    data: finalRows.map((r) => serialize(req, r, req.profile.id)),
    hasMore,
    nextCursor,
  });
});

router.post('/:id/like', (req, res) => {
  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(req.params.id);
  if (!reel) return res.status(404).json({ error: 'Reel not found' });

  const already = db
    .prepare('SELECT 1 FROM reel_likes WHERE profile_id = ? AND reel_id = ?')
    .get(req.profile.id, reel.id);

  if (already) {
    db.prepare('DELETE FROM reel_likes WHERE profile_id = ? AND reel_id = ?').run(req.profile.id, reel.id);
    db.prepare('UPDATE reels SET likes = MAX(0, likes - 1) WHERE id = ?').run(reel.id);
  } else {
    db.prepare('INSERT INTO reel_likes (profile_id, reel_id) VALUES (?, ?)').run(req.profile.id, reel.id);
    db.prepare('UPDATE reels SET likes = likes + 1 WHERE id = ?').run(reel.id);
  }
  const likes = db.prepare('SELECT likes FROM reels WHERE id = ?').get(reel.id).likes;
  res.json({ liked: !already, likes });
});

router.post('/:id/view', (req, res) => {
  const info = db.prepare('UPDATE reels SET views = views + 1 WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Reel not found' });
  const views = db.prepare('SELECT views FROM reels WHERE id = ?').get(req.params.id).views;
  res.json({ views });
});

// POST /api/reels/generate-thumbnails - Generate candidate thumbnails and rank using Gemini
router.post('/generate-thumbnails', async (req, res) => {
  const { videoData, videoName, seed } = req.body || {};
  if (!videoData) {
    return res.status(400).json({ error: 'videoData is required' });
  }

  try {
    const offsetSeed = seed ? parseInt(seed, 10) : 0;
    const result = await generateReelThumbnails(videoData, videoName || 'video.mp4', offsetSeed);
    
    // Map options file paths to absolute URLs
    const optionsWithUrls = result.options.map(opt => ({
      id: opt.id,
      url: mediaUrl(req, 'uploads', opt.filename)
    }));

    res.json({
      options: optionsWithUrls,
      recommendedId: result.recommendedId,
      aiReason: result.aiReason,
      ratings: result.ratings
    });
  } catch (err) {
    console.error('Failed to generate video thumbnails:', err);
    res.status(500).json({ error: err.message || 'Failed to generate thumbnails' });
  }
});

// POST /api/reels/upload - Upload a new reel as base64 video
router.post('/upload', async (req, res) => {
  const { title, description, videoData, location, targetLang, imageData, imageName } = req.body || {};
  if (!title || !videoData) {
    return res.status(400).json({ error: 'title and videoData are required' });
  }

  // Run Gemini Content Moderation
  const aiResult = await moderateUploadContent(title, description, imageData || null, targetLang, imageName || null, videoData || null);
  const continueAnyway = req.body.continueAnyway === true;
  if (aiResult) {
    if (!aiResult.isApproved && !continueAnyway) {
      return res.status(400).json({ error: `Reel blocked by AI moderation: ${aiResult.rejectReason}` });
    }
  }

  try {
    const reelId = randomUUID();
    const filename = `user-reel-${reelId}.mp4`;
    const filepath = resolve(PROJECT_ROOT, 'Ai videos', filename);
    
    // Save video file: handle file path/URL vs raw base64 string
    if (typeof videoData === 'string' && videoData.includes('/uploads/')) {
      const parts = videoData.split('/uploads/');
      const sourceFilename = parts[parts.length - 1];
      const sourcePath = resolve(PROJECT_ROOT, 'uploads', sourceFilename);
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, filepath);
      } else {
        const cleanBase64 = videoData.replace(/^data:video\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        writeFileSync(filepath, buffer);
      }
    } else if (typeof videoData === 'string' && (videoData.startsWith('http://') || videoData.startsWith('https://'))) {
      const parts = videoData.split('/');
      const sourceFilename = parts[parts.length - 1];
      const sourcePath = resolve(PROJECT_ROOT, 'uploads', sourceFilename);
      const altPath = resolve(PROJECT_ROOT, 'Ai videos', sourceFilename);
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, filepath);
      } else if (existsSync(altPath)) {
        copyFileSync(altPath, filepath);
      } else {
        const cleanBase64 = videoData.replace(/^data:video\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        writeFileSync(filepath, buffer);
      }
    } else {
      const cleanBase64 = String(videoData).replace(/^data:video\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      writeFileSync(filepath, buffer);
    }

    // Save thumbnail if provided, otherwise schedule background extraction
    let thumbnailFile = null;
    if (imageData) {
      if (imageData.includes('/uploads/')) {
        const parts = imageData.split('/uploads/');
        const filenameOnly = parts[parts.length - 1];
        const sourcePath = resolve(PROJECT_ROOT, 'uploads', filenameOnly);
        if (existsSync(sourcePath)) {
          thumbnailFile = filenameOnly;
        }
      } else {
        const thumbFilename = `user-reel-cover-${reelId}.jpg`;
        const thumbFilepath = resolve(PROJECT_ROOT, 'uploads', thumbFilename);
        const tempPath = resolve(PROJECT_ROOT, 'uploads', `temp-custom-thumb-${reelId}.jpg`);
        const thumbBuffer = Buffer.from(imageData, 'base64');
        writeFileSync(tempPath, thumbBuffer);
        // Optimize in background
        import('../thumbnail-processor.js').then(async ({ optimizeImageJimp }) => {
          try {
            await optimizeImageJimp(tempPath, thumbFilepath, 800);
            try { unlinkSync(tempPath); } catch (e) {}
          } catch (err) {
            console.error('Failed to optimize custom thumbnail:', err);
            writeFileSync(thumbFilepath, thumbBuffer); // Fallback
          }
        });
        thumbnailFile = thumbFilename;
      }
    }

    if (!thumbnailFile) {
      const thumbFilename = `user-reel-cover-${reelId}.jpg`;
      // Run automatic thumbnail generation in the background
      import('../thumbnail-processor.js').then(async ({ generateAutoThumbnail }) => {
        try {
          await generateAutoThumbnail({
            videoPath: filepath,
            category: 'Reels',
            title: title,
            outputFilename: thumbFilename
          });
          db.prepare('UPDATE reels SET thumbnail_file = ? WHERE id = ?').run(thumbFilename, reelId);
          console.log(`[Thumbnail System] Auto-generated cover for reel ${reelId}: ${thumbFilename}`);
        } catch (err) {
          console.error(`[Thumbnail System] Auto-thumbnail generation failed for reel ${reelId}:`, err);
        }
      }).catch((e) => {});
      thumbnailFile = thumbFilename; // Set as default immediately so it's not left empty
    }

    // Get or create creator for the active profile
    let creator = db.prepare('SELECT id FROM creators WHERE name = ?').get(req.profile.name);
    if (!creator) {
      const creatorId = randomUUID();
      const handle = '@' + req.profile.name.toLowerCase().replace(/\s+/g, '');
      let avatarFile = null;
      if (req.profile.avatar_url) {
        avatarFile = decodeURIComponent(req.profile.avatar_url.split('/').pop() || '');
      }
      db.prepare('INSERT INTO creators (id, name, handle, avatar_file) VALUES (?, ?, ?, ?)').run(
        creatorId,
        req.profile.name,
        handle,
        avatarFile
      );
      creator = { id: creatorId };
    }

    const needsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
    const blurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
    const finalBlurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
    const finalOcrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
    const finalTranslatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
    const finalNeutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

    // Insert the reel
    const sortOrder = db.prepare('SELECT COUNT(*) AS n FROM reels').get().n + 1;
    db.prepare(`
      INSERT INTO reels (id, creator_id, video_file, title, description, duration, likes, comments, shares, views, sort_order, location, needs_blur, blur_reason, blur_regions, ocr_text, translated_text, neutralized_text, thumbnail_file)
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reelId,
      creator.id,
      filename,
      (aiResult && aiResult.optimizedHeadline) || title,
      finalNeutralizedText || description || '',
      sortOrder,
      location || null,
      needsBlur,
      blurReason,
      finalBlurRegions,
      finalOcrText,
      finalTranslatedText,
      finalNeutralizedText,
      thumbnailFile
    );

    // Also insert into user_streams table for universal replay support
    const streamVideoUrl = `/media/reels/${filename}`;
    db.prepare(`
      INSERT OR REPLACE INTO user_streams 
      (id, user_id, profile_id, stream_title, description, category, stream_type, stream_status, live_stream_url, recorded_video_url, duration, started_at, total_views, peak_viewers, recording_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'General', 'public', 'completed', ?, ?, 30, ?, 0, 0, 'Completed', ?, ?)
    `).run(
      reelId,
      req.user?.id || 'system',
      req.profile?.id || 'p1',
      (aiResult && aiResult.optimizedHeadline) || title,
      description || '',
      streamVideoUrl,
      streamVideoUrl,
      Date.now(),
      new Date().toISOString(),
      new Date().toISOString()
    );

    const newReel = db.prepare(`
      SELECT r.*, c.name AS creator_name, c.handle, c.avatar_file
      FROM reels r JOIN creators c ON c.id = r.creator_id
      WHERE r.id = ?
    `).get(reelId);

    res.status(201).json(serialize(req, newReel, req.profile.id));
  } catch (err) {
    console.error('Failed to upload reel:', err);
    res.status(500).json({ error: 'Failed to upload reel' });
  }
});

// DELETE /api/reels/:id - Delete a reel
router.delete('/:id', (req, res) => {
  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(req.params.id);
  if (!reel) {
    return res.status(404).json({ error: 'Reel not found' });
  }

  // Resolve creator name
  const creator = db.prepare('SELECT name FROM creators WHERE id = ?').get(reel.creator_id);
  if (!creator) {
    return res.status(404).json({ error: 'Creator not found' });
  }

  // Deletion rules: Creator or Super Admin can delete
  const isCreator = creator.name === req.profile?.name;
  const isAdmin = req.user.role === 'super_admin';
  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: 'You are not authorized to delete this reel' });
  }

  // Delete associated video file from Ai videos folder
  try {
    const filepath = resolve(PROJECT_ROOT, 'Ai videos', reel.video_file);
    unlinkSync(filepath);
  } catch (e) {
    // Ignore
  }

  db.prepare('DELETE FROM reels WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
