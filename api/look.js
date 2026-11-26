// Looks at a photo from the phone camera and answers about it. Key lives in Vercel environment variables.
const GROQ = "https://api.groq.com/openai/v1";
const MODELS = [...new Set([process.env.GROQ_VISION_MODEL, "qwen/qwen3.8-27b", "qwen/qwen3.6-27b"].filter(Boolean))];
const cors = require("./_cors");
const auth = require("./_auth");

const SYSTEM =
  "You are Jarvis, a friendly assistant looking through the user's phone camera. " +
  "Answer what the user asks about the photo. If they ask nothing specific, say what you see: name the main object and give one or two useful facts. " +
  "If the photo shows a question, exercise or problem (on a board, paper, book or screen), read it exactly, then answer or solve it with numbered steps showing the working, and put the final answer on its own line starting with Answer: (the word Answer and a colon). If the user shows their own written answer, say whether it is right and explain any mistake kindly. " +
  "If a finger or pointer is pointing at something, focus on that part. " +
  "If the photo shows text, read it out; if the user asks you to read it, give ALL of the text in order, never shortened or summarised. If the user wants a translation, translate it. " +
  "If the picture is too dark, blurry or cut off, say so and tell them how to retake it. Never invent text you cannot read. " +
  "Reply in the language the user writes or speaks; if the user wrote nothing, reply in English. " +
  "Plain text only: no markdown symbols like ** or #, no emojis (short lists with dashes are fine). " +
  "Finish with one last line starting with SAY: followed by a spoken summary of one or two short sentences.";

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.check(req)) return res.status(401).json({ error: "Locked" });
  try {
    const { image = "", question = "", langName = "" } = req.body || {};
    const b64 = String(image).replace(/^data:image\/\w+;base64,/, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 500) return res.status(400).json({ error: "No photo received." });
    if (b64.length > 3_500_000) return res.status(413).json({ error: "Photo is too big." });
    const q = String(question).trim().slice(0, 500);
    const name = String(langName).replace(/[^\p{L} ]/gu, "").slice(0, 30);
    const text = (q ? "The user asks: " + q : "The user did not say what they want. Tell them what this is.") + (name ? "\nThe user speaks " + name + "." : "");
    const body = (m, think) => JSON.stringify({
      model: m, temperature: 0.3, max_tokens: 2500, ...(think && { reasoning_effort: "low" }),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } }] },
      ],
    });
    let raw = "", lastErr = "";
    for (const m of MODELS) {
      const call = think => fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, body: body(m, think) });
      let r = await call(true);
      if (r.status === 400) { const t = await r.text(); if (/reasoning/i.test(t)) r = await call(false); else { lastErr = t.slice(0, 200); continue; } }   // this model does not take reasoning_effort
      if (r.ok) { raw = ((await r.json()).choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); if (raw) break; }
      else lastErr = (await r.text()).slice(0, 200);
    }
    if (!raw) throw new Error("Could not look at that" + (lastErr ? ": " + lastErr : "."));
    const i = raw.lastIndexOf("SAY:");
    const clean = s => s.replace(/[*#_`]/g, "").trim();
    const reply = clean(i > 0 ? raw.slice(0, i) : raw.replace(/^SAY:\s*/, ""));
    const say = clean(i >= 0 ? raw.slice(i + 4) : raw.slice(0, 250));
    res.json({ reply, say });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
