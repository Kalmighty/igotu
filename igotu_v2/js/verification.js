import { authorizeWorkspace, logoutAccount } from "./profile-guard.js";
import { isIdentityApproved } from "./identity-access.js";
import { supabase } from "./supabaseClient.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

let currentUser = null;
let currentProfile = null;
let latestRequest = null;
let submissionInProgress = false;
let statusKnown = false;
let refreshInProgress = false;
let hasConfirmedStatus = false;
let uncertainSubmission = false;
let logoutInProgress = false;

function showMessage(message, type = "error") {
  const box = document.getElementById("messageBox");
  if (!box) return;
  box.setAttribute("role", type === "error" ? "alert" : "status");
  box.textContent = message;
  box.className = `message-box ${type}`;
}

function clearMessage() {
  const box = document.getElementById("messageBox");
  if (!box) return;
  box.textContent = "";
  box.className = "message-box hidden";
}

function setSubmissionFeedback(phase, message) {
  document.body.dataset.submissionPhase = phase;
  const status = document.getElementById("verificationSubmissionPhase");
  if (status) status.textContent = message;
}
function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Unavailable";
  return (
    date.toLocaleString("en-MY", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    }) + " MYT"
  );
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
    title.textContent = "Identity Approved";
    text.textContent =
      "Your identity has been approved by an IGotU administrator.";
  } else if (status === "pending") {
    badge.classList.add("verification-pending");
    badge.textContent = "Pending Review";
    title.textContent = "Your Verification Is Under Review";
    text.textContent =
      "We’ve received your identification documents. An IGotU administrator will review your submission before you can use the platform. Use Refresh status to check for a decision.";
  } else if (status === "rejected") {
    badge.classList.add("verification-rejected");
    badge.textContent = "Verification Rejected";
    title.textContent = "Verification Rejected";
    text.textContent =
      "Your previous verification request was rejected. Review the note below and submit again.";
  } else {
    badge.classList.add("verification-not-submitted");
    badge.textContent = "Not Verified";
    title.textContent = "Verify Your Identity";
    text.textContent =
      "Submit your identity for administrator approval before you can access your workspace. No review time is guaranteed.";
  }

  if (request?.admin_note) {
    adminNote.textContent = request.admin_note;
    adminNoteWrap.classList.remove("hidden");
  } else {
    adminNoteWrap.classList.add("hidden");
    adminNote.textContent = "";
  }

  document.body.dataset.verificationState = status;
  document
    .getElementById("verificationFormPanel")
    .classList.toggle("hidden", ["approved", "pending"].includes(status));
  const next = document.getElementById("continueVerificationBtn");
  next.classList.toggle("hidden", status !== "approved");
  next.href =
    currentProfile?.profile_completed === true
      ? "dashboard.html"
      : "complete-profile.html";
  next.textContent =
    currentProfile?.profile_completed === true
      ? "Continue to your dashboard"
      : "Continue to complete your profile";
  const allComplete =
    status === "approved" && currentProfile?.profile_completed === true;
  const activeIndex = allComplete
    ? -1
    : status === "approved"
      ? 2
      : status === "pending"
        ? 1
        : 0;
  ["progressIdentity", "progressReview", "progressProfile"].forEach(
    (id, index) => {
      const item = document.getElementById(id);
      const complete =
        allComplete ||
        (status === "approved" && index < 2) ||
        (status === "pending" && index === 0);
      const current = index === activeIndex;
      item.dataset.complete = String(complete);
      if (current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.querySelector(".verification-step-number").textContent = complete
        ? "✓"
        : `0${index + 1}`;
      item.querySelector(".verification-step-status").textContent = complete
        ? "Completed"
        : current
          ? status === "rejected"
            ? "Resubmission required"
            : "Current step"
          : "Not completed";
    },
  );
  const formLink = document.getElementById("verificationSubmitLink");
  formLink.classList.toggle("hidden", ["approved", "pending"].includes(status));
  formLink.textContent =
    status === "rejected"
      ? "Resubmit Verification ↓"
      : "Go to submission form ↓";
  document.querySelector(".verification-timeline").hidden = !request;
  const submitted = document.getElementById("verificationSubmittedAt");
  const reviewed = document.getElementById("verificationReviewedAt");
  if (submitted)
    submitted.textContent = request?.submitted_at
      ? formatDate(request.submitted_at)
      : "Unavailable";
  if (reviewed)
    reviewed.textContent = request?.reviewed_at
      ? formatDate(request.reviewed_at)
      : "Unavailable";
}

