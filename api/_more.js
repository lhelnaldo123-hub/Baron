// Extra helpers: step-by-step answers, quiz mode, saving to the gallery, and WhatsApp (no API needed).
// The underscore in the file name tells Vercel this is a helper, not a separate function.
// Optional Vercel variable: WHATSAPP_COUNTRY_CODE (digits only, default 233 for Ghana).
const crypto = require("crypto");

// ---------- step by step ----------
const STEP_RE = /\b(step[- ]?by[- ]?step|(in|with|the|give me|show me|list the|all the|few|some) steps|steps (for|to|of|on)|walk me through|one step at a time|break (it|this) down)\b/i;
const STEP_RULES =
  "\nThe user wants STEP BY STEP help. This overrides the short-answer and no-list rules above. Give numbered steps (1, 2, 3...), one short step per line, up to 8 steps, showing the working for maths. " +
  "Start each step with its number and a full stop, like '1. Add the two sides.' Put the final answer on its own line starting with Answer: when there is one. " +
  "Do not use markdown symbols like ** or #. Keep the closing SAY or MEM lines as before.";

// ---------- gallery ----------
const GAL_RE = /\b(gallery|galleries|save (this|that|it|the|my|our|these)|keep (this|that|it)|bookmark|add (this|that|it) to)\b/i;
const GAL_TOOLS = [
  { type: "function", function: { name: "save_to_gallery", description: "Save a message to the user's Gallery (a saved-messages page in the app). Use it when they say 'save this', 'save that message', 'put it in my gallery', 'keep this'. what = last_reply (your previous answer, the default), last_exchange (their last question plus your answer) or text (something specific you give in text, such as a message the user said).",
    parameters: { type: "object", properties: { what: { type: "string", enum: ["last_reply", "last_exchange", "text"] }, text: { type: "string", description: "Only when what=text" }, title: { type: "string", description: "Short title, optional" } } } } },
  { type: "function", function: { name: "open_gallery", description: "Open the Gallery page so the user can see what they saved.", parameters: { type: "object", properties: {} } } },
];
const GAL_RULES = "\nThe user has a Gallery of saved messages. When they ask to save a message or answer, call save_to_gallery, then say in a few words that it is saved. Never say it is saved unless the tool succeeded.";

// ---------- quiz ----------
const QUIZ_RE = /\b(quiz|test me|ask me (some )?questions?|practice questions?|exam me|examine me|drill me|revision)\b/i;
const QUIZ_TOOLS = [
  { type: "function", function: { name: "quiz_start", description: "Start quiz mode. Use when the user asks to be quizzed, tested or asked questions. topic = what to ask about (use 'my notes' or 'my homework' to quiz them on their saved notes and homework answers). count = how many questions (default 5, 1 to 20).",
    parameters: { type: "object", properties: { topic: { type: "string" }, count: { type: "integer" }, level: { type: "string", description: "easy, medium or hard (optional)" } }, required: ["topic"] } } },
  { type: "function", function: { name: "quiz_result", description: "Record the user's answer to the question you just asked: correct true or false. Call it once for each question, right after the user answers.",
    parameters: { type: "object", properties: { correct: { type: "boolean" } }, required: ["correct"] } } },
  { type: "function", function: { name: "quiz_stop", description: "End the quiz early because the user said stop, quit or enough.", parameters: { type: "object", properties: {} } } },
];
const cleanQuiz = q => {
  if (!q || typeof q !== "object" || !q.on) return null;
  const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v) || 0));
  return { on: true, topic: String(q.topic || "general knowledge").replace(/\s+/g, " ").trim().slice(0, 80), total: n(q.total, 1, 20) || 5, asked: n(q.asked, 0, 20), score: n(q.score, 0, 20), level: String(q.level || "").replace(/[^a-z]/gi, "").slice(0, 8) };
};
const quizRules = (q, notes) => {
  if (!q) return "\nQuiz mode is available. If the user asks to be quizzed, call quiz_start.";
  const mine = /\b(notes?|homework|saved)\b/i.test(q.topic);
  const src = mine && notes.length ? "\nBase the questions ONLY on these saved notes and homework answers:\n" + notes.slice(-12).map(n => "- " + n.text.slice(0, 200)).join("\n") : "";
  return `\nQUIZ MODE IS ON. Topic: ${q.topic}${q.level ? " (" + q.level + ")" : ""}. Question ${Math.min(q.asked + 1, q.total)} of ${q.total}. Score so far: ${q.score} out of ${q.asked}. ` +
    "Rules: ask exactly ONE question at a time and then stop and wait. Keep each question short and clear, suitable for being read aloud. Do not give the answer with the question. " +
    "When the user answers, call quiz_result with correct true or false (be fair: accept right answers worded differently), then say in one short sentence if they were right, and if wrong give the right answer in one sentence. " +
    "Then ask the next question. When quiz_result says done, tell them their final score out of the total with a short kind comment, and stop asking. If they say stop or quit, call quiz_stop. If they ask for a hint, give a small hint without the answer. " +
    "Never ask a question you already asked." + src;
};

