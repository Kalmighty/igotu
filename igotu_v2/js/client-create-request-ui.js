/* Optional presentation only: no SDK, network, storage or request submission. */
(() => {
  let initialized = false;
  function setup() {
    const form = document.getElementById("createRequestForm");
    if (initialized || form?.dataset.ready !== "true") return;
    initialized = true;
    const description = document.getElementById("description"),
      count = document.getElementById("descriptionCount");
    const updateCount = () => {
      count.textContent = `${description.value.length} characters`;
    };
    description.addEventListener("input", updateCount);
    updateCount();
    form
      .querySelectorAll(
        'input:not([type="hidden"]):not([type="file"]),select,textarea',
      )
      .forEach((field) => {
        const error = document.createElement("small");
        error.id = field.id + "Validation";
        error.className = "request-field-error";
        error.setAttribute("aria-live", "polite");
        field.closest(".form-group")?.append(error);
        field.setAttribute(
          "aria-describedby",
          [field.getAttribute("aria-describedby"), error.id]
            .filter(Boolean)
            .join(" "),
        );
        function validate(show) {
          if (field.validity.valid) {
            field.removeAttribute("aria-invalid");
            error.textContent = "";
          } else if (show) {
            field.setAttribute("aria-invalid", "true");
            error.textContent = field.validity.valueMissing
              ? "Please complete this field."
              : "Please check this value.";
          }
        }
        field.addEventListener("invalid", () => validate(true));
        field.addEventListener("input", () =>
          validate(field.hasAttribute("aria-invalid")),
        );
        field.addEventListener("change", () =>
          validate(field.hasAttribute("aria-invalid")),
        );
      });
    const button = document.getElementById("createRequestBtn"),
      message = document.getElementById("messageBox"),
      cancel = document.getElementById("cancelRequestBtn");
    function busy() {
      const saving =
        button.disabled &&
        [
          "Creating request...",
          "Saving changes...",
          "Uploading image...",
        ].includes(button.textContent.trim()) &&
        !message.classList.contains("success");
      form.dataset.saving = String(saving);
      form.setAttribute("aria-busy", String(saving));
      cancel.setAttribute("aria-disabled", String(button.disabled));
    }
    const observer = new MutationObserver(busy);
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
    busy();
    const snapshot = () =>
      JSON.stringify(
        [...form.querySelectorAll("input,select,textarea")].map((e) => [
          e.id,
          e.value,
          e.type === "file"
            ? [...e.files].map((f) => [f.name, f.size, f.type])
            : null,
        ]),
      );
    const original = snapshot();
    const dialog = document.getElementById("requestCancelDialog"),
      stay = document.getElementById("requestCancelStay"),
      leave = document.getElementById("requestCancelLeave");
    cancel.addEventListener("click", (event) => {
      if (button.disabled) {
        event.preventDefault();
        return;
      }
      if (snapshot() !== original && typeof dialog.showModal === "function") {
        event.preventDefault();
        leave.href = cancel.href;
        dialog.showModal();
        stay.focus();
      }
    });
    stay.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => cancel.focus());
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const items = [stay, leave];
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[1].focus();
      } else if (!event.shiftKey && document.activeElement === items[1]) {
        event.preventDefault();
        items[0].focus();
      }
    });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const items = [
      ...document.querySelectorAll(
        ".request-page-heading,.request-section,.request-guidance > .panel",
      ),
    ];
    if (!reduced.matches)
      items.forEach((e, i) => {
        if (e.contains(document.activeElement)) return;
        e.style.setProperty("--request-delay", `${Math.min(i, 3) * 70}ms`);
        e.classList.add("request-enter");
      });
    const clear = (e) => e.classList.remove("request-enter");
    document.addEventListener("animationend", (event) => {
      if (event.animationName === "request-enter") clear(event.target);
    });
    document.addEventListener("focusin", (event) => {
      let e = event.target.closest(".request-enter");
      while (e) {
        clear(e);
        e = e.parentElement?.closest(".request-enter");
      }
    });
    reduced.addEventListener("change", () => {
      if (reduced.matches) items.forEach(clear);
    });
  }
  document.addEventListener("igotu:request-ready", setup);
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
