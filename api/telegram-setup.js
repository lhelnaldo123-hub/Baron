// One-time: connects your bot to this app. Open  https://YOUR-APP/api/telegram-setup?p=YOUR_PASSCODE
const auth = require("./_auth");
const telegram = require("./telegram");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (!auth.samePasscode(String((req.query && req.query.p) || ""))) return res.status(401).send("Wrong passcode.");
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) return res.status(400).send("Add TELEGRAM_BOT_TOKEN in Vercel first, then redeploy.");
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://${req.headers.host}/api/telegram`,
        secret_token: telegram.secretFor(),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const d = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 500).send(d.ok ? "Done! Open Telegram, find your bot and send /start." : "Telegram said: " + (d.description || r.status));
  } catch (e) {
    res.status(500).send("Failed: " + String(e.message).slice(0, 200));
  }
};
