/* Birdboost shop: shared by the Nest and every piece page.
   - Loads the pieces (from the admin page's shop when it's switched on, otherwise assets/catalog.js)
   - The order drawer: your order, your details, order placed (saved to Supabase and emailed through Formspree)
   - Find my size: a recommendation from height, weight, build and fit preference, using each piece's own measurements
   - Full-screen zoom for photos
   Needs: portal/config.js, assets/catalog.js and assets/site.js loaded first. */
(() => {
  "use strict";
  const { esc, store, cart, root } = window.BB;
  const CFG = window.BB_CONFIG || {};
  const FORMSPREE = "https://formspree.io/f/mdegjvad"; // a copy of every order is emailed here, and it's the backup if the database can't be reached
  const hasDB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/PASTE/.test(CFG.SUPABASE_URL));
  const rpc = (fn, body) => fetch(CFG.SUPABASE_URL + "/rest/v1/rpc/" + fn, { method: "POST",
    headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: "Bearer " + CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}) }).then((r) => r.ok ? r.json() : Promise.reject(new Error("http " + r.status)));
  const money = (v, cur) => v == null ? null : new Intl.NumberFormat("en", { style: "currency", currency: cur || "USD", minimumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  const img = (u) => /^(https?:|data:)/.test(u || "") ? u : u ? root + u : "";
  const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const $ = (id) => document.getElementById(id);
  const pieceUrl = (p) => root + "nest/piece/?id=" + encodeURIComponent(p.id);

  /* ---------- pieces ---------- */
  function fromDB(p) {
    return { id: p.id, uuid: p.uuid || (isUUID(p.id) ? p.id : null), style: p.name, color: p.color || "", swatch: p.swatch || "", category: p.category || "Pieces",
      price: p.price, currency: p.currency || "USD", sizes: (p.sizes || "").split(",").map((s) => s.trim()).filter(Boolean),
      image: p.front_image, back: p.back_image, model: p.model_url, gallery: [], description: p.description || "",
      fit: p.fit || null, chart: p.size_chart || null, material: p.material || "", care: p.care || "", styling: p.styling || "",
      badge: p.stage === "preorder" ? "Pre-order" : (p.release_note || "") };
  }
  let loading = null;
  function load() {
    if (loading) return loading;
    loading = (async () => {
      if (hasDB) {
        try { const d = await rpc("shop_catalog"); if (Array.isArray(d) && d.length) return d.map(fromDB); } catch (e) {}
      }
      return (window.BB_CATALOG || []).map((p) => ({ gallery: [], sizes: [], ...p }));
    })();
    return loading;
  }
  const siblings = (list, p) => list.filter((x) => x.style === p.style && x.color);
  const dot = (s) => /^#[0-9a-f]{3,8}$/i.test(s.swatch || "") ? s.swatch : "#777";

  /* ---------- find my size ----------
     An honest estimate, not a measurement. We estimate chest size from height and weight (adjusted for build),
     then compare it with each size of this piece, aiming for the room the piece is designed to have. */
  const GENERAL = { XS: 86, S: 92, M: 100, L: 108, XL: 116, XXL: 124, "3XL": 132 }; // a general unisex guide: body chest (cm) each size suits best
  const EASE = { fitted: 6, regular: 12, relaxed: 18, oversized: 26 };                // room (cm) around the chest each fit is meant to have
  const FITWORD = { fitted: "a fitted look", regular: "the intended regular fit", relaxed: "the intended relaxed fit", oversized: "the intended oversized fit" };
  function estimateChest(h, w, build) {
    const bmi = w / Math.pow(h / 100, 2);
    let c = 0.54 * h * Math.pow(bmi / 22, 0.45);
    c += { slim: -3, average: 0, athletic: 4, broad: 7 }[build] || 0;
    return c;
  }
  function recommend(p, f) {
    const sizes = p.sizes.length ? p.sizes : Object.keys(GENERAL);
    const body = estimateChest(f.h, f.w, f.build);
    const fit = EASE[p.fit] != null ? p.fit : "regular";
    const want = EASE[fit] + ({ closer: -4, designed: 0, roomier: 6 }[f.pref] || 0);
    const chart = p.chart && typeof p.chart === "object" ? p.chart : null;
    const rows = sizes.map((s) => {
      let fitsBody;
      if (chart && chart[s] && +chart[s].chest) fitsBody = +chart[s].chest * 2 - EASE[fit];  // the body this size is cut for
      else if (GENERAL[s]) fitsBody = GENERAL[s];
      else return null;
      return { s, gap: body + want - EASE[fit] - fitsBody };                                // > 0: you'd want more room than this size gives
    }).filter(Boolean);
    if (!rows.length) return null;
    rows.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
    const best = rows[0], next = rows[1];
    const between = next && Math.abs(Math.abs(best.gap) - Math.abs(next.gap)) < 2.5;
    const order = sizes.filter((s) => rows.some((r) => r.s === s));
    const outOfRange = (best.s === order[0] && best.gap < -8) || (best.s === order[order.length - 1] && best.gap > 8);
    let length = "";
    if (chart && chart[best.s] && +chart[best.s].length) {
      const ideal = f.h * 0.41, L = +chart[best.s].length;
      if (L < ideal - 4) length = "It may sit a little short on you.";
      else if (L > ideal + 6) length = "It will sit a little long, which suits a relaxed look.";
    }
    return { size: best.s, other: between ? next.s : null, otherBigger: between && order.indexOf(next.s) > order.indexOf(best.s), fit, chart: !!chart, outOfRange, length };
  }
  function sizeSheet(p, onPick) {
    let dlg = $("fmsdlg");
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.id = "fmsdlg"; dlg.className = "sheet"; dlg.setAttribute("aria-labelledby", "fmsh");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
    }
    const saved = store.get("bb-fit", {});
    const unit = saved.unit || "metric";
    dlg.innerHTML = `<div class="sheet-in"><header><div><span class="eyebrow-s">Find my size</span><h2 id="fmsh">${esc(p.style)}</h2></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
      <form id="fmsf" class="fms" novalidate>
        <p class="mute" style="margin:0">Tell us a little about you and we'll suggest a size for this piece. Takes ten seconds.</p>
        <div class="seg units" role="radiogroup" aria-label="Units"><label><input type="radio" name="unit" value="metric"${unit === "metric" ? " checked" : ""}><span>cm · kg</span></label><label><input type="radio" name="unit" value="imperial"${unit === "imperial" ? " checked" : ""}><span>ft · lb</span></label></div>
        <div class="two">
          <label class="m">Height<span class="unitbox"><input name="h" inputmode="decimal" autocomplete="off" value="${esc(saved.h ? (unit === "metric" ? Math.round(saved.h) : "") : "")}" placeholder="175"><i>cm</i></span></label>
          <label class="i">Height<span class="unitbox two-in"><input name="ft" inputmode="numeric" value="${saved.h && unit === "imperial" ? Math.floor(saved.h / 30.48) : ""}" placeholder="5"><i>ft</i><input name="in" inputmode="numeric" value="${saved.h && unit === "imperial" ? Math.round((saved.h / 2.54) % 12) : ""}" placeholder="9"><i>in</i></span></label>
          <label>Weight<span class="unitbox"><input name="w" inputmode="decimal" autocomplete="off" value="${saved.w ? (unit === "metric" ? Math.round(saved.w) : Math.round(saved.w * 2.2046)) : ""}" placeholder="${unit === "metric" ? "70" : "155"}"><i class="wu">${unit === "metric" ? "kg" : "lb"}</i></span></label>
        </div>
        <fieldset><legend>Your build</legend><div class="seg four">${[["slim", "Slim"], ["average", "Average"], ["athletic", "Athletic"], ["broad", "Broad"]].map(([v, t]) => `<label><input type="radio" name="build" value="${v}"${(saved.build || "average") === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>
        <fieldset><legend>How do you like it to fit?</legend><div class="seg three">${[["closer", "Closer"], ["designed", "As designed"], ["roomier", "Roomier"]].map(([v, t]) => `<label><input type="radio" name="pref" value="${v}"${(saved.pref || "designed") === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>
        <p class="err" id="fmserr" role="alert"></p>
        <button class="btn w">Suggest my size</button>
        <div id="fmsout" aria-live="polite"></div>
      </form></div>`;
    const f = $("fmsf");
    const units = () => { const imp = f.elements.unit.value === "imperial"; f.classList.toggle("imp", imp); f.querySelector(".wu").textContent = imp ? "lb" : "kg"; };
    f.addEventListener("change", (e) => { if (e.target.name === "unit") units(); }); units();
    f.onsubmit = (e) => {
      e.preventDefault();
      const imp = f.elements.unit.value === "imperial", n = (k) => parseFloat(String(f.elements[k].value).replace(",", "."));
      const h = imp ? (n("ft") || 0) * 30.48 + (n("in") || 0) * 2.54 : n("h");
      const w = imp ? n("w") / 2.2046 : n("w");
      if (!(h > 120 && h < 230) || !(w > 30 && w < 250)) { $("fmserr").textContent = "Please add your height and weight."; return; }
      $("fmserr").textContent = "";
      const fit = { h, w, build: f.elements.build.value, pref: f.elements.pref.value, unit: imp ? "imperial" : "metric" };
      store.set("bb-fit", fit);
      const r = recommend(p, fit);
      if (!r) { $("fmsout").innerHTML = `<p class="mute">We can't suggest a size for this piece yet. Message us on Instagram and we'll help.</p>`; return; }
      $("fmsout").innerHTML = `<div class="rec">
        <span class="eyebrow-s">We'd suggest</span>
        <div class="recsize">${esc(r.size)}</div>
        <p><b>${r.outOfRange ? `${esc(r.size)} is the closest size we have, but it may not fit the way it's meant to.` : `${esc(r.size)} should give you ${FITWORD[r.fit]}.`}</b> ${r.other ? `You're between ${esc(r.size)} and ${esc(r.other)}. ${r.otherBigger ? `Go ${esc(r.other)} if you like more room or want to layer.` : `Go ${esc(r.other)} for a closer fit.`}` : ""} ${esc(r.length)}</p>
        <p class="fine">${r.chart ? "Based on this piece's measurements and typical body proportions." : "This piece's exact measurements aren't listed yet, so this uses a general unisex size guide."} It's a suggestion, not a guarantee. You can always choose a different size.</p>
        <div class="row"><button class="btn g" type="button" data-pick="${esc(r.size)}">Choose ${esc(r.size)}</button>${r.other ? `<button class="btn o" type="button" data-pick="${esc(r.other)}">Choose ${esc(r.other)}</button>` : ""}</div></div>`;
      $("fmsout").querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { onPick(b.dataset.pick); dlg.close(); });
      $("fmsout").scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    dlg.showModal();
  }

  /* ---------- zoom: pinch, scroll-wheel, drag and double-tap ---------- */
  let zoom = null, zimg = null, Z = { s: 1, x: 0, y: 0 };
  function zoomInit() {
    if (zoom) return;
    zoom = document.createElement("dialog"); zoom.className = "zoom"; zoom.setAttribute("aria-label", "Zoomed photo");
    zoom.innerHTML = `<div class="zh">Pinch or scroll to zoom · drag to look around</div><img alt=""><button class="zx" type="button" aria-label="Close zoom">×</button>
      <div class="zc"><button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="1" aria-label="Zoom in">+</button></div>`;
    document.body.appendChild(zoom); zimg = zoom.querySelector("img");
    const pts = new Map(); let pinch = null, lastTap = 0;
    const draw = () => {
      const w = zimg.offsetWidth, h = zimg.offsetHeight, W = innerWidth, H = innerHeight;
      const mx = Math.max(0, (w * Z.s - W) / 2), my = Math.max(0, (h * Z.s - H) / 2);
      Z.x = Math.max(-mx, Math.min(mx, Z.x)); Z.y = Math.max(-my, Math.min(my, Z.y));
      zimg.style.transform = `translate(${Z.x - w * Z.s / 2}px,${Z.y - h * Z.s / 2}px) scale(${Z.s})`;
    };
    const set = (s, cx = innerWidth / 2, cy = innerHeight / 2) => {
      s = Math.max(1, Math.min(4, s)); const k = s / Z.s, ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
      Z.x = ox - (ox - Z.x) * k; Z.y = oy - (oy - Z.y) * k; Z.s = s; draw();
    };
    zoom._set = set; zoom._draw = draw;
    zoom.querySelector(".zx").onclick = () => zoom.close();
    zoom.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => set(Z.s * (b.dataset.z > 0 ? 1.5 : 1 / 1.5)));
    zoom.addEventListener("wheel", (e) => { e.preventDefault(); set(Z.s * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY); }, { passive: false });
    zoom.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      zoom.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: Z.s }; }
      const now = Date.now(); if (pts.size === 1 && now - lastTap < 300) { set(Z.s > 1.5 ? 1 : 2.5, e.clientX, e.clientY); lastTap = 0; } else lastTap = now;
    });
    zoom.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; set(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); }
      else if (pts.size === 1) { Z.x += dx; Z.y += dy; draw(); }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    zoom.addEventListener("pointerup", end); zoom.addEventListener("pointercancel", end);
    addEventListener("resize", () => { if (zoom.open) draw(); });
  }
  function openZoom(src, alt) {
    zoomInit();
    zimg.src = src; zimg.alt = alt || ""; Z = { s: 1, x: 0, y: 0 };
    zoom.showModal();
    (zimg.complete && zimg.naturalWidth ? Promise.resolve() : new Promise((r) => { zimg.onload = r; })).then(() => zoom._set(2));
  }

  /* ---------- the order drawer ---------- */
  let cd = null, codeInfo = null, view = "cart";
  const codeNow = () => (store.get("bb-code", null) || {}).code || "";
  function drawerInit() {
    if (cd) return;
    cd = document.createElement("dialog"); cd.className = "drawer"; cd.id = "cart"; cd.setAttribute("aria-labelledby", "carth");
    cd.innerHTML = `<div class="in"><header><h2 id="carth">Your order</h2><button class="x" type="button" data-close aria-label="Close">×</button></header><div class="body" id="cbody"></div><footer id="cfoot"></footer></div>`;
    document.body.appendChild(cd);
    cd.addEventListener("close", () => { if (location.hash === "#cart") history.replaceState(null, "", location.pathname + location.search); if (view !== "cart") view = "cart"; });
    cd.addEventListener("click", (e) => { if (e.target === cd || e.target.closest("[data-close]")) cd.close(); });
    $("cbody").addEventListener("click", (e) => {
      const items = cart.items();
      const s = e.target.closest("[data-step]"); if (s) { const i = items[+s.dataset.step]; i.qty = Math.max(1, Math.min(10, i.qty + +s.dataset.d)); cart.save(items); paint(); }
      const r = e.target.closest("[data-rm]"); if (r) { items.splice(+r.dataset.rm, 1); cart.save(items); paint(); }
    });
  }
  function totals(items) {
    const priced = items.every((i) => i.price != null), cur = (items[0] || {}).currency || "USD";
    const sub = items.reduce((n, i) => n + (i.price || 0) * i.qty, 0);
    const pct = codeInfo && codeInfo.ok && codeInfo.percent ? +codeInfo.percent : 0;
    return { priced, cur, sub, pct, total: Math.round(sub * (1 - pct / 100) * 100) / 100, n: items.reduce((n, i) => n + i.qty, 0) };
  }
  const steps = (n) => `<div class="steps" aria-label="Step ${n} of 2"><span${n === 1 ? ' aria-current="step"' : ""}>1 · Your order</span><span aria-hidden="true">—</span><span${n === 2 ? ' aria-current="step"' : ""}>2 · Your details</span></div>`;
  function codeMsg() {
    const c = codeNow(); if (!c) return "";
    if (codeInfo && codeInfo.code === c) {
      if (!codeInfo.ok) return "We couldn't find that code. Check it, or leave it empty.";
      return `${codeInfo.name ? "Code from " + esc(codeInfo.name) + ", a Birdboost ambassador. " : "Code applied. "}${codeInfo.percent ? codeInfo.percent + "% off." : ""}`;
    }
    return `Code ${esc(c)} added to your order.`;
  }
  async function applyCode(v) {
    const c = String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40);
    if (!c) { store.set("bb-code", null); codeInfo = null; return paint(); }
    store.set("bb-code", { code: c, t: Date.now() });
    codeInfo = null;
    if (hasDB) { try { const d = await rpc("shop_check_code", { p_code: c }); if (d && typeof d === "object") codeInfo = { code: c, ok: !!d.ok, name: d.name, percent: d.percent }; } catch (e) {} }
    paint();
  }
  function paint() {
    const items = cart.items(), body = $("cbody"), foot = $("cfoot");
    if (view === "done") return;
    if (!items.length) {
      body.innerHTML = `<div class="empty-o"><p>Nothing in your order yet.</p><a class="btn o" href="${root}nest/">Browse the Nest</a></div>`;
      foot.innerHTML = ""; return;
    }
    const t = totals(items);
    if (view === "cart") {
      body.innerHTML = steps(1) + items.map((i, n) => `<div class="line"><img src="${esc(i.image)}" alt="">
        <div><b>${esc(i.name)}</b><div class="mute" style="font-size:14px">${[i.color, i.size && "Size " + i.size].filter(Boolean).map(esc).join(" · ")}</div>
        <div class="qty" style="margin-top:6px"><button type="button" data-step="${n}" data-d="-1" aria-label="One less">−</button><output>${i.qty}</output><button type="button" data-step="${n}" data-d="1" aria-label="One more">+</button></div></div>
        <div style="text-align:right">${i.price == null ? '<span class="mute" style="font-size:13px">Price to confirm</span>' : `<b>${esc(money(i.price * i.qty, i.currency))}</b>`}<br><button class="rm" type="button" data-rm="${n}">Remove</button></div></div>`).join("")
        + `<form class="codebox" id="cf"><label class="sr-only" for="code">Ambassador code</label><input class="field" id="code" placeholder="Ambassador code" value="${esc(codeNow())}" autocomplete="off"><button class="btn o">Apply</button></form>
        <p class="codemsg" id="cmsg" aria-live="polite">${codeMsg()}</p>`;
      foot.innerHTML = `<div class="tot"><span>${t.pct ? "Total with your code (−" + t.pct + "%)" : "Total"}</span>${t.priced ? `<b>${esc(money(t.total, t.cur))}</b>` : `<b class="soft">Confirmed when we contact you</b>`}</div>
        <button class="btn w" type="button" id="tocheck">Continue <span class="arr">→</span></button>`;
      $("cf").onsubmit = (e) => { e.preventDefault(); applyCode($("code").value); };
      $("tocheck").onclick = () => { view = "check"; paint(); $("cbody").scrollTop = 0; };
    } else if (view === "check") {
      const s = store.get("bb-buyer", {}), del = s.delivery || "Delivery";
      body.innerHTML = steps(2) + `<form class="ff" id="co" novalidate>
        <p class="mute" style="margin:0">Where can we reach you? Birdboost will contact you to confirm your order, delivery and payment. Nothing is paid on the website.</p>
        <label>Full name<input name="name" autocomplete="name" required value="${esc(s.name || "")}"></label>
        <label>Phone number <small>WhatsApp or calls</small><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="e.g. 077 123 4567" value="${esc(s.phone || "")}"></label>
        <label>Email <small>optional</small><input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(s.email || "")}"></label>
        <div><div class="lbl" id="dl">Delivery or collection</div><div class="seg" role="radiogroup" aria-labelledby="dl">
          <label><input type="radio" name="delivery" value="Delivery"${del !== "Collection" ? " checked" : ""}><span>Delivery</span></label>
          <label><input type="radio" name="delivery" value="Collection"${del === "Collection" ? " checked" : ""}><span>Collection</span></label></div></div>
        <label>City or town<input name="city" required autocomplete="address-level2" value="${esc(s.city || "")}"></label>
        <label id="addrl">Area or address <small>for delivery</small><input name="address" autocomplete="street-address" value="${esc(s.address || "")}"></label>
        <label>Anything we should know? <small>optional</small><textarea name="note" rows="2"></textarea></label>
        <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">
        <p class="err" id="coerr" role="alert"></p>
      </form>`;
      foot.innerHTML = `<div class="tot"><span>${t.n} ${t.n === 1 ? "piece" : "pieces"}${codeNow() ? " · code " + esc(codeNow()) : ""}</span>${t.priced ? `<b>${esc(money(t.total, t.cur))}</b>` : `<b class="soft">Confirmed when we contact you</b>`}</div>
        <button class="btn g" type="submit" form="co" id="place">Place order</button><button class="btn o" type="button" id="back">Back</button>`;
      const co = $("co"), addr = () => { $("addrl").hidden = co.elements.delivery.value === "Collection"; };
      co.addEventListener("change", addr); addr();
      co.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));
      $("back").onclick = () => { view = "cart"; paint(); };
      co.onsubmit = place;
    }
  }
  const newRef = () => "BB-" + Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 5).toUpperCase();
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  async function place(e) {
    e.preventDefault();
    const f = e.target, v = (k) => String(f.elements[k].value || "").trim(), err = $("coerr");
    if (v("_gotcha")) return;
    f.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    const delivery = v("delivery") || "Delivery";
    const miss = ["name", "phone", "city"].filter((k) => !v(k));
    if (v("phone") && v("phone").replace(/[^0-9]/g, "").length < 7) miss.push("phone");
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("email"))) miss.push("email");
    if (miss.length) {
      const names = { name: "your name", phone: "a phone number we can reach you on", city: "your city or town", email: "an email like name@example.com (or leave it empty)" };
      [...new Set(miss)].forEach((k) => f.elements[k].setAttribute("aria-invalid", "true")); f.elements[miss[0]].focus();
      err.textContent = "Please add " + [...new Set(miss)].map((k) => names[k]).join(", ") + "."; return;
    }
    const buyer = { name: v("name"), phone: v("phone"), email: v("email"), city: v("city"), address: delivery === "Delivery" ? v("address") : "", delivery };
    store.set("bb-buyer", buyer);
    const items = cart.items(), t = totals(items), code = codeNow();
    const btn = $("place"); btn.disabled = true; btn.textContent = "Placing your order...";
    err.textContent = "";
    let ref = "", saved = false;
    if (hasDB) {
      try {
        const d = await rpc("shop_order", { p_name: buyer.name, p_phone: buyer.phone, p_email: buyer.email || null, p_city: buyer.city, p_delivery: delivery,
          p_address: buyer.address || null, p_note: v("note") || null, p_code: code || null,
          p_items: items.map((i) => i.uuid || isUUID(i.id) ? { product_id: i.uuid || i.id, size: i.size || null, qty: i.qty }
            : { item: i.id, name: i.name, color: i.color || null, size: i.size || null, qty: i.qty, price: i.price, currency: i.currency }) });
        if (d && d.ref) { ref = d.ref; saved = true; }
      } catch (x) {}
    }
    if (!ref) ref = newRef();
    const lines = items.map((i) => `${i.name}${i.color ? " (" + i.color + ")" : ""}${i.size ? ", size " + i.size : ""} x ${i.qty}${i.price != null ? " = " + money(i.price * i.qty, i.currency) : ""}`);
    const fd = new FormData();
    fd.append("_subject", `New Birdboost order ${ref}: ${buyer.name} (${buyer.city})`);
    fd.append("form", "Shop order"); fd.append("order_ref", ref);
    fd.append("name", buyer.name); fd.append("phone", buyer.phone);
    if (buyer.email) { fd.append("email", buyer.email); fd.append("_replyto", buyer.email); }
    fd.append("delivery", delivery); fd.append("city", buyer.city);
    if (buyer.address) fd.append("address", buyer.address);
    fd.append("items", lines.join("\n"));
    fd.append("total", t.priced ? money(t.total, t.cur) + (t.pct ? ` (${t.pct}% off with code)` : "") : "To confirm");
    if (code) fd.append("ambassador_code", code);
    if (v("note")) fd.append("note", v("note"));
    fd.append("saved_in_admin", saved ? "yes" : "no, only in this email");
    let mailed = false;
    try { const r = await fetch(FORMSPREE, { method: "POST", body: fd, headers: { Accept: "application/json" }, signal: timeout(15000) }); mailed = r.ok; } catch (x) {}
    if (!saved && !mailed) {
      btn.disabled = false; btn.textContent = "Try again";
      err.textContent = "We couldn't send your order. Check your connection and tap Try again. Your details are kept.";
      return;
    }
    cart.save([]);
    view = "done";
    $("cbody").innerHTML = `<div class="ok" role="status"><div class="tick" aria-hidden="true">✓</div><h3>Order placed</h3>
      <div class="ref">${esc(ref)}</div>
      <p>Thank you, ${esc(buyer.name.split(" ")[0])}. Birdboost will contact you on <b>${esc(buyer.phone)}</b> to confirm your order and arrange ${delivery === "Collection" ? "collection" : "delivery"} and payment.</p>
      <p class="mute" style="font-size:14px">${esc(t.n + (t.n === 1 ? " piece" : " pieces"))}${t.priced ? " · " + esc(money(t.total, t.cur)) : ""}. Nothing has been paid on the website. Keep your reference in case you need it.</p>
      <p class="mute" style="font-size:14px">When it arrives, post a photo with <b>#SeenInTheFlock</b>. We share the people who wear it.</p></div>`;
    $("cfoot").innerHTML = `<button class="btn w" type="button" data-close>Done</button>`;
  }
  function openCart() { drawerInit(); if (view === "done") view = "cart"; paint(); if (!cd.open) cd.showModal(); }
  function add(p, size, qty) {
    const items = cart.items(), key = p.id + "|" + size, have = items.find((i) => i.key === key);
    if (have) have.qty = Math.min(10, have.qty + qty);
    else items.push({ key, id: p.id, uuid: p.uuid || null, name: p.style, color: p.color, size, qty, price: p.price, currency: p.currency, image: img(p.image) });
    cart.save(items);
  }

  // The nav's bag icon opens the drawer on any shop page.
  document.querySelectorAll('a[href$="#cart"]').forEach((a) => a.addEventListener("click", (e) => {
    const u = new URL(a.href, location.href); if (u.pathname !== location.pathname) return;
    e.preventDefault(); document.body.classList.remove("menu-open"); openCart();
  }));
  if (location.hash === "#cart") addEventListener("load", openCart);
  if (codeNow() && hasDB) applyCode(codeNow());

  window.BBShop = { load, rpc, hasDB, money, img, pieceUrl, siblings, dot, openCart, add, sizeSheet, recommend, openZoom, isUUID };
})();
