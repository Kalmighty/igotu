import { providerRequests } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import {
  createServiceCalendar,
  readableServiceDate,
  serviceTime,
  serviceStatus,
} from "./service-calendar.js";

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

  if (data.role !== "provider" || data.status !== "active") {
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

let latestRequests = null,
  requestsLoading = false,
  serviceCalendar = null;
function displayUser(profile) {
  const name =
    typeof profile.full_name === "string" && profile.full_name.trim()
      ? profile.full_name.trim()
      : "Provider";
  document.getElementById("userName").textContent = name;
  document.getElementById("userRole").textContent = profile.user_code
    ? `Provider · ${profile.user_code}`
    : "Provider";
  document.getElementById("avatar").textContent =
    Array.from(name)[0].toUpperCase();
  document
    .getElementById("profileMenuTrigger")
    .setAttribute("aria-label", `Account menu for ${name}, Provider`);
  document.getElementById("welcomeText").textContent =
    `Welcome back, ${name.split(/\s+/)[0]}!`;
}
function providerWorkflow(request) {
  return request.status === "provider_selected"
    ? { href: "incoming-requests.html", label: "Open Incoming Requests" }
    : ["confirmed", "in_progress", "completed"].includes(request.status)
      ? { href: "assignment-details.html", label: "Open Assignments" }
      : null;
}
function calendarRequests(requests) {
  return requests.map((request) => ({
    id: request.request_id,
    title: request.title,
    category: request.category,
    date: request.preferred_date,
    time: request.preferred_time,
    status: request.status,
    // Always use the explicitly permitted coarse field. Exact location and
    // coordinates are deliberately excluded even after confirmation here.
    area: request.approximate_area || "",
    href: providerWorkflow(request)?.href || null,
    actionLabel: providerWorkflow(request)?.label || "",
  }));
}
function renderRequests(requests) {
  const box = document.getElementById("incomingRequests");
  if (!requests.length) {
    box.innerHTML =
      '<div class="ui-state"><h3>No assigned service requests yet</h3><p>Requests appear here when a Client selects you. Keep your services and weekly working hours up to date.</p><a class="btn btn-outline" href="edit-profile.html">Manage services &amp; availability</a></div>';
    return;
  }
  box.innerHTML = requests
    .slice(0, 5)
    .map((request) => {
      const workflow = providerWorkflow(request),
        time = serviceTime(request.preferred_time),
        status = Object.hasOwn(
          {
            provider_selected: 1,
            confirmed: 1,
            in_progress: 1,
            completed: 1,
            cancelled: 1,
          },
          request.status,
        )
          ? request.status
          : "unknown";
      return `<article class="provider-request"><span class="dashboard-request-icon" aria-hidden="true"><svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><use href="#dashboard-service"/></svg></span><div class="provider-request-content"><strong>${escapeHtml(request.title || "Service request")}</strong><span>${escapeHtml(request.request_id || "Request ID unavailable")} · ${escapeHtml(request.category || "Category unavailable")}</span><span class="provider-status provider-status-${status}">${escapeHtml(serviceStatus(request.status))}</span><div class="provider-request-meta"><span>Preferred date: ${escapeHtml(readableServiceDate(request.preferred_date))}</span><span>Preferred time: ${escapeHtml(time ? time.label + " MYT" : "unavailable")}</span></div><span>${escapeHtml(request.approximate_area ? (/^approximate area\b/i.test(request.approximate_area) ? request.approximate_area : `Approximate area: ${request.approximate_area}`) : "Approximate area unavailable")}</span>${workflow ? `<a href="${workflow.href}">${workflow.label} →</a>` : ""}</div></article>`;
    })
    .join("");
}
async function loadStats(userId) {
  if (requestsLoading) return;
  requestsLoading = true;
  const button = document.getElementById("refreshProviderBtn"),
    status = document.getElementById("providerDataStatus"),
    box = document.getElementById("incomingRequests");
  button.disabled = true;
  box
    .querySelectorAll("[data-provider-retry]")
    .forEach((control) => (control.disabled = true));
  box.setAttribute("aria-busy", "true");
  document.querySelector(".dashboard-stats").setAttribute("aria-busy", "true");
  document.body.dataset.providerRequestsState = "loading";
  status.textContent = latestRequests
    ? "Refreshing your assigned requests…"
    : "Loading your assigned requests…";
  serviceCalendar?.setLoading();
  try {
    const { data: requests, error } = await providerRequests(null);
    if (error || !Array.isArray(requests)) throw Error();
    const list = requests.filter((r) => r && r.selected_provider_id === userId);
    let reviews = null,
      reviewsError = true;
    try {
      const result = await supabase
        .from("service_reviews")
        .select("rating")
        .eq("reviewee_id", userId);
      reviews = result.data;
      reviewsError = result.error;
    } catch {
      /* Request data remains usable if only the review transport fails. */
    }
    document.getElementById("incomingCount").textContent = list.filter(
      (r) => r.status === "provider_selected",
    ).length;
    document.getElementById("activeCount").textContent = list.filter((r) =>
      ["confirmed", "in_progress"].includes(r.status),
    ).length;
    document.getElementById("completedCount").textContent = list.filter(
      (r) => r.status === "completed",
    ).length;
    const validReviews =
      !reviewsError &&
      Array.isArray(reviews) &&
      reviews.every(
        (r) =>
          r.rating !== null &&
          String(r.rating).trim() !== "" &&
          Number.isFinite(Number(r.rating)) &&
          Number(r.rating) >= 1 &&
          Number(r.rating) <= 5,
      );
    document.getElementById("averageRating").textContent = !validReviews
      ? "—"
      : reviews.length
        ? (
            reviews.reduce((sum, r) => sum + Number(r.rating), 0) /
            reviews.length
          ).toFixed(1)
        : "No reviews";
    document.getElementById("providerRatingStatus").textContent = !validReviews
      ? "Review data unavailable"
      : reviews.length
        ? "From your available review data"
        : "No recorded reviews";
    latestRequests = list;
    renderRequests(list);
    serviceCalendar?.setRequests(calendarRequests(list));
    document.body.dataset.providerRequestsState = list.length
      ? "ready"
      : "empty";
    status.textContent = list.length
      ? `Showing ${Math.min(5, list.length)} recent assigned ${list.length === 1 ? "request" : "requests"}. Awaiting confirmation is tentative.`
      : "Only requests where you are the selected Provider appear here.";
  } catch {
    document.body.dataset.providerRequestsState = "error";
    if (latestRequests === null) {
      for (const id of [
        "incomingCount",
        "activeCount",
        "completedCount",
        "averageRating",
      ])
        document.getElementById(id).textContent = "—";
      box.replaceChildren();
    } else renderRequests(latestRequests);
    const error = document.createElement("div");
    error.className = "ui-state";
    error.setAttribute("role", "alert");
    const h = document.createElement("h3");
    h.textContent = "Requests could not be loaded";
    const p = document.createElement("p");
    p.textContent =
      latestRequests === null
        ? "Use Refresh requests to try again."
        : "The last successfully loaded requests and statistics remain visible.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-outline";
    retry.dataset.providerRetry = "";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => loadStats(userId));
    error.append(h, p, retry);
    box.prepend(error);
    status.textContent =
      latestRequests === null
        ? "Assigned requests and statistics are unavailable."
        : "Refresh failed. Requests and statistics may be outdated.";
    serviceCalendar?.setError();
  } finally {
    requestsLoading = false;
    button.disabled = false;
    box.setAttribute("aria-busy", "false");
    document
      .querySelector(".dashboard-stats")
      .setAttribute("aria-busy", "false");
  }
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

document.addEventListener("DOMContentLoaded", async function () {
  if (!(await authorizeWorkspace()).allowed) return;
  const user = await getSessionUser();
  if (!user) return;

  const profile = await getProfile(user.id);
  if (!profile) return;

  displayUser(profile);
  // Start the authorised read before the calendar performs its initial render.
  const initialRead = loadStats(user.id);
  serviceCalendar = createServiceCalendar(
    document.getElementById("providerServiceCalendar"),
    { role: "provider", onRefresh: () => loadStats(user.id) },
  );
  document
    .getElementById("refreshProviderBtn")
    .addEventListener("click", () => loadStats(user.id));
  window.addEventListener("pagehide", () => serviceCalendar?.destroy(), {
    once: true,
  });
  await initialRead;
  handleLogout();
});
