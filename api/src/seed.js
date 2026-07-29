import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { config } from './config.js';
import { db, initSchema, detectRegionAndDistrict, isPg } from './db.js';
import { hashPassword } from './auth.js';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);


function downloadFile(url, dest) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve();
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          writeFileSync(dest, Buffer.concat(chunks));
          resolve();
        } catch (e) {
          resolve();
        }
      });
    }).on('error', () => resolve());
  });
}

async function ensureAvatarsExist() {
  const dir = config.mediaDirs.avatars;
  mkdirSync(dir, { recursive: true });
  const existing = listFiles(dir, IMAGE_EXT);
  if (existing.length >= 15) return;

  console.log('Downloading default cartoon avatars to sample users folder...');
  const avatarsToDownload = [
    { name: 'male_1.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Felix' },
    { name: 'male_2.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Aneka' },
    { name: 'male_3.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Jack' },
    { name: 'female_1.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Lily' },
    { name: 'female_2.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Maya' },
    { name: 'female_3.png', url: 'https://api.dicebear.com/7.x/adventurer/png?seed=Zoey' },
    { name: 'professional_1.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=John' },
    { name: 'professional_2.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=Jane' },
    { name: 'professional_3.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=Bob' },
    { name: 'newsreader_1.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=Priya' },
    { name: 'newsreader_2.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=Shyam' },
    { name: 'newsreader_3.png', url: 'https://api.dicebear.com/7.x/avataaars/png?seed=Anchor' },
    { name: 'animated_1.png', url: 'https://api.dicebear.com/7.x/bottts/png?seed=Robo1' },
    { name: 'animated_2.png', url: 'https://api.dicebear.com/7.x/bottts/png?seed=Robo2' },
    { name: 'animated_3.png', url: 'https://api.dicebear.com/7.x/bottts/png?seed=Robo3' }
  ];

  for (const item of avatarsToDownload) {
    const dest = resolve(dir, item.name);
    if (!existsSync(dest)) {
      try {
        await downloadFile(item.url, dest);
        console.log(`Downloaded ${item.name}`);
      } catch (err) {
        console.error(`Failed to download ${item.name}:`, err.message);
      }
    }
  }
}

function listFiles(dir, allowed) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !f.startsWith('.') && allowed.has(extname(f).toLowerCase()))
    .sort();
}

// Turn a messy filename into a presentable title.
function titleFromFilename(file) {
  let t = basename(file, extname(file));
  t = t.split('#')[0]; // drop hashtag clusters
  t = t.replace(/\s+/g, ' ').trim();
  if (!t || /^vid[-_]?\d/i.test(t)) return 'Trending Clip';
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}

// Deterministic pseudo-random so seeds are stable across runs.
function seeded(str, min, max) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) / 4294967295;
  return Math.floor(min + n * (max - min));
}

function clearAll() {
  for (const t of [
    'user_streams', 'analytics_events', 'moderation_reports', 'search_history', 'chat_messages', 'stories', 'live_tv_channels',
    'post_likes', 'comments', 'watchlist', 'follows', 'reel_likes', 'reels', 'posts',
    'live_chat', 'live_streams', 'notifications', 'profiles', 'creators', 'movies', 'news', 'users'
  ]) {
    db.exec(isPg ? `DROP TABLE IF EXISTS ${t} CASCADE;` : `DROP TABLE IF EXISTS ${t};`);
  }
}

