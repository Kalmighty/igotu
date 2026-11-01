/* Optional UI only: no SDK, requests, tokens, storage or recovery decisions. */
(() => {
  const form =
    document.getElementById("forgotPasswordForm") ||
    document.getElementById("resetPasswordForm");
  const button =
    document.getElementById("forgotPasswordBtn") ||
    document.getElementById("resetPasswordBtn");
  const message = document.getElementById("messageBox");
  if (!form || !button || !message) return;
  const reset = form.id === "resetPasswordForm";
  const fields = {
    newPassword: document.getElementById("newPassword"),
    confirmPassword: document.getElementById("confirmPassword"),
  };
  const toggles = [...document.querySelectorAll("[data-recovery-password]")];
  function mask() {
    toggles.forEach((toggle) => {
      const id = toggle.dataset.recoveryPassword;
      if (!Object.hasOwn(fields, id) || !fields[id]) return;
      fields[id].type = "password";
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute(
        "aria-label",
        `Show ${id === "confirmPassword" ? "confirmation " : ""}password`,
      );
    });
  }
  toggles.forEach((toggle) => {
    const id = toggle.dataset.recoveryPassword;
    if (!Object.hasOwn(fields, id) || !fields[id]) return;
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      const show = fields[id].type === "password";
      fields[id].type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute(
        "aria-label",
        `${show ? "Hide" : "Show"} ${id === "confirmPassword" ? "confirmation " : ""}password`,
      );
    });
  });
  form.addEventListener("submit", mask);
  form.addEventListener("reset", mask);
  window.addEventListener("blur", mask);
  window.addEventListener("pagehide", mask);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) mask();
  });
  form.querySelectorAll("input").forEach((field) => {
    const error = document.getElementById(`${field.id}Error`);
    if (!error) return;
    function update(show) {
      if (field.validity.valid) {
        field.removeAttribute("aria-invalid");
        error.textContent = "";
      } else if (show) {
        field.setAttribute("aria-invalid", "true");
        error.textContent = field.validity.valueMissing
          ? field.id === "email"
            ? "Please enter your email address."
            : "Please enter this password."
          : field.validity.typeMismatch
            ? "Enter a valid email address."
            : "Use at least 6 characters.";
      }
    }
    field.addEventListener("invalid", () => update(true));
    field.addEventListener("blur", () => update(true));
    field.addEventListener("input", () =>
      update(field.hasAttribute("aria-invalid")),
    );
    form.addEventListener("reset", () => {
      field.removeAttribute("aria-invalid");
      error.textContent = "";
    });
  });
  const nextTitle = document.getElementById("recoveryNextTitle");
  const nextText = document.getElementById("recoveryNextText");
  let wasDisabled = button.disabled,
    pending = false;
  function reflect(records = []) {
    const disabled = button.disabled;
    if (!disabled) pending = false;
    else if (!wasDisabled) pending = true;
    const outcomeChanged = records.some(
      (record) => record.target === message || message.contains(record.target),
    );
    if (outcomeChanged) pending = false;
    wasDisabled = disabled;
    form.setAttribute("aria-busy", String(pending));
    toggles.forEach((toggle) => {
      toggle.disabled = disabled;
    });
    if (outcomeChanged && !message.classList.contains("hidden")) {
      const success = message.classList.contains("success");
      nextTitle.textContent = success
        ? reset
          ? "Return to Login"
          : "Check your inbox"
        : "Review the message above";
      nextText.textContent = success
        ? reset
          ? "The password update and local session cleanup completed. You’ll return to Login to sign in again."
          : "The request was accepted. If a recovery email arrives, follow its instructions. Check Spam or Junk; email delivery is not confirmed here."
        : "Follow the guidance above before continuing. You can request a fresh reset link from Forgot Password if needed.";
    }
  }
  const observer = new MutationObserver(reflect);
  observer.observe(button, {
    attributes: true,
    attributeFilter: ["disabled"],
    childList: true,
    subtree: true,
  });
  observer.observe(message, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
  reflect();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const entrances = [
    ...document.querySelectorAll(
      ".recovery-header,.recovery-heading,.recovery-support,.recovery-art,.recovery-form-card",
    ),
  ];
  function clear(element) {
    element.classList.remove("recovery-enter");
  }
  if (!reduced.matches)
    entrances.forEach((element, index) => {
      if (element.contains(document.activeElement)) return;
      element.style.setProperty(
        "--recovery-delay",
        `${Math.min(index, 3) * 70}ms`,
      );
      element.classList.add("recovery-enter");
    });
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "recovery-enter") clear(event.target);
  });
  document.addEventListener("focusin", (event) => {
    let node = event.target.closest(".recovery-enter");
    while (node) {
      clear(node);
      node = node.parentElement?.closest(".recovery-enter");
    }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) entrances.forEach(clear);
  });
})();
