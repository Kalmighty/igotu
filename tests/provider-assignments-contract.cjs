/* Provider Assignments scope, permissions and unchanged workflow contracts. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "e4157b3dbac68dd75de1d54a76e28674fc2f1fa3",
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

const file = "igotu_v2/js/provider-assignment-details.js",
  js = read(file),
  previous = old(file);
for (const name of [
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
])
  assert.equal(norm(fn(js, name)), norm(fn(previous, name)), name);
assert(
  /providerRequests\(\s*\[\s*"confirmed",\s*"in_progress",\s*"completed",?\s*\]\s*,?\s*\)/.test(
    js,
  ),
  "original assignment scope",
);
assert(
  js.includes("r.selected_provider_id === currentUser.id") &&
    js.includes("statuses.includes(r.status)"),
  "defensive authorised set",
);
assert(
  !/URLSearchParams|location.search|provider_confirm_request|client_complete_request|provider_decline_request/.test(
    js,
  ),
  "no URL authority or unrelated transitions",
);
assert(js.includes("serviceParticipants(ids)"), "scoped participants");
assert(
  js.includes('.eq("reviewer_id", currentUser.id)') &&
    js.includes('.in("request_id", ids)'),
  "owned review history",
);
assert(
  js.includes(
    '"payment_id,request_id,client_id,provider_id,amount,payment_method,reference_number,created_at"',
  ),
  "existing safe payment columns",
);
assert(
  js.includes("prepareReceiptPreviews([p])") &&
    js.includes("receiptHtml(rows[0])") &&
    js.includes("bindReceiptButtons(preview, rows"),
  "existing private receipt module, selected only",
);
assert(!/proof_path|proof_url|signedUrl/.test(js), "no raw receipt fallback");
assert.equal(
  (js.match(/call\.retry\(false\)/g) || []).length,
  2,
  "two mutations disable SDK retry",
);
const mutation = fn(js, "reviewMutation");
assert(
  mutation.includes('.from("service_reviews").insert(payload)'),
  "original review insert",
);
assert(
  !/\.update\(|\.delete\(|\.upsert\(/.test(js.replaceAll("drafts.delete(key)", "")),
  "no direct status mutations",
);
assert.equal(
  read("tests/system-functional.cjs").replace(
    '  await page.locator("#confirmStartService").click();\n',
    "",
  ),
  old("tests/system-functional.cjs"),
  "existing assertions unchanged; only new dialog interaction",
);
const html = read("igotu_v2/provider/assignment-details.html"),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "icon " + id);
let count = 0;
const hash = (s) => createHash("sha256").update(s).digest("hex"),
  allowed = new Set([
    file,
    "igotu_v2/provider/assignment-details.html",
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
        p.startsWith("docs/provider-dashboard/") ||
        p.startsWith("docs/client-service-calendar/") ||
        p.startsWith("docs/provider-incoming-requests/")),
  )) {
  assert.equal(
    hash(fs.readFileSync(p)),
    hash(execFileSync("git", ["show", `${base}:${p}`])),
    p,
  );
  count++;
}
transformSync(js, { loader: "js" });
transformSync(read("igotu_v2/css/provider-assignments.css"), { loader: "css" });
fs.mkdirSync("docs/provider-assignments/validation", { recursive: true });
fs.writeFileSync(
  "docs/provider-assignments/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: count,
      authHelpers: 4,
      originalRpcAndReviewContracts: true,
      clientOnlyCompletion: true,
      scopedParticipantsAndPayments: true,
      privateReceiptModuleUnchanged: true,
      originalAssertionsUnchanged: true,
      noSqlChanges: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${count} protected files; original Auth, scoped RPC/review/payment contracts; private receipt module; Client-only completion; no SQL or unrelated-page changes; original functional assertions unchanged.`,
);
