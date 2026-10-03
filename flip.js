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
  const mq = (q) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false; // navigateur sans matchMedia : comportement par défaut
    }
  };
  const reduced = mq("(prefers-reduced-motion: reduce)");
  const coarse = mq("(pointer: coarse)");
  // Réglages : carte RIGIDE, comme le viewer de la vraie carte. Approche exponentielle sans dépassement,
  // arrêt sec, puis un seul micro-rebond très raide (« paff »). Aucune échelle, aucun squash, aucun pop Z.
  const TAU_S = 0.1; // constante de temps de la décélération exponentielle (~100 ms)
  const FLOOR_DEG_S = 60; // vitesse plancher : la carte arrive en ~400 à 450 ms au total
  const IMPACT_OVERSHOOT_DEG = 3; // dépassement à l'arrivée (2 à 4)
  const STIFFNESS = 4900; // raideur du micro-ressort (pulsation 70 rad/s, période ~90 ms)
  const DAMPING = 49; // amortissement (ratio ~0,35) : un seul retour d'environ 1 degré
  const SNAP_S = 0.1; // calage net sur la cible après l'impact
  const IMPACT_S = 0.12; // durée de l'impulsion d'ombre
  const OMEGA = Math.sqrt(STIFFNESS);
  const ZETA = DAMPING / (2 * OMEGA);
  const OMEGA_D = OMEGA * Math.sqrt(1 - ZETA * ZETA);
  const T_PEAK = Math.atan2(OMEGA_D, ZETA * OMEGA) / OMEGA_D;
  // vitesse d'impact (deg/s) qui donne exactement IMPACT_OVERSHOOT_DEG au premier sommet
  const V_IMPACT = IMPACT_OVERSHOOT_DEG / ((Math.exp(-ZETA * OMEGA * T_PEAK) * Math.sin(OMEGA_D * T_PEAK)) / OMEGA_D);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let gyro = null; // { x, y } en degrés, partagé
  let gyroAsked = false;
  let running = false;
  let last = 0;

  const items = cards.map((root) => {
    const btn = root.querySelector(".flip-btn");
    const body = root.querySelector(".flip-body");
    const hint = root.querySelector(".flip-hint");
    const st = { root, btn, body, hint, angle: 0, target: 0, vel: 0, dragging: false, phase: "idle", springT: 0, impact: 0, idleK: 0, moved: 0, lastX: 0, lastT: 0, dv: 0, tx: 0, ty: 0, gx: 0, gy: 0, visible: false, t0: Math.random() * 6 };
    btn.disabled = false; // désactivé dans le HTML tant que ce script n'a pas tourné (sans JavaScript, la carte reste une image nommée)
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
    const calm = !reduced && !st.dragging && st.phase === "idle";
    st.idleK = calm ? Math.min(1, st.idleK + 0.02) : 0;
    const idle = Math.sin(time / 1700 + st.t0) * st.idleK;
    const gxd = gyro ? gyro.x : st.tx;
    const gyd = gyro ? gyro.y : st.ty;
    st.gx += (gxd - st.gx) * 0.12;
    st.gy += (gyd - st.gy) * 0.12;
    const rx = reduced ? 0 : -st.gy * 7 + idle * 1.2;
    const ry = a + (reduced ? 0 : st.gx * 9 + idle * 1.6);
    st.body.style.transform = `translate3d(0, ${(idle * 1.8).toFixed(2)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    st.root.style.setProperty("--impact", (st.impact || 0).toFixed(3));
    const s = Math.sin(rad);
    st.root.style.setProperty("--sx", `${(50 + 70 * s + st.gx * 14).toFixed(1)}%`);
    st.root.style.setProperty("--so", (0.22 + 0.5 * Math.abs(s)).toFixed(2));
    st.root.style.setProperty("--mid", Math.abs(s).toFixed(3)); // relief et ombrage maximaux à mi-tour, nuls aux faces
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
          // décélération exponentielle (vitesse proportionnelle à l'écart restant), plancher de vitesse, calage net
          const rem = st.target - st.angle;
          const dir = Math.sign(rem) || 1;
          const stepExp = rem * (1 - Math.exp(-dt / TAU_S));
          const stepMin = dir * FLOOR_DEG_S * dt;
          const move = Math.abs(stepExp) > Math.abs(stepMin) ? stepExp : stepMin;
          if (Math.abs(move) >= Math.abs(rem)) {
            st.angle = st.target;
            st.phase = "impact";
            st.springT = 0;
            st.dir = dir; // le choc : un seul micro-rebond raide
            st.impact = 1;
          } else st.angle += move;
        } else if (st.phase === "impact") {
          // solution analytique du micro-ressort (stable à 60 Hz malgré la raideur)
          st.springT += dt;
          const x = (st.dir * V_IMPACT / OMEGA_D) * Math.exp(-ZETA * OMEGA * st.springT) * Math.sin(OMEGA_D * st.springT);
          st.angle = st.target + x;
          st.impact = Math.max(0, 1 - st.springT / IMPACT_S);
          if (st.springT >= SNAP_S) {
            st.angle = st.target; // arrêt net
            st.vel = 0;
            st.phase = "idle";
            st.impact = 0;
          }
        }
      }
      render(st, now);
    });
    running = live && !reduced;
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
      st.impact = 0;
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
    const end = () => {
      if (!st.dragging) return;
      st.dragging = false;
      if (st.moved > 6) {
        // lâché : même vol rigide vers la face la plus proche
        st.target = Math.round((st.angle + st.dv * 0.18) / 180) * 180;
        st.phase = "fly";
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
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) => {
          st.visible = es[0].isIntersecting;
          if (st.visible) wake();
        },
        { rootMargin: "80px" },
      ).observe(root);
    } else {
      st.visible = true; // sans IntersectionObserver : la carte reste simplement toujours à jour
    }
    render(st, 0);
  });
})();
