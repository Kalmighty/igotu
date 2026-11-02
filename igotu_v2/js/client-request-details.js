import { serviceParticipants } from "./backend-access.js";
import { prepareReceiptPreviews, receiptHtml, bindReceiptButtons } from "./payment-receipts.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import { askCancellationReason } from "./service-action-dialogs.js";

const L = window.L;

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");

let currentUser = null;
let currentRequest = null;
let selectedProvider = null;
let existingPayment = null;
let existingReview = null;
let settlementLoaded = false;
let requestMap = null;
let mapResizeObserver = null;
let requestLoading = false;
let mutationBusy = false;
let providerUnavailable = false;

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

const statusLabels = {
  pending: "Pending",
  provider_selected: "Provider Selected",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const detailsMedia = matchMedia("(min-width: 1251px)");
const cardOrder = [
  "summary",
  "actions",
  "provider",
  "service",
  "location",
  "image",
  "payment",
  "review",
  "information",
];
function detailsIcon(name) {
  return `<svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#dashboard-${name}"/></svg>`;
}
function detailCard(name, title, content) {
  const icons = {
    actions: "bolt",
    provider: "users",
    service: "list",
    location: "pin",
    image: "image",
    information: "info",
    payment: "money",
    review: "star",
  };
  return `<section class="panel details-card details-${name}" data-details-card="${name}" aria-labelledby="${name}Heading"><h2 id="${name}Heading">${detailsIcon(icons[name] || "info")}${title}</h2>${content}</section>`;
}
function detailRow(label, value) {
  return `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}
function serviceDate(value) {
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
function serviceTime(value) {
  const m =
    typeof value === "string" &&
    /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!m || +m[1] > 23 || +m[2] > 59) return "Time not specified";
  return `${+m[1] % 12 || 12}:${m[2]} ${+m[1] < 12 ? "AM" : "PM"}`;
}
function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return "";
  const day = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return (
    new Intl.DateTimeFormat("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date(time)) + " MYT"
  );
}
function timelineHtml(request) {
  const created = timestamp(request.created_at);
  if (request.status === "cancelled")
    return `<section class="details-progress" aria-label="Service progress"><ol class="details-timeline details-timeline-cancelled"><li class="done"><span aria-hidden="true">✓</span><strong>Request Created</strong>${created ? `<small>${escapeHtml(created)}</small>` : ""}</li><li class="cancelled" aria-current="step"><span aria-hidden="true">×</span><strong>Cancelled</strong><small>No further progress is implied.</small></li></ol></section>`;
  const states = [
      "pending",
      "provider_selected",
      "confirmed",
      "in_progress",
      "completed",
    ],
    labels = [
      "Request Created",
      "Provider Selected",
      "Confirmed",
      "In Progress",
      "Completed",
    ],
    index = states.indexOf(request.status);
  if (index < 0)
    return '<p class="details-notice">Progress is unavailable for this request status.</p>';
  return `<section class="details-progress" aria-label="Service progress"><ol class="details-timeline">${states.map((state, i) => `<li class="${i <= index ? "done" : "future"} ${i === index ? "current" : ""}" ${i === index ? 'aria-current="step"' : ""}><span aria-hidden="true">${i <= index ? "✓" : i + 1}</span><strong>${labels[i]}</strong><small class="details-stage-state">${i === index ? "Current stage" : i < index ? "Reached" : "Not reached"}</small>${i === 0 && created ? `<small>${escapeHtml(created)}</small>` : ""}</li>`).join("")}</ol></section>`;
}
function disposeMap() {
  mapResizeObserver?.disconnect();
  mapResizeObserver = null;
  if (requestMap) {
    requestMap.remove();
    requestMap = null;
  }
}
function layoutDetailsCards() {
  const area = document.getElementById("requestDetailsArea");
  if (!area) return;
  const cards = new Map(
    [...area.querySelectorAll("[data-details-card]")].map((card) => [
      card.dataset.detailsCard,
      card,
    ]),
  );
  if (!cards.size) return;
  const active = area.contains(document.activeElement)
    ? document.activeElement
    : null;
  if (detailsMedia.matches) {
    let main = area.querySelector(":scope > .details-main"),
      side = area.querySelector(":scope > .details-side");
    if (!main) {
      main = document.createElement("div");
      main.className = "details-main";
      side = document.createElement("div");
      side.className = "details-side";
      area.append(main, side);
    }
    ["summary", "service", "location", "image", "information"].forEach(
      (name) => {
        if (cards.has(name)) main.append(cards.get(name));
      },
    );
    ["provider", "actions", "payment", "review"].forEach((name) => {
      if (cards.has(name)) side.append(cards.get(name));
    });
  } else {
    cardOrder.forEach((name) => {
      if (cards.has(name)) area.append(cards.get(name));
    });
    area
      .querySelectorAll(":scope > .details-main,:scope > .details-side")
      .forEach((node) => node.remove());
  }
  active?.focus({ preventScroll: true });
  requestMap?.invalidateSize({ pan: false });
}
detailsMedia.addEventListener("change", layoutDetailsCards);
function renderLoadError(message, retry = true) {
  disposeMap();
  currentRequest = null;
  document.getElementById("requestDetailsArea").innerHTML =
    `<section class="panel details-state"><h2 id="requestTitle">Request details unavailable</h2><span id="requestStatus" class="status-pill">Unavailable</span><p>${escapeHtml(message)}</p>${retry ? '<button type="button" class="btn btn-outline" id="retryRequestBtn">Try Again</button>' : '<a class="btn btn-outline" href="my-requests.html">Back to My Requests</a>'}</section>`;
  showMessage(message);
  document.getElementById("retryRequestBtn")?.addEventListener("click", () => {
    if (!mutationBusy) {
      clearMessage();
      void loadRequest();
    }
  });
}
function confirmCompletion() {
  return new Promise((resolve) => {
    const dialog = document.getElementById("completeRequestDialog"),
      keep = document.getElementById("keepRequestOpenBtn"),
      confirm = document.getElementById("confirmCompleteBtn"),
      opener = document.activeElement;
    let result = false;
    const finish = () => {
      dialog.removeEventListener("close", finish);
      keep.removeEventListener("click", onKeep);
      confirm.removeEventListener("click", onConfirm);
      dialog.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
      resolve(result);
    };
    const onKeep = () => dialog.close();
    const onConfirm = () => {
      result = true;
      dialog.close();
    };
    const onKey = (event) => {
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === keep) {
        event.preventDefault();
        confirm.focus();
      } else if (!event.shiftKey && document.activeElement === confirm) {
        event.preventDefault();
        keep.focus();
      }
    };
    dialog.addEventListener("close", finish);
    keep.addEventListener("click", onKeep);
    confirm.addEventListener("click", onConfirm);
    dialog.addEventListener("keydown", onKey);
    dialog.showModal();
    keep.focus();
  });
}
async function guardSettlement(event, kind, save) {
  event.preventDefault();
  const button = document.getElementById(
    kind === "payment" ? "savePaymentBtn" : "saveReviewBtn",
  );
  if (
    mutationBusy ||
    !button ||
    button.disabled ||
    !settlementLoaded ||
    !selectedProvider ||
    currentRequest?.status !== "completed" ||
    (kind === "payment" ? existingPayment : existingReview)
  )
    return;
  mutationBusy = true;
  try {
    await save(event);
  } catch {
    button.disabled = true;
    showMessage(
      `${kind === "payment" ? "Payment" : "Review"} save could not be confirmed. Refresh to check existing records before submitting again.`,
    );
  } finally {
    mutationBusy = false;
  }
}

function formatStatus(status) {
  return Object.hasOwn(statusLabels, status)
    ? statusLabels[status]
    : typeof status === "string" && status
      ? status.replaceAll("_", " ")
      : "Status unavailable";
}

function formatBudget(budget) {
  if (budget === null || budget === undefined || budget === "")
    return "Open budget";
  return Number.isFinite(Number(budget)) && Number(budget) >= 0
    ? `RM ${Number(budget).toFixed(2)}`
    : "Budget unavailable";
}

function getRequestImageUrl(request) {
  if (!request) return null;

  return request.request_image_url || null;
}

function buildRequestImagePreview(request) {
  const url = safeUrl(getRequestImageUrl(request));
  if (!url)
    return '<div class="details-empty"><p>No service image uploaded</p></div>';
  return `<div class="details-image-preview"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open submitted service image"><img id="serviceRequestImage" src="${escapeHtml(url)}" alt="Submitted service request image"></a><p id="serviceImageError" hidden role="status">The service image could not load. You can try opening the original image.</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" aria-label="Open Image in a new tab">Open Image ${detailsIcon("arrow")}</a></div>`;
}

function hasValidCoordinates(request) {
  const lat = request?.client_lat,
    lng = request?.client_lng;
  return (
    ["number", "string"].includes(typeof lat) &&
    ["number", "string"].includes(typeof lng) &&
    lat != null &&
    lng != null &&
    String(lat).trim() !== "" &&
    String(lng).trim() !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lng) >= -180 &&
    Number(lng) <= 180
  );
}

function getStarRatingHtml() {
    return `
        <div class="star-rating">
            <button type="button" class="star-btn" data-value="1" aria-label="1 out of 5 stars" aria-pressed="false">★</button>
            <button type="button" class="star-btn" data-value="2" aria-label="2 out of 5 stars" aria-pressed="false">★</button>
            <button type="button" class="star-btn" data-value="3" aria-label="3 out of 5 stars" aria-pressed="false">★</button>
            <button type="button" class="star-btn" data-value="4" aria-label="4 out of 5 stars" aria-pressed="false">★</button>
            <button type="button" class="star-btn" data-value="5" aria-label="5 out of 5 stars" aria-pressed="false">★</button>
        </div>
        <input type="hidden" name="rating" id="rating">
        <p class="rating-text">No rating selected</p>
    `;
}

function setupStarRatings(container = document) {
    container.querySelectorAll(".star-rating").forEach(function(ratingBox) {
        if (ratingBox.dataset.ready === "true") return;

        ratingBox.dataset.ready = "true";

        const form = ratingBox.closest("form");
        const input = form.querySelector('input[name="rating"]');
        const ratingText = form.querySelector(".rating-text");
        const stars = ratingBox.querySelectorAll(".star-btn");

        stars.forEach(function(star) {
            star.addEventListener("click", function() {
                const rating = Number(this.dataset.value);
                input.value = rating;

                stars.forEach(function(item) {
                    const value = Number(item.dataset.value);
                    item.classList.toggle("active", value <= rating);
                    item.setAttribute("aria-pressed", String(value === rating));
                });

                ratingText.textContent = `${rating} star${rating > 1 ? "s" : ""} selected`;
            });
        });
    });
}

function getFileExtension(fileName) {
    return fileName.split(".").pop().toLowerCase();
}

function isImageProof(url) {
  return /\.(jpg|jpeg|png|webp)$/i.test(url || "");
}

function getPaymentProofHtml(payment) { return receiptHtml(payment); }

function requiresPaymentProof(method) {
    return method === "QR Transfer" || method === "Bank Transfer";
}

function updatePaymentProofRequirement() {
    const method = document.getElementById("paymentMethod");
    const proofInput = document.getElementById("paymentProof");
    const proofNote = document.getElementById("paymentProofNote");
    const proofBadge = document.getElementById("paymentProofBadge");

    if (!method || !proofInput || !proofNote || !proofBadge) return;

    if (requiresPaymentProof(method.value)) {
        proofInput.required = true;
        proofBadge.textContent = "Required";
        proofBadge.style.background = "#fef3c7";
        proofBadge.style.color = "#92400e";
        proofNote.textContent = "Upload a receipt or transfer screenshot for this payment method.";
        return;
    }

    proofInput.required = false;
    proofBadge.textContent = "Optional";
    proofBadge.style.background = "#ecfdf3";
    proofBadge.style.color = "#087443";
    proofNote.textContent = "For cash payments, proof is optional because payment is given directly to the provider.";
}

async function uploadPaymentProof(file) {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ];

    const maxFileSize = 5 * 1024 * 1024;

    if (!file) {
        throw new Error("Please upload proof payment.");
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Proof payment must be JPG, PNG, WEBP, or PDF.");
    }

    if (file.size > maxFileSize) {
        throw new Error("Proof payment must be 5MB or below.");
    }

    const extension = getFileExtension(file.name);
    const filePath = `${currentUser.id}/${currentRequest.request_id}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
        });

    if (uploadError) {
        throw new Error("Payment proof could not be uploaded. Please try again.");
    }

    return { proofPath: filePath };
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

