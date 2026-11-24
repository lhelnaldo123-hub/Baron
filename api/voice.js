// Keys live in Vercel environment variables, never in this code.
const GROQ = "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const SYSTEM =
  "You are Jarvis, a friendly, quick-witted assistant. Your answer is shown on a phone screen and also spoken aloud. " +
  "Write the full answer for the screen in plain text (short lists with dashes are fine; no markdown symbols like ** or #). " +
  "Then add a final line starting with SAY: followed by a spoken version of one or two short sentences. " +
  "For short answers, the SAY line can repeat the answer. No emojis in the SAY line. " +
  "Always reply in the same language the user speaks or writes, and switch if they switch. " +
  "If the user tells you something worth remembering about themselves (name, preferences, family, plans), add one last line starting with MEM: followed by a short note in English. Otherwise omit the MEM line.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { audio, ext = "webm", text, history = [], memory = [], silent = false } = req.body;
    const auth = { Authorization: `Bearer ${process.env.GROQ_API_KEY}` };

    // 1. Speech to text (skipped when the message was typed)
    let user = (text || "").trim();
    if (!user) {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from(audio, "base64")]), `clip.${ext}`);
      form.append("model", "whisper-large-v3-turbo");
      const stt = await fetch(`${GROQ}/audio/transcriptions`, { method: "POST", headers: auth, body: form });
      if (!stt.ok) throw new Error("Listening failed: " + (await stt.text()));
      user = ((await stt.json()).text || "").trim();
    }
    if (!user) return res.json({ user: "", reply: "", say: "", audio: null });

    // 2. Thinking
    const messages = [{ role: "system", content: SYSTEM + (memory.length ? "\nThings you remember about the user:\n- " + memory.slice(-30).join("\n- ") : "") }, ...history.slice(-12), { role: "user", content: user }];
    const chat = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 1500,
        ...(MODEL.includes("gpt-oss") && { reasoning_effort: "low" }),
      }),
    });
    if (!chat.ok) throw new Error("Thinking failed: " + (await chat.text()));
    let raw = (await chat.json()).choices[0].message.content.trim();
    let mem = "";
    const m = raw.lastIndexOf("MEM:");
    if (m >= 0) { mem = raw.slice(m + 4).trim(); raw = raw.slice(0, m).trim(); }
    const i = raw.lastIndexOf("SAY:");
    const reply = i > 0 ? raw.slice(0, i).trim() : raw.replace(/^SAY:\s*/, "");
    const say = i >= 0 ? raw.slice(i + 4).trim() : raw.slice(0, 300);
    if (silent) return res.json({ user, reply, say, mem, audio: null });

    // 3. Speaking (only the short spoken version)
    const tts = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        model: process.env.FISH_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify({
        text: say || reply,
        format: "mp3",
        ...(process.env.FISH_VOICE_ID && { reference_id: process.env.FISH_VOICE_ID }),
      }),
    });
    if (!tts.ok) throw new Error("Voice failed: " + (await tts.text()));
    const mp3 = Buffer.from(await tts.arrayBuffer());

    res.json({ user, reply, say, mem, audio: mp3.toString("base64") });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
