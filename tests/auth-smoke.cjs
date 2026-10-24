/* Local auth UI tests. Requires Playwright, axe-core and Chromium.
   Supabase is replaced with a fixture. No real accounts, sessions, SQL or project traffic. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const axePath = process.env.AXE_PATH || require.resolve("axe-core/axe.min.js");
const screenshots = process.env.UI_SCREENSHOTS;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const external = [],
    errors = [];
  async function open(file, fixture = {}, options = {}) {
    const context = await browser.newContext({
      viewport: { width: options.width || 1440, height: 1000 },
      reducedMotion: "reduce",
      javaScriptEnabled: options.javaScriptEnabled !== false,
    });
    await context.addInitScript((data) => {
      window.__authFixture = data;
      // Tampered cached profile must not decide access or role redirects.
      localStorage.setItem(
        "igotu_user",
        JSON.stringify({
          role: "admin",
          status: "active",
          profile_completed: true,
        }),
      );
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
            path.join(__dirname, "auth-fixture.js"),
            "utf8",
          ),
        });
      if (
        /^\/(client|provider|admin)\/(dashboard|complete-profile)\.html$/.test(
          url.pathname,
        )
      )
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Fixture destination</title><main>Fixture destination</main>",
        });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${file}`);
    if (options.javaScriptEnabled !== false)
      await page.waitForFunction(() => !!window.__authCalls);
    return { page, context };
  }
  async function fillLogin(page) {
    await page.locator("#email").fill("test@example.invalid");
    await page.locator("#password").fill("FixturePass123");
  }
  async function fillRegister(
    page,
    password = "FixturePass123",
    confirm = password,
  ) {
    await page.locator("#fullName").fill("Fixture Account");
    await page.locator("#email").fill("test@example.invalid");
    await page.locator("#password").fill(password);
    await page.locator("#confirmPassword").fill(confirm);
  }
  async function operation(page, name) {
    return page.evaluate(
      (name) => window.__authCalls.filter((call) => call.operation === name),
      name,
    );
  }
  try {
    if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
    for (const width of [1440, 768, 390, 320])
      for (const file of ["login.html", "register.html"]) {
        const { page, context } = await open(file, {}, { width });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${file} overflow at ${width}`,
        );
        const clipped = await page
          .locator("h1,h2,p,input,select,.role-card,.auth-form-panel,.btn")
          .evaluateAll((elements) =>
            elements
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width && (r.left < -1 || r.right > innerWidth + 1);
              })
              .map((e) => e.id || e.className || e.tagName),
          );
        assert.deepEqual(clipped, [], `${file} clipped at ${width}`);
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
        assert.deepEqual(violations, [], `${file} accessibility at ${width}`);
        if (file === "login.html") {
          for (const role of ["provider", "admin", "client"]) {
            const card = page.locator(`[data-login-role="${role}"]`);
            await card.focus();
            await page.keyboard.press("Space");
            assert.equal(await card.getAttribute("aria-pressed"), "true");
            assert.equal(
              await page.locator("#authFormTitle").textContent(),
              `${role[0].toUpperCase() + role.slice(1)} Login`,
            );
          }
          assert.equal(await page.locator("#loginForm").isVisible(), true);
          assert.equal(
            await page
              .getByRole("link", { name: "Forgot password?" })
              .getAttribute("href"),
            "forgot-password.html",
          );
        } else {
          assert.deepEqual(
            await page
              .locator("#role option")
              .evaluateAll((options) => options.map((o) => o.value)),
            ["", "client", "provider"],
          );
          for (const role of ["client", "provider"]) {
            const card = page.locator(`[data-register-role="${role}"]`);
            await card.focus();
            await page.keyboard.press("Enter");
            assert.equal(await page.locator("#role").inputValue(), role);
            assert.equal(await card.getAttribute("aria-pressed"), "true");
          }
          await page.selectOption("#role", "client");
          assert.equal(
            await page
              .locator('[data-register-role="client"]')
              .getAttribute("aria-pressed"),
            "true",
          );
          await page.selectOption("#role", "");
          assert.equal(
            await page
              .locator('[data-register-role][aria-pressed="true"]')
              .count(),
            0,
          );
        }
        if (screenshots && [1440, 390].includes(width)) {
          if (file === "register.html")
            await page.locator('[data-register-role="client"]').click();
          await page.locator("h1").click(); // remove the keyboard focus ring from review captures
          await page.screenshot({
            path: path.join(
              screenshots,
              `auth-${file.replace(".html", "")}-${width}.png`,
            ),
            fullPage: true,
          });
        }
        await context.close();
      }
    // Role-query input is a visual allowlist; missing credentials stay native-invalid.
    for (const pref of ["__proto__", "not-a-role"]) {
      const { page, context } = await open(`login.html?role=${pref}`);
      assert.equal(
        await page
          .locator('[data-login-role="client"]')
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.locator("#loginBtn").click();
      assert.equal((await operation(page, "signInWithPassword")).length, 0);
      assert.equal(
        await page.locator("#email").evaluate((e) => e.validity.valueMissing),
        true,
      );
      await context.close();
    }
    // Only matching selected/database-role pairs may continue; all six mismatches are signed out.
    for (const selected of ["client", "provider", "admin"])
      for (const actual of ["client", "provider", "admin"]) {
        const { page, context } = await open(`login.html?role=${selected}`, {
          actualRole: actual,
        });
        assert.equal(
          await page
            .locator(`[data-login-role="${selected}"]`)
            .getAttribute("aria-pressed"),
          "true",
        );
        await fillLogin(page);
        await page.locator("#loginBtn").click();
        const authCalls = await operation(page, "signInWithPassword");
        assert.deepEqual(Object.keys(authCalls[0].args).sort(), [
          "email",
          "password",
        ]);
        assert.equal(
          (await operation(page, "eq"))[0].args.value,
          "fixture-user",
        );
        if (selected === actual) {
          assert.equal((await operation(page, "signOut")).length, 0);
          await page.waitForURL(`**/${actual}/dashboard.html`);
        } else {
          await page
            .getByRole("status")
            .filter({
              hasText: `Please select ${actual[0].toUpperCase() + actual.slice(1)} Login`,
            })
            .waitFor();
          await page.waitForFunction(
            () => !document.getElementById("loginBtn").disabled,
          );
          assert.equal(await page.evaluate(() => window.__authSession), null);
          assert.equal(
            await page.evaluate(() => localStorage.getItem("igotu_user")),
            null,
          );
          assert.equal(
            await page.evaluate(() =>
              localStorage.getItem("fixture-auth-token"),
            ),
            null,
          );
          assert.equal(await page.locator("#loginBtn").textContent(), "Login");
          assert.equal(
            await page.locator("[data-login-role]:disabled").count(),
            0,
          );
          assert.deepEqual((await operation(page, "signOut"))[0].args, {
            scope: "local",
          });
          // Wait beyond the success redirect delay to catch accidental queued redirects.
          await page.waitForTimeout(950);
          assert.equal(new URL(page.url()).pathname, "/login.html");
          if (screenshots && selected === "admin" && actual === "provider") {
            await page.locator("h1").click();
            await page.screenshot({
              path: path.join(screenshots, "auth-login-mismatch-1440.png"),
              fullPage: true,
            });
          }
        }
        await context.close();
      }
    for (const role of ["client", "provider"]) {
      const { page, context } = await open(`login.html?role=${role}`, {
        actualRole: role,
        completed: false,
      });
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page.waitForURL(`**/${role}/complete-profile.html`);
      await context.close();
    }
    for (const actual of ["client", "provider", "admin"]) {
      const { page, context } = await open("login.html?role=admin", {
        actualRole: actual,
        status: "suspended",
      });
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Your account is not active" })
        .waitFor();
      assert.equal((await operation(page, "signOut")).length, 1);
      assert.equal(new URL(page.url()).pathname, "/login.html");
      await context.close();
    }
    for (const fixture of [
      { noProfile: true },
      { authError: true },
      { noUser: true },
    ]) {
      const { page, context } = await open("login.html?role=admin", fixture);
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page.waitForFunction(
        () => !document.getElementById("loginBtn").disabled,
      );
      assert.equal(await page.locator("#messageBox").isVisible(), true);
      assert.equal(new URL(page.url()).pathname, "/login.html");
      if (fixture.noProfile)
        assert.equal((await operation(page, "signOut")).length, 1);
      await context.close();
    }
    // Re-selecting the correct section after rejection works without a reload.
    {
      const { page, context } = await open(
        "login.html",
        {
          actualRole: "provider",
        },
        { width: 390 },
      );
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Please select Provider Login" })
        .waitFor();
      await page.waitForFunction(
        () => !document.getElementById("loginBtn").disabled,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (screenshots) {
        await page.locator("h1").click();
        await page.screenshot({
          path: path.join(screenshots, "auth-login-mismatch-390.png"),
          fullPage: true,
        });
      }
      await page.locator('[data-login-role="provider"]').click();
      await page.locator("#loginBtn").click();
      await page.waitForURL("**/provider/dashboard.html");
      await context.close();
    }
    // Returned and thrown sign-out failures must still remove browser credentials.
    for (const failure of [{ signOutError: true }, { signOutThrows: true }]) {
      const { page, context } = await open("login.html?role=admin", {
        actualRole: "client",
        ...failure,
      });
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "server sign-out could not be confirmed" })
        .waitFor();
      assert.equal(await page.evaluate(() => window.__authSession), null);
      assert.equal(
        await page.evaluate(() => localStorage.getItem("igotu_user")),
        null,
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem("fixture-auth-token")),
        null,
      );
      assert.equal((await operation(page, "clearStoredAuthSession")).length, 1);
      assert.equal(await page.locator("#loginBtn").isEnabled(), true);
      await page.waitForTimeout(950);
      assert.equal(new URL(page.url()).pathname, "/login.html");
      await context.close();
    }
    // If local cleanup or verification fails, retry cleanup, never another sign-in.
    for (const failure of [{ clearFails: true }, { getSessionFails: true }]) {
      const { page, context } = await open("login.html?role=admin", {
        actualRole: "client",
        signOutError: true,
        ...failure,
      });
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Unable to clear this browser" })
        .waitFor();
      await page.waitForFunction(
        () => !document.getElementById("loginBtn").disabled,
      );
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Unable to clear this browser" })
        .waitFor();
      assert.equal((await operation(page, "signInWithPassword")).length, 1);
      assert.equal(
        await page.evaluate(() => localStorage.getItem("igotu_user")),
        null,
      );
      await page.waitForTimeout(950);
      assert.equal(new URL(page.url()).pathname, "/login.html");
      await context.close();
    }
    // Role controls and duplicate submits cannot race a pending authentication attempt.
    {
      const { page, context } = await open("login.html", { signInDelay: 200 });
      await fillLogin(page);
      await page.locator("#loginBtn").click();
      assert.equal(await page.locator("[data-login-role]:disabled").count(), 3);
      await page.locator("#loginForm").evaluate((form) => form.requestSubmit());
      assert.equal((await operation(page, "signInWithPassword")).length, 1);
      await page.waitForURL("**/client/dashboard.html");
      await context.close();
    }
    for (const role of ["client", "provider"]) {
      const { page, context } = await open("register.html", {
        actualRole: role,
        completed: false,
        signupSession: true,
      });
      await page.locator(`[data-register-role="${role}"]`).click();
      await fillRegister(page);
      await page.locator("#registerBtn").click();
      const calls = await operation(page, "signUp");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].args.options.data.role, role);
      await page.waitForURL(`**/${role}/complete-profile.html`);
      await context.close();
    }
    // Signup without an immediate session keeps the existing email-confirmation/login path.
    {
      const { page, context } = await open("register.html");
      await page.locator('[data-register-role="client"]').click();
      await fillRegister(page);
      await page.locator("#registerBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Registration successful. Check your email" })
        .waitFor();
      await page.getByRole("link", { name: "Login here" }).click();
      await page.waitForURL("**/login.html?role=client");
      await context.close();
    }
    // Existing JS validation rejects short passwords, mismatches, and a tampered Admin option.
    const { page, context } = await open("register.html");
    await page.locator('[data-register-role="client"]').click();
    for (const [password, confirm, message] of [
      ["short", "short", "at least 6"],
      ["FixturePass123", "DifferentPass123", "do not match"],
    ]) {
      await fillRegister(page, password, confirm);
      await page.locator("#registerBtn").click();
      await page.getByRole("status").filter({ hasText: message }).waitFor();
      assert.equal((await operation(page, "signUp")).length, 0);
    }
    await fillRegister(page);
    await page.locator("#role").evaluate((select) => {
      select.add(new Option("Admin", "admin"));
      select.value = "admin";
    });
    await page.locator("#registerBtn").click();
    await page
      .getByRole("status")
      .filter({ hasText: "Please select a valid role" })
      .waitFor();
    assert.equal((await operation(page, "signUp")).length, 0);
    await page.selectOption("#role", "");
    await page.locator("#registerBtn").click();
    assert.equal(
      await page.locator("#role").evaluate((e) => e.validity.valueMissing),
      true,
    );
    assert.equal((await operation(page, "signUp")).length, 0);
    await page.goto(`${base}/register.html`);
    await page.getByRole("link", { name: "Go to Admin Login" }).click();
    await page.waitForURL("**/login.html?role=admin");
    assert.equal(
      await page
        .locator('[data-login-role="admin"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await context.close();
    for (const file of ["login.html", "register.html"]) {
      const fallback = await open(
        file,
        {},
        { javaScriptEnabled: false, width: 390 },
      );
      assert.equal(await fallback.page.locator("form").isVisible(), true);
      assert.equal(
        await fallback.page.locator(".role-options").isVisible(),
        false,
      );
      if (file === "register.html")
        assert.equal(await fallback.page.locator("#role").isVisible(), true);
      await fallback.context.close();
    }
    assert.deepEqual(errors, [], "Unexpected browser errors");
    assert.deepEqual(external, [], "No live requests may escape the fixture");
    console.log(
      "PASS: Login/Register at 1440/768/390/320px, axe, keyboard selection, dropdown sync, form validation, 9 role-match outcomes (3 accepted, 6 rejected), local session/cache cleanup, sign-out failures and fail-closed retries, onboarding, suspended/missing/error cases, signup roles, Admin rejection, Admin link and no-JS fallback. No live Supabase traffic.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
