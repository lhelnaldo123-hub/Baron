// Jarvis Skins: Classic, Hologram, Dashboard, Core. Draws behind the app, reads its state and voice level.
(() => {
  "use strict";
  if (window.Skin) return;
  const MODES = ["classic", "hologram", "dashboard", "core"];
  const NAMES = { classic: "Classic", hologram: "Hologram", dashboard: "Dashboard", core: "Core" };
  const ls = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let mode = ls.get("jv-skin", "classic"), prev = "classic";
  if (!MODES.includes(mode)) mode = "classic";
  const t0 = Date.now();

  // ---- per-voice look: every voice gets its own hologram colour and style ----
  const hash = s => { let h = 7; for (const c of s || "default") h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const voiceId = () => ls.get("jv-voice", "");
  function look() {
    const id = voiceId(), h = hash(id), saved = ls.get("jv-look_" + id, "");
    const g = saved || (!id ? "m" : h % 2 ? "f" : "m");
    return { g, hue: id ? [195, 215, 170, 265, 300, 150][h % 6] : 200 };
  }

  // ---- canvas ----
  const cv = document.createElement("canvas");
  cv.id = "skin"; cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:-1;display:none;pointer-events:none";
  document.body.prepend(cv);
  const g = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", size); size();

  const css = document.createElement("style");
  css.textContent = `html.sk{background:#02050d}
body.sk{background:transparent!important}
body.sk .orb i,body.sk .bars,body.sk .ring{display:none}
body.sk .orbw{width:64px!important}
body.sk .orb{background:#06142acc;border:1.5px solid var(--c3);box-shadow:0 0 28px -4px var(--c1)}
body.sk #chat{flex:0 0 auto!important;max-height:24vh;margin-top:auto;mask-image:linear-gradient(transparent,#000 22%)}
body.sk header .title span,body.sk #chat:empty::before{display:none}
#skbtns{display:flex;gap:.4rem;flex-wrap:wrap}#skbtns button{flex:1;min-width:30%}
#skbtns button.on,#skg button.on{background:#1b5cff!important;color:#fff}`;
  document.head.append(css);

  // ---- helpers ----
  const stateNow = () => document.body.dataset.s || "idle";
  const lvl = () => parseFloat(getComputedStyle(document.body).getPropertyValue("--l")) || 0;
  let L = 0;
  const col = (hue, a = 1, l = 60) => `hsla(${hue},100%,${l}%,${a})`;
  function stateHue(base) { const s = stateNow(); return s === "think" ? 275 : s === "listen" ? 175 : s === "speak" ? base : base; }

  function glass(x, y, w, h, hue, title, a = 1) {
    g.save(); g.globalAlpha = a;
    g.fillStyle = col(hue, .08, 50); g.strokeStyle = col(hue, .55, 62); g.lineWidth = 1;
    g.shadowColor = col(hue, .8); g.shadowBlur = 12;
    g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill(); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = col(hue, .9, 75); g.font = `600 ${Math.max(9, w * .075)}px system-ui,sans-serif`; g.fillText(title, x + 10, y + 16);
    g.restore();
  }
  function lines(x, y, w, n, hue, seed) {
    for (let i = 0; i < n; i++) {
      const lw = w * (.45 + .5 * Math.abs(Math.sin(seed + i * 1.7)));
      g.fillStyle = col(hue, .35, 70); g.fillRect(x, y + i * 11, lw, 3);
    }
  }
  function wave(x, y, w, h, hue, t) {
    g.strokeStyle = col(hue, .9, 70); g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i <= 40; i++) { const px = x + w * i / 40, a = (.12 + L * .9) * Math.sin(i * .9 + t * 6) * Math.sin(i / 40 * Math.PI); i ? g.lineTo(px, y + a * h / 2) : g.moveTo(px, y + a * h / 2); }
    g.stroke();
  }
  function ring(cx, cy, r, hue, t, segs, lw, speed, a = 1) {
    g.lineWidth = lw; g.strokeStyle = col(hue, a, 62);
    for (let i = 0; i < segs; i++) {
      const s = t * speed + i * Math.PI * 2 / segs, len = Math.PI * 2 / segs * .62;
      g.beginPath(); g.arc(cx, cy, r, s, s + len); g.stroke();
    }
  }
  function platform(cx, y, w, hue, t) {
    for (let i = 0; i < 4; i++) {
      const k = 1 - i * .2 + Math.sin(t * 2 + i) * .02;
      g.strokeStyle = col(hue, .8 - i * .15, 62); g.lineWidth = 1.5;
      g.shadowColor = col(hue, 1); g.shadowBlur = 14;
      g.beginPath(); g.ellipse(cx, y, w * k, w * k * .16, 0, 0, 7); g.stroke();
    }
    g.shadowBlur = 0;
  }
  const parts = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), s: .02 + Math.random() * .06 }));
  function motes(hue, dt) {
    for (const p of parts) { p.y -= p.s * dt; if (p.y < 0) { p.y = 1; p.x = Math.random(); }
      g.fillStyle = col(hue, .55 * p.y, 75); g.fillRect(p.x * W, p.y * H, 1.6, 1.6); }
  }
  function backdrop(hue, t) {
    const gr = g.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, H * .9);
    gr.addColorStop(0, col(hue, .35, 30)); gr.addColorStop(1, "#02050d"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = col(hue, .06, 60); g.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const y = H * .62 + (H * .38) * Math.pow(i / 12, 2); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }

  // ---- HOLOGRAM: stylized glowing human, mouth and glow follow the voice ----
  function figure(cx, base, hgt, hue, fem, t) {
    const s = hgt / 100, sy = stateNow();
    g.save(); g.translate(cx, base); g.scale(s, s);
    // body path (units: 100 tall, origin at feet-line below shoulders)
    const sh = fem ? 36 : 44, hw = fem ? 15 : 17.5;
    const body = new Path2D();
    body.moveTo(-sh, 0); body.bezierCurveTo(-sh, -14, -26, -20, -9, -24);
    body.lineTo(-7, -30); body.bezierCurveTo(-hw - 2, -34, -hw - 4, -50, -hw, -64);
    body.bezierCurveTo(-hw + 1, -80, -8, -92, 0, -92); body.bezierCurveTo(8, -92, hw - 1, -80, hw, -64);
    body.bezierCurveTo(hw + 4, -50, hw + 2, -34, 7, -30); body.lineTo(9, -24);
    body.bezierCurveTo(26, -20, sh, -14, sh, 0); body.closePath();
    if (fem) { // long hair behind shoulders
      const hr = new Path2D(); hr.moveTo(-hw - 1, -78); hr.bezierCurveTo(-30, -70, -34, -30, -30, -2); hr.lineTo(-hw - 3, -22);
      hr.lineTo(-hw, -60); hr.closePath(); hr.moveTo(hw + 1, -78); hr.bezierCurveTo(30, -70, 34, -30, 30, -2); hr.lineTo(hw + 3, -22); hr.lineTo(hw, -60); hr.closePath();
      g.fillStyle = col(hue, .22, 55); g.strokeStyle = col(hue, .7, 65); g.lineWidth = .7; g.fill(hr); g.stroke(hr);
    }
    const gr = g.createLinearGradient(0, -95, 0, 2);
    gr.addColorStop(0, col(hue, .55, 70)); gr.addColorStop(.6, col(hue, .22, 50)); gr.addColorStop(1, col(hue, .04, 40));
    g.shadowColor = col(hue, 1); g.shadowBlur = 18 + L * 30;
    g.fillStyle = gr; g.strokeStyle = col(hue, .95, 72); g.lineWidth = 1; g.fill(body); g.stroke(body); g.shadowBlur = 0;
    g.save(); g.clip(body);
    // contour lines
    g.strokeStyle = col(hue, .28, 70); g.lineWidth = .35;
    for (let y = -92; y < 0; y += 3.2) { g.beginPath(); g.moveTo(-60, y); g.lineTo(60, y); g.stroke(); }
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(0, -62, Math.abs(hw * (i / 3.4)) + .01, 28, 0, 0, 7); g.stroke(); }
    // collar / suit lines
    g.strokeStyle = col(hue, .8, 75); g.lineWidth = .8; g.beginPath(); g.moveTo(-9, -24); g.lineTo(0, -10); g.lineTo(9, -24); g.stroke();
    g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 0); g.stroke();
    // scan sweep
    const sy2 = -95 + ((t * 28) % 100);
    const sw = g.createLinearGradient(0, sy2 - 6, 0, sy2 + 6); sw.addColorStop(0, "transparent"); sw.addColorStop(.5, col(hue, .55, 85)); sw.addColorStop(1, "transparent");
    g.fillStyle = sw; g.fillRect(-60, sy2 - 6, 120, 12);
    g.restore();
    // face: eyes + mouth
    const blink = (t % 4.2) < .12 ? .25 : 1, ey = -66;
    g.fillStyle = col(sy === "think" ? 290 : 185, 1, 85); g.shadowColor = col(185, 1); g.shadowBlur = 8;
    for (const ex of [-6, 6]) { g.beginPath(); g.ellipse(ex, ey, 2.6, 1.1 * blink + .2, 0, 0, 7); g.fill(); }
    g.shadowBlur = 0; g.strokeStyle = col(hue, .9, 80); g.lineWidth = .9;
    const open = Math.min(1, L * 1.6) * 3.2;
    g.beginPath(); g.ellipse(0, -52, 4.2 + L * 1.2, .5 + open, 0, 0, 7); g.stroke();
    if (open > .4) { g.fillStyle = col(hue, .35, 70); g.fill(); }
    // nose line
    g.strokeStyle = col(hue, .4, 75); g.lineWidth = .5; g.beginPath(); g.moveTo(0, -64); g.lineTo(-1.2, -57); g.lineTo(1.2, -57); g.stroke();
    g.restore();
  }
  function drawHolo(t, dt) {
    const lk = look(), hue = stateHue(lk.hue), fem = lk.g === "f";
    backdrop(hue, t);
    const wide = W > 760, cx = W / 2, base = H * (wide ? .72 : .6), hg = Math.min(H * .62, wide ? 520 : 330);
    platform(cx, base + 6, hg * .42, hue, t);
    // beam
    const bm = g.createLinearGradient(0, base - hg, 0, base); bm.addColorStop(0, "transparent"); bm.addColorStop(1, col(hue, .13, 60));
    g.fillStyle = bm; g.beginPath(); g.moveTo(cx - hg * .3, base - hg); g.lineTo(cx + hg * .3, base - hg); g.lineTo(cx + hg * .42, base); g.lineTo(cx - hg * .42, base); g.fill();
    const fl = 1 - (Math.random() < .015 ? .25 : 0);
    g.globalAlpha = fl; figure(cx, base - hg * .02 + Math.sin(t * 1.3) * 3, hg * 1.02, hue, fem, t); g.globalAlpha = 1;
    // floating panels
    const pw = Math.min(W * (wide ? .2 : .34), 200), ph = pw * .72, bob = k => Math.sin(t * .9 + k) * 5;
    const pos = wide ? [[cx - hg * .75 - pw, base - hg * .95], [cx - hg * .62 - pw, base - hg * .45], [cx + hg * .75, base - hg * .95], [cx + hg * .62, base - hg * .45]]
                     : [[6, H * .2], [W - pw - 6, H * .2], [6, H * .36], [W - pw - 6, H * .36]];
    const lab = ["Voice", "Tasks", "Analytics", "Status"];
    pos.forEach(([x, y], i) => {
      y += bob(i * 1.7); glass(x, y, pw, ph, hue, lab[i], .85);
      if (i === 0) wave(x + 8, y + ph * .6, pw - 16, ph * .5, hue, t);
      if (i === 1) { for (let k = 0; k < 3; k++) { g.strokeStyle = col(hue, .8, 70); g.strokeRect(x + 10, y + 26 + k * 14, 8, 8); if (k < 2) { g.fillStyle = col(hue, .9, 70); g.fillRect(x + 12, y + 28 + k * 14, 4, 4); } lines(x + 24, y + 28 + k * 14, pw - 40, 1, hue, k + i); } }
      if (i === 2) for (let k = 0; k < 7; k++) { const bh = (.25 + .6 * Math.abs(Math.sin(k * 1.3 + t * (stateNow() === "idle" ? .3 : 1.5) + L * 2))) * ph * .5; g.fillStyle = col(hue, .7, 65); g.fillRect(x + 12 + k * (pw - 24) / 7, y + ph - 10 - bh, (pw - 24) / 7 - 4, bh); }
      if (i === 3) { const st = stateNow(); g.fillStyle = col(hue, .9, 80); g.font = `700 ${pw * .11}px system-ui,sans-serif`; g.fillText(st === "idle" ? "STANDBY" : st === "listen" ? "LISTENING" : st === "think" ? "THINKING" : "SPEAKING", x + 10, y + ph * .6); lines(x + 10, y + ph * .72, pw - 20, 2, hue, 3); }
    });
    motes(hue, dt);
    g.fillStyle = col(hue, .85, 80); g.font = "600 11px system-ui,sans-serif"; g.textAlign = "center";
    g.fillText(ls.get("jv-vname", "") || "JARVIS", cx, base + 28); g.textAlign = "left";
  }

  // ---- CORE (Jarvix rings) ----
  function drawCore(t, dt) {
    const hue = stateHue(205); backdrop(hue, t);
    const cx = W / 2, cy = H * .42, R = Math.min(W, H * .8) * .36 * (1 + L * .06);
    g.shadowColor = col(hue, 1); g.shadowBlur = 20;
    ring(cx, cy, R, hue, t, 6, 6, .5); ring(cx, cy, R * .86, hue, t, 3, 3, -.8, .8); ring(cx, cy, R * .72, hue, t, 40, 5, .3, .7);
    ring(cx, cy, R * 1.12, hue, t, 90, 2, .1, .5); ring(cx, cy, R * .58, hue, t, 2, 2, 1.2);
    g.shadowBlur = 0;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * .55); gr.addColorStop(0, col(hue, .45 + L * .4, 55)); gr.addColorStop(1, "transparent");
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * .55, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = `700 ${R * .26}px system-ui,sans-serif`; g.shadowColor = col(hue, 1); g.shadowBlur = 16;
    g.fillText("JARVIS", cx, cy + R * .09); g.shadowBlur = 0;
    g.font = `500 ${R * .08}px system-ui,sans-serif`; g.fillStyle = col(hue, 1, 80); g.fillText("YOUR PERSONAL AI ASSISTANT", cx, cy + R * .24); g.textAlign = "left";
    platform(cx, cy + R * 1.35, R * .9, hue, t); motes(hue, dt);
  }

  // ---- DASHBOARD (Mark 85 diagnostics) ----
  let storage = "--";
  try { navigator.storage.estimate().then(e => storage = Math.round(e.usage / e.quota * 100 * 10) / 10 + "%"); } catch (e) {}
  function drawDash(t, dt) {
    const hue = stateHue(200); backdrop(hue, t);
    const wide = W > 760, cx = wide ? W * .62 : W / 2, cy = wide ? H * .45 : H * .34, R = Math.min(wide ? H * .3 : W * .3, 230) * (1 + L * .06);
    // sphere
    const gr = g.createRadialGradient(cx, cy, R * .1, cx, cy, R); gr.addColorStop(0, col(hue, .5, 60)); gr.addColorStop(.7, col(hue, .12, 40)); gr.addColorStop(1, "transparent");
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = col(hue, .5, 70); g.lineWidth = .8;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(cx, cy, R * Math.abs(Math.cos(t * .3 + i * .52)), R, 0, 0, 7); g.stroke(); }
    g.save(); g.translate(cx, cy); g.rotate(-.4); g.strokeStyle = "#ffb64a"; g.shadowColor = "#ff9a1f"; g.shadowBlur = 12; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 0, R * 1.18, R * .45, t * .3, 0, 7); g.stroke(); g.restore(); g.shadowBlur = 0;
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = `800 ${R * .3}px system-ui,sans-serif`; g.shadowColor = col(hue, 1); g.shadowBlur = 14;
    g.fillText("JARVIS", cx, cy + R * .08); g.shadowBlur = 0;
    g.font = `600 ${R * .1}px ui-monospace,monospace`; g.fillStyle = col(hue, 1, 80); g.fillText("AI CORE", cx, cy + R * .24); g.textAlign = "left";
    platform(cx, cy + R * 1.3, R * 1.1, hue, t);
    // stats
    const up = Math.floor((Date.now() - t0) / 60000), mem = (() => { try { return JSON.parse(ls.get("jv-memory", "[]")).length; } catch (e) { return 0; } })();
    const st = stateNow(), vn = ls.get("jv-vname", "") || (voiceId() ? "Custom" : "Default");
    const rows = [["AI MODEL", "Active"], ["VOICE", vn], ["MEMORY", mem + " notes"], ["STORAGE", storage], ["UPTIME", up + " min"], ["STATUS", st === "idle" ? "ONLINE" : st.toUpperCase()]];
    const x = wide ? W * .06 : 14, y0 = wide ? H * .2 : H * .55, rw = wide ? 300 : W - 28;
    g.fillStyle = col(hue, 1, 85); g.font = "800 22px system-ui,sans-serif"; g.fillText("MARK 85", x, y0 - 30);
    g.font = "600 10px system-ui,sans-serif"; g.fillStyle = col(hue, .8, 70); g.fillText("SYSTEM DIAGNOSTICS", x, y0 - 14);
    const n = wide ? rows.length : 4;
    rows.slice(0, n).forEach(([a, b], i) => {
      const y = y0 + i * (wide ? 52 : 30);
      g.strokeStyle = col(hue, .5, 62); g.fillStyle = col(hue, .1, 50); g.beginPath(); g.roundRect(x, y, rw, wide ? 42 : 24, 6); g.fill(); g.stroke();
      g.fillStyle = col(hue, 1, 85); g.font = "700 11px system-ui,sans-serif"; g.fillText(a, x + 12, y + (wide ? 18 : 15));
      g.fillStyle = col(hue, .9, 70); g.textAlign = "right"; g.fillText(b, x + rw - 12, y + (wide ? 18 : 15)); g.textAlign = "left";
    });
    // listening strip
    const sx = wide ? W * .38 : 14, sw = wide ? W * .5 : W - 28, sy = H - (wide ? 150 : 210);
    wave(sx, sy, sw, 44, hue, t); motes(hue, dt);
    g.font = "700 10px ui-monospace,monospace"; ["LISTENING", "THINKING", "PLANNING", "EXECUTING"].forEach((a, i) => {
      const on = (a === "LISTENING" && st === "listen") || (a === "THINKING" && st === "think") || (a === "EXECUTING" && st === "speak");
      g.fillStyle = on ? "#fff" : col(hue, .45, 70); g.fillText(a, sx + i * (sw / 4), sy + 36);
    });
  }

  // ---- loop ----
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (mode === "classic" || document.hidden) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now; const t = (Date.now() - t0) / 1000;
    L += (lvl() - L) * .5;
    g.clearRect(0, 0, W, H);
    (mode === "hologram" ? drawHolo : mode === "core" ? drawCore : drawDash)(t, dt);
  }
  requestAnimationFrame(frame);

  // ---- switching ----
  function apply(m, say) {
    if (!MODES.includes(m)) return;
    if (m !== mode) prev = mode;
    mode = m; ls.set("jv-skin", m);
    const sk = m !== "classic";
    document.documentElement.classList.toggle("sk", sk); document.body.classList.toggle("sk", sk);
    cv.style.display = sk ? "block" : "none";
    document.querySelectorAll("#skbtns button").forEach(b => b.classList.toggle("on", b.dataset.m === m));
    const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = sk ? "#02050d" : "#07080d";
    document.querySelectorAll("#skg button").forEach(b => b.classList.toggle("on", b.dataset.g === look().g));
    if (say) { const s = document.getElementById("st"); if (s) s.textContent = NAMES[m] + " mode"; }
  }
  function command(txt) {
    const s = String(txt).toLowerCase().replace(/[.,!?]/g, "");
    if (/\b(switch|go|change)\b.*\b(back|previous|before)\b|\bgo back to (the )?(last|previous) mode\b/.test(s)) { apply(prev, 1); return true; }
    const m = s.match(/\b(classic|normal|orb|hologram|holographic|dashboard|diagnostics|core|rings?)\b.*\bmode\b|\b(?:switch|change|go|turn)\b.*\b(?:to|into)\b.*\b(classic|normal|orb|hologram|holographic|dashboard|diagnostics|core|rings?)\b/);
    if (m) {
      const w = m[1] || m[2];
      apply(/holo/.test(w) ? "hologram" : /dash|diag/.test(w) ? "dashboard" : /core|ring/.test(w) ? "core" : "classic", 1); return true;
    }
    if (/\b(female|woman|lady)\b.*\b(hologram|look|avatar)\b|\bhologram\b.*\b(female|woman)\b/.test(s)) { setGender("f"); return true; }
    if (/\b(male|man|guy)\b.*\b(hologram|look|avatar)\b|\bhologram\b.*\b(male|man)\b/.test(s)) { setGender("m"); return true; }
    return false;
  }
  function setGender(x) { ls.set("jv-look_" + voiceId(), x); apply(mode === "classic" ? "hologram" : mode, 1); }

  // ---- settings UI + quick button ----
  function ui() {
    const card = document.querySelector("#sheet .card"), voiceSel = document.getElementById("vsel");
    if (card && voiceSel) {
      const box = document.createElement("div");
      box.innerHTML = `<label>Look</label><div class="seg" id="skbtns">${MODES.map(m => `<button data-m="${m}">${NAMES[m]}</button>`).join("")}</div>
<label>Hologram for this voice</label><div class="seg" id="skg"><button data-g="m">Male</button><button data-g="f">Female</button></div>`;
      voiceSel.previousElementSibling.before(box);
      box.querySelectorAll("#skbtns button").forEach(b => b.onclick = () => apply(b.dataset.m));
      box.querySelectorAll("#skg button").forEach(b => b.onclick = () => setGender(b.dataset.g));
      voiceSel.addEventListener("change", () => { const o = voiceSel.selectedOptions[0]; ls.set("jv-vname", o && o.value ? o.textContent : ""); apply(mode); });
      const o = voiceSel.selectedOptions[0]; ls.set("jv-vname", o && o.value ? o.textContent : "");
    }
    const hr = document.querySelector(".hr");
    if (hr) { const b = document.createElement("button"); b.className = "ib"; b.setAttribute("aria-label", "Change look");
      b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
      b.onclick = () => apply(MODES[(MODES.indexOf(mode) + 1) % MODES.length], 1); hr.prepend(b); }
    apply(mode);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ui) : ui();
  window.Skin = { set: apply, command, modes: MODES };
})();
