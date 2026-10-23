import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

const L = window.L;

let currentUser = null;
let currentProfile = null;
let providerReviews = [];
let assignmentPaymentMap = new Map();

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
        <div class="request-image-box">
            <h4>Submitted Image</h4>
            <a href="${imageUrl}" target="_blank" rel="noopener noreferrer">
                <img src="${imageUrl}" alt="Submitted request image" class="request-submitted-image">
            </a>
            <a href="${imageUrl}" target="_blank" rel="noopener noreferrer" class="proof-open-link">Open image</a>
        </div>
    `;
}


function formatMoney(amount) {
    return `RM ${Number(amount || 0).toFixed(2)}`;
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

function getPaymentProofUrl(payment) {
    if (!payment) return null;
    return payment.proof_url || payment.proof_payment_url || null;
}

function isImageProof(url) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(url);
}

function buildPaymentProofPreview(payment) {
    const proofUrl = getPaymentProofUrl(payment);

    if (!proofUrl) {
        return `<p class="muted-text">Proof payment: Not uploaded.</p>`;
    }

    if (isImageProof(proofUrl)) {
        return `
            <div class="payment-proof-preview compact-proof-preview">
                <a href="${proofUrl}" target="_blank" rel="noopener noreferrer">
                    <img src="${proofUrl}" alt="Payment proof" class="payment-proof-image">
                </a>
                <a href="${proofUrl}" target="_blank" rel="noopener noreferrer" class="proof-open-link">Open proof payment</a>
            </div>
        `;
    }

    return `
        <p>
            <strong>Proof payment:</strong>
            <a href="${proofUrl}" target="_blank" rel="noopener noreferrer">Open uploaded file</a>
        </p>
    `;
}

function buildProviderPaymentBox(request) {
    const payment = assignmentPaymentMap.get(request.request_id);

    if (!payment) {
        return `
            <div class="payment-visibility-box pending-payment-box">
                <h4>Payment Status</h4>
                <p class="muted-text">No payment record has been saved by the client yet.</p>
            </div>
        `;
    }

    return `
        <div class="payment-visibility-box recorded-payment-box">
            <div class="payment-visibility-header">
                <h4>Payment Recorded</h4>
                <span class="status-pill">Recorded</span>
            </div>

            <div class="details-grid">
                <span>Amount: <strong>${formatMoney(payment.amount)}</strong></span>
                <span>Method: <strong>${payment.payment_method || "-"}</strong></span>
                <span>Recorded: <strong>${formatDateTime(payment.created_at)}</strong></span>
            </div>

            ${buildPaymentProofPreview(payment)}
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
            <button type="button" class="star-btn" data-value="1">★</button>
            <button type="button" class="star-btn" data-value="2">★</button>
            <button type="button" class="star-btn" data-value="3">★</button>
            <button type="button" class="star-btn" data-value="4">★</button>
            <button type="button" class="star-btn" data-value="5">★</button>
        </div>
        <input type="hidden" name="rating">
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
                });

                ratingText.textContent = `${rating} star${rating > 1 ? "s" : ""} selected`;
            });
        });
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

    if (data.role !== "provider" || data.status !== "active") {
        await supabase.auth.signOut();
        window.location.href = "../login.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Provider · ${profile.user_code}`;
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

async function loadProviderReviews(requestIds) {
    if (!requestIds || requestIds.length === 0) {
        providerReviews = [];
        return;
    }

    const { data, error } = await supabase
        .from("service_reviews")
        .select("*")
        .eq("reviewer_id", currentUser.id)
        .in("request_id", requestIds);

    if (error) {
        console.error("Provider reviews error:", error);
        providerReviews = [];
        return;
    }

    providerReviews = data || [];
}

function getExistingReview(requestId) {
    return providerReviews.find(function(review) {
        return review.request_id === requestId;
    });
}


async function loadAssignmentPayments(requestIds) {
    assignmentPaymentMap = new Map();

    if (!requestIds || requestIds.length === 0) {
        return;
    }

    const { data, error } = await supabase
        .from("payment_records")
        .select("*")
        .in("request_id", requestIds);

    if (error) {
        console.error("Assignment payment records error:", error);
        return;
    }

    (data || []).forEach(function(payment) {
        assignmentPaymentMap.set(payment.request_id, payment);
    });
}

async function loadAssignments() {
    const assignmentsList = document.getElementById("assignmentsList");

    assignmentsList.innerHTML = `<p class="muted-text">Loading assignments...</p>`;

    const { data: requests, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("selected_provider_id", currentUser.id)
        .in("status", ["confirmed", "in_progress", "completed"])
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Assignments error:", error);
        assignmentsList.innerHTML = `<p class="muted-text">Unable to load assignments.</p>`;
        return;
    }

    if (!requests || requests.length === 0) {
        assignmentsList.innerHTML = `
            <div class="empty-box">
                <h3>No assignments yet</h3>
                <p>Confirmed and active service requests will appear here.</p>
            </div>
        `;
        return;
    }

    const requestIds = requests.map(function(request) {
        return request.request_id;
    });

    await loadProviderReviews(requestIds);
    await loadAssignmentPayments(requestIds);

    const clientIds = [...new Set(requests.map(request => request.client_id))];

    const { data: clients } = await supabase
        .from("users")
        .select("id, full_name, user_code, identity_verified")
        .in("id", clientIds);

    const clientMap = new Map();

    (clients || []).forEach(function(client) {
        clientMap.set(client.id, client);
    });

    assignmentsList.innerHTML = requests.map(function(request) {
        const client = clientMap.get(request.client_id);

        let actionHtml = "";

        if (request.status === "confirmed") {
            actionHtml = `
                <button class="btn start-btn" data-request-id="${request.request_id}">
                    Start Service
                </button>
            `;
        }

        if (request.status === "in_progress") {
            actionHtml = `
                <span class="status-note">Waiting for client to mark completed</span>
            `;
        }

        if (request.status === "completed") {
            actionHtml = buildProviderReviewSection(request, client);
        }

        const messageActionHtml = client
            ? `
                <a href="messages.html?request_id=${request.request_id}" class="btn btn-outline">
                    Message Client
                </a>
                <a href="report.html?request_id=${request.request_id}" class="danger-btn btn-outline-danger">
                    Report Issue
                </a>
            `
            : "";

        const paymentHtml = buildProviderPaymentBox(request);

        const mapHtml = hasValidCoordinates(request)
            ? `
                <div class="assignment-map-box">
                    <h4>Client Service Location</h4>
                    <div id="assignmentMap-${request.request_id}" class="assignment-map"></div>
                    <p class="map-status">
                        Latitude: ${Number(request.client_lat).toFixed(7)} · Longitude: ${Number(request.client_lng).toFixed(7)}
                    </p>
                </div>
            `
            : `
                <div class="assignment-map-box">
                    <h4>Client Service Location</h4>
                    <p class="muted-text">No GPS coordinate saved for this request.</p>
                </div>
            `;

        return `
            <div class="incoming-card assignment-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${formatStatus(request.status)}</span>
                        <span>${request.request_id}</span>
                    </div>

                    <h3>${request.title}</h3>

                    <p class="muted-text">
                        Client:
                        <strong>${client ? client.full_name : "Unknown Client"}</strong>
                        ${client ? `· ${client.user_code}` : ""}
                        ${client?.identity_verified ? '<span class="status-pill verified-pill client-verified-inline">✓ Identity Verified</span>' : '<span class="status-pill warning-pill client-verified-inline">Not Verified</span>'}
                    </p>

                    <p>${request.description}</p>

                    ${buildRequestImagePreview(request)}

                    <div class="details-grid">
                        <span>Category: <strong>${request.category}</strong></span>
                        <span>Service Type: <strong>${request.service_type || "Not specified"}</strong></span>
                        <span>Priority: <strong>${request.priority}</strong></span>
                        <span>Date: <strong>${request.preferred_date}</strong></span>
                        <span>Time: <strong>${request.preferred_time}</strong></span>
                        <span>Budget: <strong>${formatBudget(request.budget)}</strong></span>
                        <span>Location: <strong>${request.location}</strong></span>
                    </div>

                    ${paymentHtml}

                    ${mapHtml}

                    ${request.status === "completed" ? `<div class="status-note completed-note completed-inside">Completed</div>` : ""}
                </div>

                <div class="incoming-actions wide-actions">
                    ${messageActionHtml}
                    ${actionHtml}
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".start-btn").forEach(function(button) {
        button.addEventListener("click", async function() {
            await startRequest(this.dataset.requestId, this);
        });
    });

    document.querySelectorAll(".provider-review-form").forEach(function(form) {
        form.addEventListener("submit", saveProviderReview);
    });

    setupStarRatings();

    setTimeout(function() {
        renderAssignmentMaps(requests);
    }, 200);
}

function renderAssignmentMaps(requests) {
    if (!L) return;

    requests.forEach(function(request) {
        if (!hasValidCoordinates(request)) return;

        const mapId = `assignmentMap-${request.request_id}`;
        const mapElement = document.getElementById(mapId);

        if (!mapElement) return;

        const lat = Number(request.client_lat);
        const lng = Number(request.client_lng);

        const assignmentMap = L.map(mapId).setView([lat, lng], 16);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(assignmentMap);

        L.marker([lat, lng]).addTo(assignmentMap)
            .bindPopup("Client service location")
            .openPopup();

        setTimeout(function() {
            assignmentMap.invalidateSize();
        }, 250);
    });
}

function buildProviderReviewSection(request, client) {
    const existingReview = getExistingReview(request.request_id);

    if (existingReview) {
        return `
            <div class="success-box compact-success">
                <h3>Review Submitted</h3>
                <p><strong>Rating:</strong> ${existingReview.rating} / 5</p>
                <p><strong>Feedback:</strong> ${existingReview.feedback || "No feedback provided."}</p>
            </div>
        `;
    }

    if (!client) {
        return `
            <div class="empty-box">
                <h3>Cannot review</h3>
                <p>Client information is missing.</p>
            </div>
        `;
    }

    return `
        <form class="provider-review-form mini-form" data-request-id="${request.request_id}" data-client-id="${client.id}">
            <h3>Review Client</h3>
            <p class="muted-text">Share your feedback about ${client.full_name}.</p>

            <div class="form-group">
                <label>Rating</label>
                ${getStarRatingHtml()}
            </div>

            <div class="form-group">
                <label>Feedback</label>
                <textarea name="feedback" placeholder="Write your feedback..." required></textarea>
            </div>

            <button type="submit" class="btn">Submit Review</button>
        </form>
    `;
}

async function startRequest(requestId, button) {
    clearMessage();

    const confirmStart = confirm("Start this service request?");

    if (!confirmStart) return;

    button.disabled = true;
    button.textContent = "Starting...";

    const { data: requestData } = await supabase
        .from("service_requests")
        .select("request_id, title, client_id")
        .eq("request_id", requestId)
        .single();

    const { error } = await supabase.rpc("provider_start_request", {
        p_request_id: requestId
    });

    if (error) {
        console.error("Start error:", error);
        showMessage(error.message || "Failed to start service.");
        button.disabled = false;
        button.textContent = "Start Service";
        return;
    }

    if (requestData) {
        await createNotification(
            requestData.client_id,
            "Service started",
            `${currentProfile.full_name} started working on your request "${requestData.title}".`
        );
    }

    showMessage("Service started successfully.", "success");

    setTimeout(function() {
        loadAssignments();
    }, 700);
}

async function saveProviderReview(event) {
    event.preventDefault();
    clearMessage();

    const form = event.target;
    const requestIdValue = form.dataset.requestId;
    const clientId = form.dataset.clientId;
    const rating = Number(form.querySelector('input[name="rating"]').value);
    const feedback = form.querySelector('textarea[name="feedback"]').value.trim();
    const button = form.querySelector("button[type='submit']");

    if (!rating || rating < 1 || rating > 5) {
        showMessage("Please select a star rating.");
        return;
    }

    if (!feedback) {
        showMessage("Please enter your feedback.");
        return;
    }

    button.disabled = true;
    button.textContent = "Submitting...";

    const { error } = await supabase
        .from("service_reviews")
        .insert({
            request_id: requestIdValue,
            reviewer_id: currentUser.id,
            reviewee_id: clientId,
            rating: rating,
            feedback: feedback
        });

    if (error) {
        console.error("Provider review error:", error);
        showMessage(error.message || "Failed to submit review.");
        button.disabled = false;
        button.textContent = "Submit Review";
        return;
    }

    await createNotification(
        clientId,
        "New review received",
        `${currentProfile.full_name} submitted a review for your completed request.`
    );

    showMessage("Review submitted successfully.", "success");

    setTimeout(function() {
        loadAssignments();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    currentProfile = await getProfile(currentUser.id);
    if (!currentProfile) return;

    displayUser(currentProfile);
    handleLogout();
    loadAssignments();
});
