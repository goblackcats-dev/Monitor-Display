// Next calendar event from an iCal feed (Google Calendar "Secret address in iCal format").
// Set CALENDAR_ICS_URL in .env. Dependency-free: handles timed events, time zones, and common recurrence rules
// (DAILY / WEEKLY+BYDAY / MONTHLY / YEARLY, INTERVAL, COUNT, UNTIL, EXDATE, edited single occurrences).
import { Worker } from 'node:worker_threads';

const TTL = 5 * 60e3;
const DAY = 86400e3;
let cache = { at: 0, events: null, error: null };

export const calendarConfigured = () => !!process.env.CALENDAR_ICS_URL;

// ---- parsing ----
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(';');
    const params = Object.fromEntries(ps.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
    const key = name.toUpperCase();
    const val = line.slice(i + 1);
    if (key === 'EXDATE') (cur.EXDATE ||= []).push({ params, val });
    else cur[key] = { params, val };
  }
  return events;
}

const formatters = new Map(); // building an Intl formatter is slow, so one per zone
function offsetAt(epoch, tz) { // ms that `tz` is ahead of UTC at that instant
  let f = formatters.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); formatters.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(epoch)).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
}
function wallToEpoch(w, tz) { // w = { y, m (0-based), d, h, mi, s }
  const guess = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  if (!tz) return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime(); // floating: server local time
  try { let e = guess - offsetAt(guess, tz); e = guess - offsetAt(e, tz); return e; } catch { return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime(); }
}
function parseDt({ params, val }) { // -> { wall, tz, utc, allDay, epoch }
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z?))?$/.exec(val.trim());
  if (!m) return null;
  const wall = { y: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const allDay = params.VALUE === 'DATE' || !m[4];
  const utc = m[7] === 'Z';
  const tz = utc ? 'UTC' : params.TZID || null;
  return { wall, tz, allDay, epoch: wallToEpoch(wall, tz) };
}

// ---- recurrence ----
const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function* occurrences(ev, start, fromEpoch, toEpoch) {
  const rule = Object.fromEntries(ev.RRULE.val.split(';').map((p) => p.split('=')));
  const interval = +rule.INTERVAL || 1;
  const until = rule.UNTIL ? parseDt({ params: {}, val: rule.UNTIL })?.epoch : Infinity;
  const max = rule.COUNT ? +rule.COUNT : Infinity;
  const w = start.wall;
  const at = (y, m, d) => wallToEpoch({ ...w, y, m, d }, start.tz); // same wall time on another date (DST-safe)
  const byday = rule.BYDAY ? rule.BYDAY.split(',') : null;
  let n = 0, guard = 0;
  // Without COUNT, jump straight to just before the window instead of walking from the first occurrence
  // (a daily meeting from years ago would otherwise cost thousands of steps).
  const base0 = Date.UTC(w.y, w.m, w.d);
  const skipDays = rule.COUNT ? 0 : Math.max(0, Math.floor((fromEpoch - start.epoch) / DAY) - 8);
  const dates = function* () {
    const base = base0;
    if (rule.FREQ === 'DAILY') for (let k = Math.floor(skipDays / interval) * interval; ; k += interval) yield new Date(base + k * DAY);
    else if (rule.FREQ === 'WEEKLY') {
      const days = byday ? byday.map((x) => DOW[x.slice(-2)]).sort() : [new Date(base).getUTCDay()];
      const weekStart = base - new Date(base).getUTCDay() * DAY;
      for (let k = Math.floor(skipDays / 7 / interval) * interval; ; k += interval) for (const d of days) yield new Date(weekStart + (k * 7 + d) * DAY);
    } else if (rule.FREQ === 'MONTHLY') {
      for (let k = 0; ; k += interval) {
        const y = w.y + Math.floor((w.m + k) / 12), m = (w.m + k) % 12;
        if (byday && /^-?\d/.test(byday[0])) { // e.g. 2TU, -1FR
          const ord = parseInt(byday[0], 10), dow = DOW[byday[0].slice(-2)];
          const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const day = ord > 0 ? 1 + ((dow - first + 7) % 7) + (ord - 1) * 7 : last - ((new Date(Date.UTC(y, m, last)).getUTCDay() - dow + 7) % 7) - (-ord - 1) * 7;
          yield new Date(Date.UTC(y, m, day));
        } else yield new Date(Date.UTC(y, m, +rule.BYMONTHDAY || w.d));
      }
    } else if (rule.FREQ === 'YEARLY') for (let k = 0; ; k += interval) yield new Date(Date.UTC(w.y + k, w.m, w.d));
  };
  for (const d of dates()) {
    if (++guard > 3000) return;
    // Cheap date-only checks first; the time-zone conversion is the expensive part.
    const day = d.getTime();
    if (day > toEpoch + 2 * DAY) return;
    if (day < fromEpoch - 2 * DAY && !rule.COUNT) continue;
    const e = at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (e < start.epoch) continue;
    if (e > until || e > toEpoch || ++n > max) return;
    if (e >= fromEpoch) yield e;
  }
}

