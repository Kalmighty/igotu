/* Browser interactions against a stateful synthetic backend. Never proves RLS or live integrations.
   NODE_PATH=... AXE_PATH=... node tests/system-functional.cjs
   SYSTEM_CASE=substring SYSTEM_RESULTS=work/system-audit/results.json */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { install, seed, ids } = require("./system-fixture.cjs");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
const tests = [];
const test = (name, run) => tests.push({ name, run });
const writes = (s, table) =>
  s.calls.filter(
    (o) =>
      o.kind === "query" &&
      o.table === table &&
      o.calls.some((c) => c[0] === "insert"),
  );
const png = {
  name: "synthetic.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=",
    "base64",
  ),
};
async function ready(page, url) {
  await page.goto(`${base}/${url}`);
  if (await page.locator("body[data-access-state]").count())
    await page.waitForFunction(
      () => document.body.dataset.accessState === "allowed",
    );
  await page.waitForTimeout(150);
}
async function waitForFixture(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Synthetic transport barrier was not reached");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
async function requestForm(p) {
  await p.locator("#title").fill("Synthetic home clean");
  await p.locator("#category").selectOption("Cleaning");
  await p.locator("#serviceType").selectOption("Home Cleaning");
  await p
    .locator("#description")
    .fill("Synthetic service request for testing only");
  await p.locator("#preferredDate").fill("2026-11-02");
  await p.locator("#preferredTime").fill("10:00");
  await p.locator("#location").fill("Synthetic Likas, Sabah");
  await p.evaluate(() => {
    document.querySelector("#clientLat").value = "6.04";
    document.querySelector("#clientLng").value = "116.12";
  });
}
for (const table of ["service_request_declines", "service_requests"])
  test(`Matching fails closed when ${table} eligibility lookup fails`, async ({
    page,
    state,
  }) => {
    state.tables.service_requests = state.tables.service_requests.filter(
      (r) => r.request_id === "REQ-PENDING",
    );
    state.fail = (o) => o.kind === "rpc" && o.name === "recommended_provider_candidates";
    await ready(
      page,
      "client/recommended-providers.html?request_id=REQ-PENDING",
    );
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".select-provider-btn").count(), 0);
    assert.match(
      await page.locator("#messageBox").textContent(),
      /unable|could not/i,
    );
  });
test("Image failure retry preserves one committed service request", async ({
  page,
  state,
}) => {
  state.fail = (o) => o.kind === "storage" && o.action === "upload";
  await ready(page, "client/create-request.html");
  await requestForm(page);
  await page.locator("#requestImage").setInputFiles(png);
  await page.locator("#createRequestBtn").click();
  await page.waitForFunction(
    () => !document.querySelector("#createRequestBtn").disabled,
  );
  assert.equal(state.calls.filter(o=>o.kind==="rpc" && o.name==="create_service_request").length, 1);
  await page.locator("#createRequestBtn").click();
  await page.waitForFunction(
    () => !document.querySelector("#createRequestBtn").disabled,
  );
  assert.equal(
    state.calls.filter(o=>o.kind==="rpc" && o.name==="create_service_request").length,
    1,
    "Retry inserted a second service request",
  );
  assert.match(page.url(), /request_id=REQ-NEW/);
});
for (const role of ["client", "provider"])
  test(`${role} failed message restores draft without duplicate sends`, async ({
    page,
    state,
  }) => {
    state.role = role;
    state.fail = (o) =>
      o.kind === "query" &&
      o.table === "internal_messages" &&
      o.calls.some((c) => c[0] === "insert");
    await ready(page, `${role}/messages.html?request_id=REQ-A`);
    await page.locator("#chatArea:not(.hidden)").waitFor();
    await page.locator("#messageInput").fill("Preserve this synthetic draft");
    await page.locator("#sendMessageBtn").click();
    await page.waitForFunction(
      () => !document.querySelector("#sendMessageBtn").disabled,
    );
    assert.equal(
      await page.locator("#messageInput").inputValue(),
      "Preserve this synthetic draft",
    );
  });
for (const role of ["client", "provider"])
  test(`${role} slow message response cannot overwrite another conversation`, async ({
    page,
    state,
  }) => {
    state.role = role;
    state.tables.internal_messages = [
      {
        id: "m-a",
        request_id: "REQ-A",
        message_text: "Only thread A",
        sender_id: ids.client,
        receiver_id: ids.provider,
        created_at: "2026-01-01",
        is_read: false,
      },
      {
        id: "m-b",
        request_id: "REQ-B",
        message_text: "Only thread B",
        sender_id: ids.provider,
        receiver_id: ids.client,
        created_at: "2026-01-02",
        is_read: false,
      },
    ];
    let release;
    const gate = new Promise((r) => (release = r));
    let held = false;
    state.delay = async (o) => {
      if (
        o.kind === "query" &&
        o.table === "internal_messages" &&
        o.calls.some((c) => c[0] === "select") &&
        o.calls.some(
          (c) => c[0] === "eq" && c[1] === "request_id" && c[2] === "REQ-A",
        )
      ) {
        held = true;
        await gate;
      }
    };
    await ready(page, `${role}/messages.html?request_id=REQ-A`);
    await waitForFixture(() => held);
    assert.ok(held);
    await page.locator('[data-request-id="REQ-B"]').click();
    await page.getByText("Only thread B", { exact: true }).waitFor();
    release();
    await page.waitForTimeout(150);
    assert.equal(
      await page.getByText("Only thread A", { exact: true }).count(),
      0,
    );
    assert.match(
      await page.locator("#messagesList").textContent(),
      /Only thread B/,
    );
  });
