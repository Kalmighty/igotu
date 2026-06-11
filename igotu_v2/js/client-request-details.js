import { supabase } from "./supabaseClient.js";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");

let currentUser = null;
let currentRequest = null;
let selectedProvider = null;
let existingPayment = null;
let existingReview = null;

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
        console.error("Payment fetch error:", error);
        return null;
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
        console.error("Review fetch error:", error);
        return null;
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
    existingPayment = await getPayment(data.request_id);
    existingReview = await getClientReview(data.request_id);

    renderRequest(data, selectedProvider);
}

function renderRequest(request, provider) {
    document.getElementById("requestTitle").textContent = `${request.request_id} · ${request.title}`;
    document.getElementById("requestStatus").textContent = formatStatus(request.status);

    const providerHtml = provider ?
        `
            <div class="detail-card">
                <span>Selected Provider</span>
                <strong>${provider.full_name}</strong>
                <p>${provider.user_code} · ${provider.email}</p>
            </div>
        ` :
        `
            <div class="detail-card">
                <span>Selected Provider</span>
                <strong>No provider selected yet</strong>
                <p>You can select a provider from the recommendation page.</p>
            </div>
        `;

    let actionHtml = "";

    if (request.status === "pending") {
        actionHtml = `
            <a href="recommended-providers.html?request_id=${request.request_id}" class="btn">
                View Recommended Providers
            </a>
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

    document.getElementById("requestDetailsArea").innerHTML = `
        <div class="details-grid big-details">
            <div class="detail-card">
                <span>Category</span>
                <strong>${request.category}</strong>
            </div>

            <div class="detail-card">
                <span>Priority</span>
                <strong>${request.priority}</strong>
            </div>

            <div class="detail-card">
                <span>Preferred Date</span>
                <strong>${request.preferred_date}</strong>
            </div>

            <div class="detail-card">
                <span>Preferred Time</span>
                <strong>${request.preferred_time}</strong>
            </div>

            <div class="detail-card">
                <span>Budget</span>
                <strong>${formatBudget(request.budget)}</strong>
            </div>

            <div class="detail-card">
                <span>Location</span>
                <strong>${request.location}</strong>
            </div>
        </div>

        <div class="description-box">
            <h3>Description</h3>
            <p>${request.description}</p>
        </div>

        ${providerHtml}

        <div class="action-row">
            ${actionHtml}
        </div>

        ${completedHtml}
    `;

    const completeBtn = document.getElementById("completeRequestBtn");

    if (completeBtn) {
        completeBtn.addEventListener("click", completeRequest);
    }

    const paymentForm = document.getElementById("paymentForm");

    if (paymentForm) {
        paymentForm.addEventListener("submit", savePayment);
    }

    const reviewForm = document.getElementById("reviewForm");

    if (reviewForm) {
        reviewForm.addEventListener("submit", saveReview);
    }
}

function buildCompletedSection(request, provider) {
    if (!provider) {
        return `
            <div class="sub-panel">
                <h3>Payment and Review</h3>
                <p class="muted-text">Provider information is missing, so payment and review cannot be recorded.</p>
            </div>
        `;
    }

    const paymentHtml = existingPayment ?
        `
            <div class="success-box">
                <h3>Payment Recorded</h3>
                <p><strong>Amount:</strong> RM ${Number(existingPayment.amount).toFixed(2)}</p>
                <p><strong>Method:</strong> ${existingPayment.payment_method}</p>
            </div>
        ` :
        `
            <form id="paymentForm" class="mini-form">
                <h3>Record Offline Payment</h3>
                <p class="muted-text">Use this after you have paid the provider outside the system.</p>

                <div class="two-column">
                    <div class="form-group">
                        <label for="paymentAmount">Amount Paid (RM)</label>
                        <input type="number" id="paymentAmount" min="0" step="0.01" value="${request.budget || ""}" required>
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

                <button type="submit" class="btn" id="savePaymentBtn">Save Payment Record</button>
            </form>
        `;

    const reviewHtml = existingReview ?
        `
            <div class="success-box">
                <h3>Your Review Submitted</h3>
                <p><strong>Rating:</strong> ${existingReview.rating} / 5</p>
                <p><strong>Feedback:</strong> ${existingReview.feedback || "No feedback provided."}</p>
            </div>
        ` :
        `
            <form id="reviewForm" class="mini-form">
                <h3>Review Provider</h3>
                <p class="muted-text">Share your feedback about ${provider.full_name}.</p>

                <div class="form-group">
                    <label for="rating">Rating</label>
                    <select id="rating" required>
                        <option value="">Select rating</option>
                        <option value="5">5 - Excellent</option>
                        <option value="4">4 - Good</option>
                        <option value="3">3 - Average</option>
                        <option value="2">2 - Poor</option>
                        <option value="1">1 - Very Poor</option>
                    </select>
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
    const saveBtn = document.getElementById("savePaymentBtn");

    if (!amount || amount < 0) {
        showMessage("Please enter a valid payment amount.");
        return;
    }

    if (!method) {
        showMessage("Please select a payment method.");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving payment...";

    const { error } = await supabase
        .from("payment_records")
        .insert({
            request_id: currentRequest.request_id,
            client_id: currentUser.id,
            provider_id: currentRequest.selected_provider_id,
            amount: amount,
            payment_method: method
        });

    if (error) {
        console.error("Payment insert error:", error);
        showMessage(error.message || "Failed to save payment record.");
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

    const rating = Number(document.getElementById("rating").value);
    const feedback = document.getElementById("feedback").value.trim();
    const saveBtn = document.getElementById("saveReviewBtn");

    if (!rating || rating < 1 || rating > 5) {
        showMessage("Please select a valid rating.");
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

    showMessage("Review submitted successfully.", "success");

    setTimeout(function() {
        loadRequest();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    loadRequest();
});