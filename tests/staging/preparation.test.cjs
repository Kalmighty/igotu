/* Mock transport and local files only. These are NOT staging integration tests. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validate, makeRuntime } = require("./runtime.cjs");
const {
  cases,
  selectionRaceResult,
  completeResults,
} = require("./integration.cjs");
const { signedResource } = require("./storage-expiry.cjs");
const slots = [
  "clientA",
  "clientB",
  "providerA",
  "providerB",
  "admin",
  "unverified",
  "pending",
  "rejected",
  "suspended",
  "legacy",
  "legacySuspended",
];
const config = {
  syntheticOnly: true,
  projectRef: "abcdefghijklmnopqrst",
  url: "https://abcdefghijklmnopqrst.supabase.co",
  publishableKey: "sb_publishable_synthetic_public_fixture",
  mailDomain: "igotu.test",
  date: "2030-01-07",
  accounts: Object.fromEntries(
    slots.map((n, i) => [
      n,
      {
        synthetic: true,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        role:
          n === "admin"
            ? "admin"
            : /provider|pending|legacy/.test(n)
              ? "provider"
              : "client",
      },
    ]),
  ),
};
const secrets = Object.fromEntries(
  slots
    .concat("registrationclient", "registrationprovider")
    .map((n) => [
      n,
      { email: n + "@igotu.test", password: "SyntheticPassword123!" },
    ]),
);
const approval = {
  syntheticOnly: true,
  projectRef: config.projectRef,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  ...Object.fromEntries(
    [
      "network",
      "syntheticWrites",
      "authSignups",
      "mailCapture",
      "migrationsReviewed",
      "migrationsInstalled",
      "privateSchemaReviewed",
      "testAccountsReviewed",
    ].map((k) => [k, true]),
  ),
};
const clone = (x) => structuredClone(x);
(async () => {
  assert.equal(Object.keys(cases).length, 20);
  const { inspectBundle } = require("./preflight.cjs");
  const manifest = require("../../docs/staging-readiness/migration-order.json");
  assert.equal(inspectBundle(manifest).status, "PASS");
  for (const mutate of [
    (m) => m.steps.reverse(),
    (m) => (m.steps[1].sha256 = "0".repeat(64)),
    (m) => (m.steps[0].path = "../../unreviewed.sql"),
    (m) => (m.steps[0].approval_required = false),
    (m) => m.steps.pop(),
  ]) {
    const m = clone(manifest);
    mutate(m);
    assert.throws(() => inspectBundle(m));
  }
  const probe = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "atomic-probe-install.sql"),
    "utf8",
  );
  assert.ok(probe.includes("'General Cleaning'"));
  assert.ok(cases["ST-20"].toString().includes("General Cleaning"));
  assert.equal(validate(config, approval, secrets), true);
  for (const mutate of [
    (c) => (c.projectRef = "giqtnbwyktbnbhdvjraa"),
    (c) => (c.url = "https://example.invalid"),
    (c) => (c.publishableKey = "sb_secret_forbidden"),
    (c) => (c.syntheticOnly = false),
    (c) => (c.accounts.clientA.synthetic = false),
    (c) => (c.accounts.providerA.id = c.accounts.clientA.id),
    (c) => (c.date = "2030-99-99"),
  ]) {
    const c = clone(config);
    mutate(c);
    assert.throws(() => validate(c, approval, secrets));
  }
  for (const change of [
    { network: false },
    { privateSchemaReviewed: false },
    { expiresAt: "2000-01-01" },
  ])
    assert.throws(() => validate(config, { ...approval, ...change }, secrets));
  let networkCalls = 0;
  const own = config.accounts.clientA;
  let validSession = true;
  const transport = async () => {
    networkCalls++;
    return {
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify([
          { id: validSession ? own.id : "wrong", role: "client" },
        ]),
    };
  };
  const x = makeRuntime(config, approval, secrets, transport),
    actor = { id: own.id, token: "SYNTHETIC" };
  assert.equal(
    networkCalls,
    0,
    "Constructing transport must not contact anything",
  );
  assert.notEqual(
    x.profile({ name: "providerB" }).p_specializations[0].specialization,
    "General Cleaning",
    "Late-failure fixture must not block earlier profile/matching setup",
  );
  await assert.rejects(
    x.request(actor, "https://giqtnbwyktbnbhdvjraa.supabase.co/rest/v1/users"),
  );
  assert.equal(networkCalls, 0);
  const expiring = clone(approval);
  const shortWindow = makeRuntime(config, expiring, secrets, transport);
  expiring.expiresAt = "2000-01-01";
  await assert.rejects(
    shortWindow.request(actor, "/rest/v1/users", { method: "POST", body: {} }),
    /APPROVAL_EXPIRED/,
  );
  assert.equal(networkCalls, 0, "Expired approval must stop before transport");
  const winner = { status: 204, ok: true, data: null };
  const conflict = {
    status: 400,
    ok: false,
    data: {
      code: "P0001",
      message: "Provider no longer matches this request or is booked.",
    },
  };
  selectionRaceResult([winner, conflict]);
  selectionRaceResult([conflict, winner]);
  for (const loser of [
    { status: 500, ok: false, data: { code: "XX000" } },
    { status: 404, ok: false, data: { code: "PGRST202" } },
    { status: 401, ok: false, data: { code: "PGRST301" } },
    {
      status: 400,
      ok: false,
      data: { code: "P0001", message: "Unrelated failure" },
    },
    { status: 400, ok: false, data: { code: "22023" } },
  ])
    assert.throws(() => selectionRaceResult([winner, loser]));
  assert.throws(() => selectionRaceResult([winner, winner]));
  assert.throws(() => selectionRaceResult([conflict, conflict]));
  const stopped = completeResults([{ id: "ST-01", status: "FAIL" }]);
  assert.equal(stopped.length, 20);
  assert.equal(stopped.filter((r) => r.status === "NOT_TESTED").length, 19);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "igotu-config-"));
  try {
    const web = path.join(dir, "web");
    fs.mkdirSync(web);
    const configFile = path.join(dir, "config.json");
    const approvalFile = path.join(dir, "approval.json");
    const privateFile = path.join(dir, "secrets.json");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...config, frontendDirectory: web }),
    );
    fs.writeFileSync(approvalFile, JSON.stringify(approval));
    fs.writeFileSync(privateFile, JSON.stringify(secrets), { mode: 0o600 });
    const args = [
      "--config",
      configFile,
      "--approval",
      approvalFile,
      "--secrets",
      privateFile,
    ];
    const { load } = require("./config.cjs");
    assert.equal(load(args).config.projectRef, config.projectRef);
    if (process.platform !== "win32") {
      fs.chmodSync(privateFile, 0o644);
      assert.throws(() => load(args), /SECRET_FILE_PERMISSIONS_REQUIRED/);
      fs.chmodSync(privateFile, 0o600);
    }
    const exposedFile = path.join(web, "secrets.json");
    fs.copyFileSync(privateFile, exposedFile);
    assert.throws(
      () => load([...args.slice(0, -1), exposedFile]),
      /SECRETS_OUTSIDE_FRONTEND_REQUIRED/,
    );
    // Windows symlink creation may require a privilege unavailable to the test user.
    if (process.platform !== "win32") {
    const link = path.join(dir, "linked-secrets.json");
    fs.symlinkSync(exposedFile, link);
    assert.throws(
      () => load([...args.slice(0, -1), link]),
      /SECRETS_OUTSIDE_FRONTEND_REQUIRED/,
    );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await x.denied(actor, async () => ({
    status: 403,
    ok: false,
    data: { code: "42501" },
  }));
  await assert.rejects(
    x.denied(actor, async () => ({
      status: 500,
      ok: false,
      data: { code: "XX000" },
    })),
  );
  await assert.rejects(
    x.denied(actor, async () => ({
      status: 404,
      ok: false,
      data: { code: "PGRST202" },
    })),
  );
  await x.denied(actor, async () => ({ status: 200, ok: true, data: [] }));
  let attempted = false;
  validSession = false;
  await assert.rejects(
    x.denied(actor, async () => {
      attempted = true;
      return { status: 403, ok: false, data: { code: "42501" } };
    }),
  );
  assert.equal(
    attempted,
    false,
    "A broken positive session control must prevent a false authorization pass",
  );
  assert.equal(
    signedResource("/object/sign/payment-proofs/synthetic.png?token=SYNTHETIC"),
    "/storage/v1/object/sign/payment-proofs/synthetic.png?token=SYNTHETIC",
  );
  for (const link of [
    "https://example.invalid/proof",
    "/object/public/payment-proofs/a?token=x",
    "/storage/v1/object/sign/other/a?token=x",
  ])
    assert.throws(() => signedResource(link));
  for (const file of [
    "integration.cjs",
    "browser-login.cjs",
    "storage-expiry.cjs",
    "matching-matrix.cjs",
  ]) {
    const r = spawnSync("node", [require.resolve("./" + file), "--plan"], {
      encoding: "utf8",
    });
    assert.equal(r.error, undefined);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PREPARED_NOT_EXECUTED/);
    const blocked = spawnSync(
      "node",
      [require.resolve("./" + file), "--execute"],
      { encoding: "utf8" },
    );
    assert.equal(blocked.error, undefined);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /EXPLICIT_CONFIG/);
  }
  console.log(
    "PASS local preparation checks: 20 procedures, production/key/synthetic/expiry guards, mock positive controls, broken endpoints fail, import/plan do not contact staging. No staging test executed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
