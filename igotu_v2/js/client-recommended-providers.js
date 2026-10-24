import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");

let currentUser = null;
let currentProfile = null;
let currentRequest = null;
let allProviders = [];



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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanServiceLanguage(value) {
  return String(value || "")
    .replace(/\btasks\b/gi, "services")
    .replace(/\btask\b/gi, "service");
}

function getRatingDisplayHtml(stats) {
  if (!stats || stats.totalReviews === 0 || stats.averageRating === null) {
    return `<div class="smart-rating-clean no-rating"><span>Not rated yet</span></div>`;
  }

  return `
    <div class="smart-rating-clean">
      <span class="smart-rating-stars">${escapeHtml(getStarText(stats))}</span>
      <strong>${escapeHtml(getRatingLabel(stats))}</strong>
    </div>
  `;
}

function formatStatus(status) {
  if (!status) return "Unknown";

  return String(status)
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getRequestDisplayTitle(request) {
  const rawTitle = String(request?.title || "").trim();

  if (rawTitle && rawTitle.toLowerCase() !== "all") {
    return rawTitle;
  }

  if (request?.category) {
    return `${request.category} Service Request`;
  }

  return "Service Request";
}

function formatBudget(value) {
  if (value === null || value === undefined || value === "") {
    return "Request budget not specified";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return `Request Budget: ${value}`;
  }

  return `Request Budget: RM${amount.toFixed(2)}`;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatDistance(distanceKm) {
  if (
    distanceKm === null ||
    distanceKm === undefined ||
    Number.isNaN(distanceKm)
  ) {
    return "Distance unavailable";
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

function getEmptyTrustStats() {
  return {
    averageRating: null,
    totalReviews: 0,
    totalCompleted: 0,
    recentFeedback: [],
  };
}

function getRatingLabel(stats) {
  if (!stats || stats.totalReviews === 0 || stats.averageRating === null) {
    return "No rating yet";
  }

  return `${stats.averageRating.toFixed(1)} / 5`;
}

function getStarText(stats) {
  if (!stats || stats.averageRating === null || stats.totalReviews === 0) {
    return "☆☆☆☆☆";
  }

  const rounded = Math.round(stats.averageRating);
  return "★★★★★".slice(0, rounded) + "☆☆☆☆☆".slice(rounded);
}

function getInitials(name) {
  return String(name || "P")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "P";
}

function getProviderBadges(provider) {
  const stats = provider.trustStats || getEmptyTrustStats();
  const profile = provider.profile || {};
  const badges = [];

  // Do not show a separate "✓ Verified" badge here because
  // verification is already displayed in the Trust Status item.

  if (stats.averageRating !== null && stats.averageRating >= 4.5) {
    badges.push(`<span class="smart-badge top-rated">★ Top Rated</span>`);
  }

  if (stats.totalCompleted > 0) {
    badges.push(`<span class="smart-badge completed">${escapeHtml(stats.totalCompleted)} completed</span>`);
  }

  return badges.join("");
}

function buildReasonText(provider) {
  const reasons = [];
  const stats = provider.trustStats || getEmptyTrustStats();
  const profile = provider.profile || {};

  reasons.push("matches your service category");

  if (provider.distanceKm !== null) {
    reasons.push(`${formatDistance(provider.distanceKm)} from your service location`);
  }

  if (profile.is_verified === true) {
    reasons.push("verified by administrator");
  }

  if (stats.averageRating !== null) {
    reasons.push(`rated ${stats.averageRating.toFixed(1)}/5 by users`);
  }

  return reasons.join(" · ");
}

function getRecentFeedbackHtml(provider) {
  const stats = provider.trustStats || getEmptyTrustStats();

  if (!stats.recentFeedback || stats.recentFeedback.length === 0) {
    return `<p class="smart-review-text">No written review yet.</p>`;
  }

  return `<p class="smart-review-text">“${escapeHtml(stats.recentFeedback[0])}”</p>`;
}

async function loadProviderTrustStats(providerIds) {
  const trustMap = new Map();

  providerIds.forEach(function (providerId) {
    trustMap.set(providerId, getEmptyTrustStats());
  });

  if (!providerIds || providerIds.length === 0) {
    return trustMap;
  }

  const { data: reviewRows, error: reviewError } = await supabase
    .from("service_reviews")
    .select("reviewee_id, rating, feedback, created_at")
    .in("reviewee_id", providerIds)
    .order("created_at", { ascending: false });

  if (reviewError) {
    console.error("Provider review stats error:", reviewError);
  }

  (reviewRows || []).forEach(function (review) {
    const stats = trustMap.get(review.reviewee_id) || getEmptyTrustStats();
    const rating = Number(review.rating || 0);

    if (!stats._ratingTotal) stats._ratingTotal = 0;
    if (!stats._ratingCount) stats._ratingCount = 0;

    if (rating > 0) {
      stats._ratingTotal += rating;
      stats._ratingCount += 1;
      stats.totalReviews = stats._ratingCount;
      stats.averageRating = stats._ratingTotal / stats._ratingCount;
    }

    if (review.feedback && stats.recentFeedback.length < 2) {
      stats.recentFeedback.push(review.feedback);
    }

    trustMap.set(review.reviewee_id, stats);
  });

  const { data: completedRows, error: completedError } = await supabase
    .from("service_requests")
    .select("selected_provider_id")
    .in("selected_provider_id", providerIds)
    .eq("status", "completed");

  if (completedError) {
    console.error("Completed service stats error:", completedError);
  }

  (completedRows || []).forEach(function (request) {
    const stats = trustMap.get(request.selected_provider_id) || getEmptyTrustStats();
    stats.totalCompleted += 1;
    trustMap.set(request.selected_provider_id, stats);
  });

  trustMap.forEach(function (stats) {
    delete stats._ratingTotal;
    delete stats._ratingCount;
  });

  return trustMap;
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
  document.getElementById("userRole").textContent = `Client · ${profile.user_code}`;
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

async function loadRequest(userId) {
  if (!requestId) {
    showMessage("Missing request ID. Please open recommendations from My Requests.");
    return null;
  }

  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("request_id", requestId)
    .eq("client_id", userId)
    .single();

  if (error || !data) {
    console.error("Request fetch error:", error);
    showMessage("Service request not found or access denied.");
    return null;
  }

  const displayTitle = getRequestDisplayTitle(data);

  const serviceTypeText = data.service_type || "Service type not set";
  document.getElementById("requestSummary").textContent =
    `Request: ${displayTitle} · Category: ${data.category || "Category not set"} · Service Type: ${serviceTypeText} · Status: ${formatStatus(data.status)}`;
  document.getElementById("requestTitleMini").textContent = displayTitle;
  document.getElementById("requestMetaMini").textContent =
    `${data.category || "Category not set"} · ${serviceTypeText} · ${data.location || "Location not set"}`;
  document.getElementById("requestBudgetMini").textContent = formatBudget(data.budget);

  if (data.client_lat === null || data.client_lng === null) {
    showMessage(
      "This request has no GPS coordinates. Distance ranking may be limited.",
    );
  }

  return data;
}

// Dates/times in service_requests are local wall-clock values (Malaysia time).
function getRequestedWeeklySlot(request) {
  const date = String(request?.preferred_date || "").slice(0, 10);
  const time = String(request?.preferred_time || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const localDay = new Date(year, month - 1, day).getDay();
  return { dayOfWeek: localDay, time };
}

function matchesProviderWeeklyHours(providerRows, requestSlot) {
  // Legacy providers without saved hours stay visible until they set a schedule.
  // Once a provider has any saved hours, only selected days/time windows qualify.
  if (!requestSlot || !providerRows.length) return true;
  return providerRows.some((row) =>
    Number(row.day_of_week) === requestSlot.dayOfWeek &&
    requestSlot.time >= String(row.start_time).slice(0, 5) &&
    requestSlot.time < String(row.end_time).slice(0, 5)
  );
}

async function loadMatchingProviders(category) {
  const providersList = document.getElementById("providersList");
  const requestedServiceType = String(currentRequest?.service_type || "").trim();

  if (!requestedServiceType) {
    providersList.innerHTML = `<p class="muted-text">This request does not have a service type yet. Please edit the request and choose a specific service type.</p>`;
    return [];
  }

  providersList.innerHTML = `<p class="muted-text">Finding providers for ${escapeHtml(category)} · ${escapeHtml(requestedServiceType)}...</p>`;

  const { data: specializationRows, error: specializationError } = await supabase
    .from("provider_specializations")
    .select("provider_id, category, specialization")
    .eq("category", category)
    .eq("specialization", requestedServiceType);

  if (specializationError) {
    console.error("Provider specialization fetch error:", specializationError);
    providersList.innerHTML = `<p class="muted-text">Unable to load provider specializations. Please run the service specialization database setup first.</p>`;
    return [];
  }

  if (!specializationRows || specializationRows.length === 0) {
    providersList.innerHTML = `<p class="muted-text">No providers currently offer ${escapeHtml(requestedServiceType)}. Try again later or edit the request service type.</p>`;
    return [];
  }

  const specializationMap = new Map();
  specializationRows.forEach(function (row) {
    const current = specializationMap.get(row.provider_id) || [];
    current.push(row.specialization);
    specializationMap.set(row.provider_id, current);
  });

  const providerIds = [...new Set(specializationRows.map((item) => item.provider_id))];

  const { data: providerRows, error: providerError } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, role, status")
    .in("id", providerIds)
    .eq("role", "provider")
    .eq("status", "active")
    .eq("identity_verified", true);

  if (providerError) {
    console.error("Providers fetch error:", providerError);
    providersList.innerHTML = `<p class="muted-text">Unable to load providers.</p>`;
    return [];
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("provider_profiles")
    .select("*")
    .in("provider_id", providerIds)
    .eq("is_available", true);

  if (profileError) {
    console.error("Provider profile fetch error:", profileError);
    providersList.innerHTML = `<p class="muted-text">Unable to load provider profiles.</p>`;
    return [];
  }

  const profileMap = new Map();
  (profileRows || []).forEach(function (profile) {
    profileMap.set(profile.provider_id, profile);
  });

  const { data: weeklyRows, error: weeklyError } = await supabase
    .from("provider_weekly_availability")
    .select("provider_id, day_of_week, start_time, end_time")
    .in("provider_id", providerIds);
  if (weeklyError) {
    console.error("Working hours lookup error:", weeklyError);
    providersList.innerHTML = `<p class="muted-text">Unable to check provider working hours. Please run the weekly availability database setup.</p>`;
    return [];
  }
  const weeklyHoursMap = new Map();
  (weeklyRows || []).forEach((row) => {
    if (!weeklyHoursMap.has(row.provider_id)) weeklyHoursMap.set(row.provider_id, []);
    weeklyHoursMap.get(row.provider_id).push(row);
  });
  const requestedSlot = getRequestedWeeklySlot(currentRequest);

  // Exclude providers who previously declined this same request.
  const { data: declineRows, error: declineError } = await supabase
    .from("service_request_declines")
    .select("provider_id")
    .eq("request_id", currentRequest.request_id);

  if (declineError) {
    console.error("Decline history lookup error:", declineError);
  }

  const declinedProviderIds = new Set((declineRows || []).map((row) => row.provider_id));

  // Prevent double booking at the exact requested date and time.
  const { data: bookingRows, error: bookingError } = await supabase
    .from("service_requests")
    .select("selected_provider_id")
    .in("selected_provider_id", providerIds)
    .in("status", ["provider_selected", "confirmed", "in_progress"])
    .eq("preferred_date", currentRequest.preferred_date)
    .eq("preferred_time", currentRequest.preferred_time)
    .neq("request_id", currentRequest.request_id);

  if (bookingError) {
    console.error("Provider booking lookup error:", bookingError);
  }

  const busyProviderIds = new Set(
    (bookingRows || []).map((row) => row.selected_provider_id).filter(Boolean),
  );

  const trustMap = await loadProviderTrustStats(providerIds);
  const requestLat = currentRequest.client_lat === null ? null : Number(currentRequest.client_lat);
  const requestLng = currentRequest.client_lng === null ? null : Number(currentRequest.client_lng);

  return (providerRows || [])
    .filter(function (provider) {
      return profileMap.has(provider.id) &&
        !declinedProviderIds.has(provider.id) &&
        !busyProviderIds.has(provider.id) &&
        matchesProviderWeeklyHours(weeklyHoursMap.get(provider.id) || [], requestedSlot);
    })
    .map(function (provider) {
      const profile = profileMap.get(provider.id);
      const providerLat = profile.provider_lat === null ? null : Number(profile.provider_lat);
      const providerLng = profile.provider_lng === null ? null : Number(profile.provider_lng);
      const matchedSpecializations = specializationMap.get(provider.id) || [];
      const exactSkillMatch = true;
      let distanceKm = null;

      if (
        requestLat !== null &&
        requestLng !== null &&
        providerLat !== null &&
        providerLng !== null &&
        !Number.isNaN(requestLat) &&
        !Number.isNaN(requestLng) &&
        !Number.isNaN(providerLat) &&
        !Number.isNaN(providerLng)
      ) {
        distanceKm = calculateDistanceKm(requestLat, requestLng, providerLat, providerLng);
      }

      return {
        ...provider,
        profile,
        distanceKm,
        matchedSpecializations,
        exactSkillMatch,
        hasWeeklyHours: (weeklyHoursMap.get(provider.id) || []).length > 0,
        requestedSlotChecked: !!requestedSlot,
        trustStats: trustMap.get(provider.id) || getEmptyTrustStats(),
      };
    })
    .sort(sortNearestFirst);
}

function sortNearestFirst(a, b) {
  if (a.distanceKm === null && b.distanceKm === null) return 0;
  if (a.distanceKm === null) return 1;
  if (b.distanceKm === null) return -1;
  return a.distanceKm - b.distanceKm;
}

function sortProviders(providers, sortValue) {
  const sorted = [...providers];

  if (sortValue === "rating") {
    sorted.sort(function (a, b) {
      const ratingA = a.trustStats.averageRating || 0;
      const ratingB = b.trustStats.averageRating || 0;
      return ratingB - ratingA;
    });
    return sorted;
  }

  if (sortValue === "completed") {
    sorted.sort(function (a, b) {
      return (b.trustStats.totalCompleted || 0) - (a.trustStats.totalCompleted || 0);
    });
    return sorted;
  }

  sorted.sort(sortNearestFirst);
  return sorted;
}

function getFilteredProviders() {
  const query = String(document.getElementById("providerSearchInput")?.value || "")
    .trim()
    .toLowerCase();
  const distanceValue = document.getElementById("distanceFilter")?.value || "all";
  const trustValue = document.getElementById("trustFilter")?.value || "all";
  const sortValue = document.getElementById("sortSelect")?.value || "nearest";

  let providers = [...allProviders];

  if (query) {
    providers = providers.filter(function (provider) {
      const searchText = [
        provider.full_name,
        provider.user_code,
        provider.profile?.location,
        provider.profile?.bio,
        provider.matchedSpecializations?.join(" "),
        currentRequest?.category,
        currentRequest?.service_type,
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });
  }

  if (distanceValue !== "all") {
    const maxDistance = Number(distanceValue);
    providers = providers.filter(function (provider) {
      return provider.distanceKm !== null && provider.distanceKm <= maxDistance;
    });
  }

  if (trustValue === "verified") {
    providers = providers.filter((provider) => provider.profile?.is_verified === true);
  }

  if (trustValue === "topRated") {
    providers = providers.filter(function (provider) {
      return provider.trustStats.averageRating !== null && provider.trustStats.averageRating >= 4;
    });
  }

  if (trustValue === "completed") {
    providers = providers.filter((provider) => provider.trustStats.totalCompleted > 0);
  }

  return sortProviders(providers, sortValue);
}

function updateSmartFeedStats(providers) {
  const totalProviderCount = document.getElementById("totalProviderCount");
  const verifiedProviderCount = document.getElementById("verifiedProviderCount");
  const nearestDistanceText = document.getElementById("nearestDistanceText");

  if (totalProviderCount) totalProviderCount.textContent = providers.length;
  if (verifiedProviderCount) {
    verifiedProviderCount.textContent = providers.filter(
      (provider) => provider.profile?.is_verified === true,
    ).length;
  }

  const nearestProvider = providers.find((provider) => provider.distanceKm !== null);
  if (nearestDistanceText) {
    nearestDistanceText.textContent = nearestProvider
      ? formatDistance(nearestProvider.distanceKm)
      : "-";
  }
}

function renderTopMatches(providers) {
  const topMatchesList = document.getElementById("topMatchesList");
  if (!topMatchesList) return;

  // The detailed provider cards already show the ranked matches clearly.
  // Keep this area empty so the Matching Providers section does not repeat the same provider twice.
  topMatchesList.innerHTML = "";
  topMatchesList.style.display = "none";
}

function renderProviders(providers) {
  const providersList = document.getElementById("providersList");
  const resultCountBadge = document.getElementById("resultCountBadge");

  updateSmartFeedStats(allProviders);
  renderTopMatches(providers);

  if (resultCountBadge) {
    resultCountBadge.textContent = `${providers.length} result${providers.length === 1 ? "" : "s"}`;
  }

  if (!providers || providers.length === 0) {
    providersList.innerHTML = `
      <div class="empty-box">
        <h3>No matching providers found</h3>
        <p>Try resetting the filters, or select a different date/time. Providers must match your specialization, working hours, and requested time. Providers already booked or who declined this request are excluded.</p>
      </div>
    `;
    return;
  }

  providersList.innerHTML = providers
    .map(function (provider, index) {
      const stats = provider.trustStats || getEmptyTrustStats();

      const isVerified = provider.profile?.is_verified === true;
      const reviewLabel = `${stats.totalReviews} review${stats.totalReviews === 1 ? "" : "s"}`;
      const badgesHtml = getProviderBadges(provider);
      return `
        <article class="smart-provider-card smart-provider-card-clean">
          <div class="smart-card-main-row">
            <div class="smart-card-identity">
              <div class="match-rank">${escapeHtml(index + 1)}</div>
              <div class="smart-provider-avatar">${escapeHtml(getInitials(provider.full_name))}</div>
              <div class="smart-card-title-block">
                <h3>${escapeHtml(provider.full_name)}</h3>
                <p>${escapeHtml(provider.user_code)} · ${escapeHtml(currentRequest.category)} · ${escapeHtml(provider.exactSkillMatch ? currentRequest.service_type : (provider.matchedSpecializations?.[0] || currentRequest.service_type))}</p>
                ${getRatingDisplayHtml(stats)}
              </div>
            </div>

            <div class="smart-card-action-clean">
              <button class="btn select-provider-btn" aria-label="Select ${escapeHtml(provider.full_name)} as provider" data-provider-id="${escapeHtml(provider.id)}">
                Select Provider <span>›</span>
              </button>
            </div>
          </div>

          <p class="smart-provider-bio smart-provider-bio-clean">
            ${escapeHtml(cleanServiceLanguage(provider.profile.bio || "No bio added yet."))}
          </p>

          <div class="smart-info-strip">
            <div class="smart-info-item">
              <span class="smart-info-icon">📍</span>
              <div>
                <strong>${escapeHtml(provider.profile.location || "No location recorded")}</strong>
                <small>Location</small>
              </div>
            </div>
            <div class="smart-info-item">
              <span class="smart-info-icon">🧭</span>
              <div>
                <strong>${escapeHtml(formatDistance(provider.distanceKm))}</strong>
                <small>Distance</small>
              </div>
            </div>
            <div class="smart-info-item">
              <span class="smart-info-icon">📅</span>
              <div>
                <strong>${provider.hasWeeklyHours ? "Available" : "Hours not set"}</strong>
                <small>${provider.hasWeeklyHours && provider.requestedSlotChecked ? "At requested time" : "Availability"}</small>
              </div>
            </div>
            <div class="smart-info-item">
              <span class="smart-info-icon">🛡️</span>
              <div>
                <strong>${isVerified ? "Verified" : "Not verified"}</strong>
                <small>Trust status</small>
              </div>
            </div>
          </div>

          ${badgesHtml ? `<div class="smart-badge-row smart-badge-row-clean">${badgesHtml}</div>` : ""}


          <div class="smart-review-row-clean">
            <span>💬 ${escapeHtml(reviewLabel)}</span>
            ${getRecentFeedbackHtml(provider)}
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".select-provider-btn").forEach(function (button) {
    button.addEventListener("click", async function () {
      const providerId = this.dataset.providerId;
      await selectProvider(providerId, this);
    });
  });
}

function applyFiltersAndRender() {
  renderProviders(getFilteredProviders());
}

function setupFilters() {
  const providerSearchInput = document.getElementById("providerSearchInput");
  const distanceFilter = document.getElementById("distanceFilter");
  const trustFilter = document.getElementById("trustFilter");
  const sortSelect = document.getElementById("sortSelect");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");

  [providerSearchInput, distanceFilter, trustFilter, sortSelect].forEach(function (element) {
    if (!element) return;
    element.addEventListener("input", applyFiltersAndRender);
    element.addEventListener("change", applyFiltersAndRender);
  });

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", function () {
      if (providerSearchInput) providerSearchInput.value = "";
      if (distanceFilter) distanceFilter.value = "all";
      if (trustFilter) trustFilter.value = "all";
      if (sortSelect) sortSelect.value = "nearest";
      applyFiltersAndRender();
    });
  }
}

async function selectProvider(providerId, button) {
  clearMessage();

  if (!currentRequest) {
    showMessage("Request data is missing.");
    return;
  }

  if (currentRequest.status !== "pending") {
    showMessage("Provider can only be selected while the request is pending.");
    return;
  }

  button.disabled = true;
  button.textContent = "Selecting...";

  const { error } = await supabase.rpc("client_select_provider", {
    p_request_id: currentRequest.request_id,
    p_provider_id: providerId,
  });

  if (error) {
    console.error("Select provider error:", error);
    showMessage(error.message || "Failed to select provider.");
    button.disabled = false;
    button.textContent = "Select Provider";
    return;
  }

  await createNotification(
    providerId,
    "New request assigned",
    `${currentProfile.full_name} selected you for "${getRequestDisplayTitle(currentRequest)}".`,
  );

  showMessage(
    "Provider selected successfully. Redirecting to request details...",
    "success",
  );

  setTimeout(function () {
    window.location.href = `request-details.html?request_id=${currentRequest.request_id}`;
  }, 900);
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
  currentUser = await getSessionUser();
  if (!currentUser) return;

  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) return;

  displayUser(currentProfile);
  handleLogout();
  setupFilters();

  currentRequest = await loadRequest(currentUser.id);
  if (!currentRequest) return;

  allProviders = await loadMatchingProviders(currentRequest.category);
  renderProviders(allProviders);
});
