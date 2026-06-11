import { supabase } from "./supabaseClient.js";

let currentUser = null;
let allReviews = [];
let userMap = new Map();
let requestMap = new Map();

function showMessage(message, type = "error") {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
}

function formatDate(dateValue) {
    if (!dateValue) return "-";

    return new Date(dateValue).toLocaleDateString("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function renderStars(rating) {
    const value = Number(rating || 0);
    let stars = "";

    for (let i = 1; i <= 5; i++) {
        stars += i <= value ? "★" : "☆";
    }

    return stars;
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

async function loadRelatedData(reviews) {
    const userIds = [];
    const requestIds = [];

    reviews.forEach(function(review) {
        if (review.reviewer_id) userIds.push(review.reviewer_id);
        if (review.reviewee_id) userIds.push(review.reviewee_id);
        if (review.request_id) requestIds.push(review.request_id);
    });

    const uniqueUserIds = [...new Set(userIds)];
    const uniqueRequestIds = [...new Set(requestIds)];

    userMap = new Map();
    requestMap = new Map();

    if (uniqueUserIds.length > 0) {
        const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, user_code, full_name, email, role")
            .in("id", uniqueUserIds);

        if (usersError) {
            console.error("Users fetch error:", usersError);
        }

        (users || []).forEach(function(user) {
            userMap.set(user.id, user);
        });
    }

    if (uniqueRequestIds.length > 0) {
        const { data: requests, error: requestsError } = await supabase
            .from("service_requests")
            .select("request_id, title, category, status")
            .in("request_id", uniqueRequestIds);

        if (requestsError) {
            console.error("Requests fetch error:", requestsError);
        }

        (requests || []).forEach(function(request) {
            requestMap.set(request.request_id, request);
        });
    }
}

async function loadReviews() {
    const reviewsList = document.getElementById("reviewsList");

    reviewsList.innerHTML = `<p class="muted-text">Loading reviews...</p>`;

    const { data, error } = await supabase
        .from("service_reviews")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load reviews error:", error);
        showMessage(error.message || "Unable to load reviews.");
        reviewsList.innerHTML = `<p class="muted-text">Unable to load review records.</p>`;
        return;
    }

    allReviews = data || [];

    await loadRelatedData(allReviews);
    renderStats();
    renderReviews();
}

function renderStats() {
    const total = allReviews.length;

    const average = total > 0 ?
        allReviews.reduce(function(sum, review) {
            return sum + Number(review.rating || 0);
        }, 0) / total :
        0;

    const clientReviewCount = allReviews.filter(function(review) {
        const reviewer = userMap.get(review.reviewer_id);
        return reviewer && reviewer.role === "client";
    }).length;

    const providerReviewCount = allReviews.filter(function(review) {
        const reviewer = userMap.get(review.reviewer_id);
        return reviewer && reviewer.role === "provider";
    }).length;

    document.getElementById("totalReviews").textContent = total;
    document.getElementById("averageRating").textContent = average.toFixed(1);
    document.getElementById("clientReviews").textContent = clientReviewCount;
    document.getElementById("providerReviews").textContent = providerReviewCount;
}

function renderReviews() {
    const reviewsList = document.getElementById("reviewsList");
    const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
    const ratingFilter = document.getElementById("ratingFilter").value;

    let filteredReviews = allReviews;

    if (ratingFilter !== "all") {
        filteredReviews = filteredReviews.filter(function(review) {
            return Number(review.rating) === Number(ratingFilter);
        });
    }

    if (searchValue) {
        filteredReviews = filteredReviews.filter(function(review) {
            const reviewer = userMap.get(review.reviewer_id);
            const reviewee = userMap.get(review.reviewee_id);
            const request = requestMap.get(review.request_id);

            const text = [
                review.request_id,
                review.rating,
                review.feedback,
                reviewer ? reviewer.full_name : "",
                reviewer ? reviewer.email : "",
                reviewer ? reviewer.user_code : "",
                reviewer ? reviewer.role : "",
                reviewee ? reviewee.full_name : "",
                reviewee ? reviewee.email : "",
                reviewee ? reviewee.user_code : "",
                reviewee ? reviewee.role : "",
                request ? request.title : "",
                request ? request.category : ""
            ].join(" ").toLowerCase();

            return text.includes(searchValue);
        });
    }

    if (filteredReviews.length === 0) {
        reviewsList.innerHTML = `
            <div class="empty-box">
                <h3>No review records found</h3>
                <p>No reviews match the selected filter.</p>
            </div>
        `;
        return;
    }

    reviewsList.innerHTML = filteredReviews.map(function(review) {
                const reviewer = userMap.get(review.reviewer_id);
                const reviewee = userMap.get(review.reviewee_id);
                const request = requestMap.get(review.request_id);

                return `
            <div class="review-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${review.rating} / 5</span>
                        <span>${review.request_id}</span>
                        <span>${formatDate(review.created_at)}</span>
                    </div>

                    <h3 class="star-rating">${renderStars(review.rating)}</h3>

                    <p class="review-feedback">
                        ${review.feedback || "No feedback provided."}
                    </p>

                    <div class="details-grid">
                        <span>Request: <strong>${request ? request.title : review.request_id}</strong></span>
                        <span>Category: <strong>${request ? request.category : "-"}</strong></span>
                        <span>Reviewer Role: <strong>${reviewer ? reviewer.role : "Unknown"}</strong></span>
                        <span>Reviewee Role: <strong>${reviewee ? reviewee.role : "Unknown"}</strong></span>
                    </div>
                </div>

                <div class="admin-side-info">
                    <div class="mini-info-box">
                        <span>Reviewer</span>
                        <strong>${reviewer ? reviewer.full_name : "Unknown"}</strong>
                        <p>${reviewer ? `${reviewer.user_code} · ${reviewer.email}` : "-"}</p>
                    </div>

                    <div class="mini-info-box">
                        <span>Reviewee</span>
                        <strong>${reviewee ? reviewee.full_name : "Unknown"}</strong>
                        <p>${reviewee ? `${reviewee.user_code} · ${reviewee.email}` : "-"}</p>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function handleFilters() {
    document.getElementById("searchInput").addEventListener("input", renderReviews);
    document.getElementById("ratingFilter").addEventListener("change", renderReviews);
}

document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    handleFilters();
    loadReviews();
});