test("Notification transport failure does not turn committed Admin approval into failure", async ({
  page,
  state,
}) => {
  state.role = "admin";
  const v = state.tables.verification_requests[0];
  v.status = "pending";
  state.fail = (o) =>
    o.kind === "query" &&
    o.table === "notifications" &&
    o.calls.some((c) => c[0] === "insert")
      ? "throw"
      : false;
  await ready(page, "admin/verifications.html");
  await page.locator(".approve-verification-btn").click();
  await page.locator('#verificationReviewForm button[type="submit"]').click();
  await page.waitForTimeout(200);
  assert.equal(v.status, "approved");
  assert.match(
    await page.locator("#messageBox").textContent(),
    /approved successfully/i,
  );
});
test("Provider load failure cannot overwrite previously saved specializations", async ({
  page,
  state,
}) => {
  state.role = "provider";
  state.fail = (o) =>
    o.kind === "query" && o.table === "provider_specializations";
  await ready(page, "provider/edit-profile.html");
  await page.locator('input[name="skills"][value="Cleaning"]').check();
  await page
    .locator('input[name="specializations"][value="Home Cleaning"]')
    .check();
  await page.locator("#saveProfileBtn").click();
  await page.waitForTimeout(100);
  assert.equal(
    state.calls.some(
      (o) =>
        o.kind === "query" &&
        o.calls.some((c) =>
          ["delete", "upsert", "insert", "update"].includes(c[0]),
        ) &&
        [
          "provider_profiles",
          "provider_skills",
          "provider_specializations",
        ].includes(o.table),
    ),
    false,
    "Save ran after incomplete load",
  );
});
test("Admin cancelling resolution prompt does not resolve report", async ({
  page,
  state,
}) => {
  state.role = "admin";
  state.tables.service_reports = [
    {
      id: "report-1",
      request_id: "REQ-A",
      reporter_id: ids.client,
      reported_user_id: ids.provider,
      reason: "Service issue",
      description: "Synthetic report only",
      status: "under_review",
      created_at: "2026-10-26",
    },
  ];
  page.on("dialog", (d) => d.dismiss());
  await ready(page, "admin/reports.html");
  await page.locator("#statusFilter").selectOption("under_review");
  await page.locator('.review-report-btn[data-status="resolved"]').click();
  await page.waitForTimeout(100);
  assert.equal(state.tables.service_reports[0].status, "under_review");
});
test("Incoming request never displays a short exact street address before confirmation", async ({
  page,
  state,
}) => {
  state.role = "provider";
  state.tables.service_requests[1].status = "provider_selected";
  await ready(page, "provider/incoming-requests.html");
  await page.locator(".incoming-card").waitFor();
  assert.equal(
    (await page.locator("#incomingList").textContent()).includes("Unit 7"),
    false,
  );
});
test("Cancellation dialog traps keyboard focus and restores its opener", async ({
  page,
}) => {
  await ready(page, "client/my-requests.html");
  const open = page.locator(".cancel-btn").first();
  await open.click();
  await page.locator("#serviceReasonSelect").waitFor();
  await page.locator(".service-reason-confirm").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".service-reason-close")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await open.evaluate((e) => e === document.activeElement), true);
});
test("Forgot password handles thrown transport errors and restores submit", async ({
  page,
  state,
}) => {
  state.fail = (o) =>
    o.kind === "auth" && o.name === "resetPasswordForEmail" ? "throw" : false;
  await ready(page, "forgot-password.html");
  await page.locator("#email").fill("fixture@example.invalid");
  await page.locator("#forgotPasswordBtn").click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#forgotPasswordBtn").isEnabled(), true);
  assert.match(
    await page.locator("#messageBox").textContent(),
    /unable|failed/i,
  );
});
test("Signup handles thrown transport errors and restores submit", async ({
  page,
  state,
}) => {
  state.fail = (o) =>
    o.kind === "auth" && o.name === "signUp" ? "throw" : false;
  await ready(page, "register.html");
  await page.locator("#fullName").fill("Sample Client");
  await page.locator("#email").fill("fixture@example.invalid");
  await page.locator("#role").selectOption("client");
  await page.locator("#password").fill("Fixture123");
  await page.locator("#confirmPassword").fill("Fixture123");
  await page.locator("#registerBtn").click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#registerBtn").isEnabled(), true);
  assert.match(
    await page.locator("#messageBox").textContent(),
    /unable|failed|could not/i,
  );
});
test("Verification insert and cleanup failure restores form without exposing private paths", async ({
  page,
  state,
}) => {
  const u = state.tables.users[0];
  u.identity_verified = false;
  state.tables.verification_requests =
    state.tables.verification_requests.filter((v) => v.user_id !== u.id);
  state.fail = (o) =>
    o.kind === "query" &&
    o.table === "verification_requests" &&
    o.calls.some((c) => c[0] === "insert")
      ? true
      : o.kind === "storage" && o.action === "remove"
        ? "throw"
        : false;
  await ready(page, "client/verification.html");
  await page.locator("#idType").selectOption("passport");
  await page.locator("#idNumber").fill("TEST123456");
  await page.locator("#identityDocument").setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 Synthetic"),
  });
  await page.locator("#ageConfirm").check();
  await page.locator("#privacyConsent").check();
  await page.locator("#submitVerificationBtn").click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#submitVerificationBtn").isEnabled(), true);
  assert.match(
    await page.locator("#messageBox").textContent(),
    /Unable to submit/,
  );
  assert.equal(
    (await page.locator("#messageBox").textContent()).includes(u.id),
    false,
  );
});
test("Unread notification count includes items beyond the latest eight", async ({
  page,
  state,
}) => {
  state.tables.notifications = Array.from({ length: 11 }, (_, i) => ({
    id: `note-${i}`,
    user_id: ids.client,
    title: "Synthetic update",
    message: "Sample notification",
    is_read: false,
    created_at: `2026-10-${String(10 + i).padStart(2, "0")}`,
  }));
  await ready(page, "client/dashboard.html");
  await page.locator("#notificationMenuTrigger").click();
  await page.locator(".notification-dropdown-item").first().waitFor();
  assert.equal(
    await page.locator("#notificationDropdownCount").textContent(),
    "11 unread",
  );
  await page.locator("#notificationMarkAllBtn").click();
  await page.waitForTimeout(100);
  assert.equal(
    state.tables.notifications.some((n) => !n.is_read),
    false,
  );
});

for (const table of ["payment_records", "service_reviews"])
  test(`Client does not offer duplicate settlement on failed ${table} lookup`, async ({
    page,
    state,
  }) => {
    state.fail = (o) => o.kind === "query" && o.table === table;
    await ready(page, "client/request-details.html?request_id=REQ-DONE");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#paymentForm,#reviewForm").count(), 0);
  });
