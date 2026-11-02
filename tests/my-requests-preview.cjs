/* Local synthetic request-history interactions; never proves live RLS/RPC permissions. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4207";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Loopback only",
);
const reviewed = "b22ec7de716a991bcdaf522846a1e1e53db3b87d";
const out = path.resolve("docs/my-requests");
for (const dir of ["screenshots", "before", "validation"])
  fs.mkdirSync(path.join(out, dir), { recursive: true });
const now = Date.parse("2026-11-02T10:00:00Z");
function data() {
  const t = seed();
  t.users.find((u) => u.id === ids.client).full_name = "Alya Lim";
  t.users.find((u) => u.id === ids.client).user_code = "C-SYNTHETIC";
  const sample = t.service_requests[0];
  const statuses = [
    "pending",
    "provider_selected",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "pending",
    "confirmed",
    "completed",
    "cancelled",
    "disputed",
    null,
  ];
  const titles = [
    "Home cleaning for a three-bedroom apartment",
    "Kitchen tap repair",
    "Grocery pickup and delivery",
    "Furniture moving assistance",
    "Mathematics revision",
    "Laptop troubleshooting",
    "Weekly room cleaning",
    "Document delivery",
    "Event setup",
    "Personal runner",
    "Synthetic other service",
    "Service awaiting status update",
  ];
  const categories = [
    "Cleaning",
    "Repair",
    "Delivery",
    "Moving Help",
    "Tutoring",
    "Repair",
    "Cleaning",
    "Delivery",
    "Other",
    "Errands",
    "Other",
    "Other",
  ];
  const ages = [0, 1, 3, 6, 7, 10, 20, 29, 30, 60, 90, 120];
  t.service_requests = statuses.map((status, i) => ({
    ...sample,
    request_id: `RQ-${String(i + 1).padStart(2, "0")}`,
    title: titles[i],
    category: categories[i],
    service_type: i === 0 ? "Home Cleaning" : categories[i] + " service",
    status,
    location: "Synthetic Likas, Sabah",
    preferred_date: "2027-01-12",
    preferred_time: "11:00:00",
    budget: i === 2 ? null : 120.25,
    created_at: new Date(now - ages[i] * 86400000).toISOString(),
    selected_provider_id: status === "pending" ? null : ids.provider,
  }));
  t.service_requests.push({
    ...sample,
    request_id: "FOREIGN-PRIVATE",
    client_id: "unrelated-client",
    title: "Unrelated private request",
  });
  return t;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let checks = 0,
    scans = 0;
  const metrics = [],
    errors = [],
    external = [];
  const ok = (value, label) => {
    assert(value, label);
    checks++;
  };
  const listQuery = (o) => o.kind === "query" && o.table === "service_requests";
  const cancels = (s) =>
    s.calls.filter(
      (o) => o.kind === "rpc" && o.name === "client_cancel_request",
    );
  async function open(opt = {}) {
    const c = await browser.newContext({
      viewport: { width: opt.width || 1536, height: opt.height || 900 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
    });
    const tables = data();
    if (opt.prepare) opt.prepare(tables);
    const s = await install(c, {
      tables,
      role: opt.role || "client",
      fail: opt.fail,
      delay: opt.delay,
      session: opt.session,
    });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        opt.before &&
        ["/client/my-requests.html", "/js/client-my-requests.js"].includes(
          u.pathname,
        )
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
      if (
        opt.dest &&
        /^\/client\/(request-details|create-request|dashboard|messages)\.html$/.test(
          u.pathname,
        )
      )
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic destination</title><main>Offline navigation destination</main>",
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.setFixedTime(new Date(now));
    await p.goto(base + "/client/my-requests.html");
    if (!opt.blocked && !opt.before && !opt.noWait)
      await p.waitForFunction(
        () => document.body.dataset.requestsReady === "true",
      );
    if (opt.before) await p.locator(".incoming-card").first().waitFor();
    return { p, c, s };
  }
  const idsOn = (p) =>
    p
      .locator("#requestsList .requests-card")
      .evaluateAll((es) => es.map((e) => e.dataset.requestId));
  async function shot(p, name, dir = "screenshots") {
    await p.evaluate(() => {
      scrollTo(0, 0);
      const e = document.createElement("aside");
      e.id = "syntheticReviewBanner";
      e.textContent = "OFFLINE REVIEW · SYNTHETIC DATA · NO LIVE SUPABASE";
      e.style =
        "padding:7px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 11px/1.5 Arial;position:relative;z-index:10000";
      document.body.prepend(e);
    });
    await p.screenshot({
      path: path.join(out, dir, name + ".png"),
      fullPage: !name.includes("dialog"),
    });
    await p.locator("#syntheticReviewBanner").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const v = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    ok(!v.length, `axe ${label}: ${JSON.stringify(v)}`);
    scans++;
  }
  const stats = (p) => p.locator(".request-stat strong").allTextContents();
  async function cancelOpen(p, id) {
    await p
      .locator(`.requests-action-trigger[data-request-id="${id}"]`)
      .click();
    await p.locator(`.cancel-btn[data-request-id="${id}"]`).click();
    await p.locator("#serviceReasonSelect").waitFor();
  }
  async function waitMsg(p, value) {
    await p.waitForFunction(
      (value) =>
        document.querySelector("#messageBox").textContent.includes(value),
      value,
    );
  }
  try {
    for (const [width, height] of [
      [1920, 1080],
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1024, 900],
      [768, 1000],
      [390, 844],
      [320, 800],
    ]) {
      const { p, c, s } = await open({ width, height });
      ok(
        (await p.locator("#userName").textContent()) === "Alya Lim",
        "authenticated profile name",
      );
      ok(
        (await p.locator("#userRole").textContent()).includes("C-SYNTHETIC"),
        "real fixture user code",
      );
      ok(
        JSON.stringify(await stats(p)) ===
          JSON.stringify(["12", "2", "4", "2", "2"]),
        "full owned statistics, unknowns retained",
      );
      ok(
        (await idsOn(p)).join(",") === "RQ-01,RQ-02,RQ-03,RQ-04,RQ-05",
        "first five newest",
      );
      ok(
        !(await p.locator("#requestsList").textContent()).includes(
          "FOREIGN-PRIVATE",
        ),
        "foreign request excluded",
      );
      const q = s.calls.filter(listQuery);
      ok(q.length === 1, "one request fetch");
      ok(
        q[0].calls.some(
          (c) => c[0] === "eq" && c[1] === "client_id" && c[2] === ids.client,
        ),
        "query constrained by caller id",
      );
      ok(
        q[0].calls.some(
          (c) =>
            c[0] === "order" &&
            c[1] === "created_at" &&
            c[2].ascending === false,
        ),
        "original newest query contract",
      );
      ok(
        (await p
          .locator('.side-menu a[aria-current="page"]')
          .getAttribute("href")) === "my-requests.html",
        "correct active navigation",
      );
      const m = await p.evaluate(() => {
        const r = (s) => {
          const x = document.querySelector(s).getBoundingClientRect();
          return { x: x.x, y: x.y + scrollY, width: x.width, height: x.height };
        };
        return {
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          list: r(".requests-list-panel"),
          guidance: r(".requests-guidance"),
          stats: r(".requests-stats"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no horizontal overflow " + width);
      if (width >= 1366)
        ok(
          m.list.width > m.guidance.width && m.list.x < m.guidance.x,
          "list gets majority width",
        );
      else ok(m.guidance.y > m.list.y, "guidance follows list");
      const bad = await p
        .locator(".my-requests-content :is(button,input,select,a.btn)")
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                r.width &&
                (r.width < 43 || r.height < 43 || r.right > innerWidth + 1)
              );
            })
            .map((e) => e.id || e.className),
        );
      ok(!bad.length, "control bounds " + width + ": " + bad);
      await axe(p, "viewport " + width);
      await shot(p, "requests-" + width);
      if (width <= 1000) {
        await p.locator(".navigation-toggle").click();
        ok(
          (await p
            .locator(".navigation-toggle")
            .getAttribute("aria-expanded")) === "true",
          "mobile navigation opens",
        );
        await p.locator(".side-menu a").first().focus();
        await p.keyboard.press("Escape");
        ok(
          await p
            .locator(".navigation-toggle")
            .evaluate((e) => e === document.activeElement),
          "mobile navigation Escape focus",
        );
      }
      ok(!cancels(s).length, "rendering does not cancel");
      await c.close();
      console.log("PASS layout/axe " + width);
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, "requests-" + width, "before");
      await c.close();
    }
    {
      const { p, c, s } = await open({ dest: true });
      const original = await stats(p),
        queries = s.calls.filter(listQuery).length;
      await p.locator("#requestSearch").fill("  HOME   cleaning  ");
      ok((await idsOn(p)).join(",") === "RQ-01", "trim/case/whitespace search");
      await shot(p, "search-results");
      await p.locator("#requestSearch").fill("rq-02");
      ok((await idsOn(p)).join(",") === "RQ-02", "request id search");
      await p.locator("#requestSearch").fill("home cleaning");
      ok((await idsOn(p)).join(",") === "RQ-01", "service type search");
      await p.locator("#resetFiltersBtn").click();
      await p.locator("#categoryFilter").selectOption("Cleaning");
      ok((await idsOn(p)).join(",") === "RQ-01,RQ-07", "category filter");
      await shot(p, "category-filter");
      await p.locator("#statusFilter").selectOption("pending");
      ok(
        (await idsOn(p)).join(",") === "RQ-01,RQ-07",
        "combined status/category",
      );
      await shot(p, "status-filter");
      await p.locator("#timeFilter").selectOption("7");
      ok(
        (await idsOn(p)).join(",") === "RQ-01",
        "combined time filter uses creation date",
      );
      ok(
        JSON.stringify(await stats(p)) === JSON.stringify(original),
        "filters never change full totals",
      );
      await p.locator("#requestSearch").fill("no match");
      ok(
        await p
          .getByRole("heading", { name: "No requests match your filters" })
          .isVisible(),
        "filtered empty distinct",
      );
      await shot(p, "no-matches");
      await p.locator("#clearFiltersBtn").click();
      ok((await idsOn(p)).length === 5, "clear restores full list");
      for (const [days, count] of [
        ["7", 5],
        ["30", 9],
        ["90", 11],
      ]) {
        await p.locator("#timeFilter").selectOption(days);
        ok(
          (await p.locator("#requestsResultCount").textContent()).includes(
            `of ${count} requests`,
          ),
          "rolling inclusive creation interval " + days,
        );
      }
      await p.locator("#resetFiltersBtn").click();
      await p.getByRole("button", { name: "Next page", exact: true }).click();
      ok(
        (await idsOn(p)).join(",") === "RQ-06,RQ-07,RQ-08,RQ-09,RQ-10",
        "page 2 no gaps",
      );
      await shot(p, "pagination-page-2");
      await p.getByRole("button", { name: "Next page", exact: true }).click();
      ok(
        (await idsOn(p)).join(",") === "RQ-11,RQ-12",
        "unknown/missing statuses retained under All",
      );
      ok(
        await p
          .getByRole("button", { name: "Next page", exact: true })
          .isDisabled(),
        "last page disabled",
      );
      await p.locator("#requestSort").selectOption("oldest");
      ok(
        (await idsOn(p))[0] === "RQ-12",
        "oldest by creation date and page reset",
      );
      ok(
        await p
          .getByRole("button", { name: "Previous page", exact: true })
          .isDisabled(),
        "sort reset first",
      );
      await p.locator("#resetFiltersBtn").click();
      ok((await idsOn(p))[0] === "RQ-01", "reset sort");
      ok(
        s.calls.filter(listQuery).length === queries,
        "all filters/sort/page local, no extra query",
      );
      const card = p.locator('.requests-card[data-request-id="RQ-01"]');
      ok(
        (await card.locator("a").first().getAttribute("href")) ===
          "request-details.html?request_id=RQ-01",
        "details route",
      );
      const trigger = card.locator(".requests-action-trigger");
      await trigger.focus();
      await p.keyboard.press("Enter");
      ok(
        (await trigger.getAttribute("aria-expanded")) === "true",
        "keyboard disclosure",
      );
      ok(
        (await card
          .getByRole("link", { name: "Edit Request" })
          .getAttribute("href")) === "create-request.html?request_id=RQ-01",
        "pending edit route",
      );
      await axe(p, "actions menu");
      await shot(p, "actions-menu");
      await p.keyboard.press("Escape");
      ok(
        await trigger.evaluate((e) => e === document.activeElement),
        "Escape restores trigger",
      );
      ok(
        await card.locator(".requests-action-menu").isHidden(),
        "Escape closes menu",
      );
      await trigger.click();
      await p.locator("#requestSearch").click();
      ok(
        await card.locator(".requests-action-menu").isHidden(),
        "outside interaction closes menu",
      );
      for (const id of ["RQ-02", "RQ-03"]) {
        const r = p.locator(`.requests-card[data-request-id="${id}"]`);
        await r.locator(".requests-action-trigger").click();
        ok(
          await r
            .getByRole("button", { name: "Cancel Request", exact: true })
            .isVisible(),
          "eligible cancel " + id,
        );
        ok(
          (await r.getByRole("link", { name: "Edit Request" }).count()) === 0,
          "no ineligible edit " + id,
        );
      }
      for (const id of ["RQ-04", "RQ-05"])
        ok(
          (await p
            .locator(
              `.requests-card[data-request-id="${id}"] .requests-action-trigger`,
            )
            .count()) === 0,
          "no empty menu " + id,
        );
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile Edit Profile retained",
      );
      ok(
        await p
          .locator('#profileDropdown a[href="verification.html"]')
          .isVisible(),
        "verification menu retained",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notification menu",
      );
      await p.keyboard.press("Escape");
      await card.getByRole("link", { name: /View details:/ }).click();
      await p.waitForURL("**/request-details.html?request_id=RQ-01");
      ok(!cancels(s).length, "navigation read-only");
      await c.close();
    }
    for (const mode of ["empty", "error", "throw"]) {
      let fail = mode !== "empty";
      const { p, c, s } = await open({
        prepare: (t) => {
          if (mode === "empty") t.service_requests = [];
        },
        fail: (o) =>
          fail && listQuery(o) ? (mode === "throw" ? "throw" : true) : false,
      });
      if (mode === "empty") {
        ok(
          await p
            .getByRole("heading", { name: "No service requests yet" })
            .isVisible(),
          "true empty",
        );
        ok(
          JSON.stringify(await stats(p)) ===
            JSON.stringify(["0", "0", "0", "0", "0"]),
          "successful empty zeros",
        );
        await shot(p, "empty-history");
      } else {
        ok(
          await p
            .getByRole("heading", { name: "Unable to load your requests" })
            .isVisible(),
          "fetch failure " + mode,
        );
        ok(
          (await stats(p)).every((x) => x === "—"),
          "error not zero",
        );
        await axe(p, "error " + mode);
        if (mode === "error") await shot(p, "fetch-error");
        fail = false;
        await p.locator("#retryRequestsBtn").click();
        await p.locator(".requests-card").first().waitFor();
        ok((await stats(p))[0] === "12", "retry really fetches");
      }
      if (mode === "empty")
        ok(
          await p.locator("#requestsPagination").isHidden(),
          "empty has no misleading page 2",
        );
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c } = await open({
        noWait: true,
        delay: (o) => (listQuery(o) ? hold : undefined),
      });
      await p.waitForFunction(
        () =>
          document.querySelector("#requestsList").getAttribute("aria-busy") ===
          "true",
      );
      ok(
        (await stats(p)).every((v) => v === "—"),
        "loading never claims zero",
      );
      ok(
        await p.locator("#requestSearch").isDisabled(),
        "filters wait for authorized data",
      );
      await shot(p, "loading");
      release();
      await p.locator(".requests-card").first().waitFor();
      await c.close();
    }
    {
      const { p, c, s } = await open();
      await p.locator("#statusFilter").selectOption("pending");
      await cancelOpen(p, "RQ-01");
      await axe(p, "cancellation dialog");
      await shot(p, "cancellation-dialog");
      await p.locator(".service-reason-confirm").click();
      ok(await p.locator("#serviceReasonError").isVisible(), "reason required");
      ok(!cancels(s).length, "missing reason never sends RPC");
      await p.locator(".service-reason-confirm").focus();
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator(".service-reason-close")
          .evaluate((e) => e === document.activeElement),
        "dialog focus trap",
      );
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator('.cancel-btn[data-request-id="RQ-01"]')
          .evaluate((e) => e === document.activeElement),
        "dialog restores action",
      );
      ok(!cancels(s).length, "Escape no cancellation");
      await p.keyboard.press("Escape");
      await cancelOpen(p, "RQ-01");
      await p.locator("#serviceReasonSelect").selectOption("schedule_changed");
      await p.locator("#serviceReasonDetails").fill("Synthetic explanation");
      await p.locator(".service-reason-confirm").click();
      await waitMsg(p, "Request cancelled.");
      await p.waitForFunction(
        () => document.querySelector("#pendingRequests").textContent === "1",
      );
      ok(
        (await idsOn(p)).join(",") === "RQ-07",
        "status filter preserved after cancellation",
      );
      ok(
        (await p.locator("#statusFilter").inputValue()) === "pending",
        "filter context retained",
      );
      ok((await stats(p)).join(",") === "12,1,4,2,3", "totals refreshed");
      const op = cancels(s)[0];
      ok(
        Object.keys(op.args).sort().join(",") === "p_reason,p_request_id",
        "exact cancel signature",
      );
      ok(
        op.args.p_request_id === "RQ-01" &&
          op.args.p_reason === "Schedule changed: Synthetic explanation",
        "same reason contract",
      );
      ok(
        s.tables.service_requests.some(
          (r) => r.request_id === "RQ-01" && r.status === "cancelled",
        ),
        "cancel history retained",
      );
      await shot(p, "cancellation-success");
      await p.locator("#statusFilter").selectOption("cancelled");
      ok((await idsOn(p)).includes("RQ-01"), "cancelled still viewable");
      ok(
        (await p.locator(".requests-action-trigger").count()) === 0,
        "cancelled has no menu",
      );
      await c.close();
    }
    for (const width of [390, 320]) {
      const { p, c, s } = await open({ width, height: 844 });
      await p
        .locator('.requests-action-trigger[data-request-id="RQ-01"]')
        .click();
      const menu = p.locator(
        '.requests-card[data-request-id="RQ-01"] .requests-action-menu',
      );
      await menu.scrollIntoViewIfNeeded();
      const bounds = await menu.boundingBox();
      ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        "mobile menu fits " + width,
      );
      await axe(p, "mobile menu " + width);
      await p.locator('.cancel-btn[data-request-id="RQ-01"]').click();
      await p.locator("#serviceReasonSelect").waitFor();
      await axe(p, "mobile reason dialog " + width);
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "mobile dialog bounds " + width,
      );
      await shot(p, "cancellation-dialog-" + width);
      await p.keyboard.press("Escape");
      ok(!cancels(s).length, "mobile dismiss does not cancel");
      await c.close();
    }
    {
      let cancelled = false;
      const { p, c, s } = await open({
        fail: (o) => {
          if (o.name === "client_cancel_request") {
            cancelled = true;
            return false;
          }
          return cancelled && listQuery(o);
        },
      });
      await cancelOpen(p, "RQ-01");
      await p.locator("#serviceReasonSelect").selectOption("other");
      await p.locator(".service-reason-confirm").click();
      await p
        .getByRole("heading", { name: "Unable to load your requests" })
        .waitFor();
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          "Request cancelled.",
        ),
        "committed cancellation remains acknowledged when refresh fails",
      );
      ok(
        (await stats(p)).every((v) => v === "—"),
        "failed refresh does not claim fresh statistics",
      );
      ok(
        s.tables.service_requests.find((r) => r.request_id === "RQ-01")
          .status === "cancelled",
        "failed refresh never restores an old pending status",
      );
      cancelled = false;
      await p.locator("#retryRequestsBtn").click();
      await p.locator(".requests-card").first().waitFor();
      ok(
        await p
          .locator('.requests-card[data-request-id="RQ-01"] .status-cancelled')
          .isVisible(),
        "retry confirms cancelled record retained",
      );
      ok(
        cancels(s).length === 1,
        "refresh retry never repeats cancellation RPC",
      );
      await c.close();
    }
    for (const mode of ["error", "throw"]) {
      const { p, c, s } = await open({
        fail: (o) =>
          o.name === "client_cancel_request"
            ? mode === "throw"
              ? "throw"
              : true
            : false,
      });
      await cancelOpen(p, "RQ-01");
      await p.locator("#serviceReasonSelect").selectOption("other");
      await p.locator(".service-reason-confirm").click();
      await waitMsg(
        p,
        mode === "throw"
          ? "could not be confirmed"
          : "Synthetic request failed",
      );
      ok(
        s.tables.service_requests.find((r) => r.request_id === "RQ-01")
          .status === "pending",
        "failure never changes local/server fixture state",
      );
      ok((await stats(p))[1] === "2", "failure statistics truthful");
      ok(
        await p.locator('.cancel-btn[data-request-id="RQ-01"]').isEnabled(),
        "failure action restored",
      );
      if (mode === "error") await shot(p, "cancellation-error");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        delay: (o) => (o.name === "client_cancel_request" ? hold : undefined),
      });
      await cancelOpen(p, "RQ-01");
      await p.locator("#serviceReasonSelect").selectOption("no_longer_needed");
      await p.locator(".service-reason-confirm").click();
      await p.waitForFunction(
        () =>
          document.querySelector('.cancel-btn[data-request-id="RQ-01"]')
            .disabled,
      );
      await p.locator("#requestSearch").fill("Home cleaning");
      await p.locator(".requests-action-trigger").click();
      ok(
        await p.locator(".cancel-btn").isDisabled(),
        "in-flight lock survives re-render",
      );
      await p.locator(".cancel-btn").dispatchEvent("click");
      release();
      await waitMsg(p, "Request cancelled.");
      await p.waitForFunction(
        () => document.querySelector("#cancelledRequests").textContent === "3",
      );
      ok(cancels(s).length === 1, "duplicate RPC prevented");
      await c.close();
    }
    {
      const { p, c, s } = await open({
        prepare: (t) => {
          const r = t.service_requests[0];
          r.request_id = 'A/&?"<x>';
          r.title = '<img src=x onerror="window.__xss=1">';
          r.location = "Long unbroken address " + "ABCDEFG".repeat(90);
          r.category = "Unexpected <category>";
          r.status = "unusual_<status>";
          r.service_type = null;
          r.budget = "not money";
          r.preferred_date = "2026-02-30";
          r.preferred_time = "29:61";
          t.service_requests = t.service_requests.slice(0, 1);
        },
      });
      ok(
        (await p.locator(".requests-card").textContent()).includes(
          "<img src=x",
        ),
        "dynamic title rendered as text",
      );
      ok(
        (await p.locator("#requestsList img").count()) === 0,
        "no injected markup",
      );
      ok(!(await p.evaluate(() => window.__xss)), "no script execution");
      ok(
        (await p.locator(".requests-card a").getAttribute("href")) ===
          "request-details.html?request_id=" + encodeURIComponent('A/&?"<x>'),
        "encoded unusual id",
      );
      ok(
        (await p.locator(".requests-card").textContent()).includes(
          "Budget unavailable",
        ),
        "bad budget fallback",
      );
      ok(
        (await p.locator(".requests-card").textContent()).includes(
          "Date not specified",
        ),
        "bad date fallback",
      );
      ok(
        (await p.locator(".requests-card").textContent()).includes(
          "Time not specified",
        ),
        "bad time fallback",
      );
      ok(
        await p.locator("#requestsPagination").isHidden(),
        "single result no fake pages",
      );
      for (const width of [1440, 390, 320]) {
        await p.setViewportSize({ width, height: 900 });
        ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth === innerWidth,
          ),
          "long unbroken data bounds " + width,
        );
        await axe(p, "long/malformed " + width);
      }
      await shot(p, "long-data-320");
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          const sample = t.service_requests[0];
          t.service_requests = [
            { ...sample, request_id: "B", created_at: "invalid" },
            { ...sample, request_id: "A", created_at: null },
            {
              ...sample,
              request_id: "D",
              created_at: new Date(now + 86400000).toISOString(),
            },
            {
              ...sample,
              request_id: "C",
              created_at: new Date(now).toISOString(),
            },
            {
              ...sample,
              request_id: "E",
              created_at: new Date(now).toISOString(),
            },
          ];
        },
      });
      ok(
        (await idsOn(p)).join(",") === "D,C,E,A,B",
        "stable creation order, id tiebreak, missing last",
      );
      await p.locator("#requestSort").selectOption("oldest");
      ok(
        (await idsOn(p)).join(",") === "C,E,D,A,B",
        "oldest deterministic missing last",
      );
      await p.locator("#timeFilter").selectOption("7");
      ok(
        (await idsOn(p)).join(",") === "C,E",
        "future and malformed creation times excluded from recent filter",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({
        prepare: (t) =>
          t.notifications.push({
            id: "notice-1",
            user_id: ids.client,
            is_read: false,
            title: "Synthetic request update",
            body: "Offline notification",
            created_at: new Date(now).toISOString(),
          }),
      });
      await p.waitForFunction(
        () => document.querySelector(".notification-badge").textContent === "1",
      );
      ok(true, "actual fixture unread count");
      await p.locator("#profileMenuTrigger").click();
      await p.locator("#profileLogoutBtn").click();
      await p.waitForURL("**/login.html");
      ok(
        s.authEvents.some((o) => o.name === "signOut"),
        "existing logout",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ motion: true });
      await p.waitForTimeout(750);
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite idle animation",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".requests-hero")
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion removes entrance",
      );
      await c.close();
    }
    ok(!errors.length, "no browser exceptions: " + errors.join(","));
    ok(
      !external.length,
      "no unexpected external traffic (all blocked): " + external.join(","),
    );
    fs.writeFileSync(
      path.join(out, "responsive-metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(out, "validation/focused.json"),
      JSON.stringify(
        {
          type: "Offline synthetic fixture only",
          assertions: checks,
          axeScans: scans,
          axeViolations: 0,
          liveSupabase: false,
          viewports: metrics.map((m) => m.width),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} focused request-history assertions; ${scans} axe scans; no live Supabase`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
