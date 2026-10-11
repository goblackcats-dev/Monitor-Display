// Optional API spend via organisation admin keys. Cached for 10 minutes.
const TTL = 10 * 60e3;
const cache = {};

async function cached(name, fn) {
  const c = cache[name];
  if (c && Date.now() - c.at < TTL) return c.v;
  let v;
  try { v = await fn(); } catch (e) { v = { error: String(e.message || e) }; }
  cache[name] = { at: Date.now(), v };
  return v;
}

const weekAgo = () => Math.floor(Date.now() / 1000) - 7 * 86400;

export const openaiSpend = () => process.env.OPENAI_ADMIN_KEY && cached('openai', async () => {
  const r = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${weekAgo()}&bucket_width=1d&limit=7`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_ADMIN_KEY}` },
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const j = await r.json();
  const days = (j.data || []).map((b) => (b.results || []).reduce((a, x) => a + (+x.amount?.value || 0), 0));
  return { week: days.reduce((a, b) => a + b, 0), days, currency: 'USD' };
});

export const anthropicSpend = () => process.env.ANTHROPIC_ADMIN_KEY && cached('anthropic', async () => {
  const start = new Date(weekAgo() * 1000).toISOString();
  const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(start)}&bucket_width=1d&limit=7`, {
    headers: { 'x-api-key': process.env.ANTHROPIC_ADMIN_KEY, 'anthropic-version': '2023-06-01' },
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const j = await r.json();
  // amounts are reported in cents as decimal strings
  const days = (j.data || []).map((b) => (b.results || []).reduce((a, x) => a + (+x.amount || 0), 0) / 100);
  return { week: days.reduce((a, b) => a + b, 0), days, currency: 'USD' };
});
