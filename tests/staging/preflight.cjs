/* Offline bundle integrity only. No SQL executor, credentials or network. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const files = [
  "igotu_v2/database/staging-baseline/20261026165620_phase7_synthetic_baseline_draft.sql",
  "igotu_v2/database/backend-integration/20261026153952_01_foundation_draft.sql",
  "igotu_v2/database/backend-integration/20261026153954_02_private_readers_draft.sql",
  "igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql",
  "igotu_v2/database/backend-integration/20261026153958_04_cutover_draft.sql",
];
function inspectBundle(manifest) {
  assert.equal(manifest.execution_status, "NOT_EXECUTED");
  assert.equal(manifest.steps.length, files.length);
  const hashes = manifest.steps.map((step, i) => {
    assert.equal(step.order, i, "Explicit migration order changed");
    assert.equal(step.path, files[i], "Unexpected migration path/order");
    assert.equal(step.approval_required, true);
    const source = fs.readFileSync(path.join(root, step.path));
    const sha256 = crypto.createHash("sha256").update(source).digest("hex");
    assert.equal(sha256, step.sha256, "Reviewed migration hash mismatch");
    const sql = source.toString("utf8");
    assert.match(sql, /server_version_num/);
    assert.match(sql, /giqtnbwyktbnbhdvjraa/);
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    return { order: i, path: step.path, sha256 };
  });
  return {
    scope: "OFFLINE_ONLY_NO_DATABASE_CONNECTION",
    status: "PASS",
    hashes,
    postgresRequired: 17,
    writerIsolationRequired: "read committed",
    privateSchema: "igotu_backend_private",
    stagingWorkflows: {
      prepared: 20,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 20,
    },
    acceptanceGroups: { passed: 0, failed: 0, blocked: 14 },
    nextStage: "BLOCKED_PENDING_SEPARATE_PROVISIONING_APPROVAL",
  };
}
if (require.main === module) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, "docs/staging-readiness/migration-order.json"),
        "utf8",
      ),
    );
    console.log(JSON.stringify(inspectBundle(manifest), null, 2));
  } catch {
    console.error(
      "FAIL offline staging bundle integrity; inspect reviewed manifest/source drift. No SQL executed.",
    );
    process.exitCode = 1;
  }
}
module.exports = { inspectBundle };
