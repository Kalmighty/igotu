/* Offline contract/source boundaries for the Request Details redesign. */
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const vm = require("node:vm");
const base = "a9e870d32e01bbaf2e0c78974c19ab96408534b2",
  file = "igotu_v2/js/client-request-details.js";
const old = execFileSync("git", ["show", base + ":" + file], {
    encoding: "utf8",
  }),
  current = fs.readFileSync(file, "utf8");
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
  "getSessionUser",
  "getProfile",
  "displayUser",
  "handleLogout",
  "getPayment",
  "getClientReview",
  "requiresPaymentProof",
  "updatePaymentProofRequirement",
  "getStarRatingHtml",
  "setupStarRatings",
  "getPaymentProofHtml",
  "getFileExtension",
];
for (const name of unchanged)
  assert.equal(
    definition(current, name),
    definition(old, name),
    name + " changed",
  );
const reviewedCopies = {
  uploadPaymentProof: definition(old, "uploadPaymentProof").replace(
    '        console.error("Payment proof upload error:", uploadError);\n        throw new Error(uploadError.message || "Failed to upload proof payment.");',
    '        throw new Error("Payment proof could not be uploaded. Please try again.");',
  ),
  savePayment: definition(old, "savePayment").replace(
    '        console.error("Payment insert error:", error);\n        showMessage(error.message || "Failed to save payment record.");',
    '        showMessage("Failed to save payment record. Refresh to check existing records before retrying.");',
  ),
  saveReview: definition(old, "saveReview").replace(
    '        console.error("Review insert error:", error);\n        showMessage(error.message || "Failed to submit review.");',
    '        showMessage("Failed to submit review. Refresh to check existing records before retrying.");',
  ),
};
for (const [name, expected] of Object.entries(reviewedCopies))
  assert.equal(
    definition(current, name),
    expected,
    name + " contract/body changed beyond generic error copy",
  );
assert(
  /\.eq\("request_id", requestId\)\s*\.eq\("client_id", currentUser.id\)/.test(
    current,
  ),
  "Both request ownership predicates",
);
assert(
  current.includes("await serviceParticipants([requestId])"),
  "Participant pathway",
);
assert(
  /supabase.rpc\("client_cancel_request",\{p_request_id:currentRequest.request_id,p_reason:reason,?\}\)/.test(
    current.replace(/\s/g, ""),
  ),
  "Cancellation signature",
);
assert(
  /supabase.rpc\("client_complete_request",\{p_request_id:currentRequest.request_id,?\}\)/.test(
    current.replace(/\s/g, ""),
  ),
  "Completion signature",
);
const timeline = definition(current, "timelineHtml");
for (const name of [
  "updated_at",
  "preferred_date",
  "Date.now",
  "existingPayment",
])
  assert(!timeline.includes(name), "Invented milestone source " + name);
new vm.Script(current.replace(/^import .*;\n/gm, ""), { filename: file });
const hash = (v) => createHash("sha256").update(v).digest("hex");
const paths = [
  "igotu_v2/js/profile-guard.js",
  "igotu_v2/js/identity-access.js",
  "igotu_v2/js/backend-access.js",
  "igotu_v2/js/supabaseClient.js",
  "igotu_v2/js/payment-receipts.js",
  "igotu_v2/js/service-action-dialogs.js",
  "igotu_v2/js/app-shell.js",
  "igotu_v2/js/html-safety.js",
  "igotu_v2/js/profile-menu.js",
  "igotu_v2/js/notification-menu.js",
  "igotu_v2/js/notification-badge.js",
  "igotu_v2/client/dashboard.html",
  "igotu_v2/client/create-request.html",
  "igotu_v2/client/my-requests.html",
  "igotu_v2/client/recommended-providers.html",
  "igotu_v2/client/messages.html",
  "igotu_v2/js/client.js",
  "igotu_v2/js/client-create-request.js",
  "igotu_v2/js/client-create-request-ui.js",
  "igotu_v2/js/client-my-requests.js",
  "igotu_v2/js/client-recommended-providers.js",
  "igotu_v2/js/client-messages.js",
  "igotu_v2/css/client-dashboard.css",
  "igotu_v2/css/client-create-request.css",
  "igotu_v2/css/client-my-requests.css",
  "igotu_v2/css/style.css",
  "igotu_v2/css/ui.css",
];
const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
const all = [
  ...new Set([
    ...paths,
    ...tree.filter(
      (p) => p.endsWith(".sql") || /^igotu_v2\/(provider|admin)\//.test(p),
    ),
  ]),
];
const protectedFiles = [];
for (const p of all) {
  const a = execFileSync("git", ["show", base + ":" + p]),
    b = fs.readFileSync(p);
  assert.equal(hash(a), hash(b), "Protected file changed " + p);
  protectedFiles.push({ path: p, sha256: hash(b) });
}
const html = fs.readFileSync("igotu_v2/client/request-details.html", "utf8"),
  beforeHtml = execFileSync(
    "git",
    ["show", base + ":igotu_v2/client/request-details.html"],
    { encoding: "utf8" },
  );
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "Duplicate static IDs");
for (const [, id] of beforeHtml.matchAll(/\bid="([^"]+)"/g))
  assert(ids.includes(id), "Original ID missing " + id);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "Missing icon " + id);
fs.mkdirSync("docs/request-details/validation", { recursive: true });
fs.writeFileSync(
  "docs/request-details/validation/contract.json",
  JSON.stringify(
    {
      base,
      byteIdenticalFunctions: unchanged,
      unchangedInsertUploadBodiesExceptGenericErrorCopy:
        Object.keys(reviewedCopies),
      ownedQuery: true,
      participantPathway: true,
      rpcSignatures: true,
      noInventedTimelineDates: true,
      syntax: true,
      protectedFiles,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS: ${unchanged.length} byte-identical helpers; payment/review/upload bodies identical except generic errors; original ownership/participant/RPC contracts; ${all.length} protected files; syntax/IDs/icons.`,
);