test("Provider does not offer duplicate reviews when review history lookup fails", async ({
  page,
  state,
}) => {
  state.role = "provider";
  state.fail = (o) => o.kind === "query" && o.table === "service_reviews";
  await ready(page, "provider/assignment-details.html");
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".provider-review-form").count(), 0);
});
test("Connected registration, approval, onboarding and complete service workflow (synthetic)", async ({
  page,
  state,
}) => {
  state.tables.service_requests = [];
  state.tables.verification_requests = [];
  for (const table of [
    "provider_profiles",
    "provider_skills",
    "provider_specializations",
    "provider_weekly_availability",
  ])
    state.tables[table] = [];
  for (const role of ["client", "provider"]) {
    state.role = role;
    const u = state.tables.users.find((u) => u.role === role);
    u.identity_verified = false;
    u.profile_completed = false;
    await ready(page, "register.html");
    await page.locator("#fullName").fill(u.full_name);
    await page.locator("#email").fill(u.email);
    await page.locator("#role").selectOption(role);
    await page.locator("#password").fill("Fixture123");
    await page.locator("#confirmPassword").fill("Fixture123");
    await page.locator("#registerBtn").click();
    await page.waitForURL(`**/${role}/verification.html`);
    await page.locator("#idType").selectOption("passport");
    await page.locator("#idNumber").fill("TEST123456");
    await page.locator("#identityDocument").setInputFiles({
      name: "synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Synthetic"),
    });
    await page.locator("#ageConfirm").check();
    await page.locator("#privacyConsent").check();
    await page.locator("#submitVerificationBtn").click();
    await page.waitForFunction(
      () => document.body.dataset.verificationState === "pending",
    );
    state.role = "admin";
    await ready(page, "admin/verifications.html");
    await page.locator(".approve-verification-btn").click();
    await page.locator('#verificationReviewForm button[type="submit"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#messageBox")
        .textContent.includes("approved successfully"),
    );
    state.role = role;
    await ready(page, `${role}/complete-profile.html`);
    await page.locator("#fullName").fill(u.full_name);
    await page.locator("#phone").fill("0123456789");
    if (role === "provider") {
      await page.locator("#providerMap.leaflet-container").waitFor();
      await page.locator("#mapSearch").fill("Synthetic Likas");
      await page.locator("#searchLocationBtn").click();
      await page.waitForFunction(
        () => document.querySelector("#providerLat").value !== "",
      );
      await page.locator("#bio").fill("Synthetic cleaning services");
      await page.locator("#location").fill("Likas, Sabah");
      await page.locator('input[name="skills"][value="Cleaning"]').check();
      await page
        .locator('input[name="specializations"][value="Home Cleaning"]')
        .check();
      await page.locator("#weekly-day-1").check();
      await page.locator("#saveProfileBtn").click();
    } else await page.locator("#completeProfileBtn").click();
    await page.waitForURL(`**/${role}/dashboard.html`);
    assert.equal(u.profile_completed, true);
  }
  state.role = "client";
  await ready(page, "client/create-request.html");
  await requestForm(page);
  await page.locator("#budget").fill("100");
  await page.locator("#requestImage").setInputFiles(png);
  await page.locator("#createRequestBtn").click();
  await page.waitForURL("**/recommended-providers.html?request_id=*");
  const r = state.tables.service_requests[0];
  assert.equal(r.client_id, ids.client);
  assert.equal(r.status, "pending");
  assert.ok(r.request_image_path);
  assert.equal(r.request_image_url, null, 'Do not persist public or temporary image URLs');
  assert.equal(state.calls.find(o=>o.name==='client_save_request_image').args.p_request_image_url, null);
  assert.equal(state.objects.find(o=>o.bucket==='request-images').options.cacheControl, '0');
  await page.locator(".select-provider-btn").click();
  await page.waitForURL("**/request-details.html?request_id=*");
  assert.equal(r.status, "provider_selected");
  assert.equal(r.selected_provider_id, ids.provider);
  state.role = "provider";
  await ready(page, "provider/incoming-requests.html");
  await page.locator(".confirm-btn").click();
  await page.waitForFunction(() =>
    document.querySelector("#messageBox").textContent.includes("confirmed"),
  );
  assert.equal(r.status, "confirmed");
  await ready(page, `provider/messages.html?request_id=${r.request_id}`);
  await page.locator("#messageInput").fill("Synthetic provider message");
  await page.locator("#sendMessageBtn").click();
  await page.waitForFunction(
    () => !document.querySelector("#sendMessageBtn").disabled,
  );
  assert.equal(state.tables.internal_messages[0].receiver_id, ids.client);
  state.role = "client";
  await ready(page, `client/messages.html?request_id=${r.request_id}`);
  await page.getByText("Synthetic provider message", { exact: true }).waitFor();
  await page.locator("#messageInput").fill("Synthetic client reply");
  await page.locator("#sendMessageBtn").click();
  await page.waitForFunction(
    () => !document.querySelector("#sendMessageBtn").disabled,
  );
  assert.equal(state.tables.internal_messages[1].receiver_id, ids.provider);
  state.role = "provider";
  page.on("dialog", (d) => d.accept());
  await ready(page, "provider/assignment-details.html");
  await page.locator(".start-btn").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#messageBox")
      .textContent.includes("started successfully"),
  );
  assert.equal(r.status, "in_progress");
  state.role = "client";
  await ready(page, `client/request-details.html?request_id=${r.request_id}`);
  await page.locator("#completeRequestBtn").click();
  await page.locator("#paymentForm").waitFor();
  assert.equal(r.status, "completed");
  await page.locator("#paymentAmount").fill("100");
  await page.locator("#paymentMethod").selectOption("Cash");
  await page.locator("#savePaymentBtn").click();
  await page
    .getByRole("heading", { name: "Payment Recorded", exact: true })
    .waitFor();
  assert.equal(state.tables.payment_records.length, 1);
  assert.equal(state.tables.payment_records[0].provider_id, ids.provider);
  await page.locator('#reviewForm .star-btn[data-value="5"]').click();
  await page.locator("#feedback").fill("Synthetic excellent service");
  await page.locator("#saveReviewBtn").click();
  await page.getByRole("heading", { name: "Your Review Submitted" }).waitFor();
  assert.equal(state.tables.service_reviews[0].reviewee_id, ids.provider);
  state.role = "provider";
  await ready(page, "provider/assignment-details.html");
  await page.locator('.provider-review-form .star-btn[data-value="4"]').click();
  await page
    .locator(".provider-review-form textarea")
    .fill("Synthetic client feedback");
  await page.locator('.provider-review-form button[type="submit"]').click();
  await page
    .getByRole("heading", { name: "Review Submitted", exact: true })
    .waitFor();
  assert.equal(state.tables.service_reviews[1].reviewee_id, ids.client);
  state.role = "admin";
  await ready(page, "admin/monitor-payments.html");
  assert.equal(await page.locator(".payment-card").count(), 1);
  await ready(page, "admin/monitor-reviews.html");
  assert.equal(await page.locator(".review-card").count(), 2);
});
test("Decline excludes Provider, cancellation retains history and required reasons", async ({
  page,
  state,
}) => {
  state.role = "provider";
  const r = state.tables.service_requests.find((r) => r.request_id === "REQ-A");
  r.status = "provider_selected";
  await ready(page, "provider/incoming-requests.html");
  await page.locator(".decline-btn").click();
  await page.locator(".service-reason-confirm").click();
  assert.match(
    await page.locator("#serviceReasonError").textContent(),
    /select a reason/,
  );
  await page.locator("#serviceReasonSelect").selectOption("schedule_conflict");
  await page.locator(".service-reason-confirm").click();
  await page.waitForFunction(() =>
    document.querySelector("#messageBox").textContent.includes("declined"),
  );
  assert.equal(r.status, "pending");
  assert.equal(
    state.tables.service_request_declines[0].reason,
    "Schedule conflict",
  );
  state.role = "client";
  await ready(page, "client/recommended-providers.html?request_id=REQ-A");
  assert.equal(await page.locator(".select-provider-btn").count(), 0);
  await ready(page, "client/my-requests.html");
  await page.locator('.cancel-btn[data-request-id="REQ-A"]').click();
  await page.locator("#serviceReasonSelect").selectOption("no_longer_needed");
  await page.locator(".service-reason-confirm").click();
  await page.waitForFunction(() =>
    document.querySelector("#messageBox").textContent.includes("cancelled"),
  );
  assert.equal(r.status, "cancelled");
  assert.ok(state.tables.service_requests.includes(r));
  assert.equal(r.cancellation_reason, "Service no longer needed");
});
for (const reason of [
  "unavailable",
  "outside-hours",
  "declined",
  "busy",
  "wrong-specialization",
  "inactive",
  "unverified",
])
  test(`Recommendations exclude ${reason} Provider`, async ({
    page,
    state,
  }) => {
    const t = state.tables;
    const p = t.provider_profiles[0];
    const u = t.users[1];
    if (reason === "unavailable") p.is_available = false;
    if (reason === "outside-hours")
      t.provider_weekly_availability[0].start_time = "12:00:00";
    if (reason === "declined")
      t.service_request_declines.push({
        request_id: "REQ-PENDING",
        provider_id: ids.provider,
      });
    if (reason === "busy") {
    } else
      t.service_requests = t.service_requests.filter(
        (r) => r.request_id === "REQ-PENDING",
      );
    if (reason === "wrong-specialization")
      t.provider_specializations[0].specialization = "Office Cleaning";
    if (reason === "inactive") u.status = "suspended";
    if (reason === "unverified") u.identity_verified = false;
    await ready(
      page,
      "client/recommended-providers.html?request_id=REQ-PENDING",
    );
    assert.equal(await page.locator(".select-provider-btn").count(), 0);
  });