async function getProvider(providerId) {
  providerUnavailable = false;
  if (!providerId) return null;
  try {
    const { data, error } = await serviceParticipants([requestId]);
    if (error || !Array.isArray(data)) throw new Error();
    const provider = data.find((person) => person.id === providerId) || null;
    providerUnavailable = !provider;
    return provider;
  } catch {
    providerUnavailable = true;
    return null;
  }
}

async function getPayment(requestIdValue) {
    const { data, error } = await supabase
        .from("payment_records")
        .select("payment_id,request_id,client_id,provider_id,amount,payment_method,reference_number,created_at")
        .eq("request_id", requestIdValue)
        .maybeSingle();

    if (error) {
        throw new Error("Payment status could not be checked.");
    }

    return data ? (await prepareReceiptPreviews([data]))[0] : null;
}

async function getClientReview(requestIdValue) {
    const { data, error } = await supabase
        .from("service_reviews")
        .select("*")
        .eq("request_id", requestIdValue)
        .eq("reviewer_id", currentUser.id)
        .maybeSingle();

    if (error) {
        throw new Error("Review status could not be checked.");
    }

    return data;
}

async function loadRequest() {
  if (requestLoading) return;
  requestLoading = true;
  document
    .getElementById("requestDetailsArea")
    .setAttribute("aria-busy", "true");
  try {
    if (!requestId) {
      renderLoadError("Missing request ID.", false);
      return;
    }
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("request_id", requestId)
      .eq("client_id", currentUser.id)
      .single();
    if (error || !data || data.client_id !== currentUser.id) {
      renderLoadError("Request not found or access denied.");
      return;
    }
    currentRequest = data;
    selectedProvider = await getProvider(data.selected_provider_id);
    settlementLoaded = false;
    existingPayment = null;
    existingReview = null;
    try {
      existingPayment = await getPayment(data.request_id);
      existingReview = await getClientReview(data.request_id);
      settlementLoaded = true;
    } catch {
      showMessage(
        "Payment or review status could not be checked. Refresh before recording another payment or review.",
      );
    }
    renderRequest(data, selectedProvider);
  } catch {
    renderLoadError(
      "Unable to load request details. Your request has not been changed.",
    );
  } finally {
    requestLoading = false;
    document
      .getElementById("requestDetailsArea")
      .setAttribute("aria-busy", "false");
    document.body.dataset.detailsReady = "true";
  }
}

