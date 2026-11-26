// Jarvis avatar: turns what you say or type into body actions. No libraries, works offline.
// parse("jarvis could you please raise your left hand") -> [{k:"arm", side:"L", pose:"raise"}]
(function (root) {
  "use strict";

  const FILLER = /\b(jarvis|please|can you|could you|would you|will you|hey|ok|okay|now|just|for me|your|the|a|go ahead and|try to|try)\b/g;
  const norm = s => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();

  function parse(text) {
    const t = norm(text), out = [];
    if (!t) return out;
    const has = re => re.test(t);
    const head = has(/\b(head|neck)\b/);

    // ---------- whole-body turning ----------
    const turnWord = has(/\b(turn|spin|rotate|face|twirl|pivot|swivel|go|come|flip|show)\b/);
    if (!head && has(/\b(your back|show.*\bback\b|back (to|toward|towards) me|back on me)\b/)) out.push({ k: "turn", to: 180 });
    else if (!head && has(/\b(face (me|front|forward|camera|screen|us)|front again|turn (to|toward|towards) (me|front|face)|turn to face|face this way|look at me)\b/) && !has(/\blook at me\b/)) out.push({ k: "turn", to: 0 });
    else if (has(/\b(360|full circle|full turn|full rotation|spin|twirl|pirouette)\b/) && !has(/\bspin (around|round)\b/)) out.push({ k: "turn", by: 360 });
    else if (!head && has(/\b(sideways|side on|profile|side view)\b/)) out.push({ k: "turn", to: 90 });
    else if (!head && has(/\b(turn|rotate|go|come)\b.*\b(left|right)\b/) && !has(/\b(look|eyes|hand|arm)\b/)) out.push({ k: "turn", to: has(/\bleft\b/) ? 90 : -90 });
    else if (!head && turnWord && has(/\b(180|around|round|back|again|other way|other side|about face|reverse|opposite)\b/) && !has(/\b(hand|hands|arm|arms)\b/)) out.push({ k: "turn", to: "flip" });   // each time he flips to the other side

    // ---------- face ----------
    if (has(/\b(smile|grin|happy|cheerful|laugh|glad)\b/)) out.push({ k: "face", e: "smile" });
    else if (has(/\b(surpris\w*|shock\w*|astonish\w*|amaz\w*|startle\w*|gasp)\b/)) out.push({ k: "face", e: "surprised" });
    else if (has(/\b(sad|frown|unhappy|upset|down in the dumps)\b/) && !has(/\b(hand|hands|arm|arms)\b/)) out.push({ k: "face", e: "sad" });
    else if (has(/\b(confus\w*|puzzl\w*|bewilder\w*|huh)\b/)) out.push({ k: "face", e: "confused" });
    else if (has(/\b(neutral|straight face|calm face|relax face|normal face)\b/)) out.push({ k: "face", e: "neutral" });

    // ---------- head ----------
    if (has(/\b(nod|say yes)\b/)) out.push({ k: "head", a: "nod" });
    else if (has(/\bshake\b.*\bhead\b|\bshake no\b|\bsay no\b|\bshake\b$/)) out.push({ k: "head", a: "shake" });
    else if (has(/\b(look|tilt|glance|gaze|face|turn head|head)\b.*\bup(wards?)?\b/) && !has(/\b(hand|hands|arm|arms)\b/)) out.push({ k: "head", a: "up" });
    else if (has(/\b(look|glance|gaze|face|turn head|head)\b.*\bdown(wards?)?\b/) && !has(/\b(hand|hands|arm|arms)\b/)) out.push({ k: "head", a: "down" });
    else if (has(/\b(look|glance|gaze|turn head|head|eyes)\b.*\bleft\b/)) out.push({ k: "head", a: "left" });
    else if (has(/\b(look|glance|gaze|turn head|head|eyes)\b.*\bright\b/)) out.push({ k: "head", a: "right" });
    else if (has(/\btilt\b/)) out.push({ k: "head", a: "tilt" });
    else if (has(/\b(look at me|look to me|look this way|look forward|look straight|head (toward|towards|to) me|turn head|eyes on me|head straight|center)\b/)) out.push({ k: "head", a: "center" });

    // ---------- arms ----------
    const both = has(/\b(both|two|arms|hands)\b/);
    const side = both ? "B" : has(/\bright\b/) ? "R" : has(/\bleft\b/) ? "L" : null;
    const arm = has(/\b(hand|hands|arm|arms)\b/);
    let pose = null;
    if (has(/\b(wave|say hi|say hello|greet|hello there)\b/)) pose = "wave";
    else if (has(/\bpoint\b/)) pose = "point";
    else if (has(/\b(fold|cross)\b.*\barms?\b|\barms? (folded|crossed)\b/)) pose = "fold";
    else if (has(/\bstretch\b/)) pose = "stretch";
    else if (has(/\bpalms?\b/)) pose = "palms";
    else if (has(/\b(open|spread|extend)\b.*\barms?\b|\bwelcome\b/)) pose = "open";
    else if (has(/\b(at ease|reset|put (them|em) down|them down|stop waving|stop that|by (your )?sides?|stand normally|stand normal|relax)\b/) && !has(/\bface\b/)) pose = "down";
    else if (has(/\b(lower|put down|drop|rest)\b/) && (arm || !head)) pose = "down";
    else if (arm && has(/\bdown\b/)) pose = "down";
    else if (has(/\bat (your )?sides?\b/)) pose = "down";
    else if (has(/\b(raise|lift|put up|hold up|hands up|arms up|reach up|reach for (the )?sky|put (them|em) up|them up|surrender|high five)\b/) && !has(/\b(look|head|eyes)\b/)) pose = "raise";
    else if (arm && has(/\bup\b/) && !has(/\b(look|head|eyes)\b/)) pose = "raise";
    else if (has(/\b(move|swing|wiggle|flex|exercise)\b.*\b(arm|arms|hand|hands)\b/)) pose = "move";
    if (pose) {
      const forced = { fold: "B", stretch: "B", palms: "B", open: "B" }[pose];
      out.push({ k: "arm", pose, side: forced || side || (pose === "down" ? "B" : "R") });
    }
    return out;
  }

  // a short, non-question sentence that is purely a body command can skip the AI and run instantly
  function isPureCommand(text, intents) {
    if (!intents.length) return false;
    const t = norm(text);
    if (t.split(" ").length > 9) return false;
    if (/^(what|why|how|who|when|where|which|tell|explain|describe|is|are|do|does|did)\b/.test(t)) return false;
    return true;
  }

  const api = { parse, isPureCommand, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AvatarCmd = api;
})(typeof window !== "undefined" ? window : globalThis);
