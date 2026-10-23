import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

let currentUser = null;
let currentProfile = null;
let latestRequest = null;

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

function setStatusCard(status, request = null) {
  const badge = document.getElementById("verificationStatusBadge");
  const title = document.getElementById("verificationStatusTitle");
  const text = document.getElementById("verificationStatusText");
  const adminNoteWrap = document.getElementById("verificationAdminNoteWrap");
  const adminNote = document.getElementById("verificationAdminNote");

  if (!badge || !title || !text) return;

  badge.className = "verification-status-badge";

  if (status === "approved") {
    badge.classList.add("verification-approved");
    badge.textContent = "✓ Verified";
    title.textContent = "Identity Verified";
    text.textContent = "Your identity has been approved by an IGotU administrator.";
  } else if (status === "pending") {
    badge.classList.add("verification-pending");
    badge.textContent = "Pending";
    title.textContent = "Verification Under Review";
    text.textContent = "Your documents were submitted and are waiting for administrator review.";
  } else if (status === "rejected") {
    badge.classList.add("verification-rejected");
    badge.textContent = "Rejected";
    title.textContent = "Verification Needs Attention";
    text.textContent = "Your previous verification request was rejected. Review the note below and submit again.";
  } else {
    badge.classList.add("verification-not-submitted");
    badge.textContent = "Not Verified";
    title.textContent = "Verify Your Identity";
    text.textContent = "Submit an identity document so other IGotU users can trust your account.";
  }

  if (request?.admin_note) {
    adminNote.textContent = request.admin_note;
    adminNoteWrap.classList.remove("hidden");
  } else {
    adminNoteWrap.classList.add("hidden");
    adminNote.textContent = "";
  }

  const submitted = document.getElementById("verificationSubmittedAt");
  const reviewed = document.getElementById("verificationReviewedAt");
  if (submitted) submitted.textContent = request?.submitted_at ? formatDate(request.submitted_at) : "-";
  if (reviewed) reviewed.textContent = request?.reviewed_at ? formatDate(request.reviewed_at) : "-";
}

function setFormAvailability(canSubmit) {
  const form = document.getElementById("verificationForm");
  const button = document.getElementById("submitVerificationBtn");
  if (!form || !button) return;

  form.querySelectorAll("input, select").forEach((element) => {
    element.disabled = !canSubmit;
  });

  button.disabled = !canSubmit;

  if (!canSubmit && latestRequest?.status === "pending") {
    button.textContent = "Verification Pending";
  } else if (!canSubmit && currentProfile?.identity_verified === true) {
    button.textContent = "Already Verified";
  } else {
    button.textContent = latestRequest?.status === "rejected"
      ? "Resubmit Verification"
      : "Submit for Verification";
  }
}

function displayProfile(profile) {
  const fullName = profile.full_name || (profile.role === "provider" ? "Provider" : "Client");
  const firstLetter = fullName.charAt(0).toUpperCase();

  document.getElementById("userName").textContent = fullName;
  document.getElementById("userRole").textContent =
    `${profile.role === "provider" ? "Provider" : "Client"} · ${profile.user_code}`;
  document.getElementById("avatar").textContent = firstLetter;

  const legalName = document.getElementById("legalName");
  if (legalName) legalName.value = fullName;

  document.getElementById("verificationEmail").textContent = profile.email || "-";
  document.getElementById("verificationPhone").textContent = profile.phone || "-";
  document.getElementById("verificationRole").textContent =
    profile.role === "provider" ? "Provider" : "Client";

  const providerSection = document.getElementById("providerVerificationSection");
  if (providerSection) providerSection.classList.toggle("hidden", profile.role !== "provider");
}

async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "../login.html";
    return null;
  }

  currentUser = sessionData.session.user;

  const { data, error } = await supabase
    .from("users")
    .select("id, user_code, full_name, email, phone, role, status, profile_completed, identity_verified")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) {
    console.error("Verification profile load error:", error);
    showMessage("Unable to load your account.");
    return null;
  }

  if (!["client", "provider"].includes(data.role) || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  if (data.profile_completed !== true) {
    window.location.href = "complete-profile.html";
    return null;
  }

  currentProfile = data;
  return data;
}

