import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import { askCancellationReason } from "./service-action-dialogs.js";

let currentUser = null;
let currentProfile = null;
let allRequests = [];
let loadState = "loading";
let loading = false;
let cancellationBusy = false;
let page = 1;
const pageSize = 5;
const cancellableStatuses = ["pending", "provider_selected", "confirmed"];
const statusNames = {
  pending: "Pending",
  provider_selected: "Provider Selected",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const $ = (id) => document.getElementById(id);
const text = (value) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
function showMessage(message, type = "error") {
  $("messageBox").textContent = message;
  $("messageBox").className = `message-box ${type}`;
}
function clearMessage() {
  $("messageBox").textContent = "";
  $("messageBox").className = "message-box hidden";
}
function formatBudget(value) {
  if (value == null || value === "") return "Open budget";
  return Number.isFinite(Number(value)) && Number(value) >= 0
    ? `RM ${Number(value).toFixed(2)}`
    : "Budget unavailable";
}
function formatDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return "Date not specified";
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return "Date not specified";
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
function formatTime(value) {
  const match =
    typeof value === "string" &&
    /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match || +match[1] > 23 || +match[2] > 59) return "Time not specified";
  const hour = +match[1];
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}
function createdTime(request) {
  const value =
    typeof request.created_at === "string" && request.created_at.trim()
      ? Date.parse(request.created_at)
      : NaN;
  return Number.isFinite(value) ? value : null;
}
const categoryPaths = {
  Cleaning:
    '<path d="m14 3-4 9 5 2 4-9M9 12l6 3-4 6-7-3 5-6Zm-3 4 6 3M4 3v4M2 5h4"/>',
  Delivery:
    '<path d="M3 5h12v12H3V5Zm12 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  Repair:
    '<path d="m14 4-3 3 3 3 3-3a6 6 0 0 1-7 8l-6 6-3-3 6-6a6 6 0 0 1 7-8Z"/>',
  "Moving Help":
    '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10M7 5l9 5"/>',
  Errands: '<path d="M5 7h14l2 14H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2M9 13l2 2 4-4"/>',
  Tutoring:
    '<path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z"/>',
  Other:
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
};
function categoryIcon(category) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(categoryPaths, category) ? categoryPaths[category] : categoryPaths.Other}</svg>`;
}
function icon(name) {
  return `<svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><use href="#dashboard-${name}"/></svg>`;
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

  if (data.role !== "client" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  return data;
}

function displayUser(profile) {
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userRole").textContent =
    `Client · ${profile.user_code}`;
  document.getElementById("avatar").textContent = profile.full_name
    .charAt(0)
    .toUpperCase();
}

async function handleLogout() {
  const logoutBtn = document.getElementById("logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async function (event) {
    event.preventDefault();
    localStorage.removeItem("igotu_user");
    await supabase.auth.signOut();
    window.location.href = "../login.html";
  });
}

function updateStatistics() {
  const available = loadState === "ready";
  const values = {
    total: allRequests.length,
    pending: 0,
    ongoing: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const r of allRequests) {
    if (["pending", "completed", "cancelled"].includes(r.status))
      values[r.status]++;
    if (["provider_selected", "confirmed", "in_progress"].includes(r.status))
      values.ongoing++;
  }
  for (const [key, value] of Object.entries(values))
    $(key + "Requests").textContent = available ? String(value) : "—";
  document
    .querySelector(".requests-stats")
    .setAttribute("aria-busy", String(loading));
  $("requestDataStatus").textContent = loading
    ? "Loading your request statistics…"
    : available
      ? `Statistics cover all ${allRequests.length} of your requests, independently of filters. Ongoing includes Provider Selected, Confirmed and In Progress.`
      : "Request statistics are unavailable. Try again below.";
}
async function loadRequests() {
  if (loading) return false;
  const restoreRetryFocus = $("retryRequestsBtn") === document.activeElement;
  loading = true;
  loadState = "loading";
  $("requestsFilters").disabled = true;
  $("requestSort").disabled = true;
  closeMenus();
  updateStatistics();
  renderRequests();
  try {
    // Preserve the original query contract and mandatory ownership restriction.
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("client_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (data !== null && !Array.isArray(data))
      throw new Error("Invalid request response");
    allRequests = (data || []).filter(
      (r) => r && typeof r === "object" && r.client_id === currentUser.id,
    );
    loadState = "ready";
    return true;
  } catch {
    loadState = "error";
    return false;
  } finally {
    loading = false;
    $("requestsFilters").disabled = loadState !== "ready";
    $("requestSort").disabled = loadState !== "ready";
    updateStatistics();
    renderRequests();
    if (restoreRetryFocus)
      $("requestsListHeading").focus({ preventScroll: true });
  }
}
function filteredRequests() {
  const query = $("requestSearch")
    .value.trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  const category = $("categoryFilter").value,
    status = $("statusFilter").value;
  const days = $("timeFilter").value;
  const now = Date.now(),
    cutoff = now - Number(days) * 86400000;
  const rows = allRequests.filter((r) => {
    const haystack = [r.title, r.request_id, r.category, r.service_type]
      .map(text)
      .join(" ")
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
    const time = createdTime(r);
    return (
      (!query || haystack.includes(query)) &&
      (category === "all" || r.category === category) &&
      (status === "all" || r.status === status) &&
      (days === "all" || (time !== null && time >= cutoff && time <= now))
    );
  });
  return rows
    .map((r, index) => ({ r, index }))
    .sort((a, b) => {
      const at = createdTime(a.r),
        bt = createdTime(b.r);
      // Missing/malformed timestamps remain last in either direction.
      if (at === null && bt !== null) return 1;
      if (bt === null && at !== null) return -1;
      const delta = at !== null && bt !== null ? at - bt : 0;
      if (delta) return $("requestSort").value === "oldest" ? delta : -delta;
      const aid = text(a.r.request_id),
        bid = text(b.r.request_id);
      return (aid < bid ? -1 : aid > bid ? 1 : 0) || a.index - b.index;
    })
    .map((o) => o.r);
}
function requestCard(request, index) {
  const id = text(request.request_id),
    safeId = escapeHtml(id);
  const known = Object.hasOwn(statusNames, request.status),
    status = known ? request.status : "unknown";
  const title = text(request.title) || "Service request";
  const route = `request-details.html?request_id=${escapeHtml(encodeURIComponent(id))}`;
  const canCancel = id && cancellableStatuses.includes(request.status);
  const details = id
    ? `<a href="${route}" class="btn btn-outline btn-small" aria-label="View details: ${escapeHtml(title)}">View Details ${icon("arrow")}</a>`
    : "<span>Details unavailable</span>";
  return `<article class="incoming-card requests-card" aria-labelledby="requestTitle${index}" data-request-id="${safeId}">
        <div class="requests-category-icon">${categoryIcon(request.category)}</div>
        <div class="requests-card-content"><div class="requests-card-heading"><div><h3 id="requestTitle${index}">${escapeHtml(title)}</h3><span class="requests-card-id">${safeId || "Request ID unavailable"}</span></div><span class="status-pill status-${status}">${escapeHtml(known ? statusNames[status] : text(request.status).replaceAll("_", " ") || "Status unavailable")}</span></div>
        <p class="requests-location">${icon("pin")}<span>${escapeHtml(text(request.location) || "Location not specified")}</span></p>
        <ul class="requests-meta" aria-label="Service information"><li>${categoryIcon(request.category)}<span>${escapeHtml(text(request.category) || "Category not specified")}</span></li><li>${icon("calendar")}<span>${escapeHtml(formatDate(request.preferred_date))}</span></li><li>${icon("clock")}<span>${escapeHtml(formatTime(request.preferred_time))}</span></li><li>${icon("money")}<span>${escapeHtml(formatBudget(request.budget))}</span></li></ul>
        <p class="requests-specialisation">${escapeHtml(text(request.service_type) || "Service type not specified")}${["normal", "urgent"].includes(request.priority) ? ` · ${request.priority === "urgent" ? "Urgent" : "Normal"} priority` : ""}</p>
        ${request.status === "cancelled" && request.cancellation_reason ? `<p class="requests-cancellation"><strong>Cancellation reason:</strong> ${escapeHtml(text(request.cancellation_reason))}</p>` : ""}</div>
        <div class="incoming-actions requests-card-actions">${details}${canCancel ? `<div class="requests-action-wrap"><button type="button" class="requests-action-trigger" aria-expanded="false" aria-controls="requestActions${index}" aria-label="Actions for ${escapeHtml(title)}" data-request-id="${safeId}">•••</button><div id="requestActions${index}" class="requests-action-menu" hidden aria-label="Request actions">${request.status === "pending" ? `<a href="create-request.html?request_id=${escapeHtml(encodeURIComponent(id))}">Edit Request</a>` : ""}<button type="button" class="cancel-btn" data-request-id="${safeId}" ${cancellationBusy ? "disabled" : ""}>Cancel Request</button></div></div>` : ""}</div></article>`;
}
function renderRequests() {
  closeMenus();
  const list = $("requestsList"),
    pagination = $("requestsPagination");
  list.setAttribute("aria-busy", String(loading));
  pagination.hidden = true;
  pagination.replaceChildren();
  if (loadState !== "ready") {
    $("requestsResultCount").textContent = loading
      ? "Loading your requests…"
      : "Your request history is unavailable.";
    list.innerHTML = loading
      ? '<div class="requests-state"><div class="requests-placeholder" aria-hidden="true"></div><h3>Loading your requests…</h3><p>Your request history will appear here shortly.</p></div>'
      : '<div class="requests-state" role="alert"><h3>Unable to load your requests</h3><p>Your history is still saved. Try again to load the latest information.</p><button type="button" class="btn btn-outline" id="retryRequestsBtn">Try Again</button></div>';
    $("retryRequestsBtn")?.addEventListener("click", () => void loadRequests());
    return;
  }
  const rows = filteredRequests(),
    count = rows.length,
    pages = Math.max(1, Math.ceil(count / pageSize));
  page = Math.min(Math.max(1, page), pages);
  const start = (page - 1) * pageSize;
  $("requestsResultCount").textContent = count
    ? `Showing ${start + 1}–${Math.min(start + pageSize, count)} of ${count} requests${count === allRequests.length ? "" : ` (filtered from ${allRequests.length})`}`
    : allRequests.length
      ? `0 matching requests (from ${allRequests.length})`
      : "0 requests";
  if (!count) {
    list.innerHTML = allRequests.length
      ? '<div class="requests-state"><h3>No requests match your filters</h3><p>Try a different search or clear your filters to see your request history.</p><button type="button" id="clearFiltersBtn" class="btn btn-outline">Clear Filters</button></div>'
      : '<div class="requests-state"><h3>No service requests yet</h3><p>Describe what you need and review suitable Providers.</p><a class="btn" href="create-request.html">Create Your First Request</a></div>';
    $("clearFiltersBtn")?.addEventListener("click", resetFilters);
    return;
  }
  list.innerHTML = rows
    .slice(start, start + pageSize)
    .map(requestCard)
    .join("");
  list
    .querySelectorAll(".requests-action-trigger")
    .forEach((button) =>
      button.addEventListener("click", () => toggleMenu(button)),
    );
  list
    .querySelectorAll(".cancel-btn")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void cancelRequest(button.dataset.requestId, button),
      ),
    );
  if (pages > 1) {
    pagination.hidden = false;
    function add(label, target, disabled = false, current = false) {
      const button = document.createElement("button");
      button.type = "button";
      const fullLabel = document.createElement("span");
      fullLabel.textContent = label;
      button.append(fullLabel);
      button.dataset.paginationControl = /^\d+$/.test(label)
        ? "page"
        : label.toLowerCase();
      button.dataset.compactLabel = current
        ? `Page ${target} of ${pages}`
        : label === "Previous"
          ? "‹"
          : "›";
      button.disabled = disabled;
      if (current) button.setAttribute("aria-current", "page");
      button.setAttribute(
        "aria-label",
        current
          ? `Page ${target} of ${pages}`
          : /^\d+$/.test(label)
            ? `Page ${label}`
            : label + " page",
      );
      button.addEventListener("click", () => {
        page = target;
        renderRequests();
        $("requestsListHeading").focus({ preventScroll: true });
      });
      pagination.append(button);
    }
    add("Previous", page - 1, page === 1);
    const numbers = [...new Set([1, page - 1, page, page + 1, pages])]
      .filter((n) => n >= 1 && n <= pages)
      .sort((a, b) => a - b);
    numbers.forEach((n, i) => {
      if (i && n - numbers[i - 1] > 1) {
        const span = document.createElement("span");
        span.textContent = "…";
        pagination.append(span);
      }
      add(String(n), n, false, n === page);
    });
    add("Next", page + 1, page === pages);
  }
}
function closeMenus(restore = false) {
  document
    .querySelectorAll('.requests-action-trigger[aria-expanded="true"]')
    .forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      $(button.getAttribute("aria-controls")).hidden = true;
      if (restore) button.focus();
    });
}
function toggleMenu(button) {
  const open = button.getAttribute("aria-expanded") === "true";
  closeMenus();
  if (!open) {
    button.setAttribute("aria-expanded", "true");
    $(button.getAttribute("aria-controls")).hidden = false;
  }
}
async function cancelRequest(requestId, button) {
  if (cancellationBusy || loadState !== "ready") return;
  const request = allRequests.find(
    (item) => text(item.request_id) === requestId,
  );
  if (!request || !cancellableStatuses.includes(request.status)) {
    showMessage("This request can no longer be cancelled.");
    return;
  }
  cancellationBusy = true;
  document.querySelectorAll(".cancel-btn").forEach((b) => (b.disabled = true));
  clearMessage();
  try {
    const cancellationReason = await askCancellationReason();
    if (!cancellationReason) return;
    button.textContent = "Cancelling…";
    const { error } = await supabase.rpc("client_cancel_request", {
      p_request_id: requestId,
      p_reason: cancellationReason,
    });
    if (error) {
      showMessage(error.message || "Failed to cancel request.");
      return;
    }
    // Only a confirmed RPC success changes the local record. Backend checks remain authoritative.
    request.status = "cancelled";
    request.cancellation_reason = cancellationReason;
    showMessage(
      "Request cancelled. It remains available in your request history.",
      "success",
    );
    await loadRequests();
  } catch {
    showMessage(
      "Cancellation could not be confirmed. Check View Details or refresh your history before retrying.",
    );
  } finally {
    cancellationBusy = false;
    document.querySelectorAll(".cancel-btn").forEach((b) => {
      b.disabled = false;
      b.textContent = "Cancel Request";
    });
    if (!button.isConnected)
      $("requestsListHeading").focus({ preventScroll: true });
    else button.focus({ preventScroll: true });
  }
}
function resetFilters() {
  $("requestSearch").value = "";
  $("categoryFilter").value = "all";
  $("statusFilter").value = "all";
  $("timeFilter").value = "all";
  $("requestSort").value = "newest";
  page = 1;
  renderRequests();
}
function handleFilters() {
  $("requestSearch").addEventListener("input", () => {
    page = 1;
    renderRequests();
  });
  ["categoryFilter", "statusFilter", "timeFilter", "requestSort"].forEach(
    (id) =>
      $(id).addEventListener("change", () => {
        page = 1;
        renderRequests();
      }),
  );
  $("resetFiltersBtn").addEventListener("click", resetFilters);
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(
        ".requests-action-wrap,.service-reason-modal-overlay",
      ) &&
      !document.querySelector(".service-reason-modal-overlay")
    )
      closeMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !document.querySelector(".service-reason-modal-overlay")
    )
      closeMenus(true);
  });
  document.addEventListener("focusin", (event) => {
    if (
      !event.target.closest(
        ".requests-action-wrap,.service-reason-modal-overlay",
      ) &&
      !document.querySelector(".service-reason-modal-overlay")
    )
      closeMenus();
  });
}
document.addEventListener("DOMContentLoaded", async function () {
  if (!(await authorizeWorkspace()).allowed) return;
  currentUser = await getSessionUser();
  if (!currentUser) return;
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) return;
  displayUser(currentProfile);
  handleLogout();
  handleFilters();
  await loadRequests();
  document.body.dataset.requestsReady = "true";
});
