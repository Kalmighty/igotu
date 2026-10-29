// Browser transport for system tests. Every operation goes to the in-memory Node fixture.
function query(table) {
  const calls = [];
  const q = new Proxy(
    {},
    {
      get(_, key) {
        if (key === "then")
          return (resolve, reject) =>
            window
              .__systemApi({ kind: "query", table, calls })
              .then(resolve, reject);
        return (...args) => {
          calls.push([key, ...args]);
          return q;
        };
      },
    },
  );
  return q;
}
const listeners = [];
export const supabase = {
  from: query,
  rpc: (name, args) => window.__systemApi({ kind: "rpc", name, args }),
  auth: {
    getSession: () => window.__systemApi({ kind: "auth", name: "getSession" }),
    getUser: async () => {
      const r = await supabase.auth.getSession();
      return { data: { user: r.data.session?.user || null }, error: r.error };
    },
    signOut: async () => {
      const r = await window.__systemApi({ kind: "auth", name: "signOut" });
      if (!r.error) listeners.forEach((fn) => fn("SIGNED_OUT", null));
      return r;
    },
    signUp: (args) =>
      window.__systemApi({ kind: "auth", name: "signUp", args }),
    signInWithPassword: (args) =>
      window.__systemApi({ kind: "auth", name: "signInWithPassword", args }),
    resetPasswordForEmail: (email, options) =>
      window.__systemApi({
        kind: "auth",
        name: "resetPasswordForEmail",
        args: { email, options },
      }),
    updateUser: (args) =>
      window.__systemApi({ kind: "auth", name: "updateUser", args }),
    onAuthStateChange: (fn) => {
      listeners.push(fn);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    stopAutoRefresh: async () => {},
  },
  storage: {
    from: (bucket) => ({
      download: async (name) => {
        const result = await window.__systemApi({kind:"storage",action:"download",bucket,name});
        if (result.error) return result;
        return {data:new Blob([Uint8Array.from(atob(result.data.base64),c=>c.charCodeAt(0))],{type:result.data.type}),error:null};
      },
      upload: (name, file, options) =>
        window.__systemApi({
          kind: "storage",
          action: "upload",
          bucket,
          name,
          type: file.type,
          size: file.size,
          options,
        }),
      remove: (names) =>
        window.__systemApi({
          kind: "storage",
          action: "remove",
          bucket,
          names,
        }),
      createSignedUrl: (name, expires) =>
        window.__systemApi({
          kind: "storage",
          action: "signed",
          bucket,
          name,
          expires,
        }),
      getPublicUrl: (name) => ({
        data: {
          publicUrl: `${location.origin}/fixture-asset/${bucket}/${name}`,
        },
      }),
    }),
  },
  channel: () => ({
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  }),
  removeChannel: async () => {},
};
export async function clearStoredAuthSession() {
  await window.__systemApi({ kind: "auth", name: "clear" });
}
