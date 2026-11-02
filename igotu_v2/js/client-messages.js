import { serviceParticipants } from "./backend-access.js";
import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import { escapeHtml } from "./html-safety.js";

let currentUser = null;
let currentProfile = null;
let conversations = [];
let providerMap = new Map();
let selectedRequest = null;
let selectedProvider = null;
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
const phoneView = matchMedia("(max-width: 600px)");
const eligibleStatuses = [
  "provider_selected",
  "confirmed",
  "in_progress",
  "completed",
];
const statusLabels = {
  provider_selected: "Provider Selected",
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
  const value = request.preferred_date;
  let date = "Date not specified";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value + "T00:00:00Z");
    if (Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value)
      date = new Intl.DateTimeFormat("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);
  }
  const match =
    typeof request.preferred_time === "string" &&
    /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(request.preferred_time);
  const time =
    match && +match[1] < 24 && +match[2] < 60
      ? `${+match[1] % 12 || 12}:${match[2]} ${+match[1] < 12 ? "AM" : "PM"}`
      : "Time not specified";
  return `Preferred: ${date} · ${time}`;
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

  if (data.role !== "client" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  return data;
}

function displayUser(profile) {
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userRole").textContent =
    `Client · ${profile.user_code}`;
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
    !selectedProvider ||
    !chatVisible()
  )
    return;
  const version = messageLoadVersion;
  messageTimer = setTimeout(() => {
    messageTimer = null;
    if (version === messageLoadVersion) void loadMessages(false);
  }, 3000);
}
async function loadProviders(requests) {
  providerMap = new Map();
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
          person.id === request.selected_provider_id,
      );
      if (person) providerMap.set(request.request_id, person);
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
  try {
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("client_id", currentUser.id)
      .not("selected_provider_id", "is", null)
      .in("status", [
        "provider_selected",
        "confirmed",
        "in_progress",
        "completed",
      ])
      .order("created_at", { ascending: false });
    if (error || (data !== null && !Array.isArray(data))) throw new Error();
    conversations = (data || []).filter(
      (request) =>
        request?.client_id === currentUser.id &&
        request.selected_provider_id &&
        eligibleStatuses.includes(request.status),
    );
    await loadProviders(conversations);
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
      selectConversation(conversations[0].request_id, {
        history: false,
        focus: false,
      });
    else clearSelection();
  } catch {
    conversationsState = "error";
    clearSelection();
  } finally {
    conversationsLoading = false;
    updateFilterState();
    renderConversationList();
    document.body.dataset.messagesReady = "true";
  }
}
function updateFilterState() {
  const disabled = conversationsState !== "ready";
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
  return conversations.filter((request) => {
    const provider = providerMap.get(request.request_id);
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
  if (conversationsState !== "ready") {
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
    `Showing ${rows.length} of ${conversations.length} conversations`;
  if (!rows.length) {
    list.innerHTML = conversations.length
      ? '<div class="messages-state"><h3>No conversations match your search</h3><p>Try a different search or reset your filters.</p><button type="button" class="btn btn-outline" id="clearConversationSearchBtn">Reset Filters</button></div>'
      : '<div class="messages-state"><h3>No conversations yet</h3><p>Conversations appear after you select a Provider for an eligible service request.</p><a class="btn btn-outline" href="my-requests.html">View My Requests</a></div>';
    $("clearConversationSearchBtn")?.addEventListener(
      "click",
      resetConversationFilters,
    );
    return;
  }
  list.innerHTML = rows
    .map((request) => {
      const provider = providerMap.get(request.request_id),
        active = selectedRequest?.request_id === request.request_id;
      return `<button type="button" class="conversation-card ${active ? "active" : ""}" data-request-id="${escapeHtml(request.request_id)}" aria-pressed="${active}"><span class="conversation-avatar" aria-hidden="true">${escapeHtml((provider?.full_name || "?").charAt(0).toUpperCase())}</span><span class="conversation-card-body"><strong>${escapeHtml(provider?.full_name || "Provider information unavailable")}</strong><span class="conversation-service-title">${escapeHtml(request.title || "Service request")}</span><span class="conversation-card-id">${escapeHtml(request.request_id)}</span><span class="status-pill status-${eligibleStatuses.includes(request.status) ? request.status : "unknown"}">${escapeHtml(formatStatus(request.status))}</span></span></button>`;
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
  selectedProvider = null;
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
  if (!request) return;
  if (selectedRequest)
    drafts.set(selectedRequest.request_id, $("messageInput").value);
  stopPolling();
  selectedRequest = request;
  selectedProvider = providerMap.get(request.request_id) || null;
  currentMessages = [];
  historyLoaded = false;
  lastMessageView = "";
  $("messageInput").value = drafts.get(request.request_id) || "";
  document.body.dataset.messageView = "chat";
  if (options.history !== false) setConversationUrl(requestId);
  renderConversationList();
  renderChatHeader();
  if (selectedProvider) {
    $("messagesList").innerHTML =
      '<div class="messages-state"><h3>Loading messages…</h3><p>Loading this request conversation.</p></div>';
    $("messagesList").setAttribute("aria-busy", "true");
    void loadMessages(true);
  } else {
    $("messagesList").setAttribute("aria-busy", "false");
    $("messagesList").innerHTML =
      '<div class="messages-state"><h3>Provider information unavailable</h3><p>The intended recipient could not be verified. Retry the participant lookup before sending.</p><button type="button" id="retryParticipantsBtn" class="btn btn-outline">Try Again</button></div>';
    $("retryParticipantsBtn").addEventListener(
      "click",
      () => void loadConversations(),
    );
  }
  if (phoneView.matches && options.focus !== false)
    requestAnimationFrame(() => {
      $("chatProviderName").focus({ preventScroll: true });
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
  $("chatProviderName").textContent =
    selectedProvider?.full_name || "Provider information unavailable";
  $("chatProviderAvatar").textContent = (selectedProvider?.full_name || "?")
    .charAt(0)
    .toUpperCase();
  $("chatReceiverInfo").textContent = selectedProvider
    ? `Provider · ${selectedProvider.user_code || ""}`
    : "Recipient not verified";
  $("chatRequestTitle").textContent =
    selectedRequest.title || "Service request";
  $("chatRequestId").textContent = selectedRequest.request_id;
  $("chatStatus").textContent = formatStatus(selectedRequest.status);
  $("chatStatus").className =
    `status-pill status-${eligibleStatuses.includes(selectedRequest.status) ? selectedRequest.status : "unknown"}`;
  $("chatPreferredSchedule").textContent = preferredSchedule(selectedRequest);
  $("viewChatRequestBtn").href =
    `request-details.html?request_id=${encodeURIComponent(selectedRequest.request_id)}`;
  $("chatReadStatus").textContent = "";
  $("showLatestMessagesBtn").hidden = true;
  clearMessage();
  const note = threadNotices.get(selectedRequest.request_id);
  if (note) showMessage(note.message, note.type);
  updateComposerState();
}
function updateComposerState() {
  const ready =
    selectedRequest && selectedProvider && historyLoaded && chatVisible();
  $("messageInput").disabled =
    !ready ||
    (sendingMessage && activeSendRequestId === selectedRequest?.request_id);
  $("sendMessageBtn").disabled = !ready || sendingMessage;
  $("sendMessageBtn").innerHTML = sendingMessage
    ? "<span>Sending…</span>"
    : '<span>Send</span><svg class="message-send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/></svg>';
  $("messageCharacterCount").textContent =
    `${$("messageInput").value.length} / 1,000`;
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
      '<div class="messages-state"><h3>No messages yet</h3><p>Start the conversation with your selected Provider.</p></div>';
    return;
  }
  const nodes = rows.map((message) => {
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
    return bubble;
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
  const fetch = (async () =>
    await supabase
      .from("internal_messages")
      .select("*")
      .eq("request_id", requestIdValue)
      .in("sender_id", [currentUser.id, peerId])
      .in("receiver_id", [currentUser.id, peerId])
      .order("created_at", { ascending: true }))();
  threadFetches.set(key, fetch);
  try {
    return await fetch;
  } finally {
    if (threadFetches.get(key) === fetch) threadFetches.delete(key);
  }
}
async function markMessagesAsRead(requestIdValue, peerId) {
  try {
    const { error } = await supabase
      .from("internal_messages")
      .update({ is_read: true })
      .eq("request_id", requestIdValue)
      .eq("receiver_id", currentUser.id)
      .eq("sender_id", peerId)
      .eq("is_read", false);
    return !error;
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
      $("messageInput").value = "";
  }
  threadNotice(
    requestIdValue,
    "Your earlier message is saved in this conversation.",
    "success",
  );
  return true;
}
async function loadMessages(scrollToBottom = false) {
  if (!selectedRequest || !selectedProvider || !chatVisible() || pagePaused)
    return;
  const request = selectedRequest,
    peerId = selectedProvider.id,
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
      $("messageInput").value = attempt.draftText;
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
    recipient = selectedProvider,
    input = $("messageInput");
  if (
    !request ||
    !recipient ||
    providerMap.get(request.request_id)?.id !== recipient.id ||
    recipient.id !== request.selected_provider_id ||
    !historyLoaded ||
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
      input.value = "";
      renderMessages(currentMessages, true);
    }
    const { error } = await supabase.from("internal_messages").insert(message);
    if (error) {
      keepFailedDraft(request, attempt, false);
      return;
    }
    pendingMessages.delete(request.request_id);
    retryMessages.delete(request.request_id);
    acknowledgedMessages.set(message.id, message);
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
    $("messageCharacterCount").textContent =
      `${$("messageInput").value.length} / 1,000`;
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
  phoneView.addEventListener("change", () => {
    updateComposerState();
    if (selectedRequest && selectedProvider && chatVisible())
      void loadMessages(false);
    else stopPolling();
    if (
      phoneView.matches &&
      document
        .querySelector(".conversation-panel")
        .contains(document.activeElement) &&
      chatVisible()
    )
      $("chatProviderName").focus({ preventScroll: true });
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("request_id");
    if (conversations.some((request) => request.request_id === id))
      selectConversation(id, { history: false });
    else {
      clearSelection();
      renderConversationList();
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
    if (phoneView.matches && document.activeElement === $("messageInput"))
      $("messageForm").scrollIntoView({ block: "nearest" });
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
