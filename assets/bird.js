/* Birdboost: the digital bird (v2).
   One bird travels through every page. It lives in the page (document coordinates), so
   scrolling moves the camera, not the bird. Its flight is a small state machine:
     hidden → flying ⇄ gliding (with banked turns) → landing → perched → taking off → away
   Movement is steered with limited acceleration and a limited turn rate, so it can only ever
   draw smooth arcs: no jumps, no shaking, whatever the scroll does.

   The flock (ambassador page) is a choreographed formation, not a free swarm: every bird has a
   place in a shape that morphs with a smoothed scroll progress, and follows it on a damped
   spring. It lives in the opening scenes only and leaves before the application form.

   Markup it understands:
     data-perch="0.8"          land on the top edge of this element, 80% across
     data-perch-scale="0.8"    smaller = further away
     data-perch-desktop        only use this perch on wide screens
     data-perch-me             the ambassador's own perch (the nav pill)
     data-flyby="5"            when this section scrolls in, 5 birds cross the sky once
     data-flock-stage          (ambassador page) the sections the flock lives in, in order
   <body data-bird="solo|flock|off"> picks the mode for the page. */
(() => {
  "use strict";
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SMALL = matchMedia("(max-width: 760px)").matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => t * t * (3 - 2 * t);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt); // frame-rate independent smoothing

  /* ---------- Drawing ---------- */
  const WHITE = [245, 245, 242], DARK = [14, 14, 14], GREEN = [63, 174, 58], SHADE = [176, 178, 172];
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // A two-part wing (arm and hand). The hand lags the arm, so each beat whips like a real wing.
  // arm, hand: elevation angles (radians, up is positive). side: 1 near wing, -1 far wing.
  function wing(c, arm, hand, fold, side) {
    const rx = 5, ry = -1.6;
    const aL = lerp(17, 12, fold), hL = lerp(25, 22, fold);
    // three-quarter camera from slightly above: a level wing shows a little towards the viewer
    const wx = rx - Math.cos(arm) * aL * 0.22 - aL * 0.26, wy = ry - Math.sin(arm) * aL + side * Math.cos(arm) * aL * 0.5;
    let tx = wx - Math.cos(hand) * hL * 0.3 - hL * 0.5, ty = wy - Math.sin(hand) * hL + side * Math.cos(hand) * hL * 0.46;
    // folded: wings lie along the back, tips past the tail like a resting swallow
    const fx = lerp(wx, -14, fold), fy = lerp(wy, -3.2 + side * 0.6, fold);
    tx = lerp(tx, -38, fold); ty = lerp(ty, -3.6 + side * 0.9, fold);
    c.beginPath();
    c.moveTo(8, -1.8);
    c.quadraticCurveTo(lerp((rx + fx) / 2 + 3, 0, fold), lerp((ry + fy) / 2 - 2.5, -4, fold), fx, fy);
    c.quadraticCurveTo(lerp((fx + tx) / 2 + 2, -26, fold), lerp((fy + ty) / 2 - 1.5, -4.8, fold), tx, ty);
    c.quadraticCurveTo(lerp((fx + tx) / 2 + 1, -24, fold), lerp((fy + ty) / 2 + 4.5, -1.6, fold), lerp(fx - 5, -12, fold), lerp(fy + 4.5, -0.6, fold));
    c.quadraticCurveTo(lerp(-2, -4, fold), lerp(fy * 0.4 + 2, 0.5, fold), -6, 0.8);
    c.closePath();
  }
  function body(c, tail) {
    c.beginPath();
    c.moveTo(24.5, -0.4);
    c.quadraticCurveTo(21, -2.9, 16.5, -3.6);
    c.quadraticCurveTo(12, -4.6, 6, -3.6);
    c.quadraticCurveTo(-4, -2.7, -14, -1.4);
    c.lineTo(-43, -6.6 - tail * 3);
    c.lineTo(-25, -tail);
    c.lineTo(-42, 6.2 - tail * 2);
    c.lineTo(-14, 1.8);
    c.quadraticCurveTo(-2, 4.6, 8, 3.6);
    c.quadraticCurveTo(16, 2.8, 20.5, 1.2);
    c.quadraticCurveTo(23, 0.4, 24.5, -0.4);
    c.closePath();
  }
  /* o: { s scale, f facing -1..1 (near 0 = edge-on, mid-turn), pitch, arm, hand, fold, tone 0 white..1 dark,
          alpha, accent (an ambassador's own bird), tail, blur [dx,dy] for motion blur, shadow } */
  function drawBird(c, x, y, o) {
    const s = o.s || 1, fold = o.fold || 0, a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0.01 || s <= 0.01) return;
    let f = o.f == null ? 1 : o.f;
    if (Math.abs(f) < 0.12) f = f < 0 ? -0.12 : 0.12;
    const tone = mix(WHITE, DARK, o.tone || 0), under = mix(tone, o.tone > 0.5 ? WHITE : SHADE, 0.55);
    const arm = o.arm == null ? 0.2 : o.arm, hand = o.hand == null ? 0.12 : o.hand;
    if (o.shadow) { // soft contact shadow on whatever it's perched on
      c.save(); c.translate(x - 2 * s, y + 10 * s); c.scale(s * 1.6, s * 0.32);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 16); g.addColorStop(0, `rgba(0,0,0,${0.45 * a})`); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 16, 0, TAU); c.fill(); c.restore();
    }
    const one = (ox, oy, al) => {
      c.save();
      c.translate(x + ox, y + oy);
      c.scale(s * f, s);
      c.rotate(o.pitch || 0);
      wing(c, arm * 0.96, hand * 0.96, fold, -1);
      c.fillStyle = rgb(mix(tone, o.tone > 0.5 ? WHITE : DARK, 0.3), al); c.fill();
      body(c, o.tail || 0);
      const bg = c.createLinearGradient(0, -5, 0, 5);
      bg.addColorStop(0, rgb(tone, al)); bg.addColorStop(1, rgb(under, al));
      c.fillStyle = bg; c.fill();
      wing(c, arm, hand, fold, 1);
      const wg = c.createLinearGradient(6, 0, -36, 0);
      wg.addColorStop(0, rgb(tone, al)); wg.addColorStop(1, rgb(o.accent ? GREEN : mix(tone, under, 0.35), al));
      c.fillStyle = wg; c.fill();
      c.beginPath(); c.arc(17, -1.6, 0.95, 0, TAU);
      c.fillStyle = rgb(o.tone > 0.5 ? WHITE : DARK, al * 0.85); c.fill();
      if (fold > 0.6) {
        c.strokeStyle = rgb(under, al * (fold - 0.6) / 0.4); c.lineWidth = 1.1 / s + 0.4; c.lineCap = "round";
        c.beginPath(); c.moveTo(3, 3.4); c.lineTo(2, 8.6); c.moveTo(-1.5, 3); c.lineTo(-2.8, 8.4); c.stroke();
      }
      c.restore();
    };
    if (o.blur) { one(-o.blur[0] * 2, -o.blur[1] * 2, a * 0.1); one(-o.blur[0], -o.blur[1], a * 0.2); }
    one(0, 0, a);
  }

  /* Wing beats that never repeat exactly: rate and depth change a little every beat,
     the downstroke is quicker than the upstroke, and the hand trails the arm. */
  function Flapper() {
    return { ph: rand(0, TAU), rate: 5, amp: 1, gl: 0, glide: false, arm: 0.2, hand: 0.1, beats: 0 };
  }
  function flap(w, dt, effort, canGlide) {
    // effort: 0 cruising .. 1 climbing / landing / taking off
    if (canGlide && !w.glide && w.beats <= 0 && effort < 0.35) { w.glide = true; w.gl = rand(0.6, 1.5); }
    if (w.glide) {
      w.gl -= dt;
      if (w.gl <= 0 || effort > 0.45 || !canGlide) { w.glide = false; w.beats = Math.round(rand(3, 6)); }
      w.arm = lerp(w.arm, 0.28, damp(6, dt)); w.hand = lerp(w.hand, 0.08, damp(6, dt));
      return;
    }
    const before = w.ph;
    const down = Math.cos(w.ph) > 0; // sin falling: downstroke
    w.ph += dt * TAU * w.rate * (down ? 1.18 : 0.86);
    if (Math.floor(before / TAU) !== Math.floor(w.ph / TAU)) {
      w.beats--; w.rate = lerp(4.4, 6.8, effort) * rand(0.92, 1.08); w.amp = rand(0.86, 1.08) * lerp(0.85, 1.12, effort);
    }
    const sn = Math.sin(w.ph);
    w.arm = 0.18 + 0.78 * sn * w.amp;
    w.hand = 0.18 + 1.05 * Math.sin(w.ph - 0.85) * w.amp;
  }

  /* ---------- A mini scene for small canvases (the ambassador dashboard) ---------- */
  function vScene(canvas, opts) {
    const c = canvas.getContext("2d");
    const n = Math.max(0, Math.min(opts.count | 0, 40));
    let w = 0, h = 0, raf = 0, seen = true, last = 0;
    const birds = Array.from({ length: n + 1 }, () => ({ fl: Flapper(), ph: rand(0, TAU) }));
    const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * d; canvas.height = h * d; c.setTransform(d, 0, 0, d, 0, 0); };
    const frame = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
      c.clearRect(0, 0, w, h);
      const k0 = Math.ceil(n / 2) || 1, gap = Math.min(40, (w * 0.64) / (k0 + 1), (h * 0.8) / k0 / 1.1);
      for (let i = n; i >= 0; i--) {
        const b = birds[i], k = Math.ceil(i / 2), side = i % 2 ? -1 : 1, tt = t / 1000;
        if (!RM) flap(b.fl, dt, 0.2, true);
        drawBird(c, w * 0.72 - k * gap + Math.sin(tt * 0.7 + b.ph) * 2, h * 0.42 + (i ? side * k * gap * 0.55 : 0) + Math.sin(tt * 1.3 + b.ph) * 3,
          { s: (i ? 0.42 - Math.min(0.12, k * 0.008) : 0.62) * (Math.min(h, 200) / 150), arm: b.fl.arm, hand: b.fl.hand, accent: i === 0, alpha: i ? 0.82 : 1 });
      }
      if (!RM && seen) raf = requestAnimationFrame(frame);
    };
    fit(); new ResizeObserver(() => { fit(); if (RM) frame(0); }).observe(canvas);
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; cancelAnimationFrame(raf); if (seen) raf = requestAnimationFrame(frame); }).observe(canvas);
    raf = requestAnimationFrame(frame);
  }

  window.BBBird = { drawBird, vScene, ready: false, depart: (cb) => cb() };

  const mode = document.body.dataset.bird || "solo";
  if (mode === "off") return;

  /* ---------- The sky: one fixed canvas for every bird on the page ---------- */
  const cv = document.createElement("canvas");
  cv.className = "bb-sky"; cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, SY = scrollY;
  function size() {
    const d = Math.min(devicePixelRatio || 1, SMALL ? 1.5 : 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  let me = null;
  try { me = JSON.parse(localStorage.getItem("bb_flock_me") || "null"); } catch (e) {}
  const personal = !!(me && me.name) && document.body.dataset.personal !== "off";
  const BASE = SMALL ? 0.66 : 1;

  /* ---------- Perches ---------- */
  let perches = [], meEl = null, flybys = [];
  const asPerch = (el) => ({ el, fx: parseFloat(el.dataset.perch || "0.5") || 0.5, scale: parseFloat(el.dataset.perchScale || "1") || 1, tone: el.dataset.perchTone === "ink" ? 1 : 0 });
  function scan() {
    perches = [...document.querySelectorAll("[data-perch]")].filter((el) => !(SMALL && el.hasAttribute("data-perch-desktop"))).map(asPerch);
    meEl = document.querySelector("[data-perch-me]");
    flybys = [...document.querySelectorAll("[data-flyby]")];
  }
  // where the bird's feet go, in page coordinates (the nav is fixed, so its perch moves with the camera)
  function spot(p) {
    const r = p.el.getBoundingClientRect();
    const fixed = !!p.el.closest(".nav");
    return { x: r.left + r.width * p.fx, y: r.top + SY - 9.5 * p.scale * BASE, fixed, ok: r.width > 0 };
  }

  /* ---------- The bird ---------- */
  const B = {
    st: "hidden", x: 0, y: 0, sp: 0, ang: 0, f: 1, s: BASE, ts: BASE, alpha: 0, ta: 1, tone: 0, tt: 0,
    pitch: 0, fold: 0, tail: 0, perch: null, t: 0, from: null, fl: Flapper(), idleAt: 0, timer: 0, out: null, blur: null, leaving: false,
  };
  const CRUISE = SMALL ? 360 : 470, ACC = SMALL ? 620 : 760, TURN = 2.6;

  function goTo(p) {
    if (B.perch && B.perch.el === p.el && B.st !== "away" && B.st !== "hidden") return;
    B.perch = p; B.ts = p.scale * BASE; B.tt = p.tone; B.ta = 1; B.leaving = false;
    if (B.st === "hidden") enter(p);
    else if (B.st === "perched") takeOff();
    else if (B.st === "landing" || B.st === "away") B.st = "flying";
    wake();
  }
  function enter(p) {
    const t = spot(p), fromLeft = t.x > W / 2 ? Math.random() < 0.75 : Math.random() < 0.25;
    B.x = fromLeft ? -70 : W + 70;
    B.y = SY + clamp(t.y - SY - rand(80, 200), H * 0.08, H * 0.6);
    B.ang = fromLeft ? rand(-0.15, 0.2) : Math.PI + rand(-0.2, 0.15); B.sp = CRUISE * 0.9; B.f = fromLeft ? 1 : -1;
    B.s = BASE * 0.75; B.alpha = 1; B.ta = 1; B.st = "flying"; B.fold = 0;
  }
  function takeOff() { B.st = "takeoff"; B.t = 0; B.sp = 0; }
  // Leave the scene: climb away into the distance, smaller and fainter, then rest.
  function away() {
    if (B.st === "hidden" || B.st === "away") return;
    if (B.st === "perched" || B.st === "takeoff") { if (B.st === "perched") takeOff(); B.leaving = true; wake(); return; }
    B.perch = null; B.st = "away";
    B.out = { x: B.x < W / 2 ? W * rand(0.62, 0.85) : W * rand(0.15, 0.38), y: H * rand(0.04, 0.12) };
    B.ts = BASE * 0.16; B.ta = 0; wake();
  }

  function chooser() {
    if (flockMode) return;
    let best = null, bd = 1e9;
    for (const p of perches) {
      const r = p.el.getBoundingClientRect();
      if (!r.width || r.top < H * 0.14 || r.top > H * 0.8) continue;
      const d = Math.abs(r.top - H * 0.42);
      if (d < bd) { bd = d; best = p; }
    }
    // hysteresis: stay where we are while it's still comfortably on screen
    if (B.perch && perches.includes(B.perch)) {
      const r = B.perch.el.getBoundingClientRect();
      if (r.width && r.top > H * 0.08 && r.top < H * 0.88 && (!best || Math.abs(r.top - H * 0.42) < bd + H * 0.3)) best = B.perch;
    }
    if (!best && personal && meEl && meEl.getBoundingClientRect().width) {
      best = B.perch && B.perch.el === meEl ? B.perch : Object.assign(asPerch(meEl), { fx: 0.5, scale: 0.55 });
    }
    if (best) goTo(best); else away();
  }

  function stepBird(dt) {
    if (B.st === "hidden") return false;
    B.alpha = lerp(B.alpha, B.ta, damp(B.st === "away" ? 1.6 : 6, dt));
    B.s = lerp(B.s, B.ts, damp(B.st === "away" ? 1.2 : 2.5, dt));
    B.tone = lerp(B.tone, B.tt, damp(3, dt));
    B.tail = lerp(B.tail, 0, damp(5, dt));

    if (B.st === "perched") {
      const t = spot(B.perch);
      if (!t.ok) { away(); return true; }
      B.x = t.x; B.y = t.y; B.sp = 0;
      B.fold = lerp(B.fold, 1, damp(8, dt)); B.pitch = lerp(B.pitch, -0.26, damp(6, dt));
      B.f = lerp(B.f, B.x > W * 0.55 ? -1 : 1, damp(5, dt));
      B.fl.arm = lerp(B.fl.arm, 0, damp(8, dt)); B.fl.hand = lerp(B.fl.hand, 0, damp(8, dt));
      // small signs of life: a tail flick or a wing settle now and then
      if (performance.now() >= B.idleAt) {
        B.idleAt = performance.now() + rand(3500, 9000);
        if (Math.random() < 0.55) B.tail = rand(0.6, 1); else { B.fold = 0.55; B.fl.arm = 0.5; B.fl.hand = 0.4; }
      }
      const busy = B.fold < 0.995 || B.tail > 0.02 || B.fl.arm > 0.01 || Math.abs(B.pitch + 0.26) > 0.004 || Math.abs(Math.abs(B.f) - 1) > 0.01;
      // at rest the loop sleeps; it wakes for the next small movement, or when the page scrolls
      if (!busy) { clearTimeout(B.timer); B.timer = setTimeout(wake, Math.max(50, B.idleAt - performance.now())); }
      return busy;
    }

    if (B.st === "takeoff") {
      B.t += dt;
      if (B.t < 0.14) { B.fold = lerp(B.fold, 0.8, damp(20, dt)); B.pitch = lerp(B.pitch, 0.1, damp(20, dt)); return true; } // a small crouch
      B.ang = B.f >= 0 ? -0.75 : Math.PI + 0.75; B.sp = 230;
      B.st = "flying"; B.fold = 0.6;
      if (B.leaving) { B.leaving = false; B.st = "flying"; away(); }
    }

    // target in page coordinates
    let tx, ty, landing = false;
    if (B.st === "away") { tx = B.out.x; ty = B.out.y + SY; }
    else if (B.perch) { const t = spot(B.perch); if (!t.ok) { away(); return true; } tx = t.x; ty = t.y; landing = true; }
    else { away(); return true; }

    const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy);

    // The reader jumped far down the page? The bird is off screen anyway, so it slips out
    // and comes back in from the side, instead of racing across the whole page.
    const sy = B.y - SY;
    if (landing && d > H * 1.3 && (sy < -60 || sy > H + 60)) { B.st = "hidden"; enter(B.perch); return true; }

    if (B.st === "landing") {
      // a short, controlled final approach: flare, flutter, settle
      B.t += dt / B.land;
      const k = ease(clamp(B.t, 0, 1));
      B.x = lerp(B.from.x, tx, k); B.y = lerp(B.from.y, ty, k) - Math.sin(k * Math.PI) * 12;
      B.pitch = lerp(B.pitch, -0.5 + k * 0.25, damp(10, dt));
      B.f = lerp(B.f, B.from.x <= tx ? 1 : -1, damp(8, dt));
      B.fold = k > 0.82 ? lerp(B.fold, 1, damp(14, dt)) : 0;
      flap(B.fl, dt, 1, false);
      if (B.t >= 1) { B.st = "perched"; B.x = tx; B.y = ty; B.idleAt = performance.now() + rand(2000, 5000); B.tail = 0.6; B.blur = null; }
      return true;
    }

    // Steering: speed and heading change gradually (limited acceleration and turn rate),
    // so the path is always a smooth arc. It slows as it nears its perch.
    const wantA = Math.atan2(dy, dx);
    const wantS = B.st === "away" ? CRUISE * 0.85 : CRUISE * clamp(d / 260, 0.32, 1);
    const turn = TURN * (B.sp < 220 ? 1.6 : 1);
    const da = clamp(angDiff(B.ang, wantA), -turn * dt, turn * dt);
    B.ang += da;
    B.sp += clamp(wantS - B.sp, -ACC * dt, ACC * dt);
    const weave = d > 180 && B.st !== "away" ? Math.sin(performance.now() / 900) * 0.08 : 0; // a slow, organic weave
    const vx = Math.cos(B.ang + weave) * B.sp, vy = Math.sin(B.ang + weave) * B.sp;
    B.x += vx * dt; B.y += vy * dt;

    // body language: face the way it flies (turning through edge-on), pitch with the path
    B.f = lerp(B.f, vx >= 0 ? 1 : -1, damp(Math.abs(vx) > 60 ? 4.5 : 1.5, dt));
    const climb = Math.atan2(vy, Math.abs(vx) + 1);
    B.pitch = lerp(B.pitch, clamp(climb, -0.55, 0.55), damp(6, dt));
    B.fold = lerp(B.fold, 0, damp(9, dt));
    const effort = clamp((vy < -40 ? 0.5 : 0) + (B.sp < CRUISE * 0.6 ? 0.45 : 0) + Math.abs(da / dt) * 0.12, 0, 1);
    flap(B.fl, dt, effort, B.sp > CRUISE * 0.7 && vy > -40);
    B.blur = !SMALL && B.sp > CRUISE * 0.85 ? [vx * dt, vy * dt] : null;

    if (landing && d < 70) { B.st = "landing"; B.t = 0; B.from = { x: B.x, y: B.y }; B.land = clamp(d / 160, 0.3, 0.5); }
    if (B.st === "away" && (B.alpha < 0.03 || d < 12)) { B.st = "hidden"; B.alpha = 0; return false; }
    return true;
  }
  function drawMain() {
    if (B.st === "hidden") return;
    drawBird(ctx, B.x, B.y - SY, { s: B.s, f: B.f, pitch: B.pitch, arm: B.fl.arm, hand: B.fl.hand, fold: B.fold, tone: B.tone,
      alpha: B.alpha, accent: personal, tail: B.tail, blur: B.st === "flying" ? B.blur : null, shadow: B.st === "perched" && B.fold > 0.8 });
  }

  /* ---------- Fly-bys: a few birds cross the sky once ---------- */
  const guests = [];
  function flyby(n) {
    if (RM) return;
    n = SMALL ? Math.min(n, 4) : n;
    const ltr = Math.random() < 0.6, y0 = H * rand(0.1, 0.22);
    for (let i = 0; i < n; i++) {
      const s = BASE * rand(0.3, 0.55), sp = rand(260, 340) * (0.6 + s);
      guests.push({ x: ltr ? -40 - i * rand(30, 70) : W + 40 + i * rand(30, 70), y: y0 + rand(-40, 40), vx: ltr ? sp : -sp, s, fl: Flapper(), alpha: rand(0.4, 0.75), drift: rand(-12, 6) });
    }
    wake();
  }

  /* ---------- The flock: a choreographed formation driven by smoothed scroll progress ---------- */
  const flockMode = mode === "flock" && !personal;
  let flock = [], stage = [], prog = 0, progS = 0, flockT = 0;
  function makeFlock() {
    const n = SMALL ? 11 : 24;
    flock = Array.from({ length: n }, (_, i) => {
      const r = Math.sqrt(Math.random()), th = rand(0, TAU), depth = i === 0 ? 1 : rand(0, 1);
      return {
        cx: Math.cos(th) * r, cy: Math.sin(th) * r * 0.5,   // place in the loose cloud
        k: Math.ceil(i / 2), side: i % 2 ? -1 : 1,           // place in the V
        x: -60 - rand(0, 260), y: H * rand(0.12, 0.4), vx: 0, vy: 0, f: 1, pitch: 0,
        s: BASE * (i === 0 ? 0.78 : lerp(0.36, 0.62, depth)), alpha: i === 0 ? 1 : lerp(0.5, 0.92, depth),
        fl: Flapper(), wob: rand(0, TAU), wr: rand(0.6, 1.1), lag: rand(0, 0.25),
      };
    });
  }
  function readProgress() {
    // 0 = top of the page, 1 = the end of the last flock stage reaches the middle of the screen
    if (!stage.length) return 1.6;
    const top = stage[0].getBoundingClientRect().top + SY, lastR = stage[stage.length - 1].getBoundingClientRect();
    const end = lastR.bottom + SY - H * 0.5;
    return clamp((SY - top) / Math.max(1, end - top), -0.2, 1.6);
  }
  function stepFlock(dt) {
    flockT += dt;
    prog = readProgress();
    progS = lerp(progS, prog, damp(2.4, dt)); // the camera eases, so a flick of the wheel never yanks the birds
    const p = progS;
    const hero = SMALL ? { x: W * 0.5, y: H * 0.14 } : { x: W * 0.7, y: H * 0.36 };
    const mid = SMALL ? { x: W * 0.5, y: H * 0.13 } : { x: W * 0.5, y: H * 0.2 };
    const k1 = ease(clamp(p / 0.6, 0, 1)), k2 = ease(clamp((p - 0.72) / 0.45, 0, 1));
    let ax = lerp(hero.x, mid.x, k1), ay = lerp(hero.y, mid.y, k1);
    // a lazy figure of eight while on stage, so the flock is always flying, never hovering
    const orbit = (1 - k2) * (SMALL ? 0.55 : 1);
    ax += Math.sin(flockT * 0.3) * W * 0.1 * orbit; ay += Math.sin(flockT * 0.6) * H * 0.03 * orbit;
    // leaving: the whole formation flies out of frame, up and to the right
    ax = lerp(ax, W + 300, k2); ay = lerp(ay, -H * 0.15, k2);
    const headTo = k2 > 0.05 ? -0.3 : Math.cos(flockT * 0.3) >= 0 ? 0 : Math.PI;
    const spread = (SMALL ? W * 0.34 : W * 0.15) * lerp(1, 1.45, ease(clamp((p - 0.25) / 0.35, 0, 1))) * lerp(1, 0.6, k2);
    const vee = ease(clamp((p - 0.45) / 0.35, 0, 1));
    const gap = SMALL ? 19 : 30, ch = Math.cos(headTo), sh = Math.sin(headTo);
    let any = false;
    for (const b of flock) {
      const ox = lerp(b.cx * spread, -b.k * gap, vee), oy = lerp(b.cy * spread, b.side * b.k * gap * 0.62, vee);
      const tx = ax + ox * ch - oy * sh + Math.sin(flockT * b.wr + b.wob) * 7;
      const ty = ay + ox * sh + oy * ch + Math.cos(flockT * b.wr * 1.3 + b.wob) * 5;
      // critically damped spring: smooth arrival, no overshoot, no shaking
      const kk = 5.5 - b.lag * 6, c = 2 * Math.sqrt(kk);
      b.vx += ((tx - b.x) * kk - b.vx * c) * dt; b.vy += ((ty - b.y) * kk - b.vy * c) * dt;
      const sp = Math.hypot(b.vx, b.vy), lim = 560;
      if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // face the direction of travel; while drifting slowly, face the way the flock heads
      const dirx = Math.abs(b.vx) > 25 ? Math.sign(b.vx) : (Math.cos(headTo) >= 0 ? 1 : -1);
      b.f = lerp(b.f, dirx, damp(3, dt));
      b.pitch = lerp(b.pitch, clamp(Math.atan2(b.vy, Math.abs(b.vx) + 40), -0.5, 0.5), damp(4, dt));
      flap(b.fl, dt, clamp((b.vy < -30 ? 0.5 : 0.1) + (sp > 300 ? 0.3 : 0), 0, 1), sp < 320);
      if (b.x > -80 && b.x < W + 80 && b.y > -80 && b.y < H + 80) any = true;
    }
    return any || prog < 1.25;
  }
  function drawFlock() {
    for (let i = flock.length - 1; i >= 0; i--) {
      const b = flock[i];
      if (b.x < -90 || b.x > W + 90 || b.y < -90 || b.y > H + 90) continue;
      drawBird(ctx, b.x, b.y, { s: b.s, f: b.f, pitch: b.pitch, arm: b.fl.arm, hand: b.fl.hand, alpha: b.alpha });
    }
  }

  /* ---------- Main loop: runs only while something is moving ---------- */
  let raf = 0, last = 0;
  function wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.04, (now - last) / 1000 || 0.016); last = now;
    SY = scrollY;
    let moving = false;
    ctx.clearRect(0, 0, W, H);
    if (flockMode) { moving = stepFlock(dt); drawFlock(); }
    else { moving = stepBird(dt); drawMain(); }
    for (let i = guests.length - 1; i >= 0; i--) {
      const g = guests[i];
      g.x += g.vx * dt; g.y += g.drift * dt;
      flap(g.fl, dt, 0.2, true);
      drawBird(ctx, g.x, g.y, { s: g.s, f: g.vx > 0 ? 1 : -1, pitch: 0.04, arm: g.fl.arm, hand: g.fl.hand, alpha: g.alpha });
      if (g.x < -140 || g.x > W + 140) guests.splice(i, 1);
      moving = true;
    }
    if (moving) raf = requestAnimationFrame(tick);
  }

  /* ---------- Reduced motion: one still bird resting on the first perch ---------- */
  function still() {
    SY = scrollY;
    ctx.clearRect(0, 0, W, H);
    if (flockMode) {
      if (readProgress() > 1) return;
      for (let i = 0; i < 9; i++) {
        const k = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
        drawBird(ctx, (SMALL ? W * 0.62 : W * 0.68) - k * 30, (SMALL ? H * 0.14 : H * 0.32) + (i ? side * k * 18 : 0), { s: BASE * (i ? 0.45 : 0.7), alpha: i ? 0.8 : 1 });
      }
      return;
    }
    let p = perches.find((q) => { const r = q.el.getBoundingClientRect(); return r.width && r.top > 80 && r.top < H - 40; });
    if (!p && personal && meEl) p = Object.assign(asPerch(meEl), { fx: 0.5, scale: 0.55 });
    if (!p) return;
    const t = spot(p);
    drawBird(ctx, t.x, t.y - SY, { s: p.scale * BASE, f: t.x > W * 0.55 ? -1 : 1, pitch: -0.26, fold: 1, tone: p.tone, accent: personal, shadow: true });
  }

  /* ---------- Wiring ---------- */
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false; SY = scrollY;
      if (RM) return still();
      for (const el of flybys) {
        if (el.dataset.flown) continue;
        const r = el.getBoundingClientRect();
        if (r.top < H * 0.55 && r.bottom > H * 0.3) { el.dataset.flown = "1"; flyby(parseInt(el.dataset.flyby, 10) || 5); }
      }
      chooser();
      wake();
    });
  }
  function start() {
    size(); scan();
    stage = [...document.querySelectorAll("[data-flock-stage]")];
    addEventListener("resize", () => { size(); scan(); if (RM) still(); else { chooser(); wake(); } });
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
    if (RM) { still(); window.BBBird.ready = true; return; }
    if (flockMode) { makeFlock(); progS = readProgress(); }
    let back = null;
    try { back = JSON.parse(sessionStorage.getItem("bb-bird") || "null"); sessionStorage.removeItem("bb-bird"); } catch (e) {}
    const delay = back && Date.now() - back.t < 8000 ? 200 : parseInt(document.body.dataset.birdDelay || "900", 10);
    setTimeout(() => { chooser(); wake(); }, delay);
    window.BBBird.ready = true;
  }

  // Leaving the page: the bird lifts off and climbs away; the next page brings it back in.
  window.BBBird.depart = (cb) => {
    try { sessionStorage.setItem("bb-bird", JSON.stringify({ t: Date.now() })); } catch (e) {}
    if (RM) return cb();
    if (!flockMode && B.st !== "hidden") away();
    setTimeout(cb, 300);
  };
  window.BBBird.flyby = flyby;
  window.BBBird.rescan = () => { scan(); chooser(); };
  window.BBBird._debug = () => ({ st: B.st, x: B.x, y: B.y, sp: B.sp, ang: B.ang, prog, progS, flock: flock.map((b) => [b.x, b.y, b.vx, b.vy, b.f]) });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
