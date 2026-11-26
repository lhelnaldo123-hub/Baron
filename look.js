// Jarvis "Look": open the camera, snap what you hold up or point at, and Jarvis tells you what it is.
(() => {
  const css = `
  #lk{position:fixed;inset:0;z-index:9999;background:#000;display:none;flex-direction:column;color:#fff;font-family:inherit}
  #lk.on{display:flex}
  #lk video{flex:1;min-height:0;width:100%;object-fit:cover;background:#000}
  #lk .top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:max(env(safe-area-inset-top),12px) 14px 8px;background:linear-gradient(#000a,transparent)}
  #lk .top button,#lk .bar .sm{width:44px;height:44px;border-radius:50%;border:1px solid #fff5;background:#0008;color:#fff;font-size:1.1rem}
  #lk .bar{position:absolute;left:0;right:0;bottom:0;padding:12px 14px max(env(safe-area-inset-bottom),14px);background:linear-gradient(transparent,#000d 35%);display:flex;flex-direction:column;gap:10px}
  #lk .chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
  #lk .chip{flex:none;padding:7px 13px;border-radius:99px;border:1px solid #5fd6ff88;background:#0a2a5acc;color:#cfe9ff;font-size:.82rem}
  #lk .chip.sel{background:#1c6dd0;border-color:#9fe4ff}
  #lk .row2{display:flex;align-items:center;gap:10px}
  #lk input{flex:1;min-width:0;height:44px;border-radius:22px;border:1px solid #fff4;background:#0009;color:#fff;padding:0 16px;font:inherit;font-size:.95rem}
  #lk .snap{flex:none;width:64px;height:64px;border-radius:50%;border:4px solid #fff;background:#ffffff33;position:relative}
  #lk .snap::after{content:"";position:absolute;inset:6px;border-radius:50%;background:#fff}
  #lk .snap:disabled{opacity:.4}
  #lk .cd{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:5rem;font-weight:700;text-shadow:0 2px 12px #000;pointer-events:none}
  #lk .msg{position:absolute;left:0;right:0;top:50%;text-align:center;font-size:1rem;text-shadow:0 1px 8px #000;pointer-events:none}
  #lk .res{position:absolute;left:0;right:0;bottom:0;max-height:68%;display:none;flex-direction:column;gap:10px;padding:14px 16px max(env(safe-area-inset-bottom),14px);background:#07080df2;border-top:1px solid #5fd6ff66;border-radius:18px 18px 0 0}
  #lk .res.on{display:flex}
  #lk .res .tx{overflow-y:auto;white-space:pre-wrap;font-size:.98rem;line-height:1.45;user-select:text;-webkit-user-select:text}
  #lk .res .btns{display:flex;gap:10px}
  #lk .res button{flex:1;height:44px;border-radius:12px;border:1px solid #5fd6ff88;background:#0a2a5acc;color:#fff;font:inherit}
  #lk .res button.pri{background:#1c6dd0}`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);

  const el = document.createElement("div"); el.id = "lk";
  el.innerHTML = `<video playsinline muted autoplay></video>
  <div class="cd"></div><div class="msg"></div>
  <div class="top"><button id="lkx" aria-label="Close camera">✕</button><span><button id="lkt" aria-label="Flashlight">🔦</button> <button id="lkf" aria-label="Flip camera">⟲</button></span></div>
  <div class="bar"><div class="chips">
    <button class="chip" data-q="What is this?">What is this?</button>
    <button class="chip" data-q="Read the question I'm pointing at and explain the answer step by step.">Explain question</button>
    <button class="chip" data-q="Read all the text you can see, exactly as written.">Read text</button>
    <button class="chip" data-q="Translate the text you see into English.">Translate</button></div>
    <div class="row2"><input id="lkq" placeholder="Ask about it (optional)" enterkeyhint="send"><button class="snap" id="lks" aria-label="Take photo"></button></div></div>
  <div class="res"><div class="tx"></div><div class="btns"><button id="lkc">Copy</button><button class="pri" id="lka">Ask again</button><button id="lkd">Close</button></div></div>`;
  document.body.append(el);
  const $ = s => el.querySelector(s), vid = $("video"), q = $("#lkq"), res = $(".res"), msg = $(".msg"), cd = $(".cd"), snap = $("#lks");
  let stream = null, facing = "environment", torch = false, busy = false, timer = null, lastText = "";

  const say = t => { msg.textContent = t || ""; };
  async function start() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      vid.srcObject = stream; await vid.play().catch(() => {});
      say("");
    } catch (e) { say(e && e.name === "NotAllowedError" ? "Camera is blocked. Allow camera for this site in your browser settings." : "Could not open the camera."); }
  }
  function stop() { clearInterval(timer); cd.style.display = "none"; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; torch = false; }
  function close() { stop(); res.classList.remove("on"); el.classList.remove("on"); busy = false; snap.disabled = false; }
  function open(question, auto) {
    el.classList.add("on"); res.classList.remove("on"); busy = false; snap.disabled = false;
    q.value = question || ""; el.querySelectorAll(".chip").forEach(c => c.classList.toggle("sel", c.dataset.q === question));
    start().then(() => { if (auto && stream) countdown(3); });
  }
  function countdown(n) {
    clearInterval(timer); cd.style.display = "flex"; cd.textContent = n;
    timer = setInterval(() => { n--; if (n <= 0) { clearInterval(timer); cd.style.display = "none"; shoot(); } else cd.textContent = n; }, 1000);
  }
  function frame() {
    const w = vid.videoWidth, h = vid.videoHeight; if (!w || !h) return "";
    const k = Math.min(1, 1280 / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  }
  async function shoot() {
    if (busy) return; clearInterval(timer); cd.style.display = "none";
    const image = frame(); if (!image) { say("Camera is not ready yet."); return; }
    busy = true; snap.disabled = true; say("Looking…");
    const question = q.value.trim();
    try {
      const post = window.jvPost; if (!post) throw new Error("Not ready. Reload the app.");
      const lang = (document.querySelector("#lsel") || {}).selectedOptions;
      const d = await post("/api/look", { image, question, langName: lang && lang[0] ? lang[0].text : "" });
      lastText = d.reply || "I couldn't tell."; say("");
      $(".tx").textContent = lastText; res.classList.add("on");
      if (window.jvLookShow) window.jvLookShow(question || "What is this?", lastText);
      if (window.jvSpeak) window.jvSpeak(d.say || lastText.slice(0, 200));
    } catch (e) { say("Error: " + e.message); }
    busy = false; snap.disabled = false;
  }

  snap.onclick = shoot;
  q.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); shoot(); } };
  $("#lkx").onclick = $("#lkd").onclick = close;
  $("#lka").onclick = () => { res.classList.remove("on"); say(""); q.value = ""; el.querySelectorAll(".chip").forEach(c => c.classList.remove("sel")); };
  $("#lkc").onclick = e => navigator.clipboard.writeText(lastText).then(() => { e.target.textContent = "Copied"; setTimeout(() => e.target.textContent = "Copy", 1500); }).catch(() => {});
  $("#lkf").onclick = () => { facing = facing === "environment" ? "user" : "environment"; start(); };
  $("#lkt").onclick = async () => {
    const t = stream && stream.getVideoTracks()[0]; if (!t) return;
    try { torch = !torch; await t.applyConstraints({ advanced: [{ torch }] }); } catch (e) { torch = false; say("Flashlight is not available on this camera."); setTimeout(() => say(""), 2000); }
  };
  el.querySelectorAll(".chip").forEach(c => c.onclick = () => { q.value = c.dataset.q; el.querySelectorAll(".chip").forEach(x => x.classList.toggle("sel", x === c)); });

  // Header button
  const hr = document.querySelector("header .hr");
  if (hr) {
    const b = document.createElement("button"); b.className = "ib"; b.id = "lookb"; b.setAttribute("aria-label", "Look with camera");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
    b.onclick = () => { if (window.jvPrime) window.jvPrime(); open("", false); };
    hr.prepend(b);
  }
  // Voice-mode screen hides the header, so put a camera button in its top bar too
  const vb = document.querySelector(".vmbar"), vs = document.querySelector("#vset");
  if (vb && vs) {
    const b = document.createElement("button"); b.className = "ib"; b.setAttribute("aria-label", "Look with camera");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
    b.onclick = () => { if (window.jvPrime) window.jvPrime(); open("", false); };
    vb.insertBefore(b, vs);
  }

  // ---- Pictures pop-up: "show me a picture of a lion" searches Wikimedia (free, no key) and shows the photos ----
  const ps = document.createElement("style");
  ps.textContent = `#pk{position:fixed;inset:0;z-index:9998;background:#000c;display:none;align-items:center;justify-content:center;padding:14px}
  #pk.on{display:flex}
  #pk .w{width:100%;max-width:520px;max-height:86dvh;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;border:1px solid #5fd6ff88;background:#050a1cf8;color:#fff;box-shadow:0 0 30px -6px #1b7dff}
  #pk .h{display:flex;justify-content:space-between;align-items:center;font-size:.95rem}
  #pk .h button{width:36px;height:36px;border-radius:50%;border:1px solid #6bb8ff88;background:#0a2a5acc;color:#fff;font-size:1rem}
  #pk .g{overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  #pk .g img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#0a2a5a}
  #pk .g img.big{grid-column:1/-1;aspect-ratio:auto;max-height:60dvh;object-fit:contain}
  #pk .n{font-size:.8rem;color:#9fb6d8;text-align:center}`;
  document.head.append(ps);
  const pk = document.createElement("div"); pk.id = "pk";
  pk.innerHTML = '<div class="w"><div class="h"><b id="pkt"></b><button id="pkx" aria-label="Close">✕</button></div><div class="g"></div><div class="n"></div></div>';
  document.body.append(pk);
  const pg = pk.querySelector(".g"), pn = pk.querySelector(".n"), pt = pk.querySelector("#pkt");
  pk.querySelector("#pkx").onclick = () => pk.classList.remove("on");
  pk.onclick = e => { if (e.target === pk) pk.classList.remove("on"); };
  async function pics(query) {
    pt.textContent = query; pg.replaceChildren(); pn.textContent = "Searching…"; pk.classList.add("on");
    const urls = [];
    try {   // main picture of the matching Wikipedia article first
      const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(query.trim().replace(/ /g, "_")) + "?redirect=true");
      if (r.ok) { const j = await r.json(); const u = j.originalimage && j.originalimage.source || j.thumbnail && j.thumbnail.source; if (u && j.type === "standard") urls.push(j.thumbnail && j.thumbnail.source || u); }
    } catch (e) {}
    try {
      const r = await fetch("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=14&prop=imageinfo&iiprop=url|mime&iiurlwidth=600&format=json&origin=*&gsrsearch=" + encodeURIComponent("filetype:bitmap " + query));
      const j = await r.json();
      Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).forEach(p => {
        const i = p.imageinfo && p.imageinfo[0];
        if (i && /^image\/(jpeg|png)$/.test(i.mime) && i.thumburl && !urls.includes(i.thumburl)) urls.push(i.thumburl);
      });
    } catch (e) {}
    if (!urls.length) { pn.textContent = "I could not find pictures for that. Check your internet and try again."; return; }
    urls.slice(0, 8).forEach(u => {
      const im = new Image(); im.src = u; im.loading = "lazy"; im.alt = query;
      im.onerror = () => im.remove(); im.onclick = () => im.classList.toggle("big");
      pg.append(im);
    });
    pn.textContent = "Tap a picture to enlarge. Images from Wikipedia / Wikimedia Commons.";
  }
  // Voice: "what is this?" / "check this for me" makes Jarvis open the camera and snap after 3 seconds.
  window.jvLookActions = list => (list || []).forEach(a => { if (!a) return; if (a.action === "look") open(a.question || "", true); else if (a.action === "pics" && a.query) pics(a.query); });
  window.Look = { open, close, pics };
})();
