import { supabase } from "./supabaseClient.js";

export async function createNotification(userId, title, message) {
    if (!userId || !title || !message) return;

    try {
        const { error } = await supabase.from("notifications").insert({
            user_id: userId, title, message, is_read: false,
        });
        if (error) return false;
        return true;
    } catch {
        // A best-effort browser notification must never turn a committed service
        // action into a retry or expose its private payload in a transport log.
        return false;
    }
}
