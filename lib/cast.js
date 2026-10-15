import http from 'node:http';
import crypto from 'node:crypto';

// Drives the kiosk Chromium through its local DevTools port (127.0.0.1 only, see scripts/kiosk.sh).
// A watched page opens as a second tab on top of the dashboard; closing it returns to the dashboard.
const DEBUG = `http://127.0.0.1:${process.env.CHROME_DEBUG_PORT || 9222}`;
let watchId = null;

async function targets() {
  const r = await fetch(`${DEBUG}/json/list`, { signal: AbortSignal.timeout(3000) });
  return (await r.json()).filter((t) => t.type === 'page');
}

// Minimal one-shot DevTools call: open the target's WebSocket, send one command, return its result.
function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') },
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('devtools timeout')); }, 5000);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.on('upgrade', (_res, socket) => {
      let buf = Buffer.alloc(0);
      const done = (fn, v) => { clearTimeout(timer); socket.destroy(); fn(v); };
      socket.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          if (buf.length < 2) return;
          let len = buf[1] & 0x7f; let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const op = buf[0] & 0x0f;
          const payload = buf.subarray(off, off + len);
          buf = buf.subarray(off + len);
          if (op !== 1) continue;
          let m; try { m = JSON.parse(payload.toString()); } catch { continue; }
          if (m.id !== 1) continue;
          return m.error ? done(reject, new Error(m.error.message)) : done(resolve, m.result);
        }
      });
      socket.on('error', (e) => done(reject, e));
      const body = Buffer.from(JSON.stringify({ id: 1, method, params }));
      const mask = crypto.randomBytes(4);
      const hdr = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 255]);
      const masked = Buffer.from(body.map((b, i) => b ^ mask[i % 4]));
      socket.write(Buffer.concat([hdr, mask, masked]));
    });
    req.end();
  });
}

async function watchTarget() {
  if (!watchId) return null;
  return (await targets()).find((t) => t.id === watchId) || (watchId = null);
}

// Runs in the page: find the biggest <video> and apply one action to it. Returns null when there is none
// (many players live in cross-origin iframes), and the caller falls back to key presses.
const PAGE_JS = (action, arg) => `(() => {
  const v = [...document.querySelectorAll('video')].sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
  if (!v) return null;
  const a = ${JSON.stringify(action)}, n = ${Number(arg) || 0};
  if (a === 'toggle') v.paused ? v.play() : v.pause();
  if (a === 'seek') v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + n));
  if (a === 'seekto') v.currentTime = n * (v.duration || 0);
  if (a === 'volume') { v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + n)); }
  if (a === 'mute') v.muted = !v.muted;
  if (a === 'fullscreen') document.fullscreenElement ? document.exitFullscreen() : (v.requestFullscreen && v.requestFullscreen());
  return { paused: v.paused, t: v.currentTime, d: v.duration || 0, vol: v.muted ? 0 : v.volume };
})()`;

const KEYS = {
  toggle: [{ key: ' ', code: 'Space', vk: 32, text: ' ' }],
  fullscreen: [{ key: 'f', code: 'KeyF', vk: 70, text: 'f' }],
  mute: [{ key: 'm', code: 'KeyM', vk: 77, text: 'm' }],
};
const key = async (ws, k) => {
  for (const type of ['keyDown', 'keyUp']) {
    await cdp(ws, 'Input.dispatchKeyEvent', { type, key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, text: type === 'keyDown' ? k.text || '' : undefined });
  }
};

export async function status() {
  let t;
  try { t = await watchTarget(); } catch { return { available: false }; }
  if (!t) return { available: true, active: false };
  let player = null;
  try { player = (await cdp(t.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: PAGE_JS('status'), returnByValue: true })).result.value; } catch {}
  return { available: true, active: true, url: t.url, title: t.title, player };
}

export async function open(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) links');
  await close();
  const r = await fetch(`${DEBUG}/json/new?${encodeURIComponent(u.href)}`, { method: 'PUT', signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Chromium refused to open the tab (${r.status})`);
  watchId = (await r.json()).id;
  await fetch(`${DEBUG}/json/activate/${watchId}`, { signal: AbortSignal.timeout(3000) });
}

export async function close() {
  const id = watchId; watchId = null;
  if (id) { try { await fetch(`${DEBUG}/json/close/${id}`, { signal: AbortSignal.timeout(3000) }); } catch {} }
}

export async function control(action, value) {
  const t = await watchTarget();
  if (!t) throw new Error('Nothing is playing');
  const ws = t.webSocketDebuggerUrl;
  if (action === 'tap') { // x, y as 0-1 fractions of the screen: lets the phone press a play button on the page
    const m = await cdp(ws, 'Page.getLayoutMetrics');
    const x = (value?.x ?? 0.5) * m.cssVisualViewport.clientWidth, y = (value?.y ?? 0.5) * m.cssVisualViewport.clientHeight;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp(ws, 'Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    return;
  }
  const arg = action === 'seek' || action === 'seekto' || action === 'volume' ? Number(value) : 0;
  const r = await cdp(ws, 'Runtime.evaluate', { expression: PAGE_JS(action, arg), returnByValue: true });
  if (r.result.value !== null && r.result.value !== undefined) return;
  // No <video> in the top frame: send the same keys a person would press.
  if (KEYS[action]) return key(ws, KEYS[action][0]);
  if (action === 'seek') return key(ws, arg < 0 ? { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 } : { key: 'ArrowRight', code: 'ArrowRight', vk: 39 });
  if (action === 'volume') return key(ws, arg < 0 ? { key: 'ArrowDown', code: 'ArrowDown', vk: 40 } : { key: 'ArrowUp', code: 'ArrowUp', vk: 38 });
}
