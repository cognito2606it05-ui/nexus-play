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

const BAD_WORDS = ['badword', 'abuse', 'hate', 'spam'];
function filterMessage(text) {
  let filtered = text;
  BAD_WORDS.forEach(word => {
    const reg = new RegExp(word, 'gi');
    filtered = filtered.replace(reg, '***');
  });
  return filtered;
}

export function initRelayServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  ioInstance = io;

  // Track active room sockets & live stream sockets
  const roomSockets = new Map(); // roomId -> Set of socket.id

  // ----------------------------------------------------
  // MAIN SOCKET.IO NAMESPACE (Public Live & Room Live)
  // ----------------------------------------------------
  io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected:', socket.id);

    // ------------------------------------
    // PUBLIC LIVE STREAM EVENTS
    // ------------------------------------
    socket.on('join-live-stream', async (data) => {
      const { streamId, userId, userName, userAvatar } = data || {};
      if (!streamId) return;

      const roomName = `live:${streamId}`;
      socket.join(roomName);
      socket.streamId = streamId;
      socket.userId = userId || socket.id;

      // Update viewer count in DB
      try {
        db.prepare('UPDATE live_streams SET viewers = viewers + 1, peak_viewers = MAX(peak_viewers, viewers + 1) WHERE id = ?').run(streamId);
        db.prepare('UPDATE user_streams SET total_views = total_views + 1, peak_viewers = MAX(peak_viewers, total_views + 1) WHERE id = ?').run(streamId);
        
        const row = db.prepare('SELECT viewers FROM live_streams WHERE id = ?').get(streamId);
        const count = row ? row.viewers : 1;

        io.to(roomName).emit('live-viewer-count', { streamId, count });
      } catch (e) {
        console.error('Error updating live viewer count:', e);
      }

      // Fetch recent chat history
      try {
        const history = db.prepare(`
          SELECT * FROM live_chat_messages 
          WHERE stream_id = ? AND is_deleted = 0 
          ORDER BY created_at DESC LIMIT 30
        `).all(streamId);
        socket.emit('live-chat-history', history.reverse());
      } catch (e) {}
    });

    socket.on('leave-live-stream', (data) => {
      const { streamId } = data || {};
      if (!streamId) return;

      const roomName = `live:${streamId}`;
      socket.leave(roomName);

      try {
        db.prepare('UPDATE live_streams SET viewers = MAX(0, viewers - 1) WHERE id = ?').run(streamId);
        const row = db.prepare('SELECT viewers FROM live_streams WHERE id = ?').get(streamId);
        const count = row ? row.viewers : 0;
        io.to(roomName).emit('live-viewer-count', { streamId, count });
      } catch (e) {}
    });

    socket.on('send-live-chat', (data) => {
      const { streamId, userId, name, avatar, message, type } = data || {};
      if (!streamId || !message) return;

      const cleanText = filterMessage(message.trim());
      const msgId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const now = new Date().toISOString();

      try {
        db.prepare(`
          INSERT INTO live_chat_messages (id, stream_id, sender_id, sender_name, sender_avatar, message, type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(msgId, streamId, userId || 'anon', name || 'User', avatar || '', cleanText, type || 'text', now);
      } catch (e) {
        console.error('Failed to store live chat message:', e);
      }

      io.to(`live:${streamId}`).emit('new-live-chat', {
        id: msgId,
        streamId,
        sender_id: userId,
        sender_name: name || 'User',
        sender_avatar: avatar || '',
        message: cleanText,
        type: type || 'text',
        created_at: now
      });
    });

    socket.on('pin-live-chat', (data) => {
      const { streamId, messageId, isPinned } = data || {};
      if (!streamId || !messageId) return;

      try {
        db.prepare('UPDATE live_chat_messages SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, messageId);
        io.to(`live:${streamId}`).emit('live-chat-pinned', { messageId, isPinned });
      } catch (e) {}
    });

    socket.on('delete-live-chat', (data) => {
      const { streamId, messageId } = data || {};
      if (!streamId || !messageId) return;

      try {
        db.prepare('UPDATE live_chat_messages SET is_deleted = 1 WHERE id = ?').run(messageId);
        io.to(`live:${streamId}`).emit('live-chat-deleted', { messageId });
      } catch (e) {}
    });

    socket.on('send-live-reaction', (data) => {
      const { streamId, emoji } = data || {};
      if (!streamId) return;
      io.to(`live:${streamId}`).emit('live-reaction-event', { streamId, emoji: emoji || '❤️' });
    });

    // Public Live WebRTC Signaling (Host Broadcaster <-> Viewer Relay)
    socket.on('public-live-offer', (data) => {
      const { streamId, sdp } = data || {};
      socket.to(`live:${streamId}`).emit('public-live-offer', { streamId, sdp, senderId: socket.id });
    });

    socket.on('public-live-answer', (data) => {
      const { streamId, sdp, targetId } = data || {};
      if (targetId) {
        io.to(targetId).emit('public-live-answer', { streamId, sdp, senderId: socket.id });
      } else {
        socket.to(`live:${streamId}`).emit('public-live-answer', { streamId, sdp, senderId: socket.id });
      }
    });

    socket.on('public-live-ice-candidate', (data) => {
      const { streamId, candidate, targetId } = data || {};
      if (targetId) {
        io.to(targetId).emit('public-live-ice-candidate', { streamId, candidate, senderId: socket.id });
      } else {
        socket.to(`live:${streamId}`).emit('public-live-ice-candidate', { streamId, candidate, senderId: socket.id });
      }
    });

    // ------------------------------------
    // ROOM LIVE (DEBATE MODE) EVENTS
    // ------------------------------------
    socket.on('join-room-session', (data) => {
      const { roomId, userId, userName, userAvatar, role } = data || {};
      if (!roomId) return;

      const roomName = `room:${roomId}`;
      socket.join(roomName);
      socket.roomId = roomId;
      socket.userId = userId || socket.id;
      socket.userName = userName || 'Participant';
      socket.role = role || 'spectator';

      if (!roomSockets.has(roomId)) {
        roomSockets.set(roomId, new Map());
      }
      roomSockets.get(roomId).set(socket.id, {
        socketId: socket.id,
        userId: socket.userId,
        userName: socket.userName,
        role: socket.role,
        micEnabled: socket.role !== 'spectator',
        camEnabled: socket.role !== 'spectator',
        handRaised: false
      });

      // Broadcast participant joined to room
      io.to(roomName).emit('room-participant-joined', {
        roomId,
        participant: {
          socketId: socket.id,
          userId: socket.userId,
          name: socket.userName,
          avatar: userAvatar || '',
          role: socket.role,
          micEnabled: socket.role !== 'spectator' ? 1 : 0,
          camEnabled: socket.role !== 'spectator' ? 1 : 0,
          handRaised: 0
        }
      });

      // Send current participants list to joining socket
      const participantList = Array.from(roomSockets.get(roomId).values());
      socket.emit('room-participants-list', participantList);

      // Send recent room chat history
      try {
        const history = db.prepare(`
          SELECT * FROM live_chat_messages 
          WHERE room_id = ? AND is_deleted = 0 
          ORDER BY created_at DESC LIMIT 30
        `).all(roomId);
        socket.emit('room-chat-history', history.reverse());
      } catch (e) {}
    });

    socket.on('leave-room-session', (data) => {
      const { roomId } = data || {};
      if (!roomId) return;

      const roomName = `room:${roomId}`;
      socket.leave(roomName);

      if (roomSockets.has(roomId)) {
        roomSockets.get(roomId).delete(socket.id);
      }

      io.to(roomName).emit('room-participant-left', { roomId, socketId: socket.id, userId: socket.userId });
    });

    // Mesh WebRTC Peer Connection Signaling between Debate Speakers
    socket.on('room-signal-offer', (data) => {
      const { roomId, targetSocketId, sdp } = data || {};
      if (targetSocketId) {
        io.to(targetSocketId).emit('room-signal-offer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
          senderName: socket.userName
        });
      }
    });

    socket.on('room-signal-answer', (data) => {
      const { roomId, targetSocketId, sdp } = data || {};
      if (targetSocketId) {
        io.to(targetSocketId).emit('room-signal-answer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId
        });
      }
    });

    socket.on('room-ice-candidate', (data) => {
      const { roomId, targetSocketId, candidate } = data || {};
      if (targetSocketId) {
        io.to(targetSocketId).emit('room-ice-candidate', {
          roomId,
          candidate,
          senderSocketId: socket.id,
          senderUserId: socket.userId
        });
      }
    });

    socket.on('room-toggle-media', (data) => {
      const { roomId, micEnabled, camEnabled } = data || {};
      if (!roomId) return;

      if (roomSockets.has(roomId) && roomSockets.get(roomId).has(socket.id)) {
        const p = roomSockets.get(roomId).get(socket.id);
        p.micEnabled = micEnabled;
        p.camEnabled = camEnabled;
      }

      try {
        db.prepare(`
          UPDATE room_participants 
          SET mic_enabled = ?, cam_enabled = ? 
          WHERE room_id = ? AND user_id = ?
        `).run(micEnabled ? 1 : 0, camEnabled ? 1 : 0, roomId, socket.userId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-media-updated', {
        socketId: socket.id,
        userId: socket.userId,
        micEnabled,
        camEnabled
      });
    });

    socket.on('room-raise-hand', (data) => {
      const { roomId, handRaised } = data || {};
      if (!roomId) return;

      if (roomSockets.has(roomId) && roomSockets.get(roomId).has(socket.id)) {
        roomSockets.get(roomId).get(socket.id).handRaised = handRaised;
      }

      try {
        db.prepare(`
          UPDATE room_participants 
          SET hand_raised = ? 
          WHERE room_id = ? AND user_id = ?
        `).run(handRaised ? 1 : 0, roomId, socket.userId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-hand-raised-event', {
        socketId: socket.id,
        userId: socket.userId,
        userName: socket.userName,
        handRaised
      });
    });

    socket.on('room-grant-speaker', (data) => {
      const { roomId, targetUserId, targetSocketId } = data || {};
      if (!roomId) return;

      try {
        db.prepare(`
          UPDATE room_participants 
          SET role = 'speaker', mic_enabled = 1, cam_enabled = 1, hand_raised = 0 
          WHERE room_id = ? AND user_id = ?
        `).run(roomId, targetUserId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-role-updated', {
        targetUserId,
        targetSocketId,
        role: 'speaker'
      });
    });

    socket.on('room-revoke-speaker', (data) => {
      const { roomId, targetUserId, targetSocketId } = data || {};
      if (!roomId) return;

      try {
        db.prepare(`
          UPDATE room_participants 
          SET role = 'spectator', mic_enabled = 0, cam_enabled = 0, hand_raised = 0 
          WHERE room_id = ? AND user_id = ?
        `).run(roomId, targetUserId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-role-updated', {
        targetUserId,
        targetSocketId,
        role: 'spectator'
      });
    });

    socket.on('room-host-mute-mic', (data) => {
      const { roomId, targetUserId, targetSocketId } = data || {};
      if (!roomId) return;

      try {
        db.prepare(`
          UPDATE room_participants 
          SET mic_enabled = 0 
          WHERE room_id = ? AND user_id = ?
        `).run(roomId, targetUserId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-host-mute-mic-event', {
        roomId,
        targetUserId,
        targetSocketId
      });
    });

    socket.on('room-host-stop-cam', (data) => {
      const { roomId, targetUserId, targetSocketId } = data || {};
      if (!roomId) return;

      try {
        db.prepare(`
          UPDATE room_participants 
          SET cam_enabled = 0 
          WHERE room_id = ? AND user_id = ?
        `).run(roomId, targetUserId);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('room-host-stop-cam-event', {
        roomId,
        targetUserId,
        targetSocketId
      });
    });

    socket.on('send-room-chat', (data) => {
      const { roomId, userId, name, avatar, message } = data || {};
      if (!roomId || !message) return;

      const cleanText = filterMessage(message.trim());
      const msgId = `room-chat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const now = new Date().toISOString();

      try {
        db.prepare(`
          INSERT INTO live_chat_messages (id, room_id, sender_id, sender_name, sender_avatar, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(msgId, roomId, userId || socket.id, name || 'User', avatar || '', cleanText, now);
      } catch (e) {}

      io.to(`room:${roomId}`).emit('new-room-chat', {
        id: msgId,
        roomId,
        sender_id: userId,
        sender_name: name || 'User',
        sender_avatar: avatar || '',
        message: cleanText,
        created_at: now
      });
    });

    socket.on('send-room-reaction', (data) => {
      const { roomId, emoji } = data || {};
      if (!roomId) return;
      io.to(`room:${roomId}`).emit('room-reaction-event', { roomId, emoji: emoji || '👏' });
    });

    socket.on('disconnect', () => {
      if (socket.streamId) {
        try {
          db.prepare('UPDATE live_streams SET viewers = MAX(0, viewers - 1) WHERE id = ?').run(socket.streamId);
          const row = db.prepare('SELECT viewers FROM live_streams WHERE id = ?').get(socket.streamId);
          const count = row ? row.viewers : 0;
          io.to(`live:${socket.streamId}`).emit('live-viewer-count', { streamId: socket.streamId, count });
        } catch (e) {}
      }

      if (socket.roomId && roomSockets.has(socket.roomId)) {
        roomSockets.get(socket.roomId).delete(socket.id);
        io.to(`room:${socket.roomId}`).emit('room-participant-left', { roomId: socket.roomId, socketId: socket.id, userId: socket.userId });
      }
    });
  });

  // ----------------------------------------------------
  // /live-relay NAMESPACE FOR RTMP PUSH BROADCASTING
  // ----------------------------------------------------
  const liveRelay = io.of('/live-relay');

  liveRelay.on('connection', async (socket) => {
    console.log('[Relay Server] New socket connection attempt:', socket.id);

    const { token, streamKey } = socket.handshake.auth || {};
    if (!token || !streamKey) {
      socket.emit('error-msg', 'Authentication credentials missing.');
      socket.disconnect(true);
      return;
    }

    const user = userFromToken(token);
    if (!user) {
      socket.emit('error-msg', 'Invalid access token.');
      socket.disconnect(true);
      return;
    }

    const keyRow = db.prepare('SELECT * FROM stream_keys WHERE stream_key = ? AND is_active = 1').get(streamKey);
    if (!keyRow) {
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
        try {
          ffmpegProc.stdin.end();
          ffmpegProc.kill('SIGKILL');
        } catch (e) {}
      }

      console.log(`[Relay Server] Starting RTMP push relay for streamKey: ${streamKey}`);
      const rtmpUrl = `rtmp://localhost:1935/live/${streamKey}`;
      
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

      ffmpegProc.on('close', (code) => {
        console.log(`[Relay Server] FFmpeg process exited with code ${code}`);
        socket.emit('status', 'Failed');
      });

      socket.emit('status', 'Connected');

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

        let liveViewers = 0;
        if (activeStreamId) {
          try {
            const streamRow = db.prepare('SELECT viewers FROM live_streams WHERE id = ?').get(activeStreamId);
            if (streamRow) liveViewers = streamRow.viewers;
          } catch (e) {}
        }

        socket.emit('stream-metrics', {
          fps: mockFps,
          bitrate: bitrate,
          latency: mockLatency,
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
        } catch (e) {}
      }
    });

    const cleanup = () => {
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