// Flatten to concrete [startMs, endMs, title] instances inside the window.
function expand(raw, fromEpoch, toEpoch) {
  const out = [];
  const overridden = new Set(raw.filter((e) => e['RECURRENCE-ID']).map((e) => `${e.UID?.val}|${parseDt(e['RECURRENCE-ID'])?.epoch}`));
  for (const ev of raw) {
    if (!ev.DTSTART || /CANCELLED/i.test(ev.STATUS?.val || '')) continue;
    const start = parseDt(ev.DTSTART);
    if (!start || start.allDay) continue; // keep the display to timed events
    const end = ev.DTEND ? parseDt(ev.DTEND)?.epoch : start.epoch + 3600e3;
    const dur = Math.max(0, (end ?? start.epoch) - start.epoch);
    const title = (ev.SUMMARY?.val || 'Busy').replace(/\\([,;nN\\])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c));
    if (!ev.RRULE) { if (start.epoch + dur >= fromEpoch && start.epoch <= toEpoch) out.push({ start: start.epoch, end: start.epoch + dur, title }); continue; }
    const ex = new Set((ev.EXDATE || []).flatMap((x) => x.val.split(',').map((v) => parseDt({ params: x.params, val: v })?.epoch)));
    for (const s of occurrences(ev, start, fromEpoch - dur, toEpoch)) {
      if (ex.has(s) || overridden.has(`${ev.UID?.val}|${s}`)) continue;
      out.push({ start: s, end: s + dur, title });
    }
  }
  return out;
}

// Events in the next 5 days, soonest first. The expensive step: done once per refresh, not per request.
export function upcoming(icsText, now = Date.now()) {
  return expand(parseIcs(icsText), now - 6 * 3600e3, now + 5 * DAY).sort((a, b) => a.start - b.start);
}
const firstAfter = (list, now) => { const e = list.find((x) => x.end > now); return e ? { title: e.title, start: e.start, end: e.end } : null; };

// Pure and exported for testing.
export const nextEvent = (icsText, now = Date.now()) => firstAfter(upcoming(icsText, now), now);

let refreshing = null;
async function refresh() {
  try {
    const r = await fetch(process.env.CALENDAR_ICS_URL, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`calendar HTTP ${r.status}`);
    const text = await r.text();
    const list = await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./calendarWorker.js', import.meta.url), { workerData: { text } });
      const t = setTimeout(() => { w.terminate(); reject(new Error('calendar parse timed out')); }, 120e3);
      w.once('message', (m) => { clearTimeout(t); resolve(m); });
      w.once('error', (e) => { clearTimeout(t); reject(e); });
    });
    cache = { at: Date.now(), list, error: null };
  } catch (e) {
    cache = { ...cache, at: Date.now() - TTL + 60e3, error: String(e.message || e) }; // retry in a minute, keep old data
  }
}

// Never makes the caller wait on the network: the first call returns "loading" while the fetch runs in the background.
export async function calendar() {
  if (!calendarConfigured()) return null;
  if (Date.now() - cache.at > TTL && !refreshing) refreshing = refresh().finally(() => { refreshing = null; });
  if (!cache.list) return { error: cache.error || null, loading: !cache.error };
  return { next: firstAfter(cache.list, Date.now()), error: cache.error };
}
