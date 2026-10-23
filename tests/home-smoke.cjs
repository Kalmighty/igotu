/* Local homepage checks. Requires Playwright, axe-core and Chromium; no app dependencies.
   UI_BASE_URL=http://127.0.0.1:4173 UI_SCREENSHOTS=work/homepage node tests/home-smoke.cjs */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axePath = process.env.AXE_PATH || require.resolve("axe-core/axe.min.js");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const screenshots = process.env.UI_SCREENSHOTS;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [],
      external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width > 650 ? 1000 : 844 });
      await page.goto(`${base}/index.html`);
      assert.equal(await page.title(), "IGotU — Need a service? We got you.");
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Overflow at ${width}`,
      );
      // Visible content must fit horizontally, including the original illustration.
      const clipped = await page
        .locator(
          "h1,h2,h3,p,.button,.category-card,.preview-request,.preview-provider",
        )
        .evaluateAll((elements) =>
          elements
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width && (r.left < -1 || r.right > innerWidth + 1);
            })
            .map((e) => e.className || e.tagName),
        );
      assert.deepEqual(clipped, [], `Clipped content at ${width}`);
      // The supporting Provider card must not cover meaningful parts of the primary card.
      const overlap = await page.evaluate(() => {
        const a = document
          .querySelector(".preview-provider")
          .getBoundingClientRect();
        const b = document
          .querySelector(".preview-alternative")
          .getBoundingClientRect();
        return (
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
        );
      });
      assert.ok(
        overlap < 250,
        `Provider illustration cards overlap at ${width}`,
      );
      if (width <= 850) {
        const clear = await page.evaluate(() => {
          const request = document
            .querySelector(".preview-request")
            .getBoundingClientRect();
          const provider = document
            .querySelector(".preview-provider")
            .getBoundingClientRect();
          return (
            request.right <= provider.left || request.bottom <= provider.top
          );
        });
        assert.equal(
          clear,
          true,
          `Illustrative request text is obscured at ${width}`,
        );
      }
      if (screenshots && [1440, 390].includes(width)) {
        const name = width === 1440 ? "desktop" : "mobile";
        await page.screenshot({
          path: path.join(screenshots, `homepage-${name}.png`),
          fullPage: true,
        });
        await page.screenshot({
          path: path.join(screenshots, `homepage-${name}-hero.png`),
        });
      }
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () =>
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
      assert.deepEqual(violations, [], `Accessibility violations at ${width}`);
      const menu = page.locator(".menu-toggle");
      if (width <= 850) {
        assert.equal(await page.locator("#site-navigation").isVisible(), false);
        await menu.click();
        assert.equal(await menu.getAttribute("aria-expanded"), "true");
        await page.locator(".nav-links a").first().focus();
        await page.keyboard.press("Escape");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        assert.equal(
          await menu.evaluate((e) => document.activeElement === e),
          true,
        );
        await menu.click();
      }
      await page.locator('.nav-links a[href="#services"]').click();
      await page.waitForTimeout(100);
      assert.equal(new URL(page.url()).hash, "#services");
      const headerBottom = await page
        .locator(".site-header")
        .evaluate((e) => e.getBoundingClientRect().bottom);
      const targetTop = await page
        .locator("#services")
        .evaluate((e) => e.getBoundingClientRect().top);
      assert.ok(
        targetTop >= headerBottom - 1,
        `Anchor obscured by sticky header at ${width}`,
      );
      if (width <= 850) {
        assert.equal(await page.locator("#site-navigation").isVisible(), false);
        assert.equal(
          await page
            .locator("#services")
            .evaluate((e) => document.activeElement === e),
          true,
        );
      }
      for (const criterion of ["availability", "distance", "skills"]) {
        const button = page.locator(`[data-criterion="${criterion}"]`);
        await button.focus();
        await page.keyboard.press("Enter");
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        assert.equal(
          await page.locator('[data-criterion][aria-pressed="true"]').count(),
          1,
        );
        const titles = {
          skills: "The right skills for your request.",
          availability: "Help that fits your preferred time.",
          distance: "A clearer picture of who’s nearby.",
        };
        assert.equal(
          await page.locator("#criterion-title").textContent(),
          titles[criterion],
        );
      }
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
        "auto",
      );
    }
    // Every category is accepted by the existing service request form.
    const form = fs.readFileSync(
      path.join(__dirname, "../igotu_v2/client/create-request.html"),
      "utf8",
    );
    const categorySelect = form.match(
      /<select id="category"[\s\S]*?<\/select>/,
    )[0];
    const accepted = [
      ...categorySelect.matchAll(/<option value="([^"]+)"/g),
    ].map((m) => m[1]);
    const categories = await page
      .locator(".category-card > span:not(.category-icon)")
      .allTextContents();
    assert.deepEqual(categories, accepted);
    // Links target only real files or real local sections, never a public directory.
    const links = await page.locator("a").evaluateAll((elements) =>
      elements.map((e) => ({
        href: e.getAttribute("href"),
        name: e.textContent.trim(),
      })),
    );
    for (const { href } of links) {
      if (href.startsWith("#"))
        assert.equal(
          await page.locator(href).count(),
          1,
          `Missing anchor ${href}`,
        );
      else
        assert.ok(
          ["login.html", "register.html"].includes(href) &&
            fs.existsSync(path.join(__dirname, "../igotu_v2", href)),
          `Unexpected destination ${href}`,
        );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/index.html`);
    await page.locator(".nav-links a").first().focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.equal(
      await page
        .locator(".menu-toggle")
        .evaluate((e) => document.activeElement === e),
      true,
      "Resize focus recovery",
    );
    // Natural keyboard order starts with the skip link.
    await page.goto(`${base}/index.html`);
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator(".skip-link")
        .evaluate((e) => document.activeElement === e),
      true,
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator("main").evaluate((e) => document.activeElement === e),
      true,
    );
    // Check real auth-page destinations without executing their Supabase module.
    await context.route("**/js/auth.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/index.html`);
    await page.locator(".login-link").click();
    await page.waitForURL("**/login.html");
    assert.equal(await page.locator("#loginForm").isVisible(), true);
    for (const selector of [
      ".hero-actions a[href='register.html']",
      ".provider-path a",
      ".category-card",
    ]) {
      await page.goto(`${base}/index.html`);
      await page.locator(selector).first().click();
      await page.waitForURL("**/register.html");
      assert.equal(await page.locator("#registerForm").isVisible(), true);
      assert.deepEqual(
        await page
          .locator("#role option")
          .evaluateAll((options) => options.map((option) => option.value)),
        ["", "client", "provider"],
      );
    }
    assert.deepEqual(errors, [], "Browser errors or failed local assets");
    assert.deepEqual(
      external,
      [],
      "Homepage must work without external or Supabase requests",
    );
    const noJS = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const fallback = await noJS.newPage();
    await fallback.goto(`${base}/index.html`);
    assert.equal(await fallback.locator("#site-navigation").isVisible(), true);
    assert.equal(
      await fallback.locator(".criteria-buttons").isVisible(),
      false,
    );
    assert.equal(await fallback.locator("h1").isVisible(), true);
    console.log(
      "PASS: homepage at 1440/1024/768/390/320px; no overflow or clipped content; axe WCAG A/AA checks; mobile menu, Escape, anchor and resize focus; keyboard criteria/skip link; valid categories and Login/Register destinations; reduced motion and no-JS fallback; no external requests or browser errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
