import { Router } from '../server.js';
import { db, detectRegionAndDistrict, supabase } from '../db.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { publishAll, notify, publishToProfile } from '../events.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROJECT_ROOT, mediaUrl } from '../config.js';
import { getDefaultThumbnailFilename } from '../thumbnail.js';

export const router = Router();

// Wrapper for routes requiring a profile
function withProfile(handler) {
  return (req, res) => {
    resolveProfile(req, res, () => {
      handler(req, res);
    });
  };
}

// In-memory sets to track active viewer profile IDs and their last seen timestamp
const streamViewers = new Map(); // streamId -> Set of profileIds
const streamViewerLastSeen = new Map(); // streamId -> Map of profileId -> timestamp
export const activeTranscripts = new Map(); // streamId -> Array of { start, end, text }

async function stopStreamRecordingAndUpload(stream, newsId, req) {
  const streamId = stream.id;
  const durationSecs = Math.max(1, Math.ceil((Date.now() - stream.started_at) / 1000));
  const endedAtTime = Date.now();
  const nowStr = new Date().toISOString();

  // First, transition to Processing
  try {
    db.prepare(`
      UPDATE user_streams 
      SET stream_status = 'completed', recording_status = 'Processing...', duration = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `).run(durationSecs, endedAtTime, nowStr, streamId);
  } catch (err) {
    console.error('Failed to update user_streams processing status:', err);
  }

  // Auto-archive stream recording as past news item
  let filename = `stream-archive-${streamId}.mp4`;
  let videoUrl = mediaUrl(req, 'uploads', filename);
  let isSupabaseUploaded = false;
  let thumbFilename = `stream-thumb-${streamId}.jpg`;

  try {
    // Use real-time RTMP recorded file if present; fallback to copying intro.mp4
    const localVideoPath = resolve(PROJECT_ROOT, 'uploads', filename);
    const introPath = resolve(PROJECT_ROOT, 'uploads', 'intro.mp4');
    if (!existsSync(localVideoPath)) {
      if (existsSync(introPath)) {
        writeFileSync(localVideoPath, readFileSync(introPath));
      }
    }

    // Update database status to Uploading
    db.prepare("UPDATE user_streams SET recording_status = 'Uploading...', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), streamId);

    // Upload video archive file to Supabase Storage bucket
    if (supabase) {
      try {
        // Create bucket if not exists
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        if (!listError) {
          const bucketExists = buckets && buckets.find(b => b.name === 'live-stream-recordings');
          if (!bucketExists) {
            await supabase.storage.createBucket('live-stream-recordings', { public: true });
          }
        }

        if (existsSync(localVideoPath)) {
          const fileBuffer = readFileSync(localVideoPath);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('live-stream-recordings')
            .upload(filename, fileBuffer, {
              contentType: 'video/mp4',
              upsert: true
            });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from('live-stream-recordings')
              .getPublicUrl(filename);
            if (publicUrlData && publicUrlData.publicUrl) {
              const introUrl = mediaUrl(req, 'uploads', 'intro.mp4');
              const postUrl = mediaUrl(req, 'uploads', 'post.mp4');
              videoUrl = JSON.stringify([introUrl, publicUrlData.publicUrl, postUrl]);
              isSupabaseUploaded = true;
              console.log('Successfully saved stream recording to Supabase Storage (playlist):', videoUrl);
            }
          } else {
            console.error('Failed to upload stream recording to Supabase Storage:', uploadError);
          }
        }
      } catch (storageErr) {
        console.error('Error uploading stream recording to Supabase:', storageErr);
      }
    }

    // Generate automatic thumbnail for the archived live stream recording
    let thumbUrl = mediaUrl(req, 'uploads', getDefaultThumbnailFilename(stream.category, 'live'));
    
    try {
      const { generateAutoThumbnail } = await import('../thumbnail-processor.js');
      const genThumbFilename = `stream-rec-cover-${streamId}.jpg`;
      const localPathToExtract = existsSync(localVideoPath) ? localVideoPath : introPath;
      
      await generateAutoThumbnail({
        videoPath: localPathToExtract,
        category: 'Live TV',
        title: stream.title,
        outputFilename: genThumbFilename
      });

      // Upload thumbnail to Supabase
      const thumbPath = resolve(PROJECT_ROOT, 'uploads', genThumbFilename);
      if (supabase && existsSync(thumbPath)) {
        const { data: thumbUpload, error: thumbUploadError } = await supabase.storage
          .from('live-stream-recordings')
          .upload(genThumbFilename, readFileSync(thumbPath), {
            contentType: 'image/jpeg',
            upsert: true
          });
        if (!thumbUploadError) {
          const { data: thumbUrlData } = supabase.storage
            .from('live-stream-recordings')
            .getPublicUrl(genThumbFilename);
          if (thumbUrlData && thumbUrlData.publicUrl) {
            thumbUrl = thumbUrlData.publicUrl;
            console.log('Successfully uploaded stream thumbnail to Supabase:', thumbUrl);
          }
        }
      } else {
        thumbUrl = mediaUrl(req, 'uploads', genThumbFilename);
      }

      // Cleanup local generated thumbnail
      try {
        if (existsSync(thumbPath)) {
          unlinkSync(thumbPath);
        }
      } catch (e) {}

    } catch (err) {
      console.error('[Thumbnail System] Failed to generate/upload cover for stream recording:', err);
    }

    // Cleanup local video file
    try {
      if (existsSync(localVideoPath)) {
        unlinkSync(localVideoPath);
      }
    } catch (e) {}

    // Update news table for search (existing archive logic)
    const durationMins = Math.max(1, Math.ceil(durationSecs / 60));
    const finalSummary = `NEXUS AI Summary: Past live broadcast from ${req.profile.name} in category ${stream.category}. Streamed from ${stream.location || 'General'}. Peak viewers: ${stream.peak_viewers}. Duration: ${durationMins} minutes.`;
    
    db.prepare(`
      UPDATE news 
      SET video_url = ?, image_url = ?, summary = ?
      WHERE id = ?
    `).run(videoUrl, thumbUrl, finalSummary, newsId);

    // Compile subtitles to WebVTT format
    const transcripts = activeTranscripts.get(streamId) || [];
    let vttContent = 'WEBVTT\n\n';
    transcripts.forEach((t, idx) => {
      const formatVttTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${hrs}:${mins}:${secs}.${ms}`;
      };
      vttContent += `${idx + 1}\n`;
      vttContent += `${formatVttTime(t.start)} --> ${formatVttTime(t.end)}\n`;
      vttContent += `${t.text}\n\n`;
    });

    const vttFilename = `subtitles-${streamId}.vtt`;
    const vttPath = resolve(PROJECT_ROOT, 'uploads', vttFilename);
    writeFileSync(vttPath, vttContent);
    const subtitlesUrl = mediaUrl(req, 'uploads', vttFilename);
    
    // Cleanup in-memory logs
    activeTranscripts.delete(streamId);

    // Update user_streams table to completed with video, thumb, and subtitles URLs
    db.prepare(`
      UPDATE user_streams 
      SET stream_status = 'completed', recording_status = 'Completed', 
          recorded_video_url = ?, thumbnail_url = ?, subtitles_url = ?, updated_at = ?
      WHERE id = ?
    `).run(
      isSupabaseUploaded ? JSON.parse(videoUrl)[1] : videoUrl,
      thumbUrl,
      subtitlesUrl,
      new Date().toISOString(),
      streamId
    );

    console.log(`[Recording System] Stream ${streamId} finalized successfully.`);

  } catch (err) {
    console.error(`[Recording System] Failed to finalize stream ${streamId}:`, err);
    try {
      db.prepare("UPDATE user_streams SET recording_status = 'Failed', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), streamId);
    } catch (e) {}
  }
}

// GET /api/streams - List active user streams + completed user streams (archives)
router.get('/', (req, res) => {
  const threshold = Date.now() - 30 * 1000;
  try {
    // 1. Fetch active live streams
    const activeStreams = db.prepare(`
      SELECT s.*, p.name AS profile_name, p.avatar_url AS profile_avatar 
      FROM live_streams s 
      JOIN profiles p ON s.profile_id = p.id 
      WHERE s.ended = 0 AND s.last_seen > ? 
      ORDER BY s.started_at DESC
    `).all(threshold);

    // 2. Fetch completed user streams
    const completedStreams = db.prepare(`
      SELECT u.id, u.profile_id, u.user_id, u.stream_title AS title, u.category, 
             u.duration, u.started_at, u.total_views AS viewers, u.peak_viewers, 
             u.recorded_video_url, u.thumbnail_url, u.subtitles_url, u.description, u.location,
             COALESCE(p.name, 'Broadcaster') AS profile_name, p.avatar_url AS profile_avatar
      FROM user_streams u
      LEFT JOIN profiles p ON u.profile_id = p.id
      ORDER BY u.started_at DESC
      LIMIT 100
    `).all();

    const active = activeStreams.map(s => ({
      ...s,
      isLive: true,
      videoUrl: s.video_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    }));

    const completed = completedStreams.map(s => {
      let finalVideoUrl = s.recorded_video_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      if (typeof finalVideoUrl === 'string' && finalVideoUrl.startsWith('[')) {
        try {
          const arr = JSON.parse(finalVideoUrl);
          finalVideoUrl = arr[1] || arr[0] || finalVideoUrl;
        } catch (e) {}
      }
      return {
        ...s,
        isLive: false,
        ended: 1,
        videoUrl: finalVideoUrl
      };
    });

    // 3. Fetch Official Live TV Channels
    let tvChannels = [];
    try {
      const tvRows = db.prepare("SELECT * FROM live_tv_channels").all();
      tvChannels = tvRows.map(r => ({
        id: r.id,
        title: `📺 ${r.name} (Live Broadcast)`,
        profile_name: 'Official Live TV Channel',
        category: r.category || 'Live TV',
        isLive: true,
        viewers: r.viewers || 1,
        videoUrl: r.video_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnail_url: r.image_url || r.logo_url || 'https://picsum.photos/seed/tvlive/800/450',
        created_at: new Date().toISOString()
      }));
    } catch (e) {}

    // 4. Fetch News Video Stories and Auto-Archived Live Streams
    let newsVideos = [];
    try {
      const userStreamIds = new Set(completedStreams.map(c => c.id));
      const newsRows = db.prepare("SELECT id, title, category, video_url, image_url, source, published_at FROM news WHERE video_url IS NOT NULL AND video_url != '' ORDER BY published_at DESC LIMIT 50").all();
      newsVideos = newsRows
        .filter(n => !userStreamIds.has(n.id) && !userStreamIds.has(n.id.replace('stream-rec-', '')))
        .map(n => ({
          id: n.id,
          title: n.title,
          profile_name: n.source || 'NEXUS Network',
          category: n.category || 'News Video',
          isLive: false,
          ended: 1,
          viewers: Math.floor(Math.random() * 40) + 1,
          videoUrl: n.video_url,
          thumbnail_url: n.image_url,
          created_at: n.published_at || new Date().toISOString()
        }));
    } catch (e) {}

    // Deduplicate by ID
    const map = new Map();
    [...active, ...tvChannels, ...completed, ...newsVideos].forEach(item => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    });

    res.json({ data: Array.from(map.values()) });
  } catch (err) {
    console.error('Failed to list user streams:', err);
    res.status(500).json({ error: 'Failed to list user streams' });
  }
});

// POST /api/streams/start - Start a live stream
router.post('/start', requireRole(['super_admin', 'news_reader', 'user', 'reporter']), withProfile((req, res) => {
  const { title, category, location } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'Title is required to start a live stream' });
  }

  // End any previous active streams for this profile
  db.prepare('UPDATE live_streams SET ended = 1 WHERE profile_id = ? AND ended = 0').run(req.profile.id);

  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO live_streams (id, profile_id, user_id, title, category, location, started_at, last_seen, viewers, peak_viewers, ended)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
  `).run(id, req.profile.id, req.user.id, title, category || 'General', location || null, now, now);

  const nowStr = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_streams (
      id, user_id, profile_id, stream_title, description, category, stream_type,
      stream_status, live_stream_url, recorded_video_url, thumbnail_url, duration,
      started_at, ended_at, total_views, peak_viewers, total_likes, total_comments, total_shares,
      recording_status, storage_provider, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?, NULL, NULL, 0, ?, NULL, 0, 0, 0, 0, 0, 'Recording...', 'Supabase', ?, ?)
  `).run(
    id,
    req.user.id,
    req.profile.id,
    title,
    req.body.description || '',
    category || 'General',
    req.body.streamType || 'public',
    `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`,
    now,
    nowStr,
    nowStr
  );

  const stream = db.prepare(`
    SELECT s.*, p.name AS profile_name, p.avatar_url AS profile_avatar 
    FROM live_streams s 
    JOIN profiles p ON s.profile_id = p.id 
    WHERE s.id = ?
  `).get(id);

  // Publish SSE event
  publishAll({
    type: 'live_stream_started',
    payload: stream
  });

  // Notify other users
  const otherUsers = db.prepare('SELECT id FROM users WHERE id != ?').all(req.user.id);
  for (const u of otherUsers) {
    notify(u.id, {
      type: 'live_stream',
      title: `${req.profile.name} went live!`,
      body: `Watch: "${title}" in category ${category || 'General'}`,
      data: { streamId: id }
    });
  }

  res.status(201).json(stream);
}));

// GET /api/streams/official-channels - Fetch official TV channels
router.get('/official-channels', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM live_tv_channels WHERE is_official = 1').all();
    const formatted = rows.map(r => ({
      id: r.id,
      name: r.name,
      cat: r.category,
      now: r.now_playing || '',
      next: r.next_up || '',
      isOfficial: !!r.is_official,
      viewers: r.viewers || 0,
      videoUrl: r.video_url
    }));
    res.json({ data: formatted });
  } catch (err) {
    console.error('Failed to fetch official channels:', err);
    res.status(500).json({ error: 'Failed to retrieve official TV channels' });
  }
});

// POST /api/streams/official-channels - Create a TV channel (Admin only)
router.post('/official-channels', requireRole(['super_admin']), (req, res) => {
  const { name, category, now_playing, next_up, video_url } = req.body || {};
  if (!name || !category || !video_url) {
    return res.status(400).json({ error: 'name, category, and video_url are required' });
  }
  const id = randomUUID();
  try {
    db.prepare(`
      INSERT INTO live_tv_channels (id, name, category, now_playing, next_up, is_official, viewers, video_url)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?)
    `).run(id, name, category, now_playing || '', next_up || '', video_url);

    res.status(201).json({ id, name, cat: category, now: now_playing, next: next_up, isOfficial: true, viewers: 0, videoUrl: video_url });
  } catch (err) {
    console.error('Failed to create official channel:', err);
    res.status(500).json({ error: 'Failed to create official TV channel' });
  }
});

// PATCH /api/streams/official-channels/:id - Update a TV channel (Admin only)
router.patch('/official-channels/:id', requireRole(['super_admin']), (req, res) => {
  const channel = db.prepare('SELECT * FROM live_tv_channels WHERE id = ?').get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const { name, category, now_playing, next_up, video_url, viewers } = req.body || {};
  try {
    db.prepare(`
      UPDATE live_tv_channels 
      SET name = ?, category = ?, now_playing = ?, next_up = ?, viewers = ?, video_url = ?
      WHERE id = ?
    `).run(
      name ?? channel.name,
      category ?? channel.category,
      now_playing ?? channel.now_playing,
      next_up ?? channel.next_up,
      viewers ?? (viewers === undefined ? channel.viewers : viewers),
      video_url ?? channel.video_url,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM live_tv_channels WHERE id = ?').get(req.params.id);
    res.json({
      id: updated.id,
      name: updated.name,
      cat: updated.category,
      now: updated.now_playing,
      next: updated.next_up,
      isOfficial: !!updated.is_official,
      viewers: updated.viewers,
      videoUrl: updated.video_url
    });
  } catch (err) {
    console.error('Failed to update official channel:', err);
    res.status(500).json({ error: 'Failed to update official TV channel' });
  }
});

// DELETE /api/streams/official-channels/:id - Delete a TV channel (Admin only)
router.delete('/official-channels/:id', requireRole(['super_admin']), (req, res) => {
  try {
    const info = db.prepare('DELETE FROM live_tv_channels WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete official channel:', err);
    res.status(500).json({ error: 'Failed to delete official TV channel' });
  }
});

// GET /api/streams/:id - Get stream details
router.get('/:id', (req, res) => {
  try {
    const userStream = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(req.params.id);
    if (userStream) {
      return res.json({ data: userStream });
    }

    const stream = db.prepare(`
      SELECT s.*, p.name AS profile_name, p.avatar_url AS profile_avatar 
      FROM live_streams s 
      JOIN profiles p ON s.profile_id = p.id 
      WHERE s.id = ?
    `).get(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({ data: stream });
  } catch (err) {
    console.error('Failed to get stream details:', err);
    res.status(500).json({ error: 'Failed to retrieve stream details' });
  }
});

// POST /api/streams/:id/stop - Stop a live stream
router.post('/:id/stop', withProfile(async (req, res) => {
  const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  if (stream.profile_id !== req.profile.id) {
    return res.status(403).json({ error: 'You do not own this live stream' });
  }

  db.prepare('UPDATE live_streams SET ended = 1 WHERE id = ?').run(stream.id);

  // Clean up viewers tracking
  streamViewers.delete(stream.id);
  streamViewerLastSeen.delete(stream.id);

  // Auto-archive stream recording as past news item
  const newsId = `stream-rec-${stream.id}`;
  const nowStr = new Date().toISOString();
  const durationMins = Math.max(1, Math.ceil((Date.now() - stream.started_at) / 60000));
  
  // Detect location using helper
  const { region, district } = detectRegionAndDistrict(stream.title, '');
  
  const aiTitle = `[AI Stream Recording] ${stream.title}`;
  const aiSummary = `NEXUS AI Summary: Past live broadcast from ${req.profile.name} in category ${stream.category}. This stream took place on ${new Date(stream.started_at).toLocaleDateString()} and ran for ${durationMins} minutes.`;
  const aiBody = `This is the auto-archived recording of the live stream '${stream.title}' by developer ${req.profile.name}. NEXUS Play AI has detected this recording contains relevant news content matching ${region} ${district ? `(${district} District)` : ''}.`;
  
  const thumbFile = getDefaultThumbnailFilename(stream.category, 'live');
  const recordingThumbnailUrl = mediaUrl(req, 'uploads', thumbFile);
  let videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  try {
    db.prepare(`
      INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district)
      VALUES (?, ?, ?, ?, 'Past Live Streams', ?, 0, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url
    `).run(
      newsId,
      aiTitle,
      aiSummary,
      aiBody,
      req.profile.name,
      recordingThumbnailUrl,
      videoUrl,
      durationMins,
      nowStr,
      region,
      district
    );
  } catch (err) {
    console.error('Failed to create news record:', err);
  }

  // Trigger background process
  stopStreamRecordingAndUpload(stream, newsId, req).catch(err => {
    console.error('Failed to run stopStreamRecordingAndUpload background task:', err);
  });

  // Publish SSE event
  publishAll({
    type: 'live_stream_ended',
    payload: { id: stream.id }
  });

  res.json({ success: true });
}));;

// POST /api/streams/:id/transcript - Send live transcript chunks (Reporters only)
router.post('/:id/transcript', (req, res) => {
  const { id } = req.params;
  const { text, elapsedSecs } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'Text transcript is required' });
  }

  // 1. Broadcast the transcript to all viewers of the live stream
  publishAll({
    type: 'live_transcript',
    payload: {
      streamId: id,
      text,
      elapsedSecs: elapsedSecs || 0
    }
  });

  // 2. Log transcripts for VTT generation
  if (!activeTranscripts.has(id)) {
    activeTranscripts.set(id, []);
  }

  const list = activeTranscripts.get(id);
  const start = elapsedSecs || 0;
  const end = start + 4; // Subtitle displays for 4 seconds by default
  list.push({ start, end, text });

  res.json({ success: true });
});

// POST /api/streams/:id/heartbeat - Keep stream active & update viewers count
router.post('/:id/heartbeat', withProfile((req, res) => {
  const streamId = req.params.id;
  const profileId = req.profile.id;
  const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(streamId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  const now = Date.now();
  if (stream.profile_id === profileId) {
    // Heartbeat from streamer: keeps the stream alive
    db.prepare('UPDATE live_streams SET last_seen = ? WHERE id = ?').run(now, streamId);
  } else {
    // Heartbeat from viewer: track in-memory active viewers
    if (!streamViewers.has(streamId)) {
      streamViewers.set(streamId, new Set());
      streamViewerLastSeen.set(streamId, new Map());
    }
    streamViewers.get(streamId).add(profileId);
    streamViewerLastSeen.get(streamId).set(profileId, now);
  }

  // Prune inactive viewers (no heartbeat in last 15 seconds)
  if (streamViewers.has(streamId)) {
    const viewersSet = streamViewers.get(streamId);
    const lastSeenMap = streamViewerLastSeen.get(streamId);
    for (const [vId, ts] of lastSeenMap.entries()) {
      if (now - ts > 15000) {
        viewersSet.delete(vId);
        lastSeenMap.delete(vId);
      }
    }
    const currentViewers = viewersSet.size;
    db.prepare('UPDATE live_streams SET viewers = ?, peak_viewers = MAX(peak_viewers, ?) WHERE id = ?')
      .run(currentViewers, currentViewers, streamId);
    db.prepare('UPDATE user_streams SET peak_viewers = GREATEST(peak_viewers, ?), total_views = total_views + 1, updated_at = ? WHERE id = ?')
      .run(currentViewers, new Date().toISOString(), streamId);
  }

  const updated = db.prepare('SELECT viewers, peak_viewers FROM live_streams WHERE id = ?').get(streamId);
  publishAll({
    type: 'live_stream_viewers_update',
    payload: {
      streamId,
      viewers: updated.viewers,
      peakViewers: updated.peak_viewers
    }
  });

  res.json({
    success: true,
    viewers: updated.viewers,
    peakViewers: updated.peak_viewers
  });
}));

// POST /api/streams/:id/thumbnail - Upload live preview frame for thumbnail evaluation
router.post('/:id/thumbnail', withProfile(async (req, res) => {
  const streamId = req.params.id;
  const { imageData } = req.body || {};
  if (!imageData) {
    return res.status(400).json({ error: 'imageData is required' });
  }

  try {
    const { evaluateAndSaveLiveThumbnail } = await import('../thumbnail.js');
    const result = await evaluateAndSaveLiveThumbnail(streamId, imageData);
    res.json(result);
  } catch (err) {
    console.error('Failed to process live stream thumbnail:', err);
    res.status(500).json({ error: err.message || 'Failed to process thumbnail' });
  }
}));

// POST /api/streams/:id/chat - Send a chat message in a stream
router.post('/:id/chat', withProfile((req, res) => {
  const streamId = req.params.id;
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(streamId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO live_chat (id, stream_id, profile_id, name, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, streamId, req.profile.id, req.profile.name, message, now);

  db.prepare('UPDATE user_streams SET total_comments = total_comments + 1 WHERE id = ?').run(streamId);

  const chatMessage = {
    id,
    streamId,
    profileId: req.profile.id,
    name: req.profile.name,
    message,
    createdAt: now
  };

  // Publish to all clients
  publishAll({
    type: 'live_chat_message',
    payload: chatMessage
  });

  res.status(201).json(chatMessage);
}));

// GET /api/streams/:id/chat - Get chat messages for a stream
router.get('/:id/chat', (req, res) => {
  const rows = db.prepare('SELECT * FROM live_chat WHERE stream_id = ? ORDER BY created_at ASC LIMIT 100').all(req.params.id);
  const formatted = rows.map(r => ({
    id: r.id,
    streamId: r.stream_id,
    profileId: r.profile_id,
    name: r.name,
    message: r.message,
    createdAt: r.created_at
  }));

  res.json({ data: formatted });
});

// POST /api/streams/:id/signal - WebRTC signaling relay between profile channels
router.post('/:id/signal', withProfile((req, res) => {
  const { targetProfileId, signal } = req.body || {};
  if (!targetProfileId || !signal) {
    return res.status(400).json({ error: 'targetProfileId and signal are required' });
  }

  // Publish to target profile via SSE
  publishToProfile(targetProfileId, {
    type: 'live_stream_signal',
    payload: {
      streamId: req.params.id,
      senderProfileId: req.profile.id,
      senderName: req.profile.name,
      signal
    }
  });

  res.json({ success: true });
}));

// POST /api/streams/upload-voice - Upload base64 recorded audio
router.post('/upload-voice', withProfile((req, res) => {
  const { audioData } = req.body || {};
  if (!audioData) {
    return res.status(400).json({ error: 'audioData is required' });
  }

  try {
    const filename = `voice-${randomUUID()}.webm`;
    const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
    const commaIndex = audioData.indexOf(',');
    const base64Content = commaIndex !== -1 ? audioData.slice(commaIndex + 1) : audioData;
    const buffer = Buffer.from(base64Content, 'base64');
    
    writeFileSync(filepath, buffer);
    const audioUrl = `/media/uploads/${filename}`;
    res.json({ audioUrl });
  } catch (err) {
    console.error('Failed to save voice note:', err);
    res.status(500).json({ error: 'Failed to save voice note' });
  }
}));

// POST /api/streams/:id/leave - Explicitly leave a stream to decrement viewer counts
router.post('/:id/leave', withProfile((req, res) => {
  const streamId = req.params.id;
  const profileId = req.profile.id;

  if (streamViewers.has(streamId)) {
    const viewersSet = streamViewers.get(streamId);
    const lastSeenMap = streamViewerLastSeen.get(streamId);
    viewersSet.delete(profileId);
    lastSeenMap.delete(profileId);

    const currentViewers = viewersSet.size;
    db.prepare('UPDATE live_streams SET viewers = ?, peak_viewers = MAX(peak_viewers, ?) WHERE id = ?')
      .run(currentViewers, currentViewers, streamId);

    const updated = db.prepare('SELECT viewers, peak_viewers FROM live_streams WHERE id = ?').get(streamId);
    publishAll({
      type: 'live_stream_viewers_update',
      payload: {
        streamId,
        viewers: updated.viewers,
        peakViewers: updated.peak_viewers
      }
    });
  }

  res.json({ success: true });
}));

// POST /api/streams/end - Stop stream via direct endpoint
router.post('/end', withProfile(async (req, res) => {
  const { streamId } = req.body || {};
  if (!streamId) {
    return res.status(400).json({ error: 'streamId is required in request body' });
  }

  const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(streamId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  if (stream.profile_id !== req.profile.id) {
    return res.status(403).json({ error: 'You do not own this live stream' });
  }

  db.prepare('UPDATE live_streams SET ended = 1 WHERE id = ?').run(stream.id);

  streamViewers.delete(stream.id);
  streamViewerLastSeen.delete(stream.id);

  const newsId = `stream-rec-${stream.id}`;
  const nowStr = new Date().toISOString();
  const durationMins = Math.max(1, Math.ceil((Date.now() - stream.started_at) / 60000));
  const { region, district } = detectRegionAndDistrict(stream.title, '');
  const aiTitle = `[AI Stream Recording] ${stream.title}`;
  const aiSummary = `NEXUS AI Summary: Past live broadcast from ${req.profile.name} in category ${stream.category}.`;
  const aiBody = `This is the auto-archived recording of the live stream '${stream.title}'.`;
  const thumbFile = getDefaultThumbnailFilename(stream.category, 'live');
  const recordingThumbnailUrl = mediaUrl(req, 'uploads', thumbFile);
  let videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  try {
    db.prepare(`
      INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district)
      VALUES (?, ?, ?, ?, 'Past Live Streams', ?, 0, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url
    `).run(newsId, aiTitle, aiSummary, aiBody, req.profile.name, recordingThumbnailUrl, videoUrl, durationMins, nowStr, region, district);
  } catch (err) {
    console.error('Failed to create news record:', err);
  }

  // Trigger background process
  stopStreamRecordingAndUpload(stream, newsId, req).catch(err => {
    console.error('Failed to run stopStreamRecordingAndUpload background task:', err);
  });

  publishAll({
    type: 'live_stream_ended',
    payload: { id: stream.id }
  });

  res.json({ success: true });
}));

// GET /api/streams/user/:userId - Retrieve all user streams (supports userId or profileId)
router.get('/user/:userId', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM user_streams WHERE user_id = ? OR profile_id = ? ORDER BY started_at DESC').all(req.params.userId, req.params.userId);
    res.json({ data: rows });
  } catch (err) {
    console.error('Failed to get user streams:', err);
    res.status(500).json({ error: 'Failed to retrieve user streams' });
  }
});

// PUT /api/streams/:id - Update user stream details
router.put('/:id', withProfile(async (req, res) => {
  const { title, description, category, streamType, thumbnailData } = req.body || {};
  const stream = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  if (stream.profile_id !== req.profile.id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'You are not authorized to edit this stream' });
  }

  let finalThumbnail = stream.thumbnail_url;
  
  if (thumbnailData) {
    const filename = `stream-custom-thumb-${stream.id}.jpg`;
    const localPath = resolve(PROJECT_ROOT, 'uploads', filename);
    
    try {
      const buffer = Buffer.from(thumbnailData, 'base64');
      const tempPath = resolve(PROJECT_ROOT, 'uploads', `temp-stream-custom-${stream.id}.jpg`);
      writeFileSync(tempPath, buffer);
      
      const { optimizeImageJimp } = await import('../thumbnail-processor.js');
      await optimizeImageJimp(tempPath, localPath, 800);
      try { unlinkSync(tempPath); } catch (e) {}

      if (supabase) {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('live-stream-recordings')
          .upload(filename, readFileSync(localPath), {
            contentType: 'image/jpeg',
            upsert: true
          });
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('live-stream-recordings')
            .getPublicUrl(filename);
          if (publicUrlData && publicUrlData.publicUrl) {
            finalThumbnail = publicUrlData.publicUrl;
          }
        }
      } else {
        finalThumbnail = mediaUrl(req, 'uploads', filename);
      }

      try {
        if (existsSync(localPath)) unlinkSync(localPath);
      } catch (e) {}
    } catch (err) {
      console.error('Failed to process custom thumbnail update:', err);
    }
  }

  try {
    db.prepare(`
      UPDATE user_streams
      SET stream_title = ?, description = ?, category = ?, stream_type = ?, thumbnail_url = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title ?? stream.stream_title,
      description ?? stream.description,
      category ?? stream.category,
      streamType ?? stream.stream_type,
      finalThumbnail,
      new Date().toISOString(),
      stream.id
    );

    const updated = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(stream.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update stream:', err);
    res.status(500).json({ error: 'Failed to update stream' });
  }
}));

// DELETE /api/streams/:id - Delete a user stream
router.delete('/:id', withProfile(async (req, res) => {
  const stream = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  if (stream.profile_id !== req.profile.id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'You are not authorized to delete this stream' });
  }

  if (supabase) {
    const filename = `stream-archive-${stream.id}.mp4`;
    const thumbFilename = `stream-rec-cover-${stream.id}.jpg`;
    const customThumbFilename = `stream-custom-thumb-${stream.id}.jpg`;
    try {
      await supabase.storage.from('live-stream-recordings').remove([filename, thumbFilename, customThumbFilename]);
    } catch (e) {
      console.error('Failed to clean up files in storage:', e);
    }
  }

  db.prepare('DELETE FROM user_streams WHERE id = ?').run(stream.id);
  res.json({ success: true });
}));
