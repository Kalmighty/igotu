/* Repeatable local audit. No live credentials or live services are used. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildSync } = require("esbuild");
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "igotu_v2");
const output = path.resolve(
  process.env.AUDIT_OUTPUT || path.join(root, "work/system-audit/final"),
);
fs.mkdirSync(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  let name;
  try {
    name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.resolve(
    publicDir,
    "." + name + (name.endsWith("/") ? "index.html" : ""),
  );
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  });
});
const blocked = [
  [
    "DB-01",
    "Actual schema, API columns/RPC signatures/ACL and exposed-schema compatibility",
  ],
  [
    "DB-02",
    "Anonymous/wrong-role/inactive API authorization and authority-field tampering",
  ],
  [
    "DB-03",
    "Not-submitted/pending/rejected direct table and RPC workspace denial",
  ],
  [
    "DB-04",
    "Concurrent duplicate verification submission, fake consent and private-document ownership",
  ],
  [
    "DB-05",
    "Transactional Admin approval/rejection and Provider badge synchronization",
  ],
  [
    "DB-06",
    "Recommendation completeness, other-Client booking visibility and approved target eligibility",
  ],
  [
    "DB-07",
    "Concurrent selection/confirmation, decline/cancel/start/complete transition integrity",
  ],
  [
    "DB-08",
    "Messaging participant policies, read flags and revoked-session writes",
  ],
  [
    "DB-09",
    "Payment ownership, duplicate prevention, private legacy receipts and signed URL expiry",
  ],
  [
    "DB-10",
    "Review ownership/completion/duplicate constraints and complete aggregate statistics",
  ],
  [
    "DB-11",
    "Report evidence privacy, report ownership/review and transactional notification recipients",
  ],
  [
    "DB-12",
    "Atomic Provider profile/skills/hours updates and failure rollback",
  ],
  [
    "DB-13",
    "Stage A/B/C/identity integration, notification handoff and existing-account reconciliation",
  ],
  [
    "EXT-01",
    "Real confirmation/recovery emails, live geocoder/tiles, device GPS and production configuration",
  ],
].map(([id, name]) => ({
  id,
  name,
  status: "BLOCKED",
  reason:
    "No explicitly authorized isolated staging project/catalog/test accounts or live external-service test authorization. No production reads/writes or real emails attempted.",
}));
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bundle = path.join(output, "supabase-browser.mjs");
  fs.writeFileSync(
    bundle,
    buildSync({
      stdin: {
        contents: "export {createClient} from '@supabase/supabase-js';",
        resolveDir: __dirname,
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
    }).outputFiles[0].text,
  );
  const suites = [
    [
      "static",
      "python",
      ["tests/system-static.py", "--write-inventory", "--parse-sql"],
    ],
    ["verification-draft", "python", ["tests/check-verification-draft.py"]],
    ["homepage", "node", ["tests/home-smoke.cjs"]],
    ["auth", "node", ["tests/auth-smoke.cjs"]],
    ["sdk-cleanup", "node", ["tests/auth-sdk-cleanup.cjs"]],
    ["sdk-lifecycle", "node", ["tests/auth-sdk-lifecycle.cjs"]],
    ["verification", "node", ["tests/mandatory-verification.cjs"]],
    ["workspace-layout", "node", ["tests/ui-smoke.cjs"]],
    ["system-functional", "node", ["tests/system-functional.cjs"]],
  ];
  const results = [];
  try {
    for (const [name, cmd, args] of suites) {
      console.log(`Running ${name}...`);
      let log = "";
      const env = {
        ...process.env,
        UI_BASE_URL: base,
        SDK_BUNDLE: bundle,
        SYSTEM_RESULTS: path.join(output, "functional.json"),
        SDK_LIFECYCLE_RESULTS: path.join(output, "sdk-lifecycle.json"),
        SYSTEM_SCREENSHOTS: path.join(output, "screenshots"),
      };
      delete env.SYSTEM_CASE;
      delete env.SYSTEM_CASE_PATTERN;
      delete env.SDK_CASE;
      const code = await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: root, env });
        child.stdout.on("data", (data) => {
          log += data;
          process.stdout.write(data);
        });
        child.stderr.on("data", (data) => {
          log += data;
          process.stderr.write(data);
        });
        child.on("error", reject);
        child.on("close", resolve);
      });
      fs.writeFileSync(path.join(output, name + ".log"), log);
      results.push({
        name,
        status: code === 0 ? "PASS" : "FAIL",
        exitCode: code,
      });
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  const report = {
    date: new Date().toISOString(),
    testType:
      "Local static checks, offline parsing and synthetic browser/SDK tests only",
    suites: results,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    blocked,
  };
  fs.writeFileSync(
    path.join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Final suite outcomes: ${report.passed} passed, ${report.failed} failed. ${blocked.length} separately enumerated integration groups BLOCKED; no live backend tested.`,
  );
  if (report.failed) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