async function loadLatestRequest() {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Load verification request error:", error);
    showMessage("Unable to load verification status. Make sure identity-verification-setup.sql has been run.");
    return;
  }

  latestRequest = data?.[0] || null;

  if (currentProfile.identity_verified === true) {
    setStatusCard("approved", latestRequest);
    setFormAvailability(false);
    return;
  }

  const status = latestRequest?.status || "not_submitted";
  setStatusCard(status, latestRequest);
  setFormAvailability(status !== "pending");
}

function validateFile(file, label) {
  if (!file) throw new Error(`${label} is required.`);
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`${label} must be a JPG, PNG, or PDF file.`);
  if (file.size > MAX_FILE_SIZE) throw new Error(`${label} must be 5 MB or smaller.`);
}

function extensionFor(file) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}


const verificationPreviewUrls = new Map();

function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resetFilePreview(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const empty = document.getElementById(`${inputId}Empty`);
  const preview = document.getElementById(`${inputId}Preview`);
  const image = document.getElementById(`${inputId}PreviewImage`);
  const fileCard = document.getElementById(`${inputId}PreviewFile`);
  const pdfFrame = document.getElementById(`${inputId}PreviewPdf`);
  const actions = document.getElementById(`${inputId}SelectedActions`);
  const selectedName = document.getElementById(`${inputId}SelectedName`);
  const selectedSize = document.getElementById(`${inputId}SelectedSize`);
  const shell = document.getElementById(`${inputId}UploadShell`);

  const oldUrl = verificationPreviewUrls.get(inputId);
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
    verificationPreviewUrls.delete(inputId);
  }

  input.value = "";
  image?.removeAttribute("src");
  image?.classList.add("hidden");
  if (pdfFrame) pdfFrame.removeAttribute("src");
  fileCard?.classList.add("hidden");
  preview?.classList.add("hidden");
  empty?.classList.remove("hidden");
  actions?.classList.add("hidden");
  shell?.classList.remove("has-file");

  if (selectedName) selectedName.textContent = "";
  if (selectedSize) selectedSize.textContent = "";
}

function renderFilePreview(inputId) {
  const input = document.getElementById(inputId);
  const file = input?.files?.[0];

  if (!input || !file) {
    resetFilePreview(inputId);
    return;
  }

  try {
    validateFile(
      file,
      inputId === "identityDocument" ? "Identity document" : "Supporting document"
    );
  } catch (error) {
    showMessage(error.message);
    resetFilePreview(inputId);
    return;
  }

  clearMessage();

  const empty = document.getElementById(`${inputId}Empty`);
  const preview = document.getElementById(`${inputId}Preview`);
  const image = document.getElementById(`${inputId}PreviewImage`);
  const fileCard = document.getElementById(`${inputId}PreviewFile`);
  const pdfFrame = document.getElementById(`${inputId}PreviewPdf`);
  const actions = document.getElementById(`${inputId}SelectedActions`);
  const selectedName = document.getElementById(`${inputId}SelectedName`);
  const selectedSize = document.getElementById(`${inputId}SelectedSize`);
  const shell = document.getElementById(`${inputId}UploadShell`);

  const oldUrl = verificationPreviewUrls.get(inputId);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  verificationPreviewUrls.delete(inputId);

  empty?.classList.add("hidden");
  preview?.classList.remove("hidden");
  actions?.classList.remove("hidden");
  shell?.classList.add("has-file");

  if (selectedName) selectedName.textContent = file.name;
  if (selectedSize) selectedSize.textContent = humanFileSize(file.size);

  if (file.type.startsWith("image/")) {
    const objectUrl = URL.createObjectURL(file);
    verificationPreviewUrls.set(inputId, objectUrl);

    if (image) image.src = objectUrl;
    image?.classList.remove("hidden");
    if (pdfFrame) pdfFrame.removeAttribute("src");
    fileCard?.classList.add("hidden");
  } else {
    const objectUrl = URL.createObjectURL(file);
    verificationPreviewUrls.set(inputId, objectUrl);

    image?.removeAttribute("src");
    image?.classList.add("hidden");

    if (pdfFrame) {
      pdfFrame.src = objectUrl;
    }

    fileCard?.classList.remove("hidden");
  }
}

