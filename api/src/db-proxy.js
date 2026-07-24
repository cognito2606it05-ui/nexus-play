import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import http from 'node:http';
import pg from 'pg';

const { Pool } = pg;

// Exit if parent dies to prevent orphan/zombie processes
const parentPid = process.ppid;
setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch (e) {
    if (e.code === 'ESRCH') {
      process.exit(0);
    }
  }
}, 500);

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
const dbPassword = process.env.SUPABASE_DB_PASSWORD || 'Quantex12!@123';

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  if (!SUPABASE_URL) {
    console.error('SUPABASE_URL is not defined in db-proxy');
    process.exit(1);
  }

  const match = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.(?:co|net)/);
  const projectId = match ? match[1] : '';

  if (!projectId) {
    console.error('Invalid SUPABASE_URL in db-proxy:', SUPABASE_URL);
    process.exit(1);
  }

  connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectId}.supabase.co:5432/postgres`;
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper to convert SQLite SQL syntax into PostgreSQL syntax on-the-fly
function convertSql(sql) {
  // 1. Replace SQLite scalar MAX(a, b) with PostgreSQL GREATEST(a, b)
  let transformed = sql.replace(/MAX\s*\(/gi, 'GREATEST(');

  // 2. Translate ALTER TABLE ADD COLUMN to ADD COLUMN IF NOT EXISTS
  transformed = transformed.replace(/ADD COLUMN (?!IF NOT EXISTS )/gi, 'ADD COLUMN IF NOT EXISTS ');

  // 3. Convert positional parameter placeholders "?" into numbered PG placeholders "$1, $2, ..."
  let index = 1;
  return transformed.replace(/\?/g, () => `$${index++}`);
}

const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pong', ppid: parentPid, pid: process.pid }));
    return;
  }

  if (req.method === 'POST' && req.url === '/query') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { sql, params } = JSON.parse(body);
        const pgSql = convertSql(sql);
        const flatParams = params ? params.flat() : [];
        
        const result = await pool.query(pgSql, flatParams);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          rows: result.rows,
          changes: result.rowCount || 0
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404).end();
  }
});

const port = 4001;
server.listen(port, '127.0.0.1', () => {
  console.log(`PG Sync Proxy Server running on port ${port}`);
});
