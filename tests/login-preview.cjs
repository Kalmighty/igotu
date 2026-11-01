/* Login UI and illustrative playback only. Real app Auth modules run against
   synthetic responses; every remote request is blocked. No project access.
   UI_BASE_URL=http://127.0.0.1:4182 node tests/login-preview.cjs */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const base = new URL(process.env.UI_BASE_URL || "http://127.0.0.1:4182");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Loopback origin required",
);
const output = process.env.UI_SCREENSHOTS || "work/login-preview/screenshots";
const external = [],
  errors = [],
  results = [];
const fixture = fs.readFileSync(
  path.join(__dirname, "auth-fixture.js"),
  "utf8",
);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  async function open(width = 1536, options = {}) {
    const c = await browser.newContext({
      viewport: { width, height: 1024 },
      reducedMotion: options.motion ? "no-preference" : "reduce",
      javaScriptEnabled: !options.noJS,
    });
    await c.addInitScript((data) => {
      window.__authFixture = data;
    }, options.auth || {});
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (u.pathname === "/js/supabaseClient.js")
        return r.fulfill({ contentType: "text/javascript", body: fixture });
      if (options.blockPreview && u.pathname === "/js/login-preview.js")
        return r.fulfill({ contentType: "text/javascript", body: "" });
      if (options.imageGate && u.pathname.endsWith("student-preview.webp"))
        return options.imageGate.then(() => r.continue());
      if (options.badImage && u.pathname.endsWith("student-preview.webp"))
        return r.fulfill({
          contentType: "image/webp",
          body: "invalid test image",
        });
      return r.continue();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(new URL("/login.html", base).href, {
      waitUntil: options.imageGate ? "domcontentloaded" : "load",
    });
    if (!options.noJS)
      await p.waitForFunction(
        () =>
          window.__authCalls &&
          document
            .querySelector('[data-login-role="client"]')
            .getAttribute("aria-pressed") === "true",
      );
    return { p, c };
  }
  async function safeShots(p, width) {
    await p.locator(".preview-canvas").scrollIntoViewIfNeeded();
    await p.locator(".preview-student").evaluate((i) => i.decode());
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(80);
    await p.screenshot({
      path: path.join(output, `login-${width}.png`),
      fullPage: true,
    });
    if (width === 1536) {
      await p.screenshot({ path: path.join(output, "desktop-viewport.png") });
      await p
        .locator(".auth-form-panel")
        .screenshot({ path: path.join(output, "login-closeup.png") });
      await p
        .locator(".service-preview")
        .screenshot({ path: path.join(output, "workflow-static.png") });
    }
    if (width === 390)
      await p
        .locator(".auth-form-panel")
        .screenshot({ path: path.join(output, "login-mobile-closeup.png") });
  }
  try {
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1536, 1440, 1366, 1024, 768, 390, 320]) {
      const { p, c } = await open(width);
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "paused",
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Overflow ${width}`,
      );
      const clipping = await p
        .locator("h1,h2,p,input,.role-card,.auth-form-panel")
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width && (r.left < -1 || r.right > innerWidth + 1);
            })
            .map((e) => e.id || e.className),
        );
      assert.deepEqual(clipping, [], `Viewport clipping ${width}`);
      const form = await p.locator(".auth-form-panel").boundingBox(),
        promo = await p.locator(".auth-welcome-note").boundingBox();
      if (width <= 850)
        assert.ok(
          form.y + form.height < promo.y,
          "Mobile form before promotional preview",
        );
      else assert.ok(form.x > promo.x, "Desktop form on the right");
      assert.equal(
        await p.locator("#email").getAttribute("autocomplete"),
        "username",
      );
      assert.equal(
        await p.locator("#password").getAttribute("autocomplete"),
        "current-password",
      );
      await p.locator("#email").fill("fixture@example.invalid");
      await p.locator("#password").fill("SyntheticOnly123");
      const initialHeight = (await p.locator(".auth-form-panel").boundingBox())
        .height;
      for (const role of ["provider", "admin", "client"]) {
        const b = p.locator(`[data-login-role="${role}"]`);
        await b.focus();
        await p.keyboard.press("Space");
        assert.equal(await b.getAttribute("aria-pressed"), "true");
        assert.equal(
          await b.evaluate((e) => e === document.activeElement),
          true,
          "Role choice keeps deliberate keyboard focus",
        );
        assert.ok(
          (await p.locator("#authFormTitle").innerText()).startsWith(
            role[0].toUpperCase() + role.slice(1),
          ),
        );
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
              initialHeight,
          ) <= 2,
          "Role description must not jump the form",
        );
      }
      await p
        .getByRole("button", { name: "Show password", exact: true })
        .click();
      assert.equal(await p.locator("#password").getAttribute("type"), "text");
      await p
        .getByRole("button", { name: "Hide password", exact: true })
        .click();
      assert.equal(
        await p.locator("#password").getAttribute("type"),
        "password",
      );
      await p
        .getByRole("button", { name: "Show password", exact: true })
        .click();
      await p.locator('[data-login-role="provider"]').click();
      assert.equal(
        await p.locator("#password").getAttribute("type"),
        "password",
      );
      assert.equal(
        await p.locator("#password").inputValue(),
        "SyntheticOnly123",
      );
      await p.locator('[data-login-role="client"]').click();
      assert.equal(
        await p.locator("#previewToggle").isDisabled(),
        true,
        "Reduced motion has no automatic playback",
      );
      for (let step = 1; step <= 6; step++) {
        await p.locator("#previewNext").click();
        const current = step % 6;
        assert.equal(
          await p
            .locator(".workflow-scene.is-current")
            .getAttribute("data-scene"),
          String(current),
        );
        assert.equal(
          await p
            .locator(".workflow-scene.is-current")
            .evaluate((e) => getComputedStyle(e).opacity),
          "1",
        );
        const overflow = await p
          .locator(".workflow-scene.is-current")
          .evaluate(
            (e) =>
              e.scrollHeight > e.clientHeight + 2 ||
              e.scrollWidth > e.clientWidth + 2,
          );
        assert.equal(overflow, false, `Scene ${current} overflows at ${width}`);
        assert.equal(
          await p.locator("#password").inputValue(),
          "SyntheticOnly123",
        );
      }
      assert.equal(
        await p.evaluate(
          () =>
            window.__authCalls.filter(
              (c) => c.operation === "signInWithPassword",
            ).length,
        ),
        0,
        "Presentation never submits credentials",
      );
      assert.equal(
        await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        ),
        0,
      );
      await p.locator(".preview-transcript summary").focus();
      await p.keyboard.press("Enter");
      assert.equal(await p.locator(".preview-transcript ol li").count(), 6);
      await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
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
      assert.deepEqual(violations, [], `Accessibility ${width}`);
      await p.locator(".preview-transcript summary").click();
      await p.locator("#email").fill("");
      await p.locator("#password").fill("");
      await p.locator("h1").click();
      await safeShots(p, width);
      results.push({
        width,
        responsive: "PASS",
        a11y: "PASS",
        sixScenes: "PASS",
        inputRetention: "PASS",
      });
      console.log(
        `PASS responsive/keyboard/roles/input retention/password controls/six static scenes/axe: ${width}px`,
      );
      await c.close();
    }
    // Follow the shipped public links without submitting registration/recovery.
    {
      const { p, c } = await open(390);
      for (const selector of [".auth-header-link a", ".auth-form-footer a"]) {
        await p.goto(new URL("/login.html", base).href);
        await p.locator(selector).click();
        await p.waitForURL("**/register.html");
        assert.equal(await p.locator("#registerForm").isVisible(), true);
        assert.deepEqual(
          await p
            .locator("#role option")
            .evaluateAll((es) => es.map((e) => e.value)),
          ["", "client", "provider"],
        );
      }
      await p.goto(new URL("/login.html", base).href);
      await p.locator(".forgot-password-link").click();
      await p.waitForURL("**/forgot-password.html");
      assert.equal(await p.locator("input[type=email]").isVisible(), true);
      await p.goto(new URL("/login.html", base).href);
      await p.locator(".auth-brand").click();
      await p.waitForURL("**/index.html");
      assert.equal(await p.locator("#hero-title").isVisible(), true);
      console.log(
        "PASS actual registration, password-recovery and homepage link destinations",
      );
      await c.close();
    }
    // Normal motion: genuine time-based scene change, pause/resume and lifecycle.
    {
      const { p, c } = await open(1536, { motion: true });
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "playing",
      );
      await p.waitForFunction(
        () =>
          parseFloat(
            getComputedStyle(document.querySelector('[data-scene="1"]'))
              .opacity,
          ) > 0.9,
      );
      await p.locator("#previewToggle").click();
      assert.equal(
        await p.locator(".service-preview").getAttribute("data-playback"),
        "paused",
      );
      const before = await p
        .locator(".workflow-scene")
        .evaluateAll((es) => es.map((e) => getComputedStyle(e).opacity));
      await p.waitForTimeout(200);
      assert.deepEqual(
        await p
          .locator(".workflow-scene")
          .evaluateAll((es) => es.map((e) => getComputedStyle(e).opacity)),
        before,
        "User pause freezes scene transitions",
      );
      await p.locator("#previewToggle").click();
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "playing",
      );
      await p.setViewportSize({ width: 1536, height: 450 });
      await p.evaluate(() => scrollTo(0, 0));
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "paused",
      );
      await p.locator(".preview-canvas").scrollIntoViewIfNeeded();
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "playing",
      );
      // Inject a visibility event to exercise the standard background-tab handler;
      // this is lifecycle simulation, not a physical OS-background measurement.
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.equal(
        await p.locator(".service-preview").getAttribute("data-playback"),
        "paused",
      );
      await p.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "playing",
      );
      await p.locator("#previewToggle").click();
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.equal(
        await p.locator(".service-preview").getAttribute("data-playback"),
        "paused",
        "Lifecycle never overrides a user pause",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.waitForFunction(
        () => document.getElementById("previewToggle").disabled,
      );
      assert.equal(await p.locator("#previewToggle").isDisabled(), true);
      assert.equal(
        await p.locator(".service-preview").getAttribute("data-playback"),
        "paused",
      );
      await p.emulateMedia({ reducedMotion: "no-preference" });
      assert.equal(
        await p.locator(".service-preview").getAttribute("data-playback"),
        "paused",
        "Preference reset never forces autoplay",
      );
      console.log(
        "PASS genuine scene playback, user pause/resume, offscreen stop, simulated tab visibility, runtime reduced motion",
      );
      await c.close();
    }
    // Actual shipped login busy/error behavior, with a synthetic delayed response.
    {
      const { p, c } = await open(1536, {
        motion: true,
        auth: { authError: true, signInDelay: 1000 },
      });
      await p.locator("#email").fill("fixture@example.invalid");
      await p.locator("#password").fill("SyntheticOnly123");
      await p
        .getByRole("button", { name: "Show password", exact: true })
        .click();
      await p.locator("#loginBtn").click();
      assert.equal(
        await p.locator("#password").getAttribute("type"),
        "password",
      );
      assert.equal(
        await p.locator("#loginForm").getAttribute("aria-busy"),
        "true",
      );
      assert.equal(await p.locator("[data-login-role]:disabled").count(), 3);
      assert.equal(
        await p
          .locator("#loginBtn")
          .evaluate((e) => getComputedStyle(e, "::before").animationName),
        "login-spin",
      );
      await p.locator("#loginBtn").waitFor({ state: "visible" });
      await p.waitForFunction(
        () => !document.getElementById("loginBtn").disabled,
      );
      assert.equal(await p.locator("#messageBox").isVisible(), true);
      assert.match(
        await p.locator("#messageBox").innerText(),
        /invalid credentials/,
      );
      await p
        .locator(".auth-form-panel")
        .screenshot({ path: path.join(output, "synthetic-error.png") });
      console.log(
        "PASS actual busy spinner, frozen role controls, password re-mask and error recovery with synthetic credentials",
      );
      await c.close();
    }
    for (const options of [
      { blockPreview: true, auth: { authError: true } },
      { badImage: true },
      { noJS: true },
    ]) {
      const { p, c } = await open(390, options);
      assert.equal(await p.locator("#loginForm").isVisible(), true);
      assert.equal(
        await p
          .locator('[data-scene="0"]')
          .evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      assert.equal(
        await p.locator(".preview-transcript summary").isVisible(),
        true,
      );
      if (options.blockPreview) {
        await p.locator("#email").fill("fixture@example.invalid");
        await p.locator("#password").fill("SyntheticOnly123");
        await p.locator("#loginBtn").click();
        await p.waitForFunction(
          () => !document.getElementById("loginBtn").disabled,
        );
        assert.match(
          await p.locator("#messageBox").innerText(),
          /invalid credentials/,
        );
      }
      console.log(
        `PASS independent login and static workflow fallback: ${Object.keys(options)[0]}`,
      );
      await c.close();
    }
    // Reserve the illustration dimensions before its delayed network response.
    {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const { p, c } = await open(1536, { imageGate: gate });
      const before = await p.locator(".preview-canvas").boundingBox();
      release();
      await p.locator(".preview-student").evaluate((i) => i.decode());
      const after = await p.locator(".preview-canvas").boundingBox();
      assert.deepEqual(
        after,
        before,
        "Image arrival cannot resize/reposition the canvas",
      );
      console.log(
        "PASS fixed illustration dimensions before and after delayed image loading",
      );
      await c.close();
    }
    if (process.env.UI_PREVIEW_VIDEO) {
      const target = path.resolve(process.env.UI_PREVIEW_VIDEO);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const frames = fs.mkdtempSync(path.resolve("work/login-preview/frames-"));
      const { p, c } = await open(850, { motion: true });
      await p.locator(".preview-student").evaluate((i) => i.decode());
      await p.locator(".preview-canvas").scrollIntoViewIfNeeded();
      await p.waitForFunction(
        () =>
          document.querySelector(".service-preview").dataset.playback ===
          "playing",
      );
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
        maxWidth: 850,
        maxHeight: 1024,
        everyNthFrame: 1,
      });
      await p.waitForTimeout(12500);
      await cdp.send("Page.stopScreencast");
      await c.close();
      assert.ok(records.length > 20, "Actual browser frames required");
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
        `PASS actual browser recording of HTML/CSS animation: ${records.length} frames; ${target}`,
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(
      "work/login-preview/results.json",
      JSON.stringify(
        {
          scope: "SYNTHETIC_BROWSER_UI_ONLY",
          viewports: results,
          lifecycle:
            "simulated document visibility event; actual offscreen IntersectionObserver",
          browserErrors: errors,
          externalRequests: external,
          liveAuthenticationTested: false,
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
