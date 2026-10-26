import { authorizeWorkspace } from "./profile-guard.js";
import { prepareReceiptPreviews, receiptHtml, bindReceiptButtons } from "./payment-receipts.js";
import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";

let currentUser = null;
let allPayments = [];
let userMap = new Map();
let requestMap = new Map();

function showMessage(message, type = "error") {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
}

function formatMoney(amount) {
    return `RM ${Number(amount || 0).toFixed(2)}`;
}

function formatDate(dateValue) {
    if (!dateValue) return "-";

    return new Date(dateValue).toLocaleDateString("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}


function getPaymentProofUrl(payment) { return payment.receiptPreview?.url || null; }
function buildAdminPaymentProofHtml(payment) { return receiptHtml(payment); }

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

async function loadRelatedData(payments) {
    const userIds = [];
    const requestIds = [];

    payments.forEach(function(payment) {
        if (payment.client_id) userIds.push(payment.client_id);
        if (payment.provider_id) userIds.push(payment.provider_id);
        if (payment.request_id) requestIds.push(payment.request_id);
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

async function loadPayments() {
    const paymentsList = document.getElementById("paymentsList");

    paymentsList.innerHTML = `<p class="muted-text">Loading payments...</p>`;

    const { data, error } = await supabase
        .from("payment_records")
        .select("payment_id,request_id,client_id,provider_id,amount,payment_method,reference_number,created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load payments error:", error);
        showMessage(error.message || "Unable to load payments.");
        paymentsList.innerHTML = `<p class="muted-text">Unable to load payment records.</p>`;
        return;
    }

    allPayments = await prepareReceiptPreviews(data || []);
    await loadRelatedData(allPayments);
    renderStats();
    renderPayments();
}

function renderStats() {
    const totalAmount = allPayments.reduce(function(sum, payment) {
        return sum + Number(payment.amount || 0);
    }, 0);

    const cashCount = allPayments.filter(function(payment) {
        return payment.payment_method === "Cash";
    }).length;

    const transferCount = allPayments.filter(function(payment) {
        return payment.payment_method === "QR Transfer" || payment.payment_method === "Bank Transfer";
    }).length;

    document.getElementById("totalPayments").textContent = allPayments.length;
    document.getElementById("totalAmount").textContent = formatMoney(totalAmount);
    document.getElementById("cashPayments").textContent = cashCount;
    document.getElementById("transferPayments").textContent = transferCount;
}

function renderPayments() {
    const paymentsList = document.getElementById("paymentsList");
    const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
    const methodFilter = document.getElementById("methodFilter").value;

    let filteredPayments = allPayments;

    if (methodFilter !== "all") {
        filteredPayments = filteredPayments.filter(function(payment) {
            return payment.payment_method === methodFilter;
        });
    }

    if (searchValue) {
        filteredPayments = filteredPayments.filter(function(payment) {
            const client = userMap.get(payment.client_id);
            const provider = userMap.get(payment.provider_id);
            const request = requestMap.get(payment.request_id);

            const text = [
                payment.payment_id,
                payment.request_id,
                payment.payment_method,
                getPaymentProofUrl(payment) || "",
                client ? client.full_name : "",
                client ? client.email : "",
                client ? client.user_code : "",
                provider ? provider.full_name : "",
                provider ? provider.email : "",
                provider ? provider.user_code : "",
                request ? request.title : "",
                request ? request.category : ""
            ].join(" ").toLowerCase();

            return text.includes(searchValue);
        });
    }

    if (filteredPayments.length === 0) {
        paymentsList.innerHTML = `
            <div class="empty-box">
                <h3>No payment records found</h3>
                <p>No payments match the selected filter.</p>
            </div>
        `;
        return;
    }

    paymentsList.innerHTML = filteredPayments.map(function(payment) {
                const client = userMap.get(payment.client_id);
                const provider = userMap.get(payment.provider_id);
                const request = requestMap.get(payment.request_id);

                return `
            <div class="payment-card">
                <div>
                    <div class="card-topline">
                        <span class="status-pill">${escapeHtml(payment.payment_method)}</span>
                        <span>${escapeHtml(payment.payment_id || "-")}</span>
                        <span>${escapeHtml(formatDate(payment.created_at))}</span>
                    </div>

                    <h3>${escapeHtml(formatMoney(payment.amount))}</h3>

                    <p class="muted-text">
                        Request:
                        <strong>${escapeHtml(request ? request.title : payment.request_id)}</strong>
                        ${escapeHtml(request ? `· ${request.category}` : "")}
                    </p>

                    <div class="details-grid">
                        <span>Request ID: <strong>${escapeHtml(payment.request_id)}</strong></span>
                        <span>Method: <strong>${escapeHtml(payment.payment_method)}</strong></span>
                        <span>Client: <strong>${escapeHtml(client ? client.full_name : "Unknown")}</strong></span>
                        <span>Provider: <strong>${escapeHtml(provider ? provider.full_name : "Unknown")}</strong></span>
                        <span>Proof: <strong>${getPaymentProofUrl(payment) ? "Uploaded" : "Not uploaded"}</strong></span>
                    </div>

                    ${buildAdminPaymentProofHtml(payment)}
                </div>

                <div class="admin-side-info">
                    <div class="mini-info-box">
                        <span>Client</span>
                        <strong>${escapeHtml(client ? client.full_name : "Unknown")}</strong>
                        <p>${escapeHtml(client ? `${client.user_code} · ${client.email}` : "-")}</p>
                    </div>

                    <div class="mini-info-box">
                        <span>Provider</span>
                        <strong>${escapeHtml(provider ? provider.full_name : "Unknown")}</strong>
                        <p>${escapeHtml(provider ? `${provider.user_code} · ${provider.email}` : "-")}</p>
                    </div>
                </div>
            </div>
        `;
    }).join("");
    bindReceiptButtons(paymentsList, allPayments, showMessage);
}

function handleFilters() {
    document.getElementById("searchInput").addEventListener("input", renderPayments);
    document.getElementById("methodFilter").addEventListener("change", renderPayments);
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
    currentUser = await getSessionUser();
    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    handleFilters();
    loadPayments();
});
