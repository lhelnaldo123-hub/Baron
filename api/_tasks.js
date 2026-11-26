// "Plans" the user can ask Jarvis to write down, list, tick off or remove.
// Used by the app (/api/voice) and by Telegram (_brain.js). Pure helpers, no storage in here.
const crypto = require("crypto");

const TASK_TOOLS = [
  { type: "function", function: { name: "add_task", description: "Write down a plan or to-do for the user. Use when they ask you to write something down, remember a plan, or add to their list.",
    parameters: { type: "object", properties: { text: { type: "string", description: "The plan, short and clear" } }, required: ["text"] } } },
  { type: "function", function: { name: "complete_task", description: "Mark one plan as done. Use the id shown in the plans list.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
  { type: "function", function: { name: "remove_task", description: "Delete one plan from the list. Use the id shown in the plans list.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
];

const TASK_RULES =
  "\nYou keep the user's plans list (shown below). When they ask what the plans are, read the list: say which are done and which are still open. " +
  "If the list is empty, say there are no plans yet and ask if they want you to write something down. " +
  "When you write something down, tick one off, or remove one, call the tool, then tell them plainly what you did. " +
  "Later, if they ask again, answer from the list, including which ones are done. Never claim you wrote something down unless the tool succeeded.";

const clean = list => (Array.isArray(list) ? list : []).slice(0, 60).map(t => ({
  id: String((t && t.id) || "").replace(/[^\w-]/g, "").slice(0, 12),
  text: String((t && t.text) || "").replace(/\s+/g, " ").trim().slice(0, 200),
  done: !!(t && t.done),
})).filter(t => t.id && t.text);

const fmt = tasks => tasks.length
  ? "\nThe plans list right now:\n" + tasks.map(t => `- [${t.done ? "DONE" : "open"}] (id ${t.id}) ${t.text}`).join("\n")
  : "\nThe plans list right now: empty.";

// Changes the `tasks` array in place. Returns what to tell the model; pushes a description of each change into `actions`.
function run(name, a, tasks, actions) {
  if (name === "add_task") {
    const text = String(a.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { error: "Nothing to write down." };
    if (tasks.length >= 60) return { error: "The list is full. Remove something first." };
    const t = { id: crypto.randomBytes(3).toString("hex"), text, done: false };
    tasks.push(t); actions.push({ action: "task_add", task: t });
    return { ok: true, added: text };
  }
  if (name === "complete_task" || name === "remove_task") {
    const i = tasks.findIndex(t => t.id === String(a.id || ""));
    if (i < 0) return { error: "No plan with that id." };
    const t = tasks[i];
    if (name === "complete_task") { t.done = true; actions.push({ action: "task_done", id: t.id }); return { ok: true, done: t.text }; }
    tasks.splice(i, 1); actions.push({ action: "task_remove", id: t.id });
    return { ok: true, removed: t.text };
  }
  return null;
}

module.exports = { TASK_TOOLS, TASK_RULES, clean, fmt, run };
