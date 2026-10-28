import { mountServiceCalendar, calendarRequests } from "./service-calendar.js";
import { providerRequests } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
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

    if (data.role !== "provider" || data.status !== "active") {
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
    document.getElementById("userRole").textContent = `Provider · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
    document.getElementById("welcomeText").textContent = `Hello, ${profile.full_name.split(" ")[0]}. Review your assigned service requests.`;
}

async function loadStats(userId) {
    const { data: requests, error } = await providerRequests(null);

    if (error) {
        console.error(error);
        document.getElementById("incomingRequests").innerHTML = `<div class="ui-state" role="alert"><h3>Requests could not be loaded</h3><p>Refresh the page to try again.</p><a class="btn btn-outline" href="dashboard.html">Try again</a></div>`;
        throw new Error("Services could not be loaded");
    }

    const list = calendarRequests(requests || [], "provider", userId);

    document.getElementById("incomingCount").textContent = list.filter(r => r.status === "provider_selected").length;
    document.getElementById("activeCount").textContent = list.filter(r => ["confirmed", "in_progress"].includes(r.status)).length;
    document.getElementById("completedCount").textContent = list.filter(r => r.status === "completed").length;

    const { data: reviews, error: reviewsError } = await supabase
        .from("service_reviews")
        .select("rating")
        .eq("reviewee_id", userId);

    const ratingList = reviews || [];
    const avg = ratingList.length ?
        ratingList.reduce((sum, item) => sum + Number(item.rating), 0) / ratingList.length :
        0;

    document.getElementById("averageRating").textContent = reviewsError ? "—" : (ratingList.length ? avg.toFixed(1) : "No reviews");

    const incomingBox = document.getElementById("incomingRequests");
    const incoming = list.filter(r => r.status === "provider_selected");

    if (incoming.length === 0) {
        incomingBox.innerHTML = `<div class="ui-state"><h3>You’re all caught up</h3><p>When a client selects you, their request will appear here. Keep your services and working hours up to date.</p><a class="btn btn-outline" href="edit-profile.html">Manage services &amp; availability</a></div>`;
        return list;
    }

    incomingBox.innerHTML = incoming.slice(0, 5).map(request => `
        <a class="list-item" href="incoming-requests.html?request_id=${escapeHtml(encodeURIComponent(request.request_id))}">
            <div>
                <strong>${escapeHtml(request.title)}</strong>
                <span>${escapeHtml(request.category)} · Approximate Area: ${escapeHtml(String(request.approximate_area || "").replace(/^(?:\s*approximate\s+area\s*:\s*)+/i, "").trim() || "Area available after confirmation")}</span>
            </div>
            <em class="status-pill">${escapeHtml(request.status.replace("_", " "))}</em>
        </a>
    `).join("");
    return list;
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

document.addEventListener("DOMContentLoaded", async function() {
    if (!(await authorizeWorkspace()).allowed) return;
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    mountServiceCalendar(document.getElementById("serviceCalendar"), {
        role: "provider",
        userId: user.id,
        loadRequests: () => loadStats(user.id),
    });
    handleLogout();
});
