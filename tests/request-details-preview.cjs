/* Real page and Leaflet; in-memory backend and local image/map assets only. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4208";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Loopback required",
);
const out = "docs/request-details";
for (const dir of ["screenshots", "before", "validation"])
  fs.mkdirSync(out + "/" + dir, { recursive: true });
const reviewed = "a9e870d32e01bbaf2e0c78974c19ab96408534b2";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhRkAAAAASUVORK5CYII=",
  "base64",
);
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e6eddb"/><path d="M0 44h256M65 0v256M0 205h256M200 0v256" stroke="#fffdf1" stroke-width="16"/><path d="M0 170 256 60" stroke="#c2dfb3" stroke-width="35"/><text x="65" y="235" font-family="Arial" font-size="11" fill="#52684e">SYNTHETIC MAP</text></svg>';
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440"><rect width="640" height="440" fill="#e4f3db"/><rect x="75" y="160" width="490" height="170" rx="30" fill="#82b88d"/><path d="M95 330v35m450-35v35" stroke="#285a3c" stroke-width="12"/><rect x="40" y="90" width="60" height="180" rx="10" fill="#c8dfb5"/><text x="105" y="70" font-family="Arial" font-size="28" fill="#175c36">SYNTHETIC SERVICE IMAGE</text></svg>';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let checks = 0,
    scans = 0;
  const errors = [],
    external = [],
    metrics = [];
  const ok = (v, m) => {
    assert(v, m);
    checks++;
  };
  const rpc = (s, name) =>
    s.calls.filter((o) => o.kind === "rpc" && o.name === name);
  const inserts = (s, table) =>
    s.calls.filter(
      (o) =>
        o.kind === "query" &&
        o.table === table &&
        o.calls.some((c) => c[0] === "insert"),
    );
  async function open(opt = {}) {
    const c = await browser.newContext({
      viewport: { width: opt.width || 1536, height: opt.height || 900 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
    });
    const t = seed(),
      r = t.service_requests.find((r) => r.request_id === "REQ-A");
    r.status = opt.status || "completed";
    r.title = "Synthetic Home Cleaning";
    r.description =
      "General cleaning for a three-bedroom apartment, including the living room, kitchen and two bathrooms.";
    r.location = "Synthetic review location, Sabah";
    r.request_image_url = base + "/fixture-asset/request.svg";
    r.updated_at = "2026-10-28T07:45:00Z";
    t.users.find((u) => u.id === ids.client).full_name = "Alya Lim";
    t.users.find((u) => u.id === ids.provider).full_name =
      "Synthetic Provider B";
    if (r.status === "pending") r.selected_provider_id = null;
    if (opt.payment)
      t.payment_records.push({
        payment_id: "PAY-OFFLINE",
        request_id: "REQ-A",
        client_id: ids.client,
        provider_id: ids.provider,
        amount: 87.25,
        payment_method: "Cash",
        created_at: "2026-10-29T05:20:00Z",
        proof_path: null,
      });
    if (opt.review)
      t.service_reviews.push({
        review_id: "REV-SYNTHETIC",
        request_id: "REQ-A",
        reviewer_id: ids.client,
        reviewee_id: ids.provider,
        rating: 4,
        feedback: "Synthetic review. Clear communication and careful work.",
        created_at: "2026-10-30T04:10:00Z",
      });
    if (opt.prepare) opt.prepare(t, r);
    const s = await install(c, {
      role: opt.role || "client",
      tables: t,
      fail: opt.fail,
      delay: opt.delay,
    });
    await c.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.href.includes("leaflet@1.9.4/dist/leaflet.js"))
        return route.fulfill({
          contentType: "text/javascript",
          body: opt.noMap
            ? ""
            : fs.readFileSync(
                require.resolve("leaflet/dist/leaflet.js"),
                "utf8",
              ) +
              "\n;const oldMap=L.map;L.map=(...args)=>{const map=oldMap(...args);window.__detailsMap=map;window.__mapInvalidations=0;const old=map.invalidateSize.bind(map);map.invalidateSize=(...args)=>{window.__mapInvalidations++;return old(...args)};return map}",
        });
      if (u.href.includes("leaflet@1.9.4/dist/leaflet.css"))
        return route.fallback();
      if (
        u.hostname === "unpkg.com" &&
        /\/images\/[a-z0-9-]+\.png$/.test(u.pathname)
      )
        return route.fulfill({
          contentType: "image/png",
          body: fs.readFileSync(
            path.join(
              path.dirname(require.resolve("leaflet/dist/leaflet.js")),
              "images",
              path.basename(u.pathname),
            ),
          ),
        });
      if (u.hostname.endsWith("tile.openstreetmap.org"))
        return opt.noTiles
          ? route.abort()
          : route.fulfill({ contentType: "image/svg+xml", body: tile });
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return route.abort();
      }
      if (u.pathname.startsWith("/fixture-asset/")) {
        if (opt.badImage) return route.abort();
        return route.fulfill({ contentType: "image/svg+xml", body: image });
      }
      if (
        opt.before &&
        [
          "/client/request-details.html",
          "/js/client-request-details.js",
        ].includes(u.pathname)
      )
        return route.fulfill({
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
        /^\/client\/(my-requests|recommended-providers|create-request|messages|report)\.html$/.test(
          u.pathname,
        )
      )
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic navigation</title><main>Offline destination</main>",
        });
      return route.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.install({ time: new Date("2026-11-02T10:00:00Z") });
    await p.goto(
      `${base}/client/request-details.html${opt.missing ? "" : "?request_id=" + encodeURIComponent(opt.id || "REQ-A")}`,
    );
    if (opt.before)
      await p.locator("#requestDetailsArea .detail-card").first().waitFor();
    else if (!opt.noWait)
      await p.waitForFunction(
        () => document.body.dataset.detailsReady === "true",
      );
    return { p, c, s, r };
  }
  const msg = (p, t) =>
    p.waitForFunction(
      (t) => document.querySelector("#messageBox").textContent.includes(t),
      t,
    );
  async function shot(p, name, before = false) {
    await p.evaluate(() => {
      scrollTo(0, 0);
      const e = document.createElement("aside");
      e.id = "offlineDetailsLabel";
      e.textContent =
        "OFFLINE REVIEW · SYNTHETIC DATA / MAP · NO LIVE SUPABASE";
      e.style =
        "padding:7px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 11px/1.5 Arial;position:relative;z-index:10000";
      document.body.prepend(e);
    });
    if (await p.locator("#requestLocationMap .leaflet-tile-loaded").count())
      await p.waitForFunction(() =>
        [...document.querySelectorAll(".leaflet-tile-loaded")].some(
          (e) => Number(getComputedStyle(e).opacity) === 1,
        ),
      );
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: !name.includes("confirmation"),
    });
    await p.locator("#offlineDetailsLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const v = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }));
    });
    ok(!v.length, "axe " + label + ": " + JSON.stringify(v));
    scans++;
  }
  const button = (p, name) => p.getByRole("button", { name, exact: true });
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
      const { p, c, s } = await open({
        width,
        height,
        payment: true,
        review: true,
      });
      ok(
        (await p.locator("#requestTitle").textContent()) ===
          "Synthetic Home Cleaning",
        "real request title",
      );
      ok(
        (await p.locator("#userName").textContent()) === "Alya Lim",
        "real Client display",
      );
      ok(
        (await p.locator("#requestStatus").textContent()) === "Completed",
        "stored status",
      );
      const q = s.calls.find(
        (o) => o.kind === "query" && o.table === "service_requests",
      );
      ok(
        q.calls.some(
          (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "REQ-A",
        ) &&
          q.calls.some(
            (c) => c[0] === "eq" && c[1] === "client_id" && c[2] === ids.client,
          ),
        "both ownership predicates",
      );
      ok(
        rpc(s, "service_participants").some(
          (o) => o.args.p_request_ids.join(",") === "REQ-A",
        ),
        "participant RPC only request",
      );
      ok(
        (await p
          .locator(
            "#paymentForm,#reviewForm,#completeRequestBtn,#cancelRequestBtn",
          )
          .count()) === 0,
        "completed existing settlement read-only",
      );
      ok(
        (await p.locator(".details-payment").textContent()).includes("87.25"),
        "payment actual amount distinct from budget",
      );
      ok(
        (await p.locator(".details-review").textContent()).includes("4 / 5"),
        "actual submitted rating",
      );
      const m = await p.evaluate(() => {
        const rect = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
        };
        return {
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          summary: rect(".details-summary"),
          provider: rect(".details-provider"),
          map: rect("#requestLocationMap"),
          order: [...document.querySelectorAll("[data-details-card]")].map(
            (e) => e.dataset.detailsCard,
          ),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "bounds " + width);
      ok(m.map.width >= 215 && m.map.height >= 220, "usable map " + width);
      if (width >= 1366)
        ok(m.summary.width > m.provider.width, "main column majority");
      else
        ok(
          m.order.join(",") ===
            "summary,actions,provider,service,location,image,payment,review,information",
          "logical mobile DOM order",
        );
      ok(
        (await p.locator(".details-timeline .done").count()) === 5,
        "completed all stages",
      );
      ok(
        (await p.locator(".details-timeline small").allTextContents()).filter(
          (t) => t.includes("MYT"),
        ).length === 1,
        "only real created timestamp in timeline",
      );
      ok(
        !(await p.locator("#requestDetailsArea").textContent()).includes(
          "Call Provider",
        ),
        "no invented calling action",
      );
      await axe(p, "layout " + width);
      await shot(p, "details-" + width);
      await c.close();
      console.log("PASS layout/axe " + width);
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({
        width,
        before: true,
        payment: true,
        review: true,
      });
      await shot(p, "details-" + width, true);
      await c.close();
    }
    for (const [status, count] of [
      ["pending", 1],
      ["provider_selected", 2],
      ["confirmed", 3],
      ["in_progress", 4],
      ["completed", 5],
      ["cancelled", 1],
      ["disputed", 0],
    ]) {
      const { p, c, s } = await open({
        status,
        prepare: (t, r) => {
          if (status === "cancelled")
            r.cancellation_reason = "Synthetic schedule change";
        },
      });
      ok(
        (await p.locator(".details-timeline .done").count()) === count,
        "actual progress " + status,
      );
      ok(
        (await p.locator("#cancelRequestBtn").count()) ===
          (["pending", "provider_selected", "confirmed"].includes(status)
            ? 1
            : 0),
        "cancel visibility " + status,
      );
      ok(
        (await p.locator("#completeRequestBtn").count()) ===
          (status === "in_progress" ? 1 : 0),
        "complete visibility " + status,
      );
      ok(
        (await p.locator("#paymentForm,#reviewForm").count()) ===
          (status === "completed" ? 2 : 0),
        "settlement visibility " + status,
      );
      if (status === "pending") {
        ok(
          (await p
            .getByRole("link", { name: "Edit Request", exact: true })
            .getAttribute("href")) === "create-request.html?request_id=REQ-A",
          "edit route",
        );
        ok(
          (await p
            .getByRole("link", {
              name: "View Recommended Providers",
              exact: true,
            })
            .getAttribute("href")) ===
            "recommended-providers.html?request_id=REQ-A",
          "recommendations route",
        );
        ok(
          (await p.locator(".details-provider").textContent()).includes(
            "No Provider selected yet",
          ),
          "no selected Provider",
        );
      } else if (status !== "cancelled") {
        ok(
          (await p
            .getByRole("link", { name: "Message Provider", exact: true })
            .getAttribute("href")) === "messages.html?request_id=REQ-A",
          "participant message route " + status,
        );
        ok(
          (await p
            .getByRole("link", { name: "Report Issue", exact: true })
            .getAttribute("href")) === "report.html?request_id=REQ-A",
          "report route " + status,
        );
      }
      if (status === "cancelled") {
        ok(
          (await p.getByRole("link", { name: "Message Provider" }).count()) ===
            0,
          "cancelled no messaging",
        );
        ok(
          (await p.locator(".details-cancellation").textContent()).includes(
            "Synthetic schedule change",
          ),
          "reason retained",
        );
        ok(
          (await p.locator(".details-timeline .cancelled").count()) === 1,
          "differentiated cancellation",
        );
      }
      await shot(p, "status-" + status);
      ok(
        !rpc(s, "client_cancel_request").length &&
          !rpc(s, "client_complete_request").length,
        "view no mutations",
      );
      await c.close();
    }
    for (const mode of ["missing", "foreign", "unknown", "error", "throw"]) {
      let fail = mode === "error" || mode === "throw";
      const { p, c, s } = await open({
        missing: mode === "missing",
        id: mode === "unknown" ? "UNKNOWN" : "REQ-A",
        prepare: (t, r) => {
          if (mode === "foreign") r.client_id = "other-client";
        },
        fail: (o) =>
          fail && o.kind === "query" && o.table === "service_requests"
            ? mode === "throw"
              ? "throw"
              : true
            : false,
      });
      ok(
        (await p.locator("#requestTitle").textContent()).includes(
          "unavailable",
        ),
        "safe request error " + mode,
      );
      ok(
        (await p.locator("[data-details-card]").count()) === 0,
        "no private cards on failure",
      );
      ok(
        !rpc(s, "service_participants").length,
        "no provider lookup before authorized request",
      );
      if (mode === "error") {
        await shot(p, "fetch-error");
        fail = false;
        await p.locator("#retryRequestBtn").click();
        await p.locator('[data-details-card="summary"]').waitFor();
        ok(true, "retry loads actual data");
      }
      await c.close();
    }
    for (const table of ["payment_records", "service_reviews"]) {
      const { p, c } = await open({
        fail: (o) => o.kind === "query" && o.table === table,
      });
      ok(
        (await p.locator("#paymentForm,#reviewForm").count()) === 0,
        "failed closed " + table,
      );
      ok(
        (await p.locator("#messageBox").textContent()).includes(
          "could not be checked",
        ),
        "lookup failure visible",
      );
      await shot(p, "lookup-error-" + table);
      await c.close();
    }
    {
      const { p, c } = await open({
        fail: (o) => o.name === "service_participants",
      });
      ok(
        (await p.locator(".details-provider").textContent()).includes(
          "information unavailable",
        ),
        "participant failure not no-selection",
      );
      ok(
        (await p.locator("#paymentForm,#reviewForm").count()) === 0,
        "no settlement without authorized Provider",
      );
      ok(
        (await p.getByRole("link", { name: "Message Provider" }).count()) === 0,
        "no unsafe message route",
      );
      await shot(p, "provider-unavailable");
      await c.close();
    }
    for (const coords of [
      [null, null],
      ["", ""],
      [91, 116],
      [6, 181],
      ["Infinity", 116],
      ["NaN", 116],
      [true, 116],
    ]) {
      const { p, c } = await open({
        prepare: (t, r) => {
          r.client_lat = coords[0];
          r.client_lng = coords[1];
        },
      });
      ok(
        (await p.locator("#requestLocationMap").count()) === 0,
        "invalid coords no map " + coords,
      );
      ok(
        (await p.locator(".details-location").textContent()).includes(
          "coordinates are unavailable",
        ),
        "clear coords fallback",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ noMap: true });
      ok(
        await p.locator("#requestLocationMap").isHidden(),
        "library unavailable safe",
      );
      ok(
        (await p.locator("#requestMapStatus").textContent()).includes(
          "could not load",
        ),
        "map failure inline",
      );
      ok(
        await p.locator("#paymentForm").isVisible(),
        "map failure does not break payment",
      );
      await shot(p, "map-unavailable");
      await c.close();
    }
    {
      const { p, c } = await open({ noTiles: true });
      await p.waitForFunction(() =>
        document
          .querySelector("#requestMapStatus")
          .textContent.includes("tiles could not load"),
      );
      ok(
        await p.locator("#requestLocationMap").isVisible(),
        "tile failure keeps recorded marker/address available",
      );
      ok(
        await p.locator("#paymentForm").isVisible(),
        "tile failure does not block settlement UI",
      );
      await shot(p, "map-tiles-unavailable");
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t, r) => {
          r.created_at = "2026-11-02";
          r.updated_at = "2026-02-30T10:00:00Z";
        },
      });
      ok(
        !(await p.locator(".details-information").textContent()).includes(
          "Last Updated",
        ),
        "invalid calendar timestamp omitted",
      );
      ok(
        !(await p.locator(".details-information").textContent()).includes(
          "Created On",
        ),
        "date-only value does not invent an event time",
      );
      ok(
        !(await p.locator(".details-timeline").textContent()).includes("MYT"),
        "unreliable milestone time omitted",
      );
      await c.close();
    }
    for (const mode of ["missing", "invalid", "failed"]) {
      const { p, c } = await open({
        badImage: mode === "failed",
        prepare: (t, r) => {
          if (mode === "missing") r.request_image_url = null;
          if (mode === "invalid") r.request_image_url = "javascript:alert(1)";
        },
      });
      if (mode === "failed") {
        await p.locator("#serviceImageError").waitFor({ state: "visible" });
        ok(
          await p.locator("#serviceRequestImage").isHidden(),
          "broken image hidden",
        );
      } else {
        ok(
          (await p.locator("#serviceRequestImage").count()) === 0,
          "no unsafe/fictional image " + mode,
        );
        ok(
          (await p.locator(".details-image").textContent()).includes(
            "No service image uploaded",
          ),
          "empty image state",
        );
      }
      await shot(p, "image-" + mode);
      await c.close();
    }
    {
      const { p, c, s } = await open({ status: "in_progress" });
      await button(p, "Mark as Completed").click();
      ok(
        await p.locator("#completeRequestDialog").isVisible(),
        "accessible completion dialog",
      );
      ok(
        !rpc(s, "client_complete_request").length,
        "opening dialog never completes",
      );
      await axe(p, "completion dialog");
      await shot(p, "completion-confirmation");
      await p.keyboard.press("Escape");
      ok(!rpc(s, "client_complete_request").length, "Escape no completion");
      ok(
        await p
          .locator("#completeRequestBtn")
          .evaluate((e) => e === document.activeElement),
        "completion opener focus",
      );
      await button(p, "Mark as Completed").click();
      await p.locator("#confirmCompleteBtn").click();
      await p.locator("#paymentForm").waitFor();
      ok(rpc(s, "client_complete_request").length === 1, "one completion RPC");
      ok(
        Object.keys(rpc(s, "client_complete_request")[0].args).join(",") ===
          "p_request_id",
        "completion signature",
      );
      await c.close();
    }
    for (const action of ["cancel", "complete"])
      for (const failure of ["error", "throw"]) {
        const name =
          action === "cancel"
            ? "client_cancel_request"
            : "client_complete_request";
        const { p, c, s, r } = await open({
          status: action === "cancel" ? "confirmed" : "in_progress",
          fail: (o) =>
            o.name === name ? (failure === "throw" ? "throw" : true) : false,
        });
        await p
          .locator(
            action === "cancel" ? "#cancelRequestBtn" : "#completeRequestBtn",
          )
          .click();
        if (action === "cancel") {
          await p.locator("#serviceReasonSelect").selectOption("other");
          await p.locator(".service-reason-confirm").click();
        } else await p.locator("#confirmCompleteBtn").click();
        await msg(
          p,
          failure === "throw" ? "could not be confirmed" : "Unable to",
        );
        ok(
          r.status === (action === "cancel" ? "confirmed" : "in_progress"),
          "failure not successful " + name,
        );
        ok(rpc(s, name).length === 1, "no repeat " + name);
        await c.close();
      }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        status: "confirmed",
        delay: (o) => (o.name === "client_cancel_request" ? hold : undefined),
      });
      await p.locator("#cancelRequestBtn").click();
      await p.locator("#serviceReasonSelect").selectOption("schedule_changed");
      await axe(p, "cancellation dialog");
      await shot(p, "cancellation-confirmation");
      await p.locator(".service-reason-confirm").click();
      await p.locator("#cancelRequestBtn").dispatchEvent("click");
      ok(
        rpc(s, "client_cancel_request").length <= 1,
        "pending duplicate guard",
      );
      release();
      await p.waitForFunction(
        () =>
          document.querySelector("#requestStatus").textContent === "Cancelled",
      );
      ok(rpc(s, "client_cancel_request").length === 1, "cancel once confirmed");
      await c.close();
    }
    {
      const { p, c, s } = await open();
      ok(
        (await p.locator("#paymentAmount").inputValue()) === "",
        "payment not assumed from budget",
      );
      for (const [method, required] of [
        ["Cash", false],
        ["Other", false],
        ["QR Transfer", true],
        ["Bank Transfer", true],
      ]) {
        await p.locator("#paymentMethod").selectOption(method);
        ok(
          (await p.locator("#paymentProof").evaluate((e) => e.required)) ===
            required,
          "proof rule " + method,
        );
      }
      await p.locator("#paymentMethod").selectOption("Bank Transfer");
      await p.locator("#paymentAmount").fill("88");
      await p
        .locator("#paymentForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      await msg(p, "upload proof");
      ok(!inserts(s, "payment_records").length, "transfer no proof no insert");
      for (const file of [
        { name: "bad.exe", mimeType: "application/octet-stream", buffer: png },
        {
          name: "big.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        },
      ]) {
        await p.locator("#paymentProof").setInputFiles(file);
        await p.locator("#savePaymentBtn").click();
        await msg(p, file.name === "bad.exe" ? "JPG, PNG" : "5MB");
        ok(!inserts(s, "payment_records").length, "bad file no insert");
      }
      await p.locator("#paymentProof").setInputFiles([]);
      await p.locator("#paymentMethod").selectOption("Cash");
      await p.locator("#savePaymentBtn").click();
      await p
        .getByRole("heading", { name: "Payment Recorded", exact: true })
        .waitFor();
      ok(
        inserts(s, "payment_records").length === 1,
        "actual offline insert once",
      );
      ok(
        s.tables.payment_records[0].amount === 88,
        "actual paid amount independent of budget",
      );
      ok(
        s.tables.payment_records[0].provider_id === ids.provider,
        "selected provider association",
      );
      ok(
        (await p.locator("#paymentForm").count()) === 0,
        "no duplicate payment form",
      );
      await shot(p, "completed-with-payment");
      await p.locator("#saveReviewBtn").click();
      await p.locator("#feedback").fill("Synthetic feedback");
      await p.locator("#saveReviewBtn").click();
      await msg(p, "star rating");
      await p.locator('#reviewForm .star-btn[data-value="4"]').focus();
      await p.keyboard.press("Enter");
      ok(
        (await p.locator("#rating").inputValue()) === "4",
        "keyboard star selection",
      );
      await p.locator("#saveReviewBtn").click();
      await p
        .getByRole("heading", { name: "Your Review Submitted", exact: true })
        .waitFor();
      ok(inserts(s, "service_reviews").length === 1, "review insert once");
      ok(
        s.tables.service_reviews[0].reviewee_id === ids.provider,
        "review association preserved",
      );
      ok(
        (await p.locator("#reviewForm").count()) === 0,
        "submitted review read-only",
      );
      await shot(p, "submitted-review");
      await c.close();
    }
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]) {
      const { p, c, s } = await open();
      await p.locator("#paymentAmount").fill("73.50");
      await p.locator("#paymentMethod").selectOption("Bank Transfer");
      await p.locator("#paymentProof").setInputFiles({
        name:
          type === "application/pdf"
            ? "synthetic.pdf"
            : "synthetic." + type.split("/")[1],
        mimeType: type,
        buffer: png,
      });
      await p.locator("#savePaymentBtn").click();
      await p
        .getByRole("heading", { name: "Payment Recorded", exact: true })
        .waitFor();
      ok(
        s.objects.length === 1 && s.objects[0].bucket === "payment-proofs",
        "private proof upload contract " + type,
      );
      const record = s.tables.payment_records[0];
      ok(
        record.proof_path.startsWith(ids.client + "/REQ-A-") &&
          !!record.proof_uploaded_at,
        "private path association and recorded upload date " + type,
      );
      ok(
        !Object.hasOwn(record, "proof_url"),
        "proof insert never stores a public URL",
      );
      ok(
        rpc(s, "payment_proof_reference").length > 0,
        "server receipt reference pathway",
      );
      if (type === "application/pdf")
        await shot(p, "completed-with-private-proof");
      await c.close();
    }
    for (const kind of ["payment", "review"]) {
      let release;
      const hold = new Promise((r) => (release = r));
      const table = kind === "payment" ? "payment_records" : "service_reviews";
      const { p, c, s } = await open({
        delay: (o) =>
          o.kind === "query" &&
          o.table === table &&
          o.calls.some((c) => c[0] === "insert")
            ? hold
            : undefined,
      });
      if (kind === "payment") {
        await p.locator("#paymentAmount").fill("60");
        await p.locator("#paymentMethod").selectOption("Cash");
      } else {
        await p.locator('#reviewForm .star-btn[data-value="5"]').click();
        await p.locator("#feedback").fill("Synthetic duplicate guard test");
      }
      const save = p.locator(
        kind === "payment" ? "#savePaymentBtn" : "#saveReviewBtn",
      );
      await save.click();
      await p
        .locator(kind === "payment" ? "#paymentForm" : "#reviewForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      ok(await save.isDisabled(), "real pending save disabled " + kind);
      release();
      await p
        .getByRole("heading", {
          name:
            kind === "payment" ? "Payment Recorded" : "Your Review Submitted",
          exact: true,
        })
        .waitFor();
      ok(inserts(s, table).length === 1, "repeated submit writes once " + kind);
      await c.close();
    }
    {
      const { p, c, s } = await open({ status: "in_progress", width: 320 });
      await p.locator("#completeRequestBtn").click();
      await axe(p, "mobile completion confirmation");
      await shot(p, "completion-confirmation-320");
      await p.locator("#confirmCompleteBtn").focus();
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator("#keepRequestOpenBtn")
          .evaluate((e) => e === document.activeElement),
        "completion dialog focus cycle",
      );
      await p.keyboard.press("Escape");
      ok(
        !rpc(s, "client_complete_request").length,
        "mobile confirmation dismissal read-only",
      );
      await c.close();
    }
    for (const kind of ["payment", "review"])
      for (const failMode of ["error", "throw"]) {
        const table =
          kind === "payment" ? "payment_records" : "service_reviews";
        const { p, c, s } = await open({
          fail: (o) =>
            o.kind === "query" &&
            o.table === table &&
            o.calls.some((c) => c[0] === "insert")
              ? failMode === "throw"
                ? "throw"
                : { message: "PRIVATE_DATABASE_DETAIL" }
              : false,
        });
        if (kind === "payment") {
          await p.locator("#paymentAmount").fill("50");
          await p.locator("#paymentMethod").selectOption("Cash");
          await p.locator("#savePaymentBtn").click();
        } else {
          await p.locator('#reviewForm .star-btn[data-value="5"]').click();
          await p.locator("#feedback").fill("Synthetic feedback");
          await p.locator("#saveReviewBtn").click();
        }
        await msg(
          p,
          failMode === "throw"
            ? "could not be confirmed"
            : kind === "payment"
              ? "Failed to save"
              : "Failed to submit",
        );
        ok(
          !(await p.locator("#messageBox").textContent()).includes(
            "PRIVATE_DATABASE_DETAIL",
          ),
          "no raw database details",
        );
        ok(s.tables[table].length === 0, "failed save no fixture commit");
        await c.close();
      }
    {
      const { p, c, s } = await open();
      await p.locator("#feedback").fill("Unsaved synthetic review");
      await p.locator('#reviewForm .star-btn[data-value="3"]').click();
      await p.locator("#paymentAmount").fill("61.20");
      await p.locator("#paymentProof").setInputFiles({
        name: "selected.png",
        mimeType: "image/png",
        buffer: png,
      });
      const queryCount = s.calls.length;
      const n = await p.evaluate(() => window.__mapInvalidations);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForFunction((n) => window.__mapInvalidations > n, n);
      ok(
        (await p.locator("#feedback").inputValue()) ===
          "Unsaved synthetic review",
        "resize preserves form text",
      );
      ok(
        (await p.locator("#rating").inputValue()) === "3",
        "resize preserves rating",
      );
      ok(
        (await p.locator("#paymentAmount").inputValue()) === "61.20",
        "resize preserves amount",
      );
      ok(
        (await p.locator("#paymentProof").evaluate((e) => e.files.length)) ===
          1,
        "resize preserves selected proof file",
      );
      ok(
        s.calls.length === queryCount,
        "responsive reparenting adds no backend operation",
      );
      await axe(p, "mobile forms");
      await shot(p, "completed-without-payment-390");
      await c.close();
    }
    {
      const { p, c } = await open({
        width: 320,
        prepare: (t, r) => {
          r.title = '<img src=x onerror="window.__xss=1">' + "TITLE".repeat(30);
          r.description = "LONG UNBROKEN " + "TEXT".repeat(200);
          r.location = "ADDRESS".repeat(80);
          r.request_image_url = null;
          r.budget = null;
          r.updated_at = null;
        },
      });
      ok(!(await p.evaluate(() => window.__xss)), "no XSS");
      ok(
        (await p.locator("#requestTitle img").count()) === 0,
        "escaped request title",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long text bounds",
      );
      ok(
        (await p.locator(".details-service").textContent()).includes(
          "Open budget",
        ),
        "empty budget not zero",
      );
      ok(
        !(await p.locator(".details-information").textContent()).includes(
          "Last Updated",
        ),
        "no invented update",
      );
      await axe(p, "long/missing data");
      await shot(p, "long-data-320");
      await c.close();
    }
    {
      const { p, c, s } = await open({ dest: true, status: "confirmed" });
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="verification.html"]')
          .isVisible(),
        "verification menu",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(await p.locator("#notificationDropdown").isVisible(), "notifications");
      await p.keyboard.press("Escape");
      await p
        .getByRole("link", { name: "Message Provider", exact: true })
        .click();
      await p.waitForURL("**/messages.html?request_id=REQ-A");
      ok(true, "real messaging navigation");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c } = await open({
        noWait: true,
        delay: (o) =>
          o.kind === "query" && o.table === "service_requests"
            ? hold
            : undefined,
      });
      ok(
        (await p.locator("#requestDetailsArea").getAttribute("aria-busy")) ===
          "true",
        "real loading state",
      );
      await shot(p, "loading");
      release();
      await p.locator(".details-summary").waitFor();
      await c.close();
    }
    {
      const { p, c } = await open({ motion: true });
      await p.waitForTimeout(600);
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite animation",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".details-summary")
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion",
      );
      await c.close();
    }
    ok(!errors.length, "no page errors " + errors);
    ok(
      !external.length,
      "no escaped external traffic (all blocked) " + external,
    );
    fs.writeFileSync(
      out + "/responsive-metrics.json",
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      out + "/validation/focused.json",
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
      `PASS ${checks} Request Details assertions; ${scans} axe scans; fixtures only`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
