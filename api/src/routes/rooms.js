import { Router } from '../server.js';
import { db } from '../db.js';
import { requireAuth, resolveProfile } from '../auth.js';
import { publishAll } from '../events.js';
import { randomUUID } from 'node:crypto';

export const router = Router();
router.use(requireAuth);

function withProfile(handler) {
  return (req, res) => {
    resolveProfile(req, res, () => {
      handler(req, res);
    });
  };
}

// Generate random 6-digit numeric room ID
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate random alphanumeric 6-char password
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// POST /api/rooms/create - Host creates a new Room Live session
router.post('/create', withProfile((req, res) => {
  try {
    const { roomName, topic, description, category, password, maxParticipants, visibility } = req.body || {};

    if (!roomName || !roomName.trim() || !topic || !topic.trim()) {
      return res.status(400).json({ error: 'Room name and topic are required' });
    }

    // End any existing active room hosted by this user
    try {
      db.prepare("UPDATE rooms SET status = 'ended', ended_at = ? WHERE host_id = ? AND status = 'active'")
        .run(new Date().toISOString(), req.user.id);
    } catch (e) {}

    const roomId = generateRoomId();
    const roomPass = (password && password.trim()) ? password.trim().toUpperCase() : generatePassword();
    const now = new Date().toISOString();
    const maxParts = Number(maxParticipants) || 10;
    const roomVis = (visibility === 'private') ? 'private' : 'public';
    const inviteLink = `/room/${roomId}`;

    db.prepare(`
      INSERT INTO rooms (
        id, host_id, room_name, topic, description, password, invite_link,
        status, visibility, max_participants, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      roomId,
      req.user.id,
      roomName.trim(),
      topic.trim(),
      description ? description.trim() : '',
      roomPass,
      inviteLink,
      roomVis,
      maxParts,
      now
    );

    // Add Host to room_participants table with role = 'host'
    const partId = randomUUID();
    db.prepare(`
      INSERT INTO room_participants (
        id, room_id, user_id, role, mic_enabled, cam_enabled, hand_raised, joined_at
      ) VALUES (?, ?, ?, 'host', 1, 1, 0, ?)
    `).run(partId, roomId, req.user.id, now);

    let roomData = db.prepare(`
      SELECT r.*, u.display_name AS host_name, p.avatar_url AS host_avatar
      FROM rooms r
      JOIN users u ON r.host_id = u.id
      LEFT JOIN profiles p ON p.id = ?
      WHERE r.id = ?
    `).get(req.profile.id, roomId);

    if (!roomData) {
      roomData = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    }

    publishAll({
      type: 'room_created',
      payload: roomData
    });

    res.status(201).json({
      success: true,
      data: {
        ...roomData,
        role: 'host',
        password: roomPass,
        inviteLink
      }
    });
  } catch (err) {
    console.error('Failed to create live debate room:', err);
    res.status(500).json({ error: err.message || 'Failed to create live debate room' });
  }
}));

// POST /api/rooms/join - Join a Room Live session using Room ID & Password / Invite
router.post('/join', withProfile((req, res) => {
  const { roomId, password, rolePreference } = req.body || {};

  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required to join' });
  }

  const room = db.prepare(`
    SELECT r.*, u.display_name AS host_name, p.avatar_url AS host_avatar
    FROM rooms r
    JOIN users u ON r.host_id = u.id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE r.id = ? AND r.status = 'active'
  `).get(roomId.toString().trim());

  if (!room) {
    return res.status(404).json({ error: 'Active room not found. Check the Room ID or status.' });
  }

  // Password verification
  if (room.password && room.host_id !== req.user.id) {
    const inputPass = (password || '').toString().trim().toUpperCase();
    if (inputPass !== room.password.toUpperCase()) {
      return res.status(401).json({ error: 'Invalid room password. Access denied.' });
    }
  }

  const isHost = (room.host_id === req.user.id);
  const now = new Date().toISOString();

  // Determine user role
  let role = isHost ? 'host' : 'spectator';
  if (!isHost && rolePreference === 'speaker') {
    // Check current speaker count vs max participants
    const speakerCount = db.prepare(`
      SELECT COUNT(*) as count FROM room_participants 
      WHERE room_id = ? AND left_at IS NULL AND (role = 'host' OR role = 'speaker')
    `).get(roomId)?.count || 0;

    if (speakerCount < room.max_participants) {
      role = 'speaker';
    }
  }

  // Upsert participant record
  const existingPart = db.prepare('SELECT id FROM room_participants WHERE room_id = ? AND user_id = ?').get(roomId, req.user.id);
  if (existingPart) {
    db.prepare(`
      UPDATE room_participants 
      SET role = ?, left_at = NULL, joined_at = ?
      WHERE id = ?
    `).run(role, now, existingPart.id);
  } else {
    db.prepare(`
      INSERT INTO room_participants (
        id, room_id, user_id, role, mic_enabled, cam_enabled, hand_raised, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(randomUUID(), roomId, req.user.id, role, role === 'spectator' ? 0 : 1, role === 'spectator' ? 0 : 1, now);
  }

  // Retrieve current active participants
  const participants = db.prepare(`
    SELECT rp.*, u.display_name AS name, p.avatar_url AS avatar
    FROM room_participants rp
    JOIN users u ON rp.user_id = u.id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE rp.room_id = ? AND rp.left_at IS NULL
  `).all(roomId);

  res.json({
    success: true,
    data: {
      room,
      role,
      participants
    }
  });
}));

// GET /api/rooms/active - List all active Live Rooms for Home Feed
router.get('/active', (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT r.*, u.display_name AS host_name, p.avatar_url AS host_avatar,
             (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id AND left_at IS NULL) AS total_viewers,
             (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id AND left_at IS NULL AND (role = 'host' OR role = 'speaker')) AS speaker_count
      FROM rooms r
      JOIN users u ON r.host_id = u.id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE r.status = 'active'
      ORDER BY r.created_at DESC
    `).all();

    res.json({ success: true, data: rooms });
  } catch (err) {
    console.error('Failed to get active rooms:', err);
    res.status(500).json({ error: 'Failed to retrieve active rooms' });
  }
});

// GET /api/rooms/:id - Get details of a specific room
router.get('/:id', (req, res) => {
  try {
    const room = db.prepare(`
      SELECT r.*, u.display_name AS host_name, p.avatar_url AS host_avatar
      FROM rooms r
      JOIN users u ON r.host_id = u.id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participants = db.prepare(`
      SELECT rp.*, u.display_name AS name, p.avatar_url AS avatar
      FROM room_participants rp
      JOIN users u ON rp.user_id = u.id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE rp.room_id = ? AND rp.left_at IS NULL
    `).all(req.params.id);

    res.json({ success: true, data: { ...room, participants } });
  } catch (err) {
    console.error('Failed to get room details:', err);
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
});

// POST /api/rooms/:id/end - Host ends room
router.post('/:id/end', withProfile((req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.host_id !== req.user.id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the room host can end the debate room' });
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE rooms SET status = 'ended', ended_at = ? WHERE id = ?").run(now, room.id);
  db.prepare("UPDATE room_participants SET left_at = ? WHERE room_id = ? AND left_at IS NULL").run(now, room.id);

  publishAll({
    type: 'room_ended',
    payload: { id: room.id }
  });

  res.json({ success: true, message: 'Room Live ended successfully' });
}));

// POST /api/rooms/:id/leave - Participant leaves room
router.post('/:id/leave', withProfile((req, res) => {
  const now = new Date().toISOString();
  db.prepare("UPDATE room_participants SET left_at = ? WHERE room_id = ? AND user_id = ?").run(now, req.params.id, req.user.id);
  res.json({ success: true });
}));
