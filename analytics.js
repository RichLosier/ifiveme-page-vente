/* iFiveMe : couche d'analytique centralisée, consentement (Loi 25) et attribution.
 *
 * Contrat public (pour Gary et les scripts de la page) :
 *   window.ifmTrack(event, props)   pousse un événement dans window.dataLayer (tableau neutre, en mémoire)
 *   window.ifmConsent               get() / set(choice) / open() / onChange(fn)
 *   window.ifmAnalytics             registerSink(fn, { requires }) / attribution() / state()
 *
 * États de consentement :
 *   "analytique_essentielle"  par défaut. Mesure d'audience agrégée, sans identifiant, sans témoin tiers.
 *   "marketing"               seulement après « Accepter » : pixels, remarketing, conteneur de balises.
 *
 * AUCUN script tiers n'est chargé par ce fichier. Les points d'injection sont plus bas
 * (section « POINTS D'INJECTION »). Rien ne quitte la page tant qu'un branchement n'y est pas ajouté.
 */
(() => {
  "use strict";

  const STATE_ESSENTIAL = "analytique_essentielle";
  const STATE_MARKETING = "marketing";
  const CONSENT_KEY = "ifm-consent-v2";
  const ATTR_KEY = "ifm-attribution";
  const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

  /* ---------- Stockage tolérant aux refus du navigateur ---------- */
  const safe = (store) => ({
    get(k) {
      try {
        return window[store].getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        window[store].setItem(k, v);
      } catch {
        /* stockage indisponible : on continue sans mémoriser */
      }
    },
  });
  const local = safe("localStorage");
  const session = safe("sessionStorage");

  /* ---------- Attribution : UTM, fbclid, gclid conservés pour la session seulement ---------- */
  function readAttribution() {
    let stored = {};
    try {
      stored = JSON.parse(session.get(ATTR_KEY) || "{}") || {};
    } catch {
      stored = {};
    }
    const params = new URLSearchParams(window.location.search);
    let fresh = false;
    CAMPAIGN_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) {
        stored[k] = v.slice(0, 200);
        fresh = true;
      }
    });
    if (fresh) session.set(ATTR_KEY, JSON.stringify(stored));
    return stored;
  }
  const attribution = readAttribution();

  /* Ajoute l'attribution telle quelle à une URL de panier. Valeurs déjà présentes dans l'URL : conservées. */
  function withAttribution(href) {
    if (!Object.keys(attribution).length) return href;
    try {
      const url = new URL(href, window.location.href);
      Object.entries(attribution).forEach(([k, v]) => {
        if (!url.searchParams.has(k)) url.searchParams.set(k, v);
      });
      return url.toString();
    } catch {
      return href;
    }
  }

  /* ---------- Consentement ---------- */
  function readConsent() {
    try {
      const v = JSON.parse(local.get(CONSENT_KEY) || "null");
      if (v && v.v === 2 && (v.state === STATE_ESSENTIAL || v.state === STATE_MARKETING)) return v;
    } catch {
      /* valeur illisible : traitée comme absente */
    }
    return null;
  }
  let consentRecord = readConsent();
  const consentListeners = [];

  const consent = {
    get() {
      return consentRecord ? consentRecord.state : STATE_ESSENTIAL;
    },
    decided() {
      return !!consentRecord;
    },
    set(choice) {
      const state = choice === "accept" || choice === STATE_MARKETING ? STATE_MARKETING : STATE_ESSENTIAL;
      const previous = consent.get();
      consentRecord = { v: 2, state, at: new Date().toISOString() };
      local.set(CONSENT_KEY, JSON.stringify(consentRecord));
      if (state !== previous) consentListeners.forEach((fn) => fn(state, previous));
      track("consent_update", { consent_choice: state });
      return state;
    },
    onChange(fn) {
      consentListeners.push(fn);
    },
    open() {
      showBanner(true, true);
    },
  };

  /* ---------- Suivi ---------- */
  window.dataLayer = window.dataLayer || [];
  const sinks = []; // { fn, requires }

  function clean(props) {
    const out = {};
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      out[k] = typeof v === "string" ? v.slice(0, 120) : v;
    });
    return out;
  }

  function track(event, props) {
    const state = consent.get();
    const entry = {
      event,
      ...clean(props),
      consent_state: state,
      page_path: window.location.pathname,
    };
    window.dataLayer.push(entry);
    sinks.forEach((s) => {
      if (s.requires === STATE_MARKETING && state !== STATE_MARKETING) return;
      try {
        s.fn(entry);
      } catch {
        /* un branchement défaillant ne casse jamais la page */
      }
    });
  }
  window.ifmTrack = track;
  window.ifmConsent = consent;
  window.ifmAnalytics = {
    STATE_ESSENTIAL,
    STATE_MARKETING,
    attribution: () => ({ ...attribution }),
    withAttribution,
    state: () => consent.get(),
    registerSink(fn, opts) {
      if (typeof fn === "function") sinks.push({ fn, requires: (opts && opts.requires) || STATE_ESSENTIAL });
    },
  };

  /* ====================== POINTS D'INJECTION (rien n'est branché) ======================
   * Gary branche ici, après décision de Richard, et seulement ici :
   *
   * 1) Mesure d'audience agrégée (sans identifiant), état "analytique_essentielle" suffisant :
   *      window.ifmAnalytics.registerSink((e) => navigator.sendBeacon(URL, JSON.stringify(e)));
   *
   * 2) Pixel, GA4 ou conteneur de balises, état "marketing" obligatoire :
   *      consent.onChange((state) => { if (state === "marketing") chargerMarketing(); });
   *      if (consent.get() === "marketing") chargerMarketing();
   *    chargerMarketing() injecte le script du fournisseur, puis :
   *      window.ifmAnalytics.registerSink((e) => fbq("trackCustom", e.event, e), { requires: "marketing" });
   *
   * 3) Ajouter l'origine du fournisseur à script-src et connect-src (dist/_headers) avant la mise en ligne.
   * ====================================================================================== */

  /* ---------- Bandeau de consentement ---------- */
  const banner = document.querySelector("[data-consent]");
  let revealed = false;
  function showBanner(show, focus) {
    if (!banner) return;
    banner.hidden = !show;
    if (show && focus) banner.focus();
  }
  if (banner) {
    banner.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-consent-choice]");
      if (!btn) return;
      consent.set(btn.dataset.consentChoice);
      showBanner(false);
    });
    banner.addEventListener("keydown", (e) => {
      if (e.key === "Escape") showBanner(false);
    });
    if (!consent.decided()) {
      // Rien de tiers ne tourne avant le choix : le bandeau attend un premier défilement (ou 8 s)
      // pour ne pas masquer la carte au premier écran.
      const reveal = () => {
        if (revealed || consent.decided()) return;
        revealed = true;
        window.removeEventListener("scroll", onScroll);
        showBanner(true);
      };
      const onScroll = () => {
        if (window.scrollY > 240) reveal();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.setTimeout(reveal, 8000);
    }
  }
  document.querySelectorAll("[data-consent-open]").forEach((b) => b.addEventListener("click", () => consent.open()));

  /* ---------- Événements ---------- */
  const referrerHost = (() => {
    try {
      return document.referrer ? new URL(document.referrer).hostname : "";
    } catch {
      return "";
    }
  })();
  track("page_view", { ...attribution, referrer_host: referrerHost, page_title: document.title });

  // Profondeur de défilement : 25, 50, 75, 100 %, une fois chacun.
  const depthSeen = new Set();
  const DEPTHS = [25, 50, 75, 100];
  let depthTicking = false;
  function checkDepth() {
    depthTicking = false;
    const doc = document.documentElement;
    const total = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const seen = ((window.scrollY + window.innerHeight) / total) * 100;
    DEPTHS.forEach((d) => {
      if (!depthSeen.has(d) && seen >= (d === 100 ? 98.5 : d)) {
        depthSeen.add(d);
        track("scroll_depth", { percent: d });
      }
    });
    if (depthSeen.size === DEPTHS.length) window.removeEventListener("scroll", onDepthScroll);
  }
  function onDepthScroll() {
    if (!depthTicking) {
      depthTicking = true;
      window.requestAnimationFrame(checkDepth);
    }
  }
  window.addEventListener("scroll", onDepthScroll, { passive: true });
  checkDepth();

  // Clics : portes, paniers, courriel, liens sortants, navigation interne.
  const placement = (el) => el.closest("section[id], header, footer, [data-dock], [data-consent]")?.id
    || (el.closest("[data-dock]") ? "barre_mobile" : el.closest("header") ? "entete" : el.closest("footer") ? "pied" : "page");

  function decorateCheckoutLinks() {
    document.querySelectorAll("[data-checkout]").forEach((a) => {
      const base = a.getAttribute("data-checkout-url") || a.getAttribute("href");
      a.setAttribute("data-checkout-url", base);
      a.href = withAttribution(base);
    });
  }
  decorateCheckoutLinks();

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    const door = e.target.closest("[data-door]");
    if (door) {
      track("door_click", {
        door: door.dataset.door,
        label: (door.textContent || "").replace(/[→\s]+/g, " ").trim(),
        placement: placement(door),
      });
    }
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (a.hasAttribute("data-checkout")) {
      decorateCheckoutLinks(); // dernier état de l'attribution juste avant la navigation
      let host = "";
      try {
        host = new URL(a.href).hostname;
      } catch {
        /* URL invalide : l'événement part sans hôte */
      }
      track("checkout_click", {
        product: a.dataset.checkout,
        door: a.dataset.door,
        placement: placement(a),
        destination_host: host,
        carries_campaign: Object.keys(attribution).length > 0,
      });
    } else if (href.startsWith("mailto:")) {
      track("contact_click", { channel: "courriel", placement: placement(a) });
    } else if (/^https?:/i.test(href)) {
      let host = "";
      try {
        host = new URL(href).hostname;
      } catch {
        /* ignoré */
      }
      if (host && host !== window.location.hostname) track("outbound_click", { destination_host: host, placement: placement(a) });
    } else if (href.startsWith("#") && href.length > 1 && !door && a.closest("nav")) {
      track("nav_click", { target: href.slice(1) });
    }
  });

  // Ouverture d'une question de la FAQ (l'événement « toggle » ne remonte pas : capture).
  document.addEventListener(
    "toggle",
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open || !d.closest(".faq")) return;
      const all = [...d.parentElement.querySelectorAll("details")];
      track("faq_open", { question: (d.querySelector("summary")?.textContent || "").trim().slice(0, 100), position: all.indexOf(d) + 1 });
    },
    true,
  );

  // Section signature : vue (40 % visible) puis lecture (4 s continues).
  const sig = document.querySelector("#signature");
  if (sig && "IntersectionObserver" in window) {
    let readTimer = 0;
    let viewed = false;
    let read = false;
    new IntersectionObserver(
      (entries) => {
        const on = entries[0].isIntersecting;
        if (on && !viewed) {
          viewed = true;
          track("signature_view");
        }
        clearTimeout(readTimer);
        if (on && !read) {
          readTimer = window.setTimeout(() => {
            read = true;
            track("signature_read", { seconds: 4 });
          }, 4000);
        }
      },
      { threshold: 0.4 },
    ).observe(sig);
  }
})();