function refreshPaymentProofUI() {
  updatePaymentProofRequirement();
  const method = document.getElementById("paymentMethod"),
    note = document.getElementById("paymentProofNote");
  if (method && note && method.value === "Other")
    note.textContent =
      "Proof is optional for this payment method. Record only a payment already made outside IGotU.";
  else if (method && note && !method.value)
    note.textContent =
      "Choose a payment method to see whether proof is required.";
}
function renderRequest(request, provider) {
  disposeMap();
  const id = escapeHtml(encodeURIComponent(request.request_id));
  const known = Object.hasOwn(statusLabels, request.status),
    status = known ? request.status : "unknown";
  let actions = "";
  if (request.status === "pending")
    actions = `<a class="btn" href="recommended-providers.html?request_id=${id}">View Recommended Providers</a><a class="btn btn-outline" href="create-request.html?request_id=${id}">Edit Request</a>`;
  if (["pending", "provider_selected", "confirmed"].includes(request.status))
    actions +=
      '<button type="button" class="danger-btn" id="cancelRequestBtn">Cancel Request</button>';
  if (request.status === "in_progress")
    actions +=
      '<button type="button" class="btn" id="completeRequestBtn">Mark as Completed</button>';
  if (request.status === "completed")
    actions = `<p class="details-notice">${!settlementLoaded ? "Service completed. Check payment and review status below before recording anything further." : existingPayment && existingReview ? "Service completed. Your payment record and review are available below." : "Service completed. You can record an offline payment and leave a review below where still outstanding."}</p>`;
  if (request.status === "cancelled")
    actions =
      '<p class="details-notice">This request is cancelled and remains in your history.</p>';
  if (!known)
    actions =
      '<p class="details-notice">Actions are unavailable for this request status. Refresh to check the latest information.</p>';
  // Preserve the existing report eligibility, including cancelled requests with a known participant.
  if (provider && request.status !== "pending")
    actions += `<a href="report.html?request_id=${id}" class="btn btn-outline details-report">Report Issue</a>`;
  const providerContent = provider
    ? `<div class="details-provider-person"><span class="details-provider-avatar" aria-hidden="true">${escapeHtml(
        String(provider.full_name || "P")
          .charAt(0)
          .toUpperCase(),
      )}</span><div><h3>${escapeHtml(provider.full_name || "Selected Provider")}</h3><p>${escapeHtml(provider.user_code || "")}</p><p>Request status: ${escapeHtml(formatStatus(request.status))}</p></div></div>${request.status !== "cancelled" ? `<a class="btn btn-outline" href="messages.html?request_id=${id}">Message Provider</a>` : ""}`
    : `<div class="details-empty"><h3>${providerUnavailable ? "Selected Provider information unavailable" : "No Provider selected yet"}</h3><p>${providerUnavailable ? "Refresh to try the authorised participant lookup again." : request.status === "pending" ? "Use View Recommended Providers in Request Actions to choose a suitable Provider." : "No selected Provider information is available for this request."}</p></div>`;
  const summary = `<section class="panel details-card details-summary" data-details-card="summary"><div class="details-summary-heading"><span class="details-service-icon" aria-hidden="true">${detailsIcon("list")}</span><div><h2 id="requestTitle">${escapeHtml(request.title || "Service request")}</h2><p class="details-request-id">${escapeHtml(request.request_id)}</p><div class="details-tags"><span>${escapeHtml(request.category || "Category not specified")}</span><span>${escapeHtml(request.service_type || "Service type not specified")}</span></div></div><span id="requestStatus" class="status-pill status-${status}">${escapeHtml(formatStatus(request.status))}</span></div>${timelineHtml(request)}${request.status === "cancelled" && request.cancellation_reason ? `<div class="details-cancellation"><strong>Cancellation reason</strong><p>${escapeHtml(request.cancellation_reason)}</p></div>` : ""}</section>`;
  const service = detailCard(
    "service",
    "Service Details",
    `<dl class="details-fields">${detailRow("Service Title", request.title || "Service request")}${detailRow("Description", request.description || "No description provided.")}${detailRow("Category", request.category || "Not specified")}${detailRow("Service Type", request.service_type || "Not specified")}${detailRow("Priority", request.priority || "Not specified")}${detailRow("Budget", formatBudget(request.budget))}${detailRow("Preferred Date", serviceDate(request.preferred_date))}${detailRow("Preferred Time", serviceTime(request.preferred_time))}</dl>`,
  );
  const location = detailCard(
    "location",
    "Service Location",
    `<p class="details-location-address">${detailsIcon("pin")}${escapeHtml(request.location || "Address not specified")}</p>${hasValidCoordinates(request) ? '<div id="requestLocationMap" role="region" aria-label="Service request location map"></div><p id="requestMapStatus" class="details-help" role="status">Loading the service location map…</p>' : '<p class="details-notice">Location coordinates are unavailable for this request.</p>'}`,
  );
  const information = detailCard(
    "information",
    "Request Information",
    `<dl class="details-fields">${detailRow("Request ID", request.request_id)}${timestamp(request.created_at) ? detailRow("Created On", timestamp(request.created_at)) : ""}${timestamp(request.updated_at) ? detailRow("Last Updated", timestamp(request.updated_at)) : ""}</dl>`,
  );
  document.getElementById("requestDetailsArea").innerHTML =
    summary +
    detailCard("actions", "Request Actions", actions) +
    detailCard("provider", "Selected Provider", providerContent) +
    service +
    location +
    detailCard("image", "Service Image", buildRequestImagePreview(request)) +
    information +
    buildCompletedSection(request, provider);
  layoutDetailsCards();
  document
    .getElementById("completeRequestBtn")
    ?.addEventListener("click", completeRequest);
  document
    .getElementById("cancelRequestBtn")
    ?.addEventListener("click", cancelRequest);
  bindReceiptButtons(
    document.getElementById("requestDetailsArea"),
    existingPayment ? [existingPayment] : [],
    showMessage,
  );
  document
    .getElementById("paymentForm")
    ?.addEventListener("submit", (event) =>
      guardSettlement(event, "payment", savePayment),
    );
  document
    .getElementById("paymentMethod")
    ?.addEventListener("change", refreshPaymentProofUI);
  refreshPaymentProofUI();
  document
    .getElementById("reviewForm")
    ?.addEventListener("submit", (event) =>
      guardSettlement(event, "review", saveReview),
    );
  setupStarRatings();
  const image = document.getElementById("serviceRequestImage");
  image?.addEventListener("error", () => {
    image.hidden = true;
    document.getElementById("serviceImageError").hidden = false;
  });
  if (hasValidCoordinates(request)) initRequestLocationMap(request);
}

