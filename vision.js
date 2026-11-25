// Jarvis Vision mode: face activation, sci-fi HUD, hand gestures, voice commands, live object scanning.
// Runs in the browser with MediaPipe. Camera frames stay on the phone, except when YOU ask
// "what do you see?": then one still photo is sent to /api/see to be described, and is not kept.
(() => {
  "use strict";
  if (window.Vision) return;

  const VER = "0.10.14";
  const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + VER;
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const OBJ_MODEL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
  const FACE_LM_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const PANEL_KEYS = ["voice", "objects", "weather", "timer", "system", "chat"];
  const SCALES = [0.75, 1, 1.35, 1.75];
  const HINTS = ['SAY  "scan my face"', 'SAY  "read this"', 'SAY  "compass"', 'SAY  "flashlight on"', 'SAY  "remind me in 10 minutes to call mum"', 'SAY  "open my chat"', 'SAY  "show pictures of lions"', "PINCH = GRAB  ·  FLING = THROW AWAY", "OPEN PALM HOLD = ZOOM WINDOW", 'SAY  "check my email"', 'SAY  "bigger"  /  "move it left"', 'SAY  "scan"', 'SAY  "what do you see?"', 'SAY  "weather"', 'SAY  "timer 5 minutes"', 'SAY  "flip camera"', "✌ PEACE SIGN = SCAN", 'SAY  "help"', "PINCH = SELECT  ·  SWIPE = SWITCH  ·  FIST = LOCK"];
  const WX = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "snow showers", 95: "a thunderstorm", 96: "a thunderstorm with hail", 99: "a thunderstorm with hail" };
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
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
#vz.back video{transform:none}
.vz-grp{display:flex;gap:.5rem}
.vz-ib.live{border-color:var(--c1,#19d3c5);box-shadow:0 0 14px -2px var(--c1,#19d3c5)}
.vz-say{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + 3.6rem);z-index:2;padding:0 1.1rem;text-align:center;pointer-events:none;transition:opacity .6s;opacity:0;font-size:.9rem;line-height:1.35;text-shadow:0 1px 8px #000}
.vz-say b{display:block;font-weight:500;color:#fff}
.vz-say i{display:block;font-style:normal;color:var(--c3,#7be0ff)}
.vz-big{font-size:2.1rem;letter-spacing:.06em;margin:0 0 .35rem;color:#fff;font-variant-numeric:tabular-nums}
.vz-two{display:flex;gap:.5rem}
#vz canvas{z-index:20}
.vz-top{z-index:25}
.vz-toast{z-index:26}
.vz-win{position:absolute;left:0;top:0;z-index:5;width:min(78vw,320px);transform-origin:0 0;border:1px solid var(--c3,#7be0ff);border-radius:14px;background:#061020b8;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 0 24px -6px var(--c2,#2f6bff),inset 0 0 18px -10px var(--c3,#7be0ff);touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden;transition:opacity .25s}
.vz-win.hot{box-shadow:0 0 30px 2px var(--c3,#7be0ff)}
.vz-win.grab{border-color:#fff;box-shadow:0 0 38px 4px var(--c3,#7be0ff)}
.vz-wh{display:flex;justify-content:space-between;align-items:center;padding:.3rem .45rem .3rem .7rem;font-size:.66rem;letter-spacing:.2em;color:var(--c3,#7be0ff);border-bottom:1px solid #ffffff1f;background:#ffffff0a}
.vz-wb{display:flex;gap:.25rem}
.vz-wb button{border:1px solid #ffffff33;background:#0006;border-radius:8px;width:30px;height:26px;padding:0;font-size:1rem;line-height:1}
.vz-wc{padding:.6rem .7rem;font-size:.85rem;line-height:1.4;max-height:42vh;overflow:hidden;overflow-wrap:anywhere}
.vz-wc img.big{width:100%;border-radius:8px;display:block;margin-bottom:.45rem}
.vz-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.vz-grid img{width:100%;height:96px;object-fit:cover;border-radius:8px;background:#ffffff14;pointer-events:none}
.vz-cm{margin:0 0 .45rem}
.vz-cm b{color:var(--c3,#7be0ff);font-weight:600;letter-spacing:.1em;font-size:.68rem;margin-right:.45rem}
.vz-wbig{font-size:2rem;color:#fff;margin:0 0 .2rem}
.vz-src{font-size:.62rem;color:var(--muted,#98a0c0);margin:.4rem 0 0;letter-spacing:.06em}
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
  let coreY = 0, facing = "user", scanOn = false, objDet = null, objs = [], objAt = 0, objFrame = 0, seeTxt = "", seeBusy = false;
  let startedVoice = false, micB = null, sayEl = null, sayU = "", sayA = "", sayAt = 0, sayInit = false, hintI = 0, hintAt = 0;
  let meshOn = false, meshDet = null, meshPts = null, meshAt = 0, navOn = false, navNeedTap = false, heading = null, geoId = null, nav = { spd: 0, alt: null, acc: null };
  let torchOn = false, wakeLock = null;
  let wins = [], focused = null, zTop = 5, grab = null, gh = [], palmW = null, palmSince = 0, lastZoom = 0;
  let gesture = "", peaceSince = 0, lastPeace = 0, batt = null;
  let timer = { end: 0, total: 0, t: null }, askTimerUntil = 0;
  let wx = null, wxBusy = false, wxErr = "";

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
    micB = el("button", "vz-ib"); micB.setAttribute("aria-label", "Microphone");
    micB.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    micB.onclick = () => { if (voiceOn()) { startedVoice = false; typeof end === "function" && end(); } else { startedVoice = true; typeof begin === "function" && begin(); } };
    const grp = el("div", "vz-grp"); grp.append(lockB, micB);
    top.append(grp, tagEl, closeB);
    sayEl = el("div", "vz-say");
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
    hintEl = el("div", "vz-hint", HINTS[0]);
    dockEl.append(cardEl, nav, hintEl);

    root.append(video, cv, top, sayEl, msgEl, nameEl, toastEl, skipEl, dockEl);
    document.body.append(root);
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden && phase !== "off") close(); });
    showPanel();
  }

  function buildPanels() {
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
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

    // 2. Objects (live scan + describe)
    const o = el("div"); o.append(el("h4", "", "OBJECTS"));
    const oTxt = el("p");
    const oRow = el("div", "vz-two");
    const sBtn = el("button", "vz-act"); sBtn.dataset.vz = "1";
    sBtn.onclick = () => { if (scanOn) { scanStop(); } else scanStart(); };
    const dBtn = el("button", "vz-act", "DESCRIBE"); dBtn.dataset.vz = "1";
    dBtn.onclick = () => describe("");
    oRow.append(sBtn, dBtn); o.append(oTxt, oRow);
    panels.push({ el: o, update() {
      sBtn.textContent = scanOn ? "STOP SCAN" : "START SCAN";
      const c = counts();
      oTxt.textContent = seeBusy ? "Looking…" : scanOn && c ? c : seeTxt ? seeTxt.slice(0, 200) : scanOn ? "Scanning… point the camera at things." : 'Say "scan" or "what do you see?"';
    } });

    // 3. Weather
    const w = el("div"); w.append(el("h4", "", "WEATHER"));
    const wBig = el("div", "vz-big", "--"), wTxt = el("p");
    const wBtn = el("button", "vz-act", "GET WEATHER"); wBtn.dataset.vz = "1";
    wBtn.onclick = () => getWeather(true);
    w.append(wBig, wTxt, wBtn);
    panels.push({ el: w, update() {
      if (wx) { wBig.textContent = wx.temp + "°"; wTxt.textContent = cap(wx.desc) + (wx.place ? " · " + wx.place : "") + " · H " + wx.hi + "° L " + wx.lo + "° · rain " + wx.rain + "%"; }
      else { wBig.textContent = "--"; wTxt.textContent = wxBusy ? "Finding you…" : wxErr || 'Say "weather"'; }
    } });

    // 4. Timer
    const t = el("div"); t.append(el("h4", "", "TIMER"));
    const tBig = el("div", "vz-big", "--:--"), tTxt = el("p");
    const tRow = el("div", "vz-two");
    const t5 = el("button", "vz-act", "5 MIN"); t5.dataset.vz = "1"; t5.onclick = () => timerStart(300);
    const tX = el("button", "vz-act", "STOP"); tX.dataset.vz = "1"; tX.onclick = () => timerStop();
    tRow.append(t5, tX); t.append(tBig, tTxt, tRow);
    panels.push({ el: t, update() {
      const left = timer.end ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : 0;
      tBig.textContent = timer.end ? String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0") : "--:--";
      tTxt.textContent = timer.end ? "Counting down " + fmtDur(timer.total) : 'Say "timer 10 minutes"';
    } });

    // 5. System
    const b = el("div"); b.append(el("h4", "", "SYSTEM"));
    const rows = {};
    ["Time", "Battery", "Network", "Camera", "Memory", "Tracking"].forEach(k => {
      const r = el("div", "vz-row"); const v = el("span", "", "-"); r.append(el("span", "", k), v); b.append(r); rows[k] = v;
    });
    if (navigator.getBattery) navigator.getBattery().then(x => batt = x).catch(() => {});
    panels.push({ el: b, update() {
      rows.Time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      rows.Battery.textContent = batt ? Math.round(batt.level * 100) + "%" + (batt.charging ? " charging" : "") : "n/a";
      const c = navigator.connection;
      rows.Network.textContent = navigator.onLine ? (c && c.effectiveType ? c.effectiveType.toUpperCase() : "Online") : "Offline";
      rows.Camera.textContent = facing === "user" ? "Front" : "Rear";
      rows.Memory.textContent = navigator.deviceMemory ? navigator.deviceMemory + " GB" : "n/a";
      rows.Tracking.textContent = handOk ? fps + " fps" : "touch only";
    } });

    // 6. Chat
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
    facing = "user"; root.classList.remove("back"); scanOn = false; objs = []; seeTxt = ""; sayInit = false;
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
    phase = "off"; pts = null; cursor.on = false; pinch = false; faceBox = null; scanOn = false; objs = []; gesture = "";
    closeAllWins(true); meshOn = false; meshPts = null; navStop(); torchOn = false; keepAwake(false);
    if (startedVoice) { startedVoice = false; try { end(); } catch (e) {} }
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
      if (!voiceOn() && typeof begin === "function") { startedVoice = true; begin(); }   // hands-free: just talk
      keepAwake(true);
      if (window.jvGreet) window.jvGreet();
    });
  }

  function lock() {
    if (phase !== "hud") return;
    pts = null; cursor.on = false; pinch = false; fistSince = 0; faceBox = null; faceFrames = 0;
    if (hover) hover.classList.remove("vz-hover"), hover = null;
    lockedUntil = performance.now() + 2500;
    closeAllWins(true); meshOn = false; meshPts = null;
    if (scanOn || facing !== "user") { scanOn = false; objs = []; setCamera("user").catch(() => {}); }
    setPhase("locked", "Locked");
  }

  // ---------- detection ----------
  function map(nx, ny) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    const x = nx * dw + (W - dw) / 2;
    return [facing === "user" ? W - x : x, ny * dh + (H - dh) / 2];
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
    } else if (phase === "hud") {
      if (meshOn && meshDet && (objFrame++ & 1)) {
        const r = meshDet.detectForVideo(video, now);
        meshPts = (r.faceLandmarks && r.faceLandmarks[0]) || null; meshAt = now;
      } else if (scanOn && objDet && !meshOn && (objFrame++ & 1)) {
        const r = objDet.detectForVideo(video, now);
        objs = (r.detections || []).filter(d => d.boundingBox).map(d => { const c = (d.categories || [])[0] || {}; return { box: d.boundingBox, name: c.categoryName || "object", score: c.score || 0 }; });
        objAt = now;
      } else if (hand) {
        const r = hand.detectForVideo(video, now);
        onHand(r.landmarks && r.landmarks[0], now);
      }
    }
  }

  function onHand(lm, now) {
    if (!lm) { pts = null; cursor.on = false; pinch = false; fistSince = 0; peaceSince = 0; gesture = ""; hist.length = 0; setHover(null); hotWin(null); palmW = null; if (grab && grab.src === "hand") grabEnd(now); return; }
    const P = lm.map(p => map(p.x, p.y)); pts = P;
    const d = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    const palm = d(0, 9) || 1;
    const was = pinch, pd = d(4, 8) / palm;
    pinch = pinch ? pd < 0.5 : pd < 0.3;
    const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, p]) => d(t, 0) > d(p, 0) * 1.05).length;
    const tx = (P[4][0] + P[8][0]) / 2, ty = (P[4][1] + P[8][1]) / 2;
    if (!cursor.on) { cursor.x = tx; cursor.y = ty; cursor.on = true; }
    cursor.x += (tx - cursor.x) * 0.55; cursor.y += (ty - cursor.y) * 0.55;

    const wTarget = grab ? grab.w : winAt(cursor.x, cursor.y);
    const target = grab ? null : hit(cursor.x, cursor.y);
    setHover(target); hotWin(!target ? wTarget : null);
    if (pinch && !was) {
      if (target) { target.click(); toast("SELECT"); }
      else if (wTarget) { grabStart(wTarget, cursor.x, cursor.y, "hand"); toast("GRAB"); }
    }
    if (grab && grab.src === "hand") { if (pinch) grabMove(cursor.x, cursor.y, now); else grabEnd(now); }

    // open palm held over a window = zoom it in one step (past the biggest size it goes back to normal)
    const pw = ext >= 4 && !pinch && !grab ? winAt(P[9][0], P[9][1]) : null;
    if (pw) {
      if (palmW !== pw) { palmW = pw; palmSince = now; }
      else if (now - palmSince > 650 && now - lastZoom > 1000) { lastZoom = now; palmSince = now; focusWin(pw); zoomWin(pw, 1, true); }
    } else palmW = null;

    // swipe: open hand moving fast sideways
    if (ext >= 3 && !pinch && !palmW) {
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

    // gesture name shown next to the hand; peace sign held = toggle scan
    const up = (t, p) => d(t, 0) > d(p, 0) * 1.05;
    gesture = pinch ? "PINCH" : ext === 0 ? "FIST" : ext === 4 ? "OPEN PALM" : ext === 1 && up(8, 6) ? "POINT" : ext === 2 && up(8, 6) && up(12, 10) ? "PEACE" : "";
    if (gesture === "PEACE") {
      peaceSince = peaceSince || now;
      if (now - peaceSince > 700 && now - lastPeace > 2500) { lastPeace = now; peaceSince = 0; if (scanOn) scanStop(); else scanStart(); }
    } else peaceSince = 0;
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
    coreY = H * (scanOn ? 0.19 : 0.3);
    const cx = W / 2, cy = coreY, R = Math.min(W * 0.5, H * 0.3) * 0.45 * (1 + lvl * 0.18) * (scanOn ? 0.55 : 1);
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
      g.arc(W / 2, coreY, 40, -1.57, -1.57 + p * 6.28); g.stroke();
    }
    if (palmW) {
      const p = Math.min(1, (performance.now() - palmSince) / 650);
      g.strokeStyle = colors.c3; g.lineWidth = 4; g.beginPath(); g.arc(pts[9][0], pts[9][1], 34, -1.57, -1.57 + p * 6.28); g.stroke();
    }
    if (gesture) {
      g.font = "600 12px ui-monospace,Menlo,monospace"; g.textAlign = "center";
      const x = pts[9][0], y = Math.max(20, Math.min(pts[5][1], pts[9][1], pts[13][1]) - 34);
      const tag = gesture === "PEACE" ? "✌ HOLD = SCAN" : gesture;
      const tw = g.measureText(tag).width + 14;
      g.fillStyle = rgba(colors.c2, 0.85); g.fillRect(x - tw / 2, y - 13, tw, 20);
      g.fillStyle = "#fff"; g.fillText(tag, x, y + 1); g.textAlign = "left";
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
      drawHud(now); drawObjects(now); drawMesh(now); drawCompass(now); drawTel(now); drawHand();
      if (now - lastUi > 400) {
        lastUi = now;
        const s = document.body.dataset.s || "idle"; tagEl.textContent = voiceOn() ? (STATE_TAG[s] || "STANDBY") : "MIC OFF";
        micB.classList.toggle("live", voiceOn());
        if (now - hintAt > 4500) { hintAt = now; hintI = (hintI + 1) % HINTS.length; hintEl.textContent = HINTS[hintI]; }
        updSay(now);
        wins.forEach(w => w.tick && w.tick());
        panels[panel].update();
      }
    } else if (phase === "locked" || phase === "unlocking") drawLocked(now);
  }

  // ---------- camera, scan, describe ----------
  async function setCamera(face) {
    const my = run;
    stopStream();
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
    catch (e) {
      if (face === "user") throw e;
      face = "user"; toast("NO REAR CAMERA");
      st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    }
    if (my !== run) { st.getTracks().forEach(t => t.stop()); return; }
    stream = st; facing = face; torchOn = false; root.classList.toggle("back", face !== "user");
    video.srcObject = stream; await video.play(); lastVidT = -1; pts = null; objs = [];
  }
  async function flip(to) {
    const f = to || (facing === "user" ? "environment" : "user");
    try { await setCamera(f); toast(facing === "user" ? "FRONT CAMERA" : "REAR CAMERA"); confirmed(); } catch (e) { toast("CAMERA ERROR"); }
  }
  const makeObj = () => make(mp.ObjectDetector, { baseOptions: { modelAssetPath: OBJ_MODEL }, runningMode: "VIDEO", scoreThreshold: 0.4, maxResults: 8 });
  async function scanStart() {
    if (scanOn) return;
    if (meshOn) { meshOn = false; meshPts = null; }
    goTo("objects"); seeTxt = ""; toast("SCANNING"); say("Scanning. Point the camera at things.");
    scanOn = true;
    try {
      if (facing === "user") await setCamera("environment");
      if (!objDet) { toast("LOADING SCANNER"); objDet = await makeObj(); }
    } catch (e) { scanOn = false; objs = []; toast("SCAN FAILED"); say("The scanner could not start."); }
  }
  function scanStop() {
    if (meshOn) { meshStop(); return; }
    if (!scanOn) return;
    scanOn = false; objs = []; toast("SCAN OFF");
    if (facing !== "user") setCamera("user").catch(() => {});
    confirmed();
  }
  function counts() {
    const n = {}; objs.forEach(o => n[o.name] = (n[o.name] || 0) + 1);
    return Object.keys(n).map(k => n[k] + " " + k).join("  ·  ");
  }
  async function describe(question, o) {
    o = o || {};
    if (seeBusy || phase !== "hud") return;
    seeBusy = true; goTo("objects"); toast(o.read ? "READING…" : "LOOKING…");
    try {
      if (o.read && facing === "user") { await setCamera("environment"); await new Promise(r => setTimeout(r, 900)); }   // back camera reads text better
      const vw = video.videoWidth || 640, vh = video.videoHeight || 480, sc = Math.min(1, 640 / Math.max(vw, vh));
      const c = document.createElement("canvas"); c.width = Math.round(vw * sc); c.height = Math.round(vh * sc);
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.7), image = url.split(",")[1];
      const sw = openWin("see", { img: url });
      try {
        const d = await post("/api/see", { image, question: question || "What am I looking at?", mode: o.read ? "read" : "", langName: typeof langName === "function" ? langName() : "" });
        seeTxt = d.text; sw.set(d.text); say(d.text);
      } catch (e) { seeTxt = "I couldn't look: " + String(e.message || e).slice(0, 80); sw.set(seeTxt); say("Sorry, I couldn't look just now."); }
    } catch (e) { seeTxt = "I couldn't look: " + String(e.message || e).slice(0, 80); say("Sorry, I couldn't look just now."); }
    seeBusy = false;
  }

  // ---------- weather ----------
  async function getWeather(speakIt) {
    if (wx && Date.now() - wx.at < 600000) { if (speakIt) say(wx.line); return; }
    if (wxBusy) return;
    wxBusy = true; wxErr = ""; goTo("weather");
    try {
      const pos = await new Promise((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no, { timeout: 9000, maximumAge: 600000 }) : no(new Error("no gps")));
      const la = pos.coords.latitude, lo = pos.coords.longitude;
      const u = "https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo +
        "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1";
      const j = await (await fetch(u)).json();
      let place = "";
      try {
        const r = await (await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + la + "&longitude=" + lo + "&localityLanguage=en")).json();
        place = r.city || r.locality || "";
      } catch (e) {}
      const temp = Math.round(j.current.temperature_2m), hi = Math.round(j.daily.temperature_2m_max[0]), lo2 = Math.round(j.daily.temperature_2m_min[0]);
      const rain = j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[0] : 0, desc = WX[j.current.weather_code] || "unsettled";
      wx = { temp, hi, lo: lo2, rain, desc, place, at: Date.now(),
        line: "It's " + temp + " degrees and " + desc + (place ? " in " + place : "") + ". Today's high is " + hi + ", the low is " + lo2 + ", with a " + rain + " percent chance of rain." };
      if (speakIt) say(wx.line);
    } catch (e) {
      wxErr = e && e.code === 1 ? "Allow location to see weather" : "Weather not available";
      if (speakIt) say(e && e.code === 1 ? "I need location permission to check the weather." : "I couldn't get the weather right now.");
    }
    wxBusy = false;
  }

  // ---------- timer ----------
  function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60, out = [];
    if (h) out.push(h + (h === 1 ? " hour" : " hours")); if (m) out.push(m + (m === 1 ? " minute" : " minutes")); if (x) out.push(x + (x === 1 ? " second" : " seconds"));
    return out.join(" ") || "0 seconds";
  }
  function timerStart(sec, label) {
    sec = Math.max(1, Math.min(86400, Math.round(sec))); clearTimeout(timer.t); label = String(label || "").slice(0, 80);
    timer = { end: Date.now() + sec * 1000, total: sec, label, t: setTimeout(timerDone, sec * 1000) };
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch (e) {}
    goTo("timer"); say(label ? "Okay, I'll remind you to " + label + " in " + fmtDur(sec) + "." : "Timer set for " + fmtDur(sec) + ".");
  }
  function timerStop() {
    const had = !!timer.end; clearTimeout(timer.t); timer = { end: 0, total: 0, t: null };
    if (had) say("Timer cancelled."); else say("There's no timer running.");
  }
  function notify(title, body) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: "/jarvis-icon-192.png", vibrate: [300, 150, 300], tag: "jarvis-timer" })).catch(() => {});
      else new Notification(title, { body });
    } catch (e) {}
  }
  function timerDone() {
    const label = timer.label; timer = { end: 0, total: 0, t: null };
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    if (phase !== "off") toast(label ? "REMINDER" : "TIMER DONE");
    notify("Jarvis", label ? "Reminder: " + label : "Your timer is done.");
    say(label ? "Reminder: " + label + "." : "Your timer is done.");
  }
  async function keepAwake(on) {                     // keeps the screen on while Vision is open, so timers and the camera keep running
    try {
      if (on) { if (!wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } }
      else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }
  function parseDur(s) {
    if (/half an hour/.test(s)) return 1800;
    s = s.replace(/\b(twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (x, t, u) => String(NUM[t] + NUM[u]));   // "twenty five" -> 25
    let total = 0, m; const re = /(\d+(?:\.\d+)?|[a-z]+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/g;
    while ((m = re.exec(s))) {
      const n = isNaN(m[1]) ? NUM[m[1]] : parseFloat(m[1]); if (n == null) continue;
      total += n * (m[2][0] === "h" ? 3600 : m[2][0] === "m" ? 60 : 1);
    }
    return Math.round(total);
  }

  // ---------- voice commands ----------
  const say = t => { toast(String(t).slice(0, 28).toUpperCase()); window.jvSpeak && window.jvSpeak(t); };
  const confirmed = () => window.jvConfirm && window.jvConfirm();
  function goTo(k) { const i = PANEL_KEYS.indexOf(k); if (i >= 0) { panel = i; showPanel(); } }

  // Phrase -> action. Returns null when it is not a command, then the AI brain answers (and can still call actions itself).
  function parse(t) {
    let s = t.toLowerCase().replace(/[.,!?"]/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^(hey |ok |okay )?(jarvis |travis )?(please )?(can you |could you |would you |will you )?(please )?/, "").replace(/ please$/, "").trim();
    if (!s) return null;
    const has = re => re.test(s);
    if (askTimerUntil > Date.now()) { const d = parseDur(s); if (d > 0) { askTimerUntil = 0; return { action: "timer_start", seconds: d }; } }
    if (wins.length && (has(/\b(close|clear|dismiss|throw|toss|remove|get rid of)\b.*\b(all|everything|windows)\b/) || has(/\bclear (the |my )?screen\b/))) return { action: "close_window", all: true };
    if (wins.length && has(/^(close|dismiss|throw|toss|remove|delete|trash|put away|get rid of)( it| that| this| the window| this window| that window| away| it away| that away| this one| that one)?$/)) return { action: "close_window" };
    if (has(/^(close|exit|quit|leave|dismiss)\b(?! (it|that|this)\b)/) || has(/\b(close|exit|turn off|shut down) (the )?(vision|camera|hud|screen|jarvis)\b/) || has(/^(go home|back to chat)$/)) return { action: "close" };
    if (has(/\block\b/) && !has(/\bunlock\b/)) return { action: "lock" };
    if (has(/\b(stop|end|cancel|turn off|disable|hide|exit)\b.*\b(scan|scanning|scanner|detection|detecting|objects?)\b/)) return { action: "scan_stop" };
    if (has(/\b(stop|end|hide|turn off|cancel|disable)\b.*\b(face|mesh)\b/)) return { action: "face_mesh", on: false };
    if (has(/\b(face|facial)\b.*\b(scan|mesh|map|lock)\b|\b(scan|map)\b.*\b(my |the )?face\b/)) return { action: "face_mesh", on: true };
    if (has(/\b(stop|cancel|clear|reset|delete|turn off)\b.*\btimer\b/)) return { action: "timer_stop" };
    if (has(/\btimer\b|\bremind me\b|\bcount ?down\b|\bset an? alarm\b/)) {
      const d = parseDur(s);
      const label = has(/\bremind me\b/) ? s.replace(/^.*\bremind me\b/, "").replace(/\b(in|after)\s+half an hour\b/g, "").replace(/\b(in|after|for)\s+(an?|\d+(?:\.\d+)?|[a-z]+)(?:\s+and\s+a\s+half)?\s+(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/g, "").replace(/^\s*(to|that|about)\s+/, "").replace(/\s+/g, " ").trim() : "";
      if (d > 0) return { action: "timer_start", seconds: d, label };
      askTimerUntil = Date.now() + 10000; return { action: "timer_ask" };
    }
    let m;
    if ((m = s.match(/\b(?:pics?|pictures?|photos?|images?)\s+(?:of|for)\s+(.+)$/) || s.match(/\b(?:show|find|get|search|bring up|pull up)(?: me)?(?: some| a few)?\s+(.+?)\s+(?:pics?|pictures?|photos?|images?)$/)))
      return { action: "open_window", window: "pics", query: m[1].replace(/^(a|an|the|some)\s+/, "").replace(/\s+(on (the )?screen|please)$/, "").trim() };
    if (has(/\b(open|show|bring up|pull up|display|overlay)\b.*\b(chat|messages?|conversation)\b/) || has(/\b(chat|messages?) (overlay|window)\b/)) return { action: "open_window", window: "chat" };
    if (has(/\b(open|show|bring up|pull up|display|check|overlay)\b.*\b(e-?mails?|mail|inbox)\b/)) return { action: "open_window", window: "mail" };
    if (has(/\b(compass|which way|what direction|navigation|speedometer|how fast|my speed|where am i)\b/)) return { action: "open_window", window: "nav" };
    if (has(/\b(flash ?light|torch)\b|\bturn (on|off) (the |my )?(light|lamp)\b|\b(light|lamp) (on|off)\b/)) return { action: "flashlight", on: !has(/\b(off|stop|disable)\b/) };
    if (has(/\b(read|translate)\b.*\b(this|that|it|sign|text|page|label|menu|screen|document|writing)\b/) || has(/\bwhat does\b.*\bsay\b/)) {
      const tm = s.match(/\btranslate\b.*?\b(?:in|into|to)\s+([a-z]+)\s*$/);
      return { action: "read", question: has(/\btranslate\b/) ? "Read all the visible text, then translate it into " + (tm ? tm[1] : "English") + ". Give only the translation." : "Read out all the visible text word for word." };
    }
    if (wins.length && has(/\b(zoom in|bigger|larger|enlarge|magnify)\b/)) return { action: "zoom_window", dir: 1 };
    if (wins.length && has(/\b(zoom out|smaller|shrink)\b/)) return { action: "zoom_window", dir: -1 };
    if (wins.length && (m = s.match(/\bmove (?:it|that|this)?\s*(?:to the )?(left|right|up|down|center|middle)\b/))) return { action: "move_window", to: m[1] };
    if (wins.length > 1 && (has(/\b(next|other|another|switch)\b.*\b(window|one)\b/) || has(/^pick another$/))) return { action: "focus_window" };
    if (has(/\b(what|who)\b.*\b(do you see|can you see|am i looking at|am i holding|is this|is that)\b/) || has(/^what('?s| is) (in front of me|here|this|that)\b/) || has(/^(describe|identify|read|look at|tell me about) (this|that|it|what)\b/) || has(/\bwhat do you see\b/)) return { action: "describe", question: t };
    if (has(/\b(scan|detect|identify|recogni[sz]e)\b/)) return { action: "scan_start" };
    if (has(/\b(flip|switch|swap|turn|change|use|open)\b.*\b(camera|cam)\b/) || has(/\b(back|rear|front|selfie) (camera|cam|mode)\b/) || has(/^(selfie|front|rear|back) mode$/))
      return { action: "camera_flip", to: has(/\b(back|rear|environment)\b/) ? "environment" : has(/\b(front|selfie)\b/) ? "user" : "" };
    if (has(/\b(how much|what('?s| is)).*battery|\bbattery (level|percent)/)) return { action: "battery" };
    if (has(/\bwhat('?s| is)? the time\b|\bwhat time is it\b|\bthe time\b$/)) return { action: "time" };
    if (has(/\bwhat('?s| is)( the)? date\b|\bwhat day is it\b|\btoday'?s date\b/)) return { action: "date" };
    if (has(/\b(weather|forecast|temperature|how (hot|cold|warm)|will it rain|is it (going to )?rain)/)) return { action: "weather" };
    if (has(/\b(light|bright) (mode|theme)\b/)) return { action: "theme_light" };
    if (has(/\b(dark|night) (mode|theme)\b/)) return { action: "theme_dark" };
    if (has(/\b(help|what can you do|what can i say|commands)\b/)) return { action: "help" };
    if (has(/^(show|open|go to|switch to|take me to|display)\b.*\b(system|status|stats|battery)\b/)) return { action: "panel", panel: "system" };
    if (has(/^(show|open|go to|switch to|take me to|display)\b.*\b(objects?|scanner)\b/)) return { action: "panel", panel: "objects" };
    if (has(/^(show|open|go to|switch to|take me to|display)\b.*\b(voice|conversation)\b/)) return { action: "panel", panel: "voice" };
    if (has(/^(next|forward|swipe left)( panel| page| screen| one)?$/)) return { action: "next" };
    if (has(/^(previous|prev|back|swipe right|go back)( panel| page| screen| one)?$/)) return { action: "prev" };
    return null;
  }

  function perform(a) {
    if (phase !== "hud") return;
    switch (a.action) {
      case "panel": goTo(a.panel); confirmed(); break;
      case "next": go(1); confirmed(); break;
      case "prev": go(-1); confirmed(); break;
      case "scan_start": scanStart(); break;
      case "scan_stop": scanStop(); break;
      case "describe": describe(a.question); break;
      case "weather": openWin("weather"); getWeather(true); break;
      case "open_window": {
        const w = openWin(a.window || a.kind, a);
        if ((a.window || a.kind) === "pics") say(w && w.empty ? "Which pictures?" : "Here are pictures of " + a.query + ".");
        else confirmed();
        break;
      }
      case "zoom_window": { const w = focused || wins[wins.length - 1]; if (w) zoomWin(w, (a.dir || (a.direction === "out" ? -1 : 1)) > 0 ? 1 : -1, false); break; }
      case "close_window": if (a.all) closeAllWins(false); else if (focused) closeWin(focused, true, 0, -1); confirmed(); break;
      case "move_window": moveWin(a.to); break;
      case "focus_window": if (wins.length > 1) { const i = wins.indexOf(focused); focusWin(wins[(i + 1) % wins.length]); toast("NEXT WINDOW"); } break;
      case "face_mesh": if (a.on === false) meshStop(); else meshStart(); break;
      case "flashlight": torch(a.on !== false); break;
      case "read": describe(a.question || "Read out all the visible text word for word.", { read: true }); break;
      case "timer_start": if (a.seconds > 0) timerStart(a.seconds, a.label); else { askTimerUntil = Date.now() + 10000; say("For how long?"); } break;
      case "timer_ask": goTo("timer"); say("For how long?"); break;
      case "timer_stop": timerStop(); break;
      case "camera_flip": flip(a.to); break;
      case "lock": lock(); break;
      case "close": close(); break;
      case "theme_light": typeof theme === "function" && theme(true); confirmed(); break;
      case "theme_dark": typeof theme === "function" && theme(false); confirmed(); break;
      case "time": say("It's " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "."); break;
      case "date": say("Today is " + new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) + "."); break;
      case "battery": say(batt ? "Battery is at " + Math.round(batt.level * 100) + " percent" + (batt.charging ? " and charging." : ".") : "I can't read the battery on this phone."); break;
      case "help": say('Try: scan my face, read this, compass, flashlight on, remind me in ten minutes to call mum, open my chat, show pictures of lions, check my email, scan, what do you see, weather, timer five minutes, bigger, smaller, move it left, close it, or lock.'); break;
    }
  }

  function handle(text) {                 // called by the voice loop for every sentence you speak
    if (phase === "off") return false;
    const s = String(text).toLowerCase();
    if (phase === "locked" || phase === "loading") { if (/\b(unlock|skip|continue|let me in)\b/.test(s)) { unlock(); return true; } return false; }
    if (phase !== "hud") return false;
    const a = parse(String(text)); if (!a) return false;
    perform(a); return true;
  }

  // what Jarvis heard and said, so you can see why it did (or didn't) do something
  function updSay(now) {
    const u = [...document.querySelectorAll("#chat .m.u .b")].pop(), a = [...document.querySelectorAll("#chat .m.a:not(.wait) .b")].pop();
    const ut = u ? u.textContent.slice(0, 90) : "", at = a ? a.textContent.slice(0, 110) : "";
    if (!sayInit) { sayInit = true; sayU = ut; sayA = at; }
    else if (ut !== sayU || at !== sayA) {
      sayU = ut; sayA = at; sayAt = now; sayEl.replaceChildren();
      if (ut) sayEl.append(el("b", "", "“" + ut + "”")); if (at) sayEl.append(el("i", "", at));
    }
    sayEl.style.opacity = sayAt && now - sayAt < 12000 ? 1 : 0;
  }

  // ---------- extra drawing ----------
  function drawObjects(now) {
    if (!scanOn) return;
    if (now - objAt > 700) objs = [];
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480, { c1, c3 } = colors;
    const sy = ((now % 2600) / 2600) * H, gr = g.createLinearGradient(0, sy - 70, 0, sy);
    gr.addColorStop(0, rgba(c1, 0)); gr.addColorStop(1, rgba(c1, 0.32)); g.fillStyle = gr; g.fillRect(0, sy - 70, W, 70);
    g.strokeStyle = rgba(c1, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke();
    g.font = "600 11px ui-monospace,Menlo,monospace";
    for (const o of objs) {
      const a = map(o.box.originX / vw, o.box.originY / vh), b = map((o.box.originX + o.box.width) / vw, (o.box.originY + o.box.height) / vh);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
      brackets(x, y, w, h, Math.max(8, Math.min(w, h) * 0.2), c3);
      const label = o.name.toUpperCase() + " " + Math.round(o.score * 100) + "%", tw = g.measureText(label).width + 12, ly = Math.max(16, y - 4);
      g.fillStyle = rgba(c3, 0.92); g.fillRect(x, ly - 16, tw, 16);
      g.fillStyle = "#05060b"; g.fillText(label, x + 6, ly - 4);
    }
  }
  function drawTel(now) {
    const { c3 } = colors, d = new Date(), dh = (dockEl && dockEl.offsetHeight) || 240;
    const L = [d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), batt ? "BAT " + Math.round(batt.level * 100) + "%" : "BAT --", navigator.onLine ? "NET OK" : "NET OFF",
      facing === "user" ? "CAM FRONT" : "CAM REAR", "SCAN " + (scanOn ? "ON" : "OFF"), fps + " FPS"];
    g.font = "600 10px ui-monospace,Menlo,monospace"; g.fillStyle = rgba(c3, 0.85); g.textAlign = "left";
    if (meshOn) L.push("FACE " + (meshPts ? "LOCK" : "SEARCH"));
    if (navOn) { L.push("HDG " + (heading == null ? "--" : Math.round(heading) + "°")); L.push("SPD " + Math.round(nav.spd) + " KMH"); }
    if (torchOn) L.push("LIGHT ON");
    const y0 = H - dh - 14 - L.length * 14;
    L.forEach((t, i) => g.fillText(t, 14, y0 + i * 14));
    // mic level (right edge)
    const lvl = parseFloat(document.body.style.getPropertyValue("--l")) || 0, n = 10, lit = Math.round(lvl * n);
    for (let i = 0; i < n; i++) { g.fillStyle = i < lit ? colors.c1 : rgba(c3, 0.2); g.fillRect(W - 22, H - dh - 14 - (i + 1) * 10, 8, 6); }
    g.fillStyle = rgba(c3, 0.85); g.textAlign = "right"; g.fillText("MIC", W - 14, H - dh - 14 - (n + 1) * 10 - 2); g.textAlign = "left";
  }


  // ---------- floating holo windows ----------
  const effScale = w => Math.min(SCALES[w.si], (W * 0.96) / (w.el.offsetWidth || 300));
  function applyWin(w) { w.el.style.transform = "translate(" + Math.round(w.x) + "px," + Math.round(w.y) + "px) scale(" + effScale(w).toFixed(3) + ")"; }
  function clampWin(w, loose) {
    const s2 = effScale(w), bw = w.el.offsetWidth * s2, bh = w.el.offsetHeight * s2;
    w.x = loose ? Math.max(-bw + 60, Math.min(W - 60, w.x)) : bw > W - 8 ? (W - bw) / 2 : Math.max(4, Math.min(W - bw - 4, w.x));
    w.y = loose ? Math.max(50, Math.min(H - 60, w.y)) : Math.max(56, Math.min(H - bh - 4, w.y));
  }
  function winAt(x, y) { const e = document.elementFromPoint(x, y); return e ? wins.find(w => w.el.contains(e)) || null : null; }
  function hotWin(w) { wins.forEach(x => x.el.classList.toggle("hot", x === w)); }
  function focusWin(w) {
    focused = w; w.el.style.zIndex = ++zTop;
    if (zTop > 18) { wins.slice().sort((a, b) => a.el.style.zIndex - b.el.style.zIndex).forEach((x, i) => x.el.style.zIndex = 5 + i); zTop = 5 + wins.length; }
  }
  function grabStart(w, x, y, src) { focusWin(w); grab = { w, src, ox: x - w.x, oy: y - w.y }; gh = [{ t: performance.now(), x, y }]; w.el.classList.add("grab"); }
  function grabMove(x, y, now) {
    const w = grab.w; w.x = x - grab.ox; w.y = y - grab.oy; clampWin(w, true); applyWin(w);
    gh.push({ t: now, x, y }); while (gh.length > 1 && now - gh[0].t > 160) gh.shift();
  }
  function grabEnd() {                                   // let go: a fast flick throws the window away
    if (!grab) return;
    const w = grab.w; grab = null; w.el.classList.remove("grab");
    const a = gh[0], b = gh[gh.length - 1], dt = a && b ? (b.t - a.t) / 1000 : 0;
    if (dt > 0.04) { const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; if (Math.hypot(vx, vy) > 900) { closeWin(w, true, vx, vy); toast("THROWN"); } }
    gh = [];
  }
  function closeWin(w, thrown, vx, vy) {
    const i = wins.indexOf(w); if (i < 0) return;
    wins.splice(i, 1); if (focused === w) focused = wins[wins.length - 1] || null;
    if (grab && grab.w === w) grab = null;
    if (!thrown) { w.el.remove(); return; }
    let n = Math.hypot(vx || 0, vy || 0); if (!n) { vx = -1; vy = 0; n = 1; }
    w.x += (vx / n) * W * 1.2; w.y += (vy / n) * W * 1.2;
    w.el.style.transition = "transform .5s cubic-bezier(.2,.7,.3,1), opacity .5s"; w.el.style.opacity = 0; w.el.style.pointerEvents = "none";
    w.el.style.transform = "translate(" + Math.round(w.x) + "px," + Math.round(w.y) + "px) scale(.5)";
    setTimeout(() => w.el.remove(), 540);
  }
  function closeAllWins(instant) { wins.slice().forEach((w, i) => closeWin(w, !instant, i % 2 ? 1 : -1, -0.4)); }
  function zoomWin(w, d, wrap) {
    let i = w.si + d; if (wrap && i >= SCALES.length) i = 1;
    i = Math.max(0, Math.min(SCALES.length - 1, i)); if (i === w.si) return;
    const bw = w.el.offsetWidth, bh = w.el.offsetHeight, o = effScale(w), cx = w.x + bw * o / 2, cy = w.y + bh * o / 2;
    w.si = i; const n = effScale(w); w.x = cx - bw * n / 2; w.y = cy - bh * n / 2; clampWin(w, false);
    w.el.style.transition = "transform .25s ease, opacity .25s"; applyWin(w);
    setTimeout(() => { w.el.style.transition = "opacity .25s"; }, 280);
    toast("ZOOM " + Math.round(SCALES[i] * 100) + "%");
  }
  function moveWin(to) {
    const w = focused || wins[wins.length - 1]; if (!w) return;
    const bw = w.el.offsetWidth * effScale(w);
    if (to === "left") w.x -= W * 0.4; else if (to === "right") w.x += W * 0.4; else if (to === "up") w.y -= H * 0.2; else if (to === "down") w.y += H * 0.2;
    else { w.x = (W - bw) / 2; w.y = H * 0.2; }
    clampWin(w, false); w.el.style.transition = "transform .3s ease, opacity .25s"; applyWin(w);
    setTimeout(() => { w.el.style.transition = "opacity .25s"; }, 320); confirmed();
  }

  async function fetchPics(q) {
    const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=14&gsrsearch=" +
      encodeURIComponent(q + " filetype:bitmap") + "&prop=imageinfo&iiprop=url|mime&iiurlwidth=480";
    const j = await (await fetch(u)).json();
    return Object.values((j.query || {}).pages || {}).sort((a, b) => a.index - b.index).map(p => (p.imageinfo || [])[0])
      .filter(i => i && /^image\/(jpeg|png|webp)/.test(i.mime) && i.thumburl).map(i => i.thumburl).slice(0, 6);
  }

  function openWin(kind, o) {
    o = o || {};
    if (!["chat", "pics", "weather", "mail", "see", "nav"].includes(kind)) return null;
    if (kind === "pics" && !String(o.query || "").trim()) return { empty: true };
    const ex = ["chat", "weather", "mail", "nav"].includes(kind) && wins.find(w => w.kind === kind);
    if (ex) { focusWin(ex); ex.refresh && ex.refresh(); return ex; }
    while (wins.length >= 3) closeWin(wins[0], true, -1, 0);
    const box = el("div", "vz-win"), head = el("div", "vz-wh"), body = el("div", "vz-wc");
    const q = String(o.query || "").slice(0, 40);
    const w = { kind, el: box, body, x: 0, y: 0, si: 1 };
    const mk = (t, label, fn) => { const b = el("button", "", t); b.setAttribute("aria-label", label); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
    const bar = el("span", "vz-wb");
    bar.append(mk("–", "Smaller", () => zoomWin(w, -1, false)), mk("+", "Bigger", () => zoomWin(w, 1, false)), mk("×", "Close", () => closeWin(w, true, 0, -1)));
    head.append(el("span", "", { chat: "CHAT", pics: "PICS · " + q.toUpperCase().slice(0, 12), weather: "WEATHER", mail: "MAIL", see: "VISION", nav: "COMPASS" }[kind]), bar);
    box.append(head, body);
    box.addEventListener("pointerdown", e => {            // finger drag, same as the hand
      if (e.target.closest("button") || grab) return;
      focusWin(w); try { box.setPointerCapture(e.pointerId); } catch (x) {}
      grabStart(w, e.clientX, e.clientY, "touch");
    });
    box.addEventListener("pointermove", e => { if (grab && grab.src === "touch" && grab.w === w) grabMove(e.clientX, e.clientY, performance.now()); });
    const up = () => { if (grab && grab.src === "touch" && grab.w === w) grabEnd(); };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);

    if (kind === "chat") {
      w.refresh = w.tick = () => {
        const items = [...document.querySelectorAll("#chat .m:not(.wait)")].slice(-6).map(m => ({ u: m.classList.contains("u"), t: ((m.querySelector(".b") || {}).textContent || "").slice(0, 220) }));
        const key = items.map(i => i.u + i.t).join("|"); if (key === w.key) return; w.key = key;
        body.replaceChildren();
        if (!items.length) body.append(el("p", "vz-cm", "No messages yet. Just talk to me."));
        items.forEach(i => { const p = el("p", "vz-cm"); p.append(el("b", "", i.u ? "YOU" : "JARVIS"), document.createTextNode(i.t)); body.append(p); });
      };
      w.refresh();
    } else if (kind === "pics") {
      body.append(el("p", "vz-cm", "Searching…"));
      fetchPics(q).then(urls => {
        body.replaceChildren();
        if (!urls.length) { body.append(el("p", "vz-cm", "No pictures found for " + q + ".")); return; }
        const grid = el("div", "vz-grid");
        urls.forEach(u => { const im = el("img"); im.src = u; im.alt = q; im.referrerPolicy = "no-referrer"; im.onerror = () => im.remove(); grid.append(im); });
        body.append(grid, el("p", "vz-src", "WIKIMEDIA COMMONS"));
      }).catch(() => { body.replaceChildren(el("p", "vz-cm", "Couldn't load pictures right now.")); });
    } else if (kind === "weather") {
      w.refresh = w.tick = () => {
        const key = wx ? wx.at : wxBusy ? "b" : wxErr; if (key === w.key) return; w.key = key;
        body.replaceChildren();
        if (wx) { const d = wx.desc.charAt(0).toUpperCase() + wx.desc.slice(1); body.append(el("div", "vz-wbig", wx.temp + "°"), el("p", "vz-cm", d + (wx.place ? " · " + wx.place : "")), el("p", "vz-cm", "High " + wx.hi + "°  ·  Low " + wx.lo + "°  ·  Rain " + wx.rain + "%")); }
        else body.append(el("p", "vz-cm", wxBusy ? "Finding you…" : wxErr || "Getting weather…"));
      };
      w.refresh(); if (!wx && !wxBusy) getWeather(false);
    } else if (kind === "mail") {
      w.refresh = async () => {
        body.replaceChildren(el("p", "vz-cm", "Checking inbox…"));
        try {
          const d = await post("/api/mail", { action: "inbox" }); body.replaceChildren();
          if (!d.emails.length) body.append(el("p", "vz-cm", "No unread emails."));
          d.emails.slice(0, 5).forEach(m => { const p = el("p", "vz-cm"); p.append(el("b", "", String(m.from).replace(/<.*>/, "").trim().slice(0, 22).toUpperCase()), document.createTextNode(String(m.subject).slice(0, 70))); body.append(p); });
        } catch (e) { body.replaceChildren(el("p", "vz-cm", String(e.message || "Mail not available").slice(0, 100))); }
      };
      w.refresh();
    } else if (kind === "nav") {
      w.refresh = w.tick = () => {
        const key = [navOn, navNeedTap, heading == null ? -1 : Math.round(heading), Math.round(nav.spd), nav.alt == null ? "" : Math.round(nav.alt)].join("|");
        if (key === w.key) return; w.key = key; body.replaceChildren();
        if (!navOn) {
          body.append(el("p", "vz-cm", navNeedTap ? "Tap the button to allow the compass." : "Compass is off."));
          const b = el("button", "vz-act", "ENABLE COMPASS"); b.onclick = () => navStart(true).then(() => { w.key = ""; w.refresh(); }); body.append(b); return;
        }
        body.append(el("div", "vz-wbig", heading == null ? "--" : Math.round(heading) + "° " + CARD[Math.round(heading / 45) % 8]));
        body.append(el("p", "vz-cm", "Speed " + Math.round(nav.spd) + " km/h" + (nav.alt != null ? "  ·  Altitude " + Math.round(nav.alt) + " m" : "")));
        if (heading == null) body.append(el("p", "vz-src", "HOLD THE PHONE FLAT FOR THE COMPASS"));
      };
      w.refresh(); navStart(false).then(() => w.refresh && w.refresh());
    } else if (kind === "see") {
      const im = el("img", "big"); im.src = o.img; const tx = el("p", "vz-cm", "Looking…"); body.append(im, tx);
      w.set = t => { tx.textContent = t; };
    }

    root.append(box); box.style.opacity = 0;
    const n = wins.length, bw = box.offsetWidth;
    w.x = Math.max(8, (W - bw) / 2 + (n - 1) * 26); w.y = H * 0.17 + n * 34; wins.push(w); focusWin(w); clampWin(w, false); applyWin(w);
    requestAnimationFrame(() => { box.style.opacity = 1; });
    return w;
  }


  // ---------- face mesh ----------
  const makeMesh = () => make(mp.FaceLandmarker, { baseOptions: { modelAssetPath: FACE_LM_MODEL }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: false });
  async function meshStart() {
    if (meshOn) return;
    if (scanOn) { scanOn = false; objs = []; }
    goTo("objects"); toast("FACE SCAN"); say("Face scan on. Look at the camera.");
    meshOn = true; meshPts = null;
    try {
      if (facing !== "user") await setCamera("user");
      if (!meshDet) { toast("LOADING FACE MODEL"); meshDet = await makeMesh(); }
    } catch (e) { meshOn = false; toast("FACE SCAN FAILED"); say("The face scanner could not start."); }
  }
  function meshStop() { if (!meshOn) return; meshOn = false; meshPts = null; toast("FACE SCAN OFF"); confirmed(); }
  function drawMesh(now) {
    if (!meshOn) return;
    if (now - meshAt > 600) meshPts = null;
    if (!meshPts) return;
    const P = meshPts.map(l => map(l.x, l.y)), LM = mp && mp.FaceLandmarker;
    const lines = (list, col, lw) => {
      if (!list) return; g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (const c of list) { const a = P[c.start], b = P[c.end]; if (a && b) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } }
      g.stroke();
    };
    lines(LM && LM.FACE_LANDMARKS_TESSELATION, rgba(colors.c3, 0.26), 1);
    lines(LM && LM.FACE_LANDMARKS_CONTOURS, rgba(colors.c1, 0.95), 1.6);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    brackets(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24, Math.min(x1 - x0, y1 - y0) * 0.18, colors.c3);
    g.font = "600 11px ui-monospace,Menlo,monospace"; g.fillStyle = colors.c3; g.fillText("FACE LOCK", x0 - 12, y0 - 18);
  }

  // ---------- compass + speed ----------
  function onOri(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;          // iPhone
    else if ((e.absolute === true || e.type === "deviceorientationabsolute") && e.alpha != null) h = (360 - e.alpha) % 360;   // Android
    if (h == null || isNaN(h)) return;
    if (heading == null) heading = h; else heading = (heading + ((((h - heading) % 360) + 540) % 360 - 180) * 0.25 + 360) % 360;
  }
  function onPos(p) { nav.spd = Math.max(0, (p.coords.speed || 0) * 3.6); nav.alt = p.coords.altitude; nav.acc = p.coords.accuracy; }
  async function navStart(gesture) {
    if (navOn) return true;
    const DO = window.DeviceOrientationEvent;
    if (DO && typeof DO.requestPermission === "function") {                 // iPhone asks first, and only after a real tap
      if (!gesture) { navNeedTap = true; return false; }
      try { if ((await DO.requestPermission()) !== "granted") throw 0; } catch (e) { toast("COMPASS DENIED"); return false; }
    }
    navNeedTap = false; heading = null;
    addEventListener("deviceorientationabsolute", onOri, true); addEventListener("deviceorientation", onOri, true);
    try { if (navigator.geolocation) geoId = navigator.geolocation.watchPosition(onPos, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }); } catch (e) {}
    navOn = true; return true;
  }
  function navStop() {
    removeEventListener("deviceorientationabsolute", onOri, true); removeEventListener("deviceorientation", onOri, true);
    if (geoId != null) { try { navigator.geolocation.clearWatch(geoId); } catch (e) {} geoId = null; }
    navOn = false; heading = null; nav = { spd: 0, alt: null, acc: null };
  }
  function drawCompass() {
    if (!navOn || heading == null) return;
    const y = 118, w = Math.min(W - 40, 320), pp = w / 120, { c3 } = colors;
    g.save(); g.beginPath(); g.rect((W - w) / 2, y - 4, w, 32); g.clip();
    g.strokeStyle = rgba(c3, 0.85); g.fillStyle = rgba(c3, 0.95); g.font = "600 10px ui-monospace,Menlo,monospace"; g.textAlign = "center"; g.lineWidth = 1;
    for (let d = Math.floor(heading - 60); d <= heading + 60; d++) {
      if (d % 5) continue;
      const dd = ((d % 360) + 360) % 360, x = W / 2 + (d - heading) * pp;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (dd % 15 === 0 ? 10 : 5)); g.stroke();
      if (dd % 45 === 0) g.fillText(CARD[dd / 45], x, y + 23);
    }
    g.restore();
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(W / 2, y - 3); g.lineTo(W / 2 - 5, y - 10); g.lineTo(W / 2 + 5, y - 10); g.fill();
    g.font = "700 12px ui-monospace,Menlo,monospace"; g.textAlign = "center"; g.fillText(Math.round(heading) + "°", W / 2, y - 14); g.textAlign = "left";
  }

  // ---------- flashlight (Android Chrome; the back camera's light) ----------
  async function torch(on) {
    try {
      if (on && facing === "user") await setCamera("environment");
      const tr = stream && stream.getVideoTracks()[0], cap = tr && tr.getCapabilities ? tr.getCapabilities() : {};
      if (!cap.torch) { torchOn = false; say("This phone or browser can't control the flashlight."); return; }
      await tr.applyConstraints({ advanced: [{ torch: !!on }] }); torchOn = !!on; toast(on ? "LIGHT ON" : "LIGHT OFF"); confirmed();
    } catch (e) { torchOn = false; say("The flashlight didn't respond."); }
  }

  window.jvCommand = handle;
  window.jvActions = list => { try { list.forEach(a => perform(a)); } catch (e) {} };
  window.Vision = { open, close, lock, isOpen: () => phase !== "off", command: handle };
})();
