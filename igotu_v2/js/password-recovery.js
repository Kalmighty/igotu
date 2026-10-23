import { supabase } from "./supabaseClient.js";

const page = document.body.dataset.page;

function showMessage(message, type = "error") {
  const box = document.getElementById("messageBox");
  if (!box) return;
  box.textContent = message;
  box.className = `message-box ${type}`;
}

function setLoading(button, loading, loadingText, normalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function setupForgotPassword() {
  const form = document.getElementById("forgotPasswordForm");
  const button = document.getElementById("forgotPasswordBtn");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();

    if (!email) {
      showMessage("Please enter your email address.");
      return;
    }

    setLoading(button, true, "Sending...", "Send Reset Link");

    const redirectTo = new URL("reset-password.html", window.location.href).href;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      console.error("Password reset email error:", error);
      showMessage(error.message || "Unable to send password reset email.");
      setLoading(button, false, "Sending...", "Send Reset Link");
      return;
    }

    showMessage("If that email belongs to an IGotU account, a password reset link has been sent.", "success");
    form.reset();
    setLoading(button, false, "Sending...", "Send Reset Link");
  });
}

async function setupResetPassword() {
  const form = document.getElementById("resetPasswordForm");
  const button = document.getElementById("resetPasswordBtn");
  if (!form) return;

  let hasRecoverySession = false;

  const { data } = await supabase.auth.getSession();
  if (data.session) hasRecoverySession = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || session) {
      hasRecoverySession = true;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!hasRecoverySession) {
      showMessage("Please open this page using the password reset link sent to your email.");
      return;
    }

    if (password.length < 6) {
      showMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Password and confirm password do not match.");
      return;
    }

    setLoading(button, true, "Updating...", "Update Password");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("Password update error:", error);
      showMessage(error.message || "Unable to update password.");
      setLoading(button, false, "Updating...", "Update Password");
      return;
    }

    showMessage("Password updated successfully. Redirecting to login...", "success");
    await supabase.auth.signOut();

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (page === "forgot-password") setupForgotPassword();
  if (page === "reset-password") setupResetPassword();
});
