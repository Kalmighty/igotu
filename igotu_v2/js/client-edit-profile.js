import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import {
  MEDIA_BUCKET,
  AVATARS,
  BANNERS,
  COLORS,
  PATTERNS,
  defaults,
  asset,
  settingsOf,
  readMedia,
  paintBanner,
  signedMedia,
} from "./client-profile-media.js";
const $ = (id) => document.getElementById(id);
let profile,
  confirmedMedia,
  draft = defaults(),
  files = {},
  saving = false,
  mediaReady = false,
  mediaLoading = true,
  attempt = null,
  opener = null,
  editor = null,
  bitmap = null,
  decodeVersion = 0,
  discardAction = null,
  allowLeave = false,
  previewTimer,
  renderVersion = 0;
const signed = new Map(),
  retired = new Set();
function showMessage(message, type = "error") {
  $("messageBox").textContent = message;
  $("messageBox").className = `message-box ${type}`;
}
function clearMessage() {
  $("messageBox").textContent = "";
  $("messageBox").className = "message-box hidden";
}
function initial(name) {
  return Array.from(String(name || "").trim())[0]?.toUpperCase() || "?";
}
function personalDirty() {
  return (
    profile &&
    ($("fullName").value.trim() !== profile.full_name ||
      $("phone").value.trim() !== (profile.phone || ""))
  );
}
function appearanceDirty() {
  return (
    mediaReady &&
    (JSON.stringify(draft) !==
      JSON.stringify(settingsOf(confirmedMedia, profile.id)) ||
      Object.keys(files).length > 0)
  );
}
function dirty() {
  return !!(personalDirty() || appearanceDirty());
}
function setSaving(value) {
  saving = value;
  $("saveProfileBtn").disabled = value || !profile;
  $("editProfileForm").setAttribute("aria-busy", String(value));
  $("personalFields").disabled = value || !profile;
  $("saveProfileBtn").textContent = value ? "Saving…" : "Save Changes";
  $("editPictureBtn").disabled = value || !mediaReady;
  $("changeBannerBtn").disabled = value || !mediaReady;
  $("retryAppearanceBtn").disabled = value;
}
function displayProfile(p, fill = true) {
  profile = p;
  const name = p.full_name || "Client";
  $("userName").textContent = name;
  $("userRole").textContent = p.user_code
    ? `Client · ${p.user_code}`
    : "Client";
  $("avatar").textContent = initial(name);
  $("profileMenuTrigger").setAttribute(
    "aria-label",
    `Account menu for ${name}, Client`,
  );
  if (fill) {
    $("fullName").value = p.full_name || "";
    $("phone").value = p.phone || "";
  }
  for (const [id, key] of [
    ["accountEmail", "email"],
    ["accountUserCode", "user_code"],
    ["accountRole", "role"],
    ["accountStatus", "status"],
  ])
    $(id).textContent = typeof p[key] === "string" && p[key] ? p[key] : "—";
  void renderAppearance();
}
async function getCurrentClientProfile() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError)
    throw Error("Your account could not be confirmed. Please retry.");
  if (!sessionData.session) {
    location.href = "../login.html";
    return null;
  }
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, user_code, full_name, email, phone, role, status, profile_completed",
    )
    .eq("id", sessionData.session.user.id)
    .single();
  if (error || !data)
    throw Error("Unable to load your profile. Please try again.");
  if (data.role !== "client" || data.status !== "active") {
    await supabase.auth.signOut();
    location.href = "../login.html";
    return null;
  }
  if (data.profile_completed !== true) {
    location.href = "complete-profile.html";
    return null;
  }
  return data;
}
function revokeFiles() {
  for (const file of Object.values(files)) URL.revokeObjectURL(file.url);
  files = {};
}
async function renderAppearance() {
  const version = ++renderVersion,
    name = $("fullName").value.trim() || profile?.full_name || "Your profile";
  $("editProfileDisplayName").textContent = name;
  $("editProfileAvatar").textContent = initial(name);
  $("appearanceState").textContent = saving
    ? "Saving"
    : !mediaReady
      ? mediaLoading
        ? "Loading"
        : "Unavailable"
      : appearanceDirty()
        ? "Unsaved preview"
        : "Saved appearance";
  paintBanner(
    $("profileCover"),
    draft,
    files.banner?.url || signed.get(draft.banner_value) || "",
  );
  const src =
    draft.avatar_mode === "template"
      ? asset("avatars", draft.avatar_value)
      : draft.avatar_mode === "upload"
        ? files.avatar?.url || signed.get(draft.avatar_value)
        : null;
  if (src) {
    const img = new Image();
    img.alt = "";
    img.src = src;
    img.onerror = () => {
      if (version === renderVersion) {
        $("editProfileAvatar").textContent = initial(name);
        $("appearanceNotice").textContent =
          "Your saved picture could not be displayed. The initial is shown instead.";
      }
    };
    $("editProfileAvatar").replaceChildren(img);
  }
}
async function loadAppearance() {
  if (!profile || saving) return;
  $("retryAppearanceBtn").hidden = true;
  mediaLoading = true;
  void renderAppearance();
  try {
    const result = await readMedia(profile.id);
    confirmedMedia = result;
    draft = settingsOf(result, profile.id);
    mediaReady = true;
    $("appearanceNotice").textContent =
      "Appearance changes are previewed here and saved with Save Changes.";
    await refreshPrivateImages();
  } catch {
    mediaReady = false;
    $("appearanceNotice").textContent =
      "Profile appearance is unavailable. Personal information can still be saved. Retry to check availability.";
    $("retryAppearanceBtn").hidden = false;
  }
  mediaLoading = false;
  setSaving(false);
  void renderAppearance();
}
async function refreshPrivateImages() {
  clearTimeout(previewTimer);
  for (const kind of ["avatar", "banner"]) {
    const path =
      confirmedMedia?.[kind + "_mode"] === "upload"
        ? confirmedMedia[kind + "_value"]
        : null;
    if (path) {
      try {
        signed.set(path, await signedMedia(path));
      } catch {
        signed.delete(path);
        $("appearanceNotice").textContent =
          "Saved appearance loaded, but a private image preview is unavailable. Retry loading to refresh it.";
      }
    }
  }
  void renderAppearance();
  previewTimer = setTimeout(() => void refreshPrivateImages(), 240000);
}
function closeEditor() {
  decodeVersion++;
  bitmap?.close?.();
  bitmap = null;
  editor = null;
  $("appearanceDialog").close();
  opener?.focus({ preventScroll: true });
}
function modeValue() {
  return document.querySelector('input[name="appearanceMode"]:checked')?.value;
}
function updateEditor() {
  if (!editor) return;
  const kind = editor.kind,
    mode = modeValue();
  editor.mode = mode;
  $("templatePane").hidden = mode !== "template";
  $("uploadPane").hidden = mode !== "upload";
  $("customPane").hidden = mode !== "custom";
  const preview = $("dialogAppearancePreview");
  preview.classList.toggle("banner-preview", kind === "banner");
  preview.textContent = "";
  preview.style.backgroundImage = "";
  preview.style.backgroundColor = "#e5f5df";
  const value = editor.template;
  if (mode === "template")
    preview.style.backgroundImage = `url("${asset(kind === "avatar" ? "avatars" : "banners", value)}")`;
  else if (mode === "custom")
    paintBanner(preview, { banner_mode: "custom", banner_design: design() });
  else if (mode === "upload") {
    preview.hidden = true;
    $("useAppearancePreview").disabled = !bitmap || editor.processing;
    drawCrop();
    return;
  } else if (kind === "avatar")
    preview.textContent = initial($("fullName").value || profile.full_name);
  else paintBanner(preview, defaults());
  preview.hidden = false;
  $("useAppearancePreview").disabled = false;
}
function design() {
  return {
    color: $("bannerColor").value,
    accent: $("bannerAccent").value,
    pattern: $("bannerPattern").value,
  };
}
function openEditor(kind, button) {
  if (!mediaReady || saving) return;
  opener = button;
  decodeVersion++;
  bitmap?.close?.();
  bitmap = null;
  editor = {
    kind,
    template: kind === "avatar" ? AVATARS[0].id : BANNERS[0].id,
    processing: false,
  };
  $("appearanceDialogTitle").textContent =
    kind === "avatar" ? "Edit Picture" : "Change Banner";
  $("appearanceDialogError").textContent = "";
  $("profileImageFile").value = "";
  $("cropControls").hidden = true;
  const options =
    kind === "avatar"
      ? [
          ["template", "Choose an Avatar"],
          ["upload", "Upload My Picture"],
          ["initial", "Default Avatar"],
        ]
      : [
          ["template", "Choose a Banner"],
          ["upload", "Upload My Banner"],
          ["custom", "Create My Own"],
          ["default", "Reset Banner"],
        ];
  $("appearanceModes").replaceChildren();
  const legend = document.createElement("legend");
  legend.textContent = "Choose an option";
  $("appearanceModes").append(legend);
  const selected =
    draft[kind + "_mode"] === "upload" ? "upload" : draft[kind + "_mode"];
  for (const [value, label] of options) {
    const wrap = document.createElement("label"),
      radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "appearanceMode";
    radio.value = value;
    radio.checked = value === selected;
    radio.addEventListener("change", updateEditor);
    wrap.append(radio, document.createTextNode(label));
    $("appearanceModes").append(wrap);
  }
  $("templateGalleryTitle").textContent =
    kind === "avatar" ? "Choose an avatar" : "Choose a banner";
  $("templateGallery").classList.toggle("banner-gallery", kind === "banner");
  $("templateGallery").replaceChildren();
  for (const template of kind === "avatar" ? AVATARS : BANNERS) {
    const label = document.createElement("label"),
      input = document.createElement("input"),
      img = new Image();
    input.type = "radio";
    input.name = "appearanceTemplate";
    input.value = template.id;
    input.checked =
      (draft[kind + "_mode"] === "template"
        ? draft[kind + "_value"]
        : editor.template) === template.id;
    if (input.checked) editor.template = template.id;
    img.src = asset(kind === "avatar" ? "avatars" : "banners", template.id);
    img.alt = "";
    label.append(input, img, document.createTextNode(template.label));
    input.addEventListener("change", () => {
      editor.template = template.id;
      updateEditor();
    });
    $("templateGallery").append(label);
  }
  const d = draft.banner_design || {
    color: "forest",
    accent: "sage",
    pattern: "gradient",
  };
  for (const [id, key] of [
    ["bannerColor", "color"],
    ["bannerAccent", "accent"],
    ["bannerPattern", "pattern"],
  ])
    $(id).value = d[key];
  $("cropCanvas").classList.toggle("banner-crop", kind === "banner");
  updateEditor();
  $("appearanceDialog").showModal();
}
async function decodeFile(file) {
  const version = ++decodeVersion;
  bitmap?.close?.();
  bitmap = null;
  $("cropControls").hidden = true;
  $("appearanceDialogError").textContent = "";
  if (!file) return;
  editor.processing = true;
  $("useAppearancePreview").disabled = true;
  try {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024 ||
      !file.size
    )
      throw Error(
        "Choose a JPEG, PNG or WebP image up to 10 MB. SVG is not supported.",
      );
    const b = new Uint8Array(await file.slice(0, 32).arrayBuffer()),
      text = (a, z) => String.fromCharCode(...b.slice(a, z));
    if (
      !(
        (file.type === "image/jpeg" && b[0] === 255 && b[1] === 216) ||
        (file.type === "image/png" && b[0] === 137 && text(1, 4) === "PNG") ||
        (file.type === "image/webp" &&
          text(0, 4) === "RIFF" &&
          text(8, 12) === "WEBP")
      )
    )
      throw Error("The file content does not match a supported image.");
    // Check decoded dimensions before allocating an additional crop bitmap.
    const url = URL.createObjectURL(file),
      img = new Image();
    try {
      img.src = url;
      await img.decode();
      if (
        img.naturalWidth * img.naturalHeight > 24000000 ||
        img.naturalWidth < 32 ||
        img.naturalHeight < 32
      )
        throw Error("Use an image between 32 pixels and 24 megapixels.");
      const next = await createImageBitmap(file);
      if (version !== decodeVersion || !editor) {
        next.close();
        return;
      }
      bitmap = next;
    } finally {
      URL.revokeObjectURL(url);
    }
    for (const id of ["cropZoom", "cropX", "cropY"])
      $(id).value = id === "cropZoom" ? 1 : 50;
    $("cropControls").hidden = false;
    drawCrop();
  } catch (error) {
    if (version === decodeVersion)
      $("appearanceDialogError").textContent =
        error.message || "Image processing failed. Choose another image.";
  } finally {
    if (version === decodeVersion && editor) {
      editor.processing = false;
      updateEditor();
    }
  }
}
function drawCrop() {
  if (!bitmap || !editor) return;
  const canvas = $("cropCanvas"),
    kind = editor.kind,
    width = kind === "avatar" ? 512 : 1200,
    height = kind === "avatar" ? 512 : 400;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const zoom = Number($("cropZoom").value),
    scale = Math.max(width / bitmap.width, height / bitmap.height) * zoom,
    sw = width / scale,
    sh = height / scale,
    x = ((bitmap.width - sw) * Number($("cropX").value)) / 100,
    y = ((bitmap.height - sh) * Number($("cropY").value)) / 100;
  ctx.fillStyle = "#fafaf6";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, x, y, sw, sh, 0, 0, width, height);
  $("cropZoomValue").textContent = `${zoom.toFixed(2)}×`;
}
async function usePreview() {
  if (!editor || editor.processing) return;
  const current = editor,
    kind = current.kind,
    mode = current.mode;
  $("appearanceDialogError").textContent = "";
  try {
    let processed = null;
    if (mode === "upload") {
      if (!bitmap) throw Error("Choose an image and check the crop first.");
      current.processing = true;
      $("useAppearancePreview").disabled = true;
      drawCrop();
      for (const quality of [0.85, 0.7, 0.55]) {
        processed = await new Promise((resolve) =>
          $("cropCanvas").toBlob(resolve, "image/webp", quality),
        );
        if (
          processed?.type === "image/webp" &&
          processed.size <= (kind === "avatar" ? 2 : 5) * 1024 * 1024
        )
          break;
        processed = null;
      }
      if (!processed)
        throw Error(
          "The processed image could not fit the size limit. Choose a smaller image.",
        );
      if (editor !== current) return;
    }
    if (files[kind]) {
      URL.revokeObjectURL(files[kind].url);
      delete files[kind];
    }
    draft[kind + "_mode"] = mode;
    draft[kind + "_value"] =
      mode === "template"
        ? current.template
        : mode === "upload"
          ? confirmedMedia?.[kind + "_mode"] === "upload"
            ? confirmedMedia[kind + "_value"]
            : null
          : null;
    if (kind === "banner")
      draft.banner_design = mode === "custom" ? design() : null;
    if (processed) {
      files[kind] = {
        blob: processed,
        url: URL.createObjectURL(processed),
        id: crypto.randomUUID(),
      };
      draft[kind + "_value"] = null;
    }
    closeEditor();
    $("appearanceNotice").textContent =
      "Unsaved preview. Use Save Changes to confirm this appearance.";
    void renderAppearance();
  } catch (error) {
    $("appearanceDialogError").textContent =
      error.message || "Unable to prepare this preview.";
    if (editor === current) {
      current.processing = false;
      updateEditor();
    }
  }
}
function fingerprint() {
  return JSON.stringify({
    draft,
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.id])),
  });
}
function notifyMedia() {
  document.dispatchEvent(new Event("igotu:profile-media-saved"));
  try {
    const c = new BroadcastChannel(`igotu-profile-media-${profile.id}`);
    c.postMessage("refresh");
    c.close();
  } catch {}
}
async function acknowledge(result) {
  for (const kind of ["avatar", "banner"])
    if (
      confirmedMedia?.[kind + "_mode"] === "upload" &&
      confirmedMedia[kind + "_value"] !== result[kind + "_value"]
    )
      retired.add(confirmedMedia[kind + "_value"]);
  confirmedMedia = result;
  draft = settingsOf(result, profile.id);
  revokeFiles();
  attempt = null;
  $("appearanceNotice").textContent = "Appearance saved.";
  await refreshPrivateImages();
  notifyMedia();
}
async function saveAppearance() {
  if (attempt) {
    // Resolve a lost response before starting or retrying another operation.
    const latest = await readMedia(profile.id);
    if (latest.last_operation_id === attempt.id) {
      const same = attempt.fingerprint === fingerprint();
      const previous = attempt;
      attempt = null;
      if (same) {
        await acknowledge(latest);
        return;
      }
      confirmedMedia = latest;
      for (const path of previous.paths)
        if (![latest.avatar_value, latest.banner_value].includes(path))
          retired.add(path);
    } else if (latest.version !== attempt.version) {
      $("retryAppearanceBtn").hidden = false;
      $("retryAppearanceBtn").textContent = "Reload saved appearance";
      throw Error(
        "Your appearance changed in another tab. Your preview is kept. Reload the saved appearance before trying again.",
      );
    }
  }
  if (!attempt || attempt.fingerprint !== fingerprint()) {
    if (attempt) for (const path of attempt.paths) retired.add(path);
    attempt = {
      id: crypto.randomUUID(),
      version: confirmedMedia.version,
      fingerprint: fingerprint(),
      settings: structuredClone(draft),
      uploads: {},
      paths: [],
    };
  }
  const current = attempt;
  for (const [kind, file] of Object.entries(files)) {
    const path = `${profile.id}/${kind}/${current.id}.webp`;
    current.settings[kind + "_value"] = path;
    if (!current.paths.includes(path)) current.paths.push(path);
    if (!current.uploads[kind]) {
      $("appearanceState").textContent = `Uploading ${kind}`;
      let response;
      try {
        response = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, file.blob, {
            upsert: false,
            contentType: "image/webp",
            cacheControl: "300",
          });
      } catch {
        throw Error(
          `The ${kind} upload could not be confirmed. Your preview is kept; retry uses the same private path.`,
        );
      }
      const { error } = response;
      if (error) {
        if (String(error.statusCode || error.status) === "409")
          await signedMedia(path);
        else
          throw Error(
            `The ${kind} upload could not be confirmed. Your preview is kept; retry uses the same private path.`,
          );
      }
      current.uploads[kind] = true;
    }
  }
  const settings = settingsOf(current.settings, profile.id);
  $("appearanceState").textContent = "Saving appearance";
  let result;
  try {
    const response = await supabase.rpc("save_client_profile_media", {
      p_expected_version: current.version,
      p_operation_id: current.id,
      p_settings: settings,
    });
    if (response.error) throw Error();
    result = response.data;
  } catch {
    const latest = await readMedia(profile.id);
    if (
      latest.last_operation_id !== current.id &&
      latest.version !== current.version
    ) {
      $("retryAppearanceBtn").hidden = false;
      $("retryAppearanceBtn").textContent = "Reload saved appearance";
      throw Error(
        "Your appearance changed in another tab. Your preview is kept. Reload the saved appearance before trying again.",
      );
    }
    if (latest.last_operation_id !== current.id)
      throw Error(
        "Appearance saving could not be confirmed. Your preview is kept. Retry checks the saved state before reusing this attempt.",
      );
    result = latest;
  }
  if (
    !result ||
    result.user_id !== profile.id ||
    result.last_operation_id !== current.id ||
    result.version !== current.version + 1
  )
    throw Error(
      "The appearance save response could not be confirmed. Retry to check it safely.",
    );
  if (
    JSON.stringify(settingsOf(result, profile.id)) !== JSON.stringify(settings)
  )
    throw Error(
      "The saved appearance did not match this preview. Retry to check it safely.",
    );
  await acknowledge(result);
  // Only after an acknowledged version change can abandoned/old paths be retired.
  const obsolete = [...retired].filter(
    (path) =>
      ![confirmedMedia.avatar_value, confirmedMedia.banner_value].includes(
        path,
      ),
  );
  if (obsolete.length) {
    try {
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .remove(obsolete);
      if (error) throw Error();
      for (const path of obsolete) retired.delete(path);
    } catch {
      $("appearanceNotice").textContent =
        "Appearance saved. Some old private files await cleanup; your current images are kept.";
    }
  }
}
async function saveProfile(event) {
  event.preventDefault();
  if (saving || !profile) return;
  clearMessage();
  const fullName = $("fullName").value.trim(),
    phone = $("phone").value.trim();
  if (!fullName || !phone) {
    showMessage("Please enter your full name and phone number.");
    return;
  }
  if (phone.replace(/[^0-9+]/g, "").length < 7) {
    showMessage("Please enter a valid phone number.");
    return;
  }
  if (!dirty()) {
    showMessage("There are no unsaved changes.", "success");
    return;
  }
  const changeAppearance = appearanceDirty(),
    changePersonal = personalDirty();
  let appearanceSaved = false;
  setSaving(true);
  try {
    if (changeAppearance) {
      await saveAppearance();
      appearanceSaved = true;
    }
    if (changePersonal) {
      const { data, error } = await supabase.rpc("complete_basic_profile", {
        p_full_name: fullName,
        p_phone: phone,
      });
      if (error)
        throw Error(
          "Personal information saving could not be confirmed. Your entered values are kept for retry.",
        );
      const updated = Array.isArray(data) ? data[0] : data;
      const checked = updated || (await getCurrentClientProfile());
      if (
        !checked ||
        checked.id !== profile.id ||
        checked.role !== "client" ||
        checked.status !== "active" ||
        checked.full_name !== fullName ||
        checked.phone !== phone
      )
        throw Error(
          "Your profile save response could not be confirmed. Your entered values are kept for retry.",
        );
      displayProfile(checked);
      try {
        localStorage.setItem("igotu_user", JSON.stringify(checked));
      } catch {}
    }
    showMessage("Profile updated successfully.", "success");
  } catch (error) {
    showMessage(
      `${appearanceSaved ? "Appearance saved. " : ""}${error.message || "Unable to save your profile. Your changes are kept for retry."}`,
    );
  } finally {
    setSaving(false);
    void renderAppearance();
  }
}
function resetConfirmed() {
  revokeFiles();
  if (confirmedMedia) draft = settingsOf(confirmedMedia, profile.id);
  displayProfile(profile);
  clearMessage();
  if (mediaReady)
    $("appearanceNotice").textContent =
      "Preview reset to the last confirmed appearance.";
  void renderAppearance();
}
function askDiscard(action) {
  if (!dirty()) {
    action();
    return;
  }
  discardAction = action;
  opener = document.activeElement;
  $("unsavedProfileDialog").showModal();
}
function setup() {
  $("editProfileForm").addEventListener("submit", saveProfile);
  $("fullName").addEventListener("input", () => void renderAppearance());
  $("editPictureBtn").onclick = () => openEditor("avatar", $("editPictureBtn"));
  $("changeBannerBtn").onclick = () =>
    openEditor("banner", $("changeBannerBtn"));
  $("closeAppearanceDialog").onclick = $("cancelAppearanceDialog").onclick =
    closeEditor;
  $("appearanceDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor();
  });
  $("profileImageFile").onchange = () =>
    void decodeFile($("profileImageFile").files[0]);
  for (const id of ["cropZoom", "cropX", "cropY"]) $(id).oninput = drawCrop;
  for (const [id, values] of [
    ["bannerColor", Object.keys(COLORS)],
    ["bannerAccent", Object.keys(COLORS)],
    ["bannerPattern", PATTERNS],
  ]) {
    for (const value of values) {
      const option = new Option(
        value.charAt(0).toUpperCase() + value.slice(1),
        value,
      );
      $(id).append(option);
    }
    $(id).onchange = updateEditor;
  }
  $("useAppearancePreview").onclick = () => void usePreview();
  $("retryAppearanceBtn").onclick = () => {
    if (dirty())
      askDiscard(() => {
        resetConfirmed();
        void loadAppearance();
      });
    else void loadAppearance();
  };
  $("cancelProfileBtn").onclick = () => askDiscard(resetConfirmed);
  $("keepEditingBtn").onclick = () => {
    $("unsavedProfileDialog").close();
    discardAction = null;
    opener?.focus();
  };
  $("unsavedProfileDialog").addEventListener("cancel", () => {
    discardAction = null;
    opener?.focus();
  });
  $("discardChangesBtn").onclick = () => {
    const action = discardAction;
    discardAction = null;
    $("unsavedProfileDialog").close();
    action?.();
  };
  document.addEventListener(
    "click",
    (event) => {
      if (allowLeave || saving || event.defaultPrevented) return;
      const link = event.target.closest("a[href]");
      const logout = event.target.closest("#profileLogoutBtn");
      if ((link || logout) && dirty()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        askDiscard(() => {
          allowLeave = true;
          if (logout) logout.click();
          else location.href = link.href;
        });
      }
    },
    true,
  );
  window.addEventListener("beforeunload", (event) => {
    if (dirty() && !allowLeave) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(previewTimer);
    decodeVersion++;
    bitmap?.close?.();
    revokeFiles();
    signed.clear();
    renderVersion++;
  });
}
async function load() {
  $("retryProfileBtn").hidden = true;
  $("profileLoading").hidden = false;
  try {
    const p = await getCurrentClientProfile();
    if (!p) return;
    displayProfile(p);
    $("profileLoading").hidden = true;
    setSaving(false);
    await loadAppearance();
  } catch (error) {
    $("profileLoading").textContent =
      error.message || "Unable to load your profile.";
    $("retryProfileBtn").hidden = false;
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await authorizeWorkspace()).allowed) return;
  setup();
  $("retryProfileBtn").onclick = () => void load();
  await load();
});
