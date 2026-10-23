import { supabase } from "./supabaseClient.js";
import { createNotification } from "./notification-helper.js";

let currentUser = null;
let currentProfile = null;
let conversations = [];
let clientMap = new Map();
let selectedRequest = null;
let selectedClient = null;
let messageTimer = null;
let currentMessages = [];

function showMessage(message, type = "error") {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
}

function clearMessage() {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.className = "message-box hidden";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatStatus(status) {
    return status ? status.replace("_", " ") : "unknown";
}

function formatDateTime(value) {
    if (!value) return "";

    return new Date(value).toLocaleString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function generateMessageId() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `MSG-${Date.now()}-${randomPart}`;
}

function generateUuid() {
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(character) {
        const random = Math.random() * 16 | 0;
        const value = character === "x" ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });
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
    document.getElementById("userRole").textContent = `Provider · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
}

async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");

    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async function(event) {
        event.preventDefault();
        localStorage.removeItem("igotu_user");
        await supabase.auth.signOut();
        window.location.href = "../login.html";
    });
}

async function loadClients(requests) {
    const clientIds = [...new Set(
        requests
            .map(function(request) {
                return request.client_id;
            })
            .filter(Boolean)
    )];

    if (clientIds.length === 0) {
        clientMap = new Map();
        return;
    }

    const { data, error } = await supabase
        .from("users")
        .select("id, full_name, user_code, email")
        .in("id", clientIds);

    if (error) {
        console.error("Load clients error:", error);
        clientMap = new Map();
        return;
    }

    clientMap = new Map();

    (data || []).forEach(function(client) {
        clientMap.set(client.id, client);
    });
}

async function loadConversations() {
    const conversationList = document.getElementById("conversationList");

    conversationList.innerHTML = `<p class="muted-text">Loading conversations...</p>`;

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("selected_provider_id", currentUser.id)
        .in("status", ["provider_selected", "confirmed", "in_progress", "completed"])
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load conversations error:", error);
        conversationList.innerHTML = `<p class="muted-text">Unable to load conversations.</p>`;
        return;
    }

    conversations = data || [];
    await loadClients(conversations);
    renderConversationList();

    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("request_id");
    const requestedConversation = conversations.find(function(request) {
        return request.request_id === requestId;
    });

    if (requestedConversation) {
        selectConversation(requestedConversation.request_id);
        return;
    }

    if (conversations.length > 0) {
        selectConversation(conversations[0].request_id);
    }
}

function renderConversationList() {
    const conversationList = document.getElementById("conversationList");
    document.getElementById("conversationCount").textContent = conversations.length;

    if (conversations.length === 0) {
        conversationList.innerHTML = `
            <div class="empty-box">
                <h3>No conversations yet</h3>
                <p>A message thread will appear after a client selects you for a request.</p>
            </div>
        `;
        return;
    }

    conversationList.innerHTML = conversations.map(function(request) {
        const client = clientMap.get(request.client_id);
        const isActive = selectedRequest && selectedRequest.request_id === request.request_id;

        return `
            <button type="button" class="conversation-card ${isActive ? "active" : ""}" data-request-id="${escapeHtml(request.request_id)}">
                <div class="conversation-topline">
                    <span class="status-pill">${escapeHtml(formatStatus(request.status))}</span>
                    <span>${escapeHtml(request.request_id)}</span>
                </div>
                <h3>${escapeHtml(request.title)}</h3>
                <p>${client ? escapeHtml(client.full_name) : "Client unavailable"}</p>
            </button>
        `;
    }).join("");

    document.querySelectorAll(".conversation-card").forEach(function(button) {
        button.addEventListener("click", function() {
            selectConversation(this.dataset.requestId);
        });
    });
}

function selectConversation(requestId) {
    selectedRequest = conversations.find(function(request) {
        return request.request_id === requestId;
    });

    if (!selectedRequest) return;

    selectedClient = clientMap.get(selectedRequest.client_id);

    renderConversationList();
    renderChatHeader();
    currentMessages = [];
    document.getElementById("messagesList").innerHTML = `<p class="muted-text">Loading messages...</p>`;
    loadMessages(true);

    if (messageTimer) {
        clearInterval(messageTimer);
    }

    messageTimer = setInterval(function() {
        loadMessages(false);
    }, 3000);
}

function renderChatHeader() {
    document.getElementById("chatEmptyState").classList.add("hidden");
    document.getElementById("chatArea").classList.remove("hidden");
    document.getElementById("chatRequestTitle").textContent = `${selectedRequest.request_id} · ${selectedRequest.title}`;
    document.getElementById("chatReceiverInfo").textContent = selectedClient
        ? `Client: ${selectedClient.full_name} · ${selectedClient.user_code}`
        : "Client information unavailable";
    document.getElementById("chatStatus").textContent = formatStatus(selectedRequest.status);
}

function renderMessages(messages) {
    const messagesList = document.getElementById("messagesList");

    if (messages.length === 0) {
        messagesList.innerHTML = `
            <div class="empty-box">
                <h3>No messages yet</h3>
                <p>Start the conversation with the client.</p>
            </div>
        `;
        return;
    }

    const bubbles = messages.map(function(message) {
        const bubble = document.createElement("div");
        bubble.className = message.sender_id === currentUser.id
            ? "message-bubble mine"
            : "message-bubble other";

        const text = document.createElement("p");
        text.textContent = message.message_text ?? "";

        const time = document.createElement("span");
        time.className = "message-time";
        time.textContent = formatDateTime(message.created_at);

        bubble.append(text, time);
        return bubble;
    });
    messagesList.replaceChildren(...bubbles);
}

async function markMessagesAsRead() {
    if (!selectedRequest) return;

    const { error } = await supabase
        .from("internal_messages")
        .update({ is_read: true })
        .eq("request_id", selectedRequest.request_id)
        .eq("receiver_id", currentUser.id)
        .eq("is_read", false);

    if (error) {
        console.error("Mark messages read error:", error);
    }
}

async function loadMessages(scrollToBottom = false) {
    if (!selectedRequest) return;

    const messagesList = document.getElementById("messagesList");

    const { data, error } = await supabase
        .from("internal_messages")
        .select("*")
        .eq("request_id", selectedRequest.request_id)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Load messages error:", error);
        messagesList.innerHTML = `<p class="muted-text">Unable to load messages.</p>`;
        return;
    }

    currentMessages = data || [];
    renderMessages(currentMessages);

    await markMessagesAsRead();

    if (scrollToBottom) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

async function sendMessage(event) {
    event.preventDefault();
    clearMessage();

    if (!selectedRequest || !selectedClient) {
        showMessage("Please select a conversation first.");
        return;
    }

    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendMessageBtn");
    const messageText = messageInput.value.trim();

    if (!messageText) {
        showMessage("Please type a message.");
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";

    const newMessage = {
        id: generateUuid(),
        message_id: generateMessageId(),
        request_id: selectedRequest.request_id,
        sender_id: currentUser.id,
        receiver_id: selectedClient.id,
        message_text: messageText,
        is_read: false,
        created_at: new Date().toISOString()
    };

    currentMessages = [...currentMessages, newMessage];
    renderMessages(currentMessages);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
    messageInput.value = "";

    const { error } = await supabase
        .from("internal_messages")
        .insert(newMessage);

    if (error) {
        console.error("Send message error:", error);
        currentMessages = currentMessages.filter(function(message) {
            return message.message_id !== newMessage.message_id;
        });
        renderMessages(currentMessages);
        showMessage(error.message || "Failed to send message.");
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        return;
    }

    await createNotification(
        selectedClient.id,
        "New message",
        `${currentProfile.full_name} sent you a message about "${selectedRequest.title}".`
    );

    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
    setTimeout(function() {
        loadMessages(true);
    }, 400);
}

document.addEventListener("DOMContentLoaded", async function() {
    currentUser = await getSessionUser();
    if (!currentUser) return;

    currentProfile = await getProfile(currentUser.id);
    if (!currentProfile) return;

    displayUser(currentProfile);
    handleLogout();

    const messageForm = document.getElementById("messageForm");
    if (messageForm) {
        messageForm.addEventListener("submit", sendMessage);
    }

    loadConversations();
});
