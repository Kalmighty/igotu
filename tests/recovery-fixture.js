// Served only by the loopback UI test instead of supabaseClient.js. No real Auth.
const fixture = window.__recoveryFixture || {};
window.__recoveryCalls = [];
function record(operation, details = {}) {
  const event = { operation, ...details };
  window.__recoveryCalls.push(event);
  window.__captureRecovery?.(event);
}
async function delay() {
  if (fixture.delay)
    await new Promise((resolve) => setTimeout(resolve, fixture.delay));
}
export async function clearStoredAuthSession() {
  record("clearStoredAuthSession");
  if (fixture.clearFails) throw new Error("Synthetic cleanup failure");
  fixture.session = false;
  localStorage.removeItem("fixture-recovery-session");
}
export const supabase = {
  auth: {
    async resetPasswordForEmail(email, options) {
      record("resetPasswordForEmail", {
        syntheticEmail: email === "fixture@example.invalid",
        redirectTo: options.redirectTo,
      });
      await delay();
      if (fixture.requestThrows) throw new Error("Synthetic transport failure");
      return {
        error: fixture.requestError
          ? { message: "Synthetic failure; never display this payload" }
          : null,
      };
    },
    async getSession() {
      record("getSession");
      await delay();
      if (fixture.sessionThrows)
        throw new Error("Synthetic session transport failure");
      return {
        data: {
          session: fixture.session
            ? { user: { id: "synthetic-recovery-user" } }
            : null,
        },
        error: fixture.sessionError
          ? { message: "Synthetic session error" }
          : null,
      };
    },
    async updateUser(args) {
      // Record only shape/length, never password content.
      record("updateUser", {
        keys: Object.keys(args),
        passwordLength: args.password.length,
      });
      await delay();
      if (fixture.updateThrows)
        throw new Error("Synthetic update transport failure");
      return {
        error: fixture.updateError
          ? { message: "Synthetic update failure" }
          : null,
      };
    },
    async signOut(options) {
      record("signOut", { scope: options.scope });
      await delay();
      if (fixture.signOutThrows)
        throw new Error("Synthetic sign-out transport failure");
      if (fixture.signOutError)
        return { error: { message: "Synthetic sign-out failure" } };
      fixture.session = false;
      localStorage.removeItem("fixture-recovery-session");
      return { error: null };
    },
  },
};
