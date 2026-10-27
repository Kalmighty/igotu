# Phase 8 authorization packet — no staging operations approved

Prepared 27 October 2026 (Asia/Kuala_Lumpur). This packet and local approval flags do not grant permission. The Phase 8 request explicitly requires separate approval for each mutating stage. Historical metadata-only permission does not authorize any of these operations.

## A. Provisioning and configuration — BLOCKED

Proposed **new, disposable** project name: `igotu-staging`. Proposed region: `ap-southeast-1` (Singapore), subject to the owner's choice. The connected organization list contains `Kalmighty`; the owner must choose the organization explicitly before a cost quote or project creation. No existing project has been selected, no project reference assigned, and no project created. Production `giqtnbwyktbnbhdvjraa` is denied throughout the prepared tools and SQL gates.

Project/compute, Storage/egress and any SMTP capture service **may incur charges**. No $0 assumption or binding cost quote is made. After organization/region selection, obtain and present the applicable project quote and any separate mail-service cost before requesting creation approval. Do not create on a different plan or exceed the approved budget. Provisioning approval must identify operator, project name, organization, region, cost cap and retention window.

Configuration scope: an independent PostgreSQL 17 project with separate Auth, Storage and keys; local-only frontend callbacks; email confirmation enabled; controlled test rates; a custom SMTP capture service that accepts the reserved `.test`/`.invalid` recipients without external delivery; private document/receipt/evidence buckets and effective private-schema exclusion. Supabase's default hosted SMTP restricts recipients to team members and cannot serve this synthetic mailbox plan. Local CLI Mailpit is not automatically available to a hosted project. A separately approved mail capture endpoint must be reachable by hosted Auth.

Access needed: organization provisioning/billing rights, operator-only staging database access, staging Dashboard configuration access, publishable key, custom SMTP capture access and exact staging API/mail/CDN network permissions through the supported environment workflow. No runtime secret or outbound identity is currently configured; current HTTP policy permits the old production API hostname but **not** a future staging hostname, and TCP grants are empty. Never use production as a fallback or bypass the proxy. Installing a new PostgreSQL major or encountering incompatible platform defaults is a stop/review condition.

## B. Baseline and D01–D04 SQL — BLOCKED

Request separately **after A** identifies the actual staging project and fresh catalog/exposure evidence is collected within the approved scope. Authorize only the five SHA-256-bound files in [the manifest](../staging-readiness/migration-order.json), in this explicit order:

1. `20261026165620_phase7_synthetic_baseline_draft.sql` — empty synthetic baseline.
2. `20261026153952_01_foundation_draft.sql` — D01.
3. `20261026153954_02_private_readers_draft.sql` — D02.
4. `20261026153956_03_integrity_draft.sql` — D03.
5. `20261026153958_04_cutover_draft.sql` — D04.

The baseline creates six enums, 14 empty application tables, nine sequences starting at 1, keys/indexes, 24 quarantined legacy routines, 11 trigger bindings and four buckets with scoped policies. Managed Auth/Storage schemas remain managed prerequisites. D01–D04 add consent/request/event columns, indexes, `igotu_backend_private` installation/functions, narrow public RPCs, integrity/notification triggers, explicit grants/RLS and private receipt cutover. No user approval/history backfill is authorized. No historical Stage A/C/identity scripts are included. All five files are byte-identical to PR #6 in this phase.

Verify actual project/connection, PostgreSQL 17, required managed objects/core functions, READ COMMITTED, exact hashes, predecessor phase, owners/ACL and external Data API configuration before each stage. Use one file/transaction at a time with stop-on-error; never filename sorting, concatenation or automatic `db push`. Unknown extension routines/public objects must be reviewed rather than removed or allowlisted blindly. NULL `pgrst.db_schemas` proves nothing. Require Dashboard evidence plus both anonymous/authenticated header probes with positive public controls after cutover.

Individual stage failures roll back that stage, not earlier commits. Ambiguous disconnects require catalog/phase inspection before any rerun. Keep writers paused. Do not restore permissive legacy security. A disposable reset/recreation is a separate resource/data mutation requiring authorization.

