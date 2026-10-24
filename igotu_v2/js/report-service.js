import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");
const pageRole = document.body.dataset.role;

let currentUser = null;
let currentProfile = null;
let currentRequest = null;
let reportedUser = null;
let evidencePreviewUrl = null;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

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

function formatRole(role) {
  return role === "provider" ? "Provider" : "Client";
}

function getExtension(file) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function validateEvidence(file) {
  if (!file) return;
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Evidence must be JPG, PNG, WEBP, or PDF.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Evidence must be 5 MB or smaller.");
  }
}

async function getSessionProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "../login.html";
    return null;
  }

  currentUser = sessionData.session.user;

  const { data, error } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, role, status")
    .eq("id", currentUser.id)
    .single();

  if (error || !data || data.status !== "active" || data.role !== pageRole) {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  currentProfile = data;
  return data;
}

async function loadRequest() {
  if (!requestId) {
    showMessage("Missing service request ID.");
    return false;
  }

  const { data, error } = await supabase
    .from("service_requests")
    .select("request_id, client_id, selected_provider_id, title, category, service_type, status")
    .eq("request_id", requestId)
    .single();

  if (error || !data) {
    showMessage("Service request not found.");
    return false;
  }

  const isClient = currentProfile.role === "client" && data.client_id === currentUser.id;
  const isProvider = currentProfile.role === "provider" && data.selected_provider_id === currentUser.id;

  if (!isClient && !isProvider) {
    showMessage("You are not a participant in this service request.");
    return false;
  }

  const reportedUserId = isClient ? data.selected_provider_id : data.client_id;

  if (!reportedUserId) {
    showMessage("There is no other service participant to report yet.");
    return false;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, user_code, full_name, role")
    .eq("id", reportedUserId)
    .single();

  if (userError || !user) {
    showMessage("Unable to load the other service participant.");
    return false;
  }

  currentRequest = data;
  reportedUser = user;

  document.getElementById("requestReference").textContent = `${data.request_id} · ${data.title}`;
  document.getElementById("reportedUserName").textContent = user.full_name;
  document.getElementById("reportedUserMeta").textContent = `${formatRole(user.role)} · ${user.user_code}`;
  document.getElementById("backLink").href = currentProfile.role === "client"
    ? `request-details.html?request_id=${encodeURIComponent(requestId)}`
    : "assignment-details.html";

  return true;
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clearEvidencePreviewUrl() {
  if (evidencePreviewUrl) {
    URL.revokeObjectURL(evidencePreviewUrl);
    evidencePreviewUrl = null;
  }
}

function resetEvidenceInput() {
  const input = document.getElementById("reportEvidence");
  const shell = document.getElementById("reportEvidenceUploadShell");
  const empty = document.getElementById("reportEvidenceEmpty");
  const preview = document.getElementById("reportEvidencePreview");
  const image = document.getElementById("reportEvidencePreviewImage");
  const pdf = document.getElementById("reportEvidencePreviewPdf");
  const pdfFrame = document.getElementById("reportEvidencePreviewPdfFrame");
  const actions = document.getElementById("reportEvidenceSelectedActions");
  const name = document.getElementById("reportEvidenceName");
  const size = document.getElementById("reportEvidenceSize");

  clearEvidencePreviewUrl();

  if (input) input.value = "";
  shell?.classList.remove("has-file");
  empty?.classList.remove("hidden");
  preview?.classList.add("hidden");
  image?.classList.add("hidden");
  image?.removeAttribute("src");
  pdf?.classList.add("hidden");
  if (pdfFrame) pdfFrame.removeAttribute("src");
  actions?.classList.add("hidden");
  if (name) name.textContent = "";
  if (size) size.textContent = "";
}

function renderEvidencePreview(file) {
  const shell = document.getElementById("reportEvidenceUploadShell");
  const empty = document.getElementById("reportEvidenceEmpty");
  const preview = document.getElementById("reportEvidencePreview");
  const image = document.getElementById("reportEvidencePreviewImage");
  const pdf = document.getElementById("reportEvidencePreviewPdf");
  const pdfFrame = document.getElementById("reportEvidencePreviewPdfFrame");
  const actions = document.getElementById("reportEvidenceSelectedActions");
  const name = document.getElementById("reportEvidenceName");
  const size = document.getElementById("reportEvidenceSize");

  clearEvidencePreviewUrl();
  evidencePreviewUrl = URL.createObjectURL(file);

  shell?.classList.add("has-file");
  empty?.classList.add("hidden");
  preview?.classList.remove("hidden");
  actions?.classList.remove("hidden");

  if (name) name.textContent = file.name;
  if (size) size.textContent = humanFileSize(file.size);

  if (file.type === "application/pdf") {
    image?.classList.add("hidden");
    image?.removeAttribute("src");
    pdf?.classList.remove("hidden");
    if (pdfFrame) pdfFrame.src = evidencePreviewUrl;
  } else {
    pdf?.classList.add("hidden");
    if (pdfFrame) pdfFrame.removeAttribute("src");
    if (image) image.src = evidencePreviewUrl;
    image?.classList.remove("hidden");
  }
}

function setupEvidenceInput() {
  const input = document.getElementById("reportEvidence");
  const change = document.getElementById("changeReportEvidence");
  const remove = document.getElementById("removeReportEvidence");

  if (!input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      resetEvidenceInput();
      return;
    }

    try {
      validateEvidence(file);
      clearMessage();
      renderEvidencePreview(file);
    } catch (error) {
      resetEvidenceInput();
      showMessage(error.message);
    }
  });

  change?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.click();
  });

  remove?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetEvidenceInput();
  });
}

