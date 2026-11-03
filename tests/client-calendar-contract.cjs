/* Phase B preserves the completed Provider implementation and approved Client UI. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "8dc79c84b96046a43e09cd95144c231fc189772a",
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

const file = "igotu_v2/js/client.js",
  js = read(file),
  previous = old(file);
for (const name of [
  "getSessionUser",
  "getProfile",
  "displayUser",
  "requestCards",
  "renderRequests",
  "setupDashboard",
  "setupDashboardDialog",
])
  assert.equal(norm(fn(js, name)), norm(fn(previous, name)), name);
let loader = fn(js, "loadStats")
  .replace(/  serviceCalendar\?\.setLoading\(\);\n/, "")
  .replace(
    /    serviceCalendar\?\.setRequests\(calendarRequests\(requests, userId\)\);\n/,
    "",
  )
  .replace(/    serviceCalendar\?\.setError\(\);\n/, "");
assert.equal(
  norm(loader),
  norm(fn(previous, "loadStats")),
  "original owned query, statistics, refresh and error behavior",
);
const html = "igotu_v2/client/dashboard.html";
assert.equal(
  read(html)
    .replace(
      '    <link rel="stylesheet" href="../css/service-calendar.css" />\n',
      "",
    )
    .replace(
      '          <section id="clientServiceCalendar" aria-label="Client Service Calendar" style="margin-top: 24px"></section>\n',
      "",
    ),
  old(html),
  "only calendar stylesheet and section added to approved HTML",
);
const projection = fn(js, "calendarRequests");
assert(projection.includes("r.client_id === userId"));
assert(projection.includes("encodeURIComponent(r.request_id)"));
assert(
  !/location|client_lat|client_lng|selected_provider_id|description|image_url/.test(
    projection,
  ),
  "calendar restricted projection",
);
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
    encoding: "utf8",
  })
    .trim()
    .split("\n"),
  hash = (s) => createHash("sha256").update(s).digest("hex");
let count = 0;
for (const p of tree.filter(
  (p) =>
    p !== file &&
    p !== html &&
    (p.startsWith("igotu_v2/") ||
      p.startsWith("tests/") ||
      p.startsWith("docs/provider-dashboard/") ||
      p.endsWith(".sql")),
)) {
  assert.equal(
    hash(fs.readFileSync(p)),
    hash(execFileSync("git", ["show", `${base}:${p}`])),
    p,
  );
  count++;
}
transformSync(js, { loader: "js" });
fs.mkdirSync("docs/client-service-calendar/validation", { recursive: true });
fs.writeFileSync(
  "docs/client-service-calendar/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: count,
      originalClientLoader: true,
      ownedCalendarProjection: true,
      encodedExistingDetailsRoute: true,
      providerAndSharedCalendarUnchanged: true,
      clientHtmlAdditionsOnly: true,
      noSqlChanges: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${count} protected files, unchanged Provider/shared calendar, Client helpers, owned query/statistics/error behavior, approved HTML plus only two calendar additions; no SQL changes.`,
);
