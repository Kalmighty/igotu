// Stateful browser fixtures only. No project connection; no real ID documents.
const f = window.__verificationFixture || {};
const own = "00000000-0000-4000-8000-000000000001";
const admin = "00000000-0000-4000-8000-000000000099";
window.__verificationCalls = [];
const record = (op, args = {}) => {
  const call = { op, args };
  window.__verificationCalls.push(call);
  if (window.__verificationRecord)
    window.__verificationRecord(call).catch(() => {});
};
const date = "2026-10-20T08:00:00Z";
let state = f.state || "not_submitted";
const role = f.role || "client";
let profile = {
  id: own,
  full_name: "Sample Applicant",
  user_code: "TEST-001",
  email: "sample@example.invalid",
  phone: "",
  role,
  status: f.inactive ? "suspended" : "active",
  profile_completed: f.completed === true,
  identity_verified: state === "approved",
  identity_verified_at: state === "approved" ? date : null,
  identity_verified_by: state === "approved" ? admin : null,
};
window.__setVerificationState = (value) => {
  state = value;
};
function latest() {
  return state === "not_submitted"
    ? []
    : [
        {
          id: "10000000-0000-4000-8000-000000000001",
          user_id: own,
          role,
          status: state,
          submitted_at: date,
          reviewed_at:
            state === "approved" || state === "rejected" ? date : null,
          reviewed_by:
            state === "approved" || state === "rejected" ? admin : null,
          admin_note:
            state === "rejected"
              ? "Please upload a clearer, fully visible document."
              : null,
        },
      ];
}
let adminRows = [
  {
    id: "10000000-0000-4000-8000-000000000002",
    user_id: "20000000-0000-4000-8000-000000000001",
    role: "provider",
    legal_name: "Sample Provider",
    id_type: "passport",
    id_number_last4: "1234",
    identity_document_path:
      "20000000-0000-4000-8000-000000000001/sample-identity.png",
    status: "pending",
    submitted_at: date,
    admin_note: null,
    age_confirmed: true,
    privacy_consent: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    user_id: "20000000-0000-4000-8000-000000000001",
    role: "provider",
    legal_name: "Sample Provider",
    id_type: "passport",
    id_number_last4: "1234",
    identity_document_path:
      "20000000-0000-4000-8000-000000000001/previous-identity.png",
    status: "rejected",
    submitted_at: "2026-10-19T08:00:00Z",
    reviewed_at: date,
    reviewed_by: admin,
    admin_note: "Please upload a clearer document.",
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    user_id: "20000000-0000-4000-8000-000000000002",
    role: "client",
    legal_name: "Sample Client",
    id_type: "mykad",
    id_number_last4: "5678",
    identity_document_path:
      "20000000-0000-4000-8000-000000000002/sample-identity.png",
    status: "pending",
    submitted_at: date,
    admin_note: null,
    age_confirmed: true,
    privacy_consent: true,
  },
];
function query(table) {
  const actions = [];
  const q = new Proxy(
    {},
    {
      get(_, key) {
        if (key === "then")
          return (resolve, reject) =>
            Promise.resolve(result(false)).then(resolve, reject);
        if (key === "single") return async () => result(true);
        return (...args) => {
          actions.push([key, ...args]);
          return q;
        };
      },
    },
  );
  function result(single) {
    record(table, actions);
    if (f.delay && (table === "users" || table === "verification_requests"))
      return new Promise((r) =>
        setTimeout(() => r(resolveResult(single)), f.delay),
      );
    return resolveResult(single);
  }
  function resolveResult(single) {
    if (table === "users") {
      if (f.profileError)
        return { data: null, error: { message: "Fixture profile failure" } };
      if (single) {
        profile.identity_verified = state === "approved";
        profile.identity_verified_by = state === "approved" ? admin : null;
        profile.identity_verified_at = state === "approved" ? date : null;
        return { data: profile, error: null };
      }
      return {
        data: adminRows.map((row) => ({
          id: row.user_id,
          full_name: row.legal_name,
          user_code: "TEST-APPLICANT",
          email: "applicant@example.invalid",
          role: row.role,
          status: "active",
          identity_verified: row.status === "approved",
        })),
        error: null,
      };
    }
    if (table === "verification_requests") {
      const insert = actions.find((a) => a[0] === "insert");
      if (insert) {
        if (f.duplicate || state === "pending")
          return { data: null, error: { code: "23505" } };
        state = "pending";
        record("verificationPayload", insert[1]);
        return { data: null, error: null };
      }
      if (f.statusError)
        return { data: null, error: { message: "Fixture status failure" } };
      if (f.refreshApproved) state = "approved";
      return { data: role === "admin" ? adminRows : latest(), error: null };
    }
    return { data: [], count: 0, error: null };
  }
  return q;
}
export async function clearStoredAuthSession() {
  record("clearStoredAuthSession");
}
export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: f.noSession ? null : { user: { id: own } } },
      error: null,
    }),
    signOut: async () => {
      record("signOut");
      return { error: null };
    },
    signInWithPassword: async (args) => {
      record("signIn", args);
      return { data: { user: { id: own } }, error: null };
    },
    signUp: async (args) => {
      record("signUp", args);
      return {
        data: {
          session: f.emailConfirmation ? null : { user: { id: own } },
          user: { id: own },
        },
        error: null,
      };
    },
  },
  from: query,
  rpc: async (name, args) => {
    record("rpc", { name, args });
    if (name === "igotu_backend_contract") return { data: { version: "20261026.1", notifications: "database" }, error: null };
    if (name === "verification_reconciliation_queue") return {data: [], error: null};
    if (role !== "admin" || f.inactive)
      return { error: { message: "Fixture: denied" } };
    const row = adminRows.find((r) => r.id === args.p_request_id);
    if (
      !row ||
      row.status !== "pending" ||
      (args.p_status === "rejected" && !args.p_admin_note?.trim())
    )
      return { error: { message: "Fixture: invalid decision" } };
    row.status = args.p_status;
    row.admin_note = args.p_admin_note;
    row.reviewed_at = date;
    row.reviewed_by = admin;
    return { error: null };
  },
  storage: {
    from(bucket) {
      return {
        upload: async (path, file, options) => {
          record("upload", {
            bucket,
            path,
            size: file.size,
            type: file.type,
            options,
          });
          return {
            error: f.uploadError ? { message: "Fixture upload failure" } : null,
          };
        },
        remove: async (paths) => {
          record("remove", { bucket, paths });
          return { error: null };
        },
        createSignedUrl: async (path, expires) => {
          record("signedUrl", { bucket, path, expires });
          return role === "admin"
            ? {
                data: {
                  signedUrl:
                    "https://fixture.invalid/private-document?token=synthetic",
                },
                error: null,
              }
            : { data: null, error: { message: "Fixture denied" } };
        },
      };
    },
  },
  channel: () => ({
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  }),
};
