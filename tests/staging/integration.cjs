/* PREPARED ONLY. Default --plan never contacts an environment. No SQL executor,
   provisioning API, Admin signup or privileged key support exists here. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { makeRuntime, check } = require("./runtime.cjs");
const plan = require("./acceptance-plan.json");
const cases = {};
const test = (id, run) => (cases[id] = run);
let flow = {};
const row = (r) => (Array.isArray(r) ? r[0] : r);
function selectionRaceResult(responses) {
  check(
    responses.length === 2 && responses.filter((r) => r.ok).length === 1,
    "CONCURRENT_SELECTION_NOT_EXCLUSIVE",
  );
  const loser = responses.find((r) => !r.ok);
  check(
    loser.status === 400 &&
      loser.data?.code === "P0001" &&
      loser.data?.message ===
        "Provider no longer matches this request or is booked.",
    "CONCURRENT_SELECTION_REJECTION_NOT_PROVEN",
  );
}
function completeResults(results) {
  return plan.cases.map(
    (c) =>
      results.find((r) => r.id === c.id) || {
        id: c.id,
        status: "NOT_TESTED",
        reason: "STOPPED_AFTER_EARLIER_FAILURE",
      },
  );
}
async function reviewId(x, a) {
  const r = await x.success(
    x.table(a, "verification_requests", {
      user_id: "eq." + a.id,
      order: "submitted_at.desc,id.desc",
      limit: 1,
    }),
  );
  check(r[0], "VERIFICATION_CONTROL_MISSING");
  return r[0].id;
}
async function submit(x, a) {
  const file = a.id + "/" + crypto.randomUUID() + ".png";
  await x.upload(a, "verification-documents", file);
  const r = await x.success(
    x.table(a, "verification_requests", {}, "POST", {
      user_id: a.id,
      role: a.role,
      legal_name: "Synthetic applicant",
      id_type: "passport",
      id_number_last4: "1234",
      identity_document_path: file,
      status: "pending",
      age_confirmed: true,
      privacy_consent: true,
    }),
  );
  return row(r).id;
}
for (const [id, name, role] of [
  ["ST-01", "clientA", "client"],
  ["ST-02", "providerA", "provider"],
])
  test(id, async (x) => {
    const a = await x.actor(name);
    check(a.role === role, "REGISTERED_ROLE_MISMATCH");
    const contract = await x.success(x.rpc(a, "igotu_backend_contract"));
    check(
      contract?.version === "20261026.1" &&
        contract?.notifications === "database",
      "COMPATIBILITY_CONTROL_FAILED",
    );
    const r = await x.request(null, "/auth/v1/signup", {
      method: "POST",
      body: {
        ...x.secrets["registration" + role],
        data: { role, full_name: "Synthetic signup " + role },
      },
    });
    check(
      r.ok && (r.data?.user?.id || r.data?.id) && !r.data.access_token,
      "CONFIRMED_EMAIL_FLOW_REQUIRED",
    );
    return ["BLOCKED_EXTERNAL_MAIL_CONFIRMATION_AND_REAL_BROWSER_LOGIN"];
  });
test("ST-03", async (x) => {
  const a = await x.actor("unverified"),
    control = await x.actor("clientA");
  await x.success(
    x.rpc(control, "create_service_request", {
      p_idempotency_key: crypto.randomUUID(),
      p_details: x.details("Synthetic identity authorization control"),
    }),
  );
  await x.denied(
    a,
    () =>
      x.rpc(a, "create_service_request", {
        p_idempotency_key: crypto.randomUUID(),
        p_details: x.details(),
      }),
    { empty: false },
  );
  flow.verification = await submit(x, a);
  const r = await x.table(a, "verification_requests", {
    id: "eq." + flow.verification,
    select: "status,age_confirmed,privacy_consent,identity_document_path",
  });
  check(
    r.ok &&
      r.data?.[0]?.status === "pending" &&
      r.data[0].age_confirmed === true &&
      r.data[0].privacy_consent === true,
    "CONSENT_SUBMISSION_FAILED",
  );
  const second = await x.table(a, "verification_requests", {}, "POST", {
    user_id: a.id,
    role: a.role,
    legal_name: "Synthetic duplicate",
    id_type: "passport",
    id_number_last4: "1234",
    identity_document_path: r.data[0].identity_document_path,
    status: "pending",
    age_confirmed: true,
    privacy_consent: true,
  });
  check(
    !second.ok && second.data?.code === "23505",
    "DUPLICATE_PENDING_NOT_PROVEN",
  );
  return [
    "BLOCKED_CONCURRENT_SUBMISSION_AND_CLEANUP_RACE_SQL_SESSION_PROCEDURE",
  ];
});
test("ST-04", async (x) => {
  const admin = await x.actor("admin"),
    u = await x.actor("unverified"),
    p = await x.actor("pending");
  check(flow.verification, "RUN_ORDER_REQUIRED");
  await x.success(
    x.rpc(admin, "admin_review_verification", {
      p_request_id: flow.verification,
      p_status: "approved",
      p_admin_note: "Synthetic approved",
    }),
  );
  await x.denied(
    u,
    () =>
      x.rpc(u, "create_service_request", {
        p_idempotency_key: crypto.randomUUID(),
        p_details: x.details(),
      }),
    { empty: false },
  );
  await x.success(
    x.rpc(u, "complete_basic_profile", {
      p_full_name: "Synthetic approved Client",
      p_phone: "01000000000",
    }),
  );
  await x.success(
    x.rpc(admin, "admin_review_verification", {
      p_request_id: await reviewId(x, p),
      p_status: "rejected",
      p_admin_note: "Synthetic correction required",
    }),
  );
  const fresh = await submit(x, p);
  await x.success(
    x.rpc(admin, "admin_review_verification", {
      p_request_id: fresh,
      p_status: "approved",
      p_admin_note: "Synthetic corrected submission",
    }),
  );
  await x.success(
    x.table(p, "provider_profiles", { provider_id: "eq." + p.id }),
  );
  await x.success(x.rpc(p, "save_provider_profile", x.profile(p)));
  const badge = await x.success(
    x.table(p, "provider_profiles", {
      provider_id: "eq." + p.id,
      select: "is_verified",
    }),
  );
  check(badge[0]?.is_verified === true, "PROVIDER_BADGE_NOT_SYNCHRONIZED");
  const notices = await x.success(
    x.table(u, "notifications", {
      event_key:
        "in.(verification_requests:" +
        flow.verification +
        ":pending,verification_requests:" +
        flow.verification +
        ":approved)",
    }),
  );
  check(
    notices.length === 2,
    "VERIFICATION_NOTIFICATIONS_MISSING_OR_DUPLICATE",
  );
  return [];
});
test("ST-05", async (x) => {
  const c = await x.actor("clientA"),
    control = await x.actor("providerA");
  await x.success(
    x.rpc(control, "provider_service_requests", {
      p_request_id: null,
      p_statuses: null,
    }),
  );
  await x.success(
    x.table(c, "service_requests", {
      client_id: "eq." + c.id,
      select: "request_id",
      limit: 1,
    }),
  );
  for (const name of ["rejected", "legacy", "suspended", "legacySuspended"]) {
    const a = await x.actor(name);
    await x.denied(a, () =>
      x.table(a, "service_requests", {
        client_id: "eq." + a.id,
        select: "request_id",
      }),
    );
    await x.denied(
      a,
      () =>
        a.role === "provider"
          ? x.rpc(a, "provider_service_requests", {
              p_request_id: null,
              p_statuses: null,
            })
          : x.rpc(a, "create_service_request", {
              p_idempotency_key: crypto.randomUUID(),
              p_details: x.details(),
            }),
      { empty: false },
    );
  }
  return [];
});
test("ST-06", async (x) => {
  const a = await x.actor("clientA");
  await x.sessionControl(a);
  const anon = await x.table(null, "users", { select: "id" });
  check(
    (anon.status === 401 || anon.status === 403) && anon.data?.code === "42501",
    "ANON_TABLE_ACCESS_NOT_DENIED",
  );
  for (const actor of [null, a])
    for (const [header, method, resource] of [
      ["Accept-Profile", "GET", "/rest/v1/installation?select=version"],
      ["Content-Profile", "POST", "/rest/v1/rpc/contract"],
    ]) {
      const r = await x.request(actor, resource, {
        method,
        headers: { [header]: "igotu_backend_private" },
        ...(method === "POST" ? { body: {} } : {}),
      });
      check(
        r.status === 406 && r.data?.code === "PGRST106",
        "PRIVATE_SCHEMA_EXPOSURE_NOT_DENIED",
      );
    }
  await x.denied(
    a,
    () =>
      x.table(a, "users", { id: "eq." + a.id }, "PATCH", {
        role: "admin",
        identity_verified: true,
      }),
    { empty: false },
  );
  return [];
});
test("ST-07", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA");
  await x.success(
    x.rpc(c, "create_service_request", {
      p_idempotency_key: crypto.randomUUID(),
      p_details: x.details("Synthetic authorization control"),
    }),
  );
  await x.denied(
    p,
    () =>
      x.rpc(p, "create_service_request", {
        p_idempotency_key: crypto.randomUUID(),
        p_details: x.details(),
      }),
    { empty: false },
  );
  await x.denied(
    c,
    () =>
      x.table(c, "notifications", {}, "POST", {
        user_id: p.id,
        title: "Synthetic forbidden browser emitter",
        message: "Should not be stored",
        is_read: false,
      }),
    { empty: false },
  );
  await x.denied(
    p,
    () =>
      x.rpc(p, "complete_basic_profile", {
        p_full_name: "Synthetic forbidden partial save",
        p_phone: "01000000000",
      }),
    { empty: false },
  );
  return [];
});
test("ST-08", async (x) => {
  const a = await x.actor("rejected"),
    other = await x.actor("clientB"),
    admin = await x.actor("admin");
  const file = a.id + "/" + crypto.randomUUID() + ".png";
  await x.upload(a, "verification-documents", file);
  await x.success(
    x.request(admin, "/storage/v1/object/sign/verification-documents/" + file, {
      method: "POST",
      body: { expiresIn: 60 },
    }),
  );
  await x.sessionControl(other);
  const otherSign = await x.request(
    other,
    "/storage/v1/object/sign/verification-documents/" + file,
    { method: "POST", body: { expiresIn: 60 } },
  );
  check(
    [400, 403, 404].includes(otherSign.status),
    "FOREIGN_DOCUMENT_SIGNING_ACCEPTED",
  );
  const publicControl = other.id + "/" + crypto.randomUUID() + ".png";
  await x.upload(other, "request-images", publicControl);
  const canary = await x.request(
    null,
    "/storage/v1/object/public/request-images/" + publicControl,
  );
  check(canary.ok, "PUBLIC_STORAGE_ENDPOINT_CONTROL_FAILED");
  const pub = await x.request(
    null,
    "/storage/v1/object/public/verification-documents/" + file,
  );
  check([400, 403, 404].includes(pub.status), "PUBLIC_DOCUMENT_ACCESS");
  return [
    "BLOCKED_DOCUMENT_OVERWRITE_OWNER_AND_CLEANUP_RACE_OPERATOR_PROCEDURES",
  ];
});
test("ST-09", async (x) => {
  const c = await x.actor("clientA"),
    key = crypto.randomUUID(),
    d = x.details();
  const rs = await Promise.all([
    x.rpc(c, "create_service_request", {
      p_idempotency_key: key,
      p_details: d,
    }),
    x.rpc(c, "create_service_request", {
      p_idempotency_key: key,
      p_details: d,
    }),
  ]);
  check(
    rs.every((r) => r.ok) &&
      row(rs[0].data).request_id === row(rs[1].data).request_id,
    "CREATION_IDEMPOTENCY_FAILED",
  );
  flow.request = row(rs[0].data).request_id;
  const changed = await x.rpc(c, "create_service_request", {
    p_idempotency_key: key,
    p_details: { ...d, title: "Changed payload" },
  });
  check(
    !changed.ok && changed.data?.code === "P0001",
    "CHANGED_IDEMPOTENCY_PAYLOAD_ACCEPTED",
  );
  return [];
});
test("ST-10", async (x) => {
  const c = await x.actor("clientA");
  for (const n of ["providerA", "providerB"]) {
    const p = await x.actor(n);
    await x.success(x.rpc(p, "save_provider_profile", x.profile(p)));
  }
  const data = await x.success(
    x.rpc(c, "recommended_provider_candidates", { p_request_id: flow.request }),
  );
  const a = await x.actor("providerA");
  check(
    data.some((r) => r.id === a.id),
    "ELIGIBLE_PROVIDER_MISSING",
  );
  for (const r of data)
    check(
      !(
        "email" in r ||
        "phone" in r ||
        "provider_lat" in r ||
        "provider_lng" in r
      ),
      "RECOMMENDATION_PII_LEAK",
    );
  return ["BLOCKED_FULL_MATCHING_TRUTH_TABLE_OPERATOR_FIXTURES"];
});
test("ST-11", async (x) => {
  const c = await x.actor("clientA"),
    b = await x.actor("clientB"),
    p = await x.actor("providerA");
  await x.success(
    x.rpc(c, "client_select_provider", {
      p_request_id: flow.request,
      p_provider_id: p.id,
    }),
  );
  flow.rowId = row(
    await x.success(
      x.table(c, "service_requests", {
        request_id: "eq." + flow.request,
        select: "id",
      }),
    ),
  ).id;
  const notices = await x.success(
    x.table(p, "notifications", {
      event_key:
        "eq.service_requests:" + flow.rowId + ":provider_selected:" + p.id,
    }),
  );
  check(notices.length === 1, "SELECTION_NOTIFICATION_NOT_UNIQUE");
  await x.denied(
    b,
    () =>
      x.rpc(b, "client_select_provider", {
        p_request_id: flow.request,
        p_provider_id: p.id,
      }),
    { empty: false },
  );
  const projection = await x.success(
    x.rpc(p, "provider_service_requests", {
      p_request_id: flow.request,
      p_statuses: null,
    }),
  );
  check(
    projection[0]?.location === null &&
      projection[0]?.client_lat === null &&
      projection[0]?.request_image_url === null,
    "PRECONFIRMATION_LOCATION_LEAK",
  );
  return [];
});
test("ST-12", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA");
  await x.success(
    x.rpc(p, "provider_confirm_request", { p_request_id: flow.request }),
  );
  await x.success(
    x.rpc(p, "provider_confirm_request", { p_request_id: flow.request }),
  );
  const confirmed = await x.success(
    x.table(c, "notifications", {
      event_key: "eq.service_requests:" + flow.rowId + ":confirmed:" + p.id,
    }),
  );
  check(confirmed.length === 1, "CONFIRMATION_NOTIFICATION_NOT_UNIQUE");
  const d = await x.create(
    c,
    x.details("Synthetic decline", x.config.date, "12:00:00"),
  );
  await x.success(
    x.rpc(c, "client_select_provider", {
      p_request_id: d,
      p_provider_id: p.id,
    }),
  );
  await x.success(
    x.rpc(p, "provider_decline_request", {
      p_request_id: d,
      p_reason: "Synthetic decline",
    }),
  );
  const candidates = await x.success(
    x.rpc(c, "recommended_provider_candidates", { p_request_id: d }),
  );
  check(
    !candidates.some((r) => r.id === p.id),
    "DECLINED_PROVIDER_RECOMMENDED",
  );
  return [];
});
test("ST-13", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA"),
    b = await x.actor("clientB"),
    id = crypto.randomUUID();
  await x.success(
    x.table(c, "internal_messages", {}, "POST", {
      id,
      request_id: flow.request,
      sender_id: c.id,
      receiver_id: p.id,
      message_text: "SYNTHETIC MESSAGE",
      is_read: true,
    }),
  );
  const messages = await x.success(
    x.table(p, "internal_messages", { id: "eq." + id }),
  );
  check(messages[0]?.is_read === false, "SENDER_SET_RECEIVER_READ_FLAG");
  await x.denied(b, () => x.table(b, "internal_messages", { id: "eq." + id }));
  await x.success(
    x.table(p, "internal_messages", { id: "eq." + id }, "PATCH", {
      is_read: true,
    }),
  );
  flow.message = id;
  return [];
});
test("ST-14", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA"),
    b = await x.actor("clientB");
  await x.success(
    x.rpc(p, "provider_start_request", { p_request_id: flow.request }),
  );
  await x.denied(
    b,
    () => x.rpc(b, "client_complete_request", { p_request_id: flow.request }),
    { empty: false },
  );
  await x.success(
    x.rpc(c, "client_complete_request", { p_request_id: flow.request }),
  );
  await x.success(
    x.rpc(c, "client_complete_request", { p_request_id: flow.request }),
  );
  return [];
});
test("ST-15", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA"),
    b = await x.actor("clientB");
  const cash = {
    request_id: flow.request,
    client_id: c.id,
    provider_id: p.id,
    amount: 100,
    payment_method: "Cash",
    proof_path: null,
  };
  const saved = row(
    await x.success(x.table(c, "payment_records", {}, "POST", cash)),
  );
  const dup = await x.table(c, "payment_records", {}, "POST", cash);
  check(!dup.ok && dup.data?.code === "23505", "DUPLICATE_PAYMENT_ACCEPTED");
  const pn = await x.success(
    x.table(p, "notifications", {
      event_key: "eq.payment_records:" + saved.id,
    }),
  );
  check(pn.length === 1, "PAYMENT_NOTIFICATION_NOT_UNIQUE");
  await x.denied(b, () =>
    x.table(b, "payment_records", { request_id: "eq." + flow.request }),
  );
  const req = await x.create(
    c,
    x.details("Synthetic transfer", x.config.date, "13:00:00"),
  );
  await x.success(
    x.rpc(c, "client_select_provider", {
      p_request_id: req,
      p_provider_id: p.id,
    }),
  );
  for (const action of ["provider_confirm_request", "provider_start_request"])
    await x.success(x.rpc(p, action, { p_request_id: req }));
  await x.success(x.rpc(c, "client_complete_request", { p_request_id: req }));
  const file = c.id + "/" + crypto.randomUUID() + ".png";
  await x.upload(c, "payment-proofs", file);
  await x.success(
    x.table(c, "payment_records", {}, "POST", {
      ...cash,
      request_id: req,
      payment_method: "Bank Transfer",
      proof_path: file,
    }),
  );
  const ref = await x.success(
    x.rpc(p, "payment_proof_reference", { p_request_id: req }),
  );
  check(
    ref[0]?.proof_path === file && !ref[0]?.proof_url,
    "PRIVATE_RECEIPT_REFERENCE_FAILED",
  );
  await x.success(
    x.request(p, "/storage/v1/object/sign/payment-proofs/" + file, {
      method: "POST",
      body: { expiresIn: 300 },
    }),
  );
  const pub = await x.request(
    null,
    "/storage/v1/object/public/payment-proofs/" + file,
  );
  check([400, 403, 404].includes(pub.status), "PUBLIC_RECEIPT_ACCESS");
  return ["BLOCKED_REAL_SIGNED_URL_EXPIRY_AND_LEGACY_REFERENCE_MATRIX"];
});
test("ST-16", async (x) => {
  const c = await x.actor("clientA"),
    p = await x.actor("providerA");
  for (const [a, peer] of [
    [c, p],
    [p, c],
  ]) {
    const review = {
      request_id: flow.request,
      reviewer_id: a.id,
      reviewee_id: peer.id,
      rating: 5,
      feedback: "SYNTHETIC REVIEW",
    };
    const saved = row(
      await x.success(x.table(a, "service_reviews", {}, "POST", review)),
    );
    const notices = await x.success(
      x.table(peer, "notifications", {
        event_key: "eq.service_reviews:" + saved.id,
      }),
    );
    check(notices.length === 1, "REVIEW_NOTIFICATION_NOT_UNIQUE");
    const dup = await x.table(a, "service_reviews", {}, "POST", review);
    check(!dup.ok && dup.data?.code === "23505", "DUPLICATE_REVIEW_ACCEPTED");
  }
  return [];
});
test("ST-17", async (x) => {
  const admin = await x.actor("admin"),
    c = await x.actor("clientA"),
    b = await x.actor("clientB");
  await x.success(
    x.table(admin, "payment_records", { request_id: "eq." + flow.request }),
  );
  const q = await x.success(
    x.rpc(admin, "verification_reconciliation_queue", { p_after: null }),
  );
  check(
    q.some((r) => r.id === x.config.accounts.legacy.id) &&
      !q.some((r) => r.id === x.config.accounts.legacySuspended.id),
    "HISTORY_AND_SUSPENSION_CONFLATED",
  );
  await x.denied(
    b,
    () => x.rpc(b, "verification_reconciliation_queue", { p_after: null }),
    { empty: false },
  );
  const rid = await x.success(
    x.rpc(c, "submit_service_report", {
      p_request_id: flow.request,
      p_reported_user_id: x.config.accounts.providerA.id,
      p_reason: "Synthetic concern",
      p_description: "SYNTHETIC REPORT",
      p_evidence_path: null,
    }),
  );
  await x.success(
    x.rpc(admin, "admin_review_service_report", {
      p_report_id: rid,
      p_status: "resolved",
      p_admin_note: "Synthetic outcome",
    }),
  );
  const notices = await x.success(
    x.table(c, "notifications", {
      event_key: "eq.service_reports:" + rid + ":resolved",
    }),
  );
  check(notices.length === 1, "REPORT_NOTIFICATION_NOT_UNIQUE");
  const p = await x.actor("providerA");
  const mn = await x.success(
    x.table(p, "notifications", {
      event_key: "eq.internal_messages:" + flow.message,
    }),
  );
  check(mn.length === 1, "MESSAGE_NOTIFICATION_NOT_UNIQUE");
  return [
    "BLOCKED_FULL_SERVER_EVENT_RECIPIENT_MATRIX_AND_LEGACY_ASSIGNMENT_TRANSITION",
  ];
});
test("ST-18", async (x) => {
  const admin = await x.actor("admin"),
    b = await x.actor("clientB");
  await x.success(
    x.rpc(admin, "admin_update_user_status", {
      p_user_id: b.id,
      p_status: "suspended",
    }),
  );
  try {
    await x.denied(
      b,
      () =>
        x.rpc(b, "create_service_request", {
          p_idempotency_key: crypto.randomUUID(),
          p_details: x.details(),
        }),
      { empty: false },
    );
  } finally {
    await x.success(
      x.rpc(admin, "admin_update_user_status", {
        p_user_id: b.id,
        p_status: "active",
      }),
    );
  }
  return ["BLOCKED_CROSS_TAB_BROWSER_REVOCATION_CHECK"];
});
test("ST-19", async (x) => {
  const c = await x.actor("clientA"),
    b = await x.actor("clientB"),
    p = await x.actor("providerB");
  for (let i = 0; i < 20; i++) {
    const when = new Date(x.config.date + "T12:00:00Z");
    when.setUTCDate(when.getUTCDate() + i + 1);
    const date = when.toISOString().slice(0, 10),
      one = await x.create(c, x.details("Synthetic race A", date)),
      two = await x.create(b, x.details("Synthetic race B", date));
    const jobs = [
      [c, one],
      [b, two],
    ];
    if (i % 2) jobs.reverse();
    const rs = await Promise.all(
      jobs.map(([a, id]) =>
        x.rpc(a, "client_select_provider", {
          p_request_id: id,
          p_provider_id: p.id,
        }),
      ),
    );
    selectionRaceResult(rs);
    const final = await x.success(
      x.rpc(p, "provider_service_requests", {
        p_request_id: null,
        p_statuses: ["provider_selected"],
      }),
    );
    check(
      final.filter((r) => [one, two].includes(r.request_id)).length === 1,
      "CONCURRENT_FINAL_STATE_NOT_EXCLUSIVE",
    );
    for (const [a, id] of jobs)
      await x.success(
        x.rpc(a, "client_cancel_request", {
          p_request_id: id,
          p_reason: "Synthetic race cleanup",
        }),
      );
  }
  return [
    "BLOCKED_CONFIRM_DECLINE_PROFILE_STATUS_INTERLEAVING_SQL_SESSION_PROCEDURES",
  ];
});
test("ST-20", async (x) => {
  const p = await x.actor("providerB");
  check(
    x.approval.atomicProbeProvider === p.id,
    "LATE_FAILURE_PROBE_APPROVAL_REQUIRED",
  );
  await x.success(
    x.rpc(p, "save_provider_profile", x.profile(p, "Office Cleaning")),
  );
  const before = await x.ownSnapshot(p);
  const bad = await x.rpc(
    p,
    "save_provider_profile",
    x.profile(p, "General Cleaning"),
  );
  check(
    !bad.ok &&
      bad.data?.code === "23514" &&
      String(bad.data?.message).includes("igotu_v7_atomic_probe"),
    "LATE_DATABASE_FAILURE_NOT_PROVEN",
  );
  check((await x.ownSnapshot(p)) === before, "ATOMIC_ROLLBACK_FAILED");
  return [];
});
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--remaining")) return require("./remaining.cjs").main(args);
  if (!args.includes("--execute")) {
    for (const c of plan.cases)
      console.log(`${c.id} PREPARED_NOT_EXECUTED ${c.name}`);
    return;
  }
  const { config, approval, secrets } = require("./config.cjs").load(args);
  const x = makeRuntime(config, approval, secrets);
  x.secrets = secrets;
  const startedAt = new Date().toISOString();
  const results = [];
  for (const c of plan.cases) {
    try {
      const blocked = await cases[c.id](x);
      results.push({
        id: c.id,
        status: blocked.length
          ? "PARTIAL_REQUIRES_OPERATOR_CHECKS"
          : "CORE_API_PASS",
        blocked,
      });
      console.log(c.id + " " + results.at(-1).status);
    } catch (e) {
      results.push({
        id: c.id,
        status: "FAIL",
        code: e.safeCode || "UNCLASSIFIED_CHECK_FAILURE",
      });
      console.log(c.id + " FAIL");
      break;
    }
  }
  const output = path.resolve(
    __dirname,
    "../../work/staging/api-results.json",
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        scope:
          "Authorized synthetic staging core API checks; separate operator/browser/SQL-session procedures remain required",
        projectRef: config.projectRef,
        startedAt,
        finishedAt: new Date().toISOString(),
        results: completeResults(results),
      },
      null,
      2,
    ) + "\n",
  );
  if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
  else if (results.some((r) => r.status === "PARTIAL_REQUIRES_OPERATOR_CHECKS"))
    process.exitCode = 3;
}
if (require.main === module)
  main().catch((e) => {
    console.error("BLOCKED: " + (e.safeCode || "LOCAL_CONFIGURATION_INVALID"));
    process.exitCode = 2;
  });
module.exports = { cases, selectionRaceResult, completeResults };
