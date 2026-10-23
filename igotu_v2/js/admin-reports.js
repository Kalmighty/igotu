import { escapeHtml, safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";

let currentUser = null;
let allReports = [];
let userMap = new Map();
let requestMap = new Map();

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

function statusClass(status) {
  if (status === "resolved") return "verification-approved";
  if (status === "dismissed") return "verification-rejected";
  if (status === "under_review") return "report-under-review";
  return "verification-pending";
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
    .select("id, user_code, full_name, role, status")
    .eq("id", currentUser.id)
    .single();

  if (error || !data || data.role !== "admin" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  document.getElementById("userName").textContent = data.full_name;
  document.getElementById("userRole").textContent = `Admin · ${data.user_code}`;
  document.getElementById("avatar").textContent = data.full_name.charAt(0).toUpperCase();
  return data;
}

function setupLogout() {
  document.getElementById("logoutBtn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    localStorage.removeItem("igotu_user");
    window.location.href = "../login.html";
  });
}

async function loadReports() {
  const list = document.getElementById("reportsList");
  list.innerHTML = '<p class="muted-text">Loading reports...</p>';

  const { data, error } = await supabase
    .from("service_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Report load error:", error);
    showMessage("Unable to load reports. Run trust-safety-features-setup.sql first.");
    list.innerHTML = '<p class="muted-text">Unable to load reports.</p>';
    return;
  }

  allReports = data || [];

  const userIds = [...new Set(allReports.flatMap((report) => [report.reporter_id, report.reported_user_id]))];
  const requestIds = [...new Set(allReports.map((report) => report.request_id))];

  userMap = new Map();
  requestMap = new Map();

  if (userIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, user_code, full_name, email, role")
      .in("id", userIds);
    (users || []).forEach((user) => userMap.set(user.id, user));
  }

  if (requestIds.length) {
    const { data: requests } = await supabase
      .from("service_requests")
      .select("request_id, title, category, status")
      .in("request_id", requestIds);
    (requests || []).forEach((request) => requestMap.set(request.request_id, request));
  }

  renderReports();
}

function getFilteredReports() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  return allReports.filter((report) => {
    if (status !== "all" && report.status !== status) return false;

    if (!query) return true;

    const reporter = userMap.get(report.reporter_id);
    const reported = userMap.get(report.reported_user_id);
    const request = requestMap.get(report.request_id);

    return [
      report.request_id,
      report.reason,
      report.description,
      reporter?.full_name,
      reporter?.email,
      reporter?.user_code,
      reported?.full_name,
      reported?.email,
      reported?.user_code,
      request?.title,
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  });
}

