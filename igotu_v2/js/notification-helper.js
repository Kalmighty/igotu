import { supabase } from "./supabaseClient.js";

export async function createNotification(userId, title, message) {
    if (!userId || !title || !message) return;

    const { error } = await supabase
        .from("notifications")
        .insert({
            user_id: userId,
            title: title,
            message: message,
            is_read: false
        });

    if (error) {
        console.error("Create notification error:", error);
    }
}
