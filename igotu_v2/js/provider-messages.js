import { providerRequests, serviceParticipants } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import { escapeHtml } from "./html-safety.js";
import {
  parseServiceDate,
  readableServiceDate,
  serviceTime,
} from "./service-calendar.js";

let currentUser = null;
let currentProfile = null;
let conversations = [];
let clientMap = new Map();
let selectedRequest = null;
let selectedClient = null;
let messageTimer = null;
let currentMessages = [];
let messageLoadVersion = 0;
let sendingMessage = false;
const drafts = new Map();
const draftRevisions = new Map();
const retryMessages = new Map();
const pendingMessages = new Map();
const acknowledgedMessages = new Map();
const threadNotices = new Map();
const threadFetches = new Map();
let activeSendRequestId = null;
let loadingVersion = null;
let historyLoaded = false;
let conversationsLoading = false;
let conversationsState = "loading";
let conversationFilter = "all";
let lastMessageView = "";
let pagePaused = false;
let overviewVersion = 0,
  metadataComplete = false;
const summaries = new Map();
const messageColumns =
  "id,message_id,request_id,sender_id,receiver_id,message_text,is_read,created_at";
const validStamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
function validPair(row, request, peer) {
  return (
    row &&
    row.request_id === request.request_id &&
    ((row.sender_id === currentUser.id && row.receiver_id === peer) ||
      (row.sender_id === peer && row.receiver_id === currentUser.id))
  );
}
function updateSummary(id, rows, complete = true) {
  const ordered = rows
    .slice()
    .sort(
      (a, b) =>
        (validStamp(b.created_at) ? Date.parse(b.created_at) : -Infinity) -
          (validStamp(a.created_at) ? Date.parse(a.created_at) : -Infinity) ||
        String(a.id).localeCompare(String(b.id)),
    );
  summaries.set(id, {
    latest: ordered[0] || null,
    unreadIds: new Set(
      rows
        .filter(
          (row) => row.receiver_id === currentUser.id && row.is_read === false,
        )
        .map((row) => row.id),
    ),
    unread: rows.some(
      (row) => row.receiver_id === currentUser.id && row.is_read === false,
    )
      ? true
      : complete
        ? false
        : null,
    complete,
  });
}
async function readPages(makeQuery) {
  const rows = [],
    seen = new Set();
  let offset = 0;
  for (;;) {
    const result = await makeQuery().range(offset, offset + 199);
    if (result.error || !Array.isArray(result.data)) throw Error("read");
    if (!result.data.length) {
      if (Number.isInteger(result.count) && offset < result.count)
        throw Error("incomplete");
      return rows;
    }
    let added = 0;
    for (const row of result.data) {
      const key = String(row.id || row.message_id);
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
        added++;
      }
    }
    if (!added) throw Error("repeated page");
    offset += result.data.length;
    if (Number.isInteger(result.count) && offset >= result.count) return rows;
    if (!Number.isInteger(result.count) && result.data.length < 200)
      return rows;
  }
}
async function loadSummaries(requests) {
  const version = ++overviewVersion;
  metadataComplete = false;
  summaries.clear();
  try {
    const all = [];
    for (let offset = 0; offset < requests.length; offset += 100) {
      const batch = requests
          .slice(offset, offset + 100)
          .filter((r) => clientMap.has(r.request_id)),
        ids = batch.map((r) => r.request_id),
        peers = [...new Set(batch.map((r) => r.client_id))];
      if (!ids.length) continue;
      const results = await Promise.all([
        readPages(() =>
          supabase
            .from("internal_messages")
            .select(messageColumns, { count: "exact" })
            .in("request_id", ids)
            .eq("receiver_id", currentUser.id)
            .in("sender_id", peers)
            .order("created_at", { ascending: false }),
        ),
        readPages(() =>
          supabase
            .from("internal_messages")
            .select(messageColumns, { count: "exact" })
            .in("request_id", ids)
            .eq("sender_id", currentUser.id)
            .in("receiver_id", peers)
            .order("created_at", { ascending: false }),
        ),
      ]);
      all.push(...results.flat());
    }
    if (version !== overviewVersion) return;
    for (const request of requests) {
      const peer = clientMap.get(request.request_id);
      if (peer)
        updateSummary(
          request.request_id,
          all.filter((row) => validPair(row, request, peer.id)),
        );
    }
    metadataComplete = true;
  } catch {
    if (version === overviewVersion) metadataComplete = false;
  }
}
function messageDay(value) {
  if (!validStamp(value)) return "Date unavailable";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = fmt.format(new Date(value));
  if (day === fmt.format(new Date())) return "Today";
  if (day === fmt.format(new Date(Date.now() - 86400000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
async function insertMessage(message) {
  const call = supabase.from("internal_messages").insert(message);
  return await (typeof call.retry === "function" ? call.retry(false) : call);
}
function knownRejection(error) {
  return [
    "P0001",
    "42501",
    "22023",
    "23514",
    "23505",
    "PGRST301",
    "PGRST302",
    "PGRST303",
  ].includes(error?.code);
}

const phoneView = matchMedia("(max-width: 600px)");
const eligibleStatuses = [
  "provider_selected",
  "confirmed",
  "in_progress",
  "completed",
];
const statusLabels = {
  provider_selected: "Awaiting Confirmation",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
};
const $ = (id) => document.getElementById(id);
function showMessage(message, type = "error") {
  $("messageBox").textContent = message;
  $("messageBox").className = `message-box ${type}`;
}
function clearMessage() {
  $("messageBox").textContent = "";
  $("messageBox").className = "message-box hidden";
}
function threadNotice(id, message, type = "error") {
  threadNotices.set(id, { message, type });
  if (selectedRequest?.request_id === id && chatVisible())
    showMessage(message, type);
}
function formatStatus(status) {
  return statusLabels[status] || "Status unavailable";
}
function formatDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return "Timestamp unavailable";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Timestamp unavailable";
  return (
    new Intl.DateTimeFormat("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date(time)) + " MYT"
  );
}
function preferredSchedule(request) {
  const day = parseServiceDate(request.preferred_date)
    ? readableServiceDate(request.preferred_date)
    : "Date not specified";
  const clock = serviceTime(request.preferred_time);
  return `Preferred: ${day} · ${clock ? clock.label + " MYT" : "Time not specified"}`;
}

function generateMessageId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MSG-${Date.now()}-${randomPart}`;
}

function generateUuid() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (character) {
      const random = (Math.random() * 16) | 0;
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

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

function chatVisible() {
  return !phoneView.matches || document.body.dataset.messageView === "chat";
}
function stopPolling(invalidate = true) {
  if (messageTimer !== null) clearTimeout(messageTimer);
  messageTimer = null;
  if (invalidate) messageLoadVersion++;
}
function schedulePoll() {
  if (messageTimer !== null) clearTimeout(messageTimer);
  messageTimer = null;
  if (
    pagePaused ||
    sendingMessage ||
    !selectedRequest ||
    !selectedClient ||
    !chatVisible() ||
    conversationsState !== "ready"
  )
    return;
  const version = messageLoadVersion;
  messageTimer = setTimeout(() => {
    messageTimer = null;
    if (version === messageLoadVersion) void loadMessages(false);
  }, 3000);
}
async function loadClients(requests) {
  clientMap = new Map();
  if (!requests.length) return;
  try {
    const { data, error } = await serviceParticipants(
      requests.map((request) => request.request_id),
    );
    if (error || !Array.isArray(data)) throw new Error();
    requests.forEach((request) => {
      const person = data.find(
        (person) =>
          person.request_id === request.request_id &&
          person.id === request.client_id &&
          person.role === "client",
      );
      if (person) clientMap.set(request.request_id, person);
    });
  } catch {
    showMessage(
      "Conversation participants could not be loaded. Please try again.",
    );
  }
}
async function loadConversations() {
  if (conversationsLoading) return;
  if (selectedRequest)
    drafts.set(selectedRequest.request_id, $("messageInput").value);
  stopPolling();
  conversationsLoading = true;
  conversationsState = "loading";
  updateFilterState();
  renderConversationList();
  updateComposerState();
  try {
    const { data, error } = await providerRequests([
      "provider_selected",
      "confirmed",
      "in_progress",
      "completed",
    ]);
    if (error || (data !== null && !Array.isArray(data))) throw new Error();
    conversations = (data || []).filter(
      (request) =>
        typeof request?.request_id === "string" &&
        request.request_id &&
        request.selected_provider_id === currentUser.id &&
        request.client_id &&
        eligibleStatuses.includes(request.status),
    );
    conversations = conversations.map((r) => ({
      request_id: r.request_id,
      client_id: r.client_id,
      selected_provider_id: r.selected_provider_id,
      title: r.title,
      category: r.category,
      status: r.status,
      preferred_date: r.preferred_date,
      preferred_time: r.preferred_time,
      created_at: r.created_at,
    }));
    await loadClients(conversations);
    await loadSummaries(conversations);
    conversationsState = "ready";
    const requestedId = new URLSearchParams(location.search).get("request_id");
    const previous = selectedRequest?.request_id;
    if (
      requestedId &&
      conversations.some((request) => request.request_id === requestedId)
    )
      selectConversation(requestedId, { history: false, focus: false });
    else if (requestedId) {
      clearSelection();
      showMessage(
        "This request conversation is unavailable. Choose one of your eligible conversations below.",
      );
    } else if (
      previous &&
      conversations.some((request) => request.request_id === previous)
    )
      selectConversation(previous, { history: false, focus: false });
    else if (!phoneView.matches && conversations.length)
      selectConversation(
        conversationRows()[0]?.request_id || conversations[0].request_id,
        {
          history: false,
          focus: false,
        },
      );
    else clearSelection();
  } catch {
    conversationsState = "error";
    if (!conversations.length) clearSelection();
    else
      showMessage(
        "Conversations could not refresh. Previous information may be outdated. Refresh before sending.",
      );
  } finally {
    conversationsLoading = false;
    updateFilterState();
    renderConversationList();
    document.body.dataset.messagesReady = "true";
    updateComposerState();
  }
}
function updateFilterState() {
  const disabled = conversationsState !== "ready";
  $("refreshConversationsBtn").disabled =
    conversationsLoading || sendingMessage;
  $("conversationSearch").disabled = disabled;
  document.querySelectorAll("[data-conversation-filter]").forEach((button) => {
    button.disabled = disabled;
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.conversationFilter === conversationFilter),
    );
  });
}
function conversationRows() {
  const query = $("conversationSearch")
    .value.trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  return conversations
    .filter((request) => {
      const provider = clientMap.get(request.request_id);
      const haystack = [
        provider?.full_name,
        request.title,
        request.request_id,
        request.category,
      ]
        .filter((value) => typeof value === "string")
        .join(" ")
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (conversationFilter === "all" || conversationFilter === "completed"
          ? conversationFilter !== "completed" || request.status === "completed"
          : request.status !== "completed")
      );
    })
    .sort((a, b) => {
      const stamp = (r) => {
        const latest = summaries.get(r.request_id)?.latest;
        return validStamp(latest?.created_at)
          ? Date.parse(latest.created_at)
          : validStamp(r.created_at)
            ? Date.parse(r.created_at)
            : -Infinity;
      };
      const x = stamp(a),
        y = stamp(b);
      return (
        (x === y ? 0 : x > y ? -1 : 1) ||
        String(a.request_id).localeCompare(String(b.request_id))
      );
    });
}
function resetConversationFilters() {
  $("conversationSearch").value = "";
  conversationFilter = "all";
  updateFilterState();
  renderConversationList();
}
function renderConversationList() {
  const list = $("conversationList");
  const activeId = list.contains(document.activeElement)
    ? document.activeElement?.closest(".conversation-card")?.dataset.requestId
    : null;
  list.setAttribute("aria-busy", String(conversationsState === "loading"));
  $("conversationCount").textContent =
    conversationsState === "ready" ? String(conversations.length) : "—";
  if (conversationsState !== "ready" && !conversations.length) {
    $("conversationResultsStatus").textContent =
      conversationsState === "loading"
        ? "Loading your conversations…"
        : "Conversation count unavailable.";
    list.innerHTML =
      conversationsState === "loading"
        ? '<div class="messages-state"><h3>Loading conversations…</h3><p>Checking your eligible request conversations.</p></div>'
        : '<div class="messages-state" role="alert"><h3>Unable to load conversations</h3><p>Your messages have not been changed. Try again to load your eligible requests.</p><button type="button" class="btn btn-outline" id="retryConversationsBtn">Try Again</button></div>';
    $("retryConversationsBtn")?.addEventListener("click", () => {
      clearMessage();
      void loadConversations();
    });
    return;
  }
  const rows = conversationRows();
  $("conversationResultsStatus").textContent =
    `Showing ${rows.length} of ${conversations.length} conversations${conversationsState === "error" ? " · Outdated: refresh before sending." : metadataComplete ? "" : " · Previews/unread status unavailable."}`;
  if (!rows.length) {
    list.innerHTML = conversations.length
      ? '<div class="messages-state"><h3>No conversations match your search</h3><p>Try a different search or reset your filters.</p><button type="button" class="btn btn-outline" id="clearConversationSearchBtn">Reset Filters</button></div>'
      : '<div class="messages-state"><h3>No conversations yet</h3><p>Conversations appear after a Client selects you for an eligible service request.</p><a class="btn btn-outline" href="incoming-requests.html">View Incoming Requests</a></div>';
    $("clearConversationSearchBtn")?.addEventListener(
      "click",
      resetConversationFilters,
    );
    return;
  }
  list.innerHTML = rows
    .map((request) => {
      const provider = clientMap.get(request.request_id),
        active = selectedRequest?.request_id === request.request_id;
      const summary = summaries.get(request.request_id),
        latest = summary?.latest;
      const preview = latest
        ? `${latest.sender_id === currentUser.id ? "You: " : "Client: "}${String(latest.message_text ?? "")}`
        : summary?.complete
          ? "No messages yet"
          : "Message preview unavailable";
      const extra = `<span class="conversation-preview">${escapeHtml(preview)}</span>${latest && validStamp(latest.created_at) ? `<span class="conversation-latest-time">${escapeHtml(formatDateTime(latest.created_at))}</span>` : ""}${summary?.unread === true ? '<span class="conversation-unread" role="img" aria-label="Unread incoming messages">●</span>' : ""}`;

      return `<button type="button" class="conversation-card ${active ? "active" : ""}" data-request-id="${escapeHtml(request.request_id)}" ${conversationsState !== "ready" ? "disabled" : ""} aria-pressed="${active}"><span class="conversation-avatar" aria-hidden="true">${escapeHtml((provider?.full_name || "?").charAt(0).toUpperCase())}</span><span class="conversation-card-body"><strong>${escapeHtml(provider?.full_name || "Client information unavailable")}</strong><span class="conversation-service-title">${escapeHtml(request.title || "Service request")}</span><span class="conversation-card-id">${escapeHtml(request.request_id)}</span><span class="status-pill status-${eligibleStatuses.includes(request.status) ? request.status : "unknown"}">${escapeHtml(formatStatus(request.status))}</span>${extra}</span></button>`;
    })
    .join("");
  list
    .querySelectorAll(".conversation-card")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectConversation(button.dataset.requestId),
      ),
    );
  if (activeId)
    [...list.querySelectorAll(".conversation-card")]
      .find((button) => button.dataset.requestId === activeId)
      ?.focus({ preventScroll: true });
}
function setConversationUrl(id, push = true) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("request_id", id);
  else url.searchParams.delete("request_id");
  if (url.href !== location.href)
    history[push ? "pushState" : "replaceState"](
      { igotuMessageRequest: id },
      "",
      url,
    );
}
function clearSelection() {
  if (selectedRequest)
    drafts.set(selectedRequest.request_id, $("messageInput").value);
  stopPolling();
  selectedRequest = null;
  selectedClient = null;
  currentMessages = [];
  historyLoaded = false;
  lastMessageView = "";
  $("chatEmptyState").classList.remove("hidden");
  $("chatArea").classList.add("hidden");
  document.body.dataset.messageView = "list";
  updateComposerState();
}
function selectConversation(requestId, options = {}) {
  const request = conversations.find(
    (request) => request.request_id === requestId,
  );
  if (!request || conversationsState !== "ready") return;
  if (selectedRequest)
    drafts.set(selectedRequest.request_id, $("messageInput").value);
  stopPolling();
  selectedRequest = request;
  selectedClient = clientMap.get(request.request_id) || null;
  currentMessages = [];
  historyLoaded = false;
  lastMessageView = "";
  setMessageInput(drafts.get(request.request_id) || "");
  document.body.dataset.messageView = "chat";
  if (options.history !== false) setConversationUrl(requestId);
  renderConversationList();
  renderChatHeader();
  if (selectedClient) {
    $("messagesList").innerHTML =
      '<div class="messages-state"><h3>Loading messages…</h3><p>Loading this request conversation.</p></div>';
    $("messagesList").setAttribute("aria-busy", "true");
    void loadMessages(true);
  } else {
    $("messagesList").setAttribute("aria-busy", "false");
    $("messagesList").innerHTML =
      '<div class="messages-state"><h3>Client information unavailable</h3><p>The intended recipient could not be verified. Retry the participant lookup before sending.</p><button type="button" id="retryParticipantsBtn" class="btn btn-outline">Try Again</button></div>';
    $("retryParticipantsBtn").addEventListener(
      "click",
      () => void loadConversations(),
    );
  }
  if (phoneView.matches && options.focus !== false)
    requestAnimationFrame(() => {
      $("chatClientName").focus({ preventScroll: true });
      $("chatArea").scrollIntoView({ block: "start" });
    });
}
function showConversationList(updateHistory = true) {
  if (selectedRequest)
    drafts.set(selectedRequest.request_id, $("messageInput").value);
  stopPolling();
  document.body.dataset.messageView = "list";
  if (updateHistory) setConversationUrl(null);
  const target = [...document.querySelectorAll(".conversation-card")].find(
    (button) => button.dataset.requestId === selectedRequest?.request_id,
  );
  (target || $("conversationSearch")).focus({ preventScroll: true });
  updateComposerState();
}
function renderChatHeader() {
  $("chatEmptyState").classList.add("hidden");
  $("chatArea").classList.remove("hidden");
  $("chatClientName").textContent =
    selectedClient?.full_name || "Client information unavailable";
  $("chatClientAvatar").textContent = (selectedClient?.full_name || "?")
    .charAt(0)
    .toUpperCase();
  $("chatReceiverInfo").textContent = selectedClient
    ? `Client · ${selectedClient.user_code || ""}`
    : "Recipient not verified";
  $("chatRequestTitle").textContent =
    selectedRequest.title || "Service request";
  $("chatRequestId").textContent = selectedRequest.request_id;
  $("chatStatus").textContent = formatStatus(selectedRequest.status);
  $("chatStatus").className =
    `status-pill status-${eligibleStatuses.includes(selectedRequest.status) ? selectedRequest.status : "unknown"}`;
  $("chatPreferredSchedule").textContent = preferredSchedule(selectedRequest);
  $("viewChatRequestBtn").href =
    selectedRequest.status === "provider_selected"
      ? "incoming-requests.html"
      : "assignment-details.html";
  $("viewChatRequestBtn").textContent =
    selectedRequest.status === "provider_selected"
      ? "View Incoming Request"
      : "View Assignment";
  $("chatReadStatus").textContent = "";
  $("showLatestMessagesBtn").hidden = true;
  clearMessage();
  const note = threadNotices.get(selectedRequest.request_id);
  if (note) showMessage(note.message, note.type);
  updateComposerState();
}
function sizeComposer() {
  const input = $("messageInput"),
    style = getComputedStyle(input);
  const min = parseFloat(style.minHeight) || 65,
    max = parseFloat(style.maxHeight) || 145;
  input.style.height = "auto";
  input.style.height =
    (input.value ? Math.max(min, Math.min(input.scrollHeight + 2, max)) : min) +
    "px";
}
function updateMessageCharacterCount() {
  $("messageCharacterCount").textContent =
    `${$("messageInput").value.length} / 1,000`;
}
function setMessageInput(value) {
  $("messageInput").value = value;
  updateMessageCharacterCount();
  sizeComposer();
}
function updateComposerState() {
  const ready =
    selectedRequest &&
    selectedClient &&
    historyLoaded &&
    chatVisible() &&
    conversationsState === "ready" &&
    !conversationsLoading;
  document.body.dataset.messageSending = String(sendingMessage);
  $("messageForm").setAttribute("aria-busy", String(sendingMessage));
  $("messageInput").disabled = !ready;
  $("sendMessageBtn").disabled =
    !ready ||
    sendingMessage ||
    !$("messageInput").value.trim() ||
    $("messageInput").value.length > 1000;
  $("refreshConversationsBtn").disabled =
    conversationsLoading || sendingMessage;
  $("sendMessageBtn").innerHTML = sendingMessage
    ? "<span>Sending…</span>"
    : '<span>Send</span><svg class="message-send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/></svg>';
  updateMessageCharacterCount();
  sizeComposer();
}
function nearBottom(list) {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 70;
}
function renderMessages(messages, forceBottom = false) {
  const list = $("messagesList"),
    top = list.scrollTop,
    follow = forceBottom || nearBottom(list);
  const pending = selectedRequest
    ? pendingMessages.get(selectedRequest.request_id)
    : null;
  const rows = [...messages];
  // An insert acknowledgement is confirmed, even if an older poll is still in flight.
  // Keep it visible until a subsequent authorised read contains the same UUID.
  for (const message of acknowledgedMessages.values()) {
    if (message.request_id !== selectedRequest?.request_id) continue;
    if (
      rows.some(
        (row) => row.id === message.id && row.message_id === message.message_id,
      )
    )
      acknowledgedMessages.delete(message.id);
    else rows.push(message);
  }
  if (
    pending &&
    !rows.some(
      (row) => row.id === pending.id || row.message_id === pending.message_id,
    )
  )
    rows.push({ ...pending, localPending: true });
  const fingerprint = JSON.stringify(
    rows.map((row) => [
      row.id,
      row.message_id,
      row.sender_id,
      row.receiver_id,
      row.message_text,
      row.created_at,
      !!row.localPending,
    ]),
  );
  if (fingerprint === lastMessageView) {
    if (forceBottom) list.scrollTop = list.scrollHeight;
    return;
  }
  lastMessageView = fingerprint;
  if (!rows.length) {
    list.innerHTML =
      '<div class="messages-state"><h3>No messages yet</h3><p>Start the conversation with your selected Client.</p></div>';
    return;
  }
  let previousDay = null;
  const nodes = rows.flatMap((message) => {
    const bubble = document.createElement("div");
    bubble.className =
      message.sender_id === currentUser.id
        ? "message-bubble mine"
        : "message-bubble other";
    bubble.dataset.messageId = message.message_id || message.id || "";
    if (message.localPending) bubble.classList.add("pending");
    const text = document.createElement("p");
    text.textContent = message.message_text ?? "";
    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatDateTime(message.created_at);
    bubble.append(text, time);
    if (message.localPending) {
      const state = document.createElement("span");
      state.className = "message-pending-label";
      state.textContent = "Sending… Not yet confirmed";
      bubble.append(state);
    }
    const day = messageDay(message.created_at),
      nodes = [];
    if (day !== previousDay) {
      const separator = document.createElement("p");
      separator.className = "message-date-separator";
      separator.textContent = day;
      nodes.push(separator);
      previousDay = day;
    }
    nodes.push(bubble);
    return nodes;
  });
  list.replaceChildren(...nodes);
  if (follow) {
    list.scrollTop = list.scrollHeight;
    $("showLatestMessagesBtn").hidden = true;
  } else {
    list.scrollTop = top;
    $("showLatestMessagesBtn").hidden = false;
  }
  $("messageHistoryStatus").textContent = forceBottom
    ? `${messages.length} stored messages loaded.`
    : "Conversation messages updated.";
}
async function fetchThread(requestIdValue, peerId) {
  const key = JSON.stringify([requestIdValue, peerId]);
  if (threadFetches.has(key)) return threadFetches.get(key);
  const fetch = (async () => {
    try {
      const rows = await readPages(() =>
        supabase
          .from("internal_messages")
          .select("*", { count: "exact" })
          .eq("request_id", requestIdValue)
          .in("sender_id", [currentUser.id, peerId])
          .in("receiver_id", [currentUser.id, peerId])
          .order("created_at", { ascending: true }),
      );
      return {
        data: rows.filter((row) =>
          validPair(row, { request_id: requestIdValue }, peerId),
        ),
        error: null,
      };
    } catch {
      return { data: null, error: true };
    }
  })();
  threadFetches.set(key, fetch);
  try {
    return await fetch;
  } finally {
    if (threadFetches.get(key) === fetch) threadFetches.delete(key);
  }
}
async function markMessagesAsRead(requestIdValue, peerId) {
  const ids = currentMessages
    .filter(
      (row) =>
        row.request_id === requestIdValue &&
        row.sender_id === peerId &&
        row.receiver_id === currentUser.id &&
        row.is_read === false &&
        typeof row.id === "string",
    )
    .map((row) => row.id);
  if (!ids.length) return true;
  try {
    const call = supabase
      .from("internal_messages")
      .update({ is_read: true })
      .eq("request_id", requestIdValue)
      .eq("receiver_id", currentUser.id)
      .eq("sender_id", peerId)
      .eq("is_read", false)
      .in("id", ids)
      .select("id");
    const result = await (typeof call.retry === "function"
      ? call.retry(false)
      : call);
    if (result.error || !Array.isArray(result.data)) return false;
    const changed = new Set(result.data.map((row) => row.id));
    if (clientMap.get(requestIdValue)?.id === peerId) {
      const summary = summaries.get(requestIdValue);
      if (summary) {
        for (const id of changed) summary.unreadIds.delete(id);
        summary.unread = summary.unreadIds.size
          ? true
          : summary.complete
            ? false
            : null;
      }
      if (
        selectedRequest?.request_id === requestIdValue &&
        selectedClient?.id === peerId
      )
        for (const row of currentMessages)
          if (changed.has(row.id)) row.is_read = true;
      renderConversationList();
    }
    return ids.every((id) => changed.has(id));
  } catch {
    return false;
  }
}
function reconcileRetry(requestIdValue, rows) {
  const attempt = retryMessages.get(requestIdValue);
  if (!attempt) return false;
  if (
    !rows.some(
      (row) =>
        row.id === attempt.message.id &&
        row.message_id === attempt.message.message_id,
    )
  )
    return false;
  retryMessages.delete(requestIdValue);
  pendingMessages.delete(requestIdValue);
  if (
    draftRevisions.get(requestIdValue) === attempt.restoredRevision &&
    drafts.get(requestIdValue) === attempt.draftText
  ) {
    drafts.delete(requestIdValue);
    if (
      selectedRequest?.request_id === requestIdValue &&
      $("messageInput").value === attempt.draftText
    )
      setMessageInput("");
  }
  threadNotice(
    requestIdValue,
    "Your earlier message is saved in this conversation.",
    "success",
  );
  return true;
}
async function loadMessages(scrollToBottom = false) {
  if (!selectedRequest || !selectedClient || !chatVisible() || pagePaused)
    return;
  const request = selectedRequest,
    peerId = selectedClient.id,
    version = messageLoadVersion;
  if (loadingVersion === version) return;
  loadingVersion = version;
  const list = $("messagesList");
  try {
    const { data, error } = await fetchThread(request.request_id, peerId);
    if (
      selectedRequest?.request_id !== request.request_id ||
      version !== messageLoadVersion ||
      pagePaused ||
      !chatVisible()
    )
      return;
    if (error || (data !== null && !Array.isArray(data))) throw new Error();
    currentMessages = (data || []).filter(
      (row) =>
        row.request_id === request.request_id &&
        ((row.sender_id === currentUser.id && row.receiver_id === peerId) ||
          (row.sender_id === peerId && row.receiver_id === currentUser.id)),
    );
    historyLoaded = true;
    updateSummary(request.request_id, currentMessages);
    renderConversationList();
    reconcileRetry(request.request_id, currentMessages);
    renderMessages(currentMessages, scrollToBottom);
    updateComposerState();
    const read = await markMessagesAsRead(request.request_id, peerId);
    if (
      version === messageLoadVersion &&
      selectedRequest?.request_id === request.request_id
    )
      $("chatReadStatus").textContent = read
        ? ""
        : "Messages loaded, but read status could not be updated.";
  } catch {
    if (
      selectedRequest?.request_id === request.request_id &&
      version === messageLoadVersion &&
      !pagePaused
    ) {
      if (!historyLoaded) {
        lastMessageView = "";
        list.innerHTML =
          '<div class="messages-state" role="alert"><h3>Unable to load messages</h3><p>Try again to check this request conversation before sending.</p><button type="button" class="btn btn-outline" id="retryMessagesBtn">Try Again</button></div>';
        $("retryMessagesBtn").addEventListener(
          "click",
          () => void loadMessages(true),
        );
      } else
        $("chatReadStatus").textContent =
          "Messages could not refresh. Showing the last successfully loaded history.";
      updateComposerState();
    }
  } finally {
    if (loadingVersion === version) loadingVersion = null;
    if (version === messageLoadVersion) {
      list.setAttribute("aria-busy", "false");
      schedulePoll();
    }
  }
}
function keepFailedDraft(request, attempt, uncertain) {
  retryMessages.set(request.request_id, attempt);
  pendingMessages.delete(request.request_id);
  // Do not replace a newer draft entered after the original send began.
  if ((draftRevisions.get(request.request_id) || 0) === attempt.sendRevision) {
    drafts.set(request.request_id, attempt.draftText);
    attempt.restoredRevision = draftRevisions.get(request.request_id);
    if (selectedRequest?.request_id === request.request_id)
      setMessageInput(attempt.draftText);
  }
  if (selectedRequest?.request_id === request.request_id)
    renderMessages(currentMessages);
  threadNotice(
    request.request_id,
    uncertain
      ? "The message save could not be confirmed. Your draft is kept. Retry checks this conversation before reusing the same message identifiers."
      : "Unable to send your message. Your draft has been kept for retry. Retry checks the conversation before sending again.",
  );
}
async function sendMessage(event) {
  event.preventDefault();
  if (sendingMessage) return;
  const request = selectedRequest,
    recipient = selectedClient,
    input = $("messageInput");
  if (
    !request ||
    !recipient ||
    clientMap.get(request.request_id)?.id !== recipient.id ||
    recipient.id !== request.client_id ||
    !historyLoaded ||
    conversationsState !== "ready" ||
    conversationsLoading ||
    !chatVisible()
  ) {
    showMessage(
      "Select an available conversation and load its messages before sending.",
    );
    return;
  }
  const draftText = input.value,
    text = draftText.trim(),
    revision = draftRevisions.get(request.request_id) || 0;
  if (!text) {
    showMessage("Please type a message.");
    return;
  }
  if (draftText.length > 1000) {
    showMessage("Messages must be 1,000 characters or fewer.");
    return;
  }
  sendingMessage = true;
  activeSendRequestId = request.request_id;
  stopPolling(false);
  clearMessage();
  threadNotices.delete(request.request_id);
  updateComposerState();
  let attempt = null;
  try {
    const previous = retryMessages.get(request.request_id);
    if (previous) {
      const { data, error } = await fetchThread(
        request.request_id,
        recipient.id,
      );
      if (error || !Array.isArray(data)) {
        threadNotice(
          request.request_id,
          "Your earlier message could not be checked. Your draft is kept; try again when this conversation can be loaded.",
        );
        return;
      }
      const found = reconcileRetry(request.request_id, data);
      if (found && text === previous.message.message_text) {
        if (selectedRequest?.request_id === request.request_id) {
          currentMessages = data;
          renderMessages(currentMessages, true);
        }
        return;
      }
    }
    const previousRetry = retryMessages.get(request.request_id);
    const message =
      previousRetry &&
      previousRetry.message.message_text === text &&
      previousRetry.message.receiver_id === recipient.id
        ? previousRetry.message
        : {
            id: generateUuid(),
            message_id: generateMessageId(),
            request_id: request.request_id,
            sender_id: currentUser.id,
            receiver_id: recipient.id,
            message_text: text,
            is_read: false,
            created_at: new Date().toISOString(),
          };
    attempt = {
      message,
      draftText,
      sendRevision: revision,
      restoredRevision: undefined,
    };
    pendingMessages.set(request.request_id, message);
    drafts.delete(request.request_id);
    if (selectedRequest?.request_id === request.request_id) {
      setMessageInput("");
      renderMessages(currentMessages, true);
    }
    const result = await insertMessage(message);
    if (!result || !Object.hasOwn(result, "error")) throw Error("uncertain");
    if (result.error) {
      keepFailedDraft(request, attempt, !knownRejection(result.error));
      return;
    }
    pendingMessages.delete(request.request_id);
    retryMessages.delete(request.request_id);
    acknowledgedMessages.set(message.id, message);
    const previousRows =
      selectedRequest?.request_id === request.request_id ? currentMessages : [];
    updateSummary(request.request_id, [...previousRows, message], false);
    renderConversationList();
    if (selectedRequest?.request_id === request.request_id)
      renderMessages(currentMessages, true);
    threadNotice(
      request.request_id,
      "Message saved to this conversation.",
      "success",
    );
    if (selectedRequest?.request_id === request.request_id)
      void loadMessages(true);
  } catch {
    if (attempt) keepFailedDraft(request, attempt, true);
    else
      threadNotice(
        request.request_id,
        "Your earlier message could not be checked. Your draft is kept; try again when this conversation can be loaded.",
      );
  } finally {
    sendingMessage = false;
    activeSendRequestId = null;
    updateComposerState();
    schedulePoll();
  }
}
function setupMessagingUI() {
  updateMessageCharacterCount();
  $("conversationSearch").addEventListener("input", renderConversationList);
  document.querySelectorAll("[data-conversation-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      conversationFilter = button.dataset.conversationFilter;
      updateFilterState();
      renderConversationList();
    }),
  );
  $("messageInput").addEventListener("input", () => {
    if (selectedRequest) {
      drafts.set(selectedRequest.request_id, $("messageInput").value);
      draftRevisions.set(
        selectedRequest.request_id,
        (draftRevisions.get(selectedRequest.request_id) || 0) + 1,
      );
    }
    updateComposerState();
  });
  $("backToConversationsBtn").addEventListener("click", () =>
    showConversationList(),
  );
  $("messagesList").addEventListener("scroll", () => {
    if (nearBottom($("messagesList"))) $("showLatestMessagesBtn").hidden = true;
  });
  $("showLatestMessagesBtn").addEventListener("click", () => {
    $("messagesList").scrollTop = $("messagesList").scrollHeight;
    $("showLatestMessagesBtn").hidden = true;
    $("messagesList").focus({ preventScroll: true });
  });
  $("messageForm").addEventListener("submit", sendMessage);
  $("messageInput").addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      if (!$("sendMessageBtn").disabled) $("messageForm").requestSubmit();
    }
  });
  $("refreshConversationsBtn").addEventListener("click", () => {
    if (!sendingMessage) void loadConversations();
  });
  phoneView.addEventListener("change", () => {
    updateComposerState();
    if (selectedRequest && selectedClient && chatVisible())
      void loadMessages(false);
    else stopPolling();
    if (
      phoneView.matches &&
      document
        .querySelector(".conversation-panel")
        .contains(document.activeElement) &&
      chatVisible()
    )
      $("chatClientName").focus({ preventScroll: true });
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("request_id");
    if (conversations.some((request) => request.request_id === id))
      selectConversation(id, { history: false });
    else {
      clearSelection();
      renderConversationList();
      if (id)
        showMessage(
          "This request conversation is unavailable. Choose one of your eligible conversations.",
        );
    }
  });
  const pause = () => {
    pagePaused = true;
    stopPolling();
  };
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      pagePaused = false;
      if (selectedRequest && chatVisible()) void loadMessages(false);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else {
      pagePaused = false;
      if (selectedRequest && chatVisible()) void loadMessages(false);
    }
  });
  // Keep an in-flow composer visible when a mobile browser changes its visual viewport.
  window.visualViewport?.addEventListener("resize", () => {
    if (phoneView.matches && document.activeElement === $("messageInput")) {
      sizeComposer();
      $("messageForm").scrollIntoView({ block: "nearest" });
    }
  });
}
document.addEventListener("DOMContentLoaded", async function () {
  if (!(await authorizeWorkspace()).allowed) return;
  currentUser = await getSessionUser();
  if (!currentUser) return;
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) return;
  displayUser(currentProfile);
  handleLogout();
  setupMessagingUI();
  await loadConversations();
});
