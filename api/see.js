// Jarvis eyes. Only runs when YOU ask ("what do you see?"). One still photo from the camera is sent here,
// described by a vision model, and then thrown away. Nothing is stored.
const cors = require("./_cors");
const auth = require("./_auth");
const GROQ = "https://api.groq.com/openai/v1";
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.check(req)) return res.status(401).json({ error: "Locked" });
  try {
    const { image = "", question = "", langName = "", mode = "" } = req.body;
    const read = mode === "read";
    if (!/^[A-Za-z0-9+/=]+$/.test(image) || image.length < 500) throw new Error("No picture received");
    if (image.length > 3_000_000) throw new Error("Picture too large");
    const name = String(langName).replace(/[^\p{L} ]/gu, "").slice(0, 30);
    const q = String(question || "").slice(0, 300) || "What am I looking at?";
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: read ? 600 : 300,
        messages: [
          { role: "system", content: read
            ? "You read text out of a phone camera photo for the user. Give only what was asked: the visible text word for word, or its translation. Keep the original line order. " +
              "If there is no readable text, say so in one short sentence. No markdown, no commentary. " + (name ? `If you translate, use ${name} unless the user named another language.` : "")
            : "You are Jarvis, a quick-witted assistant looking through the user's phone camera. Answer the question about the photo in one to three short, plain spoken sentences. " +
            "No markdown, no lists, no emojis. Be specific (colours, text you can read, how many things). If something is unclear, say so instead of guessing. " +
            (name ? `Reply in ${name}.` : "Reply in the language of the question.") },
          { role: "user", content: [
            { type: "text", text: q },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64," + image } },
          ] },
        ],
      }),
    });
    if (!r.ok) throw new Error("Seeing failed: " + (await r.text()).slice(0, 200));
    const text = (((await r.json()).choices || [])[0] || {}).message?.content || "";
    res.json({ text: text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[*#_`]/g, "").trim() || "I couldn't make that out." });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
