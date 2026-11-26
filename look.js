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
    <button class="chip" data-q="Solve this homework question step by step and show the final answer.">Solve step by step</button>
    <button class="chip" data-q="Check my written answer to this question. Say if it is right and explain any mistake.">Check my answer</button>
    <button class="chip" data-q="Read all the text you can see, exactly as written.">Read text</button>
    <button class="chip" data-q="Translate the text you see into English.">Translate</button></div>
    <div class="row2"><input id="lkq" placeholder="Ask about it (optional)" enterkeyhint="send"><button class="snap" id="lks" aria-label="Take photo"></button></div></div>
  <div class="res"><div class="tx"></div><div class="btns"><button id="lkr">Stop</button><button id="lkc">Copy</button><button id="lks2">Save</button><button class="pri" id="lka">Ask again</button><button id="lkd">Close</button></div></div>`;
  document.body.append(el);
  const $ = s => el.querySelector(s), vid = $("video"), q = $("#lkq"), res = $(".res"), msg = $(".msg"), cd = $(".cd"), snap = $("#lks");
  let stream = null, facing = "environment", torch = false, busy = false, timer = null, lastText = "", lastQ = "";

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
      lastText = d.reply || "I couldn't tell."; lastQ = question || "What is this?"; say("");
      $(".tx").textContent = lastText; res.classList.add("on");
      if (window.jvLookShow) window.jvLookShow(question || "What is this?", lastText);
      readOut();
    } catch (e) { say("Error: " + e.message); }
    busy = false; snap.disabled = false;
  }

  const rb = $("#lkr");                    // reads the WHOLE answer, and only stops when you say stop, tap the orb or press Stop
  const readOut = () => { if (!window.jvRead) return; rb.textContent = "Stop"; window.jvRead(lastText).finally(() => { if (!(window.jvReading && window.jvReading())) rb.textContent = "Read"; }); };
  rb.onclick = () => { if (window.jvReading && window.jvReading()) { window.jvStopRead(); rb.textContent = "Read"; } else readOut(); };
  snap.onclick = shoot;
  q.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); shoot(); } };
  $("#lkx").onclick = $("#lkd").onclick = close;
  $("#lka").onclick = () => { if (window.jvStopRead) window.jvStopRead(); res.classList.remove("on"); say(""); q.value = ""; el.querySelectorAll(".chip").forEach(c => c.classList.remove("sel")); };
  $("#lkc").onclick = e => navigator.clipboard.writeText(lastText).then(() => { e.target.textContent = "Copied"; setTimeout(() => e.target.textContent = "Copy", 1500); }).catch(() => {});
  $("#lks2").onclick = e => { if (!lastText || !window.jvSaveHomework) return; window.jvSaveHomework(lastQ, lastText); e.target.textContent = "Saved ✓"; setTimeout(() => e.target.textContent = "Save", 1800); };
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
  window.jvLookActions = list => (list || []).forEach(a => { if (!a) return; if (a.action === "look") open(a.question || "", true); else if (a.action === "pics" && a.query) pics(a.query); else if (a.action === "sound" && a.sound) window.jvSound(a.sound, a.count); });

  // ---- Animal sounds made right on the phone (no internet needed): dog, cat, rooster, cow, lion, wolf, duck, bird, sheep ----
  let sfxCtx = null;
  function sfxOut() {                                          // use Jarvis's own sound engine when it is running, so the voice volume applies
    let c = null, out = null;
    try { if (typeof ctx !== "undefined" && ctx) { c = ctx; out = typeof gainNode !== "undefined" && gainNode ? gainNode : ctx.destination; } } catch (e) {}
    if (!c) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; sfxCtx = sfxCtx || new AC(); c = sfxCtx; out = c.destination; }
    if (c.state !== "running") c.resume().catch(() => {});
    return { c, out };
  }
  // one animal call: a pitch line through a few "mouth" filters, plus a little breath noise
  function call(o, t0, p) {
    const { c, out } = o, dur = p.dur, g = c.createGain(), mix = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(p.gain || 0.7, t0 + (p.attack || 0.012));
    if (p.hold) g.gain.setValueAtTime(p.gain || 0.7, t0 + p.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const osc = c.createOscillator(); osc.type = p.type || "sawtooth";
    osc.frequency.setValueAtTime(p.pts[0][1], t0);
    p.pts.slice(1).forEach(q => osc.frequency.linearRampToValueAtTime(q[1], t0 + q[0]));
    let lfo = null;
    if (p.vib) { lfo = c.createOscillator(); const d = c.createGain(); lfo.frequency.value = p.vibHz || 6; d.gain.value = p.vib; lfo.connect(d); d.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.05); }
    (p.formants || [[700, 5], [1300, 5]]).forEach(f => {
      const b = c.createBiquadFilter(); b.type = "bandpass"; b.Q.value = f[1] || 5;
      b.frequency.setValueAtTime(f[0], t0); if (f[2]) b.frequency.linearRampToValueAtTime(f[2], t0 + dur * 0.5); if (f[3]) b.frequency.linearRampToValueAtTime(f[3], t0 + dur);
      osc.connect(b); b.connect(mix);
    });
    mix.gain.value = 2.2; mix.connect(g);
    if (p.noise) {
      const n = c.createBufferSource(), len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = buf; const nf = c.createBiquadFilter(); nf.type = p.noiseType || "bandpass"; nf.frequency.value = p.noiseF || 1500; nf.Q.value = 0.8;
      const ng = c.createGain(); ng.gain.setValueAtTime(p.noise, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (p.noiseLen || 0.5));
      n.connect(nf); nf.connect(ng); ng.connect(g); n.start(t0); n.stop(t0 + dur);
    }
    g.connect(out); osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  const SOUNDS = {
    dog:     { n: 3, gap: 0.34, p: i => ({ dur: 0.22, gain: 0.85, pts: [[0, 560 - i * 30], [0.04, 460 - i * 30], [0.2, 230]], formants: [[650, 5], [1300, 6]], noise: 0.5, noiseF: 1800, noiseLen: 0.35 }) },
    cat:     { n: 1, gap: 1.1, p: () => ({ dur: 0.95, gain: 0.55, attack: 0.08, pts: [[0, 430], [0.18, 640], [0.5, 880], [0.95, 430]], formants: [[800, 6, 1900, 900], [2300, 8, 2900, 2200]], vib: 6, vibHz: 7 }) },
    rooster: { n: 1, gap: 2, p: () => ({ dur: 1.9, gain: 0.55, attack: 0.03, hold: 1.2, pts: [[0, 520], [0.25, 940], [0.3, 760], [0.55, 1000], [0.6, 820], [0.95, 1050], [1.4, 900], [1.9, 560]], formants: [[1000, 6], [2300, 7]], vib: 14, vibHz: 18 }) },
    cow:     { n: 1, gap: 1.8, p: () => ({ dur: 1.7, gain: 0.6, attack: 0.15, hold: 1.0, pts: [[0, 150], [0.5, 138], [1.7, 108]], formants: [[420, 5], [850, 5]], vib: 4, vibHz: 5 }) },
    lion:    { n: 1, gap: 2.8, p: () => ({ dur: 2.6, gain: 0.85, attack: 0.25, hold: 1.2, pts: [[0, 110], [1.2, 78], [2.6, 48]], formants: [[300, 3], [650, 3]], vib: 22, vibHz: 24, noise: 0.45, noiseType: "lowpass", noiseF: 900, noiseLen: 1.0 }) },
    wolf:    { n: 1, gap: 3, p: () => ({ dur: 2.9, gain: 0.55, attack: 0.3, hold: 1.8, type: "triangle", pts: [[0, 290], [0.6, 560], [1.8, 650], [2.9, 430]], formants: [[600, 6], [1150, 6]], vib: 10, vibHz: 5.5 }) },
    duck:    { n: 2, gap: 0.3, p: () => ({ dur: 0.17, gain: 0.8, pts: [[0, 400], [0.17, 290]], formants: [[950, 6], [1900, 6]], noise: 0.25, noiseF: 2500 }) },
    bird:    { n: 6, gap: 0.16, p: i => { const b = 2300 + (i * 389) % 900; return { dur: 0.12, gain: 0.35, type: "sine", pts: [[0, b], [0.05, b + 1200], [0.12, b + 300]], formants: [[3000, 1]] }; } },
    sheep:   { n: 2, gap: 0.8, p: () => ({ dur: 0.7, gain: 0.6, attack: 0.04, hold: 0.4, pts: [[0, 420], [0.4, 380], [0.7, 330]], formants: [[700, 5], [1350, 5]], vib: 45, vibHz: 28 }) },
  };
  window.jvSound = (name, count) => {
    const S = SOUNDS[name], o = S && sfxOut(); if (!o) return false;
    const n = Math.max(1, Math.min(5, count || S.n)), t = o.c.currentTime + 0.05;
    for (let i = 0; i < n; i++) call(o, t + i * S.gap, S.p(i));
    return true;
  };
  const ANIMALS = { dog: /\b(dog|puppy|bark\w*|woof|bow ?wow)\b/, cat: /\b(cat|kitten|meow\w*|miaow)\b/, rooster: /\b(rooster|cockerel|cock ?a ?doodle\w*)\b/, cow: /\b(cow|moo\w*)\b/, lion: /\b(lion|tiger|roar\w*)\b/, wolf: /\b(wolf|howl\w*)\b/, duck: /\b(duck|quack\w*)\b/, bird: /\b(bird|chirp\w*|tweet\w*)\b/, sheep: /\b(sheep|goat|baa+)\b/ };
  const SOUNDY = /\b(bark\w*|meow\w*|moo\w*|roar\w*|howl\w*|quack\w*|chirp\w*|tweet\w*|woof|baa+|cock ?a ?doodle\w*|sound|noise|impression|imitate|impersonate|act like|like an?)\b/i;
  const soundCommand = text => {
    const t = String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!t || t.split(" ").length > 10 || !SOUNDY.test(t)) return false;
    const name = Object.keys(ANIMALS).find(k => ANIMALS[k].test(t)); if (!name) return false;
    const count = /\b(twice|two)\b/.test(t) ? 2 : /\b(three|thrice|few)\b/.test(t) ? 3 : /\b(four)\b/.test(t) ? 4 : /\b(five|many|lots)\b/.test(t) ? 5 : 0;
    return window.jvSound(name, count);
  };
  // Plain spoken or typed requests open the camera straight away (no AI needed, so no rate limit):
  // "what is this", "look at this", "check this for me", "open the camera", "read this", "solve this"...
  const LOOK = /\b(what('?s| is| are) (this|that|these|those)|what do you see|what can you see|look at (this|that)|check (this|that)( out)?( for me)?|open (the |your |my )?camera|use (the |your |my )?camera|(read|scan|identify|solve|translate) (this|that)|explain (this|that)( question| problem)?)\b/i;
  window.jvLookCommand = text => {
    text = String(text || "").trim();
    if (soundCommand(text)) return true;             // "bark like a dog", "meow", "roar like a lion"
    if (!text || text.split(/\s+/).length > 7 || !LOOK.test(text)) return false;
    const generic = /^(hey |ok |okay )?(jarvis[, ]*)?(please )?(can you )?(what('?s| is| are) (this|that|these|those)|what do you see|what can you see|look at (this|that)|check (this|that)( out)?( for me)?|open (the |your |my )?camera|use (the |your |my )?camera)[?.! ]*$/i.test(text);
    if (window.jvPrime) window.jvPrime();
    open(generic ? "" : text, true);
    return true;
  };
  window.Look = { open, close, pics };
})();
