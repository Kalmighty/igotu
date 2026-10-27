# Phase 6 coordinated staging rollout — REVIEW ONLY

> Phase 7 reviewed/corrected these drafts. See [current migration review](../staging-readiness/README.md), [ordered execution guide](../staging-readiness/guide.md) and [current validation](../staging-readiness/validation.md). Phase 6 evidence below is historical; use the Phase 7 gates and explicit baseline-first order.

**Nothing in this directory has been applied. No staging project has been created.** The four versioned SQL files under `igotu_v2/database/backend-integration/` are deliberately outside `supabase/migrations`. They supersede the earlier Stage A/C and mandatory-identity draft rollout for the reviewed baseline. Do not concatenate or run historical setup SQL. Earlier SQL and rollout sources remain byte-identical.

## Scope and prerequisites

The baseline is the metadata snapshot from production `giqtnbwyktbnbhdvjraa` on 26 October 2026, PostgreSQL 17.6. Only catalog SELECTs were authorized/executed; no application rows/documents were retrieved. Legacy function definitions are a read-only review snapshot, **not an executable migration**. The empty migrations ledger does not prove there were no manual SQL changes.

Before any execution, obtain explicit approval for an isolated staging project, synthetic accounts/documents, and the precise migration changes below. Do not clone production users, Auth credentials, identity files, receipts, messages or assignment records. Create only synthetic examples of legacy inconsistencies. Staging project creation, auth users, buckets and test data are writes and remain blocked.

Review actual staging catalog, version/types, constraints, function hashes, grants, policies, triggers, sequences and extensions. These drafts intentionally reject baseline drift and existing `igotu_private`, `identity_access_private` or `igotu_backend_private` namespaces; adapt and re-review the drafts if staging differs. Do not bypass their gates to make execution succeed. Check inherited grants/default ACLs, all definer callers, service-role/Edge Function jobs, scheduled writers and Storage policies. A catalog hash is evidence of the reviewed function text only, not a security proof.

**Private schema exposure is an external gate.** Inspect effective Supabase Data API exposed-schema configuration using the authorized dashboard/config mechanism. A NULL `current_setting('pgrst.db_schemas', true)` is not proof of non-exposure. Capture failed anonymous and authenticated requests using both `Accept-Profile: igotu_backend_private` and `Content-Profile: igotu_backend_private`, including mutation helper names. Browser schema USAGE and narrowly granted EXECUTE are needed for public invoker wrappers and policy predicates; the namespace itself must stay outside exposed schemas. Do not expose it to fix wrapper failures. Confirm no alternate public wrapper/overload leaks generic transition, emit, eligibility or arbitrary-subject approval helpers.

## Order

| Step | Draft suffix | Result / dependency |
| --- | --- | --- |
| D01 | `01_foundation_draft.sql` | Fresh private namespace; nullable consent fields without backfill; one pending verification per user; request idempotency key and notification event key; own-account predicates and matching helper. Reject duplicate pending history rather than deleting it. |
| D02 | `02_private_readers_draft.sql` | Assigned-Provider projection; request-derived participant summaries; own-request recommendations and complete aggregates; canonical private receipt resolver; Admin reconciliation queue. Requires D01. |
| D03 | `03_integrity_draft.sql` | Atomic Provider save and idempotent request creation; shared Provider advisory locks for assignment/profile/status changes; guarded transitions; existing edit/image/report APIs hardened; Admin status uses the actual `account_status` enum; approval requires recorded consent. Requires D02 and unchanged reviewed legacy function definitions. |
| D04 | `04_cutover_draft.sql` | Coordinated ACL/RLS/Storage lockdown, authority/submission/write triggers, database-only idempotent notifications, private receipts, narrow function permissions, compatibility contract installed last. Requires D03 plus completed independent pre-cutover checks. |
| B | This frontend branch | Uses only the new APIs and contract `20261026.1`; install in isolated staging after D04. No fallback to broad user reads, browser notifications, partial profile writes or public receipts. |

Use Supabase CLI-generated versioned names, but import into an operator-reviewed staging migration workflow only after approval. The files were created locally with CLI `migration new`; no project was linked and no database command was run. A deployment/CI job must never glob and execute all repository SQL files.

For each approved staging SQL session, the operator must supply `igotu.integration.staging_only=true`, `catalog_reviewed=true`, `private_schema_verified=true`, `writes_paused=true` and the **actual isolated** `project_ref` for every stage; verify PostgreSQL 17 and READ COMMITTED for app writers. D04 additionally requires `pre_cutover_reviewed=true`, `writes_paused=true`, `notifier_inventory_reviewed=true` and `legacy_receipts_reviewed=true`. These are operator attestations, not security credentials or automated verification. Drafts require the `postgres` operator role and explicitly reject the production reference. Do not provide these settings through browser clients.

D01–D03 are incomplete security stages. Existing permissive policies remain until D04; they must never be treated as a secure intermediate deployment. D04 revokes browser grants, replaces reviewed browser policies and adds restrictive boundaries for retained custom-role policies. It keeps only specific reads, message/read-flag writes, payment/review inserts and verification submissions. Normal profile/request/assignment mutations go through guarded RPCs. Review each effective privilege after installation, including inherited privileges and custom roles. Install all four in a maintenance window, then test before allowing staging traffic.

## Notification handoff