## C. Synthetic accounts and fixtures — BLOCKED

Request separately **after B** verifies phase 4. Scope includes 11 distinct reusable actors: Client A/B, Provider A/B, active authorized Admin, unverified Client, pending Provider, rejected Client, suspended Client with valid history, flag-only inconsistent legacy Provider, and suspended Provider with valid history. Two additional fresh registration accounts exercise ordinary Client/Provider signup. Supplemental truth-table, legacy, pagination and connected end-to-end workflows need an explicitly enumerated fresh synthetic batch and size limit before creation.

Only fake names/addresses, synthetic coordinates/service descriptions, fake identity last-four and inert PNG or clearly watermarked synthetic documents. No real MyKad/passport, financial details or production exports. Ordinary Admin decisions create truthful synthetic approval histories. Only an explicitly authorized operator provisions the single synthetic Admin's real database role and deliberate legacy inconsistency; metadata never grants Admin. No public Admin registration and no real-user approval or repair.

Fixtures include consented pending/rejected/approved histories, complete/incomplete profiles, skills/specializations/hours, service assignments in controlled future slots, synthetic private files and independent expected matching/statistics/event ledgers. Approval must specify the actual staging reference, identities/batch and retention/cleanup scope. Credentials stay in private mode-600 files outside Git and the frontend; server secrets never enter browser JavaScript.

## D. Functional and security execution — BLOCKED

Request separately **after C** validates fixture state and positive controls. Scope: real synthetic Auth signup/login/logout/confirmation/recovery and session tests; browser role matrix at desktop/mobile; direct JWT REST/RPC success/denial; private Storage upload/sign/read/expiry/delete attempts; identity/Admin decisions; full Client/Provider service workflow; offline Cash/transfer recording; reviews/reports/notifications; profile updates; recommendation truth table and distinct-session concurrency tests. Core ST-19 creates/cancels 40 synthetic requests over 20 races; histories remain rather than being deleted. Other cases also create/update persistent synthetic records.

The scoped `atomic-probe-install.sql` and `atomic-probe-remove.sql`, interactive `concurrency-barrier.sql` and `isolation-check.sql` require explicit operator SQL/probe approval within D. The late-failure constraint is limited to synthetic Provider B and General Cleaning, tested using that Provider's real JWT. Its authorized removal must be included. Broader grant fault injection or extra migrations require their own explicit scope; no blanket permission to patch the database.

Run the existing procedures from [guide](../staging-readiness/guide.md) and [operator recipes](../staging-readiness/operator-tests.md). No configured `--execute` is permitted yet. An HTTP 500, expired session or missing RPC cannot pass a denial/race. Positive controls, exact expected SQLSTATE/semantics, independent final-state reads and evidence are required. Prepared/core-only passes do not close the 14 acceptance groups. The runner records all 20 outcomes, marking unattempted cases NOT TESTED after failure; operator/external subchecks remain BLOCKED until separately evidenced.

## Resources, reversibility and retention

The project, database objects, Auth users, Storage files, synthetic history, mail capture resources and local ignored evidence remain after testing until separately approved cleanup. Local code changes are revertible through Git. Each migration is transactional, but earlier committed stages and emitted/captured emails are not undone by a later rollback. Synthetic writes are persistent; normal service cancel/status transitions are used for cleanup, never insecure policy restoration or history deletion. Already issued signed URLs can remain valid until expiry; downloaded copies cannot be recalled. A failed transaction can still consume sequence values.

Approvals must include an expiry and operator identity. Runtime approval expiry is rechecked before each HTTP request, including cleanup; expiry stops further traffic rather than silently extending permission. Existing sessions, fixtures or probe constraints may remain and require renewed cleanup approval. Project deletion, paid-service cancellation, storage/account deletion and production rollout are **not** implied by A–D.

**Next decision:** select the organization/region and acceptable cost cap for A. Present the actual quote before project creation. B, C and D remain pending separate, project-specific approval at their respective gates.
