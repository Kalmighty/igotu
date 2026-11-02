import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";
import { readMedia, asset, signedMedia } from "./client-profile-media.js";
let stopped = false,
  timer,
  version = 0,
  observer,
  channel;
async function start() {
  const access = await authorizeWorkspace();
  if (!access.allowed || access.profile?.role !== "client") return;
  const uid = access.profile.id,
    avatar = document.getElementById("avatar"),
    dropdown = document.getElementById("profileDropdown");
  if (!avatar || !dropdown) return;
  const row = document.createElement("div");
  row.className = "profile-media-summary";
  const mini = document.createElement("span");
  mini.className = "profile-media-avatar";
  mini.setAttribute("aria-hidden", "true");
  const name = document.createElement("strong");
  row.append(mini, name);
  dropdown.prepend(row);
  let url = "",
    failed = "";
  function paint() {
    if (stopped) return;
    const fullName =
      document.getElementById("userName")?.textContent ||
      access.profile.full_name ||
      "Client";
    name.textContent = fullName;
    const initial = Array.from(fullName.trim())[0]?.toUpperCase() || "?";
    for (const node of [avatar, mini]) {
      const existing = node.querySelector("img");
      if (url && url !== failed) {
        if (existing?.getAttribute("src") === url) continue;
        const img = new Image();
        img.className = "profile-media-image";
        img.alt = "";
        img.src = url;
        img.onerror = () => {
          failed = url;
          paint();
        };
        node.replaceChildren(img);
      } else if (node.textContent !== initial || existing)
        node.textContent = initial;
    }
  }
  async function refresh() {
    const mine = ++version;
    clearTimeout(timer);
    try {
      const media = await readMedia(uid);
      const next =
        media.avatar_mode === "template"
          ? asset("avatars", media.avatar_value)
          : media.avatar_mode === "upload"
            ? await signedMedia(media.avatar_value)
            : "";
      if (stopped || mine !== version) return;
      failed = "";
      url = next;
      paint();
    } catch {
      if (stopped || mine !== version) return;
      url = "";
      paint();
    }
    if (!stopped) timer = setTimeout(refresh, 240000);
  }
  observer = new MutationObserver(() => paint());
  observer.observe(avatar, { childList: true });
  const userName = document.getElementById("userName");
  if (userName) observer.observe(userName, { childList: true });
  document.addEventListener("igotu:profile-media-saved", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !stopped) void refresh();
  });
  try {
    channel = new BroadcastChannel(`igotu-profile-media-${uid}`);
    channel.onmessage = () => void refresh();
  } catch {}
  supabase.auth.onAuthStateChange?.((event) => {
    if (event === "SIGNED_OUT") stop();
  });
  function stop() {
    stopped = true;
    version++;
    clearTimeout(timer);
    observer?.disconnect();
    channel?.close();
    url = "";
    avatar.textContent = "?";
    mini.textContent = "?";
  }
  window.addEventListener("pagehide", stop, { once: true });
  paint();
  void refresh();
}
document.addEventListener("DOMContentLoaded", () => void start());
