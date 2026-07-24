import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from './jwt.js';
import { config } from './config.js';
import { db } from './db.js';

// ---- Password hashing (node:crypto scrypt, no native deps) ----
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

// ---- JWT (short-lived access + long-lived refresh) ----
export function issueTokens(user) {
  const payload = { sub: user.id, email: user.email };
  const accessToken = jwt.sign(payload, config.accessSecret, { expiresIn: config.accessTtl });
  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, config.refreshSecret, {
    expiresIn: config.refreshTtl,
  });
  return { accessToken, refreshToken };
}

export function verifyRefresh(token) {
  return jwt.verify(token, config.refreshSecret);
}

// Express middleware: requires a valid Bearer access token.
export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token' });
  try {
    const decoded = jwt.verify(token, config.accessSecret);
    const user = db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?').get(decoded.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

// Express middleware: requires specific user role(s).
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userRole = req.user.role || 'user';
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

// Optional: resolve the active profile from the X-Profile-Id header,
// verifying it belongs to the authenticated user.
export function resolveProfile(req, res, next) {
  const profileId = req.get('x-profile-id');
  if (!profileId) return res.status(400).json({ error: 'Missing X-Profile-Id header' });
  const profile = db
    .prepare('SELECT id, name FROM profiles WHERE id = ? AND user_id = ?')
    .get(profileId, req.user.id);
  if (!profile) return res.status(403).json({ error: 'Profile not found for this user' });
  req.profile = profile;
  next();
}
