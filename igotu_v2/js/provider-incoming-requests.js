import { providerRequests, serviceParticipants } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import { askDeclineReason } from "./service-action-dialogs.js";
import {
  parseServiceDate,
  readableServiceDate,
  serviceTime,
} from "./service-calendar.js";
let currentUser = null,
  currentProfile = null;
async function getSessionUser() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = "../login.html";
    return null;
  }

  return data.session.user;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    window.location.href = "../login.html";
    return null;
  }

  if (data.role !== "provider" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  return data;
}

function displayUser(profile) {
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userRole").textContent =
    `Provider · ${profile.user_code}`;
  document.getElementById("avatar").textContent = profile.full_name
    .charAt(0)
    .toUpperCase();
}

async function handleLogout() {
  const logoutBtn = document.getElementById("logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async function (event) {
    event.preventDefault();
    localStorage.removeItem("igotu_user");
    await supabase.auth.signOut();
    window.location.href = "../login.html";
  });
}

const $ = (id) => document.getElementById(id);
const text = (value, fallback = "Not specified") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const node = (tag, className, value) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (value !== undefined) e.textContent = value;
  return e;
};
let requests = null,
  selectedId = null,
  clients = new Map(),
  participantFailed = false;
let loading = false,
  loadFailed = false,
  operation = null;
const locked = () => !!operation;
const selected = () => (requests || []).find((r) => r.id === selectedId);
const dateLabel = (r) =>
  parseServiceDate(r.date) ? readableServiceDate(r.date) : "Date unavailable";
const timeLabel = (r) =>
  serviceTime(r.time)?.label
    ? serviceTime(r.time).label + " MYT"
    : "Time unavailable";
