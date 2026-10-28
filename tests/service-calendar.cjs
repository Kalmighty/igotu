/* Real dashboard/module UI with the existing synthetic transport only.
   No Supabase hosts, credentials, SQL, real users or backend writes are used. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { install, seed, ids } = require("./system-fixture.cjs");
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "igotu_v2");
const output = path.join(root, "work/service-calendar");
fs.mkdirSync(output, { recursive: true });
const tests = [];
const test = (name, run) => tests.push({ name, run });
const fixture = () => {
  const tables = seed();
  const template = tables.service_requests[1];
  const row = (id, status, time, provider = ids.provider) => ({ ...template,
    request_id: id, title: `Synthetic ${id}`, status, preferred_date: "2026-11-02",
    preferred_time: time, selected_provider_id: provider,
  });
  tables.service_requests = [
    row("PREFERRED", "pending", "09:00:00", null),
    row("AWAITING", "provider_selected", "10:00:00"),
    row("CONFIRMED", "confirmed", "11:00:00"),
    { ...row("PROGRESS", "in_progress", "12:00:00"), preferred_date: "2026-11-03" },
    row("DONE", "completed", "13:00:00"),
    row("CANCELLED", "cancelled", "14:00:00"),
    { ...row("FOREIGN", "confirmed", "15:00:00", "other-provider"), client_id: "other-client" },
    { ...row("OPEN-OTHER", "pending", "16:00:00", null), client_id: "other-client" },
  ];
  return tables;
};
const isRequest = (op, role) => role === "provider" ? op.kind === "rpc" && op.name === "provider_service_requests" : op.kind === "query" && op.table === "service_requests";

async function ready(page, role) {
  await page.goto(`${process.env.UI_BASE_URL}/${role}/dashboard.html`);
  await page.waitForFunction(() => document.body.dataset.accessState === "allowed");
  await page.waitForFunction(() => document.querySelector("#serviceCalendar")?.getAttribute("aria-busy") === "false");
}
async function selectDay(page, date = "2026-11-02") {
  await page.locator(`#serviceCalendar [data-date="${date}"]`).click();
}
async function refresh(page) {
  await page.getByRole("button", { name: "Refresh services", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#serviceCalendar").getAttribute("aria-busy") === "false");
}

for (const role of ["client", "provider"]) {
  test(`${role}: scoped data, dates, statuses and read-only links`, async ({ page, state }) => {
    await ready(page, role);
    await selectDay(page);
    const details = page.locator(".calendar-details");
    assert.equal(await details.locator("li").count(), role === "client" ? 5 : 4);
    assert.match(await details.textContent(), /10:00.*Preferred date · unconfirmed/);
    assert.match(await details.textContent(), /Awaiting provider confirmation/);
    assert.match(await details.textContent(), /11:00.*Confirmed date/);
    assert.match(await details.textContent(), /Completed service/);
    assert.match(await details.textContent(), /Cancelled · not scheduled/);
    assert.doesNotMatch(await details.textContent(), /FOREIGN|OPEN-OTHER|Unit 7|client_lat/);
    if (role === "provider") {
      assert.doesNotMatch(await details.textContent(), /Synthetic PREFERRED/);
      assert.equal(state.calls.filter((o) => o.kind === "query" && o.table === "service_requests").length, 0);
      const call = state.calls.find((o) => isRequest(o, role));
      assert.deepEqual(call.args, { p_request_id: null, p_statuses: null });
    } else {
      const call = state.calls.find((o) => isRequest(o, role));
      assert.ok(call.calls.some((x) => x[0] === "eq" && x[1] === "client_id" && x[2] === ids.client));
    }
    assert.ok((await details.locator("a").first().getAttribute("href")).startsWith(role === "client" ? "request-details.html?" : "incoming-requests.html?"));
    if (role === "provider") {
      assert.match(await details.locator('[data-request-id="CONFIRMED"] a').getAttribute("href"), /^assignment-details\.html\?/);
      assert.equal(await details.locator('[data-request-id="CANCELLED"] a').count(), 0);
    }
    await selectDay(page, "2026-11-03");
    assert.match(await details.textContent(), /In progress/);
    assert.equal(state.calls.filter((o) => o.kind === "rpc" && !["igotu_backend_contract", "provider_service_requests"].includes(o.name)).length, 0);
  });

  test(`${role}: confirmation, progress, completion, cancellation and decline refresh`, async ({ page, state }) => {
    await ready(page, role);
    await selectDay(page);
    const request = state.tables.service_requests.find((r) => r.request_id === "AWAITING");
    for (const [status, label] of [["confirmed", "Confirmed date"], ["in_progress", "In progress"], ["completed", "Completed service"], ["cancelled", "Cancelled · not scheduled"]]) {
      request.status = status;
      await refresh(page);
      assert.match(await page.locator('.calendar-service[data-request-id="AWAITING"]').textContent(), new RegExp(label));
    }
    // Existing decline protocol clears the assignment and returns to pending.
    request.status = "pending";
    request.selected_provider_id = null;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() => document.querySelector("#serviceCalendar").getAttribute("aria-busy") === "false");
    if (role === "provider") assert.equal(await page.locator('.calendar-service a[href$="request_id=AWAITING"]').count(), 0);
    else assert.match(await page.locator(".calendar-service").filter({ has: page.locator('a[href$="request_id=AWAITING"]') }).textContent(), /Pending provider selection/);
  });

  test(`${role}: failure removes stale details, retry recovers, empty state`, async ({ page, state }) => {
    await ready(page, role);
    await selectDay(page);
    state.fail = (op) => isRequest(op, role);
    await refresh(page);
    assert.match(await page.locator(".calendar-status").textContent(), /could not be loaded/);
    assert.equal(await page.locator(".calendar-service").count(), 0);
    assert.equal(await page.locator(".calendar-content").isVisible(), false);
    state.fail = null;
    await refresh(page);
    assert.ok(await page.locator(".calendar-service").count() > 0);
    state.tables.service_requests = [];
    await refresh(page);
    assert.match(await page.locator(".calendar-status").textContent(), /No (assigned services|service requests) this month/);
    assert.match(await page.locator(".calendar-details").textContent(), /No (assigned services|service requests) on this date/);
  });

  test(`${role}: keyboard, month/year navigation and Today`, async ({ page }) => {
    await ready(page, role);
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    assert.equal(await page.locator(".calendar-month").textContent(), "December 2026");
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    assert.equal(await page.locator(".calendar-month").textContent(), "January 2027");
    await selectDay(page, "2027-01-31");
    await page.keyboard.press("PageDown");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-02-28");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-03-01");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-03-08");
    await page.keyboard.press("End");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-03-14");
    await page.keyboard.press("Home");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-03-08");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator(".calendar-day:focus").getAttribute("data-date"), "2027-02-28");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    assert.equal(await page.locator('.calendar-day[aria-pressed="true"]').getAttribute("aria-current"), "date");
    assert.equal(await page.locator('.calendar-day[tabindex="0"]').count(), 1);
  });

  test(`${role}: loading, overlapping refresh suppression and automatic update`, async ({ page, state }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    state.delay = (op) => isRequest(op, role) ? gate : undefined;
    await page.goto(`${process.env.UI_BASE_URL}/${role}/dashboard.html`);
    await page.waitForFunction(() => document.querySelector(".calendar-status")?.textContent === "Loading services…");
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(state.calls.filter((o) => isRequest(o, role)).length, 1);
    assert.equal(await page.getByRole("button", { name: "Refresh services", exact: true }).isDisabled(), true);
    release();
    state.delay = null;
    await page.waitForFunction(() => document.querySelector("#serviceCalendar").getAttribute("aria-busy") === "false");
    const count = state.calls.filter((o) => isRequest(o, role)).length;
    await page.clock.fastForward(60000);
    await page.waitForFunction(() => document.querySelector("#serviceCalendar").getAttribute("aria-busy") === "false");
    assert.ok(state.calls.filter((o) => isRequest(o, role)).length > count);
  });
}

test("Guard failure blocks the calendar without a fallback", async ({ page, state }) => {
  state.fail = (op) => op.kind === "rpc" && op.name === "igotu_backend_contract";
  await page.goto(`${process.env.UI_BASE_URL}/client/dashboard.html`);
  await page.waitForFunction(() => document.body.dataset.accessState === "blocked");
  assert.equal(await page.locator(".calendar-day").count(), 0);
  assert.equal(state.calls.filter((op) => isRequest(op, "client")).length, 0);
});

test("Unapproved identity cannot initialize the calendar", async ({ page, state }) => {
  state.tables.verification_requests = [];
  await page.goto(`${process.env.UI_BASE_URL}/client/dashboard.html`);
  await page.waitForURL("**/client/verification.html");
  assert.equal(state.calls.filter((op) => isRequest(op, "client")).length, 0);
});

