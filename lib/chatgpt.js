import { readJson, writeJson, num } from './env.js';

// ChatGPT has no usage API. This is a manual message counter with a rolling window.
export function chatgptState(now = Date.now()) {
  const limit = num(process.env.CHATGPT_LIMIT, 80);
  const windowMs = num(process.env.CHATGPT_WINDOW_HOURS, 3) * 3600e3;
  const s = readJson('chatgpt.json', { events: [] });
  const events = s.events.filter((t) => now - t < windowMs);
  return {
    used: events.length,
    limit,
    resetsAt: events.length ? events[0] + windowMs : null,
  };
}

export function chatgptAdd(n = 1, now = Date.now()) {
  const s = readJson('chatgpt.json', { events: [] });
  const windowMs = num(process.env.CHATGPT_WINDOW_HOURS, 3) * 3600e3;
  const events = s.events.filter((t) => now - t < windowMs);
  for (let i = 0; i < n; i++) events.push(now);
  writeJson('chatgpt.json', { events });
  return chatgptState(now);
}

export function chatgptReset() {
  writeJson('chatgpt.json', { events: [] });
  return chatgptState();
}
