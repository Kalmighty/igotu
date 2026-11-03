import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml } from "./html-safety.js";
import { createServiceCalendar } from "./service-calendar.js";
import { supabase } from "./supabaseClient.js";

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

  if (data.profile_completed !== true) {
    window.location.href = "complete-profile.html";
    return null;
  }

  return data;
}

function displayUser(profile) {
  const name =
    typeof profile.full_name === "string" && profile.full_name.trim()
      ? profile.full_name.trim()
      : "Client";
  document.getElementById("userName").textContent = name;
  document.getElementById("userRole").textContent = profile.user_code
    ? `Client · ${profile.user_code}`
    : "Client";
  document.getElementById("avatar").textContent =
    Array.from(name)[0].toUpperCase();
  document
    .getElementById("profileMenuTrigger")
    .setAttribute(
      "aria-label",
      `Account menu for ${name}, Client${profile.user_code ? `, ${profile.user_code}` : ""}`,
    );
  document.getElementById("welcomeText").textContent = `Hello, ${name} 👋`;
}

function icon(name) {
  // Names are fixed at call sites, never request data.
  return `<svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#dashboard-${name}"/></svg>`;
}
function preferredDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return "";
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function preferredTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(
    String(value || ""),
  );
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return new Date(
    2000,
    0,
    1,
    Number(match[1]),
    Number(match[2]),
  ).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}
