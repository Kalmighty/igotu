/* Client-only messaging UI with real modules and in-memory transport; no live backend. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4209";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Loopback only",
);
const reviewed = "ad96900331668a33d775f36b1822f275c89788e0",
  out = "docs/client-messages";
for (const dir of [
  "screenshots",
  "before",
  "validation",
  "refinement/before",
  "refinement/after",
])
  fs.mkdirSync(out + "/" + dir, { recursive: true });
const extra = [
  "00000000-0000-4000-8000-000000000022",
  "00000000-0000-4000-8000-000000000023",
];
function data() {
  const t = seed(),
    sample = t.service_requests[1],
    provider = t.users.find((u) => u.id === ids.provider);
  t.users.find((u) => u.id === ids.client).full_name = "Synthetic Client A";
  provider.full_name = "Synthetic Provider B";
  provider.user_code = "P-SYN-B";
  extra.forEach((id, i) =>
    t.users.push({
      ...provider,
      id,
      full_name: i ? "Synthetic Provider D" : "Synthetic Provider C",
      user_code: "P-SYN-" + (i ? "D" : "C"),
    }),
  );
  t.service_requests = [
    [
      "REQ-A",
      "completed",
      "Home cleaning for a three-bedroom apartment",
      ids.provider,
      "Cleaning",
    ],
    ["REQ-B", "confirmed", "Kitchen tap repair", extra[0], "Repair"],
    ["REQ-C", "in_progress", "Document delivery", extra[1], "Delivery"],
    [
      "REQ-D",
      "provider_selected",
      "Room moving assistance",
      ids.provider,
      "Moving Help",
    ],
  ].map(([request_id, status, title, selected_provider_id, category], i) => ({
    ...sample,
    request_id,
    status,
    title,
    selected_provider_id,
    category,
    preferred_date: "2026-11-12",
    preferred_time: "11:00:00",
    created_at: `2026-10-${28 - i}T03:00:00Z`,
  }));
  t.service_requests.push(
    {
      ...sample,
      request_id: "NOT-SELECTED",
      status: "pending",
      selected_provider_id: null,
    },
    { ...sample, request_id: "CANCELLED", status: "cancelled" },
    {
      ...sample,
      request_id: "FOREIGN",
      client_id: "other-client",
      status: "confirmed",
    },
  );
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
  t.internal_messages = [
    message(
      "a1",
      "REQ-A",
      ids.provider,
      ids.client,
      "Hello! I have completed the requested cleaning. Please let me know if everything looks okay.",
      "2026-11-01T03:20:00Z",
    ),
    message(
      "a2",
      "REQ-A",
      ids.client,
      ids.provider,
      "Thank you. I have checked the rooms and everything looks good.",
      "2026-11-01T03:35:00Z",
    ),
    message(
      "a3",
      "REQ-A",
      ids.provider,
      ids.client,
      "You are welcome. You can record the offline payment when ready.",
      "2026-11-01T03:40:00Z",
    ),
    message(
      "a4",
      "REQ-A",
      ids.client,
      ids.provider,
      "I will record it shortly. Thanks again!",
      "2026-11-01T03:45:00Z",
      true,
    ),
    message(
      "b1",
      "REQ-B",
      extra[0],
      ids.client,
      "Synthetic repair conversation only.",
      "2026-11-01T04:00:00Z",
    ),
    message(
      "former",
      "REQ-A",
      "former-provider",
      ids.client,
      "Former assignment private text",
      "2026-11-01T02:00:00Z",
    ),
  ];
  return t;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let checks = 0,
    scans = 0;
  const errors = [],
    external = [],
    metrics = [];
  const ok = (v, m) => {
    assert(v, m);
    checks++;
  };
  const query = (o, table) => o.kind === "query" && o.table === table;
  const reads = (s) =>
    s.calls.filter(
      (o) =>
        query(o, "internal_messages") && o.calls.some((c) => c[0] === "select"),
    );
  const sends = (s) =>
    s.calls.filter(
      (o) =>
        query(o, "internal_messages") && o.calls.some((c) => c[0] === "insert"),
    );
  const writes = (s) =>
    s.calls.filter(
      (o) =>
        query(o, "internal_messages") && o.calls.some((c) => c[0] === "update"),
    );
  const rows = (p) =>
    p
      .locator(".conversation-card")
      .evaluateAll((es) => es.map((e) => e.dataset.requestId));
  const waitNode = async (fn) => {
    const until = Date.now() + 10000;
    while (!fn()) {
      if (Date.now() > until) throw Error("Fixture barrier timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  async function open(opt = {}) {
    const c = await browser.newContext({
      viewport: { width: opt.width || 1536, height: opt.height || 900 },
      reducedMotion: opt.motion ? "no-preference" : "reduce",
    });
    const t = data();
    if (opt.prepare) opt.prepare(t);
    const s = await install(c, {
      tables: t,
      role: opt.role || "client",
      fail: opt.fail,
      delay: opt.delay,
    });
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) {
        external.push(u.origin);
        return r.abort();
      }
      if (
        (opt.before &&
          ["/client/messages.html", "/js/client-messages.js"].includes(
            u.pathname,
          )) ||
        (opt.reviewed &&
          [
            "/client/messages.html",
            "/js/client-messages.js",
            "/css/client-messages.css",
          ].includes(u.pathname))
      )
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : u.pathname.endsWith(".css")
              ? "text/css"
              : "text/html",
          body: execFileSync(
            "git",
            [
              "show",
              `${opt.reviewed ? "8b361180eac2b991f0966775d1d47c30c797a681" : reviewed}:igotu_v2${u.pathname}`,
            ],
            { encoding: "utf8" },
          ),
        });
      if (
        opt.dest &&
        /^\/client\/(request-details|my-requests)\.html$/.test(u.pathname)
      )
        return r.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic destination</title><main>Offline navigation</main>",
        });
      return r.fallback();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.install({ time: new Date("2026-11-02T10:00:00Z") });
    await p.goto(
      base +
        "/client/messages.html" +
        (opt.id ? "?request_id=" + encodeURIComponent(opt.id) : ""),
    );
    if (opt.before) await p.locator(".conversation-card").first().waitFor();
    else if (!opt.noWait)
      await p.waitForFunction(
        () => document.body.dataset.messagesReady === "true",
      );
    if (opt.chat && !opt.before)
      await p.locator("#messageInput").waitFor({ state: "visible" });
    if (opt.chat && !opt.before && !opt.fail && !opt.noWait)
      await p.waitForFunction(
        () => !document.querySelector("#messageInput").disabled,
      );
    return { p, c, s };
  }
  async function loaded(p) {
    await p.waitForFunction(
      () => !document.querySelector("#messageInput").disabled,
    );
  }
  const select = async (p, id) => {
    await p.locator(`.conversation-card[data-request-id="${id}"]`).click();
    await loaded(p);
  };
  async function shot(p, name, before = false) {
    await p.evaluate(() => {
      scrollTo(0, 0);
      const e = document.createElement("aside");
      e.id = "offlineMessagesLabel";
      e.textContent =
        "OFFLINE REVIEW · SYNTHETIC CONVERSATIONS · NO LIVE SUPABASE";
      e.style =
        "padding:7px 10px;background:#fff4cd;color:#453b15;text-align:center;font:700 11px/1.5 Arial;position:relative;z-index:10000";
      document.body.prepend(e);
    });
    await p.screenshot({
      path: `${out}/${before ? "before" : "screenshots"}/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineMessagesLabel").evaluate((e) => e.remove());
  }
  async function assertCounter(p, label) {
    const value = await p.locator("#messageInput").inputValue();
    ok(
      (await p.locator("#messageCharacterCount").textContent()) ===
        `${value.length} / 1,000`,
      label,
    );
  }
  async function refinementShot(p, name) {
    await p.evaluate(() => {
      const e = document.createElement("aside");
      e.id = "refinementOfflineLabel";
      e.textContent = "OFFLINE · SYNTHETIC · NO LIVE SUPABASE";
      e.style =
        "position:fixed;top:0;left:0;right:0;z-index:10000;text-align:center;font:700 10px/1.5 Arial;background:#fff4cd;color:#453b15;pointer-events:none";
      document.body.append(e);
    });
    await p.screenshot({
      path: `${out}/refinement/${name}.png`,
      fullPage: false,
    });
    await p.locator("#refinementOfflineLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const v = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }));
    });
    ok(!v.length, "axe " + label + ": " + JSON.stringify(v));
    scans++;
  }
  const notice = (p, text) =>
    p.waitForFunction(
      (text) =>
        document.querySelector("#messageBox").textContent.includes(text),
      text,
    );
  try {
    const refinementMetrics = [];
    for (const [width, height] of [
      [1920, 1080],
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [390, 430],
      [320, 800],
    ]) {
      if ([1536, 1366, 768, 390, 320].includes(width) && height !== 430) {
        const { p, c } = await open({
          width,
          height,
          id: "REQ-A",
          chat: true,
          reviewed: true,
        });
        if (width <= 600) {
          await p.locator("#messageInput").focus();
          await p.evaluate(() =>
            window.visualViewport?.dispatchEvent(new Event("resize")),
          );
          await p.clock.runFor(350);
          await p.waitForTimeout(80);
        }
        await refinementShot(p, `before/chat-${width}-${height}`);
        await c.close();
      }
      const { p, c, s } = await open({
        width,
        height,
        id: "REQ-A",
        chat: true,
      });
      await p.evaluate(() => scrollTo(0, 0));
      const m = await p.evaluate(() => {
        const rect = (selector) => {
          const e = document.querySelector(selector),
            r = e.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            clientHeight: e.clientHeight,
            scrollHeight: e.scrollHeight,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          pageWidth: document.documentElement.scrollWidth,
          pageHeight: document.documentElement.scrollHeight,
          provider: rect(".chat-header"),
          summary: rect(".chat-service-summary"),
          history: rect("#messagesList"),
          composer: rect("#messageForm"),
          send: rect("#sendMessageBtn"),
          list: rect("#conversationList"),
        };
      });
      refinementMetrics.push(m);
      ok(
        m.pageWidth === width,
        `refinement no horizontal overflow ${width}/${height}`,
      );
      ok(
        m.composer.top >= m.history.bottom - 1,
        "refinement composer does not overlap history",
      );
      if (width > 600) {
        ok(
          m.composer.bottom <= height && m.send.bottom <= height,
          `composer in initial viewport ${width}/${height}: ${JSON.stringify(m)}`,
        );
        ok(
          m.provider.top >= 0 && m.summary.bottom < m.history.bottom,
          "provider and summary visible",
        );
        ok(m.history.height >= 150, "comfortable desktop/tablet history");
        ok(
          m.list.scrollHeight > m.list.clientHeight,
          "conversation list scrolls independently",
        );
        const beforeScroll = await p.evaluate(() => scrollY);
        await p
          .locator("#conversationList")
          .evaluate((e) => (e.scrollTop = 70));
        ok(
          await p.locator("#conversationList").evaluate((e) => e.scrollTop > 0),
          "list scroll responds",
        );
        ok(
          (await p.evaluate(() => scrollY)) === beforeScroll,
          "list scroll does not move page",
        );
        await p.locator("#conversationList").evaluate((e) => (e.scrollTop = 0));
      } else {
        await p.locator("#messageInput").focus();
        // Exercise the existing keyboard/visual-viewport resize handler.
        await p.evaluate(() =>
          window.visualViewport?.dispatchEvent(new Event("resize")),
        );
        await p.clock.runFor(350);
        await p.waitForTimeout(80);
        const input = await p.locator("#messageInput").boundingBox();
        ok(
          input.height >= 75 && m.send.width >= 44,
          "phone input/send touch size",
        );
        m.focusedComposer = await p.locator("#messageForm").boundingBox();
        const focusedSend = await p.locator("#sendMessageBtn").boundingBox();
        ok(
          input.y >= 0 && focusedSend.y + focusedSend.height <= height,
          `phone visual-viewport handler brings input and Send into view ${width}/${height}: ${JSON.stringify({ input, focusedSend })}`,
        );
      }
      await assertCounter(p, "initial empty counter");
      await refinementShot(p, `after/chat-${width}-${height}`);
      await axe(p, `refinement ${width}/${height}`);
      ok(!sends(s).length, "layout performs no inserts");
      await c.close();
    }
    // Draft values and counters must move together before any history request resolves.
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, id: "REQ-A", chat: true });
      await p.locator("#messageInput").fill("A".repeat(75));
      await assertCounter(p, "75-character A draft");
      if (width <= 600) await p.locator("#backToConversationsBtn").click();
      await select(p, "REQ-B");
      await assertCounter(p, "empty B draft");
      await p.locator("#messageInput").fill("B".repeat(130));
      await assertCounter(p, "130-character B draft");
      if (width <= 600) await p.locator("#backToConversationsBtn").click();
      await select(p, "REQ-A");
      ok(
        (await p.locator("#messageInput").inputValue()) === "A".repeat(75),
        "exact A draft retained",
      );
      await assertCounter(p, "restored A counter");
      await p.locator("#messageInput").focus();
      if (width <= 600)
        await p.evaluate(() =>
          window.visualViewport?.dispatchEvent(new Event("resize")),
        );
      await refinementShot(p, `after/restored-draft-${width}`);
      if (width <= 600) await p.locator("#backToConversationsBtn").click();
      await select(p, "REQ-B");
      ok(
        (await p.locator("#messageInput").inputValue()) === "B".repeat(130),
        "exact B draft retained",
      );
      await assertCounter(p, "restored B counter");
      await c.close();
    }
    // A real browser zoom reduces the CSS viewport. A 683px layout viewport
    // approximates 200% zoom on 1366px; content remains readable via outer scroll.
    {
      const { p, c } = await open({
        width: 683,
        height: 384,
        id: "REQ-A",
        chat: true,
      });
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "zoom-equivalent no horizontal overflow",
      );
      await p.locator("#messageInput").focus();
      await p.locator("#sendMessageBtn").focus();
      const send = await p.locator("#sendMessageBtn").boundingBox();
      ok(
        send.y >= 0 && send.y + send.height <= 384,
        "zoom-equivalent Send reachable by keyboard",
      );
      await p.keyboard.press("Tab");
      await p.keyboard.press("Shift+Tab");
      ok(
        await p
          .locator("#sendMessageBtn")
          .evaluate((e) => e === document.activeElement),
        "no keyboard trap at composer",
      );
      await refinementShot(p, "after/zoom-equivalent-683-384");
      await axe(p, "zoom equivalent");
      await c.close();
    }
    fs.writeFileSync(
      out + "/refinement/responsive-metrics.json",
      JSON.stringify(refinementMetrics, null, 2) + "\n",
    );

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
        (await rows(p)).join(",") === "REQ-A,REQ-B,REQ-C,REQ-D",
        "only owned eligible selected requests",
      );
      ok(
        (await p.locator('[data-conversation-filter="cancelled"]').count()) ===
          0,
        "no unsupported cancelled filter",
      );
      ok(
        (await p
          .locator('.side-menu a[aria-current="page"]')
          .getAttribute("href")) === "messages.html",
        "correct active navigation",
      );
      const q = s.calls.find((o) => query(o, "service_requests"));
      ok(
        q.calls.some(
          (c) => c[0] === "eq" && c[1] === "client_id" && c[2] === ids.client,
        ),
        "owned predicate",
      );
      ok(
        q.calls.some(
          (c) =>
            c[0] === "not" &&
            c[1] === "selected_provider_id" &&
            c[2] === "is" &&
            c[3] === null,
        ),
        "selected Provider predicate",
      );
      ok(
        q.calls.some(
          (c) =>
            c[0] === "in" &&
            c[1] === "status" &&
            c[2].join(",") ===
              "provider_selected,confirmed,in_progress,completed",
        ),
        "eligible status boundary",
      );
      ok(
        (await p.locator("#conversationCount").textContent()) === "4",
        "actual authorised count",
      );
      ok(
        (await p.locator("#messageInput").getAttribute("maxlength")) === "1000",
        "limit unchanged",
      );
      if (width <= 600) {
        ok(await p.locator(".chat-panel").isHidden(), "phone starts with list");
        ok(
          !reads(s).length && !writes(s).length,
          "phone list never marks unseen history read",
        );
        await axe(p, "list " + width);
        await shot(p, "messages-list-" + width);
        await select(p, "REQ-A");
        ok(
          await p.locator(".conversation-panel").isHidden(),
          "phone opens separate chat",
        );
      } else await loaded(p);
      ok(
        (await p.locator("#chatProviderName").textContent()) ===
          "Synthetic Provider B",
        "actual Provider",
      );
      ok(
        (await p.locator("#chatReceiverInfo").textContent()) ===
          "Provider · P-SYN-B",
        "actual code",
      );
      ok(
        (await p.locator("#chatPreferredSchedule").textContent()).startsWith(
          "Preferred:",
        ),
        "preferred not confirmed schedule",
      );
      ok(
        (await p.locator("#viewChatRequestBtn").getAttribute("href")) ===
          "request-details.html?request_id=REQ-A",
        "correct details route",
      );
      ok(
        (await p.locator(".message-bubble").count()) === 4,
        "only current pair messages",
      );
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "Former assignment",
        ),
        "former participant excluded",
      );
      ok(
        (await p.locator(".message-time").first().textContent()).includes(
          "MYT",
        ),
        "real Malaysian timestamp",
      );
      const m = await p.evaluate(() => {
        const rect = (s) => {
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
          pageWidth: document.documentElement.scrollWidth,
          conversation: rect(".conversation-panel"),
          chat: rect(".chat-panel"),
          history: rect("#messagesList"),
          composer: rect("#messageForm"),
          send: rect("#sendMessageBtn"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no overflow " + width);
      ok(
        m.send.width >= 44 && m.send.height >= 44 && m.send.right <= width,
        "Send usable " + width,
      );
      ok(m.history.height >= 150, "history usable " + width);
      ok(
        m.composer.y >= m.history.bottom - 1,
        "composer never overlays messages",
      );
      if (width > 600)
        ok(
          m.chat.width > m.conversation.width && m.chat.x > m.conversation.x,
          "desktop/tablet two columns",
        );
      await axe(p, "chat " + width);
      await shot(p, "messages-chat-" + width);
      if (width <= 600) {
        await p.locator("#messageInput").fill("Phone draft");
        await p.locator("#backToConversationsBtn").click();
        ok(await p.locator(".conversation-panel").isVisible(), "Back to list");
        await select(p, "REQ-A");
        ok(
          (await p.locator("#messageInput").inputValue()) === "Phone draft",
          "Back keeps draft",
        );
      }
      ok(!sends(s).length, "render no sends");
      await c.close();
      console.log("PASS layout/axe " + width);
    }
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await shot(p, "messages-" + width, true);
      await c.close();
    }
    {
      const { p, c, s } = await open({ chat: true, dest: true });
      const requestReads = s.calls.filter((o) =>
        query(o, "service_requests"),
      ).length;
      const participantCalls = s.calls.filter(
        (o) => o.name === "service_participants",
      ).length;
      await p.locator("#conversationSearch").fill("  SYNTHETIC   provider c ");
      ok((await rows(p)).join(",") === "REQ-B", "case/space Provider search");
      await shot(p, "search-results");
      await p.locator("#conversationSearch").fill("req-a");
      ok((await rows(p)).join(",") === "REQ-A", "request ID search");
      await p.locator("#conversationSearch").fill("tap repair");
      ok((await rows(p)).join(",") === "REQ-B", "title search");
      await p.locator("#conversationSearch").fill("delivery");
      ok((await rows(p)).join(",") === "REQ-C", "category search");
      await p.locator("#conversationSearch").fill("");
      await p.locator('[data-conversation-filter="active"]').click();
      ok(
        (await rows(p)).join(",") === "REQ-B,REQ-C,REQ-D",
        "active exact statuses",
      );
      await shot(p, "filter-active");
      await p.locator('[data-conversation-filter="completed"]').click();
      ok((await rows(p)).join(",") === "REQ-A", "completed exact status");
      await shot(p, "filter-completed");
      await p.locator("#conversationSearch").fill("no matching");
      ok(
        await p
          .getByRole("heading", { name: "No conversations match your search" })
          .isVisible(),
        "filtered empty distinct",
      );
      ok(
        (await p.locator("#chatRequestId").textContent()) === "REQ-A",
        "filters preserve selected chat",
      );
      await shot(p, "search-empty");
      await p.locator("#clearConversationSearchBtn").click();
      ok((await rows(p)).length === 4, "clear resets local filters");
      ok(
        s.calls.filter((o) => query(o, "service_requests")).length ===
          requestReads,
        "no search query",
      );
      ok(
        s.calls.filter((o) => o.name === "service_participants").length ===
          participantCalls,
        "no per-key participant lookup",
      );
      await p.locator("#messageInput").fill("Draft A\nsecond line");
      await select(p, "REQ-B");
      await p.locator("#messageInput").fill("Draft B");
      await select(p, "REQ-A");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Draft A\nsecond line",
        "A draft restored",
      );
      await select(p, "REQ-B");
      ok(
        (await p.locator("#messageInput").inputValue()) === "Draft B",
        "B draft restored",
      );
      await shot(p, "selected-conversation");
      await p.locator("#viewChatRequestBtn").click();
      await p.waitForURL("**/request-details.html?request_id=REQ-B");
      ok(true, "actual details navigation");
      await c.close();
    }
    for (const id of [
      "REQ-A",
      "FOREIGN",
      "CANCELLED",
      "NOT-SELECTED",
      "<invalid>&",
    ]) {
      const { p, c, s } = await open({ width: 390, id });
      if (id === "REQ-A") {
        await loaded(p);
        ok(await p.locator(".chat-panel").isVisible(), "deep link mobile chat");
        await shot(p, "deep-link-390");
      } else {
        ok(
          await p.locator("#chatArea").isHidden(),
          "bad deep link no fallback selection " + id,
        );
        ok(
          !reads(s).length && !writes(s).length,
          "bad deep link no message access",
        );
      }
      await c.close();
    }
    for (const mode of ["empty", "error", "throw", "participants"]) {
      let fail = mode !== "empty";
      const { p, c, s } = await open({
        id: mode === "participants" ? "REQ-A" : undefined,
        prepare: (t) => {
          if (mode === "empty") t.service_requests = [];
        },
        fail: (o) =>
          fail &&
          (mode === "participants"
            ? o.name === "service_participants"
            : query(o, "service_requests"))
            ? mode === "throw"
              ? "throw"
              : true
            : false,
      });
      if (mode === "empty") {
        ok(
          await p
            .getByRole("heading", { name: "No conversations yet" })
            .isVisible(),
          "honest empty",
        );
        await shot(p, "empty-conversations");
      } else if (mode === "participants") {
        ok(
          await p.locator("#messageInput").isDisabled(),
          "missing participant disables send",
        );
        ok(
          (await p.locator("#chatProviderName").textContent()) ===
            "Provider information unavailable",
          "no guessed recipient",
        );
        ok(!reads(s).length, "no history before peer verified");
        await shot(p, "participant-unavailable");
        fail = false;
        await p.locator("#retryParticipantsBtn").click();
        await loaded(p);
        ok(true, "participant retry real");
      } else {
        ok(
          await p
            .getByRole("heading", { name: "Unable to load conversations" })
            .isVisible(),
          "load error " + mode,
        );
        ok(
          (await p.locator("#conversationCount").textContent()) === "—",
          "error not fake zero",
        );
        if (mode === "error") await shot(p, "conversation-load-error");
        fail = false;
        await p.locator("#retryConversationsBtn").click();
        await loaded(p);
        ok((await rows(p)).length === 4, "retry actual owned fetch");
      }
      await c.close();
    }
    {
      let fail = true;
      const { p, c, s } = await open({
        id: "REQ-A",
        fail: (o) =>
          fail &&
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "select"),
      });
      await p
        .getByRole("heading", { name: "Unable to load messages" })
        .waitFor();
      ok(
        await p.locator("#messageInput").isDisabled(),
        "history error blocks send",
      );
      ok(!writes(s).length, "no mark read after failed fetch");
      await shot(p, "message-load-error");
      fail = false;
      await p.locator("#retryMessagesBtn").click();
      await loaded(p);
      ok((await p.locator(".message-bubble").count()) === 4, "history retry");
      await c.close();
    }
    {
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        fail: (o) =>
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "update"),
      });
      await p.waitForFunction(() =>
        document
          .querySelector("#chatReadStatus")
          .textContent.includes("could not be updated"),
      );
      ok(
        await p.locator("#sendMessageBtn").isEnabled(),
        "read update failure keeps chat usable",
      );
      ok(
        s.tables.internal_messages.find((m) => m.id === "a1").is_read === false,
        "read failure never claims update",
      );
      await shot(p, "read-state-error");
      await c.close();
    }
    {
      const { p, c, s } = await open({ id: "REQ-A", chat: true });
      await waitNode(() => writes(s).length > 0);
      const op = writes(s)[0];
      for (const [col, value] of [
        ["request_id", "REQ-A"],
        ["receiver_id", ids.client],
        ["sender_id", ids.provider],
        ["is_read", false],
      ])
        ok(
          op.calls.some((c) => c[0] === "eq" && c[1] === col && c[2] === value),
          "read predicate " + col,
        );
      ok(
        s.tables.internal_messages.find((m) => m.id === "a2").is_read === false,
        "own outgoing unread not marked",
      );
      ok(
        s.tables.internal_messages.find((m) => m.id === "former").is_read ===
          false,
        "former messages not marked",
      );
      ok(
        s.tables.internal_messages.find((m) => m.id === "b1").is_read === false,
        "unopened request not marked",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({ id: "REQ-A", chat: true });
      await p.locator("#messageInput").fill("   ");
      await p
        .locator("#messageForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      await notice(p, "Please type");
      ok(!sends(s).length, "empty rejection");
      await p.locator("#messageInput").fill("X".repeat(1000));
      ok(
        (await p.locator("#messageInput").inputValue()) === "X".repeat(1000),
        "1000 allowed",
      );
      await p.locator("#messageInput").evaluate((e) => {
        e.value = "X".repeat(1001);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await p
        .locator("#messageForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      await notice(p, "1,000 characters");
      ok(!sends(s).length, "programmatic oversize rejected");
      await p.locator("#messageInput").fill("First line");
      await p.locator("#messageInput").press("Enter");
      await p.keyboard.insertText("Second line");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "First line\nSecond line",
        "Enter newline not send",
      );
      ok(!sends(s).length, "no accidental Enter send");
      await p.locator("#sendMessageBtn").focus();
      await p.keyboard.press("Enter");
      await notice(p, "Message saved");
      ok(sends(s).length === 1, "keyboard sends once");
      const payload = sends(s)[0].calls.find((c) => c[0] === "insert")[1];
      ok(
        Object.keys(payload).sort().join(",") ===
          "created_at,id,is_read,message_id,message_text,receiver_id,request_id,sender_id",
        "exact insert contract",
      );
      ok(
        payload.request_id === "REQ-A" &&
          payload.sender_id === ids.client &&
          payload.receiver_id === ids.provider,
        "captured authorized pair",
      );
      ok(
        payload.message_text === "First line\nSecond line" &&
          payload.is_read === false,
        "text and read defaults preserved",
      );
      ok(
        !(await p.locator(".message-bubble.pending").count()),
        "confirmed not pending",
      );
      await assertCounter(p, "successful send resets counter");
      await refinementShot(p, "after/successful-send-counter");
      await shot(p, "sent-message");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        delay: (o) =>
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "insert")
            ? hold
            : undefined,
      });
      await p.locator("#messageInput").fill("Synthetic pending message");
      await p.locator("#sendMessageBtn").click();
      await waitNode(() => sends(s).length === 1);
      ok(
        await p.locator(".message-bubble.pending").isVisible(),
        "pending bubble marked",
      );
      ok(
        (await p.locator(".message-bubble.pending").textContent()).includes(
          "Not yet confirmed",
        ),
        "no optimistic delivery",
      );
      await assertCounter(
        p,
        "pending clear synchronises counter before acknowledgement",
      );
      await shot(p, "sending");
      await p
        .locator("#messageForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      ok(sends(s).length === 1, "pending lock");
      await select(p, "REQ-B");
      await p.locator("#messageInput").fill("New B draft while A sends");
      release();
      await p.waitForFunction(
        () => !document.querySelector("#sendMessageBtn").disabled,
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "New B draft while A sends",
        "old send preserves B input",
      );
      await assertCounter(p, "old send retains B counter");
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "Synthetic pending message",
        ),
        "old send no B bubble",
      );
      ok(
        s.tables.internal_messages.some(
          (m) =>
            m.message_text === "Synthetic pending message" &&
            m.request_id === "REQ-A" &&
            m.receiver_id === ids.provider,
        ),
        "send captured A",
      );
      await c.close();
    }
    for (const mode of ["error", "throw"]) {
      let failed = true;
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        fail: (o) =>
          failed &&
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "insert")
            ? mode === "throw"
              ? "throw"
              : true
            : false,
      });
      await p
        .locator("#messageInput")
        .fill("Preserve this exact draft\nRetry safely");
      await p.locator("#sendMessageBtn").click();
      await notice(
        p,
        mode === "throw" ? "could not be confirmed" : "draft has been kept",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Preserve this exact draft\nRetry safely",
        "draft restored " + mode,
      );
      ok(
        (await p.locator(".message-bubble.pending").count()) === 0,
        "failed optimistic removed",
      );
      await assertCounter(p, "failed send counter " + mode);
      await refinementShot(p, "after/failed-send-counter-" + mode);
      await shot(p, "failed-send-" + mode);
      const first = sends(s)[0].calls.find((c) => c[0] === "insert")[1];
      failed = false;
      await p.locator("#sendMessageBtn").click();
      await notice(p, "Message saved");
      const last = sends(s)
        .at(-1)
        .calls.find((c) => c[0] === "insert")[1];
      ok(
        first.id === last.id &&
          first.message_id === last.message_id &&
          first.created_at === last.created_at,
        "retry exact identifiers/time " + mode,
      );
      ok(
        s.tables.internal_messages.filter((m) => m.id === first.id).length ===
          1,
        "one confirmed retry " + mode,
      );
      await c.close();
    }
    {
      let fail = true;
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        fail: (o, state) => {
          if (
            fail &&
            query(o, "internal_messages") &&
            o.calls.some((c) => c[0] === "insert")
          ) {
            state.tables.internal_messages.push(
              structuredClone(o.calls.find((c) => c[0] === "insert")[1]),
            );
            return "throw";
          }
          return false;
        },
      });
      await p
        .locator("#messageInput")
        .fill("Already committed but response lost");
      await p.locator("#sendMessageBtn").click();
      await notice(p, "could not be confirmed");
      fail = false;
      await p.locator("#sendMessageBtn").click();
      await notice(p, "earlier message is saved");
      await assertCounter(p, "reconciled earlier attempt resets counter");
      ok(
        sends(s).length === 1,
        "lost-response retry reads existing UUID without another insert",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) === "",
        "confirmed restored draft clears",
      );
      await c.close();
    }
    {
      let failInsert = true,
        failRead = false;
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        fail: (o) =>
          query(o, "internal_messages") &&
          ((failInsert && o.calls.some((c) => c[0] === "insert")) ||
            (failRead && o.calls.some((c) => c[0] === "select"))),
      });
      await p.locator("#messageInput").fill("Uncertain check must succeed");
      await p.locator("#sendMessageBtn").click();
      await notice(p, "draft has been kept");
      failInsert = false;
      failRead = true;
      await p.locator("#sendMessageBtn").click();
      await notice(p, "earlier message could not be checked");
      ok(sends(s).length === 1, "failed reconciliation never retries insert");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Uncertain check must succeed",
        "check failure retains draft",
      );
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      let held = false;
      const { p, c, s } = await open({
        id: "REQ-A",
        delay: (o) => {
          if (
            query(o, "internal_messages") &&
            o.calls.some((c) => c[0] === "select") &&
            o.calls.some(
              (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "REQ-A",
            )
          ) {
            held = true;
            return hold;
          }
        },
      });
      await waitNode(() => held);
      await select(p, "REQ-B");
      await p.locator("#messageInput").fill("B during slow A read");
      release();
      await p.waitForTimeout(100);
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "completed the requested cleaning",
        ),
        "stale A response rejected",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "B during slow A read",
        "stale read never changes B draft",
      );
      ok(
        !writes(s).some((o) =>
          o.calls.some(
            (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "REQ-A",
          ),
        ),
        "unseen stale load never marks A read",
      );
      const n = reads(s).length;
      await p.clock.runFor(3100);
      await waitNode(() => reads(s).length > n);
      ok(reads(s).length === n + 1, "one current thread poll");
      ok(
        reads(s)
          .at(-1)
          .calls.some(
            (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "REQ-B",
          ),
        "old timer replaced",
      );
      for (let i = 0; i < 4; i++) await select(p, "REQ-B");
      const count = reads(s).length;
      await p.clock.runFor(3100);
      await waitNode(() => reads(s).length > count);
      ok(reads(s).length === count + 1, "repeated selections retain one timer");
      await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      const paused = reads(s).length;
      await p.clock.runFor(10000);
      ok(reads(s).length === paused, "pagehide cleans up polling");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        delay: (o) =>
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "insert")
            ? hold
            : undefined,
        fail: (o) =>
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "insert"),
      });
      await p.locator("#messageInput").fill("A failed send draft");
      await p.locator("#sendMessageBtn").click();
      await select(p, "REQ-B");
      await p.locator("#messageInput").fill("B independently typed");
      release();
      await p.waitForFunction(
        () => !document.querySelector("#sendMessageBtn").disabled,
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "B independently typed",
        "A failure does not replace B draft",
      );
      await select(p, "REQ-A");
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "A failed send draft",
        "A failure restored when returning",
      );
      await assertCounter(p, "A late failure counter restored");
      await c.close();
    }
    {
      const { p, c, s } = await open({
        id: "REQ-A",
        chat: true,
        prepare: (t) => {
          const sample = t.internal_messages[0];
          t.internal_messages = Array.from({ length: 70 }, (_, i) => ({
            ...sample,
            id: "history-" + i,
            message_id: "MSG-HISTORY-" + i,
            message_text:
              "Synthetic history " + i + "\n" + "Readable long text ".repeat(5),
            created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
          }));
        },
      });
      await p.setViewportSize({ width: 1366, height: 768 });
      await p.locator("#messagesList").evaluate((e) => (e.scrollTop = 90));
      await p.setViewportSize({ width: 1536, height: 864 });
      ok(
        Math.abs(
          (await p.locator("#messagesList").evaluate((e) => e.scrollTop)) - 90,
        ) < 2,
        "resize retains older history position",
      );
      await p.evaluate(() => scrollTo(0, 0));
      const pageScrollBeforePoll = await p.evaluate(() => scrollY);
      await p.locator("#messagesList").focus();
      await p.keyboard.press("PageDown");
      await p.clock.runFor(350);
      await p.waitForTimeout(200);
      ok(
        await p.locator("#messagesList").evaluate((e) => e.scrollTop > 90),
        "keyboard scrolls message region",
      );
      await p.locator("#messagesList").evaluate((e) => (e.scrollTop = 0));
      await p.evaluate(
        () =>
          (window.__originalBubble = document.querySelector(".message-bubble")),
      );
      let n = reads(s).length;
      await p.clock.runFor(3100);
      await waitNode(() => reads(s).length > n);
      await p.waitForTimeout(50);
      ok(
        await p.evaluate(
          () =>
            window.__originalBubble ===
            document.querySelector(".message-bubble"),
        ),
        "unchanged poll retains DOM",
      );
      ok(
        (await p.locator("#messagesList").evaluate((e) => e.scrollTop)) < 2,
        "unchanged poll retains reading position",
      );
      s.tables.internal_messages.push({
        ...s.tables.internal_messages[0],
        id: "history-new",
        message_id: "MSG-NEW-HISTORY",
        message_text: "New authorised incoming message",
        created_at: "2026-11-02T09:00:00Z",
        is_read: false,
      });
      n = reads(s).length;
      await p.clock.runFor(3100);
      await p
        .getByText("New authorised incoming message", { exact: true })
        .waitFor();
      ok(
        (await p.locator("#messagesList").evaluate((e) => e.scrollTop)) < 2,
        "new message does not force reader bottom",
      );
      ok(
        await p.locator("#showLatestMessagesBtn").isVisible(),
        "reader can choose latest",
      );
      ok(
        (await p.evaluate(() => scrollY)) === pageScrollBeforePoll,
        "incoming poll never scrolls outer page",
      );
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const pausedReads = reads(s).length;
      await p.clock.runFor(6100);
      ok(reads(s).length === pausedReads, "hidden tab pauses polling");
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitNode(() => reads(s).length > pausedReads);
      await p.waitForTimeout(50);
      ok(
        await p.locator("#messagesList").evaluate((e) => e.scrollTop < 2),
        "tab resume preserves older reading position",
      );

      await p.locator("#showLatestMessagesBtn").click();
      ok(
        (await p
          .locator("#messagesList")
          .evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight)) < 3,
        "latest action scrolls actual history",
      );
      await p.locator("#messageInput").fill("Draft survives every poll");
      n = reads(s).length;
      await p.clock.runFor(3100);
      await waitNode(() => reads(s).length > n);
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Draft survives every poll",
        "poll never resets composer",
      );
      await assertCounter(p, "poll retains counter");
      await refinementShot(p, "after/long-history");
      await shot(p, "long-history");
      await c.close();
    }
    {
      const { p, c, s } = await open({
        width: 320,
        id: "REQ-A",
        chat: true,
        prepare: (t) => {
          t.users.find((u) => u.id === ids.provider).full_name =
            "Synthetic Provider With A Very Long Name " + "NAME".repeat(12);
          const r = t.service_requests.find((r) => r.request_id === "REQ-A");
          r.title = "Very long service title " + "TITLE".repeat(35);
          r.preferred_date = null;
          r.preferred_time = null;
          t.internal_messages[0].message_text =
            '<img src=x onerror="window.__chatXss=1">\n' +
            "https://synthetic.invalid/".repeat(35) +
            "\nEmoji: 👋🙂";
        },
      });
      ok(
        (await p.locator("#messagesList img").count()) === 0,
        "message HTML never interpreted",
      );
      ok(!(await p.evaluate(() => window.__chatXss)), "no XSS execution");
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long names/URLs bounded",
      );
      ok(
        (await p.locator("#chatPreferredSchedule").textContent()).includes(
          "not specified",
        ),
        "no invented optional schedule",
      );
      await axe(p, "long data 320");
      await shot(p, "long-message-320");
      await c.close();
    }
    {
      const { p, c, s } = await open({ width: 390, id: "REQ-A", chat: true });
      await p.locator("#messageInput").fill("Mobile draft persists");
      await p.locator("#backToConversationsBtn").click();
      await select(p, "REQ-B");
      await p.locator("#messageInput").fill("Other mobile draft");
      await p.goBack();
      ok(
        await p.locator(".conversation-panel").isVisible(),
        "browser Back returns list state",
      );
      await p.goBack();
      await loaded(p);
      ok(
        (await p.locator("#chatRequestId").textContent()) === "REQ-A",
        "browser Back restores authorised A link",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Mobile draft persists",
        "history navigation retains draft",
      );
      await p.locator("#messageInput").focus();
      await p.setViewportSize({ width: 390, height: 430 });
      await p.waitForTimeout(80);
      await p.locator("#messageForm").scrollIntoViewIfNeeded();
      const rect = await p.locator("#sendMessageBtn").boundingBox();
      ok(
        rect.y >= 0 && rect.y + rect.height <= 430,
        "short visual viewport can reach Send",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "keyboard-sized viewport no horizontal overflow",
      );
      ok(!sends(s).length, "navigation/keyboard sizing no send");
      await c.close();
    }
    {
      const { p, c, s } = await open({ id: "REQ-C", chat: true });
      ok(
        await p.getByRole("heading", { name: "No messages yet" }).isVisible(),
        "empty history honest",
      );
      await shot(p, "empty-history");
      await c.close();
    }
    {
      let release;
      const hold = new Promise((r) => (release = r));
      const { p, c } = await open({
        id: "REQ-A",
        noWait: true,
        delay: (o) =>
          query(o, "internal_messages") &&
          o.calls.some((c) => c[0] === "select")
            ? hold
            : undefined,
      });
      await p.locator("#chatArea:not(.hidden)").waitFor();
      ok(
        await p.locator("#messageInput").isDisabled(),
        "loading disables composer",
      );
      await shot(p, "loading-messages");
      release();
      await loaded(p);
      await c.close();
    }
    {
      const { p, c, s } = await open({ id: "REQ-A", chat: true });
      await p.locator("#profileMenuTrigger").click();
      ok(
        await p
          .locator('#profileDropdown a[href="edit-profile.html"]')
          .isVisible(),
        "account profile link",
      );
      ok(
        await p
          .locator('#profileDropdown a[href="verification.html"]')
          .isVisible(),
        "identity link retained",
      );
      await p.keyboard.press("Escape");
      await p.locator("#notificationMenuTrigger").click();
      ok(
        await p.locator("#notificationDropdown").isVisible(),
        "notification menu",
      );
      await p.keyboard.press("Escape");
      await p.locator("#profileMenuTrigger").click();
      await p.locator("#profileLogoutBtn").click();
      await p.waitForURL("**/login.html");
      ok(
        s.authEvents.some((o) => o.name === "signOut"),
        "real logout helper",
      );
      await c.close();
    }
    for (const role of ["provider", "admin"]) {
      const { p, c, s } = await open({ role, noWait: true, id: "REQ-A" });
      // The unchanged guard issues sign-out-event and cleanup redirects to the same URL.
      // Check the committed URL without binding to either redundant navigation's lifecycle.
      await waitNode(() => new URL(p.url()).pathname === "/login.html");
      ok(
        new URL(p.url()).pathname === "/login.html",
        "wrong role redirected to Login",
      );
      ok(
        !s.calls.some(
          (o) => query(o, "service_requests") || query(o, "internal_messages"),
        ),
        "wrong role cannot fetch Client conversations " + role,
      );
      await c.close();
    }
    {
      const { p, c } = await open({ id: "REQ-A", chat: true, motion: true });
      await p.waitForTimeout(600);
      ok(
        (await p.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        )) === 0,
        "finite idle motion",
      );
      await p.emulateMedia({ reducedMotion: "reduce" });
      ok(
        (await p
          .locator(".messages-hero")
          .evaluate((e) => getComputedStyle(e).animationName)) === "none",
        "reduced motion",
      );
      await c.close();
    }
    ok(!errors.length, "no page errors " + errors.join(","));
    ok(
      !external.length,
      "no external traffic (all blocked) " + external.join(","),
    );
    fs.writeFileSync(
      out + "/responsive-metrics.json",
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      out + "/validation/focused.json",
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
      `PASS ${checks} Client Messages assertions; ${scans} axe scans; synthetic backend only`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
