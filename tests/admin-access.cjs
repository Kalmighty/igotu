/* Real workspace guard/modules, in-memory fixture SDK; no live Supabase traffic. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { install, seed, ids } = require("./system-fixture.cjs");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4194";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Loopback only",
);
const out = path.resolve("docs/admin-access/screenshots");
fs.mkdirSync(out, { recursive: true });
const sdk = fs.readFileSync(path.join(__dirname, "system-fixture.js"), "utf8");
const business = (s) =>
  s.calls.filter(
    (o) =>
      o.kind === "query" &&
      !(
        o.table === "users" &&
        o.calls.some((c) => c[0] === "single") &&
        o.calls.some((c) => c[0] === "eq" && c[1] === "id")
      ),
  );
const contract = (o) => o.kind === "rpc" && o.name === "igotu_backend_contract";
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const external = [],
    errors = [];
  let assertions = 0,
    cases = 0;
  const ok = (v, label) => {
    assert(v, label);
    assertions++;
  };
  async function open(options = {}) {
    const c = await b.newContext({
      viewport: { width: options.width || 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const tables = seed();
    if (options.prepare) options.prepare(tables);
    const state = await install(c, {
      role: options.role || "admin",
      tables,
      fail: options.fail,
      delay: options.delay,
    });
    if (options.session === false) state.session = false;
    await c.addInitScript(() =>
      localStorage.setItem(
        "igotu_user",
        JSON.stringify({
          role: "admin",
          status: "active",
          identity_verified: true,
        }),
      ),
    );
    await c.route("**/js/supabaseClient.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body:
          sdk +
          (options.override
            ? `\nconst originalRpc=supabase.rpc;supabase.rpc=async(name,args)=>{const r=await originalRpc(name,args);return name==='igotu_backend_contract'&&!r.error?{data:${JSON.stringify(options.override)},error:null}:r};`
            : ""),
      }),
    );
    await c.route("**/login.html", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Synthetic Login destination</title><main>Login fixture</main>",
      }),
    );
    if (options.before)
      for (const name of ["profile-guard", "backend-access"])
        await c.route(`**/js/${name}.js`, (r) =>
          r.fulfill({
            contentType: "text/javascript",
            body: execFileSync(
              "git",
              [
                "show",
                `6b7704124cdfc9dbb9b1838927820ffe1a9fad39:igotu_v2/js/${name}.js`,
              ],
              { encoding: "utf8" },
            ),
          }),
        );
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (new URL(r.url()).origin !== new URL(base).origin)
        external.push(new URL(r.url()).origin);
    });
    await p.goto(base + "/admin/dashboard.html");
    return { p, c, state };
  }
  const result = (p) =>
    p.evaluate(
      async () =>
        await (await import("/js/profile-guard.js")).authorizeWorkspace(),
    );
  async function blocked(env, reason) {
    const { p, state } = env;
    await p.waitForFunction(
      () => document.body.dataset.accessState === "blocked",
    );
    ok(!(await p.locator(".app-layout").isVisible()), "workspace hidden");
    ok(!business(state).length, "no dashboard data queries");
    const r = await result(p);
    ok(!r.allowed, "fail closed");
    if (reason) ok(r.reason === reason, `diagnostic ${reason}: ${r.reason}`);
    const text = await p.locator("#workspaceAccessMessage").textContent();
    ok(
      !/igotu_backend_private|42501|PGRST|secret|stack|approval can be confirmed/.test(
        text,
      ),
      "no internals or misleading approval explanation",
    );
    ok(
      (await p.locator("#workspaceAccessMessage button").count()) === 2,
      "retry/logout retained",
    );
    return text;
  }
  async function capture(p, name) {
    await p.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
  }
  try {
    for (const [label, options, reason] of [
      [
        "missing RPC",
        {
          fail: (o) =>
            contract(o)
              ? { code: "PGRST202", message: "private schema secret SQL" }
              : false,
        },
        "BACKEND_RPC_UNAVAILABLE",
      ],
      [
        "database missing function",
        {
          fail: (o) =>
            contract(o) ? { code: "42883", message: "private SQL" } : false,
        },
        "BACKEND_RPC_UNAVAILABLE",
      ],
      [
        "version mismatch",
        { override: { version: "old", notifications: "database" } },
        "BACKEND_VERSION",
      ],
      [
        "notification mismatch",
        { override: { version: "20261026.1", notifications: "browser" } },
        "BACKEND_NOTIFICATIONS",
      ],
      [
        "RPC permission",
        {
          fail: (o) =>
            contract(o)
              ? { code: "42501", message: "secret permission details" }
              : false,
        },
        "BACKEND_PERMISSION",
      ],
      [
        "RPC authentication",
        { fail: (o) => (contract(o) ? { code: "PGRST301" } : false) },
        "BACKEND_AUTH",
      ],
      [
        "network failure",
        { fail: (o) => (contract(o) ? "throw" : false) },
        "BACKEND_CONNECTION",
      ],
      [
        "unknown API failure",
        {
          fail: (o) =>
            contract(o) ? { code: "OTHER", message: "secret" } : false,
        },
        "BACKEND_UNAVAILABLE",
      ],
      [
        "profile query error",
        {
          fail: (o) =>
            o.kind === "query" && o.table === "users"
              ? { code: "42501", message: "secret" }
              : false,
        },
        "PROFILE_QUERY",
      ],
      [
        "missing profile",
        {
          prepare: (t) => {
            t.users = t.users.filter((u) => u.id !== ids.admin);
          },
          // The shared fixture omits PostgREST's single-row error code.
          fail: (o) =>
            o.kind === "query" && o.table === "users"
              ? { code: "PGRST116" }
              : false,
        },
        "PROFILE_MISSING",
      ],
      [
        "expired session",
        {
          fail: (o) =>
            o.kind === "auth" && o.name === "getSession"
              ? { code: "bad_jwt", status: 401 }
              : false,
        },
        "SESSION_INVALID",
      ],
      [
        "session connection failure",
        {
          fail: (o) =>
            o.kind === "auth" && o.name === "getSession" ? "throw" : false,
        },
        "SESSION_CHECK",
      ],
    ]) {
      const env = await open(options);
      const text = await blocked(env, reason);
      if (reason.startsWith("BACKEND_") && reason !== "BACKEND_AUTH")
        ok(
          text.includes("current server supports this version"),
          "compatibility explanation",
        );
      if (!reason.startsWith("BACKEND_"))
        ok(
          !env.state.calls.some(contract),
          "earlier failure does not reach contract",
        );
      if (label === "missing RPC") {
        await capture(env.p, "backend-incompatible-desktop");
        await env.p.addScriptTag({
          path: require.resolve("axe-core/axe.min.js"),
        });
        const a = await env.p.evaluate(async () => {
          const r = await axe.run();
          return r.violations.map((v) => v.id);
        });
        ok(!a.length, `blocked accessibility ${a}`);
        await env.p.setViewportSize({ width: 390, height: 844 });
        ok(
          await env.p.evaluate(
            () => document.documentElement.scrollWidth === innerWidth,
          ),
          "blocked mobile overflow",
        );
        await capture(env.p, "backend-incompatible-mobile");
      }
      await env.c.close();
      cases++;
      console.log("PASS " + label);
    }
    for (const role of ["client", "provider", "inactive-admin"]) {
      const env = await open(
        role === "inactive-admin"
          ? {
              prepare: (t) => {
                t.users.find((u) => u.id === ids.admin).status = "suspended";
              },
            }
          : { role },
      );
      await env.p.waitForFunction(() => location.pathname === "/login.html");
      ok(env.state.session === false, "rejected role/status signs out");
      ok(
        !business(env.state).length,
        "rejected role/status no dashboard queries",
      );
      ok(
        !env.state.calls.some(contract),
        "role/status rejected before contract",
      );
      await env.c.close();
      cases++;
      console.log("PASS " + role + " rejected with cleanup");
    }
    {
      const env = await open({ session: false });
      await env.p.waitForFunction(() => location.pathname === "/login.html");
      ok(
        !env.state.calls.some((o) => o.kind === "query" || o.kind === "rpc"),
        "no session no business/profile calls",
      );
      await env.c.close();
      cases++;
      console.log("PASS missing session");
    }
    {
      const env = await open({
        role: "client",
        fail: (o) =>
          o.kind === "auth" && ["signOut", "clear"].includes(o.name)
            ? "throw"
            : false,
      });
      await blocked(env, "CLEANUP_UNCONFIRMED");
      ok(
        new URL(env.p.url()).pathname === "/admin/dashboard.html",
        "unconfirmed cleanup does not redirect",
      );
      await env.p.getByRole("button", { name: "Log out", exact: true }).click();
      await env.p.waitForFunction(() =>
        document
          .querySelector("#workspaceAccessMessage p")
          .textContent.includes("Sign-out could not be completed"),
      );
      ok(
        !business(env.state).length,
        "failed logout still no business queries",
      );
      await env.c.close();
      cases++;
      console.log("PASS cleanup failure remains locked");
    }
    {
      const env = await open({
        fail: (o) => (contract(o) ? { code: "PGRST202" } : false),
      });
      await blocked(env);
      env.state.fail = null;
      await env.p
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await env.p.waitForFunction(
        () => document.body.dataset.accessState === "allowed",
      );
      await env.p.waitForFunction(
        () => document.querySelector("#totalRequests").textContent === "4",
      );
      ok(
        env.state.calls.filter(contract).length === 2,
        "retry reload rechecks RPC rather than bypass",
      );
      ok(
        business(env.state).length > 0,
        "dashboard initializes only after successful retry",
      );
      await env.c.close();
      cases++;
      console.log("PASS temporary error retry");
    }
    {
      let release;
      const gate = new Promise((r) => (release = r));
      const env = await open({
        delay: (o) => (contract(o) ? gate : undefined),
        prepare: (t) => {
          const u = t.users.find((u) => u.id === ids.admin);
          u.profile_completed = false;
          u.identity_verified = false;
          t.verification_requests = [];
        },
      });
      ok(
        (await env.p.locator("body").getAttribute("data-access-state")) ===
          "checking",
        "pending remains checking",
      );
      ok(!(await env.p.locator(".app-layout").isVisible()), "pending hidden");
      ok(!business(env.state).length, "pending no dashboard reads");
      release();
      await env.p.waitForFunction(
        () => document.body.dataset.accessState === "allowed",
      );
      await env.p.waitForFunction(
        () => document.querySelector("#totalRequests").textContent === "4",
      );
      ok(
        await env.p.locator(".app-layout").isVisible(),
        "valid Admin workspace visible",
      );
      ok(
        !env.state.calls.some(
          (o) => o.kind === "query" && o.table === "verification_requests",
        ),
        "Admin needs no identity approval",
      );
      ok(
        (await result(env.p)).profile.role === "admin",
        "database profile is Admin",
      );
      await env.p.evaluate(() => {
        const banner = document.createElement("aside");
        banner.textContent =
          "OFFLINE DEMONSTRATION · SYNTHETIC DATA · NO LIVE SUPABASE";
        banner.style =
          "padding:12px;background:#fff4cb;color:#453300;font:700 14px Arial;text-align:center";
        document.body.prepend(banner);
      });
      await capture(env.p, "synthetic-admin-dashboard");
      await env.c.close();
      cases++;
      console.log("PASS valid Admin and pending initialization order");
    }
    {
      const env = await open({
        before: true,
        fail: (o) => (contract(o) ? { code: "PGRST202" } : false),
      });
      await env.p.waitForFunction(
        () => document.body.dataset.accessState === "blocked",
      );
      ok(
        (await env.p.locator("#workspaceAccessMessage").textContent()).includes(
          "approval can be confirmed",
        ),
        "reproduces original misleading message",
      );
      await capture(env.p, "before-misclassified-error");
      await env.c.close();
      cases++;
      console.log("PASS original defect reproduced");
    }
    ok(!errors.length, `page errors ${errors}`);
    ok(!external.length, "zero external requests");
    console.log(
      `PASS ${cases} Admin access scenarios; ${assertions} assertions; zero external requests/page errors`,
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
