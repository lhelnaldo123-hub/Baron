// Jarvis 3D avatar. Loads /jarvis.glb (a rigged human with a full skeleton), draws it as a blue hologram,
// and drives the bones from code: idle, listening, thinking, speaking (lip-sync from the voice audio),
// arm/head/face gestures and full-body turning. If anything fails to load, the old 2D hologram stays.
(() => {
  "use strict";
  if (window.Avatar) return;

  // ---------- tuning knobs (change these if a movement looks wrong on your model) ----------
  const CFG = {
    model: "/jarvis.glb",
    height: 1.75,          // model is scaled to this many units tall
    jawMax: 0.34,          // radians the jaw opens at full volume
    blinkAngle: 0.55,      // eyelid close angle
    palmRoll: 1.3,         // forearm twist for "show your palms" (flip the sign if palms face the wrong way)
    faceBones: true,       // set false to turn off all face-bone movement (brows, lids, lips, corners)
    logo: true,            // chest logo
    logoOffset: 0.075,     // how far in front of the chest the logo floats (fraction of height)
    fps: 40
  };

  const state = { ready: false, anim: "idle", err: "" };
  const $ = s => document.querySelector(s);
  const skinEl = document.getElementById("skin");        // the old 2D boy: hidden from the start so it never flashes before the 3D one
  if (skinEl) skinEl.style.display = "none"; window.__noSkinDraw = true;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = p => p * p * (3 - 2 * p);

  let T, scene, camera, renderer, yawG, fixG, bones = {}, rest = {}, H = 1.75, uTime = { value: 0 };
  let cv, last = 0, t0 = performance.now();
  let ball = null;                                       // the hologram ball for "kick a ball"
  const LEG = { ok: false, R: null, L: null, rd: { R: null, L: null } };
  const A = { // controller state
    yaw: 0, yawTarget: 0, spinLeft: 0,
    arms: { R: { mode: "idle", until: 0, t0: 0 }, L: { mode: "idle", until: 0, t0: 0 } },
    cur: { R: null, L: null },
    look: { yaw: 0, pitch: 0, tilt: 0 }, lookT: { yaw: 0, pitch: 0, tilt: 0 }, lookUntil: 0,
    headGest: { a: "", until: 0, t0: 0 },
    expr: { smile: 0, surprise: 0, sad: 0, confused: 0 }, exprName: "neutral", exprUntil: 0,
    blink: 0, nextBlink: 2, blinkT: -1,
    eye: { x: 0, y: 0, tx: 0, ty: 0, next: 1 },
    legs: { R: { mode: "idle", until: 0, t0: 0 }, L: { mode: "idle", until: 0, t0: 0 } }, curL: { R: null, L: null },
    queue: [], act: null, ball: null, busyUntil: 0, pendingDone: false, awaitingUntil: 0, quiet: false,
    nextBeat: 4, mouth: { open: 0, round: 0, wide: 0 }, breathe: 0, cmdUntil: 0
  };

  // =====================================================================================
  //  Three.js loading
  // =====================================================================================
  async function boot() {
    cv = document.createElement("canvas");
    cv.id = "avatar3d";
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;" +
      "background:radial-gradient(ellipse at 50% 108%,#0b4aa8 0%,#06204a 38%,#02050d 78%)";
    document.body.prepend(cv);
    T = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");

    renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new T.AmbientLight(0x6fa8ff, 1.1));
    const key = new T.DirectionalLight(0x9fe6ff, 2.2); key.position.set(1.2, 2.2, 2.5); scene.add(key);
    const rim = new T.DirectionalLight(0x2a6bff, 2.6); rim.position.set(-2, 1.5, -2); scene.add(rim);

    yawG = new T.Group(); yawG.rotation.order = "YXZ"; fixG = new T.Group(); yawG.add(fixG); scene.add(yawG);   // YXZ: flips and rolls tip him forward or backward in his own direction
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CFG.model);
    const model = gltf.scene; fixG.add(model);
    model.traverse(o => {
      if (o.isBone) bones[o.name.replace(/[ _]/g, "").toLowerCase()] = o;
      if (o.isMesh || o.isSkinnedMesh) { o.frustumCulled = false; hologram(o); }
    });
    if (!bones.bip01head || !bones.bip01lupperarm) throw new Error("model has no humanoid skeleton");
    orient(model);
    buildStage();
    if (CFG.logo) buildLogo();
    snapshotRest();
    legSetup();
    resize(); addEventListener("resize", resize);
  }

  const B = n => bones["bip01" + n.replace(/[ _]/g, "").toLowerCase()];

  // look like a blue hologram: keep the model's textures, tint them, add edge glow and scan lines
  function hologram(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => {
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = uTime;
        sh.fragmentShader = "uniform float uTime;\n" + sh.fragmentShader.replace("#include <dithering_fragment>", `
          vec3 hc = vec3(0.10, 0.55, 1.0);
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.4);
          float scan = 0.86 + 0.14 * sin(gl_FragCoord.y * 1.4 + uTime * 6.0);
          vec3 c = mix(gl_FragColor.rgb, hc * (0.22 + lum * 1.7), 0.62);
          c += hc * fres * 1.5 + vec3(0.0, 0.25, 0.4) * fres * fres;
          gl_FragColor = vec4(c * scan, gl_FragColor.a);
          #include <dithering_fragment>`);
      };
      m.needsUpdate = true;
    });
  }

  // work out which way the model faces and how big it is, then stand it on the platform facing the camera
  function orient(model) {
    model.updateMatrixWorld(true);
    const P = n => B(n).getWorldPosition(new T.Vector3());
    const R0 = P("R UpperArm").sub(P("L UpperArm")).normalize();
    const U0 = P("Head").sub(P("Pelvis")).normalize();
    const R = R0.clone().sub(U0.clone().multiplyScalar(R0.dot(U0))).normalize();
    const F = new T.Vector3().crossVectors(U0, R).normalize();
    const cur = new T.Matrix4().makeBasis(R, U0, F).transpose();
    const des = new T.Matrix4().makeBasis(new T.Vector3(-1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1));
    fixG.quaternion.setFromRotationMatrix(des.multiply(cur));
    fixG.updateMatrixWorld(true);
    const foot = Math.min(P("L Foot").y, P("R Foot").y), top = P("Head").y;
    const s = CFG.height / ((top - foot) * 1.16);
    fixG.scale.setScalar(s); fixG.updateMatrixWorld(true);
    const p = P("Pelvis"), f2 = Math.min(P("L Toe0").y, P("R Toe0").y, P("L Foot").y, P("R Foot").y);
    fixG.position.set(-p.x, -f2, -p.z); fixG.updateMatrixWorld(true);
    H = CFG.height;
  }

  function buildStage() {
    const add = (geo, mat, y = 0.01) => { const m = new T.Mesh(geo, mat); m.position.y = y; scene.add(m); return m; };
    const glow = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    for (let i = 0; i < 4; i++) { const r = add(new T.RingGeometry(0.5 + i * 0.16, 0.515 + i * 0.16, 96), glow(i % 2 ? 0x2aa8ff : 0x7fe3ff, 0.85 - i * 0.15)); r.rotation.x = -Math.PI / 2; }
    const disc = add(new T.CircleGeometry(0.62, 64), glow(0x1b6cff, 0.22)); disc.rotation.x = -Math.PI / 2;
    add(new T.CylinderGeometry(0.5, 0.58, 2.0, 48, 1, true), glow(0x2a9bff, 0.07), 1.0);
    const n = 140, pos = new Float32Array(n * 3); stage.seed = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = 0.25 + Math.random() * 0.6; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 2; pos[i * 3 + 2] = Math.sin(a) * r; stage.seed.push(0.1 + Math.random() * 0.25); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3));
    stage.pts = new T.Points(g, new T.PointsMaterial({ color: 0x8fe8ff, size: 0.02, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    scene.add(stage.pts);
  }
  const stage = {};

  // glowing arc-reactor + JARVIS text on the chest, attached to the body so it turns with him
  function buildLogo() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256; const g = c.getContext("2d");
    g.strokeStyle = "#9fe9ff"; g.shadowColor = "#2fc4ff"; g.shadowBlur = 14; g.lineWidth = 7;
    g.beginPath(); g.arc(128, 100, 44, 0, 7); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(128, 100, 22, 0, 7); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 28, 100 + Math.sin(a) * 28); g.lineTo(128 + Math.cos(a) * 40, 100 + Math.sin(a) * 40); g.stroke(); }
    g.fillStyle = "#d6f6ff"; g.font = "bold 40px system-ui,sans-serif"; g.textAlign = "center"; g.fillText("JARVIS", 128, 205);
    const tex = new T.CanvasTexture(c);
    const m = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    const chest = B("Spine2");
    chest.updateWorldMatrix(true, false);
    const wp = chest.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0, CFG.logoOffset * H));
    chest.add(m); m.position.copy(chest.worldToLocal(wp));
    const wq = chest.getWorldQuaternion(new T.Quaternion()).invert(); m.quaternion.copy(wq);   // face the camera at rest
    A.logo = m;
  }

  // =====================================================================================
  //  Bone helpers. Everything is described in one fixed "character frame" and turned into bone
  //  rotations at run time, so it works whatever the model's own bone axes are.
  //  Frame: +Y up, +Z forward (toward the viewer), +X = the character's LEFT, -X = his RIGHT.
  // =====================================================================================
  const AIM = { "R UpperArm": "R Forearm", "R Forearm": "R Hand", "R Hand": "R Finger2", "L UpperArm": "L Forearm", "L Forearm": "L Hand", "L Hand": "L Finger2",
    "R Thigh": "R Calf", "R Calf": "R Foot", "R Foot": "R Toe0", "L Thigh": "L Calf", "L Calf": "L Foot", "L Foot": "L Toe0" };
  const DRIVEN = ["Pelvis", "Spine", "Spine1", "Spine2", "Neck", "Head", "REye", "LEye", "MJaw", "MBottomLip", "MUpperLip", "RMouthCorner", "LMouthCorner", "RCheek", "LCheek",
    "REyeBlinkTop", "LEyeBlinkTop", "REyeBlinkBottom", "LEyeBlinkBottom", "RInnerEyebrow", "LInnerEyebrow", "ROuterEyebrow", "LOuterEyebrow", "MMiddleEyebrow",
    "R UpperArm", "R Forearm", "R Hand", "L UpperArm", "L Forearm", "L Hand",
    "R Thigh", "R Calf", "R Foot", "L Thigh", "L Calf", "L Foot"];

  function snapshotRest() {
    scene.updateMatrixWorld(true);
    DRIVEN.forEach(n => {
      const b = B(n); if (!b) return;
      const r = { q: b.quaternion.clone(), p: b.position.clone(), wq: b.getWorldQuaternion(new T.Quaternion()) };
      if (AIM[n] && B(AIM[n])) r.dir = B(AIM[n]).getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize();
      rest[n] = r;
    });
  }
  // leg lengths + rest directions (so legs can be aimed like arms), and the ball
  function legSetup() {
    try {
      LEG.ok = ["R", "L"].every(s => B(s + " Thigh") && B(s + " Calf") && B(s + " Foot") && rest[s + " Thigh"] && rest[s + " Thigh"].dir && rest[s + " Calf"] && rest[s + " Calf"].dir && rest[s + " Foot"] && rest[s + " Foot"].dir);
      if (!LEG.ok) return;
      ["R", "L"].forEach(s => {
        const pt = B(s + " Thigh").getWorldPosition(new T.Vector3()), pc = B(s + " Calf").getWorldPosition(new T.Vector3()), pf = B(s + " Foot").getWorldPosition(new T.Vector3());
        LEG[s] = { hip: yawG.worldToLocal(pt.clone()), TL: pt.distanceTo(pc), CL: pc.distanceTo(pf) };
        LEG.rd[s] = { u: rest[s + " Thigh"].dir.clone(), f: rest[s + " Calf"].dir.clone(), foot: rest[s + " Foot"].dir.clone() };
      });
      ball = new T.Mesh(new T.SphereGeometry(0.11, 14, 10), new T.MeshBasicMaterial({ color: 0x7fe3ff, wireframe: true, transparent: true, opacity: 0.9, depthWrite: false }));
      ball.visible = false; yawG.add(ball);
    } catch (e) { LEG.ok = false; }
  }
  let tq1, tq2, tv1, tv2;
  function temps() { tq1 = new T.Quaternion(); tq2 = new T.Quaternion(); tv1 = new T.Vector3(); tv2 = new T.Vector3(); }

  function resetPose() { for (const n in rest) { const b = B(n); b.quaternion.copy(rest[n].q); b.position.copy(rest[n].p); } }
  function setWorldQ(b, Qw) { b.parent.getWorldQuaternion(tq2).invert(); b.quaternion.copy(tq2.multiply(Qw)); }

  // turn a bone by a rotation expressed in the character frame (gets the body's yaw added automatically)
  function rotate(n, delta) {
    const b = B(n), r = rest[n]; if (!b || !r) return;
    setWorldQ(b, tq1.copy(yawG.quaternion).multiply(delta).multiply(r.wq));
  }
  // point a limb along a direction (character frame), optionally twisting it about its own length
  function aim(n, dir, roll = 0) {
    const b = B(n), r = rest[n]; if (!b || !r || !r.dir) return;
    const Y = yawG.quaternion;
    const dw = tv1.copy(dir).normalize().applyQuaternion(Y);
    const rd = tv2.copy(r.dir).applyQuaternion(Y);
    const d = new T.Quaternion().setFromUnitVectors(rd, dw);
    const Qw = d.multiply(Y.clone()).multiply(r.wq);
    if (roll) Qw.premultiply(new T.Quaternion().setFromAxisAngle(dw, roll));
    setWorldQ(b, Qw);
  }
  // nudge a face bone by an offset (fraction of body height, character frame)
  function nudge(n, x, y, z = 0) {
    const b = B(n); if (!b || !rest[n]) return;
    b.updateWorldMatrix(true, false);
    const p = b.getWorldPosition(tv1);
    p.add(tv2.set(x * H, y * H, z * H).applyQuaternion(yawG.quaternion));
    b.position.copy(b.parent.worldToLocal(p));
  }
  const Q = (axis, ang) => new T.Quaternion().setFromAxisAngle(axis, ang);
  let X, Y, Z;
  function axes() { X = new T.Vector3(1, 0, 0); Y = new T.Vector3(0, 1, 0); Z = new T.Vector3(0, 0, 1); }

  // =====================================================================================
  //  Animation controller
  // =====================================================================================
  const V = (x, y, z) => new T.Vector3(x, y, z);

  // arm poses: where the upper arm and forearm point, in the character frame. sx = which side the arm hangs on.
  function armPose(side, mode, t, p) {
    const sx = side === "R" ? -1 : 1, s = Math.sin, c = Math.cos;
    switch (mode) {
      case "raise":   return { u: V(sx * 0.25, 1, 0.05), f: V(sx * 0.15, 1, 0.1), roll: 0, k: 5 };
      case "wave":    return { u: V(sx * 0.62, 0.3, 0.35), f: V(sx * (0.15 + 0.5 * s(t * 9)), 1, 0.2), roll: 0, k: 9 };
      case "point":   return { u: V(sx * 0.12, 0.08, 1), f: V(sx * 0.08, 0.08, 1), roll: 0, k: 6 };
      case "fold":    return { u: V(sx * 0.2, -0.92, 0.35), f: V(-sx * 0.95, side === "R" ? 0.05 : 0.32, 0.5), roll: 0, k: 4 };
      case "stretch": return { u: V(sx * 0.5, 0.85 + 0.1 * s(t * 2), 0), f: V(sx * 0.5, 0.85 + 0.1 * s(t * 2), 0), roll: 0, k: 3.5 };
      case "palms":   return { u: V(sx * 0.3, -0.72, 0.3), f: V(sx * 0.15, -0.12, 1), roll: -sx * CFG.palmRoll, k: 4 };
      case "open":    return { u: V(sx * 0.7, -0.55, 0.15), f: V(sx * 0.75, -0.25, 0.55), roll: -sx * 0.7, k: 4 };
      case "move":    return { u: V(sx * (0.3 + 0.2 * s(t * 2.4)), -0.4 + 0.5 * s(t * 1.7 + 1), 0.3 + 0.3 * c(t * 2.1)), f: V(sx * 0.2, -0.3 + 0.4 * s(t * 2.4), 0.8), roll: 0, k: 5 };
      case "head":    return { u: V(sx * 0.7, 0.55, 0.1), f: V(-sx * 0.97, 0.12, 0.2), roll: 0, k: 6 };               // hand on the side of the head
      case "hips":    return { u: V(sx * 0.55, -0.8, -0.1), f: V(-sx * 0.7, -0.7, 0.15), roll: 0, k: 5 };
      case "salute":  return { u: V(sx * 0.75, 0.45, 0.15), f: V(-sx * 0.55, 0.75, 0.35), roll: 0, k: 6 };
      case "clap":    return { u: V(sx * 0.15, -0.55, 0.8), f: V(-sx * (0.58 + 0.22 * s(t * 12)), 0.15, 0.95), roll: 0, k: 14 };
      case "cheer":   return { u: V(sx * (0.55 + 0.08 * s(t * 8)), 0.8, 0.1), f: V(sx * 0.6, 0.85 + 0.1 * s(t * 8), 0.1), roll: 0, k: 7 };
      case "dance":   { const ph = side === "R" ? 0 : Math.PI; return { u: V(sx * 0.7, 0.2 + 0.6 * s(t * 5 + ph), 0.2), f: V(sx * 0.3, 0.9, 0.3 + 0.3 * c(t * 5 + ph)), roll: 0, k: 8 }; }
      case "swing":   { const ph = side === "R" ? 0 : Math.PI; return { u: V(sx * 0.12, -0.9, 0.45 * s(t * 5 + ph)), f: V(sx * 0.1, -0.7, 0.7 + 0.3 * s(t * 5 + ph)), roll: 0, k: 9 }; }
      case "custom":  { const a = A.arms[side]; if (a.cu && a.cf) return { u: a.cu.clone(), f: a.cf.clone(), roll: 0, k: 6 }; return armPose(side, "idle", t, p); }
      case "beat":    { const e = s(Math.PI * clamp(p, 0, 1)); return { u: V(sx * 0.22, -0.78 + 0.1 * e, 0.28), f: V(sx * 0.15, -0.35 + 0.5 * e + 0.12 * s(t * 5), 1), roll: -sx * 0.4 * e, k: 6 }; }
      default: { const br = A.breathe; return { u: V(sx * (0.1 + 0.01 * br), -1, 0.02), f: V(sx * 0.07, -1, 0.34), roll: 0, k: 5 }; }
    }
  }

  // leg poses (same idea as arms). sx = which side the leg is on. Kick uses key frames: wind up, strike, follow through.
  const KICK = [[0, null, null], [0.28, [0.05, -0.78, -0.6], [0.05, -0.05, -1]], [0.48, [0.05, -0.88, 0.48], [0.05, -0.9, 0.43]], [0.62, [0.05, 0.1, 1], [0.05, 0.25, 1]], [0.8, [0.05, 0.1, 1], [0.05, 0.25, 1]], [1, null, null]];
  function kickAt(side, p) {
    const sx = side === "R" ? -1 : 1, rd = LEG.rd[side], fr = KICK.map(k => ({ p: k[0], u: k[1] ? V(sx * k[1][0], k[1][1], k[1][2]) : rd.u.clone(), f: k[2] ? V(sx * k[2][0], k[2][1], k[2][2]) : rd.f.clone() }));
    let i = 0; while (i < fr.length - 2 && p > fr[i + 1].p) i++;
    const a = fr[i], b = fr[i + 1], e = ease(clamp((p - a.p) / (b.p - a.p), 0, 1));
    return { u: a.u.clone().lerp(b.u, e).normalize(), f: a.f.clone().lerp(b.f, e).normalize() };
  }
  function legPose(side, mode, t, p) {
    const sx = side === "R" ? -1 : 1, s = Math.sin, ph = side === "R" ? 0 : Math.PI, rd = LEG.rd[side];
    switch (mode) {
      case "knee":  return { u: V(sx * 0.06, 0.12, 1), f: V(sx * 0.05, -1, 0.12), k: 6 };         // knee up, shin hanging
      case "front": return { u: V(sx * 0.1, 0.5, 1), f: V(sx * 0.1, 0.5, 1), k: 5 };               // leg straight out in front
      case "side":  return { u: V(sx, 0.3, 0), f: V(sx * 0.95, -0.1, 0), k: 5 };                  // leg out to the side
      case "back":  return { u: V(0, -0.85, -0.5), f: V(0, -0.15, -1), k: 5 };
      case "tuck":  return { u: V(sx * 0.05, -0.55, 0.8), f: V(sx * 0.05, -0.9, -0.4), k: 6 };
      case "kick":  { const k = kickAt(side, p); return { u: k.u, f: k.f, k: 16 }; }
      case "march": { const l = Math.max(0, s(t * 5 + ph)); return { u: V(sx * 0.05, -1 + 1.1 * l, 0.9 * l), f: V(sx * 0.05, -1, 0.1 * l), k: 10 }; }
      case "step":  { const l = Math.max(0, s(t * 5 + ph)); return { u: V(sx * (0.05 + 0.25 * l), -1 + 0.5 * l, 0.3 * l), f: V(sx * 0.05, -1, -0.15 * l), k: 9 }; }
      case "jump":  { const e = Math.abs(s(p * Math.PI * 2)); return { u: V(sx * 0.08, -1 + 0.55 * e, 0.7 * e), f: V(sx * 0.05, -1 + 0.1 * e, -0.9 * e), k: 9 }; }
      case "custom": { const a = A.legs[side]; if (a.cu && a.cf) return { u: a.cu.clone(), f: a.cf.clone(), k: 6 }; break; }
    }
    return { u: rd.u, f: rd.f, k: 5 };
  }
  function setLeg(side, mode, secs, cu, cf) {
    const now = performance.now() / 1000;
    (side === "B" ? ["R", "L"] : [side]).forEach(s => { const a = A.legs[s]; a.mode = mode; a.t0 = now; a.until = secs ? now + secs : 0; a.cu = cu || null; a.cf = cf || null; });
  }

  function setArm(side, mode, secs) {
    const now = performance.now() / 1000;
    (side === "B" ? ["R", "L"] : [side]).forEach(s => { A.arms[s].mode = mode; A.arms[s].t0 = now; A.arms[s].until = secs ? now + secs : 0; });
  }
  function setExpr(name, secs = 7) { A.exprName = name; A.exprUntil = secs ? performance.now() / 1000 + secs : 0; }
  function headGesture(a, secs) { const n = performance.now() / 1000; A.headGest = { a, t0: n, until: n + secs }; }
  function lookAt(yaw, pitch, tilt, secs = 3) { A.lookT = { yaw, pitch, tilt }; A.lookUntil = performance.now() / 1000 + secs; }

  // how long each new move lasts (seconds) before the body goes back to normal
  const AHOLD = { wave: 3.6, point: 3.5, move: 4.5, head: 5, hips: 5, salute: 4, clap: 4, cheer: 4 };
  const LHOLD = { knee: 5, front: 5, side: 5, back: 5, tuck: 4, kick: 2.4, march: 5, step: 5, jump: 2.4 };
  const ACT = { jump: 2.4, dance: 6, march: 5, bow: 2.8, backflip: 2.8, frontflip: 2.8, backroll: 3.2, frontroll: 3.2 };
  const durOf = i => i.secs || (i.k === "arm" ? (AHOLD[i.pose] || 2) : i.k === "leg" ? (i.pose === "down" ? 1.5 : (LHOLD[i.pose] || 2)) : i.k === "act" ? (ACT[i.a] || 3) : i.k === "custom" ? 4 : i.k === "turn" && i.by ? 2.8 : 2);

  function run1(i, now) {
    if (i.k === "arm") {
      const hold = i.secs || AHOLD[i.pose] || 0;
      setArm(i.side, i.pose === "down" ? "idle" : i.pose, hold);
      if (i.pose === "wave" && A.exprName === "neutral") setExpr("smile", 4);
      if (i.pose === "cheer" && A.exprName === "neutral") setExpr("smile", 4);
    } else if (i.k === "leg") {
      if (!LEG.ok) return;
      const hold = i.secs || LHOLD[i.pose] || 0;
      setLeg(i.side, i.pose === "down" ? "idle" : i.pose, hold);
      if (i.pose === "kick") {
        const s = i.side === "L" ? "L" : "R", L = LEG[s], k = kickAt(s, 0.48);
        if (i.ball !== false) A.ball = { t0: now, dur: hold, sx: s === "R" ? -1 : 1, start: L.hip.clone().addScaledVector(k.u, L.TL).addScaledVector(k.f, L.CL).add(V(0, 0.05, 0.08)) };
        if (A.exprName === "neutral") setExpr("smile", 3);
      }
    } else if (i.k === "act") {
      const d = ACT[i.a] || 3;
      A.act = { n: i.a, t0: now, until: now + d };
      if (i.a === "jump") { setArm("B", "cheer", d); setLeg("B", "jump", d); }
      else if (i.a === "dance") { setArm("B", "dance", d); setLeg("B", "step", d); setExpr("smile", d); }
      else if (i.a === "march") { setArm("B", "swing", d); setLeg("B", "march", d); }
      else if (/^(back|front)(flip|roll)$/.test(i.a)) { setArm("B", i.a.endsWith("roll") ? "fold" : "cheer", d * 0.55); setLeg("B", "tuck", d * 0.65); if (A.exprName === "neutral") setExpr("surprised", 1.2); }
    } else if (i.k === "custom") {
      const v = a => V(+a[0] || 0, +a[1] || 0, +a[2] || 0).normalize();
      const hold = i.secs || 4;
      if (i.limb === "arm") { setArm(i.side, "custom", hold); (i.side === "B" ? ["R", "L"] : [i.side]).forEach(s => { A.arms[s].cu = v(i.u); A.arms[s].cf = v(i.f); }); }
      else if (LEG.ok) setLeg(i.side, "custom", hold, v(i.u), v(i.f));
    } else if (i.k === "head") {
      if (i.a === "nod") headGesture("nod", 1.8);
      else if (i.a === "shake") headGesture("shake", 1.8);
      else if (i.a === "up") lookAt(0, 0.42, 0);
      else if (i.a === "down") lookAt(0, -0.4, 0);
      else if (i.a === "left") lookAt(0.6, 0, 0);
      else if (i.a === "right") lookAt(-0.6, 0, 0);
      else if (i.a === "tilt") lookAt(0, 0, 0.3, 4);
      else lookAt(0, 0, 0, 0);
    } else if (i.k === "face") {
      setExpr(i.e, i.e === "neutral" ? 0 : 7);
    } else if (i.k === "turn") {
      const cur = A.yawTarget;
      if (i.by) { A.yawTarget = cur + (i.by * Math.PI) / 180; A.spinReset = true; }
      else if (i.to === "flip") A.yawTarget = Math.cos(cur) > 0 ? nearest(cur, Math.PI) : nearest(cur, 0);
      else A.yawTarget = nearest(cur, (i.to * Math.PI) / 180);
    }
  }

  // runs the moves (some can start later, "now with two"). When everything has finished the app says "Done, what else?"
  function exec(intents, silent) {
    const now = performance.now() / 1000;
    let n = 0, end = now + 1.6;
    intents.forEach(i => {
      n++;
      const d = Math.max(0, Math.min(25, +i.delay || 0));
      end = Math.max(end, now + d + durOf(i));
      if (d > 0) A.queue.push({ at: now + d, i }); else run1(i, now);
    });
    A.cmdUntil = now + 2;
    if (!silent) { A.busyUntil = Math.max(A.busyUntil, end + 0.4); A.pendingDone = true; A.awaitingUntil = 0; }
    return n;
  }
  // pick the equivalent angle closest to where he is now, so he never spins the long way round
  function nearest(cur, goal) { let d = goal - cur; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return cur + d; }

  function say(text, force) {
    const P = window.AvatarCmd; if (!P) return false;
    const intents = P.parse(text);
    if (!intents.length) return false;
    if (!force && !P.isPureCommand(text, intents)) return false;
    return exec(intents) > 0;
  }

  // ---------- voice level + mouth shape from the speech audio ----------
  let tbuf, fbuf;
  function audioFeatures(speaking) {
    const out = { amp: 0, round: 0, wide: 0 };
    if (!speaking) return out;
    try {
      const an = outAn, sr = ctx.sampleRate;   // from the app's own audio chain
      if (!tbuf || tbuf.length !== an.fftSize) { tbuf = new Float32Array(an.fftSize); fbuf = new Uint8Array(an.frequencyBinCount); }
      an.getFloatTimeDomainData(tbuf);
      let s = 0; for (let i = 0; i < tbuf.length; i++) s += tbuf[i] * tbuf[i];
      out.amp = clamp(Math.sqrt(s / tbuf.length) * 10, 0, 1);
      if (out.amp > 0.04) {
        an.getByteFrequencyData(fbuf);
        const hz = sr / an.fftSize, band = (a, b) => { let e = 0; for (let i = Math.floor(a / hz); i < Math.min(fbuf.length, Math.ceil(b / hz)); i++) e += fbuf[i]; return e; };
        const lo = band(120, 700), mid = band(700, 2000), hi = band(2000, 6000), tot = lo + mid + hi + 1;
        out.round = clamp((lo / tot - 0.35) * 2.2, 0, 1);      // dark vowels (oh, oo) -> rounded lips
        out.wide = clamp((hi / tot - 0.12) * 3.5, 0, 1);       // bright sounds (ee, s) -> wide lips
      }
    } catch (e) { out.amp = clamp(parseFloat(getComputedStyle(document.body).getPropertyValue("--l")) || 0, 0, 1); }
    return out;
  }

  // =====================================================================================
  //  Frame update
  // =====================================================================================
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 1000 / CFG.fps) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000, sec = now / 1000;
    uTime.value = t;
    const app = document.body.dataset.s || "idle";
    const speaking = app === "speak" && !(typeof player !== "undefined" && player.paused);
    const lerp = (a, b, k) => a + (b - a) * (1 - Math.exp(-k * dt));

    // ----- timers: gestures finish and fall back to idle -----
    ["R", "L"].forEach(s => { const a = A.arms[s]; if (a.until && sec > a.until) { a.mode = "idle"; a.until = 0; } });
    ["R", "L"].forEach(s => { const a = A.legs[s]; if (a.until && sec > a.until) { a.mode = "idle"; a.until = 0; } });
    if (A.queue.length) A.queue = A.queue.filter(q => { if (q.at <= sec) { run1(q.i, sec); return false; } return true; });
    if (A.pendingDone && sec > A.busyUntil && !A.queue.length) {          // everything finished: tell the user, ask what next
      A.pendingDone = false; A.awaitingUntil = sec + 45;
      try { window.jvAvatarDone && window.jvAvatarDone(); } catch (e) {}
    }
    if (A.headGest.a && sec > A.headGest.until) A.headGest.a = "";
    if (A.lookUntil && sec > A.lookUntil) { A.lookT = { yaw: 0, pitch: 0, tilt: 0 }; A.lookUntil = 0; }
    if (A.exprUntil && sec > A.exprUntil) { A.exprName = "neutral"; A.exprUntil = 0; }

    // ----- speaking: occasional "explaining" hand gesture on a free arm -----
    if (speaking && sec > A.nextBeat) {
      A.nextBeat = sec + rnd(3, 6);
      const free = ["R", "L"].filter(s => A.arms[s].mode === "idle");
      if (free.length === 2 && Math.random() < 0.5) setArm(Math.random() < 0.6 ? "R" : "L", "beat", 1.3);
    }

    // ----- body turning (smooth), with a full spin counted as one move -----
    A.yaw = lerp(A.yaw, A.yawTarget, 3.2);
    if (A.spinReset && Math.abs(A.yawTarget - A.yaw) < 0.03) { const w = Math.round(A.yawTarget / 6.2832) * 6.2832; A.yawTarget -= w; A.yaw -= w; A.spinReset = false; }
    A.breathe = Math.sin(t * 1.5);
    // whole-body moves (jump, dance, bow) are programs that run for a few seconds
    let jumpY = 0, swayY = 0, swayZ = 0, bow = 0, flipX = 0, flipPy = 0.95;
    if (A.act) {
      const a = A.act, p = clamp((sec - a.t0) / (a.until - a.t0), 0, 1);
      if (sec > a.until) A.act = null;
      else if (a.n === "jump") jumpY = 0.26 * Math.abs(Math.sin(p * Math.PI * 2));
      else if (a.n === "dance") { swayY = 0.22 * Math.sin(t * 2.6); swayZ = 0.09 * Math.sin(t * 5.2); jumpY = 0.015 * Math.abs(Math.sin(t * 5.2)); }
      else if (a.n === "march") { swayZ = 0.03 * Math.sin(t * 5); }
      else if (/^(back|front)(flip|roll)$/.test(a.n)) {                 // crouch, spring up, turn once round his middle, land
        const dir = a.n.startsWith("back") ? -1 : 1, roll = a.n.endsWith("roll"), c0 = 0.14, c1 = 0.86, q = clamp((p - c0) / (c1 - c0), 0, 1);
        flipX = dir * Math.PI * 2 * ease(q);
        flipPy = roll ? 0.5 : 0.95;
        jumpY = (roll ? 0.05 : 0.35) * Math.sin(Math.PI * q);
      }
      else if (a.n === "bow") bow = 0.8 * (p < 0.35 ? ease(p / 0.35) : p < 0.62 ? 1 : ease((1 - p) / 0.38));
    }
    const ya = A.yaw + 0.025 * Math.sin(t * 0.6) + swayY;
    yawG.rotation.y = ya; yawG.rotation.x = flipX;
    const offY = flipPy * (1 - Math.cos(flipX)), offZ = -flipPy * Math.sin(flipX);   // turn around his middle, not his feet
    yawG.position.set(offZ * Math.sin(ya), 0.012 * Math.sin(t * 1.1) + jumpY + offY, offZ * Math.cos(ya));
    yawG.updateMatrixWorld(true);

    // ----- expressions blend toward their targets -----
    const want = { smile: 0, surprise: 0, sad: 0, confused: 0 };
    if (A.exprName === "smile") want.smile = 1; else if (A.exprName === "surprised") want.surprise = 1;
    else if (A.exprName === "sad") want.sad = 1; else if (A.exprName === "confused") want.confused = 1;
    if (A.exprName === "neutral") { if (speaking) want.smile = 0.18; if (app === "listen") want.smile = 0.1; }
    for (const k in want) A.expr[k] = lerp(A.expr[k], want[k], 6);

    // ----- blinking -----
    if (A.blinkT < 0 && sec > A.nextBlink) { A.blinkT = 0; A.nextBlink = sec + rnd(2.2, 5.5); }
    if (A.blinkT >= 0) { A.blinkT += dt; const p = A.blinkT / 0.17; A.blink = p < 1 ? Math.sin(Math.PI * p) : 0; if (p >= 1) A.blinkT = -1; } else A.blink = 0;

    // ----- head target: user command > thinking > listening > conversation sway -----
    let ty = A.lookT.yaw, tp = A.lookT.pitch, tt = A.lookT.tilt;
    const commanded = A.lookUntil > 0;
    if (!commanded) {
      if (app === "think") { ty = 0.28 + 0.06 * Math.sin(t * 0.8); tp = 0.14; tt = 0.05; }
      else if (app === "listen") { tt = 0.07 + 0.02 * Math.sin(t * 0.9); tp = 0.03; }
      else if (speaking) { ty = 0.07 * Math.sin(t * 1.1) + 0.04 * Math.sin(t * 2.3); tp = 0.025 * Math.sin(t * 1.7) - 0.035 * A.mouth.open; tt = 0.035 * Math.sin(t * 0.8 + 1); }
      else { ty = 0.04 * Math.sin(t * 0.37); tp = 0.015 * Math.sin(t * 0.5); }
    }
    if (A.expr.sad > 0.1) tp -= 0.14 * A.expr.sad;
    if (A.expr.confused > 0.1) tt += 0.14 * A.expr.confused;
    A.look.yaw = lerp(A.look.yaw, ty, 5); A.look.pitch = lerp(A.look.pitch, tp, 5); A.look.tilt = lerp(A.look.tilt, tt, 5);
    let hy = A.look.yaw, hp = A.look.pitch, ht = A.look.tilt;
    if (A.headGest.a) {
      const g = A.headGest, p = clamp((sec - g.t0) / (g.until - g.t0), 0, 1), env = Math.sin(Math.PI * p);
      if (g.a === "nod") hp += -0.3 * env * Math.sin(p * Math.PI * 6) ;
      if (g.a === "shake") hy += 0.42 * env * Math.sin(p * Math.PI * 6);
    }

    // ----- eyes: small natural jumps, and they lead the head -----
    if (sec > A.eye.next) { A.eye.next = sec + rnd(0.8, 2.6); A.eye.tx = rnd(-0.12, 0.12); A.eye.ty = rnd(-0.07, 0.07); if (app === "listen") { A.eye.tx *= 0.3; A.eye.ty *= 0.3; } }
    A.eye.x = lerp(A.eye.x, A.eye.tx + hy * 0.25, 14); A.eye.y = lerp(A.eye.y, A.eye.ty + hp * 0.25, 14);

    // ----- mouth from the actual voice audio: closes the moment the audio stops -----
    const f = audioFeatures(speaking);
    const m = A.mouth;
    m.open = lerp(m.open, f.amp, f.amp > m.open ? 30 : 22);
    m.round = lerp(m.round, f.round, 18); m.wide = lerp(m.wide, f.wide, 18);
    if (!speaking && m.open < 0.015) m.open = m.round = m.wide = 0;

    // =================== apply to the skeleton ===================
    resetPose();
    scene.updateMatrixWorld(true);

    // body: breathing and weight shift
    rotate("Pelvis", Q(Z, 0.012 * Math.sin(t * 0.5) + swayZ));
    rotate("Spine", Q(Z, -0.008 * Math.sin(t * 0.5) - swayZ * 0.5).multiply(Q(X, bow * 0.3)));
    if (bow) rotate("Spine1", Q(X, bow * 0.62));
    rotate("Spine2", Q(X, -0.014 * A.breathe + bow));
    // neck + head share the turn
    const hq = Q(Y, hy).multiply(Q(X, -hp)).multiply(Q(Z, ht));
    rotate("Neck", Q(X, bow * 0.95).multiply(new T.Quaternion().slerp(hq, 0.4)));
    rotate("Head", Q(X, bow * 1.05).multiply(new T.Quaternion().slerp(hq, 0.6)));
    rotate("REye", Q(Y, A.eye.x).multiply(Q(X, -A.eye.y)));
    rotate("LEye", Q(Y, A.eye.x).multiply(Q(X, -A.eye.y)));

    // arms
    ["R", "L"].forEach(s => {
      const a = A.arms[s], pr = clamp((sec - a.t0) / (a.until - a.t0 || 1), 0, 1);
      const tg = armPose(s, a.mode, t, pr);
      let c = A.cur[s];
      if (!c) c = A.cur[s] = { u: tg.u.clone(), f: tg.f.clone(), roll: 0 };
      const k = 1 - Math.exp(-tg.k * dt);
      c.u.lerp(tg.u, k).normalize(); c.f.lerp(tg.f, k).normalize(); c.roll += (tg.roll - c.roll) * k;
      aim(s + " UpperArm", c.u);
      aim(s + " Forearm", c.f, c.roll);
      aim(s + " Hand", c.f, c.roll);
    });

    // legs
    if (LEG.ok) ["R", "L"].forEach(s => {
      const a = A.legs[s], pr = clamp((sec - a.t0) / (a.until - a.t0 || 1), 0, 1);
      const tg = legPose(s, a.mode, t, pr), rd = LEG.rd[s];
      let c = A.curL[s];
      if (!c) c = A.curL[s] = { u: tg.u.clone(), f: tg.f.clone() };
      const k = 1 - Math.exp(-tg.k * dt);
      c.u.lerp(tg.u, k).normalize(); c.f.lerp(tg.f, k).normalize();
      if (a.mode === "idle" && c.u.dot(rd.u) > 0.99995 && c.f.dot(rd.f) > 0.99995) return;   // standing: leave the original pose alone
      aim(s + " Thigh", c.u);
      aim(s + " Calf", c.f);
      aim(s + " Foot", rd.foot.clone().applyQuaternion(new T.Quaternion().setFromUnitVectors(rd.f, c.f)));
    });
    // the ball: sits at the foot, then flies off when it is kicked
    if (ball) {
      const b = A.ball;
      if (!b) ball.visible = false;
      else {
        const p = (sec - b.t0) / b.dur, KC = 0.48;
        if (p > 1.1) { A.ball = null; ball.visible = false; }
        else if (p < KC) { ball.visible = true; ball.position.copy(b.start); ball.material.opacity = 0.9 * clamp(p / 0.1, 0, 1); }
        else {
          const tf = (p - KC) * b.dur;
          if (tf > 0.65) ball.visible = false;
          else { ball.visible = true; ball.material.opacity = 0.9 * clamp((0.65 - tf) / 0.15, 0, 1); ball.position.set(b.start.x, b.start.y + 1.6 * tf - 2.5 * tf * tf, b.start.z + 2.2 * tf); }
        }
        ball.rotation.x += 9 * dt;
      }
    }

    if (CFG.faceBones) face(t, f);
    if (A.logo) A.logo.visible = true;

    // ----- hologram stage -----
    if (stage.pts) {
      const p = stage.pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) + stage.seed[i] * dt; if (y > 2.1) y = 0; p.setY(i, y); }
      p.needsUpdate = true;
    }
    updateState(app, speaking, sec);
    renderer.render(scene, camera);
  }

  // facial bones: eyelids, brows, mouth, cheeks
  function face(t, f) {
    const E = A.expr, m = A.mouth, bl = A.blink;
    // jaw + lips (speech)
    const jaw = m.open * CFG.jawMax + 0.16 * E.surprise;
    if (jaw > 0.002) rotate("MJaw", Q(X, jaw));
    nudge("MBottomLip", 0, -0.0035 * m.open, 0);
    nudge("MUpperLip", 0, 0.0015 * m.open, 0);
    ["R", "L"].forEach(s => {
      const sx = s === "R" ? -1 : 1;
      // smile pulls corners out and up, round vowels pull them in, wide sounds stretch them, sad pulls them down
      nudge(s + "MouthCorner", sx * (0.004 * E.smile + 0.003 * m.wide - 0.0045 * m.round), 0.0045 * E.smile - 0.0045 * E.sad - 0.001 * m.open, 0);
      nudge(s + "Cheek", 0, 0.003 * E.smile, 0);
      // eyelids: blink, plus wide-open for surprise
      const lid = clamp(bl + 0.18 * E.smile + 0.1 * E.sad - 0.3 * E.surprise, -0.4, 1);
      rotate(s + "EyeBlinkTop", Q(X, CFG.blinkAngle * lid));
      nudge(s + "EyeBlinkBottom", 0, 0.002 * (bl + 0.4 * E.smile), 0);
      // brows
      const up = 0.009 * E.surprise + 0.004 * E.sad * (s === "L" ? 1 : 1);
      const conf = s === "L" ? 0.008 * E.confused : -0.003 * E.confused;
      nudge(s + "OuterEyebrow", 0, up * 0.7 - 0.004 * E.sad + conf, 0);
      nudge(s + "InnerEyebrow", -sx * 0.002 * E.sad, up + 0.006 * E.sad + conf, 0);
    });
    nudge("MMiddleEyebrow", 0, 0.008 * E.surprise + 0.004 * E.sad, 0);
  }

  // ---------- state name shown in the UI ----------
  function updateState(app, speaking, sec) {
    let s = app === "speak" ? "speaking" : app === "listen" ? "listening" : app === "think" ? "thinking" : "idle";
    if (A.headGest.a === "nod") s = "nodding"; else if (A.headGest.a === "shake") s = "shaking head";
    const R = A.arms.R.mode, L = A.arms.L.mode, am = R !== "idle" && R !== "beat" ? R : L !== "idle" && L !== "beat" ? L : "";
    if (am === "wave") s = "waving"; else if (am === "point") s = "pointing"; else if (am === "raise") s = "arm raised"; else if (am) s = am;
    if (Math.abs(A.yawTarget - A.yaw) > 0.08) s = "turning";
    else if (Math.cos(A.yaw) < -0.5) s = "back-facing";
    if (A.exprName !== "neutral" && !am) s = A.exprName === "smile" ? "happy" : A.exprName;
    if (state.anim !== s) { state.anim = s; const e = $("#avs"); if (e) e.textContent = s; document.body.dataset.av = s; }
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fovR = (camera.fov * Math.PI) / 360, need = Math.max((H * 1.22) / 2 / Math.tan(fovR), (1.5 / 2) / (Math.tan(fovR) * camera.aspect));
    camera.position.set(0, H * 0.52, need);
    camera.lookAt(0, H * 0.5, 0);
    camera.updateProjectionMatrix();
  }

  // =====================================================================================
  //  Controls (buttons, text box, state pill)
  // =====================================================================================
  function ui() {
    const css = document.createElement("style");
    css.textContent = `
#avp{position:fixed;left:.6rem;top:calc(env(safe-area-inset-top) + 4.2rem);z-index:30;font:12px system-ui,sans-serif;color:var(--fg,#e8eaf2)}
#avp .pill{display:flex;align-items:center;gap:.4rem;padding:.35rem .7rem;border-radius:999px;border:1px solid var(--line,#1d3a78);background:var(--btn,#0a1633);cursor:pointer}
#avp .dot{width:8px;height:8px;border-radius:50%;background:#5fd6ff;box-shadow:0 0 8px #5fd6ff}
body[data-s="speak"] #avp .dot{background:#ff8a3d;box-shadow:0 0 8px #ff8a3d}
body[data-s="listen"] #avp .dot{background:#3dffb0;box-shadow:0 0 8px #3dffb0}
body[data-s="think"] #avp .dot{background:#b07dff;box-shadow:0 0 8px #b07dff}
#avp .box{display:none;margin-top:.4rem;padding:.5rem;width:min(78vw,260px);border-radius:14px;border:1px solid var(--line,#1d3a78);background:#07122bdd;backdrop-filter:blur(8px);max-height:55vh;overflow:auto}
#avp.open .box{display:block}
#avp .grid{display:grid;grid-template-columns:1fr 1fr;gap:.3rem}
#avp button.g{font:inherit;color:inherit;padding:.4rem .3rem;border-radius:10px;border:1px solid var(--line,#1d3a78);background:var(--btn,#0a1633)}
#avp button.g:active{background:var(--c2,#1247c9)}
#avp form{display:flex;gap:.3rem;margin-bottom:.4rem}
#avp input{flex:1;min-width:0;font:inherit;color:inherit;padding:.4rem .6rem;border-radius:999px;border:1px solid var(--line,#1d3a78);background:var(--btn,#0a1633)}`;
    document.head.append(css);
    const wrap = document.createElement("div"); wrap.id = "avp";
    const G = [["Wave", "wave at me"], ["Greet", "__greet"], ["Raise right", "raise your right hand"], ["Raise left", "raise your left hand"], ["Raise both", "raise both hands"], ["Hands down", "put your hands down"],
      ["Point", "point at me"], ["Fold arms", "fold your arms"], ["Stretch", "stretch your arms"], ["Palms", "show me your palms"], ["Open arms", "open your arms"], ["Move arm", "move your right arm"],
      ["Nod", "nod your head"], ["Shake head", "shake your head"], ["Look up", "look up"], ["Look down", "look down"], ["Look left", "look to your left"], ["Look right", "look to your right"],
      ["Tilt", "tilt your head"], ["Smile", "smile"], ["Surprised", "look surprised"], ["Sad", "look sad"], ["Confused", "look confused"], ["Turn around", "turn around"],
      ["Face me", "face me"], ["Turn left", "turn to the left"], ["Turn right", "turn to the right"], ["Sideways", "turn sideways"], ["Spin 360", "turn 360 degrees"],
      ["Raise leg", "raise your right leg"], ["Kick ball", "kick a ball"], ["Hold head", "hold your head with one hand"], ["Both hands", "hold your head with both hands"], ["Dance", "dance"], ["Jump", "jump"], ["Back flip", "do a back flip"], ["Front flip", "do a front flip"], ["Back roll", "do a back roll"], ["Front roll", "do a front roll"], ["Clap", "clap your hands"], ["Hands on hips", "hands on hips"], ["Bow", "take a bow"], ["March", "march in place"]];
    wrap.innerHTML = `<div class="pill" id="avt"><i class="dot"></i><span id="avs">loading</span></div><div class="box"><button type="button" class="g" id="avfocus" style="width:100%;margin-bottom:.4rem"></button><form id="avf"><input id="avi" placeholder="Type a command…" autocomplete="off"><button class="g">Go</button></form><div class="grid">` +
      G.map(g => `<button type="button" class="g" data-c="${g[1]}">${g[0]}</button>`).join("") + `</div></div>`;
    document.body.append(wrap);
    $("#avt").onclick = () => wrap.classList.toggle("open");
    const FN = ["Focus: off", "Focus: near voice", "Focus: strong (noisy room)"];
    const showF = () => { const b = $("#avfocus"); if (b && window.jvGetFocus) b.textContent = FN[window.jvGetFocus()]; };
    $("#avfocus").onclick = () => { if (window.jvSetFocus) window.jvSetFocus((window.jvGetFocus() + 1) % 3); showF(); };
    setTimeout(showF, 300);
    wrap.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => b.dataset.c === "__greet" ? api.greet() : api.run(b.dataset.c));
    $("#avf").onsubmit = e => { e.preventDefault(); const v = $("#avi").value.trim(); if (v) { if (!api.run(v)) { /* not a body command: ask Jarvis */ if (window.jvSend) window.jvSend(v); } $("#avi").value = ""; } };
  }

  // =====================================================================================
  //  Public API (the rest of the app talks to this)
  // =====================================================================================
  const api = {
    get ready() { return state.ready; },
    get state() { return state.anim; },
    cfg: CFG,
    run(text) { return state.ready ? say(text, true) : false; },
    greet() { if (!state.ready) return; exec([{ k: "arm", pose: "wave", side: "R" }, { k: "face", e: "smile" }], true); },
    // a move described by the AI: { arm_right, arm_left, leg_right, leg_left, action, head, face, seconds, delay, custom:[{limb,side,upper,lower}] }
    pose(a) {
      if (!state.ready || !a) return false;
      const d = +a.delay || 0, secs = +a.seconds || 0, out = [], put = o => out.push({ ...o, delay: d });
      if (a.arm_right) put({ k: "arm", pose: a.arm_right, side: "R", secs });
      if (a.arm_left) put({ k: "arm", pose: a.arm_left, side: "L", secs });
      if (a.leg_right) put({ k: "leg", pose: a.leg_right, side: "R", secs, ball: a.leg_right === "kick" && a.ball !== false });
      if (a.leg_left) put({ k: "leg", pose: a.leg_left, side: "L", secs, ball: a.leg_left === "kick" && a.ball !== false });
      const act = a.action_type;
      if (act) {
        if (act === "kick_ball") put({ k: "leg", pose: "kick", side: a.side === "L" ? "L" : "R", ball: true });
        else if (act === "clap") put({ k: "arm", pose: "clap", side: "B", secs });
        else if (act === "cheer") put({ k: "arm", pose: "cheer", side: "B", secs });
        else put({ k: "act", a: act });
      }
      if (a.head) put({ k: "head", a: a.head });
      if (a.face) put({ k: "face", e: a.face });
      (Array.isArray(a.custom) ? a.custom : []).slice(0, 4).forEach(c => {
        const m = /^(right|left)_(arm|leg)$/.exec(String(c.limb || ""));
        if (m && Array.isArray(c.upper) && Array.isArray(c.lower)) put({ k: "custom", limb: m[2], side: m[1] === "right" ? "R" : "L", u: c.upper, f: c.lower, secs });
      });
      return out.length ? exec(out) > 0 : false;
    },
    gesture(name) { return this.run(name); },
    stop() { setArm("B", "idle"); setLeg("B", "idle", 0); A.act = null; A.ball = null; A.queue = []; A.pendingDone = false; A.headGest.a = ""; A.lookUntil = 0; setExpr("neutral", 0); A.yawTarget = nearest(A.yaw, 0); }
  };
  window.Avatar = api;

  // the app calls these: spoken/typed commands (skips the AI for short body commands) and AI tool actions
  window.jvCommand = text => {
    if (!state.ready) return false;
    const P = window.AvatarCmd;
    // after "Done, what else?": "ok" / "that's all" means stop
    if (A.awaitingUntil > performance.now() / 1000 && P && P.isStop && P.isStop(text)) {
      api.stop(); A.awaitingUntil = 0; A.pendingDone = false;
      try { window.jvAvatarOk && window.jvAvatarOk(); } catch (e) {}
      return true;
    }
    return say(text, false);          // the "Done" is spoken when the move really finishes (see exec)
  };
  window.jvActions = list => (list || []).forEach(a => {
    if (!a) return;
    if (a.action === "avatar" && a.command) api.run(a.command);
    else if (a.action === "avatar_pose") api.pose(a);
  });

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ui) : ui();
  boot().then(() => {
    temps(); axes();
    state.ready = true; const e = $("#avs"); if (e) e.textContent = "idle";
    t0 = performance.now(); requestAnimationFrame(frame);
  }).catch(e => {
    state.err = String(e && e.message || e); console.warn("Avatar 3D not started, keeping the 2D hologram:", e);
    const s = $("#avs"); if (s) s.textContent = "3D off";
    const el = document.getElementById("avatar3d"); if (el) el.remove();
    if (skinEl) skinEl.style.display = ""; window.__noSkinDraw = false;   // 3D failed: bring the old hologram back
  });
})();
