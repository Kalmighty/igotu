import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

async function updateNotificationBadge() {
    const badges = document.querySelectorAll(".notification-badge");

    if (!badges.length) return;

    const { data } = await supabase.auth.getSession();

    if (!data.session) return;

    const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.session.user.id)
        .eq("is_read", false);

    if (error) {
        console.error("Notification badge error:", error);
        return;
    }

    badges.forEach(function(badge) {
        if (count && count > 0) {
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.classList.remove("hidden");
        } else {
            badge.textContent = "0";
            badge.classList.add("hidden");
        }
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    if (!(await authorizeWorkspace()).allowed) return;
    updateNotificationBadge();
    setInterval(updateNotificationBadge, 30000);
});
