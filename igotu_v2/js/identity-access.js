import { supabase } from "./supabaseClient.js";

// Both fields and an actual reviewed request are required. Legacy badges alone
// do not grandfather an account into mandatory approval.
export function isIdentityApproved(profile, request) {
  return (
    profile?.identity_verified === true &&
    request?.status === "approved" &&
    request.role === profile.role &&
    !!request.reviewed_at &&
    !!request.reviewed_by &&
    !!profile.identity_verified_at &&
    profile.identity_verified_by === request.reviewed_by
  );
}
export async function readIdentityState(profile) {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("id,role,status,submitted_at,reviewed_at,reviewed_by")
    .eq("user_id", profile.id)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error)
    throw new Error("Unable to check identity approval. Please try again.");
  const request = data?.[0] || null;
  return {
    request,
    approved: isIdentityApproved(profile, request),
    status: request?.status || "not_submitted",
  };
}
export async function accountDestination(profile) {
  const role = String(profile?.role || "")
    .trim()
    .toLowerCase();
  if (profile?.status !== "active")
    throw new Error("Your account is not active.");
  if (role === "admin") return "admin/dashboard.html";
  if (!["client", "provider"].includes(role))
    throw new Error("Account role is not supported.");
  const identity = await readIdentityState(profile);
  return `${role}/${!identity.approved ? "verification.html" : profile.profile_completed === true ? "dashboard.html" : "complete-profile.html"}`;
}