function setupFilePreview(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener("change", () => renderFilePreview(inputId));

  document.getElementById(`${inputId}ChangeBtn`)?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.click();
  });

  document.getElementById(`${inputId}RemoveBtn`)?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetFilePreview(inputId);
  });
}

async function uploadPrivateFile(file, kind) {
  const path = `${currentUser.id}/${crypto.randomUUID()}-${kind}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from("verification-documents")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  return path;
}

async function submitVerification(event) {
  event.preventDefault();
  clearMessage();

  if (currentProfile.identity_verified === true || latestRequest?.status === "pending") {
    showMessage("Your account cannot submit another verification request right now.");
    return;
  }

  const legalName = document.getElementById("legalName").value.trim();
  const idType = document.getElementById("idType").value;
  const idNumberRaw = document.getElementById("idNumber").value.trim();
  const identityFile = document.getElementById("identityDocument").files[0];
  const ageConfirmed = document.getElementById("ageConfirm").checked;
  const privacyConsent = document.getElementById("privacyConsent").checked;

  if (!legalName || !idType || !idNumberRaw) {
    showMessage("Please complete your legal name, identification type, and identification number.");
    return;
  }

  const cleanId = idNumberRaw.replace(/[^A-Za-z0-9]/g, "");

  if (idType === "mykad" && !/^\d{12}$/.test(cleanId)) {
    showMessage("MyKad number must contain 12 digits.");
    return;
  }

  if (idType === "passport" && cleanId.length < 6) {
    showMessage("Please enter a valid passport number.");
    return;
  }

  if (!ageConfirmed) {
    showMessage("You must confirm that you are at least 18 years old.");
    return;
  }

  if (!privacyConsent) {
    showMessage("Please consent to the use of your information for identity verification.");
    return;
  }

  try {
    validateFile(identityFile, "Identity document");
  } catch (error) {
    showMessage(error.message);
    return;
  }

  const supportingFile = document.getElementById("supportingDocument")?.files?.[0] || null;

  if (supportingFile) {
    try {
      validateFile(supportingFile, "Supporting document");
    } catch (error) {
      showMessage(error.message);
      return;
    }
  }

  const button = document.getElementById("submitVerificationBtn");
  button.disabled = true;
  button.textContent = "Uploading...";

  let identityPath = null;
  let supportingPath = null;

  try {
    identityPath = await uploadPrivateFile(identityFile, "identity");
    if (supportingFile) supportingPath = await uploadPrivateFile(supportingFile, "supporting");

    const payload = {
      user_id: currentUser.id,
      role: currentProfile.role,
      legal_name: legalName,
      id_type: idType,
      id_number_last4: cleanId.slice(-4),
      identity_document_path: identityPath,
      supporting_document_path: supportingPath,
      status: "pending",
    };

    if (currentProfile.role === "provider") {
      payload.business_name = document.getElementById("businessName")?.value.trim() || null;
      payload.ssm_number = document.getElementById("ssmNumber")?.value.trim() || null;
      payload.professional_license = document.getElementById("professionalLicense")?.value.trim() || null;
    }

    const { error } = await supabase.from("verification_requests").insert(payload);
    if (error) throw error;

    await createNotification(
      currentUser.id,
      "Verification submitted",
      "Your identity verification request has been submitted for administrator review."
    );

    document.getElementById("verificationForm").reset();
    resetFilePreview("identityDocument");
    resetFilePreview("supportingDocument");
    document.getElementById("legalName").value = currentProfile.full_name || "";
    showMessage("Verification submitted successfully. An administrator will review your documents.", "success");
    await loadLatestRequest();
  } catch (error) {
    console.error("Verification submit error:", error);
    const pathsToRemove = [identityPath, supportingPath].filter(Boolean);
    if (pathsToRemove.length) {
      await supabase.storage.from("verification-documents").remove(pathsToRemove);
    }
    showMessage(error.message || "Unable to submit verification.");
    setFormAvailability(true);
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const profile = await getCurrentProfile();
  if (!profile) return;
  displayProfile(profile);
  setupFilePreview("identityDocument");
  setupFilePreview("supportingDocument");
  await loadLatestRequest();
  document.getElementById("verificationForm")?.addEventListener("submit", submitVerification);
});
