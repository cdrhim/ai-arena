const ARENA_URL = "/arena/";
const entryButton = document.querySelector("#cinematicEnter");
const film = document.querySelector("#cinematicFilm");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let entering = false;
let navigationTimer = 0;

function resetCinematicEntry() {
  window.clearTimeout(navigationTimer);
  entering = false;
  document.body.classList.remove("is-entering");
  entryButton?.removeAttribute("aria-disabled");

  if (!reducedMotion.matches) {
    film?.play().catch(() => {
      document.body.classList.add("is-poster-fallback");
    });
  }
}

function enterArena() {
  if (entering) return;
  entering = true;
  entryButton?.setAttribute("aria-disabled", "true");
  document.body.classList.add("is-entering");

  const transitionTime = reducedMotion.matches ? 80 : 920;
  navigationTimer = window.setTimeout(() => {
    window.location.assign(ARENA_URL);
  }, transitionTime);
}

entryButton?.addEventListener("click", enterArena);
window.addEventListener("pageshow", resetCinematicEntry);

film?.addEventListener("canplay", () => {
  document.body.classList.add("is-film-ready");
}, { once: true });

if (reducedMotion.matches) {
  film?.pause();
} else {
  film?.play().catch(() => {
    document.body.classList.add("is-poster-fallback");
  });
}
