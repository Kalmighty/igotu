import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

let currentUser = null;
let allUsers = [];

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

function formatRole(role) {
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown";
}

function formatStatus(status) {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

function formatDate(dateValue) {
    if (!dateValue) return "-";

    return new Date(dateValue).toLocaleDateString("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

async function getSessionUser() {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
        window.location.href = "../login.html";
        return null;
    }

    return data.session.user;
}

async function getProfile(userId) {
    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    if (error || !data) {
        window.location.href = "../login.html";
        return null;
    }

    if (data.role !== "admin" || data.status !== "active") {
        await supabase.auth.signOut();
        window.location.href = "../login.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Admin · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
}

async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");

    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async function(event) {
        event.preventDefault();
        localStorage.removeItem("igotu_user");
        await supabase.auth.signOut();
        window.location.href = "../login.html";
    });
}

async function loadUsers() {
    const usersList = document.getElementById("usersList");

    usersList.innerHTML = `<p class="muted-text">Loading users...</p>`;

    const { data, error } = await supabase
        .from("users")
        .select("id, user_code, full_name, email, role, status, identity_verified, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load users error:", error);
        usersList.innerHTML = `<p class="muted-text">Unable to load users.</p>`;
        return;
    }

    allUsers = data || [];
    renderUsers();
}

function renderUsers() {
    const usersList = document.getElementById("usersList");
    const searchInput = document.getElementById("searchInput").value.trim().toLowerCase();
    const roleFilter = document.getElementById("roleFilter").value;
    const statusFilter = document.getElementById("statusFilter").value;

    let filteredUsers = allUsers;

    if (searchInput) {
        filteredUsers = filteredUsers.filter(function(user) {
            const name = (user.full_name || "").toLowerCase();
            const email = (user.email || "").toLowerCase();
            const code = (user.user_code || "").toLowerCase();

            return name.includes(searchInput) || email.includes(searchInput) || code.includes(searchInput);
        });
    }

    if (roleFilter !== "all") {
        filteredUsers = filteredUsers.filter(function(user) {
            return user.role === roleFilter;
        });
    }

    if (statusFilter !== "all") {
        filteredUsers = filteredUsers.filter(function(user) {
            return user.status === statusFilter;
        });
    }

    if (filteredUsers.length === 0) {
        usersList.innerHTML = `
            <div class="empty-box">
                <h3>No users found</h3>
                <p>No user accounts match the selected filter.</p>
            </div>
        `;
        return;
    }

    usersList.innerHTML = filteredUsers.map(function(user) {
        const isCurrentAdmin = user.id === currentUser.id;
        const canVerifyIdentity = user.role === "client" || user.role === "provider";
        const isIdentityVerified = user.identity_verified === true;
        const verificationHtml = canVerifyIdentity
            ? `<span class="status-pill ${isIdentityVerified ? "verified-pill" : "warning-pill"}">${isIdentityVerified ? "Identity Verified" : "Not Verified"}</span>`
            : "";

        let actionHtml = "";
        let verificationActionHtml = "";

        if (isCurrentAdmin) {
            actionHtml = `<span class="status-note completed-note">Current Admin</span>`;
        } else if (user.status === "active") {
            actionHtml = `
                <button class="danger-btn btn-small status-btn" data-user-id="${user.id}" data-status="suspended">
                    Suspend
                </button>
            `;
        } else {
            actionHtml = `
                <button class="btn btn-small status-btn" data-user-id="${user.id}" data-status="active">
                    Activate
                </button>
            `;
        }

        if (canVerifyIdentity) {
            verificationActionHtml = `
                <a class="btn btn-small" href="verifications.html?user_id=${user.id}">
                    Review Verification
                </a>
            `;
        }

        return `
            <div class="user-card">
                <div class="user-card-main">
                    <div class="user-avatar">${(user.full_name || "U").charAt(0).toUpperCase()}</div>

                    <div>
                        <div class="card-topline">
                            <span class="status-pill">${formatRole(user.role)}</span>
                            <span class="status-pill ${user.status === "active" ? "" : "danger-pill"}">${formatStatus(user.status)}</span>
                            ${verificationHtml}
                            <span>${user.user_code || "-"}</span>
                        </div>

                        <h3>${user.full_name || "Unnamed User"}</h3>
                        <p class="muted-text">${user.email || "-"}</p>

                        <div class="details-grid user-details-grid">
                            <span>Role: <strong>${formatRole(user.role)}</strong></span>
                            <span>Status: <strong>${formatStatus(user.status)}</strong></span>
                            <span>Created: <strong>${formatDate(user.created_at)}</strong></span>
                            ${canVerifyIdentity ? `<span>Verification: <strong>${isIdentityVerified ? "Verified" : "Not verified"}</strong></span>` : ""}
                        </div>
                    </div>
                </div>

                <div class="incoming-actions">
                    ${verificationActionHtml}
                    ${actionHtml}
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".status-btn").forEach(function(button) {
        button.addEventListener("click", async function() {
            await updateUserStatus(this.dataset.userId, this.dataset.status, this);
        });
    });
    });
}

async function updateUserStatus(userId, newStatus, button) {
    clearMessage();

    const confirmText = newStatus === "suspended" ?
        "Suspend this user account?" :
        "Activate this user account?";

    const confirmed = confirm(confirmText);

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = newStatus === "suspended" ? "Suspending..." : "Activating...";

    const { error } = await supabase.rpc("admin_update_user_status", {
        p_user_id: userId,
        p_status: newStatus
    });

    if (error) {
        console.error("Update status error:", error);
        showMessage(error.message || "Failed to update user status.");
        button.disabled = false;
        button.textContent = newStatus === "suspended" ? "Suspend" : "Activate";
        return;
    }

    await createNotification(
        userId,
        newStatus === "suspended" ? "Account suspended" : "Account activated",
        newStatus === "suspended"
            ? "Your IGotU account has been suspended by the administrator."
            : "Your IGotU account has been activated by the administrator."
    );

    showMessage("User status updated successfully.", "success");

    setTimeout(function() {
        loadUsers();
    }, 700);
}

function handleFilters() {
    document.getElementById("searchInput").addEventListener("input", renderUsers);
    document.getElementById("roleFilter").addEventListener("change", renderUsers);
    document.getElementById("statusFilter").addEventListener("change", renderUsers);
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    handleFilters();
    loadUsers();
});