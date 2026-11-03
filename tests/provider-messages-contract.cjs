/* Provider-only boundary against verified PR #27; no project/backend access. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "207e71577c27ec62e796fd734c251bf3ea30e64d",
  read = (p) => fs.readFileSync(p, "utf8"),
  old = (p) =>
    execFileSync("git", ["show", `${base}:${p}`], { encoding: "utf8" }),
  norm = (s) => transformSync(s, { loader: "js", minifyWhitespace: true }).code;
function fn(s, name) {
  const start = s.search(
    new RegExp("^(?:async )?function " + name + "\\(", "m"),
  );
  assert(start >= 0);
  let i = s.indexOf("{", start),
    depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === "{") depth++;
    if (s[i] === "}" && !--depth) return s.slice(start, i + 1);
  }
  throw Error(name);
}

const file = "igotu_v2/js/provider-messages.js",
  js = read(file),
  previous = old(file);
for (const name of [
  "generateUuid",
  "generateMessageId",
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
])
  assert.equal(norm(fn(js, name)), norm(fn(previous, name)), name);
assert(
  /providerRequests\(\s*\[\s*"provider_selected",\s*"confirmed",\s*"in_progress",\s*"completed",?\s*\]\s*,?\s*\)/.test(
    js,
  ),
  "original four statuses",
);
assert(
  js.includes("request.selected_provider_id === currentUser.id") &&
    js.includes("eligibleStatuses.includes(request.status)"),
  "defensive assigned eligible set",
);
assert(
  js.includes("person.request_id === request.request_id") &&
    js.includes("person.id === request.client_id") &&
    js.includes('person.role === "client"'),
  "participant request/id/role matching",
);
assert(!/\.from\("service_requests"\)/.test(js), "no raw request table access");
assert(
  !/request\.location|request\.client_lat|request\.client_lng|request\.description|request_image_url/.test(
    js,
  ),
  "no restricted request fields",
);
assert(
  js.includes('.eq("receiver_id", currentUser.id)') &&
    js.includes('.eq("sender_id", currentUser.id)') &&
    js.includes('.in("request_id", ids)'),
  "self scoped batch metadata",
);
assert(
  js.includes('.eq("request_id", requestIdValue)') &&
    js.includes('.in("sender_id", [currentUser.id, peerId])') &&
    js.includes('.in("receiver_id", [currentUser.id, peerId])'),
  "pair-scoped history",
);
const readUpdate = fn(js, "markMessagesAsRead");
for (const predicate of [
  ".update({ is_read: true })",
  '.eq("request_id", requestIdValue)',
  '.eq("receiver_id", currentUser.id)',
  '.eq("sender_id", peerId)',
  '.eq("is_read", false)',
  '.in("id", ids)',
  '.select("id")',
])
  assert(readUpdate.includes(predicate), predicate);
assert.equal(
  (js.match(/call\.retry\(false\)/g) || []).length,
  2,
  "message insert/read update SDK retry disabled",
);
assert(
  !/\.delete\(|\.upsert\(/.test(
    js.replace(
      /(?:drafts|retryMessages|pendingMessages|acknowledgedMessages|threadNotices|threadFetches|searchParams|unreadIds)\.delete\([^;]*?\)/g,
      "",
    ),
  ),
  "no message delete/upsert",
);
assert(
  !/supabase\.channel|setInterval|storage\.from/.test(js),
  "no realtime/storage/unbounded interval",
);
const test = read("tests/system-functional.cjs"),
  oldWait = '() => !document.querySelector("#sendMessageBtn").disabled,',
  newWait =
    '() => document.body.classList.contains("provider-messages") ? document.body.dataset.messageSending === "false" : !document.querySelector("#sendMessageBtn").disabled,';
assert.equal(test.split(newWait).length - 1, 4);
assert.equal(
  test.replaceAll(newWait, oldWait),
  old("tests/system-functional.cjs"),
  "all original assertions unchanged; only four completion waits reflect disabled empty Send",
);
const html = read("igotu_v2/provider/messages.html"),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "icon " + id);
assert(html.includes('maxlength="1000"'));
assert(!/input type="file"|attachment-btn|emoji-btn/.test(html));
let count = 0;
const hash = (s) => createHash("sha256").update(s).digest("hex"),
  allowed = new Set([
    file,
    "igotu_v2/provider/messages.html",
    "tests/system-functional.cjs",
  ]);
for (const p of execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(
    (p) =>
      !allowed.has(p) &&
      (p.startsWith("igotu_v2/") ||
        p.startsWith("tests/") ||
        p.endsWith(".sql") ||
        p.startsWith("docs/client-messages/") ||
        p.startsWith("docs/provider-assignments/") ||
        p.startsWith("docs/provider-incoming-requests/") ||
        p.startsWith("docs/provider-dashboard/") ||
        p.startsWith("docs/client-service-calendar/")),
  )) {
  assert.equal(
    hash(fs.readFileSync(p)),
    hash(execFileSync("git", ["show", `${base}:${p}`])),
    p,
  );
  count++;
}
transformSync(js, { loader: "js" });
transformSync(read("igotu_v2/css/provider-messages.css"), { loader: "css" });
fs.mkdirSync("docs/provider-messages/validation", { recursive: true });
fs.writeFileSync(
  "docs/provider-messages/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: count,
      originalAuthAndIdentifierHelpers: 6,
      assignedProviderOnly: true,
      scopedMetadataAndHistory: true,
      scopedReadAcknowledgements: true,
      textOnly1000: true,
      clientImplementationAndEvidenceUnchanged: true,
      originalAssertionsUnchanged: true,
      noSqlChanges: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${count} protected files; six Auth/identifier helpers; Provider-only eligibility/participants; pair-scoped history, owned metadata/read updates; unchanged Client implementation and original assertions; no SQL/shared module changes.`,
);
