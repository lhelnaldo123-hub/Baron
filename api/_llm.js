// Backup AI providers for the chat brain. Groq always goes first; the backups are used only when Groq has no tokens left or is down.
// Both backups speak the same "OpenAI style" chat format, so any provider that does can be used.
//
// Vercel variables (all optional):
//   GEMINI_API_KEY   backup 1: free key from aistudio.google.com/apikey
//   GEMINI_MODEL     default gemini-3.5-flash
//   BACKUP2_URL      backup 2: base URL of any OpenAI-style provider, e.g. https://openrouter.ai/api/v1
//   BACKUP2_KEY      that provider's API key
//   BACKUP2_MODEL    the model name to use there
const GROQ = "https://api.groq.com/openai/v1";

function providers(groqModels) {
  const list = groqModels.map(model => ({ name: "groq", url: GROQ, key: process.env.GROQ_API_KEY, model, groq: true }));
  if (process.env.GEMINI_API_KEY) list.push({ name: "gemini", url: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""), key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-3.5-flash" });
  if (process.env.BACKUP2_URL && process.env.BACKUP2_KEY && process.env.BACKUP2_MODEL) list.push({ name: "backup2", url: process.env.BACKUP2_URL.replace(/\/+$/, ""), key: process.env.BACKUP2_KEY, model: process.env.BACKUP2_MODEL });
  return list;
}

// Other providers are pickier than Groq: tool answers must carry the tool's name, and a tool with no inputs must not have an empty schema.
function prepare(msgs, tools) {
  const names = {};
  msgs.forEach(m => (m.tool_calls || []).forEach(c => { if (c.id) names[c.id] = c.function && c.function.name; }));
  const messages = msgs.map(m => m.role === "tool" ? { ...m, name: names[m.tool_call_id] || "tool" } : m);
  const clean = (tools || []).map(t => {
    const p = t.function && t.function.parameters;
    if (p && p.properties && !Object.keys(p.properties).length) { const { parameters, ...rest } = t.function; return { ...t, function: rest }; }
    return t;
  });
  return { messages, tools: clean };
}

module.exports = { providers, prepare };
