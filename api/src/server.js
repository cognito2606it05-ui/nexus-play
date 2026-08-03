// Minimal Express-compatible HTTP layer built on node:http.
// Avoids the `require('express')` hang seen on this Node build, with zero
// external framework deps. Supports just what this API needs: JSON bodies,
// path params, router-level middleware, CORS, and static files with HTTP
// Range support (so video seeking works).
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain', '.xml': 'application/xml',
  '.map': 'application/json',
};

function compile(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.map((p) => (p.startsWith(':') ? { param: p.slice(1) } : { literal: p }));
}

function matchParts(pattern, segments) {
  if (pattern.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    const seg = decodeURIComponent(segments[i]);
    if (p.param) params[p.param] = seg;
    else if (p.literal !== seg) return null;
  }
  return params;
}

export function Router() {
  const middleware = [];
  const routes = [];
  const register = (method, path, handlers) => routes.push({ method, pattern: compile(path), handlers });
  return {
    _isRouter: true,
    use: (...fns) => middleware.push(...fns.filter((f) => typeof f === 'function')),
    get: (p, ...h) => register('GET', p, h),
    post: (p, ...h) => register('POST', p, h),
    put: (p, ...h) => register('PUT', p, h),
    patch: (p, ...h) => register('PATCH', p, h),
    delete: (p, ...h) => register('DELETE', p, h),
    async handle(req, res, segments) {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const params = matchParts(route.pattern, segments);
        if (!params) continue;
        req.params = params;
        // run router middleware (each may end the response)
        for (const mw of middleware) {
          let nexted = false;
          await mw(req, res, () => { nexted = true; });
          if (res.writableEnded) return true;
          if (!nexted) return true; // middleware ended the chain without error
        }

        // run route-specific handlers/middlewares in sequence
        const handlers = route.handlers.flat().filter(h => typeof h === 'function');
        for (let i = 0; i < handlers.length; i++) {
          const handler = handlers[i];
          let nexted = false;
          const next = () => { nexted = true; };
          await handler(req, res, next);
          if (res.writableEnded) return true;
          if (i < handlers.length - 1 && !nexted) return true; // route middleware did not call next
        }
        return true;
      }
      return false; // no route in this router matched
    },
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res, dir, rel) {
  // prevent path traversal
  const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(dir, safe);
  if (!filePath.startsWith(dir + sep)) return sendJson(res, 403, { error: 'Forbidden' });

  let stat;
  try { stat = statSync(filePath); } catch { return sendJson(res, 404, { error: 'Not found' }); }
  if (!stat.isFile()) return sendJson(res, 404, { error: 'Not found' });

  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) end = stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
    createReadStream(filePath).pipe(res);
  }
}

export function createApp({ staticMounts = [], spaFallback = null } = {}) {
  const mounts = []; // { prefix, router }
  const direct = []; // { method, pattern, handler } for app.get(...)

  function augment(req, res) {
    res.statusCode = 200; // Reset default to 200 OK to prevent proxy/passenger from defaulting to 404
    req.get = (name) => req.headers[String(name).toLowerCase()];
    req.protocol = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => sendJson(res, res.statusCode || 200, obj);
    res.set = (k, v) => { res.setHeader(k, v); return res; };
    res.send = (txt) => res.end(txt);
  }

  async function readBody(req) {
    if (req.body !== undefined) return;
    const ctype = req.headers['content-type'] || '';
    if (!ctype.includes('application/json')) { req.body = {}; return; }
    const chunks = [];
    let size = 0;
    const MAX_BODY = 50 * 1024 * 1024; // 50 MB for video uploads
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new Error('Payload too large');
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    req.body = raw ? JSON.parse(raw) : {};
  }

  const server = http.createServer(async (req, res) => {
    augment(req, res);
    // CORS (open for the local dev app / web client)
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Profile-Id, Bypass-Tunnel-Reminder, bypass-tunnel-reminder');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams.entries());

    console.log(`[API Request] ${req.method} ${pathname} from ${req.socket.remoteAddress}`);

    try {
      // static mounts
      for (const m of staticMounts) {
        if (pathname === m.prefix || pathname.startsWith(m.prefix + '/')) {
          const rel = decodeURIComponent(pathname.slice(m.prefix.length));
          return serveStatic(req, res, m.dir, rel);
        }
      }

      // direct app routes
      const segs = pathname.split('/').filter(Boolean);
      for (const r of direct) {
        if (r.method !== req.method) continue;
        const params = matchParts(r.pattern, segs);
        if (params) { req.params = params; await readBody(req); return await r.handler(req, res); }
      }

      // mounted routers
      for (const mount of mounts) {
        const pfxSegs = mount.prefix.split('/').filter(Boolean);
        if (pfxSegs.every((s, i) => segs[i] === s) && segs.length >= pfxSegs.length) {
          await readBody(req);
          const rest = segs.slice(pfxSegs.length);
          const handled = await mount.router.handle(req, res, rest);
          if (handled) return;
        }
      }

      // SPA fallback: serve from web dist directory if configured
      if (spaFallback && req.method === 'GET') {
        // Try to serve the exact file (e.g. /manifest.json, /logo-512.png, /sw.js)
        const safePath = normalize(decodeURIComponent(pathname)).split('..').join('');
        const filePath = join(spaFallback, safePath);
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) return serveStatic(req, res, spaFallback, safePath);
        } catch {}
        // Fall back to index.html for SPA client-side routing
        return serveStatic(req, res, spaFallback, '/index.html');
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error(err);
      if (!res.writableEnded) sendJson(res, err.status || 500, { error: err.message || 'Internal server error' });
    }
  });

  return {
    use(prefix, router) {
      if (router && router._isRouter) mounts.push({ prefix, router });
    },
    get(path, handler) { direct.push({ method: 'GET', pattern: compile(path), handler }); },
    listen(port, host, cb) {
      if (typeof host === 'function') { cb = host; host = '0.0.0.0'; }
      server.listen(port, host || '0.0.0.0', cb);
      return server;
    },
  };
}
