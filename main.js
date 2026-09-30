/* Page de vente iFiveMe : comportement client. Aucun envoi réseau en mode démonstration. */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    demoMode: true,
    // Destinations réelles des portes. Le panier Pro est en anglais : remplacer par /professionnel/ dès que Warren l'a cloné.
    checkout: {
      trial: "https://checkout.ifiveme.com/activation-carte-daffaires-virtuelle-ft/",
      pro: "https://checkout.ifiveme.com/professional/",
    },
    // Branchement futur (voir README) : point d'entrée serveur qui écrit dans le CRM. Vide = rien n'est envoyé.
    leadEndpoint: "",
    // Mesure : GA4 via GTM, chargée seulement après consentement ET hors démonstration.
    gtmId: "",
    consentKey: "ifm-consent-v1",
  });

  const root = document.documentElement;
  root.classList.add("js");
  const events = [];
  window.__ifmEvents = events; // inspection locale seulement

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* stockage indisponible : on continue sans mémoriser */
      }
    },
  };

  /* ---------- Consentement (Loi 25) ---------- */
  const consent = {
    value: storage.get(CONFIG.consentKey),
    granted() {
      return this.value === "granted";
    },
    set(v) {
      this.value = v;
      storage.set(CONFIG.consentKey, v);
      if (v === "granted") loadMeasurement();
    },
  };

  function loadMeasurement() {
    // Aucun script tiers n'est chargé tant que la démonstration est active ou qu'aucun conteneur n'est configuré.
    if (CONFIG.demoMode || !CONFIG.gtmId || !consent.granted()) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(CONFIG.gtmId)}`;
    document.head.appendChild(s);
  }

  function track(name, params = {}) {
    const entry = { name, params, at: new Date().toISOString(), sent: false };
    if (!CONFIG.demoMode && consent.granted() && window.dataLayer) {
      window.dataLayer.push({ event: name, ...params });
      entry.sent = true;
    }
    events.push(entry);
  }

  /* ---------- UTM : transmis aux paniers et aux demandes, jamais stocké sans consentement ---------- */
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const utm = {};
  const params = new URLSearchParams(window.location.search);
  UTM_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) utm[k] = v.slice(0, 100);
  });

  function withUtm(href) {
    if (!Object.keys(utm).length) return href;
    try {
      const url = new URL(href);
      Object.entries(utm).forEach(([k, v]) => url.searchParams.set(k, v));
      return url.toString();
    } catch {
      return href;
    }
  }

  document.querySelectorAll("[data-checkout]").forEach((a) => {
    const target = CONFIG.checkout[a.dataset.checkout];
    if (target) a.href = withUtm(target);
  });

  /* ---------- Clics par porte ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-door]");
    if (!el) return;
    track("door_click", { door: el.dataset.door, placement: el.closest("section,header,footer")?.id || "page" });
  });

  /* ---------- Bandeau de consentement ---------- */
  const banner = document.querySelector("[data-consent]");
  function showBanner(show) {
    if (!banner) return;
    banner.hidden = !show;
  }
  if (banner) {
    // Aucun pistage n'existe avant l'accord : le bandeau attend le premier défilement
    // pour ne pas cacher la carte au premier écran.
    if (!consent.value) {
      const reveal = () => {
        if (window.scrollY > 240) {
          showBanner(true);
          window.removeEventListener("scroll", reveal);
        }
      };
      window.addEventListener("scroll", reveal, { passive: true });
    }
    banner.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-consent-choice]");
      if (!btn) return;
      consent.set(btn.dataset.consentChoice);
      showBanner(false);
    });
  }
  document.querySelectorAll("[data-consent-open]").forEach((b) =>
    b.addEventListener("click", () => showBanner(true)),
  );
  loadMeasurement();

  /* ---------- En-tête au défilement ---------- */
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Apparition des sections ---------- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- Onglets « Votre métier » ---------- */
  document.querySelectorAll("[data-tabs]").forEach((tabs) => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const select = (btn, focus) => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(b.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) btn.focus();
      track("example_view", { metier: btn.dataset.metier });
      const field = document.querySelector("[data-metier-field]");
      if (field && btn.dataset.metierLabel) field.value = btn.dataset.metierLabel;
    };
    buttons.forEach((btn, i) => {
      btn.addEventListener("click", () => select(btn, false));
      btn.addEventListener("keydown", (e) => {
        const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (dir) {
          e.preventDefault();
          select(buttons[(i + dir + buttons.length) % buttons.length], true);
        } else if (e.key === "Home") {
          e.preventDefault();
          select(buttons[0], true);
        } else if (e.key === "End") {
          e.preventDefault();
          select(buttons[buttons.length - 1], true);
        }
      });
    });
  });

  /* ---------- Formulaires (démonstration) ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function fieldError(input, message) {
    const wrap = input.closest(".field") || input.parentElement;
    const out = wrap.querySelector(".field-error");
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (out) out.textContent = message || "";
  }

  function validate(form) {
    let firstBad = null;
    form.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.type === "hidden" || input.name === "website") return;
      let msg = "";
      const v = input.type === "checkbox" ? input.checked : input.value.trim();
      if (input.required && !v) {
        msg = input.type === "checkbox" ? "Votre accord est nécessaire pour vous répondre." : "Ce champ est obligatoire.";
      } else if (input.type === "email" && v && !EMAIL.test(v)) {
        msg = "Vérifiez l'adresse courriel.";
      } else if (input.type === "tel" && v && v.replace(/\D/g, "").length < 10) {
        msg = "Entrez un numéro à 10 chiffres.";
      }
      fieldError(input, msg);
      if (msg && !firstBad) firstBad = input;
    });
    return firstBad;
  }

  document.querySelectorAll("form[data-lead]").forEach((form) => {
    form.noValidate = true;
    form.addEventListener("input", (e) => {
      if (e.target.getAttribute("aria-invalid") === "true") fieldError(e.target, "");
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.website && form.website.value) return; // pot de miel : robot
      const bad = validate(form);
      const status = form.querySelector("[data-status]");
      if (bad) {
        bad.focus();
        if (status) status.textContent = "Quelques champs sont à compléter.";
        return;
      }
      const data = Object.fromEntries(new FormData(form).entries());
      delete data.website;
      const payload = {
        form: form.dataset.lead,
        ...data,
        utm,
        page: window.location.pathname,
        submitted_at: new Date().toISOString(),
      };
      if (CONFIG.demoMode || !CONFIG.leadEndpoint) {
        track("generate_lead", { lead_source: form.dataset.lead, demo: true });
        showDone(form, true, payload);
        return;
      }
      try {
        const res = await fetch(CONFIG.leadEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(String(res.status));
        track("generate_lead", { lead_source: form.dataset.lead });
        showDone(form, false, payload);
      } catch {
        if (status) status.textContent = "L'envoi n'a pas fonctionné. Réessayez dans un instant ou écrivez à info@ifiveme.com.";
      }
    });
  });

  function showDone(form, demo, payload) {
    const done = form.parentElement.querySelector("[data-done]");
    if (!done) return;
    form.hidden = true;
    done.hidden = false;
    const note = done.querySelector("[data-demo-note]");
    if (note) note.hidden = !demo;
    const pre = done.querySelector("[data-payload]");
    if (pre && demo) pre.textContent = JSON.stringify(payload, null, 2);
    const heading = done.querySelector("h3, [tabindex]");
    if (heading) heading.focus();
  }

  document.querySelectorAll("[data-reset]").forEach((b) =>
    b.addEventListener("click", () => {
      const box = b.closest("[data-done]");
      const form = box.parentElement.querySelector("form[data-lead]");
      form.reset();
      box.hidden = true;
      form.hidden = false;
      form.querySelector("input")?.focus();
    }),
  );

  /* ---------- Démonstration : masquer les éléments propres à la démo si désactivée ---------- */
  if (!CONFIG.demoMode) document.querySelectorAll("[data-demo-only]").forEach((el) => el.remove());
})();
