const $ = (s, r = document) => r.querySelector(s);
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtIn = (ms) => { if (ms <= 0) return 'now'; const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const CIRC = 264;

let st = null, skew = 0, sp = null, art = '';

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
    $('[data-k=foot]', t).textContent = `Today ${fmtTok(c.today)} · 7d ${fmtTok(c.week)}` + (sp && !sp.error ? ` · API ${money(sp.week)}/wk` : '');
  } else {
    ring(t, 0); $('[data-k=big]', t).textContent = '–';
    $('[data-k=sub]', t).textContent = 'No Claude Code logs found'; $('[data-k=foot]', t).textContent = 'Set CLAUDE_LOG_DIRS in .env';
  }
  const g = st.chatgpt, u = $('#chatgpt');
  ring(u, g.limit ? g.used / g.limit : 0);
  $('[data-k=big]', u).textContent = `${g.used}`;
  $('[data-k=sub]', u).textContent = `of ${g.limit} messages` + (g.resetsAt ? ` · resets in ${fmtIn(g.resetsAt - now)}` : '');
  const oa = st.spend?.openai;
  if (oa && !oa.error) { spark($('[data-k=spark]', u), oa.days); $('[data-k=foot]', u).textContent = `API ${money(oa.week)} this week`; }
  else { $('[data-k=spark]', u).innerHTML = ''; $('[data-k=foot]', u).textContent = 'Manual counter · curl -X POST …/api/chatgpt/add'; }
}
setInterval(renderUsage, 5000);

// ---- polling ----
async function poll() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    st = await r.json(); skew = st.now - Date.now();
    sp = st.spotify; if (sp) sp.fetchedAtLocal = Date.now();
    renderPlayer(); renderUsage();
  } catch {}
}
poll(); setInterval(poll, 2000);

// ---- calm mode: hide controls + cursor when idle ----
let idle;
function wake() { document.body.classList.remove('quiet', 'idle-cursor'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('quiet', 'idle-cursor'), 8000); }
['mousemove', 'keydown', 'touchstart', 'click'].forEach((ev) => addEventListener(ev, wake)); wake();
