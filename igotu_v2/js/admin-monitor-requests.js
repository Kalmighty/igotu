import { supabase } from "./supabaseClient.js";

const L = window.L;

let currentUser = null;
let allRequests = [];
let userMap = new Map();
let requestMaps = [];
let mapRenderVersion = 0;

function showMessage(message, type = "error") {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
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

function formatDate(dateValue) {
    if (!dateValue) return "-";

    return new Date(dateValue).toLocaleDateString("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
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

function cleanupRequestMaps() {
    requestMaps.forEach(function(map) {
        map.remove();
    });

    requestMaps = [];
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

    if (data.role !== "admin" || data.status !== "active") {
        await supabase.auth.signOut();
        window.location.href = "../login.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Admin · ${profile.user_code}`;
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

async function loadUsersForRequests(requests) {
    const ids = [];

    requests.forEach(function(request) {
        if (request.client_id) ids.push(request.client_id);
        if (request.selected_provider_id) ids.push(request.selected_provider_id);
    });

    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length === 0) {
        userMap = new Map();
        return;
    }

    const { data, error } = await supabase
        .from("users")
        .select("id, user_code, full_name, email, role")
        .in("id", uniqueIds);

    if (error) {
        console.error("Load request users error:", error);
        userMap = new Map();
        return;
    }

    userMap = new Map();

    (data || []).forEach(function(user) {
        userMap.set(user.id, user);
    });
}

async function loadRequests() {
    const requestsList = document.getElementById("requestsList");

    requestsList.innerHTML = `<p class="muted-text">Loading requests...</p>`;

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load requests error:", error);
        showMessage(error.message || "Unable to load requests.");
        requestsList.innerHTML = `<p class="muted-text">Unable to load service requests.</p>`;
        return;
    }

    allRequests = data || [];
    await loadUsersForRequests(allRequests);
    renderRequests();
}

function renderRequests() {
    cleanupRequestMaps();
    mapRenderVersion += 1;

    const requestsList = document.getElementById("requestsList");
    const currentRenderVersion = mapRenderVersion;
    const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
    const statusFilter = document.getElementById("statusFilter").value;
    const categoryFilter = document.getElementById("categoryFilter").value;

    let filteredRequests = allRequests;

    if (statusFilter !== "all") {
        filteredRequests = filteredRequests.filter(function(request) {
            return request.status === statusFilter;
        });
    }

    if (categoryFilter !== "all") {
        filteredRequests = filteredRequests.filter(function(request) {
            return request.category === categoryFilter;
        });
    }

    if (searchValue) {
        filteredRequests = filteredRequests.filter(function(request) {
            const client = userMap.get(request.client_id);
            const provider = userMap.get(request.selected_provider_id);

            const text = [
                request.request_id,
                request.title,
                request.category,
                request.location,
                client ? client.full_name : "",
                client ? client.email : "",
                client ? client.user_code : "",
                provider ? provider.full_name : "",
                provider ? provider.email : "",
                provider ? provider.user_code : ""
            ].join(" ").toLowerCase();

            return text.includes(searchValue);
        });
    }

    if (filteredRequests.length === 0) {
        requestsList.innerHTML = `
            <div class="empty-box">
                <h3>No requests found</h3>
                <p>No service requests match the selected filter.</p>
            </div>
        `;
        return;
    }

    requestsList.innerHTML = filteredRequests.map(function(request) {
        const client = userMap.get(request.client_id);
        const provider = userMap.get(request.selected_provider_id);

        const mapHtml = hasValidCoordinates(request)
            ? `
                <div class="admin-request-map-box">
                    <h4>Request Service Location</h4>
                    <div id="adminRequestMap-${request.request_id}" class="admin-request-map"></div>
                    <p class="map-status">
                        Latitude: ${Number(request.client_lat).toFixed(7)} · Longitude: ${Number(request.client_lng).toFixed(7)}
                    </p>
                </div>
            `
            : `
                <div class="admin-request-map-box">
                    <h4>Request Service Location</h4>
                    <p class="muted-text">No GPS coordinate saved for this request.</p>
                </div>
            `;

        return `
            <div class="incoming-card admin-request-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${formatStatus(request.status)}</span>
                        <span>${request.request_id}</span>
                        <span>Created: ${formatDate(request.created_at)}</span>
                    </div>

                    <h3>${request.title}</h3>
                    <p>${request.description}</p>

                    <div class="details-grid">
                        <span>Category: <strong>${request.category}</strong></span>
                        <span>Service Type: <strong>${request.service_type || "Not specified"}</strong></span>
                        <span>Priority: <strong>${request.priority}</strong></span>
                        <span>Date: <strong>${request.preferred_date}</strong></span>
                        <span>Time: <strong>${request.preferred_time}</strong></span>
                        <span>Budget: <strong>${formatBudget(request.budget)}</strong></span>
                        <span>Location: <strong>${request.location}</strong></span>
                    </div>

                    ${request.status === "cancelled" && request.cancellation_reason ? `
                        <div class="cancellation-note">
                            <strong>Cancellation reason</strong>
                            <span>${request.cancellation_reason}</span>
                        </div>
                    ` : ""}

                    ${mapHtml}
                </div>

                <div class="admin-side-info">
                    <div class="mini-info-box">
                        <span>Client</span>
                        <strong>${client ? client.full_name : "Unknown"}</strong>
                        <p>${client ? `${client.user_code} · ${client.email}` : "-"}</p>
                    </div>

                    <div class="mini-info-box">
                        <span>Selected Provider</span>
                        <strong>${provider ? provider.full_name : "Not selected"}</strong>
                        <p>${provider ? `${provider.user_code} · ${provider.email}` : "Pending provider selection"}</p>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    setTimeout(function() {
        if (currentRenderVersion !== mapRenderVersion) return;
        renderRequestMaps(filteredRequests);
    }, 200);
}

function renderRequestMaps(requests) {
    if (!L) return;

    requests.forEach(function(request) {
        if (!hasValidCoordinates(request)) return;

        const mapId = `adminRequestMap-${request.request_id}`;
        const mapElement = document.getElementById(mapId);

        if (!mapElement) return;

        const lat = Number(request.client_lat);
        const lng = Number(request.client_lng);
        const requestMap = L.map(mapId).setView([lat, lng], 16);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(requestMap);

        L.marker([lat, lng]).addTo(requestMap)
            .bindPopup("Request service location")
            .openPopup();

        requestMaps.push(requestMap);

        setTimeout(function() {
            requestMap.invalidateSize();
        }, 250);
    });
}

function handleFilters() {
    document.getElementById("searchInput").addEventListener("input", renderRequests);
    document.getElementById("statusFilter").addEventListener("change", renderRequests);
    document.getElementById("categoryFilter").addEventListener("change", renderRequests);
}

document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    handleFilters();
    loadRequests();
});
