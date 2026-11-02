/* Offline source guard: critical business functions must match reviewed PR #17. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const vm = require("node:vm");
const base = "5103c13c29ffd2989553c52cec3a10be11e05f04";
const file = "igotu_v2/js/client-create-request.js";
const original = execFileSync("git", ["show", `${base}:${file}`], {
  encoding: "utf8",
});
const current = fs.readFileSync(file, "utf8");
function definition(source, name) {
  const start = source.search(
    new RegExp(`^(?:async )?function ${name}\\(`, "m"),
  );
  assert(start >= 0, name);
  const body = source.slice(start);
  const end = body.indexOf("\n}");
  assert(end >= 0, name);
  return body.slice(0, end + 2);
}
const names = [
  "creationKey",
  "updateServiceTypeOptions",
  "setupServiceTypeSelector",
  "validateRequestImageFile",
  "getSelectedRequestImageFile",
  "uploadRequestImage",
  "saveRequestImage",
  "getSessionUser",
  "getProfile",
  "loadRequestForEdit",
  "updateRequest",
  "createRequest",
  "handleRequestForm",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const result = [];
for (const name of names) {
  const a = definition(original, name),
    b = definition(current, name);
  assert.equal(b, a, `Business function changed: ${name}`);
  result.push({ function: name, sha256: hash(b), unchanged: true });
}
assert.equal(
  current.match(/const SERVICE_TYPES = \{[\s\S]*?\n\};/)[0],
  original.match(/const SERVICE_TYPES = \{[\s\S]*?\n\};/)[0],
);
for (const p of [file, "igotu_v2/js/client-create-request-ui.js"])
  new vm.Script(fs.readFileSync(p, "utf8").replace(/^import .*;\n/gm, ""), {
    filename: p,
  });
const protectedPaths = [
  "igotu_v2/js/profile-guard.js",
  "igotu_v2/js/app-shell.js",
  "igotu_v2/js/supabaseClient.js",
  "igotu_v2/js/html-safety.js",
  "igotu_v2/js/profile-menu.js",
  "igotu_v2/js/notification-menu.js",
  "igotu_v2/js/notification-badge.js",
  "igotu_v2/client/dashboard.html",
  "igotu_v2/css/client-dashboard.css",
  "igotu_v2/css/style.css",
  "igotu_v2/css/ui.css",
];
for (const p of protectedPaths)
  assert.equal(
    fs.readFileSync(p, "utf8"),
    execFileSync("git", ["show", `${base}:${p}`], { encoding: "utf8" }),
    `Protected shared file: ${p}`,
  );
fs.mkdirSync("docs/create-request/validation", { recursive: true });
fs.writeFileSync(
  "docs/create-request/validation/contract.json",
  JSON.stringify(
    {
      base,
      unchangedFunctions: result,
      unchangedServiceTypes: true,
      unchangedSharedFiles: protectedPaths,
      syntax: "PASS",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS: ${names.length} byte-identical business functions, exact service types, ${protectedPaths.length} unchanged shared files; JS syntax.`,
);
