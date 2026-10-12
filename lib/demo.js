// Fake data for previewing the UI without any accounts.
const t0 = Date.now();
const tracks = [
  { title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", dur: 243000, hue: 265 },
  { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', dur: 258000, hue: 330 },
  { title: 'Weightless', artist: 'Marconi Union', album: 'Weightless', dur: 480000, hue: 195 },
];
let paused = false, pausedAt = 0, offset = 0, volume = 62;

export function demoSpotify() {
  const now = paused ? pausedAt : Date.now();
  const el = now - t0 + offset;
  const total = tracks.reduce((a, t) => a + t.dur, 0);
  let p = el % total, i = 0;
  while (p >= tracks[i].dur) { p -= tracks[i].dur; i++; }
  const t = tracks[i];
  return {
    state: 'ok', playing: !paused, title: t.title, artist: t.artist, album: t.album,
    art: `/api/demo-art?hue=${t.hue}`, progressMs: p, durationMs: t.dur, volume, device: 'Inspiron (demo)', shuffle: false, fetchedAt: Date.now(),
  };
}
export function demoControl(a, v) {
  if (a === 'pause') { paused = true; pausedAt = Date.now(); }
  if (a === 'play') { if (paused) offset -= Date.now() - pausedAt; paused = false; }
  if (a === 'next' || a === 'prev') {
    const cur = demoSpotify();
    offset += a === 'next' ? cur.durationMs - cur.progressMs : -cur.progressMs - 1000;
  }
  if (a === 'volume') volume = +v;
}
export function demoArt(hue) {
  const h = +hue || 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,55%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},65%,22%)"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="90" r="60" fill="hsla(${h},90%,80%,.25)"/></svg>`;
}
export function demoUsage() {
  const now = Date.now();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push({ date: new Date(now - i * 864e5).toISOString().slice(0, 10), tokens: Math.round(300000 + 900000 * Math.abs(Math.sin(i * 1.7))) });
  return {
    claudeCode: {
      available: true,
      block: { tokens: 1_840_000, start: now - 2.2 * 3600e3, resetsAt: now + 2.8 * 3600e3, limit: 3_000_000 },
      today: 2_100_000, week: days.reduce((a, d) => a + d.tokens, 0), weekLimit: null, days,
    },
    spend: { anthropic: { week: 12.4, days: [1, 2, 1.5, 0.4, 3, 2.5, 2], currency: 'USD' }, openai: { week: 4.8, days: [0.4, 0.9, 0.2, 1, 0.6, 1.1, 0.6], currency: 'USD' } },
  };
}

let todos = [
  { id: 'a1', text: 'Review Q4 roadmap draft', done: false },
  { id: 'a2', text: 'Reply to Sam about the vendor contract', done: false },
  { id: 'a3', text: 'Book dentist appointment', done: false },
  { id: 'a4', text: 'Send weekly status update', done: true, doneAt: Date.now() - 3600e3 },
  { id: 'a5', text: 'Prep slides for Thursday sync', done: false },
];
export const demoTodos = () => todos;
export function demoToggle(id, done) { const t = todos.find((x) => x.id === id); if (t) { t.done = !!done; t.doneAt = done ? Date.now() : undefined; } }