// Presentation only: keep the same five cards/data; CSS removes narrow-phone
// overflow cards from both display and the accessibility tree.
const recentRequestLayout = matchMedia("(max-width: 480px)");
function updateRecentCount() {
  const status = document.getElementById("dashboardDataStatus");
  if (
    !status ||
    !latestRequests ||
    !["ready", "empty"].includes(document.body.dataset.requestsState)
  )
    return;
  const shown = Math.min(
    latestRequests.length,
    recentRequestLayout.matches ? 3 : 5,
  );
  status.textContent = shown
    ? `Showing your ${shown} most recent ${shown === 1 ? "request" : "requests"}.`
    : "Your requests will appear here after you create one.";
}
function requestCards(requests) {
  const statuses = {
    pending: "Pending",
    provider_selected: "Provider Selected",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return requests
    .slice(0, 5)
    .map((request) => {
      const status = Object.hasOwn(statuses, request.status)
        ? request.status
        : "unknown";
      const date = preferredDate(request.preferred_date),
        time = preferredTime(request.preferred_time);
      const budget =
        request.budget !== null &&
        request.budget !== undefined &&
        String(request.budget).trim() !== ""
          ? Number(request.budget)
          : NaN;
      const chips = [
        request.category
          ? `${icon("service")}<span>${escapeHtml(request.category)}</span>`
          : "",
        date
          ? `${icon("calendar")}<span>Preferred ${escapeHtml(date)}</span>`
          : "",
        time ? `${icon("clock")}<span>${escapeHtml(time)}</span>` : "",
        Number.isFinite(budget) && budget >= 0
          ? `${icon("money")}<span>${escapeHtml(new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(budget))}</span>`
          : "",
      ].filter(Boolean);
      const id = request.request_id == null ? "" : String(request.request_id);
      return `<a class="list-item dashboard-request" href="request-details.html?request_id=${escapeHtml(encodeURIComponent(id))}">
            <span class="dashboard-request-icon">${icon("service")}</span>
            <div class="dashboard-request-content"><div class="dashboard-request-heading"><div><strong>${escapeHtml(request.title || "Service request")}</strong><span class="dashboard-request-id">${escapeHtml(id || "Request ID unavailable")}</span></div><em class="status-pill status-${status}">${statuses[status] || "Status unavailable"}</em></div>
            ${request.location ? `<p class="dashboard-request-location">${icon("pin")}<span>${escapeHtml(request.location)}</span></p>` : ""}
            ${chips.length ? `<div class="dashboard-request-meta">${chips.map((chip) => `<span class="dashboard-meta-chip">${chip}</span>`).join("")}</div>` : ""}</div></a>`;
    })
    .join("");
}
let serviceCalendar;
function calendarRequests(requests, userId) {
  return requests
    .filter((r) => r && r.client_id === userId)
    .map((r) => ({
      id: r.request_id,
      title: r.title,
      category: r.category,
      date: r.preferred_date,
      time: r.preferred_time,
      status: r.status,
      href: `request-details.html?request_id=${encodeURIComponent(r.request_id)}`,
      actionLabel: "View Request Details",
    }));
}
let latestRequests = null,
  requestsLoading = false;
function renderRequests(requests) {
  const box = document.getElementById("recentRequests");
  box.innerHTML = requests.length
    ? requestCards(requests)
    : `<div class="ui-state"><h3>No service requests yet</h3><p>Create a request to describe the help you need. Compare suitable Providers and track each request here.</p><a class="btn" href="create-request.html">Create your first request</a></div>`;
}
async function loadStats(userId) {
  if (requestsLoading) return;
  requestsLoading = true;
  serviceCalendar?.setLoading();
  const status = document.getElementById("dashboardDataStatus"),
    refresh = document.getElementById("refreshRequestsBtn"),
    box = document.getElementById("recentRequests"),
    stats = document.querySelector(".dashboard-stats");
  if (refresh) refresh.disabled = true;
  box.setAttribute("aria-busy", "true");
  stats?.setAttribute("aria-busy", "true");
  document.body.dataset.requestsState = "loading";
  if (status)
    status.textContent = latestRequests
      ? "Refreshing your requests…"
      : "Loading your requests…";
  box
    .querySelectorAll("[data-retry-requests]")
    .forEach((button) => (button.disabled = true));
  try {
    // Preserve the existing authorized read: same table, ownership filter and order.
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("client_id", userId)
      .order("created_at", { ascending: false });
    if (error || (data !== null && !Array.isArray(data)))
      throw new Error("Request read unavailable");
    const requests = data || [];
    document.getElementById("totalRequests").textContent = requests.length;
    document.getElementById("pendingRequests").textContent = requests.filter(
      (r) => r.status === "pending",
    ).length;
    document.getElementById("ongoingRequests").textContent = requests.filter(
      (r) =>
        ["provider_selected", "confirmed", "in_progress"].includes(r.status),
    ).length;
    document.getElementById("completedRequests").textContent = requests.filter(
      (r) => r.status === "completed",
    ).length;
    latestRequests = requests;
    renderRequests(requests);
    serviceCalendar?.setRequests(calendarRequests(requests, userId));
    document.body.dataset.requestsState = requests.length ? "ready" : "empty";
    updateRecentCount();
  } catch {
    serviceCalendar?.setError();
    document.body.dataset.requestsState = "error";
    if (latestRequests === null)
      [
        "totalRequests",
        "pendingRequests",
        "ongoingRequests",
        "completedRequests",
      ].forEach((id) => (document.getElementById(id).textContent = "—"));
    const error = `<div class="ui-state dashboard-request-error" role="alert"><h3>Requests could not be loaded</h3><p>Your requests are still saved. ${latestRequests === null ? "Try again to load them." : "Showing your last successfully loaded data."}</p><button type="button" class="btn btn-outline" data-retry-requests>Try again</button></div>`;
    if (latestRequests !== null) renderRequests(latestRequests);
    else box.replaceChildren();
    box.insertAdjacentHTML("afterbegin", error);
    box
      .querySelector("[data-retry-requests]")
      .addEventListener("click", () => loadStats(userId));
    if (status)
      status.textContent =
        latestRequests === null
          ? "Request statistics are unavailable. Try again below."
          : "Refresh failed. Statistics and requests show the last successful read.";
  } finally {
    requestsLoading = false;
    if (refresh) refresh.disabled = false;
    box.setAttribute("aria-busy", "false");
    stats?.setAttribute("aria-busy", "false");
  }
}
function setupDashboardDialog(triggerId, dialogId, closeId) {
  const help = document.getElementById(triggerId),
    dialog = document.getElementById(dialogId),
    close = document.getElementById(closeId);
  if (help && dialog && close && typeof dialog.showModal === "function") {
    help.hidden = false;
    help.addEventListener("click", () => {
      dialog.showModal();
      close.focus();
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...dialog.querySelectorAll(
          'a[href],summary,button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ].filter((element) => {
        const collapsed = element.closest("details:not([open])");
        return (
          element.getClientRects().length &&
          (!collapsed || collapsed.querySelector("summary") === element)
        );
      });
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first) return;
      if (
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    });
    dialog.addEventListener("close", () => {
      if (document.body.dataset.accessState === "allowed") help.focus();
    });
  }
}
function setupDashboard(userId) {
  const refresh = document.getElementById("refreshRequestsBtn");
  if (refresh) {
    refresh.hidden = false;
    refresh.addEventListener("click", () => loadStats(userId));
  }
  setupDashboardDialog(
    "workflowHelpBtn",
    "workflowHelpDialog",
    "workflowHelpClose",
  );
  setupDashboardDialog("clientHelpBtn", "clientHelpDialog", "clientHelpClose");
  let focusedRequest = null;
  document.addEventListener("focusin", (event) => {
    focusedRequest = event.target.closest?.(".dashboard-request") || null;
  });
  recentRequestLayout.addEventListener("change", () => {
    updateRecentCount();
    if (
      recentRequestLayout.matches &&
      focusedRequest?.isConnected &&
      !focusedRequest.getClientRects().length &&
      (document.activeElement === document.body ||
        focusedRequest.contains(document.activeElement))
    )
      document
        .querySelector(
          '.dashboard-recent .panel-header a[href="my-requests.html"]',
        )
        ?.focus();
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const entrances = [
    ...document.querySelectorAll(
      ".sidebar,.dashboard-hero,.stat-card,.dashboard-recent,.dashboard-quick",
    ),
  ];
  const clear = (element) => element.classList.remove("dashboard-enter");
  if (!reduced.matches)
    entrances.forEach((element, index) => {
      if (element.contains(document.activeElement)) return;
      element.style.setProperty(
        "--dashboard-delay",
        `${Math.min(index, 3) * 70}ms`,
      );
      element.classList.add("dashboard-enter");
    });
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "dashboard-enter") clear(event.target);
  });
  document.addEventListener("focusin", (event) => {
    let node = event.target.closest(".dashboard-enter");
    while (node) {
      clear(node);
      node = node.parentElement?.closest(".dashboard-enter");
    }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) entrances.forEach(clear);
  });
}
document.addEventListener("DOMContentLoaded", async function () {
  if (!(await authorizeWorkspace()).allowed) return;
  const user = await getSessionUser();
  if (!user) return;
  const profile = await getProfile(user.id);
  if (!profile) return;
  displayUser(profile);
  setupDashboard(user.id);
  const initialRead = loadStats(user.id);
  serviceCalendar = createServiceCalendar(
    document.getElementById("clientServiceCalendar"),
    { role: "client", onRefresh: () => loadStats(user.id) },
  );
  window.addEventListener("pagehide", () => serviceCalendar?.destroy(), {
    once: true,
  });
  await initialRead;
});
