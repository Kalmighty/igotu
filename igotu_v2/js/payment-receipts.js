import { supabase } from "./supabaseClient.js";
import { escapeHtml, safeUrl } from "./html-safety.js";

// Always resolve authorization + historical path/URL consistency on the server.
// Never use a legacy public URL or an unvalidated raw path as a fallback.
async function reference(payment) {
  const { data, error } = await supabase.rpc("payment_proof_reference", {
    p_request_id: payment.request_id,
  });
  if (error || !Array.isArray(data) || !payment.payment_id)
    throw new Error("Receipt unavailable.");
  const rows = data.filter(
    (row) => String(row.payment_id) === String(payment.payment_id),
  );
  if (rows.length > 1) throw new Error("Receipt reference is ambiguous.");
  return rows[0]?.proof_path || null;
}
async function signedPreview(payment) {
  const path = await reference(payment);
  if (!path) return { url: null, image: false };
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, 300);
  const url = safeUrl(data?.signedUrl);
  if (error || !url) throw new Error("Receipt unavailable.");
  return { url, image: /\.(jpe?g|png|webp)$/i.test(path) };
}
export async function prepareReceiptPreviews(payments) {
  const result = [];
  // Bound concurrent signing instead of flooding Storage on an Admin list.
  for (let i = 0; i < payments.length; i += 8) {
    result.push(
      ...(await Promise.all(
        payments.slice(i, i + 8).map(async (payment) => {
          try {
            return { ...payment, receiptPreview: await signedPreview(payment) };
          } catch {
            return { ...payment, receiptPreview: { error: true } };
          }
        }),
      )),
    );
  }
  return result;
}
export function receiptHtml(payment) {
  const preview = payment?.receiptPreview;
  if (preview?.error)
    return '<p class="muted-text">Payment proof could not be checked. Refresh to try again.</p>';
  if (!preview?.url) return '<p class="muted-text">No proof uploaded.</p>';
  return `<div class="payment-proof-preview">
    ${preview.image ? `<img src="${escapeHtml(preview.url)}" alt="Payment proof" class="payment-proof-image">` : "<p>Payment proof document</p>"}
    <button type="button" class="btn btn-outline receipt-open-btn" data-payment-id="${escapeHtml(payment.payment_id)}">Open payment proof</button>
  </div>`;
}
export function bindReceiptButtons(container, payments, onError) {
  const byId = new Map(
    payments.map((payment) => [String(payment.payment_id), payment]),
  );
  container.querySelectorAll(".receipt-open-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const payment = byId.get(button.dataset.paymentId);
      if (!payment || button.disabled) return;
      button.disabled = true;
      // Reserve the window during the user gesture, then obtain a fresh URL.
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      try {
        const preview = await signedPreview(payment);
        if (!preview.url || !popup) throw new Error();
        popup.location.replace(preview.url);
      } catch {
        popup?.close();
        onError(
          "Unable to open payment proof. Refresh or allow popups and try again.",
        );
      } finally {
        button.disabled = false;
      }
    });
  });
}
