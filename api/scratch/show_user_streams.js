import { db } from '../src/db.js';
const rows = db.prepare('SELECT id, stream_title, stream_status, recorded_video_url, subtitles_url FROM user_streams').all();
console.log(rows);
