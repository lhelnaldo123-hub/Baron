// Mail actions for the app: list unread, draft a reply, get the "connect Gmail" link.
const cors = require("./_cors");
const auth = require("./_auth");
const gmail = require("./_gmail");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.check(req)) return res.status(401).json({ error: "Locked" });
  try {
    const { action, id, note } = req.body || {};
    if (action === "link") {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({ error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." });
      }
      return res.json({ url: "/api/google-start?t=" + encodeURIComponent(auth.issue(5 * 60 * 1000)) });
    }
    if (!gmail.configured()) {
      return res.status(400).json({ error: "Gmail is not connected yet. Open Settings, then tap Connect Gmail." });
    }
    if (action === "inbox") return res.json({ emails: await gmail.inbox(5) });
    if (action === "draft") return res.json(await gmail.draftReply(id, note));
    if (action === "send") { await gmail.sendDraft(id); return res.json({ sent: true }); }
    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
