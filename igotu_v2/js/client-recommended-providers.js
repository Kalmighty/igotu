import { supabase } from "./supabaseClient.js";

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
        `Request: ${data.title} · Category: ${data.category} · Status: ${data.status.replace("_", " ")}`;

    return data;
}

async function loadMatchingProviders(category) {
    const providersList = document.getElementById("providersList");

    providersList.innerHTML = `<p class="muted-text">Searching providers with ${category} skill...</p>`;

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

    const providerIds = [...new Set(skillRows.map(item => item.provider_id))];

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

    (profileRows || []).forEach(function(profile) {
        profileMap.set(profile.provider_id, profile);
    });

    const matchedProviders = (providerRows || [])
        .filter(provider => profileMap.has(provider.id))
        .map(provider => {
            return {
                ...provider,
                profile: profileMap.get(provider.id)
            };
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

    providersList.innerHTML = providers.map(provider => `
        <div class="provider-card">
            <div class="provider-main">
                <div class="provider-avatar">👤</div>

                <div>
                    <h3>${provider.full_name}</h3>
                    <p class="muted-text">${provider.user_code}</p>
                    <p>${provider.profile.bio || "No bio added yet."}</p>

                    <div class="provider-meta">
                        <span>📍 ${provider.profile.location || "No location recorded"}</span>
                        <span>✅ Available</span>
                    </div>
                </div>
            </div>

            <div class="provider-action">
                <button class="btn select-provider-btn" data-provider-id="${provider.id}">
                    Select Provider
                </button>
            </div>
        </div>
    `).join("");

    document.querySelectorAll(".select-provider-btn").forEach(function(button) {
        button.addEventListener("click", async function() {
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
            status: "provider_selected"
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

    showMessage("Provider selected successfully. Redirecting to request details...", "success");

    setTimeout(function() {
        window.location.href = `request-details.html?request_id=${currentRequest.request_id}`;
    }, 900);
}

document.addEventListener("DOMContentLoaded", async function() {
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