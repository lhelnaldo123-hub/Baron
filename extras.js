// Notes, reminders and saved homework. Everything is kept on this phone.
// Adds the NOTES tab to the Jarvis window, rings reminders, and lets Jarvis (voice) add, read and remove them.
(() => {
  const $ = s => document.querySelector(s);
  const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const rid = () => [...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, "0")).join("");
  let notes = load("jv-notes"), rems = load("jv-reminders");
  const keep = () => { notes = notes.slice(-60); rems = rems.slice(-40); save("jv-notes", notes); save("jv-reminders", rems); };

  // ---- what the server needs to know (it reads, adds and removes notes and reminders for you) ----
  window.jvExtraState = () => ({
    offset: new Date().getTimezoneOffset(),
    notes: notes.slice(-40).map(n => ({ id: n.id, kind: n.kind || "note", text: (n.kind === "homework" && n.q ? n.q + " => " : "") + n.text })),
    reminders: rems.map(r => ({ id: r.id, text: r.text, at: r.at, ev: r.ev || "" })),
  });
  window.jvExtraActions = list => {
    let changed = false;
    (list || []).forEach(a => {
      if (!a) return;
      if (a.action === "note_add" && a.note) { notes.push({ id: String(a.note.id), text: String(a.note.text).slice(0, 1000), kind: "note", t: Date.now() }); changed = true; }
      else if (a.action === "note_remove") { notes = notes.filter(n => n.id !== a.id); changed = true; }
      else if (a.action === "reminder_add" && a.reminder) { rems.push({ id: String(a.reminder.id), text: String(a.reminder.text), at: +a.reminder.at, ev: a.reminder.ev || "" }); changed = true; }
      else if (a.action === "reminder_remove") { rems = rems.filter(r => r.id !== a.id); changed = true; }
    });
    if (changed) { keep(); draw(); }
  };
  // look.js calls this when you tap Save under a camera answer
  window.jvSaveHomework = (q, text) => { notes.push({ id: rid(), kind: "homework", q: String(q || "").slice(0, 200), text: String(text || "").slice(0, 3000), t: Date.now() }); keep(); draw(); return true; };

  // ---- the NOTES page ----
  const css = document.createElement("style");
  css.textContent = `#hp4 h5{margin:.5rem 0 .1rem;font-size:.62rem;letter-spacing:.16em;color:#7be0ff;font-weight:400}
  #hp4 .row{position:relative;padding-right:2.3rem}
  #hp4 .row.open b,#hp4 .row.open .sj{white-space:pre-wrap;overflow:visible;text-overflow:clip;display:block}
  #hp4 .row .x{position:absolute;right:.35rem;top:.3rem;width:28px;height:28px;border-radius:50%;border:1px solid #6bb8ff66;background:#0a2a5a99;color:#fff;font-size:.8rem;padding:0}
  #hp4 .add{display:flex;gap:.4rem} #hp4 .add input{flex:1;min-width:0;border:1px solid #3aa8ff88;background:#07163acc;color:#cfe9ff;border-radius:12px;padding:.5rem .7rem;font:inherit;font-size:.85rem}
  #hp4 .add button{border:0;border-radius:12px;background:#1c6dd0;color:#fff;padding:0 .9rem}`;
  document.head.append(css);
  const page = $("#hp4");
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const when = ms => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function row(label, title, sub, onDel) {
    const r = el("div", "row"); r.append(el("div", "rt", label), el("b", "", title));
    if (sub) r.append(el("span", "sj", sub));
    r.onclick = () => r.classList.toggle("open");
    const x = el("button", "x", "✕"); x.setAttribute("aria-label", "Delete");
    x.onclick = e => { e.stopPropagation(); onDel(); };
    r.append(x); return r;
  }
  function draw() {
    if (!page) return;
    const add = el("div", "add"), inp = el("input"); inp.placeholder = "Add a note…"; inp.autocomplete = "off";
    const ab = el("button", "", "Add");
    const doAdd = () => { const t = inp.value.trim(); if (!t) return; notes.push({ id: rid(), kind: "note", text: t.slice(0, 1000), t: Date.now() }); keep(); draw(); };
    ab.onclick = doAdd; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } };
    add.append(inp, ab);
    const kids = [add];
    if ("Notification" in window && Notification.permission === "default") {
      const nb = el("button", "wide", "Turn on phone alerts for reminders"); nb.onclick = () => Notification.requestPermission().then(draw).catch(() => {}); kids.push(nb);
    }
    kids.push(el("h5", "", "REMINDERS"));
    const rs = [...rems].sort((a, b) => a.at - b.at);
    if (!rs.length) kids.push(el("p", "help", "None. Say \"remind me at 3pm to call mum\"."));
    rs.forEach(r => kids.push(row("REMINDER · " + when(r.at), r.text, "", () => { rems = rems.filter(x => x.id !== r.id); keep(); draw(); })));
    kids.push(el("h5", "", "NOTES"));
    const ns = notes.filter(n => n.kind !== "homework").slice().reverse();
    if (!ns.length) kids.push(el("p", "help", "None. Say \"note this down\" and what to remember."));
    ns.forEach(n => kids.push(row("NOTE", n.text, "", () => { notes = notes.filter(x => x.id !== n.id); keep(); draw(); })));
    kids.push(el("h5", "", "HOMEWORK ANSWERS"));
    const hs = notes.filter(n => n.kind === "homework").slice().reverse();
    if (!hs.length) kids.push(el("p", "help", "None. Use the camera on a question, then tap Save."));
    hs.forEach(n => kids.push(row("HOMEWORK", n.q || "Question", n.text, () => { notes = notes.filter(x => x.id !== n.id); keep(); draw(); })));
    page.replaceChildren(...kids);
  }

  // ---- reminders ring ----
  async function phoneNotice(text) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const reg = navigator.serviceWorker && await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) reg.showNotification("Jarvis reminder", { body: text, icon: "/jarvis-icon-192.png", tag: "jv-rem", vibrate: [200, 100, 200] });
      else new Notification("Jarvis reminder", { body: text, icon: "/jarvis-icon-192.png" });
    } catch (e) {}
  }
  function ring() {
    const now = Date.now(), due = rems.filter(r => r.at <= now);
    if (!due.length) return;
    rems = rems.filter(r => r.at > now); keep(); draw();
    due.forEach(r => {
      const late = now - r.at > 180000;                      // the app was closed when it was due
      if (window.jvAlert) window.jvAlert(late ? "Missed reminder" : "Reminder", r.text + (late ? "\n(Due " + when(r.at) + ")" : ""));
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
      phoneNotice((late ? "Missed: " : "") + r.text);
      if (!late && window.jvSpeak) window.jvSpeak("Reminder. " + r.text);
    });
  }
  setInterval(() => { if (!document.hidden) ring(); }, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ring(); });
  draw(); setTimeout(ring, 3000);
})();
