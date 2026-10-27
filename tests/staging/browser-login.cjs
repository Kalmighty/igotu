/* Prepared real-staging Login procedure. Never run in Phase 7; --plan is local. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { check, validatePublic } = require("./runtime.cjs");
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--execute")) {
    console.log(
      "PREPARED_NOT_EXECUTED: nine real-staging Login-role combinations at 390/1440px; synthetic pre-approved accounts only.",
    );
    return;
  }
  const { config, approval, secrets } = require("./config.cjs").load(args);
  const root = fs.realpathSync(config.frontendDirectory),
    allowed = path.resolve(__dirname, "../../work/staging") + path.sep;
  check(root.startsWith(allowed), "LOCAL_STAGING_ARTIFACT_REQUIRED");
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (e, b) => {
      if (e) {
        res.writeHead(404).end();
        return;
      }
      const ext = path.extname(file);
      res
        .writeHead(200, {
          "Content-Type":
            {
              ".js": "text/javascript",
              ".html": "text/html",
              ".css": "text/css",
              ".svg": "image/svg+xml",
            }[ext] || "application/octet-stream",
        })
        .end(b);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let browser;
  try {
    browser = await require("playwright").chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    const base = "http://127.0.0.1:" + server.address().port;
    for (const width of [390, 1440])
      for (const selected of ["client", "provider", "admin"])
        for (const [name, actual] of [
          ["clientA", "client"],
          ["providerA", "provider"],
          ["admin", "admin"],
        ]) {
          const ctx = await browser.newContext({
            viewport: { width, height: 1000 },
          });
          const unexpected = [];
          await ctx.route("**/*", (route) => {
            try {
              validatePublic(config, approval);
            } catch {
              unexpected.push("APPROVAL_WINDOW_CLOSED");
              return route.abort();
            }
            const u = new URL(route.request().url());
            if (
              [base, config.url, "https://cdn.jsdelivr.net"].includes(u.origin)
            )
              return route.continue();
            unexpected.push(u.origin);
            return route.abort();
          });
          const page = await ctx.newPage();
          await page.goto(base + "/login.html?role=" + selected);
          await page.locator("#email").fill(secrets[name].email);
          await page.locator("#password").fill(secrets[name].password);
          await page.locator("#loginBtn").click();
          if (selected === actual) {
            await page.waitForURL("**/" + actual + "/dashboard.html");
            await page.waitForFunction(
              () => document.body.dataset.accessState === "allowed",
            );
          } else {
            await page
              .locator("#messageBox")
              .filter({ hasText: "Please select" })
              .waitFor();
            check(
              new URL(page.url()).pathname === "/login.html",
              "MISMATCH_REDIRECTED",
            );
            const clear = await page.evaluate(
              () =>
                !localStorage.getItem("igotu_user") &&
                !Object.keys(localStorage).some(
                  (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
                ),
            );
            check(clear, "MISMATCH_SESSION_NOT_CLEARED");
          }
          check(!unexpected.length, "UNEXPECTED_BROWSER_ORIGIN");
          console.log(`${width} ${selected}/${actual} PASS`);
          await ctx.close();
        }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      "BLOCKED_OR_FAILED: " + (e.safeCode || "BROWSER_CONTROL_FAILED"),
    );
    process.exitCode = 2;
  });
