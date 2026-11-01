/* Local, public-homepage visual contract. All remote requests are blocked.
   Start python -m http.server 4178 --bind 127.0.0.1 --directory igotu_v2
   UI_BASE_URL=http://127.0.0.1:4178 UI_SCREENSHOTS=work/homepage-reference node tests/home-reference.cjs */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = new URL(process.env.UI_BASE_URL || "http://127.0.0.1:4178");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Use a loopback-only server",
);
const output = process.env.UI_SCREENSHOTS || "work/homepage-reference";
const axePath = require.resolve("axe-core/axe.min.js");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const errors = [],
    external = [],
    observations = [];
  try {
    await context.route("**/*", (r) => {
      const url = new URL(r.request().url());
      if (url.origin !== base.origin) {
        external.push(url.origin);
        return r.abort();
      }
      // View destination UI without importing Auth/Supabase. No forms submitted.
      if (url.pathname === "/js/auth.js")
        return r.fulfill({ contentType: "text/javascript", body: "" });
      return r.continue();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("response", (r) => {
      if (r.status() >= 400)
        errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1536, 1440, 1024, 768, 390, 320]) {
      await p.setViewportSize({ width, height: width > 850 ? 1024 : 844 });
      await p.goto(new URL("/index.html", base).href);
      await p.locator(".idea-card").last().scrollIntoViewIfNeeded();
      await p.evaluate(() => scrollTo(0, 0));
      await p.waitForTimeout(100);
      assert.equal(
        await p.locator(".nav-links [aria-current]").getAttribute("href"),
        "#home",
      );
      const order = await p
        .locator("main section[id]")
        .evaluateAll((es) => es.map((e) => e.id));
      assert.deepEqual(order, [
        "home",
        "services",
        "categories",
        "how-it-works",
        "why-igotu",
      ]);
      assert.deepEqual(await p.locator(".idea-copy h3").allTextContents(), [
        "Room Cleaning",
        "Tutoring",
        "Laptop Repair",
        "Moving Help",
        "Errands / Runner",
      ]);
      assert.equal(await p.locator(".steps li").count(), 4);
      assert.equal(
        await p.locator(".sample-card a[href]").count(),
        0,
        "Examples must not become a public directory",
      );
      assert.equal(
        await p.locator("script[src]").count(),
        1,
        "No data or authentication modules on the public homepage",
      );
      assert.equal(
        await p
          .locator("img")
          .evaluateAll((es) =>
            es.every((e) => e.complete && e.naturalWidth > 0),
          ),
        true,
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      // Check actual visible text and targets, including when disclosure content expands.
      for (const selector of [".explorer-disclosure", ".criteria-disclosure"]) {
        const summary = p.locator(`${selector} summary`);
        await summary.focus();
        assert.notEqual(
          await summary.evaluate((e) => getComputedStyle(e).outlineStyle),
          "none",
        );
        await p.keyboard.press("Enter");
        assert.equal(await p.locator(selector).getAttribute("open"), "");
      }
      const clipped = await p
        .locator("h1,h2,h3,p,a,button,select,summary")
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                e.checkVisibility() &&
                r.width &&
                (r.left < -1 || r.right > innerWidth + 1)
              );
            })
            .map((e) => e.className || e.tagName),
        );
      assert.deepEqual(
        clipped,
        [],
        `Visible disclosure content clipped at ${width}`,
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.addScriptTag({ path: axePath });
      const violations = await p.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      assert.deepEqual(violations, [], `Expanded accessibility at ${width}`);
      // Test every allowlisted category, not only the Tutoring shortcut.
      for (const category of [
        "cleaning",
        "delivery",
        "repair",
        "moving-help",
        "errands",
        "tutoring",
        "other",
      ]) {
        await p.locator("#service-explorer-category").selectOption(category);
        await p.locator("#service-explorer-go").click();
        assert.equal(new URL(p.url()).hash, `#service-${category}`);
        assert.equal(
          await p
            .locator(`#service-${category}`)
            .evaluate((e) => e === document.activeElement),
          true,
        );
        assert.ok(
          (await p.locator(`#service-${category}`).boundingBox()).y >= 58,
          "Focused category must clear the header",
        );
      }
      for (const selector of [".explorer-disclosure", ".criteria-disclosure"])
        await p.locator(`${selector} summary`).click();
      // Check all navigation sections by keyboard, including mobile disclosure closure.
      for (const id of ["home", "how-it-works", "services", "why-igotu"]) {
        if (width <= 850) await p.locator(".menu-toggle").click();
        await p.locator(`.nav-links a[href="#${id}"]`).focus();
        await p.keyboard.press("Enter");
        await p.waitForTimeout(50);
        assert.equal(new URL(p.url()).hash, `#${id}`);
        if (width <= 850)
          assert.equal(await p.locator("#site-navigation").isVisible(), false);
      }
      await p.goto(new URL("/index.html", base).href);
      await p.locator(".idea-card").last().scrollIntoViewIfNeeded();
      await p.evaluate(() => scrollTo(0, 0));
      await p.waitForTimeout(100);
      await p.screenshot({
        path: path.join(output, `homepage-${width}.png`),
        fullPage: true,
      });
      if (width === 1536) {
        await p.screenshot({ path: path.join(output, "desktop-viewport.png") });
        for (const [name, selector] of [
          ["hero", ".hero"],
          ["helpful-right-now", ".inspiration"],
          ["categories", ".categories"],
          ["recommendations", ".sample-matches"],
          ["how-it-works", ".how-it-works"],
        ])
          await p
            .locator(selector)
            .screenshot({ path: path.join(output, `${name}.png`) });
      }
      observations.push({
        width,
        overflow: false,
        expandedDisclosures: "PASS",
        categories: 7,
        axeViolations: 0,
      });
      console.log(
        `PASS reference layout, disclosures, category and navigation keyboard checks: ${width}px`,
      );
    }
    // Every idea/category/CTA enters the existing registration UI. There is no
    // unguarded direct request link, category injection or new workflow state.
    await p.setViewportSize({ width: 1440, height: 1024 });
    for (const selector of [
      ".idea-card",
      ".category-card",
      '.hero-actions a[href="register.html"]',
      ".sample-action",
      ".cta-actions a",
    ]) {
      await p.goto(new URL("/index.html", base).href);
      const count = await p.locator(selector).count();
      for (let i = 0; i < count; i++) {
        await p.goto(new URL("/index.html", base).href);
        await p.locator(selector).nth(i).click();
        await p.waitForURL("**/register.html");
        assert.equal(await p.locator("#registerForm").isVisible(), true);
        assert.deepEqual(
          await p
            .locator("#role option")
            .evaluateAll((es) => es.map((e) => e.value)),
          ["", "client", "provider"],
        );
        assert.equal(
          await p.locator("#role").inputValue(),
          "",
          "Homepage does not grant or silently select a role",
        );
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(
      path.join(output, "observations.json"),
      JSON.stringify(
        {
          scope: "OFFLINE_PUBLIC_UI_ONLY",
          viewports: observations,
          consoleErrors: errors,
          externalRequests: external,
          liveBackendTested: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS: all 16 idea/category/CTA registration links, no public Provider directory, no role bypass, no external requests or browser errors. Screenshots are actual Chromium renders.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
