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
        return 0;
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

    document.getElementById("openReports").textContent = reportCountError ? "0" : (openReportCount || 0);

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

    const recentBox = document.getElementById("recentRequests");

    if (error || !data || data.length === 0) {
        recentBox.innerHTML = `<p class="muted-text">No service requests recorded yet.</p>`;
        return;
    }

    recentBox.innerHTML = data.map(request => `
        <a class="list-item" href="monitor-requests.html">
            <div>
                <strong>${request.title}</strong>
                <span>${request.category} · ${request.location}</span>
            </div>
            <em class="status-pill">${request.status.replace("_", " ")}</em>
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