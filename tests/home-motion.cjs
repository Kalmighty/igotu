/* Offline homepage motion/touch/fallback checks. No remote requests permitted.
   NODE_PATH=... UI_BASE_URL=http://127.0.0.1:4178 node tests/home-motion.cjs
   Optional UI_MOTION_PREVIEW=work/homepage-motion.mp4 requires local ffmpeg. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const base = new URL(process.env.UI_BASE_URL || "http://127.0.0.1:4178");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Loopback server required",
);
const results = [],
  external = [],
  errors = [];
async function intercept(context) {
  await context.route("**/*", (r) => {
    const url = new URL(r.request().url());
    if (url.origin !== base.origin) {
      external.push(url.origin);
      return r.abort();
    }
    if (url.pathname === "/js/auth.js")
      return r.fulfill({ contentType: "text/javascript", body: "" });
    return r.continue();
  });
}
async function measure(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    cls: window.__layoutShifts || 0,
    events: window.__motionEvents || [],
    height: document.documentElement.scrollHeight,
    textClipping: [...document.querySelectorAll("h1,h2,h3,p")]
      .filter((e) => e.checkVisibility() && e.scrollWidth > e.clientWidth + 2)
      .map((e) => e.className || e.tagName),
    running: document.getAnimations().filter((a) => a.playState === "running")
      .length,
  }));
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1536, 1440, 1024, 768, 390, 320]) {
      const touch = width <= 600;
      const context = await browser.newContext({
        viewport: { width, height: width > 850 ? 1024 : 844 },
        reducedMotion: "no-preference",
        hasTouch: touch,
        isMobile: touch,
      });
      await intercept(context);
      // Reproduce the slow-script startup race: the first paint precedes JS.
      await context.route("**/js/home.js", async (route) => {
        assert.equal(new URL(route.request().url()).origin, base.origin);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });
      await context.addInitScript(() => {
        window.__layoutShifts = 0;
        window.__motionEvents = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) window.__layoutShifts += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        document.addEventListener("animationstart", (e) =>
          window.__motionEvents.push({
            name: e.animationName,
            target: e.target.className,
          }),
        );
      });
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(new URL("/index.html", base).href);
      await p.waitForFunction(() => window.__motionEvents.length > 0);
      assert.ok(
        (
          await p.evaluate(() =>
            document.getAnimations().map((a) => a.effect.getTiming()),
          )
        ).every(
          (t) => t.duration <= 550 && t.delay <= 210 && t.iterations === 1,
        ),
      );
      await p.waitForTimeout(750);
      const hero = await measure(p);
      await p.waitForFunction(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length === 0,
        null,
        { timeout: 4000 },
      );
      assert.equal(hero.overflow, false);
      // Unobserved elements remain visible in CSS, never waiting on an observer.
      assert.equal(
        await p
          .locator(".sample-card")
          .first()
          .evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      const first = p.locator(".idea-card").first();
      await first.scrollIntoViewIfNeeded();
      await p.waitForFunction(() =>
        window.__motionEvents.some((e) => e.target.includes("idea-card")),
      );
      await p.waitForTimeout(750);
      assert.equal(
        await first.evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      const rect = await first.boundingBox();
      assert.ok(rect.width > 200, `Readable service card width at ${width}`);
      assert.ok(
        (await p
          .locator(".idea-photo")
          .first()
          .evaluate((e) => e.getBoundingClientRect().height)) >= 160,
      );
      assert.ok(
        (await p
          .locator(".idea-copy p")
          .first()
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) >= 16,
      );
      assert.ok(
        (await p
          .locator(".hero-actions .button")
          .first()
          .evaluate((e) => e.getBoundingClientRect().height)) >= 48,
      );
      assert.ok(
        (await p
          .locator(".category-card")
          .first()
          .evaluate((e) => e.getBoundingClientRect().height)) >= 100,
      );
      if (!touch) {
        await first.hover();
        await p.waitForTimeout(300);
        const transform = await first.evaluate(
          (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).m42,
        );
        assert.ok(
          transform <= -4 && transform >= -6,
          "Restrained card elevation",
        );
        const scale = await first
          .locator("img")
          .evaluate(
            (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).a,
          );
        assert.ok(scale >= 1.02 && scale <= 1.04, "Restrained photo zoom");
        await p.mouse.move(0, 0);
        await p.waitForTimeout(300);
      } else {
        assert.equal(
          await p.evaluate(() => matchMedia("(hover: hover)").matches),
          false,
        );
        assert.equal(
          await first.evaluate((e) => getComputedStyle(e).transform),
          "none",
          "Touch has no sticky hover transform",
        );
      }
      // Enter a just-revealed card during its entrance: focus clears the effect now.
      const category = p.locator(".category-card").first();
      await category.scrollIntoViewIfNeeded();
      await category.focus();
      assert.equal(
        await category.evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      assert.equal(
        await category.evaluate((e) => e.classList.contains("reveal-enter")),
        false,
      );
      assert.notEqual(
        await category.evaluate((e) => getComputedStyle(e).outlineStyle),
        "none",
      );
      await p.locator(".steps li").last().scrollIntoViewIfNeeded();
      await p.waitForTimeout(750);
      assert.ok(
        (await measure(p)).events.some(
          (e) => e.target.includes("reveal-enter") && e.name === "igotu-enter",
        ),
      );
      await p.locator(".benefits").scrollIntoViewIfNeeded();
      await p.waitForTimeout(750);
      await p.locator(".closing-cta").scrollIntoViewIfNeeded();
      await p.waitForTimeout(750);
      if (width <= 850) {
        await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        assert.equal(
          await p.locator("#site-navigation").evaluate((e) => e.inert),
          true,
        );
        if (touch) await p.locator(".menu-toggle").tap();
        else await p.locator(".menu-toggle").click();
        assert.equal(
          await p.locator("#site-navigation").evaluate((e) => e.inert),
          false,
        );
        await p.waitForTimeout(250);
        await p.locator(".nav-links a").first().focus();
        await p.keyboard.press("Escape");
        assert.equal(
          await p.locator("#site-navigation").evaluate((e) => e.inert),
          true,
          "Closing links immediately leave keyboard navigation",
        );
        assert.equal(
          await p
            .locator(".menu-toggle")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        await p.locator("#site-navigation").waitFor({ state: "hidden" });
      }
      // Runtime preference changes cancel entrances and transitions immediately.
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator(".idea-card").first().scrollIntoViewIfNeeded();
      await p.waitForTimeout(60);
      assert.equal(
        await p.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
        "auto",
      );
      assert.equal(await p.locator(".reveal-enter").count(), 0);
      assert.equal((await measure(p)).running, 0);
      const final = await measure(p);
      assert.equal(final.overflow, false);
      assert.deepEqual(final.textClipping, []);
      assert.ok(
        final.cls <= 0.001,
        `Unexpected layout shift at ${width}: ${final.cls}`,
      );
      if (touch) {
        await first.tap();
        await p.waitForURL("**/register.html");
        assert.equal(
          await p.locator("#registerForm").isVisible(),
          true,
          "Native touch navigation remains available",
        );
      }
      results.push({
        width,
        touch,
        motion: "PASS",
        reducedMotion: "PASS",
        cls: final.cls,
        overflow: false,
      });
      console.log(
        `PASS motion, ${touch ? "touch" : "pointer"}, focus, sizes, reduced motion, layout stability: ${width}px; CLS=${final.cls}`,
      );
      await context.close();
    }
    for (const mode of ["no-js", "missing-observer", "blocked-home-js"]) {
      const c = await browser.newContext({
        viewport: { width: 390, height: 844 },
        javaScriptEnabled: mode !== "no-js",
      });
      await intercept(c);
      if (mode === "missing-observer")
        await c.addInitScript(() => {
          window.IntersectionObserver = undefined;
        });
      if (mode === "blocked-home-js")
        await c.route("**/js/home.js", (r) =>
          r.fulfill({ contentType: "text/javascript", body: "" }),
        );
      const p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(new URL("/index.html", base).href);
      assert.equal(
        await p
          .locator(".idea-card,.category-card,.sample-card,.steps li")
          .evaluateAll((es) =>
            es.every((e) => getComputedStyle(e).opacity === "1"),
          ),
        true,
      );
      if (mode !== "missing-observer")
        assert.equal(await p.locator("#site-navigation").isVisible(), true);
      assert.equal((await measure(p)).overflow, false);
      console.log(`PASS visible content fallback: ${mode}`);
      await c.close();
    }
    if (process.env.UI_MOTION_PREVIEW) {
      const target = path.resolve(process.env.UI_MOTION_PREVIEW);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const frames = fs.mkdtempSync(
        path.resolve("work/homepage-refinements/frames-"),
      );
      const c = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "no-preference",
      });
      await intercept(c);
      const p = await c.newPage();
      const cdp = await c.newCDPSession(p);
      const records = [];
      cdp.on("Page.screencastFrame", async (event) => {
        const file = path.join(
          frames,
          `${String(records.length).padStart(5, "0")}.jpg`,
        );
        fs.writeFileSync(file, Buffer.from(event.data, "base64"));
        records.push({ file, time: event.metadata.timestamp });
        await cdp
          .send("Page.screencastFrameAck", { sessionId: event.sessionId })
          .catch(() => {});
      });
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 85,
        maxWidth: 1280,
        maxHeight: 800,
        everyNthFrame: 1,
      });
      await p.goto(new URL("/index.html", base).href);
      await p.waitForTimeout(1300);
      for (const selector of [
        ".idea-card",
        ".category-card",
        ".sample-card",
        ".steps",
        ".benefits",
        ".closing-cta",
      ]) {
        await p
          .locator(selector)
          .first()
          .evaluate((e) =>
            e.scrollIntoView({ behavior: "smooth", block: "center" }),
          );
        await p.waitForTimeout(1100);
        if (
          selector === ".idea-card" ||
          selector === ".category-card" ||
          selector === ".sample-card"
        ) {
          await p.locator(selector).first().hover();
          await p.waitForTimeout(600);
          await p.mouse.move(0, 0);
          await p.waitForTimeout(350);
        }
      }
      await p.waitForTimeout(500);
      await cdp.send("Page.stopScreencast");
      await c.close();
      assert.ok(records.length > 30, "Actual browser frames required");
      const concat = path.join(frames, "frames.txt");
      fs.writeFileSync(
        concat,
        records
          .map(
            (r, i) =>
              `file '${r.file}'\nduration ${Math.min(2, Math.max(0.016, (records[i + 1]?.time || r.time + 0.4) - r.time))}\n`,
          )
          .join("") + `file '${records.at(-1).file}'\n`,
      );
      const encoded = spawnSync(
        "/usr/bin/ffmpeg",
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concat,
          "-vf",
          "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2",
          "-r",
          "30",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "25",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          target,
        ],
        { encoding: "utf8" },
      );
      assert.equal(encoded.status, 0, encoded.stderr);
      console.log(
        `PASS actual Chromium screencast encoded: ${records.length} frames; ${target}`,
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(
      "work/homepage-refinements/motion-observations.json",
      JSON.stringify(
        {
          scope: "OFFLINE_UI_ONLY",
          results,
          fallbacks: ["no-js", "missing-observer", "blocked-home-js"],
          externalRequests: external,
          browserErrors: errors,
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
