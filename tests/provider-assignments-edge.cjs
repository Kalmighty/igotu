/* Focused asynchronous state and map/receipt checks with local SDK fixtures. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4215";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
let checks = 0;
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: 1536, height: 864 },
      }),
      t = seed(),
      sample = t.service_requests[0];
    t.service_requests = [
      { ...sample, request_id: "CONFIRMED", status: "confirmed" },
      { ...sample, request_id: "ONGOING", status: "in_progress" },
      { ...sample, request_id: "DONE-A", status: "completed" },
      { ...sample, request_id: "DONE-B", status: "completed" },
    ].map((r) => ({ ...r, selected_provider_id: ids.provider }));
    t.service_reviews = [
      {
        request_id: "DONE-B",
        reviewer_id: ids.provider,
        reviewee_id: ids.client,
        rating: 5,
        feedback: "Already reviewed",
      },
    ];
    t.payment_records = [
      {
        payment_id: "PAY-A",
        request_id: "DONE-A",
        client_id: ids.client,
        provider_id: ids.provider,
        amount: 100,
        payment_method: "Bank Transfer",
        proof_path: ids.client + "/private-race.pdf",
      },
      {
        payment_id: "PAY-B",
        request_id: "DONE-B",
        client_id: ids.client,
        provider_id: ids.provider,
        amount: 90,
        payment_method: "Cash",
      },
    ];
    opt.prepare?.(t);
    const gate = { hold: null, failRead: false };
    const s = await install(c, {
      role: "provider",
      tables: t,
      delay: (o) => gate.hold?.(o),
      fail: (o) =>
        gate.failRead &&
        o.kind === "rpc" &&
        o.name === "provider_service_requests",
    });
    const p = await c.newPage();
    await p.goto(base + "/provider/assignment-details.html");
    await settle(p);
    return { p, c, s, gate };
  }
  async function settle(p) {
    await p.waitForFunction(() =>
      ["ready", "error", "empty"].includes(
        document.body.dataset.assignmentsState,
      ),
    );
  }
  async function idle(p) {
    await p.waitForFunction(
      () =>
        document.body.dataset.assignmentOperation === "idle" &&
        document.body.dataset.assignmentsState !== "loading",
    );
  }
  async function select(p, id) {
    await p.locator('.assignment-card[data-request-id="' + id + '"]').click();
  }
  try {
    {
      const { p, c } = await open();
      await p.locator(".pa-map-expand").click();
      ok(
        (await p.locator("#assignmentMap").boundingBox()).height === 420,
        "map expansion real layout",
      );
      ok(
        (await p.locator(".pa-map-expand").getAttribute("aria-expanded")) ===
          "true",
        "map expansion semantic",
      );
      await p.locator(".pa-map-expand").click();
      ok(
        (await p.locator("#assignmentMap").boundingBox()).height === 230,
        "map shrink",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" &&
        o.name === "payment_proof_reference" &&
        o.args.p_request_id === "DONE-A"
          ? held
          : undefined;
      await select(p, "DONE-A");
      await p.waitForFunction(() =>
        document.querySelector(".pa-receipt")?.textContent.includes("Checking"),
      );
      await select(p, "DONE-B");
      release();
      await p.getByText("No proof uploaded.", { exact: true }).waitFor();
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "RM 90.00",
        ),
        "new selected payment retained",
      );
      ok(
        !(await p.locator(".receipt-open-btn").count()),
        "delayed old proof not attached",
      );
      ok(
        (await p.locator("#assignmentReview").textContent()).includes(
          "Review Submitted",
        ),
        "new selected review retained",
      );
      ok(
        s.calls.filter(
          (o) => o.kind === "query" && o.table === "service_reviews",
        ).length === 1,
        "selection no per-card review fetch",
      );
      await c.close();
    }
    {
      const { p, c } = await open();
      await select(p, "DONE-A");
      await p.locator('.star-btn[data-value="3"]').click();
      await p
        .locator(".provider-review-form textarea")
        .fill("Draft for the first Client review");
      await select(p, "DONE-B");
      await select(p, "DONE-A");
      ok(
        (await p.locator(".provider-review-form textarea").inputValue()) ===
          "Draft for the first Client review",
        "draft retained across switching",
      );
      ok(
        (await p
          .locator(".star-btn[aria-pressed=true]")
          .getAttribute("data-value")) === "3",
        "rating retained across switching",
      );
      await c.close();
    }
    {
      const { p, c, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" && o.name === "provider_service_requests"
          ? held
          : undefined;
      await p.locator("#refreshAssignmentsBtn").click();
      await select(p, "ONGOING");
      release();
      await settle(p);
      ok(
        (await p
          .locator(".assignment-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "ONGOING",
        "selection during refresh persists",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      gate.hold = (o) => {
        if (o.kind === "rpc" && o.name === "provider_start_request")
          gate.failRead = true;
      };
      await p.locator(".start-btn").click();
      await p.locator("#confirmStartService").click();
      await idle(p);
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          "started successfully",
        ),
        "acknowledged start remains success on read failure",
      );
      ok(
        await p.locator(".start-btn").isDisabled(),
        "stale confirmed cache cannot restart",
      );
      ok(
        s.tables.service_requests[0].status === "in_progress",
        "server acknowledged actual transition",
      );
      gate.failRead = false;
      await p.locator("#refreshAssignmentsBtn").click();
      await settle(p);
      ok(
        !(await p.locator(".start-btn").count()),
        "fresh progress removes start",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      await select(p, "DONE-A");
      await p.locator('.star-btn[data-value="4"]').click();
      await p
        .locator(".provider-review-form textarea")
        .fill("Acknowledged review");
      gate.hold = (o) => {
        if (
          o.kind === "query" &&
          o.table === "service_reviews" &&
          o.calls.some((c) => c[0] === "insert")
        )
          gate.failRead = true;
      };
      await p.locator(".provider-review-form button[type=submit]").click();
      await idle(p);
      ok(
        (await p.locator("#assignmentReview").textContent()).includes(
          "Review Submitted",
        ),
        "acknowledged review retained on failed refresh",
      );
      ok(
        !(await p.locator(".provider-review-form").count()),
        "failed refresh cannot offer duplicate form",
      );
      ok(
        s.tables.service_reviews.filter((r) => r.request_id === "DONE-A")
          .length === 1,
        "only one submitted review",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          const u = t.users.find((u) => u.id === ids.client);
          u.full_name = null;
          u.user_code = null;
          delete u.identity_verified;
        },
      });
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Identity status unavailable",
        ),
        "missing optional identity honest",
      );
      ok(
        !(await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Identity not verified",
        ),
        "missing identity not labelled unverified",
      );
      await c.close();
    }
    fs.mkdirSync("docs/provider-assignments/validation", { recursive: true });
    fs.writeFileSync(
      "docs/provider-assignments/validation/edge.json",
      JSON.stringify({ assertions: checks, liveBackend: false }, null, 2) +
        "\n",
    );
    console.log(
      `PASS ${checks} asynchronous assignment/receipt/map/review state checks; local fixtures only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
