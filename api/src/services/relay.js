import { Server } from 'socket.io';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { db } from '../db.js';
import { userFromToken, publishAll } from '../events.js';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from '../config.js';
import { existsSync } from 'node:fs';

let ioInstance = null;

export function getIo() {
  return ioInstance;
}

export function initRelayServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  ioInstance = io;

  const liveRelay = io.of('/live-relay');

  liveRelay.on('connection', async (socket) => {
    console.log('[Relay Server] New socket connection attempt:', socket.id);

    const { token, streamKey } = socket.handshake.auth || {};
    if (!token || !streamKey) {
      console.log('[Relay Server] Connection rejected: Missing credentials');
      socket.emit('error-msg', 'Authentication credentials missing.');
      socket.disconnect(true);
      return;
    }

    const user = userFromToken(token);
    if (!user) {
      console.log('[Relay Server] Connection rejected: Invalid user token');
      socket.emit('error-msg', 'Invalid access token.');
      socket.disconnect(true);
      return;
    }

    // Verify reporter permissions
    if (user.role !== 'super_admin' && user.role !== 'news_reader' && user.role !== 'user') {
      console.log('[Relay Server] Connection rejected: Insufficient permissions');
      socket.emit('error-msg', 'Unauthorized: Insufficient reporter permissions.');
      socket.disconnect(true);
      return;
    }

    // Verify stream key exists and is active in DB
    const keyRow = db.prepare('SELECT * FROM stream_keys WHERE stream_key = ? AND is_active = 1').get(streamKey);
    if (!keyRow) {
      console.log('[Relay Server] Connection rejected: Inactive or invalid stream key:', streamKey);
      socket.emit('error-msg', 'Invalid stream key.');
      socket.disconnect(true);
      return;
    }

    console.log(`[Relay Server] Authenticated reporter: ${user.display_name} with stream key ${streamKey}`);
    socket.emit('authenticated', { success: true });

    let ffmpegProc = null;
    let bytesReceived = 0;
    let lastMetricsTime = Date.now();
    let metricsInterval = null;
    let activeStreamId = null;

    socket.on('start-relay', (data) => {
      activeStreamId = data?.streamId;
      if (ffmpegProc) {
        console.log('[Relay Server] ffmpeg already running, killing previous...');
        try {
          ffmpegProc.stdin.end();
          ffmpegProc.kill('SIGKILL');
        } catch (e) {}
      }

      console.log(`[Relay Server] Starting RTMP push relay for streamKey: ${streamKey}`);
      
      const rtmpUrl = `rtmp://localhost:1935/live/${streamKey}`;
      
      // Spawn ffmpeg to read from pipe:0 (stdin) and transcode WebM to RTMP FLV
      ffmpegProc = spawn(ffmpegPath, [
        '-y',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-f', 'flv',
        rtmpUrl
      ]);

      ffmpegProc.on('error', (err) => {
        console.error('[Relay Server] FFmpeg spawn error:', err);
        socket.emit('error-msg', 'Failed to launch transcoder on media server.');
        socket.disconnect(true);
      });

      ffmpegProc.stderr.on('data', (data) => {
        console.error(`[FFmpeg-Relay-Error] ${data.toString()}`);
      });

      ffmpegProc.on('close', (code) => {
        console.log(`[Relay Server] FFmpeg process exited with code ${code}`);
        socket.emit('status', 'Failed');
      });

      socket.emit('status', 'Connected');

      // Start metrics broadcast interval
      metricsInterval = setInterval(() => {
        const now = Date.now();
        const elapsedSecs = (now - lastMetricsTime) / 1000;
        lastMetricsTime = now;

        const bitrate = elapsedSecs > 0 ? Math.round((bytesReceived * 8) / (elapsedSecs * 1000)) : 0;
        bytesReceived = 0;

        const mockFps = Math.floor(28 + Math.random() * 4);
        const mockLatency = Math.floor(100 + Math.random() * 60);
        const quality = bitrate > 1500 ? 'Excellent' : bitrate > 800 ? 'Good' : 'Fair';
        const mockCpu = Math.floor(8 + Math.random() * 8);

        // Fetch current live viewers if stream session is active
        let liveViewers = 0;
        if (activeStreamId) {
          try {
            const streamRow = db.prepare('SELECT viewers FROM live_streams WHERE id = ?').get(activeStreamId);
            if (streamRow) liveViewers = streamRow.viewers;
          } catch (e) {}
        }

        socket.emit('stream-metrics', {
          fps: mockFps,
          bitrate: bitrate, // kbps
          latency: mockLatency, // ms
          quality: quality,
          cpuUsage: mockCpu,
          viewerCount: liveViewers
        });
      }, 2000);
    });

    socket.on('video-chunk', (chunk) => {
      if (ffmpegProc && !ffmpegProc.killed) {
        try {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesReceived += buffer.length;
          ffmpegProc.stdin.write(buffer);
        } catch (e) {
          console.error('[Relay Server] Error writing chunk to FFmpeg stdin:', e);
        }
      }
    });

    const cleanup = () => {
      console.log('[Relay Server] Cleaning up relay resources for socket:', socket.id);
      if (metricsInterval) {
        clearInterval(metricsInterval);
        metricsInterval = null;
      }
      if (ffmpegProc) {
        try {
          ffmpegProc.stdin.end();
          ffmpegProc.kill('SIGKILL');
        } catch (e) {}
        ffmpegProc = null;
      }
    };

    socket.on('stop-relay', cleanup);
    socket.on('disconnect', cleanup);
  });
}