// ---------- WhatsApp (opens WhatsApp with the message typed; the user taps Send. No API, nothing is sent by Jarvis) ----------
const WA_RE = /\b(whats ?app|wa\.me|message (him|her|them)|text (him|her|them)|contacts?|phone numbers?)\b/i;
const WA_TOOLS = [
  { type: "function", function: { name: "whatsapp_message", description: "Get a WhatsApp message ready for the user to send. It opens WhatsApp with the message already typed, and the user taps Send themselves. to = a saved contact name or a phone number. Leave to empty if they did not say who (they pick the contact in WhatsApp). Write the message in the user's own voice.",
    parameters: { type: "object", properties: { to: { type: "string", description: "Contact name or phone number" }, message: { type: "string", description: "The full message text" } }, required: ["message"] } } },
  { type: "function", function: { name: "save_contact", description: "Save a contact's name and phone number so the user can say 'WhatsApp Mum'. Use when they give a name and a number to remember.",
    parameters: { type: "object", properties: { name: { type: "string" }, number: { type: "string", description: "Phone number, with country code if they gave it" } }, required: ["name", "number"] } } },
  { type: "function", function: { name: "list_contacts", description: "List the saved contacts.", parameters: { type: "object", properties: {} } } },
];
const WA_RULES = "\nYou can get WhatsApp messages ready with whatsapp_message. You cannot send them yourself and you cannot read WhatsApp: the phone opens WhatsApp with the message typed and the user presses Send. Say that plainly, like 'It's ready, tap Open WhatsApp and press send.' Never say a WhatsApp message was sent. If you do not have the person's number, ask for it and offer to save it with save_contact.";

const cleanContacts = list => (Array.isArray(list) ? list : []).slice(0, 80).map(c => ({
  id: String((c && c.id) || "").replace(/[^\w-]/g, "").slice(0, 12),
  name: String((c && c.name) || "").replace(/\s+/g, " ").trim().slice(0, 40),
  num: String((c && c.num) || "").replace(/\D/g, "").slice(0, 15),
})).filter(c => c.id && c.name && c.num.length >= 7);

// Turns what the user said into WhatsApp's international format (digits only).
function normNumber(raw) {
  const s = String(raw || "").trim(), cc = String(process.env.WHATSAPP_COUNTRY_CODE || "233").replace(/\D/g, "") || "233";
  let d = s.replace(/\D/g, "");
  if (d.length < 7) return "";
  if (/^\s*\+/.test(s)) return d;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return cc + d.slice(1);
  if (d.length <= 9) return cc + d;
  return d;
}

function findContact(name, contacts) {
  const n = String(name || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!n) return null;
  return contacts.find(c => c.name.toLowerCase() === n) || contacts.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) || null;
}

// ---------- plumbing used by voice.js ----------
function detect(seen, quizOn) {
  return { steps: STEP_RE.test(seen), gal: GAL_RE.test(seen), quiz: !!quizOn || QUIZ_RE.test(seen), wa: WA_RE.test(seen) };
}
const tools = (f, quizOn) => [...(f.gal ? GAL_TOOLS : []), ...(f.quiz ? (quizOn ? QUIZ_TOOLS.slice(1) : QUIZ_TOOLS.slice(0, 1)) : []), ...(f.wa ? WA_TOOLS : [])];
const rules = (f, X) => (f.steps ? STEP_RULES : "") + (f.gal ? GAL_RULES : "") + (f.quiz ? quizRules(X.quiz, X.notes || []) : "") + (f.wa ? WA_RULES + (X.contacts.length ? "\nSaved contacts: " + X.contacts.slice(0, 40).map(c => c.name).join(", ") + "." : "\nNo contacts are saved yet.") : "");

