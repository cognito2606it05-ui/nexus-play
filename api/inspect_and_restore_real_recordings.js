import { db } from './src/db.js';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from './src/config.js';

try {
  const uploadsDir = resolve(PROJECT_ROOT, 'uploads');
  const allUploadFiles = readdirSync(uploadsDir);

  // Find all stream recording files
  const recordingFiles = allUploadFiles.filter(f => 
    (f.startsWith('stream-recording-') || f.startsWith('stream-archive-')) && f.endsWith('.mp4')
  );

  const profile = db.prepare("SELECT id, user_id, name FROM profiles LIMIT 1").get() || { id: 'p1', user_id: 'u1', name: 'Broadcaster' };

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO user_streams 
    (id, user_id, profile_id, stream_title, description, category, stream_type, stream_status, live_stream_url, recorded_video_url, duration, started_at, total_views, peak_viewers, recording_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'General', 'public', 'completed', ?, ?, ?, ?, 10, 5, 'Completed', ?, ?)
  `);

  for (const file of recordingFiles) {
    // Extract ID from filename (e.g. stream-recording-<id>.mp4 or stream-archive-<id>.mp4)
    let rawId = file.replace('stream-recording-', '').replace('stream-archive-', '').replace('.mp4', '');
    const fullPath = resolve(uploadsDir, file);
    const stats = statSync(fullPath);
    const createdTime = stats.mtimeMs || Date.now();
    const createdIso = new Date(createdTime).toISOString();

    const videoUrl = `/media/uploads/${file}`;
    const title = `Live Broadcast (${rawId.slice(0, 8)})`;

    // Check if exists
    const existing = db.prepare("SELECT id FROM user_streams WHERE id = ?").get(rawId);
    if (!existing) {
      insertStmt.run(
        rawId,
        profile.user_id,
        profile.id,
        title,
        `Recorded live broadcast saved from ${file}`,
        videoUrl,
        videoUrl,
        Math.floor(stats.size / (100 * 1024)), // approximate duration
        createdTime,
        createdIso,
        createdIso
      );
      console.log(`+ Added missing recorded stream ID ${rawId} for file ${file}`);
    } else {
      db.prepare("UPDATE user_streams SET recorded_video_url = ?, live_stream_url = ? WHERE id = ?").run(videoUrl, videoUrl, rawId);
      console.log(`✓ Updated recorded URL for existing stream ID ${rawId} -> ${videoUrl}`);
    }
  }

  const finalStreams = db.prepare("SELECT id, stream_title, recorded_video_url FROM user_streams ORDER BY started_at DESC").all();
  console.log('\n=== ALL REAL LIVE RECORDED VIDEOS IN DATABASE ===');
  console.table(finalStreams);

} catch (err) {
  console.error('Error:', err);
}