function project(r) {
  // Explicit pre-confirmation allowlist: no address, coordinates, description or image.
  return {
    id: r.request_id,
    clientId: r.client_id,
    title: text(r.title, "Untitled service request"),
    category: text(r.category),
    serviceType: text(r.service_type),
    priority: text(r.priority),
    date: r.preferred_date,
    time: r.preferred_time,
    budget: r.budget,
    received: r.created_at,
    area: text(r.approximate_area, "Approximate area unavailable"),
  };
}
function message(value, kind = "info") {
  const box = $("messageBox");
  box.replaceChildren(node("p", null, value));
  box.className = "ir-feedback ir-feedback-" + kind;
  if (operation?.phase === "unresolved") {
    const b = node("button", "btn btn-outline", "Check request status");
    b.type = "button";
    b.id = "checkIncomingStatus";
    b.addEventListener("click", reconcile);
    box.append(b);
    b.focus();
  }
}
function sortedVisible() {
  const q = $("incomingSearch").value.trim().toLocaleLowerCase();
  const mode = $("incomingSort").value;
  const key = (r) =>
    mode === "earliest" || mode === "latest"
      ? parseServiceDate(r.date)
        ? r.date
        : null
      : typeof r.received === "string" &&
          Number.isFinite(Date.parse(r.received))
        ? Date.parse(r.received)
        : null;
  return (requests || [])
    .filter(
      (r) =>
        !q ||
        [r.id, r.title, r.category].some((v) =>
          String(v).toLocaleLowerCase().includes(q),
        ),
    )
    .slice()
    .sort((a, b) => {
      const x = key(a),
        y = key(b);
      if (x === null || y === null)
        return x === y ? a.id.localeCompare(b.id) : x === null ? 1 : -1;
      return (
        (x < y ? -1 : x > y ? 1 : 0) *
          (["newest", "latest"].includes(mode) ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    });
}
function empty(target, title, description, link = false) {
  const box = node("div", "ir-empty");
  box.append(node("h3", null, title), node("p", null, description));
  if (link) {
    const a = node("a", "btn btn-outline", "Manage Services & Availability");
    a.href = "edit-profile.html";
    box.append(a);
  }
  target.append(box);
}
function renderList() {
  const list = $("incomingList");
  list.replaceChildren();
  $("awaitingCount").textContent = requests === null ? "—" : requests.length;
  const visible = sortedVisible();
  $("incomingResultCount").textContent =
    requests === null ? "" : `${visible.length} of ${requests.length}`;
  $("clearIncomingSearch").disabled = !$("incomingSearch").value;
  if (requests === null)
    empty(
      list,
      loadFailed ? "Requests unavailable" : "Loading incoming requests…",
      loadFailed
        ? "Refresh requests to try again."
        : "Checking the requests assigned to you.",
    );
  else if (!requests.length)
    empty(
      list,
      "No Incoming Requests",
      "You don't have any service requests awaiting confirmation. New requests will appear here when a Client selects you.",
      true,
    );
  else if (!visible.length) {
    empty(
      list,
      "No requests match your search.",
      "Try another request ID, title or category.",
    );
    const b = node("button", "btn btn-outline", "Clear Search");
    b.type = "button";
    b.addEventListener("click", clearSearch);
    list.lastElementChild.append(b);
  }
  for (const r of visible) {
    const b = node("button", "incoming-card ir-request-card");
    b.type = "button";
    b.dataset.requestId = r.id;
    b.setAttribute("aria-pressed", String(r.id === selectedId));
    b.setAttribute("aria-controls", "incomingDetails");
    b.disabled = locked();
    const icon = node("span", "ir-request-icon");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#dashboard-list");
    svg.append(use);
    icon.append(svg);
    icon.setAttribute("aria-hidden", "true");
    const copy = node("span", "ir-request-copy");
    const top = node("span", "ir-card-topline");
    top.append(
      node("span", "ir-request-id", r.id),
      node("span", "ir-status", "Awaiting Confirmation"),
    );
    copy.append(
      top,
      node("strong", null, r.title),
      node("span", "ir-category", r.category),
      node(
        "span",
        "ir-request-schedule",
        `Preferred: ${dateLabel(r)} · ${timeLabel(r)}`,
      ),
      node("span", "ir-request-area", r.area),
    );
    b.append(icon, copy);
    b.addEventListener("click", () => selectRequest(r.id));
    list.append(b);
  }
}
function field(dl, label, value) {
  const box = node("div");
  box.append(node("dt", null, label), node("dd", null, value));
  dl.append(box);
}
function renderDetails() {
  const box = $("incomingDetailsBody");
  box.replaceChildren();
  const r = selected();
  if (!r) {
    empty(
      box,
      requests === null ? "Request details unavailable" : "Select a request",
      "Choose an incoming request to review its available details.",
    );
    return;
  }
  const header = node("div", "ir-detail-header"),
    heading = node("h2", null, r.title);
  heading.id = "selectedIncomingTitle";
  heading.tabIndex = -1;
  header.append(
    node("span", "ir-request-id", r.id),
    heading,
    node("span", "ir-status", "Awaiting Confirmation"),
  );
  box.append(header);
  if (!sortedVisible().some((v) => v.id === r.id))
    box.append(
      node(
        "p",
        "ir-inline-note",
        "This selected request is outside your current search. Clear Search to show it in the list.",
      ),
    );
  const dl = node("dl", "ir-service-fields");
  field(dl, "Service category", r.category);
  field(dl, "Service type", r.serviceType);
  field(dl, "Priority", r.priority);
  field(dl, "Preferred date", dateLabel(r));
  field(dl, "Preferred time", timeLabel(r));
  const budget =
    r.budget !== null &&
    r.budget !== undefined &&
    r.budget !== "" &&
    Number.isFinite(Number(r.budget)) &&
    Number(r.budget) >= 0
      ? `RM ${Number(r.budget).toFixed(2)}`
      : "Not specified";
  field(dl, "Budget", budget);
  field(dl, "Approximate service area", r.area);
  box.append(node("h3", null, "Service information"), dl);
  const client = clients.get(r.id);
  box.append(node("h3", null, "Client information"));
  if (client) {
    const card = node("div", "ir-client");
    const av = node(
      "span",
      "ir-client-avatar",
      client.name.charAt(0).toUpperCase(),
    );
    av.setAttribute("aria-hidden", "true");
    const info = node("div");
    info.append(
      node("strong", null, client.name),
      node("span", null, client.code),
      node(
        "span",
        "ir-identity",
        client.verified === true
          ? "✓ Identity verified"
          : client.verified === false
            ? "Identity not verified"
            : "Identity status unavailable",
      ),
    );
    card.append(av, info);
    box.append(card);
  } else
    box.append(
      node(
        "p",
        "ir-inline-note",
        participantFailed
          ? "Client information could not be checked. Refresh to try again."
          : "Client information is unavailable.",
      ),
    );
  box.append(
    node("h3", null, "Service description"),
    node(
      "p",
      "ir-description",
      "Additional service details will be available after confirmation.",
    ),
    node(
      "p",
      "ir-privacy",
      "Exact service location is available after confirmation.",
    ),
  );
  const actions = node("div", "ir-actions");
  const decline = node("button", "danger-btn decline-btn", "Decline Request"),
    confirm = node("button", "btn confirm-btn", "Confirm Request");
  for (const b of [decline, confirm]) {
    b.type = "button";
    b.dataset.requestId = r.id;
    b.disabled = locked() || loading || loadFailed;
  }
  confirm.addEventListener("click", () => beginAction("confirm"));
  decline.addEventListener("click", () => beginAction("decline"));
  actions.append(decline, confirm);
  box.append(actions);
  const a = node("a", "ir-report", "Report Issue →");
  a.href = `report.html?request_id=${encodeURIComponent(r.id)}`;
  box.append(a);
}
function controls() {
  document.querySelectorAll(".confirm-btn, .decline-btn").forEach((button) => {
    button.disabled = locked() || loading || loadFailed;
  });
  $("clearIncomingSearch").disabled = locked() || !$("incomingSearch").value;
  $("refreshIncomingBtn").disabled =
    loading || (!!operation && operation.phase !== "unresolved");
  $("refreshIncomingBtn").textContent = loading
    ? "Refreshing…"
    : "↻ Refresh requests";
  $("incomingSearch").disabled = locked();
  $("incomingSort").disabled = locked();
  $("backToIncoming").disabled = locked();
  $("incomingList").setAttribute("aria-busy", String(loading));
  document.body.dataset.incomingState = loading
    ? "loading"
    : loadFailed
      ? "error"
      : requests?.length
        ? "ready"
        : "empty";
  document.body.dataset.incomingOperation = operation?.phase || "idle";
}
function render() {
  renderList();
  renderDetails();
  controls();
}
function selectRequest(id) {
  if (locked() || !(requests || []).some((r) => r.id === id)) return;
  selectedId = id;
  $("incomingWorkspace").dataset.mobileView = "details";
  render();
  if (matchMedia("(max-width: 760px)").matches)
    $("selectedIncomingTitle")?.focus();
}
function clearSearch() {
  if (locked()) return;
  $("incomingSearch").value = "";
  render();
  $("incomingSearch").focus();
}
async function loadIncomingRequests() {
  if (loading) return;
  loading = true;
  loadFailed = false;
  controls();
  $("incomingLoadStatus").textContent =
    requests === null
      ? "Loading your incoming requests…"
      : "Refreshing assigned requests…";
  try {
    const result = await providerRequests(["provider_selected"]);
    if (result.error || !Array.isArray(result.data)) throw Error("read");
    const rows = result.data.filter(
      (r) =>
        r &&
        typeof r.request_id === "string" &&
        r.request_id &&
        r.selected_provider_id === currentUser.id &&
        r.status === "provider_selected",
    );
    requests = rows.map(project);
    clients = new Map();
    participantFailed = false;
    if (!locked() && !selected()) selectedId = requests[0]?.id || null;
    try {
      const participants = await serviceParticipants(requests.map((r) => r.id));
      if (participants.error || !Array.isArray(participants.data))
        throw Error("participants");
      for (const p of participants.data) {
        const r = requests.find(
          (r) => r.id === p.request_id && r.clientId === p.id,
        );
        if (r && p.role === "client")
          clients.set(r.id, {
            name: text(p.full_name, "Client name unavailable"),
            code: text(p.user_code, "User code unavailable"),
            verified: p.identity_verified,
          });
      }
    } catch {
      participantFailed = true;
    }
    $("incomingLoadStatus").textContent = participantFailed
      ? "Requests loaded. Client information could not be checked."
      : "Showing requests currently awaiting your response.";
  } catch {
    loadFailed = true;
    $("incomingLoadStatus").textContent =
      requests === null
        ? "Requests could not be loaded. Refresh to try again."
        : "Refresh failed. Showing previous information; it may be outdated. Actions are paused until a successful refresh.";
  } finally {
    loading = false;
    render();
  }
}
function closeConfirm(value = false) {
  const d = $("confirmIncomingDialog");
  d.returnValue = value ? "confirm" : "cancel";
  d.close();
}
function askConfirm(r) {
  const d = $("confirmIncomingDialog");
  $("confirmIncomingRequest").textContent = `${r.id} — ${r.title}`;
  $("confirmIncomingSchedule").textContent =
    `Preferred: ${dateLabel(r)} · ${timeLabel(r)}`;
  return new Promise((resolve) => {
    const done = () => {
      d.removeEventListener("close", done);
      resolve(d.returnValue === "confirm");
    };
    d.addEventListener("close", done);
    d.returnValue = "";
    d.showModal();
    $("cancelIncomingConfirm").focus();
  });
}
async function beginAction(kind) {
  const r = selected();
  if (!r || locked() || loading || loadFailed) return;
  operation = { id: r.id, title: r.title, kind, phase: "dialog" };
  $("incomingWorkspace").dataset.mobileView = "details";
  controls();
  // Do not replace the opener while a dialog owns focus.
  document
    .querySelectorAll(".incoming-card")
    .forEach((b) => (b.disabled = true));
  const accepted =
    kind === "confirm" ? await askConfirm(r) : await askDeclineReason();
  if (!accepted) {
    operation = null;
    render();
    document
      .querySelector(kind === "confirm" ? ".confirm-btn" : ".decline-btn")
      ?.focus();
    return;
  }
  // ID must still belong to the authorised loaded incoming set, never a URL.
  if (!selected() || selected().id !== r.id) {
    operation = null;
    message(
      "This request is no longer available. Refresh your requests.",
      "error",
    );
    render();
    return;
  }
  operation.phase = "submitting";
  render();
  message(
    kind === "confirm"
      ? "Confirming request… Please wait."
      : "Declining request… Please wait.",
  );
  try {
    const call = supabase.rpc(
      kind === "confirm"
        ? "provider_confirm_request"
        : "provider_decline_request",
      kind === "confirm"
        ? { p_request_id: r.id }
        : { p_request_id: r.id, p_reason: accepted },
    );
    // The pinned SDK retries POST requests by default. Disable retries for this mutation only.
    const result = await (typeof call.retry === "function"
      ? call.retry(false)
      : call);
    if (!result || !Object.hasOwn(result, "error")) throw Error("ambiguous");
    if (result.error) {
      if (
        [
          "P0001",
          "42501",
          "22023",
          "23514",
          "40001",
          "PGRST202",
          "PGRST301",
          "PGRST302",
          "PGRST303",
        ].includes(result.error.code)
      ) {
        operation = null;
        message(
          kind === "confirm"
            ? "Confirmation failed. The request may have changed or conflict with your availability. Check the refreshed details before trying again."
            : "Decline failed. Check the refreshed request before trying again.",
          "error",
        );
        await loadIncomingRequests();
        focusAfterAction();
        return;
      }
      throw Error("uncertain");
    }
    requests = requests.filter((v) => v.id !== r.id);
    operation = null;
    message(
      kind === "confirm"
        ? `Request ${r.id} confirmed successfully. Open Assignments to manage it.`
        : `Request ${r.id} declined successfully. The Client can choose another Provider.`,
      "success",
    );
    await loadIncomingRequests();
    if (!selected()) selectedId = requests[0]?.id || null;
    render();
    focusAfterAction();
  } catch {
    operation.phase = "unresolved";
    render();
    message(
      "Outcome not yet confirmed. No action will be repeated automatically. Checking the authorised request status…",
      "warning",
    );
    await reconcile();
  }
}
function focusAfterAction() {
  if (selected()) $("selectedIncomingTitle")?.focus();
  else $("backToIncoming").disabled = false;
}
async function reconcile() {
  if (!operation || operation.phase !== "unresolved" || loading) return;
  const op = operation;
  operation.phase = "checking";
  render();
  message("Checking request status… No action is being repeated.", "warning");
  try {
    const result = await providerRequests(null, op.id);
    if (result.error || !Array.isArray(result.data)) throw Error("status");
    const row = result.data.find(
      (r) =>
        r.request_id === op.id && r.selected_provider_id === currentUser.id,
    );
    if (row && row.status === "provider_selected") {
      operation.phase = "unresolved";
      render();
      message(
        "Outcome not yet confirmed. The last status still awaits your response. Actions remain paused; check status again before doing anything else.",
        "warning",
      );
      return;
    }
    const confirmed =
      op.kind === "confirm" &&
      row &&
      ["confirmed", "in_progress", "completed"].includes(row.status);
    requests = (requests || []).filter((r) => r.id !== op.id);
    operation = null;
    message(
      confirmed
        ? `Request ${op.id} is confirmed according to its current authorised status.`
        : "This request is no longer awaiting your response. The attempted action's outcome could not be verified. No action was repeated.",
      confirmed ? "success" : "warning",
    );
    await loadIncomingRequests();
    if (!selected()) selectedId = requests[0]?.id || null;
    render();
    focusAfterAction();
  } catch {
    operation.phase = "unresolved";
    render();
    message(
      "Outcome not yet confirmed. Request status could not be checked. Actions remain paused. Use Check request status to try the read again.",
      "warning",
    );
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await authorizeWorkspace()).allowed) return;
  currentUser = await getSessionUser();
  if (!currentUser) return;
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) return;
  displayUser(currentProfile);
  handleLogout();
  $("incomingSearch").addEventListener("input", () => {
    renderList();
    renderDetails();
  });
  $("incomingSort").addEventListener("change", () => {
    renderList();
    renderDetails();
  });
  $("clearIncomingSearch").addEventListener("click", clearSearch);
  $("refreshIncomingBtn").addEventListener("click", () => {
    if (operation?.phase === "unresolved") reconcile();
    else if (!locked()) loadIncomingRequests();
  });
  $("backToIncoming").addEventListener("click", () => {
    if (locked()) return;
    $("incomingWorkspace").dataset.mobileView = "list";
    document.querySelector('.incoming-card[aria-pressed="true"]')?.focus();
  });
  $("confirmIncomingDialog").addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const first = $("cancelIncomingConfirm"),
      last = $("submitIncomingConfirm");
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  $("cancelIncomingConfirm").addEventListener("click", () => closeConfirm());
  $("submitIncomingConfirm").addEventListener("click", () =>
    closeConfirm(true),
  );
  const mobile = matchMedia("(max-width: 760px)");
  mobile.addEventListener("change", () => {
    if (!mobile.matches) return;
    if (operation || $("incomingDetails").contains(document.activeElement))
      $("incomingWorkspace").dataset.mobileView = "details";
    else if (
      document.querySelector(".ir-list-panel").contains(document.activeElement)
    )
      $("incomingWorkspace").dataset.mobileView = "list";
  });
  await loadIncomingRequests();
});
