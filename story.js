/* Page de vente iFiveMe v2 : mouvements pilotés par le défilement.
   Une seule boucle requestAnimationFrame, déclenchée par le défilement; transform et opacity seulement.
   Sans la classe html.motion (mouvement réduit ou navigateur ancien), rien n'est animé et la
   version statique complète reste affichée. La barre d'action mobile fonctionne dans les deux cas. */
(() => {
  "use strict";

  const root = document.documentElement;
  const motion = root.classList.contains("motion");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const mix = (A, B, t) => {
    const o = {};
    for (const k in A) o[k] = lerp(A[k], B[k] ?? A[k], t);
    return o;
  };
  const setInert = (el, off) => {
    if (!el) return;
    if (off) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  };

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let headerH = 64;

  /* ---------- Récit 3D ---------- */
  const story = $("[data-story]");
  const S = story && {
    stage: $("[data-stage]", story),
    copy: $("[data-hero-copy]", story),
    p1: $("[data-phone]", story),
    p2: $("[data-phone2]", story),
    back: $('[data-layer="back"]', story),
    board: $('[data-layer="board"]', story),
    screen: $('[data-layer="screen"]', story),
    glass: $('[data-layer="glass"]', story),
    rings: $$("[data-ring]", story),
    rings2: $$("[data-ring2]", story),
    empty: $("[data-empty]", story),
    hl: $("[data-hl]", story),
    paper: $("[data-paper]", story),
    bubble: $("[data-bubble]", story),
    open: $("[data-open]", story),
    added: $("[data-added]", story),
    ground: $("[data-ground]", story),
    ground2: $("[data-ground2]", story),
    acts: $$("[data-act]", story),
    end: $("[data-story-end]", story),
    L: null,
  };
  const ACTS = [
    [0.1, 0.3],
    [0.3, 0.52],
    [0.52, 0.66],
    [0.66, 0.84],
    [0.84, 0.95],
  ];

  function layoutStory() {
    const W = S.stage.clientWidth;
    const H = S.stage.clientHeight;
    const desk = W >= 960;
    const ph = desk ? Math.min(H * 0.74, 640) : Math.min(H * 0.6, 520);
    const pw = ph / 2.1636;
    const T = pw * 0.05;
    [S.p1, S.p2].forEach((p) => p.style.setProperty("--pw", `${pw}px`));
    const copyBottom = S.copy.offsetTop + S.copy.offsetHeight;
    const heroS = desk ? 0.86 : 0.56;
    S.L = {
      W, H, desk, pw, ph, T,
      hero: desk
        ? { x: W * 0.75, y: H * 0.52, s: heroS, rx: 0, ry: 0, rz: 0 }
        : { x: W * 0.5, y: Math.max(copyBottom + (ph * heroS) / 2 + 16, H * 0.62), s: heroS, rx: 0, ry: 0, rz: 0 },
      center: desk ? { x: W * 0.66, y: H * 0.5, s: 1, rx: 0, ry: 0, rz: 0 } : { x: W * 0.5, y: H * 0.42, s: 1, rx: 0, ry: 0, rz: 0 },
      sender: desk ? { x: W * 0.5, y: H * 0.52, s: 0.8, rx: 0, ry: 0, rz: 0 } : { x: W * 0.27, y: H * 0.4, s: 0.58, rx: 0, ry: 0, rz: 0 },
      recv: desk ? { x: W * 0.8, y: H * 0.52, s: 0.8, rx: 0, ry: 0, rz: 0 } : { x: W * 0.73, y: H * 0.43, s: 0.58, rx: 0, ry: 0, rz: 0 },
      recvIn: { x: W + pw, y: H * 0.56, s: desk ? 0.8 : 0.58, rx: 6, ry: -75, rz: 10 },
      screenH: ph - 2 * pw * 0.036,
      bubW: S.bubble.offsetWidth || 270,
    };
    // Tranche : anneaux répartis sur l'épaisseur; destinataire fixe.
    S.rings2.forEach((r, i) => (r.style.transform = `translateZ(${-T / 2 + (i * T) / (S.rings2.length - 1)}px)`));
    $('.l-back', S.p2).style.transform = `rotateY(180deg) translateZ(${T / 2}px)`;
    $('[data-layer2="screen"]', S.p2).style.transform = `translateZ(${T / 2 + 0.5}px)`;
    $(".l-glass", S.p2).style.transform = `translateZ(${T / 2 + 1}px)`;
  }

  const phoneTransform = (L, st) =>
    `translate3d(${st.x - L.pw / 2}px, ${st.y - L.ph / 2}px, 0) scale(${st.s}) rotateX(${st.rx}deg) rotateY(${st.ry}deg) rotateZ(${st.rz}deg)`;

  function groundAt(el, L, st, opacity) {
    const gs = (L.pw * st.s * 1.15) / 300;
    el.style.transform = `translate3d(${st.x - 150}px, ${st.y + (L.ph * st.s) / 2 - 18}px, 0) scale(${gs}, ${gs})`;
    el.style.opacity = opacity.toFixed(3);
  }

  function renderStory() {
    const L = S.L;
    const total = story.offsetHeight - S.stage.offsetHeight;
    const p = clamp((headerH - story.getBoundingClientRect().top) / total);

    // Héros : la copie s'efface dès les premiers pixels.
    const c = seg(p, 0, 0.06);
    S.copy.style.opacity = (1 - c).toFixed(3);
    S.copy.style.transform = `translate3d(0, ${-48 * easeOut(c)}px, 0)`;
    setInert($(".doors", S.copy), c > 0.9); // seuls les liens quittent l'ordre de tabulation; le titre reste lu

    // Téléphone d'Élise.
    let st = mix(L.hero, L.center, ease(seg(p, 0, 0.1)));
    const s1 = ease(seg(p, 0.1, 0.3));
    const wob = Math.sin(Math.PI * s1);
    st.ry += 360 * s1;
    st.rx -= 14 * wob;
    st.s *= 1 - 0.12 * wob;
    st.y -= L.H * 0.03 * wob;
    const s2 = ease(seg(p, 0.3, 0.37)) - ease(seg(p, 0.5, 0.58));
    st.ry -= 50 * s2;
    st.rx += 22 * s2;
    st.rz -= 4 * s2;
    st.s *= 1 - (L.desk ? 0.2 : 0.3) * s2;
    const z3 = ease(seg(p, 0.56, 0.62)) - ease(seg(p, 0.66, 0.72));
    st.s *= 1 + 0.05 * z3;
    const m4 = ease(seg(p, 0.66, 0.74));
    if (m4 > 0) st = mix(st, { ...L.sender, ry: st.ry }, m4);
    const x5 = ease(seg(p, 0.84, 0.92));
    st.x -= L.W * (L.desk ? 0.08 : 0.3) * x5;
    st.s *= 1 - 0.25 * x5;
    const o1 = 1 - seg(p, 0.84, 0.885);
    S.p1.style.transform = phoneTransform(L, st);
    S.p1.style.opacity = o1.toFixed(3);
    S.p1.style.visibility = o1 < 0.01 ? "hidden" : "visible";

    // Vue éclatée : les couches se séparent sur l'axe Z.
    const e = ease(seg(p, 0.36, 0.46)) - ease(seg(p, 0.5, 0.58));
    const T = L.T;
    const pw = L.pw;
    const screenZ = T / 2 + 0.5 + e * pw * 0.5;
    S.back.style.transform = `rotateY(180deg) translateZ(${T / 2 + e * pw * 1.05}px)`;
    const n = S.rings.length - 1;
    S.rings.forEach((r, i) => {
      const z0 = -T / 2 + (i * T) / n;
      r.style.transform = `translateZ(${lerp(z0, -pw * 0.8 + i * pw * 0.11, e)}px)`;
    });
    S.board.style.transform = `translateZ(${e * pw * 0.12}px)`;
    S.screen.style.transform = `translateZ(${screenZ}px)`;
    S.glass.style.transform = `translateZ(${T / 2 + 1 + e * pw * 1.0}px)`;
    S.glass.style.opacity = (1 - e).toFixed(3);

    // La carte papier arrive, flotte, puis plonge dans l'écran : la carte virtuelle apparaît.
    const pa = ease(seg(p, 0.37, 0.45));
    const pb = ease(seg(p, 0.45, 0.52));
    const po = seg(p, 0.37, 0.4) - seg(p, 0.5, 0.53);
    const landY = -(0.3 - 0.218) * L.ph;
    const py = lerp(lerp(-L.ph * 0.75, -L.ph * 0.1, pa), landY, pb);
    const pz = lerp(lerp(pw * 1.1, screenZ + pw * 0.28, pa), screenZ + 1, pb);
    S.paper.style.transform = `translate3d(0, ${py}px, ${pz}px) rotateX(${lerp(-70, 0, pa)}deg) rotateZ(${lerp(lerp(-20, -5, pa), 0, pb)}deg)`;
    S.paper.style.opacity = po.toFixed(3);
    S.empty.style.opacity = (seg(p, 0.18, 0.2) - seg(p, 0.49, 0.53)).toFixed(3);

    // Les cinq boutons s'allument l'un après l'autre.
    const hp = seg(p, 0.58, 0.66);
    S.hl.style.opacity = (seg(p, 0.575, 0.59) - seg(p, 0.655, 0.67)).toFixed(3);
    S.hl.style.transform = `translate3d(0, ${Math.min(4, Math.floor(hp * 5)) * L.screenH * 0.0521}px, 0)`;

    // Téléphone du destinataire.
    const r = ease(seg(p, 0.68, 0.76));
    const c5 = ease(seg(p, 0.84, 0.92));
    let st2 = mix(L.recvIn, L.recv, r);
    st2 = mix(st2, L.center, c5);
    S.p2.style.transform = phoneTransform(L, st2);
    S.p2.style.opacity = r.toFixed(3);
    S.p2.style.visibility = r < 0.01 ? "hidden" : "visible";

    // Le texto part : il sort du téléphone d'Élise et vole jusqu'au destinataire.
    const b0 = ease(seg(p, 0.68, 0.73));
    const f = ease(seg(p, 0.74, 0.82));
    const bo = b0 * (1 - seg(p, 0.86, 0.89));
    if (bo > 0.001) {
      const s0 = ((L.pw * st.s * 0.86) / L.bubW) * lerp(0.7, 1, b0);
      const sT = (L.pw * st2.s * 0.84) / L.bubW;
      const sc = lerp(s0, sT, f);
      const x0 = st.x - (L.bubW * s0) / 2;
      const y0 = st.y - L.ph * st.s * lerp(0.05, 0.16, b0);
      const xT = st2.x - (L.bubW * sT) / 2;
      const yT = st2.y - L.ph * st2.s * 0.2;
      const bx = lerp(x0, xT, f);
      const by = lerp(y0, yT, f) - L.H * 0.16 * Math.sin(Math.PI * f);
      S.bubble.style.transform = `translate3d(${bx}px, ${by}px, 0) rotate(${-7 * Math.sin(Math.PI * f)}deg) scale(${sc})`;
    }
    S.bubble.style.opacity = bo.toFixed(3);

    // La carte s'ouvre dans le navigateur, puis l'ajout aux contacts.
    const w = ease(seg(p, 0.87, 0.94));
    S.open.style.clipPath = `inset(${((1 - w) * 100).toFixed(2)}% 0 0 0)`;
    const a = easeOut(seg(p, 0.95, 0.985));
    S.added.style.opacity = a.toFixed(3);
    S.added.style.transform = `translate3d(0, ${(1 - a) * 40}%, 0)`;

    groundAt(S.ground, L, st, 0.9 * o1 * (1 - 0.6 * e));
    groundAt(S.ground2, L, st2, 0.9 * r);

    // Légendes des actes et portes finales.
    S.acts.forEach((li, i) => {
      const [a0, a1] = ACTS[i];
      const o = seg(p, a0, a0 + 0.025) - seg(p, a1 - 0.025, a1);
      li.style.opacity = o.toFixed(3);
      li.style.transform = `translate3d(0, ${(1 - o) * 14}px, 0)`;
    });
    const eo = easeOut(seg(p, 0.94, 0.98));
    S.end.style.opacity = eo.toFixed(3);
    S.end.style.transform = `translate3d(0, ${(1 - eo) * 20}px, 0)`;
    setInert(S.end, eo < 0.5);
  }

  /* ---------- Bande cinétique ---------- */
  const kin = $("[data-kinetic]");
  const kinRows = kin ? $$("[data-kin]", kin) : [];
  function renderKinetic() {
    const r = kin.getBoundingClientRect();
    const k = clamp((vh - r.top) / (vh + r.height));
    kinRows.forEach((row) => {
      const span = Math.max(0, row.scrollWidth - vw);
      const t = row.dataset.kin === "1" ? k : 1 - k;
      row.style.transform = `translate3d(${-span * t}px, 0, 0)`;
    });
  }

  /* ---------- Téléphones Impact : parallaxe à vitesses différentes ---------- */
  const impact = $("[data-impact]");
  const imps = impact ? $$("[data-imp]", impact) : [];
  const IMP_SPEED = [70, -50, 95, -30];
  function renderImpact() {
    const r = impact.getBoundingClientRect();
    const k = clamp((vh - r.top) / (vh + r.height)) - 0.5;
    imps.forEach((el, i) => {
      el.style.transform = `translate3d(0, ${k * -IMP_SPEED[i] * 2}px, 0)`;
    });
  }

  /* ---------- Situations : pan horizontal ---------- */
  const pan = $("[data-pan]");
  const P = pan && { stage: $("[data-pan-stage]", pan), track: $("[data-pan-track]", pan), cards: $$(".sit", pan), span: 0 };
  function layoutPan() {
    P.span = Math.max(0, P.track.scrollWidth - vw);
    pan.style.height = `${P.span + (vh - headerH) + vh * 0.35}px`;
  }
  function renderPan() {
    const total = pan.offsetHeight - P.stage.offsetHeight;
    const q = clamp((headerH - pan.getBoundingClientRect().top) / total);
    const x = -P.span * q;
    P.track.style.transform = `translate3d(${x}px, 0, 0)`;
    P.cards.forEach((c) => {
      const cx = c.offsetLeft + c.offsetWidth / 2 + x;
      const d = clamp((cx - vw / 2) / vw, -1, 1);
      c.style.transform = `translate3d(0, ${Math.abs(d) * 26}px, 0) rotate(${d * -5}deg)`;
    });
  }

  /* ---------- Éventail des métiers ---------- */
  const fan = $("[data-fan]");
  const F = fan && { items: $$("[data-fan-item]", fan), w: 0, spread: 0 };
  const fanOff = (i) => i - (F.items.length - 1) / 2;
  const FAN_Y = (i) => (i % 2 === 0 ? 40 : 0); // décalage vertical seulement : les téléphones restent droits (GARY-VIS-056)
  function layoutFan() {
    const W = fan.clientWidth;
    F.w = Math.min(210, Math.max(120, W * 0.3));
    F.items.forEach((it) => (it.style.width = `${F.w}px`));
    // Boîte d'un téléphone incliné de 15 degrés : environ 0,76 × sa largeur de chaque côté du centre.
    F.spread = Math.max(0, Math.min(F.w * 1.18, (W / 2 - 4 - F.w * 0.5) / Math.max(1, (F.items.length - 1) / 2)));
    fan.style.setProperty("--fan-h", `${F.w * 2.1636 + 90}px`);
  }
  function renderFan() {
    const r = fan.getBoundingClientRect();
    const t = ease(clamp((vh * 0.9 - r.top) / (vh * 0.55)));
    F.items.forEach((it, i) => {
      const x = -F.w / 2 + fanOff(i) * F.spread * t;
      it.style.transform = `translate3d(${x}px, ${FAN_Y(i) * t + (1 - t) * i * 6}px, 0)`;
    });
  }

  /* ---------- Éclat des cartes papier ---------- */
  const burst = $("[data-burst]");
  const B = burst && { stage: $("[data-burst-stage]", burst), cards: $$(".pc", burst), copy: $(".burst-copy", burst), v: [] };
  function layoutBurst() {
    const R = Math.max(vw, vh);
    B.v = B.cards.map((_, i) => {
      const ang = (i / B.cards.length) * Math.PI * 2 + (i % 3) * 0.37;
      const dist = R * (0.55 + ((i * 37) % 23) / 60);
      return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.8, r0: ((i * 53) % 21) - 10, rr: ((i * 97) % 240) - 120 };
    });
  }
  function renderBurst() {
    const total = burst.offsetHeight - B.stage.offsetHeight;
    const q = clamp((headerH - burst.getBoundingClientRect().top) / total);
    const e = ease(seg(q, 0.06, 0.6));
    B.cards.forEach((c, i) => {
      const v = B.v[i];
      c.style.transform = `translate3d(${v.dx * e}px, ${v.dy * e - i * 1.5 * (1 - e)}px, 0) rotate(${v.r0 + v.rr * e}deg) scale(${1 - 0.15 * e})`;
    });
    const o = easeOut(seg(q, 0.28, 0.58));
    B.copy.style.opacity = o.toFixed(3);
    B.copy.style.transform = `translate3d(0, ${(1 - o) * 24}px, 0) scale(${lerp(0.94, 1, o)})`;
    setInert(B.copy, o < 0.3);
  }

  /* ---------- Code QR : balayage puis ouverture ---------- */
  const qr = $("[data-qr]");
  const Q = qr && { box: $("[data-qr-box]", qr), line: $("[data-scan]", qr), corners: $$(".corner", qr), phone: $("[data-qr-phone]", qr) };
  const CORNER_DIR = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  function renderQr() {
    const r = Q.box.getBoundingClientRect();
    const q = clamp((vh - r.top) / (vh + r.height));
    const c = ease(seg(q, 0.15, 0.45));
    Q.corners.forEach((el, i) => {
      el.style.transform = `translate3d(${CORNER_DIR[i][0] * (1 - c) * 18}px, ${CORNER_DIR[i][1] * (1 - c) * 18}px, 0)`;
      el.style.opacity = (0.25 + 0.75 * c).toFixed(3);
    });
    const s = seg(q, 0.35, 0.62);
    Q.line.style.transform = `translate3d(0, ${s * Q.line.parentElement.offsetHeight}px, 0)`;
    Q.line.style.opacity = (Math.sin(Math.PI * s) > 0.02 ? 1 : 0).toString();
    const ph = ease(seg(q, 0.55, 0.8));
    Q.phone.style.transform = `translate3d(0, ${(1 - ph) * 75}%, 0)`;
  }

  /* ---------- Séquence 3D : images pré-rendues, chargées à l'approche, dessinées sur un canevas ---------- */
  const seq = $("[data-seq]");
  const Z = seq && {
    stage: $("[data-seq-stage]", seq),
    canvas: $("[data-seq-canvas]", seq),
    poster: $(".spin-poster", seq),
    ...(() => {
      const d = JSON.parse($("[data-seq-frames]", seq).textContent);
      return { urls: d.frames, order: d.order };
    })(),
    frames: [],
    drawn: -1,
    started: false,
  };
  function loadSeq() {
    if (Z.started) return;
    Z.started = true;
    Z.frames = Z.urls.map((u) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = request;
      im.src = u;
      return im;
    });
  }
  function layoutSeq() {
    const w = Number(Z.canvas.getAttribute("width"));
    const h = Number(Z.canvas.getAttribute("height"));
    seq.style.setProperty("--seq-ratio", `${w / h}`);
  }
  function renderSeq() {
    const r = seq.getBoundingClientRect();
    if (r.top < vh * 2.5) loadSeq();
    const total = seq.offsetHeight - Z.stage.offsetHeight;
    const q = clamp((headerH - r.top) / total);
    let i = Z.order[Math.round(q * (Z.order.length - 1))];
    // Image la plus proche déjà décodée : jamais de canevas vide pendant le chargement progressif.
    for (let d = 0; d < Z.frames.length; d++) {
      const a = Z.frames[i - d];
      const b = Z.frames[i + d];
      if (a && a.complete && a.naturalWidth) { i -= d; break; }
      if (b && b.complete && b.naturalWidth) { i += d; break; }
      if (d === Z.frames.length - 1) i = -1;
    }
    if (i < 0 || i === Z.drawn || !Z.frames[i]) return;
    const ctx = Z.canvas.getContext("2d");
    ctx.clearRect(0, 0, Z.canvas.width, Z.canvas.height);
    ctx.drawImage(Z.frames[i], 0, 0, Z.canvas.width, Z.canvas.height);
    Z.drawn = i;
    Z.canvas.classList.add("is-live");
  }

  /* ---------- Barre d'action mobile (toutes versions) ---------- */
  const dock = $("[data-dock]");
  const equipe = $("#equipe");
  const finalSec = $(".final");
  const consent = $("[data-consent]");
  const firstFold = story || $("main section");
  if (dock) {
    dock.hidden = false;
    setInert(dock, true);
  }
  function renderDock() {
    if (!dock) return;
    const past = firstFold.getBoundingClientRect().bottom < vh * 0.4;
    const inTeam = equipe && (() => { const r = equipe.getBoundingClientRect(); return r.top < vh && r.bottom > 0; })();
    const atEnd = finalSec && finalSec.getBoundingClientRect().top < vh;
    const on = past && !inTeam && !atEnd && (!consent || consent.hidden);
    dock.classList.toggle("is-on", on);
    setInert(dock, !on);
  }

  /* ---------- Boucle ---------- */
  const parts = [];
  if (motion) {
    if (story) parts.push({ el: story, layout: layoutStory, render: renderStory });
    if (kin) parts.push({ el: kin, render: renderKinetic });
    if (impact) parts.push({ el: impact, render: renderImpact });
    if (pan) parts.push({ el: pan, layout: layoutPan, render: renderPan });
    if (fan) parts.push({ el: fan, layout: layoutFan, render: renderFan });
    if (burst) parts.push({ el: burst, layout: layoutBurst, render: renderBurst });
    if (qr) parts.push({ el: qr, render: renderQr });
    if (seq) parts.push({ el: seq, layout: layoutSeq, render: renderSeq });
  }

  let ticking = false;
  function frame() {
    ticking = false;
    parts.forEach((pt) => {
      if (pt.visible !== false) pt.render();
    });
    renderDock();
  }
  function request() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }
  function layout() {
    vw = document.documentElement.clientWidth;
    vh = window.innerHeight;
    headerH = $(".site-header")?.offsetHeight || 64;
    root.style.setProperty("--header-h", `${headerH}px`);
    parts.forEach((pt) => pt.layout && pt.layout());
    parts.forEach((pt) => pt.render());
    renderDock();
  }

  if ("IntersectionObserver" in window && parts.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const pt = parts.find((x) => x.el === en.target);
        if (pt) pt.visible = en.isIntersecting;
      });
      request();
    }, { rootMargin: "20% 0px" });
    parts.forEach((pt) => io.observe(pt.el));
  }

  layout();
  root.classList.add("is-ready");
  window.addEventListener("scroll", request, { passive: true });
  let resizeT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layout, 120);
  });
  // Les images chargées tard (pan, éventail) changent les largeurs : on remesure une fois.
  window.addEventListener("load", layout, { once: true });
  if (consent) new MutationObserver(request).observe(consent, { attributes: true, attributeFilter: ["hidden"] });

  // Si l'utilisateur active « réduire les animations » en cours de route, on revient à la version statique.
  try {
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (ev) => {
      if (ev.matches) window.location.reload();
    });
  } catch {
    /* ancien navigateur : ignoré */
  }
})();
