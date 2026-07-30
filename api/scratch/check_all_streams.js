import { db } from '../src/db.js';

console.log('--- USER_STREAMS ---');
const userStreams = db.prepare('SELECT * FROM user_streams').all();
console.log(`Count: ${userStreams.length}`);

console.log('--- LIVE_STREAMS ---');
const liveStreams = db.prepare('SELECT * FROM live_streams').all();
console.log(`Count: ${liveStreams.length}`);

console.log('--- LIVE_TV_CHANNELS ---');
const liveTv = db.prepare('SELECT * FROM live_tv_channels').all();
console.log(`Count: ${liveTv.length}`);
console.log(liveTv);

console.log('--- NEWS WITH VIDEOS ---');
const newsVideos = db.prepare("SELECT id, title, category, video_url, image_url, published_at FROM news WHERE video_url IS NOT NULL AND video_url != ''").all();
console.log(`Count: ${newsVideos.length}`);
console.log(newsVideos);

console.log('--- REELS WITH VIDEOS ---');
try {
  const reels = db.prepare("SELECT id, title, video_url, thumbnail_url, created_at FROM reels").all();
  console.log(`Count: ${reels.length}`);
  console.log(reels);
} catch (e) {
  console.log('No reels table or error:', e.message);
}
