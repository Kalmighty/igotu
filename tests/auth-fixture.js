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
};
export const supabase = {
  auth: {
    async signInWithPassword(args) {
      record("signInWithPassword", args);
      if (fixture.authError)
        return {
          data: { user: null },
          error: { message: "Fixture: invalid credentials" },
        };
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
    async signOut() {
      record("signOut", {});
      return { error: null };
    },
    async getSession() {
      return { data: { session: null } };
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
