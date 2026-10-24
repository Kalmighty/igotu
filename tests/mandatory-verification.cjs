const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const shots = process.env.UI_SCREENSHOTS;
const axePath = process.env.AXE_PATH || require.resolve("axe-core/axe.min.js");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhRkAAAAASUVORK5CYII=",
  "base64",
);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const errors = [],
    external = [];
  async function open(file, fixture = {}, width = 1440, redirectStub = false) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const captured = [];
    await context.exposeBinding("__verificationRecord", (_, call) =>
      captured.push(call),
    );
    await context.addInitScript((f) => {
      window.__verificationFixture = f;
      window.open = (url) => {
        window.__openedDocument = url;
        return null;
      };
    }, fixture);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) {
        external.push(url.href);
        return route.abort();
      }
      if (url.pathname === "/js/supabaseClient.js")
        return route.fulfill({
          contentType: "text/javascript",
          body: fs.readFileSync(
            path.join(__dirname, "verification-fixture.js"),
            "utf8",
          ),
        });
      if (redirectStub && url.pathname.endsWith("/verification.html"))
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Verification required</title><main>Verification required</main>",
        });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/" + file);
    return { page, context, captured };
  }
  async function ready(page) {
    await page.waitForFunction(
      () => document.body.dataset.accessState === "allowed",
    );
  }
  async function callCount(page, op) {
    return page.evaluate(
      (op) =>
        window.__verificationCalls?.filter((c) => c.op === op).length || 0,
      op,
    );
  }
  try {
    if (shots) fs.mkdirSync(shots, { recursive: true });
    // All direct workspace URLs, including onboarding, block before service initialization.
    let routes = 0;
    for (const role of ["client", "provider"])
      for (const file of fs
        .readdirSync(path.join(__dirname, "../igotu_v2", role))
        .filter((f) => f.endsWith(".html") && f !== "verification.html")) {
        const { page, context, captured } = await open(
          `${role}/${file}`,
          { role, state: "pending", delay: 80 },
          390,
          true,
        );
        await page.waitForURL("**/verification.html");
        assert.ok(captured.length > 0);
        assert.ok(
          captured.every((c) =>
            ["users", "verification_requests"].includes(c.op),
          ),
          `${role}/${file}: service initialization ran before authorization`,
        );
        await context.close();
        routes++;
      }
    for (const role of ["client", "provider"])
      for (const state of ["not_submitted", "pending", "rejected", "approved"])
        for (const width of [1440, 768, 390, 320]) {
          const { page, context } = await open(
            `${role}/verification.html`,
            { role, state },
            width,
          );
          await ready(page);
          await page.waitForFunction(
            () => !!document.body.dataset.verificationState,
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${role}/${state}/${width}`,
          );
          assert.equal(
            await page
              .locator(".side-menu,.sidebar,.notification-menu-wrap")
              .count(),
            0,
          );
          assert.equal(
            await page.locator("#verificationFormPanel").isVisible(),
            !["pending", "approved"].includes(state),
          );
          assert.equal(
            await page.locator("#continueVerificationBtn").isVisible(),
            state === "approved",
          );
          if (state === "approved")
            assert.equal(
              await page
                .locator("#continueVerificationBtn")
                .getAttribute("href"),
              "complete-profile.html",
            );
          if (state === "rejected")
            assert.equal(
              await page.locator("#verificationAdminNote").textContent(),
              "Please upload a clearer, fully visible document.",
            );
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
          assert.deepEqual(violations, [], `${role}/${state}/${width}`);
          if (shots && role === "client" && [1440, 390].includes(width))
            await page.screenshot({
              path: path.join(shots, `verification-${state}-${width}.png`),
              fullPage: true,
            });
          if (
            shots &&
            role === "provider" &&
            state === "not_submitted" &&
            width === 1440
          )
            await page.screenshot({
              path: path.join(shots, "verification-provider-form-1440.png"),
              fullPage: true,
            });
          await page.locator("#refreshVerificationBtn").click();
          await page.waitForFunction(
            () => !document.getElementById("refreshVerificationBtn").disabled,
          );
          assert.equal(
            await page.locator("#verificationStatusBadge").isVisible(),
            true,
          );
          await context.close();
        }
    // Test-only binding is installed before any module can start a data read.
    {
      const { page, context, captured } = await open(
        "client/dashboard.html",
        { state: "pending", delay: 200 },
        390,
        true,
      );
      await page.waitForURL("**/verification.html");
      await page.waitForTimeout(100);
      assert.ok(captured.length > 0);
      assert.ok(
        captured.every((c) =>
          ["users", "verification_requests"].includes(c.op),
        ),
        JSON.stringify(captured),
      );
      await context.close();
    }
    for (const role of ["client", "provider"])
      for (const state of ["not_submitted", "rejected"]) {
        const { page, context, captured } = await open(
          `${role}/dashboard.html`,
          { role, state },
          390,
          true,
        );
        await page.waitForURL("**/verification.html");
        assert.ok(
          captured.every((c) =>
            ["users", "verification_requests"].includes(c.op),
          ),
        );
        await context.close();
      }
    // Refresh uses new authoritative flags/status; a reload keeps a pending account in review.
    {
      const { page, context } = await open(
        "client/verification.html",
        { state: "pending" },
        390,
      );
      await ready(page);
      await page.reload();
      await ready(page);
      await page.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      await page.evaluate(() => window.__setVerificationState("approved"));
      await page.locator("#refreshVerificationBtn").click();
      await page.waitForFunction(
        () => document.body.dataset.verificationState === "approved",
      );
      assert.equal(
        await page.locator("#continueVerificationBtn").isVisible(),
        true,
      );
      await context.close();
    }
    for (const role of ["client", "provider"])
      for (const state of [
        "not_submitted",
        "pending",
        "rejected",
        "approved",
      ]) {
        const { page, context } = await open(`login.html?role=${role}`, {
          role,
          state,
          completed: true,
        });
        await page.locator("#email").fill("synthetic@example.invalid");
        await page.locator("#password").fill("FixturePass123");
        await page.locator("#loginBtn").click();
        await page.waitForURL(
          `**/${role}/${state === "approved" ? "dashboard.html" : "verification.html"}`,
        );
        await context.close();
      }
    for (const state of ["not_submitted", "rejected"]) {
      const { page, context } = await open("client/verification.html", {
        state,
      });
      await ready(page);
      await page.locator("#legalName").fill("Synthetic Test Applicant");
      await page.selectOption("#idType", "mykad");
      await page.locator("#idNumber").fill("990101010001");
      await page.locator("#identityDocument").setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page.locator("#ageConfirm").check();
      await page.locator("#privacyConsent").check();
      await page.locator("#submitVerificationBtn").click();
      await page.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      const payload = await page.evaluate(
        () =>
          window.__verificationCalls.find((c) => c.op === "verificationPayload")
            .args,
      );
      assert.equal(payload.id_number_last4, "0001");
      assert.equal(payload.age_confirmed, true);
      assert.equal(payload.privacy_consent, true);
      assert.equal(JSON.stringify(payload).includes("990101010001"), false);
      assert.equal(await page.locator("#idNumber").inputValue(), "");
      assert.equal(await callCount(page, "upload"), 1);
      await page
        .locator("#verificationForm")
        .evaluate((form) =>
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      assert.equal(await callCount(page, "upload"), 1);
      await context.close();
    }
    // File rejection happens before any private upload.
    {
      const { page, context } = await open("provider/verification.html", {
        role: "provider",
      });
      await ready(page);
      await page.locator("#identityDocument").setInputFiles({
        name: "invalid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("synthetic"),
      });
      assert.equal(await callCount(page, "upload"), 0);
      assert.equal(await page.locator("#identityDocument").inputValue(), "");
      await page.locator("#identityDocument").setInputFiles({
        name: "large.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(5242881),
      });
      assert.equal(await callCount(page, "upload"), 0);
      assert.equal(await page.locator("#identityDocument").inputValue(), "");
      await context.close();
    }
    for (const role of ["client", "provider"])
      for (const complete of [false, true]) {
        const { page, context } = await open(
          `${role}/${complete ? "dashboard" : "complete-profile"}.html`,
          { role, state: "approved", completed: complete },
        );
        await ready(page);
        assert.equal(
          new URL(page.url()).pathname,
          `/${role}/${complete ? "dashboard" : "complete-profile"}.html`,
        );
        await context.close();
      }
    for (const role of ["client", "provider"])
      for (const state of [
        "not_submitted",
        "pending",
        "rejected",
        "approved",
      ]) {
        const { page, context } = await open(`${role}/verification.html`, {
          role,
          state,
          inactive: true,
        });
        await page.waitForURL("**/login.html");
        await context.close();
      }
    {
      const { page, context, captured } = await open(
        "admin/verifications.html",
        { role: "admin", inactive: true },
      );
      await page.waitForURL("**/login.html");
      assert.equal(
        captured.some(
          (c) => c.op === "verification_requests" || c.op === "rpc",
        ),
        false,
      );
      await context.close();
    }
    // Status/network failure is fail closed: no form or normal workspace fetch.
    {
      const { page, context } = await open("client/dashboard.html", {
        profileError: true,
      });
      await page.locator('body[data-access-state="blocked"]').waitFor();
      assert.equal(await callCount(page, "service_requests"), 0);
      await context.close();
    }
    for (const role of ["client", "provider"]) {
      const { page, context } = await open("register.html", {
        role,
        emailConfirmation: false,
      });
      await page.locator(`[data-register-role="${role}"]`).click();
      await page.locator("#fullName").fill("Synthetic Applicant");
      await page.locator("#email").fill("synthetic@example.invalid");
      await page.locator("#password").fill("FixturePass123");
      await page.locator("#confirmPassword").fill("FixturePass123");
      await page.locator("#registerBtn").click();
      await page.waitForURL(`**/${role}/verification.html`);
      await context.close();
    }
    {
      const { page, context } = await open("register.html", {
        emailConfirmation: true,
      });
      await page.locator('[data-register-role="client"]').click();
      await page.locator("#fullName").fill("Synthetic Applicant");
      await page.locator("#email").fill("synthetic@example.invalid");
      await page.locator("#password").fill("FixturePass123");
      await page.locator("#confirmPassword").fill("FixturePass123");
      await page.locator("#registerBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Check your email" })
        .waitFor();
      await context.close();
    }
    // Authorized Admin remains independent of their own verification; documents use signed URLs.
    for (const decision of ["approved", "rejected"]) {
      const { page, context } = await open(
        "admin/verifications.html",
        { role: "admin" },
        decision === "rejected" ? 390 : 1440,
      );
      await ready(page);
      await page.locator(".approve-verification-btn").first().waitFor();
      if (shots && decision === "approved")
        await page.screenshot({
          path: path.join(shots, "admin-verification-queue-1440.png"),
          fullPage: true,
        });
      assert.equal(await page.getByText("Resubmission · Attempt 2").count(), 1);
      await page.locator(".view-verification-doc-btn").first().click();
      assert.equal(
        (
          await page.evaluate(
            () =>
              window.__verificationCalls.find((c) => c.op === "signedUrl").args,
          )
        ).expires,
        300,
      );
      await page
        .locator(
          decision === "approved"
            ? ".approve-verification-btn"
            : ".reject-verification-btn",
        )
        .first()
        .click();
      await page.locator("#verificationReviewDialog[open]").waitFor();
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
      assert.deepEqual(violations, [], `Admin ${decision} dialog`);
      if (shots)
        await page.screenshot({
          path: path.join(shots, `admin-verification-${decision}.png`),
          fullPage: false,
        });
      if (decision === "rejected") {
        await page.getByRole("button", { name: "Confirm decision" }).click();
        assert.equal(await callCount(page, "rpc"), 0);
        await page
          .locator("#verificationReviewNote")
          .fill("Please submit a clearer document.");
      }
      await page.getByRole("button", { name: "Confirm decision" }).click();
      await page
        .getByRole("status")
        .filter({
          hasText:
            decision === "approved" ? "approved successfully" : "rejected and",
        })
        .waitFor();
      const rpc = await page.evaluate(
        () => window.__verificationCalls.find((c) => c.op === "rpc").args,
      );
      assert.equal(rpc.name, "admin_review_verification");
      assert.equal(rpc.args.p_status, decision);
      const notifications = await page.evaluate(() =>
        window.__verificationCalls.filter((c) => c.op === "notifications"),
      );
      assert.equal(
        JSON.stringify(notifications).includes("clearer document"),
        false,
      );
      await context.close();
    }
    for (const role of ["client", "provider"]) {
      const { page, context } = await open("admin/verifications.html", {
        role,
      });
      await page.waitForURL("**/login.html");
      assert.equal(await page.locator(".approve-verification-btn").count(), 0);
      await context.close();
    }
    assert.deepEqual(errors, [], "Unexpected browser errors");
    // Leaflet/CDN assets can be refused in denied route tests; never contact Supabase.
    assert.equal(
      external.some((url) => url.includes("supabase.co")),
      false,
    );
    console.log(
      `PASS: ${routes} direct workspace routes gated; verification states at desktop/mobile; approval-first routing, registration/email confirmation, private file payload/validation, resubmission, pending lock, approval/onboarding, inactive accounts, signed Admin previews and approve/reject UI. These are fixture tests, not database authorization tests.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
