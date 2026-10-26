/* Local preparation only. Deliberately contains no HTTP client, SQL executor,
   account creation, mail delivery or project creation capability. */
const assert = require("node:assert/strict");
const plan = require("./acceptance-plan.json");
const expected = Array.from(
  { length: 13 },
  (_, i) => `DB-${String(i + 1).padStart(2, "0")}`,
).concat("EXT-01");
assert.equal(plan.cases.length, 20);
assert.deepEqual(
  [...new Set(plan.cases.flatMap((x) => x.groups))].sort(),
  expected.sort(),
);
assert.ok(
  plan.cases.every(
    (x) =>
      x.status === "PREPARED_NOT_EXECUTED" &&
      x.procedure_and_assertions.length > 80,
  ),
);
if (process.argv.includes("--execute")) {
  console.error(
    "BLOCKED: This plan cannot execute staging mutations. Obtain explicit project, migration and synthetic-test approval, then implement/review the environment-specific runner.",
  );
  process.exitCode = 2;
} else {
  console.log(
    "PASS preparation coverage: 20 workflow cases map to all 14 blocked acceptance groups. Staging execution remains BLOCKED.",
  );
  for (const c of plan.cases)
    console.log(
      `${c.id} PREPARED_NOT_EXECUTED ${c.name} (${c.groups.join(", ")})`,
    );
}
