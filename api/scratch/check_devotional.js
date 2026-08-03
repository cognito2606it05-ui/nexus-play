import { db } from '../src/db.js';

try {
  const newsRows = db.prepare('SELECT id, title, title AS headline, summary AS description, body AS article, category, subcategory, region, district, published_at, published_at AS created_at FROM news ORDER BY published_at DESC').all();
  const topStoryRows = db.prepare('SELECT id, headline AS title, headline, description, article, category, subcategory, NULL AS region, NULL AS district, publish_date AS published_at, created_at FROM top_stories ORDER BY created_at DESC').all();
  const postRows = db.prepare('SELECT id, content AS title, content AS headline, content AS description, content AS article, NULL AS category, NULL AS subcategory, location AS region, location AS district, created_at AS published_at, created_at FROM posts ORDER BY created_at DESC').all();
  const streamRows = db.prepare('SELECT id, stream_title AS title, stream_title AS headline, description, description AS article, category, NULL AS subcategory, location AS region, location AS district, started_at AS published_at, created_at FROM user_streams ORDER BY started_at DESC').all();
  const activeStreamRows = db.prepare('SELECT id, title, title AS headline, NULL AS description, NULL AS article, category, NULL AS subcategory, location AS region, location AS district, started_at AS published_at, started_at AS created_at FROM live_streams ORDER BY started_at DESC').all();
  let reelRows = [];
  try {
    reelRows = db.prepare('SELECT id, title, title AS headline, description, description AS article, "Reels" AS category, NULL AS subcategory, location AS region, location AS district, NULL AS published_at, NULL AS created_at FROM reels ORDER BY id DESC').all();
  } catch (e) {}

  const allItems = [...newsRows, ...topStoryRows, ...postRows, ...streamRows, ...activeStreamRows, ...reelRows];

  const seen = new Set();
  const deduped = [];
  for (const item of allItems) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);

    let cat = item.category || 'General';
    const text = `${item.title || ''} ${item.headline || ''} ${item.description || ''}`.toLowerCase();
    if (cat === 'General' || cat === 'News' || !cat) {
      if (/cricket|football|sports|match|stadium|ipl|tennis|badminton|olympics|trophy|champion|messi|ronaldo|kohli|rohit|dhoni|wicket|runs|goal|score/.test(text)) cat = 'Sports';
      else if (/temple|devotional|god|pooja|ritual|bhagavad|gita|kashi|prashad|darshan|sloka|mantra|divine|spiritual/.test(text)) cat = 'Devotional';
      else if (/election|modi|minister|parliament|governance|politics|political|party|vote|bjp|congress/.test(text)) cat = 'Politics';
      else if (/market|stock|inflation|sensex|nifty|business|economy|billion|rupees|dollar|revenue/.test(text)) cat = 'Business';
      else if (/ai|tech|chip|technology|quantum|software|apple|google|phone|cyber|data/.test(text)) cat = 'Technology';
      else if (/movie|cinema|actor|film|box office|trailer|star|hollywood|tollywood|bollywood/.test(text)) cat = 'Entertainment';
    }
    item.category = cat;
    deduped.push(item);
  }

  const DEVOTIONAL_SUBCATEGORIES = [
    'Temple News', 'Spiritual News', 'Hindu Dharma', 'Festivals', 'Pooja & Rituals',
    'Pilgrimage', 'Devotional Songs', 'Bhajans', 'Slokas', 'Vedas & Upanishads',
    'Bhagavad Gita', 'Ramayana', 'Mahabharata', 'Puranas', 'Saints & Gurus',
    'Astrology', 'Panchangam', 'Daily Horoscope', 'Meditation', 'Yoga',
    'Quotes & Teachings', 'Religious Events', 'Temple Festivals', 'Charity & Seva',
    'Spiritual Discourses', 'Devotional'
  ];

  const devotionalItems = deduped.filter(n => {
    const catLower = (n.category || '').toLowerCase();
    const text = `${n.title || ''} ${n.headline || ''} ${n.description || ''}`.toLowerCase();
    return catLower === 'devotional' || DEVOTIONAL_SUBCATEGORIES.some(ds => ds.toLowerCase() === catLower) || /temple|devotional|god|pooja|ritual|bhagavad|gita|kashi|prashad|darshan|sloka|mantra|divine|spiritual/.test(text);
  });

  console.log('SUCCESS! Total deduplicated items:', deduped.length);
  console.log('Devotional items found count:', devotionalItems.length);
  console.log('Devotional items:', devotionalItems);
} catch (err) {
  console.error('FAILED:', err);
}
