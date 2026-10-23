import { supabase } from "./supabaseClient.js";

async function enforceProfileOnboarding() {
  const path = window.location.pathname.toLowerCase();
  const expectedRole = path.includes("/client/")
    ? "client"
    : path.includes("/provider/")
      ? "provider"
      : null;

  if (!expectedRole) return;

  const isCompleteProfilePage = path.endsWith("/complete-profile.html");

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.replace("../login.html");
    return;
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, role, status, profile_completed")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    console.error("Onboarding guard profile error:", error);
    return;
  }

  if (String(profile.role).toLowerCase() !== expectedRole || profile.status !== "active") {
    await supabase.auth.signOut();
    window.location.replace("../login.html");
    return;
  }

  if (profile.profile_completed !== true && !isCompleteProfilePage) {
    window.location.replace("complete-profile.html");
    return;
  }

  if (profile.profile_completed === true && isCompleteProfilePage) {
    window.location.replace("dashboard.html");
  }
}

enforceProfileOnboarding();
