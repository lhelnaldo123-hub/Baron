// Passcode sessions. A token is "expiry.signature", signed with SESSION_SECRET.
const crypto = require("crypto");
// SESSION_SECRET is optional. Without it, the key is built from the passcode plus your private API keys,
// so a stolen token cannot be used to guess the passcode.
const secret = () => process.env.SESSION_SECRET || (process.env.APP_PASSCODE
  ? crypto.createHash("sha256").update([process.env.GROQ_API_KEY, process.env.FISH_API_KEY, process.env.APP_PASSCODE].join("|")).digest("hex")
  : "");
const sig = exp => crypto.createHmac("sha256", secret()).update("jarvis:" + exp).digest("base64url");

function issue(ms) {
  const exp = Date.now() + ms;
  return exp + "." + sig(exp);
}

function verify(t) {
  if (!secret() || typeof t !== "string") return false;
  const [exp, s] = t.split(".");
  if (!exp || !s || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(s), b = Buffer.from(sig(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function check(req) {
  return verify((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
}

function samePasscode(input) {
  const want = process.env.APP_PASSCODE || "";
  if (!want) return false;
  const h = s => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(input), h(want));
}

// Optional: let the Tender Sprout AI website in without the passcode. Off unless TENDER_OPEN=1 is set in Vercel.
// It only works for requests that come from that website's address, and /api/voice then treats them as Tender-only (no email, calendar or Jarvis features).
function tenderOpen(req) {
  return process.env.TENDER_OPEN === "1" && (req.headers.origin || "") === (process.env.TENDER_ORIGIN || "https://lhelnaldo123-hub.github.io");
}

module.exports = { issue, verify, check, samePasscode, tenderOpen };
