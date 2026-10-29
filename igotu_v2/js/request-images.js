import { supabase } from "./supabaseClient.js";
import { escapeHtml } from "./html-safety.js";

// No stored/public/signed URL is ever used as an image source.
export const IMAGE_PREVIEW_MS = 120000;
const previews = new Map();
let sessionGeneration = 0;
export async function requirePrivateRequestImages() {
  const { data, error } = await supabase.rpc("request_image_access_contract");
  if (error || data !== "private-request-images-v1") throw new Error("Private request images are temporarily unavailable.");
}
export function requestImageHtml(request, locked = false) {
  if (locked) return '<p class="muted-text">Request image is private until Provider confirmation.</p>';
  return `<section class="private-request-image" data-image-request="${escapeHtml(request.request_id)}" aria-label="Request image for ${escapeHtml(request.request_id)}">
    <button type="button" class="btn btn-outline request-image-view">View request image</button>
    <p class="request-image-status" role="status">Private preview; access is checked when opened.</p>
  </section>`;
}
function release(slot, message = "Preview expired. Open it again to check access.") {
  const preview = previews.get(slot);
  if (!preview) return;
  clearTimeout(preview.timer);
  URL.revokeObjectURL(preview.url);
  slot.querySelectorAll("img, .request-image-open").forEach(el => el.remove());
  slot.querySelector(".request-image-status").textContent = message;
  previews.delete(slot);
}
function clearPreviews() { previews.forEach((_, slot) => release(slot, "Access must be checked again.")); }
window.addEventListener("pagehide", () => { sessionGeneration++; clearPreviews(); });
supabase.auth.onAuthStateChange(() => { sessionGeneration++; clearPreviews(); });
new MutationObserver(() => previews.forEach((_, slot) => { if (!slot.isConnected) release(slot); }))
  .observe(document.documentElement, { childList: true, subtree: true });

export function bindRequestImages(container = document) {
  container.querySelectorAll(".private-request-image").forEach(slot => {
    if (slot.dataset.bound) return;
    slot.dataset.bound = "true";
    const button = slot.querySelector("button");
    const status = slot.querySelector(".request-image-status");
    let generation = 0;
    button.addEventListener("click", async () => {
      const attempt = ++generation;
      const session = sessionGeneration;
      release(slot);
      button.disabled = true;
      status.textContent = "Checking image access…";
      try {
        await requirePrivateRequestImages();
        const { data, error } = await supabase.rpc("request_image_reference", { p_request_id: slot.dataset.imageRequest });
        if (error || !Array.isArray(data) || data.length > 1) throw new Error();
        if (!data.length) { status.textContent = "No image is available for this request."; return; }
        const path = data[0].image_path;
        if (typeof path !== "string" || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/.test(path) || /(^|\/)\.{1,2}(\/|$)/.test(path)) throw new Error();
        const result = await supabase.storage.from("request-images").download(path);
        if (result.error || !(result.data instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(result.data.type) || result.data.size > 5242880) throw new Error();
        if (attempt !== generation || session !== sessionGeneration || !slot.isConnected) return;
        const url = URL.createObjectURL(result.data);
        const img = document.createElement("img");
        img.className = "request-submitted-image";
        img.alt = "Submitted request image";
        img.addEventListener("error", () => release(slot, "Image could not be displayed. Try again later."), { once: true });
        img.src = url;
        const open = document.createElement("a");
        open.className = "request-image-open";
        open.href = url; open.target = "_blank"; open.rel = "noopener noreferrer";
        open.textContent = "Open image";
        slot.append(img, open);
        previews.set(slot, { url, timer: setTimeout(() => release(slot), IMAGE_PREVIEW_MS) });
        status.textContent = "Private preview available for two minutes.";
      } catch {
        if (attempt === generation) status.textContent = "Image unavailable or access denied. Try again later.";
      } finally { button.disabled = false; }
    });
  });
}
