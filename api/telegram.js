// Telegram bot. Send Jarvis text or a voice note; it answers (and talks back to voice notes).
// Only the owner (TELEGRAM_OWNER_ID) is answered. Emails are only sent when you tap the Send button.
const crypto = require("crypto");
const mail = require("./_gmail");
const brain = require("./_brain");

const token = () => process.env.TELEGRAM_BOT_TOKEN;
const API = () => `https://api.telegram.org/bot${token()}`;
const secretFor = () => crypto.createHash("sha256").update("tg-webhook|" + token()).digest("hex").slice(0, 40);
const JUNK = /^(thank you\.?|thanks\.?|thanks for watching\.?|you\.?|bye\.?|[.\s]*)$/i;
const seen = new Set();
let history = [];

async function tg(method, body) {
  const r = await fetch(`${API()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}

async function sendText(chat, text, drafts = []) {
  const parts = String(text).match(/[\s\S]{1,3900}/g) || ["…"];
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await tg("sendMessage", {
      chat_id: chat, text: parts[i],
      ...(last && drafts.length && { reply_markup: { inline_keyboard: drafts.map(d => [{ text: ("Send reply to " + d.to).slice(0, 60), callback_data: "send:" + d.id }]) } }),
    });
  }
}

async function hear(fileId, fallbackExt) {
  const f = await tg("getFile", { file_id: fileId });
  if (!f.ok) throw new Error("Could not get the voice note");
  const path = f.result.file_path;
  const audio = await fetch(`https://api.telegram.org/file/bot${token()}/${path}`);
  if (!audio.ok) throw new Error("Could not download the voice note");
  let ext = (path.split(".").pop() || fallbackExt).toLowerCase();
  if (ext === "oga") ext = "ogg";
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(await audio.arrayBuffer())]), `clip.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  const stt = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form });
  if (!stt.ok) throw new Error("Listening failed");
  const text = ((await stt.json()).text || "").trim();
  return JUNK.test(text) ? "" : text;
}

async function speak(chat, text) {
  if (!process.env.FISH_API_KEY) return;
  try {
    const tts = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FISH_API_KEY}`, "Content-Type": "application/json", model: process.env.FISH_MODEL || "s2.1-pro-free" },
      body: JSON.stringify({ text: text.slice(0, 600), format: "mp3", ...(process.env.FISH_VOICE_ID && { reference_id: process.env.FISH_VOICE_ID }) }),
    });
    if (!tts.ok) return;
    const form = new FormData();
    form.append("chat_id", String(chat));
    form.append("voice", new Blob([Buffer.from(await tts.arrayBuffer())], { type: "audio/mpeg" }), "jarvis.mp3");
    await fetch(`${API()}/sendVoice`, { method: "POST", body: form });
  } catch (e) { /* the text reply already went out */ }
}

async function onMessage(m) {
  const chat = m.chat.id, from = m.from && m.from.id;
  if (m.chat.type !== "private") return;
  const owner = String(process.env.TELEGRAM_OWNER_ID || "");
  if (!owner) {
    return sendText(chat, `Hi! Your Telegram ID is ${from}.\nTo make me yours, add TELEGRAM_OWNER_ID = ${from} in Vercel, then redeploy.`);
  }
  if (String(from) !== owner) return sendText(chat, "This is a private assistant.");

  const cmd = (m.text || "").trim().toLowerCase();
  if (cmd === "/start") return sendText(chat, "Welcome back, boss. Send me a message or a voice note.");
  if (cmd === "/new") { history = []; return sendText(chat, "Fresh start."); }

  await tg("sendChatAction", { chat_id: chat, action: "typing" });
  let text = (m.text || "").trim(), spoke = false;
  if (!text && (m.voice || m.audio)) {
    spoke = true;
    text = await hear((m.voice || m.audio).file_id, "ogg");
    if (!text) return sendText(chat, "I couldn't hear anything in that voice note.");
  }
  if (!text) return sendText(chat, "I can read text and voice notes for now.");

  const { reply, drafts } = await brain.think(text, history);
  history = [...history, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-12);
  await sendText(chat, reply, drafts);
  if (spoke) await speak(chat, reply);
}

async function onButton(q) {
  const owner = String(process.env.TELEGRAM_OWNER_ID || "");
  if (!owner || String(q.from.id) !== owner) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Not allowed" });
  const data = String(q.data || "");
  if (data.startsWith("draft:")) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Writing a reply…" });
    try {
      const d = await mail.draftReply(data.slice(6), "");
      if (q.message) await sendText(q.message.chat.id, `Draft reply to ${d.to}:\n\n${d.body}\n\nSaved in Gmail Drafts.`, [{ id: d.id, to: d.to }]);
    } catch (e) { if (q.message) await sendText(q.message.chat.id, "Could not write the reply: " + String(e.message).slice(0, 150)); }
    return;
  }
  if (!data.startsWith("send:")) return tg("answerCallbackQuery", { callback_query_id: q.id });
  try {
    await mail.sendDraft(data.slice(5));
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Sent" });
    if (q.message) {
      await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
      await sendText(q.message.chat.id, "Email sent.");
    }
  } catch (e) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Could not send: " + String(e.message).slice(0, 120), show_alert: true });
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!token() || req.headers["x-telegram-bot-api-secret-token"] !== secretFor()) return res.status(401).end();
  const u = req.body || {};
  if (seen.has(u.update_id)) return res.status(200).json({ ok: true }); // Telegram retries; skip repeats
  seen.add(u.update_id); if (seen.size > 200) seen.delete(seen.values().next().value);
  try {
    if (u.callback_query) await onButton(u.callback_query);
    else if (u.message) await onMessage(u.message);
  } catch (e) {
    try { if (u.message) await sendText(u.message.chat.id, "Error: " + String(e.message).slice(0, 200)); } catch (x) { /* nothing more to do */ }
  }
  res.status(200).json({ ok: true });
};
module.exports.secretFor = secretFor;
module.exports.sendText = sendText;
module.exports.tg = tg;
