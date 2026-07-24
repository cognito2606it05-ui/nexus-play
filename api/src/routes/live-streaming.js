import { Router } from '../server.js';
import { db, detectRegionAndDistrict, supabase } from '../db.js';
import { requireAuth, resolveProfile, requireRole } from '../auth.js';
import { publishAll, notify } from '../events.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_ROOT, PROJECT_ROOT, mediaUrl } from '../config.js';
import { getDefaultThumbnailFilename } from '../thumbnail.js';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { activeTranscripts } from './streams.js';

export const router = Router();
router.use(requireAuth);

function withProfile(handler) {
  return (req, res) => {
    resolveProfile(req, res, () => {
      handler(req, res);
    });
  };
}

// Helper: Finalize stream recording, generate cover frame, optimize with Jimp, and upload to Supabase Storage
async function finalizeRecordingAndUpload(stream, newsId, req) {
  const streamId = stream.id;
  const durationSecs = Math.max(1, Math.ceil((Date.now() - stream.started_at) / 1000));
  const endedAtTime = Date.now();
  const nowStr = new Date().toISOString();

  // Update status to Completed, recording to Processing...
  try {
    db.prepare(`
      UPDATE user_streams 
      SET stream_status = 'COMPLETED', recording_status = 'Processing...', duration = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `).run(durationSecs, endedAtTime, nowStr, streamId);
  } catch (err) {
    console.error('Failed to update user_streams processing status:', err);
  }

  const filename = `stream-archive-${streamId}.mp4`;
  let videoUrl = mediaUrl(req, 'uploads', filename);
  let isSupabaseUploaded = false;
  const genThumbFilename = `stream-rec-cover-${streamId}.jpg`;

  try {
    const localVideoPath = resolve(PROJECT_ROOT, 'uploads', filename);
    const introPath = resolve(PROJECT_ROOT, 'uploads', 'intro.mp4');
    if (!existsSync(localVideoPath)) {
      if (existsSync(introPath)) {
        writeFileSync(localVideoPath, readFileSync(introPath));
      }
    }

    // Update status to Uploading...
    db.prepare("UPDATE user_streams SET recording_status = 'Uploading...', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), streamId);

    if (supabase) {
      try {
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

    let thumbUrl = mediaUrl(req, 'uploads', getDefaultThumbnailFilename(stream.category, 'live'));
    
    try {
      const { generateAutoThumbnail } = await import('../thumbnail-processor.js');
      const localPathToExtract = existsSync(localVideoPath) ? localVideoPath : introPath;
      
      await generateAutoThumbnail({
        videoPath: localPathToExtract,
        category: 'Live TV',
        title: stream.title,
        outputFilename: genThumbFilename
      });

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

      try {
        if (existsSync(thumbPath)) {
          unlinkSync(thumbPath);
        }
      } catch (e) {}

    } catch (err) {
      console.error('[Thumbnail System] Failed to generate/upload cover for stream recording:', err);
    }

    try {
      if (existsSync(localVideoPath)) {
        unlinkSync(localVideoPath);
      }
    } catch (e) {}

    const durationMins = Math.max(1, Math.ceil(durationSecs / 60));
    const profileName = req.profile?.name || (db.prepare('SELECT name FROM profiles WHERE id = ?').get(stream.profile_id)?.name || 'Creator');
    const finalSummary = `NEXUS AI Summary: Past live broadcast from ${profileName} in category ${stream.category}. Streamed from ${stream.location || 'General'}. Peak viewers: ${stream.peak_viewers}. Duration: ${durationMins} minutes.`;
    
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

    // Update user_streams status to completed/READY with subtitles URL
    db.prepare(`
      UPDATE user_streams 
      SET stream_status = 'COMPLETED', recording_status = 'READY', 
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
      db.prepare("UPDATE user_streams SET recording_status = 'FAILED', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), streamId);
    } catch (e) {}
  }
}

// POST /api/live/start - Start a live stream
router.post('/start', withProfile((req, res) => {
  const { title, category, location, description, streamType } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'Title is required to start a live stream' });
  }

  // End previous active streams
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'LIVE', ?, NULL, NULL, 0, ?, NULL, 0, 0, 0, 0, 0, 'RECORDING', 'Supabase', ?, ?)
  `).run(
    id,
    req.user.id,
    req.profile.id,
    title,
    description || '',
    category || 'General',
    streamType || 'public',
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

  publishAll({
    type: 'live_stream_started',
    payload: stream
  });

  res.status(201).json(stream);
}));

// POST /api/live/end - End a live stream
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
  finalizeRecordingAndUpload(stream, newsId, req).catch(err => {
    console.error('Failed to run finalizeRecordingAndUpload background task:', err);
  });

  publishAll({
    type: 'live_stream_ended',
    payload: { id: stream.id }
  });

  res.json({ success: true });
}));

