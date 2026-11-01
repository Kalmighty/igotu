/* Compare the refined login with PR #13's original commit, locally only.
   UI_BASE_URL=http://127.0.0.1:4182 node tests/login-refinement.cjs */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const base = new URL(process.env.UI_BASE_URL || "http://127.0.0.1:4182");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Loopback only",
);
const original = "17ec4d7826724c56d7ca3642eef58f941d9f78b7";
const old = new Map(
  ["/login.html", "/css/login.css"].map((p) => [
    p,
    execFileSync("git", ["show", `${original}:igotu_v2${p}`]),
  ]),
);
const fixture = fs.readFileSync(
  path.join(__dirname, "auth-fixture.js"),
  "utf8",
);
const out = process.env.UI_REFINEMENT_OUTPUT || "work/login-refinement";
fs.mkdirSync(out, { recursive: true });
function metrics() {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const round = (n) => Math.round(n * 10) / 10;
  const form = r(".auth-form-panel"),
    btn = r("#loginBtn"),
    email = r("#email"),
    password = r("#password"),
    left = r(".auth-welcome-note");
  return {
    viewport: { width: innerWidth, height: innerHeight },
    formTop: round(form.top),
    formWidth: round(form.width),
    formHeight: round(form.height),
    formColumnPercent: round((form.width / (form.width + left.width)) * 100),
    emailTop: round(email.top),
    passwordTop: round(password.top),
    loginButton: {
      top: round(btn.top),
      bottom: round(btn.bottom),
      height: round(btn.height),
      fullyVisible: btn.top >= 0 && btn.bottom <= innerHeight,
      scrollNeededPx: Math.max(0, Math.ceil(btn.bottom - innerHeight)),
    },
    roleCardHeights: [...document.querySelectorAll("[data-login-role]")].map(
      (e) => round(e.getBoundingClientRect().height),
    ),
    pageHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    layoutShift: window.__layoutShift || 0,
  };
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const rows = [],
    errors = [],
    external = [];
  try {
    for (const [width, height] of [
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1024, 900],
      [768, 1024],
      [390, 844],
      [320, 844],
    ]) {
      const row = { width, height };
      for (const version of ["before", "after"]) {
        const c = await browser.newContext({
          viewport: { width, height },
          reducedMotion: "reduce",
        });
        await c.addInitScript(() => {
          window.__layoutShift = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              if (!e.hadRecentInput) window.__layoutShift += e.value;
          }).observe({ type: "layout-shift", buffered: true });
        });
        await c.route("**/*", (r) => {
          const u = new URL(r.request().url());
          if (u.origin !== base.origin) {
            external.push(u.origin);
            return r.abort();
          }
          if (u.pathname === "/js/supabaseClient.js")
            return r.fulfill({ contentType: "text/javascript", body: fixture });
          if (version === "before" && old.has(u.pathname))
            return r.fulfill({
              contentType: u.pathname.endsWith(".css")
                ? "text/css"
                : "text/html",
              body: old.get(u.pathname),
            });
          return r.continue();
        });
        const p = await c.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(new URL("/login.html", base).href);
        await p.waitForFunction(
          () =>
            window.__authCalls &&
            document
              .querySelector('[data-login-role="client"]')
              .getAttribute("aria-pressed") === "true",
        );
        await p.locator(".preview-canvas").scrollIntoViewIfNeeded();
        await p.locator(".preview-student").evaluate((i) => i.decode());
        await p.evaluate(() => scrollTo(0, 0));
        await p.waitForTimeout(80);
        row[version] = await p.evaluate(metrics);
        if (width === 1366 || width === 1536)
          await p.screenshot({
            path: path.join(out, `${version}-${width}x${height}.png`),
          });
        if (version === "after") {
          assert.equal(row.after.overflow, false, `Overflow at ${width}`);
          assert.ok(
            row.after.layoutShift <= 0.001,
            `Initial layout shift at ${width}: ${row.after.layoutShift}`,
          );
          assert.ok(
            Math.max(...row.after.roleCardHeights) -
              Math.min(...row.after.roleCardHeights) <=
              1,
            "Balanced role cards",
          );
          const actionYs = await p
            .locator(".role-card-action")
            .evaluateAll((es) =>
              es
                .filter((e) => e.checkVisibility())
                .map((e) => e.getBoundingClientRect().top),
            );
          if (actionYs.length)
            assert.ok(
              Math.max(...actionYs) - Math.min(...actionYs) <= 2,
              "Aligned role actions",
            );
          await p.locator("#email").fill("fixture@example.invalid");
          await p.locator("#password").fill("SyntheticOnly123");
          for (const role of ["provider", "admin", "client"]) {
            await p.locator(`[data-login-role="${role}"]`).click();
            assert.equal(
              await p.locator("#email").inputValue(),
              "fixture@example.invalid",
            );
            assert.equal(
              await p.locator("#password").inputValue(),
              "SyntheticOnly123",
            );
            assert.ok(
              Math.abs(
                (await p.locator(".auth-form-panel").boundingBox()).height -
                  row.after.formHeight,
              ) <= 2,
              `Role-switch form jump at ${width}`,
            );
          }
          if (width <= 850) {
            const f = await p.locator(".auth-form-panel").boundingBox(),
              a = await p.locator(".auth-welcome-note").boundingBox();
            assert.ok(f.y + f.height < a.y);
          }
        }
        await c.close();
      }
      row.formTopReductionPx =
        Math.round((row.before.formTop - row.after.formTop) * 10) / 10;
      row.formTopReductionPercent =
        Math.round((row.formTopReductionPx / row.before.formTop) * 1000) / 10;
      if (width >= 1300)
        assert.ok(
          row.formTopReductionPercent >= 14.5,
          `Expected meaningful 15% form-position improvement at ${width}: ${row.formTopReductionPercent}%`,
        );
      rows.push(row);
      console.log(
        `PASS ${width}x${height}: form ${row.before.formTop}→${row.after.formTop}px (${row.formTopReductionPercent}% earlier); button bottom ${row.before.loginButton.bottom}→${row.after.loginButton.bottom}; scroll needed ${row.after.loginButton.scrollNeededPx}px`,
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(
      path.join(out, "measurements.json"),
      JSON.stringify(
        {
          scope: "OFFLINE_SYNTHETIC_UI_ONLY",
          baseCommit: original,
          viewports: rows,
          browserErrors: errors,
          externalRequests: external,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
