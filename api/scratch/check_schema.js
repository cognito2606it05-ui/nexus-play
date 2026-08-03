import { db } from '../src/db.js';

function checkTable(tableName) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    console.log(`Columns for ${tableName}:`, cols.map(c => c.name));
  } catch (e) {
    console.error(`Error inspecting ${tableName}:`, e.message);
  }
}

checkTable('news');
checkTable('top_stories');
checkTable('user_streams');
checkTable('live_streams');
checkTable('reels');
checkTable('posts');
