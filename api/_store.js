// Tiny key/value store for Telegram (plans + the email waiting to be sent).
// With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set in Vercel (free Upstash Redis, also called KV), it survives restarts.
// Without them it falls back to memory, which can be forgotten whenever Vercel restarts the function.
const mem = {};
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const tok = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const H = () => ({ Authorization: "Bearer " + tok() });

async function get(key, fallback = null) {
  if (!url() || !tok()) return key in mem ? mem[key] : fallback;
  try {
    const r = await fetch(`${url()}/get/${encodeURIComponent(key)}`, { headers: H() });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : fallback;
  } catch (e) { return key in mem ? mem[key] : fallback; }
}
async function set(key, value) {
  mem[key] = value;
  if (!url() || !tok()) return;
  try { await fetch(`${url()}/set/${encodeURIComponent(key)}`, { method: "POST", headers: H(), body: JSON.stringify(value) }); } catch (e) { /* memory copy is kept */ }
}
const persistent = () => !!(url() && tok());
module.exports = { get, set, persistent };
