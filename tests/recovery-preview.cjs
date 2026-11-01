/* Local synthetic UI only. No live recovery, credentials, tokens or project traffic. */
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4190";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Loopback server required",
);
const out = path.resolve(
  process.env.RECOVERY_ARTIFACTS || "docs/recovery-preview",
);
for (const dir of ["screenshots", "before"])
  fs.mkdirSync(path.join(out, dir), { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const external = [],
    errors = [],
    metrics = [];
  let checks = 0;
  function ok(value, label) {
    assert(value, label);
    checks++;
  }
  async function open(
    file = "forgot-password",
    width = 1440,
    fixture = {},
    opt = {},
  ) {
    const c = await browser.newContext({
      viewport: { width, height: width === 1366 ? 768 : 1000 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
      javaScriptEnabled: !opt.noJS,
    });
    const calls = [];
    await c.exposeBinding("__captureRecovery", (_, event) => calls.push(event));
    await c.addInitScript((f) => {
      window.__recoveryFixture = f;
      if (!location.pathname.endsWith("/login.html")) {
        localStorage.setItem("igotu_user", "stale synthetic profile");
        if (f.session)
          localStorage.setItem(
            "fixture-recovery-session",
            "synthetic-session-marker",
          );
      }
    }, fixture);
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (u.pathname === "/js/supabaseClient.js")
        return r.fulfill({
          contentType: "text/javascript",
          body: fs.readFileSync(
            path.join(__dirname, "recovery-fixture.js"),
            "utf8",
          ),
        });
      if (opt.optionalOff && u.pathname === "/js/recovery-presentation.js")
        return r.fulfill({ contentType: "text/javascript", body: "" });
      if (opt.before && u.pathname === `/${file}.html`)
        return r.fulfill({
          contentType: "text/html",
          body: execFileSync(
            "git",
            [
              "show",
              `89a5c6176f81c61927e6d99968a7841e24c8cde5:igotu_v2/${file}.html`,
            ],
            { encoding: "utf8" },
          ),
        });
      if (u.pathname === "/login.html")
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic Login destination</title><main>Synthetic Login destination</main>",
        });
      return r.continue();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/${file}.html`);
    if (!opt.noJS) await p.waitForFunction(() => window.__recoveryCalls);
    return { p, c, calls };
  }
  const shot = (p, name) =>
    p.screenshot({
      path: path.join(out, "screenshots", name + ".png"),
      fullPage: true,
    });
  const waitMessage = (p, text) =>
    p.waitForFunction(
      (t) => document.querySelector("#messageBox").textContent.includes(t),
      text,
    );
  const fill = async (p, password = "Synthetic123", confirm = password) => {
    await p.locator("#newPassword").fill(password);
    await p.locator("#confirmPassword").fill(confirm);
  };
  try {
    for (const width of [1536, 1440, 1366, 1024, 768, 390, 320])
      for (const file of ["forgot-password", "reset-password"]) {
        const { p, c } = await open(file, width);
        const m = await p.evaluate(() => {
          const rect = (s) => {
            const r = document.querySelector(s).getBoundingClientRect();
            return {
              x: r.x,
              y: r.y + scrollY,
              width: r.width,
              height: r.height,
            };
          };
          return {
            page: document.body.dataset.page,
            width: innerWidth,
            height: innerHeight,
            pageWidth: document.documentElement.scrollWidth,
            pageHeight: document.documentElement.scrollHeight,
            heading: rect(".recovery-heading"),
            form: rect(".recovery-form-card"),
            support: rect(".recovery-support"),
            art: rect(".recovery-art"),
            firstField: rect("input"),
            button: rect('button[type="submit"]'),
          };
        });
        metrics.push(m);
        ok(m.pageWidth === width, `${file} overflow ${width}`);
        if (width <= 768)
          ok(
            m.heading.y < m.form.y &&
              m.form.y < m.support.y &&
              m.support.y < m.art.y,
            "mobile priority",
          );
        else
          ok(
            m.form.x > m.heading.x && m.form.width > 350,
            "readable desktop columns",
          );
        const clipped = await p
          .locator(
            ".recovery-form-card input,.recovery-form-card button,.recovery-member a,.recovery-back",
          )
          .evaluateAll((es) =>
            es
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return (
                  !e.hidden &&
                  (r.height < 44 ||
                    r.width < 44 ||
                    r.left < 0 ||
                    r.right > innerWidth + 1)
                );
              })
              .map((e) => e.id || e.tagName),
          );
        ok(!clipped.length, `44px controls/bounds ${JSON.stringify(clipped)}`);
        ok(
          (await p
            .locator("input")
            .first()
            .evaluate((e) => e.getBoundingClientRect().height)) >= 48,
          "48px input",
        );
        await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const violations = await p.evaluate(async () => {
          const r = await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          });
          return r.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          }));
        });
        ok(
          !violations.length,
          `axe ${file} ${width}: ${JSON.stringify(violations)}`,
        );
        ok(
          (await p.locator(".recovery-brand").getAttribute("href")) ===
            "index.html",
          "homepage link",
        );
        ok(
          (await p.locator(".recovery-member a").getAttribute("href")) ===
            "login.html",
          "header Login link",
        );
        ok(
          (await p.locator(".recovery-back").getAttribute("href")) ===
            "login.html",
          "back link",
        );
        await shot(p, `${file}-${width}`);
        if (width === 1366)
          await p.screenshot({
            path: path.join(out, "screenshots", `${file}-1366-initial.png`),
          });
        await c.close();
        console.log(`PASS responsive/axe ${file} ${width}`);
      }
    for (const width of [1536, 390])
      for (const file of ["forgot-password", "reset-password"]) {
        const { p, c } = await open(file, width, {}, { before: true });
        await p.screenshot({
          path: path.join(out, "before", `${file}-${width}.png`),
          fullPage: true,
        });
        await c.close();
      }
    {
      const { p, c, calls } = await open();
      await p.locator("#forgotPasswordBtn").click();
      ok(
        (await p.locator("#email").getAttribute("aria-invalid")) === "true",
        "missing email accessible feedback",
      );
      await p.locator("#email").fill("invalid");
      await p.locator("#forgotPasswordBtn").click();
      ok(
        (await p.locator("#emailError").textContent()) ===
          "Enter a valid email address.",
        "invalid email feedback",
      );
      ok(!calls.length, "invalid email makes no request");
      await p.locator("#email").fill("fixture@example.invalid");
      await p.evaluate(() => (window.__recoveryFixture.delay = 400));
      await p.locator("#forgotPasswordBtn").click();
      await p.waitForFunction(
        () =>
          document.querySelector("form").getAttribute("aria-busy") === "true",
      );
      ok(
        await p.locator("#forgotPasswordBtn").isDisabled(),
        "pending request disables submit",
      );
      await p.evaluate(() => document.querySelector("form").requestSubmit());
      await waitMessage(p, "If that email belongs to an IGotU account");
      ok(
        calls.filter((c) => c.operation === "resetPasswordForEmail").length ===
          1,
        "duplicate request prevented",
      );
      ok(calls[0].syntheticEmail, "correct email forwarded");
      ok(
        calls[0].redirectTo === new URL("reset-password.html", base + "/").href,
        "same-origin reset URL",
      );
      ok(
        await p.locator("#forgotPasswordBtn").isEnabled(),
        "request completes",
      );
      ok(
        (await p.locator("form").getAttribute("aria-busy")) === "false",
        "spinner ends",
      );
      ok(
        (await p.locator("#recoveryNextText").textContent()).includes(
          "delivery is not confirmed",
        ),
        "no delivery claim",
      );
      await shot(p, "recovery-success");
      await p.waitForTimeout(1300);
      ok(
        new URL(p.url()).pathname === "/forgot-password.html",
        "no automatic success redirect",
      );
      await c.close();
    }
    for (const kind of ["requestError", "requestThrows"]) {
      const { p, c, calls } = await open("forgot-password", 390, {
        [kind]: true,
      });
      await p.locator("#email").fill("fixture@example.invalid");
      await p.locator("#forgotPasswordBtn").click();
      await waitMessage(p, "Unable to send the reset link. Please try again.");
      ok(
        (await p.locator("#email").inputValue()) === "fixture@example.invalid",
        "failure preserves email",
      );
      ok(
        await p.locator("#forgotPasswordBtn").isEnabled(),
        "failure permits retry",
      );
      ok(
        !(await p.locator("#messageBox").textContent()).includes(
          "Synthetic failure",
        ),
        "internal error payload hidden",
      );
      await shot(
        p,
        kind === "requestError" ? "recovery-error" : "recovery-network-error",
      );
      await p.evaluate((k) => (window.__recoveryFixture[k] = false), kind);
      await p.locator("#forgotPasswordBtn").click();
      await waitMessage(p, "If that email belongs");
      ok(
        calls.filter((c) => c.operation === "resetPasswordForEmail").length ===
          2,
        "only explicit retry sends second request",
      );
      await c.close();
    }
    {
      const { p, c, calls } = await open("reset-password", 390, {
        session: true,
      });
      await p.locator("#resetPasswordBtn").click();
      ok(
        (await p.locator("#newPassword").getAttribute("aria-invalid")) ===
          "true",
        "missing password",
      );
      await fill(p, "12345");
      await p.locator("#resetPasswordBtn").click();
      ok(
        (await p.locator("#newPasswordError").textContent()) ===
          "Use at least 6 characters.",
        "native minlength preserved",
      );
      ok(!calls.length, "native invalid password no Auth calls");
      await fill(p, "123456", "654321");
      await p.locator("#resetPasswordBtn").click();
      await waitMessage(p, "do not match");
      ok(!calls.length, "mismatch no Auth calls");
      await shot(p, "password-validation");
      for (const id of ["newPassword", "confirmPassword"]) {
        await p.locator(`[data-recovery-password="${id}"]`).focus();
        await p.keyboard.press("Space");
        ok(
          (await p.locator("#" + id).getAttribute("type")) === "text",
          "keyboard visibility",
        );
        ok(
          (await p
            .locator(`[data-recovery-password="${id}"]`)
            .getAttribute("aria-pressed")) === "true",
          "pressed semantics",
        );
      }
      await p.evaluate(() => dispatchEvent(new Event("blur")));
      for (const id of ["newPassword", "confirmPassword"])
        ok(
          (await p.locator("#" + id).getAttribute("type")) === "password",
          "blur masks",
        );
      ok(
        (await p.locator("#newPassword").inputValue()) === "123456",
        "visibility preserves content",
      );
      ok(!calls.length, "visibility never submits");
      await c.close();
    }
    for (const fixture of [
      { session: false },
      { session: true, sessionError: true },
      { session: true, sessionThrows: true },
    ]) {
      const { p, c, calls } = await open("reset-password", 1440, fixture);
      await fill(p);
      await p.locator("#resetPasswordBtn").click();
      await waitMessage(
        p,
        fixture.sessionThrows ? "Unable to update" : "Please open this page",
      );
      ok(
        !calls.some((e) => e.operation === "updateUser"),
        "missing/invalid session prevents update",
      );
      ok(
        await p.locator("#resetPasswordBtn").isEnabled(),
        "session failure restores button",
      );
      if (!fixture.session) await shot(p, "invalid-reset-session");
      await c.close();
    }
    for (const kind of ["updateError", "updateThrows"]) {
      const { p, c, calls } = await open("reset-password", 390, {
        session: true,
        [kind]: true,
      });
      await fill(p);
      await p.locator("#resetPasswordBtn").click();
      await waitMessage(p, "Unable to update your password");
      ok(
        await p.locator("#resetPasswordBtn").isEnabled(),
        "update failure permits retry",
      );
      ok(
        (await p.locator("#newPassword").inputValue()) === "Synthetic123",
        "update failure retains input",
      );
      ok(
        !calls.some((e) => e.operation === "signOut"),
        "failed update does not sign out",
      );
      await p.evaluate((k) => {
        window.__recoveryFixture[k] = false;
        window.__recoveryFixture.session = false;
      }, kind);
      await p.locator("#resetPasswordBtn").click();
      await waitMessage(p, "Please open this page");
      ok(
        calls.filter((e) => e.operation === "getSession").length === 2,
        "session rechecked on retry",
      );
      ok(
        calls.filter((e) => e.operation === "updateUser").length === 1,
        "expired retry session blocks update",
      );
      await c.close();
    }
    for (const fixture of [
      { session: true },
      { session: true, signOutError: true },
      { session: true, signOutThrows: true },
      { session: true, signOutError: true, clearFails: true },
      { session: true, signOutThrows: true, clearFails: true },
    ]) {
      const { p, c, calls } = await open("reset-password", 1440, {
        ...fixture,
        delay: 160,
      });
      await fill(p, "123456");
      await p.locator('[data-recovery-password="newPassword"]').click();
      await p.locator("#resetPasswordBtn").click();
      await p.waitForFunction(
        () =>
          document.querySelector("form").getAttribute("aria-busy") === "true",
      );
      ok(
        (await p.locator("#newPassword").getAttribute("type")) === "password",
        "submit masks",
      );
      ok(
        await p.locator('[data-recovery-password="newPassword"]').isDisabled(),
        "pending update disables toggles",
      );
      await p.evaluate(() => document.querySelector("form").requestSubmit());
      await waitMessage(
        p,
        fixture.clearFails
          ? "sign-out could not be confirmed"
          : "Password updated successfully",
      );
      ok(
        calls.filter((e) => e.operation === "updateUser").length === 1,
        "update duplicate prevented",
      );
      const update = calls.find((e) => e.operation === "updateUser");
      ok(
        update.keys.join(",") === "password" && update.passwordLength === 6,
        "six-character update payload preserved without recording value",
      );
      ok(
        calls.find((e) => e.operation === "signOut")?.scope === "local",
        "local sign-out scope",
      );
      ok(
        (await p.evaluate(() => localStorage.getItem("igotu_user"))) === null,
        "cached account removed",
      );
      ok(
        (await p.locator("form").getAttribute("aria-busy")) === "false",
        "spinner ends on outcome even while button stays disabled",
      );
      ok(
        await p.locator("#resetPasswordBtn").isDisabled(),
        "updated password cannot be resubmitted",
      );
      if (fixture.signOutError || fixture.signOutThrows)
        ok(
          calls.some((e) => e.operation === "clearStoredAuthSession"),
          "cleanup fallback invoked",
        );
      if (fixture.clearFails) {
        await shot(p, "cleanup-unconfirmed");
        await p.waitForTimeout(1400);
        ok(
          new URL(p.url()).pathname === "/reset-password.html",
          "unconfirmed cleanup prevents redirect",
        );
        ok(
          !(await p.locator("#recoveryNextText").textContent()).includes(
            "completed",
          ),
          "cleanup failure not success",
        );
      } else {
        if (!fixture.signOutError && !fixture.signOutThrows)
          await shot(p, "password-update-success");
        await p.waitForURL("**/login.html");
        ok(
          (await p.evaluate(() =>
            localStorage.getItem("fixture-recovery-session"),
          )) === null,
          "local fixture session cleared before Login",
        );
      }
      await c.close();
    }
    for (const file of ["forgot-password", "reset-password"])
      for (const opt of [{ optionalOff: true }, { noJS: true }]) {
        const { p, c } = await open(file, 390, { session: true }, opt);
        ok(await p.locator("form").isVisible(), "fallback form visible");
        ok(
          await p.locator("input").first().isVisible(),
          "fallback fields visible",
        );
        if (file === "reset-password")
          ok(
            await p
              .locator('[data-recovery-password="newPassword"]')
              .isHidden(),
            "inert optional toggles hidden",
          );
        if (!opt.noJS) {
          if (file === "forgot-password") {
            await p.locator("#email").fill("fixture@example.invalid");
            await p.locator("#forgotPasswordBtn").click();
            await waitMessage(p, "If that email belongs");
          } else {
            await fill(p);
            await p.locator("#resetPasswordBtn").click();
            await waitMessage(p, "Password updated successfully");
          }
          ok(true, "original handler works without presentation JS");
        }
        await c.close();
      }
    for (const file of ["forgot-password", "reset-password"]) {
      const { p, c } = await open(file, 1440, {}, { motion: true });
      await p.waitForFunction(() => !document.querySelector(".recovery-enter"));
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite entrance and no idle animation",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator('button[type="submit"]').hover();
      ok(
        (await p
          .locator('button[type="submit"]')
          .evaluate((e) => getComputedStyle(e).transform)) === "none",
        "reduced hover movement",
      );
      await p.keyboard.press("Tab");
      await c.close();
    }
    ok(!external.length, "zero external requests");
    ok(!errors.length, `zero page errors ${errors}`);
    fs.writeFileSync(
      path.join(out, "responsive-metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    console.log(
      `PASS ${checks} recovery assertions; 14 viewport axe scans; zero external requests/page errors`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
