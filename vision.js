// Jarvis Vision mode: face activation, sci-fi HUD and hand gestures.
// Runs fully in the browser with MediaPipe. No camera data leaves the phone.
(() => {
  "use strict";
  if (window.Vision) return;

  const VER = "0.10.14";
  const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + VER;
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  const STATE_TAG = { idle: "STANDBY", listen: "LISTENING", think: "THINKING", speak: "SPEAKING" };

  const CSS = `
#vz{position:fixed;inset:0;z-index:40;background:#05060b;color:#e8eaf2;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;touch-action:manipulation}
#vz[hidden]{display:none}
#vz video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:.55}
#vz.hud video{opacity:.28}
#vz canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#vz button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.vz-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + .7rem) 1rem .5rem;z-index:3}
.vz-ib{width:42px;height:42px;border-radius:50%;border:1px solid var(--line,#2a315a);background:#0b0e1fcc;display:grid;place-items:center;padding:0}
.vz-ib svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.vz-tag{font-size:.72rem;letter-spacing:.2em;color:var(--c3,#7be0ff);text-align:center;padding:.35rem .8rem;border:1px solid var(--c2,#2f6bff);border-radius:999px;background:#0b0e1f99}
.vz-msg{position:absolute;left:0;right:0;top:18%;text-align:center;font-size:1.5rem;letter-spacing:.08em;z-index:2;text-shadow:0 0 18px var(--c2,#2f6bff);padding:0 1rem}
.vz-msg small{display:block;font-size:.8rem;letter-spacing:.04em;color:var(--muted,#98a0c0);margin-top:.5rem;text-shadow:none}
.vz-skip{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom) + 1.5rem);transform:translateX(-50%);z-index:3;border:1px solid var(--line,#2a315a);background:#0b0e1fcc;border-radius:999px;padding:.6rem 1.1rem;font-size:.85rem}
.vz-name{position:absolute;left:0;right:0;text-align:center;letter-spacing:.5em;font-size:.95rem;color:var(--c3,#7be0ff);z-index:2;text-shadow:0 0 12px var(--c2,#2f6bff);pointer-events:none}
.vz-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top) + 4.4rem);transform:translateX(-50%);z-index:4;font-size:.8rem;letter-spacing:.14em;padding:.35rem .8rem;border-radius:999px;background:var(--c2,#2f6bff);color:#fff;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.vz-toast.on{opacity:1}
.vz-dock{position:absolute;left:0;right:0;bottom:0;padding:0 .9rem calc(env(safe-area-inset-bottom) + .7rem);z-index:3;display:flex;flex-direction:column;gap:.5rem}
.vz-card{border:1px solid var(--c2,#2f6bff);border-radius:18px;background:#0a0d1ee0;padding:.8rem .9rem;min-height:128px;box-shadow:0 0 28px -12px var(--c2,#2f6bff)}
.vz-card h4{margin:0 0 .45rem;font-size:.72rem;letter-spacing:.22em;color:var(--c3,#7be0ff);font-weight:600}
.vz-card p{margin:0 0 .6rem;font-size:.92rem;line-height:1.4;color:#dfe3f5;overflow-wrap:anywhere;max-height:4.4em;overflow:hidden}
.vz-row{display:flex;justify-content:space-between;font-size:.85rem;padding:.18rem 0;border-bottom:1px solid #ffffff12}
.vz-row span:first-child{color:var(--muted,#98a0c0)}
.vz-act{width:100%;border:1px solid var(--c1,#19d3c5);background:#ffffff0d;border-radius:12px;padding:.7rem;letter-spacing:.16em;font-size:.8rem}
.vz-nav{display:flex;align-items:center;justify-content:space-between}
.vz-nav button{border:0;background:none;padding:.4rem .9rem;font-size:1.2rem;color:var(--c3,#7be0ff)}
.vz-dots{display:flex;gap:7px}
.vz-dots i{width:7px;height:7px;border-radius:50%;background:#ffffff33}
.vz-dots i.on{background:var(--c3,#7be0ff)}
.vz-hint{font-size:.66rem;letter-spacing:.1em;text-align:center;color:var(--muted,#98a0c0)}
.vz-hover{outline:2px solid var(--c3,#7be0ff);box-shadow:0 0 16px var(--c3,#7be0ff)}
`;

  let root, video, cv, g, tagEl, msgEl, nameEl, toastEl, dockEl, skipEl, cardEl, dotsEl, hintEl;
  let mp, fileset, face, hand;
  let stream, phase = "off", run = 0, raf = 0;
  let W = 0, H = 0, dpr = 1;
  let lastDet = 0, lastVidT = -1, fpsN = 0, fpsT = 0, fps = 0;
  let faceBox = null, faceFrames = 0, lockedUntil = 0, lockedAt = 0;
  let pts = null, cursor = { x: 0, y: 0, on: false }, pinch = false, fistSince = 0, hist = [], lastSwipe = 0, hover = null;
  let panel = 0, panels = [], colors = { c1: "#19d3c5", c2: "#2f6bff", c3: "#7be0ff" }, colorsAt = 0, toastT = 0, lastUi = 0;
  let handOk = true;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const $ = s => document.querySelector(s);
  const rgba = (hex, a) => {
    const h = String(hex).trim().replace("#", "");
    if (h.length !== 6) return `rgba(120,160,255,${a})`;
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  };
  const voiceOn = () => { try { return typeof on !== "undefined" && !!on; } catch (e) { return false; } };

  // ---------- UI ----------
  function build() {
    if (root) return;
    const st = el("style"); st.textContent = CSS; document.head.append(st);
    root = el("div"); root.id = "vz"; root.hidden = true;
    video = el("video"); video.setAttribute("playsinline", ""); video.muted = true; video.autoplay = true;
    cv = el("canvas"); g = cv.getContext("2d");
    const top = el("div", "vz-top");
    const lockB = el("button", "vz-ib"); lockB.setAttribute("aria-label", "Lock");
    lockB.innerHTML = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    lockB.onclick = () => lock();
    tagEl = el("div", "vz-tag", "STARTING");
    const closeB = el("button", "vz-ib"); closeB.setAttribute("aria-label", "Close");
    closeB.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    closeB.onclick = () => close();
    top.append(lockB, tagEl, closeB);
    msgEl = el("div", "vz-msg");
    nameEl = el("div", "vz-name", "JARVIS");
    toastEl = el("div", "vz-toast");
    skipEl = el("button", "vz-skip", "Can't see you? Tap to continue"); skipEl.hidden = true;
    skipEl.onclick = () => unlock();

    buildPanels();
    dockEl = el("div", "vz-dock");
    cardEl = el("div", "vz-card");
    const nav = el("div", "vz-nav");
    const prev = el("button", "", "‹"), next = el("button", "", "›");
    prev.setAttribute("aria-label", "Previous panel"); next.setAttribute("aria-label", "Next panel");
    prev.onclick = () => go(-1); next.onclick = () => go(1);
    dotsEl = el("div", "vz-dots"); panels.forEach(() => dotsEl.append(el("i")));
    nav.append(prev, dotsEl, next);
    hintEl = el("div", "vz-hint", "PINCH = SELECT   ·   SWIPE = SWITCH   ·   FIST = LOCK");
    dockEl.append(cardEl, nav, hintEl);

    root.append(video, cv, top, msgEl, nameEl, toastEl, skipEl, dockEl);
    document.body.append(root);
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden && phase !== "off") close(); });
    showPanel();
  }

  function buildPanels() {
    // 1. Voice
    const a = el("div"); a.append(el("h4", "", "VOICE"));
    const aSt = el("p"), aTxt = el("p"); aTxt.style.color = "#98a0c0";
    const aBtn = el("button", "vz-act"); aBtn.dataset.vz = "1";
    aBtn.onclick = () => {
      if (voiceOn()) { const b = $("#end"); b && b.click(); }
      else { const o = $("#orb"); o && o.click(); }
    };
    a.append(aSt, aTxt, aBtn);
    panels.push({ el: a, update() {
      aSt.textContent = ($("#st") && $("#st").textContent) || "Ready";
      const last = [...document.querySelectorAll("#chat .m.a:not(.wait) .b")].pop();
      aTxt.textContent = last ? last.textContent.slice(0, 160) : "";
      aBtn.textContent = voiceOn() ? "END VOICE" : "TALK TO JARVIS";
    } });

    // 2. System
    const b = el("div"); b.append(el("h4", "", "SYSTEM"));
    const rows = {};
    ["Time", "Battery", "Network", "CPU cores", "Memory", "Tracking"].forEach(k => {
      const r = el("div", "vz-row"); const v = el("span", "", "-"); r.append(el("span", "", k), v); b.append(r); rows[k] = v;
    });
    let batt = null;
    if (navigator.getBattery) navigator.getBattery().then(x => batt = x).catch(() => {});
    panels.push({ el: b, update() {
      rows.Time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      rows.Battery.textContent = batt ? Math.round(batt.level * 100) + "%" + (batt.charging ? " charging" : "") : "n/a";
      const c = navigator.connection;
      rows.Network.textContent = navigator.onLine ? (c && c.effectiveType ? c.effectiveType.toUpperCase() : "Online") : "Offline";
      rows["CPU cores"].textContent = navigator.hardwareConcurrency || "n/a";
      rows.Memory.textContent = navigator.deviceMemory ? navigator.deviceMemory + " GB" : "n/a";
      rows.Tracking.textContent = handOk ? fps + " fps" : "touch only";
    } });

    // 3. Chat
    const c = el("div"); c.append(el("h4", "", "CHAT"));
    const cTxt = el("p");
    const cBtn = el("button", "vz-act", "OPEN CHAT"); cBtn.dataset.vz = "1";
    cBtn.onclick = () => close();
    c.append(cTxt, cBtn);
    panels.push({ el: c, update() {
      const all = [...document.querySelectorAll("#chat .m:not(.wait) .b")].slice(-2).map(x => x.textContent.slice(0, 80));
      cTxt.textContent = all.length ? all.join("  ·  ") : "No messages yet.";
    } });
  }

  function showPanel() {
    cardEl.replaceChildren(panels[panel].el);
    [...dotsEl.children].forEach((d, i) => d.classList.toggle("on", i === panel));
    panels[panel].update();
  }
  function go(d) { panel = (panel + d + panels.length) % panels.length; showPanel(); }

  function toast(t) {
    toastEl.textContent = t; toastEl.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), 900);
  }

  function resize() {
    if (!root) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setPhase(p, text, sub) {
    phase = p;
    root.classList.toggle("hud", p === "hud");
    dockEl.hidden = p !== "hud";
    nameEl.hidden = p !== "hud";
    msgEl.hidden = p === "hud";
    skipEl.hidden = true;
    if (text !== undefined) { msgEl.textContent = text; if (sub) msgEl.append(el("small", "", sub)); }
    if (p === "locked") { lockedAt = performance.now(); tagEl.textContent = "FACE ACTIVATION REQUIRED"; }
    if (p === "unlocking") tagEl.textContent = "ACCESS GRANTED";
    if (p === "loading") tagEl.textContent = "STARTING";
    if (p === "hud") { showPanel(); resize(); }
  }

  // ---------- MediaPipe ----------
  async function loadLibs() {
    if (!mp) { try { mp = await import(CDN + "/vision_bundle.mjs"); } catch (e) { mp = await import(CDN + "/+esm"); } }
    if (!fileset) fileset = await mp.FilesetResolver.forVisionTasks(CDN + "/wasm");
  }
  async function make(Cls, opts) {
    const mk = delegate => Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate } });
    try { return await mk("GPU"); } catch (e) { return await mk("CPU"); }
  }
  const makeFace = () => make(mp.FaceDetector, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "VIDEO", minDetectionConfidence: 0.6 });
  const makeHand = () => make(mp.HandLandmarker, { baseOptions: { modelAssetPath: HAND_MODEL }, runningMode: "VIDEO", numHands: 1,
    minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });

  // ---------- flow ----------
  async function open() {
    if (phase !== "off") return;
    build();
    const my = ++run;
    root.hidden = false; resize();
    document.body.style.overflow = "hidden";
    setPhase("loading", "Starting camera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (my !== run) { stopStream(); return; }
      video.srcObject = stream; await video.play();
      setPhase("loading", "Loading vision…", "First time can take a few seconds");
      await loadLibs();
      if (!face) face = await makeFace();
      if (my !== run) return;
      faceFrames = 0; faceBox = null;
      setPhase("locked", "Look at the camera");
      loop();
    } catch (e) {
      if (my !== run) return;
      const blocked = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setPhase("loading", blocked ? "Camera blocked" : "Vision could not start",
        blocked ? "Allow camera access in your browser settings, then try again." : String(e && e.message || e).slice(0, 120));
      tagEl.textContent = "ERROR";
    }
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; video && (video.srcObject = null);
  }

  function close() {
    run++; cancelAnimationFrame(raf); raf = 0;
    stopStream();
    phase = "off"; pts = null; cursor.on = false; pinch = false; faceBox = null;
    if (hover) hover.classList.remove("vz-hover"), hover = null;
    if (root) root.hidden = true;
    document.body.style.overflow = "";
  }

  function unlock() {
    if (phase !== "locked" && phase !== "loading") return;
    const my = run;
    setPhase("unlocking", "Welcome");
    const handP = hand ? Promise.resolve(hand) : makeHand().then(h => (hand = h)).catch(() => null);
    Promise.all([handP, new Promise(r => setTimeout(r, 1400))]).then(([h]) => {
      if (my !== run || phase !== "unlocking") return;
      handOk = !!h;
      setPhase("hud");
      if (!h) toast("HAND TRACKING OFF · USE TOUCH");
      else toast("WELCOME");
      if (window.jvGreet) window.jvGreet();
    });
  }

  function lock() {
    if (phase !== "hud") return;
    pts = null; cursor.on = false; pinch = false; fistSince = 0; faceBox = null; faceFrames = 0;
    if (hover) hover.classList.remove("vz-hover"), hover = null;
    lockedUntil = performance.now() + 2500;
    setPhase("locked", "Locked");
  }

  // ---------- detection ----------
  function map(nx, ny) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    return [W - (nx * dw + (W - dw) / 2), ny * dh + (H - dh) / 2];
  }

  function detect(now) {
    if (phase === "locked" || phase === "unlocking") {
      if (phase === "locked" && now < lockedUntil) { faceBox = null; return; }
      const r = face.detectForVideo(video, now);
      const d = r.detections && r.detections[0];
      if (d && d.boundingBox) {
        faceBox = d.boundingBox;
        if (phase === "locked" && ++faceFrames >= 10) unlock();
      } else if (phase === "locked") { faceBox = null; faceFrames = 0; }
    } else if (phase === "hud" && hand) {
      const r = hand.detectForVideo(video, now);
      onHand(r.landmarks && r.landmarks[0], now);
    }
  }

  function onHand(lm, now) {
    if (!lm) { pts = null; cursor.on = false; pinch = false; fistSince = 0; hist.length = 0; setHover(null); return; }
    const P = lm.map(p => map(p.x, p.y)); pts = P;
    const d = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    const palm = d(0, 9) || 1;
    const was = pinch, pd = d(4, 8) / palm;
    pinch = pinch ? pd < 0.5 : pd < 0.3;
    const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, p]) => d(t, 0) > d(p, 0) * 1.05).length;
    const tx = (P[4][0] + P[8][0]) / 2, ty = (P[4][1] + P[8][1]) / 2;
    if (!cursor.on) { cursor.x = tx; cursor.y = ty; cursor.on = true; }
    cursor.x += (tx - cursor.x) * 0.55; cursor.y += (ty - cursor.y) * 0.55;

    const target = hit(cursor.x, cursor.y);
    setHover(target);
    if (pinch && !was) {
      if (target) { target.click(); toast("SELECT"); }
    }

    // swipe: open hand moving fast sideways
    if (ext >= 3 && !pinch) {
      hist.push({ t: now, x: P[9][0] });
      while (hist.length && now - hist[0].t > 420) hist.shift();
      if (hist.length > 3 && now - lastSwipe > 800) {
        const dx = hist[hist.length - 1].x - hist[0].x;
        if (Math.abs(dx) > W * 0.4) { lastSwipe = now; hist.length = 0; go(dx < 0 ? 1 : -1); toast(dx < 0 ? "SWIPE ›" : "‹ SWIPE"); }
      }
    } else hist.length = 0;

    // fist held = lock
    if (ext === 0 && !pinch) {
      fistSince = fistSince || now;
      if (now - fistSince > 1100) { fistSince = 0; toast("LOCKED"); lock(); }
    } else fistSince = 0;
  }

  function hit(x, y) {
    const e = document.elementFromPoint(x, y);
    const b = e && e.closest && e.closest("#vz button");
    return b || null;
  }
  function setHover(b) {
    if (hover === b) return;
    if (hover) hover.classList.remove("vz-hover");
    hover = b; if (b) b.classList.add("vz-hover");
  }

  // ---------- drawing ----------
  function brackets(x, y, w, h, len, color) {
    g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
    g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y);
    g.moveTo(x + w - len, y); g.lineTo(x + w, y); g.lineTo(x + w, y + len);
    g.moveTo(x + w, y + h - len); g.lineTo(x + w, y + h); g.lineTo(x + w - len, y + h);
    g.moveTo(x + len, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - len);
    g.stroke();
  }

  function drawLocked(now) {
    const ok = phase === "unlocking";
    const col = ok ? "#2ecc71" : "#ff8a3d";
    let x, y, w, h;
    if (faceBox) {
      const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
      const a = map(faceBox.originX / vw, faceBox.originY / vh), b = map((faceBox.originX + faceBox.width) / vw, (faceBox.originY + faceBox.height) / vh);
      x = Math.min(a[0], b[0]); y = Math.min(a[1], b[1]); w = Math.abs(a[0] - b[0]); h = Math.abs(a[1] - b[1]);
      const px = w * 0.15, py = h * 0.15; x -= px; y -= py; w += px * 2; h += py * 2;
    } else {
      w = W * 0.62; h = Math.min(H * 0.42, w * 1.25); x = (W - w) / 2; y = H * 0.32;
    }
    brackets(x, y, w, h, Math.min(w, h) * 0.22, col);
    // scan line
    const t = (now % 1800) / 1800, sy = y + h * (t < .5 ? t * 2 : 2 - t * 2);
    g.strokeStyle = rgba(col, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 6, sy); g.lineTo(x + w - 6, sy); g.stroke();
    if (phase === "locked") {
      msgEl.firstChild && (msgEl.firstChild.nodeValue = now < lockedUntil ? "Locked" : faceFrames > 0 ? "Scanning…" : "Look at the camera");
      if (!faceBox && now - lockedAt > 6000 && now >= lockedUntil) skipEl.hidden = false;
      else if (faceBox) skipEl.hidden = true;
    }
  }

  function drawHud(now) {
    const lvl = parseFloat(document.body.style.getPropertyValue("--l")) || 0;
    const cx = W / 2, cy = H * 0.3, R = Math.min(W * 0.5, H * 0.3) * 0.45 * (1 + lvl * 0.18);
    nameEl.style.top = (cy + R * 2.15) + "px";
    const { c1, c2, c3 } = colors;
    // core
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, rgba(c3, 0.95)); gr.addColorStop(0.55, rgba(c1, 0.55)); gr.addColorStop(1, rgba(c2, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    // rings
    const t = now / 1000;
    for (let i = 0; i < 4; i++) {
      const r = R * (1.15 + i * 0.28), dir = i % 2 ? -1 : 1, a0 = t * (0.5 + i * 0.25) * dir;
      g.strokeStyle = rgba(i % 2 ? c2 : c1, 0.85 - i * 0.12); g.lineWidth = 2;
      g.setLineDash(i === 2 ? [4, 8] : []);
      const segs = 3 + i;
      for (let s = 0; s < segs; s++) {
        const a = a0 + (s * 2 * Math.PI) / segs;
        g.beginPath(); g.arc(cx, cy, r, a, a + (Math.PI * 1.1) / segs); g.stroke();
      }
    }
    g.setLineDash([]);
    // ticks
    const tr = R * 2.1; g.strokeStyle = rgba(c3, 0.5); g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 6.2832 + t * 0.15, l = i % 6 === 0 ? 9 : 4;
      g.moveTo(cx + Math.cos(a) * tr, cy + Math.sin(a) * tr); g.lineTo(cx + Math.cos(a) * (tr + l), cy + Math.sin(a) * (tr + l));
    }
    g.stroke();
  }

  function drawHand() {
    if (!pts) return;
    const { c3 } = colors;
    g.strokeStyle = rgba(c3, 0.8); g.lineWidth = 2; g.beginPath();
    for (const [a, b] of LINKS) { g.moveTo(pts[a][0], pts[a][1]); g.lineTo(pts[b][0], pts[b][1]); }
    g.stroke();
    g.fillStyle = c3;
    for (const p of pts) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fill(); }
    if (cursor.on) {
      g.lineWidth = 3; g.strokeStyle = pinch ? "#ffffff" : colors.c1;
      g.beginPath(); g.arc(cursor.x, cursor.y, pinch ? 10 : 18, 0, 7); g.stroke();
      if (pinch) { g.fillStyle = rgba(colors.c1, 0.6); g.fill(); }
    }
    if (fistSince) {
      const p = Math.min(1, (performance.now() - fistSince) / 1100);
      g.strokeStyle = "#ff5a5a"; g.lineWidth = 4; g.beginPath();
      g.arc(W / 2, H * 0.3, 40, -1.57, -1.57 + p * 6.28); g.stroke();
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - colorsAt > 300) {
      colorsAt = now; const cs = getComputedStyle(root);
      ["c1", "c2", "c3"].forEach(k => { const v = cs.getPropertyValue("--" + k).trim(); if (v) colors[k] = v; });
    }
    if (video.readyState >= 2 && now - lastDet >= 45 && video.currentTime !== lastVidT) {
      lastDet = now; lastVidT = video.currentTime;
      try { detect(now); } catch (e) { /* skip bad frame */ }
      fpsN++; if (now - fpsT > 1000) { fps = fpsN; fpsN = 0; fpsT = now; }
    }
    g.clearRect(0, 0, W, H);
    if (phase === "hud") {
      drawHud(now); drawHand();
      if (now - lastUi > 400) {
        lastUi = now;
        const s = document.body.dataset.s || "idle"; tagEl.textContent = STATE_TAG[s] || "STANDBY";
        panels[panel].update();
      }
    } else if (phase === "locked" || phase === "unlocking") drawLocked(now);
  }

  window.Vision = { open, close, lock };
})();
