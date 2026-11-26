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

    // ---------- flips and rolls (checked first, so "back flip" is not read as "turn round") ----------
    const flipBack = has(/\b(back ?flips?|backward flips?|flip backwards?|back somersaults?|backwards? somersaults?)\b/), rollBack = has(/\b(back rol(l|ls|ling)|backwards? rol(l|ls|ling)|rol(l|ling) backwards?|roll back)\b/);
    const flipFront = has(/\b(front ?flips?|forward flips?|flip forwards?|somersaults?|summersaults?|(do|make|perform) flip|flip over)\b/), rollFront = has(/\b(front rol(l|ls|ling)|forwards? rol(l|ls|ling)|rol(l|ling) forwards?|roll over|(do|make|perform) roll|rolling)\b/);
    if (!head && (flipBack || rollBack || flipFront || rollFront)) { out.push({ k: "act", a: flipBack ? "backflip" : rollBack ? "backroll" : flipFront ? "frontflip" : "frontroll" }); return out; }

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

    // ---------- legs, kicking, whole-body moves ----------
    const armWord = has(/\b(hand|hands|arm|arms)\b/);
    const legWord = has(/\b(leg|legs|knee|knees|foot|feet|thigh|toe|toes)\b/);
    const bothW = has(/\b(both|two)\b/);
    const lr = has(/\bright\b/) ? "R" : has(/\bleft\b/) ? "L" : null;
    let handled = false;
    if (has(/\bkick\w*\b/)) { out.push({ k: "leg", pose: "kick", side: lr || "R", ball: has(/\bball\b/) }); handled = true; }
    else if (legWord && !armWord) {
      const up = has(/\b(raise|lift|up|hold|stand on|one leg)\b/), down = has(/\b(down|lower|drop|rest|normal|ground)\b/);
      let lp = null;
      if (up && !down) lp = has(/\b(side|sideways|out)\b/) ? "side" : has(/\b(back|behind)\b/) ? "back" : has(/\b(straight|front|forward|high)\b/) ? "front" : "knee";
      else if (down) lp = "down";
      else if (has(/\b(tuck|bend|bent)\b/)) lp = "tuck";
      if (lp) { out.push({ k: "leg", pose: lp, side: bothW || has(/\b(legs|feet)\b/) ? "B" : lr || "R" }); handled = true; }
    }
    if (!handled && has(/\bstomp\w*|\bstamp\w*/)) { out.push({ k: "leg", pose: "stomp", side: "B" }); handled = true; }
    if (!handled && legWord && !armWord && has(/\b(apart|wide|spread|astride)\b/)) { out.push({ k: "leg", pose: "wide", side: "B" }); handled = true; }
    if (!handled) {
      if (has(/\b(jumping jacks?|star jumps?|do jacks)\b/)) { out.push({ k: "act", a: "jumping_jacks" }); handled = true; }
      else if (has(/\b(robot\w*)\b/)) { out.push({ k: "act", a: "robot_dance" }); handled = true; }
      else if (has(/\b(box|boxing|shadow ?box\w*|punch\w*|throw punches|fight)\b/)) { out.push({ k: "act", a: "boxing" }); handled = true; }
      else if (has(/\b(squat\w*|crouch\w*|duck down|get low)\b/)) { out.push({ k: "act", a: "squat" }); handled = true; }
      else if (has(/\bshrug\w*/)) { out.push({ k: "act", a: "shrug" }); handled = true; }
      else if (has(/\b(flex\w*|muscles?|biceps?)\b/) && !has(/\bflexib\w*/)) { out.push({ k: "act", a: "flex" }); handled = true; }
      else if (has(/\b(run|running|sprint\w*|jog\w*)\b/)) { out.push({ k: "act", a: "run" }); handled = true; }
      else if (has(/\b(danc\w*|boogie|groove)\b/)) { out.push({ k: "act", a: "dance" }); handled = true; }
      else if (has(/\b(jump\w*|hop\w*|leap\w*)\b/)) { out.push({ k: "act", a: "jump" }); handled = true; }
      else if (has(/\bmarch\w*\b|\b(walk|run|jog)\w*\b.*\b(place|spot)\b|^(walk|run|jog|stomp)( around)?$/)) { out.push({ k: "act", a: "march" }); handled = true; }
      else if (has(/\b(bow|bowing)\b/)) { out.push({ k: "act", a: "bow" }); handled = true; }
    }

    // ---------- hold your head (one hand, then two) ----------
    const holdHead = !handled && has(/\b(head|forehead|temples?)\b/) &&
      has(/\b(hold\w*|grab\w*|grip\w*|clutch\w*|cover\w*|touch\w*|scratch\w*|rest\w*|put|place|hands? on|behind)\b/) &&
      !has(/\b(nod|shake|look|tilt|turn|face)\b/);
    if (holdHead) {
      const manyHands = has(/\b(hands|arms)\b/);
      if (has(/\bone\b/) && bothW) {           // "one hand, then two"
        out.push({ k: "arm", pose: "head", side: lr || "R", secs: 3.5 }, { k: "arm", pose: "head", side: "B", delay: 3.7, secs: 5 });
      } else out.push({ k: "arm", pose: "head", side: bothW || manyHands ? "B" : lr || "R" });
    }

    // ---------- arms ----------
    const both = has(/\b(both|two|arms|hands)\b/);
    const side = both ? "B" : has(/\bright\b/) ? "R" : has(/\bleft\b/) ? "L" : null;
    const arm = armWord;
    let pose = null;
    if (handled || holdHead) { /* already done above */ }
    else if (has(/\b(on (your )?(heart|chest)|hand to (your )?(heart|chest)|pledge)\b/)) pose = "heart";
    else if (has(/\b(thinking pose|pose (like )?a thinker|(hand|finger) on (your )?chin|(rub|stroke|scratch|hold) (your )?chin)\b/)) pose = "think";
    else if (has(/\b(stop sign|halt|palm (out|forward)|hold up (a )?(stop|palm))\b/)) pose = "stop";
    else if (has(/\b(airplane|aeroplane|plane|wings?|t pose|arms (out )?(wide|to the sides?))\b/)) pose = "wings";
    else if (has(/\b(come here|come closer|come to me|beckon\w*)\b/)) pose = "beckon";
    else if (has(/\b(hug|embrace|cuddle)\b/)) pose = "hug";
    else if (has(/\bhips?\b/)) pose = "hips";
    else if (has(/\bsalut\w*\b/)) pose = "salute";
    else if (has(/\b(clap\w*|applaud\w*)\b/)) pose = "clap";
    else if (has(/\b(cheer\w*|celebrat\w*|hooray|yay|victory)\b/)) pose = "cheer";
    else if (has(/\b(wave|say hi|say hello|greet|hello there)\b/)) pose = "wave";
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
      const forced = { fold: "B", stretch: "B", palms: "B", open: "B", clap: "B", cheer: "B", wings: "B", hug: "B", beckon: side || "R" }[pose];
      out.push({ k: "arm", pose, side: forced || side || (pose === "down" || pose === "hips" ? "B" : "R") });
      if (pose === "down") out.push({ k: "leg", pose: "down", side: "B" });
    }
    return out;
  }

  // a short, non-question sentence that is purely a body command can skip the AI and run instantly
  function isPureCommand(text, intents) {
    if (!intents.length) return false;
    const t = norm(text);
    if (t.split(" ").length > 9) return false;
    if (/^(what|why|how|who|when|where|which|tell|explain|describe|is|are)\b/.test(t) || /^(do|does|did) (you|i|we|they|he|she|it)\b/.test(t)) return false;
    if (/^(i|im|we|you|he|she|they|my|it|its|that|this|there)\b/.test(t)) return false;
    return true;
  }

  // after an action, "ok" / "that's all" means: stop
  function isStop(text) {
    const t = String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(ok|okay|its ok|its okay|thats all|that is all|thats it|that will do|enough|stop|stop it|nothing|nothing else|no|nope|nah|im good|all good|thanks|thank you|good|fine|alright|never mind|nevermind|youre done|you are done|relax|cool)( thanks| thank you| jarvis)?$/.test(t);
  }

  const api = { parse, isPureCommand, isStop, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AvatarCmd = api;
})(typeof window !== "undefined" ? window : globalThis);