function setFormAvailability(canSubmit) {
  const form = document.getElementById("verificationForm");
  const button = document.getElementById("submitVerificationBtn");
  if (!form || !button) return;
  const enabled =
    canSubmit &&
    !submissionInProgress &&
    !refreshInProgress &&
    !uncertainSubmission;
  form.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = !enabled;
  });
  form.setAttribute("aria-busy", String(submissionInProgress));
  if (submissionInProgress) return;
  button.textContent = uncertainSubmission
    ? "Check submission status"
    : latestRequest?.status === "pending"
      ? "Verification Pending"
      : isIdentityApproved(currentProfile, latestRequest)
        ? "Already Verified"
        : latestRequest?.status === "rejected"
          ? "Resubmit Verification"
          : "Submit for Verification";
}

function displayProfile(profile, fillLegalName = true) {
  const fullName =
    profile.full_name || (profile.role === "provider" ? "Provider" : "Client");
  const legalName = document.getElementById("legalName");
  if (legalName && fillLegalName) legalName.value = fullName;

  document.getElementById("verificationEmail").textContent =
    profile.email || "-";
  document.getElementById("verificationPhone").textContent =
    profile.phone || "Not provided";
  document.getElementById("verificationRole").textContent =
    profile.role === "provider" ? "Provider" : "Client";

  const providerSection = document.getElementById(
    "providerVerificationSection",
  );
  if (providerSection)
    providerSection.classList.toggle("hidden", profile.role !== "provider");
}

async function refreshVerification(options = {}) {
  if (refreshInProgress || (submissionInProgress && !options.afterSubmission))
    return;
  refreshInProgress = true;
  document.body.dataset.refreshing = "true";
  statusKnown = false;
  document.body.dataset.statusFresh = "false";
  setFormAvailability(false);
  const button = document.getElementById("refreshVerificationBtn");
  const restoreRefreshFocus = document.activeElement === button;
  button.disabled = true;
  button.querySelector("span").textContent = "Checking…";
  document
    .getElementById("verificationStatusCard")
    .setAttribute("aria-busy", "true");
  document.getElementById("verificationRefreshStatus").textContent =
    "Checking your current verification status…";
  try {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select(
        "id,user_code,full_name,email,phone,role,status,profile_completed,identity_verified,identity_verified_at,identity_verified_by",
      )
      .eq("id", currentUser.id)
      .single();
    if (profileError || !profile) throw new Error();
    if (profile.status !== "active" || profile.role !== currentProfile.role) {
      await logoutAccount();
      return;
    }
    currentProfile = profile;
    displayProfile(profile, false);
    document.getElementById("verificationAccountLabel").textContent =
      `${profile.role === "provider" ? "Provider" : "Client"} · ${profile.user_code || "Account verification"}`;
    const { data, error } = await supabase
      .from("verification_requests")
      .select("id,role,status,admin_note,submitted_at,reviewed_at,reviewed_by")
      .eq("user_id", currentUser.id)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (error) throw new Error();
    latestRequest = data?.[0] || null;
    const approved = isIdentityApproved(currentProfile, latestRequest);
    const status = approved
      ? "approved"
      : latestRequest?.status === "approved"
        ? "not_submitted"
        : latestRequest?.status || "not_submitted";
    statusKnown = true;
    hasConfirmedStatus = true;
    if (status === "pending" || status === "approved")
      uncertainSubmission = false;
    document.getElementById("verificationStaleNotice").hidden = true;
    if (!submissionInProgress) clearMessage();
    setStatusCard(status, latestRequest);
    document.getElementById("verificationRefreshStatus").textContent =
      uncertainSubmission
        ? "The earlier submission is still unconfirmed. Do not resubmit; refresh again later or contact the administrator."
        : "Status refreshed from your account.";
    if (!submissionInProgress)
      setSubmissionFeedback(
        uncertainSubmission ? "uncertain" : "ready",
        uncertainSubmission
          ? "Submission outcome uncertain. Check status again before sending another request."
          : "Ready to submit when the required information and consents are complete.",
      );
    setFormAvailability(!approved && status !== "pending");
  } catch {
    showMessage(
      "Verification status could not be checked. Refresh status before submitting or continuing.",
    );
    document.getElementById("continueVerificationBtn").classList.add("hidden");
    document.getElementById("verificationSubmitLink").classList.add("hidden");
    document.getElementById("verificationStaleNotice").hidden = false;
    document.getElementById("verificationStaleNotice").textContent =
      hasConfirmedStatus
        ? "Last confirmed status. The latest check failed; refresh before submitting or continuing."
        : "Your current status could not be confirmed. Access remains restricted until a successful check.";
    if (!hasConfirmedStatus) {
      document.getElementById("verificationStatusBadge").textContent =
        "Status Unavailable";
      document.getElementById("verificationStatusTitle").textContent =
        "Unable to Confirm Identity Status";
      document.getElementById("verificationStatusText").textContent =
        "Use Refresh Status to check your account again.";
      document.body.dataset.verificationState = "error";
    }
    document.getElementById("verificationRefreshStatus").textContent =
      "The latest status check failed. Your entered information has been kept.";
    setFormAvailability(false);
  } finally {
    refreshInProgress = false;
    document.body.dataset.refreshing = "false";
    button.disabled = submissionInProgress;
    button.querySelector("span").textContent = "Refresh Status";
    document
      .getElementById("verificationStatusCard")
      .setAttribute("aria-busy", "false");
    document.body.dataset.statusFresh = String(statusKnown);
    if (
      !button.disabled &&
      restoreRefreshFocus &&
      [document.body, button].includes(document.activeElement)
    )
      button.focus({ preventScroll: true });
    setFormAvailability(
      statusKnown &&
        !isIdentityApproved(currentProfile, latestRequest) &&
        latestRequest?.status !== "pending",
    );
  }
}

