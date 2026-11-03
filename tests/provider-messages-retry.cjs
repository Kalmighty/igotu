/* Actual production write code + pinned PostgREST SDK, local fetch only. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm");
function fn(source, name) {
  const start = source.indexOf("async function " + name + "("),
    end = source.indexOf("\n}", start) + 2;
  assert(start >= 0 && end > start);
  return source.slice(start, end);
}
(async () => {
  const { PostgrestClient } = await import(process.env.POSTGREST_MODULE),
    source = fs.readFileSync("igotu_v2/js/provider-messages.js", "utf8"),
    insert = fn(source, "insertMessage"),
    read = fn(source, "markMessagesAsRead");
  const start = read.indexOf("    const call ="),
    end = read.indexOf("    if (result.error", start),
    readCall = "(async()=>{" + read.slice(start, end) + "return result;})()";
  assert(start >= 0 && end > start);
  let cases = 0;
  const message = {
    id: "SYNTHETIC-UUID",
    message_id: "MSG-SYNTHETIC-ID",
    request_id: "SYNTHETIC-REQUEST",
    sender_id: "SYNTHETIC-PROVIDER",
    receiver_id: "SYNTHETIC-CLIENT",
    message_text: "Synthetic text only",
    is_read: false,
    created_at: "2026-11-03T03:00:00Z",
  };
  for (const kind of ["insert", "read-update"])
    for (const mode of ["network", "409", "503", "504", "reject", "success"]) {
      let calls = 0;
      const supabase = new PostgrestClient("https://offline.invalid/rest/v1", {
        fetch: async (url, options) => {
          calls++;
          assert.equal(options.method, kind === "insert" ? "POST" : "PATCH");
          assert.deepEqual(
            JSON.parse(options.body),
            kind === "insert" ? message : { is_read: true },
          );
          if (kind !== "insert") {
            const u = new URL(url);
            assert.equal(
              u.searchParams.get("request_id"),
              "eq.SYNTHETIC-REQUEST",
            );
            assert.equal(
              u.searchParams.get("receiver_id"),
              "eq.SYNTHETIC-PROVIDER",
            );
            assert.equal(
              u.searchParams.get("sender_id"),
              "eq.SYNTHETIC-CLIENT",
            );
            assert.equal(u.searchParams.get("is_read"), "eq.false");
            assert.equal(u.searchParams.get("id"), "in.(INCOMING-ID)");
          }
          if (mode === "network") throw Error("Synthetic transport failure");
          return new Response(
            mode === "success"
              ? kind === "insert"
                ? null
                : '[{"id":"INCOMING-ID"}]'
              : JSON.stringify({
                  code: mode === "reject" ? "P0001" : "",
                  message: "Synthetic error",
                }),
            {
              status:
                mode === "success"
                  ? kind === "insert"
                    ? 201
                    : 200
                  : mode === "reject"
                    ? 400
                    : Number(mode),
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      });
      const result = await vm.runInNewContext(
        kind === "insert" ? insert + "\ninsertMessage(message)" : readCall,
        {
          supabase,
          message,
          requestIdValue: "SYNTHETIC-REQUEST",
          peerId: "SYNTHETIC-CLIENT",
          currentUser: { id: "SYNTHETIC-PROVIDER" },
          ids: ["INCOMING-ID"],
        },
      );
      assert.equal(calls, 1, kind + " " + mode);
      assert.equal(result.error === null, mode === "success");
      cases++;
    }
  let attempts = [];
  const supabase = new PostgrestClient("https://offline.invalid/rest/v1", {
    fetch: async (url, options) => {
      attempts.push(JSON.parse(options.body));
      return new Response(attempts.length === 1 ? "{}" : null, {
        status: attempts.length === 1 ? 503 : 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const send = vm.runInNewContext(insert + "\ninsertMessage", { supabase });
  await send(message);
  assert.equal(attempts.length, 1);
  await send(message);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  cases++;
  fs.mkdirSync("docs/provider-messages/validation", { recursive: true });
  fs.writeFileSync(
    "docs/provider-messages/validation/sdk-retry.json",
    JSON.stringify(
      {
        cases,
        postgrestVersion: "2.118.0",
        actualProductionWriteCode: true,
        noAutomaticWriteRetries: true,
        manualRetryPreservesPayload: true,
        liveBackend: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS ${cases} actual production/pinned-SDK transport cases; no automatic write retry; explicit retry retains message identifiers.`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
