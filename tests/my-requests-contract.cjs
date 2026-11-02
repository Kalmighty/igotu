/* Source compatibility checks against reviewed PR #18. No network or database work. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const base = "b22ec7de716a991bcdaf522846a1e1e53db3b87d";
const file = "igotu_v2/js/client-my-requests.js";
const original = execFileSync("git", ["show", `${base}:${file}`], {
    encoding: "utf8",
  }),
  current = fs.readFileSync(file, "utf8");
const hash = (s) => createHash("sha256").update(s).digest("hex");
function definition(source, name) {
  const start = source.search(
    new RegExp(`^(?:async )?function ${name}\\(`, "m"),
  );
  assert(start >= 0, name);
  let i = source.indexOf("{", start),
    depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && !--depth) return source.slice(start, i + 1);
  }
  throw Error("Function not terminated: " + name);
}
const functions = [
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
];
const normalize = (s) =>
  transformSync(s, { loader: "js", minifyWhitespace: true }).code;
for (const name of functions)
  assert.equal(
    normalize(definition(current, name)),
    normalize(definition(original, name)),
    name + " changed",
  );
const ownedQuery =
  /supabase\s*\.from\("service_requests"\)\s*\.select\("\*"\)\s*\.eq\("client_id", currentUser\.id\)\s*\.order\("created_at", \{ ascending: false \}\)/;
assert(
  ownedQuery.test(current) && ownedQuery.test(original),
  "Original owned query changed",
);
assert(
  current.includes("askCancellationReason()"),
  "Shared reason dialog required",
);
assert.equal(
  (current.match(/supabase\.rpc\(/g) || []).length,
  1,
  "Only existing cancellation mutation permitted",
);
assert(
  /supabase\.rpc\("client_cancel_request", \{\s*p_request_id: requestId,\s*p_reason: cancellationReason,?\s*\}\)/.test(
    current,
  ),
  "Exact cancellation RPC contract",
);
assert(
  /const cancellableStatuses = \["pending", "provider_selected", "confirmed"\]/.test(
    current,
  ),
  "Cancellation status boundary",
);
assert(current.includes('request.status === "pending"'), "Edit pending gate");
new vm.Script(current.replace(/^import .*;\n/gm, ""), { filename: file });
const paths = [
  "igotu_v2/js/profile-guard.js",
  "igotu_v2/js/identity-access.js",
  "igotu_v2/js/backend-access.js",
  "igotu_v2/js/supabaseClient.js",
  "igotu_v2/js/app-shell.js",
  "igotu_v2/js/service-action-dialogs.js",
  "igotu_v2/js/html-safety.js",
  "igotu_v2/js/profile-menu.js",
  "igotu_v2/js/notification-menu.js",
  "igotu_v2/js/notification-badge.js",
  "igotu_v2/js/client.js",
  "igotu_v2/client/dashboard.html",
  "igotu_v2/css/client-dashboard.css",
  "igotu_v2/css/style.css",
  "igotu_v2/css/ui.css",
  "igotu_v2/client/create-request.html",
  "igotu_v2/js/client-create-request.js",
  "igotu_v2/js/client-create-request-ui.js",
  "igotu_v2/css/client-create-request.css",
  "igotu_v2/client/request-details.html",
  "igotu_v2/js/client-request-details.js",
];
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
const protectedPaths = [
  ...new Set([
    ...paths,
    ...tree.filter(
      (p) => p.endsWith(".sql") || /^igotu_v2\/(provider|admin)\//.test(p),
    ),
  ]),
];
const protectedFiles = [];
for (const p of protectedPaths) {
  const a = execFileSync("git", ["show", `${base}:${p}`]);
  const b = fs.readFileSync(p);
  assert.equal(hash(b), hash(a), "Protected file changed: " + p);
  protectedFiles.push({ path: p, sha256: hash(b) });
}
const html = fs.readFileSync("igotu_v2/client/my-requests.html", "utf8"),
  before = execFileSync(
    "git",
    ["show", `${base}:igotu_v2/client/my-requests.html`],
    { encoding: "utf8" },
  );
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML ids");
for (const [, id] of before.matchAll(/\bid="([^"]+)"/g))
  assert(ids.includes(id), "Existing id lost: " + id);
for (const [, id] of html.matchAll(/<label\s+for="([^"]+)"/g))
  assert(ids.includes(id), "Invalid label target: " + id);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "Missing icon symbol: " + id);
fs.mkdirSync("docs/my-requests/validation", { recursive: true });
fs.writeFileSync(
  "docs/my-requests/validation/contract.json",
  JSON.stringify(
    {
      base,
      unchangedAuthHelpers: functions,
      ownedQueryUnchanged: true,
      cancellationRPCUnchanged: true,
      protectedFiles,
      syntax: "PASS",
      html: "PASS",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS source contract: ${functions.length} normalized Auth/profile helpers, original owned query and cancellation RPC; ${protectedFiles.length} unchanged shared/prior-page/Provider/Admin/SQL files; JS syntax, original IDs, labels and icons.`,
);
