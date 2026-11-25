// Passcode sessions. A token is "expiry.signature", signed with SESSION_SECRET.
const crypto = require("crypto");
const secret = () => process.env.SESSION_SECRET || "";
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

module.exports = { issue, verify, check, samePasscode };
