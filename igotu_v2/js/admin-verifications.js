import { authorizeWorkspace } from "./profile-guard.js";
import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

let currentUser = null;
let allRequests = [];
let userMap = new Map();

function showMessage(message, type = "error") {
  const box = document.getElementById("messageBox");
  if (!box) return;
  box.textContent = message;
  box.className = `message-box ${type}`;
}

function clearMessage() {
  const box = document.getElementById("messageBox");
  if (!box) return;
  box.textContent = "";
  box.className = "message-box hidden";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIdType(value) {
  return value === "mykad" ? "MyKad" : "Passport";
}

async function getAdmin() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "../login.html";
    return null;
  }

  currentUser = sessionData.session.user;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data || data.role !== "admin" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  document.getElementById("userName").textContent = data.full_name;
  document.getElementById("userRole").textContent = `Admin · ${data.user_code}`;
  document.getElementById("avatar").textContent = data.full_name
    .charAt(0)
    .toUpperCase();
  return data;
}

function setupLogout() {
  document
    .getElementById("logoutBtn")
    ?.addEventListener("click", async (event) => {
      event.preventDefault();
      localStorage.removeItem("igotu_user");
      await supabase.auth.signOut();
      window.location.href = "../login.html";
    });
}

async function loadData() {
  const list = document.getElementById("verificationRequestsList");
  list.innerHTML = '<p class="muted-text">Loading verification requests...</p>';

  const { data: requests, error } = await supabase
    .from("verification_requests")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Verification request load error:", error);
    list.innerHTML =
      '<p class="muted-text">Unable to load verification requests.</p>';
    showMessage(
      "Unable to load verification requests. Refresh or contact your deployment administrator.",
    );
    return;
  }

  allRequests = requests || [];
  const ids = [...new Set(allRequests.map((item) => item.user_id))];
  userMap = new Map();

  if (ids.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select(
        "id, user_code, full_name, email, role, status, identity_verified",
      )
      .in("id", ids);

    if (usersError) console.error("Verification user load error:", usersError);
    (users || []).forEach((user) => userMap.set(user.id, user));
  }

  renderRequests();
}

