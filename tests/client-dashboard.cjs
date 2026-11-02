/* Real Client dashboard/modules with local synthetic fixtures; no live project traffic. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4198";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Loopback server required",
);
const out = path.resolve(
  process.env.CLIENT_DASHBOARD_ARTIFACTS || "docs/client-dashboard",
);
for (const dir of ["screenshots", "before"])
  fs.mkdirSync(path.join(out, dir), { recursive: true });
function tables() {
  const t = seed();
  t.users.find((u) => u.id === ids.client).full_name = "Alya Lim";
  const statuses = [
    "pending",
    "provider_selected",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "pending",
    "completed",
  ];
  t.service_requests = statuses.map((status, i) => ({
    request_id: `DEMO-${i + 1}`,
    client_id: ids.client,
    selected_provider_id: status === "pending" ? null : ids.provider,
    title: [
      "Room cleaning",
      "Laptop setup",
      "Study support",
      "Moving a bookshelf",
      "Garden help",
      "Parcel collection",
      "Kitchen tap repair",
      "Home cleaning",
    ][i],
    category: [
      "Cleaning",
      "Repair",
      "Tutoring",
      "Moving Help",
      "Other",
      "Errands",
      "Repair",
      "Cleaning",
    ][i],
    location: "Synthetic review location, Sabah",
    preferred_date: "2026-11-12",
    preferred_time: "11:00:00",
    budget: 50 + i * 10,
    status,
    created_at: `2026-11-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
  }));
  t.service_requests.push({
    ...t.service_requests[0],
    request_id: "FOREIGN",
    client_id: "unrelated-client",
    title: "FOREIGN PRIVATE REQUEST",
    created_at: "2099-01-01T00:00:00Z",
  });
  t.notifications = Array.from({ length: 11 }, (_, i) => ({
    id: `note-${i}`,
    user_id: ids.client,
    title: "Synthetic service update",
    message: "A sample notification for offline review.",
    is_read: false,
    created_at: `2026-10-${String(10 + i).padStart(2, "0")}T08:00:00Z`,
  }));
  return t;
}
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const errors = [],
    external = [],
    metrics = [];
  let checks = 0;
  function ok(value, label) {
    assert(value, label);
    checks++;
  }
  async function open(opt = {}) {
    const c = await b.newContext({
      viewport: { width: opt.width || 1440, height: opt.height || 900 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
    });
    const t = tables();
    if (opt.prepare) opt.prepare(t);
    const s = await install(c, {
      role: opt.role || "client",
      tables: t,
      fail: opt.fail,
      delay: opt.delay,
    });
    if (opt.before)
      for (const f of ["client/dashboard.html", "js/client.js"])
        await c.route(`**/${f}`, (r) =>
          r.fulfill({
            contentType: f.endsWith(".js") ? "text/javascript" : "text/html",
            body: execFileSync(
              "git",
              [
                "show",
                `0ab95b0a202bb790ba1495174d07a5eead115663:igotu_v2/${f}`,
              ],
              { encoding: "utf8" },
            ),
          }),
        );
    if (opt.noShell)
      await c.route("**/js/app-shell.js", (r) =>
        r.fulfill({ contentType: "text/javascript", body: "" }),
      );
    if (opt.noArt)
      await c.route("**/assets/client-dashboard/welcome.svg", (r) => r.abort());
    if (opt.stubDestinations)
      await c.route(
        /\/(login|verification|complete-profile|request-details|create-request|my-requests|messages|edit-profile)\.html(\?.*)?$/,
        (r) =>
          r.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>Synthetic destination</title><main>Offline navigation destination</main>",
          }),
      );
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (new URL(r.url()).origin !== new URL(base).origin)
        external.push(new URL(r.url()).origin);
    });
    await p.goto(base + "/client/dashboard.html");
    return { p, c, s };
  }
  async function ready(p) {
    await p.waitForFunction(
      () => document.body.dataset.accessState === "allowed",
    );
    await p.waitForFunction(
      () => document.querySelector("#totalRequests").textContent !== "—",
    );
  }
  async function shot(p, name, dir = "screenshots", fullPage = true) {
    await p.evaluate((fullPage) => {
      const label = document.createElement("aside");
      label.id = "syntheticReviewLabel";
      label.textContent =
        "OFFLINE REVIEW · SYNTHETIC FIXTURES · NO LIVE SUPABASE";
      label.style =
        "background:#fff4cd;color:#463b15;padding:7px 12px;text-align:center;font:700 11px/1.5 Arial";
      const modal = !fullPage && document.querySelector("dialog[open]");
      (modal || document.body).prepend(label);
      if (!fullPage && !modal) label.style.position = "fixed";
      if (!fullPage && !modal) label.style.inset = "0 0 auto 0";
    }, fullPage);
    await p.screenshot({ path: path.join(out, dir, name + ".png"), fullPage });
    await p.locator("#syntheticReviewLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const v = await p.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    ok(!v.length, `axe ${label}: ${JSON.stringify(v)}`);
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
      await ready(p);
      ok(
        (await p.locator("#welcomeText").textContent()) ===
          "Hello, Alya Lim 👋",
        "full authenticated name",
      );
      for (const [id, value] of [
        ["totalRequests", "8"],
        ["pendingRequests", "2"],
        ["ongoingRequests", "3"],
        ["completedRequests", "2"],
      ])
        ok(
          (await p.locator("#" + id).textContent()) === value,
          `dynamic ${id}`,
        );
      ok(
        (await p.locator("#recentRequests .dashboard-request").count()) === 5,
        "five cards retained locally",
      );
      const shown = width <= 480 ? 3 : 5;
      ok(
        (await p
          .locator("#recentRequests .dashboard-request:visible")
          .count()) === shown,
        "responsive visible request count",
      );
      ok(
        (await p.locator("#dashboardDataStatus").textContent()) ===
          `Showing your ${shown} most recent requests.`,
        "responsive count caption",
      );
      ok(
        (await p.locator(".dashboard-recent #dashboardDataStatus").count()) ===
          1,
        "count inside Recent Requests",
      );
      ok(
        (await p
          .locator(
            '.sidebar a[href="edit-profile.html"],.dashboard-quick a[href="edit-profile.html"]',
          )
          .count()) === 0,
        "duplicate profile links removed",
      );
      ok(
        (await p.locator(".dashboard-quick-link").count()) === 4,
        "exactly four Quick Actions",
      );
      if (width <= 480) {
        for (const selector of [
          ".dashboard-request-id",
          ".dashboard-meta-chip > span",
          ".dashboard-request-location > span",
          ".status-pill",
        ])
          ok(
            await p
              .locator(selector)
              .first()
              .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 13),
            "readable phone metadata",
          );
      }
      ok(
        !(await p.locator("#recentRequests").textContent()).includes("FOREIGN"),
        "other Client row excluded",
      );
      ok(
        (await p
          .locator("#recentRequests .dashboard-request")
          .first()
          .getAttribute("href")) === "request-details.html?request_id=DEMO-8",
        "newest first, existing route",
      );
      const queries = s.calls.filter(
        (o) => o.kind === "query" && o.table === "service_requests",
      );
      ok(
        queries.length === 1 &&
          queries.every((o) =>
            o.calls.some(
              (c) =>
                c[0] === "eq" && c[1] === "client_id" && c[2] === ids.client,
            ),
          ),
        "single owned request query",
      );
      ok(
        !s.calls.some(
          (o) =>
            o.kind === "query" &&
            o.calls.some((c) =>
              ["insert", "update", "delete", "upsert"].includes(c[0]),
            ),
        ),
        "dashboard load makes no data writes",
      );
      const m = await p.evaluate(() => {
        const r = (s) => {
          const a = document.querySelector(s).getBoundingClientRect();
          return { x: a.x, y: a.y + scrollY, width: a.width, height: a.height };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          hero: r(".dashboard-hero"),
          create: r(".dashboard-create"),
          statistics: r(".stats-grid"),
          recent: r(".dashboard-recent"),
          quick: r(".dashboard-quick"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, `no overflow ${width}`);
      if (width >= 1366)
        ok(
          m.recent.x < m.quick.x && Math.abs(m.recent.y - m.quick.y) < 2,
          "desktop two-panel alignment",
        );
      if (width <= 1024) ok(m.recent.y < m.quick.y, "narrow stacked panels");
      const clipped = await p
        .locator(
          ".dashboard-hero-actions :is(a,button),.dashboard-quick-link,.navigation-toggle,#notificationMenuTrigger,#profileMenuTrigger,#refreshRequestsBtn",
        )
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              const css = getComputedStyle(e);
              return (
                !e.hidden &&
                css.display !== "none" &&
                r.width &&
                (r.height < 44 ||
                  r.width < 44 ||
                  r.left < 0 ||
                  r.right > innerWidth + 1)
              );
            })
            .map((e) => e.id || e.className),
        );
      ok(!clipped.length, `touch/bounds ${width}: ${clipped}`);
      await axe(p, `dashboard ${width}`);
      await shot(p, `dashboard-${width}`);
      if (width === 1366)
        await shot(p, "dashboard-1366-initial", "screenshots", false);
      if (width <= 1000) {
        const toggle = p.locator(".navigation-toggle");
        await toggle.focus();
        await p.keyboard.press("Enter");
        ok(
          (await toggle.getAttribute("aria-expanded")) === "true",
          "keyboard opens navigation",
        );
        ok(await p.locator(".side-menu").isVisible(), "navigation open");
        await p.locator(".side-menu a").last().focus();
        await p.keyboard.press("Escape");
        ok(
          (await toggle.getAttribute("aria-expanded")) === "false",
          "Escape closes navigation",
        );
        ok(
          await toggle.evaluate((e) => e === document.activeElement),
          "Escape restores focus",
        );
      }
      await c.close();
      console.log(`PASS responsive/axe ${width}x${height}`);
    }
    for (const [width, height] of [
      [1536, 864],
      [390, 844],
    ]) {
      const { p, c } = await open({ width, height, before: true });
      await ready(p);
      await shot(p, `dashboard-${width}`, "before");
      await c.close();
    }
    {
      const { p, c } = await open({ stubDestinations: true });
      await ready(p);
      for (const [selector, routes] of [
        [
          ".side-menu a",
          [
            "dashboard.html",
            "create-request.html",
            "my-requests.html",
            "messages.html",
          ],
        ],
        [
          "a.dashboard-quick-link",
          ["create-request.html", "my-requests.html", "messages.html"],
        ],
      ])
        ok(
          JSON.stringify(
            await p
              .locator(selector)
              .evaluateAll((es) => es.map((e) => e.getAttribute("href"))),
          ) === JSON.stringify(routes),
          "real sidebar and quick routes",
        );
      await p.locator("#workflowHelpBtn").focus();
      await p.keyboard.press("Enter");
      ok(
        await p.locator("#workflowHelpDialog").isVisible(),
        "How It Works opens",
      );
      ok(
        /selection\s+is\s+not\s+confirmation/.test(
          await p.locator("#workflowHelpDialog").textContent(),
        ),
        "truthful confirmation guidance",
      );
      ok(
        await p
          .locator("#workflowHelpClose")
          .evaluate((e) => e === document.activeElement),
        "dialog initial focus",
      );
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator("#workflowHelpDialog")
          .evaluate((e) => e.contains(document.activeElement)),
        "native modal traps focus",
      );
      await axe(p, "workflow dialog");
      await shot(p, "workflow-help");
      await p.keyboard.press("Escape");
      ok(
        !(await p.locator("#workflowHelpDialog").isVisible()),
        "dialog closes",
      );
      ok(
        await p
          .locator("#workflowHelpBtn")
          .evaluate((e) => e === document.activeElement),
        "dialog restores opener",
      );
      ok(
        (await p.locator("#clientHelpBtn strong").textContent()) === "Get Help",
        "fourth action is Get Help",
      );
      await p.locator("#clientHelpBtn").focus();
      await p.keyboard.press("Enter");
      ok(await p.locator("#clientHelpDialog").isVisible(), "Get Help opens");
      ok(
        (await p.locator("#clientHelpTitle").textContent()) ===
          "How can we help?",
        "help title",
      );
      ok(
        (await p.locator("#clientHelpDialog summary").count()) === 7,
        "seven practical FAQs",
      );
      const faqText = (
        await p.locator("#clientHelpDialog").textContent()
      ).replace(/\s+/g, " ");
      ok(
        faqText.includes("Selection is not confirmation") &&
          faqText.includes("does not guarantee Provider availability") &&
          faqText.includes("does not collect or process payments"),
        "accurate FAQ guidance",
      );
      ok(
        await p
          .locator("#clientHelpClose")
          .evaluate((e) => e === document.activeElement),
        "help initial focus",
      );
      await p.keyboard.press("Shift+Tab");
      ok(
        await p
          .locator("#clientHelpDialog summary")
          .last()
          .evaluate((e) => e === document.activeElement),
        "backward loop skips collapsed FAQ links",
      );
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator("#clientHelpClose")
          .evaluate((e) => e === document.activeElement),
        "forward loop returns from last question",
      );
      ok(
        await p
          .locator("#clientHelpDialog")
          .evaluate((e) => e.contains(document.activeElement)),
        "help backward focus containment",
      );
      await p.locator("#clientHelpDialog summary").nth(1).focus();
      await p.keyboard.press("Enter");
      ok(
        (await p
          .locator("#clientHelpDialog details")
          .nth(1)
          .getAttribute("open")) !== null,
        "FAQ keyboard expansion",
      );
      const faqRoutes = await p
        .locator("#clientHelpDialog a")
        .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
      ok(
        faqRoutes.every((href) =>
          [
            "create-request.html",
            "my-requests.html",
            "messages.html",
            "verification.html",
          ].includes(href),
        ),
        "only existing help routes",
      );
      await axe(p, "Client Help desktop");
      await p.locator("#clientHelpDialog summary").nth(1).press("Enter");
      await p.locator("#clientHelpClose").focus();
      await shot(p, "get-help-desktop", "screenshots", false);
      for (const width of [390, 320]) {
        await p.setViewportSize({ width, height: 844 });
        ok(
          await p
            .locator("#clientHelpDialog")
            .evaluate((e) => e.scrollWidth <= e.clientWidth),
          "help no horizontal overflow",
        );
        await axe(p, `Client Help ${width}`);
        await shot(p, `get-help-${width}`, "screenshots", false);
      }
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#clientHelpBtn")
          .evaluate((e) => e === document.activeElement),
        "help Escape restores opener",
      );
      await p.locator("#clientHelpBtn").click();
      await p.locator("#clientHelpClose").click();
      ok(
        !(await p.locator("#clientHelpDialog").isVisible()),
        "help Close button works",
      );
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.locator(".dashboard-quick-link").first().click();
      await p.waitForURL("**/client/create-request.html");
      ok(true, "Create action navigates");
      await c.close();
    }
    {
      const { p, c, s } = await open({ stubDestinations: true });
      await ready(p);
      await p.locator("#notificationMenuTrigger").click();
      await p.locator(".notification-dropdown-item").first().waitFor();
      ok(
        (await p.locator("#notificationDropdownCount").textContent()) ===
          "11 unread",
        "actual unread count includes >8",
      );
      ok(
        (await p.locator(".notification-badge").textContent()) === "11",
        "actual badge",
      );
      await axe(p, "notification dropdown");
      await p.locator(".notification-dropdown-item").first().click();
      await p.waitForFunction(
        () =>
          document.querySelector("#notificationDropdownCount").textContent ===
          "10 unread",
      );
      ok(
        s.tables.notifications.filter((n) => n.is_read).length === 1,
        "mark one existing notification",
      );
      await p.locator("#notificationMarkAllBtn").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#notificationDropdownCount").textContent ===
          "0 unread",
      );
      ok(
        s.tables.notifications.every((n) => n.is_read),
        "mark all existing notifications",
      );
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#notificationMenuTrigger")
          .evaluate((e) => e === document.activeElement),
        "notification Escape restores focus",
      );
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="verification.html"]')
          .isVisible(),
        "identity verification link preserved",
      );
      await axe(p, "profile dropdown");
      ok(
        (await p.locator('a[href="edit-profile.html"]').count()) === 1,
        "one Edit Profile entry point",
      );
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile link preserved",
      );
      await shot(p, "account-dropdown-desktop", "screenshots", false);
      await p.setViewportSize({ width: 390, height: 844 });
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "phone profile dropdown works",
      );
      await axe(p, "phone profile dropdown");
      await shot(p, "account-dropdown-390", "screenshots", false);

      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#profileMenuTrigger")
          .evaluate((e) => e === document.activeElement),
        "profile Escape restores focus",
      );
      await p.locator("#profileMenuTrigger").click();
      await p.locator("#profileLogoutBtn").click();
      await p.waitForFunction(() => location.pathname === "/login.html");
      ok(s.session === false, "existing logout clears session");
      await c.close();
    }
    for (const thrown of [false, true]) {
      let fail = true;
      const { p, c, s } = await open({
        fail: (o) =>
          fail && o.kind === "query" && o.table === "service_requests"
            ? thrown
              ? "throw"
              : { code: "42501", message: "PRIVATE INTERNAL ERROR" }
            : false,
      });
      await p.waitForFunction(
        () => document.body.dataset.requestsState === "error",
      );
      ok(
        (await p.locator("#totalRequests").textContent()) === "—",
        "read failure never fake zero",
      );
      ok(
        !(await p.locator("#dashboardDataStatus").textContent()).includes(
          "Showing your",
        ),
        "no count claimed after initial read failure",
      );
      ok(
        (await p.locator("#recentRequests").textContent()).includes(
          "Requests could not be loaded",
        ),
        "clear error",
      );
      ok(
        !(await p.locator("#recentRequests").textContent()).includes("PRIVATE"),
        "no raw errors",
      );
      await axe(p, "request error");
      if (!thrown) await shot(p, "error");
      fail = false;
      await p.locator("[data-retry-requests]").click();
      await ready(p);
      ok(
        (await p.locator("#totalRequests").textContent()) === "8",
        "real retry recovers data",
      );
      ok(
        s.calls.filter(
          (o) => o.kind === "query" && o.table === "service_requests",
        ).length === 2,
        "only explicit retry issues second read",
      );
      fail = true;
      await p.locator("#refreshRequestsBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.requestsState === "error",
      );
      ok(
        (await p.locator("#totalRequests").textContent()) === "8",
        "failed refresh retains last counts",
      );
      ok(
        (await p.locator(".dashboard-request").count()) === 5,
        "failed refresh retains last requests",
      );
      ok(
        (await p.locator("#dashboardDataStatus").textContent()).includes(
          "last successful read",
        ),
        "stale data labelled",
      );
      if (!thrown) await shot(p, "refresh-error-retained-data");
      await c.close();
    }
    {
      let release;
      const barrier = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        delay: (o) =>
          o.kind === "query" && o.table === "service_requests"
            ? barrier
            : undefined,
      });
      await p.waitForFunction(
        () => document.body.dataset.requestsState === "loading",
      );
      ok(
        (await p.locator("#totalRequests").textContent()) === "—",
        "loading placeholders",
      );
      ok(
        !(await p.locator("#dashboardDataStatus").textContent()).includes(
          "Showing your",
        ),
        "no count claimed while loading",
      );
      ok(
        await p.locator("#refreshRequestsBtn").isDisabled(),
        "pending refresh disabled",
      );
      await shot(p, "loading");
      release();
      await ready(p);
      ok(
        s.calls.filter(
          (o) => o.kind === "query" && o.table === "service_requests",
        ).length === 1,
        "no duplicate initial read",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          t.service_requests = [];
        },
      });
      await ready(p);
      ok(
        (await p.locator("#totalRequests").textContent()) === "0",
        "actual empty total",
      );
      ok(
        (await p.locator("#recentRequests h3").textContent()) ===
          "No service requests yet",
        "honest empty state",
      );
      ok(
        (await p.locator("#recentRequests a").getAttribute("href")) ===
          "create-request.html",
        "first request action",
      );
      await axe(p, "empty");
      await shot(p, "empty");
      await c.close();
    }
    {
      const { p, c } = await open({
        width: 320,
        stubDestinations: true,
        prepare: (t) => {
          t.users.find((u) => u.id === ids.client).full_name =
            "A very long synthetic Client name ".repeat(8);
          t.service_requests = [
            {
              request_id: 'REQ/<img>&"?x',
              client_id: ids.client,
              title:
                '<img src=x onerror="window.__xss=1">' +
                "LongRequestTitle".repeat(35),
              location:
                "<script>window.__xss=1</script>" +
                "LongLocationWithoutSpaces".repeat(25),
              category: '<svg onload="window.__xss=1">',
              status: "<script>",
              preferred_date: "invalid",
              preferred_time: "99:99",
              budget: "invalid",
              created_at: "2026-11-01",
            },
            {
              request_id: "OPTIONAL",
              client_id: ids.client,
              status: "pending",
              created_at: "2026-10-01",
            },
          ];
        },
      });
      await ready(p);
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long content no overflow 320",
      );
      ok(await p.evaluate(() => !window.__xss), "dynamic markup not executed");
      ok(
        (await p
          .locator("#recentRequests img,#recentRequests script")
          .count()) === 0,
        "XSS data stays text",
      );
      ok(
        (await p.locator(".dashboard-request-meta").count()) === 1,
        "missing/invalid fields omitted",
      );
      ok(
        !(await p.locator("#recentRequests").textContent()).includes(
          "undefined",
        ),
        "no undefined missing fields",
      );
      ok(
        (await p.locator("#recentRequests").textContent()).includes(
          "Status unavailable",
        ),
        "unknown status safely labelled",
      );
      const href = await p
        .locator(".dashboard-request")
        .first()
        .getAttribute("href");
      ok(
        href ===
          "request-details.html?request_id=" +
            encodeURIComponent('REQ/<img>&"?x'),
        "request ID encoded exactly",
      );
      await shot(p, "long-content-320");
      await p.locator(".dashboard-request").first().click();
      await p.waitForURL("**/client/request-details.html?*");
      ok(
        new URL(p.url()).searchParams.get("request_id") === 'REQ/<img>&"?x',
        "request details parameter preserved",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open();
      await ready(p);
      await p.locator(".dashboard-request").nth(3).focus();
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForFunction(() =>
        document
          .querySelector("#dashboardDataStatus")
          .textContent.includes("3 most recent"),
      );
      ok(
        await p
          .locator('.dashboard-recent .panel-header a[href="my-requests.html"]')
          .evaluate((e) => e === document.activeElement),
        "resize moves focus from hidden card to View All",
      );
      for (const width of [480, 481, 320, 768, 1536]) {
        await p.setViewportSize({ width, height: 900 });
        const n = width <= 480 ? 3 : 5;
        await p.waitForFunction(
          (n) =>
            document.querySelector("#dashboardDataStatus").textContent ===
            `Showing your ${n} most recent requests.`,
          n,
        );
        ok(
          (await p.locator(".dashboard-request:visible").count()) === n,
          "resize updates visible cards",
        );
        ok(
          (await p.locator("#recentRequests").getByRole("link").count()) === n,
          "screen-reader-visible cards match",
        );
        ok(
          (await p.locator(".dashboard-request").count()) === 5,
          "no duplicates or discarded cached cards",
        );
        ok(
          (await p.locator("#totalRequests").textContent()) === "8",
          "all owned requests still counted",
        );
      }
      ok(
        s.calls.filter(
          (o) => o.kind === "query" && o.table === "service_requests",
        ).length === 1,
        "no resize queries",
      );
      await c.close();
    }
    for (const role of ["provider", "admin"]) {
      const { p, c, s } = await open({ role, stubDestinations: true });
      await p.waitForFunction(() => location.pathname === "/login.html");
      ok(
        !s.calls.some(
          (o) => o.kind === "query" && o.table === "service_requests",
        ),
        "wrong role no request reads",
      );
      await c.close();
    }
    for (const kind of ["inactive", "unverified", "incomplete", "contract"]) {
      const { p, c, s } = await open({
        stubDestinations: true,
        prepare: (t) => {
          const u = t.users.find((u) => u.id === ids.client);
          if (kind === "inactive") u.status = "suspended";
          if (kind === "unverified") {
            u.identity_verified = false;
            t.verification_requests = [];
          }
          if (kind === "incomplete") u.profile_completed = false;
        },
        fail: (o) =>
          kind === "contract" &&
          o.kind === "rpc" &&
          o.name === "igotu_backend_contract"
            ? { code: "PGRST202" }
            : false,
      });
      if (kind === "contract") {
        await p.waitForFunction(
          () => document.body.dataset.accessState === "blocked",
        );
        ok(
          !(await p.locator(".app-layout").isVisible()),
          "incompatible backend remains hidden",
        );
      } else
        await p.waitForFunction(
          () => location.pathname !== "/client/dashboard.html",
        );
      ok(
        !s.calls.some(
          (o) => o.kind === "query" && o.table === "service_requests",
        ),
        "rejected access no request reads",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ width: 390, noShell: true });
      await ready(p);
      ok(
        await p.locator(".side-menu").isVisible(),
        "failed optional shell keeps navigation",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ width: 390, noArt: true });
      await ready(p);
      ok(
        await p.locator(".dashboard-create").isVisible(),
        "failed artwork never hides primary action",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ motion: true });
      await ready(p);
      await p.waitForFunction(
        () => !document.querySelector(".dashboard-enter"),
      );
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite entrances no idle loop",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator(".stat-card").first().hover();
      ok(
        (await p
          .locator(".stat-card")
          .first()
          .evaluate((e) => getComputedStyle(e).transform)) === "none",
        "reduced motion disables lift",
      );
      await c.close();
    }
    ok(!errors.length, `no page errors ${errors}`);
    ok(!external.length, "zero external requests");
    fs.writeFileSync(
      path.join(out, "responsive-metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    console.log(
      `PASS ${checks} Client dashboard assertions; 8 viewport axe scans and dialog/menu/error/empty checks; zero external requests/page errors`,
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
