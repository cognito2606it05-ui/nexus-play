import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// api/src -> api -> project root
export const PROJECT_ROOT = resolve(__dirname, '../..');
export const API_ROOT = resolve(__dirname, '..');

// Load environment variables locally if .env exists
import { existsSync, readFileSync } from 'node:fs';
const envPath = resolve(API_ROOT, '.env');
if (existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
      const envContent = readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split('=');
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (err) {
    console.error('[Config] Error loading .env:', err);
  }
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  // JWT secrets. In production these come from env / a secrets manager.
  accessSecret: process.env.JWT_ACCESS_SECRET || 'nexus-dev-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'nexus-dev-refresh-secret-change-me',
  accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshTtl: process.env.JWT_REFRESH_TTL || '30d',

  // Real asset folders that ship with the repo, served as /media/*
  mediaDirs: {
    reels: resolve(PROJECT_ROOT, 'Ai videos'),
    avatars: resolve(PROJECT_ROOT, 'sample users'),
  },

  dbFile: process.env.DB_FILE || resolve(API_ROOT, 'nexus-play-api-dev.db'),
};

// Build an absolute URL for a media asset from the incoming request,
// so it works whether the app talks to localhost, a LAN IP, or a deploy.
export function mediaUrl(req, kind, filename) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/media/${kind}/${encodeURIComponent(filename)}`;
}

export function absUrl(req, path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
