import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";
import { askDeclineReason } from "./service-action-dialogs.js";

let currentUser = null;
let currentProfile = null;

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

function formatStatus(status) {
    return status.replace("_", " ");
}

function formatBudget(budget) {
    if (budget === null || budget === undefined || budget === "") {
        return "Open";
    }

    return `RM ${Number(budget).toFixed(2)}`;
}

function getApproximateArea(location) {
    const parts = String(location || "").split(",").map(part => part.trim()).filter(Boolean);
    if (!parts.length) return "Area not provided";
    return parts.slice(-3).join(", ");
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
            <a href="${escapeHtml(safeUrl(imageUrl))}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeHtml(safeUrl(imageUrl))}" alt="Submitted request image" class="request-submitted-image">
            </a>
            <a href="${escapeHtml(safeUrl(imageUrl))}" target="_blank" rel="noopener noreferrer" class="proof-open-link">Open image</a>
        </div>
    `;
}

async function loadIncomingRequests() {
    const incomingList = document.getElementById("incomingList");

    incomingList.innerHTML = `<p class="muted-text">Loading incoming requests...</p>`;

    const { data: requests, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("selected_provider_id", currentUser.id)
        .eq("status", "provider_selected")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Incoming requests error:", error);
        incomingList.innerHTML = `<p class="muted-text">Unable to load incoming requests.</p>`;
        return;
    }

    if (!requests || requests.length === 0) {
        incomingList.innerHTML = `
            <div class="empty-box">
                <h3>No incoming requests</h3>
                <p>You have no assigned service requests waiting for confirmation.</p>
            </div>
        `;
        return;
    }

    const clientIds = [...new Set(requests.map(request => request.client_id))];

    const { data: clients } = await supabase
        .from("users")
        .select("id, full_name, user_code, identity_verified")
        .in("id", clientIds);

    const clientMap = new Map();

    (clients || []).forEach(function(client) {
        clientMap.set(client.id, client);
    });

    incomingList.innerHTML = requests.map(function(request) {
                const client = clientMap.get(request.client_id);

                return `
            <div class="incoming-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${escapeHtml(formatStatus(request.status))}</span>
                        <span>${escapeHtml(request.request_id)}</span>
                    </div>

                    <h3>${escapeHtml(request.title)}</h3>

                    <p class="muted-text">
                        Client:
                        <strong>${escapeHtml(client ? client.full_name : "Unknown Client")}</strong>
                        ${escapeHtml(client ? `· ${client.user_code}` : "")}
                        ${client?.identity_verified ? '<span class="status-pill verified-pill client-verified-inline">✓ Identity Verified</span>' : '<span class="status-pill warning-pill client-verified-inline">Not Verified</span>'}
                    </p>

                    <p>${escapeHtml(request.description)}</p>

                    ${buildRequestImagePreview(request)}

                    <div class="details-grid">
                        <span>Category: <strong>${escapeHtml(request.category)}</strong></span>
                        <span>Service Type: <strong>${escapeHtml(request.service_type || "Not specified")}</strong></span>
                        <span>Priority: <strong>${escapeHtml(request.priority)}</strong></span>
                        <span>Date: <strong>${escapeHtml(request.preferred_date)}</strong></span>
                        <span>Time: <strong>${escapeHtml(request.preferred_time)}</strong></span>
                        <span>Budget: <strong>${escapeHtml(formatBudget(request.budget))}</strong></span>
                        <span>Approximate Area: <strong>${escapeHtml(getApproximateArea(request.location))}</strong></span>
                        <span class="location-privacy-inline">🔒 Exact location unlocks after confirmation</span>
                    </div>
                </div>

                <div class="incoming-actions">
                    <button class="btn confirm-btn" data-request-id="${escapeHtml(request.request_id)}">
                        Confirm
                    </button>

                    <button class="danger-btn decline-btn" data-request-id="${escapeHtml(request.request_id)}">
                        Decline
                    </button>

                    <a class="btn btn-outline report-issue-btn" href="report.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}">
                        Report Issue
                    </a>
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".confirm-btn").forEach(function (button) {
        button.addEventListener("click", async function () {
            await confirmRequest(this.dataset.requestId, this);
        });
    });

    document.querySelectorAll(".decline-btn").forEach(function (button) {
        button.addEventListener("click", async function () {
            await declineRequest(this.dataset.requestId, this);
        });
    });
}

async function confirmRequest(requestId, button) {
    clearMessage();

    button.disabled = true;
    button.textContent = "Confirming...";

    const { data: requestData } = await supabase
        .from("service_requests")
        .select("request_id, title, client_id")
        .eq("request_id", requestId)
        .single();

    const { error } = await supabase.rpc("provider_confirm_request", {
        p_request_id: requestId
    });

    if (error) {
        console.error("Confirm error:", error);
        showMessage(error.message || "Failed to confirm request.");
        button.disabled = false;
        button.textContent = "Confirm";
        return;
    }

    if (requestData) {
        await createNotification(
            requestData.client_id,
            "Request confirmed",
            `${currentProfile.full_name} confirmed your request "${requestData.title}".`
        );

    }

    showMessage("Request confirmed successfully.", "success");

    setTimeout(function () {
        loadIncomingRequests();
    }, 700);
}

async function declineRequest(requestId, button) {
    clearMessage();

    const declineReason = await askDeclineReason();
    if (!declineReason) return;

    button.disabled = true;
    button.textContent = "Declining...";

    const { data: requestData } = await supabase
        .from("service_requests")
        .select("request_id, title, client_id")
        .eq("request_id", requestId)
        .single();

    const { error } = await supabase.rpc("provider_decline_request", {
        p_request_id: requestId,
        p_reason: declineReason
    });

    if (error) {
        console.error("Decline error:", error);
        showMessage(error.message || "Failed to decline request.");
        button.disabled = false;
        button.textContent = "Decline";
        return;
    }

    if (requestData) {
        await createNotification(
            requestData.client_id,
            "Request declined",
            `${currentProfile.full_name} declined your request "${requestData.title}". Reason: ${declineReason}. You can select another provider.`
        );

    }

    showMessage("Request declined. It has been returned to pending status.", "success");

    setTimeout(function () {
        loadIncomingRequests();
    }, 700);
}

document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    currentProfile = await getProfile(currentUser.id);
    if (!currentProfile) return;

    displayUser(currentProfile);
    handleLogout();
    loadIncomingRequests();
});
