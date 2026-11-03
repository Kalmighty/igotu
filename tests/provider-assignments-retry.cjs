/* Actual production mutation functions, pinned PostgREST SDK and local fetch only. */
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
    source = fs.readFileSync(
      "igotu_v2/js/provider-assignment-details.js",
      "utf8",
    );
  let cases = 0;
  for (const kind of ["start", "review"])
    for (const mode of ["network", "503", "504", "409", "reject", "success"]) {
      let calls = 0;
      const payload = {
        request_id: "SYNTHETIC-ID",
        reviewer_id: "SYNTHETIC-PROVIDER",
        reviewee_id: "SYNTHETIC-CLIENT",
        rating: 4,
        feedback: "Synthetic feedback",
      };
      const supabase = new PostgrestClient("https://offline.invalid/rest/v1", {
        fetch: async (url, options) => {
          calls++;
          assert(
            url.endsWith(
              kind === "start"
                ? "rpc/provider_start_request"
                : "service_reviews",
            ),
          );
          assert.equal(options.method, "POST");
          assert.deepEqual(
            JSON.parse(options.body),
            kind === "start" ? { p_request_id: "SYNTHETIC-ID" } : payload,
          );
          if (mode === "network") throw Error("Synthetic transport failure");
          return new Response(
            mode === "success"
              ? kind === "start"
                ? null
                : "[]"
              : JSON.stringify({
                  code: mode === "reject" ? "P0001" : "",
                  message: "Synthetic error",
                }),
            {
              status:
                mode === "success"
                  ? kind === "start"
                    ? 204
                    : 201
                  : mode === "reject"
                    ? 400
                    : Number(mode),
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      });
      const name = kind === "start" ? "startMutation" : "reviewMutation",
        call =
          fn(source, name) +
          "\n" +
          name +
          "(" +
          (kind === "start" ? JSON.stringify("SYNTHETIC-ID") : "payload") +
          ")";
      const result = await vm.runInNewContext(call, { supabase, payload });
      assert.equal(calls, 1, kind + " " + mode);
      assert.equal(result.error === null, mode === "success");
      cases++;
    }
  fs.mkdirSync("docs/provider-assignments/validation", { recursive: true });
  fs.writeFileSync(
    "docs/provider-assignments/validation/sdk-retry.json",
    JSON.stringify(
      {
        cases,
        postgrestVersion: "2.118.0",
        actualProductionFunctions: true,
        oneFetchPerMutation: true,
        liveBackend: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS ${cases} actual production mutation/pinned-SDK transport cases; one local fetch each.`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
