/* Source compatibility/security boundaries against reviewed PR #20. Offline only. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm");
const { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "ad96900331668a33d775f36b1822f275c89788e0",
  file = "igotu_v2/js/client-messages.js";
const old = execFileSync("git", ["show", base + ":" + file], {
    encoding: "utf8",
  }),
  current = fs.readFileSync(file, "utf8");
const normalize = (s) =>
  transformSync(s, { loader: "js", minifyWhitespace: true }).code;
function definition(s, name) {
  const start = s.search(
    new RegExp("^(?:async )?function " + name + "\\(", "m"),
  );
  assert(start >= 0, name);
  let i = s.indexOf("{", start),
    depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === "{") depth++;
    if (s[i] === "}" && !--depth) return s.slice(start, i + 1);
  }
  throw Error(name);
}
const unchanged = [
  "generateMessageId",
  "generateUuid",
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
];
for (const name of unchanged)
  assert.equal(
    normalize(definition(current, name)),
    normalize(definition(old, name)),
    name + " changed",
  );
function clause(s, pattern, label) {
  const m = s.match(pattern);
  assert(m, label);
  return normalize("const q = " + m[0] + ";");
}
const requestPattern =
  /supabase\s*\.from\("service_requests"\)\s*\.select\("\*"\)\s*\.eq\("client_id", currentUser.id\)\s*\.not\("selected_provider_id", "is", null\)\s*\.in\("status", \[\s*"provider_selected",\s*"confirmed",\s*"in_progress",\s*"completed",?\s*\]\)\s*\.order\("created_at", \{ ascending: false \}\)/;
assert.equal(
  clause(current, requestPattern, "owned eligibility query"),
  clause(old, requestPattern, "reviewed eligibility query"),
);
const compact = current.replace(/\s/g, "");
assert(
  compact.includes('.in("sender_id",[currentUser.id,peerId])') &&
    compact.includes('.in("receiver_id",[currentUser.id,peerId])'),
  "message pair restrictions",
);
assert(
  compact.includes('.eq("request_id",requestIdValue)'),
  "request-scoped message query",
);
const readPattern =
  /supabase\s*\.from\("internal_messages"\)\s*\.update\(\{ is_read: true \}\)\s*\.eq\("request_id", requestIdValue\)\s*\.eq\("receiver_id", currentUser.id\)\s*\.eq\("sender_id", peerId\)\s*\.eq\("is_read", false\)/;
assert.equal(
  clause(current, readPattern, "receiver read update"),
  clause(old, readPattern, "reviewed read update"),
);
const payloadPattern =
  /\{\s*id: generateUuid\(\),[\s\S]*?created_at: new Date\(\)\.toISOString\(\),?\s*\}/;
assert.equal(
  clause(current, payloadPattern, "insert payload"),
  clause(old, payloadPattern, "reviewed payload"),
);
assert(
  compact.includes('.from("internal_messages").insert(message)'),
  "original insert",
);
assert(
  !/supabase\.rpc|\.storage|\.upsert\(/.test(current),
  "new backend operation",
);
assert(
  current.includes("const drafts = new Map()"),
  "in-memory drafts retained",
);
assert(
  current.includes('text.textContent = message.message_text ?? ""'),
  "safe message rendering",
);
new vm.Script(current.replace(/^import .*;\n/gm, ""), { filename: file });
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
const protectedPaths = tree.filter(
  (p) =>
    (p.startsWith("igotu_v2/") &&
      !["igotu_v2/client/messages.html", file].includes(p)) ||
    p.endsWith(".sql"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex"),
  protectedFiles = [];
for (const p of protectedPaths) {
  const a = execFileSync("git", ["show", base + ":" + p]),
    b = fs.readFileSync(p);
  assert.equal(hash(a), hash(b), "Protected file changed " + p);
  protectedFiles.push({ path: p, sha256: hash(b) });
}
const html = fs.readFileSync("igotu_v2/client/messages.html", "utf8"),
  oldHtml = execFileSync(
    "git",
    ["show", base + ":igotu_v2/client/messages.html"],
    { encoding: "utf8" },
  );
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "Duplicate IDs");
for (const [, id] of oldHtml.matchAll(/\bid="([^"]+)"/g))
  assert(ids.includes(id), "Original ID lost " + id);
for (const [, id] of html.matchAll(/<label for="([^"]+)"/g))
  assert(ids.includes(id), "Missing label target");
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "Missing icon");
assert(/maxlength="1000"/.test(html), "Composer limit");
assert(!/type="file"/.test(html), "Unsupported attachments");
fs.mkdirSync("docs/client-messages/validation", { recursive: true });
fs.writeFileSync(
  "docs/client-messages/validation/contract.json",
  JSON.stringify(
    {
      base,
      unchangedNormalizedHelpers: unchanged,
      ownedEligibilityQuery: true,
      pairQuery: true,
      receiverReadUpdate: true,
      insertPayload: true,
      protectedFiles,
      syntax: true,
      idsLabelsIcons: true,
    },
    null,
    2,
  ) + "\n",
);
// Refinement boundary: only the reviewed page stylesheet and counter call sites
// may change in application code. Shared/other-page files remain byte-identical.
const reviewedRefinement = "8b361180eac2b991f0966775d1d47c30c797a681";
const reviewedSource = execFileSync(
  "git",
  ["show", reviewedRefinement + ":" + file],
  { encoding: "utf8" },
);
const counterCallSites = new Set([
  "selectConversation",
  "updateComposerState",
  "reconcileRetry",
  "keepFailedDraft",
  "sendMessage",
  "setupMessagingUI",
]);
const stableFunctions = [
  ...reviewedSource.matchAll(/^(?:async )?function (\w+)\(/gm),
]
  .map((m) => m[1])
  .filter((name) => !counterCallSites.has(name));
for (const name of stableFunctions)
  assert.equal(
    normalize(definition(current, name)),
    normalize(definition(reviewedSource, name)),
    "Refinement changed " + name,
  );
assert.equal(
  (current.match(/\$\("messageInput"\)\.value = value;/g) || []).length,
  1,
  "one programmatic value setter",
);
assert(
  !/input\.value =|\$\("messageInput"\)\.value = (?!value;)/.test(current),
  "textarea changes must use synchronised setter",
);
const refinementPaths = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", reviewedRefinement],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(
    (p) =>
      (p.startsWith("igotu_v2/") &&
        ![file, "igotu_v2/css/client-messages.css"].includes(p)) ||
      p.endsWith(".sql"),
  );
for (const p of refinementPaths)
  assert.equal(
    hash(fs.readFileSync(p)),
    hash(execFileSync("git", ["show", reviewedRefinement + ":" + p])),
    "Refinement protected file changed " + p,
  );
fs.mkdirSync("docs/client-messages/refinement", { recursive: true });
fs.writeFileSync(
  "docs/client-messages/refinement/source-contract.json",
  JSON.stringify(
    {
      reviewed: reviewedRefinement,
      stableFunctions,
      protectedFiles: refinementPaths.length,
      synchronisedSetter: true,
      originalBackendContracts: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS refinement: ${stableFunctions.length} unchanged functions; ${refinementPaths.length} protected application/SQL files; one synchronised textarea setter.`,
);
console.log(
  `PASS six normalized identity/Auth/profile helpers; original eligibility/pair/read-update/insert contracts; ${protectedFiles.length} protected application/SQL files; syntax/IDs/labels/icons/limit.`,
);