test("Recommendations deduplicate, sort distance, calculate reviews and respect weekly hours boundary", async ({
  page,
  state,
}) => {
  const t = state.tables;
  t.service_requests = t.service_requests.filter(
    (r) => r.request_id === "REQ-PENDING",
  );
  const other = "00000000-0000-4000-8000-000000000004";
  t.users.push({ ...t.users[1], id: other, full_name: "Farther Provider" });
  t.verification_requests.push({...t.verification_requests[1],id:"approved-other",user_id:other});
  t.provider_skills.push({...t.provider_skills[0],provider_id:other});
  t.provider_profiles.push({
    ...t.provider_profiles[0],
    provider_id: other,
    provider_lat: 7.04,
  });
  t.provider_specializations.push(
    { ...t.provider_specializations[0] },
    { ...t.provider_specializations[0], provider_id: other },
  );
  t.service_reviews = [
    {
      reviewee_id: ids.provider,
      rating: 5,
      feedback: "Synthetic",
      created_at: "2026-10-26",
    },
    {
      reviewee_id: ids.provider,
      rating: 3,
      feedback: "Synthetic",
      created_at: "2026-10-25",
    },
  ];
  await ready(page, "client/recommended-providers.html?request_id=REQ-PENDING");
  assert.equal(await page.locator(".smart-provider-card").count(), 2);
  assert.match(
    await page.locator(".smart-provider-card").first().textContent(),
    /Sample provider/,
  );
  assert.match(
    await page.locator(".smart-provider-card").first().textContent(),
    /4.0 \/ 5/,
  );
  t.provider_weekly_availability[0].end_time = "10:00:00";
  await page.reload();
  await page.locator(".smart-provider-card").waitFor();
  assert.equal(await page.locator(".smart-provider-card").count(), 1);
  assert.match(
    await page.locator(".smart-provider-card").textContent(),
    /Farther Provider/,
  );
});
test("Payment proof required for transfers, optional for cash and validated before insert", async ({
  page,
  state,
}) => {
  await ready(page, "client/request-details.html?request_id=REQ-DONE");
  assert.equal(await page.locator("#paymentProof").isVisible(), true);
  assert.equal(await page.locator('label[for="paymentProof"]').count(), 1);
  await page.locator("#paymentMethod").selectOption("Bank Transfer");
  assert.equal(
    await page.locator("#paymentProof").getAttribute("required"),
    "",
  );
  await page
    .locator("#paymentForm")
    .evaluate((f) =>
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  assert.match(await page.locator("#messageBox").textContent(), /upload proof/);
  assert.equal(state.tables.payment_records.length, 0);
  await page.locator("#paymentProof").setInputFiles({
    name: "not-valid.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("synthetic"),
  });
  await page.locator("#savePaymentBtn").click();
  await page.waitForTimeout(100);
  assert.equal(state.objects.length, 0);
  assert.equal(state.tables.payment_records.length, 0);
  assert.equal(await page.locator("#savePaymentBtn").isEnabled(), true);
  await page.locator("#paymentProof").setInputFiles(png);
  await page.locator("#savePaymentBtn").click();
  await page
    .getByRole("heading", { name: "Payment Recorded", exact: true })
    .waitFor();
  assert.equal(state.tables.payment_records.length, 1);
  assert.ok(state.tables.payment_records[0].proof_path);
});
test("Report submission and Admin review preserve participant associations (synthetic)", async ({
  page,
  state,
}) => {
  await ready(page, "client/report.html?request_id=REQ-A");
  await page.locator("#reportReason").selectOption({ index: 1 });
  await page
    .locator("#reportDescription")
    .fill("Synthetic service concern with enough detail");
  await page.locator("#reportEvidence").setInputFiles(png);
  await page.locator("#submitReportBtn").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#messageBox")
      .textContent.includes("Report submitted"),
  );
  const r = state.tables.service_reports[0];
  assert.equal(r.reporter_id, ids.client);
  assert.equal(r.reported_user_id, ids.provider);
  assert.ok(r.evidence_path);
  state.role = "admin";
  await ready(page, "admin/reports.html");
  await page.locator('.review-report-btn[data-status="under_review"]').click();
  await page.waitForTimeout(100);
  assert.equal(r.status, "under_review");
  await page.locator("#statusFilter").selectOption("under_review");
  page.once("dialog", (d) => d.accept("Synthetic resolution"));
  await page.locator('.review-report-btn[data-status="resolved"]').click();
  await page.waitForTimeout(100);
  assert.equal(r.status, "resolved");
});
test("Admin search, role filters and suspend/activate controls use the existing RPC", async ({
  page,
  state,
}) => {
  state.role = "admin";
  page.on("dialog", (d) => d.accept());
  await ready(page, "admin/manage-users.html");
  await page.locator("#roleFilter").selectOption("client");
  await page.locator('.status-btn[data-status="suspended"]').click();
  await page.waitForTimeout(150);
  assert.equal(state.tables.users[0].status, "suspended");
  await page.locator('.status-btn[data-status="active"]').click();
  await page.waitForTimeout(150);
  assert.equal(state.tables.users[0].status, "active");
  await page.locator("#searchInput").fill("no synthetic match");
  assert.match(
    await page.locator("#usersList").textContent(),
    /No users found/,
  );
});
test("Map search, click and GPS update actual coordinates with local Leaflet and synthetic geocoder", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 6.09,
    longitude: 116.15,
    accuracy: 15,
  });
  page.on("dialog", (d) => d.accept());
  await ready(page, "client/create-request.html");
  await page.locator("#mapSearch").fill("Synthetic Likas");
  await page.locator("#searchLocationBtn").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#mapStatus")
      .textContent.includes("found and selected"),
  );
  assert.equal(Number(await page.locator("#clientLat").inputValue()), 6.04);
  await page.locator("#requestMap").click({ position: { x: 80, y: 100 } });
  assert.notEqual(Number(await page.locator("#clientLat").inputValue()), 6.04);
  await page.locator("#useGpsBtn").click();
  await page.waitForFunction(
    () => Number(document.querySelector("#clientLat").value) === 6.09,
  );
});
for (const role of ["client", "provider"])
  test(`${role} completed service has no start/complete actions; duplicate review form absent`, async ({
    page,
    state,
  }) => {
    state.role = role;
    state.tables.service_requests = state.tables.service_requests.filter(
      (r) => r.request_id === "REQ-DONE",
    );
    state.tables.service_reviews = [
      {
        request_id: "REQ-DONE",
        reviewer_id: ids[role],
        reviewee_id: ids[role === "client" ? "provider" : "client"],
        rating: 5,
        feedback: "Synthetic already submitted",
      },
    ];
    await ready(
      page,
      role === "client"
        ? "client/request-details.html?request_id=REQ-DONE"
        : "provider/assignment-details.html",
    );
    assert.equal(
      await page
        .locator(
          "#completeRequestBtn,.start-btn,#reviewForm,.provider-review-form",
        )
        .count(),
      0,
    );
  });
