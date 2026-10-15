import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';

// What the status dot reports. Green = nothing to say; amber = something the owner should know about.
const TTL = 30e3;
let cache = { at: 0, v: { ok: true, issues: [] } };

const sh = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 3000 }, (e, out) => res(e ? null : out.trim())));

export async function health(extra = []) {
  if (Date.now() - cache.at > TTL) {
    const issues = [];
    // Pi power/heat: bit 0 = under-voltage now, bit 2 = throttled now, bit 3 = soft temperature limit now.
    const t = await sh('vcgencmd', ['get_throttled']);
    const bits = t && /0x([0-9a-f]+)/i.exec(t) ? parseInt(/0x([0-9a-f]+)/i.exec(t)[1], 16) : 0;
    if (bits & 0x1) issues.push('low power');
    else if (bits & 0x4) issues.push('throttled');
    else if (bits & 0x8) issues.push('hot');
    // Internet
    try { await Promise.race([dns.resolve4('api.open-meteo.com'), new Promise((_, rej) => setTimeout(() => rej(new Error('dns')), 4000))]); }
    catch { issues.push('no internet'); }
    cache = { at: Date.now(), v: { issues } };
  }
  const issues = [...cache.v.issues, ...extra];
  return { ok: issues.length === 0, issues };
}
