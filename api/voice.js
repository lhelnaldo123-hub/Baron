// Listening + thinking. Keys live in Vercel environment variables, never in this code.
const GROQ = "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FORMAT =
  "Your answer is shown on a phone screen and also spoken aloud. " +
  "Keep answers short and conversational unless the user asks for detail. " +
  "Write the full answer for the screen in plain text (short lists with dashes are fine; no markdown symbols like ** or #). " +
  "Then add a final line starting with SAY: followed by a spoken version of one or two short sentences. " +
  "For short answers, the SAY line can repeat the answer. No emojis in the SAY line. " +
  "Always reply in the same language the user speaks or writes, and switch if they switch. " +
  "If the user tells you something worth remembering about themselves (name, preferences, family, plans), add one last line starting with MEM: followed by a short note in English. Otherwise omit the MEM line.";
const PERSONAS = {
  jarvis: "You are Jarvis, a friendly, quick-witted assistant. ",
  teacher:
    "You are Tender Sprout AI, a friendly voice tutor for teachers and students in Ghana. Use Ghanaian/British English and support the NaCCA curriculum. " +
    "Never invent official curriculum codes or claim questions are real past exam questions. Explain simply, one step at a time, and offer to quiz the student. ",
};
const SPOKEN =
  "This is a live spoken conversation. Talk like a warm, natural person on a phone call: usually one to three short sentences, contractions, plain words. " +
  "Start with a natural reaction when it fits (like 'Oh nice,' 'Right,' or 'Good question.'). " +
  "Never use lists, headings, markdown, emojis or symbols; say numbers and symbols the way you would speak them. " +
  "Ask at most one short follow-up question. If the topic is big, give the short version and offer to go deeper. " +
  "Reply in the same language the user speaks, and switch if they switch. " +
  "If the user shares something worth remembering about themselves (name, preferences, family, plans), add one last line starting with MEM: followed by a short note in English. Otherwise omit the MEM line.";
const VOICE_MODEL = process.env.GROQ_VOICE_MODEL || "openai/gpt-oss-20b";
const JUNK = /^(thank you\.?|thanks\.?|thanks for watching\.?|thank you for watching\.?|you\.?|bye\.?|[.\s]*)$/i;
const cors = require("./_cors");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { audio, ext = "webm", text, history = [], memory = [], lang = "", langName = "", mode = "jarvis", spoken = false } = req.body;
    const model = spoken ? VOICE_MODEL : MODEL;
    const code = /^[a-z]{2,3}$/.test(lang) ? lang : "";
    const name = String(langName).replace(/[^\p{L} ]/gu, "").slice(0, 30);
    const auth = { Authorization: `Bearer ${process.env.GROQ_API_KEY}` };

    // 1. Speech to text (skipped when the message was typed)
    let user = (text || "").trim();
    if (!user) {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from(audio, "base64")]), `clip.${ext}`);
      form.append("model", "whisper-large-v3-turbo");
      if (code) form.append("language", code);
      const stt = await fetch(`${GROQ}/audio/transcriptions`, { method: "POST", headers: auth, body: form });
      if (!stt.ok) throw new Error("Listening failed: " + (await stt.text()));
      user = ((await stt.json()).text || "").trim();
      if (JUNK.test(user)) user = "";
    }
    if (!user) return res.json({ user: "", reply: "", say: "", mem: "" });

    // 2. Thinking
    const system = (PERSONAS[mode] || PERSONAS.jarvis) + (spoken ? SPOKEN : FORMAT) + (code && name ? `\nThe user speaks ${name}. Always reply in ${name}.` : "") + (memory.length ? "\nThings you remember about the user:\n- " + memory.slice(-30).join("\n- ") : "");
    const messages = [{ role: "system", content: system }, ...history.slice(-12), { role: "user", content: user }];
    const chat = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: spoken ? 600 : 1500,
        ...(model.includes("gpt-oss") && { reasoning_effort: "low" }),
      }),
    });
    if (!chat.ok) throw new Error("Thinking failed: " + (await chat.text()));
    let raw = (await chat.json()).choices[0].message.content.trim();
    let mem = "";
    const m = raw.lastIndexOf("MEM:");
    if (m >= 0) { mem = raw.slice(m + 4).trim(); raw = raw.slice(0, m).trim(); }
    const i = raw.lastIndexOf("SAY:");
    const reply = spoken ? raw.replace(/^SAY:\s*/, "").replace(/[*#_`]/g, "") : i > 0 ? raw.slice(0, i).trim() : raw.replace(/^SAY:\s*/, "");
    const say = spoken ? reply : i >= 0 ? raw.slice(i + 4).trim() : raw.slice(0, 300);

    res.json({ user, reply, say, mem });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
