import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

function ensureVerificationLink() {
  const dropdown = document.getElementById("profileDropdown");
  if (!dropdown || dropdown.querySelector('a[href="verification.html"]')) return;

  const logoutButton = document.getElementById("profileLogoutBtn");
  const link = document.createElement("a");
  link.href = "verification.html";
  link.className = "profile-dropdown-item";
  link.innerHTML = '<span class="profile-dropdown-icon">🛡</span><span>Identity Verification</span>';

  if (logoutButton) dropdown.insertBefore(link, logoutButton);
  else dropdown.appendChild(link);
}

function closeProfileMenu() {
  const trigger = document.getElementById("profileMenuTrigger");
  const dropdown = document.getElementById("profileDropdown");

  if (!trigger || !dropdown) return;

  dropdown.classList.add("hidden");
  trigger.classList.remove("open");
  trigger.setAttribute("aria-expanded", "false");
}

function toggleProfileMenu(event) {
  event.stopPropagation();

  const trigger = document.getElementById("profileMenuTrigger");
  const dropdown = document.getElementById("profileDropdown");

  if (!trigger || !dropdown) return;

  const willOpen = dropdown.classList.contains("hidden");

  dropdown.classList.toggle("hidden", !willOpen);
  trigger.classList.toggle("open", willOpen);
  trigger.setAttribute("aria-expanded", String(willOpen));
}

async function logoutFromProfileMenu() {
  const button = document.getElementById("profileLogoutBtn");

  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="profile-dropdown-icon">↪</span><span>Logging out...</span>';
  }

  localStorage.removeItem("igotu_user");
  await supabase.auth.signOut();
  window.location.href = "../login.html";
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
  ensureVerificationLink();
  const trigger = document.getElementById("profileMenuTrigger");
  const dropdown = document.getElementById("profileDropdown");
  const logoutButton = document.getElementById("profileLogoutBtn");

  if (!trigger || !dropdown) return;

  trigger.addEventListener("click", toggleProfileMenu);

  dropdown.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", logoutFromProfileMenu);
  }

  document.addEventListener("click", closeProfileMenu);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeProfileMenu();
      trigger.focus();
    }
  });
});