async function cancelRequest() {
  if (
    mutationBusy ||
    !currentRequest ||
    !["pending", "provider_selected", "confirmed"].includes(
      currentRequest.status,
    )
  )
    return;
  const button = document.getElementById("cancelRequestBtn");
  if (!button || button.disabled) return;
  mutationBusy = true;
  clearMessage();
  try {
    const reason = await askCancellationReason();
    if (!reason) return;
    button.disabled = true;
    button.textContent = "Cancelling…";
    const { error } = await supabase.rpc("client_cancel_request", {
      p_request_id: currentRequest.request_id,
      p_reason: reason,
    });
    if (error) {
      showMessage(
        "Unable to cancel this request. Refresh to check its latest status before trying again.",
      );
      button.disabled = false;
      button.textContent = "Cancel Request";
      return;
    }
    showMessage(
      "Request cancelled. It remains available in your request history.",
      "success",
    );
    await loadRequest();
  } catch {
    showMessage(
      "Cancellation could not be confirmed. Refresh before trying again.",
    );
  } finally {
    mutationBusy = false;
  }
}

function initRequestLocationMap(request) {
  const node = document.getElementById("requestLocationMap"),
    status = document.getElementById("requestMapStatus");
  if (!node || !hasValidCoordinates(request)) return;
  try {
    if (!L) throw new Error();
    requestMap = L.map(node).setView(
      [Number(request.client_lat), Number(request.client_lng)],
      16,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    })
      .on("tileerror", () => {
        if (status.isConnected)
          status.textContent =
            "Map tiles could not load. The recorded address and location marker remain available. Use Refresh details to try again.";
      })
      .addTo(requestMap);
    L.marker([Number(request.client_lat), Number(request.client_lng)])
      .addTo(requestMap)
      .bindPopup("Service request location");
    const resize = () => requestMap?.invalidateSize({ pan: false });
    if (typeof ResizeObserver === "function") {
      mapResizeObserver = new ResizeObserver(resize);
      mapResizeObserver.observe(node);
    }
    setTimeout(resize, 150);
    status.textContent =
      "Recorded service location. Use the map controls to explore.";
  } catch {
    disposeMap();
    node.hidden = true;
    status.textContent =
      "The map could not load. The recorded service address is shown above.";
  }
}

