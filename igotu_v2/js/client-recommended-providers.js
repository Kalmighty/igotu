import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");

let currentUser = null;
let currentProfile = null;
let currentRequest = null;

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

function formatStatus(status) {
  return status ? status.replace("_", " ") : "unknown";
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


function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  return `★ ${stats.averageRating.toFixed(1)} / 5`;
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

function buildProviderTrustHtml(provider) {
  const stats = provider.trustStats || getEmptyTrustStats();
  const profile = provider.profile || {};
  const isVerified = profile.is_verified === true;
  const verifiedLabel = isVerified ? "🛡 Verified by Admin" : "🟢 Active Provider";
  const verifiedClass = isVerified ? "verified" : "active";

  const recentReviewHtml = stats.recentFeedback.length > 0
    ? `
        <div class="recent-review-list">
          ${stats.recentFeedback.map(function (feedback) {
            return `<p>“${escapeHtml(feedback)}”</p>`;
          }).join("")}
        </div>
      `
    : `<p class="muted-text trust-note">No review comments yet.</p>`;

  return `
    <div class="provider-trust-box">
      <div class="trust-summary-grid">
        <span><strong>${getRatingLabel(stats)}</strong><small>Average rating</small></span>
        <span><strong>${stats.totalReviews}</strong><small>Total reviews</small></span>
        <span><strong>${stats.totalCompleted}</strong><small>Completed services</small></span>
        <span class="trust-badge ${verifiedClass}">${verifiedLabel}</span>
      </div>
      ${recentReviewHtml}
    </div>
  `;
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

async function loadRequest(userId) {
  if (!requestId) {
    showMessage("Missing request ID.");
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

  document.getElementById("requestSummary").textContent =
    `Request: ${data.title} · Category: ${data.category} · Status: ${formatStatus(data.status)}`;

  if (data.client_lat === null || data.client_lng === null) {
    showMessage(
      "This request has no GPS coordinates. Please create a new request using the map/GPS location.",
    );
  }

  return data;
}

async function loadMatchingProviders(category) {
  const providersList = document.getElementById("providersList");

  providersList.innerHTML = `<p class="muted-text">Searching nearby providers with ${category} skill...</p>`;

  const { data: skillRows, error: skillError } = await supabase
    .from("provider_skills")
    .select("provider_id, category")
    .eq("category", category);

  if (skillError) {
    console.error("Skills fetch error:", skillError);
    providersList.innerHTML = `<p class="muted-text">Unable to load provider skills.</p>`;
    return [];
  }

  if (!skillRows || skillRows.length === 0) {
    providersList.innerHTML = `<p class="muted-text">No providers found for this category yet.</p>`;
    return [];
  }

  const providerIds = [...new Set(skillRows.map((item) => item.provider_id))];

  const { data: providerRows, error: providerError } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, role, status")
    .in("id", providerIds)
    .eq("role", "provider")
    .eq("status", "active");

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

  const trustMap = await loadProviderTrustStats(providerIds);

  const requestLat =
    currentRequest.client_lat === null
      ? null
      : Number(currentRequest.client_lat);
  const requestLng =
    currentRequest.client_lng === null
      ? null
      : Number(currentRequest.client_lng);

  const matchedProviders = (providerRows || [])
    .filter(function (provider) {
      return profileMap.has(provider.id);
    })
    .map(function (provider) {
      const profile = profileMap.get(provider.id);

      const providerLat =
        profile.provider_lat === null ? null : Number(profile.provider_lat);
      const providerLng =
        profile.provider_lng === null ? null : Number(profile.provider_lng);

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
        distanceKm = calculateDistanceKm(
          requestLat,
          requestLng,
          providerLat,
          providerLng,
        );
      }

      return {
        ...provider,
        profile: profile,
        distanceKm: distanceKm,
        trustStats: trustMap.get(provider.id) || getEmptyTrustStats(),
      };
    })
    .sort(function (a, b) {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;

      return a.distanceKm - b.distanceKm;
    });

  return matchedProviders;
}

function renderProviders(providers) {
  const providersList = document.getElementById("providersList");

  if (!providers || providers.length === 0) {
    providersList.innerHTML = `
            <div class="empty-box">
                <h3>No matching providers found</h3>
                <p>No available provider currently has the skill needed for this request.</p>
            </div>
        `;
    return;
  }

  providersList.innerHTML = providers
    .map(function (provider, index) {
      return `
            <div class="provider-card">
                <div class="provider-main">
                    <div class="provider-avatar">👤</div>

                    <div>
                        <div class="card-topline">
                            <span class="status-pill">#${index + 1} Nearest Match</span>
                            <span class="status-pill">${formatDistance(provider.distanceKm)}</span>
                        </div>

                        <h3>${escapeHtml(provider.full_name)}</h3>
                        <p class="muted-text">${escapeHtml(provider.user_code)}</p>
                        <p>${escapeHtml(provider.profile.bio || "No bio added yet.")}</p>

                        <div class="provider-meta">
                            <span>📍 ${escapeHtml(provider.profile.location || "No location recorded")}</span>
                            <span>✅ Available</span>
                            <span>🧭 ${formatDistance(provider.distanceKm)}</span>
                        </div>

                        ${buildProviderTrustHtml(provider)}
                    </div>
                </div>

                <div class="provider-action">
                    <button class="btn select-provider-btn" data-provider-id="${provider.id}">
                        Select Provider
                    </button>
                </div>
            </div>
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

  const { error } = await supabase
    .from("service_requests")
    .update({
      selected_provider_id: providerId,
      status: "provider_selected",
    })
    .eq("request_id", currentRequest.request_id)
    .eq("client_id", currentUser.id)
    .eq("status", "pending");

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
    `${currentProfile.full_name} selected you for "${currentRequest.title}".`
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
  currentUser = await getSessionUser();
  if (!currentUser) return;

  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) return;

  displayUser(currentProfile);
  handleLogout();

  currentRequest = await loadRequest(currentUser.id);
  if (!currentRequest) return;

  const providers = await loadMatchingProviders(currentRequest.category);
  renderProviders(providers);
});
