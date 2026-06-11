import { supabase } from "./supabaseClient.js";

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

function redirectByRole(role) {
    const cleanRole = String(role || "").trim().toLowerCase();

    if (cleanRole === "client") {
        window.location.href = "client/dashboard.html";
        return;
    }

    if (cleanRole === "provider") {
        window.location.href = "provider/dashboard.html";
        return;
    }

    if (cleanRole === "admin") {
        window.location.href = "admin/dashboard.html";
        return;
    }

    window.location.href = "login.html";
}

async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from("users")
        .select("id, user_code, full_name, email, role, status")
        .eq("id", userId)
        .single();

    if (error) {
        console.error("Profile fetch error:", error);
        return null;
    }

    return data;
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

        showMessage("Registration successful. Redirecting to login...", "success");

        setTimeout(function() {
            window.location.href = "login.html";
        }, 1200);
    });
}

async function handleLogin() {
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");

    if (!loginForm) return;

    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        clearMessage();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (!email || !password) {
            showMessage("Please enter email and password.");
            return;
        }

        setButtonLoading(loginBtn, true, "Logging in...", "Login");

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error("Login error:", error);
            showMessage(error.message || "Login failed. Please check your email and password.");
            setButtonLoading(loginBtn, false, "Logging in...", "Login");
            return;
        }

        const user = data.user;

        if (!user) {
            showMessage("Login failed. User session was not created.");
            setButtonLoading(loginBtn, false, "Logging in...", "Login");
            return;
        }

        const profile = await getUserProfile(user.id);

        if (!profile) {
            showMessage("Account profile not found. Please contact admin.");
            await supabase.auth.signOut();
            setButtonLoading(loginBtn, false, "Logging in...", "Login");
            return;
        }

        if (profile.status !== "active") {
            showMessage("Your account is not active. Please contact admin.");
            await supabase.auth.signOut();
            setButtonLoading(loginBtn, false, "Logging in...", "Login");
            return;
        }

        localStorage.setItem("igotu_user", JSON.stringify(profile));
        console.log("Logged in profile:", profile);

        showMessage("Login successful. Redirecting...", "success");


        setTimeout(function() {
            redirectByRole(profile.role);
        }, 800);
    });
}

async function redirectIfAlreadyLoggedIn() {
    const { data } = await supabase.auth.getSession();

    if (!data.session) return;

    const profile = await getUserProfile(data.session.user.id);

    if (!profile || profile.status !== "active") return;

    localStorage.setItem("igotu_user", JSON.stringify(profile));
    redirectByRole(profile.role);
}

document.addEventListener("DOMContentLoaded", async function() {
    if (page === "register") {
        handleRegister();
    }

    if (page === "login") {
        handleLogin();
    }
});