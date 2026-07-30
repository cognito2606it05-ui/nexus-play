

import { db } from '../src/db.js';

console.log("=== USER STREAMS ===");
console.log(db.prepare("SELECT id, stream_title FROM user_streams LIMIT 10").all());

console.log("=== LIVE STREAMS ===");
console.log(db.prepare("SELECT id, stream_title FROM live_streams LIMIT 10").all());

console.log("=== LIVE TV CHANNELS ===");
console.log(db.prepare("SELECT id, name FROM live_tv_channels LIMIT 10").all());

console.log("=== NEWS VIDEOS ===");
console.log(db.prepare("SELECT id, title FROM news WHERE video_url IS NOT NULL LIMIT 10").all());
