/* Calendar-only arithmetic, with no database or browser dependencies. */
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  { transformSync } = require("esbuild");
const moduleObject = { exports: {} };
new vm.Script(
  transformSync(fs.readFileSync("igotu_v2/js/service-calendar.js", "utf8"), {
    loader: "js",
    format: "cjs",
  }).code,
).runInNewContext({
  module: moduleObject,
  exports: moduleObject.exports,
  Intl,
  Date,
  Set,
  Map,
  console,
});
const c = moduleObject.exports;
let checks = 0;
function ok(v, m) {
  assert(v, m);
  checks++;
}
for (const date of [
  "2024-02-29",
  "2000-02-29",
  "2400-02-29",
  "2026-11-03",
  "0001-01-01",
  "0099-12-31",
  "9999-12-31",
])
  ok(c.dateKey(c.parseServiceDate(date)) === date, "valid " + date);
for (const date of [
  "2023-02-29",
  "1900-02-29",
  "2100-02-29",
  "2026-04-31",
  "2026-00-01",
  "2026-13-01",
  "2026-11-00",
  "0000-01-01",
  "2026-1-01",
  "2026-01-1",
  "2026-11-03T00:00:00Z",
  "",
  null,
  "not a date",
])
  ok(c.parseServiceDate(date) === null, "invalid date");
for (const [from, days, want] of [
  ["2024-02-28", 1, "2024-02-29"],
  ["2024-02-29", 1, "2024-03-01"],
  ["2023-02-28", 1, "2023-03-01"],
  ["2026-12-31", 1, "2027-01-01"],
  ["2027-01-01", -1, "2026-12-31"],
  ["2026-11-03", 7, "2026-11-10"],
])
  ok(c.addServiceDays(from, days) === want, "day boundary");
for (const [from, n, want] of [
  ["2024-01-31", 1, "2024-02-29"],
  ["2023-01-31", 1, "2023-02-28"],
  ["2026-12-03", 1, "2027-01-03"],
  ["2026-01-03", -1, "2025-12-03"],
])
  ok(c.shiftServiceMonth(from, n) === want, "month boundary");
for (const [instant, want] of [
  ["2026-11-02T15:59:59Z", "2026-11-02"],
  ["2026-11-02T16:00:00Z", "2026-11-03"],
  ["2026-12-31T16:00:00Z", "2027-01-01"],
])
  ok(c.malaysiaToday(new Date(instant)) === want, "MYT midnight");
for (const [value, want] of [
  ["00:00", "12:00 am"],
  ["12:00:00", "12:00 pm"],
  ["23:59:59.123456", "11:59 pm"],
  ["08:15:00", "8:15 am"],
])
  ok(c.serviceTime(value)?.label === want, "local preferred time");
for (const value of [
  "24:00",
  "12:60",
  "12:00:60",
  "-1:00",
  "8:00",
  "08:00Z",
  null,
  "",
])
  ok(c.serviceTime(value) === null, "invalid time");
ok(c.serviceStatus("__proto__") === "Status unavailable", "status allowlist");
console.log(
  `PASS ${checks} calendar date/time/status checks; no service calls.`,
);
