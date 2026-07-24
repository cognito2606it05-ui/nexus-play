import { db } from '../src/db.js';

// Query breaking news items ordered by published_at DESC (which matches TopStoriesCarousel ordering)
const breakingNews = db.prepare('SELECT id, title, published_at FROM news WHERE is_breaking = 1 ORDER BY published_at DESC LIMIT 5').all();

console.log('[Script] Found breaking news items:', breakingNews);

for (let i = 0; i < breakingNews.length; i++) {
  const item = breakingNews[i];
  const localUrl = `/media/uploads/top_story_${i + 1}.jpg`;
  
  db.prepare('UPDATE news SET image_url = ? WHERE id = ?').run(localUrl, item.id);
  console.log(`[Script] Updated news id: ${item.id} with image_url: ${localUrl}`);
}

console.log('[Script] Completed database update successfully.');