function seedOfficialChannelsOnly() {
  const officialChannels = [
    { id: 'n1', name: 'NEXUS News 24 Live', category: 'News', now_playing: '24/7 Global Breaking News & Regional Updates', next_up: 'World Tonight Live', is_official: 1, viewers: 24200, video_url: 'https://www.youtube.com/watch?v=gCNeDWCI0vo' },
    { id: 'n2', name: 'Global News Live', category: 'News', now_playing: 'NASA TV Official 24/7 Earth & Space Stream', next_up: 'Business Pulse', is_official: 1, viewers: 18500, video_url: 'https://www.youtube.com/watch?v=21X5lGlDOfg' },
    { id: 'm1', name: 'NEXUS Cinema Live', category: 'Movies', now_playing: '24/7 Blockbuster Movie Specials', next_up: 'Classic Hour', is_official: 1, viewers: 15400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    { id: 'm2', name: 'Action Movies Live', category: 'Movies', now_playing: 'Live Action Thriller Showcase', next_up: 'Midnight Specials', is_official: 1, viewers: 12900, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    { id: 's1', name: 'NEXUS Sports Live', category: 'Sports', now_playing: 'Live Sports Action & Championship Highlights', next_up: 'Sports Center', is_official: 1, viewers: 39500, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
    { id: 's2', name: 'Grand Arena Sports', category: 'Sports', now_playing: 'Grand Championship Live & Daily Highlights', next_up: 'Daily Highlights', is_official: 1, viewers: 28400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
  ];

  const insChannel = db.prepare(`
    INSERT INTO live_tv_channels (id, name, category, now_playing, next_up, is_official, viewers, video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  officialChannels.forEach((chan) => {
    insChannel.run(chan.id, chan.name, chan.category, chan.now_playing, chan.next_up, chan.is_official, chan.viewers, chan.video_url);
  });
}

export async function seed({ reset = false } = {}) {
  if (reset) clearAll();
  initSchema();
  await ensureAvatarsExist();
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0 && !reset) {
    const channelCount = db.prepare('SELECT COUNT(*) AS n FROM live_tv_channels').get().n;
    if (channelCount === 0) {
      console.log("[Seed] Official TV channels are missing. Seeding them now...");
      try {
        seedOfficialChannelsOnly();
      } catch (err) {
        console.error('Failed to seed missing official channels:', err);
      }
    }
    return { skipped: true };
  }

  const now = new Date().toISOString();

  // ---- Creators from the sample-user avatars ----
  const avatars = listFiles(config.mediaDirs.avatars, IMAGE_EXT);
  const creatorNames = avatars.length
    ? avatars.map((a) => basename(a, extname(a)))
    : ['Anil', 'Phani', 'Shyam', 'Srujana', 'Uday'];

  const insCreator = db.prepare(
    'INSERT INTO creators (id, name, handle, avatar_file) VALUES (?, ?, ?, ?)'
  );
  const creators = creatorNames.map((name, i) => {
    const id = randomUUID();
    insCreator.run(id, name, '@' + name.toLowerCase().replace(/\s+/g, ''), avatars[i] || null);
    return { id, name };
  });

  // ---- Reels from the real video files ----
  const videos = listFiles(config.mediaDirs.reels, VIDEO_EXT);
  const insReel = db.prepare(`
    INSERT INTO reels (id, creator_id, video_file, title, description, duration,
                       likes, comments, shares, views, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  videos.forEach((file, i) => {
    const id = randomUUID();
    const creator = creators[i % creators.length];
    insReel.run(
      id,
      creator.id,
      file,
      titleFromFilename(file),
      'Watch now on NEXUS Play • ' + (creator ? creator.name : 'NEXUS'),
      0,
      seeded(id + 'l', 1200, 98000),
      seeded(id + 'c', 30, 4200),
      seeded(id + 's', 10, 1500),
      seeded(id + 'v', 5000, 1200000),
      i
    );
  });

  // ---- Seed Required Role-Based Users ----
  const usersToSeed = [
    // Super Admins
    { email: 'phani@nexusplay.app', name: 'Phani', role: 'super_admin', avatar: '/media/avatars/professional_1.png', subscribed: 1 },
    { email: 'uday@nexusplay.app', name: 'Uday', role: 'super_admin', avatar: '/media/avatars/professional_2.png', subscribed: 1 },
    { email: 'srujana@nexusplay.app', name: 'Srujana', role: 'super_admin', avatar: '/media/avatars/professional_3.png', subscribed: 1 },
    // News Readers
    { email: 'priya@nexusplay.app', name: 'Priya', role: 'news_reader', avatar: '/media/avatars/newsreader_1.png', subscribed: 1 },
    { email: 'shyam@nexusplay.app', name: 'Shyam', role: 'news_reader', avatar: '/media/avatars/newsreader_2.png', subscribed: 1 },
    // End Users
    { email: 'anil@nexusplay.app', name: 'Anil', role: 'user', phone: '9999999999', avatar: '/media/avatars/animated_1.png', subscribed: 0 },
    { email: 'teja@nexusplay.app', name: 'Teja', role: 'user', phone: '8888888888', avatar: '/media/avatars/animated_2.png', subscribed: 0 }
  ];

  const colorsList = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];
  const insProfile = db.prepare(
    'INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, subscribed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  usersToSeed.forEach((u, idx) => {
    const uId = randomUUID();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, display_name, phone, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uId, u.email, hashPassword('test'), u.name, u.phone || null, u.role, now);

    // Create primary profile
    insProfile.run(
      randomUUID(),
      uId,
      u.name,
      u.avatar,
      colorsList[idx % colorsList.length],
      0,
      u.subscribed,
      now
    );
  });

  // Keep demo user for compatibility
  const demoUserId = randomUUID();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(demoUserId, 'demo@nexusplay.app', hashPassword('password123'), 'Nexus Demo', 'super_admin', now);
  
  insProfile.run(
    randomUUID(),
    demoUserId,
    'Demo Profile',
    '/media/avatars/animated_3.png',
    '#e50914',
    0,
    0,
    now
  );

  // ---- Movies catalog (with actual YouTube links) ----
  const movieSeeds = [
    {
      title: "Spider-Man: Brand New Home (Trailer)",
      year: 2026,
      genre: "Action",
      rating: 8.9,
      posterUrl: "https://picsum.photos/seed/spidey500/360/540",
      backdropUrl: "https://picsum.photos/seed/spidey1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=x-9i31iPe2A&t=1s",
      description: "Peter Parker embarks on a fresh cinematic journey, facing new challenges and adjusting to life in a brand new home.",
      duration: 3,
      isUpcoming: 1
    },
    {
      title: "SlumDog - 33 Temple Road (Teaser)",
      year: 2026,
      genre: "Action",
      rating: 8.5,
      posterUrl: "https://picsum.photos/seed/slumdog500/360/540",
      backdropUrl: "https://picsum.photos/seed/slumdog1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=KV3EYDxMrvA",
      description: "Teaser for the high-octane action drama directed by Puri Jagannadh starring Vijay Sethupathi and Samyuktha.",
      duration: 3,
      isUpcoming: 1
    },
    {
      title: "Raaka (AA22) Announcement",
      year: 2026,
      genre: "Sci-Fi",
      rating: 8.7,
      posterUrl: "https://picsum.photos/seed/raaka500/360/540",
      backdropUrl: "https://picsum.photos/seed/raaka1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=SI_PhNII7Mc",
      description: "Sun Pictures presents Allu Arjun and director Atlee in a massive, pan-world science fiction action film.",
      duration: 3,
      isUpcoming: 1
    },
    {
      title: "Peddi (Trailer)",
      year: 2026,
      genre: "Action",
      rating: 9.1,
      posterUrl: "https://picsum.photos/seed/peddi500/360/540",
      backdropUrl: "https://picsum.photos/seed/peddi1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=sF2dj7ycZvA&t=38s",
      description: "The official trailer for the rural sports-action drama Peddi, starring Ram Charan and Janhvi Kapoor with music by A.R. Rahman.",
      duration: 2,
      isUpcoming: 0
    },
    {
      title: "The Raja Saab (Trailer 2.0)",
      year: 2026,
      genre: "Comedy",
      rating: 8.8,
      posterUrl: "https://picsum.photos/seed/rajasaab500/360/540",
      backdropUrl: "https://picsum.photos/seed/rajasaab1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=E08GZ3pFlnk",
      description: "The official horror-comedy trailer of The Raja Saab starring Rebel Star Prabhas and Sanjay Dutt, directed by Maruthi.",
      duration: 3,
      isUpcoming: 0
    },
    {
      title: "Rākāsā (Trailer)",
      year: 2026,
      genre: "Horror",
      rating: 8.2,
      posterUrl: "https://picsum.photos/seed/rakasa500/360/540",
      backdropUrl: "https://picsum.photos/seed/rakasa1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=MeGrHazybIY&t=6s",
      description: "A spooky yet hilarious horror comedy trailer of Rākāsā starring Sangeeth Shobhan and Nayan Sarika.",
      duration: 3,
      isUpcoming: 0
    },
    {
      title: "Blast Zone (Trailer)",
      year: 2026,
      genre: "Action",
      rating: 8.4,
      posterUrl: "https://picsum.photos/seed/blastzone500/360/540",
      backdropUrl: "https://picsum.photos/seed/blastzone1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=_vbRwxitX2o",
      description: "High-octane action thriller trailer of Blast Zone starring 'Action King' Arjun and Preity Mukundhan, music by Ravi Basrur.",
      duration: 3,
      isUpcoming: 0
    },
    {
      title: "Mana ShankaraVaraPrasad Garu (Trailer)",
      year: 2026,
      genre: "Drama",
      rating: 8.6,
      posterUrl: "https://picsum.photos/seed/mana500/360/540",
      backdropUrl: "https://picsum.photos/seed/mana1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=UtVijamJJcg",
      description: "Official trailer of Mana ShankaraVaraPrasad Garu starring Megastar Chiranjeevi and Venkatesh Daggubati, directed by Anil Ravipudi.",
      duration: 2,
      isUpcoming: 0
    },
    {
      title: "Dhurandhar: The Revenge (Trailer)",
      year: 2026,
      genre: "Action",
      rating: 8.5,
      posterUrl: "https://picsum.photos/seed/dhurandhar500/360/540",
      backdropUrl: "https://picsum.photos/seed/dhurandhar1280/1280/720",
      videoFile: "https://www.youtube.com/watch?v=rV6kEsAyrdY",
      description: "Action-packed official Telugu trailer of Dhurandhar: The Revenge, starring Ranveer Singh and directed by Aditya Dhar.",
      duration: 2,
      isUpcoming: 0
    }
  ];

  const insMovie = db.prepare(`
    INSERT INTO movies (id, title, year, genre, rating, poster_url, backdrop_url, video_file, description, duration, is_upcoming, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  movieSeeds.forEach((movie, i) => {
    const id = randomUUID();
    insMovie.run(
      id,
      movie.title,
      movie.year,
      movie.genre,
      movie.rating,
      movie.posterUrl,
      movie.backdropUrl,
      movie.videoFile,
      movie.description,
      movie.duration,
      movie.isUpcoming,
      i
    );
  });

  // ---- News (categories + actual YouTube video links) ----
  const newsSeeds = [
    {
      title: "Global Financial Shock: Markets Plunge In Historic Drop",
      summary: "Markets react as dynamic shifts shake global commerce, sending indices to new lows.",
      category: "Business",
      source: "Reuters",
      isBreaking: 1,
      imageUrl: "/media/uploads/top_story_1.jpg",
      videoUrl: "https://www.youtube.com/watch?v=fiWkydyVFxU",
      readMinutes: 4
    },
    {
      title: "Tech Innovation Summit: Live Report On AI Advancements",
      summary: "Discover the newest chips, models, and systems redefining software and operations globally.",
      category: "Technology",
      source: "NEXUS Wire",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews2/800/450",
      videoUrl: "https://www.youtube.com/watch?v=Uy-pOzwPfa8",
      readMinutes: 6
    },
    {
      title: "Geopolitical Updates: Breaking Borders And Trade Alignments",
      summary: "Detailed overview of new policy changes affecting continental trade routes and pricing.",
      category: "International",
      source: "AP",
      isBreaking: 1,
      imageUrl: "/media/uploads/top_story_2.jpg",
      videoUrl: "https://www.youtube.com/watch?v=ZNw4BwnuOzw",
      readMinutes: 5
    },
    {
      title: "Climate Action Directives: Global Leaders Convene",
      summary: "Strategic treaties sign new carbon caps and renewable energy targets for industrial capitals.",
      category: "International",
      source: "The Guardian",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews4/800/450",
      videoUrl: "https://www.youtube.com/watch?v=egm4ddoZLA0",
      readMinutes: 3
    },
    {
      title: "Space Exploration: Next Generation Lunar Landers Unveiled",
      summary: "Public-private partnerships reveal mockups of reusable capsules heading for deep space.",
      category: "Technology",
      source: "NEXUS Wire",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews5/800/450",
      videoUrl: "https://www.youtube.com/watch?v=i6Kh5glB4K4",
      readMinutes: 4
    },
    {
      title: "Special Report: Modi Ji క్షమించు..ఒక్క రోజులో 4700 కోట్లు..",
      summary: "A deep dive into international currency reserves, financial adjustments, and regional updates.",
      category: "Business",
      source: "99TV Telugu",
      isBreaking: 1,
      imageUrl: "/media/uploads/top_story_3.jpg",
      videoUrl: "https://www.youtube.com/watch?v=hBVSPaqJoNQ",
      readMinutes: 7
    },
    {
      title: "Parliament Session Commences: High Stakes Debate on New Digital Privacy Bills",
      summary: "Legislators convene to debate the proposed data framework aimed at reinforcing privacy standards across all consumer platforms.",
      category: "Politics",
      source: "NDTV",
      isBreaking: 1,
      imageUrl: "/media/uploads/top_story_4.jpg",
      videoUrl: "https://www.youtube.com/watch?v=faD85hMfZLQ",
      readMinutes: 5
    },
    {
      title: "Federal Reserve Adjusts Key Rates to Address Inflation Concerns",
      summary: "In a decisive economic move, central banking authorities alter rates to steady market indicators and consumer spending.",
      category: "Business",
      source: "Bloomberg",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_biz1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=fiWkydyVFxU",
      readMinutes: 6
    },
    {
      title: "Next-Gen Quantum Core Chipsets Announced by Silicon Leaders",
      summary: "The newly unveiled architectures promise significant accelerations for machine learning processing and data networks.",
      category: "Technology",
      source: "Reuters",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_tech1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=Uy-pOzwPfa8",
      readMinutes: 4
    },
    {
      title: "Historic Innings Leads National Cricket Team to Championship Victory",
      summary: "An exceptional performance in the final overs secures the cup after a thrilling run-chase against top contenders.",
      category: "Sports",
      source: "BBC Sports",
      isBreaking: 1,
      imageUrl: "/media/uploads/top_story_5.jpg",
      videoUrl: "https://www.youtube.com/watch?v=NppdfDcG2a0",
      readMinutes: 5
    },
    {
      title: "Highly Anticipated Sci-Fi Thriller Breaks Box Office Records on Opening Weekend",
      summary: "Audiences flock to theatres worldwide, driving weekend ticket revenues past previous seasonal benchmarks.",
      category: "Entertainment",
      source: "Variety",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_ent1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=MJ6A93vJ7ag",
      readMinutes: 3
    },
    {
      title: "National Board Exams Results Released: Success Rates Rise Across Districts",
      summary: "Academic statistics show a notable performance improvement as digital resource initiatives show positive results.",
      category: "Education",
      source: "NDTV Education",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_edu1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=faD85hMfZLQ",
      readMinutes: 4
    },
    {
      title: "Global Health Forum Publishes Critical Wellness and Nutrition Guidelines",
      summary: "Medical researchers release simplified dietary targets and stress-reduction protocols for urban populations.",
      category: "Health",
      source: "Reuters Health",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_hlth1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=fiWkydyVFxU",
      readMinutes: 5
    },
    {
      title: "Diplomatic Summit Reaches Landmark Accord on International Supply Chain Security",
      summary: "Representatives from forty nations sign a strategic treaty ensuring seamless logistics corridors during global crises.",
      category: "International",
      source: "AP",
      isBreaking: 1,
      imageUrl: "https://picsum.photos/seed/nnews_intl1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=ZNw4BwnuOzw",
      readMinutes: 6
    },
    {
      title: "Fact Check: Debunking Widely Circulated Climate Change Myths",
      summary: "Science analysts verify atmospheric carbon data to clarify recent controversial claims about global cooling.",
      category: "Fact Check",
      source: "NEXUS Fact",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_fc1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=egm4ddoZLA0",
      readMinutes: 4
    },
    {
      title: "Opinion: The Future of Workspace Architecture in the Post-Digital Age",
      summary: "An in-depth editorial inspecting the intersection of smart glass designs, interactive desks, and remote workflow policies.",
      category: "Opinion",
      source: "NEXUS Editorial",
      isBreaking: 0,
      imageUrl: "https://picsum.photos/seed/nnews_op1/800/450",
      videoUrl: "https://www.youtube.com/watch?v=Uy-pOzwPfa8",
      readMinutes: 8
    },
    {
      title: "Kashi Vishwanath Temple Unveils Beautiful New Devotional Corridors",
      summary: "The sacred site registers a record-breaking footfall as spiritual seekers flock to the newly renovated ghat access.",
      category: "Temple News",
      source: "NEXUS Devotional",
      isBreaking: 0,
      imageUrl: "https://images.unsplash.com/photo-1609137144813-7d722d3e91d5?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://www.youtube.com/watch?v=fiWkydyVFxU",
      readMinutes: 5
    },
    {
      title: "The Eternal Wisdom of Bhagavad Gita: A Guide to Modern Mindful Living",
      summary: "Philosophers and life coaches discuss how the ancient Sanskrit slokas offer solutions to daily stress and anxiety.",
      category: "Bhagavad Gita",
      source: "Spiritual Times",
      isBreaking: 1,
      imageUrl: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://www.youtube.com/watch?v=Uy-pOzwPfa8",
      readMinutes: 6
    },
    {
      title: "Maha Shivaratri 2026: Dates, Sacred Muhurtams, and Pooja Rituals Explained",
      summary: "Pundits outline the auspicious timings and night-long chanting schedules for devotees worldwide.",
      category: "Festivals",
      source: "Dharma Pravachanam",
      isBreaking: 0,
      imageUrl: "https://images.unsplash.com/photo-1561361513-2d000a50f0db?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://www.youtube.com/watch?v=faD85hMfZLQ",
      readMinutes: 4
    },
    {
      title: "Dhyana and Yoga: Unleashing Inner Peace Through Ancient Meditative Techniques",
      summary: "Sages share practical breathing exercises and posture flows to align body, mind, and spirit.",
      category: "Meditation",
      source: "Yogic Science",
      isBreaking: 0,
      imageUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&auto=format&fit=crop&q=60",
      videoUrl: "https://www.youtube.com/watch?v=ZNw4BwnuOzw",
      readMinutes: 5
    }
  ];

  const insNews = db.prepare(`
    INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  newsSeeds.forEach((item, i) => {
    const id = randomUUID();
    const publishedAt = new Date(Date.now() - i * 37 * 60 * 1000).toISOString();
    const { region, district } = detectRegionAndDistrict(item.title, item.summary);
    insNews.run(
      id,
      item.title,
      item.summary,
      item.title + '. Here is what you need to know and why it matters today.',
      item.category,
      item.source,
      item.isBreaking,
      item.imageUrl,
      item.videoUrl,
      item.readMinutes,
      publishedAt,
      region,
      district
    );
  });

  // ---- Seed Official TV Channels ----
  const officialChannels = [
    { id: 'n1', name: 'NEXUS News 24 Live', category: 'News', now_playing: '24/7 Global Breaking News & Regional Updates', next_up: 'World Tonight Live', is_official: 1, viewers: 24200, video_url: 'https://www.youtube.com/watch?v=gCNeDWCI0vo' },
    { id: 'n2', name: 'Global News Live', category: 'News', now_playing: 'NASA TV Official 24/7 Earth & Space Stream', next_up: 'Business Pulse', is_official: 1, viewers: 18500, video_url: 'https://www.youtube.com/watch?v=21X5lGlDOfg' },
    { id: 'm1', name: 'NEXUS Cinema Live', category: 'Movies', now_playing: '24/7 Blockbuster Movie Specials', next_up: 'Classic Hour', is_official: 1, viewers: 15400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    { id: 'm2', name: 'Action Movies Live', category: 'Movies', now_playing: 'Live Action Thriller Showcase', next_up: 'Midnight Specials', is_official: 1, viewers: 12900, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    { id: 's1', name: 'NEXUS Sports Live', category: 'Sports', now_playing: 'Live Sports Action & Championship Highlights', next_up: 'Sports Center', is_official: 1, viewers: 39500, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
    { id: 's2', name: 'Grand Arena Sports', category: 'Sports', now_playing: 'Grand Championship Live & Daily Highlights', next_up: 'Daily Highlights', is_official: 1, viewers: 28400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
  ];

  const insChannel = db.prepare(`
    INSERT INTO live_tv_channels (id, name, category, now_playing, next_up, is_official, viewers, video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  officialChannels.forEach((chan) => {
    insChannel.run(chan.id, chan.name, chan.category, chan.now_playing, chan.next_up, chan.is_official, chan.viewers, chan.video_url);
  });

  // ---- Seed Top Stories Table from news seeds ----
  try {
    const topStoryCount = db.prepare('SELECT COUNT(*) AS n FROM top_stories').get().n;
    if (topStoryCount === 0) {
      console.log('[Seed] Seeding top_stories table with breaking news...');
      const breakingNewsRows = db.prepare('SELECT * FROM news WHERE is_breaking = 1').all();
      const insTopStory = db.prepare(`
        INSERT INTO top_stories (
          id, headline, description, article, category, subcategory, language, author, source,
          image_url, gallery_urls, video_url, thumbnail_url, priority, is_breaking, is_top_story, is_trending,
          status, views, likes, comments, publish_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'English', ?, ?, ?, '[]', ?, ?, ?, 1, 1, 0, 'published', 0, 0, 0, ?, ?, ?)
      `);
      breakingNewsRows.forEach((row, idx) => {
        const nowStr = new Date().toISOString();
        insTopStory.run(
          row.id,
          row.title,
          row.summary,
          row.body,
          row.category,
          null,
          row.source || 'NEXUS Network',
          row.source || 'NEXUS Network',
          row.image_url,
          row.video_url,
          row.image_url, // thumbnail
          idx, // priority
          row.published_at,
          nowStr,
          nowStr
        );
      });
    }
  } catch (err) {
    console.error('Failed to seed top_stories:', err.message);
  }

  // ---- Seed advertisements and tags ----
  try {
    const adsCount = db.prepare('SELECT COUNT(*) AS n FROM advertisements').get().n;
    if (adsCount === 0) {
      console.log('[Seed] Seeding advertisements table...');
      const insAd = db.prepare(`
        INSERT INTO advertisements (id, title, type, image_url, link_url, placement, start_date, end_date, clicks, impressions, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const nowStr = new Date().toISOString();
      const endStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      insAd.run(randomUUID(), 'NEXUS Premium Pass Ad', 'banner', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop', 'https://nexusplay.app/premium', 'Homepage Top', nowStr, endStr, 240, 15000, 'active', nowStr);
      insAd.run(randomUUID(), 'Global Cinema Promo', 'popup', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop', 'https://nexusplay.app/movies', 'Homepage Modal', nowStr, endStr, 80, 5000, 'active', nowStr);
      insAd.run(randomUUID(), 'Tech Zone Banner', 'sidebar', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop', 'https://nexusplay.app/tech', 'News Sidebar', nowStr, endStr, 110, 8900, 'active', nowStr);
    }

    const tagsCount = db.prepare('SELECT COUNT(*) AS n FROM tags').get().n;
    if (tagsCount === 0) {
      console.log('[Seed] Seeding tags table...');
      const insTag = db.prepare(`
        INSERT INTO tags (id, name, count, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const nowStr = new Date().toISOString();
      insTag.run(randomUUID(), 'Breaking', 15, nowStr);
      insTag.run(randomUUID(), 'India', 28, nowStr);
      insTag.run(randomUUID(), 'Global', 19, nowStr);
      insTag.run(randomUUID(), 'ISRO', 7, nowStr);
      insTag.run(randomUUID(), 'Kedarnath', 5, nowStr);
      insTag.run(randomUUID(), 'GoldRates', 12, nowStr);
    }
  } catch (err) {
    console.error('Failed to seed advertisements/tags:', err.message);
  }

  return {
    skipped: false,
    creators: creators.length,
    reels: videos.length,
    movies: movieSeeds.length,
    news: newsSeeds.length,
    profiles: usersToSeed.length + 1,
    channels: officialChannels.length
  };
}

// CLI: `node src/seed.js --reset`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed({ reset: process.argv.includes('--reset') })
    .then((result) => {
      console.log('Seed result:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
