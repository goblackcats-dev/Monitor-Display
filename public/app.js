const $ = (s, r = document) => r.querySelector(s);
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtIn = (ms) => { if (ms <= 0) return 'now'; const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const CIRC = 264;

let st = null, skew = 0, sp = null, art = '', boot = null;

// ---- clock ----
function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
  $('#date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
setInterval(tickClock, 1000); tickClock();

// ---- album colour ----
function accentFrom(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    let best = null, bestScore = -1;
    for (let i = 0; i < d.length; i += 4) {
      const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
      const score = sat * 1.5 + val * (val > .25 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = [r, gg, b]; }
    }
    if (!best) return;
    // lift dark colours so the accent stays legible on near-black
    const k = Math.max(1, 170 / Math.max(...best));
    const [r, g2, b] = best.map((v) => Math.min(255, Math.round(v * k)));
    document.documentElement.style.setProperty('--accent', `rgb(${r}, ${g2}, ${b})`);
  } catch {}
}
function setArt(url) {
  if (url === art) return; art = url;
  const img = $('#artimg');
  if (!url) { img.classList.remove('on'); return; }
  const next = new Image(); next.crossOrigin = 'anonymous';
  next.onload = () => { img.src = next.src; img.classList.add('on'); accentFrom(next); };
  next.src = url.startsWith('/') ? url : `/api/art?u=${encodeURIComponent(url)}`;
}

// ---- player ----
async function control(action, value) {
  await fetch('/api/spotify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, value }) }).catch(() => {});
  poll();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  let a = b.dataset.a;
  if (a === 'toggle') { a = sp?.playing ? 'pause' : 'play'; if (sp) sp.playing = !sp.playing; }
  control(a);
});
$('#vol').addEventListener('change', (e) => control('volume', e.target.value));
$('#bar').addEventListener('click', (e) => {
  if (!sp?.durationMs) return;
  const r = e.currentTarget.getBoundingClientRect();
  control('seek', ((e.clientX - r.left) / r.width) * sp.durationMs);
});

function renderPlayer() {
  const root = $('#player');
  const login = $('#login');
  if (!sp || sp.state !== 'ok') {
    root.classList.add('idle');
    $('#title').textContent = sp?.state === 'login' ? 'Spotify not connected'
      : sp?.state === 'unconfigured' ? 'Set SPOTIFY_CLIENT_ID in .env' : 'Nothing playing';
    $('#artist').textContent = sp?.state === 'idle' ? 'Start playback on any device' : '';
    login.hidden = sp?.state !== 'login';
    $('#fill').style.width = '0'; $('#pos').textContent = $('#dur').textContent = '0:00';
    setArt(''); return;
  }
  root.classList.remove('idle'); login.hidden = true;
  $('#title').textContent = sp.title; $('#artist').textContent = `${sp.artist} · ${sp.album}`;
  $('#pp').textContent = sp.playing ? '❚❚' : '▶';
  if (document.activeElement !== $('#vol') && sp.volume != null) $('#vol').value = sp.volume;
  setArt(sp.art);
  const prog = Math.min(sp.durationMs, sp.progressMs + (sp.playing ? Date.now() - sp.fetchedAtLocal : 0));
  $('#fill').style.width = `${(prog / sp.durationMs) * 100}%`;
  $('#pos').textContent = fmtTime(prog); $('#dur').textContent = fmtTime(sp.durationMs);
}
setInterval(renderPlayer, 250);

// ---- usage tiles ----
function ring(tile, frac) {
  const f = Math.max(0, Math.min(1, frac || 0));
  $('.val', tile).style.strokeDashoffset = CIRC * (1 - f);
  tile.classList.toggle('warn', f > .75 && f <= .9); tile.classList.toggle('crit', f > .9);
}
function spark(el, values) {
  const max = Math.max(...values, 1);
  if (el.children.length !== values.length) el.innerHTML = values.map(() => '<i></i>').join('');
  values.forEach((v, i) => { el.children[i].style.height = `${Math.max(6, (v / max) * 100)}%`; });
}
const money = (n) => '$' + (n >= 100 ? Math.round(n) : n.toFixed(2));

function renderUsage() {
  if (!st) return;
  const now = Date.now() + skew;
  const c = st.claudeCode, t = $('#claude');
  if (c?.available) {
    const b = c.block;
    const frac = b.limit ? b.tokens / b.limit : b.start ? (now - b.start) / (5 * 3600e3) : 0;
    ring(t, frac);
    $('[data-k=big]', t).textContent = fmtTok(b.tokens);
    $('[data-k=sub]', t).textContent = b.resetsAt ? `${b.limit ? Math.round(frac * 100) + '% · ' : ''}resets in ${fmtIn(b.resetsAt - now)}` : 'No active window';
    spark($('[data-k=spark]', t), c.days.map((d) => d.tokens));
    const sp = st.spend?.anthropic;
    const oa = st.spend?.openai, api = (sp && !sp.error ? sp.week : 0) + (oa && !oa.error ? oa.week : 0);
    $('[data-k=foot]', t).textContent = `Today ${fmtTok(c.today)} · 7d ${fmtTok(c.week)}` + (api ? ` · API ${money(api)}/wk` : '');
  } else {
    ring(t, 0); $('[data-k=big]', t).textContent = '–';
    $('[data-k=sub]', t).textContent = 'No Claude Code logs found'; $('[data-k=foot]', t).textContent = 'Set CLAUDE_LOG_DIRS in .env';
  }
  renderTodos();
}
setInterval(renderUsage, 5000);

// ---- to-do ----
function renderTodos() {
  const items = st?.todos || [];
  const open = items.filter((i) => !i.done), done = items.filter((i) => i.done).slice(-2);
  const shown = [...open.slice(0, 6), ...(open.length < 6 ? done : [])];
  $('#todocount').textContent = open.length ? `· ${open.length}` : '';
  $('#todoempty').hidden = items.length > 0;
  const sig = JSON.stringify(shown.map((i) => [i.id, i.done, i.text]));
  const list = $('#todolist');
  if (list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  list.innerHTML = shown.map((i) => `<li class="${i.done ? 'done' : ''}" data-id="${i.id}" data-done="${i.done ? 1 : 0}"><i></i><span></span></li>`).join('');
  [...list.children].forEach((li, n) => { li.lastChild.textContent = shown[n].text; });
  if (open.length > 6) list.insertAdjacentHTML('beforeend', `<li class="more">+${open.length - 6} more</li>`);
}
$('#todolist').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  li.classList.toggle('done');
  await fetch('/api/todos/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: li.dataset.id, done: li.dataset.done !== '1' }) }).catch(() => {});
  poll();
});

// ---- weather ----
const WX = { clear: '☀', partly: '⛅', cloud: '☁', fog: '≋', rain: '☂', snow: '❄', storm: '⚡' };
function renderWeather() {
  const w = st?.weather;
  $('#wx').hidden = !w;
  if (!w) return;
  $('#wxicon').textContent = (WX[w.kind] || '☁') + '︎';
  $('#wxtemp').textContent = `${w.high}° / ${w.low}°`;
}

// ---- steps (pushed from an iPhone Shortcut) ----
function renderSteps() {
  const s = st?.steps, el = $('#steps');
  el.hidden = !s;
  if (!s) return;
  const b = document.createElement('b'); b.textContent = s.steps.toLocaleString();
  el.replaceChildren(b, ' steps');
}

// ---- next calendar event ----
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
function renderNext() {
  const el = $('#next'), e = st?.calendar;
  el.hidden = !e;
  if (!e) return;
  const now = Date.now() + skew;
  let when;
  if (e.start <= now) when = `until ${hhmm(e.end)}`;
  else if (e.start - now < 60 * 60e3) when = `in ${fmtIn(e.start - now)}`;
  else if (new Date(e.start).toDateString() === new Date(now).toDateString()) when = hhmm(e.start);
  else when = `${new Date(e.start).toLocaleDateString([], { weekday: 'short' })} ${hhmm(e.start)}`;
  const b = document.createElement('b'); b.textContent = e.title;
  el.replaceChildren(b, ` · ${when}`);
}
setInterval(renderNext, 15000);

// ---- status dot: green is quiet, amber says what is wrong ----
function renderStatus() {
  const h = st?.health, s = $('#status');
  s.hidden = !h;
  if (!h) return;
  s.classList.toggle('warn', !h.ok);
  $('#statustext').textContent = h.ok ? '' : h.issues.join(' · ');
}

// ---- dim after sunset (or 20:00-07:00 until a location is set) ----
function renderNight() {
  const now = Date.now() + skew, w = st?.weather;
  const night = w?.sunset ? now < w.sunrise || now > w.sunset : (() => { const h = new Date(now).getHours(); return h >= 20 || h < 7; })();
  document.body.classList.toggle('night', night);
}
setInterval(renderNight, 60000);

// ---- polling ----
async function poll() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    st = await r.json(); skew = st.now - Date.now();
    if (boot && st.boot !== boot) return location.reload(); // server was updated or restarted
    boot = st.boot;
    sp = st.spotify; if (sp) sp.fetchedAtLocal = Date.now();
    renderPlayer(); renderUsage(); renderWeather(); renderSteps(); renderNext(); renderStatus(); renderNight();
  } catch {}
}
poll(); setInterval(poll, 2000);

// ---- calm mode: hide controls + cursor when idle ----
let idle;
function wake() { document.body.classList.remove('quiet', 'idle-cursor'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('quiet', 'idle-cursor'), 8000); }
['mousemove', 'keydown', 'touchstart', 'click'].forEach((ev) => addEventListener(ev, wake)); wake();