function buildCompletedSection(request, provider) {
  if (request.status !== "completed")
    return (
      detailCard(
        "payment",
        "Payment (Offline)",
        '<p class="details-notice">Offline payment recording is available after service completion.</p>',
      ) +
      detailCard(
        "review",
        "Your Review",
        '<p class="details-notice">Review recording is available after service completion.</p>',
      )
    );
  if (!settlementLoaded)
    return (
      detailCard(
        "payment",
        "Payment (Offline)",
        '<p class="details-notice">Payment and review unavailable. Refresh to check existing records before submitting another payment or review.</p>',
      ) +
      detailCard(
        "review",
        "Your Review",
        '<p class="details-notice">Review status could not be checked. Refresh before submitting another review.</p>',
      )
    );
  if (!provider)
    return (
      detailCard(
        "payment",
        "Payment (Offline)",
        '<p class="details-notice">Provider information is missing, so payment and review cannot be recorded.</p>',
      ) +
      detailCard(
        "review",
        "Your Review",
        '<p class="details-notice">Refresh to check the selected Provider before recording a review.</p>',
      )
    );
  const paymentHtml = existingPayment
    ? `
            <div class="success-box">
                <h3>Payment Recorded</h3>
                <p><strong>Amount:</strong> RM ${escapeHtml(Number(existingPayment.amount).toFixed(2))}</p>
                <p><strong>Method:</strong> ${escapeHtml(existingPayment.payment_method)}</p>
                ${timestamp(existingPayment.created_at) ? `<p><strong>Recorded:</strong> ${escapeHtml(timestamp(existingPayment.created_at))}</p>` : ""}
                ${getPaymentProofHtml(existingPayment)}
            </div>
        `
    : `
            <form id="paymentForm" class="mini-form">
                <h3>Record Offline Payment</h3>
                <p class="muted-text">Record the actual amount paid outside IGotU. This form does not process or transfer money.</p>

                <div class="two-column">
                    <div class="form-group">
                        <label for="paymentAmount">Amount Paid (RM)</label>
                        <input type="number" id="paymentAmount" min="0" step="0.01" value="" required>
                    </div>

                    <div class="form-group">
                        <label for="paymentMethod">Payment Method</label>
                        <select id="paymentMethod" required>
                            <option value="">Select method</option>
                            <option value="Cash">Cash</option>
                            <option value="QR Transfer">QR Transfer</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px;">
                        <label for="paymentProof" style="margin: 0;">Proof Payment</label>
                        <span id="paymentProofBadge" style="display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 12px; background: #ecfdf3; color: #087443; font-size: 13px; font-weight: 800;">Optional</span>
                    </div>

                    <input type="file" id="paymentProof" accept="image/jpeg,image/png,image/webp,application/pdf">



                    <p class="muted-text" id="paymentProofNote" style="margin-top: 10px; font-size: 14px; line-height: 1.45;">For cash payments, proof is optional because payment is given directly to the provider.</p>
                    <p class="muted-text" style="margin-top: 4px; font-size: 13px; line-height: 1.4;">Accepted: JPG, PNG, WEBP, or PDF. Maximum 5MB.</p>
                </div>

                <button type="submit" class="btn" id="savePaymentBtn">Save Payment Record</button>
            </form>
        `;

  const reviewHtml = existingReview
    ? `
            <div class="success-box">
                <h3>Your Review Submitted</h3>
                ${timestamp(existingReview.created_at) ? `<p><strong>Reviewed:</strong> ${escapeHtml(timestamp(existingReview.created_at))}</p>` : ""}
                <p><strong>Rating:</strong> ${escapeHtml(existingReview.rating)} / 5</p>
                <p><strong>Feedback:</strong> ${escapeHtml(existingReview.feedback || "No feedback provided.")}</p>
            </div>
        `
    : `
            <form id="reviewForm" class="mini-form">
                <h3>Review Provider</h3>
                <p class="muted-text">Share your feedback about ${escapeHtml(provider.full_name)}.</p>

                <div class="form-group">
                    <label>Rating</label>
                    ${getStarRatingHtml()}
                </div>

                <div class="form-group">
                    <label for="feedback">Feedback</label>
                    <textarea id="feedback" placeholder="Write your feedback..." required></textarea>
                </div>

                <button type="submit" class="btn" id="saveReviewBtn">Submit Review</button>
            </form>
        `;

  return (
    detailCard("payment", "Payment (Offline)", paymentHtml) +
    detailCard("review", "Your Review", reviewHtml)
  );
}

