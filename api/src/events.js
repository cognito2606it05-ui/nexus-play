// Real-time push over Server-Sent Events (SSE). Works on plain node:http with
// zero deps; browsers consume it via EventSource. Used for notifications, live
// stream discovery, live chat, and WebRTC signaling relay.
import jwt from './jwt.js';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';

// userId -> Set of { res, profileId }
const clients = new Map();

export function userFromToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.accessSecret);
    return db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(decoded.sub) || null;
  } catch {
    return null;
  }
}

function write(res, event) {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    /* connection gone; pruned on close */
  }
}

// Attach an SSE client. Returns nothing; cleanup happens on req close.
export function subscribe(req, res, user, profileId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  write(res, { type: 'connected', payload: { at: Date.now() } });

  const entry = { res, profileId };
  if (!clients.has(user.id)) clients.set(user.id, new Set());
  clients.get(user.id).add(entry);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* noop */ }
  }, 25000);

  const cleanup = () => {
    clearInterval(ping);
    const set = clients.get(user.id);
    if (set) { set.delete(entry); if (!set.size) clients.delete(user.id); }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
}

export function publishToUser(userId, event) {
  const set = clients.get(userId);
  if (!set) return;
  for (const { res } of set) write(res, event);
}

export function publishToProfile(profileId, event) {
  for (const set of clients.values()) {
    for (const entry of set) if (entry.profileId === profileId) write(entry.res, event);
  }
}

export function publishAll(event, exceptUserId) {
  for (const [userId, set] of clients.entries()) {
    if (userId === exceptUserId) continue;
    for (const { res } of set) write(res, event);
  }
}

// Persist a notification and push it live to the recipient.
export function notify(userId, { type, title, body = null, data = null }) {
  const id = randomUUID();
  const createdAt = Date.now();
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(id, userId, type, title, body, data ? JSON.stringify(data) : null, createdAt);
  publishToUser(userId, {
    type: 'notification',
    payload: { id, type, title, body, data, read: false, createdAt },
  });
  return id;
}
