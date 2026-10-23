/* Public presentation only. Does not import authentication or access service data. */
(() => {
  const header = document.querySelector(".site-header");
  const menu = document.querySelector(".menu-toggle");
  const navigation = document.querySelector("#site-navigation");
  const mobile = window.matchMedia("(max-width: 850px)");
  let lastFocused = document.activeElement;

  document.addEventListener("focusin", (event) => {
    lastFocused = event.target;
  });
  document.addEventListener("pointerdown", (event) => {
    lastFocused = event.target;
  });

  function setMenu(open) {
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

  if ("IntersectionObserver" in window) {
    const links = [...document.querySelectorAll(".nav-links a")];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          links.forEach((link) => {
            if (link.hash === `#${entry.target.id}`)
              link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        }
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: 0 },
    );
    document
      .querySelectorAll(".section-anchor")
      .forEach((section) => observer.observe(section));
  }
})();