test("Calendar titles and request links are safe text/encoded values", async ({ page, state }) => {
  const row = state.tables.service_requests.find((r) => r.request_id === "CONFIRMED");
  row.title = '<img src=x onerror="window.calendarXss=true">';
  row.request_id = 'evil&<script>"';
  await ready(page, "client");
  await selectDay(page);
  assert.equal(await page.locator(".calendar-details img, .calendar-details script").count(), 0);
  assert.equal(await page.evaluate(() => window.calendarXss), undefined);
  assert.equal(await page.locator(".calendar-service-title").filter({ hasText: "<img" }).getAttribute("href"), `request-details.html?request_id=${encodeURIComponent(row.request_id)}`);
});

for (const [destination, target, statuses] of [
  ["incoming-requests", "AWAITING", ["provider_selected"]],
  ["assignment-details", "CONFIRMED", ["confirmed", "in_progress", "completed"]],
]) {
  for (const scenario of ["valid", "missing parameter", "missing service", "unauthorized", "invalid", "duplicate"]) {
    test(`provider: ${destination} safely handles ${scenario} request_id`, async ({ page, state }) => {
      state.tables.service_requests.find((r) => r.request_id === "FOREIGN").status = statuses[0];
      if (scenario === "valid") {
        const template = state.tables.service_requests.find((r) => r.request_id === target);
        state.tables.service_requests.unshift(...Array.from({ length: 3 }, (_, i) => ({
          ...template, request_id: `EARLIER-${i}`, title: `Synthetic preceding service ${i}`,
          client_lat: null, client_lng: null,
        })));
      }
      const suffix = {
        valid: `?request_id=${target}`,
        "missing parameter": "",
        "missing service": "?request_id=NOT-RETURNED",
        unauthorized: "?request_id=FOREIGN",
        invalid: "?request_id=%22%5D%3Cimg%20src=x%20onerror=alert(1)%3E",
        duplicate: `?request_id=${target}&request_id=FOREIGN`,
      }[scenario];
      await page.goto(`${process.env.UI_BASE_URL}/provider/${destination}.html${suffix}`);
      await page.waitForFunction(() => document.body.dataset.accessState === "allowed");
      await page.locator(`[data-service-request-id="${target}"]`).waitFor();
      // Action binding and highlighting finish after secondary scoped reads.
      await page.waitForFunction(() => {
        const list = document.querySelector("#incomingList, #assignmentsList");
        return list && !list.textContent.includes("Loading");
      });
      const marked = page.locator(".requested-service");
      if (scenario === "valid") {
        await marked.waitFor();
        assert.equal(await marked.getAttribute("data-service-request-id"), target);
        assert.equal(await marked.locator(".requested-service-label").textContent(), "Selected service");
        assert.equal(await marked.evaluate((card) => card === document.activeElement), true);
        assert.ok(await page.evaluate(() => window.scrollY > 0));
        const bounds = await marked.boundingBox();
        assert.ok(bounds.y >= 0 && bounds.y < 200, `Target not aligned in view: ${bounds.y}`);
        const action = marked.getByRole("button", { name: destination === "incoming-requests" ? "Confirm" : "Start Service", exact: true });
        assert.equal(await action.isEnabled(), true);
        await action.focus();
        assert.equal(await action.evaluate((button) => button === document.activeElement), true);
        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const issues = await page.evaluate(async () => (await axe.run(".requested-service")).violations.map((v) => v.id));
        assert.deepEqual(issues, []);
      } else {
        assert.equal(await marked.count(), 0);
        assert.equal(await page.locator(".requested-service-label").count(), 0);
      }
      assert.equal(await page.locator('[data-service-request-id="FOREIGN"]').count(), 0);
      const reads = state.calls.filter((op) => op.kind === "rpc" && op.name === "provider_service_requests");
      assert.equal(reads.length, 1);
      assert.deepEqual(reads[0].args, { p_request_id: null, p_statuses: statuses });
      assert.equal(state.calls.some((op) => op.kind === "query" && op.table === "service_requests"), false);
      const allowed = new Set(state.tables.service_requests.filter((r) => r.selected_provider_id === ids.provider && statuses.includes(r.status)).map((r) => r.request_id));
      for (const op of state.calls.filter((op) => op.kind === "rpc" && op.name === "service_participants")) {
        assert.ok(op.args.p_request_ids.every((id) => allowed.has(id)));
      }
    });
  }
}

