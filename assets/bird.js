/* Birdboost: the digital bird.
   One bird travels through every page. It perches on things marked data-perch,
   flies off into the distance when nothing is worth landing on, and leaves the
   page with you when you follow a link. On the ambassador page it brings the
   flock. For a recognised ambassador it becomes "your" bird.

   Markup it understands:
     data-perch="0.8"          land on the top edge of this element, 80% across
     data-perch-scale="0.8"    smaller = further away
     data-perch-me             the ambassador's own perch (the nav pill)
     data-flyby="7"            when this section scrolls in, 7 birds cross the screen once
     data-flock="gather|spread|turn|stream|form|leave"   flock behaviour while this section is centred
     data-flock-targets=".sel" (with form) the flock lands on these elements
   <body data-bird="solo|flock|off"> picks the mode for the page. */
(() => {
  "use strict";
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SMALL = matchMedia("(max-width: 760px)").matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- Drawing one bird ----------
     Local units: about 64 long, facing +x, centred on the body. */
  const WHITE = [245, 245, 242], DARK = [12, 12, 12], GREEN = [63, 174, 58];
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // One long sickle wing. side: 1 = near wing (drawn over the body), -1 = far wing.
  // A slight three-quarter camera keeps both wings readable even mid-glide.
  function wingPath(c, up, fold, side) {
    const span = 46;
    let tx = -15 - 7 * (1 - Math.abs(up)) + (up < 0 ? -up * 6 : 0), ty = -span * up * (up > 0 ? 0.92 : 0.6) + side * 9;
    tx = lerp(tx, -36, fold); ty = lerp(ty, -2.5 + side * 0.8, fold);
    const fx = 7, fy = -1.2, bx = -5, by = 0.6;
    const L = Math.hypot(tx - fx, ty - fy) || 1;
    let nx = -(ty - fy) / L, ny = (tx - fx) / L; if (nx < 0) { nx = -nx; ny = -ny; }
    const L2 = Math.hypot(tx - bx, ty - by) || 1;
    let mx = -(ty - by) / L2, my = (tx - bx) / L2; if (mx < 0) { mx = -mx; my = -my; }
    const bulge = lerp(0.2, 0.06, fold), hollow = lerp(0.13, 0.03, fold);
    c.beginPath();
    c.moveTo(fx, fy);
    c.quadraticCurveTo((fx + tx) / 2 + nx * L * bulge, (fy + ty) / 2 + ny * L * bulge, tx, ty);
    c.quadraticCurveTo((tx + bx) / 2 + mx * L2 * hollow, (ty + by) / 2 + my * L2 * hollow, bx, by);
    c.closePath();
  }
  function drawBird(c, x, y, o) {
    const s = o.s || 1, dir = o.dir || 1, fold = o.fold || 0, up = o.up || 0;
    const tone = mix(WHITE, DARK, o.tone || 0), a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0.01) return;
    c.save();
    c.translate(x, y);
    c.scale(s * dir, s);
    c.rotate(o.pitch || 0);
    // far wing first, a shade darker: depth
    wingPath(c, up, fold, -1);
    c.fillStyle = rgb(mix(tone, o.tone ? WHITE : DARK, 0.28), a); c.fill();
    // body: a slim swallow with long tail streamers, like the bird in the logo
    c.beginPath();
    c.moveTo(24, -0.5);
    c.quadraticCurveTo(20, -2.8, 16, -3.5);
    c.quadraticCurveTo(12, -4.5, 6, -3.5);
    c.quadraticCurveTo(-4, -2.6, -14, -1.4);
    c.lineTo(-43, -6.5);
    c.lineTo(-25, 0);
    c.lineTo(-42, 6);
    c.lineTo(-14, 1.7);
    c.quadraticCurveTo(-2, 4.4, 8, 3.5);
    c.quadraticCurveTo(16, 2.7, 20, 1.2);
    c.quadraticCurveTo(22.5, 0.4, 24, -0.5);
    c.closePath();
    c.fillStyle = rgb(tone, a); c.fill();
    // near wing; an ambassador's own bird carries Birdboost green to the tips
    wingPath(c, up, fold, 1);
    if (o.accent) {
      const g = c.createLinearGradient(4, 0, -30, 0);
      g.addColorStop(0, rgb(tone, a)); g.addColorStop(1, rgb(GREEN, a));
      c.fillStyle = g;
    } else c.fillStyle = rgb(tone, a);
    c.fill();
    c.beginPath(); c.arc(16.6, -1.5, 0.95, 0, TAU);
    c.fillStyle = rgb(o.tone > 0.5 ? WHITE : DARK, a * 0.9); c.fill();
    if (fold > 0.55) {
      c.strokeStyle = rgb(tone, a * (fold - 0.55) / 0.45); c.lineWidth = 1.1 / s + 0.5; c.lineCap = "round";
      c.beginPath(); c.moveTo(3, 3.4); c.lineTo(2, 8.5); c.moveTo(-1.5, 3); c.lineTo(-2.8, 8.3); c.stroke();
    }
    c.restore();
  }

  /* ---------- A mini scene for small canvases (the ambassador dashboard) ---------- */
  function vScene(canvas, opts) {
    const c = canvas.getContext("2d");
    const n = Math.max(0, Math.min(opts.count | 0, 40));
    let w = 0, h = 0, raf = 0, seen = true;
    const fit = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * d; canvas.height = h * d; c.setTransform(d, 0, 0, d, 0, 0);
    };
    const ph = Array.from({ length: n + 1 }, () => Math.random() * TAU);
    const frame = (t) => {
      c.clearRect(0, 0, w, h);
      const lead = [w * 0.72, h * 0.42], gap = Math.min(40, (w * 0.64) / Math.max(4, Math.ceil(n / 2) + 1), (h * 0.8) / Math.max(2, Math.ceil(n / 2)) / 1.1);
      for (let i = n; i >= 0; i--) {
        let x = lead[0], y = lead[1], s = 0.62;
        if (i > 0) {
          const k = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
          x -= k * gap; y += side * k * gap * 0.55; s = 0.42 - Math.min(0.12, k * 0.008);
        }
        const tt = RM ? 0 : t / 1000;
        drawBird(c, x + Math.sin(tt * 0.7 + ph[i]) * 2, y + Math.sin(tt * 1.3 + ph[i]) * 3, {
          s: s * (Math.min(h, 200) / 150), up: RM ? 0.15 : Math.sin(tt * (i ? 6.5 : 5.4) + ph[i]), accent: i === 0, alpha: i ? 0.82 : 1,
        });
      }
      if (!RM && seen) raf = requestAnimationFrame(frame);
    };
    fit(); new ResizeObserver(() => { fit(); if (RM) frame(0); }).observe(canvas);
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => {
      seen = e.isIntersecting; cancelAnimationFrame(raf); if (seen) raf = requestAnimationFrame(frame);
    }).observe(canvas);
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
  let W = 0, H = 0;
  function size() {
    const d = Math.min(devicePixelRatio || 1, SMALL ? 1.5 : 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    wake();
  }

  let me = null;
  try { me = JSON.parse(localStorage.getItem("bb_flock_me") || "null"); } catch (e) {}
  const personal = !!(me && me.name) && document.body.dataset.personal !== "off";

  /* ---------- The bird ---------- */
  const BASE = SMALL ? 0.78 : 1.15;
  const B = {
    x: -80, y: H * 0.3, vx: 0, vy: 0, s: BASE, ts: BASE, up: 0.2, ph: 0, fold: 0, tone: 0, ttone: 0,
    alpha: 0, talpha: 1, mode: "gone", perch: null, target: null, glide: 0, flapOn: true, trail: [],
    ruffle: 0, nextRuffle: 0, accent: personal,
  };
  const perchPoint = (p) => {
    const r = p.el.getBoundingClientRect();
    return [r.left + r.width * p.fx, r.top - 9.5 * p.scale * BASE, r];
  };
  const asPerch = (el) => ({
    el, fx: parseFloat(el.dataset.perch || "0.5") || 0.5,
    scale: parseFloat(el.dataset.perchScale || "1") || 1,
    tone: el.dataset.perchTone === "ink" ? 1 : 0,
  });

  function flyTo(p) {
    B.perch = p; B.target = null;
    if (B.mode === "gone") enterFromSide(p);
    B.mode = "fly"; B.ts = p.scale * BASE; B.ttone = p.tone; B.talpha = 1;
    wake();
  }
  function enterFromSide(p) {
    const [px, py] = p ? perchPoint(p) : [W / 2, H / 3];
    const left = px > W / 2 ? Math.random() < 0.7 : Math.random() < 0.3;
    B.x = left ? -60 : W + 60; B.y = clamp(py - rand(60, 180), 40, H * 0.7);
    B.vx = left ? 380 : -380; B.vy = rand(-40, 40); B.s = BASE * 0.7; B.alpha = 1; B.trail = [];
  }
  // Fly away into the distance: smaller, higher, fainter, then gone.
  function vanish() {
    if (B.mode === "gone" || B.mode === "away") return;
    B.perch = null; B.mode = "away";
    B.target = [B.x < W / 2 ? W * rand(0.6, 0.8) : W * rand(0.2, 0.4), H * rand(0.06, 0.16)];
    B.ts = BASE * 0.18; B.talpha = 0; wake();
  }

  /* ---------- Choosing where to be ---------- */
  let perches = [], meEl = null, flybys = [], flockZones = [];
  function scan() {
    perches = [...document.querySelectorAll("[data-perch]")].map(asPerch);
    meEl = document.querySelector("[data-perch-me]");
    flybys = [...document.querySelectorAll("[data-flyby]")];
    flockZones = [...document.querySelectorAll("[data-flock]")];
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < H && getComputedStyle(el).visibility !== "hidden";
  }
  function choose() {
    if (flockOn) return;
    let best = null, bd = 1e9;
    for (const p of perches) {
      const r = p.el.getBoundingClientRect();
      if (!r.width || r.top < H * 0.1 || r.top > H * 0.82) continue;
      const d = Math.abs(r.top - H * 0.42);
      if (d < bd) { bd = d; best = p; }
    }
    // keep the current perch while it's still comfortably on screen
    if (B.perch && B.perch.el !== (meEl || {}) && perches.includes(B.perch)) {
      const r = B.perch.el.getBoundingClientRect();
      if (r.top > H * 0.06 && r.top < H * 0.9 && (!best || Math.abs(r.top - H * 0.42) < bd + H * 0.25)) best = B.perch;
    }
    if (!best && personal && meEl && visible(meEl)) {
      // an ambassador's bird always comes back to them
      if (!B.perch || B.perch.el !== meEl) best = asPerch(meEl); else best = B.perch;
      best.fx = 0.5; best.scale = 0.55;
    }
    if (best) { if (best !== B.perch) flyTo(best); }
    else vanish();
  }

  /* ---------- Fly-bys: a few birds cross once, then the sky is quiet again ---------- */
  const guests = [];
  function flyby(n) {
    if (RM) return;
    n = SMALL ? Math.min(n, 5) : n;
    const ltr = Math.random() < 0.6, y0 = H * rand(0.18, 0.4);
    for (let i = 0; i < n; i++) {
      const s = BASE * rand(0.32, 0.62), sp = rand(300, 420) * (0.6 + s);
      guests.push({ x: ltr ? -40 - i * rand(30, 70) : W + 40 + i * rand(30, 70), y: y0 + rand(-70, 70), vx: ltr ? sp : -sp,
        vy: rand(-30, 10), s, up: 0, ph: rand(0, TAU), rate: rand(7, 9), alpha: rand(0.45, 0.85) });
    }
    wake();
  }

  /* ---------- The flock (ambassador page) ---------- */
  let flockOn = mode === "flock" && !personal, flock = [], zone = "gather", formTargets = [], flockT = 0;
  function makeFlock() {
    const n = SMALL ? 16 : 34;
    flock = Array.from({ length: n }, (_, i) => {
      const depth = rand(0, 1);
      return { x: rand(-W * 0.6, -40), y: H * rand(0.15, 0.6), vx: rand(140, 220), vy: rand(-20, 20), up: 0, ph: rand(0, TAU),
        s: BASE * (i === 0 ? 0.8 : lerp(0.34, 0.66, depth)), alpha: i === 0 ? 1 : lerp(0.5, 0.95, depth),
        spd: rand(0.85, 1.15), rate: rand(6.5, 9), seat: -1, landed: 0 };
    });
  }
  function readZone() {
    let best = null, bd = 1e9;
    for (const z of flockZones) {
      const r = z.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H) continue;
      const d = Math.abs((r.top + r.bottom) / 2 - H / 2);
      if (d < bd) { bd = d; best = z; }
    }
    const nz = best ? best.dataset.flock : "leave";
    if (nz !== zone) {
      zone = nz;
      flock.forEach((b) => { b.seat = -1; b.landed = 0; });
      if (zone === "form" && best.dataset.flockTargets) {
        formTargets = [...document.querySelectorAll(best.dataset.flockTargets)];
        flock.forEach((b, i) => { b.seat = i < formTargets.length ? i : -1; });
      }
      if (zone !== "leave") flock.forEach((b) => { if (b.gone) { b.gone = false; b.x = -rand(40, 300); b.y = H * rand(0.2, 0.6); b.vx = 200; } });
      wake();
    }
  }
  function stepFlock(dt) {
    flockT += dt;
    let cx, cy, coh = 0.9, sep = 26, ali = 0.6, pull = 1, wan = 0.3, maxV = 230;
    if (zone === "gather") { cx = W * (SMALL ? 0.5 : 0.66) + Math.cos(flockT * 0.35) * W * 0.08; cy = H * 0.4 + Math.sin(flockT * 0.5) * H * 0.07; }
    else if (zone === "spread") { cx = W * 0.5; cy = H * 0.24; coh = 0.08; sep = 70; pull = 0.35; wan = 1.1; maxV = 170; }
    else if (zone === "turn") { cx = W * (0.5 + 0.32 * Math.sin(flockT * 0.45)); cy = H * (0.2 + 0.08 * Math.sin(flockT * 0.9)); ali = 1; maxV = 280; }
    else if (zone === "stream") { cx = null; cy = H * 0.16; ali = 1.2; maxV = 260; }
    else { cx = W * 1.25; cy = -H * 0.3; pull = 1.4; maxV = 320; }
    let busy = false;
    for (let i = 0; i < flock.length; i++) {
      const b = flock[i];
      if (b.gone) continue;
      busy = true;
      let ax = 0, ay = 0, n = 0, mx = 0, my = 0, vx = 0, vy = 0;
      if (b.seat >= 0) {
        // land into a place in the V formation
        const r = formTargets[b.seat] && formTargets[b.seat].getBoundingClientRect();
        if (r && r.width) {
          const tx = r.left + r.width / 2, ty = r.top + r.height / 2, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
          const want = Math.min(maxV * 1.3, d * 3);
          ax = (dx / (d || 1)) * want - b.vx; ay = (dy / (d || 1)) * want - b.vy;
          b.vx += ax * dt * 4; b.vy += ay * dt * 4;
          if (d < 8) b.landed = Math.min(1, b.landed + dt * 3);
          b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * b.rate * (d < 60 ? 0.6 : 1);
          b.up = b.landed ? lerp(b.up, 0, 0.2) : Math.sin(b.ph);
          continue;
        }
      }
      for (let j = 0; j < flock.length; j++) {
        if (i === j || flock[j].gone) continue;
        const o = flock[j], dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > 150 * 150) continue;
        n++; mx += o.x; my += o.y; vx += o.vx; vy += o.vy;
        if (d2 < sep * sep) { const d = Math.sqrt(d2) || 1; ax -= (dx / d) * (sep - d) * 9; ay -= (dy / d) * (sep - d) * 9; }
      }
      if (n) {
        ax += ((mx / n - b.x) * coh) + ((vx / n - b.vx) * ali);
        ay += ((my / n - b.y) * coh) + ((vy / n - b.vy) * ali);
      }
      if (cx == null) { ax += (maxV - b.vx) * 0.8; ay += (cy + Math.sin(b.ph * 0.13 + i) * H * 0.12 - b.y) * 0.6; }
      else { ax += (cx - b.x) * pull * 0.9; ay += (cy - b.y) * pull * 0.9; }
      ax += Math.sin(flockT * 1.7 + i * 1.3) * 60 * wan; ay += Math.cos(flockT * 1.3 + i * 0.7) * 50 * wan;
      b.vx += ax * dt; b.vy += ay * dt;
      const sp = Math.hypot(b.vx, b.vy), lim = maxV * b.spd;
      if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
      if (sp < 70) { b.vx *= 70 / (sp || 1); b.vy *= 70 / (sp || 1); }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (zone === "stream" && b.x > W + 60) { b.x = -60; b.y = H * rand(0.15, 0.55); }
      if (zone === "leave" && (b.x > W + 80 || b.y < -80)) b.gone = true;
      const climbing = b.vy < -40;
      b.ph += dt * b.rate * (climbing ? 1.25 : 1);
      // birds in a flock flap in bursts and glide in between
      const g = Math.sin(flockT * 0.9 + i) > 0.35 && !climbing;
      b.up = g ? lerp(b.up, 0.12, 0.12) : Math.sin(b.ph);
    }
    return busy;
  }

  /* ---------- Main loop: runs only while something is moving ---------- */
  let raf = 0, last = 0;
  function wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    let moving = false;
    ctx.clearRect(0, 0, W, H);

    if (flockOn) {
      readZone();
      moving = stepFlock(dt) || moving;
      for (let i = flock.length - 1; i >= 0; i--) {
        const b = flock[i];
        if (b.gone) continue;
        const dir = b.vx >= 0 ? 1 : -1;
        drawBird(ctx, b.x, b.y, { s: b.s, dir, pitch: clamp(Math.atan2(b.vy, Math.abs(b.vx)), -0.6, 0.6),
          up: b.up, alpha: b.alpha * (1 - b.landed) * (zone === "gather" || zone === "form" ? 1 : 0.7), fold: b.landed * 0.6 });
      }
    } else {
      moving = stepBird(dt) || moving;
    }

    for (let i = guests.length - 1; i >= 0; i--) {
      const g = guests[i];
      g.x += g.vx * dt; g.y += g.vy * dt; g.vy += Math.sin(g.ph * 0.2) * 6 * dt; g.ph += dt * g.rate;
      g.up = Math.sin(g.ph);
      drawBird(ctx, g.x, g.y, { s: g.s, dir: g.vx > 0 ? 1 : -1, pitch: Math.atan2(g.vy, Math.abs(g.vx)), up: g.up, alpha: g.alpha });
      if (g.x < -120 || g.x > W + 120) guests.splice(i, 1);
      moving = true;
    }
    if (moving) raf = requestAnimationFrame(tick);
  }

  function stepBird(dt) {
    if (B.mode === "gone") return false;
    let tx, ty;
    if (B.perch) {
      if (!B.perch.el.isConnected) { vanish(); }
      else { const p = perchPoint(B.perch); tx = p[0]; ty = p[1]; }
    }
    if (B.target) { tx = B.target[0]; ty = B.target[1]; }

    if (B.mode === "perched") {
      B.x = tx; B.y = ty; B.vx = B.vy = 0;
      B.fold = Math.min(1, B.fold + dt * 6);
      B.up = lerp(B.up, 0, 0.3);
      // now and then, a small settle of the wings
      if (!RM && performance.now() > B.nextRuffle) { B.ruffle = 0.35; B.nextRuffle = performance.now() + rand(5000, 11000); }
      if (B.ruffle > 0) { B.ruffle -= dt; B.fold = 1 - Math.sin((0.35 - B.ruffle) / 0.35 * Math.PI) * 0.45; B.up = Math.sin(B.ruffle * 40) * 0.4; }
      B.s = lerp(B.s, B.ts, 0.15); B.tone = lerp(B.tone, B.ttone, 0.2);
      draw();
      return B.ruffle > 0 || B.fold < 1;
    }

    // steering: seek with arrival, plus a slow wander so the path never looks drawn with a ruler
    const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy) || 1;
    const maxV = (SMALL ? 520 : 640) * (B.mode === "away" ? 0.8 : 1);
    const arrive = B.mode === "fly" ? clamp(d / 190, 0.12, 1) : 1;
    let wx = 0, wy = 0;
    if (d > 140) { const t = performance.now() / 1000; wx = -dy / d * Math.sin(t * 1.7) * 160; wy = dx / d * Math.sin(t * 1.7) * 160; }
    const desVx = dx / d * maxV * arrive + wx, desVy = dy / d * maxV * arrive + wy;
    const acc = 1500;
    let sx = desVx - B.vx, sy = desVy - B.vy; const sm = Math.hypot(sx, sy);
    if (sm > acc * dt) { sx *= acc * dt / sm; sy *= acc * dt / sm; }
    B.vx += sx; B.vy += sy;
    B.x += B.vx * dt; B.y += B.vy * dt;
    B.s = lerp(B.s, B.ts, 1 - Math.pow(0.04, dt));
    B.alpha = lerp(B.alpha, B.talpha, 1 - Math.pow(B.mode === "away" ? 0.2 : 0.002, dt));
    B.tone = lerp(B.tone, B.ttone, 1 - Math.pow(0.02, dt));
    B.fold = Math.max(0, B.fold - dt * 5);

    // wings: flap hard to climb and to land, glide in between when cruising
    const sp = Math.hypot(B.vx, B.vy);
    B.glide -= dt;
    if (B.glide <= 0) { B.flapOn = !B.flapOn; B.glide = B.flapOn ? rand(0.45, 0.8) : rand(0.5, 1.1); }
    const mustFlap = B.vy < -80 || (B.mode === "fly" && d < 120) || sp < 160;
    if (B.flapOn || mustFlap) { B.ph += dt * TAU * (d < 120 ? 5.2 : 4); B.up = Math.sin(B.ph); }
    else B.up = lerp(B.up, 0.14, 0.15);

    // a faint green wake when moving fast (not on phones)
    if (!SMALL && sp > 260 && B.mode !== "away") B.trail.push([B.x, B.y, 1]);
    for (const p of B.trail) p[2] -= dt * 2.2;
    while (B.trail.length && B.trail[0][2] <= 0) B.trail.shift();

    if (B.mode === "fly" && B.perch && d < 4 && sp < 120) { B.mode = "perched"; B.nextRuffle = performance.now() + rand(3000, 7000); }
    if (B.mode === "away" && (B.alpha < 0.03 || d < 10)) { B.mode = "gone"; B.trail = []; draw(); return false; }
    draw();
    return true;
  }
  function draw() {
    if (B.trail.length > 2) {
      ctx.lineCap = "round";
      for (let i = 1; i < B.trail.length; i++) {
        const a = B.trail[i - 1], b = B.trail[i];
        ctx.strokeStyle = `rgba(63,174,58,${Math.max(0, b[2]) * 0.28})`; ctx.lineWidth = 1.4 * b[2];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    const perched = B.mode === "perched";
    const dir = perched ? (B.x > W * 0.5 ? -1 : 1) : (B.vx >= 0 ? 1 : -1);
    const pitch = perched ? -0.3 : clamp(Math.atan2(B.vy, Math.abs(B.vx) + 1), -0.65, 0.65);
    drawBird(ctx, B.x, B.y, { s: B.s, dir, pitch, up: B.up, fold: B.fold, tone: B.tone, alpha: B.alpha, accent: B.accent });
  }

  /* ---------- Reduced motion: the bird simply rests on the first perch ---------- */
  function still() {
    ctx.clearRect(0, 0, W, H);
    let p = perches.find((q) => { const r = q.el.getBoundingClientRect(); return r.width && r.top > 80 && r.top < H - 40; });
    if (personal && meEl && visible(meEl) && !p) p = Object.assign(asPerch(meEl), { fx: 0.5, scale: 0.55 });
    if (flockOn) {
      for (let i = 0; i < 9; i++) drawBird(ctx, W * 0.62 - (i ? Math.ceil(i / 2) * 34 : 0), H * 0.32 + (i ? (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 20 : 0), { s: BASE * (i ? 0.45 : 0.7), up: 0.15, alpha: i ? 0.8 : 1 });
      return;
    }
    if (!p) return;
    const [x, y] = perchPoint(p);
    if (y < 0 || y > H) return;
    drawBird(ctx, x, y, { s: p.scale * BASE, dir: x > W / 2 ? -1 : 1, pitch: -0.3, fold: 1, tone: p.tone, accent: personal });
  }

  /* ---------- Wiring ---------- */
  let scrollQueued = false, lastY = scrollY;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const dy = scrollY - lastY; lastY = scrollY;
      if (RM) return still();
      // the world moves; a flying bird drifts with it a little
      if (B.mode === "fly" || B.mode === "away") B.y -= dy * 0.25;
      for (const el of flybys) {
        if (el.dataset.flown) continue;
        const r = el.getBoundingClientRect();
        if (r.top < H * 0.55 && r.bottom > H * 0.3) { el.dataset.flown = "1"; flyby(parseInt(el.dataset.flyby, 10) || 6); }
      }
      choose();
      wake();
    });
  }

  function start() {
    size(); scan();
    addEventListener("resize", () => { size(); scan(); if (RM) still(); else choose(); });
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
    if (RM) { still(); window.BBBird.ready = true; return; }
    if (flockOn) makeFlock();

    // Coming from another Birdboost page? The same bird flies back in.
    let back = null;
    try { back = JSON.parse(sessionStorage.getItem("bb-bird") || "null"); sessionStorage.removeItem("bb-bird"); } catch (e) {}
    const delay = back && Date.now() - back.t < 8000 ? 250 : parseInt(document.body.dataset.birdDelay || "900", 10);
    setTimeout(() => { choose(); wake(); }, delay);
    window.BBBird.ready = true;
  }

  // Leaving: the bird flies off into the distance with you.
  window.BBBird.depart = (cb) => {
    try { sessionStorage.setItem("bb-bird", JSON.stringify({ t: Date.now() })); } catch (e) {}
    if (RM) return cb();
    if (B.mode !== "gone" && !flockOn) {
      B.perch = null; B.mode = "away"; B.target = [W * 0.82, -30]; B.ts = BASE * 0.2; B.talpha = 0.3;
      B.vy = Math.min(B.vy, -200); wake();
    } else if (flockOn) { zone = "leave"; wake(); }
    setTimeout(cb, 320);
  };
  window.BBBird.flyby = flyby;
  window.BBBird.rescan = () => { scan(); choose(); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
