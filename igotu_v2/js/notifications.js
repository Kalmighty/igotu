import { supabase } from "./supabaseClient.js";

let currentUser = null;
let currentProfile = null;
let notifications = [];

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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
    if (!value) return "-";

    return new Date(value).toLocaleString("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getExpectedRoleFromPath() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes("/provider/")) return "provider";
    return "client";
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

    const expectedRole = getExpectedRoleFromPath();

    if (data.role !== expectedRole || data.status !== "active") {
        await supabase.auth.signOut();
        window.location.href = "../login.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `${roleLabel} · ${profile.user_code}`;
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

function updateStats() {
    const unreadCount = notifications.filter(function(item) {
        return item.is_read === false;
    }).length;

    document.getElementById("totalNotifications").textContent = notifications.length;
    document.getElementById("unreadNotifications").textContent = unreadCount;
    document.getElementById("readNotifications").textContent = notifications.length - unreadCount;
}

function renderNotifications() {
    const list = document.getElementById("notificationsList");

    updateStats();

    if (notifications.length === 0) {
        list.innerHTML = `
            <div class="empty-box">
                <h3>No notifications yet</h3>
                <p>Important updates about requests, messages, payments, and reviews will appear here.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = notifications.map(function(item) {
        return `
            <div class="notification-card ${item.is_read ? "" : "unread"}">
                <div class="notification-main">
                    <div class="notification-icon">${item.is_read ? "✓" : "🔔"}</div>
                    <div>
                        <div class="notification-topline">
                            <strong>${escapeHtml(item.title)}</strong>
                            ${item.is_read ? `<span class="status-pill">Read</span>` : `<span class="status-pill">Unread</span>`}
                        </div>
                        <p>${escapeHtml(item.message)}</p>
                        <small>${escapeHtml(formatDateTime(item.created_at))}</small>
                    </div>
                </div>
                <div class="notification-actions">
                    ${item.is_read ? "" : `<button class="btn btn-small mark-read-btn" data-id="${escapeHtml(item.id)}">Mark as Read</button>`}
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".mark-read-btn").forEach(function(button) {
        button.addEventListener("click", async function() {
            await markOneAsRead(this.dataset.id);
        });
    });
}

async function loadNotifications() {
    const list = document.getElementById("notificationsList");
    list.innerHTML = `<p class="muted-text">Loading notifications...</p>`;

    const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load notifications error:", error);
        list.innerHTML = `<p class="muted-text">Unable to load notifications. Please check the notifications table and policies.</p>`;
        return;
    }

    notifications = data || [];
    renderNotifications();
}

async function markOneAsRead(notificationId) {
    clearMessage();

    const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", currentUser.id);

    if (error) {
        console.error("Mark read error:", error);
        showMessage(error.message || "Failed to update notification.");
        return;
    }

    await loadNotifications();
}

async function markAllAsRead() {
    clearMessage();

    const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", currentUser.id)
        .eq("is_read", false);

    if (error) {
        console.error("Mark all read error:", error);
        showMessage(error.message || "Failed to update notifications.");
        return;
    }

    showMessage("All notifications marked as read.", "success");
    await loadNotifications();
}

function handleActions() {
    const markAllBtn = document.getElementById("markAllReadBtn");

    if (markAllBtn) {
        markAllBtn.addEventListener("click", markAllAsRead);
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    currentProfile = await getProfile(currentUser.id);
    if (!currentProfile) return;

    displayUser(currentProfile);
    handleLogout();
    handleActions();
    await loadNotifications();
});
