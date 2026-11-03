/* Provider Messages: actual Chromium with scoped synthetic transport, no live backend. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4216",
  out = "docs/provider-messages",
  reviewed = "207e71577c27ec62e796fd734c251bf3ea30e64d";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
for (const d of ["screenshots", "before", "validation"])
  fs.mkdirSync(`${out}/${d}`, { recursive: true });
let checks = 0,
  scans = 0;
const errors = [],
  external = [],
  metrics = [];
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
const extra = [
  "00000000-0000-4000-8000-000000000022",
  "00000000-0000-4000-8000-000000000023",
];
const message = (
  id,
  request_id,
  sender_id,
  receiver_id,
  message_text,
  created_at,
  is_read = false,
) => ({
  id,
  message_id: "MSG-" + id,
  request_id,
  sender_id,
  receiver_id,
  message_text,
  created_at,
  is_read,
});
function data() {
  const t = seed(),
    sample = t.service_requests[1];
  t.users.find((u) => u.id === ids.provider).full_name = "Synthetic Provider A";
  t.users.find((u) => u.id === ids.client).full_name = "Synthetic Client Alice";
  for (const [id, name] of extra.map((id, i) => [
    id,
    i ? "Synthetic Client Carla" : "Synthetic Client Ben",
  ]))
    t.users.push({
      ...t.users[0],
      id,
      full_name: name,
      user_code: "SYNTHETIC-" + id.slice(-2),
      role: "client",
    });
  t.service_requests = [
    ["RA", "provider_selected", ids.client, "Home Cleaning"],
    ["RB", "confirmed", extra[0], "Plumbing Repair"],
    ["RC", "in_progress", extra[1], "Aircon Service"],
    ["RD", "completed", ids.client, "Garden Care"],
  ].map(([request_id, status, client_id, title], i) => ({
    ...sample,
    request_id,
    status,
    client_id,
    title,
    selected_provider_id: ids.provider,
    created_at: `2026-11-0${3 - (i % 3)}T02:00:00Z`,
    preferred_date: "2026-11-12",
    preferred_time: "14:00",
    location: "PRIVATE EXACT ADDRESS",
    client_lat: 6.123456,
    client_lng: 116.987654,
    description: "PRIVATE DESCRIPTION",
    request_image_url: "https://private.invalid/image",
  }));
  for (const [request_id, status, provider] of [
    ["FOREIGN", "confirmed", ids.client],
    ["PENDING", "pending", null],
    ["CANCELLED", "cancelled", ids.provider],
  ])
    t.service_requests.push({
      ...sample,
      request_id,
      status,
      selected_provider_id: provider,
      title: "FORBIDDEN " + request_id,
    });
  t.internal_messages = [
    message(
      "A1",
      "RA",
      ids.client,
      ids.provider,
      "Please confirm the requested time.",
      "2026-11-03T01:00:00Z",
    ),
    message(
      "A2",
      "RA",
      ids.provider,
      ids.client,
      "I will review your preferred time.",
      "2026-11-03T01:10:00Z",
      true,
    ),
    message(
      "B1",
      "RB",
      extra[0],
      ids.provider,
      "The kitchen sink needs repair.",
      "2026-11-03T02:00:00Z",
    ),
    message(
      "C1",
      "RC",
      extra[1],
      ids.provider,
      "Thank you for the update.",
      "2026-11-02T02:00:00Z",
    ),
    message(
      "D1",
      "RD",
      ids.client,
      ids.provider,
      "The garden looks great.",
      "2026-11-01T02:00:00Z",
      true,
    ),
    message(
      "OLD",
      "RA",
      "former-client",
      ids.provider,
      "FORBIDDEN FORMER CLIENT MESSAGE",
      "2026-11-03T02:30:00Z",
    ),
    message(
      "UNRELATED",
      "FOREIGN",
      ids.client,
      ids.provider,
      "FORBIDDEN FOREIGN MESSAGE",
      "2026-11-03T02:40:00Z",
    ),
  ];
  return t;
}
const isInsert = (o) =>
  o.kind === "query" &&
  o.table === "internal_messages" &&
  o.calls.some((c) => c[0] === "insert");
const isUpdate = (o) =>
  o.kind === "query" &&
  o.table === "internal_messages" &&
  o.calls.some((c) => c[0] === "update");
const isHistory = (o) =>
  o.kind === "query" &&
  o.table === "internal_messages" &&
  o.calls.some((c) => c[0] === "select") &&
  o.calls.some((c) => c[0] === "eq" && c[1] === "request_id") &&
  !isUpdate(o);
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: opt.width || 1536, height: opt.height || 864 },
        reducedMotion: "reduce",
        timezoneId: opt.timezone || "Asia/Kuala_Lumpur",
      }),
      t = data();
    opt.prepare?.(t);
    const gate = {
      requestFail: !!opt.requestFail,
      participantFail: !!opt.participantFail,
      historyFail: !!opt.historyFail,
      metadataFail: !!opt.metadataFail,
      readFail: !!opt.readFail,
      sendMode: null,
      hold: null,
    };
    const s = await install(c, {
      role: opt.role || "provider",
      tables: t,
      delay: (o) => gate.hold?.(o),
      fail: (o, st) => {
        if (o.kind === "rpc")
          return o.name === "provider_service_requests"
            ? gate.requestFail
            : o.name === "service_participants"
              ? gate.participantFail
              : false;
        if (isInsert(o) && gate.sendMode) {
          if (gate.sendMode === "reject")
            return { code: "P0001", message: "RAW PRIVATE SQL /server/path" };
          if (gate.sendMode === "lost-success")
            st.tables.internal_messages.push(
              o.calls.find((c) => c[0] === "insert")[1],
            );
          return "throw";
        }
        if (isUpdate(o)) return gate.readFail;
        if (isHistory(o)) return gate.historyFail;
        if (o.kind === "query" && o.table === "internal_messages")
          return gate.metadataFail;
        return false;
      },
    });
    await c.addInitScript(() => {
      window.simulatedHidden = false;
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => window.simulatedHidden,
      });
    });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        opt.before &&
        ["/provider/messages.html", "/js/provider-messages.js"].includes(
          u.pathname,
        )
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
      if (!opt.before && u.pathname === "/js/supabaseClient.js")
        return r.fulfill({
          contentType: "text/javascript",
          body:
            fs.readFileSync("tests/system-fixture.js", "utf8") +
            `\nwindow.providerRetryFlags=[];const originalFrom=supabase.from;supabase.from=table=>{const q=originalFrom(table),calls=[];const proxy=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>q.then(result=>{const range=calls.find(c=>c[0]==='range');return range&&Array.isArray(result.data)?{...result,data:result.data.slice(range[1],range[2]+1)}:result}).then(a,b);if(key==='retry')return value=>{window.providerRetryFlags.push(value);return proxy};return(...args)=>{calls.push([key,...args]);q[key](...args);return proxy}}});return proxy};`,
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(12000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.install({ time: new Date("2026-11-03T03:00:00Z") });
    await p.goto(base + "/provider/messages.html" + (opt.url || ""), {
      waitUntil: "commit",
    });
    if (!opt.noWait && !opt.before)
      await p.waitForFunction(
        () => document.body.dataset.messagesReady === "true",
      );
    if (opt.before) await p.locator(".conversation-card").first().waitFor();
    if (
      opt.url &&
      !opt.noHistoryWait &&
      !opt.before &&
      !opt.noWait &&
      !opt.requestFail &&
      !opt.participantFail &&
      !opt.historyFail
    )
      await p.waitForFunction(
        () => !document.querySelector("#messageInput").disabled,
      );
    return { p, c, s, gate };
  }
  async function select(p, id) {
    await p.locator('.conversation-card[data-request-id="' + id + '"]').click();
    await p.waitForFunction(
      () => !document.querySelector("#messageInput").disabled,
    );
  }
  async function sent(p) {
    await p.waitForFunction(
      () => document.body.dataset.messageSending === "false",
    );
  }
  async function shot(p, name, before = false, viewportOnly = false) {
    await p.evaluate((viewportOnly) => {
      if (!viewportOnly) window.scrollTo(0, 0);
      const e = document.createElement("aside");
      e.id = "offlineLabel";
      e.textContent =
        "OFFLINE REVIEW · SYNTHETIC PROVIDER / CLIENTS / MESSAGES · NO LIVE SUPABASE";
      e.style =
        (viewportOnly
          ? "position:fixed;top:0;left:0;width:100%;"
          : "position:relative;") +
        "padding:5px 8px;background:#fff4cd;color:#453b15;text-align:center;font:700 10px/1.5 Arial;z-index:99999";
      document.body.prepend(e);
    }, viewportOnly);
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: !viewportOnly,
    });
    await p.locator("#offlineLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
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
    ok(!v.length, "axe " + label + JSON.stringify(v));
    scans++;
  }
  async function counter(p, text) {
    ok(
      (await p.locator("#messageCharacterCount").textContent()) ===
        text.length + " / 1,000",
      "accurate raw counter",
    );
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
      [390, 430],
      [320, 600],
    ]) {
      const { p, c, s } = await open({
        width,
        height,
        url: width > 600 ? "?request_id=RA" : "",
      });
      ok(
        (await p.locator(".conversation-card").count()) === 4,
        "eligible conversations",
      );
      ok(
        (await p.locator("#conversationCount").textContent()) === "4",
        "true conversation count",
      );
      ok(
        (await p
          .locator(".side-menu a[aria-current=page]")
          .getAttribute("href")) === "messages.html",
        "active Messages",
      );
      ok(
        (await p
          .locator(".side-menu a")
          .evaluateAll((es) =>
            es.map((e) => e.getAttribute("href")).join(","),
          )) ===
          "dashboard.html,incoming-requests.html,assignment-details.html,messages.html",
        "four routes",
      );
      const all = await p.locator("body").innerHTML();
      for (const secret of [
        "FORBIDDEN",
        "PRIVATE EXACT ADDRESS",
        "PRIVATE DESCRIPTION",
        "6.123456",
        "private.invalid",
      ])
        ok(!all.includes(secret), "no unrelated/location data " + secret);
      ok(
        (await p
          .locator(".conversation-card")
          .first()
          .getAttribute("data-request-id")) === "RB",
        "latest authorised message ordering",
      );
      ok(
        (
          await p
            .locator(
              ".conversation-card[data-request-id=RB] .conversation-preview",
            )
            .textContent()
        ).includes("kitchen sink"),
        "real latest preview",
      );
      ok(
        await p
          .locator(
            ".conversation-card[data-request-id=RB] .conversation-unread",
          )
          .isVisible(),
        "real unread incoming indicator",
      );
      ok(
        !(await p
          .locator("input[type=file],.attachment-btn,.emoji-btn")
          .count()),
        "text only controls",
      );
      if (width <= 600) {
        await shot(p, "list-" + width + "x" + height);
        await axe(p, "list " + width + "x" + height);
        await select(p, "RA");
      }
      ok(
        (await p.locator("#chatClientName").textContent()) ===
          "Synthetic Client Alice",
        "verified request Client",
      );
      ok(
        (await p.locator("#viewChatRequestBtn").getAttribute("href")) ===
          "incoming-requests.html",
        "real Incoming workflow without unsupported deep link",
      );
      ok(
        (await p.locator("#chatStatus").textContent()) ===
          "Awaiting Confirmation",
        "tentative status wording",
      );
      ok(
        await p.locator("#sendMessageBtn").isDisabled(),
        "empty send disabled",
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
            bottom: r.bottom,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          composer: b("#messageForm"),
          send: b("#sendMessageBtn"),
          input: b("#messageInput"),
          history: b("#messagesList"),
          list: b("#conversationList"),
          historyOverflow: getComputedStyle(
            document.querySelector("#messagesList"),
          ).overflowY,
          listOverflow: getComputedStyle(
            document.querySelector("#conversationList"),
          ).overflowY,
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no horizontal overflow");
      ok(m.send.height >= 44, "Send touch target");
      if (width >= 1024)
        ok(
          m.composer.bottom <= height + 1,
          "composer visible desktop " + width + "x" + height,
        );
      ok(
        m.historyOverflow === "auto" || m.historyOverflow === "scroll",
        "history independent scroll",
      );
      if (width > 600)
        ok(
          m.listOverflow === "auto" || m.listOverflow === "scroll",
          "conversation independent scroll",
        );
      await p.locator("#messageInput").fill("Draft with spaces   ");
      await counter(p, "Draft with spaces   ");
      ok(
        await p.locator("#sendMessageBtn").isEnabled(),
        "nonempty send enabled",
      );
      await shot(p, "chat-" + width + "x" + height);
      await axe(p, "chat " + width + "x" + height);
      if (width <= 600) {
        await p.locator("#backToConversationsBtn").click();
        ok(
          await p.locator("#conversationSearch").isVisible(),
          "mobile list back",
        );
        ok(
          await p
            .locator(".conversation-card[data-request-id=RA]")
            .evaluate((e) => e === document.activeElement),
          "back restores selected focus",
        );
        await select(p, "RA");
        await counter(p, "Draft with spaces   ");
        ok(
          (await p.locator("#messageInput").inputValue()) ===
            "Draft with spaces   ",
          "mobile draft restored",
        );
      }
      await c.close();
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({
        width,
        before: true,
        url: "?request_id=RA",
      });
      await shot(p, "messages-" + width, true);
      await c.close();
    }
    {
      const { p, c, s } = await open({ url: "?request_id=RA" });
      for (const [q, n] of [
        ["Ben", 1],
        ["RA", 1],
        ["Aircon", 1],
        ["no results", 0],
      ]) {
        await p.locator("#conversationSearch").fill(q);
        ok(
          (await p.locator(".conversation-card").count()) === n,
          "search " + q,
        );
        await shot(p, n ? "search-results" : "search-empty");
      }
      await p.locator("#clearConversationSearchBtn").click();
      for (const [f, n] of [
        ["active", 3],
        ["completed", 1],
        ["all", 4],
      ]) {
        await p.locator("[data-conversation-filter=" + f + "]").click();
        ok(
          (await p.locator(".conversation-card").count()) === n,
          "filter " + f,
        );
        await shot(p, "filter-" + f);
      }
      ok(
        (await p.locator("#chatRequestId").textContent()) === "RA",
        "filter preserves selected thread",
      );
      ok(rpcCount(s) === 1, "search/filter no request fetch");
      await c.close();
    }
    {
      const { p, c, s } = await open({ url: "?request_id=RA" });
      await p.locator("#messageInput").fill("First Client draft");
      await select(p, "RB");
      await p.locator("#messageInput").fill("Second Client draft");
      await select(p, "RA");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "First Client draft",
        "first draft restored",
      );
      await counter(p, "First Client draft");
      await p.goBack();
      await p.waitForFunction(
        () => document.querySelector("#chatRequestId").textContent === "RB",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Second Client draft",
        "Back draft and recipient",
      );
      await p.goForward();
      await p.waitForFunction(
        () => document.querySelector("#chatRequestId").textContent === "RA",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "First Client draft",
        "Forward restores draft",
      );
      await shot(p, "restored-draft");
      await p.locator("#messageInput").fill("   ");
      ok(
        await p.locator("#sendMessageBtn").isDisabled(),
        "whitespace disabled",
      );
      await p.locator("#messageInput").evaluate((e) => {
        e.value = "x".repeat(1001);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await counter(p, "x".repeat(1001));
      ok(
        await p.locator("#sendMessageBtn").isDisabled(),
        "overlength disabled",
      );
      await p
        .locator("#messageForm")
        .evaluate((f) =>
          f.dispatchEvent(new Event("submit", { cancelable: true })),
        );
      ok(
        (await p.locator("#messageBox").textContent()).includes("1,000"),
        "overlength validation",
      );
      ok(!s.calls.some(isInsert), "invalid content not sent");
      await c.close();
    }
    for (const mode of ["success", "reject", "lost", "lost-success"]) {
      const { p, c, s, gate } = await open({ url: "?request_id=RA" });
      gate.sendMode = mode === "success" ? null : mode;
      await p
        .locator("#messageInput")
        .fill("Synthetic message with stable identifiers");
      await p.locator("#sendMessageBtn").click();
      await sent(p);
      if (mode === "success") {
        ok(
          (await p.locator("#messageBox").textContent()).includes("saved"),
          "acknowledged saved",
        );
        await counter(p, "");
        ok(
          await p.locator("#sendMessageBtn").isDisabled(),
          "cleared empty disabled",
        );
      } else {
        ok(
          (await p.locator("#messageInput").inputValue()) ===
            "Synthetic message with stable identifiers",
          "failed/uncertain draft retained",
        );
        await counter(p, "Synthetic message with stable identifiers");
        ok(
          !(await p.locator("body").textContent()).includes("RAW PRIVATE SQL"),
          "server payload sanitised",
        );
        await shot(p, "send-" + mode);
        gate.sendMode = null;
        if (
          mode !== "lost-success" ||
          (await p.locator("#sendMessageBtn").isEnabled())
        ) {
          await p.locator("#sendMessageBtn").click();
          await sent(p);
        }
        const calls = s.calls.filter(isInsert);
        if (mode === "lost-success")
          ok(
            calls.length === 1,
            "existing UUID reconciled without second insert",
          );
        else {
          ok(calls.length === 2, "one explicit retry");
          const a = calls[0].calls.find((c) => c[0] === "insert")[1],
            b = calls[1].calls.find((c) => c[0] === "insert")[1];
          ok(
            a.id === b.id && a.message_id === b.message_id,
            "same identifiers reused",
          );
        }
      }
      ok(
        s.tables.internal_messages.filter(
          (r) => r.message_text === "Synthetic message with stable identifiers",
        ).length === 1,
        "single persisted message",
      );
      ok(
        (await p.evaluate(() => window.providerRetryFlags)).every(
          (v) => v === false,
        ),
        "SDK retries disabled",
      );
      await shot(p, "send-" + mode + "-resolved");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ url: "?request_id=RA" });
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) => (isInsert(o) ? held : undefined);
      gate.sendMode = "lost";
      await p.locator("#messageInput").fill("Older pending text");
      await p.locator("#sendMessageBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.messageSending === "true",
      );
      await p.locator("#messageInput").fill("Newer draft must survive");
      await p.locator("#messageForm").evaluate((f) => {
        for (let i = 0; i < 3; i++)
          f.dispatchEvent(new Event("submit", { cancelable: true }));
      });
      ok(s.calls.filter(isInsert).length === 1, "duplicate send prevented");
      await shot(p, "sending-pending");
      await select(p, "RB");
      await p.locator("#messageInput").fill("Ben draft");
      release();
      await sent(p);
      ok(
        (await p.locator("#messageInput").inputValue()) === "Ben draft",
        "late failed send cannot replace other draft",
      );
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "Older pending text",
        ),
        "no cross-thread optimistic message",
      );
      await select(p, "RA");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Newer draft must survive",
        "newer same-thread draft preserved",
      );
      await counter(p, "Newer draft must survive");
      const payload = s.calls
        .filter(isInsert)[0]
        .calls.find((c) => c[0] === "insert")[1];
      ok(
        payload.request_id === "RA" &&
          payload.sender_id === ids.provider &&
          payload.receiver_id === ids.client,
        "captured original request and recipient",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ url: "?request_id=RA" });
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) =>
        isHistory(o) &&
        o.calls.some(
          (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "RB",
        )
          ? held
          : undefined;
      await p.locator(".conversation-card[data-request-id=RB]").click();
      await p.waitForFunction(
        () => document.querySelector("#chatRequestId").textContent === "RB",
      );
      await select(p, "RC");
      release();
      await p.waitForTimeout(80);
      ok(
        (await p.locator("#chatClientName").textContent()) ===
          "Synthetic Client Carla",
        "late history keeps new Client",
      );
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "kitchen sink",
        ),
        "late thread history ignored",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({
        url: "?request_id=RA",
        readFail: true,
      });
      ok(
        (await p.locator("#chatReadStatus").textContent()).includes(
          "could not be updated",
        ),
        "read failure explicit",
      );
      ok(
        await p
          .locator(
            ".conversation-card[data-request-id=RA] .conversation-unread",
          )
          .isVisible(),
        "failed read does not clear unread",
      );
      ok(
        s.tables.internal_messages.find((r) => r.id === "A1").is_read === false,
        "failed read not fabricated",
      );
      await shot(p, "read-status-error");
      gate.readFail = false;
      await p.clock.runFor(3100);
      await p.waitForFunction(
        () => !document.querySelector("#chatReadStatus").textContent,
      );
      ok(
        !(await p
          .locator(
            ".conversation-card[data-request-id=RA] .conversation-unread",
          )
          .count()),
        "acknowledged IDs clear unread",
      );
      ok(
        s.tables.internal_messages.find((r) => r.id === "OLD").is_read ===
          false,
        "former Client never marked read",
      );
      for (const o of s.calls.filter(isUpdate))
        ok(
          o.calls.some(
            (c) =>
              c[0] === "eq" && c[1] === "receiver_id" && c[2] === ids.provider,
          ) &&
            o.calls.some(
              (c) =>
                c[0] === "eq" && c[1] === "sender_id" && c[2] === ids.client,
            ) &&
            o.calls.some((c) => c[0] === "in" && c[1] === "id"),
          "read update scoped by actor peer and loaded IDs",
        );
      await c.close();
    }
    {
      const { p, c, s } = await open({
        url: "?request_id=RC",
        prepare: (t) => {
          t.internal_messages = [];
          for (let i = 0; i < 450; i++)
            t.internal_messages.push(
              message(
                "LONG-" + i,
                "RC",
                extra[1],
                ids.provider,
                "History message " + i + " " + "long-word-".repeat(12),
                new Date(Date.UTC(2026, 10, 2, 0, i)).toISOString(),
                true,
              ),
            );
        },
      });
      ok(
        (await p.locator(".message-bubble").count()) === 450,
        "paginated long history",
      );
      ok(
        s.calls
          .filter(isHistory)
          .some((o) => o.calls.some((c) => c[0] === "range" && c[1] === 400)),
        "real offset pages used",
      );
      await p.locator("#messagesList").evaluate((e) => (e.scrollTop = 0));
      const top = await p.locator("#messagesList").evaluate((e) => e.scrollTop);
      s.tables.internal_messages.push(
        message(
          "NEW",
          "RC",
          extra[1],
          ids.provider,
          "New message below your reading position",
          "2026-11-03T02:59:00Z",
        ),
      );
      await p.clock.runFor(3100);
      await p.waitForFunction(
        () => document.querySelectorAll(".message-bubble").length === 451,
      );
      ok(
        (await p.locator("#messagesList").evaluate((e) => e.scrollTop)) === top,
        "reader not forced to bottom",
      );
      ok(
        await p.locator("#showLatestMessagesBtn").isVisible(),
        "Latest Messages control",
      );
      await shot(p, "long-history-latest");
      await p.locator("#showLatestMessagesBtn").click();
      ok(
        (await p
          .locator("#messagesList")
          .evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight)) < 4,
        "Latest control scrolls history only",
      );
      await axe(p, "long history");
      await c.close();
    }
    {
      const { p, c, s, gate } = await open({ url: "?request_id=RA" });
      const count = () => s.calls.filter(isHistory).length;
      await p.evaluate(() => {
        window.simulatedHidden = true;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const before = count();
      await p.clock.runFor(7000);
      ok(count() === before, "hidden page pauses polling");
      await p.evaluate(() => {
        window.simulatedHidden = false;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await p.waitForFunction(
        () => !document.querySelector("#messageInput").disabled,
      );
      await p.waitForTimeout(40);
      ok(count() === before + 1, "visibility resumes one history read");
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) => (isHistory(o) ? held : undefined);
      await p.clock.runFor(3100);
      const heldCount = count();
      await p.clock.runFor(9000);
      ok(count() === heldCount, "slow poll never overlaps");
      release();
      await p.waitForTimeout(50);
      gate.hold = null;
      await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      const hidden = count();
      await p.clock.runFor(7000);
      ok(count() === hidden, "navigation pauses timers");
      await p.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        ),
      );
      await p.waitForTimeout(40);
      ok(count() === hidden + 1, "bfcache resumes safely");
      await c.close();
    }
    for (const [opt, name] of [
      [{ requestFail: true }, "conversation-error"],
      [{ participantFail: true }, "participant-error"],
      [{ historyFail: true }, "history-error"],
      [{ metadataFail: true }, "metadata-error"],
    ]) {
      const { p, c } = await open({
        ...opt,
        url: "?request_id=RA",
        noHistoryWait: true,
      });
      if (opt.requestFail)
        ok(
          await p.locator("#retryConversationsBtn").isVisible(),
          "request read retry",
        );
      if (opt.participantFail) {
        ok(
          await p.locator("#retryParticipantsBtn").isVisible(),
          "participant failure blocks unverified recipient",
        );
        ok(
          await p.locator("#messageInput").isDisabled(),
          "missing Client cannot send",
        );
      }
      if (opt.historyFail) {
        await p.locator("#retryMessagesBtn").waitFor();
        ok(
          await p.locator("#sendMessageBtn").isDisabled(),
          "initial history failure blocks send",
        );
      }
      await shot(p, name);
      await axe(p, name);
      await c.close();
    }
    {
      const { p, c, gate } = await open({ url: "?request_id=RA" });
      gate.historyFail = true;
      await p.clock.runFor(3100);
      await p.waitForFunction(() =>
        document
          .querySelector("#chatReadStatus")
          .textContent.includes("could not refresh"),
      );
      ok(
        (await p.locator("#messagesList").textContent()).includes(
          "Please confirm",
        ),
        "refresh retains history",
      );
      await shot(p, "history-refresh-error");
      gate.historyFail = false;
      gate.requestFail = true;
      await p.locator("#refreshConversationsBtn").click();
      await p.waitForFunction(() =>
        document
          .querySelector("#messageBox")
          .textContent.includes("could not refresh"),
      );
      ok(
        (await p.locator("#messagesList").textContent()).includes(
          "Please confirm",
        ),
        "collection refresh keeps selected history",
      );
      ok(
        await p.locator("#messageInput").isDisabled(),
        "stale collection pauses unsafe send",
      );
      gate.requestFail = false;
      await p.locator("#refreshConversationsBtn").click();
      await p.waitForFunction(
        () => !document.querySelector("#messageInput").disabled,
      );
      ok(
        (await p.locator(".conversation-card").count()) === 4,
        "collection recovers",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({
        url: "?request_id=FOREIGN",
        noHistoryWait: true,
      });
      ok(
        await p.locator("#chatEmptyState").isVisible(),
        "unavailable deep link no fallback Client",
      );
      ok(
        (await p.locator("#messageBox").textContent()).includes("unavailable"),
        "unavailable context explicit",
      );
      ok(!s.calls.some(isHistory), "invalid ID no history read");
      await c.close();
    }
    {
      const { p, c } = await open({
        prepare: (t) => {
          t.service_requests = [];
          t.internal_messages = [];
        },
      });
      ok(
        (await p.locator("#conversationCount").textContent()) === "0",
        "true empty count",
      );
      await shot(p, "empty-conversations");
      await axe(p, "empty");
      await c.close();
    }
    {
      const { p, c } = await open({
        url: "?request_id=RA",
        width: 390,
        height: 844,
      });
      await p.locator("#messageInput").fill("Short viewport preserved draft");
      await p.locator("#messageInput").focus();
      await p.setViewportSize({ width: 390, height: 430 });
      await p.evaluate(() =>
        window.visualViewport.dispatchEvent(new Event("resize")),
      );
      await p.waitForTimeout(80);
      const r = await p.locator("#sendMessageBtn").boundingBox();
      ok(r.y >= 0 && r.y + r.height <= 430, "short viewport Send reachable");
      await counter(p, "Short viewport preserved draft");
      await shot(p, "short-viewport-composer", false, true);
      await c.close();
    }
    {
      const { p, c } = await open({
        url: "?request_id=RA",
        prepare: (t) => {
          t.users.find((u) => u.id === ids.client).full_name =
            "Long Client Name ".repeat(12);
          t.service_requests[0].title = "Long Service Title ".repeat(14);
          t.internal_messages[0].message_text =
            "<img src=x onerror=alert(1)>\nhttps://example.invalid/" +
            "longword".repeat(90);
        },
      });
      ok(
        !(await p.locator("#messagesList img").count()),
        "message text never HTML",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long content wraps",
      );
      await shot(p, "long-content");
      await c.close();
    }
    {
      const { p, c, s } = await open({ url: "?request_id=RA" });
      await p.locator("#messageInput").fill("Shift Enter text");
      await p.locator("#messageInput").press("Shift+Enter");
      ok(!s.calls.some(isInsert), "Shift Enter does not send");
      await p.locator("#messageInput").press("Enter");
      await sent(p);
      ok(s.calls.filter(isInsert).length === 1, "Enter sends text");
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
      const until = Date.now() + 12000;
      while (new URL(p.url()).pathname !== "/login.html") {
        if (Date.now() > until) throw Error("role redirect timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      ok(!rpcCount(s) && !s.calls.some(isInsert), "role gate before messages");
      await c.close();
    }
    ok(!errors.length, "browser errors " + errors.join(","));
    ok(!external.length, "outside traffic " + external.join(","));
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
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${checks} Provider Messages assertions; ${scans} axe scans; synthetic offline fixtures only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
function rpcCount(s) {
  return s.calls.filter(
    (o) => o.kind === "rpc" && o.name === "provider_service_requests",
  ).length;
}
