/* Synthetic registration UI only. All external traffic is blocked; no live signup. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4186";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Local static server required",
);
const out = path.resolve(
  process.env.REGISTER_ARTIFACTS || "docs/registration-preview",
);
fs.mkdirSync(path.join(out, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(out, "before"), { recursive: true });
const fixture = fs
  .readFileSync(path.join(__dirname, "auth-fixture.js"), "utf8")
  .replace(
    'record("signUp", args);',
    `record("signUp", args);
if (fixture.signupDelay) await new Promise(resolve => setTimeout(resolve, fixture.signupDelay));
if (fixture.signupThrows) throw new Error('Fixture: ambiguous response');`,
  );
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const external = [],
    errors = [],
    metrics = [];
  let checks = 0;
  const ok = (v, label) => {
    assert(v, label);
    checks++;
  };
  async function open(width = 1440, f = {}, opt = {}) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1366 ? 768 : 1000 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
      javaScriptEnabled: !opt.noJS,
    });
    await context.addInitScript((f) => {
      window.__authFixture = f;
    }, f);
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (u.pathname === "/js/supabaseClient.js")
        return r.fulfill({ contentType: "text/javascript", body: fixture });
      if (opt.optionalOff && u.pathname === "/js/register-presentation.js")
        return r.fulfill({ contentType: "text/javascript", body: "" });
      if (opt.before && u.pathname === "/register.html")
        return r.fulfill({
          contentType: "text/html",
          body: execFileSync(
            "git",
            [
              "show",
              "4f972492c8950a503542287d754aac0c75ecdf35:igotu_v2/register.html",
            ],
            { encoding: "utf8" },
          ),
        });
      if (
        /^\/(client|provider|admin)\/(dashboard|verification|complete-profile)\.html$/.test(
          u.pathname,
        )
      )
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic guard destination</title><main>Synthetic guard destination</main>",
        });
      return r.continue();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/register.html");
    if (!opt.noJS) await p.waitForFunction(() => window.__authCalls);
    if (!opt.noJS && !opt.before && !opt.optionalOff)
      await p.waitForFunction(() =>
        document.body.classList.contains("register-enhanced"),
      );
    return { p, context };
  }
  const shot = (p, name) =>
    p.screenshot({
      path: path.join(out, "screenshots", name + ".png"),
      fullPage: true,
    });
  const message = (p) => p.locator("#messageBox").textContent();
  async function waitMessage(p, text) {
    await p.waitForFunction(
      (t) => document.querySelector("#messageBox").textContent.includes(t),
      text,
    );
  }
  async function fill(p, password = "Fixture123", confirm = password) {
    await p.locator("#fullName").fill("Synthetic Account");
    await p.locator("#email").fill("test@example.invalid");
    await p.locator("#password").fill(password);
    await p.locator("#confirmPassword").fill(confirm);
  }
  async function synced(p, role) {
    ok(
      (await p.locator("#role").inputValue()) === role,
      "canonical native role",
    );
    for (const attr of ["data-register-role", "data-account-choice"])
      for (const v of ["client", "provider"])
        ok(
          (await p.locator(`[${attr}="${v}"]`).getAttribute("aria-pressed")) ===
            String(v === role),
          "visual role mirrors canonical value",
        );
  }
  try {
    for (const width of [1536, 1440, 1366, 1024, 768, 390, 320]) {
      const { p, context } = await open(width);
      await p.locator('[data-register-role="client"]').click();
      await synced(p, "client");
      await p.evaluate(() => window.scrollTo(0, 0));
      const m = await p.evaluate(() => {
        const rect = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          form: rect(".registration-panel"),
          info: rect(".registration-info"),
          admin: rect(".admin-access-note"),
          welcome: rect(".auth-page-heading"),
          roles: rect(".register-roles"),
          register: rect("#registerBtn"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, `no horizontal overflow ${width}`);
      if (width <= 768) {
        ok(
          m.form.y < m.admin.y && m.admin.y < m.info.y,
          "mobile source/visual priority",
        );
        ok(m.admin.height < 240, "compact admin notice");
      } else
        ok(
          m.info.x < m.form.x && m.form.width > 400,
          "desktop readable columns",
        );
      const bad = await p
        .locator("input,select,#registerBtn,[data-password-target]")
        .evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return !e.hidden && (r.width < 44 || r.height < 44);
            })
            .map((e) => e.id || e.tagName),
        );
      ok(!bad.length, `44px controls ${width}: ${bad}`);
      await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const a = await p.evaluate(async () => {
        const r = await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        }));
      });
      ok(!a.length, `axe ${width}: ${JSON.stringify(a)}`);
      await shot(p, `register-${width}`);
      if (width === 1366)
        await p.screenshot({
          path: path.join(out, "screenshots/register-1366-initial.png"),
        });
      if (width === 1440) {
        await p
          .locator(".registration-panel")
          .screenshot({ path: path.join(out, "screenshots/form-closeup.png") });
        await shot(p, "client-selected");
        await p.locator('[data-account-choice="provider"]').click();
        await synced(p, "provider");
        await shot(p, "provider-selected");
      }
      await context.close();
      console.log(`PASS responsive + axe ${width}`);
    }
    for (const width of [1536, 390]) {
      const { p, context } = await open(width, {}, { before: true });
      await p.locator('[data-register-role="client"]').click();
      await p.evaluate(() => scrollTo(0, 0));
      await p.screenshot({
        path: path.join(out, `before/register-${width}.png`),
        fullPage: true,
      });
      await context.close();
    }
    {
      const { p, context } = await open();
      await fill(p);
      await p.locator('[data-register-role="client"]').focus();
      await p.keyboard.press("Enter");
      await synced(p, "client");
      await p.locator('[data-account-choice="provider"]').focus();
      await p.keyboard.press("Space");
      await synced(p, "provider");
      await p.locator("#role").selectOption("client");
      await synced(p, "client");
      ok(
        (await p.locator("#email").inputValue()) === "test@example.invalid",
        "role changes preserve fields",
      );
      for (const id of ["password", "confirmPassword"]) {
        await p.locator(`[data-password-target="${id}"]`).click();
        ok(
          (await p.locator("#" + id).getAttribute("type")) === "text",
          "visibility toggle",
        );
        ok(
          (await p
            .locator(`[data-password-target="${id}"]`)
            .getAttribute("aria-pressed")) === "true",
          "visibility semantic state",
        );
      }
      await p.locator('[data-account-choice="provider"]').click();
      for (const id of ["password", "confirmPassword"]) {
        ok(
          (await p.locator("#" + id).getAttribute("type")) === "password",
          "role change masks",
        );
        ok(
          (await p.locator("#" + id).inputValue()) === "Fixture123",
          "password unchanged",
        );
      }
      await p.locator('[data-password-target="password"]').click();
      await p.evaluate(() => dispatchEvent(new Event("blur")));
      ok(
        (await p.locator("#password").getAttribute("type")) === "password",
        "window blur masks",
      );
      ok(
        (await p
          .locator("#role option")
          .evaluateAll((es) => es.map((e) => e.value).join(","))) ===
          ",client,provider",
        "only allowed signup roles",
      );
      await p.locator("#email").fill("bad");
      await p.locator("#registerBtn").click();
      ok(
        (await p.locator("#emailError").textContent()) ===
          "Enter a valid email address.",
        "native email feedback",
      );
      ok(
        !(await p.evaluate(() =>
          window.__authCalls.some((c) => c.operation === "signUp"),
        )),
        "invalid email no signup",
      );
      await p.locator("#fullName").fill("");
      await p.locator("#email").fill("");
      await p.locator("#role").selectOption("");
      await p.locator("#registerBtn").click();
      ok(
        (await p.locator("#fullName").getAttribute("aria-invalid")) === "true",
        "missing name feedback",
      );
      ok(
        (await p.locator("#role").getAttribute("aria-invalid")) === "true",
        "missing role feedback",
      );
      await fill(p, "12345");
      await p.locator("#role").selectOption("client");
      await p.locator("#registerBtn").click();
      await waitMessage(p, "at least 6");
      ok(
        await p.locator("#signupNextSteps").isHidden(),
        "no premature success",
      );
      await fill(p, "123456", "different");
      await p.locator("#registerBtn").click();
      await waitMessage(p, "do not match");
      await shot(p, "validation-error");
      ok(
        !(await p.evaluate(() =>
          window.__authCalls.some((c) => c.operation === "signUp"),
        )),
        "invalid passwords no signup",
      );
      await p.evaluate(() => {
        const o = new Option("Admin", "admin");
        document.querySelector("#role").add(o);
        document.querySelector("#role").value = "admin";
      });
      await fill(p);
      await p.locator("#registerBtn").click();
      await waitMessage(p, "valid role");
      ok(
        !(await p.evaluate(() =>
          window.__authCalls.some((c) => c.operation === "signUp"),
        )),
        "tampered admin rejected by unchanged handler",
      );
      await context.close();
    }
    for (const role of ["client", "provider"]) {
      const { p, context } = await open(1440, { signupDelay: 450 });
      await fill(p, "123456");
      await p.locator(`[data-account-choice="${role}"]`).click();
      await p.locator("#registerBtn").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#registerForm").getAttribute("aria-busy") ===
          "true",
      );
      ok(await p.locator("#role").isDisabled(), "role frozen during signup");
      ok(
        (await p.locator("#password").getAttribute("type")) === "password",
        "submit masked",
      );
      await p.evaluate(() =>
        document.querySelector("#registerForm").requestSubmit(),
      );
      await waitMessage(p, "Registration successful");
      ok(
        (await p.evaluate(
          () =>
            window.__authCalls.filter((c) => c.operation === "signUp").length,
        )) === 1,
        "duplicate submission blocked",
      );
      ok(
        (await p.evaluate(
          () =>
            window.__authCalls.find((c) => c.operation === "signUp").args
              .options.data.role,
        )) === role,
        "actual signup uses canonical role",
      );
      ok(
        (await p.locator("#registerForm").getAttribute("aria-busy")) ===
          "false",
        "spinner ends after response",
      );
      ok(
        await p.locator("#signupNextSteps").isVisible(),
        "next step only after actual fixture success",
      );
      ok(
        (await p.locator(".auth-form-footer a").getAttribute("href")) ===
          `login.html?role=${role}`,
        "email confirmation login role preserved",
      );
      ok(
        (await message(p)).includes("identity verification"),
        "mandatory verification guidance",
      );
      if (role === "client") await shot(p, "confirmation");
      await context.close();
    }
    for (const f of [{ authError: true }, { signupThrows: true }]) {
      const { p, context } = await open(390, f);
      await fill(p);
      await p.locator("#role").selectOption("provider");
      await p.locator("#registerBtn").click();
      await waitMessage(
        p,
        f.authError ? "registration unavailable" : "try logging in",
      );
      ok(await p.locator("#registerBtn").isEnabled(), "error restores submit");
      ok(await p.locator("#role").isEnabled(), "error restores role");
      ok(await p.locator("#signupNextSteps").isHidden(), "error not success");
      ok(
        (await p.evaluate(
          () =>
            window.__authCalls.filter((c) => c.operation === "signUp").length,
        )) === 1,
        "no automatic retries",
      );
      await shot(p, f.authError ? "signup-error" : "ambiguous-response");
      await context.close();
    }
    {
      const { p, context } = await open(1440, {
        signupSession: true,
        verified: false,
        completed: false,
      });
      await fill(p);
      await p.locator("#role").selectOption("client");
      await p.locator("#registerBtn").click();
      await p.waitForURL("**/client/verification.html");
      ok(true, "immediate session routes to mandatory verification");
      await context.close();
    }
    for (const opt of [{ optionalOff: true }, { noJS: true }]) {
      const { p, context } = await open(390, {}, opt);
      ok(
        await p.locator("#role").isVisible(),
        "native fallback remains usable",
      );
      ok(await p.locator("#registerForm").isVisible(), "fallback form visible");
      ok(
        await p.locator('[data-password-target="password"]').isHidden(),
        "optional toggle hidden until enhanced",
      );
      ok(
        await p.locator(".quick-role-tiles").isHidden(),
        "optional tiles hidden until enhanced",
      );
      if (!opt.noJS) {
        await fill(p);
        await p.locator("#role").selectOption("provider");
        await p.locator("#registerBtn").click();
        await waitMessage(p, "Registration successful");
        ok(true, "signup works without presentation script");
      }
      await context.close();
    }
    {
      const { p, context } = await open(1440, {}, { motion: true });
      await p.waitForFunction(() => !document.querySelector(".register-enter"));
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "entrances finish without idle loop",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator('[data-register-role="client"]').hover();
      ok(
        (await p
          .locator('[data-register-role="client"]')
          .evaluate((e) => getComputedStyle(e).transform)) === "none",
        "reduced motion suppresses hover lift",
      );
      await context.close();
    }
    ok(!external.length, "zero external requests");
    ok(!errors.length, `zero page errors ${errors}`);
    fs.writeFileSync(
      path.join(out, "responsive-metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    console.log(
      `PASS ${checks} registration assertions; 7 viewport axe scans; zero external requests/page errors`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
