import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { config, PROJECT_ROOT } from './config.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createApp } from './server.js';
import { initSchema } from './db.js';
import { seed } from './seed.js';

import { router as authRouter } from './routes/auth.js';
import { router as profilesRouter } from './routes/profiles.js';
import { router as reelsRouter } from './routes/reels.js';
import { router as creatorsRouter } from './routes/creators.js';
import { router as moviesRouter } from './routes/movies.js';
import { router as newsRouter } from './routes/news.js';
import { router as watchlistRouter } from './routes/watchlist.js';
import { router as streamsRouter } from './routes/streams.js';
import { router as commentsRouter } from './routes/comments.js';
import { router as notificationsRouter } from './routes/notifications.js';
import { router as recommendationsRouter } from './routes/recommendations.js';
import { subscribe, userFromToken } from './events.js';
import { router as postsRouter } from './routes/posts.js';
import { router as adminRouter } from './routes/admin.js';
import { router as storiesRouter } from './routes/stories.js';
import { router as searchRouter } from './routes/search.js';
import { router as moderationRouter } from './routes/moderation.js';
import { router as analyticsRouter } from './routes/analytics.js';
import { router as liveRouter } from './routes/live-streaming.js';
import { router as roomsRouter } from './routes/rooms.js';
import { router as studioRouter } from './routes/studio.js';
import { router as topStoriesRouter } from './routes/top-stories.js';
import { startDatabaseModerationSweep } from './moderation.js';
import { ensureDefaultThumbnailExists, sweepSeededThumbnails } from './thumbnail.js';
import { startRtmpServer } from './rtmp-server.js';

initSchema();
const seedResult = seed();
startDatabaseModerationSweep();
ensureDefaultThumbnailExists().catch(() => {});
sweepSeededThumbnails().catch(() => {});

// Ensure uploads folder exists
mkdirSync(resolve(PROJECT_ROOT, 'uploads'), { recursive: true });

// Web dist folder for production SPA serving
const WEB_DIST = resolve(PROJECT_ROOT, 'mobile/dist');

const app = createApp({
  staticMounts: [
    // Range requests supported, so video seeking works.
    { prefix: '/media/reels', dir: config.mediaDirs.reels },
    { prefix: '/media/avatars', dir: config.mediaDirs.avatars },
    { prefix: '/media/uploads', dir: resolve(PROJECT_ROOT, 'uploads') },
  ],
  spaFallback: WEB_DIST,
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'nexus-play-api', seed: seedResult }));

// Direct Release APK download routes
app.get('/nexus-play.apk', (req, res) => {
  const apkPath = resolve(PROJECT_ROOT, 'mobile/dist/nexus-play.apk');
  res.download(apkPath, 'nexus-play.apk');
});

app.get('/app-release.apk', (req, res) => {
  const apkPath = resolve(PROJECT_ROOT, 'mobile/dist/nexus-play.apk');
  res.download(apkPath, 'nexus-play.apk');
});

app.get('/download-apk', (req, res) => {
  const apkPath = resolve(PROJECT_ROOT, 'mobile/dist/nexus-play.apk');
  res.download(apkPath, 'nexus-play.apk');
});

// Public HTML proxy to bypass X-Frame-Options for external articles
app.get('/api/news-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('URL query parameter is required');
  }

  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).send('Invalid URL format');
  }

  try {
    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      throw new Error(`Target server returned status ${response.status}`);
    }

    let html = await response.text();

    // Inject <base href="..."> tag to resolve all relative assets
    const baseTag = `<base href="${targetUrl.href}">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #0F172A; color: #fff; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; margin: 0;">
          <div style="background: #1E293B; padding: 32px; border-radius: 16px; border: 1px solid #334155; max-width: 450px; width: 100%;">
            <div style="font-size: 48px; margin-bottom: 16px;">🌐</div>
            <h2 style="color: #F8FAFC; margin-bottom: 12px; font-weight: 800;">Embed Preview Unavailable</h2>
            <p style="color: #94A3B8; font-size: 14px; line-height: 20px; margin-bottom: 24px;">This website prevents embedding directly within other apps due to its security policy (X-Frame-Options).</p>
            <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 24px; background: #3B82F6; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; transition: background 0.2s;">
              Open Original Article
            </a>
          </div>
        </body>
      </html>
    `);
  }
});


// SSE Event Stream Endpoint
app.get('/api/events', (req, res) => {
  const token = req.query.token;
  const profileId = req.query.profileId;
  const user = userFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  subscribe(req, res, user, profileId || null);
});

app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/reels', reelsRouter);
app.use('/api/creators', creatorsRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/news', newsRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/streams', streamsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/admin/top-stories', topStoriesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/search', searchRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/live', liveRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/studio', studioRouter);

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\nNEXUS Play API listening on http://0.0.0.0:${config.port} (Local Wi-Fi IP: http://192.168.29.193:${config.port})`);
  console.log(`  health:  http://localhost:${config.port}/health`);
  console.log(`  media:   http://localhost:${config.port}/media/reels/<file>`);
  if (!seedResult.skipped) console.log('  seeded:', JSON.stringify(seedResult));
  console.log('  demo login: demo@nexusplay.app / password123\n');
  
  try {
    startRtmpServer();
  } catch (err) {
    console.error('Failed to start RTMP server:', err);
  }
});

try {
  const { initRelayServer } = await import('./services/relay.js');
  initRelayServer(server);
  console.log('[Relay Server] Socket.IO server attached to API port');
} catch (err) {
  console.error('Failed to start Socket.IO stream relay server:', err);
}

