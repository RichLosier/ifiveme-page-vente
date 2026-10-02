/* Page de vente iFiveMe : comportement client (interface et formulaires).
 * Mesure et consentement : voir analytics.js (window.ifmTrack, window.ifmConsent). */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    // Destinations réelles des portes. Le panier Pro est en anglais : remplacer par /professionnel/ dès que Warren l'a cloné.
    checkout: {
      trial: "https://checkout.ifiveme.com/activation-carte-daffaires-virtuelle-ft/",
      pro: "https://checkout.ifiveme.com/professional/",
    },
    // Réception des demandes. Vide = repli par courriel (mailto) : rien ne passe par un serveur.
    // Renseigner l'adresse de la fonction lead-intake (voir backend/ et README) pour activer l'envoi direct.
    leadEndpoint: "",
    leadFallbackEmail: "info@ifiveme.com",
    minFillMs: 3000, // un formulaire rempli plus vite qu'un humain n'écrit est refusé
    consentTextVersion: "2026-09-30",
  });

  const root = document.documentElement;
  root.classList.add("js");
  const track = (name, props) => {
    if (typeof window.ifmTrack === "function") window.ifmTrack(name, props);
  };
  const attribution = () => (window.ifmAnalytics ? window.ifmAnalytics.attribution() : {});

  // Les paniers : l'URL vient de CONFIG; analytics.js y joint UTM, fbclid et gclid tels quels.
  document.querySelectorAll("[data-checkout]").forEach((a) => {
    const target = CONFIG.checkout[a.dataset.checkout];
    if (target) a.setAttribute("href", target);
  });
  if (window.ifmAnalytics) {
    document.querySelectorAll("[data-checkout]").forEach((a) => {
      a.setAttribute("data-checkout-url", a.getAttribute("href"));
      a.href = window.ifmAnalytics.withAttribution(a.getAttribute("href"));
    });
  }

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

  /* ---------- Statistiques d'exemple : comptent jusqu'à leur valeur à l'entrée dans l'écran ---------- */
  const counters = [...document.querySelectorAll("[data-count]")];
  if (counters.length && root.classList.contains("motion") && "IntersectionObserver" in window) {
    counters.forEach((el) => (el.textContent = "0"));
    const cio = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          cio.unobserve(en.target);
          const to = Number(en.target.dataset.count);
          const t0 = performance.now();
          const tick = (now) => {
            const k = Math.min(1, (now - t0) / 1300);
            en.target.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { threshold: 0.6 },
    );
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------- Onglets « Votre métier » ----------*/
  document.querySelectorAll("[data-tabs]").forEach((tabs) => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const AUTO_MS = 7000;
    const canAuto = tabs.hasAttribute("data-autoplay") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    let inView = false;
    let hold = false;
    let stopped = false;
    const arm = () => {
      clearTimeout(timer);
      tabs.classList.remove("is-running");
      if (!canAuto || stopped || hold || !inView) return;
      void tabs.offsetWidth;
      tabs.style.setProperty("--auto-ms", `${AUTO_MS}ms`);
      tabs.classList.add("is-running");
      timer = setTimeout(() => {
        const i = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
        select(buttons[(i + 1) % buttons.length], false, true);
      }, AUTO_MS);
    };
    const select = (btn, focus, auto) => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(b.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) btn.focus();
      if (!auto) {
        stopped = true; // un choix volontaire arrête l'enchaînement
        track("metier_tab", { metier: btn.dataset.metier });
      }
      arm();
      const field = document.querySelector("[data-metier-field]");
      if (!auto && field && btn.dataset.metierLabel) field.value = btn.dataset.metierLabel;
      syncNav();
    };
    /* Navigation visible : flèches, compteur, points, balayage tactile, flèches du clavier. */
    const nav = tabs.querySelector("[data-tab-nav]");
    const idx = () => buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    const go = (d, focusTab) => {
      select(buttons[(idx() + d + buttons.length) % buttons.length], focusTab);
      nav && nav.querySelector("[data-tab-next]")?.classList.remove("is-attn");
    };
    function syncNav() {
      if (!nav) return;
      const i = idx();
      nav.querySelector("[data-tab-now]").textContent = String(i + 1);
      nav.querySelector("[data-tab-total]").textContent = String(buttons.length);
      nav.querySelector("[data-tab-name]").textContent = ` Métier ${i + 1} sur ${buttons.length} : ${buttons[i].dataset.metierLabel}`;
      nav.querySelectorAll(".tab-dots i").forEach((d, k) => d.classList.toggle("is-on", k === i));
      const nx = buttons[(i + 1) % buttons.length].dataset.metierLabel;
      const pv = buttons[(i - 1 + buttons.length) % buttons.length].dataset.metierLabel;
      nav.querySelector("[data-tab-next]").setAttribute("aria-label", `Métier suivant : ${nx}`);
      nav.querySelector("[data-tab-prev]").setAttribute("aria-label", `Métier précédent : ${pv}`);
    }
    if (nav) {
      nav.querySelector("[data-tab-next]").addEventListener("click", () => go(1, false));
      nav.querySelector("[data-tab-prev]").addEventListener("click", () => go(-1, false));
      // Balayage gauche/droite sur les panneaux (tactile) et flèches gauche/droite quand le focus est dans un panneau.
      let sx = 0;
      let sy = 0;
      tabs.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" && e.target.closest(".panel")) {
          sx = e.clientX;
          sy = e.clientY;
        } else sx = 0;
      });
      tabs.addEventListener("pointerup", (e) => {
        if (e.pointerType !== "touch" || !sx) return;
        const dx = e.clientX - sx;
        if (Math.abs(dx) > 50 && Math.abs(e.clientY - sy) < 40) go(dx < 0 ? 1 : -1, false);
        sx = 0;
      });
      tabs.addEventListener("keydown", (e) => {
        if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.matches('[role="tabpanel"], .tab-arrow')) {
          e.preventDefault();
          const onPanel = e.target.matches('[role="tabpanel"]');
          go(e.key === "ArrowRight" ? 1 : -1, false);
          if (onPanel) document.getElementById(buttons[idx()].getAttribute("aria-controls"))?.focus({ preventScroll: true });
        }
      });
      syncNav();
    }
    if (canAuto) {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((es) => {
          inView = es[0].isIntersecting;
          arm();
        }, { threshold: 0.45 }).observe(tabs);
      }
      tabs.addEventListener("mouseenter", () => { hold = true; arm(); });
      tabs.addEventListener("mouseleave", () => { hold = false; arm(); });
      tabs.addEventListener("focusin", () => { hold = true; arm(); });
      tabs.addEventListener("focusout", () => { hold = false; arm(); });
      tabs.addEventListener("pointerdown", () => { stopped = true; arm(); });
    }
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

  /* ---------- Formulaires de demande ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const FORM_LABEL = { exemple_metier: "Exemple pour mon métier", soumission_entreprise: "Soumission pour mon équipe" };
  const pageLoadedAt = performance.now();

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

  function buildPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.website;
    const checkbox = form.querySelector('input[name="consentement_courriel"]');
    const label = checkbox ? form.querySelector(`label[for="${checkbox.id}"]`) : null;
    const consentText = label ? label.textContent.replace(/\s+/g, " ").trim() : "";
    return {
      form: form.dataset.lead,
      fields: {
        metier: data.metier || "",
        nom: data.nom || "",
        courriel: (data.courriel || "").trim(),
        entreprise: data.entreprise || "",
        nombre_cartes: data.nombre_cartes || "",
        telephone: data.telephone || "",
      },
      consent_marketing: !!(checkbox && checkbox.checked),
      consent_text: consentText.slice(0, 600),
      consent_text_version: CONFIG.consentTextVersion,
      campaign: attribution(),
      page: window.location.pathname,
      elapsed_ms: Math.round(performance.now() - pageLoadedAt),
      website: "", // pot de miel : toujours vide pour un humain
    };
  }

  function mailtoFor(payload) {
    const f = payload.fields;
    const lines = [
      `Demande : ${FORM_LABEL[payload.form] || payload.form}`,
      f.nom && `Nom : ${f.nom}`,
      f.entreprise && `Entreprise : ${f.entreprise}`,
      f.metier && `Métier : ${f.metier}`,
      f.nombre_cartes && `Nombre de cartes : ${f.nombre_cartes}`,
      `Courriel : ${f.courriel}`,
      f.telephone && `Téléphone : ${f.telephone}`,
      "",
      payload.consent_marketing ? "J'accepte de recevoir des courriels d'iFiveMe. Je peux me désabonner en tout temps." : "",
    ].filter((l) => l !== false && l !== undefined);
    const subject = `${FORM_LABEL[payload.form] || "Demande"} (page iFiveMe)`;
    return `mailto:${CONFIG.leadFallbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  function showDone(form, mode, link) {
    const done = form.parentElement.querySelector("[data-done]");
    if (!done) return;
    form.hidden = true;
    done.hidden = false;
    done.querySelectorAll("[data-done-mode]").forEach((el) => {
      el.hidden = el.dataset.doneMode !== mode;
    });
    const a = done.querySelector("[data-mailto-link]");
    if (a && link) a.setAttribute("href", link);
    const heading = done.querySelector("[data-done-mode]:not([hidden]) h3, [data-done-mode]:not([hidden]) [tabindex]");
    if (heading) heading.focus();
  }

  document.querySelectorAll("form[data-lead]").forEach((form) => {
    form.noValidate = true;
    let started = false;
    form.addEventListener("focusin", () => {
      if (started) return;
      started = true;
      track("form_start", { form: form.dataset.lead });
    });
    form.addEventListener("input", (e) => {
      if (e.target.getAttribute("aria-invalid") === "true") fieldError(e.target, "");
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = form.querySelector("[data-status]");
      const btn = form.querySelector('button[type="submit"]');
      if (form.website && form.website.value) {
        showDone(form, "sent"); // pot de miel : le robot croit avoir réussi, rien n'est transmis
        return;
      }
      const bad = validate(form);
      if (bad) {
        bad.focus();
        if (status) status.textContent = "Quelques champs sont à compléter.";
        track("form_error", { form: form.dataset.lead, invalid_fields: form.querySelectorAll('[aria-invalid="true"]').length });
        return;
      }
      const payload = buildPayload(form);
      if (payload.elapsed_ms < CONFIG.minFillMs) {
        if (status) status.textContent = "Un instant, puis réessayez.";
        return;
      }
      if (status) status.textContent = "";
      if (!CONFIG.leadEndpoint) {
        // Repli : l'application courriel de la personne s'ouvre avec la demande. Rien n'est envoyé tant qu'elle n'appuie pas sur Envoyer.
        const link = mailtoFor(payload);
        track("form_submit", { form: form.dataset.lead, method: "mailto", consent_marketing: payload.consent_marketing });
        showDone(form, "mailto", link);
        window.location.href = link;
        return;
      }
      if (btn) btn.disabled = true;
      try {
        const res = await fetch(CONFIG.leadEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 429) throw new Error("rate");
        if (!res.ok) throw new Error(String(res.status));
        track("form_submit", { form: form.dataset.lead, method: "endpoint", consent_marketing: payload.consent_marketing });
        track("generate_lead", { lead_source: form.dataset.lead });
        showDone(form, "sent");
      } catch (err) {
        track("form_submit", { form: form.dataset.lead, method: "endpoint", failed: true });
        if (err.message === "rate") {
          if (status) status.textContent = "Trop de demandes depuis votre connexion. Réessayez dans une heure ou écrivez à " + CONFIG.leadFallbackEmail + ".";
        } else {
          // Le serveur ne répond pas : on bascule sur le courriel plutôt que de perdre la demande.
          showDone(form, "mailto", mailtoFor(payload));
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  });

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
})();
