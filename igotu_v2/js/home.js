/* Public presentation only. Does not import authentication or access service data. */
(() => {
  const header = document.querySelector(".site-header");
  const menu = document.querySelector(".menu-toggle");
  const navigation = document.querySelector("#site-navigation");
  const mobile = window.matchMedia("(max-width: 850px)");
  let lastFocused = document.activeElement;
  let navigationInitialized = false;

  document.addEventListener("focusin", (event) => {
    lastFocused = event.target;
  });
  document.addEventListener("pointerdown", (event) => {
    lastFocused = event.target;
  });

  function setMenu(open) {
    if (navigationInitialized) header.classList.add("nav-animated");
    // Hide closing-menu links from focus immediately; the visual fade is optional.
    navigation.inert = mobile.matches && !open;
    header.classList.toggle("nav-open", open);
    menu.setAttribute("aria-expanded", String(!mobile.matches || open));
    menu.querySelector("span").textContent =
      open && mobile.matches ? "Close" : "Menu";
  }
  menu.addEventListener("click", () =>
    setMenu(!header.classList.contains("nav-open")),
  );
  header.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      mobile.matches &&
      header.classList.contains("nav-open")
    ) {
      setMenu(false);
      menu.focus();
    }
  });
  navigation.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !mobile.matches) return;
    setMenu(false);
    if (link.hash) {
      const target = document.querySelector(link.hash);
      if (target) {
        // Move focus from the collapsed disclosure to the section being opened.
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    }
  });
  document.addEventListener("click", (event) => {
    if (
      mobile.matches &&
      header.classList.contains("nav-open") &&
      !header.contains(event.target)
    )
      setMenu(false);
  });
  mobile.addEventListener("change", () => {
    if (mobile.matches && navigation.contains(lastFocused)) menu.focus();
    setMenu(false);
  });
  setMenu(false);
  header.classList.add("nav-ready");
  document.documentElement.classList.remove("nav-pending");
  navigationInitialized = true;

  // Homepage-only category discovery. This navigates to static service tiles,
  // never searches for Providers or sends data to the backend.
  const explorer = document.querySelector(".service-explorer");
  if (explorer) {
    const categorySelect = explorer.querySelector("#service-explorer-category");
    const exploreButton = explorer.querySelector("#service-explorer-go");
    categorySelect.addEventListener("change", () => {
      exploreButton.disabled = !categorySelect.value;
    });
    exploreButton.addEventListener("click", () => {
      const target = document.getElementById(`service-${categorySelect.value}`);
      if (!target) return;
      window.location.hash = target.id;
      target.focus({ preventScroll: true });
    });
    explorer.classList.add("is-ready");
  }

  const criteria = {
    skills: {
      title: "The right skills for your request.",
      description:
        "Your service category and specialization help identify Providers who offer the kind of help you need.",
      icon: "repair",
    },
    availability: {
      title: "Help that fits your preferred time.",
      description:
        "Provider availability and working hours help shape your recommendations. Your selected Provider still needs to confirm the assignment.",
      icon: "clock",
    },
    distance: {
      title: "A clearer picture of who’s nearby.",
      description:
        "Distance from your service location helps you compare suitable Providers. Choose from your recommendations with location in mind.",
      icon: "location",
    },
  };
  const criteriaButtons = document.querySelectorAll("[data-criterion]");
  criteriaButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const criterion = criteria[button.dataset.criterion];
      criteriaButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      document.querySelector("#criterion-title").textContent = criterion.title;
      document.querySelector("#criterion-description").textContent =
        criterion.description;
      document
        .querySelector("#criterion-icon use")
        .setAttribute("href", `#i-${criterion.icon}`);
    });
  });
  // These are examples, not a functioning matching engine. Without JS all criteria
  // remain explained in the service process and benefits sections.
  document
    .querySelector(".matching-explainer")
    .classList.add("explainer-ready");

  // Pick the last navigation section above the sticky header. Several sections
  // can be visible at once on this compact homepage; observer entry order is
  // not evidence of which navigation item should be current.
  const links = [...document.querySelectorAll(".nav-links a")];
  const sections = links
    .map((link) => document.querySelector(link.hash))
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  let scheduled = false;
  function updateCurrentSection() {
    const boundary = header.getBoundingClientRect().height + 80;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= boundary) current = section;
    }
    // On a short desktop page, a clicked section cannot always reach the top.
    // Keep its link current while the explicitly selected section is visible.
    const selected = sections.find(
      (section) => `#${section.id}` === location.hash,
    );
    if (selected) {
      const rect = selected.getBoundingClientRect();
      if (rect.top < innerHeight && rect.bottom > boundary) current = selected;
    }
    links.forEach((link) => {
      if (link.hash === `#${current.id}`)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    scheduled = false;
  }
  function scheduleCurrentSection() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateCurrentSection);
  }
  window.addEventListener("scroll", scheduleCurrentSection, { passive: true });
  window.addEventListener("resize", scheduleCurrentSection);
  window.addEventListener("hashchange", scheduleCurrentSection);
  updateCurrentSection();
  // Progressive motion: observe visible elements without hiding offscreen content.
  // If JS/IntersectionObserver fails, the page stays readable. Every animation is
  // finite and finishes visibly even if subsequent JS stops executing.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealed = new WeakSet();
  let revealObserver;
  const revealGroups = [
    ".hero-copy > :not(.hero-actions)",
    ".hero-actions > a",
    ".floating-service",
    ".hero-photo",
    ".page-content .heading-with-icon",
    ".idea-card",
    ".category-card",
    ".sample-card",
    ".steps > li",
    ".benefit",
    ".cta-copy > *",
    ".cta-actions > *",
  ];
  function clearEntrance(element) {
    element.classList.remove("reveal-enter");
    element.style.removeProperty("--reveal-delay");
  }
  function configureReveals() {
    revealObserver?.disconnect();
    document.querySelectorAll(".reveal-enter").forEach(clearEntrance);
    if (
      reducedMotion.matches ||
      typeof window.IntersectionObserver !== "function"
    )
      return;
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target;
          revealObserver.unobserve(element);
          revealed.add(element);
          // Focused links must remain immediately readable and operable.
          if (!element.contains(document.activeElement))
            element.classList.add("reveal-enter");
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -16px 0px" },
    );
    for (const selector of revealGroups) {
      document.querySelectorAll(selector).forEach((element, index) => {
        if (revealed.has(element)) return;
        // Cap the stagger: never make people wait through a long row of cards.
        element.style.setProperty(
          "--reveal-delay",
          `${Math.min(210, (selector === ".hero-actions > a" ? 140 : 0) + index * 70)}ms`,
        );
        revealObserver.observe(element);
      });
    }
  }
  document.addEventListener("animationend", (event) => {
    if (["igotu-enter", "igotu-photo"].includes(event.animationName))
      clearEntrance(event.target);
  });
  document.addEventListener("focusin", (event) => {
    let element = event.target.closest(".reveal-enter");
    while (element) {
      clearEntrance(element);
      element = element.parentElement?.closest(".reveal-enter");
    }
  });
  reducedMotion.addEventListener("change", configureReveals);
  configureReveals();
})();