test("Reset password rejects stale session and restores button after update errors", async ({
  page,
  state,
}) => {
  await ready(page, "reset-password.html");
  state.session = false;
  await page.locator("#newPassword").fill("Fixture123");
  await page.locator("#confirmPassword").fill("Fixture123");
  await page.locator("#resetPasswordBtn").click();
  await page.waitForTimeout(100);
  assert.equal(
    state.authEvents.some((o) => o.name === "updateUser"),
    false,
  );
  assert.equal(await page.locator("#resetPasswordBtn").isEnabled(), true);
  state.session = true;
  state.fail = (o) =>
    o.kind === "auth" && o.name === "updateUser" ? "throw" : false;
  await page.locator("#resetPasswordBtn").click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#resetPasswordBtn").isEnabled(), true);
  assert.match(
    await page.locator("#messageBox").textContent(),
    /Unable to update/,
  );
});

for (const table of [
  "provider_specializations",
  "users",
  "provider_profiles",
  "provider_weekly_availability",
  "service_reviews",
])
  test(`Recommendation ${table} error is shown as an error, not an empty result`, async ({
    page,
    state,
  }) => {
    state.tables.service_requests = state.tables.service_requests.filter(
      (r) => r.request_id === "REQ-PENDING",
    );
    state.fail = o => o.kind === "rpc" && o.name === "recommended_provider_candidates";
    await ready(
      page,
      "client/recommended-providers.html?request_id=REQ-PENDING",
    );
    assert.equal(await page.locator(".select-provider-btn").count(), 0);
    await page.locator("#messageBox").filter({hasText: /Unable to/}).waitFor();
    assert.match(await page.locator("#messageBox").textContent(), /Unable to/);
  });
for (const role of ["client", "provider"])
  test(`${role} report rejects unrelated service participant`, async ({
    page,
    state,
  }) => {
    state.role = role;
    const r = state.tables.service_requests.find(
      (r) => r.request_id === "REQ-A",
    );
    if (role === "client") r.client_id = "unrelated";
    else r.selected_provider_id = "unrelated";
    await ready(page, `${role}/report.html?request_id=REQ-A`);
    assert.match(
      await page.locator("#messageBox").textContent(),
      /not found/,
    );
    assert.equal(
      state.calls.some((o) => o.kind === "rpc" && o.name === "submit_service_report"),
      false,
    );
  });
for (const role of ["client", "provider"])
  test(`${role} messaging uses participant-scoped threads and escapes message text`, async ({
    page,
    state,
  }) => {
    state.role = role;
    const r = state.tables.service_requests.find(
      (r) => r.request_id === "REQ-B",
    );
    if (role === "client") r.client_id = "unrelated";
    else r.selected_provider_id = "unrelated";
    state.tables.internal_messages = [
      {
        id: "xss",
        request_id: "REQ-A",
        sender_id: ids.client,
        receiver_id: ids.provider,
        message_text: '<img src=x onerror="window.injected=true">',
        created_at: "2026-10-26",
      },
    ];
    await ready(page, `${role}/messages.html?request_id=REQ-A`);
    assert.equal(await page.locator('[data-request-id="REQ-B"]').count(), 0);
    assert.equal(await page.locator("#messagesList img").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.match(await page.locator("#messagesList").textContent(), /<img/);
  });
test("Profile menu logout clears local session even when server sign-out fails", async ({
  page,
  state,
}) => {
  state.fail = (o) => o.kind === "auth" && o.name === "signOut";
  await ready(page, "client/dashboard.html");
  await page.locator("#profileMenuTrigger").click();
  await page.locator("#profileLogoutBtn").click();
  await page.waitForURL("**/login.html");
  assert.equal(state.session, false);
});
for (const [role, view] of [
  ["client", "request-details.html?request_id=REQ-DONE"],
  ["provider", "assignment-details.html"],
  ["client", "create-request.html"],
  ["provider", "edit-profile.html"],
  ["admin", "reports.html"],
])
  test(`Accessibility of real ${role}/${view} form and controls`, async ({
    page,
    state,
  }) => {
    state.role = role;
    await ready(page, `${role}/${view}`);
    await page.addScriptTag({
      path: process.env.AXE_PATH || require.resolve("axe-core/axe.min.js"),
    });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
          },
        })
      ).violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    );
    assert.deepEqual(violations, []);
  });

