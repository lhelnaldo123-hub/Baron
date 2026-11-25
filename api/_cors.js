// Lets your other apps (like the GitHub Pages one) call this server.
const ALLOWED = (process.env.ALLOWED_ORIGINS || "https://lhelnaldo123-hub.github.io").split(",").map(s => s.trim());
module.exports = function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOWED.includes(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
};
