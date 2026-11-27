// Live web search for the Tender Sprout AI chat (uses your Tavily key from Vercel). Needs the same passcode login as the voice.
const cors = require("./_cors");
const auth = require("./_auth");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.check(req) && !auth.tenderOpen(req)) return res.status(401).json({ error: "Locked" });
  if (!process.env.TAVILY_API_KEY) return res.status(500).json({ error: "Web search is not set up. Add TAVILY_API_KEY in Vercel, then redeploy." });
  try {
    const query = String((req.body || {}).query || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!query) return res.status(400).json({ error: "Nothing to search for." });
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.TAVILY_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: 5, include_answer: true, search_depth: "basic" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error("Search service answered " + r.status);
    const j = await r.json();
    res.json({
      answer: String(j.answer || "").slice(0, 1200),
      results: (j.results || []).slice(0, 5).map(x => ({ title: String(x.title || "").slice(0, 120), url: String(x.url || "").slice(0, 300), content: String(x.content || "").slice(0, 600) })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
};
