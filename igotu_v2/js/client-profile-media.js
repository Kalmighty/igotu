import { supabase } from "./supabaseClient.js";
export const MEDIA_BUCKET = "client-profile-media";
export const AVATARS = Array.from({ length: 12 }, (_, i) => ({
  id: `avatar-${String(i + 1).padStart(2, "0")}`,
  label: [
    "Fern",
    "River",
    "Cedar",
    "Amber",
    "Sage",
    "Olive",
    "Willow",
    "Jade",
    "Smile",
    "Diamond",
    "Leaf",
    "Orbit",
  ][i],
}));
export const BANNERS = [
  "Forest waves",
  "Mint geometry",
  "Botanical leaves",
  "Soft gradient",
  "Mountain morning",
  "Circles and curves",
  "Clean lines",
  "Forest professional",
].map((label, i) => ({
  id: `banner-${String(i + 1).padStart(2, "0")}`,
  label,
}));
export const COLORS = {
  forest: "#075c36",
  mint: "#dcefd5",
  sage: "#9ccba3",
  cream: "#fafaf6",
  deep: "#063f2a",
};
export const PATTERNS = ["solid", "gradient", "circles", "diagonal"];
export const defaults = () => ({
  avatar_mode: "initial",
  avatar_value: null,
  banner_mode: "default",
  banner_value: null,
  banner_design: null,
});
export const asset = (kind, id) =>
  `../assets/client-edit-profile/${kind}/${id}.svg`;
export function validPath(path, uid, kind) {
  return (
    typeof path === "string" &&
    new RegExp(`^${uid}/${kind}/[0-9a-f-]{36}\\.webp$`).test(path)
  );
}
export function settingsOf(value, uid) {
  const v = value || defaults();
  const result = { ...defaults(), ...v };
  if (
    !["initial", "template", "upload"].includes(result.avatar_mode) ||
    !["default", "template", "upload", "custom"].includes(result.banner_mode)
  )
    throw Error("Invalid profile appearance response.");
  for (const k of ["avatar", "banner"]) {
    const mode = result[k + "_mode"],
      val = result[k + "_value"];
    if (
      mode === "template" &&
      !(k === "avatar" ? AVATARS : BANNERS).some((t) => t.id === val)
    )
      throw Error("Unknown profile template.");
    if (mode === "upload" && !validPath(val, uid, k))
      throw Error("Invalid private media path.");
    if (["initial", "default", "custom"].includes(mode))
      result[k + "_value"] = null;
  }
  if (result.banner_mode === "custom") {
    const d = result.banner_design;
    if (
      !d ||
      !Object.hasOwn(COLORS, d.color) ||
      !Object.hasOwn(COLORS, d.accent) ||
      !PATTERNS.includes(d.pattern) ||
      Object.keys(d).sort().join() !== "accent,color,pattern"
    )
      throw Error("Invalid banner design.");
    result.banner_design = {
      color: d.color,
      accent: d.accent,
      pattern: d.pattern,
    };
  } else result.banner_design = null;
  return Object.fromEntries(Object.keys(defaults()).map((k) => [k, result[k]]));
}
export async function readMedia(uid) {
  const { data, error } = await supabase.rpc("get_client_profile_media");
  if (
    error ||
    !data ||
    data.user_id !== uid ||
    !Number.isSafeInteger(data.version) ||
    data.version < 0
  )
    throw Error(
      "Profile appearance is unavailable. Personal information can still be saved.",
    );
  return {
    ...settingsOf(data, uid),
    version: data.version,
    last_operation_id: data.last_operation_id || null,
    user_id: uid,
  };
}
export function paintBanner(node, settings, url = "") {
  node.style.backgroundImage = "";
  node.style.backgroundColor = "";
  if (settings.banner_mode === "custom") {
    const { color, accent, pattern } = settings.banner_design,
      a = COLORS[color],
      b = COLORS[accent];
    node.style.backgroundColor = a;
    node.style.backgroundImage =
      pattern === "solid"
        ? "none"
        : pattern === "gradient"
          ? `linear-gradient(120deg,${a},${b})`
          : pattern === "circles"
            ? `radial-gradient(circle at 20% 30%,${b} 0 15%,transparent 15.5%),radial-gradient(circle at 80% 90%,${b} 0 30%,transparent 30.5%)`
            : `repeating-linear-gradient(135deg,${a} 0 55px,${b} 55px 110px)`;
  } else {
    const src =
      settings.banner_mode === "upload"
        ? url
        : asset(
            "banners",
            settings.banner_mode === "template"
              ? settings.banner_value
              : "banner-01",
          );
    if (src) node.style.backgroundImage = `url("${src}")`;
  }
}
export async function signedMedia(path) {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl)
    throw Error("Private image preview could not be loaded.");
  const url = new URL(data.signedUrl, location.origin);
  // Only the trusted Storage response supplies URLs; persisted settings never do.
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("Invalid private image response.");
  return url.href;
}
