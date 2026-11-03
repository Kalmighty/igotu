/* Actual Chromium, synthetic assigned-request fixtures. No live services. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4214",
  out = "docs/provider-incoming-requests",
  reviewed = "6895c094d8a05e432512f930ef27d43ec2322906";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
for (const d of ["screenshots", "before", "validation"])
  fs.mkdirSync(`${out}/${d}`, { recursive: true });
let checks = 0,
  scans = 0;
const metrics = [],
  errors = [],
  external = [];
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
const calls = (s, name) =>
  s.calls.filter((o) => o.kind === "rpc" && o.name === name);
const mutations = (s) =>
  s.calls.filter(
    (o) =>
      o.kind === "rpc" &&
      ["provider_confirm_request", "provider_decline_request"].includes(o.name),
  );
function tables() {
  const t = seed();
  t.users.find((u) => u.id === ids.provider).full_name = "Synthetic Provider A";
  t.users.find((u) => u.id === ids.client).full_name = "Synthetic Client A";
  const sample = t.service_requests[0];
  t.service_requests = [
    [
      "REQ-15",
      "Home Cleaning",
      "Cleaning",
      "2026-11-12",
      "11:00",
      "2026-11-03T10:00:00Z",
      120,
    ],
    [
      "REQ-14",
      "Aircon Service",
      "Repair",
      "2026-11-10",
      "14:00",
      "2026-11-02T10:00:00Z",
      200,
    ],
    [
      "REQ-13",
      "Plumbing Repair",
      "Repair",
      "2026-11-11",
      "10:00",
      "2026-11-01T10:00:00Z",
      0,
    ],
    [
      "REQ-12",
      "Home Cleaning",
      "Cleaning",
      "2026-11-09",
      "09:00",
      "2026-10-31T10:00:00Z",
      null,
    ],
    [
      "REQ-11",
      "Electrical Service",
      "Repair",
      "2026-02-30",
      null,
      "invalid",
      null,
    ],
    ["REQ-10", "General Repair", "Repair", null, "99:99", null, null],
  ].map(
    ([
      request_id,
      title,
      category,
      preferred_date,
      preferred_time,
      created_at,
      budget,
    ]) => ({
      ...sample,
      request_id,
      title,
      category,
      service_type: title,
      preferred_date,
      preferred_time,
      created_at,
      budget,
      status: "provider_selected",
      selected_provider_id: ids.provider,
      client_id: ids.client,
      location: "PRIVATE EXACT ADDRESS",
      client_lat: 6.123456,
      client_lng: 116.987654,
      description: "WITHHELD DESCRIPTION SECRET " + "long ".repeat(40),
      request_image_url: "https://private.invalid/request-image",
    }),
  );
  t.service_requests.push({
    ...sample,
    request_id: "FOREIGN",
    title: "UNASSIGNED MARKETPLACE SECRET",
    selected_provider_id: null,
    status: "pending",
  });
  return t;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: opt.width || 1536, height: opt.height || 864 },
        reducedMotion: "reduce",
      }),
      t = tables();
    opt.prepare?.(t);
    if (opt.before)
      for (const r of t.service_requests) {
        r.description = null;
        r.request_image_url = null;
      }
    const gate = {
      requestFail: false,
      participantFail: false,
      mode: null,
      hold: null,
      statusFail: false,
    };
    const s = await install(c, {
      role: opt.role || "provider",
      tables: t,
      fail: (o, st) => {
        if (o.kind !== "rpc") return false;
        if (o.name === "provider_service_requests")
          return o.args.p_request_id ? gate.statusFail : gate.requestFail;
        if (o.name === "service_participants") return gate.participantFail;
        if (
          ["provider_confirm_request", "provider_decline_request"].includes(
            o.name,
          ) &&
          gate.mode
        ) {
          if (gate.mode === "reject")
            return {
              code: "P0001",
              message: "RAW PRIVATE SQL server path secret",
            };
          if (gate.mode === "lost-success") {
            const r = st.tables.service_requests.find(
              (r) => r.request_id === o.args.p_request_id,
            );
            if (o.name === "provider_confirm_request") r.status = "confirmed";
            else {
              r.status = "pending";
              r.selected_provider_id = null;
            }
            return "throw";
          }
          return "throw";
        }
        return false;
      },
      delay: (o) => gate.hold?.(o),
    });
    if (opt.initialError) gate.requestFail = true;
    if (opt.participantError) gate.participantFail = true;
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        opt.before &&
        [
          "/provider/incoming-requests.html",
          "/js/provider-incoming-requests.js",
        ].includes(u.pathname)
      )
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : "text/html",
          body: execFileSync(
            "git",
            ["show", `${reviewed}:igotu_v2${u.pathname}`],
            { encoding: "utf8" },
          ),
        });
      if (u.pathname === "/js/supabaseClient.js" && !opt.before) {
        const source = fs.readFileSync("tests/system-fixture.js", "utf8");
        return r.fulfill({
          contentType: "text/javascript",
          body:
            source +
            `\nconst originalRpc=supabase.rpc;window.incomingRetryFlags=[];supabase.rpc=(name,args)=>{if(!['provider_confirm_request','provider_decline_request'].includes(name))return originalRpc(name,args);return {retry(value){window.incomingRetryFlags.push(value);return this;},then(resolve,reject){return originalRpc(name,args).then(resolve,reject);}};};`,
        });
      }
      return r.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(12000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/provider/incoming-requests.html" + (opt.url || ""), {
      waitUntil: "commit",
    });
    if (!opt.noWait && !opt.before) await settle(p);
    if (opt.before) await p.locator(".incoming-card").first().waitFor();
    return { p, c, s, gate };
  }
  async function settle(p) {
    await p.waitForFunction(() =>
      ["ready", "empty", "error"].includes(document.body.dataset.incomingState),
    );
  }
  async function idle(p) {
    await p.waitForFunction(
      () =>
        document.body.dataset.incomingOperation === "idle" &&
        ["ready", "empty", "error"].includes(
          document.body.dataset.incomingState,
        ),
    );
  }
  async function shot(p, name, before = false) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.evaluate(() => {
      const a = document.createElement("aside");
      a.id = "offlineLabel";
      a.textContent =
        "OFFLINE REVIEW · SYNTHETIC PROVIDER / CLIENT / REQUESTS · NO LIVE SUPABASE";
      a.style =
        "position:relative;background:#fff4cd;color:#453b15;padding:5px 10px;text-align:center;font:700 10px/1.5 Arial;z-index:99999";
      document.body.prepend(a);
    });
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    ok(!violations.length, "axe " + label + JSON.stringify(violations));
    scans++;
  }
  async function confirm(p) {
    await p.locator(".confirm-btn").click();
    await p.locator("#submitIncomingConfirm").click();
  }
  async function decline(p) {
    await p.locator(".decline-btn").click();
    await p.locator("#serviceReasonSelect").selectOption("schedule_conflict");
    await p
      .locator("#serviceReasonDetails")
      .fill("Synthetic scheduling conflict");
    await p.locator(".service-reason-confirm").click();
  }
  try {
    for (const [width, height] of [
      [1920, 1080],
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 800],
    ]) {
      const { p, c, s } = await open({ width, height });
      ok((await p.locator(".incoming-card").count()) === 6, "assigned list");
      ok(
        (await p.locator("#awaitingCount").textContent()) === "6",
        "one supported count",
      );
      ok(
        (await p
          .locator(".side-menu a[aria-current=page]")
          .getAttribute("href")) === "incoming-requests.html",
        "active sidebar",
      );
      ok(
        (await p
          .locator(".side-menu a")
          .evaluateAll((es) =>
            es.map((e) => e.getAttribute("href")).join(","),
          )) ===
          "dashboard.html,incoming-requests.html,assignment-details.html,messages.html",
        "four routes",
      );
      ok(
        calls(s, "provider_service_requests").length === 1,
        "one initial read",
      );
      ok(
        JSON.stringify(calls(s, "provider_service_requests")[0].args) ===
          '{"p_request_id":null,"p_statuses":["provider_selected"]}',
        "original incoming RPC args",
      );
      ok(
        calls(s, "service_participants")[0].args.p_request_ids.length === 6,
        "participants only authorised incoming IDs",
      );
      const html = await p.locator("body").innerHTML();
      for (const secret of [
        "PRIVATE EXACT ADDRESS",
        "6.123456",
        "116.987654",
        "WITHHELD DESCRIPTION SECRET",
        "UNASSIGNED MARKETPLACE SECRET",
        "private.invalid",
      ])
        ok(!html.includes(secret), "preconfirmation privacy " + secret);
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "Additional service details will be available after confirmation.",
        ),
        "description intentionally withheld",
      );
      const m = await p.evaluate(() => {
        const rect = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          list: rect(".ir-list-panel"),
          refresh: rect("#refreshIncomingBtn"),
          search: rect("#incomingSearch"),
          card: rect(".incoming-card"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no list overflow " + width);
      ok(
        m.refresh.height >= 44 && m.card.height >= 44 && m.search.height >= 44,
        "touch targets",
      );
      await axe(p, "list " + width);
      await shot(p, "list-" + width);
      await p.locator(".incoming-card").first().click();
      ok(
        (await p
          .locator(".incoming-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "REQ-15",
        "selected request",
      );
      ok(
        await p.locator("#selectedIncomingTitle").isVisible(),
        "details visible",
      );
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "Synthetic Client A",
        ),
        "scoped Client name",
      );
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "Identity verified",
        ),
        "authorised identity state",
      );
      ok(
        (await p.locator(".ir-report").getAttribute("href")) ===
          "report.html?request_id=REQ-15",
        "existing report route",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "details no overflow",
      );
      await shot(p, "details-" + width);
      if (width <= 390) await axe(p, "details " + width);
      await p.locator(".confirm-btn").click();
      ok(!mutations(s).length, "dialog is not mutation");
      ok(
        (await p.locator("#confirmIncomingRequest").textContent()).includes(
          "REQ-15 — Home Cleaning",
        ),
        "exact confirm subject",
      );
      await shot(p, "confirm-" + width);
      await axe(p, "confirm " + width);
      await p.keyboard.press("Escape");
      ok(!mutations(s).length, "Escape no mutation");
      ok(
        await p
          .locator(".confirm-btn")
          .evaluate((e) => e === document.activeElement),
        "confirm focus restoration",
      );
      await p.locator(".decline-btn").click();
      await shot(p, "decline-" + width);
      if (width <= 390) await axe(p, "decline " + width);
      await p.locator(".service-reason-confirm").click();
      ok(
        (await p.locator("#serviceReasonError").textContent()).includes(
          "select a reason",
        ),
        "decline reason required",
      );
      await p.keyboard.press("Escape");
      ok(!mutations(s).length, "decline cancellation");
      ok(
        await p
          .locator(".decline-btn")
          .evaluate((e) => e === document.activeElement),
        "decline focus restoration",
      );
      if (width <= 390) {
        await p.locator("#backToIncoming").click();
        ok(await p.locator("#incomingSearch").isVisible(), "mobile back");
        ok(
          await p
            .locator(".incoming-card[aria-pressed=true]")
            .evaluate((e) => e === document.activeElement),
          "mobile focus restoration",
        );
      }
      await c.close();
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, "incoming-" + width, true);
      await c.close();
    }
    {
      const { p, c, s } = await open();
      await p.locator('.incoming-card[data-request-id="REQ-14"]').click();
      for (const [q, count] of [
        ["aircon", 1],
        ["REQ-13", 1],
        ["Cleaning", 2],
        ["no matching request", 0],
      ]) {
        await p.locator("#incomingSearch").fill(q);
        ok(
          (await p.locator(".incoming-card").count()) === count,
          "search " + q,
        );
        ok(
          (await p.locator("#selectedIncomingTitle").textContent()) ===
            "Aircon Service",
          "selection survives search",
        );
        await shot(p, count ? "search-results" : "search-empty");
      }
      await p
        .getByRole("button", { name: "Clear Search", exact: true })
        .click();
      ok((await p.locator(".incoming-card").count()) === 6, "clear search");
      for (const [mode, first] of [
        ["oldest", "REQ-12"],
        ["newest", "REQ-15"],
        ["earliest", "REQ-12"],
        ["latest", "REQ-15"],
      ]) {
        await p.locator("#incomingSort").selectOption(mode);
        ok(
          (await p
            .locator(".incoming-card")
            .first()
            .getAttribute("data-request-id")) === first,
          "sort " + mode,
        );
        ok(
          (await p
            .locator(".incoming-card")
            .last()
            .getAttribute("data-request-id")) === "REQ-11" ||
            (await p
              .locator(".incoming-card")
              .last()
              .getAttribute("data-request-id")) === "REQ-10",
          "missing dates last",
        );
      }
      await p.locator("#incomingSearch").fill("Repair");
      await p.locator("#refreshIncomingBtn").click();
      await settle(p);
      ok(
        (await p.locator("#incomingSearch").inputValue()) === "Repair" &&
          (await p.locator("#incomingSort").inputValue()) === "latest",
        "refresh filters preserved",
      );
      ok(
        (await p.locator("#selectedIncomingTitle").textContent()) ===
          "Aircon Service",
        "refresh selection preserved",
      );
      ok(!mutations(s).length, "search sort read only");
      await c.close();
    }
    for (const kind of ["confirm", "decline"]) {
      const { p, c, s } = await open();
      if (kind === "confirm") await confirm(p);
      else await decline(p);
      await idle(p);
      ok(mutations(s).length === 1, "single " + kind + " mutation");
      const r = s.tables.service_requests.find(
        (r) => r.request_id === "REQ-15",
      );
      ok(
        r.status === (kind === "confirm" ? "confirmed" : "pending"),
        "server transition " + kind,
      );
      ok(
        (await p.locator("#messageBox").textContent()).includes("successfully"),
        "acknowledged success",
      );
      ok(
        (await p
          .locator(".incoming-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "REQ-14",
        "next after success",
      );
      ok(
        (await p.evaluate(() => window.incomingRetryFlags)).join(",") ===
          "false",
        "SDK retries disabled",
      );
      if (kind === "decline")
        ok(
          mutations(s)[0].args.p_reason ===
            "Schedule conflict: Synthetic scheduling conflict",
          "reason retained",
        );
      await shot(p, kind + "-success");
      await c.close();
    }
    for (const kind of ["confirm", "decline"]) {
      const { p, c, s, gate } = await open();
      gate.mode = "reject";
      if (kind === "confirm") await confirm(p);
      else await decline(p);
      await idle(p);
      ok(
        (await p.locator("#messageBox").textContent())
          .toLowerCase()
          .includes("failed"),
        "known " + kind + " failure",
      );
      ok(
        !(await p.locator("body").textContent()).includes("RAW PRIVATE SQL"),
        "sanitised server errors",
      );
      ok(
        (await p
          .locator(".incoming-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "REQ-15",
        "failure selection retained",
      );
      ok(mutations(s).length === 1, "failed mutation not auto repeated");
      ok(
        await p.locator(".confirm-btn").isEnabled(),
        "known failure recovery after read",
      );
      await shot(p, kind + "-error");
      await c.close();
    }
    for (const kind of ["confirm", "decline"]) {
      const { p, c, s, gate } = await open();
      gate.mode = "lost";
      if (kind === "confirm") await confirm(p);
      else await decline(p);
      await p.waitForFunction(
        () => document.body.dataset.incomingOperation === "unresolved",
      );
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          "Outcome not yet confirmed",
        ),
        "honest uncertain " + kind,
      );
      ok(
        (await p.locator(".confirm-btn").isDisabled()) &&
          (await p.locator(".decline-btn").isDisabled()),
        "conflicting actions paused",
      );
      await p
        .locator(".confirm-btn")
        .evaluate((b) => b.dispatchEvent(new Event("click")));
      ok(mutations(s).length === 1, "no repeat on uncertain click");
      await p.locator("#checkIncomingStatus").click();
      await p.waitForFunction(
        () => document.body.dataset.incomingOperation === "unresolved",
      );
      ok(mutations(s).length === 1, "check only reads");
      await shot(p, kind + "-uncertain");
      gate.statusFail = true;
      await p.locator("#checkIncomingStatus").click();
      await p.waitForFunction(
        () => document.body.dataset.incomingOperation === "unresolved",
      );
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          "could not be checked",
        ),
        "status read failure",
      );
      gate.statusFail = false;
      const row = s.tables.service_requests.find(
        (r) => r.request_id === "REQ-15",
      );
      row.status = kind === "confirm" ? "confirmed" : "pending";
      if (kind === "decline") row.selected_provider_id = null;
      await p.locator("#checkIncomingStatus").click();
      await idle(p);
      ok(mutations(s).length === 1, "reconciliation never mutates");
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          kind === "confirm"
            ? "current authorised status"
            : "could not be verified",
        ),
        "reconciled outcome truthful",
      );
      await c.close();
    }
    for (const kind of ["confirm", "decline"]) {
      const { p, c, s, gate } = await open();
      gate.mode = "lost-success";
      if (kind === "confirm") await confirm(p);
      else await decline(p);
      await idle(p);
      ok(mutations(s).length === 1, "lost ack no retry");
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          kind === "confirm"
            ? "current authorised status"
            : "could not be verified",
        ),
        "lost ack read establishes only allowed evidence",
      );
      await shot(p, kind + "-lost-ack");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" && o.name === "provider_confirm_request"
          ? held
          : undefined;
      await confirm(p);
      await p.waitForFunction(
        () => document.body.dataset.incomingOperation === "submitting",
      );
      await p.locator(".confirm-btn").evaluate((b) => {
        for (let i = 0; i < 3; i++) b.dispatchEvent(new Event("click"));
      });
      await p
        .locator("#refreshIncomingBtn")
        .evaluate((b) => b.dispatchEvent(new Event("click")));
      ok(mutations(s).length === 1, "duplicate submission prevented");
      ok(
        calls(s, "provider_service_requests").length === 1,
        "no refresh during mutation",
      );
      ok(
        (await p.locator("#selectedIncomingTitle").textContent()) ===
          "Home Cleaning",
        "no request switch mid operation",
      );
      await shot(p, "action-loading");
      release();
      await idle(p);
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" && o.name === "provider_service_requests"
          ? held
          : undefined;
      await p.locator("#refreshIncomingBtn").click();
      await p.locator("#refreshIncomingBtn").evaluate((b) => {
        for (let i = 0; i < 3; i++) b.dispatchEvent(new Event("click"));
      });
      ok(calls(s, "provider_service_requests").length === 2, "refresh lock");
      ok(
        await p.locator(".confirm-btn").isDisabled(),
        "refresh pauses actions",
      );
      await shot(p, "loading");
      release();
      await settle(p);
      gate.hold = null;
      gate.requestFail = true;
      await p.locator("#refreshIncomingBtn").click();
      await settle(p);
      ok(
        (await p.locator(".incoming-card").count()) === 6,
        "failed refresh cache",
      );
      ok(await p.locator(".confirm-btn").isDisabled(), "stale action disabled");
      await shot(p, "refresh-error");
      gate.requestFail = false;
      await p.locator("#refreshIncomingBtn").click();
      await settle(p);
      ok(await p.locator(".confirm-btn").isEnabled(), "refresh recovery");
      await c.close();
    }
    {
      const { p, c, gate } = await open({ initialError: true });
      ok(
        (await p.locator("#awaitingCount").textContent()) === "—",
        "no false zero",
      );
      await shot(p, "initial-error");
      await axe(p, "initial error");
      gate.requestFail = false;
      await p.locator("#refreshIncomingBtn").click();
      await settle(p);
      ok((await p.locator(".incoming-card").count()) === 6, "initial retry");
      await c.close();
    }
    {
      const { p, c } = await open({ participantError: true });
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "could not be checked",
        ),
        "participant error explicit",
      );
      ok(
        !(await p.locator("#incomingDetailsBody").textContent()).includes(
          "Identity not verified",
        ),
        "no fabricated unverified identity",
      );
      ok(
        await p.locator(".confirm-btn").isEnabled(),
        "participant failure independent",
      );
      await shot(p, "participant-error");
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => (t.service_requests = []),
      });
      ok(
        (await p.locator("#awaitingCount").textContent()) === "0",
        "real empty count",
      );
      ok(
        (await p.locator("#incomingList").textContent()).includes(
          "No Incoming Requests",
        ),
        "empty copy",
      );
      ok(
        (await p.locator("#incomingList a").getAttribute("href")) ===
          "edit-profile.html",
        "empty useful route",
      );
      await shot(p, "empty");
      await axe(p, "empty");
      await c.close();
    }
    {
      const { p, c } = await open({
        width: 320,
        prepare: (t) => {
          t.service_requests = [t.service_requests[0]];
          Object.assign(t.service_requests[0], {
            title: "<img src=x onerror=alert(1)> " + "Long title ".repeat(20),
            category: "Cleaning ".repeat(10),
            preferred_date: null,
            preferred_time: null,
            budget: null,
          });
        },
      });
      await p.locator(".incoming-card").click();
      ok(
        !(await p.locator("#incomingDetailsBody img").count()),
        "safe DOM text",
      );
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "Date unavailable",
        ),
        "missing date",
      );
      ok(
        (await p.locator("#incomingDetailsBody").textContent()).includes(
          "Time unavailable",
        ),
        "missing time",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long title no overflow",
      );
      await shot(p, "long-content-320");
      await c.close();
    }
    {
      const { p, c, s } = await open({ url: "?request_id=FOREIGN" });
      ok(
        (await p
          .locator(".incoming-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "REQ-15",
        "URL ID not trusted",
      );
      s.tables.service_requests[0].status = "confirmed";
      await p.locator("#refreshIncomingBtn").click();
      await settle(p);
      ok(
        (await p
          .locator(".incoming-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "REQ-14",
        "removed selection moves safely",
      );
      ok(!mutations(s).length, "removal handled by read");
      await c.close();
    }
    {
      const { p, c } = await open();
      await p.locator(".incoming-card").first().focus();
      await p.keyboard.press("Enter");
      await p.locator(".confirm-btn").click();
      await p.locator("#submitIncomingConfirm").focus();
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator("#cancelIncomingConfirm")
          .evaluate((e) => e === document.activeElement),
        "native modal trap",
      );
      await p.setViewportSize({ width: 390, height: 844 });
      await p.keyboard.press("Escape");
      ok(
        await p.locator(".confirm-btn").isVisible(),
        "resize keeps modal subject details visible",
      );
      await p.locator("#backToIncoming").click();
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile preserved",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notifications preserved",
      );
      await p.keyboard.press("Escape");
      await c.close();
    }
    for (const role of ["client", "admin"]) {
      const { p, c, s } = await open({ role, noWait: true });
      const deadline = Date.now() + 12000;
      while (new URL(p.url()).pathname !== "/login.html") {
        if (Date.now() > deadline) throw Error("Role redirect timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      ok(
        !calls(s, "provider_service_requests").length && !mutations(s).length,
        "role separation",
      );
      await c.close();
    }
    ok(!errors.length, "no browser errors " + errors.join(","));
    ok(!external.length, "no external traffic: " + external.join(","));
    fs.writeFileSync(
      `${out}/responsive-metrics.json`,
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      `${out}/validation/focused.json`,
      JSON.stringify(
        {
          assertions: checks,
          axeScans: scans,
          axeViolations: 0,
          liveBackend: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} Incoming Requests assertions; ${scans} axe scans; synthetic offline fixtures only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
