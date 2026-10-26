import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";
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

function formatBudget(budget) {
    if (budget === null || budget === undefined || budget === "") {
        return "Open";
    }

    return `RM ${Number(budget).toFixed(2)}`;
}

function getRequestImageUrl(request) {
    if (!request) return null;

    return request.request_image_url || null;
}

function buildRequestImagePreview(request) {
    const imageUrl = getRequestImageUrl(request);

    if (!imageUrl) return "";

    return `
        <div class="description-box">
            <h3>Submitted Image</h3>
            <div class="request-image-box flat-request-image-box">
                <a href="${escapeHtml(safeUrl(imageUrl))}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(safeUrl(imageUrl))}" alt="Submitted request image" class="request-submitted-image">
                </a>
                <a href="${escapeHtml(safeUrl(imageUrl))}" target="_blank" rel="noopener noreferrer" class="proof-open-link">Open image</a>
            </div>
        </div>
    `;
}

function hasValidCoordinates(request) {
    return (
        request.client_lat !== null &&
        request.client_lng !== null &&
        request.client_lat !== undefined &&
        request.client_lng !== undefined &&
        !Number.isNaN(Number(request.client_lat)) &&
        !Number.isNaN(Number(request.client_lng))
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

function getPaymentProofHtml(payment) {
    if (!payment || !payment.proof_url) {
        return `<p><strong>Proof:</strong> No proof uploaded.</p>`;
    }

    if (isImageProof(payment.proof_url)) {
        return `
            <div class="payment-proof-preview">
                <p><strong>Proof:</strong></p>
                <a href="${escapeHtml(safeUrl(payment.proof_url))}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(safeUrl(payment.proof_url))}" alt="Payment proof" class="payment-proof-image" style="width: 100%; max-width: 420px; border-radius: 12px; border: 1px solid #edf1ee; margin-top: 8px;">
                </a>
                <p><a href="${escapeHtml(safeUrl(payment.proof_url))}" target="_blank" rel="noopener noreferrer">Open proof payment</a></p>
            </div>
        `;
    }

    return `
        <p>
            <strong>Proof:</strong>
            <a href="${escapeHtml(safeUrl(payment.proof_url))}" target="_blank" rel="noopener noreferrer">Open proof payment</a>
        </p>
    `;
}

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
        console.error("Payment proof upload error:", uploadError);
        throw new Error(uploadError.message || "Failed to upload proof payment.");
    }

    const { data } = supabase.storage
        .from("payment-proofs")
        .getPublicUrl(filePath);

    return {
        proofPath: filePath,
        proofUrl: data.publicUrl
    };
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
    if (!providerId) return null;

    const { data, error } = await supabase
        .from("users")
        .select("id, user_code, full_name, email")
        .eq("id", providerId)
        .maybeSingle();

    if (error) {
        console.error("Provider fetch error:", error);
        return null;
    }

    return data;
}

async function getPayment(requestIdValue) {
    const { data, error } = await supabase
        .from("payment_records")
        .select("*")
        .eq("request_id", requestIdValue)
        .maybeSingle();

    if (error) {
        throw new Error("Payment status could not be checked.");
    }

    return data;
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
    if (!requestId) {
        showMessage("Missing request ID.");
        return;
    }

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("request_id", requestId)
        .eq("client_id", currentUser.id)
        .single();

    if (error || !data) {
        console.error("Request fetch error:", error);
        showMessage("Request not found or access denied.");
        return;
    }

    currentRequest = data;
    selectedProvider = await getProvider(data.selected_provider_id);
    settlementLoaded = false;
    try {
        existingPayment = await getPayment(data.request_id);
        existingReview = await getClientReview(data.request_id);
        settlementLoaded = true;
    } catch {
        showMessage("Payment or review status could not be checked. Refresh before recording another payment or review.");
    }
    renderRequest(data, selectedProvider);
}