function getFilteredRequests() {
  const search = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const role = document.getElementById("roleFilter").value;
  const targetUser = new URLSearchParams(window.location.search).get("user_id");

  return allRequests.filter((request) => {
    const user = userMap.get(request.user_id);
    if (targetUser && request.user_id !== targetUser) return false;
    if (status !== "all" && request.status !== status) return false;
    if (role !== "all" && request.role !== role) return false;

    if (search) {
      const haystack = [
        request.legal_name,
        request.business_name,
        request.ssm_number,
        user?.full_name,
        user?.email,
        user?.user_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

function renderRequests() {
  const list = document.getElementById("verificationRequestsList");
  const items = getFilteredRequests();

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-box">
        <h3>No verification requests found</h3>
        <p>No requests match the current filters.</p>
      </div>`;
    return;
  }

  list.innerHTML = items
    .map((request) => {
      const user = userMap.get(request.user_id);
      const history = allRequests
        .filter((item) => item.user_id === request.user_id)
        .sort(
          (a, b) =>
            new Date(a.submitted_at) - new Date(b.submitted_at) ||
            String(a.id).localeCompare(String(b.id)),
        );
      const attempt = history.findIndex((item) => item.id === request.id) + 1;
      const statusClass =
        request.status === "approved"
          ? "verification-approved"
          : request.status === "rejected"
            ? "verification-rejected"
            : "verification-pending";

      const providerDetails =
        request.role === "provider"
          ? `<div class="verification-admin-extra">
          <span>Business: <strong>${escapeHtml(request.business_name || "Not provided")}</strong></span>
          <span>SSM: <strong>${escapeHtml(request.ssm_number || "Not provided")}</strong></span>
          <span>Professional licence: <strong>${escapeHtml(request.professional_license || "Not provided")}</strong></span>
        </div>`
          : "";

      const actions =
        request.status === "pending"
          ? `<button type="button" class="btn btn-small approve-verification-btn" data-request-id="${escapeHtml(request.id)}" data-user-id="${escapeHtml(request.user_id)}">✓ Approve</button>
         <button type="button" class="danger-btn btn-small reject-verification-btn" data-request-id="${escapeHtml(request.id)}" data-user-id="${escapeHtml(request.user_id)}">Reject</button>`
          : `<span class="status-note">${request.status === "approved" ? "Reviewed and approved" : "Reviewed and rejected"}</span>`;

      return `
      <article class="user-card verification-admin-card">
        <div class="user-card-main">
          <div class="user-avatar">${escapeHtml((request.legal_name || "U").charAt(0).toUpperCase())}</div>
          <div class="verification-admin-content">
            <div class="card-topline">
              <span class="status-pill">${request.role === "provider" ? "Provider" : "Client"}</span>
              <span class="verification-status-badge ${escapeHtml(statusClass)}">${escapeHtml(request.status)}</span>
              <span>${escapeHtml(user?.user_code || "-")}</span><span class="verification-attempt">${attempt > 1 ? `Resubmission · Attempt ${attempt}` : "First submission"}</span>
            </div>
            <h3>${escapeHtml(request.legal_name)}</h3>
            <p class="muted-text">${escapeHtml(user?.email || "-")}</p>
            <div class="details-grid">
              <span>ID Type: <strong>${escapeHtml(formatIdType(request.id_type))}</strong></span>
              <span>ID ending: <strong>•••• ${escapeHtml(request.id_number_last4)}</strong></span>
              <span>Submitted: <strong>${escapeHtml(formatDate(request.submitted_at))}</strong></span>
              <span>Account verified: <strong>${user?.identity_verified ? "Yes" : "No"}</strong></span>
            </div>
            ${providerDetails}
            ${request.admin_note ? `<div class="verification-admin-note"><strong>Admin note:</strong><span>${escapeHtml(request.admin_note)}</span></div>` : ""}
          </div>
        </div>

        <div class="incoming-actions verification-admin-actions">
          <button type="button" class="btn btn-outline btn-small view-verification-doc-btn" data-path="${escapeHtml(request.identity_document_path)}">View Identity</button>
          ${request.supporting_document_path ? `<button type="button" class="btn btn-outline btn-small view-verification-doc-btn" data-path="${escapeHtml(request.supporting_document_path)}">View Supporting</button>` : ""}
          ${actions}
        </div>
      </article>`;
    })
    .join("");

  document.querySelectorAll(".view-verification-doc-btn").forEach((button) => {
    button.addEventListener("click", () =>
      openPrivateDocument(button.dataset.path, button),
    );
  });

  document.querySelectorAll(".approve-verification-btn").forEach((button) => {
    button.addEventListener("click", () =>
      reviewRequest(
        button.dataset.requestId,
        button.dataset.userId,
        "approved",
        button,
      ),
    );
  });

  document.querySelectorAll(".reject-verification-btn").forEach((button) => {
    button.addEventListener("click", () =>
      reviewRequest(
        button.dataset.requestId,
        button.dataset.userId,
        "rejected",
        button,
      ),
    );
  });
}

async function openPrivateDocument(path, button) {
  if (!path) return;
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening...";

  const { data, error } = await supabase.storage
    .from("verification-documents")
    .createSignedUrl(path, 300);

  button.disabled = false;
  button.textContent = oldText;

  if (error || !data?.signedUrl) {
    // Keep document paths and signed URLs out of logs.
    showMessage("Unable to open the verification document.");
    return;
  }

  const documentUrl = safeUrl(data.signedUrl);
  if (!documentUrl) {
    showMessage("Unable to open the document: invalid URL.");
    return;
  }
  window.open(documentUrl, "_blank", "noopener,noreferrer");
}

function requestReviewDecision(status) {
  const dialog = document.getElementById("verificationReviewDialog");
  dialog.dataset.decision = status;
  const form = document.getElementById("verificationReviewForm");
  const note = document.getElementById("verificationReviewNote");
  document.getElementById("verificationReviewTitle").textContent =
    status === "approved"
      ? "Approve identity verification?"
      : "Reject and request corrections";
  document.getElementById("verificationReviewHelp").textContent =
    status === "approved"
      ? "Confirm that the identity document supports this applicant’s submission. Approval unlocks profile setup and platform access."
      : "Explain what the applicant should correct. Do not include full identification numbers or document links.";
  note.required = status === "rejected";
  note.value = "";
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    const submit = (event) => {
      event.preventDefault();
      if (status === "rejected" && !note.value.trim()) {
        note.setCustomValidity("A rejection reason is required.");
        note.reportValidity();
        return;
      }
      dialog.close("confirm");
    };
    const clearValidity = () => note.setCustomValidity("");
    const close = () => {
      form.removeEventListener("submit", submit);
      note.removeEventListener("input", clearValidity);
      resolve(dialog.returnValue === "confirm" ? note.value.trim() : null);
    };
    form.addEventListener("submit", submit);
    note.addEventListener("input", clearValidity);
    note.setCustomValidity("");
    dialog.addEventListener("close", close, { once: true });
    document.getElementById("verificationReviewCancel").onclick = () =>
      dialog.close("cancel");
  });
}

async function reviewRequest(requestId, userId, status, button) {
  clearMessage();

  const note = await requestReviewDecision(status);
  if (note === null) return;

  button.disabled = true;
  button.textContent = status === "approved" ? "Approving..." : "Rejecting...";

  const { error } = await supabase.rpc("admin_review_verification", {
    p_request_id: requestId,
    p_status: status,
    p_admin_note: note || null,
  });

  if (error) {
    // Do not log applicant or review payloads.
    showMessage(
      "Unable to review this request. Refresh the list and try again.",
    );
    button.disabled = false;
    button.textContent = status === "approved" ? "✓ Approve" : "Reject";
    return;
  }

  await createNotification(
    userId,
    status === "approved" ? "Identity verified" : "Verification rejected",
    status === "approved"
      ? "Your identity verification is approved. Continue to profile setup or your workspace."
      : "Your identity verification needs correction. Open Identity Verification to read the administrator’s note and resubmit.",
  );

  showMessage(
    status === "approved"
      ? "Verification approved successfully."
      : "Verification rejected and the user has been notified.",
    "success",
  );

  await loadData();
}

function setupFilters() {
  ["searchInput", "statusFilter", "roleFilter"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener(
      id === "searchInput" ? "input" : "change",
      renderRequests,
    );
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await authorizeWorkspace()).allowed) return;
  const profile = await getAdmin();
  if (!profile) return;

  const targetUser = new URLSearchParams(window.location.search).get("user_id");
  if (targetUser) {
    const statusFilter = document.getElementById("statusFilter");
    if (statusFilter) statusFilter.value = "all";
  }

  setupLogout();
  setupFilters();
  await loadData();
});
