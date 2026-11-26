// Speaking. Turns text into an mp3 with the voice you picked.
const cors = require("./_cors");
const auth = require("./_auth");
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.check(req)) return res.status(401).json({ error: "Locked" });
  try {
    const { text = "", voice = "" } = req.body;
    const id = /^[\w-]{8,64}$/.test(voice) ? voice : process.env.FISH_VOICE_ID;
    const tts = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        model: process.env.FISH_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify({ text: String(text).slice(0, 900), format: "mp3", ...(id && { reference_id: id }) }),
    });
    if (!tts.ok) throw new Error("Voice failed: " + (await tts.text()));
    const mp3 = Buffer.from(await tts.arrayBuffer());
    res.json({ audio: mp3.toString("base64") });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
};
