import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyScript = resolve(__dirname, 'db-proxy.js');

// Set up directory for SQLite backup / local DB
mkdirSync(dirname(config.dbFile), { recursive: true });

// Check if PostgreSQL database connection details (Neon or Supabase) are provided
export const isPg = !!(process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_API_KEY));

let supabase = null;
let sqliteDb = null;
let proxyPort = 4001;
let proxyStarted = false;

if (isPg) {
  console.log('PG Mode: PostgreSQL database configuration detected.');
  // Initialize the Supabase Client if credentials are provided
  if (process.env.SUPABASE_URL && process.env.SUPABASE_API_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_API_KEY
    );
  }

  // Start local proxy server in background process to allow synchronous SQL query execution
  startPgSyncProxy();
} else {
  console.log('Local Mode: Connecting to local SQLite database...');
  let DatabaseClient;
  try {
    const mod = await import('node:sqlite');
    DatabaseClient = mod.DatabaseSync;
  } catch (e) {
    const mod = await import('better-sqlite3');
    DatabaseClient = mod.default;
  }
  sqliteDb = new DatabaseClient(config.dbFile);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  sqliteDb.exec('PRAGMA busy_timeout = 5000;');
}

export { supabase };
export default supabase;

// Helper to convert SQLite SQL syntax into PostgreSQL syntax on-the-fly
function convertSql(sql) {
  if (!isPg) return sql;

  // 1. Replace SQLite scalar MAX(a, b) with PostgreSQL GREATEST(a, b)
  let transformed = sql.replace(/MAX\s*\(/gi, 'GREATEST(');

  // 2. Translate ALTER TABLE ADD COLUMN to ADD COLUMN IF NOT EXISTS
  transformed = transformed.replace(/ADD COLUMN (?!IF NOT EXISTS )/gi, 'ADD COLUMN IF NOT EXISTS ');

  // 3. Convert positional parameter placeholders "?" into numbered PG placeholders "$1, $2, ..."
  let index = 1;
  return transformed.replace(/\?/g, () => `$${index++}`);
}

function startPgSyncProxy() {
  if (proxyStarted) return;

  // Check if a healthy proxy is already running and if its parent is still alive
  try {
    const res = execSync(`curl -s http://127.0.0.1:${proxyPort}/ping`, { timeout: 200 });
    const info = JSON.parse(res.toString());
    if (info.status === 'pong' && info.ppid) {
      let parentAlive = false;
      try {
        process.kill(info.ppid, 0);
        parentAlive = true;
      } catch (e) {
        if (e.code === 'EPERM') {
          parentAlive = true;
        }
      }

      if (parentAlive) {
        proxyStarted = true;
        console.log(`PG Sync proxy server is already running on port ${proxyPort} with active parent PID: ${info.ppid}`);
        return;
      } else {
        try {
          process.kill(info.pid, 9);
        } catch (e) {}
      }
    }
  } catch (e) {
    // Not running or invalid response format
  }

  // Kill any existing proxy on port 4001 first to avoid orphan/zombie race conditions
  try {
    if (process.platform !== 'win32') {
      execSync(`lsof -ti :${proxyPort} | xargs kill -9`, { stdio: 'ignore' });
    }
  } catch (e) {}

  console.log(`Spawning PG Sync Proxy background process: ${process.execPath} ${proxyScript}`);
  const child = spawn(process.execPath, [proxyScript], {
    env: { ...process.env },
    detached: true,
    stdio: 'inherit'
  });
  child.on('error', (err) => {
    console.error('Failed to spawn PG Sync Proxy child process:', err);
  });
  child.unref();

  // Block synchronously until the proxy is up and listening
  let isUp = false;
  let retries = 0;
  const sharedBuffer = new SharedArrayBuffer(4);
  const sharedArray = new Int32Array(sharedBuffer);

  while (!isUp && retries < 150) {
    try {
      const res = execSync(`curl -s http://127.0.0.1:${proxyPort}/ping`, { timeout: 200 });
      const info = JSON.parse(res.toString());
      if (info.status === 'pong') {
        isUp = true;
      }
    } catch (e) {
      // Wait 50ms synchronously using Atomics.wait without spawning subprocesses
      try {
        Atomics.wait(sharedArray, 0, 0, 50);
      } catch (err) {}
      retries++;
    }
  }

  if (isUp) {
    proxyStarted = true;
    console.log(`PG Sync proxy server is up and listening on port ${proxyPort}`);
    try {
      Atomics.wait(sharedArray, 0, 0, 300);
    } catch (e) {}
  } else {
    console.error(`PG Sync proxy server failed to start on port ${proxyPort} after ${retries} retries`);
    throw new Error('PG Sync proxy server failed to start. Ensure node, curl, and Supabase credentials are valid.');
  }
}

function queryProxySync(sql, params = []) {
  const payload = JSON.stringify({ sql, params });
  let res;
  try {
    res = execSync(`curl -s -X POST -H "Content-Type: application/json" -d @- http://127.0.0.1:${proxyPort}/query`, {
      input: payload,
      stdio: ['pipe', 'pipe', 'ignore']
    });
  } catch (e) {
    throw new Error(`Database connection proxy failed: ${e.message}`);
  }
  
  let parsed;
  try {
    parsed = JSON.parse(res.toString());
  } catch (e) {
    throw new Error(`Invalid response from database proxy: ${res.toString()}`);
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

export const db = {
  exec(sql) {
    if (isPg) {
      queryProxySync(sql);
    } else {
      sqliteDb.exec(sql);
    }
  },
  prepare(sql) {
    return {
      all(...params) {
        if (isPg) {
          const res = queryProxySync(sql, params);
          return res && res.rows ? res.rows : [];
        } else {
          return sqliteDb.prepare(sql).all(...params.flat());
        }
      },
      get(...params) {
        if (isPg) {
          const res = queryProxySync(sql, params);
          return res && res.rows && res.rows[0] ? res.rows[0] : null;
        } else {
          return sqliteDb.prepare(sql).get(...params.flat()) || null;
        }
      },
      run(...params) {
        if (isPg) {
          const res = queryProxySync(sql, params);
          return {
            changes: res.changes,
            lastInsertRowid: null
          };
        } else {
          const info = sqliteDb.prepare(sql).run(...params.flat());
          return {
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid
          };
        }
      }
    };
  }
};

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT DEFAULT 'user',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      avatar_url TEXT,
      color      TEXT,
      is_kids    INTEGER NOT NULL DEFAULT 0,
      subscribed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creators (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      handle      TEXT NOT NULL,
      avatar_file TEXT
    );

    CREATE TABLE IF NOT EXISTS reels (
      id          TEXT PRIMARY KEY,
      creator_id  TEXT NOT NULL REFERENCES creators(id),
      video_file  TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      duration    REAL NOT NULL DEFAULT 0,
      likes       INTEGER NOT NULL DEFAULT 0,
      comments    INTEGER NOT NULL DEFAULT 0,
      shares      INTEGER NOT NULL DEFAULT 0,
      views       INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      location    TEXT,
      needs_blur  INTEGER NOT NULL DEFAULT 0,
      blur_reason TEXT,
      blur_regions TEXT,
      ocr_text    TEXT,
      translated_text TEXT,
      neutralized_text TEXT,
      thumbnail_file TEXT
    );

    CREATE TABLE IF NOT EXISTS reel_likes (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      reel_id    TEXT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
      PRIMARY KEY (profile_id, reel_id)
    );

    CREATE TABLE IF NOT EXISTS follows (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      PRIMARY KEY (profile_id, creator_id)
    );

    CREATE TABLE IF NOT EXISTS movies (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      year         INTEGER,
      genre        TEXT,
      rating       REAL,
      poster_url   TEXT,
      backdrop_url TEXT,
      video_file   TEXT,
      description  TEXT,
      duration     INTEGER,
      is_upcoming  INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS news (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      summary      TEXT,
      body         TEXT,
      category     TEXT NOT NULL,
      source       TEXT,
      is_breaking  INTEGER NOT NULL DEFAULT 0,
      image_url    TEXT,
      video_url    TEXT,
      read_minutes INTEGER NOT NULL DEFAULT 1,
      published_at TEXT NOT NULL,
      region       TEXT,
      district     TEXT,
      location     TEXT,
      tags         TEXT,
      sentiment    TEXT,
      seo_headline TEXT,
      needs_blur   INTEGER NOT NULL DEFAULT 0,
      blur_reason  TEXT,
      blur_regions TEXT,
      ocr_text     TEXT,
      translated_text TEXT,
      neutralized_text TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id            TEXT PRIMARY KEY,
      profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      content_type  TEXT NOT NULL,
      content_id    TEXT NOT NULL,
      title         TEXT,
      thumbnail_url TEXT,
      category      TEXT NOT NULL DEFAULT 'later',
      progress_sec  REAL NOT NULL DEFAULT 0,
      last_modified INTEGER NOT NULL,
      deleted       INTEGER NOT NULL DEFAULT 0,
      UNIQUE (profile_id, content_type, content_id)
    );

    CREATE TABLE IF NOT EXISTS live_streams (
      id          TEXT PRIMARY KEY,
      profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'General',
      location    TEXT,
      started_at  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL,
      viewers     INTEGER NOT NULL DEFAULT 0,
      peak_viewers INTEGER NOT NULL DEFAULT 0,
      ended       INTEGER NOT NULL DEFAULT 0,
      thumbnail_file TEXT
    );

    CREATE TABLE IF NOT EXISTS live_chat (
      id         TEXT PRIMARY KEY,
      stream_id  TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
      profile_id TEXT,
      name       TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      reel_id    TEXT NOT NULL,
      profile_id TEXT,
      name       TEXT NOT NULL,
      avatar     TEXT,
      body       TEXT NOT NULL,
      likes      INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_streams (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      stream_title        TEXT NOT NULL,
      description         TEXT,
      category            TEXT,
      stream_type         TEXT DEFAULT 'public',
      stream_status       TEXT DEFAULT 'live',
      live_stream_url     TEXT,
      recorded_video_url  TEXT,
      thumbnail_url       TEXT,
      duration            INTEGER DEFAULT 0,
      started_at          BIGINT NOT NULL,
      ended_at            BIGINT,
      total_views         INTEGER DEFAULT 0,
      peak_viewers        INTEGER DEFAULT 0,
      total_likes         INTEGER DEFAULT 0,
      total_comments      INTEGER DEFAULT 0,
      total_shares        INTEGER DEFAULT 0,
      recording_status    TEXT DEFAULT 'Recording...',
      storage_provider    TEXT DEFAULT 'Supabase',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT,
      data       TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      location   TEXT,
      image_url  TEXT,
      likes      INTEGER NOT NULL DEFAULT 0,
      comments   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      needs_blur INTEGER NOT NULL DEFAULT 0,
      blur_reason TEXT,
      blur_regions TEXT,
      ocr_text     TEXT,
      translated_text TEXT,
      neutralized_text TEXT
    );

    CREATE TABLE IF NOT EXISTS post_likes (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (profile_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS live_tv_channels (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      now_playing TEXT,
      next_up     TEXT,
      is_official INTEGER NOT NULL DEFAULT 1,
      viewers     INTEGER NOT NULL DEFAULT 0,
      video_url   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stories (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      media_url  TEXT NOT NULL,
      media_type TEXT NOT NULL,
      content    TEXT,
      expires_at BIGINT NOT NULL,
      views      INTEGER NOT NULL DEFAULT 0,
      reactions  TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      query      TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_reports (
      id           TEXT PRIMARY KEY,
      profile_id   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      content_type TEXT NOT NULL,
      content_id   TEXT NOT NULL,
      reason       TEXT,
      ai_score     REAL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      target_id  TEXT,
      metadata   TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS ip_blocks (
      ip         TEXT PRIMARY KEY,
      reason     TEXT,
      blocked_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      action     TEXT NOT NULL,
      target     TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      image_url TEXT,
      link_url TEXT,
      placement TEXT,
      start_date TEXT,
      end_date TEXT,
      clicks INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stream_keys (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      stream_key TEXT UNIQUE NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reporter_streams (
      id          TEXT PRIMARY KEY,
      profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      stream_key  TEXT UNIQUE NOT NULL REFERENCES stream_keys(stream_key),
      title       TEXT,
      location    TEXT,
      status      TEXT DEFAULT 'offline',
      viewers     INTEGER NOT NULL DEFAULT 0,
      started_at  BIGINT,
      last_seen   BIGINT
    );

    CREATE TABLE IF NOT EXISTS studio_broadcasts (
      id               TEXT PRIMARY KEY,
      layout_mode      TEXT DEFAULT 'single',
      promoted_streams TEXT DEFAULT '[]',
      ticker_text      TEXT DEFAULT '',
      show_logo        INTEGER NOT NULL DEFAULT 1,
      breaking_news    INTEGER NOT NULL DEFAULT 0,
      status           TEXT DEFAULT 'idle',
      started_at       BIGINT,
      ended_at         BIGINT
    );

    CREATE TABLE IF NOT EXISTS studio_reporter_chat (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      name       TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS top_stories (
      id           TEXT PRIMARY KEY,
      headline     TEXT NOT NULL,
      description  TEXT,
      article      TEXT,
      category     TEXT,
      subcategory  TEXT,
      language     TEXT,
      author       TEXT,
      source       TEXT,
      image_url    TEXT,
      gallery_urls TEXT,
      video_url    TEXT,
      thumbnail_url TEXT,
      priority     INTEGER DEFAULT 0,
      is_breaking  INTEGER NOT NULL DEFAULT 0,
      is_top_story INTEGER NOT NULL DEFAULT 1,
      is_trending  INTEGER NOT NULL DEFAULT 0,
      status       TEXT DEFAULT 'draft',
      views        INTEGER NOT NULL DEFAULT 0,
      likes        INTEGER NOT NULL DEFAULT 0,
      comments     INTEGER NOT NULL DEFAULT 0,
      publish_date TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
  `);

  try {
    db.prepare("ALTER TABLE user_streams ADD COLUMN subtitles_url TEXT").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE user_streams ADD COLUMN location TEXT").run();
  } catch (e) {}
  try {
    db.prepare("ALTER TABLE live_streams ADD COLUMN subtitles_url TEXT").run();
  } catch (e) {}

  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM system_settings WHERE key = 'platformName'").get();
    if (!row || row.n === 0) {
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('platformName', 'Nexus Play')").run();
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('theme', 'dark')").run();
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('logo', 'http://localhost:4000/media/logo.png')").run();
    }
  } catch (e) {}

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_watchlist_sync ON watchlist (profile_id, last_modified);');
  } catch (e) {}
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_reels_order ON reels (sort_order);');
  } catch (e) {}
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_live_active ON live_streams (ended, last_seen);');
  } catch (e) {}
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_comments_reel ON comments (reel_id, created_at);');
  } catch (e) {}
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, read, created_at);');
  } catch (e) {}

  // Safe ALTER TABLE commands
  try {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
  } catch (e) {}
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);");
  } catch (e) {}
  try {
    db.exec("CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, otp TEXT NOT NULL, expires_at BIGINT NOT NULL);");
  } catch (e) {}
  try {
    db.exec('ALTER TABLE news ADD COLUMN region TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN district TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN location TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE live_streams ADD COLUMN location TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE reels ADD COLUMN location TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN tags TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN sentiment TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN seo_headline TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE news ADD COLUMN needs_blur INTEGER DEFAULT 0;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE news ADD COLUMN blur_reason TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE posts ADD COLUMN needs_blur INTEGER DEFAULT 0;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE posts ADD COLUMN blur_reason TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN needs_blur INTEGER DEFAULT 0;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN blur_reason TEXT;');
  } catch (e) {}

  // Safe ALTER TABLE commands for OCR, Translation, and Blur Regions
  try {
    db.exec('ALTER TABLE news ADD COLUMN blur_regions TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE news ADD COLUMN ocr_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE news ADD COLUMN translated_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE news ADD COLUMN neutralized_text TEXT;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE posts ADD COLUMN blur_regions TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE posts ADD COLUMN ocr_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE posts ADD COLUMN translated_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE posts ADD COLUMN neutralized_text TEXT;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN blur_regions TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN ocr_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN translated_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN neutralized_text TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE reels ADD COLUMN thumbnail_file TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE live_streams ADD COLUMN thumbnail_file TEXT;');
  } catch (e) {}

  // PostgreSQL column type alters for millisecond timestamps
  try {
    db.exec('ALTER TABLE live_streams ALTER COLUMN started_at TYPE BIGINT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE live_streams ALTER COLUMN last_seen TYPE BIGINT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE live_chat ALTER COLUMN created_at TYPE BIGINT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE comments ALTER COLUMN created_at TYPE BIGINT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE notifications ALTER COLUMN created_at TYPE BIGINT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE watchlist ALTER COLUMN last_modified TYPE BIGINT;');
  } catch (e) {}

  // Alters for profile fields (bio, website, location, join_date)
  try {
    db.exec('ALTER TABLE profiles ADD COLUMN bio TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE profiles ADD COLUMN website TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE profiles ADD COLUMN location TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE profiles ADD COLUMN join_date TEXT;');
  } catch (e) {}
}

export function detectRegionAndDistrict(title = '', summary = '') {
  const text = (title + ' ' + (summary || '')).toLowerCase();
  
  let region = 'Delhi/North';
  let district = null;
  
  if (text.includes('telangana') || text.includes('hyderabad') || text.includes('warangal') || text.includes('hanumakonda') || text.includes('kcr') || text.includes('ktr') || text.includes('khammam') || text.includes('karimnagar') || text.includes('siddipet') || text.includes('nalgonda')) {
    region = 'Telangana';
    if (text.includes('hyderabad')) district = 'Hyderabad';
    else if (text.includes('warangal')) district = 'Warangal';
    else if (text.includes('hanumakonda')) district = 'Hanumakonda';
    else if (text.includes('khammam')) district = 'Khammam';
    else if (text.includes('karimnagar')) district = 'Karimnagar';
    else if (text.includes('siddipet')) district = 'Siddipet';
    else if (text.includes('nalgonda')) district = 'Nalgonda';
    else {
      // Deterministic fallback for Telangana
      const hash = (title.length + (summary ? summary.length : 0)) % 5;
      const telanganaDistricts = ['Hyderabad', 'Warangal', 'Karimnagar', 'Khammam', 'Nalgonda'];
      district = telanganaDistricts[hash];
    }
  } else if (text.includes('ap') || text.includes('andhra') || text.includes('amaravati') || text.includes('vizag') || text.includes('vijayawada') || text.includes('tirupati') || text.includes('guntur') || text.includes('kadapa') || text.includes('nellore') || text.includes('kurnool') || text.includes('anantapur') || text.includes('press conference')) {
    region = 'AP';
    if (text.includes('visakhapatnam') || text.includes('vizag')) district = 'Visakhapatnam';
    else if (text.includes('vijayawada') || text.includes('ntr')) district = 'NTR (Vijayawada)';
    else if (text.includes('tirupati')) district = 'Tirupati';
    else if (text.includes('guntur')) district = 'Guntur';
    else if (text.includes('nellore') || text.includes('sriramulu')) district = 'Sri Potti Sriramulu Nellore';
    else if (text.includes('kurnool')) district = 'Kurnool';
    else if (text.includes('kadapa') || text.includes('ysr')) district = 'YSR Kadapa';
    else if (text.includes('anantapur')) district = 'Anantapur';
    else if (text.includes('chittoor')) district = 'Chittoor';
    else if (text.includes('kakinada')) district = 'Kakinada';
    else if (text.includes('eluru')) district = 'Eluru';
    else if (text.includes('anagani') || text.includes('prasad') || text.includes('revenue')) district = 'Guntur';
    else {
      district = 'Visakhapatnam';
    }
  } else if (text.includes('delhi') || text.includes('noida') || text.includes('gurugram') || text.includes('ghaziabad') || text.includes('capital') || text.includes('parliament')) {
    region = 'Delhi/North';
    if (text.includes('new delhi')) district = 'New Delhi';
    else if (text.includes('dwarka') || text.includes('south west')) district = 'South West Delhi';
    else if (text.includes('saket') || text.includes('south delhi')) district = 'South Delhi';
    else if (text.includes('rohini') || text.includes('north west')) district = 'North West Delhi';
    else if (text.includes('connaught place') || text.includes('central delhi')) district = 'Central Delhi';
    else if (text.includes('shahdara')) district = 'Shahdara';
    else {
      const hash = (title.length + (summary ? summary.length : 0)) % 5;
      const delhiDistricts = ['New Delhi', 'North Delhi', 'South Delhi', 'West Delhi', 'East Delhi'];
      district = delhiDistricts[hash];
    }
  } else {
    const hash = (title.length + (summary ? summary.length : 0)) % 10;
    if (hash < 4) {
      region = 'AP';
      const districts = ['Visakhapatnam', 'Guntur', 'NTR (Vijayawada)', 'Tirupati', 'East Godavari'];
      district = districts[hash % districts.length];
    } else if (hash < 7) {
      region = 'Telangana';
      const telanganaDistricts = ['Hyderabad', 'Warangal', 'Karimnagar', 'Khammam', 'Nalgonda'];
      district = telanganaDistricts[(hash - 4) % telanganaDistricts.length];
    } else {
      region = 'Delhi/North';
      const hashDelhi = (title.length + (summary ? summary.length : 0)) % 5;
      const delhiDistricts = ['New Delhi', 'North Delhi', 'South Delhi', 'West Delhi', 'East Delhi'];
      district = delhiDistricts[hashDelhi];
    }
  }
  
  return { region, district };
}
