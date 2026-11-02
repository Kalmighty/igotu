/* Source compatibility proof against approved PR #22; no backend or SQL execution. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { transformSync } = require("esbuild");
const base = "4a3630d8dedb6b93dc9e322fc0a71a3fe0cd36c4",
  file = "igotu_v2/js/verification.js";
const read = (p) => fs.readFileSync(p, "utf8"),
  old = (p) =>
    execFileSync("git", ["show", `${base}:${p}`], { encoding: "utf8" }),
  norm = (s) => transformSync(s, { loader: "js", minifyWhitespace: true }).code;
const current = read(file),
  previous = old(file);
function block(s, start) {
  let i = s.indexOf("{", start),
    depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === "{") depth++;
    if (s[i] === "}" && !--depth) return s.slice(start, i + 1);
  }
  throw Error("Missing block");
}
function fn(s, name) {
  const i = s.search(new RegExp("^(?:async )?function " + name + "\\(", "m"));
  assert(i >= 0, name);
  return block(s, i);
}
const stable = [
  "validateFile",
  "extensionFor",
  "uploadPrivateFile",
  "humanFileSize",
  "resetFilePreview",
  "renderFilePreview",
];
for (const name of stable)
  assert.equal(norm(fn(current, name)), norm(fn(previous, name)), name);
for (const pattern of [
  /supabase\s*\.from\("users"\)[\s\S]*?\.single\(\)/,
  /supabase\s*\.from\("verification_requests"\)\s*\.select\([\s\S]*?\.limit\(1\)/,
]) {
  const a = current.match(pattern),
    b = previous.match(pattern);
  assert(a && b);
  assert.equal(
    norm("const q=" + a[0]),
    norm("const q=" + b[0]),
    "owned query changed",
  );
}
const payload = (s) => block(s, s.indexOf("const payload ="));
assert.equal(
  norm(payload(current)),
  norm(payload(previous)),
  "insert payload changed",
);
const provider = (s) =>
  block(s, s.indexOf('if (currentProfile.role === "provider")'));
assert.equal(
  norm(provider(current)),
  norm(provider(previous)),
  "provider optional payload changed",
);
assert.equal(
  current.match(/const MAX_FILE_SIZE =[^;]+;/)[0],
  previous.match(/const MAX_FILE_SIZE =[^;]+;/)[0],
);
assert.equal(
  current.match(/const ALLOWED_TYPES =[^;]+;/)[0],
  previous.match(/const ALLOWED_TYPES =[^;]+;/)[0],
);
assert(
  current.includes("isIdentityApproved(currentProfile, latestRequest)"),
  "approval predicate",
);
assert(
  !/console\.|\.getPublicUrl\(|\.rpc\(/.test(current),
  "logging or new backend API",
);
assert(
  current.includes("!committed && !uncertain && pathsToRemove.length"),
  "uncertain insert cannot delete a possibly referenced document",
);
assert(
  current.includes(
    "if (refreshInProgress || (submissionInProgress && !options.afterSubmission))",
  ),
  "refresh lock",
);
const allowed = new Set([
  file,
  "igotu_v2/css/verification-access.css",
  "igotu_v2/client/verification.html",
  "igotu_v2/provider/verification.html",
]);
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
let protectedFiles = 0;
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
  protectedFiles++;
}
const css = read("igotu_v2/css/verification-access.css"),
  cssBefore = old("igotu_v2/css/verification-access.css");
assert(css.startsWith(cssBefore), "original CSS/Admin rules changed");
const tail = css.slice(cssBefore.length);
assert(
  !tail.includes(".verification-review-dialog") &&
    !tail.includes(".verification-admin-page"),
  "Admin selector added",
);
transformSync(css, { loader: "css" });
const inputs = (s) =>
  [...s.matchAll(/<(input|select)\b[^>]*>/g)]
    .map((m) => ({
      id: m[0].match(/\bid="([^"]+)"/)?.[1],
      type: m[0].match(/\btype="([^"]+)"/)?.[1] || m[1],
      required: /\brequired\b/.test(m[0]),
      accept: m[0].match(/\baccept="([^"]+)"/)?.[1] || "",
    }))
    .filter((x) => x.id);
for (const role of ["client", "provider"]) {
  const p = `igotu_v2/${role}/verification.html`,
    html = read(p),
    before = old(p),
    ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate IDs");
  for (const [, id] of before.matchAll(/\bid="([^"]+)"/g))
    assert(ids.includes(id), "original ID lost " + id);
  for (const [, id] of html.matchAll(/<label[^>]*for="([^"]+)"/g))
    assert(ids.includes(id), "label target " + id);
  assert.deepEqual(
    inputs(html),
    inputs(before),
    "fields/types/required/accept changed " + role,
  );
  assert(!/<input[^>]*\bchecked\b/.test(html), "preselected consent");
  const privacy = (s) =>
    s
      .match(/<div class="verification-privacy-box">([\s\S]*?)<\/div>/)[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  assert.equal(privacy(html), privacy(before), "English/Malay privacy changed");
  assert(
    html.includes("verification-onboarding") &&
      !html.includes('class="sidebar"'),
    "onboarding scope",
  );
}
new vm.Script(current.replace(/^import .*;\n/gm, ""), { filename: file });
fs.mkdirSync("docs/identity-verification-ui/validation", { recursive: true });
fs.writeFileSync(
  "docs/identity-verification-ui/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles,
      stableNormalizedHelpers: stable,
      originalCssPrefixSha256: hash(cssBefore),
      ownedQueries: true,
      insertPayload: true,
      providerOptionalPayload: true,
      fieldsTypesRequiredAcceptPrivacy: true,
      noNewBackendApi: true,
      sqlExecuted: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${protectedFiles} protected application/test/SQL files; 6 unchanged upload/validation/preview helpers; original owned queries, insert/provider payloads, form fields and bilingual privacy; existing CSS/Admin prefix unchanged; JS/CSS syntax.`,
);
