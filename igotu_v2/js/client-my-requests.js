import { supabase } from "./supabaseClient.js";

let currentUser = null;
let allRequests = [];

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

async function loadRequests() {
    const requestsList = document.getElementById("requestsList");

    requestsList.innerHTML = `<p class="muted-text">Loading requests...</p>`;

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", currentUser.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load requests error:", error);
        requestsList.innerHTML = `<p class="muted-text">Unable to load requests.</p>`;
        return;
    }

    allRequests = data || [];
    renderRequests();
}

function renderRequests() {
    const requestsList = document.getElementById("requestsList");
    const statusFilter = document.getElementById("statusFilter").value;

    let filteredRequests = allRequests;

    if (statusFilter !== "all") {
        filteredRequests = allRequests.filter(function(request) {
            return request.status === statusFilter;
        });
    }

    if (filteredRequests.length === 0) {
        requestsList.innerHTML = `
            <div class="empty-box">
                <h3>No requests found</h3>
                <p>No service requests match this filter.</p>
            </div>
        `;
        return;
    }

    requestsList.innerHTML = filteredRequests.map(function(request) {
        let actionHtml = `
            <a href="request-details.html?request_id=${request.request_id}" class="btn btn-small">
                View Details
            </a>
        `;

        if (request.status === "pending") {
            actionHtml += `
                <button class="danger-btn btn-small cancel-btn" data-request-id="${request.request_id}">
                    Cancel
                </button>
            `;
        }

        return `
            <div class="incoming-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${formatStatus(request.status)}</span>
                        <span>${request.request_id}</span>
                    </div>

                    <h3>${request.title}</h3>
                    <p>${request.description}</p>

                    <div class="details-grid">
                        <span>Category: <strong>${request.category}</strong></span>
                        <span>Priority: <strong>${request.priority}</strong></span>
                        <span>Date: <strong>${request.preferred_date}</strong></span>
                        <span>Time: <strong>${request.preferred_time}</strong></span>
                        <span>Budget: <strong>${formatBudget(request.budget)}</strong></span>
                        <span>Location: <strong>${request.location}</strong></span>
                    </div>
                </div>

                <div class="incoming-actions">
                    ${actionHtml}
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".cancel-btn").forEach(function(button) {
        button.addEventListener("click", async function() {
            await cancelRequest(this.dataset.requestId, this);
        });
    });
}

async function cancelRequest(requestId, button) {
    clearMessage();

    const confirmCancel = confirm("Are you sure you want to cancel this request?");

    if (!confirmCancel) return;

    button.disabled = true;
    button.textContent = "Cancelling...";

    const { error } = await supabase.rpc("client_cancel_request", {
        p_request_id: requestId
    });

    if (error) {
        console.error("Cancel request error:", error);
        showMessage(error.message || "Failed to cancel request.");
        button.disabled = false;
        button.textContent = "Cancel";
        return;
    }

    showMessage("Request cancelled successfully.", "success");

    setTimeout(function() {
        loadRequests();
    }, 700);
}

function handleFilter() {
    const statusFilter = document.getElementById("statusFilter");

    statusFilter.addEventListener("change", function() {
        renderRequests();
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    handleFilter();
    loadRequests();
});