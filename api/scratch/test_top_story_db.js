import { db } from '../src/db.js';
import { randomUUID } from 'crypto';

try {
  const storyId = randomUUID();
  const nowStr = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO top_stories (
      id, headline, description, article, category, subcategory, language, author, source,
      image_url, gallery_urls, video_url, thumbnail_url, priority, is_breaking, is_top_story, is_trending,
      status, views, likes, comments, publish_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
  `).run(
    storyId,
    "Test Headline " + Date.now(),
    "Test description",
    "Test article body",
    "General",
    "Subcategory test",
    "English",
    "Test Author",
    "Test Source",
    null,
    JSON.stringify([]),
    null,
    null,
    0,
    0, // isBreaking
    1, // isTopStory
    0, // isTrending
    "draft",
    nowStr,
    nowStr,
    nowStr
  );

  console.log("[PASS] Successfully inserted top story into the database. ID:", storyId);
} catch (err) {
  console.error("[FAIL] Database insertion failed:", err);
}
