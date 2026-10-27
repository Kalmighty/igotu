# Phase 7 validation — local passes, database proof blocked

**15 local check groups passed; 94 fixture scenarios passed with zero failures in the full Phase 7 run. No SQL or staging integration test was executed.** Latest draft/contract/baseline/transport source checks were rerun after final review edits; browser application files were not changed. [Machine-readable results](validation-results.json) and [sanitized logs](evidence/) are committed.

| Validation | Executed local result | Meaning / limit |
| --- | --- | --- |
| Application syntax/references | PASS: 30 HTML, 38 JS, 7 CSS; zero missing references/duplicate IDs/JS syntax errors | Static source only; UI/auth functionality preserved |
| All application SQL sources | PASS: 24 SQL files, 840 outer statements parse offline | Includes the new empty baseline and historical SQL; not a runnable concatenation |
| Coordinated D01–D04 bodies | PASS: 190 statements, 63 routine definitions, 79 PL/pgSQL units, SQL function bodies and dependency order | No PostgreSQL planning, result-type execution, RLS, grants, lock or transaction proof |
| Legacy replacement compatibility | PASS: all 13 replacement parameter names/types and normalized return types match saved routine contracts | Only saved metadata compatibility; live drift is unknown |
| Baseline/preflight contracts | PASS: 132 typed column contracts, 64 constraints, six enum definitions, 11 enabled trigger bindings, 24 baseline routines/owners and source privilege boundaries | Current staging catalog must be independently checked before installation |
| Empty synthetic baseline | PASS offline: 191 statements, 25 PL/pgSQL units, 14 tables/24 identical quarantined legacy definitions; deterministic no-overwrite builder | Not executed; no users/data/counters copied; no claim of production restore equivalence |
| Prepared operator SQL | PASS offline: SELECT-only catalog checklist, scoped late-failure install/remove, interactive lock barrier and isolation rejection procedure parse | None was submitted to a database |
| Historical identity/security draft protection | PASS: protected Stage A/C and mandatory identity SQL unchanged; original draft parser and guarded initializer checks pass | Historical alternatives are not combined into this rollout |
| Homepage | PASS: responsive/keyboard/axe checks at 1440/1024/768/390/320px | Local fixtures, no external services |
| Login/Register | PASS: all nine role/account pairs (3 accepted, 6 rejected), cleanup/sign-out failures, suspended/missing/onboarding cases, mobile/axe | Auth responses intercepted; no real credentials/emails |
| Real pinned SDK tests | PASS: scoped cleanup, simulated failed logout, cross-tab sign-out and invalid-refresh locking | Actual SDK with local synthetic HTTP; no live token-revocation proof |
| Mandatory verification UI | PASS: 16 direct routes, identity states/consent/private-file payloads, Admin decision UI and approval-first onboarding | Fixtures do not enforce or prove actual RLS |
| Workspace layout/functional | PASS: 84 layout checks plus all 94 named functional scenarios, including security-boundary UI, profile-save failure, creation retry, receipt errors, message races and Admin queue pagination | State model, not real database semantics; SQL corrections need their own actual staging cases |
| Staging plan coverage | PASS preparation: 20 executable core procedures map to all 14 blocked groups; default plan modes do not connect | Prepared, NOT EXECUTED |
| Staging transport/builder checks | PASS: mock controls, broken endpoint/session rejection, default/missing-approval entrypoint guards, exact-origin/production/key/synthetic/expiry checks, no-overwrite artifact builder and late-probe binding | Local unit checks and fake public configuration only |

The new guard unit checks initially needed subprocess permission in this managed sandbox (`EPERM` on child creation); they passed with local subprocess permission. No staging connection was used to resolve that environment limitation. The scoped late-failure probe uses **General Cleaning**, while earlier profile/matching/race setup uses Home Cleaning, so installing the probe does not invalidate earlier positive controls.

Reproduce the safe local checks (requires installed test dependencies, Python pglast and Chromium/loopback permission):

```sh
npm --prefix tests test
python tests/migration-review.py --write-review
python tests/staging-baseline.py
node tests/staging/preparation.test.cjs
node tests/staging/integration.cjs --plan
node tests/staging/browser-login.cjs --plan
node tests/staging/storage-expiry.cjs --plan
node tests/staging/matching-matrix.cjs --plan
```

The first command runs the 15-group local runner and blocks live backend traffic. Parsing uses native parsers without a database. `--plan` does not load credentials or connect. Unit tests may invoke an entrypoint with `--execute` **without configuration** solely to verify it exits before reading secrets/network/case execution; no staging procedure executes. Do not run configured `--execute` or any SQL until separately authorized.

## Actual staging accounting

- Workflows prepared: **20**, plus guarded real-browser role matrix, recommendation truth table, actual five-minute signed-URL expiry and operator/session/rollback procedures.
- Staging workflows executed: **0**.
- Real staging passed: **0**.
- Real staging failed: **0** (nothing executed, not evidence of correctness).
- Real-backend/external groups still **BLOCKED: 14** — DB-01–DB-13 and EXT-01.

DB-01 still needs fresh catalog and effective API compatibility. DB-02/03 require actual role/status/identity/profile-state REST denial. DB-04/05 require submission/cleanup/decision races and synchronized approval. DB-06/07 need full matching truth sets and real lock interleavings. DB-08 needs participant policies and a decided/proven JWT revocation guarantee. DB-09/10 require receipt expiry/legacy privacy and uniqueness/aggregates. DB-11/12 need evidence/notification transactions and true late-failure rollback. DB-13 needs coordinated installation/handoff/legacy transition. EXT-01 needs controlled real mail, maps/GPS/CDN/configuration.

[Guide](guide.md) and [operator procedures](operator-tests.md) identify required approvals and positive controls. No test summary, version string, local approval JSON or successful parse authorizes provisioning/SQL, proves a private schema is unexposed, or demonstrates real database correctness.

## Documentation sources and version limits

Supabase Database Functions security/search-path/privilege guidance was retrieved through the documentation connector. PostgreSQL 17 `ALTER DEFAULT PRIVILEGES` source documentation confirms per-schema REVOKE cannot undo global default grants: [PostgreSQL 17 reference](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html), [official source mirror](https://github.com/postgres/postgres/blob/REL_17_STABLE/doc/src/sgml/ref/alter_default_privileges.sgml). See also [Supabase functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [private Storage](https://supabase.com/docs/guides/storage/security/access-control).

The direct Supabase changelog fetch returned HTTP 403 under the environment network policy; no bypass was attempted. No claim is made that every current platform breaking change has been ruled out. PostgreSQL/Supabase/API/Storage configuration must be rechecked on the approved staging project. SDK dependencies remain pinned; no new frontend framework was introduced.