function renderRequest(request, provider) {
    document.getElementById("requestTitle").textContent = `${request.request_id} · ${request.title}`;
    document.getElementById("requestStatus").textContent = formatStatus(request.status);

    const providerHtml = provider
        ? `
            <div class="detail-card">
                <span>Selected Provider</span>
                <strong>${escapeHtml(provider.full_name)}</strong>
                <p>${escapeHtml(provider.user_code)} · ${escapeHtml(provider.email)}</p>
            </div>
        `
        : `
            <div class="detail-card">
                <span>Selected Provider</span>
                <strong>No provider selected yet</strong>
                <p>You can select a provider from the recommendation page.</p>
            </div>
        `;

    let actionHtml = "";

    if (request.status === "pending") {
        actionHtml = `
            <a href="recommended-providers.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}" class="btn">
                View Recommended Providers
            </a>
            <a href="create-request.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}" class="btn btn-outline">
                Edit Request
            </a>
            <button class="danger-btn" id="cancelRequestBtn">
                Cancel Request
            </button>
        `;
    }

    if (["provider_selected", "confirmed"].includes(request.status)) {
        actionHtml = `
            <button class="danger-btn" id="cancelRequestBtn">
                Cancel Request
            </button>
        `;
    }

    if (request.status === "in_progress") {
        actionHtml = `
            <button class="btn" id="completeRequestBtn">
                Mark as Completed
            </button>
        `;
    }

    let completedHtml = "";

    if (request.status === "completed") {
        completedHtml = buildCompletedSection(request, provider);
    }

    const messageActionHtml = provider && request.status !== "cancelled"
        ? `
            <a href="messages.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}" class="btn btn-outline">
                Message Provider
            </a>
        `
        : "";

    const reportActionHtml = provider && request.status !== "pending"
        ? `
            <a href="report.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}" class="danger-btn btn-outline-danger">
                Report Issue
            </a>
        `
        : "";

    const mapHtml = hasValidCoordinates(request)
        ? `
            <div class="description-box">
                <h3>Service Location Map</h3>
                <div id="requestLocationMap"></div>
                <p class="map-status">
                    Latitude: ${escapeHtml(Number(request.client_lat).toFixed(7))} · Longitude: ${escapeHtml(Number(request.client_lng).toFixed(7))}
                </p>
            </div>
        `
        : `
            <div class="description-box">
                <h3>Service Location Map</h3>
                <p class="muted-text">No GPS coordinate saved for this request.</p>
            </div>
        `;

    document.getElementById("requestDetailsArea").innerHTML = `
        <div class="details-grid big-details">
            <div class="detail-card">
                <span>Category</span>
                <strong>${escapeHtml(request.category)}</strong>
            </div>

            <div class="detail-card">
                <span>Service Type</span>
                <strong>${escapeHtml(request.service_type || "Not specified")}</strong>
            </div>

            <div class="detail-card">
                <span>Priority</span>
                <strong>${escapeHtml(request.priority)}</strong>
            </div>

            <div class="detail-card">
                <span>Preferred Date</span>
                <strong>${escapeHtml(request.preferred_date)}</strong>
            </div>

            <div class="detail-card">
                <span>Preferred Time</span>
                <strong>${escapeHtml(request.preferred_time)}</strong>
            </div>

            <div class="detail-card">
                <span>Budget</span>
                <strong>${escapeHtml(formatBudget(request.budget))}</strong>
            </div>

            <div class="detail-card">
                <span>Location</span>
                <strong>${escapeHtml(request.location)}</strong>
            </div>
        </div>

        ${request.status === "cancelled" && request.cancellation_reason ? `
            <div class="cancellation-note">
                <strong>Cancellation reason</strong>
                <span>${escapeHtml(request.cancellation_reason)}</span>
            </div>
        ` : ""}

        ${mapHtml}

        <div class="description-box">
            <h3>Description</h3>
            <p>${escapeHtml(request.description)}</p>
        </div>

        ${buildRequestImagePreview(request)}

        ${providerHtml}

        <div class="action-row">
            ${actionHtml}
            ${messageActionHtml}
            ${reportActionHtml}
        </div>

        ${completedHtml}
    `;

    const completeBtn = document.getElementById("completeRequestBtn");

    if (completeBtn) {
        completeBtn.addEventListener("click", completeRequest);
    }

    const cancelBtn = document.getElementById("cancelRequestBtn");

    if (cancelBtn) {
        cancelBtn.addEventListener("click", cancelRequest);
    }

    const paymentForm = document.getElementById("paymentForm");

    if (paymentForm) {
        paymentForm.addEventListener("submit", savePayment);
    }

    const paymentMethod = document.getElementById("paymentMethod");

    if (paymentMethod) {
        paymentMethod.addEventListener("change", updatePaymentProofRequirement);
        updatePaymentProofRequirement();
    }

    const reviewForm = document.getElementById("reviewForm");

    if (reviewForm) {
        reviewForm.addEventListener("submit", saveReview);
    }

    setupStarRatings();

    if (hasValidCoordinates(request)) {
        setTimeout(function() {
            initRequestLocationMap(request);
        }, 150);
    }
}

