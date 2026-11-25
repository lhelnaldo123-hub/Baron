// Lets Jarvis message you first on Telegram.
//   mode=morning  -> a good-morning message with your unread mail (run once a day)
//   mode=check    -> tells you about NEW emails (run every ~15 minutes, pass mins=15)
// Protected by CRON_SECRET: send it as ?key=... or as "Authorization: Bearer ..." (Vercel cron does this itself).
const crypto = require("crypto");
const mail = require("./_gmail");
const brain = require("./_brain");
const telegram = require("./telegram");

const seen = new Set();
const same = (a, b) => {
  const h = s => crypto.createHash("sha256").update(String(s)).digest();
  return !!b && crypto.timingSafeEqual(h(a), h(b));
};
const quiet = () => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(process.env.QUIET_HOURS || ""); // UTC hours, e.g. 22-6
  if (!m) return false;
  const h = new Date().getUTCHours(), a = +m[1], b = +m[2];
  return a <= b ? h >= a && h < b : h >= a || h < b;
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).send("Add CRON_SECRET in Vercel first.");
  const given = String((req.query && req.query.key) || "") || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!same(given, secret)) return res.status(401).send("Locked");
  const chat = process.env.TELEGRAM_OWNER_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat) return res.status(400).send("Telegram is not set up yet.");

  try {
    const mode = String((req.query && req.query.mode) || "check");
    if (mode === "morning") {
      let text = "Good morning, boss.";
      try {
        const { reply } = await brain.think("Write a short, warm good-morning message for me in 2 sentences, with one small useful tip for the day. No greeting word like 'Good morning' at the start.");
        text += " " + reply;
      } catch (e) { text += " Here is to a good day."; }
      if (mail.configured()) {
        try {
          const list = await mail.inbox(5);
          text += list.length
            ? `\n\nYou have unread email. Newest:\n` + list.map(m => `- ${m.from.replace(/<.*>/, "").trim() || m.from}: ${m.subject}`).join("\n")
            : "\n\nNo unread email right now.";
        } catch (e) { /* skip the mail part */ }
      }
      await telegram.sendText(chat, text);
      return res.json({ ok: true, mode });
    }

    if (quiet()) return res.json({ ok: true, skipped: "quiet hours" });
    if (!mail.configured()) return res.json({ ok: true, skipped: "gmail not connected" });
    const mins = Math.min(120, Math.max(5, Number(req.query.mins) || 15));
    const fresh = (await mail.unreadSince((mins + 2) * 60)).filter(m => !seen.has(m.id));
    for (const m of fresh) {
      seen.add(m.id); if (seen.size > 300) seen.delete(seen.values().next().value);
      await telegram.tg("sendMessage", {
        chat_id: chat,
        text: `New email from ${m.from}\n${m.subject}\n\n${m.snippet}`,
        reply_markup: { inline_keyboard: [[{ text: "Draft a reply", callback_data: "draft:" + m.id }]] },
      });
    }
    res.json({ ok: true, mode, notified: fresh.length });
  } catch (e) {
    res.status(500).send("Failed: " + String(e.message).slice(0, 200));
  }
};
