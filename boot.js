/* Chargé avant le rendu : choisit la version animée ou la version statique complète, sans flash. */
(function () {
  var r = document.documentElement;
  r.classList.add("js");
  try {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
      r.classList.add("motion");
    }
  } catch (e) {
    /* matchMedia indisponible : version statique */
  }
  // Filet de sécurité : si un script essentiel n'a pas pu s'exécuter (réseau coupé, bloqueur, erreur), on revient à la page statique
  // complète (tous les métiers lisibles, formulaires remplacés par l'adresse courriel, aucun bouton mort).
  window.addEventListener("load", function () {
    window.setTimeout(function () {
      if (!window.__ifmMain) r.classList.remove("js");
      if (!r.classList.contains("is-ready")) r.classList.remove("motion");
    }, 400);
  });
})();