async function completeRequest() {
  if (mutationBusy || currentRequest?.status !== "in_progress") return;
  const button = document.getElementById("completeRequestBtn");
  if (!button || button.disabled) return;
  mutationBusy = true;
  clearMessage();
  try {
    if (!(await confirmCompletion())) return;
    button.disabled = true;
    button.textContent = "Completing…";
    const { error } = await supabase.rpc("client_complete_request", {
      p_request_id: currentRequest.request_id,
    });
    if (error) {
      showMessage(
        "Unable to complete this request. Refresh to check its latest status before trying again.",
      );
      button.disabled = false;
      button.textContent = "Mark as Completed";
      return;
    }
    showMessage("Request marked as completed.", "success");
    await loadRequest();
  } catch {
    showMessage(
      "Completion could not be confirmed. Refresh before trying again.",
    );
  } finally {
    mutationBusy = false;
  }
}

async function savePayment(event) {
    event.preventDefault();
    clearMessage();

    const amount = Number(document.getElementById("paymentAmount").value);
    const method = document.getElementById("paymentMethod").value;
    const proofInput = document.getElementById("paymentProof");
    const proofFile = proofInput && proofInput.files.length > 0 ? proofInput.files[0] : null;
    const saveBtn = document.getElementById("savePaymentBtn");

    if (!amount || amount < 0) {
        showMessage("Please enter a valid payment amount.");
        return;
    }

    if (!method) {
        showMessage("Please select a payment method.");
        return;
    }

    if (requiresPaymentProof(method) && !proofFile) {
        showMessage("Please upload proof payment.");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = proofFile ? "Uploading proof..." : "Saving payment...";

    let proofData = {
        proofPath: null
    };

    if (proofFile) {
        try {
            proofData = await uploadPaymentProof(proofFile);
        } catch (error) {
            showMessage(error.message || "Failed to upload proof payment.");
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Payment Record";
            return;
        }
    }

    saveBtn.textContent = "Saving payment...";

    const { error } = await supabase
        .from("payment_records")
        .insert({
            request_id: currentRequest.request_id,
            client_id: currentUser.id,
            provider_id: currentRequest.selected_provider_id,
            amount: amount,
            payment_method: method,
            proof_path: proofData.proofPath,
            proof_uploaded_at: proofData.proofPath ? new Date().toISOString() : null
        });

    if (error) {
        showMessage("Failed to save payment record. Refresh to check existing records before retrying.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Payment Record";
        return;
    }



    showMessage("Payment record saved successfully.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
}

async function saveReview(event) {
    event.preventDefault();
    clearMessage();

    const rating = Number(document.querySelector('#reviewForm input[name="rating"]').value);
    const feedback = document.getElementById("feedback").value.trim();
    const saveBtn = document.getElementById("saveReviewBtn");

    if (!rating || rating < 1 || rating > 5) {
        showMessage("Please select a star rating.");
        return;
    }

    if (!feedback) {
        showMessage("Please enter your feedback.");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Submitting review...";

    const { error } = await supabase
        .from("service_reviews")
        .insert({
            request_id: currentRequest.request_id,
            reviewer_id: currentUser.id,
            reviewee_id: currentRequest.selected_provider_id,
            rating: rating,
            feedback: feedback
        });

    if (error) {
        showMessage("Failed to submit review. Refresh to check existing records before retrying.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Submit Review";
        return;
    }



    showMessage("Review submitted successfully.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function () {
  if (!(await authorizeWorkspace()).allowed) return;
  currentUser = await getSessionUser();
  if (!currentUser) return;

  const profile = await getProfile(currentUser.id);
  if (!profile) return;

  displayUser(profile);
  document.getElementById("refreshRequestBtn").addEventListener("click", () => {
    if (!mutationBusy && !requestLoading) {
      clearMessage();
      void loadRequest();
    }
  });
  handleLogout();
  loadRequest();
});
