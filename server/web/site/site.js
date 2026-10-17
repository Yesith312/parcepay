// Estado del servicio en la pagina de inicio
(function () {
  var el = document.getElementById("estado");
  if (!el) return;
  fetch("/health", { cache: "no-store" })
    .then(function (r) { return r.ok ? r : Promise.reject(); })
    .then(function () { el.textContent = "Operativo"; el.className = "pill ok"; })
    .catch(function () { el.textContent = "Con problemas"; el.className = "pill bad"; });
})();
