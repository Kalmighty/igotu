/* Real UI modules + synthetic SDK interception. No live identity data or SQL. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4211",
  out = "docs/identity-verification-ui",
  reviewed = "4a3630d8dedb6b93dc9e322fc0a71a3fe0cd36c4";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
for (const dir of ["screenshots", "before", "validation"])
  fs.mkdirSync(`${out}/${dir}`, { recursive: true });
let checks = 0,
  scans = 0;
const errors = [],
  external = [],
  metrics = [];
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
const isStatusQuery = (o) =>
  o.kind === "query" &&
  o.table === "verification_requests" &&
  o.calls.some((c) => c[0] === "select" && c[1].includes("admin_note"));
const inserts = (s) =>
  s.calls.filter(
    (o) =>
      o.kind === "query" &&
      o.table === "verification_requests" &&
      o.calls.some((c) => c[0] === "insert"),
  );
const uploads = (s) =>
  s.calls.filter((o) => o.kind === "storage" && o.action === "upload");
const removals = (s) =>
  s.calls.filter((o) => o.kind === "storage" && o.action === "remove");
const wait = async (fn) => {
  const until = Date.now() + 12000;
  while (!fn()) {
    if (Date.now() > until) throw Error("Synthetic fixture barrier timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
};
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const role = opt.role || "client",
      status = opt.state || "approved",
      width = opt.width || 1536,
      height = opt.height || 864;
    const c = await browser.newContext({
        viewport: { width, height },
        reducedMotion: opt.motion ? "no-preference" : "reduce",
      }),
      t = seed(),
      uid = ids[role];
    const user = t.users.find((u) => u.id === uid);
    Object.assign(user, {
      full_name: `Synthetic ${role === "provider" ? "Provider" : "Client"} A`,
      email: `${role}-a@igotu.test`,
      phone: opt.missingPhone ? "" : "0100000000",
      user_code: role === "client" ? "C-TEST" : "P-TEST",
      profile_completed: opt.completed === true,
      identity_verified: status === "approved",
      identity_verified_at:
        status === "approved" ? "2026-10-28T13:16:00Z" : null,
      identity_verified_by: status === "approved" ? ids.admin : null,
    });
    t.verification_requests = t.verification_requests.filter(
      (v) => v.user_id !== uid,
    );
    if (status !== "not_submitted")
      t.verification_requests.push({
        id: "00000000-0000-4000-9000-000000000099",
        user_id: uid,
        role,
        status,
        submitted_at: "2026-10-28T13:14:00Z",
        reviewed_at: ["approved", "rejected"].includes(status)
          ? "2026-10-28T13:16:00Z"
          : null,
        reviewed_by: ["approved", "rejected"].includes(status)
          ? ids.admin
          : null,
        admin_note:
          opt.note === undefined
            ? status === "rejected"
              ? "Synthetic feedback: Please choose a clearer sample."
              : "Synthetic offline review completed."
            : opt.note,
        age_confirmed: true,
        privacy_consent: true,
      });
    if (opt.prepare) opt.prepare(t, user);
    const gate = {
      failRefresh: !!opt.failRefresh,
      uploadFailure: false,
      insertFailure: false,
      uncertain: false,
      hold: null,
      signOutFailure: false,
    };
    const s = await install(c, {
      tables: t,
      role: opt.accountRole || role,
      fail: (o, state) => {
        if (gate.failRefresh && isStatusQuery(o)) return true;
        if (gate.signOutFailure && o.kind === "auth" && o.name === "signOut")
          return true;
        if (gate.uploadFailure && o.kind === "storage" && o.action === "upload")
          return true;
        if (
          gate.insertFailure &&
          o.kind === "query" &&
          o.table === "verification_requests" &&
          o.calls.some((x) => x[0] === "insert")
        )
          return { code: "42501" };
        if (
          gate.uncertain &&
          o.kind === "query" &&
          o.table === "verification_requests" &&
          o.calls.some((x) => x[0] === "insert")
        ) {
          gate.uncertain = false;
          const payload = o.calls.find((x) => x[0] === "insert")[1];
          state.tables.verification_requests.push({
            ...structuredClone(payload),
            id: "00000000-0000-4000-9000-000000000088",
            submitted_at: "2026-11-03T01:00:00Z",
          });
          return "throw";
        }
        return opt.fail?.(o, state) || false;
      },
      delay: (o) => (gate.hold ? gate.hold(o) : opt.delay?.(o)),
    });
    if (opt.noSession) s.session = false;
    await c.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return route.abort();
      }
      if (
        opt.before &&
        [
          `/${role}/verification.html`,
          "/css/verification-access.css",
          "/js/verification.js",
        ].includes(u.pathname)
      )
        return route.fulfill({
          contentType: u.pathname.endsWith(".css")
            ? "text/css"
            : u.pathname.endsWith(".js")
              ? "text/javascript"
              : "text/html",
          body: execFileSync(
            "git",
            ["show", `${reviewed}:igotu_v2${u.pathname}`],
            { encoding: "utf8" },
          ),
        });
      return route.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + `/${role}/verification.html`, { waitUntil: "commit" });
    if (!opt.noWait) {
      await p.waitForFunction(
        (before) =>
          document.body.dataset.accessState === "allowed" &&
          (before
            ? !!document.body.dataset.verificationState
            : document.body.dataset.statusFresh !== undefined),
        !!opt.before,
      );
      if (!opt.before)
        await p.waitForFunction(
          () => !document.getElementById("refreshVerificationBtn").disabled,
        );
    }
    return {
      p,
      c,
      s,
      gate,
      role,
      user: () => s.tables.users.find((u) => u.id === uid),
      request: () =>
        s.tables.verification_requests.find((v) => v.user_id === uid),
    };
  }
  async function shot(p, name, before = false) {
    await p.evaluate(() => {
      const e = document.createElement("aside");
      e.id = "offlineVerificationLabel";
      e.textContent =
        "OFFLINE · SYNTHETIC ACCOUNT / DOCUMENT · NO LIVE SUPABASE · ID INPUT REDACTED";
      e.style =
        "position:relative;z-index:99999;padding:4px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 10px/1.5 Arial;pointer-events:none";
      document.body.prepend(e);
      const style = document.createElement("style");
      style.id = "offlineIdRedaction";
      style.textContent =
        "#idNumber{color:transparent!important;caret-color:transparent!important;text-shadow:none!important}";
      document.head.append(style);
    });
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineVerificationLabel").evaluate((e) => e.remove());
    await p.locator("#offlineIdRedaction").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const issues = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((x) => ({
        id: x.id,
        targets: x.nodes.map((n) => n.target),
      }));
    });
    ok(!issues.length, "axe " + label + JSON.stringify(issues));
    scans++;
  }
  async function png(p) {
    const bytes = await p.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 400;
      const x = c.getContext("2d");
      x.fillStyle = "#eaf7ee";
      x.fillRect(0, 0, 640, 400);
      x.fillStyle = "#075c36";
      x.fillRect(32, 30, 576, 70);
      x.fillStyle = "#fff";
      x.font = "28px Arial";
      x.fillText("SYNTHETIC SAMPLE", 70, 75);
      x.fillStyle = "#075c36";
      x.font = "24px Arial";
      x.fillText("NOT AN ID DOCUMENT", 120, 235);
      const b = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    return {
      name: "offline-sample.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    };
  }
  const fill = async (p, provider = false) => {
    await p.locator("#legalName").fill("Synthetic Verification Applicant");
    await p.locator("#idType").selectOption("passport");
    await p.locator("#idNumber").fill("OFFLINEONLY");
    await p.locator("#identityDocument").setInputFiles(await png(p));
    await p.locator("#ageConfirm").check();
    await p.locator("#privacyConsent").check();
    if (provider) {
      await p.locator("#businessName").fill("Synthetic Service Studio");
      await p.locator("#ssmNumber").fill("SYNTHETIC-REG");
      await p.locator("#professionalLicense").fill("Synthetic certificate");
    }
  };
  const msg = (p, text) =>
    p.waitForFunction(
      (t) => document.getElementById("messageBox").textContent.includes(t),
      text,
    );
  try {
    for (const role of ["client", "provider"]) {
      for (const [width, height] of [
        [1920, 1080],
        [1536, 864],
        [1440, 900],
        [1366, 768],
        [1024, 768],
        [768, 1024],
        [390, 844],
        [320, 800],
      ]) {
        const { p, c, s } = await open({ role, width, height });
        ok(
          (await p.locator("#continueVerificationBtn").getAttribute("href")) ===
            "complete-profile.html",
          "approved incomplete route " + role,
        );
        ok(
          (await p.locator("#continueVerificationBtn").textContent()) ===
            "Continue to complete your profile",
          "clear profile CTA",
        );
        ok(
          (await p
            .locator(".verification-progress [data-complete=true]")
            .count()) === 2,
          "only identity/review completed",
        );
        ok(
          (await p.locator("#progressProfile").getAttribute("aria-current")) ===
            "step",
          "profile current",
        );
        ok(
          (await p.locator(".sidebar,.side-menu").count()) === 0,
          "no workspace sidebar",
        );
        ok(
          (await p.locator("#verificationRole").textContent()) ===
            (role === "client" ? "Client" : "Provider"),
          "actual role",
        );
        ok(
          (await p.locator("#verificationEmail").textContent()) ===
            `${role}-a@igotu.test`,
          "actual email",
        );
        ok(
          (await p.locator("#verificationSubmittedAt").textContent()).includes(
            "MYT",
          ),
          "actual timestamp timezone",
        );
        const m = await p.evaluate(() => {
          const r = (s) => {
            const b = document.querySelector(s).getBoundingClientRect();
            return {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              right: b.right,
              bottom: b.bottom,
            };
          };
          return {
            role: document.querySelector("#verificationRole").textContent,
            width: innerWidth,
            height: innerHeight,
            pageWidth: document.documentElement.scrollWidth,
            progress: r(".verification-progress"),
            card: r("#verificationStatusCard"),
            refresh: r("#refreshVerificationBtn"),
            logout: r("#verificationLogoutBtn"),
            continue: r("#continueVerificationBtn"),
          };
        });
        metrics.push(m);
        ok(m.pageWidth === width, "no horizontal overflow " + role + width);
        ok(
          Math.abs(m.card.width - m.progress.width) < 2,
          "status card fills the onboarding content width",
        );
        ok(
          m.refresh.width >= 44 &&
            m.refresh.height >= 44 &&
            m.logout.height >= 44,
          "header touch targets",
        );
        ok(
          m.continue.width >= 44 &&
            m.continue.height >= 44 &&
            m.continue.right <= width,
          "continue fits viewport",
        );
        ok(!uploads(s).length && !inserts(s).length, "display no mutations");
        await axe(p, `${role} approved ${width}`);
        await shot(p, `${role}-approved-${width}`);
        await c.close();
      }
      for (const [state, completed] of [
        ["not_submitted", false],
        ["pending", false],
        ["rejected", false],
        ["approved", true],
      ])
        for (const width of [1536, 390]) {
          const { p, c, s } = await open({
            role,
            state,
            completed,
            width,
            height: width === 390 ? 844 : 864,
          });
          const complete = await p
            .locator(".verification-progress [data-complete=true]")
            .count();
          ok(
            complete ===
              (state === "approved" ? 3 : state === "pending" ? 1 : 0),
            "accurate completion " + state,
          );
          ok(
            (await p.locator("#verificationFormPanel").isVisible()) ===
              !["approved", "pending"].includes(state),
            "existing form eligibility",
          );
          if (state === "approved") {
            ok(
              (await p
                .locator("#continueVerificationBtn")
                .getAttribute("href")) === "dashboard.html",
              "completed profile dashboard route",
            );
            ok(
              (await p
                .locator(".verification-progress [aria-current]")
                .count()) === 0,
              "all complete has no falsely active step",
            );
          } else {
            ok(
              await p.locator("#continueVerificationBtn").isHidden(),
              "unapproved no workspace CTA",
            );
            ok(
              (await p
                .locator(
                  "#progress" + (state === "pending" ? "Review" : "Identity"),
                )
                .getAttribute("aria-current")) === "step",
              "accurate active step",
            );
          }
          if (state === "not_submitted" || state === "rejected") {
            ok(
              !(await p.locator("#ageConfirm").isChecked()) &&
                !(await p.locator("#privacyConsent").isChecked()),
              "consents never preselected",
            );
            await p.locator("#verificationSubmitLink").click();
            ok(
              await p
                .locator("#legalName")
                .evaluate((e) => e === document.activeElement),
              "submission action focuses existing form",
            );
            if (role === "provider")
              for (const id of [
                "businessName",
                "ssmNumber",
                "professionalLicense",
                "supportingDocument",
              ])
                ok(
                  await p.locator("#" + id).evaluate((e) => !e.required),
                  "provider field remains optional",
                );
            ok(
              await p.evaluate(
                () => document.documentElement.scrollWidth === innerWidth,
              ),
              "submission form no overflow",
            );
          }
          await axe(p, `${role} ${state} ${width}`);
          await shot(
            p,
            `${role}-${completed ? "approved-complete" : state}-${width}`,
          );
          ok(
            !uploads(s).length && !inserts(s).length,
            "state display never submits",
          );
          await c.close();
        }
      for (const width of [1536, 390]) {
        const { p, c } = await open({ role, width, before: true });
        await shot(p, `${role}-approved-${width}`, true);
        await c.close();
      }
    }
    {
      const { p, c } = await open({
        state: "approved",
        missingPhone: true,
        note: null,
        prepare: (t, u) => {
          u.email =
            "synthetic." + "very-long-address.".repeat(9) + "@igotu.test";
          const r = t.verification_requests.find((v) => v.user_id === u.id);
          r.submitted_at = null;
          r.reviewed_at = null;
        },
      });
      ok(
        await p.locator("#continueVerificationBtn").isHidden(),
        "missing review timestamp never grants approval",
      );
      ok(
        await p.locator("#verificationAdminNoteWrap").isHidden(),
        "missing note omitted",
      );
      ok(
        (await p.locator("#verificationSubmittedAt").textContent()) ===
          "Unavailable",
        "missing date honest",
      );
      ok(
        (await p.locator("#verificationPhone").textContent()) ===
          "Not provided",
        "missing phone honest",
      );
      await shot(p, "missing-details");
      await axe(p, "missing details");
      await c.close();
    }
    for (const defect of ["flag", "reviewer", "role"]) {
      const { p, c } = await open({
        prepare: (t, u) => {
          const r = t.verification_requests.find((v) => v.user_id === u.id);
          if (defect === "flag") u.identity_verified = false;
          if (defect === "reviewer") u.identity_verified_by = ids.provider;
          if (defect === "role") r.role = "provider";
        },
      });
      ok(
        await p.locator("#continueVerificationBtn").isHidden(),
        "inconsistent " + defect + " never grants approval",
      );
      ok(
        (await p
          .locator(".verification-progress [data-complete=true]")
          .count()) === 0,
        "inconsistent " + defect + " no approval ticks",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        role: "provider",
        state: "rejected",
        width: 320,
        height: 800,
        note:
          "Synthetic feedback only.\n" +
          "Please use a clearer sample. ".repeat(100) +
          "<img src=x onerror=alert(1)>",
        prepare: (t, u) =>
          (u.email = "very.long." + "synthetic.".repeat(18) + "@igotu.test"),
      });
      ok(
        (await p.locator("#verificationAdminNote img").count()) === 0,
        "note safely rendered as text",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long note/email wrap",
      );
      await shot(p, "provider-long-note-320");
      await axe(p, "long note phone");
      await c.close();
    }
    {
      const { p, c, gate } = await open();
      gate.failRefresh = true;
      await p.locator("#refreshVerificationBtn").click();
      await msg(p, "could not be checked");
      ok(
        (await p.locator("#verificationStatusBadge").textContent()) ===
          "✓ Verified",
        "last known badge retained",
      );
      ok(
        await p.locator("#verificationStaleNotice").isVisible(),
        "stale status explicit",
      );
      ok(
        await p.locator("#continueVerificationBtn").isHidden(),
        "stale approval cannot navigate",
      );
      await shot(p, "approved-refresh-error");
      await axe(p, "stale approved");
      gate.failRefresh = false;
      await p.locator("#refreshVerificationBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.statusFresh === "true",
      );
      ok(
        await p.locator("#continueVerificationBtn").isVisible(),
        "fresh approval restores allowed route",
      );
      await c.close();
    }
    {
      const { p, c } = await open({
        state: "not_submitted",
        failRefresh: true,
      });
      ok(
        (await p.locator("#verificationStatusTitle").textContent()) ===
          "Unable to Confirm Identity Status",
        "initial status error clear",
      );
      ok(
        await p.locator("#submitVerificationBtn").isDisabled(),
        "initial error prevents submit",
      );
      await shot(p, "initial-status-error");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "not_submitted" });
      await fill(p);
      let release;
      const hold = new Promise((r) => (release = r));
      gate.hold = (o) => (isStatusQuery(o) ? hold : undefined);
      await p.locator("#refreshVerificationBtn").click();
      await wait(() => s.calls.filter(isStatusQuery).length === 2);
      await p.locator("#refreshVerificationBtn").evaluate((e) => {
        for (let i = 0; i < 3; i++)
          e.dispatchEvent(new Event("click", { bubbles: true }));
      });
      ok(
        s.calls.filter(isStatusQuery).length === 2,
        "overlapping refreshes coalesced",
      );
      await shot(p, "refresh-loading");
      release();
      await p.waitForFunction(
        () => document.body.dataset.statusFresh === "true",
      );
      ok(
        (await p.locator("#legalName").inputValue()) ===
          "Synthetic Verification Applicant",
        "refresh preserves typed legal name",
      );
      ok(
        (await p
          .locator("#identityDocument")
          .evaluate((e) => e.files.length)) === 1,
        "refresh preserves selected file",
      );
      ok(
        await p.locator("#privacyConsent").isChecked(),
        "refresh preserves consent",
      );
      await c.close();
    }
    for (const role of ["client", "provider"]) {
      const { p, c, s } = await open({
        role,
        state: "not_submitted",
        width: role === "provider" ? 390 : 1536,
        height: role === "provider" ? 844 : 864,
      });
      await p.locator("#identityDocument").setInputFiles(await png(p));
      ok(
        await p.locator("#identityDocumentPreviewImage").isVisible(),
        "image preview " + role,
      );
      ok(
        (await p.locator("#identityDocumentSelectedName").textContent()) ===
          "offline-sample.png",
        "selected filename",
      );
      ok(
        (
          await p.locator("#identityDocumentSelectedSize").textContent()
        ).includes("KB"),
        "selected size",
      );
      await shot(p, `${role}-upload-preview`);
      await axe(p, "upload preview " + role);
      await p.locator("#identityDocumentRemoveBtn").click();
      ok(
        (await p
          .locator("#identityDocument")
          .evaluate((e) => e.files.length)) === 0,
        "Remove clears file",
      );
      ok(
        await p
          .locator("#identityDocument")
          .evaluate((e) => e === document.activeElement),
        "Remove retains useful keyboard focus",
      );
      await p.locator("#identityDocument").setInputFiles({
        name: "invalid.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg/>"),
      });
      ok(
        (await p
          .locator("#identityDocument")
          .evaluate((e) => e.files.length)) === 0,
        "unsupported file rejected",
      );
      await p.locator("#identityDocument").setInputFiles({
        name: "oversize.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(5242881),
      });
      ok(
        (await p
          .locator("#identityDocument")
          .evaluate((e) => e.files.length)) === 0,
        "5 MiB limit unchanged",
      );
      ok(!uploads(s).length, "invalid/preview files never upload");
      await fill(p, role === "provider");
      if (role === "provider") {
        await p.locator("#supportingDocument").setInputFiles(await png(p));
        await shot(p, "provider-optional-information");
      }
      await p.locator("#submitVerificationBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      const payload = inserts(s)[0].calls.find((x) => x[0] === "insert")[1];
      ok(
        payload.user_id === ids[role] && payload.role === role,
        "captured owner/role",
      );
      ok(
        !JSON.stringify(payload).includes("OFFLINEONLY") &&
          payload.id_number_last4 === "ONLY",
        "only last four ID characters retained",
      );
      ok(
        payload.age_confirmed === true && payload.privacy_consent === true,
        "actual consent payload",
      );
      ok(
        (await p.locator("#idNumber").inputValue()) === "",
        "ID cleared only after acknowledgement",
      );
      ok(
        uploads(s).length === (role === "provider" ? 2 : 1),
        "only actual selected files upload",
      );
      ok(
        uploads(s).every(
          (o) =>
            o.bucket === "verification-documents" &&
            o.name.startsWith(ids[role] + "/") &&
            o.options.upsert === false,
        ),
        "original private upload contract",
      );
      if (role === "provider")
        ok(
          payload.business_name === "Synthetic Service Studio" &&
            payload.ssm_number === "SYNTHETIC-REG" &&
            payload.professional_license === "Synthetic certificate",
          "optional provider payload preserved",
        );
      await p
        .locator("#verificationForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      ok(inserts(s).length === 1, "pending blocks duplicate submission");
      await shot(p, `${role}-confirmed-pending`);
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "rejected" });
      await fill(p);
      gate.uploadFailure = true;
      await p.locator("#submitVerificationBtn").click();
      await msg(p, "Unable to submit");
      ok(!inserts(s).length, "upload failure prevents insert");
      ok(
        (await p.locator("#legalName").inputValue()) ===
          "Synthetic Verification Applicant",
        "upload failure retains form",
      );
      ok(
        (await p
          .locator("#identityDocument")
          .evaluate((e) => e.files.length)) === 1,
        "upload failure retains file",
      );
      await shot(p, "upload-failure");
      gate.uploadFailure = false;
      await p.locator("#submitVerificationBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      ok(inserts(s).length === 1, "resubmission follows existing insert");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "not_submitted" });
      await fill(p);
      gate.insertFailure = true;
      await p.locator("#submitVerificationBtn").click();
      await msg(p, "Unable to submit");
      ok(
        removals(s).length === 1,
        "definite rejected insert cleans temporary file",
      );
      ok(
        (await p.locator("#idNumber").inputValue()) === "OFFLINEONLY",
        "definite failure retains entered ID safely",
      );
      await shot(p, "submission-failure");
      gate.insertFailure = false;
      await p.locator("#submitVerificationBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      ok(inserts(s).length === 2, "explicit retry after definite failure");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "not_submitted" });
      await fill(p);
      gate.uncertain = true;
      await p.locator("#submitVerificationBtn").click();
      await msg(p, "could not be confirmed");
      ok(
        removals(s).length === 0,
        "lost insert response never deletes potentially referenced document",
      );
      ok(
        await p.locator("#submitVerificationBtn").isDisabled(),
        "uncertain result locks immediate resubmission",
      );
      await shot(p, "submission-uncertain");
      await p
        .locator("#verificationForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      ok(inserts(s).length === 1, "uncertain state cannot duplicate insert");
      await p.locator("#refreshVerificationBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      ok(inserts(s).length === 1, "refresh checks status without reinserting");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "not_submitted" });
      await fill(p);
      let release;
      const hold = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "storage" && o.action === "upload" ? hold : undefined;
      await p.locator("#submitVerificationBtn").click();
      await wait(() => uploads(s).length === 1);
      ok(
        await p.locator("#refreshVerificationBtn").isDisabled(),
        "upload blocks overlapping refresh",
      );
      await shot(p, "uploading");
      await p
        .locator("#verificationForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      ok(uploads(s).length === 1, "in-flight duplicate upload prevented");
      release();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ state: "not_submitted" });
      await fill(p);
      let release;
      const hold = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "query" &&
        o.table === "verification_requests" &&
        o.calls.some((x) => x[0] === "insert")
          ? hold
          : undefined;
      await p.locator("#submitVerificationBtn").click();
      await wait(() => inserts(s).length === 1);
      ok(
        await p.locator("#legalName").isDisabled(),
        "submitting freezes captured form values",
      );
      await shot(p, "submitting");
      release();
      await p.waitForFunction(
        () => document.body.dataset.verificationState === "pending",
      );
      await c.close();
    }
    {
      const { p, c } = await open({ state: "not_submitted", motion: true });
      ok(
        (await p
          .locator(".verification-hero-art")
          .evaluate((e) => getComputedStyle(e).animationIterationCount)) ===
          "1",
        "finite illustration animation",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".verification-hero-art")
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion",
      );
      await p.locator("#verificationLogoutBtn").click();
      await wait(() => new URL(p.url()).pathname === "/login.html");
      ok(true, "verification logout follows shared guard");
      await c.close();
    }
    for (const opt of [
      { role: "client", accountRole: "provider" },
      { role: "provider", accountRole: "client" },
      { role: "client", noSession: true },
    ]) {
      const { p, c, s } = await open({ ...opt, noWait: true });
      await wait(() => new URL(p.url()).pathname === "/login.html");
      ok(
        !uploads(s).length && !inserts(s).length,
        "unauthorized/no-session no mutations",
      );
      await c.close();
    }
    // Admin uses the same CSS file. Compare browser pixels in memory only; no Admin data screenshots are retained.
    let adminProof;
    {
      let beforeHash, afterHash;
      for (const before of [true, false]) {
        const c = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        });
        const adminTables = seed();
        adminTables.verification_requests[0].status = "pending";
        await install(c, { tables: adminTables, role: "admin" });
        if (before)
          await c.route("**/css/verification-access.css", (r) =>
            r.fulfill({
              contentType: "text/css",
              body: execFileSync("git", [
                "show",
                reviewed + ":igotu_v2/css/verification-access.css",
              ]),
            }),
          );
        const p = await c.newPage();
        await p.goto(base + "/admin/verifications.html");
        await p.locator(".approve-verification-btn").first().waitFor();
        const h = createHash("sha256")
          .update(await p.screenshot({ fullPage: true }))
          .digest("hex");
        if (before) beforeHash = h;
        else afterHash = h;
        await c.close();
      }
      ok(beforeHash === afterHash, "Admin queue pixels unchanged");
      adminProof = {
        beforeSha256: beforeHash,
        afterSha256: afterHash,
        pixelIdentical: true,
        imagesRetained: false,
      };
    }
    ok(!errors.length, "no page errors " + errors.join(","));
    ok(!external.length, "external traffic blocked and unused");
    fs.writeFileSync(
      out + "/responsive-metrics.json",
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      out + "/validation/admin-style-proof.json",
      JSON.stringify(adminProof, null, 2) + "\n",
    );
    fs.writeFileSync(
      out + "/validation/focused.json",
      JSON.stringify(
        {
          assertions: checks,
          axeScans: scans,
          axeViolations: 0,
          liveBackend: false,
          sqlExecuted: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} verification UI assertions; ${scans} axe scans; Client and Provider; synthetic/offline only`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
