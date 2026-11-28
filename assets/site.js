/* Birdboost: shared behaviour for every public page.
   Navigation, the ambassador greeting, the cart badge, reveals and page transitions.
   Load this before bird.js so the bird can find the ambassador's perch. */
(() => {
  "use strict";
  const root = document.documentElement.dataset.root || "";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* A customer arriving on an ambassador's link: remember the code for checkout. */
  const q = new URLSearchParams(location.search);
  const incoming = (q.get("code") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  if (incoming) store.set("bb-code", { code: incoming.toUpperCase(), t: Date.now() });

  /* Cart, shared by the nav badge and the Nest. */
  const cart = {
    items: () => store.get("bb-cart", []),
    save(items) { store.set("bb-cart", items); cart.badge(); },
    count: () => cart.items().reduce((n, i) => n + (i.qty || 0), 0),
    badge() { document.querySelectorAll("[data-cart-count]").forEach((b) => { const n = cart.count(); b.textContent = n ? n : ""; }); },
  };

  /* The ambassador greeting. The portal saves a first name here when they log in. */
  let me = store.get("bb_flock_me", null);
  function paintMe() {
    const on = !!(me && me.name);
    const html = (m) => on
      ? `<a class="pill-link me-pill" href="${root}portal/"${m ? "" : " data-perch-me"}><span class="long">Welcome back,&nbsp;</span><b>${esc(me.name)}</b></a>`
      : `<a class="pill-link" href="${root}portal/">Ambassador log in</a>`;
    document.querySelectorAll("[data-me-slot]").forEach((el) => { el.innerHTML = html(false); });
    document.querySelectorAll("[data-me-slot-m]").forEach((el) => { el.innerHTML = html(true); });
    document.querySelectorAll("[data-me-name]").forEach((el) => { if (on) el.textContent = me.name; });
    document.documentElement.classList.toggle("is-me", on);
  }
  paintMe();
  // Logged in before this update? Ask the portal's database for their first name once.
  const code = (() => { try { return localStorage.getItem("bb_flock_code"); } catch (e) { return null; } })();
  if (!me && code) {
    const s = document.createElement("script");
    s.src = root + "portal/config.js";
    s.onload = () => {
      const C = window.BB_CONFIG || {};
      if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;
      fetch(C.SUPABASE_URL + "/rest/v1/rpc/amb_home", {
        method: "POST", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + C.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: code }),
      }).then((r) => r.ok ? r.json() : null).then((d) => {
        if (d && d.me && d.me.name) { me = { name: d.me.name.split(" ")[0], code: d.me.store_code }; store.set("bb_flock_me", me); paintMe(); }
      }).catch(() => {});
    };
    document.head.appendChild(s);
  }

  /* Header: solid once you scroll; menu on small screens. */
  const nav = $(".nav");
  const onScroll = () => nav && nav.classList.toggle("solid", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const mb = $(".menubtn");
  if (mb) {
    mb.addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      mb.setAttribute("aria-expanded", open);
    });
    document.querySelectorAll(".links a").forEach((a) => a.addEventListener("click", () => { document.body.classList.remove("menu-open"); mb.setAttribute("aria-expanded", "false"); }));
    addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) { document.body.classList.remove("menu-open"); mb.setAttribute("aria-expanded", "false"); mb.focus(); } });
  }

  /* The applications banner disappears after the deadline. */
  /* Campaign promos switch themselves off after their end date, and can be dismissed. */
  document.querySelectorAll("[data-until]").forEach((el) => { if (Date.now() > Date.parse(el.dataset.until)) el.remove(); });
  document.querySelectorAll(".promo[data-promo]").forEach((el) => {
    const key = "bb-promo-" + el.dataset.promo;
    try { if (sessionStorage.getItem(key)) { el.remove(); return; } } catch (e) {}
    const x = el.querySelector(".close"); if (x) x.onclick = () => { el.remove(); try { sessionStorage.setItem(key, "1"); } catch (e) {} };
  });

  /* Reveal things as they come into view. */
  const rv = document.querySelectorAll(".rv,.reveal-img,[data-draw]");
  if ("IntersectionObserver" in window) {
    const revealer = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
    rv.forEach((el) => revealer.observe(el));
  } else rv.forEach((el) => el.classList.add("in"));

  /* Leaving for another Birdboost page: the bird goes first, the page follows. Never longer than a third of a second. */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download") || a.dataset.instant != null) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page, a hash jump
    e.preventDefault();
    document.documentElement.classList.add("leaving");
    const go = () => { location.href = url.href; };
    (window.BBBird && window.BBBird.depart ? window.BBBird.depart : (cb) => cb())(go);
  });
  addEventListener("pageshow", () => document.documentElement.classList.remove("leaving"));

  cart.badge();
  addEventListener("storage", (e) => { if (e.key === "bb-cart") cart.badge(); });
  const y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();

  /* The nest: woven strands drawn as lines, generated so it never looks stamped. */
  function nest(svg, seed = 7) {
    let x = seed; const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const NS = "http://www.w3.org/2000/svg", cx = 200, out = [];
    const strand = (cy, rx, ry, a0, a1, w, col, op, back, tilt = 0, dx = 0) => {
      const pts = [], n = 30, ph = r() * 6, amp = 2 + r() * 5, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i <= n; i++) {
        const t = a0 + (a1 - a0) * (i / n), k = 1 + Math.sin(t * 7 + ph) * amp / rx;
        const ex = Math.cos(t) * rx * k, ey = Math.sin(t) * ry * k;
        pts.push([(cx + dx + ex * ct - ey * st).toFixed(1), (cy + ex * st + ey * ct).toFixed(1)]);
      }
      out.push({ d: "M" + pts.map((p) => p.join(" ")).join("L"), w, col, op, back });
    };
    const twig = (x1, y1, len, ang, w, col, op) => {
      const x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len, mx = (x1 + x2) / 2 + (r() - 0.5) * 8, my = (y1 + y2) / 2 + (r() - 0.5) * 8;
      out.push({ d: `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, w, col, op });
    };
    const tone = () => (r() < 0.1 ? "#3fae3a" : r() < 0.28 ? "#f3f2ec" : r() < 0.6 ? "#c9b497" : "#8d7c66");
    // back of the rim first, fainter
    for (let i = 0; i < 18; i++) strand(98 + r() * 12, 140 + r() * 34, 22 + r() * 14, Math.PI + r() * 0.5, 2 * Math.PI - r() * 0.5, 0.7 + r(), "#8d7c66", 0.3 + r() * 0.3, 1, (r() - 0.5) * 0.22, (r() - 0.5) * 24);
    // the bowl: strands crossing at slight angles, narrower as they go down
    for (let i = 0; i < 54; i++) {
      const depth = Math.pow(r(), 0.8), cy = 100 + depth * 64, rx = (170 - depth * 92) * (0.86 + r() * 0.2), ry = 20 + r() * 34;
      strand(cy, rx, ry, r() * 0.7 - 0.2, Math.PI - r() * 0.7 + 0.2, 0.8 + r() * 1.9, tone(), 0.45 + r() * 0.5, 0, (r() - 0.5) * 0.5, (r() - 0.5) * 30);
    }
    // loose twigs at the rim, the detail that makes it feel built by hand
    for (let i = 0; i < 26; i++) {
      const t = r() * Math.PI * 2, x1 = cx + Math.cos(t) * (150 + r() * 22), y1 = 104 + Math.sin(t) * (26 + r() * 12);
      twig(x1, y1, 16 + r() * 30, (Math.cos(t) > 0 ? 0 : Math.PI) + (r() - 0.5) * 1.3, 0.8 + r() * 1.1, tone(), 0.5 + r() * 0.4);
    }
    svg.setAttribute("viewBox", "0 40 400 200");
    svg.innerHTML = out.map((s, i) => `<path d="${s.d}" pathLength="1" fill="none" stroke="${s.col}" stroke-opacity="${s.op.toFixed(2)}" stroke-width="${s.w.toFixed(2)}" stroke-linecap="round" style="--i:${i}"/>`).join("");
    void NS;
  }
  document.querySelectorAll("svg[data-nest]").forEach((s, i) => nest(s, 7 + i * 13));

  /* Scroll progress: any element with data-progress gets --p from 0 (its top enters the bottom of the screen)
     to 1 (its bottom leaves the top). CSS and small scripts use it for horizontal strips and parallax.
     Only elements on screen are measured, once per frame. */
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const live = new Set();
  let pq = false;
  const progress = () => {
    pq = false;
    const H = innerHeight;
    live.forEach((el) => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (H - r.top) / (H + r.height)));
      el.style.setProperty("--p", p.toFixed(4));
      if (el._onProgress) el._onProgress(p, r);
    });
  };
  const tickP = () => { if (!pq) { pq = true; requestAnimationFrame(progress); } };
  function watchProgress(el) {
    if (RM || !("IntersectionObserver" in window)) { el.style.setProperty("--p", ".5"); return; }
    if (!watchProgress.io) watchProgress.io = new IntersectionObserver((es) => { es.forEach((e) => e.isIntersecting ? live.add(e.target) : live.delete(e.target)); tickP(); }, { rootMargin: "20% 0px" });
    watchProgress.io.observe(el);
  }
  document.querySelectorAll("[data-progress]").forEach(watchProgress);
  addEventListener("scroll", tickP, { passive: true }); addEventListener("resize", tickP);

  window.BB = { root, esc, store, cart, me: () => me, watchProgress, RM };
})();
