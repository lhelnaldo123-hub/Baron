// Jarvis Body Scan: a real pulse check (fingertip on the camera) and a real cough listener (microphone).
// Everything runs on the phone. Nothing is recorded or uploaded. This is a wellness helper, not a medical device.
(() => {
  "use strict";
  if (window.Body) return;

  const AV = "0.10.14";
  const ACDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@" + AV;
  const YAMNET = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite";
  const MEASURE_MS = 30000;

  // ---------- signal maths (pure, testable) ----------
  function resample(samples, hz) {
    if (samples.length < 10) return [];
    const t0 = samples[0].t, t1 = samples[samples.length - 1].t, n = Math.floor((t1 - t0) / 1000 * hz), out = new Array(Math.max(0, n));
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 1000 / hz;
      while (j < samples.length - 2 && samples[j + 1].t < t) j++;
      const a = samples[j], b = samples[j + 1], f = Math.min(1, Math.max(0, (t - a.t) / ((b.t - a.t) || 1)));
      out[i] = a.v + (b.v - a.v) * f;
    }
    return out;
  }
  function movavg(x, w) {
    const n = x.length, pre = new Array(n + 1).fill(0), out = new Array(n), h = Math.max(1, Math.floor(w / 2));
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); out[i] = (pre[b] - pre[a]) / (b - a); }
    return out;
  }
  function clean(x, hz) {
    const base = movavg(x, Math.round(hz * 0.9));
    return movavg(x.map((v, i) => v - base[i]), Math.max(1, Math.round(hz / 8)));
  }
  const median = a => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quant = (a, q) => { const s = [...a].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  function estimate(samples, hz = 30) {
    const x = resample(samples, hz);
    if (x.length < hz * 8) return null;
    const y = clean(x, hz), n = y.length;
    const mean = y.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    if (!(sd > 1e-6)) return null;
    const minGap = Math.round(hz * 0.33), peaks = [];
    for (let i = Math.round(hz / 2); i < n - Math.round(hz / 2); i++) {
      if (y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > 0.25 * sd) {
        const last = peaks.length ? peaks[peaks.length - 1] : -1e9;
        if (i - last < minGap) { if (y[i] > y[last]) peaks[peaks.length - 1] = i; } else peaks.push(i);
      }
    }
    const iv = [];
    for (let i = 1; i < peaks.length; i++) { const ms = (peaks[i] - peaks[i - 1]) * 1000 / hz; if (ms >= 333 && ms <= 1500) iv.push(ms); }
    if (iv.length < 5) return null;
    const med = median(iv), spread = (quant(iv, 0.75) - quant(iv, 0.25)) / med;
    return { bpm: Math.round(60000 / med), quality: spread < 0.12 ? "good" : spread < 0.25 ? "fair" : "poor", wave: y };
  }

  // ---------- UI ----------
  const CSS = `
#bz{position:fixed;inset:0;z-index:45;overflow-y:auto;background:#04080c;color:#d8f3ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
 background-image:linear-gradient(#14d3c514 1px,transparent 1px),linear-gradient(90deg,#14d3c514 1px,transparent 1px);background-size:28px 28px;
 padding:calc(env(safe-area-inset-top) + .6rem) 1rem calc(env(safe-area-inset-bottom) + 1.2rem)}
#bz[hidden]{display:none}
#bz button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bz-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem}
.bz-top b{letter-spacing:.25em;font-size:.8rem;color:#19d3c5}
.bz-x{width:40px;height:40px;border-radius:50%;border:1px solid #19d3c577;background:#06121a;display:grid;place-items:center;padding:0}
.bz-x svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
#bz canvas{width:100%;height:150px;display:block;border:1px solid #19d3c544;border-radius:14px;background:#050d13}
.bz-big{text-align:center;margin:.6rem 0 .1rem;font-size:3.2rem;font-weight:300;line-height:1;color:#7be0ff;text-shadow:0 0 22px #19d3c5}
.bz-big small{font-size:.9rem;letter-spacing:.2em;color:#19d3c5;margin-left:.4rem}
.bz-sub{text-align:center;font-size:.72rem;letter-spacing:.16em;color:#98a0c0;min-height:1.2em}
.bz-hint{text-align:center;font-size:.9rem;line-height:1.4;margin:.5rem 0;min-height:2.6em}
.bz-row{display:flex;gap:.5rem;margin:.5rem 0}
.bz-row button{flex:1;border:1px solid #19d3c588;background:#08202b;border-radius:12px;padding:.7rem .4rem;font-size:.78rem;letter-spacing:.06em}
.bz-row button.on{background:#19d3c5;color:#04080c}
.bz-tiles{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.6rem}
.bz-t{border:1px solid #19d3c533;border-radius:12px;padding:.55rem .7rem;background:#06121acc}
.bz-t span{display:block;font-size:.62rem;letter-spacing:.18em;color:#98a0c0}
.bz-t b{display:block;font-size:1rem;margin-top:.15rem;font-weight:500}
.bz-t.off b{color:#5d6784;font-size:.78rem;font-weight:400}
.bz-ask{display:none;border:1px solid #ff8a3d;border-radius:14px;background:#2a1608;padding:.8rem;margin:.6rem 0}
.bz-ask.on{display:block}
.bz-ask p{margin:0 0 .6rem;font-size:.95rem}
.bz-ask div{display:flex;gap:.4rem;flex-wrap:wrap}
.bz-ask button{flex:1;min-width:7rem;border:1px solid #ff8a3d;background:#3a1d0a;border-radius:10px;padding:.55rem;font-size:.8rem}
.bz-note{font-size:.68rem;color:#6f7aa0;text-align:center;margin-top:.9rem;line-height:1.4}
`;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

  let root, cv, g, bigEl, subEl, hintEl, btnPulse, btnCough, btnBreath, btnTell, askEl, askTxt, tHeart, tCough, tBreath;
  let video, off, og, stream, torch = false;
  let run = 0, raf = 0, W = 300, H = 150, dpr = 1, last = 0;
  let phase = "idle", samples = [], fingerOn = false, fingerSince = 0, lastFingerAt = 0, lastVT = -1, ests = [], bpmNow = 0, qual = "", finalBpm = 0, wave = [], lastCalc = 0, lastWave = 0;
  let aCtx, aStream, aProc, classifier, coughOn = false, coughs = 0, lastAsk = 0, abuf = [], alen = 0, audioMod, audioFiles;
  let breathing = false, breathT0 = 0;

  function build() {
    if (root) return;
    const st = el("style"); st.textContent = CSS; document.head.append(st);
    root = el("div"); root.id = "bz"; root.hidden = true;
    const top = el("div", "bz-top"); top.append(el("b", "", "BODY SCAN"));
    const x = el("button", "bz-x"); x.setAttribute("aria-label", "Close"); x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'; x.onclick = close; top.append(x);
    cv = el("canvas"); g = cv.getContext("2d");
    bigEl = el("div", "bz-big"); subEl = el("div", "bz-sub", "HEART RATE · PHONE ESTIMATE");
    hintEl = el("div", "bz-hint", "Tap Pulse check, then cover the back camera with your fingertip.");
    btnPulse = el("button", "", "Pulse check"); btnPulse.onclick = togglePulse;
    btnCough = el("button", "", "Cough listener: OFF"); btnCough.onclick = toggleCough;
    btnBreath = el("button", "", "Breathe"); btnBreath.onclick = toggleBreath;
    const row = el("div", "bz-row"); row.append(btnPulse, btnCough, btnBreath);
    btnTell = el("button", "", "Tell Jarvis"); btnTell.style.cssText = "display:none;width:100%;border:1px solid #19d3c5;background:#0a2d3a;border-radius:12px;padding:.7rem;margin-bottom:.4rem";
    btnTell.onclick = tell;
    askEl = el("div", "bz-ask"); askTxt = el("p", "", "That sounded like a cough. What's wrong, boss?");
    const ab = el("div");
    const a1 = el("button", "", "Run pulse check"), a2 = el("button", "", "Tell Jarvis"), a3 = el("button", "", "I'm fine");
    a1.onclick = () => { askEl.classList.remove("on"); if (phase === "idle" || phase === "done") togglePulse(); };
    a2.onclick = () => { askEl.classList.remove("on"); send("I just coughed and I want to tell you how I feel."); };
    a3.onclick = () => askEl.classList.remove("on");
    ab.append(a1, a2, a3); askEl.append(askTxt, ab);
    const tiles = el("div", "bz-tiles");
    const tile = (name, val, off) => { const t = el("div", "bz-t" + (off ? " off" : "")); t.append(el("span", "", name)); const b = el("b", "", val); t.append(b); tiles.append(t); return b; };
    tHeart = tile("HEART RATE", "—"); tCough = tile("COUGHS HEARD", "listener off"); tBreath = tile("BREATHING", "guide off");
    tile("BLOOD PRESSURE", "needs a cuff", true); tile("OXYGEN", "needs an oximeter", true); tile("TEMPERATURE", "needs a thermometer", true);
    const note = el("div", "bz-note", "Wellness estimates from your phone, not a medical device and not a diagnosis. If you feel unwell, have chest pain or trouble breathing, get medical help.");
    root.append(top, cv, bigEl, subEl, hintEl, row, btnTell, askEl, tiles, note);
    video = el("video"); video.setAttribute("playsinline", ""); video.muted = true;
    off = document.createElement("canvas"); off.width = off.height = 24; og = off.getContext("2d", { willReadFrequently: true });
    document.body.append(root);
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden && root && !root.hidden) close(); });
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth || 300; H = cv.clientHeight || 150;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const hint = t => { hintEl.textContent = t; };
  const send = text => { close(); if (window.jvSend) window.jvSend(text); };
  const say = t => { if (window.jvSpeak) window.jvSpeak(t); else if (window.jvSay) window.jvSay(t); };

  function open() {
    build(); root.hidden = false; run++; resize();
    document.body.style.overflow = "hidden";
    phase = "idle"; bigEl.replaceChildren(); btnTell.style.display = "none";
    if (window.jvPrime) window.jvPrime();
    cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(loop);
  }
  function close() {
    run++; cancelAnimationFrame(raf); raf = 0;
    stopCam(); stopCough(); breathing = false;
    phase = "idle"; if (root) root.hidden = true;
    document.body.style.overflow = "";
  }

  // ---------- pulse ----------
  function stopCam() {
    if (stream) { try { const tr = stream.getVideoTracks()[0]; if (torch) tr.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {}); } catch (e) {} stream.getTracks().forEach(t => t.stop()); }
    stream = null; torch = false; if (video) video.srcObject = null;
  }
  function togglePulse() {
    if (phase === "starting" || phase === "measuring") { stopCam(); phase = "idle"; btnPulse.textContent = "Pulse check"; btnPulse.classList.remove("on"); hint("Stopped."); return; }
    startPulse();
  }
  async function startPulse() {
    const my = run; phase = "starting"; btnPulse.textContent = "Stop"; btnPulse.classList.add("on"); btnTell.style.display = "none";
    hint("Starting camera…"); bigEl.replaceChildren(); wave = []; samples = []; ests = []; bpmNow = 0; finalBpm = 0; fingerOn = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } }, audio: false });
      if (my !== run) { stopCam(); return; }
      video.srcObject = stream; await video.play();
      try { const tr = stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {}; if (caps.torch) { await tr.applyConstraints({ advanced: [{ torch: true }] }); torch = true; } } catch (e) { torch = false; }
      phase = "measuring";
      hint(torch ? "Cover the camera AND the flash with your fingertip. Press lightly and hold still." : "Cover the back camera with your fingertip in bright light and hold still. (This phone won't let a web page turn on the flash, so the reading may be rougher.)");
    } catch (e) {
      phase = "idle"; btnPulse.textContent = "Pulse check"; btnPulse.classList.remove("on");
      hint(e && e.name === "NotAllowedError" ? "Camera blocked. Allow camera access and try again." : "Could not start the camera.");
    }
  }
  function sampleFrame(now) {
    if (!video || video.readyState < 2 || video.currentTime === lastVT) return;
    lastVT = video.currentTime;
    og.drawImage(video, 0, 0, 24, 24);
    const d = og.getImageData(0, 0, 24, 24).data; let r = 0, gg = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    r /= n; gg /= n; b /= n;
    const finger = r > 90 && r > gg * 1.25 && r > b * 1.25;
    if (finger) {
      lastFingerAt = now;
      if (!fingerOn) { fingerOn = true; fingerSince = now; samples = []; ests = []; wave = []; hint("Got it. Hold still…"); }
      samples.push({ t: now, v: -r });
      if (samples.length > 900) samples.shift();
    } else if (fingerOn && now - lastFingerAt > 1000) {
      fingerOn = false; samples = []; wave = []; bpmNow = 0; bigEl.replaceChildren(); hint("Lost your finger. Cover the camera again.");
    }
  }
  function calc(now) {
    if (now - lastWave > 150 && samples.length > 90) {
      lastWave = now;
      const w = clean(resample(samples.filter(s => now - s.t < 8000), 30), 30); wave = w.slice(-180);
    }
    if (now - lastCalc > 1000 && samples.length > 240) {
      lastCalc = now;
      const e = estimate(samples.filter(s => now - s.t < 15000));
      if (e) {
        ests.push(e.bpm); if (ests.length > 20) ests.shift(); qual = e.quality;
        bpmNow = Math.round(median(ests.slice(-5)));
        bigEl.replaceChildren(document.createTextNode(String(bpmNow)), el("small", "", "BPM"));
        subEl.textContent = "READING · SIGNAL " + qual.toUpperCase();
      }
    }
    if (fingerOn && now - fingerSince >= MEASURE_MS) finish();
  }
  function finish() {
    stopCam(); phase = "done"; btnPulse.textContent = "Pulse check"; btnPulse.classList.remove("on");
    if (ests.length >= 5) {
      finalBpm = Math.round(median(ests.slice(-15)));
      bigEl.replaceChildren(document.createTextNode(String(finalBpm)), el("small", "", "BPM"));
      subEl.textContent = "RESULT · SIGNAL " + qual.toUpperCase();
      tHeart.textContent = finalBpm + " bpm";
      const note = finalBpm < 60 ? "That's on the low side of the usual resting range of 60 to 100. Normal for some fit people, but tell a nurse or doctor if you feel dizzy or faint."
        : finalBpm <= 100 ? "That's within the usual resting range of 60 to 100."
        : "That's above the usual resting range of 60 to 100. Being active, nervous, or having caffeine can do that. Rest 5 minutes and try again.";
      hint(note + (qual === "poor" ? " The signal was noisy, so treat it as rough." : ""));
      btnTell.style.display = "block";
      say("Your pulse is about " + finalBpm + " beats per minute.");
    } else {
      subEl.textContent = "NO CLEAR READING"; hint("I couldn't get a clear pulse. Press lighter, keep still, and try again in good light.");
    }
  }
  function tell() {
    send("My pulse check on my phone just read about " + finalBpm + " beats per minute. Please check on me and ask how I'm feeling.");
  }

  // ---------- cough listener ----------
  async function toggleCough() {
    if (coughOn) { stopCough(); hint("Cough listener is off."); return; }
    btnCough.textContent = "Loading…";
    const my = run;
    try {
      if (!audioMod) {
        try { audioMod = await import(ACDN + "/audio_bundle.mjs"); } catch (e) { audioMod = await import(ACDN + "/+esm"); }
      }
      if (!audioFiles) audioFiles = await audioMod.FilesetResolver.forAudioTasks(ACDN + "/wasm");
      if (!classifier) classifier = await audioMod.AudioClassifier.createFromOptions(audioFiles, { baseOptions: { modelAssetPath: YAMNET }, maxResults: 6 });
      if (my !== run) return;
      aStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      aCtx = new (window.AudioContext || window.webkitAudioContext)(); await aCtx.resume();
      const src = aCtx.createMediaStreamSource(aStream);
      aProc = aCtx.createScriptProcessor(4096, 1, 1); abuf = []; alen = 0;
      aProc.onaudioprocess = e => {
        const d = e.inputBuffer.getChannelData(0); abuf.push(new Float32Array(d)); alen += d.length;
        if (alen >= aCtx.sampleRate) { const all = new Float32Array(alen); let o = 0; for (const c of abuf) { all.set(c, o); o += c.length; } abuf = []; alen = 0; hear(all); }
      };
      const mute = aCtx.createGain(); mute.gain.value = 0; src.connect(aProc); aProc.connect(mute); mute.connect(aCtx.destination);
      coughOn = true; btnCough.textContent = "Cough listener: ON"; btnCough.classList.add("on"); tCough.textContent = String(coughs);
      hint("Listening for coughs on this phone only. Keep this screen open.");
    } catch (e) {
      stopCough(); hint(e && e.name === "NotAllowedError" ? "Microphone blocked. Allow mic access and try again." : "Could not start the cough listener.");
    }
  }
  function stopCough() {
    coughOn = false;
    try { aProc && (aProc.onaudioprocess = null, aProc.disconnect()); } catch (e) {}
    try { aStream && aStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { aCtx && aCtx.close(); } catch (e) {}
    aProc = aStream = aCtx = null;
    if (btnCough) { btnCough.textContent = "Cough listener: OFF"; btnCough.classList.remove("on"); tCough.textContent = "listener off"; }
  }
  function hear(samples) {
    if (!coughOn || !classifier) return;
    let res; try { res = classifier.classify(samples, aCtx.sampleRate); } catch (e) { return; }
    const cats = (res && res[0] && res[0].classifications && res[0].classifications[0] && res[0].classifications[0].categories) || [];
    const c = cats.find(x => x.categoryName === "Cough");
    if (c && c.score >= 0.35) onCough();
  }
  function onCough() {
    coughs++; tCough.textContent = String(coughs);
    const now = Date.now();
    if (now - lastAsk < 90000) return;
    lastAsk = now; askEl.classList.add("on");
    const b = document.body && (localStorage.getItem("jv-boss") || "boss");
    askTxt.textContent = "That sounded like a cough. What's wrong, " + b + "?";
    say("That sounded like a cough. What's wrong, " + b + "?");
  }

  // ---------- breathing ----------
  function toggleBreath() {
    breathing = !breathing; breathT0 = performance.now();
    btnBreath.classList.toggle("on", breathing); btnBreath.textContent = breathing ? "Stop" : "Breathe";
    tBreath.textContent = breathing ? "in 4 · out 6" : "guide off";
    if (breathing) hint("Follow the circle. Breathe in through your nose, out slowly through your mouth.");
  }

  // ---------- drawing ----------
  function draw(now) {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "#19d3c518"; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x < W; x += 20) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y < H; y += 20) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    if (phase === "measuring") { const sx = (now / 8) % (W + 40) - 20; const gr = g.createLinearGradient(sx - 30, 0, sx, 0); gr.addColorStop(0, "#19d3c500"); gr.addColorStop(1, "#19d3c555"); g.fillStyle = gr; g.fillRect(sx - 30, 0, 30, H); }
    if (breathing) {
      const t = ((now - breathT0) / 1000) % 10, k = t < 4 ? t / 4 : 1 - (t - 4) / 6, r = 18 + k * 42;
      g.fillStyle = "#19d3c533"; g.beginPath(); g.arc(W / 2, H / 2, r, 0, 7); g.fill();
      g.strokeStyle = "#7be0ff"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#d8f3ff"; g.font = "13px system-ui"; g.textAlign = "center"; g.fillText(t < 4 ? "Breathe in" : "Breathe out", W / 2, H - 10);
      return;
    }
    if (wave.length > 4) {
      let mn = Infinity, mx = -Infinity; for (const v of wave) { if (v < mn) mn = v; if (v > mx) mx = v; }
      const span = (mx - mn) || 1; g.strokeStyle = "#5dffb0"; g.lineWidth = 2; g.shadowColor = "#5dffb0"; g.shadowBlur = 8; g.beginPath();
      wave.forEach((v, i) => { const x = (i / 179) * W, y = H - 14 - ((v - mn) / span) * (H - 28); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.shadowBlur = 0;
    } else {
      g.fillStyle = "#5d6784"; g.font = "12px system-ui"; g.textAlign = "center";
      g.fillText(phase === "measuring" ? "waiting for your pulse…" : "pulse line appears here", W / 2, H / 2);
    }
    if (phase === "measuring" && fingerOn) {
      const p = Math.min(1, (now - fingerSince) / MEASURE_MS);
      g.fillStyle = "#19d3c5"; g.fillRect(0, H - 3, W * p, 3);
    }
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (phase === "measuring") { sampleFrame(now); calc(now); }
    if (now - last > 33) { last = now; draw(now); }
  }

  window.Body = { open, close, startPulse: () => { open(); return startPulse(); }, _dsp: { estimate, resample, clean } };
})();
