/* Real pinned SDK; all Auth/REST responses fulfilled locally. No live backend. */
const { chromium } = require("playwright");
const { buildSync } = require("esbuild");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bundle = buildSync({
  stdin: {
    contents: "export { createClient } from '@supabase/supabase-js';",
    resolveDir: __dirname,
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
}).outputFiles[0].text;
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const uid = "00000000-0000-4000-8000-000000000001",
  admin = "00000000-0000-4000-8000-000000000003";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: { role: "admin" },
  created_at: "2026-01-01T00:00:00Z",
};
const profile = {
  id: uid,
  full_name: "Synthetic Client",
  email: user.email,
  user_code: "SYNTHETIC",
  role: "client",
  status: "active",
  profile_completed: true,
  identity_verified: true,
  identity_verified_at: "2026-01-01",
  identity_verified_by: admin,
};
const now = Math.floor(Date.now() / 1000);
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}.synthetic`;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const results = [];
  try {
    for (const mode of ["cross-tab-signout", "invalid-refresh"]) {
      if (process.env.SDK_CASE && mode !== process.env.SDK_CASE) continue;
      const ctx = await browser.newContext();
      const unexpected = [],
        errors = [];
      let invalidRefresh = false;
      await ctx.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin) return route.continue();
        if (
          url.href ===
          "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm"
        )
          return route.fulfill({
            contentType: "text/javascript",
            headers: { "access-control-allow-origin": "*" },
            body: bundle,
          });
        if (url.hostname !== "giqtnbwyktbnbhdvjraa.supabase.co") {
          unexpected.push(url.hostname);
          return route.abort();
        }
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,HEAD,OPTIONS",
          "content-range": "*/0",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 200, headers });
        let data = [],
          status = 200;
        if (url.pathname === "/auth/v1/token") {
          if (
            invalidRefresh &&
            url.searchParams.get("grant_type") === "refresh_token"
          ) {
            status = 400;
            data = {
              code: "refresh_token_not_found",
              msg: "Synthetic invalid refresh token",
            };
          } else
            data = {
              access_token: token,
              token_type: "bearer",
              expires_in: 3600,
              expires_at: now + 3600,
              refresh_token: "synthetic-refresh",
              user,
            };
        } else if (url.pathname === "/auth/v1/user") data = user;
        else if (url.pathname === "/auth/v1/logout") data = {};
        else if (url.pathname === "/rest/v1/rpc/igotu_backend_contract") data = {version:"20261026.1",notifications:"database"};
        else if (url.pathname === "/rest/v1/users") data = profile;
        else if (url.pathname === "/rest/v1/verification_requests")
          data = [
            {
              id: "synthetic-review",
              role: "client",
              status: "approved",
              reviewed_at: "2026-01-01",
              reviewed_by: admin,
            },
          ];
        else if (
          !["/rest/v1/service_requests", "/rest/v1/notifications"].includes(
            url.pathname,
          )
        ) {
          unexpected.push(url.pathname);
          return route.abort();
        }
        return route.fulfill({
          status,
          headers,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      });
      const pages = [];
      try {
        const p = await ctx.newPage();
        pages.push(p);
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`${base}/login.html?role=client`);
        await p.locator("#email").fill(user.email);
        await p.locator("#password").fill("SyntheticPassword123");
        await p.locator("#loginBtn").click();
        await p.waitForURL("**/client/dashboard.html");
        await p.waitForFunction(
          () => document.body.dataset.accessState === "allowed",
        );
        const second = await ctx.newPage();
        pages.push(second);
        second.on("pageerror", (e) => errors.push(e.message));
        await second.goto(`${base}/client/dashboard.html`);
        await second.waitForFunction(
          () => document.body.dataset.accessState === "allowed",
        );
        const sender = await ctx.newPage();
        pages.push(sender);
        await sender.goto(`${base}/login.html?role=client`);
        invalidRefresh = mode === "invalid-refresh";
        if (invalidRefresh)
          await sender.evaluate(() => {
            const key = "sb-giqtnbwyktbnbhdvjraa-auth-token";
            const session = JSON.parse(localStorage.getItem(key));
            session.expires_at = Math.floor(Date.now() / 1000) - 60;
            const claims = JSON.parse(atob(session.access_token.split(".")[1]));
            claims.exp = session.expires_at;
            session.access_token =
              session.access_token.split(".")[0] +
              "." +
              btoa(JSON.stringify(claims)).replaceAll("=", "") +
              ".synthetic";
            localStorage.setItem(key, JSON.stringify(session));
          });
        await sender.evaluate(async (mode) => {
          const { supabase } = await import("/js/supabaseClient.js");
          if (mode === "invalid-refresh") await supabase.auth.refreshSession();
          else await supabase.auth.signOut({ scope: "local" });
        }, mode);
        await Promise.all([
          p.waitForURL("**/login.html"),
          second.waitForURL("**/login.html"),
        ]);
        assert.equal(
          await sender.evaluate(async () => {
            const { supabase } = await import("/js/supabaseClient.js");
            return (await supabase.auth.getSession()).data.session;
          }),
          null,
        );
        assert.equal(
          await sender.evaluate(() => localStorage.getItem("igotu_user")),
          null,
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        results.push({ name: mode, status: "PASS" });
        console.log(
          `PASS real SDK ${mode}: both workspace tabs lock and return to Login, cache/session cleared. Synthetic HTTP only.`,
        );
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (process.env.SDK_LIFECYCLE_RESULTS) {
    fs.mkdirSync(path.dirname(process.env.SDK_LIFECYCLE_RESULTS), {
      recursive: true,
    });
    fs.writeFileSync(
      process.env.SDK_LIFECYCLE_RESULTS,
      JSON.stringify(
        { type: "Real SDK, synthetic Auth/REST responses", results },
        null,
        2,
      ) + "\n",
    );
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
