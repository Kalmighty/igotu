// For text nodes and quoted attributes inside existing HTML templates.
// Escape values at the rendering boundary; keep trusted layout markup intact.
export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Stored attachment links must be web URLs, never executable schemes.
// Local file previews use browser-created object URLs separately.
export function safeUrl(value) {
    try {
        const url = new URL(String(value ?? ""));
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}
