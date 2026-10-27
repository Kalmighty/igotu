# Phase 8 pre-staging audit — 27 October 2026 (Asia/Kuala_Lumpur)

**Local preparation completed; real staging remains BLOCKED awaiting separate approvals. No SQL, project provisioning, Auth fixture creation, Storage upload, production access/configuration change, deployment or merge was performed.** Only organization-list metadata was read through the Supabase management connector; no project/database catalog or application rows were queried in this phase.

GitHub PR #6 was verified open, draft and unmerged, targeting `igotu-backend-integration`, at `b619d21f9123c1d340c9ce6c758fbd8ab77e9169`. The remote staging-readiness tip matched and the local working tree was clean. New branch `igotu-staging-validation` starts there and preserves prior work. The new delivery is a separate draft PR targeting `igotu-staging-readiness`.

## A. Staging environment

No staging project is selected/created, so isolation, PostgreSQL/Supabase server versions and effective private-schema exposure are **NOT TESTED**. Proposed project `igotu-staging`, proposed Singapore region; organization, budget, actual quote and retention window need owner approval. The connected organization list includes Kalmighty but is not a choice on the owner's behalf. No privileged credentials are configured in the managed runtime. Exact new staging/mail host permissions and operator access remain prerequisites. Production `giqtnbwyktbnbhdvjraa` is explicitly denied by existing guards; it was not contacted.

Supabase current SMTP documentation confirms hosted default SMTP sends only to team-member addresses. The `.test`/`.invalid` synthetic credentials therefore require an explicitly approved custom SMTP capture service, accepting those recipients without external delivery. A local Mailpit guide alone is insufficient for hosted staging. See [authorization packet](authorization.md) for costs, objects, fixture scope, reversibility, resources left behind and A–D approval gates.

## B. Installation and compatibility

| Step | Offline audit | Actual installation |
| --- | --- | --- |
| Empty synthetic baseline | PASS integrity/order/parser/contracts | BLOCKED — no SQL authorization/project |
| D01 foundation | PASS unchanged reviewed hash/typed dependencies | BLOCKED |
| D02 private readers | PASS unchanged reviewed hash/API dependencies | BLOCKED |
| D03 integrity | PASS unchanged reviewed hash/legacy replacement contracts | BLOCKED |
| D04 cutover | PASS unchanged reviewed hash/security boundaries | BLOCKED |

Reviewed the Phase 7 report, full guide/operator recipes, manifest, templates, baseline, four drafts and staging entrypoints. New `tests/staging/preflight.cjs` verifies exact five-file logical order, paths, SHA-256 values and approval markers **without rewriting the manifest or connecting**. Tampered hashes, reordered/missing files, unreviewed paths and removed approval markers fail regression checks. The baseline's later timestamp must never determine execution order.

The saved-catalog checks cover 132 typed/null/default column contracts, six enums, 64 constraints, 11 trigger bindings, 24 legacy routines and 13 compatible replacements. D03 retains the corrected `public.account_status` cast. Private namespace is `igotu_backend_private`; RLS/helper creation and grants follow D01→D04. Baseline uses managed `auth.users`, `auth.uid()`, `storage.objects`/buckets and PostgreSQL core functions (`gen_random_uuid`, MD5, advisory locks, JSON and numeric/trigonometric functions). No new extension is required by these drafts; pgcrypto/PostGIS/pgTAP are not added. Optional future database lint tooling may require separate extension approval. Unexpected platform extension routines in `public` will stop the strict gates and require review, never automatic drop or allowlist changes.

PostgreSQL **17** and **READ COMMITTED** remain hard requirements. Private documents, payments and report evidence are private; request-images retains the existing public design and is a known production privacy limitation. Actual object normalization, core/managed function availability, plan/result types, owners/inherited grants, RLS, Storage behavior, configuration and lock/rollback correctness remain unproven until approved staging execution. No successful parser check is presented as PostgreSQL execution. No new confirmed SQL defect was established locally; all five approved-candidate SQL files and historical Stage A/C/identity SQL remain unchanged.

## C–D. Functional and security results

Authentication, registration, identity verification, Client, Provider, Admin, matching, messaging, payments, reviews, notifications and maps have **no real staging result**. All backend authorization categories—RLS, RPC, private Storage, role escalation, identity restrictions and concurrent transactions—are **BLOCKED**, not passed. Local browser/SDK fixtures exercise UI and controlled response handling only. Maps/mail/device GPS and actual signed-URL expiry remain external acceptance work.