for (const role of ["client", "provider"])
  test(`${role} in-flight send keeps original conversation and notification recipient`, async ({
    page,
    state,
  }) => {
    state.role = role;
    let release;
    const gate = new Promise((r) => (release = r));
    let held = false;
    state.delay = async (o) => {
      if (
        o.kind === "query" &&
        o.table === "internal_messages" &&
        o.calls.some((c) => c[0] === "insert")
      ) {
        held = true;
        await gate;
      }
    };
    await ready(page, `${role}/messages.html?request_id=REQ-A`);
    await page.locator("#messageInput").fill("Synthetic original thread");
    await page.locator("#sendMessageBtn").click();
    await waitForFixture(() => held);
    assert.ok(held);
    await page.locator('[data-request-id="REQ-B"]').click();
    release();
    await page.waitForFunction(
      () => !document.querySelector("#sendMessageBtn").disabled,
    );
    assert.equal(state.tables.internal_messages[0].request_id, "REQ-A");
    const note = state.tables.notifications.find(
      (n) => n.title === "New message",
    );
    assert.match(note.message, /Service REQ-A/);
    assert.equal(note.user_id, ids[role === "client" ? "provider" : "client"]);
    assert.equal(
      (await page.locator("#messagesList").textContent()).includes(
        "Synthetic original thread",
      ),
      false,
    );
  });
test("Provider availability changes affect the next recommendation load", async ({
  page,
  state,
}) => {
  state.tables.service_requests = state.tables.service_requests.filter(
    (r) => r.request_id === "REQ-PENDING",
  );
  state.role = "provider";
  await ready(page, "provider/edit-profile.html");
  await page.locator("#isAvailable").selectOption("false");
  await page.locator("#saveProfileBtn").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#messageBox")
      .textContent.includes("updated successfully"),
  );
  assert.equal(state.tables.provider_profiles[0].is_available, false);
  state.role = "client";
  await ready(page, "client/recommended-providers.html?request_id=REQ-PENDING");
  assert.equal(await page.locator(".select-provider-btn").count(), 0);
});
test("Provider fallback map remains interactive after both tile servers fail", async ({
  page,
  state,
}) => {
  state.role = "provider";
  state.tables.users[1].profile_completed = false;
  state.tables.provider_profiles = [];
  await ready(page, "provider/complete-profile.html");
  await page.locator("#providerMap.leaflet-container").waitFor();
  await page.locator("#providerMap").click({ position: { x: 100, y: 100 } });
  await page.waitForFunction(
    () => document.querySelector("#providerLat").value !== "",
  );
  await page.locator("#mapSearch").fill("Synthetic Likas");
  await page.locator("#searchLocationBtn").click();
  await page.waitForFunction(
    () => Number(document.querySelector("#providerLat").value) === 6.04,
  );
});

for (const role of ["client", "provider"])
  test(`${role} duplicate-email registration restores form and displays SDK error`, async ({
    page,
    state,
  }) => {
    state.role = role;
    state.fail = (o) =>
      o.kind === "auth" && o.name === "signUp"
        ? { message: "User already registered", code: "user_already_exists" }
        : false;
    await ready(page, "register.html");
    await page.locator("#fullName").fill("Synthetic Applicant");
    await page.locator("#email").fill("fixture@example.invalid");
    await page.locator("#role").selectOption(role);
    await page.locator("#password").fill("Fixture123");
    await page.locator("#confirmPassword").fill("Fixture123");
    await page.locator("#registerBtn").click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#registerBtn").isEnabled(), true);
    assert.match(
      await page.locator("#messageBox").textContent(),
      /already registered/,
    );
    assert.equal(new URL(page.url()).pathname, "/register.html");
  });
test("Password recovery sends only the synthetic request with same-origin reset destination", async ({
  page,
  state,
}) => {
  await ready(page, "forgot-password.html");
  await page.locator("#email").fill("fixture@example.invalid");
  await page.locator("#forgotPasswordBtn").click();
  await page.waitForFunction(() =>
    document.querySelector("#messageBox").classList.contains("success"),
  );
  const op = state.authEvents.find((o) => o.name === "resetPasswordForEmail");
  assert.equal(
    op.args.options.redirectTo,
    new URL("reset-password.html", base + "/").href,
  );
  assert.equal(await page.locator("#forgotPasswordBtn").isEnabled(), true);
});
test("Successful password update clears local cache/session and returns to Login", async ({
  page,
  state,
}) => {
  await ready(page, "reset-password.html");
  await page.evaluate(() =>
    localStorage.setItem("igotu_user", "stale synthetic profile"),
  );
  await page.locator("#newPassword").fill("Fixture123");
  await page.locator("#confirmPassword").fill("Fixture123");
  await page.locator("#resetPasswordBtn").click();
  await page.waitForURL("**/login.html");
  assert.equal(state.session, false);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("igotu_user")),
    null,
  );
});

for (const role of ["client", "provider"])
  for (const inconsistency of [
    "flag-false",
    "missing-reviewer",
    "wrong-reviewer",
    "wrong-role",
    "missing-time",
    "rejected-latest",
  ])
    test(`${role} inconsistent approval (${inconsistency}) cannot initialize workspace`, async ({
      page,
      state,
    }) => {
      state.role = role;
      const u = state.tables.users.find((u) => u.role === role);
      const v = state.tables.verification_requests.find(
        (v) => v.user_id === u.id,
      );
      if (inconsistency === "flag-false") u.identity_verified = false;
      if (inconsistency === "missing-reviewer") v.reviewed_by = null;
      if (inconsistency === "wrong-reviewer")
        u.identity_verified_by = "unrelated-reviewer";
      if (inconsistency === "wrong-role")
        v.role = role === "client" ? "provider" : "client";
      if (inconsistency === "missing-time") u.identity_verified_at = null;
      if (inconsistency === "rejected-latest") v.status = "rejected";
      await page.goto(`${base}/${role}/dashboard.html`);
      await page.waitForURL(`**/${role}/verification.html`);
      await page.waitForFunction(
        () => document.body.dataset.accessState === "allowed",
      );
      assert.equal(
        await page.locator("#continueVerificationBtn").isVisible(),
        false,
      );
      assert.equal(
        state.calls.some(
          (o) => o.kind === "query" && o.table === "service_requests",
        ),
        false,
      );
    });

