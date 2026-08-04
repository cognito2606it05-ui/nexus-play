import { db } from './src/db.js';

try {
  // 1. Delete fake sample streams s101..s110
  const del = db.prepare("DELETE FROM user_streams WHERE id LIKE 's10%' OR id LIKE 's11%'").run();
  console.log(`Deleted ${del.changes} fake sample streams from user_streams table.`);

  // 2. Fetch all remaining user_streams
  const streams = db.prepare("SELECT id, stream_title, recorded_video_url, live_stream_url FROM user_streams").all();
  console.log(`Found ${streams.length} real user streams:`);

  // Local fallback video files that exist in uploads
  const defaultVideo = '/media/uploads/intro.mp4';

  const updateStmt = db.prepare("UPDATE user_streams SET recorded_video_url = ?, live_stream_url = ? WHERE id = ?");

  for (const s of streams) {
    let recUrl = s.recorded_video_url;
    if (!recUrl || recUrl.includes('gtv-videos-bucket') || recUrl.includes('sample/')) {
      recUrl = defaultVideo;
    }
    let liveUrl = s.live_stream_url;
    if (!liveUrl || liveUrl.includes('gtv-videos-bucket') || liveUrl.includes('sample/')) {
      liveUrl = defaultVideo;
    }
    updateStmt.run(recUrl, liveUrl, s.id);
    console.log(`Updated stream ${s.id} ("${s.stream_title}") -> ${recUrl}`);
  }

  console.log('Successfully cleaned user_streams DB!');
} catch (e) {
  console.error('Failed to fix DB:', e);
}
