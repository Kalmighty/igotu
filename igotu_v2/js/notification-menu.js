import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

let currentUserId = null;
let notificationItems = [];
let unreadTotal = 0;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNotificationTime(value) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();
  const diffMs = Math.max(0, now - date);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
  });
}

function updateTopbarBadge(unreadCount) {
  document.querySelectorAll(".notification-badge").forEach(function (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "0";
      badge.classList.add("hidden");
    }
  });
}

function updateUnreadText() {
  const unreadCount = unreadTotal;
  const countText = document.getElementById("notificationDropdownCount");
  const markAllBtn = document.getElementById("notificationMarkAllBtn");

  if (countText) {
    countText.textContent = unreadCount === 1 ? "1 unread" : `${unreadCount} unread`;
  }

  if (markAllBtn) {
    markAllBtn.disabled = unreadCount === 0;
  }

  updateTopbarBadge(unreadCount);
}

function renderNotifications() {
  const list = document.getElementById("notificationDropdownList");
  if (!list) return;

  updateUnreadText();

  if (!notificationItems.length) {
    list.innerHTML = `
      <div class="notification-dropdown-empty">
        <span>🔔</span>
        <strong>No notifications yet</strong>
        <small>New updates will appear here.</small>
      </div>
    `;
    return;
  }

  list.innerHTML = notificationItems
    .map(function (item) {
      return `
        <button
          type="button"
          class="notification-dropdown-item ${item.is_read ? "" : "unread"}"
          data-notification-id="${escapeHtml(item.id)}"
        >
          <span class="notification-dropdown-item-icon">${item.is_read ? "✓" : "●"}</span>

          <span class="notification-dropdown-item-content">
            <span class="notification-dropdown-item-top">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(formatNotificationTime(item.created_at))}</small>
            </span>

            <span class="notification-dropdown-message">
              ${escapeHtml(item.message)}
            </span>

            ${
              item.is_read
                ? `<span class="notification-dropdown-read-label">Read</span>`
                : `<span class="notification-dropdown-read-label unread-label">Click to mark as read</span>`
            }
          </span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll(".notification-dropdown-item").forEach(function (button) {
    button.addEventListener("click", async function () {
      const notificationId = this.dataset.notificationId;
      const item = notificationItems.find((row) => String(row.id) === String(notificationId));

      if (!item || item.is_read) return;
      await markOneAsRead(notificationId);
    });
  });
}

async function loadNotifications() {
  if (!currentUserId) return;

  const list = document.getElementById("notificationDropdownList");

  if (list) {
    list.innerHTML = `
      <div class="notification-dropdown-loading">
        Loading notifications...
      </div>
    `;
  }

  const [items, unread] = await Promise.all([
    supabase.from("notifications").select("id, title, message, is_read, created_at")
      .eq("user_id", currentUserId).order("created_at", { ascending: false }).limit(8),
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId).eq("is_read", false),
  ]);
  const { data } = items;
  const error = items.error || unread.error;
  if (error) {
    console.error("Notification dropdown load error:", error);

    if (list) {
      list.innerHTML = `
        <div class="notification-dropdown-empty">
          <strong>Unable to load notifications</strong>
          <small>Please try again later.</small>
        </div>
      `;
    }
    return;
  }

  notificationItems = data || [];
  unreadTotal = unread.count || 0;
  renderNotifications();
}

async function markOneAsRead(notificationId) {
  if (!currentUserId || !notificationId) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", currentUserId);

  if (error) {
    console.error("Notification mark read error:", error);
    return;
  }

  await loadNotifications();
}

async function markAllAsRead() {
  if (!currentUserId) return;

  const button = document.getElementById("notificationMarkAllBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Updating...";
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUserId)
    .eq("is_read", false);

  if (error) {
    console.error("Notification mark all read error:", error);
  }
  await loadNotifications();
  if (button) button.textContent = "Mark all as read";
}

function closeNotificationMenu() {
  const trigger = document.getElementById("notificationMenuTrigger");
  const dropdown = document.getElementById("notificationDropdown");

  if (!trigger || !dropdown) return;

  dropdown.classList.add("hidden");
  trigger.classList.remove("open");
  trigger.setAttribute("aria-expanded", "false");
}

async function openNotificationMenu() {
  const trigger = document.getElementById("notificationMenuTrigger");
  const dropdown = document.getElementById("notificationDropdown");

  if (!trigger || !dropdown) return;

  dropdown.classList.remove("hidden");
  trigger.classList.add("open");
  trigger.setAttribute("aria-expanded", "true");

  // Close profile dropdown if it is open.
  const profileDropdown = document.getElementById("profileDropdown");
  const profileTrigger = document.getElementById("profileMenuTrigger");

  if (profileDropdown) profileDropdown.classList.add("hidden");
  if (profileTrigger) {
    profileTrigger.classList.remove("open");
    profileTrigger.setAttribute("aria-expanded", "false");
  }

  await loadNotifications();
}

async function toggleNotificationMenu(event) {
  event.stopPropagation();

  const dropdown = document.getElementById("notificationDropdown");
  if (!dropdown) return;

  if (dropdown.classList.contains("hidden")) {
    await openNotificationMenu();
  } else {
    closeNotificationMenu();
  }
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
  const trigger = document.getElementById("notificationMenuTrigger");
  const dropdown = document.getElementById("notificationDropdown");
  const markAllBtn = document.getElementById("notificationMarkAllBtn");

  if (!trigger || !dropdown) return;

  const { data } = await supabase.auth.getSession();

  if (!data.session) return;
  currentUserId = data.session.user.id;

  trigger.addEventListener("click", toggleNotificationMenu);

  dropdown.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  if (markAllBtn) {
    markAllBtn.addEventListener("click", markAllAsRead);
  }

  document.addEventListener("click", closeNotificationMenu);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !dropdown.classList.contains("hidden")) {
      closeNotificationMenu();
      trigger.focus();
    }
  });
});
