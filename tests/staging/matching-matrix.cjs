/* Prepared read-only recommendation truth-table checks. Never run in Phase 7. */
const { check, makeRuntime } = require("./runtime.cjs");
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--execute")) {
    console.log(
      "PREPARED_NOT_EXECUTED: controlled recommendations for matching, specialization, skills, unavailable/unapproved/declined/busy/hours, distance and complete aggregates.",
    );
    return;
  }
  const { config, approval, secrets } = require("./config.cjs").load(args);
  const x = makeRuntime(config, approval, secrets);
  const c = await x.actor("clientA");
  check(
    config.matchingControlRequestId &&
      Array.isArray(config.matchingCases) &&
      config.matchingCases.length >= 8,
    "MATCHING_TRUTH_TABLE_FIXTURES_REQUIRED",
  );
  const control = await x.success(
    x.rpc(c, "recommended_provider_candidates", {
      p_request_id: config.matchingControlRequestId,
    }),
  );
  check(
    control.some((r) => r.id === config.accounts.providerA.id),
    "MATCHING_POSITIVE_CONTROL_FAILED",
  );
  for (const test of config.matchingCases) {
    check(
      test.synthetic === true &&
        test.requestId &&
        Array.isArray(test.expectedProviderIds),
      "MATCHING_CASE_INVALID",
    );
    await x.sessionControl(c);
    const rows = await x.success(
      x.rpc(c, "recommended_provider_candidates", {
        p_request_id: test.requestId,
      }),
    );
    check(
      JSON.stringify(rows.map((r) => r.id).sort()) ===
        JSON.stringify([...test.expectedProviderIds].sort()),
      "MATCHING_SET_DIFFERENT",
    );
    for (const expectation of test.statistics || []) {
      const r = rows.find((r) => r.id === expectation.providerId);
      check(r, "MATCHING_STATS_PROVIDER_MISSING");
      check(
        Number(r.total_reviews) === expectation.reviews &&
          Number(r.total_completed) === expectation.completed &&
          (expectation.rating === null
            ? r.average_rating === null
            : Math.abs(Number(r.average_rating) - expectation.rating) < 0.001),
        "MATCHING_AGGREGATES_DIFFERENT",
      );
    }
    if (test.nearestFirst)
      check(
        rows.every(
          (r, i) =>
            i === 0 ||
            r.distance_km === null ||
            (rows[i - 1].distance_km !== null &&
              Number(rows[i - 1].distance_km) <= Number(r.distance_km)),
        ),
        "DISTANCE_ORDER_DIFFERENT",
      );
  }
  console.log(
    "PASS supplied synthetic matching truth table. Seed completeness must be reviewed independently.",
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      "BLOCKED_OR_FAILED: " + (e.safeCode || "MATCHING_CONTROL_FAILED"),
    );
    process.exitCode = 2;
  });
