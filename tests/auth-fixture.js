// Served instead of supabaseClient.js by the local browser test. No network or project access.
const fixture = window.__authFixture || {};
window.__authCalls = [];
function record(operation, args) {
  window.__authCalls.push({ operation, args });
}
const profile = {
  id: "fixture-user",
  user_code: "TEST-001",
  full_name: "Fixture Account",
  email: "test@example.invalid",
  role: fixture.actualRole || "client",
  status: fixture.status || "active",
  profile_completed: fixture.completed !== false,
  identity_verified: fixture.verified !== false,
  identity_verified_at: "2026-01-01T00:00:00Z",
  identity_verified_by: "fixture-admin",
};
let session = null;
function setSession(value) {
  session = value;
  window.__authSession = value;
  if (value) localStorage.setItem("fixture-auth-token", JSON.stringify(value));
  else localStorage.removeItem("fixture-auth-token");
}
setSession(null);
export async function clearStoredAuthSession() {
  record("clearStoredAuthSession", {});
  if (fixture.clearFails) throw new Error("Fixture: local cleanup unavailable");
  setSession(null);
}
export const supabase = {
  auth: {
    async signInWithPassword(args) {
      record("signInWithPassword", args);
      if (fixture.signInDelay)
        await new Promise((resolve) =>
          setTimeout(resolve, fixture.signInDelay),
        );
      if (fixture.authError)
        return {
          data: { user: null },
          error: { message: "Fixture: invalid credentials" },
        };
      setSession({ user: { id: profile.id } });
      return {
        data: {
          user: fixture.noUser
            ? null
            : { id: profile.id, user_metadata: { role: "admin" } },
        },
        error: null,
      };
    },
    async signUp(args) {
      record("signUp", args);
      if (fixture.authError)
        return {
          data: {},
          error: { message: "Fixture: registration unavailable" },
        };
      return {
        data: {
          session: fixture.signupSession ? { user: { id: profile.id } } : null,
          user: { id: profile.id },
        },
        error: null,
      };
    },
    async signOut(args) {
      record("signOut", args);
      if (fixture.signOutThrows)
        throw new Error("Fixture: sign-out transport failed");
      if (fixture.signOutError)
        return { error: { message: "Fixture: sign-out unavailable" } };
      setSession(null);
      return { error: null };
    },
    async getSession() {
      if (fixture.getSessionFails)
        return {
          data: { session: null },
          error: { message: "Fixture: session verification unavailable" },
        };
      return { data: { session }, error: null };
    },
  },
  from(table) {
    record("from", { table });
    const query = {
      select(columns) {
        record("select", { columns });
        return query;
      },
      eq(column, value) {
        record("eq", { column, value });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve({
          data:
            fixture.verified === false
              ? []
              : [
                  {
                    id: "approved",
                    role: profile.role,
                    status: "approved",
                    reviewed_at: "2026-01-01T00:00:00Z",
                    reviewed_by: "fixture-admin",
                  },
                ],
          error: null,
        }).then(resolve, reject);
      },
      async single() {
        return {
          data: fixture.noProfile ? null : profile,
          error: fixture.noProfile
            ? { message: "Fixture: profile missing" }
            : null,
        };
      },
    };
    return query;
  },
};
