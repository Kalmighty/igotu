/* Real form/Leaflet with in-memory Supabase and local map/geocoder/GPS fixtures. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4206";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Loopback required",
);
const out = path.resolve("docs/create-request");
for (const d of ["screenshots", "before"])
  fs.mkdirSync(path.join(out, d), { recursive: true });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhRkAAAAASUVORK5CYII=",
  "base64",
);
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eddd"/><path d="M0 52h256M48 0v256M0 203h256M204 0v256" stroke="#fffdf1" stroke-width="16"/><path d="m0 170 256-90" stroke="#c8e1bd" stroke-width="30"/><path d="m0 120 256 50" stroke="#fff" stroke-width="10"/><rect x="70" y="70" width="60" height="38" rx="4" fill="#d7dfce"/><text x="62" y="241" fill="#5a7059" font-family="Arial" font-size="10">SYNTHETIC MAP TILE</text></svg>';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let checks = 0;
  const errors = [],
    escaped = [],
    metrics = [];
  const ok = (v, label) => {
    assert(v, label);
    checks++;
  };
  async function open(opt = {}) {
    const c = await browser.newContext({
      viewport: { width: opt.width || 1440, height: opt.height || 900 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
    });
    const tables = seed();
    const own = tables.users.find((u) => u.id === ids.client);
    own.full_name = "Alya Lim";
    tables.service_requests.find(
      (r) => r.request_id === "REQ-PENDING",
    ).description = "Synthetic service details for offline review.";
    if (opt.prepare) opt.prepare(tables);
    const s = await install(c, {
      role: opt.role || "client",
      tables,
      fail: opt.fail,
      delay: opt.delay,
    });
    const geo = { search: "ok", reverse: "ok", calls: [], ...opt.geo };
    await c.addInitScript((config) => {
      window.__gpsFixture = config;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success, failure) {
            const f = window.__gpsFixture;
            if (f.mode === "error")
              return queueMicrotask(() => failure({ code: f.code || 1 }));
            queueMicrotask(() =>
              success({
                coords: {
                  latitude: f.lat ?? 6.09,
                  longitude: f.lng ?? 116.15,
                  accuracy: f.accuracy ?? 15,
                },
              }),
            );
          },
        },
      });
    }, opt.gps || {});
    await c.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      if (u.href.includes("leaflet@1.9.4/dist/leaflet.js")) {
        if (opt.noMap)
          return r.fulfill({ contentType: "text/javascript", body: "" });
        return r.fulfill({
          contentType: "text/javascript",
          body:
            fs.readFileSync(
              require.resolve("leaflet/dist/leaflet.js"),
              "utf8",
            ) +
            `\n;const testMap=L.map;L.map=(...args)=>{const m=testMap(...args);window.__testRequestMap=m;window.__mapInvalidations=0;const old=m.invalidateSize.bind(m);m.invalidateSize=(...args)=>{window.__mapInvalidations++;return old(...args)};return m};const testMarker=L.marker;L.marker=(...args)=>{const m=testMarker(...args);window.__testRequestMarker=m;return m};`,
        });
      }
      if (
        u.hostname === "unpkg.com" &&
        /^\/leaflet@1\.9\.4\/dist\/images\/(marker-icon(?:-2x)?|marker-shadow|layers(?:-2x)?)\.png$/.test(
          u.pathname,
        )
      )
        return r.fulfill({
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
        return r.fulfill({ contentType: "image/svg+xml", body: tile });
      if (u.hostname === "nominatim.openstreetmap.org") {
        geo.calls.push({
          type: u.pathname,
          lat: u.searchParams.get("lat"),
          lng: u.searchParams.get("lon"),
          query: u.searchParams.get("q"),
        });
        if (u.pathname === "/search") {
          if (geo.searchHold) await geo.searchHold;
          if (geo.search === "fail") return r.abort();
          if (geo.search === "http")
            return r.fulfill({ status: 503, body: "Unavailable" });
          return r.fulfill({
            json:
              geo.search === "missing"
                ? []
                : [
                    {
                      lat: geo.search === "invalid" ? "NaN" : "6.04",
                      lon: "116.12",
                      display_name: "Synthetic Sabah service location",
                    },
                  ],
          });
        }
        const n = geo.calls.filter((c) => c.type === "/reverse").length;
        if (geo.reverseFirstHold && n === 1) await geo.reverseFirstHold;
        if (geo.reverse === "fail") return r.abort();
        return r.fulfill({
          json:
            geo.reverse === "missing"
              ? {}
              : {
                  display_name: `Synthetic point ${u.searchParams.get("lat")}, ${u.searchParams.get("lon")}`,
                },
        });
      }
      if (u.origin !== new URL(base).origin) {
        if (u.href.includes("leaflet.css")) return r.fallback();
        escaped.push(u.origin);
        return r.abort();
      }
      if (u.pathname.startsWith("/fixture-asset/"))
        return r.fulfill({ contentType: "image/png", body: png });
      if (opt.noUI && u.pathname === "/js/client-create-request-ui.js")
        return r.fulfill({ contentType: "text/javascript", body: "" });
      if (
        opt.before &&
        [
          "/client/create-request.html",
          "/js/client-create-request.js",
        ].includes(u.pathname)
      )
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : "text/html",
          body: execFileSync(
            "git",
            [
              "show",
              `5103c13c29ffd2989553c52cec3a10be11e05f04:igotu_v2${u.pathname}`,
            ],
            { encoding: "utf8" },
          ),
        });
      if (
        opt.dest &&
        /^\/client\/(recommended-providers|request-details|my-requests|dashboard)\.html$/.test(
          u.pathname,
        )
      )
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic navigation destination</title><main>Offline destination</main>",
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(
      `${base}/client/create-request.html${opt.id ? "?request_id=" + encodeURIComponent(opt.id) : ""}`,
    );
    if (!opt.blocked && !opt.before)
      await p.waitForFunction(
        () =>
          document.querySelector("#createRequestForm").dataset.ready === "true",
      );
    if (opt.before)
      await p.waitForFunction(() =>
        document
          .querySelector("#requestMap")
          .classList.contains("leaflet-container"),
      );
    return { p, c, s, geo };
  }
  async function choose(p) {
    await p.locator("#mapSearch").fill("Synthetic Sabah");
    await p.locator("#searchLocationBtn").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#mapStatus")
        .textContent.includes("found and selected"),
    );
    await p.waitForTimeout(300); // Leaflet's real finite zoom/pan settles before visual capture.
  }
  async function fill(p) {
    await p.locator("#category").selectOption("Cleaning");
    await p.locator("#serviceType").selectOption("Home Cleaning");
    await p.locator("#title").fill("Synthetic home cleaning");
    await p
      .locator("#description")
      .fill("Synthetic service details for UI testing only.");
    await p.locator("#preferredDate").fill("2026-11-12");
    await p.locator("#preferredTime").fill("11:00");
    await choose(p);
  }
  const waitMessage = (p, t) =>
    p.waitForFunction(
      (t) => document.querySelector("#messageBox").textContent.includes(t),
      t,
    );
  async function shot(p, name, dir = "screenshots") {
    await p.evaluate(() => {
      window.scrollTo(0, 0);
      const e = document.createElement("aside");
      e.id = "offlineReviewLabel";
      e.textContent =
        "OFFLINE REVIEW · SYNTHETIC DATA / MAP / GPS · NO LIVE SUPABASE";
      e.style =
        "padding:7px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 11px/1.5 Arial";
      document.body.prepend(e);
    });
    await p.screenshot({
      path: path.join(out, dir, name + ".png"),
      fullPage: true,
    });
    await p.locator("#offlineReviewLabel").evaluate((e) => e.remove());
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
        (await p.locator("#clientLat").inputValue()) === "" &&
          (await p.locator("#clientLng").inputValue()) === "",
        "default view has no selected coordinates",
      );
      ok(
        (await p.locator("#location").inputValue()) === "",
        "no example/default address",
      );
      ok(
        (await p.locator("#requestImage").getAttribute("multiple")) === null,
        "single image only",
      );
      ok(
        (await p.locator("#description").getAttribute("maxlength")) === null,
        "no invented description limit",
      );
      ok(
        await p.locator("#serviceType").isDisabled(),
        "service type waits for category",
      );
      ok(
        (await p.locator("#createRequestBtn").textContent()).trim() ===
          "Post Request & Find Providers",
        "creation action retained",
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
          form: r(".request-form-panel"),
          guidance: r(".request-guidance"),
          map: r("#requestMap"),
          submit: r("#createRequestBtn"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, `no overflow ${width}`);
      ok(m.map.width >= 215 && m.map.height >= 280, "usable map bounds");
      if (width >= 1366)
        ok(
          m.form.width > m.guidance.width && m.form.x < m.guidance.x,
          "wide form and secondary guidance",
        );
      else ok(m.guidance.y > m.form.y, "form first on narrow layouts");
      const invalid = await p
        .locator(
          'input:not([type="hidden"]):not([type="file"]),select,textarea,.request-submit-actions .btn,.request-map-actions button',
        )
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                r.width &&
                (r.width < 44 || r.height < 44 || r.right > innerWidth + 1)
              );
            })
            .map((e) => e.id),
        );
      ok(!invalid.length, `touch/bounds ${width}: ${invalid}`);
      await axe(p, `create ${width}`);
      await shot(p, `create-${width}`);
      ok(
        !s.calls.some(
          (o) => o.kind === "rpc" && o.name !== "igotu_backend_contract",
        ),
        "page load no business writes",
      );
      await c.close();
      console.log(`PASS responsive/axe ${width}`);
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, `create-${width}`, "before");
      await c.close();
    }
    {
      const { p, c, s } = await open({ dest: true });
      const expected = JSON.parse(
        execFileSync(
          "git",
          [
            "show",
            "5103c13c29ffd2989553c52cec3a10be11e05f04:igotu_v2/js/client-create-request.js",
          ],
          { encoding: "utf8" },
        )
          .match(/const SERVICE_TYPES = (\{[\s\S]*?\n\});/)[1]
          .replace(/([A-Za-z]+):/g, '"$1":')
          .replace(/,\s*}/g, "}"),
      );
      for (const [category, types] of Object.entries(expected)) {
        await p.locator("#category").selectOption(category);
        ok(
          JSON.stringify(
            await p
              .locator("#serviceType option")
              .evaluateAll((es) => es.map((e) => e.value).filter(Boolean)),
          ) === JSON.stringify(types),
          "unchanged category definitions " + category,
        );
      }
      await p.locator("#serviceType").selectOption("Other Service");
      await p.locator("#category").selectOption("Cleaning");
      ok(
        (await p.locator("#serviceType").inputValue()) === "",
        "old service type reset",
      );
      await p.locator("#category").selectOption("");
      ok(
        await p.locator("#serviceType").isDisabled(),
        "empty category disables type",
      );
      await p.locator("#createRequestBtn").click();
      ok(
        (await p.locator("#title").getAttribute("aria-invalid")) === "true",
        "native required feedback",
      );
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "no invalid submit",
      );
      await fill(p);
      await p.locator("#description").fill("X".repeat(650));
      ok(
        (await p.locator("#descriptionCount").textContent()).includes("650"),
        "counter imposes no 500 limit",
      );
      ok(
        !(await p.locator("#location").getAttribute("aria-invalid")),
        "search clears earlier required-address feedback",
      );
      await p
        .locator("#description")
        .fill(
          "Synthetic home cleaning for a three-bedroom apartment. Include the living room, kitchen and two bathrooms.",
        );
      await shot(p, "category-location-filled");
      await p.locator("#location").fill("A different manually typed address");
      ok(
        (await p.locator("#clientLat").inputValue()) === "",
        "manual edit invalidates stale pin",
      );
      await p.locator("#createRequestBtn").click();
      await waitMessage(p, "select your location");
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "unconfirmed location rejected",
      );
      await shot(p, "validation-error");
      await choose(p);
      await p.locator("#budget").fill("120.25");
      await p.locator("#priority").selectOption("urgent");
      await p.locator("#createRequestBtn").click();
      await waitMessage(p, "created successfully");
      await shot(p, "creation-success");
      await p.waitForURL("**/recommended-providers.html?request_id=*");
      const op = s.calls.find((o) => o.name === "create_service_request");
      ok(
        op.args.p_details.priority === "urgent" &&
          op.args.p_details.budget === 120.25,
        "existing budget/priority payload",
      );
      ok(
        op.args.p_details.client_lat === 6.04 &&
          op.args.p_details.client_lng === 116.12,
        "chosen coordinates saved",
      );
      ok(
        Object.keys(op.args).sort().join(",") === "p_details,p_idempotency_key",
        "creation RPC signature retained",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open();
      const file = {
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          await p.evaluate(() => {
            const canvas = document.createElement("canvas");
            canvas.width = 480;
            canvas.height = 320;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#e0f1db";
            ctx.fillRect(0, 0, 480, 320);
            ctx.fillStyle = "#176441";
            ctx.font = "bold 28px Arial";
            ctx.fillText("SYNTHETIC SERVICE IMAGE", 25, 135);
            ctx.font = "20px Arial";
            ctx.fillText("Offline preview fixture", 110, 180);
            return canvas.toDataURL("image/png").split(",")[1];
          }),
          "base64",
        ),
      };
      await p.locator("#requestImage").focus();
      const chooser = p.waitForEvent("filechooser");
      await p.keyboard.press("Space");
      await (await chooser).setFiles(file);
      ok(true, "keyboard file chooser");
      ok(await p.locator("#requestImagePreview").isVisible(), "image preview");
      await shot(p, "image-preview");
      await p.setViewportSize({ width: 390, height: 844 });
      await shot(p, "image-preview-390");
      await axe(p, "mobile image preview");
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "image state mobile bounds",
      );
      await p.locator("#removeRequestImageBtn").click();
      ok(
        await p.locator("#requestImagePreview").isHidden(),
        "remove local selection",
      );
      ok(
        !s.calls.some((o) => o.kind === "storage"),
        "no upload/delete from preview",
      );
      for (const type of ["image/jpeg", "image/png", "image/webp"]) {
        await p
          .locator("#requestImage")
          .setInputFiles({ ...file, mimeType: type });
        ok(
          await p.locator("#requestImagePreview").isVisible(),
          "supported MIME " + type,
        );
      }
      await p
        .locator("#requestImage")
        .setInputFiles({ name: "bad.gif", mimeType: "image/gif", buffer: png });
      await waitMessage(p, "JPG, PNG, or WEBP");
      ok(
        (await p.locator("#requestImage").evaluate((e) => e.files.length)) ===
          0,
        "invalid type cleared",
      );
      await p
        .locator("#requestImage")
        .setInputFiles({ ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
      await waitMessage(p, "5MB or below");
      ok(
        await p.locator("#requestImagePreview").isHidden(),
        "oversize rejected",
      );
      await c.close();
    }
    for (const scenario of ["missing", "fail", "http", "invalid"]) {
      const { p, c } = await open({ geo: { search: scenario } });
      await p.locator("#mapSearch").fill("Synthetic nowhere");
      await p.locator("#searchLocationBtn").click();
      await p.waitForFunction(() =>
        /not found|unavailable/.test(
          document.querySelector("#mapStatus").textContent,
        ),
      );
      ok(
        (await p.locator("#clientLat").inputValue()) === "",
        "bad search never confirms " + scenario,
      );
      await c.close();
    }
    for (const mode of ["fail", "missing"]) {
      const { p, c } = await open({ geo: { reverse: mode } });
      await p.locator("#requestMap").click({ position: { x: 110, y: 100 } });
      await p.waitForFunction(() =>
        document
          .querySelector("#mapStatus")
          .textContent.includes("coordinates"),
      );
      ok(
        (await p.locator("#location").inputValue()) !== "",
        "explicit point fallback",
      );
      ok(
        (await p.locator("#clientLat").inputValue()) !== "",
        "actual chosen point retained",
      );
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c } = await open({ geo: { reverseFirstHold: hold } });
      await p.locator("#requestMap").click({ position: { x: 90, y: 90 } });
      await p.locator("#requestMap").click({ position: { x: 150, y: 160 } });
      await p.waitForFunction(() =>
        document.querySelector("#location").value.includes("Synthetic point"),
      );
      const address = await p.locator("#location").inputValue();
      release();
      await p.waitForTimeout(100);
      ok(
        (await p.locator("#location").inputValue()) === address,
        "stale reverse response ignored",
      );
      const pin = await p.locator(".leaflet-marker-draggable").boundingBox();
      const previousLat = await p.locator("#clientLat").inputValue();
      await p.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
      await p.mouse.down();
      await p.mouse.move(
        pin.x + pin.width / 2 + 40,
        pin.y + pin.height / 2 + 35,
        { steps: 8 },
      );
      await p.mouse.up();
      ok(
        (await p.locator("#clientLat").inputValue()) !== previousLat,
        "real pointer drag updates coordinates",
      );
      const n = await p.evaluate(() => window.__mapInvalidations);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForFunction((n) => window.__mapInvalidations > n, n);
      ok(true, "map invalidates after responsive resize");
      await c.close();
    }
    for (const gps of [
      {},
      { mode: "error", code: 1 },
      { mode: "error", code: 2 },
      { mode: "error", code: 3 },
      { accuracy: 2500 },
    ]) {
      const { p, c } = await open({ gps });
      await p.locator("#useGpsBtn").click();
      await p.waitForFunction(
        () =>
          !/Detecting|Finding address/.test(
            document.querySelector("#mapStatus").textContent,
          ),
      );
      const text = await p.locator("#mapStatus").textContent();
      if (gps.mode === "error") {
        ok(
          (await p.locator("#clientLat").inputValue()) === "",
          "GPS error does not confirm",
        );
        ok(/denied|unavailable|timed out/.test(text), "clear GPS error");
      } else {
        ok(
          Number(await p.locator("#clientLat").inputValue()) === 6.09,
          "GPS fixture coordinates",
        );
        if (gps.accuracy > 1000)
          ok(text.includes("accuracy is low"), "low accuracy warning retained");
      }
      await c.close();
    }
    {
      const { p, c, s } = await open({ noMap: true });
      ok(
        (await p.locator("#mapStatus").textContent()).includes(
          "could not load",
        ),
        "map library error",
      );
      ok(
        (await p.locator("#clientLat").inputValue()) === "",
        "no fake location on library failure",
      );
      ok(
        await p.locator("#searchLocationBtn").isDisabled(),
        "map controls unavailable safely",
      );
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "no creation",
      );
      await shot(p, "map-unavailable");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        dest: true,
        delay: (o) => (o.name === "create_service_request" ? hold : undefined),
      });
      await fill(p);
      await p.locator("#createRequestBtn").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#createRequestForm").dataset.saving ===
          "true",
      );
      ok(
        await p.locator("#createRequestBtn").isDisabled(),
        "actual submit disabled",
      );
      await p.evaluate(() =>
        document.querySelector("#createRequestForm").requestSubmit(),
      );
      await shot(p, "saving");
      release();
      await p.waitForURL("**/recommended-providers.html?*");
      ok(
        s.calls.filter((o) => o.name === "create_service_request").length === 1,
        "duplicate clicks create once",
      );
      await c.close();
    }
    {
      let failed = false;
      const { p, c, s } = await open({
        dest: true,
        fail: (o) =>
          o.name === "create_service_request" && !failed
            ? ((failed = true), "throw")
            : false,
      });
      await fill(p);
      await p.locator("#createRequestBtn").click();
      await waitMessage(p, "Check My Requests");
      const key = s.calls.find((o) => o.name === "create_service_request").args
        .p_idempotency_key;
      await p.locator("#createRequestBtn").click();
      await p.waitForURL("**/recommended-providers.html?*");
      ok(
        s.calls
          .filter((o) => o.name === "create_service_request")
          .every((o) => o.args.p_idempotency_key === key),
        "uncertain retry reuses key",
      );
      await c.close();
    }
    {
      let fail = true;
      const { p, c, s } = await open({
        dest: true,
        fail: (o) => fail && o.kind === "storage" && o.action === "upload",
      });
      await fill(p);
      await p.locator("#requestImage").setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: png,
      });
      await p.locator("#createRequestBtn").click();
      await waitMessage(p, "was saved, but its image was not attached");
      ok(
        (await p.locator("#pageTitle").textContent()) ===
          "Edit Service Request",
        "partial image failure enters recovery edit mode",
      );
      ok(
        (await p.locator("#createRequestBtn").textContent()).trim() ===
          "Save Changes",
        "attachment retry action",
      );
      fail = false;
      await p.locator("#createRequestBtn").click();
      await p.waitForURL("**/request-details.html?*");
      ok(
        s.calls.filter((o) => o.name === "create_service_request").length === 1,
        "attachment retry no second creation",
      );
      ok(
        s.calls.some((o) => o.name === "client_save_request_image"),
        "association RPC retained",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({
        id: "REQ-PENDING",
        dest: true,
        prepare: (t) => {
          const r = t.service_requests.find(
            (x) => x.request_id === "REQ-PENDING",
          );
          r.request_image_url =
            base + "/fixture-asset/request-images/saved.png";
          r.request_image_path = "synthetic-owner/saved.png";
        },
      });
      ok(
        (await p.locator("#pageTitle").textContent()) ===
          "Edit Service Request",
        "edit heading",
      );
      ok(
        (await p.locator("#createRequestBtn").textContent()).trim() ===
          "Save Changes",
        "edit action",
      );
      ok(
        await p.locator("#requestImagePreviewImg").isVisible(),
        "stored preview",
      );
      ok(
        Number(await p.locator("#clientLat").inputValue()) === 6.04,
        "owned saved location restored",
      );
      await p.locator("#requestImage").setInputFiles({
        name: "replacement.png",
        mimeType: "image/png",
        buffer: png,
      });
      await p.locator("#removeRequestImageBtn").click();
      ok(
        (await p.locator("#requestImageFileStatus").textContent()).includes(
          "Stored image",
        ),
        "remove new selection restores stored image",
      );
      ok(!s.calls.some((o) => o.kind === "storage"), "no stored deletion");
      await shot(p, "edit-request");
      await p.locator("#title").fill("Updated synthetic request");
      await p.locator("#createRequestBtn").click();
      await p.waitForURL("**/request-details.html?request_id=REQ-PENDING");
      ok(
        s.calls.filter((o) => o.name === "client_update_request").length === 1,
        "existing edit RPC",
      );
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "edit never creates",
      );
      await c.close();
    }
    for (const kind of ["foreign", "completed", "missing"]) {
      const { p, c, s } = await open({
        id: kind === "missing" ? "UNKNOWN" : "REQ-PENDING",
        blocked: true,
        prepare: (t) => {
          const r = t.service_requests.find(
            (x) => x.request_id === "REQ-PENDING",
          );
          if (kind === "foreign") r.client_id = "foreign";
          if (kind === "completed") r.status = "completed";
        },
      });
      await p.waitForFunction(
        () =>
          !document.querySelector("#messageBox").classList.contains("hidden"),
      );
      ok(
        await p.locator("#createRequestBtn").isDisabled(),
        "ineligible edit blocked " + kind,
      );
      ok(
        !s.calls.some(
          (o) =>
            o.name === "create_service_request" ||
            o.name === "client_update_request",
        ),
        "no unauthorized write",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({ dest: true });
      await p.locator("#title").fill("Unsaved synthetic title");
      await p.locator("#cancelRequestBtn").click();
      ok(
        await p.locator("#requestCancelDialog").isVisible(),
        "dirty Cancel asks",
      );
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#cancelRequestBtn")
          .evaluate((e) => e === document.activeElement),
        "Cancel restores focus",
      );
      await p.locator("#cancelRequestBtn").click();
      await axe(p, "cancel dialog");
      await p.locator("#requestCancelLeave").click();
      await p.waitForURL("**/dashboard.html");
      ok(
        !s.calls.some(
          (o) =>
            o.name === "create_service_request" ||
            o.name === "client_update_request",
        ),
        "Cancel makes no request write",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({ dest: true, width: 390 });
      await p.locator("#profileMenuTrigger").focus();
      await p.keyboard.press("Enter");
      await p.waitForFunction(
        () =>
          document
            .querySelector("#profileMenuTrigger")
            .getAttribute("aria-expanded") === "true",
      );
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile navigation retained",
      );
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#profileMenuTrigger")
          .evaluate((e) => e === document.activeElement),
        "profile Escape focus",
      );
      await p.locator("#notificationMenuTrigger").click();
      await p.waitForFunction(
        () =>
          document
            .querySelector("#notificationMenuTrigger")
            .getAttribute("aria-expanded") === "true",
      );
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notifications accessible",
      );
      await p.keyboard.press("Escape");
      await p.locator("#cancelRequestBtn").click();
      await p.waitForURL("**/dashboard.html");
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "clean Cancel does not write",
      );
      await c.close();
    }
    for (const value of ["Infinity", "91", "-91", "not-a-number"]) {
      const { p, c, s } = await open();
      await fill(p);
      await p
        .locator("#clientLat")
        .evaluate((e, value) => (e.value = value), value);
      await p.locator("#createRequestBtn").click();
      await waitMessage(p, "Invalid map coordinates");
      ok(
        !s.calls.some((o) => o.name === "create_service_request"),
        "invalid coordinate cannot submit " + value,
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        id: "REQ-PENDING",
        prepare: (t) => {
          const r = t.service_requests.find(
            (r) => r.request_id === "REQ-PENDING",
          );
          r.client_lat = null;
          r.client_lng = null;
          r.request_image_url = "javascript:alert(1)";
        },
      });
      ok(
        (await p.locator("#clientLat").inputValue()) === "",
        "null saved coordinates never become zero",
      );
      ok(
        await p.locator("#requestImagePreview").isHidden(),
        "unsafe saved image URL rejected",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ noUI: true, dest: true });
      await fill(p);
      await p.locator("#createRequestBtn").click();
      await p.waitForURL("**/recommended-providers.html?*");
      ok(true, "core works without optional presentation script");
      await c.close();
    }
    {
      const { p, c } = await open({ motion: true });
      await p.waitForFunction(() => !document.querySelector(".request-enter"));
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite idle motion",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".request-section")
          .first()
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion",
      );
      await c.close();
    }
    ok(!errors.length, `no page errors ${errors}`);
    ok(
      !escaped.length,
      `no unexpected external requests (all blocked): ${escaped.join(", ")}`,
    );
    fs.writeFileSync(
      path.join(out, "responsive-metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    console.log(
      `PASS ${checks} create/edit form assertions; eight viewport axe scans plus modal; no live Supabase/maps/GPS`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
