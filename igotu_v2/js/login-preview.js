/* Login-only presentation. No SDK, account data, persistence or Auth decisions. */
(() => {
  const password = document.getElementById("password");
  const visibility = document.getElementById("passwordToggle");
  if (password && visibility) {
    function hidePassword() {
      password.type = "password";
      visibility.setAttribute("aria-pressed", "false");
      visibility.setAttribute("aria-label", "Show password");
    }
    visibility.hidden = false;
    visibility.addEventListener("click", () => {
      const show = password.type === "password";
      password.type = show ? "text" : "password";
      visibility.setAttribute("aria-pressed", String(show));
      visibility.setAttribute(
        "aria-label",
        show ? "Hide password" : "Show password",
      );
    });
    window.addEventListener("blur", hidePassword);
    window.addEventListener("pagehide", hidePassword);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hidePassword();
    });
    document
      .getElementById("loginForm")
      ?.addEventListener("submit", hidePassword);
    document
      .querySelectorAll("[data-login-role]")
      .forEach((button) => button.addEventListener("click", hidePassword));
  }

  const preview = document.querySelector(".service-preview");
  if (!preview) return;
  const canvas = preview.querySelector(".preview-canvas");
  const toggle = document.getElementById("previewToggle");
  const next = document.getElementById("previewNext");
  const state = document.getElementById("previewState");
  const scenes = [...preview.querySelectorAll(".workflow-scene")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const observable = typeof IntersectionObserver === "function";
  const stepDuration = 1800;
  const duration = stepDuration * scenes.length;
  let inViewport = false;
  let userWantsPlayback = !reduced.matches && observable;
  let elapsed = 0;
  let started = 0;
  let running = false;
  let manual = true;
  let currentStep = 0;

  function stopClock() {
    if (running) elapsed += performance.now() - started;
    running = false;
    preview.classList.remove("preview-playing");
  }
  function stepFromClock() {
    return Math.floor(
      ((elapsed + (running ? performance.now() - started : 0)) % duration) /
        stepDuration,
    );
  }
  function showStaticStep(step) {
    stopClock();
    currentStep = (step + scenes.length) % scenes.length;
    elapsed = currentStep * stepDuration;
    manual = true;
    preview.classList.remove("preview-animated");
    preview.classList.add("preview-manual");
    scenes.forEach((scene, index) =>
      scene.classList.toggle("is-current", index === currentStep),
    );
  }
  function updatePlayback() {
    const allowed =
      userWantsPlayback &&
      !reduced.matches &&
      observable &&
      inViewport &&
      !document.hidden;
    if (allowed && !running) {
      if (manual) {
        preview.style.setProperty("--preview-offset", `${elapsed}ms`);
        preview.classList.remove("preview-manual");
        preview.classList.add("preview-animated");
        manual = false;
      }
      started = performance.now();
      running = true;
      preview.classList.add("preview-playing");
    } else if (!allowed) stopClock();
    toggle.disabled = reduced.matches || !observable;
    toggle.textContent = reduced.matches
      ? "Motion reduced"
      : !observable
        ? "Static preview"
        : userWantsPlayback
          ? "Pause preview"
          : "Play preview";
    toggle.setAttribute(
      "aria-label",
      reduced.matches
        ? "Automatic preview disabled by reduced motion preference"
        : userWantsPlayback
          ? "Pause service preview"
          : "Play service preview",
    );
    state.textContent = running
      ? "Playing · 10.8s loop"
      : reduced.matches
        ? `Static · step ${currentStep + 1} of ${scenes.length}`
        : userWantsPlayback
          ? "Paused while away"
          : `Paused · step ${stepFromClock() + 1} of ${scenes.length}`;
    preview.dataset.playback = running ? "playing" : "paused";
  }
  showStaticStep(0);
  toggle.hidden = false;
  next.hidden = false;
  toggle.addEventListener("click", () => {
    userWantsPlayback = !userWantsPlayback;
    updatePlayback();
  });
  next.addEventListener("click", () => {
    const step = manual ? currentStep : stepFromClock();
    userWantsPlayback = false;
    showStaticStep(step + 1);
    updatePlayback();
  });
  document.addEventListener("visibilitychange", updatePlayback);
  window.addEventListener("pagehide", stopClock);
  window.addEventListener("pageshow", updatePlayback);
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      userWantsPlayback = false;
      showStaticStep(stepFromClock());
    }
    updatePlayback();
  });
  if (observable) {
    const observer = new IntersectionObserver(
      (entries) => {
        inViewport =
          entries[0].isIntersecting && entries[0].intersectionRatio >= 0.15;
        updatePlayback();
      },
      { threshold: [0, 0.15] },
    );
    observer.observe(canvas);
  }
  updatePlayback();

  // Finite entrance effects; content is visible before/without enhancement.
  const entrances = [
    ...document.querySelectorAll(
      ".auth-header,.auth-page-heading,[data-login-role],.auth-form-panel,.auth-welcome-note",
    ),
  ];
  if (!reduced.matches)
    entrances.forEach((element, index) => {
      if (element.contains(document.activeElement)) return;
      element.style.setProperty(
        "--login-delay",
        `${Math.min(index, 3) * 70}ms`,
      );
      element.classList.add("login-enter");
    });
  function clearEntrance(element) {
    element.classList.remove("login-enter");
  }
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "login-enter") clearEntrance(event.target);
  });
  document.addEventListener("focusin", (event) => {
    let element = event.target.closest(".login-enter");
    while (element) {
      clearEntrance(element);
      element = element.parentElement?.closest(".login-enter");
    }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) entrances.forEach(clearEntrance);
  });
})();
