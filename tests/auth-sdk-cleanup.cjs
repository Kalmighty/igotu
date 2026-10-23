/* Exercise the shipped client and auth code with a real, locally bundled Supabase SDK.
   All Auth/REST traffic is fulfilled by synthetic responses; no network reaches a project.
   SDK_BUNDLE=/path/to/supabase-browser.mjs node tests/auth-sdk-cleanup.cjs */
const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const bundle = fs.readFileSync(process.env.SDK_BUNDLE, "utf8");
const userId = "00000000-0000-4000-8000-000000000001";
const projectHost = "giqtnbwyktbnbhdvjraa.supabase.co";
const storageKey = "sb-giqtnbwyktbnbhdvjraa-auth-token";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: { role: "admin" },
  created_at: "2026-01-01T00:00:00Z",
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}.fixture`;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    for (const mode of ["normal", "server-error", "thrown-signout"]) {
      const context = await browser.newContext();
      const unexpected = [],
        errors = [],
        logouts = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin) return route.continue();
        if (
          url.href === "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"
        )
          return route.fulfill({
            contentType: "text/javascript",
            headers: { "access-control-allow-origin": "*" },
            body: bundle,
          });
        if (url.hostname === projectHost) {
          const headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          };
          if (route.request().method() === "OPTIONS")
            return route.fulfill({ status: 200, headers });
          let body,
            status = 200;
          if (url.pathname === "/auth/v1/token")
            body = {
              access_token: token,
              token_type: "bearer",
              expires_in: 3600,
              expires_at: now + 3600,
              refresh_token: "fixture-refresh-token",
              user,
            };
          else if (url.pathname === "/rest/v1/users")
            body = {
              id: userId,
              full_name: "Fixture Provider",
              role: "provider",
              status: "active",
              profile_completed: true,
            };
          else if (url.pathname === "/auth/v1/logout") {
            logouts.push(url.searchParams.get("scope"));
            if (mode === "server-error") {
              status = 503;
              body = {
                code: "unexpected_failure",
                message: "Fixture: logout unavailable",
              };
            } else body = {};
          } else {
            unexpected.push(url.href);
            return route.abort();
          }
          return route.fulfill({
            status,
            headers,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        }
        unexpected.push(url.href);
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/login.html?role=admin`);
      await page.waitForFunction(() =>
        document.body.classList.contains("auth-roles-ready"),
      );
      await page.evaluate(async (mode) => {
        const { supabase } = await import("/js/supabaseClient.js");
        localStorage.setItem("igotu_user", JSON.stringify({ role: "admin" }));
        localStorage.setItem("unrelated-project-token", "keep-me");
        if (mode === "thrown-signout")
          supabase.auth.signOut = async () => {
            throw new Error("Fixture: transport unavailable");
          };
      }, mode);
      await page.locator("#email").fill("fixture@example.invalid");
      await page.locator("#password").fill("FixturePassword123");
      await page.locator("#loginBtn").click();
      await page
        .getByRole("status")
        .filter({ hasText: "Please select Provider Login" })
        .waitFor();
      await page.waitForFunction(
        () => !document.getElementById("loginBtn").disabled,
      );
      const session = await page.evaluate(
        async () =>
          (
            await (
              await import("/js/supabaseClient.js")
            ).supabase.auth.getSession()
          ).data.session,
      );
      assert.equal(session, null, `${mode}: SDK session retained`);
      const stored = await page.evaluate(
        (key) => ({
          auth: localStorage.getItem(key),
          cache: localStorage.getItem("igotu_user"),
          unrelated: localStorage.getItem("unrelated-project-token"),
        }),
        storageKey,
      );
      assert.deepEqual(stored, {
        auth: null,
        cache: null,
        unrelated: "keep-me",
      });
      if (mode === "normal" || mode === "server-error")
        assert.ok(
          logouts.every((scope) => scope === "local") && logouts.length > 0,
        );
      await page.waitForTimeout(950);
      assert.equal(new URL(page.url()).pathname, "/login.html");
      assert.deepEqual(unexpected, [], "Unexpected network destination");
      assert.deepEqual(errors, [], "Unexpected browser error");
      await context.close();
    }
    console.log(
      "PASS: real SDK local sign-out, simulated 503 logout and thrown sign-out all leave getSession() null, remove only this project’s stored session/cache, preserve unrelated storage and never redirect. All API responses intercepted.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
