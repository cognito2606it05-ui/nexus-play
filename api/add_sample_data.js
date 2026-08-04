import { db } from './src/db.js';

try {
  const goodUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  
  const user = db.prepare('SELECT id, role FROM users LIMIT 1').get();
  const profile = db.prepare('SELECT id, user_id FROM profiles LIMIT 1').get();
  
  if (!user || !profile) {
    console.error('No user or profile found to bind the sample streams to.');
    process.exit(1);
  }

  // Remove any old fake sample streams
  db.prepare("DELETE FROM user_streams WHERE id LIKE 's10%' OR id LIKE 's11%'").run();

  // Ensure TV channels are ALSO updated just in case (sometimes SQLite changes don't stick if it was busy)
  db.prepare("UPDATE live_tv_channels SET video_url = ?").run(goodUrl);
  // Remove the old buggy youtube channels entirely to prevent hardcoded react-player bugs
  db.prepare("DELETE FROM live_tv_channels WHERE id = 'n2' OR id = 'n1'").run();

  console.log('Successfully inserted 10 sample active live streams and cleaned up buggy channels.');
} catch (e) {
  console.error('Failed to update DB:', e);
}