function validateFile(file, label) {
  if (!file) throw new Error(`${label} is required.`);
  if (!ALLOWED_TYPES.includes(file.type))
    throw new Error(`${label} must be a JPG, PNG, or PDF file.`);
  if (file.size > MAX_FILE_SIZE)
    throw new Error(`${label} must be 5 MB or smaller.`);
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
      inputId === "identityDocument"
        ? "Identity document"
        : "Supporting document",
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

  document
    .getElementById(`${inputId}ChangeBtn`)
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      input.click();
    });

  document
    .getElementById(`${inputId}RemoveBtn`)
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetFilePreview(inputId);
      input.focus();
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
  if (submissionInProgress) return;
  clearMessage();

  if (
    submissionInProgress ||
    !statusKnown ||
    uncertainSubmission ||
    isIdentityApproved(currentProfile, latestRequest) ||
    latestRequest?.status === "pending"
  ) {
    showMessage(
      "Your account cannot submit another verification request right now.",
    );
    return;
  }

  const legalName = document.getElementById("legalName").value.trim();
  const idType = document.getElementById("idType").value;
  const idNumberRaw = document.getElementById("idNumber").value.trim();
  const identityFile = document.getElementById("identityDocument").files[0];
  const ageConfirmed = document.getElementById("ageConfirm").checked;
  const privacyConsent = document.getElementById("privacyConsent").checked;

  if (!legalName || !idType || !idNumberRaw) {
    showMessage(
      "Please complete your legal name, identification type, and identification number.",
    );
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
    showMessage(
      "Please consent to the use of your information for identity verification.",
    );
    return;
  }

  try {
    validateFile(identityFile, "Identity document");
  } catch (error) {
    showMessage(error.message);
    return;
  }

  const supportingFile =
    document.getElementById("supportingDocument")?.files?.[0] || null;

  if (supportingFile) {
    try {
      validateFile(supportingFile, "Supporting document");
    } catch (error) {
      showMessage(error.message);
      return;
    }
  }

  const button = document.getElementById("submitVerificationBtn");
  submissionInProgress = true;
  button.disabled = true;
  setFormAvailability(false);
  document.getElementById("refreshVerificationBtn").disabled = true;
  button.textContent = "Uploading document…";
  setSubmissionFeedback(
    "uploading",
    "Uploading your document to private storage…",
  );

  let identityPath = null;
  let supportingPath = null;
  let committed = false;
  let insertStarted = false;
  let definiteInsertFailure = false;

  try {
    identityPath = await uploadPrivateFile(identityFile, "identity");
    if (supportingFile)
      supportingPath = await uploadPrivateFile(supportingFile, "supporting");

    const payload = {
      user_id: currentUser.id,
      role: currentProfile.role,
      legal_name: legalName,
      id_type: idType,
      id_number_last4: cleanId.slice(-4),
      identity_document_path: identityPath,
      supporting_document_path: supportingPath,
      status: "pending",
      age_confirmed: ageConfirmed,
      privacy_consent: privacyConsent,
    };

    if (currentProfile.role === "provider") {
      payload.business_name =
        document.getElementById("businessName")?.value.trim() || null;
      payload.ssm_number =
        document.getElementById("ssmNumber")?.value.trim() || null;
      payload.professional_license =
        document.getElementById("professionalLicense")?.value.trim() || null;
    }

    button.textContent = "Submitting verification…";
    setSubmissionFeedback(
      "submitting",
      "Submitting your verification for administrator review…",
    );
    insertStarted = true;
    const { error } = await supabase
      .from("verification_requests")
      .insert(payload);
    if (error) {
      // A coded API rejection follows the existing rollback/cleanup path.
      // Thrown transport failures or responses without a code may be uncertain.
      definiteInsertFailure =
        typeof error.code === "string" && error.code.trim() !== "";
      throw error;
    }

    committed = true;
    document.getElementById("idNumber").value = "";

    document.getElementById("verificationForm").reset();
    resetFilePreview("identityDocument");
    resetFilePreview("supportingDocument");
    document.getElementById("legalName").value = currentProfile.full_name || "";
    showMessage(
      "Verification submitted successfully. An administrator will review your documents.",
      "success",
    );
    setSubmissionFeedback(
      "confirmed",
      "Submission confirmed. An administrator will review your documents.",
    );
    await refreshVerification({ afterSubmission: true });
    if (!statusKnown)
      showMessage(
        "Your submission was confirmed, but the latest status could not be checked. Refresh status to continue.",
      );
    document
      .getElementById("verificationStatusTitle")
      .setAttribute("tabindex", "-1");
    document
      .getElementById("verificationStatusTitle")
      .focus({ preventScroll: true });
  } catch (error) {
    // Do not log identity values, document paths or raw Storage errors.
    const uncertain = insertStarted && !committed && !definiteInsertFailure;
    const pathsToRemove = [identityPath, supportingPath].filter(Boolean);
    let cleanupUnconfirmed = false;
    if (!committed && !uncertain && pathsToRemove.length) {
      try {
        const cleanup = await supabase.storage
          .from("verification-documents")
          .remove(pathsToRemove);
        cleanupUnconfirmed = !!cleanup?.error;
      } catch {
        cleanupUnconfirmed = true;
        // Orphan cleanup is best effort; a second network error must not strand
        // the form or disclose document paths. Retention cleanup needs staging.
      }
    }
    if (uncertain) {
      uncertainSubmission = true;
      statusKnown = false;
      document.body.dataset.statusFresh = "false";
      setSubmissionFeedback(
        "uncertain",
        "Submission outcome uncertain. Your entered information and private upload are kept. Refresh status before sending another request.",
      );
      showMessage(
        "Your submission result could not be confirmed. The uploaded document has been kept safely from automatic cleanup. Refresh status; do not resubmit while the outcome is uncertain.",
      );
    } else {
      setSubmissionFeedback(
        "failed",
        "Submission failed. Your entered information is kept for retry.",
      );
      showMessage(
        error?.code === "23505"
          ? "A pending request already exists. Refresh your status."
          : committed
            ? "Your submission was received. Refresh status to continue."
            : "Unable to submit verification. Check the required information and try again.",
      );
      if (cleanupUnconfirmed)
        showMessage(
          "Unable to submit verification. Temporary upload cleanup could not be confirmed. Your entered information is kept for retry.",
        );
      if (committed || error?.code === "23505")
        await refreshVerification({ afterSubmission: true });
    }
  } finally {
    submissionInProgress = false;
    document.getElementById("refreshVerificationBtn").disabled =
      refreshInProgress;
    setFormAvailability(
      statusKnown &&
        !isIdentityApproved(currentProfile, latestRequest) &&
        latestRequest?.status !== "pending",
    );
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const access = await authorizeWorkspace();
  if (!access.allowed) return;
  currentProfile = access.profile;
  currentUser = access.user;
  displayProfile(currentProfile);
  document.getElementById("verificationAccountLabel").textContent =
    `${currentProfile.role === "provider" ? "Provider" : "Client"} · ${currentProfile.user_code || "Account verification"}`;
  document
    .getElementById("refreshVerificationBtn")
    .addEventListener("click", () => void refreshVerification());
  document
    .getElementById("verificationLogoutBtn")
    .addEventListener("click", async () => {
      if (logoutInProgress) return;
      logoutInProgress = true;
      const button = document.getElementById("verificationLogoutBtn");
      button.disabled = true;
      try {
        await logoutAccount();
      } catch {
        showMessage("Sign-out could not be completed. Please try again.");
        button.disabled = false;
        logoutInProgress = false;
      }
    });
  document
    .getElementById("verificationSubmitLink")
    .addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById("legalName").focus();
    });
  window.addEventListener("pagehide", () => {
    for (const url of verificationPreviewUrls.values())
      URL.revokeObjectURL(url);
    verificationPreviewUrls.clear();
  });
  setupFilePreview("identityDocument");
  setupFilePreview("supportingDocument");
  await refreshVerification();
  document
    .getElementById("verificationForm")
    ?.addEventListener("submit", submitVerification);
});