Pause all browser and backend writers before D04. Inventory Edge Functions, triggers, jobs and service-role writers externally: catalog trigger inspection cannot discover external services. Disable/reconcile legacy emitters only under explicit authorization. D04 replaces the embedded report-review emitter, adds one transactional event source for each supported action, and denies browser notification INSERT. The new frontend removes `notification-helper.js` and all emission calls. Source event uniqueness suppresses retries; old rows keep NULL event keys and are neither rewritten nor deleted.

Pending identity submissions and account suspensions must still emit notifications. Consequently the generic approved-workspace write trigger deliberately excludes `notifications`; its INSERT is restricted to the private emitter by ACL/RLS, while browser read/update still requires own approved workspace. Do not grant browser EXECUTE on the emitter. Verify one event with correct recipient after each create/update and no event after rollback, duplicate action, read flag update or denied operation. Do not cut over one half independently.

## Private receipt cutover

Create synthetic examples of path-only, URL-only, consistent dual-reference, mismatched, foreign-host, encoded/traversal, absent-object, foreign-owner and cash-no-proof records. The resolver accepts only canonical object references for the exact project origin, verifies request/payment participant pairing and object owner/folder, and never returns a legacy URL. The browser requests a five-minute signed URL, signs again on explicit open, and does not persist signed/public URLs. Transfers require an owned proof. Cash remains available without a proof.

D04 aborts on inconsistent existing proof references rather than repairing or deleting them. Before any future production rollout, separately authorize a narrowly scoped data/object inventory and an explicit correction plan; this phase's metadata-only approval does **not** permit that inventory. Historical references must match the destination staging project; use synthetic URLs, never copied production file links.

Making a bucket private prevents future public reads but cannot recall downloaded documents, public caches or previously issued signed URLs. Review cache/CDN invalidation, retention, export and object rotation/deletion requirements separately. No receipt/history row has been rewritten and no object was moved/deleted here. Staging must verify anonymous public endpoints fail and related/unrelated JWT access behaves correctly. `request-images` remains a legacy public bucket; see the privacy blocker below.

## Existing users and assignments

The reported prior counts are 7 active Clients, 35 active Providers and 28 Providers with an inconsistent legacy verified flag. They were not re-counted. The new Admin queue returns flag-true accounts lacking consistent latest approval, 100 per UUID page, including inactive accounts where applicable; it does not assert this count or change records. Use the existing user-filtered verification page to review history.

Preferred path: inform affected users through an approved communication process, have them submit a fresh consented verification, and let an authorized Admin approve/reject through the normal transactional RPC. No automatic approval, fabricated approval history, consent backfill or account deletion. Historical approved records satisfying the existing proof contract remain valid; new approvals require stored consent. Old pending records without consent must be rejected with an honest reason and resubmitted; any exception needs a separately approved, legally valid policy and implementation.

Until approved, affected users cannot access service workspaces, including existing assignments. History remains stored, but service continuation may be interrupted. Before rollout, approve a transition/communication schedule, handling of scheduled/in-progress services, and an Admin-led contingency process. Do not add a grandfather/bypass flag. Suspension/reactivation does not fabricate approval or change request status.

## Explicit decisions / blockers

- Authorization to create isolated staging, configure Auth/mail capture and synthetic users/files, apply these drafts, and perform synthetic writes/concurrency tests is still required.
- Validate function result types, PL/pgSQL name resolution, trigger order, inherited permissions, RLS recursion, API exposure, lock ordering and transaction snapshots on actual PostgreSQL. Offline parsing cannot do this.
- Exact-time slot exclusivity preserves IGotU's current model; no duration exists. Overlapping-duration scheduling would be a new business rule and is not implemented. Existing conflicting reservations are not cancelled or rewritten.
- Private Provider projections withhold structured exact location, description and image URL before confirmation; participants receive no peer email/phone and contact through Messages. Recommendation locations are coarse grids, distances and aggregate statistics only. Free-text titles/bios/feedback/messages may contain personal information; legacy public request images and old known URLs remain a separate privacy/retention blocker. Approve a private image migration/content policy before claiming full location/media privacy. No brittle address-scrubbing is presented as a security boundary.
- Admin self-suspension/last-active-Admin policy, legacy consent exceptions and support access to interrupted assignments need product/security decisions. No new privilege bypass or self-registration is added.
- Fix mutable-search-path/helper grants and leaked-password protection according to the catalog report, then rerun advisors. Changing Auth configuration is not authorized here.

## Verification and recovery

Run `tests/staging/acceptance-plan.json` in a reviewed environment-specific harness after approval. It covers 20 requested workflow cases and all 14 blocked groups. `node tests/staging/readiness.cjs` validates preparation coverage locally and **cannot execute migrations or staging mutations**. Capture separate evidence for anon/wrong-role/inactive REST requests, signed URL expiry, duplicate races, Provider lock races, atomic save rollback and notification counts. UI fixtures do not count as database passes.

Each draft is transactional with lock/statement timeouts; failure should roll back that draft, but earlier committed phases remain. Stop traffic, preserve logs and review the failed phase. Do not restore old permissive policies as an automatic rollback, rerun setup scripts or re-publicize receipts. Back up the isolated synthetic environment before execution; disposable staging recreation also needs operator approval. Production requires a new reviewed migration based on its then-current catalog and separately approved data/retention plan; these staging-only drafts explicitly refuse that project.
