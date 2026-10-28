// Presentation only: URL values never enter a query or widen the authorized list.
export function highlightAuthorizedRequest(container, requests) {
  const values = new URLSearchParams(window.location.search).getAll("request_id");
  if (values.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(values[0])) return;
  const requestId = values[0];
  if (!Array.isArray(requests) || !requests.some((request) => request.request_id === requestId)) return;
  // Compare dataset values rather than interpolating URL input into a selector.
  const card = [...container.querySelectorAll("[data-service-request-id]")]
    .find((candidate) => candidate.dataset.serviceRequestId === requestId);
  if (!card) return;
  card.classList.add("requested-service");
  card.tabIndex = -1;
  const title = card.querySelector("h3");
  if (title) {
    title.id = "requestedServiceTitle";
    card.setAttribute("role", "region");
    card.setAttribute("aria-labelledby", title.id);
    const label = document.createElement("span");
    label.className = "requested-service-label";
    label.textContent = "Selected service";
    title.before(label);
  }
  card.focus({ preventScroll: true });
  card.scrollIntoView({ block: "start", behavior: "instant" });
}
