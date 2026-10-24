import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

function showMessage(message, type = "error") {
  const box = document.getElementById("messageBox");
  if (!box) return;

  box.textContent = message;
  box.className = `message-box ${type}`;
}

function clearMessage() {
  const box = document.getElementById("messageBox");
  if (!box) return;

  box.textContent = "";
  box.className = "message-box hidden";
}

function setSaving(isSaving) {
  const button = document.getElementById("saveProfileBtn");
  if (!button) return;

  button.disabled = isSaving;
  button.textContent = isSaving ? "Saving..." : "Save Changes";
}

function displayProfile(profile) {
  const fullName = profile.full_name || "Client";
  const firstLetter = fullName.charAt(0).toUpperCase();

  document.getElementById("userName").textContent = fullName;
  document.getElementById("userRole").textContent = `Client · ${profile.user_code}`;
  document.getElementById("avatar").textContent = firstLetter;

  document.getElementById("editProfileAvatar").textContent = firstLetter;
  document.getElementById("editProfileDisplayName").textContent = fullName;

  document.getElementById("fullName").value = fullName;
  document.getElementById("phone").value = profile.phone || "";

  document.getElementById("accountEmail").textContent = profile.email || "-";
  document.getElementById("accountUserCode").textContent = profile.user_code || "-";
  document.getElementById("accountStatus").textContent =
    profile.status === "active" ? "Active" : profile.status || "-";
}

async function getCurrentClientProfile() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "../login.html";
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, phone, role, status, profile_completed")
    .eq("id", sessionData.session.user.id)
    .single();

  if (error || !data) {
    console.error("Edit profile load error:", error);
    showMessage("Unable to load your profile. Please try again.");
    return null;
  }

  if (data.role !== "client" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  if (data.profile_completed !== true) {
    window.location.href = "complete-profile.html";
    return null;
  }

  return data;
}

async function saveProfile(event) {
  event.preventDefault();
  clearMessage();

  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();

  if (!fullName || !phone) {
    showMessage("Please enter your full name and phone number.");
    return;
  }

  if (phone.replace(/[^0-9+]/g, "").length < 7) {
    showMessage("Please enter a valid phone number.");
    return;
  }

  setSaving(true);

  const { data, error } = await supabase.rpc("complete_basic_profile", {
    p_full_name: fullName,
    p_phone: phone,
  });

  if (error) {
    console.error("Edit profile save error:", error);
    showMessage(error.message || "Unable to save your profile.");
    setSaving(false);
    return;
  }

  const updatedProfile = Array.isArray(data) ? data[0] : data;

  if (updatedProfile) {
    localStorage.setItem("igotu_user", JSON.stringify(updatedProfile));
    displayProfile(updatedProfile);
  } else {
    const refreshedProfile = await getCurrentClientProfile();

    if (refreshedProfile) {
      localStorage.setItem("igotu_user", JSON.stringify(refreshedProfile));
      displayProfile(refreshedProfile);
    }
  }

  showMessage("Profile updated successfully.", "success");
  setSaving(false);
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
  const profile = await getCurrentClientProfile();
  if (!profile) return;

  displayProfile(profile);

  const form = document.getElementById("editProfileForm");

  if (form) {
    form.addEventListener("submit", saveProfile);
  }
});
