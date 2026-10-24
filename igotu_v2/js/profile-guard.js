import { supabase, clearStoredAuthSession } from "./supabaseClient.js";
import { readIdentityState } from "./identity-access.js";

let decision;
export async function logoutAccount() {
  localStorage.removeItem("igotu_user");
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) await clearStoredAuthSession();
  } catch {
    await clearStoredAuthSession();
  }
  window.location.replace("../login.html");
}
function displayBlocked(message) {
  document.body.dataset.accessState = "blocked";
  const box = document.getElementById("workspaceAccessMessage");
  if (!box) return;
  box.replaceChildren();
  const text = document.createElement("p");
  text.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => window.location.reload());
  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Log out";
  logout.addEventListener("click", () =>
    logoutAccount().catch(() => {
      text.textContent = "Sign-out could not be completed. Please try again.";
    }),
  );
  box.append(text, retry, logout);
}
async function checkAccess() {
  const expectedRole = window.location.pathname.split("/").slice(-2, -1)[0];
  if (!["client", "provider", "admin"].includes(expectedRole))
    return { allowed: true };
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      window.location.replace("../login.html");
      return { allowed: false };
    }
    const { data: profile, error } = await supabase
      .from("users")
      .select(
        "id,user_code,full_name,email,phone,role,status,profile_completed,identity_verified,identity_verified_at,identity_verified_by",
      )
      .eq("id", sessionData.session.user.id)
      .single();
    if (error || !profile) throw new Error("Unable to load your account.");
    if (profile.role !== expectedRole || profile.status !== "active") {
      await logoutAccount();
      return { allowed: false };
    }
    if (expectedRole === "admin") return { allowed: true, profile };
    const identity = await readIdentityState(profile);
    const file = window.location.pathname.split("/").pop();
    if (file !== "verification.html") {
      const target = !identity.approved
        ? "verification.html"
        : profile.profile_completed !== true
          ? "complete-profile.html"
          : null;
      if (target && file !== target) {
        window.location.replace(target);
        return { allowed: false };
      }
      if (
        file === "complete-profile.html" &&
        profile.profile_completed === true
      ) {
        window.location.replace("dashboard.html");
        return { allowed: false };
      }
    }
    return { allowed: true, profile, identity, user: sessionData.session.user };
  } catch {
    displayBlocked(
      "Account access could not be checked. Your workspace remains locked until approval can be confirmed.",
    );
    return { allowed: false };
  }
}
export function authorizeWorkspace() {
  if (!decision)
    decision = checkAccess().then((result) => {
      if (result.allowed) document.body.dataset.accessState = "allowed";
      return result;
    });
  return decision;
}
// All page initializers await this same promise. Redirects are not the data boundary.
void authorizeWorkspace();
