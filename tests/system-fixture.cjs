/* Synthetic contracts only: this intentionally does not implement or prove RLS. */
const fs = require("node:fs");
const path = require("node:path");
const stamp = "2026-10-26T02:00:00Z";
const ids = {
  client: "00000000-0000-4000-8000-000000000001",
  provider: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003",
};
function seed() {
  const users = Object.entries(ids).map(([role, id]) => ({
    id,
    role,
    user_code: role.toUpperCase(),
    full_name: `Sample ${role}`,
    email: `${role}@example.invalid`,
    phone: "0123456789",
    status: "active",
    profile_completed: true,
    identity_verified: role !== "admin",
    identity_verified_at: stamp,
    identity_verified_by: ids.admin,
    created_at: stamp,
  }));
  const request = (request_id, status, provider = ids.provider) => ({
    request_id,
    client_id: ids.client,
    selected_provider_id: provider,
    title: `Service ${request_id}`,
    description: "Synthetic cleaning service",
    category: "Cleaning",
    service_type: "Home Cleaning",
    priority: "normal",
    status,
    preferred_date: "2026-11-02",
    preferred_time: "10:00:00",
    location: "Unit 7, Likas, Sabah",
    client_lat: 6.04,
    client_lng: 116.12,
    budget: 100,
    created_at: stamp,
  });
  return {
    users,
    verification_requests: users
      .filter((u) => u.role !== "admin")
      .map((u, i) => ({
        id: `00000000-0000-4000-9000-00000000000${i + 1}`,
        user_id: u.id,
        role: u.role,
        legal_name: u.full_name,
        id_type: "passport",
        id_number_last4: "1234",
        identity_document_path: `${u.id}/identity/fixture.pdf`,
        status: "approved",
        age_confirmed: true,
        privacy_consent: true,
        reviewed_by: ids.admin,
        reviewed_at: stamp,
        submitted_at: stamp,
      })),
    service_requests: [
      request("REQ-PENDING", "pending", null),
      request("REQ-A", "confirmed"),
      request("REQ-B", "confirmed"),
      request("REQ-DONE", "completed"),
    ],
    provider_profiles: [
      {
        provider_id: ids.provider,
        bio: "Synthetic services",
        location: "Likas, Sabah",
        provider_lat: 6.05,
        provider_lng: 116.12,
        is_available: true,
        is_verified: true,
      },
    ],
    provider_skills: [{ provider_id: ids.provider, category: "Cleaning" }],
    provider_specializations: [
      {
        provider_id: ids.provider,
        category: "Cleaning",
        specialization: "Home Cleaning",
      },
    ],
    provider_weekly_availability: [
      {
        provider_id: ids.provider,
        day_of_week: 1,
        start_time: "08:00:00",
        end_time: "18:00:00",
      },
    ],
    service_request_declines: [],
    internal_messages: [],
    payment_records: [],
    service_reviews: [],
    service_reports: [],
    notifications: [],
  };
}
function matches(row, calls) {
  return calls.every(([op, col, val, third]) => {
    if (op === "eq") return row[col] === val;
    if (op === "neq") return row[col] !== val;
    if (op === "in") return val.includes(row[col]);
    if (op === "not" && val === "is") return row[col] != third;
    return true;
  });
}
async function install(
  context,
  { role = "client", tables = seed(), fail, delay } = {},
) {
  const state = {
    role,
    tables,
    calls: [],
    fail,
    delay,
    session: true,
    objects: [],
    unknown: [],
    authEvents: [],
    counter: 0,
  };
  await context.exposeBinding("__systemApi", async (_, op) => {
    state.calls.push(structuredClone(op));
    if (state.delay) await state.delay(op, state);
    const failed = state.fail?.(op, state);
    if (failed === "throw") throw new Error("Synthetic transport failure");
    if (failed)
      return {
        data: null,
        count: null,
        error:
          typeof failed === "object"
            ? failed
            : { message: "Synthetic request failed", code: "FIXTURE" },
      };
    const own = () => state.tables.users.find((u) => u.id === ids[state.role]);
    if (op.kind === "auth") {
      state.authEvents.push(op);
      if (["signOut", "clear"].includes(op.name)) {
        state.session = false;
        return { error: null };
      }
      if (op.name === "signInWithPassword") {
        state.session = true;
        return { data: { user: own(), session: { user: own() } }, error: null };
      }
      if (op.name === "signUp") {
        const u = own();
        u.profile_completed = false;
        u.identity_verified = false;
        state.tables.verification_requests =
          state.tables.verification_requests.filter((v) => v.user_id !== u.id);
        return {
          data: { user: u, session: state.session ? { user: u } : null },
          error: null,
        };
      }
      if (op.name === "getSession")
        return {
          data: {
            session: state.session ? { user: { id: ids[state.role] } } : null,
          },
          error: null,
        };
      if (op.name === "updateUser" || op.name === "resetPasswordForEmail")
        return { data: { user: own() }, error: null };
    }
    if (op.kind === "storage") {
      if (op.action === "upload") {
        state.objects.push(op);
        return { data: { path: op.name }, error: null };
      }
      if (op.action === "remove") {
        state.objects = state.objects.filter(
          (o) => o.bucket !== op.bucket || !op.names.includes(o.name),
        );
        return { data: [], error: null };
      }
      if (op.action === "signed")
        return {
          data: {
            signedUrl: `${base}/fixture-asset/${op.bucket}/${op.name}?token=synthetic`,
          },
          error: null,
        };
    }
    if (op.kind === "query") {
      const rows = state.tables[op.table];
      if (!rows) {
        state.unknown.push(op);
        return {
          data: null,
          error: { message: `Unknown synthetic table ${op.table}` },
        };
      }
      const mutation = op.calls.find((c) =>
        ["insert", "upsert", "update", "delete"].includes(c[0]),
      );
      let found = rows.filter((row) => matches(row, op.calls));
      if (mutation) {
        const [kind, payload, options] = mutation;
        if (kind === "delete")
          state.tables[op.table] = rows.filter((r) => !found.includes(r));
        if (kind === "update") found.forEach((r) => Object.assign(r, payload));
        if (["insert", "upsert"].includes(kind)) {
          found = [];
          for (const data of Array.isArray(payload) ? payload : [payload]) {
            const keys = options?.onConflict?.split(",") || [];
            let row =
              kind === "upsert" && keys.length
                ? rows.find((r) => keys.every((k) => r[k] === data[k]))
                : null;
            if (row) Object.assign(row, data);
            else {
              row = {
                id: `fixture-${++state.counter}`,
                created_at: stamp,
                ...data,
              };
              if (op.table === "service_requests")
                row.request_id = `REQ-NEW-${state.counter}`;
              if (op.table === "verification_requests")
                row.submitted_at = new Date().toISOString();
              rows.push(row);
            }
            found.push(row);
          }
        }
      }
      let data = structuredClone(found);
      for (const [, col, opt] of op.calls
        .filter((c) => c[0] === "order")
        .reverse())
        data.sort(
          (a, b) =>
            (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) *
            (opt?.ascending === false ? -1 : 1),
        );
      const count = data.length;
      const limit = op.calls.find((c) => c[0] === "limit");
      if (limit) data = data.slice(0, limit[1]);
      const select = op.calls.find((c) => c[0] === "select");
      if (select?.[1] && select[1] !== "*") {
        const keys = select[1].split(",").map((s) => s.trim());
        data = data.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
      }
      if (op.calls.some((c) => c[0] === "single"))
        return {
          data: data[0] || null,
          count,
          error:
            data.length === 1
              ? null
              : { message: "Synthetic single row not found" },
        };
      if (op.calls.some((c) => c[0] === "maybeSingle"))
        return { data: data[0] || null, count, error: null };
      return { data: select?.[2]?.head ? null : data, count, error: null };
    }
    if (op.kind === "rpc") {
      const { name, args: a } = op;
      const t = state.tables;
      const r = t.service_requests.find((r) => r.request_id === a.p_request_id);
      if (name === "complete_basic_profile") {
        Object.assign(own(), {
          full_name: a.p_full_name,
          phone: a.p_phone,
          profile_completed: true,
        });
        return { data: own(), error: null };
      }
      if (name === "client_update_request") {
        Object.entries(a).forEach(([k, v]) => {
          if (k !== "p_request_id") r[k.slice(2)] = v;
        });
      } else if (name === "client_save_request_image")
        Object.assign(r, {
          request_image_url: a.p_request_image_url,
          request_image_path: a.p_request_image_path,
        });
      else if (name === "client_select_provider")
        Object.assign(r, {
          selected_provider_id: a.p_provider_id,
          status: "provider_selected",
        });
      else if (name === "provider_confirm_request") r.status = "confirmed";
      else if (name === "provider_start_request") r.status = "in_progress";
      else if (name === "client_complete_request") r.status = "completed";
      else if (name === "client_cancel_request")
        Object.assign(r, {
          status: "cancelled",
          cancellation_reason: a.p_reason,
        });
      else if (name === "provider_decline_request") {
        t.service_request_declines.push({
          request_id: r.request_id,
          provider_id: r.selected_provider_id,
          reason: a.p_reason,
        });
        Object.assign(r, { selected_provider_id: null, status: "pending" });
      } else if (name === "admin_update_user_status")
        t.users.find((u) => u.id === a.p_user_id).status = a.p_status;
      else if (name === "submit_service_report")
        t.service_reports.push({
          id: `report-${++state.counter}`,
          reporter_id: ids[state.role],
          reported_user_id: a.p_reported_user_id,
          request_id: a.p_request_id,
          reason: a.p_reason,
          description: a.p_description,
          evidence_path: a.p_evidence_path,
          status: "pending",
          created_at: stamp,
        });
      else if (name === "admin_review_service_report")
        Object.assign(
          t.service_reports.find((r) => r.id === a.p_report_id),
          { status: a.p_status, admin_note: a.p_admin_note },
        );
      else if (name === "admin_review_verification") {
        const v = t.verification_requests.find((v) => v.id === a.p_request_id);
        Object.assign(v, {
          status: a.p_status,
          reviewed_by: ids.admin,
          reviewed_at: new Date().toISOString(),
          admin_note: a.p_admin_note,
        });
        const u = t.users.find((u) => u.id === v.user_id);
        Object.assign(u, {
          identity_verified: a.p_status === "approved",
          identity_verified_at: v.reviewed_at,
          identity_verified_by: ids.admin,
        });
      } else {
        state.unknown.push(op);
        return {
          data: null,
          error: { message: `Unknown synthetic RPC ${name}` },
        };
      }
      return { data: null, error: null };
    }
    throw new Error("Unknown fixture operation");
  });
  const base = process.env.UI_BASE_URL || "http://127.0.0.1:4173";
  const browserModule = fs.readFileSync(
    path.join(__dirname, "system-fixture.js"),
    "utf8",
  );
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== new URL(base).origin) {
      if (u.href.includes("leaflet@1.9.4/dist/leaflet.js"))
        return route.fulfill({
          contentType: "text/javascript",
          body: fs.readFileSync(
            require.resolve("leaflet/dist/leaflet.js"),
            "utf8",
          ),
        });
      if (u.href.includes("leaflet@1.9.4/dist/leaflet.css"))
        return route.fulfill({
          contentType: "text/css",
          body: fs.readFileSync(
            require.resolve("leaflet/dist/leaflet.css"),
            "utf8",
          ),
        });
      if (u.hostname === "nominatim.openstreetmap.org")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            u.pathname === "/search"
              ? [
                  {
                    lat: "6.04",
                    lon: "116.12",
                    display_name: "Synthetic Likas, Sabah",
                  },
                ]
              : { display_name: "Synthetic Likas, Sabah" },
          ),
        });
      return route.abort();
    }
    if (u.pathname === "/js/supabaseClient.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: browserModule,
      });
    if (u.pathname.startsWith("/fixture-asset/"))
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.4 Synthetic only",
      });
    return route.continue();
  });
  return state;
}
module.exports = { install, seed, ids };
