/* Carte qui tourne : composant maison, CSS 3D + ressort, sans dépendance.
 * Clic, toucher, clavier (Entrée, Espace), glisser avec inertie et retombée sur la face la plus proche,
 * inclinaison à la souris ou au gyroscope, reflet et ombre qui suivent l'angle, léger flottement au repos.
 * Mouvement réduit : pas de rotation continue, la carte change de face instantanément. */
(() => {
  "use strict";
  const cards = [...document.querySelectorAll("[data-flip]")];
  if (!cards.length) return;
  const T = {
    fr: { touch: "Touchez pour tourner", mouse: "Cliquez ou glissez pour tourner", back: "Appuyer pour voir le verso.", front: "Appuyer pour voir le recto." },
    en: { touch: "Tap to flip", mouse: "Click or drag to flip", back: "Press to see the back.", front: "Press to see the front." },
  }[(document.documentElement.lang || "fr").slice(0, 2)] || {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  // Réglages du rebond (ressort physique, sans bibliothèque).
  const BOUNCE_OVERSHOOT_DEG = 13; // dépassement net de 180 degrés (10 à 14)
  const STIFFNESS = 340; // raideur k : pulsation ~18,4 rad/s, oscillation de ~340 ms
  const DAMPING = 8.2; // amortissement c : ratio ~0,22, deux à trois oscillations visibles, repos en ~1 s
  const FLIGHT_S = 0.4; // envol avant le rebond
  const POP_SCALE = 0.06; // « pop » en profondeur au milieu du tour
  const POP_Z = 60; // px
  const SQUASH = 0.03; // tressaillement à l'arrivée
  const K = STIFFNESS;
  const C = DAMPING;
  const OMEGA = Math.sqrt(K);
  const ZETA = C / (2 * OMEGA);
  const OMEGA_D = OMEGA * Math.sqrt(1 - ZETA * ZETA);
  const T_PEAK = Math.atan2(OMEGA_D, ZETA * OMEGA) / OMEGA_D;
  // vitesse d'arrivée (deg/s) qui donne exactement BOUNCE_OVERSHOOT_DEG au premier sommet
  const V_ARRIVE = BOUNCE_OVERSHOOT_DEG / ((Math.exp(-ZETA * OMEGA * T_PEAK) * Math.sin(OMEGA_D * T_PEAK)) / OMEGA_D);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let gyro = null; // { x, y } en degrés, partagé
  let gyroAsked = false;
  let running = false;
  let last = 0;

  const items = cards.map((root) => {
    const btn = root.querySelector(".flip-btn");
    const body = root.querySelector(".flip-body");
    const hint = root.querySelector(".flip-hint");
    const st = { root, btn, body, hint, angle: 0, target: 0, vel: 0, dragging: false, phase: "idle", ft: 0, a0: 0, dist: 180, springT: 0, moved: 0, lastX: 0, lastT: 0, dv: 0, tx: 0, ty: 0, gx: 0, gy: 0, visible: false, t0: Math.random() * 6 };
    if (hint) hint.textContent = coarse ? T.touch : T.mouse;
    return st;
  });

  window.__ifmFlip = items; // inspection locale seulement (captures de preuve)

  const face = (st) => (Math.round(st.target / 180) % 2 === 0 ? "front" : "back");
  function label(st) {
    const f = face(st);
    st.btn.setAttribute("aria-pressed", String(f === "back"));
    st.btn.setAttribute("aria-label", `${st.btn.dataset[f === "front" ? "altFront" : "altBack"]} ${f === "front" ? T.back : T.front}`);
  }

  function render(st, time) {
    const a = st.angle;
    const rad = (a * Math.PI) / 180;
    const idle = reduced || st.dragging ? 0 : Math.sin(time / 1700 + st.t0);
    const gxd = gyro ? gyro.x : st.tx;
    const gyd = gyro ? gyro.y : st.ty;
    st.gx += (gxd - st.gx) * 0.12;
    st.gy += (gyd - st.gy) * 0.12;
    const rx = reduced ? 0 : -st.gy * 7 + idle * 1.2;
    const ry = a + (reduced ? 0 : st.gx * 9 + idle * 1.6);
    let pop = 0;
    let sqx = 1;
    let sqy = 1;
    if (!reduced) {
      if (st.phase === "fly") pop = Math.sin(Math.PI * Math.min(1, st.ft / FLIGHT_S));
      else if (st.phase === "spring") {
        const q = SQUASH * Math.exp(-st.springT * 8) * Math.cos(st.springT * 22);
        sqx = 1 + q * 0.6;
        sqy = 1 - q;
      }
    }
    st.pop = pop;
    st.body.style.transform = `translate3d(0, ${(idle * 4).toFixed(2)}px, ${(pop * POP_Z).toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(${(sqx * (1 + pop * POP_SCALE)).toFixed(4)}, ${(sqy * (1 + pop * POP_SCALE)).toFixed(4)}, 1)`;
    st.root.style.setProperty("--lift", pop.toFixed(3));
    const s = Math.sin(rad);
    st.root.style.setProperty("--sx", `${(50 + 70 * s + st.gx * 14).toFixed(1)}%`);
    st.root.style.setProperty("--so", (0.22 + 0.5 * Math.abs(s)).toFixed(2));
    st.root.style.setProperty("--sh", (0.45 + 0.55 * Math.abs(Math.cos(rad))).toFixed(3));
    st.root.style.setProperty("--shx", `${(st.gx * -14 + s * 18).toFixed(1)}px`);
  }

  function step(now) {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    let live = false;
    items.forEach((st) => {
      if (!st.visible) return;
      live = true;
      if (!st.dragging && !reduced) {
        if (st.phase === "fly") {
          // envol : Hermite de la position de départ à la cible, vitesse d'arrivée V_ARRIVE (le ressort prend le relais)
          st.ft += dt;
          const u = Math.min(1, st.ft / FLIGHT_S);
          const u2 = u * u;
          const u3 = u2 * u;
          const h01 = -2 * u3 + 3 * u2;
          const h11 = u3 - u2;
          const m1 = V_ARRIVE * FLIGHT_S;
          st.angle = st.a0 + (st.target - st.a0) * h01 + h11 * m1;
          if (u >= 1) {
            st.phase = "spring";
            st.springT = 0;
            st.angle = st.target;
            st.vel = V_ARRIVE;
          }
        } else {
          const acc = -K * (st.angle - st.target) - C * st.vel;
          st.vel += acc * dt;
          st.angle += st.vel * dt;
          if (st.phase === "spring") {
            st.springT += dt;
            if (st.springT > 1.6) st.phase = "idle";
          }
        }
      }
      render(st, now);
    });
    running = live && (!reduced || items.some((s) => s.visible && Math.abs(s.angle - s.target) > 0.1));
    if (running) requestAnimationFrame(step);
  }
  function wake() {
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(step);
    }
  }

  function flip(st) {
    st.target = Math.round(st.target / 180) * 180 + 180;
    if (reduced) st.angle = st.target;
    else {
      st.phase = "fly";
      st.ft = 0;
      st.a0 = st.angle;
      st.vel = 0;
    }
    label(st);
    quiet(st);
    wake();
    if (reduced) {
      render(st, 0);
    }
  }
  function quiet(st) {
    if (st.hint) st.hint.classList.add("is-quiet");
  }

  async function askGyro() {
    if (gyroAsked || reduced || !coarse || typeof DeviceOrientationEvent === "undefined") return;
    gyroAsked = true;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission(); // iOS : seulement dans un geste de l'utilisateur
        if (r !== "granted") return;
      }
      let base = null;
      window.addEventListener("deviceorientation", (e) => {
        if (e.gamma == null || e.beta == null) return;
        if (!base) base = { g: e.gamma, b: e.beta };
        gyro = { x: clamp((e.gamma - base.g) / 25, -1, 1), y: clamp((e.beta - base.b) / 25, -1, 1) };
        wake();
      });
    } catch {
      /* repli doux : aucune inclinaison */
    }
  }

  items.forEach((st) => {
    label(st);
    const { btn, root } = st;
    btn.addEventListener("click", (e) => {
      if (st.moved > 6) {
        st.moved = 0;
        e.preventDefault();
        return; // c'était un glissé, pas un clic
      }
      flip(st);
    });
    btn.addEventListener("pointerdown", (e) => {
      askGyro();
      if (reduced || e.pointerType === "mouse" && e.button !== 0) return;
      st.dragging = true;
      st.phase = "idle";
      st.moved = 0;
      st.lastX = e.clientX;
      st.lastT = performance.now();
      st.dv = 0;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener("pointermove", (e) => {
      if (st.dragging) {
        const now = performance.now();
        const dx = e.clientX - st.lastX;
        st.moved += Math.abs(dx);
        if (st.moved > 6) {
          st.angle += dx * 0.55;
          st.vel = 0;
          st.dv = (dx * 0.55) / Math.max(8, now - st.lastT) * 1000;
        }
        st.lastX = e.clientX;
        st.lastT = now;
        quiet(st);
        wake();
      } else if (e.pointerType === "mouse") {
        const r = root.getBoundingClientRect();
        st.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
        st.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
        wake();
      }
    });
    const end = (e) => {
      if (!st.dragging) return;
      st.dragging = false;
      if (st.moved > 6) {
        // retombée sur le recto ou le verso le plus proche, avec l'élan du geste
        st.phase = "idle";
        st.vel = st.dv;
        st.target = Math.round((st.angle + st.dv * 0.18) / 180) * 180;
        label(st);
      }
      wake();
    };
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    root.addEventListener("pointerleave", () => {
      st.tx = 0;
      st.ty = 0;
    });
    new IntersectionObserver(
      (es) => {
        st.visible = es[0].isIntersecting;
        if (st.visible) wake();
      },
      { rootMargin: "80px" },
    ).observe(root);
    render(st, 0);
  });
})();
