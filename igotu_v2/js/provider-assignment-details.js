import { supabase } from "./supabaseClient.js";

let currentUser = null;
let providerReviews = [];

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

    const clientIds = [...new Set(requests.map(request => request.client_id))];

    const { data: clients } = await supabase
        .from("users")
        .select("id, full_name, user_code")
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

                return `
            <div class="incoming-card">
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
                    </p>

                    <p>${request.description}</p>

                    <div class="details-grid">
                        <span>Category: <strong>${request.category}</strong></span>
                        <span>Priority: <strong>${request.priority}</strong></span>
                        <span>Date: <strong>${request.preferred_date}</strong></span>
                        <span>Time: <strong>${request.preferred_time}</strong></span>
                        <span>Budget: <strong>${formatBudget(request.budget)}</strong></span>
                        <span>Location: <strong>${request.location}</strong></span>
                    </div>

                    ${request.status === "completed" ? `<div class="status-note completed-note completed-inside">Completed</div>` : ""}
                </div>

                <div class="incoming-actions wide-actions">
                    ${actionHtml}
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".start-btn").forEach(function (button) {
        button.addEventListener("click", async function () {
            await startRequest(this.dataset.requestId, this);
        });
    });

    document.querySelectorAll(".provider-review-form").forEach(function (form) {
        form.addEventListener("submit", saveProviderReview);
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
                <select name="rating" required>
                    <option value="">Select rating</option>
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Average</option>
                    <option value="2">2 - Poor</option>
                    <option value="1">1 - Very Poor</option>
                </select>
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

    showMessage("Service started successfully.", "success");

    setTimeout(function () {
        loadAssignments();
    }, 700);
}

async function saveProviderReview(event) {
    event.preventDefault();
    clearMessage();

    const form = event.target;
    const requestIdValue = form.dataset.requestId;
    const clientId = form.dataset.clientId;
    const rating = Number(form.querySelector('select[name="rating"]').value);
    const feedback = form.querySelector('textarea[name="feedback"]').value.trim();
    const button = form.querySelector("button");

    if (!rating || rating < 1 || rating > 5) {
        showMessage("Please select a valid rating.");
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

    showMessage("Review submitted successfully.", "success");

    setTimeout(function () {
        loadAssignments();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    loadAssignments();
});