async function cancelRequest() {
    clearMessage();

    if (!currentRequest || !["pending", "provider_selected", "confirmed"].includes(currentRequest.status)) {
        showMessage("This request can no longer be cancelled.");
        return;
    }

    const cancellationReason = await askCancellationReason();
    if (!cancellationReason) return;

    const cancelBtn = document.getElementById("cancelRequestBtn");
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelling...";

    const { error } = await supabase.rpc("client_cancel_request", {
        p_request_id: currentRequest.request_id,
        p_reason: cancellationReason
    });

    if (error) {
        console.error("Cancel request error:", error);
        showMessage(error.message || "Failed to cancel request.");
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel Request";
        return;
    }

    if (currentRequest.selected_provider_id) {
        await createNotification(
            currentRequest.selected_provider_id,
            "Request cancelled",
            `The client cancelled the request "${currentRequest.title}". Reason: ${cancellationReason}`
        );
    }

    showMessage("Request cancelled. It remains available in your request history.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
}

function initRequestLocationMap(request) {
    if (!L) return;

    const mapElement = document.getElementById("requestLocationMap");

    if (!mapElement) return;

    if (requestMap) {
        requestMap.remove();
        requestMap = null;
    }

    const lat = Number(request.client_lat);
    const lng = Number(request.client_lng);

    requestMap = L.map("requestLocationMap").setView([lat, lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(requestMap);

    L.marker([lat, lng]).addTo(requestMap)
        .bindPopup("Service request location")
        .openPopup();

    setTimeout(function() {
        requestMap.invalidateSize();
    }, 300);
}

function buildCompletedSection(request, provider) {
    if (!settlementLoaded) return '<div class="sub-panel" role="status"><h3>Payment and review unavailable</h3><p>Refresh to check existing records before submitting another payment or review.</p></div>';
    if (!provider) {
        return `
            <div class="sub-panel">
                <h3>Payment and Review</h3>
                <p class="muted-text">Provider information is missing, so payment and review cannot be recorded.</p>
            </div>
        `;
    }

    const paymentHtml = existingPayment
        ? `
            <div class="success-box">
                <h3>Payment Recorded</h3>
                <p><strong>Amount:</strong> RM ${escapeHtml(Number(existingPayment.amount).toFixed(2))}</p>
                <p><strong>Method:</strong> ${escapeHtml(existingPayment.payment_method)}</p>
                ${getPaymentProofHtml(existingPayment)}
            </div>
        `
        : `
            <form id="paymentForm" class="mini-form">
                <h3>Record Offline Payment</h3>
                <p class="muted-text">Use this after you have paid the provider outside the system.</p>

                <div class="two-column">
                    <div class="form-group">
                        <label for="paymentAmount">Amount Paid (RM)</label>
                        <input type="number" id="paymentAmount" min="0" step="0.01" value="${escapeHtml(request.budget || "")}" required>
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

    return `
        <div class="sub-panel">
            <h2>Payment and Review</h2>
            <div class="two-column">
                ${paymentHtml}
                ${reviewHtml}
            </div>
        </div>
    `;
}

async function completeRequest() {
    clearMessage();

    const confirmComplete = confirm("Mark this request as completed?");

    if (!confirmComplete) return;

    const completeBtn = document.getElementById("completeRequestBtn");
    completeBtn.disabled = true;
    completeBtn.textContent = "Completing...";

    const { error } = await supabase.rpc("client_complete_request", {
        p_request_id: currentRequest.request_id
    });

    if (error) {
        console.error("Complete error:", error);
        showMessage(error.message || "Failed to complete request.");
        completeBtn.disabled = false;
        completeBtn.textContent = "Mark as Completed";
        return;
    }

    await createNotification(
        currentRequest.selected_provider_id,
        "Request completed",
        `The client marked "${currentRequest.title}" as completed.`
    );

    showMessage("Request marked as completed.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
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
        proofUrl: null,
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
            proof_url: proofData.proofUrl,
            proof_path: proofData.proofPath,
            proof_uploaded_at: new Date().toISOString()
        });

    if (error) {
        console.error("Payment insert error:", error);
        showMessage(error.message || "Failed to save payment record.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Payment Record";
        return;
    }

    await createNotification(
        currentRequest.selected_provider_id,
        "Payment recorded",
        `Payment for "${currentRequest.title}" has been recorded by the client.`
    );

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
        console.error("Review insert error:", error);
        showMessage(error.message || "Failed to submit review.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Submit Review";
        return;
    }

    await createNotification(
        currentRequest.selected_provider_id,
        "New review received",
        `The client submitted a review for "${currentRequest.title}".`
    );

    showMessage("Review submitted successfully.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function() {
    if (!(await authorizeWorkspace()).allowed) return;
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    loadRequest();
});
