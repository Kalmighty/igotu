/* Optional registration presentation. No SDK, network, persistence or signup logic. */
(() => {
  const form = document.getElementById("registerForm");
  const role = document.getElementById("role");
  const submit = document.getElementById("registerBtn");
  if (!form || !role || !submit) return;
  const choices = [...document.querySelectorAll("[data-account-choice]")];
  const topChoices = [...document.querySelectorAll("[data-register-role]")];
  function syncChoices() {
    choices.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.accountChoice === role.value),
      ),
    );
  }
  choices.forEach((button) =>
    button.addEventListener("click", () => {
      const value = button.dataset.accountChoice;
      if (submit.disabled || !["client", "provider"].includes(value)) return;
      role.value = value;
      // The original auth-roles.js handles the same canonical field and guidance.
      role.dispatchEvent(new Event("change", { bubbles: true }));
    }),
  );
  role.addEventListener("change", syncChoices);
  form.addEventListener("reset", () => setTimeout(syncChoices, 0));
  syncChoices();

  const passwords = {
    password: document.getElementById("password"),
    confirmPassword: document.getElementById("confirmPassword"),
  };
  const toggles = [...document.querySelectorAll("[data-password-target]")];
  function maskPasswords() {
    toggles.forEach((button) => {
      const key = button.dataset.passwordTarget;
      if (!Object.hasOwn(passwords, key) || !passwords[key]) return;
      passwords[key].type = "password";
      button.setAttribute("aria-pressed", "false");
      button.setAttribute(
        "aria-label",
        `Show ${key === "confirmPassword" ? "confirmation " : ""}password`,
      );
    });
  }
  toggles.forEach((button) => {
    const key = button.dataset.passwordTarget;
    if (!Object.hasOwn(passwords, key) || !passwords[key]) return;
    button.hidden = false;
    button.addEventListener("click", () => {
      const show = passwords[key].type === "password";
      passwords[key].type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      button.setAttribute(
        "aria-label",
        `${show ? "Hide" : "Show"} ${key === "confirmPassword" ? "confirmation " : ""}password`,
      );
    });
  });
  [...choices, ...topChoices].forEach((button) =>
    button.addEventListener("click", maskPasswords),
  );
  role.addEventListener("change", maskPasswords);
  form.addEventListener("submit", maskPasswords);
  window.addEventListener("blur", maskPasswords);
  window.addEventListener("pagehide", maskPasswords);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) maskPasswords();
  });

  // Native required/email validation remains authoritative; no custom validity,
  // password policy, prevented submit, retries or additional request is introduced.
  for (const [id, label] of [
    ["fullName", "your full name"],
    ["email", "an email address"],
    ["role", "Client or Provider"],
  ]) {
    const field = document.getElementById(id),
      error = document.getElementById(`${id}Error`);
    if (!field || !error) continue;
    const descriptions = new Set(
      (field.getAttribute("aria-describedby") || "").split(" ").filter(Boolean),
    );
    descriptions.add(error.id);
    field.setAttribute("aria-describedby", [...descriptions].join(" "));
    function update(show) {
      const invalid = !field.validity.valid;
      if (!invalid) {
        field.removeAttribute("aria-invalid");
        error.textContent = "";
        return;
      }
      if (show) {
        field.setAttribute("aria-invalid", "true");
        error.textContent = field.validity.typeMismatch
          ? "Enter a valid email address."
          : `Please ${id === "role" ? "choose" : "enter"} ${label}.`;
      }
    }
    field.addEventListener("invalid", () => update(true));
    field.addEventListener("blur", () => update(true));
    field.addEventListener("input", () =>
      update(field.hasAttribute("aria-invalid")),
    );
    field.addEventListener("change", () =>
      update(field.hasAttribute("aria-invalid")),
    );
  }
  const message = document.getElementById("messageBox"),
    next = document.getElementById("signupNextSteps");
  function reflectSubmission() {
    // Observe the shipped Auth module's actual button state; never submit or retry.
    const busy =
      submit.disabled && submit.textContent.trim() === "Creating account...";
    form.setAttribute("aria-busy", String(busy));
    [...choices, ...topChoices].forEach((button) => {
      button.disabled = submit.disabled;
    });
    role.disabled = submit.disabled;
    toggles.forEach((button) => {
      button.disabled = busy;
    });
    if (next) next.hidden = !message?.classList.contains("success");
  }
  new MutationObserver(reflectSubmission).observe(submit, {
    attributes: true,
    attributeFilter: ["disabled"],
    childList: true,
    subtree: true,
  });
  if (message)
    new MutationObserver(reflectSubmission).observe(message, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  reflectSubmission();
  document.body.classList.add("register-enhanced");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const entrances = [
    ...document.querySelectorAll(
      ".auth-header,.auth-page-heading,[data-register-role],.admin-access-note,.registration-panel,.registration-info",
    ),
  ];
  function clear(element) {
    element.classList.remove("register-enter");
  }
  if (!reduced.matches)
    entrances.forEach((element, index) => {
      if (element.contains(document.activeElement)) return;
      element.style.setProperty(
        "--register-delay",
        `${Math.min(index, 3) * 70}ms`,
      );
      element.classList.add("register-enter");
    });
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "register-enter") clear(event.target);
  });
  document.addEventListener("focusin", (event) => {
    let node = event.target.closest(".register-enter");
    while (node) {
      clear(node);
      node = node.parentElement?.closest(".register-enter");
    }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) entrances.forEach(clear);
  });
})();
