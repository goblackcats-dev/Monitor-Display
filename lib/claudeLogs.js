import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { num } from './env.js';

const HOUR = 3600e3;
const fileCache = new Map(); // file -> { sig, entries }

function dirs() {
  const custom = process.env.CLAUDE_LOG_DIRS;
  return custom ? custom.split(':').filter(Boolean) : [path.join(os.homedir(), '.claude', 'projects')];
}

function* walk(dir) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) yield* walk(p);
    else if (it.name.endsWith('.jsonl')) yield p;
  }
}

function parseFile(file) {
  const st = fs.statSync(file);
  const sig = `${st.mtimeMs}:${st.size}`;
  const hit = fileCache.get(file);
  if (hit && hit.sig === sig) return hit.entries;
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const j = JSON.parse(line);
      const u = j.message?.usage;
      if (!u || !j.timestamp) continue;
      entries.push({
        t: Date.parse(j.timestamp),
        key: `${j.message.id || ''}:${j.requestId || ''}`,
        tokens: (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0),
        out: u.output_tokens || 0,
      });
    } catch {}
  }
  fileCache.set(file, { sig, entries });
  return entries;
}

// Claude Code usage from local logs. Cache reads are excluded from "tokens"
// (they dominate raw counts and aren't what limits you).
export function claudeCodeUsage(now = Date.now()) {
  const seen = new Set();
  const all = [];
  let files = 0;
  for (const d of dirs()) {
    for (const f of walk(d)) {
      files++;
      let es; try { es = parseFile(f); } catch { continue; }
      for (const e of es) {
        if (e.key !== ':' && seen.has(e.key)) continue;
        seen.add(e.key);
        all.push(e);
      }
    }
  }
  all.sort((a, b) => a.t - b.t);

  // 5h blocks, same idea as ccusage: a block starts at the hour of its first message.
  let block = null;
  for (const e of all) {
    if (!block || e.t >= block.start + 5 * HOUR) {
      block = { start: Math.floor(e.t / HOUR) * HOUR, tokens: 0 };
    }
    block.tokens += e.tokens;
  }
  const active = block && now < block.start + 5 * HOUR ? block : null;

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const s = new Date(dayStart); s.setDate(s.getDate() - i);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    days.push({ date: s.toISOString().slice(0, 10), tokens: 0, from: +s, to: +e });
  }
  for (const e of all) {
    const d = days.find((x) => e.t >= x.from && e.t < x.to);
    if (d) d.tokens += e.tokens;
  }
  const fiveLimit = num(process.env.CLAUDE_5H_LIMIT_TOKENS);
  const weekLimit = num(process.env.CLAUDE_WEEK_LIMIT_TOKENS);
  const week = days.reduce((a, d) => a + d.tokens, 0);

  return {
    available: files > 0,
    block: active
      ? { tokens: active.tokens, start: active.start, resetsAt: active.start + 5 * HOUR, limit: fiveLimit || null }
      : { tokens: 0, start: null, resetsAt: null, limit: fiveLimit || null },
    today: days[6].tokens,
    week,
    weekLimit: weekLimit || null,
    days: days.map(({ date, tokens }) => ({ date, tokens })),
  };
}