// Returns what to tell the model, or null when the tool name is not ours.
function run(name, a, actions, X) {
  if (name === "save_to_gallery") {
    const what = ["last_reply", "last_exchange", "text"].includes(a.what) ? a.what : "last_reply";
    const text = String(a.text || "").replace(/[ \t]+/g, " ").trim().slice(0, 3000);
    if (what === "text" && !text) return { error: "Nothing to save. Ask the user what to save." };
    actions.push({ action: "gallery_add", what, text, title: String(a.title || "").trim().slice(0, 60) });
    return { ok: true, saved: true, note: "Saved to the Gallery. Tell the user in a few words." };
  }
  if (name === "open_gallery") { actions.push({ action: "panel", page: "gallery" }); return { ok: true }; }

  if (name === "quiz_start") {
    const topic = String(a.topic || "").replace(/\s+/g, " ").trim().slice(0, 80) || "general knowledge";
    const total = Math.max(1, Math.min(20, parseInt(a.count, 10) || 5));
    const q = { on: true, topic, total, asked: 0, score: 0, level: String(a.level || "").replace(/[^a-z]/gi, "").slice(0, 8) };
    X.quiz = q; actions.push({ action: "quiz_set", quiz: q });
    return { ok: true, started: true, topic, questions: total, note: "Quiz started. Say one short line, then ask question 1 and wait." };
  }
  if (name === "quiz_result") {
    const q = X.quiz; if (!q) return { error: "No quiz is running." };
    q.asked = Math.min(q.total, q.asked + 1); if (a.correct === true) q.score++;
    const done = q.asked >= q.total;
    if (done) { actions.push({ action: "quiz_end", asked: q.asked, score: q.score, total: q.total, topic: q.topic }); X.quiz = null; }
    else actions.push({ action: "quiz_set", quiz: q });
    return { ok: true, asked: q.asked, score: q.score, total: q.total, done, note: done ? "That was the last question. Give the final score." : "Now ask the next question." };
  }
  if (name === "quiz_stop") {
    const q = X.quiz; X.quiz = null;
    actions.push({ action: "quiz_end", asked: q ? q.asked : 0, score: q ? q.score : 0, total: q ? q.total : 0, topic: q ? q.topic : "", stopped: true });
    return { ok: true, stopped: true, score: q ? q.score : 0, asked: q ? q.asked : 0 };
  }

  if (name === "save_contact") {
    const nm = String(a.name || "").replace(/\s+/g, " ").trim().slice(0, 40), num = normNumber(a.number);
    if (!nm) return { error: "I need a name." };
    if (!num) return { error: "That does not look like a phone number. Ask the user to say it again." };
    if (X.contacts.length >= 80) return { error: "The contacts list is full." };
    const old = findContact(nm, X.contacts);
    if (old && old.name.toLowerCase() === nm.toLowerCase()) { old.num = num; actions.push({ action: "contact_add", contact: old }); return { ok: true, updated: nm }; }
    const c = { id: crypto.randomBytes(3).toString("hex"), name: nm, num };
    X.contacts.push(c); actions.push({ action: "contact_add", contact: c });
    return { ok: true, saved: nm };
  }
  if (name === "list_contacts") return X.contacts.length ? { contacts: X.contacts.map(c => c.name) } : { contacts: [], note: "No contacts saved yet." };
  if (name === "whatsapp_message") {
    const text = String(a.message || "").replace(/[ \t]+/g, " ").trim().slice(0, 1500);
    if (!text) return { error: "There is no message text." };
    let num = "", who = String(a.to || "").trim().slice(0, 60);
    if (who) {
      if (/\d{7,}/.test(who.replace(/[\s\-().]/g, ""))) { num = normNumber(who); who = ""; }
      else {
        const c = findContact(who, X.contacts);
        if (!c) return { error: "I do not have a number for " + who + ". Ask the user for it, and offer to save it." };
        num = c.num; who = c.name;
      }
      if (!num) return { error: "That phone number does not look right. Ask the user to say it again." };
    }
    actions.push({ action: "whatsapp", name: who, num, text });
    return { ok: true, ready: true, sent: false, to: who || (num ? "that number" : "whoever they pick"), note: "WhatsApp is opening with the message typed. The user must tap Open WhatsApp and press Send. Do not say it was sent." };
  }
  return null;
}

module.exports = { detect, tools, rules, run, cleanQuiz, cleanContacts, normNumber, STEP_RE };
