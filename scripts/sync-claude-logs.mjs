// Run on the machine where Claude Code runs. Boils ~/.claude/projects down to just the
// token-usage lines from the last 8 days (no message text) and copies them to the display.
//   node scripts/sync-claude-logs.mjs user@monitor.local [remote-dir]
// On the display, set CLAUDE_LOG_DIRS=<remote-dir> in .env (default ~/claude-logs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const remoteDir = process.argv[3] || 'claude-logs';
if (!target) { console.error('usage: node sync-claude-logs.mjs user@host [remote-dir]'); process.exit(1); }

const DAYS = 8;
const cutoff = Date.now() - DAYS * 86400e3;
const root = path.join(os.homedir(), '.claude', 'projects');

function* walk(dir) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) yield* walk(p);
    else if (it.name.endsWith('.jsonl')) yield p;
  }
}

const seen = new Set();
const out = [];
for (const f of walk(root)) {
  if (fs.statSync(f).mtimeMs < cutoff) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const j = JSON.parse(line);
      const u = j.message?.usage;
      const t = Date.parse(j.timestamp);
      if (!u || !t || t < cutoff) continue;
      const key = `${j.message.id || ''}:${j.requestId || ''}`;
      if (key !== ':' && seen.has(key)) continue;
      seen.add(key);
      out.push({
        timestamp: j.timestamp,
        requestId: j.requestId,
        message: {
          id: j.message.id,
          usage: {
            input_tokens: u.input_tokens || 0,
            output_tokens: u.output_tokens || 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
          },
        },
      });
    } catch {}
  }
}

const tmp = path.join(os.tmpdir(), 'monitor-usage.jsonl');
fs.writeFileSync(tmp, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log(`${out.length} usage entries, ${(fs.statSync(tmp).size / 1024).toFixed(0)} KB`);

const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
let r = spawnSync('ssh', [...ssh, target, `mkdir -p ${remoteDir}`], { stdio: 'inherit' });
if (r.status === 0) r = spawnSync('scp', [...ssh, tmp, `${target}:${remoteDir}/usage.jsonl`], { stdio: 'inherit' });
process.exit(r.status ?? 1);