test("Shared menus preserve Escape focus and close the other dropdown across all roles", async ({
  page,
  state,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  for (const role of ["client", "provider", "admin"]) {
    state.role = role;
    await ready(page, `${role}/dashboard.html`);
    // Admin intentionally has no notification/profile dropdowns.
    if (role !== "admin") {
      await page.locator("#notificationMenuTrigger").click();
      await page.locator("#profileMenuTrigger").click();
      assert.equal(
        await page.locator("#notificationDropdown").isVisible(),
        false,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .locator("#profileMenuTrigger")
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await page.locator("#notificationMenuTrigger").click();
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .locator("#notificationMenuTrigger")
          .evaluate((e) => e === document.activeElement),
        true,
      );
    }
    await page.locator(".navigation-toggle").click();
    await page.locator(".side-menu a").first().focus();
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .locator(".navigation-toggle")
        .evaluate((e) => e === document.activeElement),
      true,
    );
  }
});
// Real scripts on every page: earlier ui-smoke deliberately suppresses most page modules.
for (const width of [1440, 1024, 768, 390, 320])
  test(`Every workspace page runs real modules at ${width}px`, async ({
    page,
    state,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const role of ["client", "provider", "admin"]) {
      state.role = role;
      for (const file of fs
        .readdirSync(path.join(__dirname, "../igotu_v2", role))
        .filter((f) => f.endsWith(".html") && f !== "complete-profile.html")) {
        const request = state.tables.service_requests.find(
          (r) => r.request_id === "REQ-A",
        );
        if (file === "incoming-requests.html")
          request.status = "provider_selected";
        if (file === "monitor-payments.html")
          state.tables.payment_records = [
            {
              payment_id: "SYNTHETIC-PAYMENT",
              request_id: "REQ-DONE",
              client_id: ids.client,
              provider_id: ids.provider,
              amount: 100,
              payment_method: "Cash",
              created_at: "2026-10-26T02:00:00Z",
            },
          ];
        await ready(
          page,
          `${role}/${file}?request_id=${file === "request-details.html" ? "REQ-DONE" : "REQ-A"}`,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${role}/${file} overflow at ${width}`,
        );
        if (width <= 1000 && file !== "verification.html") {
          await page.locator(".navigation-toggle").click();
          assert.equal(
            await page
              .locator(".navigation-toggle")
              .getAttribute("aria-expanded"),
            "true",
          );
          await page.keyboard.press("Escape");
        }
        if (
          process.env.SYSTEM_SCREENSHOTS &&
          [1440, 390].includes(width) &&
          [
            "request-details.html",
            "incoming-requests.html",
            "monitor-payments.html",
          ].includes(file)
        ) {
          fs.mkdirSync(process.env.SYSTEM_SCREENSHOTS, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.SYSTEM_SCREENSHOTS,
              `${role}-${file}-${width}.png`,
            ),
            fullPage: true,
          });
        }
        if (file === "incoming-requests.html") request.status = "confirmed";
      }
    }
  });

for (const role of ["client","provider","admin"]) test(`${role} missing backend contract locks workspace before business reads`, async({page,state})=>{
  state.role=role;state.fail=o=>o.kind==='rpc' && o.name==='igotu_backend_contract';
  await page.goto(`${base}/${role}/dashboard.html`);
  await page.waitForFunction(()=>document.body.dataset.accessState==='blocked');
  assert.equal(state.calls.filter(o=>o.kind==='query' && o.table!=='users').length,0);
  assert.match(await page.locator('body').textContent(),/could not be checked/);
});
test("Recommendation RPC supplies cards without broad cross-user reads",async({page,state})=>{
 state.tables.service_requests=state.tables.service_requests.filter(x=>x.request_id==='REQ-PENDING');
 await ready(page,'client/recommended-providers.html?request_id=REQ-PENDING');
 await page.locator('.select-provider-btn').waitFor();
 assert.ok(state.calls.some(o=>o.name==='recommended_provider_candidates'));
 assert.equal(state.calls.filter(o=>o.kind==='query' && ['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability','service_reviews','service_request_declines'].includes(o.table)).length,0);
 assert.equal(state.calls.filter(o=>o.table==='users' && o.calls.some(c=>c[0]==='in')).length,0);
});
test("Provider dashboard uses assigned request projection without raw request reads",async({page,state})=>{
 state.role='provider';await ready(page,'provider/dashboard.html');
 assert.ok(state.calls.some(o=>o.name==='provider_service_requests'));
 assert.equal(state.calls.filter(o=>o.table==='service_requests').length,0);
});
test("Atomic Provider save failure preserves all saved information and restores form",async({page,state})=>{
 state.role='provider';const before=structuredClone(state.tables);
 await ready(page,'provider/edit-profile.html');
 state.fail=o=>o.name==='save_provider_profile';
 await page.locator('#bio').fill('Changed synthetic bio');
 await page.locator('#saveProfileBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#saveProfileBtn').disabled);
 for(const table of ['users','provider_profiles','provider_skills','provider_specializations','provider_weekly_availability']) assert.deepEqual(state.tables[table],before[table]);
 assert.equal(state.calls.filter(o=>o.name==='save_provider_profile').length,1);
 assert.equal(state.calls.filter(o=>o.kind==='query' && o.calls.some(c=>['insert','upsert','update','delete'].includes(c[0]))).length,0);
});
test("Creation transport retry reuses the same idempotency key",async({page,state})=>{
 let failed=false;state.fail=o=>o.name==='create_service_request' && !failed ? (failed=true,'throw'):false;
 await ready(page,'client/create-request.html');await requestForm(page);
 await page.locator('#createRequestBtn').click();await page.waitForFunction(()=>!document.querySelector('#createRequestBtn').disabled);
 await page.locator('#createRequestBtn').click();
 await page.waitForURL(/recommended-providers/);
 const calls=state.calls.filter(o=>o.name==='create_service_request');
 assert.equal(calls.length,2);assert.equal(calls[0].args.p_idempotency_key,calls[1].args.p_idempotency_key);
 assert.equal(state.tables.service_requests.filter(x=>x.creation_key).length,1);
});
for(const failure of ['resolver','signer','ambiguous']) test(`Private receipt ${failure} failure never falls back to public URL`,async({page,state})=>{
 const p={payment_id:'PAY-FIXTURE',request_id:'REQ-DONE',proof_url:'https://example.invalid/private-document.pdf',proof_path:ids.client+'/proof.pdf'};
 state.tables.payment_records=[p];state.fail=o=>failure==='resolver'?o.name==='payment_proof_reference':failure==='signer'?o.kind==='storage':false;
 if(failure==='ambiguous') state.tables.payment_records.push({...p});
 await page.goto(base);
 const result=await page.evaluate(async p=>{const m=await import('/js/payment-receipts.js');return m.receiptHtml((await m.prepareReceiptPreviews([p]))[0]);},p);
 assert.match(result,/could not be checked/);assert.ok(!result.includes(p.proof_url));
});
test("Private receipt signer uses five-minute URLs and refreshes on open",async({page,state,context})=>{
 const p={payment_id:'PAY-FIXTURE',request_id:'REQ-DONE',proof_path:ids.client+'/proof.pdf',proof_url:'https://example.invalid/legacy.pdf'};
 state.tables.payment_records=[p];await page.goto(base);
 await page.evaluate(async p=>{const m=await import('/js/payment-receipts.js');const rows=await m.prepareReceiptPreviews([p]);document.body.innerHTML=m.receiptHtml(rows[0]);m.bindReceiptButtons(document.body,rows,()=>{});},p);
 await page.locator('.receipt-open-btn').click();
 await page.waitForFunction(()=>!document.querySelector('.receipt-open-btn').disabled);
 assert.equal(state.calls.filter(o=>o.name==='payment_proof_reference').length,2);
 const signed=state.calls.filter(o=>o.action==='signed');assert.equal(signed.length,2);assert.ok(signed.every(o=>o.expires===300 && o.name===p.proof_path));
 assert.ok(!(await page.content()).includes(p.proof_url));
});
test("Cash receipt without proof renders an explicit empty state",async({page,state})=>{
 const p={payment_id:'PAY-CASH',request_id:'REQ-DONE',payment_method:'Cash'};state.tables.payment_records=[p];await page.goto(base);
 const html=await page.evaluate(async p=>{const m=await import('/js/payment-receipts.js');return m.receiptHtml((await m.prepareReceiptPreviews([p]))[0]);},p);
 assert.match(html,/No proof uploaded/);assert.equal(state.calls.filter(o=>o.action==='signed').length,0);
});
test("Admin reconciliation queue is read-only and links to existing history",async({page,state})=>{
 state.role='admin';state.tables.verification_requests=state.tables.verification_requests.filter(v=>v.user_id!==ids.provider);
 const before=structuredClone(state.tables);await ready(page,'admin/verifications.html');
 await page.locator('#loadReconciliationBtn').click();await page.locator('#reconciliationList a').waitFor();
 assert.match(await page.locator('#reconciliationList a').getAttribute('href'),new RegExp(ids.provider));
 assert.deepEqual(state.tables,before);assert.ok(state.calls.some(o=>o.name==='verification_reconciliation_queue'));
 assert.equal(await page.locator('#loadReconciliationBtn').isVisible(),false);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 assert.deepEqual(await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)),[]);
 if(process.env.SYSTEM_SCREENSHOTS) {
  fs.mkdirSync(process.env.SYSTEM_SCREENSHOTS,{recursive:true});
  for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(process.env.SYSTEM_SCREENSHOTS,`admin-reconciliation-${width}.png`),fullPage:true});
  }
 }

});
for(const role of ['client','provider']) test(`${role} messaging avoids messages from a former assignment`,async({page,state})=>{
 state.role=role;state.tables.internal_messages=[{id:'old',request_id:'REQ-A',sender_id:role==='client'?'former-provider':'former-client',receiver_id:ids[role],message_text:'Former assignment private text',is_read:false,created_at:'2026-01-01'}];
 await ready(page,`${role}/messages.html?request_id=REQ-A`);await page.locator('#chatArea:not(.hidden)').waitFor();
 assert.ok(!(await page.locator('#messagesList').textContent()).includes('Former assignment private text'));assert.equal(state.tables.internal_messages[0].is_read,false);
});
test("Admin cannot approve a legacy submission with unrecorded consent",async({page,state})=>{
 state.role='admin';const v=state.tables.verification_requests[0];v.status='pending';v.age_confirmed=null;v.privacy_consent=null;
 await ready(page,'admin/verifications.html');await page.locator('.approve-verification-btn').click();
 assert.match(await page.locator('#messageBox').textContent(),/Consent cannot be backfilled/);
 assert.equal(v.status,'pending');assert.equal(state.calls.filter(o=>o.name==='admin_review_verification').length,0);
});
test("Admin legacy queue paginates without duplicate accounts or mutations",async({page,state})=>{
 state.role='admin';for(let i=0;i<101;i++) state.tables.users.push({...state.tables.users[1],id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,full_name:`Synthetic legacy ${i}`});
 const before=structuredClone(state.tables);await ready(page,'admin/verifications.html');
 await page.locator('#loadReconciliationBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#reconciliationList a').length===100);
 assert.equal(await page.locator('#loadReconciliationBtn').isVisible(),true);
 await page.locator('#loadReconciliationBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#reconciliationList a').length===101);
 assert.equal(await page.locator('#loadReconciliationBtn').isVisible(),false);
 assert.equal(new Set(await page.locator('#reconciliationList a').evaluateAll(links=>links.map(l=>l.href))).size,101);
 assert.deepEqual(state.tables,before);
});
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const results = [];
  try {
    for (const t of tests.filter(
      (t) =>
        (!process.env.SYSTEM_CASE ||
          t.name.includes(process.env.SYSTEM_CASE)) &&
        (!process.env.SYSTEM_CASE_PATTERN ||
          new RegExp(process.env.SYSTEM_CASE_PATTERN).test(t.name)),
    )) {
      const context = await browser.newContext();
      const state = await install(context);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.stack || e.message));
      try {
        await t.run({ page, state, context });
        assert.deepEqual(state.unknown, [], "Unsupported fixture operations");
        assert.equal(state.calls.filter(o=>o.kind==="query" && o.table==="notifications" && o.calls.some(c=>c[0]==="insert")).length,0,"Browser must not emit notifications");
        assert.deepEqual(errors, [], "Unexpected JavaScript errors");
        results.push({ name: t.name, status: "PASS" });
        console.log(`PASS ${t.name}`);
      } catch (e) {
        const diagnostic = await page
          .evaluate(() => ({
            page: location.pathname,
            message: document.querySelector("#messageBox")?.textContent,
            invalid: [...document.querySelectorAll(":invalid")].map(
              (e) => e.id,
            ),
            lat: document.querySelector("#providerLat")?.value,
          }))
          .catch(() => ({}));
        results.push({
          name: t.name,
          status: "FAIL",
          error: e.message,
          errors,
          diagnostic,
        });
        console.error(
          `FAIL ${t.name}: ${e.message} ${JSON.stringify(diagnostic)}`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    type: "Stateful fixture browser interactions; no live Supabase",
    results,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
  };
  if (process.env.SYSTEM_RESULTS) {
    fs.mkdirSync(path.dirname(process.env.SYSTEM_RESULTS), { recursive: true });
    fs.writeFileSync(
      process.env.SYSTEM_RESULTS,
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed }));
  if (report.failed) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
