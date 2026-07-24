import { Router } from '../server.js';
import { randomUUID } from 'node:crypto';
import { db, isPg } from '../db.js';
import { absUrl } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  issueTokens,
  verifyRefresh,
  requireAuth,
} from '../auth.js';

export const router = Router();

function serializeProfile(req, p) {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatar_url ? absUrl(req, p.avatar_url) : null,
    color: p.color,
    isKids: !!p.is_kids,
    subscribed: !!p.subscribed,
  };
}

function profilesForUser(req, userId) {
  return db
    .prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at')
    .all(userId)
    .map((p) => serializeProfile(req, p));
}

function authPayload(req, user) {
  const tokens = issueTokens(user);
  return {
    ...tokens,
    user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role || 'user', phone: user.phone },
    profiles: profilesForUser(req, user.id),
  };
}

router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: String(email).toLowerCase(),
    display_name: displayName || String(email).split('@')[0],
  };
  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, user.email, hashPassword(password), user.display_name, 'user', now);

  // every account starts with one default profile with a cartoon avatar by default
  db.prepare(
    'INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(randomUUID(), user.id, user.display_name, '/media/avatars/animated_1.png', '#e50914', now);

  res.status(201).json(authPayload(req, user));
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json(authPayload(req, user));
});

router.post('/send-otp', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = String(phone).replace(/[\s\-\+\(\)]/g, '');

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

  // Store in database
  if (isPg) {
    db.prepare('INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?) ON CONFLICT (phone) DO UPDATE SET otp = EXCLUDED.otp, expires_at = EXCLUDED.expires_at').run(normalizedPhone, otp, expiresAt);
  } else {
    db.prepare('INSERT OR REPLACE INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)').run(normalizedPhone, otp, expiresAt);
  }

  console.log(`[SMS OTP Simulator] Sent OTP ${otp} to phone ${normalizedPhone}`);

  res.json({ success: true, message: `OTP sent successfully (Simulated). Code: ${otp}`, otp });
});

router.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  const normalizedPhone = String(phone).replace(/[\s\-\+\(\)]/g, '');

  const record = db.prepare('SELECT * FROM otps WHERE phone = ?').get(normalizedPhone);
  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this phone number' });
  }

  if (record.otp !== String(otp)) {
    return res.status(400).json({ error: 'Invalid OTP code' });
  }

  if (Date.now() > record.expires_at) {
    return res.status(400).json({ error: 'OTP has expired' });
  }

  // Delete the OTP record since it has been verified
  db.prepare('DELETE FROM otps WHERE phone = ?').run(normalizedPhone);

  // Check if user exists
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizedPhone);
  
  if (!user) {
    // Check if user exists with the dummy email first to prevent conflicts
    const email = `${normalizedPhone}@nexusplay.app`;
    const existingEmailUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (existingEmailUser) {
      // If user exists with that email but phone wasn't set, update it
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(normalizedPhone, existingEmailUser.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingEmailUser.id);
    } else {
      // Create new user
      const now = new Date().toISOString();
      const userId = randomUUID();
      const displayName = `User ${normalizedPhone.slice(-4)}`;
      
      db.prepare(
        'INSERT INTO users (id, email, password_hash, display_name, phone, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, email, hashPassword(randomUUID()), displayName, normalizedPhone, 'user', now);
      
      // Create default profile for the user
      db.prepare(
        'INSERT INTO profiles (id, user_id, name, avatar_url, color, is_kids, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(randomUUID(), userId, displayName, '/media/avatars/animated_1.png', '#e50914', now);
      
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }
  }

  res.json(authPayload(req, user));
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
  try {
    const decoded = verifyRefresh(refreshToken);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    res.json(issueTokens(user));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email, displayName: req.user.display_name, role: req.user.role || 'user' },
    profiles: profilesForUser(req, req.user.id),
  });
});

// POST /api/auth/change-password - Change account password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid current password' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  res.json({ success: true, message: 'Password updated successfully' });
});

// PATCH /api/auth/update-info - Update display name
router.patch('/update-info', requireAuth, (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName) {
    return res.status(400).json({ error: 'displayName is required' });
  }

  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, req.user.id);
  res.json({ success: true, displayName });
});
