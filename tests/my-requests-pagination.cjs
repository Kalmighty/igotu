/* Focused pagination refinement: real page + synthetic owned data, loopback only. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const reviewed = "5de95e82eb44a50a62de6dbfc132319d08838c4a";
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4207";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Loopback required",
);
const out = "docs/my-requests/pagination";
fs.mkdirSync(out + "/validation", { recursive: true });
const jsPath = "igotu_v2/js/client-my-requests.js",
  cssPath = "igotu_v2/css/client-my-requests.css";
const beforeJs = execFileSync("git", ["show", reviewed + ":" + jsPath], {
    encoding: "utf8",
  }),
  afterJs = fs.readFileSync(jsPath, "utf8");
// Exactly the pagination button helper changes; all surrounding logic must remain identical.
assert.equal(
  afterJs.split("    function add(")[0],
  beforeJs.split("    function add(")[0],
);
assert.equal(
  afterJs.slice(afterJs.indexOf('    add("Previous"')),
  beforeJs.slice(beforeJs.indexOf('    add("Previous"')),
);
const beforeCss = execFileSync("git", ["show", reviewed + ":" + cssPath], {
  encoding: "utf8",
});
assert(
  fs.readFileSync(cssPath, "utf8").startsWith(beforeCss),
  "Existing styles changed",
);
assert.equal(
  fs.readFileSync("igotu_v2/client/my-requests.html", "utf8"),
  execFileSync(
    "git",
    ["show", reviewed + ":igotu_v2/client/my-requests.html"],
    { encoding: "utf8" },
  ),
);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let checks = 0,
    scans = 0;
  const errors = [],
    external = [],
    measurements = [];
  const ok = (v, m) => {
    assert(v, m);
    checks++;
  };
  const listQuery = (o) => o.kind === "query" && o.table === "service_requests";
  async function open(count, before = false) {
    const c = await browser.newContext({
      viewport: { width: 320, height: 844 },
      reducedMotion: "reduce",
    });
    const t = seed(),
      sample = t.service_requests[0];
    t.service_requests = Array.from({ length: count }, (_, i) => ({
      ...sample,
      request_id: "P-" + String(i + 1).padStart(5, "0"),
      title: "Synthetic service " + (i + 1),
      created_at: new Date(Date.UTC(2026, 10, 2, 10) - i * 60000).toISOString(),
      category: i % 2 ? "Repair" : "Cleaning",
      status: i % 3 ? "confirmed" : "pending",
    }));
    const s = await install(c, { tables: t });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        before &&
        ["/js/client-my-requests.js", "/css/client-my-requests.css"].includes(
          u.pathname,
        )
      )
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : "text/css",
          body: execFileSync(
            "git",
            ["show", reviewed + ":igotu_v2" + u.pathname],
            { encoding: "utf8" },
          ),
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.setFixedTime(new Date("2026-11-02T10:00:00Z"));
    await p.goto(base + "/client/my-requests.html");
    await p.waitForFunction(
      () => document.body.dataset.requestsReady === "true",
    );
    return { p, c, s };
  }
  const visibleIds = (p) =>
    p
      .locator(".requests-card")
      .evaluateAll((es) => es.map((e) => e.dataset.requestId));
  async function check(p, count, width, label) {
    const result = await p.evaluate(() => {
      const nav = document.querySelector("#requestsPagination");
      const bounds = (e) => {
        const r = e.getBoundingClientRect();
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
        pageWidth: document.documentElement.scrollWidth,
        nav: bounds(nav),
        controls: [...nav.querySelectorAll("button")]
          .filter((e) => e.getBoundingClientRect().width)
          .map((e) => ({
            name: e.getAttribute("aria-label"),
            current: e.getAttribute("aria-current"),
            disabled: e.disabled,
            ...bounds(e),
          })),
      };
    });
    measurements.push({ count, label, ...result });
    ok(result.pageWidth === width, "page bounds " + label);
    if (count <= 5) {
      ok(
        await p.locator("#requestsPagination").isHidden(),
        "zero/single page hidden " + count,
      );
      return;
    }
    ok(
      result.controls.every((e) => e.width >= 44 && e.height >= 44),
      "touch targets " + label,
    );
    ok(
      result.controls.every((e) => Math.abs(e.y - result.controls[0].y) < 1),
      "one pagination row " + label,
    );
    ok(
      result.controls.every(
        (e, i) =>
          e.x >= result.nav.x - 1 &&
          e.right <= result.nav.right + 1 &&
          (!i || e.x >= result.controls[i - 1].right),
      ),
      "no overlap/overflow " + label,
    );
    ok(
      Math.abs(
        (result.controls[0].x + result.controls.at(-1).right) / 2 -
          (result.nav.x + result.nav.width / 2),
      ) < 1,
      "centred " + label,
    );
    ok(
      await p
        .getByRole("button", { name: "Previous page", exact: true })
        .isVisible(),
      "Previous visible " + label,
    );
    ok(
      await p
        .getByRole("button", { name: "Next page", exact: true })
        .isVisible(),
      "Next visible " + label,
    );
    ok(
      result.controls.filter((e) => e.current === "page").length === 1,
      "one accessible current page",
    );
    if (width <= 480) {
      ok(result.controls.length === 3, "compact three controls " + label);
      ok(
        (
          await p
            .locator("#requestsPagination [aria-current]")
            .getAttribute("aria-label")
        ).includes(" of " + Math.ceil(count / 5)),
        "dynamic page total accessible",
      );
      ok(
        (
          await p
            .locator("#requestsPagination [aria-current]")
            .evaluate((e) => getComputedStyle(e, "::after").content)
        ).includes("Page "),
        "readable compact indicator",
      );
    }
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
  async function comparison(p, width, before, variant = "") {
    await p.setViewportSize({ width, height: 900 });
    const nav = p.locator("#requestsPagination");
    await nav.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const bounds = await nav.boundingBox();
    // Label sits inside the screenshot clip, is test-only, and cannot affect pagination geometry.
    await p.evaluate(
      ({ x, y }) => {
        const e = document.createElement("div");
        e.id = "paginationOfflineLabel";
        e.textContent = "SYNTHETIC / OFFLINE";
        e.style = `position:absolute;left:${x}px;top:${y - 23 + scrollY}px;font:700 11px Arial;color:#453b15;background:#fff4cd;padding:3px 6px;z-index:10000`;
        document.body.append(e);
      },
      { x: bounds.x, y: bounds.y },
    );
    await p.screenshot({
      path: `${out}/${before ? "before" : "after"}-${width}${variant}-pagination.png`,
      clip: {
        x: Math.max(0, bounds.x - 8),
        y: bounds.y - 28,
        width: bounds.width + 16,
        height: bounds.height + 40,
      },
    });
    await p.locator("#paginationOfflineLabel").evaluate((e) => e.remove());
    if (width === 1536)
      return {
        bounds: { width: bounds.width, height: bounds.height },
        image: await nav.screenshot(),
      };
  }
  try {
    for (const count of [0, 1, 5, 6, 12, 50, 5005]) {
      const { p, c, s } = await open(count);
      const totalPages = Math.ceil(count / 5);
      ok(
        (await visibleIds(p)).length === Math.min(5, count),
        "five rows/page " + count,
      );
      for (const width of [320, 360, 375, 390, 480, 768, 1366, 1536]) {
        await p.setViewportSize({ width, height: 900 });
        await check(p, count, width, `${count} rows at ${width}`);
      }
      await p.setViewportSize({ width: 320, height: 844 });
      await axe(p, "320 / " + count);
      if (count > 5) {
        ok(
          await p
            .getByRole("button", { name: "Previous page", exact: true })
            .isDisabled(),
          "first Previous disabled",
        );
        const next = p.getByRole("button", { name: "Next page", exact: true });
        await next.focus();
        ok(
          await next.evaluate(
            (e) => getComputedStyle(e).outlineStyle !== "none",
          ),
          "visible focus",
        );
        await p.keyboard.press("Enter");
        ok(
          (await visibleIds(p))[0] === "P-00006",
          "keyboard Next actual data " + count,
        );
        ok(
          (await p.locator("#requestsResultCount").textContent()).startsWith(
            `Showing 6–${Math.min(10, count)}`,
          ),
          "correct range",
        );
        ok(
          await p
            .locator("#requestsListHeading")
            .evaluate((e) => e === document.activeElement),
          "existing focus restoration",
        );
        await p
          .getByRole("button", { name: "Previous page", exact: true })
          .click();
        ok((await visibleIds(p))[0] === "P-00001", "Previous actual data");
        await p.setViewportSize({ width: 1536, height: 900 });
        await p
          .getByRole("button", { name: "Page " + totalPages, exact: true })
          .click();
        ok(
          (await visibleIds(p))[0] ===
            "P-" + String((totalPages - 1) * 5 + 1).padStart(5, "0"),
          "last page exact index",
        );
        await p.setViewportSize({ width: 320, height: 844 });
        await check(p, count, 320, "last page " + count);
        ok(
          await p
            .getByRole("button", { name: "Next page", exact: true })
            .isDisabled(),
          "last Next disabled",
        );
        if (count === 5005) {
          await p
            .getByRole("button", { name: "Previous page", exact: true })
            .click();
          await check(p, count, 320, "middle with four-digit total");
          await comparison(p, 320, false, "-many-pages");
        }
        await p.locator("#categoryFilter").selectOption("Cleaning");
        ok(
          (await p.locator("#requestsPagination").isHidden()) ||
            (await p
              .getByRole("button", { name: "Previous page", exact: true })
              .isDisabled()),
          "filter resets page 1",
        );
        ok(
          (await p.locator("#categoryFilter").inputValue()) === "Cleaning",
          "filter remains",
        );
        await p.locator("#requestSort").selectOption("oldest");
        ok(
          (await p.locator("#requestsPagination").isHidden()) ||
            (await p
              .getByRole("button", { name: "Previous page", exact: true })
              .isDisabled()),
          "sort resets",
        );
        await p.locator("#resetFiltersBtn").click();
        ok(
          (await visibleIds(p))[0] === "P-00001",
          "reset preserves original sort default",
        );
      }
      ok(
        s.calls.filter(listQuery).length === 1,
        "pagination/resize/filter local " + count,
      );
      ok(
        !s.calls.some((o) => o.name === "client_cancel_request"),
        "no mutation " + count,
      );
      await c.close();
      console.log("PASS pagination dataset " + count);
    }
    const old = await open(12, true),
      fresh = await open(12);
    await comparison(old.p, 320, true);
    await comparison(fresh.p, 320, false);
    await comparison(fresh.p, 390, false);
    const a = await comparison(old.p, 1536, true),
      b = await comparison(fresh.p, 1536, false);
    ok(
      JSON.stringify(a.bounds) === JSON.stringify(b.bounds),
      "desktop bounds unchanged",
    );
    ok(a.image.equals(b.image), "desktop pagination pixel-identical");
    // Shrinking/growing retains page/data and uses CSS only, without new queries.
    await fresh.p.setViewportSize({ width: 320, height: 844 });
    await fresh.p
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    const selected = await visibleIds(fresh.p),
      queries = fresh.s.calls.filter(listQuery).length;
    await fresh.p.setViewportSize({ width: 1536, height: 900 });
    ok(
      JSON.stringify(await visibleIds(fresh.p)) === JSON.stringify(selected),
      "resize retains current page",
    );
    await fresh.p.setViewportSize({ width: 320, height: 844 });
    ok(
      fresh.s.calls.filter(listQuery).length === queries,
      "resize adds no fetch",
    );
    ok(
      await fresh.p
        .locator("#requestsPagination")
        .evaluate((e) =>
          e
            .getAnimations({ subtree: true })
            .every((a) => a.playState !== "running"),
        ),
      "reduced motion no pagination animation",
    );
    await old.c.close();
    await fresh.c.close();
    ok(!errors.length, "no browser exceptions " + errors);
    ok(!external.length, "no external traffic (all blocked) " + external);
    fs.writeFileSync(
      out + "/validation/pagination.json",
      JSON.stringify(
        {
          reviewed,
          assertions: checks,
          axeScans: scans,
          axeViolations: 0,
          datasets: [0, 1, 5, 6, 12, 50, 5005],
          widths: [320, 360, 375, 390, 480, 768, 1366, 1536],
          desktopPixelIdentical: true,
          measurements,
          liveBackend: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} pagination assertions; ${scans} axe scans; desktop pixel comparison; no live backend`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
