/* Phase A boundary against reviewed PR #23; no live service or SQL access. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "7d128948a8da9f2d977cbeb5ca53696e6bc11571",
  file = "igotu_v2/js/provider.js",
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
const js = read(file),
  previous = old(file);
for (const name of ["getSessionUser", "getProfile", "handleLogout"])
  assert.equal(norm(fn(js, name)), norm(fn(previous, name)), name);
assert(js.includes("await providerRequests(null)"), "original Provider RPC");
const review =
  /supabase\s*\.from\("service_reviews"\)\s*\.select\("rating"\)\s*\.eq\("reviewee_id", userId\)/;
assert.equal(
  norm("const q=" + js.match(review)[0]),
  norm("const q=" + previous.match(review)[0]),
  "review query",
);
assert(
  js.includes("r.selected_provider_id === userId"),
  "defensive selected Provider restriction",
);
assert(
  !/request\.location|request\.client_lat|request\.client_lng|request\.description|request\.request_image_url/.test(
    js,
  ),
  "restricted fields used",
);
assert(
  !/\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(js),
  "dashboard mutation",
);
const calendar = read("igotu_v2/js/service-calendar.js");
assert(
  !/supabase|fetch\(|XMLHttpRequest|\.rpc\(|\.from\(/.test(calendar),
  "calendar network access",
);
assert(!/innerHTML|insertAdjacentHTML/.test(calendar), "unsafe event HTML");
const html = read("igotu_v2/provider/dashboard.html"),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "unique IDs");
for (const [, id] of old("igotu_v2/provider/dashboard.html").matchAll(
  /\bid="([^"]+)"/g,
))
  assert(ids.includes(id), "original ID lost " + id);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "missing icon " + id);
assert(!html.includes('href="assignments.html"'), "nonexistent route");
const allowed = new Set([
  file,
  "igotu_v2/provider/dashboard.html",
  "tests/ui-smoke.cjs",
]);
assert.equal(
  read("tests/ui-smoke.cjs").replace("'service-calendar.js',", ""),
  old("tests/ui-smoke.cjs"),
  "existing layout assertions changed",
);
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
let count = 0;
const hash = (s) => createHash("sha256").update(s).digest("hex");
for (const p of tree.filter(
  (p) =>
    !allowed.has(p) &&
    (p.startsWith("igotu_v2/") || p.startsWith("tests/") || p.endsWith(".sql")),
)) {
  assert.equal(
    hash(fs.readFileSync(p)),
    hash(execFileSync("git", ["show", `${base}:${p}`])),
    p,
  );
  count++;
}
for (const f of [file, "igotu_v2/js/service-calendar.js"])
  new vm.Script(
    read(f)
      .replace(/^import[\s\S]*?from "[^"\n]+";\n/gm, "")
      .replace(/^export /gm, ""),
    { filename: f },
  );
for (const p of [
  "igotu_v2/css/service-calendar.css",
  "igotu_v2/css/provider-dashboard.css",
])
  transformSync(read(p), { loader: "css" });
fs.mkdirSync("docs/provider-dashboard/validation", { recursive: true });
fs.writeFileSync(
  "docs/provider-dashboard/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: count,
      authHelpers: 3,
      providerRpc: true,
      reviewQuery: true,
      coarseAreaOnly: true,
      readOnlyCalendar: true,
      noSqlChanges: true,
      syntax: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${count} protected app/test/SQL files; three Provider Auth helpers and authorised request/review contracts; coarse-area-only rendering; no calendar network calls or mutations; IDs/icons/JS/CSS syntax.`,
);
