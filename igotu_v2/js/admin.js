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
    document.getElementById("welcomeText").textContent = `Hello, ${profile.full_name.split(" ")[0]}. Monitor the IGotU platform here.`;
}

async function countTable(tableName) {
    const { count, error } = await supabase
        .from(tableName)
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error(error);
        return "—";
    }

    return count || 0;
}

async function loadStats() {
    document.getElementById("totalUsers").textContent = await countTable("users");
    document.getElementById("totalRequests").textContent = await countTable("service_requests");
    document.getElementById("totalPayments").textContent = await countTable("payment_records");
    document.getElementById("totalReviews").textContent = await countTable("service_reviews");

    const { count: openReportCount, error: reportCountError } = await supabase
        .from("service_reports")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "under_review"]);

    document.getElementById("openReports").textContent = reportCountError ? "—" : (openReportCount || 0);

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

    const recentBox = document.getElementById("recentRequests");

    if (error) {
        recentBox.innerHTML = `<div class="ui-state" role="alert"><h3>Activity could not be loaded</h3><p>Refresh the page to try again.</p><a class="btn btn-outline" href="dashboard.html">Try again</a></div>`;
        return;
    }

    if (!data || data.length === 0) {
        recentBox.innerHTML = `<div class="ui-state"><h3>No service activity yet</h3><p>New service requests will appear here as clients create them.</p><a class="btn btn-outline" href="monitor-requests.html">Monitor requests</a></div>`;
        return;
    }

    recentBox.innerHTML = data.map(request => `
        <a class="list-item" href="monitor-requests.html">
            <div>
                <strong>${escapeHtml(request.title)}</strong>
                <span>${escapeHtml(request.category)} · ${escapeHtml(request.location)}</span>
            </div>
            <em class="status-pill">${escapeHtml(request.status.replace("_", " "))}</em>
        </a>
    `).join("");
}

async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");

    logoutBtn.addEventListener("click", async function(event) {
        event.preventDefault();
        localStorage.removeItem("igotu_user");
        await supabase.auth.signOut();
        window.location.href = "../login.html";
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    await loadStats();
    handleLogout();
});