The existing 20 core workflows, browser role matrix, matching truth table, 305-second expiry and operator race/rollback/legacy procedures are reused. They still require a properly approved environment, synthetic fixtures and independent positive controls. Cases returning CORE_API_PASS are not full acceptance passes; extra operator/external checks must have their own evidence. All nine role pairs are covered locally (3 accept/6 reject) but are not yet tested against real staging Auth.

## E. Confirmed preparation bugs corrected

| Severity / file | Root cause and correction | Regression evidence / remaining risk |
| --- | --- | --- |
| High — `tests/staging/runtime.cjs`, `browser-login.cjs` | Approval expiry was checked only at startup; a long suite could keep sending after its approved window. Revalidate scope/ref/key/expiry before every HTTP request and browser route. | Mock transport proves an expired write never reaches transport; real browser/network execution remains blocked. Expiry may leave fixtures/sessions/probe installed; renewed approval is required for cleanup. |
| High test-validity — `integration.cjs` ST-19 | One success plus any error counted as exclusive assignment. Require the loser to return the specific reviewed booking-conflict P0001/message with HTTP 400. | Accept both winner arrival orders; reject 500/internal, missing RPC, expired JWT, invalid payload, unrelated P0001 and double-success/failure. Actual race and final-state proof still need staging. |
| High credential-handling — `config.cjs` | Mode-600 credentials could still be placed under the local web artifact. Resolve real paths and refuse secrets under the configured frontend root, including symlink targets. | Temporary synthetic file tests cover normal private file, broad permissions, direct web placement and symlink placement. Keep all secrets outside Git/frontend regardless. |
| Medium accounting — `integration.cjs` | Early failure omitted later case records, making incomplete evidence ambiguous. Emit all 20 outcomes, marking skipped cases NOT_TESTED, with run timestamps. Report path is `work/staging/api-results.json`. | One failed first case produces 19 explicit NOT_TESTED records; core/partial semantics remain unchanged. Real evidence is still absent. |

These are local preparation defects, not observed staging integration failures. No application JS/HTML/CSS, core matching behavior, database roles or authorization model was changed.

## F. Test accounting

See [validation evidence](validation.md) and machine-readable [preflight](evidence/preflight.json). Safe local SQL/PLpgSQL parsing, baseline/dependency checks, all existing regression groups and expanded mock guard checks were run. Local fixtures are kept separate from real acceptance accounting.

- Staging workflows prepared: **20**; executed **0**, passed **0**, failed **0**, blocked **20**.
- Real backend/external acceptance groups: passed **0**, failed **0**, **BLOCKED 14** (DB-01–DB-13, EXT-01).
- No staging screenshots exist; no backend-backed browser test was executed. Local fixture evidence is not substituted for staging screenshots.

Remaining decisions include actual isolated catalog/major/defaults, private-schema Dashboard/API controls, SMTP capture, Admin provisioning, JWT revocation guarantee, public-image/historic-receipt privacy, legacy active assignments/consent and Admin self/last-Admin policy. Historical 7/35/28 account counts are not current measurements. No real user is autoapproved, copied, reassigned or deleted.

## G. GitHub delivery

Branch `igotu-staging-validation`; base `b619d21f9123c1d340c9ce6c758fbd8ab77e9169`; separate draft PR targets `igotu-staging-readiness`. Final commit/PR are reported in delivery. [Changed files](changed-files.txt). Existing PRs #1–#6 and the new PR remain unmerged. No deployment.

## H. Readiness and next approval

| Intended use | Recommendation |
| --- | --- |
| Local demonstration | Local synthetic fixture demonstration supported by the recorded checks; explain mocked backend limitations |
| Staging demonstration | BLOCKED — project, installation, fixtures and execution approval/evidence absent |
| Backend-backed functional UAT | BLOCKED — all 14 real acceptance groups lack evidence |
| Production deployment | NOT READY; no deployment authorized |

The package is ready to request **A: organization/region/budget selection and provisioning approval**, after a current cost quote. B (exact baseline/D01–D04), C (synthetic accounts/fixtures) and D (test writes/Storage/concurrency/probe SQL) must each be explicitly approved at their later gates. The [authorization packet](authorization.md) defines their concrete reviewable scope. No SQL or test execution starts from this report or from local flags alone.
