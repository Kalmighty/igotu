/* Cards select a login section. auth.js checks it against the database role;
   this selection never grants access or changes the account role. */
(() => {
  const isLogin = document.body.dataset.page === "login";
  const title = document.getElementById("authFormTitle");
  const hint = document.getElementById("authFormHint");
  if (isLogin) {
    const copy = {
      client: [
        "Client Login",
        "Sign in to create requests, compare recommendations and manage your services.",
      ],
      provider: [
        "Provider Login",
        "Sign in to manage your skills, availability and assigned services.",
      ],
      admin: [
        "Admin Login",
        "Sign in with your existing authorized administrative account.",
      ],
    };
    const buttons = document.querySelectorAll("[data-login-role]");
    function select(role) {
      // Allowlisted URL input preselects the section only. auth.js separately
      // checks the authenticated database role; this value grants no access.
      const chosen = Object.hasOwn(copy, role) ? role : "client";
      buttons.forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.loginRole === chosen),
        ),
      );
      title.textContent = copy[chosen][0];
      hint.textContent = copy[chosen][1];
    }
    buttons.forEach((button) =>
      button.addEventListener("click", () => select(button.dataset.loginRole)),
    );
    select(new URLSearchParams(window.location.search).get("role"));
  } else {
    const roleField = document.getElementById("role");
    const buttons = document.querySelectorAll("[data-register-role]");
    function syncRegistration() {
      const role = roleField.value;
      const label =
        role === "client" ? "Client" : role === "provider" ? "Provider" : null;
      buttons.forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.registerRole === role),
        ),
      );
      title.textContent = label ? `Join as a ${label}` : "Create Account";
      hint.textContent = label
        ? `You’re registering as a ${label}. Enter your details below.`
        : "Choose Client or Provider and enter your details below.";
    }
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        // Keep the original required select as the source read by registration.
        roleField.value = button.dataset.registerRole;
        roleField.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    );
    roleField.addEventListener("change", syncRegistration);
    document
      .getElementById("registerForm")
      .addEventListener("reset", () => setTimeout(syncRegistration, 0));
    syncRegistration();
  }
  document.body.classList.add("auth-roles-ready");
})();
