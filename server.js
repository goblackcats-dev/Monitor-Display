import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, num } from './lib/env.js';
import * as spotify from './lib/spotify.js';
import { claudeCodeUsage } from './lib/claudeLogs.js';
import { openaiSpend, anthropicSpend } from './lib/spend.js';
import crypto from 'node:crypto';
import * as cast from './lib/cast.js';
import { weather } from './lib/weather.js';
import { calendar } from './lib/calendar.js';
import { health } from './lib/health.js';
import * as steps from './lib/steps.js';
import { listTodos, setDone, clearDone } from './lib/todos.js';
import { mcpRespond } from './lib/mcp.js';
import { readJson, writeJson } from './lib/env.js';
import { demoSpotify, demoControl, demoArt, demoUsage, demoTodos, demoToggle } from './lib/demo.js';

const PORT = num(process.env.PORT, 8787);
const BOOT = Date.now(); // the open page reloads itself when this changes, so updates show up without touching the Pi
const DEMO = !!process.env.DEMO;
// Secret path segment that protects the MCP endpoint. Set MCP_TOKEN, or one is generated and kept in data/.
const MCP_TOKEN = process.env.MCP_TOKEN || (() => {
  let t = readJson('mcp-token.json', null)?.token;
  if (!t) { t = crypto.randomBytes(24).toString('base64url'); writeJson('mcp-token.json', { token: t }); }
  return t;
})();
const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

let usageCache = { at: 0, v: null };
async function usage() {
  if (DEMO) return demoUsage();
  if (Date.now() - usageCache.at < 15000 && usageCache.v) return usageCache.v;
  const [anthropic, openai] = await Promise.all([anthropicSpend(), openaiSpend()]);
  usageCache = {
    at: Date.now(),
    v: { claudeCode: claudeCodeUsage(), spend: { anthropic: anthropic || null, openai: openai || null } },
  };
  return usageCache.v;
}

async function readBody(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e5) break; }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// Only localhost / private-network origins may call the control API.
const isLocalHost = (h = '') => /^(127\.0\.0\.1|localhost|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[\w-]+\.local)(:\d+)?$/.test(h);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    // MCP connector: reachable through a tunnel, so it is gated by the secret in the URL instead of the host check.
    if (p.startsWith('/mcp/')) {
      const given = Buffer.from(p.slice(5));
      const want = Buffer.from(MCP_TOKEN);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(res, 404, 'not found', 'text/plain');
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      const r = mcpRespond(await readBody(req));
      return r.body === null ? (res.writeHead(r.status), res.end()) : send(res, r.status, r.body);
    }
    // Steps from an iPhone Shortcut: token in the path, like the MCP endpoint, so it also works over Tailscale.
    if (p.startsWith('/api/steps/')) {
      if (!steps.tokenMatches(p.slice('/api/steps/'.length))) return send(res, 404, 'not found', 'text/plain');
      const n = req.method === 'POST' ? (await readBody(req)).steps : url.searchParams.get('steps');
      return send(res, 200, { ok: true, steps: steps.setSteps(n) });
    }
    if (!isLocalHost(req.headers.host)) return send(res, 403, { error: 'forbidden' });
    if (req.method === 'POST' && req.headers.origin && !isLocalHost(new URL(req.headers.origin).host)) return send(res, 403, { error: 'bad origin' });

    if (p === '/api/state') {
      const [sp, us, wx, cal] = await Promise.all([
        DEMO ? demoSpotify() : spotify.nowPlaying(), usage(),
        DEMO ? { high: 72, low: 55, kind: 'partly', unit: 'F' } : weather(),
        DEMO ? { next: { title: 'Design review', start: Date.now() + 25 * 60e3, end: Date.now() + 55 * 60e3 } } : calendar(),
      ]);
      const hl = DEMO ? { ok: true, issues: [] } : await health(cal?.error ? ['calendar'] : []);
      return send(res, 200, { boot: BOOT, now: Date.now(), demo: DEMO, spotify: sp, ...us, weather: wx, steps: DEMO ? { steps: 6420 } : steps.todaySteps(), calendar: cal?.next ?? null, health: hl, todos: DEMO ? demoTodos() : listTodos() });
    }
    if (p === '/api/spotify' && req.method === 'POST') {
      const { action, value } = await readBody(req);
      if (DEMO) demoControl(action, value); else await spotify.control(action, value);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/todos/toggle' && req.method === 'POST') {
      const { id, done } = await readBody(req);
      if (DEMO) demoToggle(id, done); else setDone(id, !!done);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/todos/clear-done' && req.method === 'POST') { if (!DEMO) clearDone(); return send(res, 200, { ok: true }); }
    if (p === '/api/watch') {
      if (req.method === 'GET') return send(res, 200, await cast.status());
      const { action, url: link, value } = await readBody(req);
      if (action === 'open') await cast.open(link);
      else if (action === 'close') await cast.close();
      else await cast.control(action, value);
      return send(res, 200, await cast.status());
    }
    if (p === '/api/demo-art') return send(res, 200, demoArt(url.searchParams.get('hue')), 'image/svg+xml');

    // Album art proxy: keeps the canvas colour-extraction CORS-safe.
    if (p === '/api/art') {
      const target = new URL(url.searchParams.get('u') || '');
      if (target.protocol !== 'https:' || !/\.scdn\.co$/.test(target.hostname)) return send(res, 400, { error: 'bad url' });
      const r = await fetch(target);
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }

    if (p === '/auth/spotify/login') {
      if (!spotify.configured()) return send(res, 400, 'Set SPOTIFY_CLIENT_ID in .env first', 'text/plain');
      res.writeHead(302, { Location: spotify.loginUrl(PORT) });
      return res.end();
    }
    if (p === '/auth/spotify/callback') {
      if (url.searchParams.get('error')) return send(res, 400, url.searchParams.get('error'), 'text/plain');
      await spotify.handleCallback(PORT, url.searchParams.get('code'), url.searchParams.get('state'));
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    // static
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.join(PUBLIC, path.normalize(rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor Display on http://127.0.0.1:${PORT}${DEMO ? '  (demo data)' : ''}`);
  console.log(`To-do MCP endpoint path: /mcp/${MCP_TOKEN}   (put your tunnel's https host in front of it)`);
});
