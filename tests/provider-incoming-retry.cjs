/* Exercise the actual page's RPC call block against the pinned PostgREST SDK with local fetch. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm");
(async () => {
  const { PostgrestClient } = await import(process.env.POSTGREST_MODULE);
  const source = fs.readFileSync(
    "igotu_v2/js/provider-incoming-requests.js",
    "utf8",
  );
  const start = source.indexOf("    const call = supabase.rpc("),
    end = source.indexOf("    if (!result", start);
  assert(start >= 0 && end > start);
  const actualBlock = source.slice(start, end) + "\nreturn result;";
  let checks = 0;
  for (const kind of ["confirm", "decline"])
    for (const mode of ["network", "503", "504", "409", "success", "reject"]) {
      let calls = 0;
      const supabase = new PostgrestClient("https://offline.invalid/rest/v1", {
        fetch: async (url, opt) => {
          calls++;
          assert(
            url.endsWith(
              kind === "confirm"
                ? "provider_confirm_request"
                : "provider_decline_request",
            ),
          );
          assert.equal(opt.method, "POST");
          assert.deepEqual(
            JSON.parse(opt.body),
            kind === "confirm"
              ? { p_request_id: "SYNTHETIC-ID" }
              : { p_request_id: "SYNTHETIC-ID", p_reason: "Schedule conflict" },
          );
          if (mode === "network") throw Error("Synthetic network failure");
          return new Response(
            mode === "success"
              ? null
              : JSON.stringify({
                  code: mode === "reject" ? "P0001" : "",
                  message: "Synthetic only",
                }),
            {
              status:
                mode === "success"
                  ? 204
                  : mode === "reject"
                    ? 400
                    : Number(mode),
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      });
      const call = vm.runInNewContext("(async()=>{" + actualBlock + "})()", {
        supabase,
        kind,
        r: { id: "SYNTHETIC-ID" },
        accepted: "Schedule conflict",
      });
      const result = await call;
      assert.equal(
        result.error === null,
        mode === "success",
        "SDK result classification",
      );
      assert.equal(calls, 1, kind + " " + mode + " must not retry");
      checks++;
    }
  fs.mkdirSync("docs/provider-incoming-requests/validation", {
    recursive: true,
  });
  fs.writeFileSync(
    "docs/provider-incoming-requests/validation/sdk-retry.json",
    JSON.stringify(
      {
        cases: checks,
        postgrestVersion: "2.118.0",
        actualPageCallBlock: true,
        singleFetchPerMutation: true,
        liveBackend: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS ${checks} real pinned-SDK mutation transport cases; one local fetch each; no live requests.`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
