/* Real Chromium with synthetic scoped fixtures; never a live RLS/backend test. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4215",
  out = "docs/provider-assignments",
  reviewed = "e4157b3dbac68dd75de1d54a76e28674fc2f1fa3";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
for (const d of ["screenshots", "before", "validation"])
  fs.mkdirSync(`${out}/${d}`, { recursive: true });
let checks = 0,
  scans = 0;
const metrics = [],
  errors = [],
  external = [];
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
const rpc = (s, name) =>
  s.calls.filter((o) => o.kind === "rpc" && o.name === name);
const inserts = (s) =>
  s.calls.filter(
    (o) =>
      o.kind === "query" &&
      o.table === "service_reviews" &&
      o.calls.some((c) => c[0] === "insert"),
  );
function tables() {
  const t = seed();
  t.users.find((u) => u.id === ids.provider).full_name = "Synthetic Provider A";
  t.users.find((u) => u.id === ids.client).full_name = "Synthetic Client A";
  const sample = t.service_requests[0];
  t.service_requests = [
    [
      "R1",
      "confirmed",
      "Aircon Service",
      "Repair",
      "2026-11-12",
      "14:00",
      "2026-11-03T10:00:00Z",
    ],
    [
      "R2",
      "in_progress",
      "Home Cleaning",
      "Cleaning",
      "2026-11-10",
      "09:00",
      "2026-11-02T10:00:00Z",
    ],
    [
      "R3",
      "confirmed",
      "Plumbing Repair",
      "Repair",
      "2026-11-11",
      "10:00",
      "2026-11-01T10:00:00Z",
    ],
    [
      "R4",
      "in_progress",
      "General Repair",
      "Repair",
      "2026-02-30",
      null,
      "invalid",
    ],
    [
      "R5",
      "completed",
      "Electrical Service",
      "Repair",
      "2026-11-08",
      "15:00",
      "2026-10-29T10:00:00Z",
    ],
    ["R6", "completed", "Home Cleaning", "Cleaning", null, "99:99", null],
  ].map(
    ([
      request_id,
      status,
      title,
      category,
      preferred_date,
      preferred_time,
      created_at,
    ]) => ({
      ...sample,
      request_id,
      status,
      title,
      service_type: title,
      category,
      preferred_date,
      preferred_time,
      created_at,
      location: "Synthetic service location, Likas, Sabah",
      description:
        "Synthetic authorised service description. Check the equipment and explain the work to the Client.",
      selected_provider_id: ids.provider,
      client_id: ids.client,
    }),
  );
  for (const [request_id, status, provider] of [
    ["PENDING", "provider_selected", ids.provider],
    ["CANCELLED", "cancelled", ids.provider],
    ["FOREIGN", "confirmed", ids.client],
  ])
    t.service_requests.push({
      ...sample,
      request_id,
      status,
      selected_provider_id: provider,
      title: "PRIVATE UNAUTHORISED " + request_id,
      location: "FORBIDDEN EXACT LOCATION",
      client_lat: 44.44444,
      client_lng: 55.55555,
    });
  t.payment_records = [
    {
      payment_id: "PAY-R5",
      request_id: "R5",
      client_id: ids.client,
      provider_id: ids.provider,
      amount: 120,
      payment_method: "Bank Transfer",
      reference_number: "SYNTHETIC-REF",
      created_at: "2026-11-02T02:00:00Z",
      proof_path: ids.client + "/private-synthetic.pdf",
      proof_url: "https://private.invalid/permanent-proof",
    },
    {
      payment_id: "PAY-R6",
      request_id: "R6",
      client_id: ids.client,
      provider_id: ids.provider,
      amount: 90,
      payment_method: "Cash",
      created_at: "2026-11-01T02:00:00Z",
    },
  ];
  t.service_reviews = [
    {
      request_id: "R6",
      reviewer_id: ids.provider,
      reviewee_id: ids.client,
      rating: 5,
      feedback: "Synthetic submitted Client review.",
    },
  ];
  return t;
}
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dcead7"/><path d="M0 110H256M85 0V256M0 210 256 20" stroke="#fff" stroke-width="12"/><path d="M0 110H256M85 0V256M0 210 256 20" stroke="#d3d9cf" stroke-width="2"/><text x="12" y="28" font-size="12" fill="#486248">Synthetic offline map tile</text></svg>';
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: opt.width || 1536, height: opt.height || 864 },
        reducedMotion: "reduce",
      }),
      t = tables();
    opt.prepare?.(t);
    const gate = {
      readFail: !!opt.initialError,
      participantFail: !!opt.participantError,
      paymentFail: !!opt.paymentError,
      reviewFail: !!opt.reviewError,
      receiptFail: false,
      startMode: null,
      reviewMode: null,
      statusFail: false,
      hold: null,
      tileFail: !!opt.tileFail,
    };
    const s = await install(c, {
      role: opt.role || "provider",
      tables: t,
      delay: (o) => gate.hold?.(o),
      fail: (o, st) => {
        if (o.kind === "rpc") {
          if (o.name === "provider_service_requests")
            return o.args.p_request_id ? gate.statusFail : gate.readFail;
          if (o.name === "service_participants") return gate.participantFail;
          if (o.name === "payment_proof_reference") return gate.receiptFail;
          if (o.name === "provider_start_request" && gate.startMode) {
            if (gate.startMode === "reject")
              return {
                code: "P0001",
                message: "RAW PRIVATE SQL ERROR /server/private",
              };
            if (gate.startMode === "lost-success")
              st.tables.service_requests.find(
                (r) => r.request_id === o.args.p_request_id,
              ).status = "in_progress";
            return "throw";
          }
        }
        if (o.kind === "query") {
          if (o.table === "payment_records") return gate.paymentFail;
          if (o.table === "service_reviews") {
            const mutation = o.calls.find((c) => c[0] === "insert");
            if (mutation && gate.reviewMode) {
              if (gate.reviewMode === "reject")
                return { code: "P0001", message: "RAW PRIVATE SQL ERROR" };
              if (gate.reviewMode === "lost-success")
                st.tables.service_reviews.push(mutation[1]);
              return "throw";
            }
            return gate.reviewFail;
          }
        }
        return false;
      },
    });
    await c.addInitScript(() => {
      window.mapAudit = [];
      let leaflet;
      Object.defineProperty(window, "L", {
        configurable: true,
        get: () => leaflet,
        set: (value) => {
          leaflet = value;
          if (!value?.map) return;
          const create = value.map;
          value.map = function (...args) {
            const map = create.apply(this, args),
              entry = { removed: false };
            window.mapAudit.push(entry);
            const view = map.setView;
            map.setView = function (coords, ...rest) {
              entry.coords = coords;
              return view.call(this, coords, ...rest);
            };
            const remove = map.remove;
            map.remove = function () {
              entry.removed = true;
              return remove.call(this);
            };
            return map;
          };
        },
      });
    });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.hostname.endsWith("tile.openstreetmap.org"))
        return gate.tileFail
          ? r.abort()
          : r.fulfill({ contentType: "image/svg+xml", body: tile });
      if (u.hostname === "unpkg.com" && u.pathname.includes("/images/"))
        return r.fulfill({
          contentType: "image/png",
          body: fs.readFileSync(
            path.join(
              path.dirname(require.resolve("leaflet/dist/leaflet.js")),
              "images",
              path.basename(u.pathname),
            ),
          ),
        });
      if (u.origin !== new URL(base).origin) {
        if (
          u.hostname === "unpkg.com" &&
          u.pathname.includes("leaflet@1.9.4/dist/leaflet")
        ) {
          if (opt.noLeaflet && u.pathname.endsWith(".js"))
            return r.fulfill({ contentType: "text/javascript", body: "" });
          return r.fallback();
        }
        external.push(u.origin);
        return r.abort();
      }
      if (
        opt.before &&
        [
          "/provider/assignment-details.html",
          "/js/provider-assignment-details.js",
        ].includes(u.pathname)
      )
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : "text/html",
          body: execFileSync(
            "git",
            ["show", `${reviewed}:igotu_v2${u.pathname}`],
            { encoding: "utf8" },
          ),
        });
      if (u.pathname === "/js/supabaseClient.js" && !opt.before) {
        return r.fulfill({
          contentType: "text/javascript",
          body:
            fs.readFileSync("tests/system-fixture.js", "utf8") +
            `\nwindow.assignmentRetryFlags=[];const rpcBase=supabase.rpc;supabase.rpc=(name,args)=>name!=='provider_start_request'?rpcBase(name,args):{retry(value){window.assignmentRetryFlags.push(value);return this},then(a,b){return rpcBase(name,args).then(a,b)}};const fromBase=supabase.from;supabase.from=table=>{const q=fromBase(table);const proxy=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>q.then(a,b);if(key==='retry')return value=>{window.assignmentRetryFlags.push(value);return proxy};return(...args)=>{q[key](...args);return proxy}}});return proxy};`,
        });
      }
      return r.fallback();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(12000);
    await p.goto(base + "/provider/assignment-details.html" + (opt.url || ""), {
      waitUntil: "commit",
    });
    if (!opt.noWait && !opt.before) await settle(p);
    if (opt.before) await p.locator(".assignment-card").first().waitFor();
    return { p, c, s, gate };
  }
  async function settle(p) {
    await p.waitForFunction(() =>
      ["ready", "empty", "error"].includes(
        document.body.dataset.assignmentsState,
      ),
    );
  }
  async function idle(p) {
    await p.waitForFunction(
      () =>
        document.body.dataset.assignmentOperation === "idle" &&
        ["ready", "empty", "error"].includes(
          document.body.dataset.assignmentsState,
        ),
    );
  }
  async function select(p, id) {
    await p.locator('.assignment-card[data-request-id="' + id + '"]').click();
  }
  async function shot(p, name, before = false) {
    await p.evaluate(() => {
      window.scrollTo(0, 0);
      const a = document.createElement("aside");
      a.id = "offlineLabel";
      a.textContent =
        "OFFLINE REVIEW · SYNTHETIC PROVIDER / CLIENT / REQUESTS / MAP TILES · NO LIVE SUPABASE";
      a.style =
        "position:relative;background:#fff4cd;color:#453b15;padding:5px 10px;text-align:center;font:700 10px/1.5 Arial;z-index:99999";
      document.body.prepend(a);
    });
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineLabel").evaluate((e) => e.remove());
  }
  async function axe(p, name) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const v = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    ok(!v.length, "axe " + name + JSON.stringify(v));
    scans++;
  }
  async function start(p) {
    await p.locator(".start-btn").click();
    await p.locator("#confirmStartService").click();
  }
  async function fillReview(p) {
    await p.locator('.star-btn[data-value="4"]').click();
    await p
      .locator(".provider-review-form textarea")
      .fill("Synthetic Client feedback retained on errors.");
  }
  try {
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
      const { p, c, s } = await open({ width, height });
      ok(
        (await p.locator(".assignment-card").count()) === 6,
        "authorised statuses only",
      );
      for (const id of [
        "confirmedAssignments",
        "progressAssignments",
        "completedAssignments",
      ])
        ok(
          (await p.locator("#" + id).textContent()) === "2",
          "correct summary " + id,
        );
      ok(
        (await p
          .locator(".side-menu a[aria-current=page]")
          .getAttribute("href")) === "assignment-details.html",
        "active Assignments",
      );
      ok(
        (await p.locator(".side-menu a").count()) === 4,
        "four original routes",
      );
      const html = await p.locator("body").innerHTML();
      ok(
        !html.includes("PRIVATE UNAUTHORISED") &&
          !html.includes("FORBIDDEN EXACT LOCATION") &&
          !html.includes("44.44444"),
        "no foreign/pending/cancelled location leakage",
      );
      ok(rpc(s, "provider_service_requests").length === 1, "one assigned read");
      ok(
        JSON.stringify(
          rpc(s, "provider_service_requests")[0].args.p_statuses,
        ) === '["confirmed","in_progress","completed"]',
        "original scope",
      );
      ok(
        rpc(s, "service_participants")[0].args.p_request_ids.length === 6,
        "bounded authorised participants",
      );
      ok(
        !s.calls.some(
          (o) =>
            o.kind === "query" &&
            o.table === "users" &&
            !o.calls.some(
              (c) => c[0] === "eq" && c[1] === "id" && c[2] === ids.provider,
            ),
        ),
        "no broad users query",
      );
      const m = await p.evaluate(() => {
        const b = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          list: b(".pa-list-panel"),
          search: b("#assignmentSearch"),
          refresh: b("#refreshAssignmentsBtn"),
          card: b(".assignment-card"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no list overflow " + width);
      ok(m.refresh.height >= 44 && m.card.height >= 44, "touch targets");
      await axe(p, "list " + width);
      await shot(p, "list-" + width);
      await select(p, "R1");
      ok(
        await p.locator("#selectedAssignmentTitle").isVisible(),
        "selected details",
      );
      ok(
        (
          await p.locator(".pa-progress [aria-current=step]").textContent()
        ).includes("Confirmed"),
        "confirmed progress",
      );
      ok(
        !(await p.locator("#completeRequestBtn,.complete-btn").count()),
        "Client-only completion",
      );
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Synthetic Client A",
        ),
        "scoped Client details",
      );
      if (width <= 390) await p.locator("#assignmentLocation summary").click();
      await p.waitForFunction(() => window.mapAudit.some((m) => !m.removed));
      ok(
        (await p.evaluate(
          () => window.mapAudit.filter((m) => !m.removed).length,
        )) === 1,
        "only selected map alive",
      );
      await p.waitForFunction(() =>
        document
          .querySelector("#assignmentMapStatus")
          .textContent.includes("shown"),
      );
      await shot(p, "details-" + width);
      await axe(p, "details " + width);
      await p.locator(".start-btn").click();
      ok(!rpc(s, "provider_start_request").length, "start needs modal");
      ok(
        (await p.locator("#startServiceSubject").textContent()).includes(
          "R1 — Aircon Service",
        ),
        "correct start subject",
      );
      await shot(p, "start-dialog-" + width);
      if (width <= 390) await axe(p, "modal " + width);
      await p.keyboard.press("Escape");
      await idle(p);
      ok(!rpc(s, "provider_start_request").length, "cancel no mutation");
      ok(
        await p
          .locator(".start-btn")
          .evaluate((e) => e === document.activeElement),
        "start cancel focus",
      );
      if (width <= 390) {
        await p.locator("#backToAssignments").click();
        ok(
          await p.locator("#assignmentSearch").isVisible(),
          "mobile list back",
        );
        ok(
          await p
            .locator(".assignment-card[aria-pressed=true]")
            .evaluate((e) => e === document.activeElement),
          "mobile back focus",
        );
      }
      await c.close();
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, "assignments-" + width, true);
      await c.close();
    }
    {
      const { p, c, s } = await open();
      await select(p, "R3");
      for (const [q, n] of [
        ["R2", 1],
        ["Aircon", 1],
        ["Cleaning", 2],
        ["not found", 0],
      ]) {
        await p.locator("#assignmentSearch").fill(q);
        ok(
          (await p.locator(".assignment-card").count()) === n,
          "local search " + q,
        );
        ok(
          (await p.locator("#selectedAssignmentTitle").textContent()) ===
            "Plumbing Repair",
          "search preserves selected details",
        );
        await shot(p, n ? "search" : "search-empty");
      }
      await p.locator("#clearAssignmentSearch").click();
      for (const [filter, n] of [
        ["confirmed", 2],
        ["in_progress", 2],
        ["completed", 2],
        ["all", 6],
      ]) {
        await p.locator("#assignmentFilter").selectOption(filter);
        ok(
          (await p.locator(".assignment-card").count()) === n,
          "filter " + filter,
        );
      }
      for (const [sort, id] of [
        ["oldest", "R5"],
        ["recent", "R1"],
        ["earliest", "R5"],
        ["latest", "R1"],
      ]) {
        await p.locator("#assignmentSort").selectOption(sort);
        ok(
          (await p
            .locator(".assignment-card")
            .first()
            .getAttribute("data-request-id")) === id,
          "sort " + sort,
        );
      }
      await p.locator("#assignmentFilter").selectOption("completed");
      await p.locator("#assignmentSearch").fill("Electrical");
      await p.locator("#refreshAssignmentsBtn").click();
      await settle(p);
      ok(
        (await p.locator("#assignmentSearch").inputValue()) === "Electrical" &&
          (await p.locator("#assignmentFilter").inputValue()) === "completed" &&
          (await p.locator("#assignmentSort").inputValue()) === "latest",
        "refresh filter prefs",
      );
      ok(
        (await p.locator("#selectedAssignmentTitle").textContent()) ===
          "Plumbing Repair",
        "refresh preserves selection outside filters",
      );
      ok(
        rpc(s, "provider_service_requests").length === 2,
        "only refresh fetches",
      );
      await shot(p, "filter-results");
      await c.close();
    }
    {
      const { p, c, s } = await open();
      await select(p, "R2");
      ok(!(await p.locator(".start-btn").count()), "no start in progress");
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Client will mark it as completed",
        ),
        "Client completes",
      );
      await shot(p, "in-progress");
      await select(p, "R5");
      await p.locator(".receipt-open-btn").waitFor();
      ok(
        (await p.locator("#assignmentPayment").textContent()).includes(
          "RM 120.00",
        ) &&
          (await p.locator("#assignmentPayment").textContent()).includes(
            "SYNTHETIC-REF",
          ),
        "payment fields",
      );
      ok(
        (await p.locator("body").innerHTML()).includes(
          "private-synthetic.pdf",
        ) === false,
        "no private proof path in HTML",
      );
      ok(
        !(await p.locator("body").innerHTML()).includes("permanent-proof"),
        "no public proof fallback",
      );
      ok(
        rpc(s, "payment_proof_reference").every(
          (o) => o.args.p_request_id === "R5",
        ),
        "sign selected receipt only",
      );
      ok(
        s.calls
          .filter((o) => o.kind === "storage")
          .every((o) => o.expires === 300),
        "five-minute signing",
      );
      await shot(p, "completed-payment-review");
      await axe(p, "review form");
      await select(p, "R6");
      ok(
        (await p.locator("#assignmentReview").textContent()).includes(
          "Review Submitted",
        ),
        "existing review",
      );
      ok(
        !(await p.locator(".provider-review-form").count()),
        "no duplicate form",
      );
      await shot(p, "existing-review");
      ok(
        (await p.evaluate(
          () => window.mapAudit.filter((m) => !m.removed).length,
        )) <= 1,
        "map cleanup switching",
      );
      await c.close();
    }
    for (const mode of ["success", "reject", "lost", "lost-success"]) {
      const { p, c, s, gate } = await open();
      gate.startMode = mode === "success" ? null : mode;
      await start(p);
      if (mode === "lost") {
        await p.waitForFunction(
          () => document.body.dataset.assignmentOperation === "unresolved",
        );
        ok(
          await p.locator(".start-btn").isDisabled(),
          "uncertain start disabled",
        );
        ok(
          (await p.locator("#messageBox").textContent()).includes(
            "Outcome not yet confirmed",
          ),
          "honest uncertainty",
        );
        await shot(p, "start-uncertain");
        gate.statusFail = true;
        await p.locator("#checkAssignmentOutcome").click();
        await p.waitForFunction(
          () => document.body.dataset.assignmentOperation === "unresolved",
        );
        ok(
          (await p.locator("#messageBox").textContent()).includes(
            "could not be checked",
          ),
          "status read failure",
        );
        gate.statusFail = false;
        s.tables.service_requests[0].status = "in_progress";
        await p.locator("#checkAssignmentOutcome").click();
        await idle(p);
      } else await idle(p);
      ok(
        rpc(s, "provider_start_request").length === 1,
        "start exactly once " + mode,
      );
      ok(
        (await p.evaluate(() => window.assignmentRetryFlags)).every(
          (v) => v === false,
        ),
        "no SDK mutation retry",
      );
      if (mode === "reject") {
        ok(
          (await p.locator("#messageBox").textContent()).includes("failed"),
          "known start failure",
        );
        ok(
          !(await p.locator("body").textContent()).includes("RAW PRIVATE SQL"),
          "no raw error",
        );
      } else
        ok(
          (
            await p.locator(".pa-progress [aria-current=step]").textContent()
          ).includes("In Progress"),
          "progress updated from acknowledgement/read",
        );
      await shot(p, "start-" + mode);
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" && o.name === "provider_start_request"
          ? held
          : undefined;
      await start(p);
      await p.waitForFunction(
        () => document.body.dataset.assignmentOperation === "submitting",
      );
      await p.locator(".start-btn").evaluate((b) => {
        for (let i = 0; i < 3; i++) b.dispatchEvent(new Event("click"));
      });
      ok(rpc(s, "provider_start_request").length === 1, "duplicate start lock");
      ok(
        await p.locator(".assignment-card").first().isDisabled(),
        "selection locked",
      );
      await shot(p, "start-loading");
      release();
      await idle(p);
      await c.close();
    }
    for (const mode of ["success", "reject", "lost", "lost-success"]) {
      const { p, c, s, gate } = await open();
      await select(p, "R5");
      await p.locator(".provider-review-form button[type=submit]").click();
      ok(
        (await p.locator("#providerReviewError").textContent()).includes(
          "star rating",
        ),
        "rating validation",
      );
      await p.locator('.star-btn[data-value="4"]').click();
      await p.locator(".provider-review-form button[type=submit]").click();
      ok(
        (await p.locator("#providerReviewError").textContent()).includes(
          "feedback",
        ),
        "feedback validation",
      );
      await fillReview(p);
      gate.reviewMode = mode === "success" ? null : mode;
      await p.locator(".provider-review-form button[type=submit]").click();
      if (mode === "lost") {
        await p.waitForFunction(
          () => document.body.dataset.assignmentOperation === "unresolved",
        );
        ok(
          await p
            .locator(".provider-review-form button[type=submit]")
            .isDisabled(),
          "uncertain review cannot duplicate",
        );
        ok(
          (
            await p.locator(".provider-review-form textarea").inputValue()
          ).includes("retained"),
          "draft preserved uncertain",
        );
        gate.reviewFail = true;
        await p.locator("#checkAssignmentOutcome").click();
        await p.waitForFunction(
          () => document.body.dataset.assignmentOperation === "unresolved",
        );
        await shot(p, "review-uncertain");
        gate.reviewFail = false;
        s.tables.service_reviews.push(
          inserts(s)[0].calls.find((c) => c[0] === "insert")[1],
        );
        await p.locator("#checkAssignmentOutcome").click();
        await idle(p);
      } else await idle(p);
      ok(inserts(s).length === 1, "one review insert " + mode);
      const payload = inserts(s)[0].calls.find((c) => c[0] === "insert")[1];
      ok(
        payload.request_id === "R5" &&
          payload.reviewer_id === ids.provider &&
          payload.reviewee_id === ids.client &&
          payload.rating === 4,
        "original review association",
      );
      if (mode === "reject") {
        ok(
          (
            await p.locator(".provider-review-form textarea").inputValue()
          ).includes("retained"),
          "recoverable error retains draft",
        );
        await select(p, "R6");
        ok(
          (await p.locator("#assignmentReview").textContent()).includes(
            "Review Submitted",
          ),
          "review recovery preserves other existing reviews",
        );
        ok(
          !(await p.locator(".provider-review-form").count()),
          "existing review cannot duplicate after recovery",
        );
        await select(p, "R5");
        ok(
          (await p.locator("#providerReviewError").textContent()).includes(
            "failed",
          ),
          "review failure explicit",
        );
      } else {
        ok(
          (await p.locator("#assignmentReview").textContent()).includes(
            "Review Submitted",
          ),
          "review acknowledgement/read",
        );
        ok(
          !(await p.locator(".provider-review-form").count()),
          "submitted review not duplicated",
        );
      }
      await shot(p, "review-" + mode);
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      await select(p, "R5");
      await fillReview(p);
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "query" &&
        o.table === "service_reviews" &&
        o.calls.some((c) => c[0] === "insert")
          ? held
          : undefined;
      await p.locator(".provider-review-form button[type=submit]").click();
      await p.waitForFunction(
        () => document.body.dataset.assignmentOperation === "submitting",
      );
      await p
        .locator(".provider-review-form")
        .evaluate((f) =>
          f.dispatchEvent(new Event("submit", { cancelable: true })),
        );
      ok(inserts(s).length === 1, "duplicate review prevented");
      release();
      await idle(p);
      await c.close();
    }
    for (const opt of [
      { participantError: true },
      { paymentError: true },
      { reviewError: true },
      { noLeaflet: true },
      { tileFail: true },
    ]) {
      const { p, c } = await open(opt);
      if (opt.participantError) {
        ok(
          (await p.locator("#assignmentDetailsBody").textContent()).includes(
            "Client information is currently unavailable.",
          ),
          "participant unavailable not false unverified",
        );
        ok(
          !(await p.locator("body").textContent()).includes(
            "Identity not verified",
          ),
          "no fabricated identity",
        );
        await select(p, "R5");
        ok(
          !(await p.locator(".provider-review-form").count()),
          "missing client no review",
        );
      }
      if (opt.paymentError)
        ok(
          (await p.locator("#assignmentPayment").textContent()).includes(
            "could not be checked",
          ),
          "payment error not empty",
        );
      if (opt.reviewError) {
        await select(p, "R5");
        ok(
          !(await p.locator(".provider-review-form").count()),
          "review read fails closed",
        );
        ok(
          (await p.locator("#assignmentReview").textContent()).includes(
            "Review status unavailable",
          ),
          "review status honest",
        );
      }
      if (opt.noLeaflet || opt.tileFail) {
        await p.waitForFunction(() =>
          /unavailable|could not load/.test(
            document.querySelector("#assignmentMapStatus").textContent,
          ),
        );
        ok(
          (await p.locator("#assignmentLocation").textContent()).includes(
            "Synthetic service location",
          ),
          "map failure keeps location",
        );
      }
      await shot(p, "error-" + Object.keys(opt)[0]);
      await c.close();
    }
    {
      const { p, c, gate } = await open();
      gate.receiptFail = true;
      await select(p, "R5");
      await p
        .getByText(
          "Payment proof could not be checked. Refresh to try again.",
          { exact: true },
        )
        .waitFor();
      ok(
        !(await p.locator(".receipt-open-btn").count()),
        "proof failure no fallback",
      );
      await shot(p, "receipt-error");
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          t.service_requests = t.service_requests.filter(
            (r) => r.request_id === "R1",
          );
          Object.assign(t.service_requests[0], {
            client_lat: 91,
            client_lng: "",
            preferred_date: "2026-02-30",
            preferred_time: "99:99",
            budget: null,
            description:
              "<img src=x onerror=alert(1)> " +
              "Long authorised description. ".repeat(70),
            title: "Long Service ".repeat(14),
          });
        },
        width: 320,
      });
      await select(p, "R1");
      await p.locator("#assignmentLocation summary").click();
      ok(
        !(await p.locator("#assignmentMap").count()),
        "invalid coordinates no map",
      );
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Date unavailable",
        ),
        "invalid date",
      );
      ok(
        (await p.locator("#assignmentDetailsBody").textContent()).includes(
          "Time unavailable",
        ),
        "invalid time",
      );
      ok(
        !(await p.locator("#assignmentDetailsBody img").count()),
        "safe long text",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long content no overflow",
      );
      await p
        .locator("details")
        .filter({ hasText: "Service Description" })
        .first()
        .evaluate((e) => (e.open = true));
      await shot(p, "long-content-320");
      await c.close();
    }
    {
      const { p, c, gate, s } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        o.kind === "rpc" && o.name === "provider_service_requests"
          ? held
          : undefined;
      await p.locator("#refreshAssignmentsBtn").click();
      await p.locator("#refreshAssignmentsBtn").evaluate((b) => {
        for (let i = 0; i < 3; i++) b.dispatchEvent(new Event("click"));
      });
      ok(rpc(s, "provider_service_requests").length === 2, "refresh lock");
      ok(
        await p.locator(".start-btn").isDisabled(),
        "refresh unsafe mutation paused",
      );
      await shot(p, "loading");
      release();
      await settle(p);
      gate.hold = null;
      gate.readFail = true;
      await p.locator("#refreshAssignmentsBtn").click();
      await settle(p);
      ok(
        (await p.locator(".assignment-card").count()) === 6,
        "stale data preserved",
      );
      ok(
        await p.locator(".start-btn").isDisabled(),
        "stale status cannot start",
      );
      await shot(p, "refresh-error");
      gate.readFail = false;
      await p.locator("#refreshAssignmentsBtn").click();
      await settle(p);
      ok(await p.locator(".start-btn").isEnabled(), "refresh recovery");
      await c.close();
    }
    for (const opt of [
      { initialError: true },
      { prepare: (t) => (t.service_requests = []) },
      {
        prepare: (t) =>
          (t.service_requests = t.service_requests.filter(
            (r) => r.status === "completed",
          )),
      },
    ]) {
      const { p, c } = await open(opt);
      if (opt.initialError) {
        ok(
          (await p.locator("#confirmedAssignments").textContent()) === "—",
          "initial error no false zero",
        );
        await shot(p, "initial-error");
      } else if (
        opt.prepare &&
        !(await p.locator(".assignment-card").count())
      ) {
        ok(
          (await p.locator("#completedAssignments").textContent()) === "0",
          "true empty",
        );
        await shot(p, "empty");
        await axe(p, "empty");
      } else {
        await p.locator("#assignmentFilter").selectOption("confirmed");
        ok(
          (await p.locator("#assignmentsList").textContent()).includes(
            "No confirmed assignments",
          ),
          "empty confirmed filter",
        );
        await shot(p, "empty-filter");
      }
      await c.close();
    }
    {
      const { p, c, s } = await open({ url: "?request_id=FOREIGN" });
      ok(
        (await p
          .locator(".assignment-card[aria-pressed=true]")
          .getAttribute("data-request-id")) === "R1",
        "untrusted URL ignored",
      );
      await select(p, "R2");
      ok(
        (await p.locator('a[href="messages.html?request_id=R2"]').count()) ===
          1,
        "verified messaging context",
      );
      ok(
        (await p.locator('a[href="report.html?request_id=R2"]').count()) === 1,
        "report context",
      );
      s.tables.service_requests.find(
        (r) => r.request_id === "R2",
      ).selected_provider_id = null;
      await p.locator("#refreshAssignmentsBtn").click();
      await settle(p);
      ok(
        !(await p.locator(".assignment-card[data-request-id=R2]").count()),
        "removed assignment no longer exposed",
      );
      await c.close();
    }
    {
      const { p, c } = await open();
      await p.locator(".assignment-card").first().focus();
      await p.keyboard.press("Enter");
      await p.locator(".start-btn").click();
      await p.locator("#confirmStartService").focus();
      await p.keyboard.press("Tab");
      ok(
        await p
          .locator("#cancelStartService")
          .evaluate((e) => e === document.activeElement),
        "modal Tab wraps",
      );
      await p.setViewportSize({ width: 390, height: 844 });
      await p.keyboard.press("Escape");
      ok(
        await p.locator(".start-btn").isVisible(),
        "resize keeps subject visible",
      );
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "profile preserved",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notifications preserved",
      );
      await p.keyboard.press("Escape");
      await c.close();
    }
    for (const role of ["client", "admin"]) {
      const { p, c, s } = await open({ role, noWait: true });
      const deadline = Date.now() + 12000;
      while (new URL(p.url()).pathname !== "/login.html") {
        if (Date.now() > deadline) throw Error("Role redirect timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      ok(
        !rpc(s, "provider_service_requests").length,
        "role gate before assignment read",
      );
      await c.close();
    }
    ok(!errors.length, "browser errors " + errors.join(","));
    ok(!external.length, "unexpected external traffic " + external.join(","));
    fs.writeFileSync(
      `${out}/responsive-metrics.json`,
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      `${out}/validation/focused.json`,
      JSON.stringify(
        {
          assertions: checks,
          axeScans: scans,
          axeViolations: 0,
          liveBackend: false,
          syntheticTiles: true,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} Provider Assignments assertions; ${scans} axe scans; synthetic offline requests and tiles only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
