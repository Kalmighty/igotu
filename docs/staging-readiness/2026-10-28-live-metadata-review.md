# IGotU staging backend — read-only readiness snapshot (2026-10-28)

> **Scope: metadata-only verification. NOT a rollout approval.** No SQL, database mutation, Auth sign-in, storage write, service-role operation, production project query, source-code change, migration run, CI deployment, or live user-workflow test was performed in this assessment. Supabase metadata/advisor tools and GitHub source files were inspected only.

## Evidence and current state

Staging Supabase project **igotu-staging**, ref `oqalpauljjhytnrpzcqp`, was reported `ACTIVE_HEALTHY` in `ap-southeast-1`, PostgreSQL 17 (database version 17.11.0.003). This is not the production project. The reported migration ledger contains exactly:

| Version | Recorded name | Interpretation |
| --- | --- | --- |
| `20261027104542` | `igotu_staging_postgres_default_privilege_quarantine` | Initial staging quarantine |
| `20261027152247` | `igotu_staging_d01_corrected_foundation` | D01 installed, according to migration ledger |
| `20261027152518` | `igotu_staging_d02_private_readers` | D02 installed, according to migration ledger |

**No D03 or D04 migration entry was reported.** A ledger entry is not independent proof of the installed routine bodies, complete effective permissions, API exposure or application behavior. Phase values and function fingerprints were **not** read directly for this snapshot.

Table metadata lists 14 `public` application/example tables, all reporting RLS enabled and 0 rows, and the private `igotu_backend_private.installation` table with RLS enabled and one row. These are tool-reported row summaries, not independently verified table counts or a permission test; no Auth accounts or Storage object contents were inspected. Data API effective grants and schema exposure have **not** been verified by a browser-role control request.

Supabase security advisors returned:
- `rls_enabled_no_policy`: **15 INFO** findings (the private installation table plus 14 public tables).
- `function_search_path_mutable`: **9 WARN** findings (legacy public routines).

Performance advisors returned:
- `unindexed_foreign_keys`: **11 INFO**.
- `unused_index`: **16 INFO**.

The no-policy findings are consistent with an intentionally quarantined intermediate setup, **not** evidence that unrestricted access should be added. Do not add permissive policies or grants to silence advisories. Search-path warnings require operator review against the intended D03/D04 hardening, not independent ad hoc patching. Performance advisories are lower priority than isolation and access-control verification. Official lint guides: [RLS enabled/no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Required D03 preflight — NOT CLEARED

The reviewed source is `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`. Before **separately authorized** staging execution, an operator must independently demonstrate:

- [ ] Exact approved staging project identity, PostgreSQL major 17, operator role `postgres`, and correctly paused browser/backend writers. Obtain fresh bounded authorization for any write window.
- [ ] Actual installation record project binding and phase **2**; the ledger alone is not sufficient.
- [ ] Effective Data API exposed schemas and extra search paths: `igotu_backend_private`, `igotu_private`, `identity_access_private` are not exposed. A NULL `pgrst.db_schemas` setting is *not* evidence; capture independent dashboard/config review.
- [ ] Exact baseline catalog review against the checked-in reference: columns/types, enum values, constraints, triggers, function ownership, inherited/default grants, public routines and extensions.
- [ ] Exact reviewed legacy function fingerprints used in D03's `$dependencies$` gate; abort for drift rather than editing, dropping or bypassing the gate.
- [ ] Separate approval for applying the **specific D03 draft** and verifying its transaction outcome; do not run the historical setup/Stage A/C scripts or mix old scripts into a migration glob.

**Current D03 verdict: BLOCKED / NOT INSTALLED.** A prior execution path was blocked by the managed-environment safety controls; no alternate connection, SQL runner or policy bypass should be used to work around that block. An approval flag is an attestation, not permission by itself.

## Required D04 preflight — NOT CLEARED

D04 is `igotu_v2/database/backend-integration/20261026153958_04_cutover_draft.sql`; it requires completed phase **3** first, so it cannot proceed now.

After D03 has been independently verified, also require:
- [ ] Independently reviewed `pre_cutover_reviewed`, `notifier_inventory_reviewed`, `legacy_receipts_reviewed` evidence, with writers paused.
- [ ] Review external jobs, Edge Functions, webhooks and service-role emitters, *not only* PostgreSQL triggers; reconcile duplicate notification writers.
- [ ] Verify only synthetic staging receipt references and Storage owner/path rules; resolve any mismatches through an approved plan, not silent backfills.
- [ ] Confirm expected private evidence buckets and effective table/column/sequence/routine permissions, restrictive RLS, Storage policies, API schema isolation and browser-role controls.
- [ ] Only after approved D04, verify the `igotu_backend_contract` API with an authorized own-account positive control, and deny wrong-role/anonymous private-schema routes. Do not regard a failed generic API request as proof of proper denial.

**Current D04 verdict: BLOCKED / NOT INSTALLED.** Existing CodeSandbox pages can still target the checked-in production frontend configuration; never use the unmodified frontend for staging integration testing.

## Planned acceptance boundary (not yet authorized or tested)

Following an approved D03/D04 completion, an isolated staging-only frontend artifact and **synthetic** Client/Provider/Admin accounts are required for real Auth, RLS, RPC, service-date/calendar-history completeness, assignment-state, notification, receipt, and concurrency tests. The 29 calendar, 94 functional and 84 layout results reported by Codex are **frontend/synthetic tests only**, not backend acceptance. The synthetic test coverage also does not establish manual assistive-technology accessibility.

Do not alter production, merge feature PRs into a deployment branch, enable public signup or begin live-test writes on the basis of this report.

## Next decisions / stop conditions

1. Maintain staging quarantine; do **not** execute D03/D04 or browser integration tests now.
2. Obtain independent effective private-schema/API grant evidence and full staging catalog/function-hash comparison from an approved operator, without bypassing managed environment controls.
3. Resolve the previously blocked execution mechanism through the proper approval/supported operator environment; if it remains unavailable, report `BLOCKED` rather than switching to production or a less restrictive SQL path.
4. Secure *specific* approval for the D03 migration and bounded staging-only test-write scope; after a verified phase 3, separately review D04's pre-cutover evidence and seek D04 approval.
5. Preserve unrelated open draft UI PRs #8/#9/#10; no merge/deploy is implied.

### Provenance

Read-only project metadata, migration history, public/private table summaries and Supabase security/performance advisors on **2026-10-28**, combined with the checked-in D03/D04 SQL gates and `docs/staging-readiness/guide.md`, `README.md`, and `validation.md` on `igotu-staging-validation`. Earlier "not provisioned" docs describe their original drafting date, **not** this live staging snapshot. Metadata outputs should be rechecked before any authorized operation.
