// Google sends you back here. It shows the refresh token once so you can paste it into Vercel.
const auth = require("./_auth");
const env = n => String(process.env[n] || "").replace(/^["'\s]+|["'\s]+$/g, "");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const page = (res, status, body) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.status(status).send(`<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#07080d;color:#e8eaf2;padding:1.2rem;line-height:1.5">${body}`);
};

module.exports = async (req, res) => {
  const { code, state, error } = req.query || {};
  if (!auth.verify(String(state || ""))) return page(res, 401, "<h3>Locked</h3><p>This link expired. Go back to the app and tap Connect Gmail again.</p>");
  if (error || !code) return page(res, 400, `<h3>Gmail was not connected</h3><p>${esc(error || "No code received")}</p>`);
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        redirect_uri: `https://${req.headers.host}/api/google-callback`,
        grant_type: "authorization_code",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.error || r.status);
    if (!d.refresh_token) {
      return page(res, 400, "<h3>No token received</h3><p>Open myaccount.google.com/permissions, remove this app, then try Connect Gmail again.</p>");
    }
    page(res, 200, `<h3>Gmail connected</h3>
      <p>Last step. Copy this value, then in Vercel open your project, Settings, Environment Variables, and add one named <b>GOOGLE_REFRESH_TOKEN</b>. Redeploy after.</p>
      <textarea readonly rows="6" style="width:100%;background:#11152b;color:#e8eaf2;border:1px solid #2a315a;border-radius:10px;padding:.6rem" onfocus="this.select()">${esc(d.refresh_token)}</textarea>
      <p style="color:#98a0c0">Keep it private. Anyone with it can read your mail. Close this page when done.</p>`);
  } catch (e) {
    page(res, 500, `<h3>Something went wrong</h3><p>${esc(String(e.message).slice(0, 200))}</p>`);
  }
};
