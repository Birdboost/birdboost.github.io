/* Birdboost community: Seen in the Flock, the people, and events.
   Everything here comes from real, approved posts in the database. Nothing is made up:
   when there's nothing yet, each section shows an invitation instead.
   Needs: assets/site.js and assets/shop.js loaded first. */
(() => {
  "use strict";
  const { esc, root, watchProgress, RM } = window.BB;
  const S = window.BBShop;
  const tag = "#SeenInTheFlock";
  const date = (d, o) => d ? new Date(d).toLocaleDateString("en-GB", o || { day: "numeric", month: "short", year: "numeric" }) : "";
  const safe = (u) => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "";
  const cache = {};
  const get = (fn, body) => {
    const k = fn + JSON.stringify(body || {});
    if (!S.hasDB) return Promise.resolve([]);
    return cache[k] || (cache[k] = S.rpc(fn, body).then((d) => Array.isArray(d) ? d : []).catch(() => []));
  };
  let products = [];
  S.load().then((p) => { products = p; });
  const pieceOf = (ref) => ref && products.find((p) => p.id.toLowerCase() === String(ref).toLowerCase() || (p.style + " " + p.color).toLowerCase() === String(ref).toLowerCase());

  /* ---------- the lightbox ---------- */
  let lb = null;
  function open(post) {
    if (!lb) {
      lb = document.createElement("dialog"); lb.className = "lightbox"; lb.setAttribute("aria-label", "Community photo");
      document.body.appendChild(lb);
      lb.addEventListener("click", (e) => { if (e.target === lb || e.target.closest("[data-close]")) lb.close(); });
    }
    const piece = pieceOf(post.product_ref);
    const media = post.kind === "video" ? `<video src="${esc(safe(post.media_url))}" controls playsinline autoplay muted loop></video>` : `<img src="${esc(safe(post.media_url))}" alt="${esc(post.caption || "A photo from the Birdboost community")}">`;
    lb.innerHTML = `<div class="lb-in"><div class="lb-media">${media}</div><div class="lb-info">
      <button class="x" type="button" data-close aria-label="Close">×</button>
      <span class="eyebrow-s">${post.ambassador ? "Ambassador" : "Seen in the Flock"}</span>
      <h3>${esc(post.by || "Someone in the Flock")}</h3>
      ${post.handle ? `<p class="mute" style="margin:0">${esc(post.handle)}</p>` : ""}
      ${post.caption ? `<p class="cap">“${esc(post.caption)}”</p>` : ""}
      <dl>${post.place ? `<div><dt>Where</dt><dd>${esc(post.place)}</dd></div>` : ""}${post.event ? `<div><dt>Event</dt><dd>${post.event_id ? `<a href="${root}events/?e=${esc(post.event_id)}">${esc(post.event)}</a>` : esc(post.event)}</dd></div>` : ""}
        ${piece ? `<div><dt>Wearing</dt><dd><a href="${esc(S.pieceUrl(piece))}">${esc(piece.style)}${piece.color ? " · " + esc(piece.color) : ""}</a></dd></div>` : post.product_ref ? `<div><dt>Wearing</dt><dd>${esc(post.product_ref)}</dd></div>` : ""}
        <div><dt>Posted</dt><dd>${esc(date(post.created_at))}</dd></div></dl>
      ${safe(post.link) ? `<a class="btn o" href="${esc(safe(post.link))}" target="_blank" rel="noopener">See the post ↗</a>` : ""}
    </div></div>`;
    lb.showModal();
  }

  /* ---------- Seen in the Flock: a strip that travels as you scroll ---------- */
  function tile(p, i) {
    const src = safe(p.media_url);
    const media = p.kind === "video" ? `<video src="${esc(src)}" muted playsinline loop preload="metadata"></video>` : `<img src="${esc(src)}" alt="" loading="lazy">`;
    return `<button class="sf-tile${i % 5 === 1 ? " tall" : i % 5 === 3 ? " wide" : ""}" type="button" data-post="${i}">${media}
      <span class="sf-cap"><b>${esc(p.by || "In the Flock")}</b>${p.place || p.event ? `<span>${esc(p.event || p.place)}</span>` : ""}</span></button>`;
  }
  function empty(n, msg) {
    return Array.from({ length: n }, (_, i) => `<div class="sf-tile empty${i % 5 === 1 ? " tall" : i % 5 === 3 ? " wide" : ""}" aria-hidden="true"><span>${i % 2 ? esc(tag) : msg}</span></div>`).join("");
  }
  async function strip(el, opts = {}) {
    const posts = await get("community_feed", { p_limit: opts.limit || 40, p_product: opts.product || null, p_event: opts.event || null });
    const rows = el.querySelectorAll(".sf-row");
    if (!posts.length) {
      el.classList.add("is-empty");
      if (opts.hideEmpty) { el.hidden = true; return posts; }
      rows.forEach((r, k) => { r.innerHTML = empty(8, k ? "Your fit here" : "Your photo here"); });
    } else {
      // split across the rows; repeat a short list so the strip always reaches across the screen
      const per = Math.ceil(posts.length / rows.length);
      rows.forEach((r, k) => {
        let mine = posts.slice(k * per, (k + 1) * per); if (!mine.length) mine = posts;
        let html = mine.map((p) => tile(p, posts.indexOf(p))).join("");
        while (mine.length && html.split("sf-tile").length - 1 < 8) html += mine.map((p) => tile(p, posts.indexOf(p))).join("");
        r.innerHTML = html;
      });
      el.addEventListener("click", (e) => { const t = e.target.closest("[data-post]"); if (t) open(posts[+t.dataset.post]); });
      // videos play only while on screen
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; if (e.isIntersecting && !RM) v.play().catch(() => {}); else v.pause(); }));
        el.querySelectorAll("video").forEach((v) => io.observe(v));
      }
    }
    // rows drift in opposite directions as the page scrolls
    if (!RM) {
      el._onProgress = (p) => rows.forEach((r, k) => {
        const max = Math.max(0, r.scrollWidth - el.clientWidth);
        const x = k % 2 ? -max * (1 - p) : -max * p;
        r.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      });
      watchProgress(el);
    } else el.classList.add("static");
    return posts;
  }

  /* ---------- the people: ambassadors who chose to show their profile ---------- */
  function monogram(n) { return esc(String(n || "?").trim().charAt(0).toUpperCase()); }
  async function people(el, opts = {}) {
    const list = await get("public_ambassadors");
    if (!list.length) { el.classList.add("is-empty"); if (opts.onEmpty) opts.onEmpty(); return list; }
    el.innerHTML = list.map((a, i) => `<button class="person" type="button" data-person="${i}">
      <span class="pp">${safe(a.photo) ? `<img src="${esc(safe(a.photo))}" alt="" loading="lazy">` : `<i>${monogram(a.name)}</i>`}</span>
      <span class="pn">${esc(a.name)}</span><span class="pc">${esc([a.city, a.style].filter(Boolean).join(" · "))}</span></button>`).join("");
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-person]"); if (b) profile(list[+b.dataset.person]); });
    return list;
  }
  async function profile(a) {
    if (!lb) open({ media_url: "" }), lb.close();
    const fits = (a.fits || []).map(pieceOf).filter(Boolean);
    const posts = (await get("community_feed", { p_limit: 60 })).filter((p) => p.ambassador_id === a.id);
    lb.innerHTML = `<div class="lb-in profile"><div class="lb-media pf-cover">${safe(a.photo) ? `<img src="${esc(safe(a.photo))}" alt="${esc(a.name)}">` : `<i class="pf-mono">${monogram(a.name)}</i>`}</div>
      <div class="lb-info"><button class="x" type="button" data-close aria-label="Close">×</button>
      <span class="eyebrow-s">Birdboost ambassador${a.since ? " · since " + esc(date(a.since, { month: "short", year: "numeric" })) : ""}</span>
      <h3>${esc(a.name)}</h3><p class="mute" style="margin:0">${esc([a.city, a.style].filter(Boolean).join(" · "))}</p>
      ${a.bio ? `<p class="cap">${esc(a.bio)}</p>` : ""}
      <div class="pf-links">${a.instagram ? `<a href="https://instagram.com/${esc(String(a.instagram).replace(/^@/, ""))}" target="_blank" rel="noopener">Instagram ↗</a>` : ""}${a.tiktok ? `<a href="https://www.tiktok.com/@${esc(String(a.tiktok).replace(/^@/, ""))}" target="_blank" rel="noopener">TikTok ↗</a>` : ""}</div>
      ${fits.length ? `<div class="lbl" style="margin-top:20px">My Birdboost fits</div><div class="pf-fits">${fits.map((p) => `<a href="${esc(S.pieceUrl(p))}"><img src="${esc(S.img(p.image))}" alt=""><span>${esc(p.style)}${p.color ? " · " + esc(p.color) : ""}</span></a>`).join("")}</div>` : ""}
      ${posts.length ? `<div class="lbl" style="margin-top:20px">Seen in the Flock</div><div class="pf-posts">${posts.slice(0, 9).map((p) => `<img src="${esc(safe(p.media_url))}" alt="" loading="lazy">`).join("")}</div>` : ""}
      <p class="mute" style="font-size:13px;margin-top:18px">${a.events ? a.events + (a.events === 1 ? " event" : " events") + " with Birdboost · " : ""}${a.posts} ${a.posts === 1 ? "post" : "posts"}</p>
      </div></div>`;
    if (!lb.open) lb.showModal();
  }

  /* ---------- events ---------- */
  const events = () => get("public_events");

  window.BBCommunity = { strip, people, events, open, profile, date, safe, tag, pieceOf: (r) => pieceOf(r) };
})();