function renderReports() {
  const list = document.getElementById("reportsList");
  const reports = getFilteredReports();
  document.getElementById("reportCount").textContent = `${reports.length} report${reports.length === 1 ? "" : "s"}`;

  if (!reports.length) {
    list.innerHTML = `
      <div class="empty-box">
        <h3>No reports found</h3>
        <p>No service reports match the selected filter.</p>
      </div>`;
    return;
  }

  list.innerHTML = reports.map((report) => {
    const reporter = userMap.get(report.reporter_id);
    const reported = userMap.get(report.reported_user_id);
    const request = requestMap.get(report.request_id);
    const statusLabel = report.status.replaceAll("_", " ");
    const requestStatus = request?.status?.replaceAll("_", " ") || "-";

    const evidenceAction = report.evidence_path
      ? `<button type="button" class="report-evidence-button evidence-btn" data-path="${escapeHtml(report.evidence_path)}">
           <span class="report-action-icon">↗</span>
           <span>View evidence</span>
         </button>`
      : `<div class="report-evidence-empty-state">No evidence uploaded</div>`;

    const reviewActions = ["pending", "under_review"].includes(report.status)
      ? `
        <div class="report-review-actions">
          ${report.status === "pending" ? `<button type="button" class="report-review-button report-review-button-secondary review-report-btn" data-id="${escapeHtml(report.id)}" data-status="under_review">Mark under review</button>` : ""}
          <button type="button" class="report-review-button report-review-button-resolve review-report-btn" data-id="${escapeHtml(report.id)}" data-status="resolved">Resolve report</button>
          <button type="button" class="report-review-button report-review-button-dismiss review-report-btn" data-id="${escapeHtml(report.id)}" data-status="dismissed">Dismiss</button>
        </div>
      `
      : `<div class="report-review-complete">Review complete</div>`;

    return `
      <article class="admin-report-review-card">
        <div class="report-card-heading">
          <div class="report-heading-main">
            <div class="report-heading-meta">
              <span class="verification-status-badge ${escapeHtml(statusClass(report.status))}">${escapeHtml(statusLabel)}</span>
              <span class="report-request-id">${escapeHtml(report.request_id)}</span>
              <span class="report-created-at">${escapeHtml(formatDate(report.created_at))}</span>
            </div>
            <h3>${escapeHtml(report.reason)}</h3>
            <p class="report-request-name">${escapeHtml(request?.title || "Service request")} <span>•</span> ${escapeHtml(request?.category || "-")}</p>
          </div>
        </div>

        <div class="report-card-layout">
          <section class="report-case-details">
            <div class="report-section-label">Report details</div>
            <p class="report-description">${escapeHtml(report.description)}</p>

            <div class="report-participants-grid">
              <div class="report-person-card">
                <span class="report-person-label">Reporter</span>
                <strong>${escapeHtml(reporter?.full_name || "Unknown user")}</strong>
                <span class="report-person-meta">${escapeHtml(reporter?.user_code || "-")}${escapeHtml(reporter?.role ? ` · ${reporter.role}` : "")}</span>
              </div>

              <div class="report-person-card">
                <span class="report-person-label">Reported user</span>
                <strong>${escapeHtml(reported?.full_name || "Unknown user")}</strong>
                <span class="report-person-meta">${escapeHtml(reported?.user_code || "-")}${escapeHtml(reported?.role ? ` · ${reported.role}` : "")}</span>
              </div>
            </div>

            <div class="report-case-meta-row">
              <div>
                <span>Request status</span>
                <strong>${escapeHtml(requestStatus)}</strong>
              </div>
              <div>
                <span>Reviewed</span>
                <strong>${escapeHtml(report.reviewed_at ? formatDate(report.reviewed_at) : "Not reviewed yet")}</strong>
              </div>
            </div>

            ${report.admin_note ? `
              <div class="report-admin-note-clean">
                <span>Admin note</span>
                <p>${escapeHtml(report.admin_note)}</p>
              </div>` : ""}
          </section>

          <aside class="report-review-panel">
            <div class="report-review-panel-top">
              <div>
                <span class="report-review-eyebrow">Review report</span>
                <strong class="report-review-status-title">${escapeHtml(statusLabel)}</strong>
              </div>
              <span class="verification-status-badge ${escapeHtml(statusClass(report.status))}">${escapeHtml(statusLabel)}</span>
            </div>

            <div class="report-review-block">
              <span class="report-review-label">Evidence</span>
              ${evidenceAction}
            </div>

            <div class="report-review-block">
              <span class="report-review-label">Decision</span>
              ${reviewActions}
            </div>
          </aside>
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".evidence-btn").forEach((button) => {
    button.addEventListener("click", () => openEvidence(button.dataset.path, button));
  });

  document.querySelectorAll(".review-report-btn").forEach((button) => {
    button.addEventListener("click", () => reviewReport(button.dataset.id, button.dataset.status, button));
  });
}

async function openEvidence(path, button) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening...";

  const { data, error } = await supabase.storage
    .from("report-evidence")
    .createSignedUrl(path, 300);

  button.disabled = false;
  button.textContent = oldText;

  if (error || !data?.signedUrl) {
    showMessage("Unable to open report evidence.");
    return;
  }

  const documentUrl = safeUrl(data.signedUrl);
  if (!documentUrl) {
    showMessage("Unable to open the document: invalid URL.");
    return;
  }
  window.open(documentUrl, "_blank", "noopener,noreferrer");
}

async function reviewReport(reportId, status, button) {
  clearMessage();

  let note = "";
  if (["resolved", "dismissed"].includes(status)) {
    note = prompt(status === "resolved"
      ? "Optional: add a resolution note for the reporter."
      : "Enter a short reason for dismissing this report.")?.trim() || "";

    if (status === "dismissed" && !note) {
      showMessage("Please enter a reason before dismissing the report.");
      return;
    }
  }

  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "Saving...";

  const { error } = await supabase.rpc("admin_review_service_report", {
    p_report_id: reportId,
    p_status: status,
    p_admin_note: note || null,
  });

  if (error) {
    console.error("Report review error:", error);
    showMessage(error.message || "Unable to update report.");
    button.disabled = false;
    button.textContent = oldText;
    return;
  }

  showMessage(`Report status updated to ${status.replace("_", " ")}.`, "success");
  await loadReports();
}

function setupFilters() {
  document.getElementById("searchInput").addEventListener("input", renderReports);
  document.getElementById("statusFilter").addEventListener("change", renderReports);
}

document.addEventListener("DOMContentLoaded", async () => {
  const admin = await getAdmin();
  if (!admin) return;

  setupLogout();
  setupFilters();
  await loadReports();
});
