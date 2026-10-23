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

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Saving profile..." : "Complete Profile & Continue";
}

async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.replace("../login.html");
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, phone, role, status, profile_completed")
    .eq("id", sessionData.session.user.id)
    .single();

  if (error || !data) {
    showMessage("Unable to load your profile. Please try again.");
    console.error(error);
    return null;
  }

  if (data.role !== "client" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.replace("../login.html");
    return null;
  }

  return data;
}

async function logout() {
  localStorage.removeItem("igotu_user");
  await supabase.auth.signOut();
  window.location.replace("../login.html");
}

document.addEventListener("DOMContentLoaded", async function () {
  const profile = await getCurrentProfile();
  if (!profile) return;

  if (profile.profile_completed === true) {
    window.location.replace("dashboard.html");
    return;
  }

  document.getElementById("fullName").value = profile.full_name || "";
  document.getElementById("phone").value = profile.phone || "";

  document.getElementById("logoutBtn").addEventListener("click", logout);

  const form = document.getElementById("clientCompleteProfileForm");
  const button = document.getElementById("completeProfileBtn");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();

    const fullName = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!fullName || !phone) {
      showMessage("Please complete your full name and phone number.");
      return;
    }

    setLoading(button, true);

    const { data, error } = await supabase.rpc("complete_basic_profile", {
      p_full_name: fullName,
      p_phone: phone,
    });

    if (error) {
      console.error("Complete client profile error:", error);
      showMessage(error.message || "Failed to complete your profile.");
      setLoading(button, false);
      return;
    }

    const updatedProfile = Array.isArray(data) ? data[0] : data;
    if (updatedProfile) {
      localStorage.setItem("igotu_user", JSON.stringify(updatedProfile));
    }

    showMessage("Profile completed successfully. Redirecting to your dashboard...", "success");
    setTimeout(() => window.location.replace("dashboard.html"), 700);
  });
});