async function uploadEvidence(file) {
  if (!file) return null;
  validateEvidence(file);

  const path = `${currentUser.id}/${currentRequest.request_id}/${crypto.randomUUID()}.${getExtension(file)}`;
  const { error } = await supabase.storage
    .from("report-evidence")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  return path;
}

async function submitReport(event) {
  event.preventDefault();
  clearMessage();

  const reasonSelect = document.getElementById("reportReason");
  const description = document.getElementById("reportDescription").value.trim();
  const evidenceFile = document.getElementById("reportEvidence").files?.[0] || null;
  const button = document.getElementById("submitReportBtn");

  const reasonLabel = reasonSelect.options[reasonSelect.selectedIndex]?.text || "";

  if (!reasonSelect.value) {
    showMessage("Please select a report reason.");
    return;
  }

  if (description.length < 10) {
    showMessage("Please provide a little more detail about what happened.");
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting...";

  let evidencePath = null;

  try {
    evidencePath = await uploadEvidence(evidenceFile);

    const { error } = await supabase.rpc("submit_service_report", {
      p_request_id: currentRequest.request_id,
      p_reported_user_id: reportedUser.id,
      p_reason: reasonLabel,
      p_description: description,
      p_evidence_path: evidencePath,
    });

    if (error) throw error;

    showMessage("Report submitted. An IGotU administrator will review it.", "success");
    document.getElementById("reportForm").reset();
    resetEvidenceInput();
    button.textContent = "Report Submitted";

    setTimeout(() => {
      window.location.href = currentProfile.role === "client"
        ? `request-details.html?request_id=${encodeURIComponent(currentRequest.request_id)}`
        : "assignment-details.html";
    }, 1200);
  } catch (error) {
    console.error("Report submit error:", error);

    if (evidencePath) {
      await supabase.storage.from("report-evidence").remove([evidencePath]);
    }

    showMessage(error.message || "Unable to submit report.");
    button.disabled = false;
    button.textContent = "Submit Report";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!(await authorizeWorkspace()).allowed) return;
  const profile = await getSessionProfile();
  if (!profile) return;

  const ready = await loadRequest();
  if (!ready) return;

  setupEvidenceInput();
  document.getElementById("reportForm").addEventListener("submit", submitReport);
});

window.addEventListener("beforeunload", clearEvidencePreviewUrl);
