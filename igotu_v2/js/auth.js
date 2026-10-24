import { accountDestination } from "./identity-access.js";
import { supabase, clearStoredAuthSession } from "./supabaseClient.js";

const page = document.body.dataset.page;

function showMessage(message, type = "error") {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
}

function clearMessage() {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.className = "message-box hidden";
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
    if (!button) return;

    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : normalText;
}


async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from("users")
        .select("id, user_code, full_name, email, phone, role, status, profile_completed, identity_verified,identity_verified_at,identity_verified_by")
        .eq("id", userId)
        .single();

    if (error) {
        console.error("Profile fetch error:", error);
        return null;
    }

    return data;
}

async function waitForUserProfile(userId, attempts = 8) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const profile = await getUserProfile(userId);
        if (profile) return profile;
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    return null;
}

async function handleRegister() {
    const registerForm = document.getElementById("registerForm");
    const registerBtn = document.getElementById("registerBtn");

    if (!registerForm) return;

    registerForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        clearMessage();

        const fullName = document.getElementById("fullName").value.trim();
        const email = document.getElementById("email").value.trim();
        const role = document.getElementById("role").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (!fullName || !email || !role || !password || !confirmPassword) {
            showMessage("Please complete all fields.");
            return;
        }

        if (!["client", "provider"].includes(role)) {
            showMessage("Please select a valid role.");
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

        setButtonLoading(registerBtn, true, "Creating account...", "Register");

        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    role: role
                }
            }
        });

        if (error) {
            console.error("Register error:", error);
            showMessage(error.message || "Registration failed. Please try again.");
            setButtonLoading(registerBtn, false, "Creating account...", "Register");
            return;
        }

        if (data.session && data.user) {
            const profile = await waitForUserProfile(data.user.id);

            if (profile) {
                let destination;
                try { destination = await accountDestination(profile); }
                catch { showMessage("Unable to check verification. Please log in again."); setButtonLoading(registerBtn, false, "Creating account...", "Register"); return; }
                localStorage.setItem("igotu_user", JSON.stringify(profile));
                showMessage("Account created. Continue to identity verification...", "success");
                setTimeout(function() {
                    window.location.href = destination;
                }, 700);
                return;
            }
        }

        showMessage("Registration successful. Check your email to confirm your account if required, then log in to submit identity verification.", "success");
        // Keep email-confirmation instructions visible instead of flashing them
        // briefly before a redirect. The existing Login link is the next step.
        registerBtn.disabled = true;
        registerBtn.textContent = "Check your email, then log in";
        const loginLink = document.querySelector('.auth-form-footer a[href="login.html"]');
        if (loginLink) loginLink.href = `login.html?role=${role}`;
    });
}

// The UI role is only a login-consistency check. Only the fetched users row
// determines role, status and the existing redirect/onboarding destination.
const loginRoleLabels = { client: "Client", provider: "Provider", admin: "Admin" };

async function discardRejectedLogin() {
    let signOutFailed = false;
    try {
        // A blocked cache must not prevent an SDK sign-out attempt.
        try { localStorage.removeItem("igotu_user"); } catch { /* verify again below */ }
        try {
            const { error } = await supabase.auth.signOut({ scope: "local" });
            signOutFailed = !!error;
        } catch {
            signOutFailed = true;
        }

        let result;
        try { result = await supabase.auth.getSession(); } catch { /* fall back below */ }
        if (!result || result.error || result.data?.session) {
            await clearStoredAuthSession();
            // Let the SDK clear its own state and notify other tabs. A transport
            // failure here cannot skip the final local-session verification.
            try {
                const { error } = await supabase.auth.signOut({ scope: "local" });
                signOutFailed = signOutFailed || !!error;
            } catch { signOutFailed = true; }
        }

        localStorage.removeItem("igotu_user");
        const { data, error } = await supabase.auth.getSession();
        const cleared = !error && data?.session === null && localStorage.getItem("igotu_user") === null;
        return { cleared, signOutFailed };
    } catch {
        // No redirect or further authentication is allowed until cleanup can
        // be verified. A subsequent submit retries cleanup before signing in.
        return { cleared: false, signOutFailed: true };
    }
}

async function handleLogin() {
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    if (!loginForm) return;

    let inProgress = false;
    let cleanupPending = false;
    const roleButtons = document.querySelectorAll("[data-login-role]");
    function setLoading(loading) {
        setButtonLoading(loginBtn, loading, "Logging in...", "Login");
        loginForm.setAttribute("aria-busy", String(loading));
        roleButtons.forEach(button => { button.disabled = loading; });
    }
    async function rejectLogin(message) {
        cleanupPending = true;
        const { cleared, signOutFailed } = await discardRejectedLogin();
        cleanupPending = !cleared;
        if (!cleared) {
            message += " Unable to clear this browser’s session. Please try again before signing in.";
        } else if (signOutFailed) {
            message += " This browser is signed out, but server sign-out could not be confirmed.";
        }
        showMessage(message);
    }

    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        if (inProgress) return;
        clearMessage();

        const selected = document.querySelectorAll('[data-login-role][aria-pressed="true"]');
        const selectedRole = selected.length === 1 ? selected[0].dataset.loginRole : null;
        if (!Object.hasOwn(loginRoleLabels, selectedRole)) {
            showMessage("Please select Client, Provider or Admin Login to continue.");
            return;
        }
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        if (!email || !password) {
            showMessage("Please enter email and password.");
            return;
        }

        // Capture and freeze the selection for this attempt; prevent concurrent
        // submissions or UI role changes while the account is being checked.
        inProgress = true;
        setLoading(true);
        let redirectPending = false;
        try {
            if (cleanupPending) {
                const { cleared } = await discardRejectedLogin();
                cleanupPending = !cleared;
                if (!cleared) {
                    showMessage("Unable to clear this browser’s session. Please try again before signing in.");
                    return;
                }
            }
            localStorage.removeItem("igotu_user");
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                showMessage(error.message || "Login failed. Please check your email and password.");
                return;
            }
            const user = data.user;
            if (!user) {
                await rejectLogin("Login failed. User session was not created.");
                return;
            }
            const profile = await getUserProfile(user.id);
            if (!profile) {
                await rejectLogin("Account profile not found. Please contact admin.");
                return;
            }
            if (profile.status !== "active") {
                await rejectLogin("Your account is not active. Please contact admin.");
                return;
            }
            const actualRole = String(profile.role || "").trim().toLowerCase();
            if (!Object.hasOwn(loginRoleLabels, actualRole)) {
                await rejectLogin("Your account role is not supported. Please contact admin.");
                return;
            }
            if (actualRole !== selectedRole) {
                const label = loginRoleLabels[actualRole];
                await rejectLogin(`This account is registered as ${actualRole === "admin" ? "an" : "a"} ${label}. Please select ${label} Login to continue.`);
                return;
            }

            const destination = await accountDestination(profile);
            localStorage.setItem("igotu_user", JSON.stringify(profile));
            showMessage("Login successful. Redirecting...", "success");
            redirectPending = true;
            setTimeout(function() { window.location.href = destination; }, 800);
        } catch {
            await rejectLogin("Login could not be completed. Please try again.");
        } finally {
            if (!redirectPending) {
                inProgress = false;
                setLoading(false);
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    if (page === "register") {
        handleRegister();
    }

    if (page === "login") {
        handleLogin();
    }
});