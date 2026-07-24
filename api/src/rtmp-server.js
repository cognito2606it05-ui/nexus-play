import NodeMediaServer from 'node-media-server';
import { db } from './db.js';
import { publishAll } from './events.js';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { PROJECT_ROOT } from './config.js';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const nmsConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: Number(process.env.RTMP_HTTP_PORT) || 9005,
    allow_origin: '*'
  }
};

const nms = new NodeMediaServer(nmsConfig);
const activeTranscoders = new Map();

export function startRtmpServer() {
  nms.run();
  console.log('[RTMP Server] Started on rtmp://localhost:1935/live');
}

export function stopRtmpServer() {
  nms.stop();
  for (const [key, proc] of activeTranscoders.entries()) {
    try {
      proc.kill('SIGKILL');
    } catch (e) {}
  }
  activeTranscoders.clear();
}

nms.on('prePublish', async (id, StreamPath, args) => {
  console.log('[RTMP Server] prePublish:', id, StreamPath);
  const parts = StreamPath.split('/');
  const app = parts[1];
  const streamKey = parts[2];

  if (app !== 'live') {
    const session = nms.getSession(id);
    session.reject();
    return;
  }

  try {
    const keyRow = db.prepare('SELECT * FROM stream_keys WHERE stream_key = ? AND is_active = 1').get(streamKey);
    if (!keyRow) {
      console.log('[RTMP Server] Rejected publish: Invalid or inactive stream key:', streamKey);
      const session = nms.getSession(id);
      session.reject();
      return;
    }

    // Key is valid. Create or update reporter status
    const profile = db.prepare('SELECT name, location FROM profiles WHERE id = ?').get(keyRow.profile_id);
    const title = `Live Broadcast from ${profile?.name || 'Reporter'}`;
    const location = profile?.location || 'Field Location';

    const existing = db.prepare('SELECT id FROM reporter_streams WHERE stream_key = ?').get(streamKey);
    const streamId = existing ? existing.id : `stream-${keyRow.profile_id}`;

    if (existing) {
      db.prepare(`
        UPDATE reporter_streams 
        SET status = 'live', title = ?, location = ?, started_at = ?, last_seen = ? 
        WHERE stream_key = ?
      `).run(title, location, Date.now(), Date.now(), streamKey);
    } else {
      db.prepare(`
        INSERT INTO reporter_streams (id, profile_id, stream_key, title, location, status, viewers, started_at, last_seen)
        VALUES (?, ?, ?, ?, ?, 'live', 0, ?, ?)
      `).run(streamId, keyRow.profile_id, streamKey, title, location, Date.now(), Date.now());
    }

    // Publish event to Studio via SSE
    publishAll({
      type: 'reporter_stream_started',
      payload: {
        id: streamId,
        profileId: keyRow.profile_id,
        title,
        location,
        streamKey,
        status: 'live'
      }
    });

    // Start HLS Transcoder
    startTranscoding(streamKey);

  } catch (err) {
    console.error('[RTMP Server] Auth checking error:', err);
    const session = nms.getSession(id);
    session.reject();
  }
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[RTMP Server] donePublish:', id, StreamPath);
  const parts = StreamPath.split('/');
  const app = parts[1];
  const streamKey = parts[2];

  if (app === 'live') {
    stopTranscoding(streamKey);

    db.prepare("UPDATE reporter_streams SET status = 'offline' WHERE stream_key = ?").run(streamKey);

    // Notify listeners
    publishAll({
      type: 'reporter_stream_ended',
      payload: { streamKey }
    });
  }
});

function startTranscoding(streamKey) {
  if (activeTranscoders.has(streamKey)) {
    stopTranscoding(streamKey);
  }

  const outputDir = resolve(PROJECT_ROOT, 'uploads', 'live', streamKey);
  mkdirSync(outputDir, { recursive: true });

  const rtmpUrl = `rtmp://localhost:1935/live/${streamKey}`;
  
  const existing = db.prepare('SELECT id FROM reporter_streams WHERE stream_key = ?').get(streamKey);
  const streamId = existing ? existing.id : streamKey;

  // Transcode to multi-bitrate HLS variants (720p & 480p) + Master Playlist + MP4 Archive
  const args = [
    '-y',
    '-i', rtmpUrl,
    
    // 720p Variant
    '-map', '0:v:0', '-map', '0:a:0',
    '-c:v:0', 'libx264', '-preset', 'veryfast', '-b:v:0', '1500k', '-maxrate:v:0', '1500k', '-bufsize:v:0', '3000k',
    '-filter:v:0', 'scale=w=1280:h=720',
    
    // 480p Variant
    '-map', '0:v:0', '-map', '0:a:0',
    '-c:v:1', 'libx264', '-preset', 'veryfast', '-b:v:1', '800k', '-maxrate:v:1', '800k', '-bufsize:v:1', '1600k',
    '-filter:v:1', 'scale=w=854:h=480',
    
    // Audio Configuration
    '-c:a', 'aac', '-b:a', '128k',
    
    // Multi-variant HLS flags
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-master_pl_name', 'index.m3u8',
    '-var_stream_map', 'v:0,a:0 v:1,a:1',
    resolve(outputDir, 'v%v/index.m3u8'),

    // Direct MP4 archive output (captures raw stream in real-time)
    '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'mp4',
    resolve(PROJECT_ROOT, 'uploads', `stream-archive-${streamId}.mp4`)
  ];

  console.log(`[RTMP Transcoder] Spawning FFmpeg multi-variant HLS: ${ffmpegPath} ${args.slice(0, 10).join(' ')} ...`);
  const ffmpegProc = spawn(ffmpegPath, args);

  ffmpegProc.stderr.on('data', (data) => {
    // console.log(`[FFmpeg-${streamKey}]`, data.toString().trim());
  });

  ffmpegProc.on('close', (code) => {
    console.log(`[RTMP Transcoder] FFmpeg exited with code ${code} for key ${streamKey}`);
    activeTranscoders.delete(streamKey);
  });

  activeTranscoders.set(streamKey, ffmpegProc);
}

function stopTranscoding(streamKey) {
  const proc = activeTranscoders.get(streamKey);
  if (proc) {
    console.log(`[RTMP Transcoder] Stopping FFmpeg transcoder for key ${streamKey}`);
    try {
      proc.kill('SIGKILL');
    } catch (e) {}
    activeTranscoders.delete(streamKey);
  }
}
