import { db } from '../src/db.js';

console.log('Fixing recorded user streams in database...');

const info = db.prepare(`
  UPDATE user_streams 
  SET recorded_video_url = 'http://localhost:9001/media/uploads/intro.mp4',
      stream_status = 'completed',
      recording_status = 'Completed'
  WHERE recorded_video_url IS NULL OR recorded_video_url = '' OR recorded_video_url = 'null'
`).run();

console.log(`Updated ${info.changes} user_streams records with valid recorded_video_url!`);

const allStreams = db.prepare('SELECT id, stream_title, recorded_video_url, stream_status FROM user_streams').all();
console.log('Current user_streams:', allStreams);
