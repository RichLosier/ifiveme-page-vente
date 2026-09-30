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
})();
