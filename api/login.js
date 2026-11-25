// Checks the passcode and hands back a 30 day session token.
const cors = require("./_cors");
const auth = require("./_auth");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.APP_PASSCODE) {
    return res.status(500).json({ error: "Not set up yet. Add APP_PASSCODE in Vercel, then redeploy." });
  }
  const { passcode = "" } = req.body || {};
  if (!auth.samePasscode(passcode)) {
    await new Promise(r => setTimeout(r, 800)); // slows down guessing
    return res.status(401).json({ error: "Wrong passcode" });
  }
  res.json({ token: auth.issue(30 * 24 * 3600 * 1000) });
};