// Helper: Sweep and finalize stale live streams that did not end cleanly
async function autoCleanupStaleStreams(req) {
  const staleThreshold = Date.now() - 40 * 1000;
  try {
    const staleStreams = db.prepare(`
      SELECT s.* FROM live_streams s
      JOIN user_streams u ON s.id = u.id
      WHERE s.ended = 0 AND s.last_seen < ? AND u.stream_status = 'LIVE'
    `).all(staleThreshold);

    for (const stream of staleStreams) {
      console.log(`[Auto-Cleanup] Ending stale live stream session: ${stream.id}`);
      db.prepare('UPDATE live_streams SET ended = 1 WHERE id = ?').run(stream.id);
      
      const newsId = `stream-rec-${stream.id}`;
      const nowStr = new Date().toISOString();
      const durationMins = Math.max(1, Math.ceil((Date.now() - stream.started_at) / 60000));
      const { region, district } = detectRegionAndDistrict(stream.title, '');
      const aiTitle = `[AI Stream Recording] ${stream.title}`;
      const aiSummary = `NEXUS AI Summary: Past live broadcast from creator in category ${stream.category}.`;
      const aiBody = `This is the auto-archived recording of the live stream '${stream.title}'.`;
      const thumbFile = getDefaultThumbnailFilename(stream.category, 'live');
      const recordingThumbnailUrl = mediaUrl(req, 'uploads', thumbFile);
      let videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

      try {
        db.prepare(`
          INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district)
          VALUES (?, ?, ?, ?, 'Past Live Streams', 'Creator', 0, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url
        `).run(newsId, aiTitle, aiSummary, aiBody, recordingThumbnailUrl, videoUrl, durationMins, nowStr, region, district);
      } catch (e) {}

      finalizeRecordingAndUpload(stream, newsId, req).catch(() => {});
    }
  } catch (err) {
    console.error('Error during stale live stream cleanup sweep:', err);
  }
}

// GET /api/live/user-streams - Retrieve all user streams (supports userId or profileId)
router.get('/user-streams', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }
  await autoCleanupStaleStreams(req);
  try {
    const rows = db.prepare(`
      SELECT u.*, p.name AS creator_name, p.name AS profile_name, p.avatar_url AS profile_avatar
      FROM user_streams u
      JOIN profiles p ON u.profile_id = p.id
      WHERE u.user_id = ? OR u.profile_id = ? 
      ORDER BY u.started_at DESC
    `).all(userId, userId);
    res.json({ data: rows });
  } catch (err) {
    console.error('Failed to get user streams:', err);
    res.status(500).json({ error: 'Failed to retrieve user streams' });
  }
});