for (const [width, zone] of [[320, "Pacific/Honolulu"], [390, "Asia/Kuala_Lumpur"], [1440, "Pacific/Kiritimati"]]) {
  test(`Responsive/a11y/wall dates: ${width}px ${zone}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page, "client");
    await selectDay(page);
    assert.match(await page.locator(".calendar-details h3").textContent(), /November 2, 2026/);
    assert.match(await page.locator(".calendar-details").textContent(), /10:00/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => (await axe.run("#serviceCalendar")).violations);
    assert.deepEqual(violations.map((v) => ({ id: v.id, impact: v.impact })), []);
    await page.screenshot({ path: path.join(output, `calendar-${width}.png`), fullPage: true });
  });
  tests.at(-1).zone = zone;
}

async function main() {
  const { calendarRequests, parseServiceDate, dateKey } = await import(pathToFileURL(path.join(publicDir, "js/service-calendar.js")));
  assert.equal(dateKey(parseServiceDate("2028-02-29")), "2028-02-29");
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "2026-11-02T00:00:00Z", null]) assert.equal(parseServiceDate(value), null);
  assert.equal(calendarRequests(fixture().service_requests, "provider", ids.provider).some((r) => ["pending"].includes(r.status)), false);
  assert.equal(calendarRequests(fixture().service_requests, "client", "other-client").some((r) => r.client_id === ids.client), false);
  assert.throws(() => calendarRequests({}, "client", ids.client));
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.resolve(publicDir, "." + pathname);
    if (!file.startsWith(publicDir + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, data) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { "content-type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream" }).end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.UI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
    for (const t of tests) {
      const role = t.name.startsWith("provider:") ? "provider" : "client";
      const context = await browser.newContext({ timezoneId: t.zone || "Asia/Kuala_Lumpur", serviceWorkers: "block" });
      const state = await install(context, { role, tables: fixture() });
      const page = await context.newPage();
      await page.clock.install({ time: new Date("2026-11-15T12:00:00Z") });
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await t.run({ page, context, state });
        assert.deepEqual(errors, []);
        assert.deepEqual(state.unknown, []);
        assert.equal(state.calls.some((op) => op.kind === "query" && op.calls?.some((c) => ["insert", "update", "delete", "upsert"].includes(c[0]))), false);
        results.push({ name: t.name, status: "PASS" });
        console.log("PASS", t.name);
      } catch (error) {
        results.push({ name: t.name, status: "FAIL", error: error.stack });
        console.error("FAIL", t.name, error.message);
        process.exitCode = 1;
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ scope: "Synthetic frontend only; no live backend/RLS proof", unitChecks: "PASS", results }, null, 2) + "\n");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
