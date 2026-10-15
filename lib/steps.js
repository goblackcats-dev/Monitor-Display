import crypto from 'node:crypto';
import { readJson, writeJson } from './env.js';

// Today's step count, pushed from an iPhone Shortcut (Apple Health has no web API to pull from).
// The Shortcut calls /api/steps/<token>?steps=N ; the token is generated once and kept in data/.
export const STEPS_TOKEN = process.env.STEPS_TOKEN || (() => {
  let t = readJson('steps-token.json', null)?.token;
  if (!t) { t = crypto.randomBytes(18).toString('base64url'); writeJson('steps-token.json', { token: t }); }
  return t;
})();

const dayKey = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function tokenMatches(given) {
  const a = Buffer.from(String(given)), b = Buffer.from(STEPS_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setSteps(n) {
  const steps = Math.round(Number(n));
  if (!Number.isFinite(steps) || steps < 0 || steps > 200000) throw new Error('steps must be a number from 0 to 200000');
  writeJson('steps.json', { day: dayKey(), steps, at: Date.now() });
  return steps;
}

// Only today's count is shown; yesterday's number would be misleading.
export function todaySteps() {
  const s = readJson('steps.json', null);
  return s && s.day === dayKey() ? { steps: s.steps, at: s.at } : null;
}
