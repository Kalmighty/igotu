import {
  requireBackendContract,
  BackendContractError,
} from "./backend-access.js";
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
  box.setAttribute("role", "main");
  box.setAttribute("aria-live", "polite");
  box.setAttribute("aria-labelledby", "workspaceAccessTitle");
  const title = document.createElement("h1");
  title.id = "workspaceAccessTitle";
  title.textContent = "Workspace unavailable";
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
  box.append(title, text, retry, logout);
}
const diagnosticCodes = new Set([
  "BACKEND_CONNECTION",
  "BACKEND_RPC_UNAVAILABLE",
  "BACKEND_PERMISSION",
  "BACKEND_AUTH",
  "BACKEND_UNAVAILABLE",
  "BACKEND_VERSION",
  "BACKEND_NOTIFICATIONS",
  "SESSION_INVALID",
  "SESSION_CHECK",
  "PROFILE_MISSING",
  "PROFILE_QUERY",
  "CLEANUP_UNCONFIRMED",
  "IDENTITY_CHECK",
]);
function accessFailure(code) {
  const error = new Error("Workspace check failed.");
  error.accessCode = code;
  return error;
}
function blockedMessage(code) {
  if (code === "BACKEND_AUTH" || code === "SESSION_INVALID")
    return "Your sign-in session could not be confirmed. Please log out and log in again.";
  if (code.startsWith("BACKEND_"))
    return "IGotU cannot confirm that the current server supports this version of the application. Please try again later or contact the system administrator.";
  if (code === "PROFILE_MISSING")
    return "Your account profile could not be found. Please contact the system administrator.";
  if (code === "PROFILE_QUERY")
    return "Your account details could not be checked. Please try again or contact the system administrator.";
  if (code === "CLEANUP_UNCONFIRMED")
    return "Sign-out could not be confirmed. Your workspace remains locked. Please try logging out again.";
  if (code === "IDENTITY_CHECK")
    return "Identity approval could not be checked. Your workspace remains locked. Please try again.";
  return "Your sign-in session could not be checked. Please try again or log in again.";
}
async function checkAccess() {
  const expectedRole = window.location.pathname.split("/").slice(-2, -1)[0];
  if (!["client", "provider", "admin"].includes(expectedRole))
    return { allowed: true };
  let stage = "SESSION_CHECK";
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError)
      throw accessFailure(
        [
          "refresh_token_not_found",
          "refresh_token_already_used",
          "session_not_found",
          "bad_jwt",
        ].includes(sessionError.code) || sessionError.status === 401
          ? "SESSION_INVALID"
          : "SESSION_CHECK",
      );
    if (!sessionData?.session) {
      window.location.replace("../login.html");
      return { allowed: false };
    }
    if (!sessionData.session.user?.id) throw accessFailure("SESSION_INVALID");
    stage = "PROFILE_QUERY";
    const { data: profile, error } = await supabase
      .from("users")
      .select(
        "id,user_code,full_name,email,phone,role,status,profile_completed,identity_verified,identity_verified_at,identity_verified_by",
      )
      .eq("id", sessionData.session.user.id)
      .single();
    if (error)
      throw accessFailure(
        error.code === "PGRST116"
          ? "PROFILE_MISSING"
          : error.code === "PGRST301" || error.status === 401
            ? "SESSION_INVALID"
            : "PROFILE_QUERY",
      );
    if (!profile) throw accessFailure("PROFILE_MISSING");
    if (profile.role !== expectedRole || profile.status !== "active") {
      stage = "CLEANUP_UNCONFIRMED";
      await logoutAccount();
      return { allowed: false };
    }
    stage = "BACKEND_UNAVAILABLE";
    await requireBackendContract();
    if (expectedRole === "admin") return { allowed: true, profile };
    stage = "IDENTITY_CHECK";
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
  } catch (error) {
    const candidate =
      error instanceof BackendContractError ? error.code : error?.accessCode;
    const code = diagnosticCodes.has(candidate) ? candidate : stage;
    // Developer diagnostics only on loopback; never log the raw error/profile.
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))
      console.warn("[IGotU workspace check]", code);
    displayBlocked(blockedMessage(code));
    return { allowed: false, reason: code };
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

// SDK sign-out events include cross-tab sign-out and invalidated refresh tokens.
// Keep this callback synchronous: no Auth calls while the SDK holds its lock.
if (
  ["client", "provider", "admin"].includes(
    window.location.pathname.split("/").slice(-2, -1)[0],
  )
) {
  supabase.auth.onAuthStateChange?.((event) => {
    if (event !== "SIGNED_OUT") return;
    try {
      localStorage.removeItem("igotu_user");
    } catch {
      /* still lock the page */
    }
    displayBlocked("You have been signed out. Please log in again.");
    window.location.replace("../login.html");
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
}
