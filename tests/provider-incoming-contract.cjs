/* Incoming Requests scope and frontend authority boundary against PR #25. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "6895c094d8a05e432512f930ef27d43ec2322906",
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

const file = "igotu_v2/js/provider-incoming-requests.js",
  js = read(file),
  previous = old(file);
for (const name of [
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
])
  assert.equal(norm(fn(js, name)), norm(fn(previous, name)), name);
const projection = fn(js, "project");
assert(
  !/location|client_lat|client_lng|description|image_url/.test(
    projection.replace(/\/\/[^\n]*/g, ""),
  ),
  "private projection",
);
assert(
  js.includes("r.selected_provider_id === currentUser.id") &&
    js.includes('r.status === "provider_selected"'),
  "defensive assignment/status check",
);
assert(
  js.includes('await providerRequests(["provider_selected"])'),
  "original incoming read",
);
assert(
  js.includes("await providerRequests(null, op.id)"),
  "status read scoped to known operation ID",
);
assert(
  js.includes("serviceParticipants(requests.map((r) => r.id))"),
  "scoped participants",
);
assert(
  !/innerHTML|insertAdjacentHTML|URLSearchParams|location.search|request_image_url/.test(
    js,
  ),
  "unsafe/private/URL inputs",
);
assert(
  js.includes("call.retry(false)"),
  "pinned SDK automatic mutation retries disabled",
);
assert(
  js.includes("await askDeclineReason()"),
  "existing decline reason dialog",
);
assert(
  !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(js),
  "direct mutation query",
);
const html = read("igotu_v2/provider/incoming-requests.html"),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "unique IDs");
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "icon " + id);
assert.equal(
  read("tests/system-functional.cjs").replace(
    '  await page.locator("#submitIncomingConfirm").click();\n',
    "",
  ),
  old("tests/system-functional.cjs"),
  "original 94 assertions unchanged; one dialog step added",
);
let count = 0;
const hash = (s) => createHash("sha256").update(s).digest("hex"),
  allowed = new Set([
    file,
    "igotu_v2/provider/incoming-requests.html",
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
transformSync(read("igotu_v2/css/provider-incoming-requests.css"), {
  loader: "css",
});
fs.mkdirSync("docs/provider-incoming-requests/validation", { recursive: true });
fs.writeFileSync(
  "docs/provider-incoming-requests/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: count,
      authHelpers: 4,
      originalRpcSignatures: true,
      coarseOnly: true,
      scopedParticipants: true,
      noSqlChanges: true,
      original94AssertionsUnchanged: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${count} protected files; four Auth/profile helpers; original RPC contracts; coarse-only projection; scoped participants; original 94 assertions unchanged; no SQL or unrelated page changes.`,
);
