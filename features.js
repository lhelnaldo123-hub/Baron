// Jarvis extras: Gallery (saved messages), quiz progress, WhatsApp (opens WhatsApp with the message typed, no API),
// and the "Hey Jarvis" wake word. Everything is kept on this phone.
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const loadJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const saveJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const rid = () => [...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, "0")).join("");
  const when = ms => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  let gallery = loadJ("jv-gallery", []), contacts = loadJ("jv-contacts", []), quiz = loadJ("jv-quiz", null);
  const keepG = () => { gallery = gallery.slice(-100); saveJ("jv-gallery", gallery); };
  const keepC = () => { contacts = contacts.slice(-80); saveJ("jv-contacts", contacts); };

  const css = document.createElement("style");
  css.textContent = `
  .tabs button{letter-spacing:.08em !important;font-size:.6rem !important}
  #hp5 h5{margin:.5rem 0 .1rem;font-size:.62rem;letter-spacing:.16em;color:#7be0ff;font-weight:400}
  #hp5 .row{position:relative;padding-right:2.3rem}
  #hp5 .row.open b,#hp5 .row.open .sj{white-space:pre-wrap;overflow:visible;text-overflow:clip;display:block}
  #hp5 .row .x{position:absolute;right:.35rem;top:.3rem;width:28px;height:28px;border-radius:50%;border:1px solid #6bb8ff66;background:#0a2a5a99;color:#fff;font-size:.8rem;padding:0}
  #hp5 .acts{display:none;gap:.4rem;margin-top:.4rem} #hp5 .row.open .acts{display:flex}
  #hp5 .acts button{flex:1;border:1px solid #3aa8ff88;background:#07163acc;color:#cfe9ff;border-radius:10px;padding:.4rem;font:inherit;font-size:.8rem}
  #hp5 .add{display:flex;gap:.4rem} #hp5 .add input{flex:1;min-width:0;border:1px solid #3aa8ff88;background:#07163acc;color:#cfe9ff;border-radius:12px;padding:.5rem .7rem;font:inherit;font-size:.85rem}
  #hp5 .add button{border:0;border-radius:12px;background:#1c6dd0;color:#fff;padding:0 .9rem}
  .cpw{display:flex;gap:.2rem;flex-wrap:wrap}
  .wklab{font-size:.78rem;color:#9fb6d8;margin:.5rem 0 .25rem}
  #wakeph{width:100%;box-sizing:border-box;border:1px solid #3aa8ff88;background:#07163acc;color:#e8f4ff;border-radius:12px;padding:.55rem .7rem;font:inherit;font-size:.9rem;resize:vertical}
  #wakers{margin-top:.4rem;border:1px solid #3aa8ff88;background:#07163acc;color:#cfe9ff;border-radius:10px;padding:.4rem .8rem;font:inherit;font-size:.8rem}
  #jvtoast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 84px);transform:translateX(-50%);z-index:9996;background:#0a2a5af2;color:#fff;border:1px solid #5fd6ffaa;border-radius:999px;padding:.55rem 1.1rem;font-size:.85rem;box-shadow:0 0 22px -6px #1b7dff;opacity:0;pointer-events:none;transition:opacity .25s;max-width:90vw;text-align:center}
  #jvtoast.on{opacity:1}
  #qz{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);transform:translateX(-50%);z-index:9995;display:none;align-items:center;gap:.6rem;background:#0a2a5af2;color:#fff;border:1px solid #5fd6ffaa;border-radius:999px;padding:.4rem .5rem .4rem .9rem;font-size:.8rem;box-shadow:0 0 22px -6px #1b7dff;white-space:nowrap}
  #qz.on{display:flex} #qz button{width:26px;height:26px;border-radius:50%;border:1px solid #6bb8ff88;background:#0a2a5acc;color:#fff;font-size:.75rem;padding:0}
  #wa{position:fixed;inset:0;z-index:9997;background:#000b;display:none;align-items:flex-end;justify-content:center}
  #wa.on{display:flex} #wa .w{width:100%;max-width:480px;background:#050a1cf8;color:#fff;border:1px solid #5fd6ff88;border-radius:20px 20px 0 0;padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:.6rem;box-shadow:0 0 30px -6px #1b7dff}
  #wa h3{margin:0;font-size:1.05rem} #wa p{margin:0;font-size:.82rem;color:#9fb6d8}
  #wa textarea{width:100%;min-height:96px;border:1px solid #3aa8ff88;background:#07163acc;color:#e8f4ff;border-radius:12px;padding:.6rem .7rem;font:inherit;font-size:.95rem;resize:vertical}
  #wa .r{display:flex;gap:.5rem} #wa .r button{flex:1;height:46px;border-radius:12px;border:1px solid #5fd6ff88;background:#0a2a5acc;color:#fff;font:inherit}
  #wa .r button.pri{background:#1fa855;border-color:#25d366}`;
  document.head.append(css);

  const toastEl = el("div"); toastEl.id = "jvtoast"; document.body.append(toastEl);
  let toastT = 0;
  const toast = t => { toastEl.textContent = t; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), 2200); };

  // ---------- what the server needs to know ----------
  const prevState = window.jvExtraState;
  window.jvExtraState = () => {
    const s = prevState ? prevState() : {};
    s.contacts = contacts.slice(0, 80).map(c => ({ id: c.id, name: c.name, num: c.num }));
    if (quiz && quiz.on) s.quiz = quiz;
    return s;
  };

  // ---------- Gallery ----------
  const clean = t => String(t || "").replace(/\nSAY:[\s\S]*$/, "").trim();
  const bubbles = role => [...document.querySelectorAll("#chat .m." + role + ":not(.wait) .b")].map(b => b.textContent.trim()).filter(t => t && t !== "…");
  function addToGallery(text, q, title) {
    text = clean(text).slice(0, 3000); if (!text) { toast("Nothing to save yet"); return false; }
    gallery.push({ id: rid(), text, q: String(q || "").slice(0, 300), title: String(title || "").slice(0, 60), t: Date.now() });
    keepG(); drawGallery(); toast("Saved to Gallery"); return true;
  }
  function lastReply() {
    const b = bubbles("a"); if (b.length) return b[b.length - 1];
    try { const h = (typeof history !== "undefined" ? history : []).filter(x => x.role === "assistant"); return h.length ? clean(h[h.length - 1].content) : ""; } catch (e) { return ""; }
  }
  function fromAction(a) {
    if (a.what === "text") return addToGallery(a.text, "", a.title);
    const reply = lastReply();
    if (a.what === "last_exchange") { const u = bubbles("u"); return addToGallery(reply, u.length > 1 ? u[u.length - 2] : "", a.title); }   // the newest user bubble is the "save it" request itself
    return addToGallery(reply, "", a.title);
  }
  window.jvGallerySave = addToGallery;

  function picture(item) {                                   // draws the message on a picture card and downloads it (it then shows in the phone's gallery)
    const W = 1080, pad = 70, fs = 40, lh = 58, c = document.createElement("canvas"), g = c.getContext("2d");
    const font = fs + "px system-ui,-apple-system,Segoe UI,sans-serif";
    g.font = font;
    const lines = [], maxW = W - pad * 2;
    String((item.q ? "You: " + item.q + "\n\n" : "") + item.text).split("\n").forEach(par => {
      if (!par.trim()) { lines.push(""); return; }
      let cur = "";
      par.split(/\s+/).forEach(w => { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
      if (cur) lines.push(cur);
    });
    const shown = lines.slice(0, 44); if (lines.length > 44) shown.push("…");
    const H = Math.max(700, pad * 2 + 150 + shown.length * lh + 90);
    c.width = W; c.height = H;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b2f7a"); bg.addColorStop(1, "#01040d");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#5fd6ff"; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48);
    g.fillStyle = "#7be0ff"; g.font = "bold 34px system-ui,sans-serif"; g.fillText("JARVIS", pad, pad + 30);
    g.fillStyle = "#e8f4ff"; g.font = font;
    shown.forEach((l, i) => g.fillText(l, pad, pad + 150 + i * lh));
    g.fillStyle = "#8fb4dd"; g.font = "28px system-ui,sans-serif"; g.fillText(when(item.t), pad, H - pad + 10);
    c.toBlob(b => {
      if (!b) { toast("Could not make the picture"); return; }
      const name = "jarvis-" + item.id + ".png", file = new File([b], name, { type: "image/png" });
      const dl = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast("Picture saved to your downloads"); };
      dl();
    }, "image/png");
  }

  function row(label, title, sub, item, onDel) {
    const r = el("div", "row"); r.append(el("div", "rt", label), el("b", "", title));
    if (sub) r.append(el("span", "sj", sub));
    const acts = el("div", "acts");
    const cp = el("button", "", "Copy"); cp.onclick = e => { e.stopPropagation(); navigator.clipboard.writeText(item.text).then(() => toast("Copied")).catch(() => {}); };
    const pc = el("button", "", "Picture"); pc.onclick = e => { e.stopPropagation(); picture(item); };
    const wa = el("button", "", "WhatsApp"); wa.onclick = e => { e.stopPropagation(); waCard({ name: "", num: "", text: item.text }); };
    acts.append(cp, pc, wa); r.append(acts);
    r.onclick = () => r.classList.toggle("open");
    const x = el("button", "x", "✕"); x.setAttribute("aria-label", "Delete"); x.onclick = e => { e.stopPropagation(); onDel(); };
    r.append(x); return r;
  }
  function drawGallery() {
    const page = $("#hp5"); if (!page) return;
    const kids = [];
    const sb = el("button", "wide", "Save Jarvis's last reply"); sb.onclick = () => addToGallery(lastReply(), "", ""); kids.push(sb);
    kids.push(el("h5", "", "SAVED MESSAGES"));
    const gs = gallery.slice().reverse();
    if (!gs.length) kids.push(el("p", "help", "None yet. Say \"save that to my gallery\", or tap Gallery under any answer."));
    gs.forEach(n => kids.push(row("SAVED · " + when(n.t), n.title || n.text.split("\n")[0], n.title ? n.text : (n.text.includes("\n") ? n.text : ""), n, () => { gallery = gallery.filter(x => x.id !== n.id); keepG(); drawGallery(); })));
    kids.push(el("h5", "", "WHATSAPP CONTACTS"));
    const add = el("div", "add"), nm = el("input"), nu = el("input"), ab = el("button", "", "Add");
    nm.placeholder = "Name"; nu.placeholder = "Number"; nu.inputMode = "tel"; nm.autocomplete = nu.autocomplete = "off";
    ab.onclick = () => { const n = nm.value.trim().slice(0, 40), num = nu.value.replace(/[^\d+]/g, ""); if (!n || num.replace(/\D/g, "").length < 7) { toast("Add a name and a number"); return; } upsertContact({ name: n, num: normNum(num) }); };
    add.append(nm, nu, ab); kids.push(add);
    if (!contacts.length) kids.push(el("p", "help", "None. Say \"save contact Mum 0244123456\", then \"WhatsApp Mum I'm on my way\"."));
    contacts.slice().reverse().forEach(c => { const r = el("div", "row"); r.append(el("div", "rt", "CONTACT"), el("b", "", c.name), el("span", "sj", "+" + c.num));
      const x = el("button", "x", "✕"); x.onclick = () => { contacts = contacts.filter(k => k.id !== c.id); keepC(); drawGallery(); }; r.append(x); kids.push(r); });
    page.replaceChildren(...kids);
  }
  // under every answer: a Gallery button next to Copy
  const chatEl = $("#chat");
  if (chatEl) new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (!(n.classList && n.classList.contains("a")) || n.classList.contains("wait")) return;
    const cp = n.querySelector(".cp"), b = n.querySelector(".b"); if (!cp || !b || n.querySelector(".cpw")) return;
    const w = el("div", "cpw"), gb = el("button", "cp", "Gallery");
    gb.onclick = () => { addToGallery(b.textContent, "", ""); gb.textContent = "Saved ✓"; setTimeout(() => gb.textContent = "Gallery", 1500); };
    cp.replaceWith(w); w.append(cp, gb);
  }))).observe(chatEl, { childList: true });

  // ---------- WhatsApp: opens WhatsApp with the message typed. The person taps Send. Nothing is sent by Jarvis. ----------
  const normNum = raw => {
    const s = String(raw || ""); let d = s.replace(/\D/g, "");
    if (/^\s*\+/.test(s)) return d; if (d.startsWith("00")) return d.slice(2); if (d.startsWith("0")) return "233" + d.slice(1); if (d.length <= 9) return "233" + d; return d;
  };
  function upsertContact(c) {
    const i = contacts.findIndex(x => x.id === c.id || x.name.toLowerCase() === String(c.name).toLowerCase());
    const rec = { id: c.id || (i >= 0 ? contacts[i].id : rid()), name: String(c.name).slice(0, 40), num: String(c.num).replace(/\D/g, "").slice(0, 15) };
    if (i >= 0) contacts[i] = rec; else contacts.push(rec);
    keepC(); drawGallery(); toast("Saved contact " + rec.name);
  }
  const waBox = el("div"); waBox.id = "wa";
  waBox.innerHTML = '<div class="w"><h3>WhatsApp message ready</h3><p id="wato"></p><textarea id="watx" aria-label="Message"></textarea><p>Jarvis cannot send it for you. Tap Open WhatsApp, then press Send there.</p><div class="r"><button id="wano">Cancel</button><button class="pri" id="waok">Open WhatsApp</button></div></div>';
  document.body.append(waBox);
  let waNum = "";
  function waCard(a) {
    waNum = String(a.num || "").replace(/\D/g, "");
    $("#wato").textContent = a.name ? "To: " + a.name + (waNum ? " (+" + waNum + ")" : "") : waNum ? "To: +" + waNum : "You will pick who to send it to inside WhatsApp.";
    $("#watx").value = String(a.text || "");
    waBox.classList.add("on");
  }
  $("#wano").onclick = () => waBox.classList.remove("on");
  waBox.onclick = e => { if (e.target === waBox) waBox.classList.remove("on"); };
  $("#waok").onclick = () => {
    const t = $("#watx").value.trim(); if (!t) return;
    window.open("https://wa.me/" + waNum + "?text=" + encodeURIComponent(t), "_blank", "noopener");
    waBox.classList.remove("on");
  };

  // ---------- quiz progress pill ----------
  const qz = el("div"); qz.id = "qz"; qz.innerHTML = '<span></span><button aria-label="Stop quiz">✕</button>'; document.body.append(qz);
  let qzT = 0;
  qz.querySelector("button").onclick = () => { quiz = null; saveJ("jv-quiz", null); qz.classList.remove("on"); toast("Quiz stopped"); };
  function drawQuiz(msg) {
    clearTimeout(qzT);
    if (msg) { qz.querySelector("span").textContent = msg; qz.classList.add("on"); qzT = setTimeout(() => qz.classList.remove("on"), 9000); return; }
    if (quiz && quiz.on) { qz.querySelector("span").textContent = "Quiz: " + quiz.topic + " · " + Math.min(quiz.asked + 1, quiz.total) + "/" + quiz.total + " · score " + quiz.score; qz.classList.add("on"); } else qz.classList.remove("on");
  }
  drawQuiz();

  // ---------- actions from the server ----------
  const prevAct = window.jvExtraActions;
  window.jvExtraActions = list => {
    if (prevAct) prevAct(list);
    (list || []).forEach(a => {
      if (!a) return;
      if (a.action === "gallery_add") fromAction(a);
      else if (a.action === "quiz_set" && a.quiz) { quiz = a.quiz; saveJ("jv-quiz", quiz); drawQuiz(); }
      else if (a.action === "quiz_end") { quiz = null; saveJ("jv-quiz", null); drawQuiz(a.stopped ? "Quiz stopped · score " + a.score + "/" + a.asked : "Quiz done · you scored " + a.score + " out of " + a.total); }
      else if (a.action === "contact_add" && a.contact) upsertContact(a.contact);
      else if (a.action === "whatsapp") waCard(a);
    });
  };
  drawGallery();

  // ---------- wake word: say "Hey Jarvis" ----------
  // Uses the browser's own speech recognition while Jarvis is NOT in a conversation (the phone only lets one thing use the microphone at a time).
  // It works while the app is open on screen. Browsers do not allow always-listening in the background.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const WAKE = /\b(?:hey|hi|hello|ok|okay|yo|hay|hei)[ ,.!]*(?:jarvis|jarvas|jarves|jervis|garvis|jarvus|jarvice|jarvish)\b[ ,.!?]*(.*)$/i;
  let wantWake = lsGet("jv-wake", "0") === "1", rec = null, fired = 0, wakeT = 0, restartT = 0;
  // What Jarvis says after "Hey Jarvis". One phrase per line in Settings; he picks one at random. Empty = he says nothing.
  const WAKE_DEFAULT = ["Yes boss?", "What should I do for you?", "What's on your mind today?"];
  const phrases = () => { const v = lsGet("jv-wakephrases", null); if (v === null) return WAKE_DEFAULT; return v.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 8); };
  const wkKey = t => "jv-wk:" + (typeof voice !== "undefined" ? voice : "") + ":" + t;
  async function wakeAudio(t) {                               // made once with your Jarvis voice, then kept on the phone so the reply is instant
    let a = lsGet(wkKey(t), ""); if (a) return a;
    try { const v = await post("/api/speak", { text: t, voice }); a = v.audio || ""; if (a) { try { localStorage.setItem(wkKey(t), a); } catch (e) {} } } catch (e) {}
    return a;
  }
  const prefetchWake = () => { phrases().forEach(t => wakeAudio(t)); };
  const sayWake = async () => {
    const list = phrases(); if (!list.length) return;
    const t = list[Math.floor(Math.random() * list.length)], a = await wakeAudio(t);
    if (a && inChat() && typeof playClip === "function") playClip(a);
  };
  const inChat = () => { try { return !!on; } catch (e) { return false; } };
  const locked = () => { const l = $("#lock"); return !!(l && !l.hidden); };
  const wakeBtn = $("#wakeb");
  const showWake = () => { if (!wakeBtn) return; wakeBtn.textContent = !SR ? "Wake word: not supported on this browser" : "Wake word “Hey Jarvis”: " + (wantWake ? "On" : "Off"); wakeBtn.disabled = !SR; };
  function stopWake() { clearTimeout(wakeT); clearTimeout(restartT); if (rec) { const r = rec; rec = null; r.onend = r.onerror = r.onresult = null; try { r.abort(); } catch (e) {} } }
  function trigger(rest) {
    if (Date.now() - fired < 3000 || inChat()) return;
    fired = Date.now(); stopWake();
    try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
    const vm = $("#vmb"); if (!vm) return;
    setTimeout(() => {
      vm.click();
      rest = String(rest || "").trim();
      if (rest.split(/\s+/).filter(Boolean).length < 2) {       // only "Hey Jarvis": answer with the wake reply once the mic is open
        let n = 0; const w = setInterval(() => { n++; if (inChat()) { clearInterval(w); sayWake(); } else if (n > 25) clearInterval(w); }, 200);
        return;
      }
      let tries = 0;
      const iv = setInterval(() => {                                 // wait until the microphone is open, then handle the rest of the sentence like a typed message
        tries++;
        if (inChat() || tries > 25) {
          clearInterval(iv);
          if (!inChat()) return;
          const f = $("#tf"), inp = $("#ti"); if (!f || !inp) return;
          inp.value = rest; try { stopRec(); } catch (e) {}
          f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      }, 200);
    }, 350);
  }
  function startWake() {
    if (!SR || !wantWake || rec || inChat() || document.hidden || locked()) return;
    try {
      const r = new SR(); rec = r;
      r.continuous = true; r.interimResults = true; r.lang = "en-US"; r.maxAlternatives = 1;
      r.onresult = ev => {
        let said = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) { said = ev.results[i][0].transcript; const m = WAKE.exec(said) || (ev.results[i].isFinal && /^\s*jarvis[ .!?]*$/i.test(said) ? ["", ""] : null);
          if (!m) continue;
          clearTimeout(wakeT);
          if (ev.results[i].isFinal) return trigger(m[1]);
          wakeT = setTimeout(() => trigger(m[1]), 1100);               // you paused after "Hey Jarvis": go now
          return;
        }
      };
      r.onerror = e => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") { wantWake = false; try { localStorage.setItem("jv-wake", "0"); } catch (x) {} showWake(); toast("Allow the microphone to use the wake word"); }
      };
      r.onend = () => { if (rec === r) { rec = null; clearTimeout(restartT); restartT = setTimeout(startWake, 500); } };
      r.start();
    } catch (e) { rec = null; }
  }
  if (wakeBtn) wakeBtn.onclick = () => {
    wantWake = !wantWake; try { localStorage.setItem("jv-wake", wantWake ? "1" : "0"); } catch (e) {}
    showWake(); if (wantWake) { startWake(); prefetchWake(); toast("Say \"Hey Jarvis\" while the app is open"); } else stopWake();
  };
  if (wakeBtn) {
    const lab = el("div", "wklab", "What Jarvis says after “Hey Jarvis” (one per line, he picks one; leave empty for silence)");
    const ta = el("textarea"); ta.id = "wakeph"; ta.rows = 4; ta.maxLength = 400; ta.value = phrases().join("\n"); ta.setAttribute("aria-label", "Wake reply phrases");
    const rs = el("button", "", "Reset to default"); rs.type = "button"; rs.id = "wakers";
    let tmr = 0;
    const commit = () => { try { localStorage.setItem("jv-wakephrases", ta.value); } catch (e) {} clearTimeout(tmr); tmr = setTimeout(() => { prefetchWake(); toast("Wake reply saved"); }, 900); };
    ta.oninput = commit;
    rs.onclick = () => { try { localStorage.removeItem("jv-wakephrases"); } catch (e) {} ta.value = WAKE_DEFAULT.join("\n"); prefetchWake(); toast("Reset"); };
    wakeBtn.after(lab, ta, rs);
  }
  showWake();
  setInterval(() => { if (!wantWake) return; if (inChat() || document.hidden || locked()) { if (rec) stopWake(); } else if (!rec) startWake(); }, 2000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopWake(); else if (wantWake) setTimeout(startWake, 600); });
  if (wantWake) setTimeout(startWake, 1500);
  window.jvWake = { test: WAKE };
})();
