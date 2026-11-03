/* Client calendar integration with synthetic authorised SDK fixtures only. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4213",
  out = "docs/client-service-calendar",
  reviewed = "8dc79c84b96046a43e09cd95144c231fc189772a";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
for (const d of ["screenshots", "before", "validation"])
  fs.mkdirSync(`${out}/${d}`, { recursive: true });
let checks = 0,
  scans = 0;
const errors = [],
  external = [],
  metrics = [];
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
function tables() {
  const t = seed();
  t.users.find((u) => u.id === ids.client).full_name = "Synthetic Client A";
  const sample = t.service_requests[0];
  const rows = [
    ["R1", "pending", "2026-11-03", "09:00", "Pending cleaning"],
    ["R2", "confirmed", "2026-11-03", "10:00", "Tap repair"],
    ["R3", "in_progress", "2026-11-04", "13:00", "Ongoing tutoring"],
    ["R4", "completed", "2026-11-01", "08:00", "Completed cleaning"],
    ["R5", "cancelled", "2026-11-06", "11:00", "Cancelled service"],
    ["R6", "confirmed", "2026-02-30", "11:00", "Date unavailable"],
    ["R7", "confirmed", "2026-11-05", null, "Time unavailable"],
    [
      "R8",
      "provider_selected",
      "2026-11-03",
      "99:99",
      "Tentative time unavailable",
    ],
    [
      "R9",
      "provider_selected",
      "2026-11-03",
      "17:00",
      "Evening tentative service",
    ],
    ["R10", "unexpected", "2026-11-03", "18:00", "Unknown status service"],
  ];
  t.service_requests = rows.map(
    ([request_id, status, preferred_date, preferred_time, title], i) => ({
      ...sample,
      request_id,
      status,
      preferred_date,
      preferred_time,
      title,
      selected_provider_id: status === "pending" ? null : ids.provider,
      client_id: ids.client,
      location: "Synthetic service location, Sabah",
      client_lat: 6.123456,
      client_lng: 116.987654,
      request_image_url: "https://private.invalid/exact-image",
      created_at: new Date(Date.UTC(2026, 10, 2, 20 - i)).toISOString(),
    }),
  );
  t.service_requests.push({
    ...sample,
    request_id: "FOREIGN",
    title: "FOREIGN CLIENT SECRET",
    client_id: ids.provider,
    selected_provider_id: null,
    status: "pending",
  });
  t.service_reviews = [
    { reviewee_id: ids.provider, rating: 5 },
    { reviewee_id: ids.provider, rating: 3 },
    { reviewee_id: ids.client, rating: 1 },
  ];
  return t;
}
const reads = (s) =>
  s.calls.filter((o) => o.kind === "query" && o.table === "service_requests");
const writes = (s) =>
  s.calls.filter(
    (o) =>
      o.kind === "storage" ||
      (o.kind === "query" &&
        o.calls.some((c) =>
          ["insert", "update", "delete", "upsert"].includes(c[0]),
        )) ||
      (o.kind === "rpc" &&
        [
          "provider_confirm_request",
          "provider_decline_request",
          "start_service",
        ].includes(o.name)),
  );
const idsIn = (p, selector) =>
  p.locator(selector + " .sc-request-id").allTextContents();
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: opt.width || 1536, height: opt.height || 864 },
        timezoneId: opt.timezone || "Asia/Kuala_Lumpur",
        reducedMotion: opt.motion ? "no-preference" : "reduce",
      }),
      t = tables();
    if (opt.prepare) opt.prepare(t);
    const gate = {
      failRequests: !!opt.failRequests,
      failReviews: false,
      hold: null,
    };
    const s = await install(c, {
      tables: t,
      role: opt.role || "client",
      fail: (o) =>
        gate.failRequests &&
        o.kind === "query" &&
        o.table === "service_requests",
      delay: (o) => (gate.hold ? gate.hold(o) : undefined),
    });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        opt.before &&
        ["/client/dashboard.html", "/js/client.js"].includes(u.pathname)
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
      if (opt.stub && ["/client/request-details.html"].includes(u.pathname))
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Offline existing workflow</title><main>Verified route</main>",
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(12000);
    await p.clock.install({ time: new Date("2026-11-03T02:00:00Z") });
    await p.goto(base + "/client/dashboard.html", { waitUntil: "commit" });
    if (!opt.noWait && !opt.before)
      await p.waitForFunction(() =>
        ["ready", "empty", "error"].includes(
          document.body.dataset.requestsState,
        ),
      );
    if (opt.before)
      await p.locator("#recentRequests .dashboard-request").first().waitFor();
    return { p, c, s, gate };
  }
  async function shot(p, name, before = false) {
    await p.evaluate(() => {
      const e = document.createElement("aside");
      e.id = "offlineCalendarLabel";
      e.textContent =
        "OFFLINE REVIEW · SYNTHETIC CLIENT / REQUESTS · NO LIVE SUPABASE";
      e.style =
        "position:relative;padding:5px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 10px/1.5 Arial;z-index:99999";
      document.body.prepend(e);
    });
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineCalendarLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const issues = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    ok(!issues.length, "axe " + label + JSON.stringify(issues));
    scans++;
  }
  async function settle(p) {
    await p.waitForFunction(() =>
      ["ready", "empty", "error"].includes(document.body.dataset.requestsState),
    );
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
      ok(
        (await p.locator("#totalRequests").textContent()) === "10",
        "owned total count",
      );
      ok(
        (await p.locator("#pendingRequests").textContent()) === "1",
        "pending count",
      );
      ok(
        (await p.locator("#ongoingRequests").textContent()) === "6",
        "ongoing count",
      );
      ok(
        (await p.locator("#completedRequests").textContent()) === "1",
        "completed count",
      );
      const body = await p.locator("#clientServiceCalendar").textContent();
      ok(
        !body.includes("Synthetic service location") &&
          !body.includes("6.123456") &&
          !body.includes("FOREIGN CLIENT SECRET"),
        "no exact location/unassigned data",
      );
      ok(
        (await p
          .locator(".sc-date[aria-pressed=true]")
          .getAttribute("data-date")) === "2026-11-03",
        "MYT today selected",
      );
      ok(
        (await idsIn(p, ".sc-selected-panel")).join(",") === "R1,R2,R9,R10,R8",
        "selected date/time order including invalid time last",
      );
      ok(
        (await idsIn(p, ".sc-list-panel:not(.sc-selected-panel)")).join(",") ===
          "R1,R2,R9,R8,R3",
        "upcoming active chronological order",
      );
      ok(
        (await p.locator(".sc-unscheduled summary").textContent()) ===
          "Date unavailable (1)",
        "invalid date not invented",
      );
      ok(reads(s).length === 1, "one owned Client query");
      ok(
        reads(s)[0].calls.some(
          (c) => c[0] === "eq" && c[1] === "client_id" && c[2] === ids.client,
        ),
        "owned query predicate",
      );
      ok(
        !s.calls.some(
          (o) => o.kind === "rpc" && o.name === "provider_service_requests",
        ),
        "no Provider query",
      );
      ok(
        (await p.locator(".sc-status-pending").count()) > 0,
        "pending visually distinct",
      );
      const m = await p.evaluate(() => {
        const r = (selector) => {
          const e = document.querySelector(selector),
            b = e.getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            right: b.right,
            bottom: b.bottom,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          calendar: r("#clientServiceCalendar"),
          toolbar: r(".sc-toolbar"),
          date: r(".sc-date[aria-pressed=true]"),
          refresh: r(".sc-heading button"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no overflow " + width);
      ok(m.date.height >= 44 && m.date.width >= 24, "date touch target");
      ok(m.refresh.height >= 44, "refresh touch target");
      await axe(p, "month " + width);
      await shot(p, "dashboard-" + width);
      await p.locator("[data-sc-action=week]").click();
      ok((await p.locator(".sc-week-grid .sc-day").count()) === 7, "week view");
      ok(reads(s).length === 1, "view change no query");
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "week no overflow",
      );
      await shot(p, "week-" + width);
      if (width <= 390) await axe(p, "phone week " + width);
      ok(!writes(s).length, "calendar render read only");
      await c.close();
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, "dashboard-" + width, true);
      await c.close();
    }
    {
      const { p, c, s } = await open({ stub: true });
      await p.locator("[data-sc-action=previous]").click();
      ok(
        (await p.locator(".sc-period").textContent()) === "October 2026",
        "previous month",
      );
      await p.locator("[data-sc-action=next]").click();
      ok(
        (await p.locator(".sc-period").textContent()) === "November 2026",
        "next month",
      );
      await p.locator(".sc-date[aria-pressed=true]").focus();
      await p.keyboard.press("ArrowRight");
      ok(
        (await p
          .locator(".sc-date[aria-pressed=true]")
          .getAttribute("data-date")) === "2026-11-04",
        "keyboard day",
      );
      await p.keyboard.press("PageDown");
      ok(
        (await p.locator(".sc-period").textContent()) === "December 2026",
        "keyboard month",
      );
      await p.locator("[data-sc-action=today]").click();
      ok(
        (await p
          .locator(".sc-date[aria-pressed=true]")
          .getAttribute("data-date")) === "2026-11-03",
        "Today",
      );
      await p.locator("[data-sc-action=week]").click();
      await p.locator("[data-sc-action=next]").click();
      ok(
        (await p.locator(".sc-period").textContent()).includes("9 Nov 2026"),
        "week navigation",
      );
      await p.locator("[data-sc-action=today]").click();
      await shot(p, "selected-day-multiple");
      const link = p.locator(".sc-event[href]").first();
      ok(
        (await link.getAttribute("href")) ===
          "request-details.html?request_id=R1",
        "native event details link",
      );
      ok(
        (await p
          .locator(
            '.sc-selected-panel a[href*="request-details.html?request_id="]',
          )
          .count()) === 5,
        "all selected events have existing details links",
      );
      ok(reads(s).length === 1, "navigation no extra queries");
      await link.click();
      ok(
        new URL(p.url()).pathname === "/client/request-details.html" &&
          new URL(p.url()).searchParams.get("request_id") === "R1",
        "Client event navigation",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      gate.failRequests = true;
      await p.locator(".sc-heading button").click();
      await settle(p);
      ok(
        (await p.locator("#totalRequests").textContent()) === "10",
        "refresh failure keeps stats",
      );
      ok(
        await p
          .locator(".sc-data-note")
          .textContent()
          .then((x) => x.includes("outdated")),
        "calendar snapshot stale label",
      );
      ok(
        (await p.locator(".sc-selected-panel .sc-request").count()) === 5,
        "cached requests preserved",
      );
      await shot(p, "refresh-error");
      await axe(p, "stale calendar");
      gate.failRequests = false;
      await p.locator(".sc-heading button").click();
      await settle(p);
      ok(
        (await p
          .locator("#clientServiceCalendar")
          .getAttribute("data-calendar-state")) === "ready",
        "refresh recovery",
      );
      ok(reads(s).length === 3, "one RPC per refresh");
      await c.close();
    }
    {
      const { p, c, gate } = await open({ failRequests: true });
      ok(
        (await p.locator("#totalRequests").textContent()) === "—",
        "initial error no false zero",
      );
      ok(
        (await p.locator(".sc-selected-panel").textContent()).includes(
          "could not be loaded",
        ),
        "calendar initial error honest",
      );
      await shot(p, "initial-error");
      await axe(p, "initial error");
      gate.failRequests = false;
      await p.locator("#refreshRequestsBtn").click();
      await settle(p);
      ok(
        (await p.locator("#totalRequests").textContent()) === "10",
        "initial error retry",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          t.service_requests = [];
          t.service_reviews = [];
        },
      });
      ok(
        (await p.locator("#totalRequests").textContent()) === "0",
        "empty authorised dataset zero",
      );
      ok(
        (await p.locator(".sc-selected-panel").textContent()).includes(
          "No service requests for this date.",
        ),
        "empty selected date",
      );
      await shot(p, "empty-calendar");
      await axe(p, "empty calendar");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "query" && o.table === "service_requests" ? held : undefined;
      await p.locator(".sc-heading button").click();
      await p.waitForFunction(
        () => document.body.dataset.requestsState === "loading",
      );
      await p.locator("#refreshRequestsBtn").evaluate((b) => {
        for (let i = 0; i < 3; i++)
          b.dispatchEvent(new Event("click", { bubbles: true }));
      });
      ok(reads(s).length === 2, "refresh lock prevents duplicate RPC");
      await shot(p, "loading");
      release();
      await settle(p);
      ok(
        (await p.locator("#totalRequests").textContent()) === "10",
        "loading recovery",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        timezone: "America/Los_Angeles",
        prepare: (t) => {
          t.service_requests[0].title =
            "<img src=x onerror=alert(1)> " + "Long title ".repeat(20);
        },
      });
      ok(
        (await p
          .locator(".sc-date[aria-pressed=true]")
          .getAttribute("data-date")) === "2026-11-03",
        "MYT date independent of browser timezone",
      );
      ok(
        (await p.locator("#clientServiceCalendar img").count()) === 0,
        "safe title rendering",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long title wraps",
      );
      await shot(p, "long-title");
      await c.close();
    }
    {
      const specialId = "request /?&<synthetic>";
      const { p, c } = await open({
        prepare: (t) => {
          t.service_requests[0].request_id = specialId;
        },
      });
      ok(
        (await p.locator(".sc-event-pending[href]").first().getAttribute("href")) ===
          "request-details.html?request_id=" + encodeURIComponent(specialId),
        "event ID safely encoded",
      );
      ok(
        (await p
          .locator(".sc-selected-panel a")
          .first()
          .getAttribute("href")) ===
          "request-details.html?request_id=" + encodeURIComponent(specialId),
        "detail ID safely encoded",
      );
      await c.close();
    }
    {
      const { p, c } = await open();
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile menu",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notifications preserved",
      );
      await p.keyboard.press("Escape");
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".dashboard-hero")
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion",
      );
      await c.close();
    }
    for (const role of ["provider", "admin"]) {
      const { p, c, s } = await open({ role, noWait: true });
      const until = Date.now() + 12000;
      while (new URL(p.url()).pathname !== "/login.html") {
        if (Date.now() > until) throw Error("Role redirect timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      ok(!reads(s).length && !writes(s).length, "role gate before Client data");
      await c.close();
    }
    ok(!errors.length, "no page errors " + errors.join(","));
    ok(!external.length, "no outside traffic");
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
      `PASS ${checks} Client/calendar assertions; ${scans} axe scans; synthetic/offline only`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
