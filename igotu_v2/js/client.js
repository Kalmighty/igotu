import { escapeHtml } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";

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

    if (data.profile_completed !== true) {
        window.location.href = "complete-profile.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Client · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
    document.getElementById("welcomeText").textContent = `Hello, ${profile.full_name.split(" ")[0]}. Manage your service requests here.`;
}

async function loadStats(userId) {
    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    const requests = data || [];

    document.getElementById("totalRequests").textContent = requests.length;
    document.getElementById("pendingRequests").textContent = requests.filter(r => r.status === "pending").length;
    document.getElementById("ongoingRequests").textContent = requests.filter(r => ["provider_selected", "confirmed", "in_progress"].includes(r.status)).length;
    document.getElementById("completedRequests").textContent = requests.filter(r => r.status === "completed").length;

    const recentBox = document.getElementById("recentRequests");

    if (requests.length === 0) {
        recentBox.innerHTML = `<p class="muted-text">No requests yet. Create your first service request.</p>`;
        return;
    }

    recentBox.innerHTML = requests.slice(0, 5).map(request => `
        <a class="list-item" href="request-details.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}">
            <div>
                <strong>${escapeHtml(request.title)}</strong>
                <span>${escapeHtml(request.category)} · ${escapeHtml(request.location)}</span>
            </div>
            <em class="status-pill">${escapeHtml(request.status.replace("_", " "))}</em>
        </a>
    `).join("");
}

document.addEventListener("DOMContentLoaded", async function() {
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    await loadStats(user.id);
});
