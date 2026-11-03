/* Asynchronous unread acknowledgements, newer drafts, IME and long-list layout. */
const { chromium } = require("playwright"),
  { install, seed, ids } = require("./system-fixture.cjs"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4216";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
let checks = 0;
const ok = (v, m) => {
  assert(v, m);
  checks++;
};
const insert = (o) =>
  o.kind === "query" &&
  o.table === "internal_messages" &&
  o.calls.some((c) => c[0] === "insert");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
        viewport: { width: 1366, height: 768 },
      }),
      t = seed(),
      sample = t.service_requests[1];
    t.service_requests = [
      { ...sample, request_id: "A", title: "Synthetic service A" },
      { ...sample, request_id: "B", title: "Synthetic service B" },
    ];
    t.internal_messages = [
      {
        id: "IN-A",
        message_id: "MSG-IN-A",
        request_id: "A",
        sender_id: ids.client,
        receiver_id: ids.provider,
        message_text: "Synthetic incoming A",
        created_at: "2026-11-03T02:00:00Z",
        is_read: false,
      },
    ];
    opt.prepare?.(t);
    const gate = { hold: opt.hold || null };
    const s = await install(c, {
      role: "provider",
      tables: t,
      delay: (o) => gate.hold?.(o),
    });
    const p = await c.newPage();
    await p.goto(base + "/provider/messages.html?request_id=A");
    await p.waitForFunction(
      () =>
        document.body.dataset.messagesReady === "true" &&
        !document.querySelector("#messageInput").disabled,
    );
    return { p, c, s, gate };
  }
  try {
    {
      let release;
      const held = new Promise((r) => (release = r));
      const { p, c, s } = await open({
        hold: (o) =>
          o.kind === "query" &&
          o.table === "internal_messages" &&
          o.calls.some((c) => c[0] === "update") &&
          o.calls.some(
            (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "A",
          )
            ? held
            : undefined,
      });
      ok(
        await p
          .locator(".conversation-card[data-request-id=A] .conversation-unread")
          .isVisible(),
        "unread remains before acknowledgement",
      );
      await p.locator(".conversation-card[data-request-id=B]").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#chatRequestId").textContent === "B" &&
          !document.querySelector("#messageInput").disabled,
      );
      release();
      await p.waitForFunction(
        () =>
          !document.querySelector(
            ".conversation-card[data-request-id=A] .conversation-unread",
          ),
      );
      ok(
        s.tables.internal_messages[0].is_read === true,
        "server acknowledged original incoming ID",
      );
      ok(
        (await p.locator("#chatRequestId").textContent()) === "B",
        "late read acknowledgement keeps current thread",
      );
      ok(
        !(await p.locator("#messagesList").textContent()).includes(
          "incoming A",
        ),
        "late read never replaces current history",
      );
      await c.close();
    }
    {
      const { p, c, s, gate } = await open();
      let release;
      const held = new Promise((r) => (release = r));
      gate.hold = (o) => (insert(o) ? held : undefined);
      await p.locator("#messageInput").fill("First submitted text");
      await p.locator("#sendMessageBtn").click();
      await p.waitForFunction(
        () => document.body.dataset.messageSending === "true",
      );
      await p.locator("#messageInput").fill("Newer unsent draft");
      release();
      await p.waitForFunction(
        () => document.body.dataset.messageSending === "false",
      );
      ok(
        (await p.locator("#messageInput").inputValue()) ===
          "Newer unsent draft",
        "acknowledgement preserves newer draft",
      );
      ok(
        (await p.locator("#messageCharacterCount").textContent()) ===
          "18 / 1,000",
        "newer draft counter accurate",
      );
      ok(
        s.tables.internal_messages.filter(
          (r) => r.message_text === "First submitted text",
        ).length === 1,
        "one persisted original send",
      );
      await p
        .locator("#messageInput")
        .evaluate((e) =>
          e.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              isComposing: true,
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
      ok(s.calls.filter(insert).length === 1, "IME Enter never sends");
      const before = await p
        .locator("#messageInput")
        .evaluate((e) => e.getBoundingClientRect().height);
      await p.locator("#messageInput").fill("Multiline\n".repeat(12));
      const after = await p
        .locator("#messageInput")
        .evaluate((e) => e.getBoundingClientRect().height);
      ok(
        after > before && after <= 146,
        "textarea expands within bounded height",
      );
      await c.close();
    }
    {
      const { p, c, s } = await open({
        prepare: (t) => {
          for (let i = 0; i < 38; i++)
            t.service_requests.push({
              ...t.service_requests[0],
              request_id: "EXTRA-" + i,
              title: "Synthetic extra service " + i,
            });
        },
      });
      ok(
        (await p.locator(".conversation-card").count()) === 40,
        "long eligible collection",
      );
      ok(
        await p
          .locator("#conversationList")
          .evaluate((e) => e.scrollHeight > e.clientHeight),
        "long list scrolls independently",
      );
      const top = await p.evaluate(() => scrollY),
        before = await p.locator("#messageForm").boundingBox();
      await p.locator("#conversationList").evaluate((e) => (e.scrollTop = 120));
      const after = await p.locator("#messageForm").boundingBox();
      ok(
        (await p.evaluate(() => scrollY)) === top &&
          Math.abs(before.y - after.y) < 1,
        "list scroll does not move page/composer",
      );
      const batch = s.calls.filter(
        (o) =>
          o.kind === "query" &&
          o.table === "internal_messages" &&
          o.calls.some((c) => c[0] === "in" && c[1] === "request_id") &&
          !o.calls.some((c) => c[0] === "update"),
      );
      ok(
        batch.length === 2,
        "two scoped overview reads rather than one query per card",
      );
      ok(
        after.y + after.height <= 768,
        "long list composer visible at 1366x768",
      );
      await c.close();
    }
    fs.mkdirSync("docs/provider-messages/validation", { recursive: true });
    fs.writeFileSync(
      "docs/provider-messages/validation/edge.json",
      JSON.stringify({ assertions: checks, liveBackend: false }, null, 2) +
        "\n",
    );
    console.log(
      `PASS ${checks} async unread/draft/IME/long-list layout assertions; local fixtures only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
