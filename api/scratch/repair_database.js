import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { generateAutoThumbnail, getVideoDuration } from '../src/thumbnail-processor.js';

const streamId = 'b78fd5eb-7c46-4f7f-b6c1-673fb6b8e3d7';
const mp4Filename = `stream-recording-${streamId}.mp4`;
const mp4Filepath = resolve('../uploads', mp4Filename);
const thumbFilename = `stream-rec-cover-${streamId}.jpg`;

async function repair() {
  if (!existsSync(mp4Filepath)) {
    console.error('File does not exist:', mp4Filepath);
    return;
  }

  const durationSecs = await getVideoDuration(mp4Filepath).catch(() => 0);
  console.log('Video duration:', durationSecs);

  // Generate thumbnail cover in the correct root uploads folder
  console.log('Generating auto thumbnail...');
  await generateAutoThumbnail({
    videoPath: mp4Filepath,
    category: 'Live TV',
    title: 'Live Recording',
    outputFilename: thumbFilename
  });

  const finalVideoUrl = `http://localhost:4000/media/uploads/${mp4Filename}`;
  const thumbUrl = `http://localhost:4000/media/uploads/${thumbFilename}`;

  const db = new DatabaseSync('nexus-play-api-dev.db');

  // Update user_streams
  db.prepare(`
    UPDATE user_streams 
    SET recorded_video_url = ?, thumbnail_url = ?, duration = ?, 
        stream_status = 'completed', recording_status = 'Completed', updated_at = ?
    WHERE id = ?
  `).run(finalVideoUrl, thumbUrl, durationSecs, new Date().toISOString(), streamId);

  // Update news
  const newsId = `stream-rec-${streamId}`;
  const durationMins = Math.max(1, Math.ceil(durationSecs / 60));
  const finalSummary = `NEXUS AI Summary: Past live broadcast. Duration: ${durationMins} minutes.`;
  
  db.prepare(`
    UPDATE news 
    SET video_url = ?, image_url = ?, summary = ?
    WHERE id = ?
  `).run(finalVideoUrl, thumbUrl, finalSummary, newsId);

  console.log('Successfully repaired database entries!');
  
  // Verify news record
  const newsRec = db.prepare('SELECT * FROM news WHERE id = ?').get(newsId);
  console.log('News Record:', newsRec);
  
  // Verify stream record
  const streamRec = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
  console.log('Stream Record:', streamRec);
}

repair().catch(err => {
  console.error('Error during repair:', err);
});
