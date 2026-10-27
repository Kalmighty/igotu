/* Mock transport and local files only. These are NOT staging integration tests. */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { validate, makeRuntime } = require("./runtime.cjs");
const { cases } = require("./integration.cjs");
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
