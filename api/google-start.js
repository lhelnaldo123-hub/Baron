// Sends you to Google to allow Gmail access (one time).
const auth = require("./_auth");

module.exports = (req, res) => {
  const t = String((req.query && req.query.t) || "");
  if (!auth.verify(t)) return res.status(401).send("Locked. Open the app, log in, and tap Connect Gmail again.");
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).send("GOOGLE_CLIENT_ID is not set in Vercel.");
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `https://${req.headers.host}/api/google-callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    access_type: "offline",
    prompt: "consent",
    state: t,
  });
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, "https://accounts.google.com/o/oauth2/v2/auth?" + p);
};
