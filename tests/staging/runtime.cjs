/* Prepared transport for separately authorized synthetic STAGING only.
   Importing this module performs no network or file reads. */
const crypto = require("node:crypto");
class CheckError extends Error {
  constructor(code) {
    super(code);
    this.safeCode = code;
  }
}
const check = (value, code) => {
  if (!value) throw new CheckError(code);
};
function validatePublic(config, approval) {
  check(
    config.syntheticOnly === true && approval.syntheticOnly === true,
    "SYNTHETIC_SCOPE_REQUIRED",
  );
  check(
    /^[a-z]{20}$/.test(config.projectRef || "") &&
      config.projectRef !== "giqtnbwyktbnbhdvjraa",
    "STAGING_REF_REQUIRED",
  );
  check(
    config.url === `https://${config.projectRef}.supabase.co` &&
      approval.projectRef === config.projectRef,
    "EXACT_STAGING_ORIGIN_REQUIRED",
  );
  check(
    /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(config.publishableKey || ""),
    "PUBLISHABLE_KEY_REQUIRED",
  );
  for (const key of [
    "network",
    "syntheticWrites",
    "authSignups",
    "mailCapture",
    "migrationsReviewed",
    "migrationsInstalled",
    "privateSchemaReviewed",
    "testAccountsReviewed",
  ])
    check(
      approval[key] === true,
      "APPROVAL_" + key.toUpperCase() + "_REQUIRED",
    );
  check(Date.parse(approval.expiresAt) > Date.now(), "APPROVAL_EXPIRED");
  check(
    /^[a-z0-9.-]+\.(test|invalid)$/.test(config.mailDomain || ""),
    "TEST_MAIL_DOMAIN_REQUIRED",
  );
  check(
    /^\d{4}-\d\d-\d\d$/.test(config.date || "") &&
      Number.isFinite(Date.parse(config.date + "T12:00:00Z")),
    "VALID_SERVICE_DATE_REQUIRED",
  );
  check(
    new Date(config.date + "T12:00:00Z").toISOString().slice(0, 10) ===
      config.date,
    "VALID_SERVICE_DATE_REQUIRED",
  );
  return true;
}
function validate(config, approval, secrets) {
  validatePublic(config, approval);
  const required = [
    "clientA",
    "clientB",
    "providerA",
    "providerB",
    "admin",
    "unverified",
    "pending",
    "rejected",
    "suspended",
    "legacy",
    "legacySuspended",
  ];
  for (const name of required) {
    const a = config.accounts?.[name],
      secret = secrets[name];
    check(
      a?.synthetic === true &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          a.id || "",
        ),
      "SYNTHETIC_ACCOUNT_REQUIRED",
    );
    check(
      ["client", "provider", "admin"].includes(a.role) &&
        secret?.email?.endsWith("@" + config.mailDomain) &&
        typeof secret?.password === "string" &&
        secret.password.length >= 12,
      "TEST_CREDENTIALS_REQUIRED",
    );
  }
  check(
    new Set(required.map((n) => config.accounts[n].id)).size ===
      required.length,
    "DISTINCT_ACTORS_REQUIRED",
  );
  for (const r of ["client", "provider"])
    check(
      secrets["registration" + r]?.email?.endsWith("@" + config.mailDomain) &&
        secrets["registration" + r]?.password?.length >= 12,
      "REGISTRATION_FIXTURE_REQUIRED",
    );
  check(
    /^\d{4}-\d\d-\d\d$/.test(config.date || ""),
    "SYNTHETIC_SERVICE_DATE_REQUIRED",
  );
  return true;
}
function makeRuntime(config, approval, secrets, transport = fetch) {
  validate(config, approval, secrets);
  const actors = new Map();
  const origin = new URL(config.url).origin;
  async function request(
    actor,
    resource,
    { method = "GET", body, headers = {} } = {},
  ) {
    // Long suites and signed-URL waits must not outlive their approved window.
    // Recheck before every outbound request, including synthetic cleanup writes.
    validatePublic(config, approval);
    const url = new URL(resource, origin);
    check(
      url.origin === origin &&
        /^\/(auth|rest|storage)\/v1\//.test(url.pathname),
      "REQUEST_ORIGIN_REJECTED",
    );
    let response;
    try {
      response = await transport(url.href, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          apikey: config.publishableKey,
          ...(actor ? { Authorization: "Bearer " + actor.token } : {}),
          ...(Buffer.isBuffer(body)
            ? {}
            : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      });
    } catch {
      throw new CheckError("TRANSPORT_FAILED");
    }
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { status: response.status, ok: response.ok, data };
  }
  async function actor(name, { refresh = false } = {}) {
    if (refresh) actors.delete(name);
    if (actors.has(name)) return actors.get(name);
    const r = await request(null, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: secrets[name].email, password: secrets[name].password },
    });
    check(
      r.ok &&
        r.data?.access_token &&
        r.data.user?.id === config.accounts[name].id,
      "LOGIN_CONTROL_FAILED",
    );
    const a = {
      name,
      id: r.data.user.id,
      token: r.data.access_token,
      role: config.accounts[name].role,
    };
    actors.set(name, a);
    const own = await table(a, "users", {
      id: "eq." + a.id,
      select: "id,role,status,profile_completed,identity_verified",
    });
    check(
      own.ok && own.data?.length === 1 && own.data[0].role === a.role,
      "PROFILE_CONTROL_FAILED",
    );
    return a;
  }
  const rpc = (a, name, args = {}) =>
    request(a, "/rest/v1/rpc/" + name, { method: "POST", body: args });
  const table = (a, name, query = {}, method = "GET", body) =>
    request(a, "/rest/v1/" + name + "?" + new URLSearchParams(query), {
      method,
      body,
      headers: { Prefer: "return=representation" },
    });
  async function sessionControl(a) {
    const r = await table(a, "users", { id: "eq." + a.id, select: "id" });
    check(r.ok && r.data?.[0]?.id === a.id, "NEGATIVE_SESSION_CONTROL_FAILED");
  }
  async function denied(a, operation, { empty = true } = {}) {
    await sessionControl(a);
    const r = await operation();
    check(
      (r.status === 403 && r.data?.code === "42501") ||
        (empty && r.ok && Array.isArray(r.data) && !r.data.length),
      "AUTHORIZATION_DENIAL_NOT_PROVEN",
    );
    return r;
  }
  async function success(operation) {
    const r = await operation;
    check(r.ok, "POSITIVE_CONTROL_FAILED");
    return r.data;
  }
  async function ownSnapshot(a) {
    const result = {};
    for (const [t, key] of [
      ["users", "id"],
      ["provider_profiles", "provider_id"],
      ["provider_skills", "provider_id"],
      ["provider_specializations", "provider_id"],
      ["provider_weekly_availability", "provider_id"],
    ])
      result[t] = (await success(table(a, t, { [key]: "eq." + a.id }))).sort(
        (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
      );
    return JSON.stringify(result);
  }
  const details = (
    title = "Synthetic service",
    date = config.date,
    time = "10:00:00",
  ) => ({
    title,
    category: "Cleaning",
    service_type: "Home Cleaning",
    description: "SYNTHETIC ONLY",
    preferred_date: date,
    preferred_time: time,
    location: "Synthetic staging location",
    client_lat: 6.04,
    client_lng: 116.12,
    budget: 100,
    priority: "normal",
  });
  async function create(a, d = details(), key = crypto.randomUUID()) {
    const rows = await success(
      rpc(a, "create_service_request", {
        p_idempotency_key: key,
        p_details: d,
      }),
    );
    check(rows?.[0]?.request_id, "CREATION_RESULT_MISSING");
    return rows[0].request_id;
  }
  function profile(a, specialization = "Home Cleaning") {
    return {
      p_profile: {
        bio: "SYNTHETIC staging profile",
        location: "Synthetic Sabah",
        provider_lat: 6.05,
        provider_lng: 116.12,
        is_available: true,
      },
      p_skills: ["Cleaning"],
      p_specializations: [{ category: "Cleaning", specialization }],
      p_weekly_hours: Array.from({ length: 7 }, (_, day_of_week) => ({
        day_of_week,
        start_time: "08:00",
        end_time: "18:00",
      })),
      p_full_name: "Synthetic " + a.name,
      p_phone: "01000000000",
    };
  }
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=",
    "base64",
  );
  async function upload(a, bucket, path) {
    return success(
      request(
        a,
        "/storage/v1/object/" +
          bucket +
          "/" +
          path.split("/").map(encodeURIComponent).join("/"),
        {
          method: "POST",
          body: png,
          headers: { "Content-Type": "image/png", "x-upsert": "false" },
        },
      ),
    );
  }
  return {
    config,
    approval,
    actor,
    request,
    rpc,
    table,
    sessionControl,
    denied,
    success,
    ownSnapshot,
    details,
    create,
    profile,
    png,
    upload,
    check,
  };
}
module.exports = { validatePublic, validate, makeRuntime, check, CheckError };
