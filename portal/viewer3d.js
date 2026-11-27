// Birdboost 3D merch viewer.
// - If a product has a .glb 3D model, it uses Google's <model-viewer> (spin, zoom, AR on phones).
// - Otherwise it builds a 3D turntable from the front and back photos: drag to spin it round.
(function () {
  const MV_SRC = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js";
  let mvLoading = null;
  function loadModelViewer() {
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (!mvLoading) {
      mvLoading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.type = "module"; s.src = MV_SRC; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    return mvLoading;
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function mount(el, p, opts = {}) {
    el.classList.add("stage3d");
    el.innerHTML = "";
    if (p.model_url) {
      loadModelViewer().catch(() => {});
      const mv = document.createElement("model-viewer");
      mv.setAttribute("src", p.model_url);
      if (p.front_image) mv.setAttribute("poster", p.front_image);
      mv.setAttribute("alt", "3D model of " + (p.name || "Birdboost piece"));
      mv.setAttribute("camera-controls", "");
      if (!reduce) mv.setAttribute("auto-rotate", "");
      mv.setAttribute("shadow-intensity", "1");
      mv.setAttribute("ar", "");
      if (!opts.big) mv.setAttribute("disable-zoom", "");
      el.appendChild(mv);
      return;
    }
    const blank = (txt) => `<div class="face blank"><span class="logo"></span>${esc(txt)}</div>`;
    const front = p.front_image ? `<div class="face"><img src="${esc(p.front_image)}" alt="${esc(p.name)} front" loading="lazy"></div>` : blank("Photo coming soon");
    const back = p.back_image ? `<div class="face back"><img src="${esc(p.back_image)}" alt="${esc(p.name)} back" loading="lazy"></div>`
                              : `<div class="face back blank"><span class="logo"></span>${p.front_image ? "Back view coming soon" : "Birdboost"}</div>`;
    el.innerHTML = `<div class="floor"></div><div class="spinner">${front}${back}</div><div class="hint3d">Drag to spin</div>`;
    el.tabIndex = 0;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${p.name || "Birdboost piece"} in 3D. Drag, or use the arrow keys, to spin it.`);
    const spinner = el.querySelector(".spinner");
    let angle = opts.start ?? -18, vel = 0, dragging = false, lastX = 0, lastT = 0, idleUntil = 0, visible = true;
    const autoSpeed = reduce ? 0 : 22; // degrees per second
    const draw = () => { spinner.style.transform = `rotateX(-4deg) rotateY(${angle}deg)`; };
    el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastT = performance.now(); vel = 0; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const now = performance.now(), dx = e.clientX - lastX;
      angle += dx * 0.6; vel = (dx * 0.6) / Math.max(1, now - lastT) * 1000;
      lastX = e.clientX; lastT = now; draw();
    });
    const end = () => { if (dragging) { dragging = false; idleUntil = performance.now() + 2500; } };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { angle -= 20; idleUntil = performance.now() + 4000; draw(); e.preventDefault(); }
      if (e.key === "ArrowRight") { angle += 20; idleUntil = performance.now() + 4000; draw(); e.preventDefault(); }
    });
    if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(el);
    let prev = performance.now();
    const tick = (t) => {
      if (!el.isConnected) return;
      const dt = Math.min(0.05, (t - prev) / 1000); prev = t;
      if (visible && !dragging) {
        if (Math.abs(vel) > 5) { angle += vel * dt; vel *= Math.pow(0.04, dt); }
        else if (t > idleUntil) angle += autoSpeed * dt;
        draw();
      }
      requestAnimationFrame(tick);
    };
    draw();
    requestAnimationFrame(tick);
  }
  window.BB3D = { mount };
})();