// GET /api/live/stream/:id - Get stream details
router.get('/stream/:id', async (req, res) => {
  await autoCleanupStaleStreams(req);
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

// PUT /api/live/stream/:id - Update user stream details
router.put('/stream/:id', withProfile(async (req, res) => {
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
      const commaIndex = thumbnailData.indexOf(',');
      const base64Content = commaIndex !== -1 ? thumbnailData.slice(commaIndex + 1) : thumbnailData;
      const buffer = Buffer.from(base64Content, 'base64');
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

// DELETE /api/live/stream/:id - Delete a user stream
router.delete('/stream/:id', withProfile(async (req, res) => {
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

function transcodeWebmToMp4(inputPath, outputPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      '-y', // overwrite output files
      '-i', inputPath,
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-strict', 'experimental',
      outputPath
    ];
    console.log(`[Transcoding] Running ffmpeg: ${ffmpegPath} ${args.join(' ')}`);
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });
    proc.on('error', (err) => {
      rejectPromise(err);
    });
  });
}

// POST /api/live/stream/:id/recording - Upload the actual recorded stream video file
router.post('/stream/:id/recording', withProfile(async (req, res) => {
  const streamId = req.params.id;
  const { videoData } = req.body || {};
  if (!videoData) {
    return res.status(400).json({ error: 'videoData is required' });
  }

  try {
    const webmFilename = `stream-recording-${streamId}.webm`;
    const webmFilepath = resolve(PROJECT_ROOT, 'uploads', webmFilename);

    const mp4Filename = `stream-recording-${streamId}.mp4`;
    const mp4Filepath = resolve(PROJECT_ROOT, 'uploads', mp4Filename);

    const commaIndex = videoData.indexOf(',');
    const base64Content = commaIndex !== -1 ? videoData.slice(commaIndex + 1) : videoData;
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Save raw WebM to local uploads folder
    writeFileSync(webmFilepath, buffer);
    console.log(`[Recording System] Saved raw client recording for stream ${streamId} to ${webmFilepath}`);

    // Update status to processing transcoding
    db.prepare(`
      UPDATE user_streams 
      SET stream_status = 'completed', recording_status = 'Transcoding...', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), streamId);

    // Asynchronously transcode the webm file to a highly-compatible mp4 format
    const doProcessing = async () => {
      try {
        await transcodeWebmToMp4(webmFilepath, mp4Filepath);
        console.log(`[Recording System] Transcoded webm to mp4 successfully: ${mp4Filepath}`);

        // Clean up raw webm
        try { unlinkSync(webmFilepath); } catch (e) {}

        // Get exact duration of transcoded video
        const { getVideoDuration } = await import('../thumbnail-processor.js');
        const durationSecs = await getVideoDuration(mp4Filepath).catch(() => 0);

        // Upload to Supabase if configured; else local server
        let finalVideoUrl = mediaUrl(req, 'uploads', mp4Filename);
        if (supabase) {
          try {
            console.log(`[Recording System] Uploading mp4 to Supabase...`);
            const fileBuffer = readFileSync(mp4Filepath);
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('live-stream-recordings')
              .upload(mp4Filename, fileBuffer, {
                contentType: 'video/mp4',
                upsert: true
              });
            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage
                .from('live-stream-recordings')
                .getPublicUrl(mp4Filename);
              if (publicUrlData && publicUrlData.publicUrl) {
                finalVideoUrl = publicUrlData.publicUrl;
                console.log(`[Recording System] Uploaded mp4 to Supabase successfully: ${finalVideoUrl}`);
              }
            } else {
              console.error('[Recording System] Supabase mp4 upload error:', uploadError);
            }
          } catch (storageErr) {
            console.error('[Recording System] Failed to upload mp4 to Supabase:', storageErr);
          }
        }

        // Generate thumbnail
        const thumbFilename = `stream-rec-cover-${streamId}.jpg`;
        const thumbFilepath = resolve(PROJECT_ROOT, 'uploads', thumbFilename);
        let thumbUrl = mediaUrl(req, 'uploads', getDefaultThumbnailFilename(null, 'live'));

        try {
          const { generateAutoThumbnail } = await import('../thumbnail-processor.js');
          await generateAutoThumbnail({
            videoPath: mp4Filepath,
            category: 'Live TV',
            title: 'Live Recording',
            outputFilename: thumbFilename
          });

          if (supabase && existsSync(thumbFilepath)) {
            const { data: thumbUpload, error: thumbUploadError } = await supabase.storage
              .from('live-stream-recordings')
              .upload(thumbFilename, readFileSync(thumbFilepath), {
                contentType: 'image/jpeg',
                upsert: true
              });
            if (!thumbUploadError) {
              const { data: thumbUrlData } = supabase.storage
                .from('live-stream-recordings')
                .getPublicUrl(thumbFilename);
              if (thumbUrlData && thumbUrlData.publicUrl) {
                thumbUrl = thumbUrlData.publicUrl;
                console.log('[Recording System] Successfully uploaded thumbnail to Supabase:', thumbUrl);
              }
            }
            try { unlinkSync(thumbFilepath); } catch (e) {}
          } else {
            thumbUrl = mediaUrl(req, 'uploads', thumbFilename);
          }
        } catch (err) {
          console.error('[Recording System] Thumbnail generation failed:', err);
        }

        // Save finalized details in the database
        db.prepare(`
          UPDATE user_streams 
          SET recorded_video_url = ?, thumbnail_url = ?, duration = ?, 
              stream_status = 'completed', recording_status = 'Completed', updated_at = ?
          WHERE id = ?
        `).run(finalVideoUrl, thumbUrl, durationSecs, new Date().toISOString(), streamId);

        // Update news item if it exists
        const newsId = `stream-rec-${streamId}`;
        const durationMins = Math.max(1, Math.ceil(durationSecs / 60));
        const finalSummary = `NEXUS AI Summary: Past live broadcast. Duration: ${durationMins} minutes.`;
        db.prepare(`
          UPDATE news 
          SET video_url = ?, image_url = ?, summary = ?
          WHERE id = ?
        `).run(finalVideoUrl, thumbUrl, finalSummary, newsId);

        console.log(`[Recording System] Stream ${streamId} fully finalized & saved successfully!`);

      } catch (procErr) {
        console.error(`[Recording System] Background processing failed for stream ${streamId}:`, procErr);
        db.prepare(`
          UPDATE user_streams 
          SET recording_status = 'Failed', updated_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), streamId);
      }
    };

    // Run processing in background
    doProcessing();

    res.json({ success: true, url: mediaUrl(req, 'uploads', mp4Filename) });
  } catch (err) {
    console.error(`[Recording System] Failed to save actual recording for stream ${streamId}:`, err);
    res.status(500).json({ error: 'Failed to save actual recording file' });
  }
}));
