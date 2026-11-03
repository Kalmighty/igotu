import {
  prepareReceiptPreviews,
  receiptHtml,
  bindReceiptButtons,
} from "./payment-receipts.js";
import { providerRequests, serviceParticipants } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";
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

const $ = (id) => document.getElementById(id),
  statuses = ["confirmed", "in_progress", "completed"];
const text = (v, fallback = "Not specified") =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;
const el = (tag, cls, value) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (value !== undefined) n.textContent = value;
  return n;
};
const label = (s) =>
  ({
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
  })[s] || "Status unavailable";
const date = (r) =>
  parseServiceDate(r.date) ? readableServiceDate(r.date) : "Date unavailable";
const time = (r) =>
  serviceTime(r.time)?.label
    ? serviceTime(r.time).label + " MYT"
    : "Time unavailable";
const money = (v) =>
  v !== null &&
  v !== undefined &&
  v !== "" &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0
    ? `RM ${Number(v).toFixed(2)}`
    : "Not specified";
function recordedDate(value) {
  const d = new Date(value);
  return value && Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kuala_Lumpur",
      }).format(d) + " MYT"
    : "Date unavailable";
}
function coordinate(v, min, max) {
  if (
    !["string", "number"].includes(typeof v) ||
    (typeof v === "string" && !v.trim())
  )
    return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function project(r) {
  return {
    id: r.request_id,
    clientId: r.client_id,
    title: text(r.title, "Untitled service request"),
    category: text(r.category),
    serviceType: text(r.service_type),
    priority: text(r.priority),
    budget: r.budget,
    date: r.preferred_date,
    time: r.preferred_time,
    created: r.created_at,
    status: r.status,
    description: text(r.description, "Service description unavailable."),
    area: text(r.approximate_area, "Area unavailable"),
    location: text(r.location, "Exact service location unavailable."),
    lat: coordinate(r.client_lat, -90, 90),
    lng: coordinate(r.client_lng, -180, 180),
    image: safeUrl(r.request_image_url),
  };
}
let requests = null,
  selectedId = null,
  clients = new Map(),
  payments = new Map(),
  reviews = new Map(),
  reviewsLoaded = false,
  paymentsLoaded = false;
let loading = false,
  loadFailed = false,
  operation = null,
  selectionVersion = 0,
  map = null;
const drafts = new Map(),
  acknowledgedReviews = new Map();
const selected = () => requests?.find((r) => r.id === selectedId),
  locked = () => !!operation;
function message(value, kind = "info") {
  const box = $("messageBox");
  box.replaceChildren(el("p", null, value));
  box.className = "pa-feedback pa-feedback-" + kind;
  if (operation?.phase === "unresolved") {
    const b = el(
      "button",
      "btn btn-outline",
      operation.kind === "start"
        ? "Check service status"
        : "Check review status",
    );
    b.type = "button";
    b.id = "checkAssignmentOutcome";
    b.addEventListener("click", checkOutcome);
    box.append(b);
    b.focus();
  }
}
function visible() {
  const q = $("assignmentSearch").value.trim().toLocaleLowerCase(),
    filter = $("assignmentFilter").value,
    sort = $("assignmentSort").value;
  const key = (r) =>
    ["earliest", "latest"].includes(sort)
      ? parseServiceDate(r.date)
        ? r.date
        : null
      : typeof r.created === "string" && Number.isFinite(Date.parse(r.created))
        ? Date.parse(r.created)
        : null;
  return (requests || [])
    .filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!q ||
          [r.id, r.title, r.category].some((v) =>
            v.toLocaleLowerCase().includes(q),
          )),
    )
    .slice()
    .sort((a, b) => {
      const x = key(a),
        y = key(b);
      if (x === null || y === null)
        return x === y ? a.id.localeCompare(b.id) : x === null ? 1 : -1;
      return (
        (x < y ? -1 : x > y ? 1 : 0) *
          (["recent", "latest"].includes(sort) ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    });
}
function empty(target, title, copy) {
  const box = el("div", "pa-empty");
  box.append(el("h3", null, title), el("p", null, copy));
  target.append(box);
}
function badge(r) {
  return el("span", "pa-status pa-status-" + r.status, label(r.status));
}
function renderList() {
  const list = $("assignmentsList");
  list.replaceChildren();
  for (const [s, id] of [
    ["confirmed", "confirmedAssignments"],
    ["in_progress", "progressAssignments"],
    ["completed", "completedAssignments"],
  ])
    $(id).textContent =
      requests === null ? "—" : requests.filter((r) => r.status === s).length;
  const rows = visible();
  $("assignmentResultCount").textContent =
    requests === null ? "" : `${rows.length} of ${requests.length}`;
  if (requests === null)
    empty(
      list,
      loadFailed ? "Assignments unavailable" : "Loading assignments…",
      loadFailed
        ? "Refresh Assignments to try again."
        : "Checking your authorised services.",
    );
  else if (!requests.length)
    empty(
      list,
      "No assignments yet",
      "Confirmed, ongoing and completed services will appear here after you confirm an incoming request.",
    );
  else if (!rows.length) {
    const f = $("assignmentFilter").value;
    empty(
      list,
      $("assignmentSearch").value
        ? "No assignments match your search."
        : `No ${f === "in_progress" ? "in-progress" : f} assignments`,
      "Clear your search or choose another status.",
    );
    const b = el("button", "btn btn-outline", "Reset search & filter");
    b.type = "button";
    b.addEventListener("click", () => {
      if (locked()) return;
      $("assignmentSearch").value = "";
      $("assignmentFilter").value = "all";
      renderList();
      $("assignmentSearch").focus();
    });
    list.lastElementChild.append(b);
  }
  for (const r of rows) {
    const b = el("button", "assignment-card pa-request-card");
    b.type = "button";
    b.dataset.requestId = r.id;
    b.setAttribute("aria-pressed", String(r.id === selectedId));
    b.setAttribute("aria-controls", "assignmentDetails");
    b.disabled = locked();
    const copy = el("span", "pa-request-copy"),
      top = el("span", "pa-card-topline");
    top.append(el("span", "pa-request-id", r.id), badge(r));
    copy.append(
      top,
      el("strong", null, r.title),
      el("span", "pa-category", r.category),
      el("span", "pa-request-schedule", `Preferred: ${date(r)} · ${time(r)}`),
      el("span", "pa-request-area", r.area),
    );
    b.append(copy);
    b.addEventListener("click", () => selectAssignment(r.id));
    list.append(b);
  }
}
function cleanupMap() {
  if (map) {
    map.remove();
    map = null;
  }
}
function field(dl, name, value) {
  const box = el("div");
  box.append(el("dt", null, name), el("dd", null, value));
  dl.append(box);
}
function card(title) {
  const box = el("section", "pa-detail-card");
  box.append(el("h3", null, title));
  return box;
}
function link(textValue, href) {
  const a = el("a", "btn btn-outline", textValue);
  a.href = href;
  return a;
}
function renderProgress(r) {
  const list = el("ol", "pa-progress");
  list.setAttribute("aria-label", "Service progress");
  const index = statuses.indexOf(r.status);
  statuses.forEach((s, i) => {
    const li = el("li", i <= index ? "is-reached" : "", label(s));
    li.append(
      el(
        "small",
        null,
        i < index || r.status === "completed"
          ? "Completed stage"
          : i === index
            ? "Current stage"
            : "Not yet reached",
      ),
    );
    if (i === index) li.setAttribute("aria-current", "step");
    list.append(li);
  });
  return list;
}
function renderDetails() {
  cleanupMap();
  const version = ++selectionVersion,
    box = $("assignmentDetailsBody");
  box.replaceChildren();
  const r = selected();
  if (!r) {
    empty(
      box,
      "Select an assignment",
      "Choose an authorised assignment to see its progress and details.",
    );
    return;
  }
  const header = el("div", "pa-detail-header"),
    title = el("h2", null, r.title);
  title.id = "selectedAssignmentTitle";
  title.tabIndex = -1;
  header.append(el("span", "pa-request-id", r.id), title, badge(r));
  const actions = el("div", "pa-quick-actions");
  const client = clients.get(r.id);
  if (client)
    actions.append(
      link(
        "Message Client",
        `messages.html?request_id=${encodeURIComponent(r.id)}`,
      ),
    );
  else
    actions.append(
      el(
        "p",
        "pa-record-note",
        "Messaging is unavailable until Client information can be checked.",
      ),
    );
  actions.append(
    link("Report Issue", `report.html?request_id=${encodeURIComponent(r.id)}`),
  );
  header.append(actions);
  box.append(header, renderProgress(r));
  if (!visible().some((v) => v.id === r.id))
    box.append(
      el(
        "p",
        "pa-inline-note",
        "This selected assignment is outside your current search or status filter.",
      ),
    );
  const next = el("section", "pa-next-action");
  next.append(
    el(
      "h3",
      null,
      r.status === "confirmed"
        ? "Ready to start?"
        : r.status === "in_progress"
          ? "Service In Progress"
          : "Service Completed",
    ),
  );
  if (r.status === "confirmed") {
    next.append(
      el(
        "p",
        null,
        "Start when you are ready to carry out the service. Preferred dates and times are the Client’s requested schedule.",
      ),
    );
    const b = el("button", "btn start-btn", "Start Service");
    b.type = "button";
    b.dataset.requestId = r.id;
    b.disabled = loading || loadFailed || locked();
    b.addEventListener("click", beginStart);
    next.append(b);
  } else
    next.append(
      el(
        "p",
        null,
        r.status === "in_progress"
          ? "Your service is in progress. The Client will mark it as completed once the work is finished."
          : "This service is complete. Payment information and reviews are separate records below.",
      ),
    );
  box.append(next);
  const grid = el("div", "pa-details-grid"),
    service = card("Service Information"),
    dl = el("dl", "pa-service-fields pa-service-fields-grid");
  field(dl, "Category", r.category);
  field(dl, "Service type", r.serviceType);
  field(dl, "Priority", r.priority);
  field(dl, "Budget", money(r.budget));
  field(dl, "Preferred date", date(r));
  field(dl, "Preferred time", time(r));
  service.append(dl);
  const cc = card("Client Information");
  if (client) {
    const c = el("div", "pa-client");
    c.append(
      el("span", "pa-client-avatar", client.name.charAt(0).toUpperCase()),
    );
    const copy = el("div");
    copy.append(
      el("strong", null, client.name),
      el("span", null, client.code),
      el(
        "span",
        "pa-identity",
        client.verified === true
          ? "✓ Identity verified"
          : client.verified === false
            ? "Identity not verified"
            : "Identity status unavailable",
      ),
    );
    c.append(copy);
    cc.append(c);
  } else
    cc.append(
      el("p", "pa-inline-note", "Client information is currently unavailable."),
    );
  grid.append(service, cc);
  box.append(grid);
  const description = document.createElement("details");
  description.className = "pa-detail-card";
  description.open = !matchMedia("(max-width:760px)").matches;
  description.append(
    el("summary", null, "Service Description"),
    el("p", "pa-description", r.description),
  );
  if (r.image) {
    const a = link("Open submitted service image", r.image);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    description.append(a);
  }
  box.append(description);
  const location = document.createElement("details");
  location.className = "pa-detail-card pa-location";
  location.id = "assignmentLocation";
  location.open = !matchMedia("(max-width:760px)").matches;
  location.append(
    el("summary", null, "Service Location"),
    el("p", "pa-location-text", r.location),
  );
  const coords = r.lat !== null && r.lng !== null;
  const status = el(
    "p",
    "pa-map-status",
    coords
      ? "Map ready to load when this section is open."
      : "Map unavailable: no valid authorised coordinates are available.",
  );
  status.id = "assignmentMapStatus";
  if (coords) {
    const mapEl = el("div", "assignment-map");
    mapEl.id = "assignmentMap";
    mapEl.setAttribute("role", "region");
    mapEl.setAttribute("aria-label", "Authorised service location map");
    location.append(mapEl);
    const expand = el("button", "btn btn-outline pa-map-expand", "Expand map");
    expand.type = "button";
    expand.setAttribute("aria-expanded", "false");
    expand.addEventListener("click", () => {
      const expanded = location.classList.toggle("is-expanded");
      expand.textContent = expanded ? "Shrink map" : "Expand map";
      expand.setAttribute("aria-expanded", String(expanded));
      requestAnimationFrame(() => map?.invalidateSize());
    });
    location.append(expand);
  }
  location.append(status);
  box.append(location);
  location.addEventListener("toggle", () => {
    if (location.open && version === selectionVersion) renderMap(r, status);
  });
  if (location.open)
    requestAnimationFrame(() => {
      if (version === selectionVersion) renderMap(r, status);
    });
  renderPayment(box, r, version);
  if (r.status === "completed") renderReview(box, r, client);
}
function renderMap(r, status) {
  if (map || r.id !== selectedId || r.lat === null || r.lng === null) return;
  if (!window.L) {
    status.textContent =
      "Map unavailable. The authorised service location remains above.";
    return;
  }
  try {
    status.textContent = "Loading OpenStreetMap…";
    map = window.L.map("assignmentMap", { scrollWheelZoom: false }).setView(
      [r.lat, r.lng],
      16,
    );
    const ownedMap = map;
    window.L.marker([r.lat, r.lng])
      .addTo(map)
      .bindPopup("Client service location");
    const tiles = window.L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    );
    let failed = false;
    tiles.on("tileerror", () => {
      if (map === ownedMap) {
        failed = true;
        status.textContent =
          "Map tiles could not load. The service location above is still available. Refresh Assignments to try again.";
      }
    });
    tiles.on("load", () => {
      if (map === ownedMap && !failed)
        status.textContent =
          "Authorised service location shown on OpenStreetMap.";
    });
    tiles.addTo(map);
    requestAnimationFrame(() => map === ownedMap && map.invalidateSize());
  } catch {
    cleanupMap();
    status.textContent =
      "Map unavailable. The authorised service location remains above.";
  }
}
function renderPayment(box, r, version) {
  const section = card("Payment Information");
  section.id = "assignmentPayment";
  box.append(section);
  if (!paymentsLoaded) {
    section.append(
      el(
        "p",
        "pa-inline-note",
        "Payment records could not be checked. Refresh Assignments to try again.",
      ),
    );
    return;
  }
  const p = payments.get(r.id);
  if (!p) {
    section.append(
      el(
        "p",
        "pa-record-note",
        "No offline payment record has been submitted by the Client.",
      ),
    );
    return;
  }
  section.append(el("h4", null, "Payment Recorded"));
  const fields = el("div", "pa-payment-fields");
  for (const [name, value] of [
    ["Recorded amount", money(p.amount)],
    ["Payment method", text(p.payment_method)],
    ["Reference number", text(p.reference_number)],
    ["Date recorded", recordedDate(p.created_at)],
  ]) {
    const f = el("div", null, name);
    f.append(el("strong", null, value));
    fields.append(f);
  }
  section.append(
    fields,
    el(
      "p",
      "pa-record-note",
      "This is a Client-recorded offline payment record, not independent confirmation that funds were received.",
    ),
  );
  const preview = el("div", "pa-receipt");
  preview.append(
    el("p", "pa-record-note", "Checking authorised payment evidence…"),
  );
  section.append(preview);
  prepareReceiptPreviews([p])
    .then((rows) => {
      if (
        version !== selectionVersion ||
        selectedId !== r.id ||
        !preview.isConnected
      )
        return;
      preview.innerHTML = receiptHtml(rows[0]);
      bindReceiptButtons(preview, rows, (value) => message(value, "error"));
    })
    .catch(() => {
      if (version === selectionVersion && preview.isConnected)
        preview.replaceChildren(
          el(
            "p",
            null,
            "Payment proof could not be checked. Refresh to try again.",
          ),
        );
    });
}
function draft(id) {
  if (!drafts.has(id)) drafts.set(id, { rating: 0, feedback: "", error: "" });
  return drafts.get(id);
}
function renderReview(box, r, client) {
  const section = card("Provider Review of Client");
  section.id = "assignmentReview";
  box.append(section);
  const existing = reviews.get(r.id) || acknowledgedReviews.get(r.id);
  if (existing) {
    section.append(
      el("h3", null, "Review Submitted"),
      el("p", null, `Rating: ${existing.rating} / 5`),
      el(
        "p",
        "pa-review-feedback",
        text(existing.feedback, "No feedback provided."),
      ),
    );
    return;
  }
  if (!reviewsLoaded) {
    section.append(
      el(
        "p",
        "pa-inline-note",
        "Review status unavailable. Refresh before submitting another review.",
      ),
    );
    return;
  }
  if (!client) {
    section.append(
      el(
        "p",
        "pa-inline-note",
        "Client information is currently unavailable. A review cannot be submitted until it is checked.",
      ),
    );
    return;
  }
  const d = draft(r.id),
    form = el("form", "provider-review-form");
  form.noValidate = true;
  form.dataset.requestId = r.id;
  form.dataset.clientId = r.clientId;
  form.append(el("h3", null, "Review Client"));
  const fieldset = document.createElement("fieldset");
  fieldset.append(el("legend", null, "Rating"));
  const stars = el("div", "star-rating"),
    input = document.createElement("input"),
    ratingText = el(
      "p",
      "rating-text",
      d.rating ? `${d.rating} stars selected` : "No rating selected",
    );
  input.type = "hidden";
  input.name = "rating";
  input.value = d.rating;
  for (let i = 1; i <= 5; i++) {
    const b = el("button", "star-btn" + (i <= d.rating ? " active" : ""), "★");
    b.type = "button";
    b.dataset.value = i;
    b.setAttribute("aria-label", `${i} out of 5 stars`);
    b.setAttribute("aria-pressed", String(i === d.rating));
    b.addEventListener("click", () => {
      if (locked() || loading || loadFailed) return;
      d.rating = i;
      input.value = i;
      stars.querySelectorAll("button").forEach((s, index) => {
        s.classList.toggle("active", index < i);
        s.setAttribute("aria-pressed", String(index === i - 1));
      });
      ratingText.textContent = `${i} star${i > 1 ? "s" : ""} selected`;
    });
    stars.append(b);
  }
  fieldset.append(stars, input, ratingText);
  form.append(fieldset);
  const feedbackLabel = el("label", null, "Feedback"),
    feedback = document.createElement("textarea");
  feedback.id = "providerReviewFeedback";
  feedback.name = "feedback";
  feedback.required = true;
  feedbackLabel.htmlFor = feedback.id;
  feedback.value = d.feedback;
  feedback.addEventListener("input", () => (d.feedback = feedback.value));
  const error = el("p", "pa-review-error", d.error);
  error.id = "providerReviewError";
  error.setAttribute("role", "alert");
  feedback.setAttribute("aria-describedby", error.id);
  const submit = el("button", "btn", "Submit Review");
  submit.type = "submit";
  form.append(feedbackLabel, feedback, error, submit);
  form.addEventListener("submit", saveProviderReview);
  section.append(form);
  if (operation?.kind === "review" && operation.id === r.id)
    section.append(
      el(
        "p",
        "pa-inline-note",
        "Review outcome is being checked. Your draft is preserved and submission is paused.",
      ),
    );
}
function controls() {
  document
    .querySelectorAll(".assignment-card")
    .forEach((button) => (button.disabled = locked()));
  document
    .querySelectorAll(
      ".start-btn,.provider-review-form button,.provider-review-form textarea",
    )
    .forEach((b) => (b.disabled = locked() || loading || loadFailed));
  $("refreshAssignmentsBtn").disabled =
    loading || (!!operation && operation.phase !== "unresolved");
  $("refreshAssignmentsBtn").textContent = loading
    ? "Refreshing…"
    : "Refresh Assignments";
  for (const id of [
    "assignmentSearch",
    "assignmentFilter",
    "assignmentSort",
    "backToAssignments",
  ])
    $(id).disabled = locked();
  $("clearAssignmentSearch").disabled =
    locked() || !$("assignmentSearch").value;
  $("assignmentsList").setAttribute("aria-busy", String(loading));
  document.body.dataset.assignmentsState = loading
    ? "loading"
    : loadFailed
      ? "error"
      : requests?.length
        ? "ready"
        : "empty";
  document.body.dataset.assignmentOperation = operation?.phase || "idle";
}
function render() {
  renderList();
  renderDetails();
  controls();
}
function selectAssignment(id) {
  if (locked() || !requests?.some((r) => r.id === id)) return;
  selectedId = id;
  $("assignmentWorkspace").dataset.mobileView = "details";
  render();
  if (matchMedia("(max-width:760px)").matches)
    $("selectedAssignmentTitle")?.focus();
}
function ownRows(data) {
  return data.filter(
    (r) =>
      r &&
      typeof r.request_id === "string" &&
      r.request_id &&
      r.selected_provider_id === currentUser.id &&
      statuses.includes(r.status),
  );
}
async function readReviews(ids) {
  const result = await supabase
    .from("service_reviews")
    .select("*")
    .eq("reviewer_id", currentUser.id)
    .in("request_id", ids);
  if (result.error || !Array.isArray(result.data)) throw Error("reviews");
  return result.data;
}
function acceptReviews(rows) {
  reviews = new Map();
  for (const v of rows) {
    const r = requests?.find(
      (r) => r.id === v.request_id && r.clientId === v.reviewee_id,
    );
    if (r && v.reviewer_id === currentUser.id)
      reviews.set(r.id, { rating: v.rating, feedback: v.feedback });
  }
  reviewsLoaded = true;
}
async function loadAssignments() {
  if (loading) return;
  loading = true;
  loadFailed = false;
  controls();
  $("assignmentLoadStatus").textContent =
    requests === null
      ? "Loading your assignments…"
      : "Refreshing authorised assignments…";
  try {
    const result = await providerRequests([
      "confirmed",
      "in_progress",
      "completed",
    ]);
    if (result.error || !Array.isArray(result.data)) throw Error("assignments");
    const fresh = ownRows(result.data).map(project),
      ids = fresh.map((r) => r.id),
      previous = selectedId;
    requests = fresh;
    clients = new Map();
    payments = new Map();
    reviews = new Map();
    paymentsLoaded = false;
    reviewsLoaded = false;
    if (!locked() && !selected())
      selectedId = visible()[0]?.id || requests[0]?.id || null;
    const related = ids.length
      ? await Promise.allSettled([
          readReviews(ids),
          supabase
            .from("payment_records")
            .select(
              "payment_id,request_id,client_id,provider_id,amount,payment_method,reference_number,created_at",
            )
            .in("request_id", ids),
          serviceParticipants(ids),
        ])
      : [];
    if (!ids.length) {
      reviewsLoaded = true;
      paymentsLoaded = true;
    } else {
      if (related[0].status === "fulfilled") acceptReviews(related[0].value);
      const pay = related[1];
      if (
        pay.status === "fulfilled" &&
        !pay.value.error &&
        Array.isArray(pay.value.data)
      ) {
        for (const p of pay.value.data) {
          const r = requests.find(
            (r) => r.id === p.request_id && r.clientId === p.client_id,
          );
          if (r && p.provider_id === currentUser.id)
            payments.set(r.id, {
              payment_id: p.payment_id,
              request_id: p.request_id,
              client_id: p.client_id,
              provider_id: p.provider_id,
              amount: p.amount,
              payment_method: p.payment_method,
              reference_number: p.reference_number,
              created_at: p.created_at,
            });
        }
        paymentsLoaded = true;
      }
      const people = related[2];
      if (
        people.status === "fulfilled" &&
        !people.value.error &&
        Array.isArray(people.value.data)
      ) {
        for (const p of people.value.data) {
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
      }
    }
    for (const key of drafts.keys())
      if (!requests.some((r) => r.id === key)) drafts.delete(key);
    $("assignmentLoadStatus").textContent =
      "Showing authorised Confirmed, In Progress and Completed services.";
    if (previous && !requests.some((r) => r.id === previous) && !locked())
      message(
        "The previously selected assignment is no longer available. Choose another authorised assignment.",
      );
  } catch {
    loadFailed = true;
    $("assignmentLoadStatus").textContent =
      requests === null
        ? "Assignments could not be loaded. Refresh to try again."
        : "Refresh failed. Showing previous information; it may be outdated. Unsafe actions are paused until a successful refresh.";
  } finally {
    loading = false;
    render();
  }
}
function knownRejection(e) {
  return [
    "P0001",
    "42501",
    "22023",
    "23514",
    "23505",
    "40001",
    "PGRST202",
    "PGRST301",
    "PGRST302",
    "PGRST303",
  ].includes(e?.code);
}
async function startMutation(id) {
  const call = supabase.rpc("provider_start_request", { p_request_id: id });
  return await (typeof call.retry === "function" ? call.retry(false) : call);
}
async function reviewMutation(payload) {
  const call = supabase.from("service_reviews").insert(payload);
  return await (typeof call.retry === "function" ? call.retry(false) : call);
}
function focusDetails() {
  const h = $("selectedAssignmentTitle");
  if (h) h.focus();
  else {
    $("messageBox").tabIndex = -1;
    $("messageBox").focus();
  }
}
async function beginStart() {
  const r = selected();
  if (!r || r.status !== "confirmed" || locked() || loading || loadFailed)
    return;
  operation = { id: r.id, kind: "start", phase: "dialog" };
  $("assignmentWorkspace").dataset.mobileView = "details";
  controls();
  document
    .querySelectorAll(".assignment-card")
    .forEach((b) => (b.disabled = true));
  const dialog = $("startServiceDialog");
  $("startServiceSubject").textContent = `${r.id} — ${r.title}`;
  const accepted = await new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "start"),
      { once: true },
    );
    dialog.returnValue = "";
    dialog.showModal();
    $("cancelStartService").focus();
  });
  if (!accepted) {
    operation = null;
    render();
    document.querySelector(".start-btn")?.focus();
    return;
  }
  if (selected()?.id !== r.id || selected().status !== "confirmed") {
    operation = null;
    message(
      "This assignment is no longer available to start. Refresh Assignments.",
      "error",
    );
    render();
    return;
  }
  operation.phase = "submitting";
  controls();
  message("Starting service… Please wait.");
  try {
    const result = await startMutation(r.id);
    if (!result || !Object.hasOwn(result, "error")) throw Error("uncertain");
    if (result.error) {
      if (knownRejection(result.error)) {
        operation = null;
        message(
          "Service start failed. Check the refreshed assignment before trying again.",
          "error",
        );
        await loadAssignments();
        focusDetails();
        return;
      }
      throw Error("uncertain");
    }
    operation = null;
    message("Service started successfully.", "success");
    await loadAssignments();
    focusDetails();
  } catch {
    operation.phase = "unresolved";
    controls();
    message(
      "Outcome not yet confirmed. Checking service status without repeating Start Service.",
      "warning",
    );
    await checkOutcome();
  }
}
async function saveProviderReview(event) {
  event.preventDefault();
  const r = selected();
  if (
    !r ||
    r.status !== "completed" ||
    locked() ||
    loading ||
    loadFailed ||
    !reviewsLoaded ||
    !clients.has(r.id) ||
    reviews.has(r.id) ||
    acknowledgedReviews.has(r.id)
  )
    return;
  const d = draft(r.id);
  if (!Number.isInteger(d.rating) || d.rating < 1 || d.rating > 5) {
    d.error = "Please select a star rating.";
    $("providerReviewError").textContent = d.error;
    return;
  }
  if (!d.feedback.trim()) {
    d.error = "Please enter your feedback.";
    $("providerReviewError").textContent = d.error;
    $("providerReviewFeedback").focus();
    return;
  }
  d.error = "";
  const payload = {
    request_id: r.id,
    reviewer_id: currentUser.id,
    reviewee_id: r.clientId,
    rating: d.rating,
    feedback: d.feedback.trim(),
  };
  operation = { id: r.id, kind: "review", phase: "submitting" };
  controls();
  message("Submitting your review… Please wait.");
  try {
    const result = await reviewMutation(payload);
    if (!result || !Object.hasOwn(result, "error")) throw Error("uncertain");
    if (result.error) {
      if (knownRejection(result.error)) {
        operation = null;
        d.error =
          "Review submission failed. Your draft is preserved. Check review status before trying again.";
        reviewsLoaded = false;
        try {
          acceptReviews(await readReviews(requests.map((r) => r.id)));
        } catch {}
        message(d.error, "error");
        render();
        return;
      }
      throw Error("uncertain");
    }
    acknowledgedReviews.set(r.id, {
      rating: d.rating,
      feedback: d.feedback.trim(),
    });
    operation = null;
    message("Review submitted successfully.", "success");
    await loadAssignments();
    focusDetails();
  } catch {
    operation.phase = "unresolved";
    controls();
    message(
      "Review outcome not yet confirmed. Your draft is preserved; no submission will be repeated automatically.",
      "warning",
    );
    await checkOutcome();
  }
}
async function checkOutcome() {
  if (!operation || operation.phase !== "unresolved" || loading) return;
  const op = operation;
  op.phase = "checking";
  controls();
  message(
    "Checking the authorised status… No action is being repeated.",
    "warning",
  );
  try {
    if (op.kind === "review") {
      acceptReviews(await readReviews(requests.map((r) => r.id)));
      if (!reviews.has(op.id)) {
        op.phase = "unresolved";
        render();
        message(
          "Review outcome not yet confirmed. No review is visible yet; submission remains paused. Check review status again.",
          "warning",
        );
        return;
      }
      operation = null;
      message(
        "Review Submitted — verified from your authorised review history.",
        "success",
      );
      render();
      focusDetails();
      return;
    }
    const result = await providerRequests(null, op.id);
    if (result.error || !Array.isArray(result.data)) throw Error("status");
    const row = result.data.find(
      (r) =>
        r.request_id === op.id && r.selected_provider_id === currentUser.id,
    );
    if (row && (!statuses.includes(row.status) || row.status === "confirmed")) {
      op.phase = "unresolved";
      controls();
      message(
        "Outcome not yet confirmed. Start Service remains paused; check service status again.",
        "warning",
      );
      return;
    }
    operation = null;
    const established =
      row && ["in_progress", "completed"].includes(row.status);
    if (!established) {
      requests = (requests || []).filter((r) => r.id !== op.id);
      selectedId = null;
    }
    message(
      established
        ? "Service started successfully according to its current authorised status."
        : "This assignment is no longer available to start. The attempted action's outcome could not be verified; no action was repeated.",
      established ? "success" : "warning",
    );
    await loadAssignments();
    focusDetails();
  } catch {
    op.phase = "unresolved";
    controls();
    message(
      op.kind === "review"
        ? "Review outcome not yet confirmed. Review status could not be checked. Your draft is preserved; use Check review status."
        : "Outcome not yet confirmed. Service status could not be checked. Actions remain paused; use Check service status.",
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
  for (const id of ["assignmentSearch", "assignmentFilter", "assignmentSort"])
    $(id).addEventListener(
      id === "assignmentSearch" ? "input" : "change",
      () => {
        renderList();
        controls();
      },
    );
  $("clearAssignmentSearch").addEventListener("click", () => {
    if (locked()) return;
    $("assignmentSearch").value = "";
    renderList();
    controls();
    $("assignmentSearch").focus();
  });
  $("refreshAssignmentsBtn").addEventListener("click", () =>
    operation?.phase === "unresolved"
      ? checkOutcome()
      : !locked() && loadAssignments(),
  );
  $("backToAssignments").addEventListener("click", () => {
    if (locked()) return;
    $("assignmentWorkspace").dataset.mobileView = "list";
    document.querySelector('.assignment-card[aria-pressed="true"]')?.focus();
  });
  $("cancelStartService").addEventListener("click", () =>
    $("startServiceDialog").close("cancel"),
  );
  $("confirmStartService").addEventListener("click", () =>
    $("startServiceDialog").close("start"),
  );
  $("startServiceDialog").addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const first = $("cancelStartService"),
      last = $("confirmStartService");
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  const mobile = matchMedia("(max-width:760px)");
  mobile.addEventListener("change", () => {
    if (!mobile.matches) return;
    if (operation || $("assignmentDetails").contains(document.activeElement))
      $("assignmentWorkspace").dataset.mobileView = "details";
    else if (
      document.querySelector(".pa-list-panel").contains(document.activeElement)
    )
      $("assignmentWorkspace").dataset.mobileView = "list";
  });
  window.addEventListener("pagehide", cleanupMap, { once: true });
  await loadAssignments();
});
