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

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Provider · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
    document.getElementById("welcomeText").textContent = `Hello, ${profile.full_name.split(" ")[0]}. Review your assigned service requests.`;
}

async function loadStats(userId) {
    const { data: requests, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("selected_provider_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    const list = requests || [];

    document.getElementById("incomingCount").textContent = list.filter(r => r.status === "provider_selected").length;
    document.getElementById("activeCount").textContent = list.filter(r => ["confirmed", "in_progress"].includes(r.status)).length;
    document.getElementById("completedCount").textContent = list.filter(r => r.status === "completed").length;

    const { data: reviews } = await supabase
        .from("service_reviews")
        .select("rating")
        .eq("reviewee_id", userId);

    const ratingList = reviews || [];
    const avg = ratingList.length ?
        ratingList.reduce((sum, item) => sum + Number(item.rating), 0) / ratingList.length :
        0;

    document.getElementById("averageRating").textContent = avg.toFixed(1);

    const incomingBox = document.getElementById("incomingRequests");
    const incoming = list.filter(r => r.status === "provider_selected");

    if (incoming.length === 0) {
        incomingBox.innerHTML = `<p class="muted-text">No incoming assigned requests yet.</p>`;
        return;
    }

    incomingBox.innerHTML = incoming.slice(0, 5).map(request => `
        <a class="list-item" href="assignment-details.html?request_id=${request.request_id}">
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
    await loadStats(user.id);
    handleLogout();
});