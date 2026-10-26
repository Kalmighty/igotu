let closeActiveDialog;

function openReasonDialog({ title, message, reasons, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    closeActiveDialog?.(null);
    const opener = document.activeElement;

    const overlay = document.createElement("div");
    overlay.className = "service-reason-modal-overlay";

    overlay.innerHTML = `
      <div class="service-reason-modal" role="dialog" aria-modal="true" aria-labelledby="serviceReasonTitle">
        <div class="service-reason-modal-header">
          <div>
            <h2 id="serviceReasonTitle">${title}</h2>
            <p>${message}</p>
          </div>
          <button type="button" class="service-reason-close" aria-label="Close">×</button>
        </div>

        <div class="service-reason-modal-body">
          <label for="serviceReasonSelect">Reason</label>
          <select id="serviceReasonSelect">
            <option value="">Select a reason</option>
            ${reasons.map((item) => `<option value="${item.value}">${item.label}</option>`).join("")}
          </select>

          <label for="serviceReasonDetails">Additional details <span>Optional</span></label>
          <textarea id="serviceReasonDetails" rows="4" placeholder="Add a short explanation..."></textarea>

          <div id="serviceReasonError" class="message-box error hidden"></div>
        </div>

        <div class="service-reason-modal-actions">
          <button type="button" class="btn btn-outline service-reason-cancel">Keep Request</button>
          <button type="button" class="${danger ? "danger-btn" : "btn"} service-reason-confirm">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const select = overlay.querySelector("#serviceReasonSelect");
    const details = overlay.querySelector("#serviceReasonDetails");
    const error = overlay.querySelector("#serviceReasonError");

    function close(value = null) {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      closeActiveDialog = null;
      if (opener?.isConnected) opener.focus();
      resolve(value);
    }
    closeActiveDialog = close;

    function onKeydown(event) {
      if (event.key === "Escape") { event.preventDefault(); close(null); }
      if (event.key === "Tab") {
        const controls = [...overlay.querySelectorAll("button,select,textarea")].filter(e => !e.disabled);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      }
    }

    overlay.querySelector(".service-reason-close").addEventListener("click", () => close(null));
    overlay.querySelector(".service-reason-cancel").addEventListener("click", () => close(null));

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });

    overlay.querySelector(".service-reason-confirm").addEventListener("click", () => {
      const selected = reasons.find((item) => item.value === select.value);
      if (!selected) {
        error.textContent = "Please select a reason.";
        error.classList.remove("hidden");
        return;
      }

      const extra = details.value.trim();
      const result = extra ? `${selected.label}: ${extra}` : selected.label;
      close(result);
    });

    document.addEventListener("keydown", onKeydown);
    select.focus();
  });
}

export function askCancellationReason() {
  return openReasonDialog({
    title: "Cancel Service Request",
    message: "The request will stay in your history. If a provider has already been selected, they will be notified.",
    confirmLabel: "Cancel Request",
    danger: true,
    reasons: [
      { value: "schedule_changed", label: "Schedule changed" },
      { value: "provider_unavailable", label: "Provider unavailable" },
      { value: "found_another_solution", label: "Found another solution" },
      { value: "price_issue", label: "Price / budget issue" },
      { value: "no_longer_needed", label: "Service no longer needed" },
      { value: "other", label: "Other" },
    ],
  });
}

export function askDeclineReason() {
  return openReasonDialog({
    title: "Decline Service Request",
    message: "The request will return to the client for re-matching and you will not be recommended again for this same request.",
    confirmLabel: "Decline Request",
    danger: true,
    reasons: [
      { value: "schedule_conflict", label: "Schedule conflict" },
      { value: "outside_area", label: "Outside my service area" },
      { value: "unavailable", label: "Unavailable on requested date/time" },
      { value: "service_mismatch", label: "Unable to provide this service" },
      { value: "other", label: "Other" },
    ],
  });
}
