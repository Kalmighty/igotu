import { supabase, clearStoredAuthSession } from "./supabaseClient.js";
const page = document.body.dataset.page;
function showMessage(message, type = "error") {
  const box = document.getElementById("messageBox");
  if (box) { box.textContent = message; box.className = `message-box ${type}`; }
}
function setLoading(button, loading, loadingText, normalText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}
function setupForgotPassword() {
  const form = document.getElementById("forgotPasswordForm");
  const button = document.getElementById("forgotPasswordBtn");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled) return;
    const email = document.getElementById("email").value.trim();
    if (!email) { showMessage("Please enter your email address."); return; }
    setLoading(button, true, "Sending...", "Send Reset Link");
    try {
      const redirectTo = new URL("reset-password.html", window.location.href).href;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      showMessage("If that email belongs to an IGotU account, a password reset link has been sent.", "success");
      form.reset();
    } catch {
      showMessage("Unable to send the reset link. Please try again.");
    } finally { setLoading(button, false, "", "Send Reset Link"); }
  });
}
function setupResetPassword() {
  const form = document.getElementById("resetPasswordForm");
  const button = document.getElementById("resetPasswordBtn");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled) return;
    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (password.length < 6) { showMessage("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { showMessage("Password and confirm password do not match."); return; }
    setLoading(button, true, "Updating...", "Update Password");
    let updated = false;
    try {
      // Check the current session on each attempt, rather than retaining a true
      // flag after another tab signs out or the recovery session expires.
      const session = await supabase.auth.getSession();
      if (session.error || !session.data?.session) {
        showMessage("Please open this page using the password reset link sent to your email.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      updated = true;
      localStorage.removeItem("igotu_user");
      try {
        const result = await supabase.auth.signOut({ scope: "local" });
        if (result.error) await clearStoredAuthSession();
      } catch { await clearStoredAuthSession(); }
      showMessage("Password updated successfully. Redirecting to login...", "success");
      setTimeout(() => window.location.replace("login.html"), 1200);
    } catch {
      showMessage(updated
        ? "Password updated, but sign-out could not be confirmed. Log out before continuing."
        : "Unable to update your password. Reopen your reset link or try again.");
    } finally { if (!updated) setLoading(button, false, "", "Update Password"); }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  if (page === "forgot-password") setupForgotPassword();
  if (page === "reset-password") setupResetPassword();
});
