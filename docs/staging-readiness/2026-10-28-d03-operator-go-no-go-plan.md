# IGotU staging D03 — Operator go/no-go and maintenance-pause plan

**Review date:** 2026-10-28  
**Target:** Supabase project `igotu-staging`, reference `oqalpauljjhytnrpzcqp`, PostgreSQL 17.  
**Migration under consideration:** `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`, reviewed file blob SHA `d7a4e7bf6394a9188868cabbf285585a361084c0`.  
**Current decision:** **NO-GO**; **not an execution authorization**. No SQL writes, migration, permissions changes, account work, hosting/production change or merge were performed to produce this document.

This is an **operator worksheet**, not a SQL command, automated deployment script or substitute for separate informed approval. The responsible operator should record the date, reviewed commit/content digest, scope, sign-off and result outside this public GitHub repository. **Do not commit credentials, user data, JWTs, project service keys, identity files, or sensitive logs.**

## Verified preconditions (evidence recorded elsewhere in PR #11)

- [x] Target project identity is different from known production `giqtnbwyktbnbhdvjraa`; staging project currently healthy and on PostgreSQL 17.
- [x] Installation `version=20261026.1`, `phase=2`, `project_ref=oqalpauljjhytnrpzcqp` confirmed by SELECT-only inspection.
- [x] D01 exact schema baseline confirmed: **132/132** typed columns/nullability/defaults, **64/64** constraint definitions, **11/11** enabled trigger bindings, **6/6** enums.
- [x] D03's **24/24** legacy routine MD5 fingerprints matched `pg_get_functiondef` in staging.
- [x] Current application tables and nine public sequences are quarantined from effective `anon`/`authenticated` object-level grants; zero application table/column browser grants were found in the scoped audit.
- [x] User-supplied Data API screenshots show `public` and `graphql_public` exposed; `igotu_backend_private` excluded; zero exposed tables/functions; auto table exposure off; extra search path `public, extensions`.
- [x] Staging Auth screenshots show signup/anonymous/manual-linking disabled, email confirmation on, and email provider enabled. No custom OAuth providers or configurable Auth Hooks shown. Site URL is `http://localhost:3000` and no extra redirect URLs are listed. These are **configuration observations, not live writer-proof**.
- [x] No GitHub Actions workflow files/runs, staging Edge Functions or installed `pg_cron`/`pg_net` identified in the inspected scopes. The selected Netlify team showed no listed sites; other teams/accounts and external hosts are not excluded.
- [x] Read-only connection snapshot showed no active application writer **at that moment**. This is **not** a migration-time writer pause.

## Remaining hard blockers — every item MUST be reviewed before GO

### A. Staging writer ownership and controlled pause

- [ ] Record an identified **operator responsible for the maintenance window** and the separately authorized start/end conditions. Do not publish personally identifying details in the repository.
- [ ] Check all **external frontend/hosting deployments**, including CodeSandbox sessions and Netlify sites under any other owned team/account, for a staging endpoint and live user traffic. The committed frontend still references **production** and must never be used as staging proof.
- [ ] Check direct/pooler clients, CI or external scheduler jobs, webhooks, service-role integrations, Auth admin/user-creation tools, mail/notification workers, Storage jobs and other automation capable of connecting to the staging project. Document known owners and actions without exposing credentials.
- [ ] Confirm staging Auth **new registration remains disabled** until a separately approved synthetic-account test window. Existing user sign-in or administrative user creation can still write; include these paths in the pause.
- [ ] Establish and *enforce* the pause for every owned staging application/backend writer using approved platform controls. **Do not** pause or disable Supabase-managed infrastructure indiscriminately or change Auth/RLS solely to fake a pause.
- [ ] Before any authorized D03 attempt, independently recheck the actual staging project, active sessions/open transactions, queued workers, integration status and the operator's positive evidence that writers cannot reappear. `pg_stat_activity` alone cannot establish this.
- [ ] Define the explicit event/role responsible for lifting the pause; do not resume browser/API traffic until a **separately approved** D04+validation stage. D03 by itself does **not** make the backend ready.

### B. Platform ownership, privileges and configuration

- [ ] Review the effective **default ACL** for objects created by `supabase_admin`: under schema `public` it presently provides browser-role grants for future tables, sequences and functions. Current app tables are `postgres`-owned and lack browser grants, but future object creation must follow an approved owner/grant/API-exposure policy. Do not mutate managed default ACLs casually or enable auto-exposure.
- [ ] Verify future migrations use the expected `postgres` operator context, no inherited/bypass grants, and no unexpected default privileges or Search Path/owner drift. Cross-check safe READ COMMITTED assumptions and the managed-environment connection configuration.
- [ ] Recheck external Data API exposed-schema settings immediately before execution, including absence of `igotu_backend_private`, `igotu_private` and `identity_access_private`; `current_setting('pgrst.db_schemas',true)=NULL` does **not** establish isolation.
- [ ] Confirm private Storage bucket metadata and existing policy scopes are unchanged. The `request-images` bucket remains public and is **not** suitable for potentially sensitive material. Record a separate privacy/cutover decision; do not conflate it with D03 readiness.
- [ ] Establish the **supported privileged staging execution path** after the earlier managed-environment execution block. No proxy, allowlist, network or sandbox workaround; if the path is unavailable, stop.

### C. Exact migration authorization and dry review

- [ ] Perform an independently reviewed content digest of the **exact D03 file/commit** and verify it against the approved statement inventory (`docs/staging-readiness/statement-review.json`). A Git blob SHA is not a SQL-body SHA-256; record the actual approved content digest separately.
- [ ] Explicitly approve **this D03 only**, on project `oqalpauljjhytnrpzcqp`, with accountable operator, bounded window, scoped allowed database writes, transaction/lock/timeout plan, stop criteria and phase-3 readback. **The prior user approval was SELECT-only metadata access and does not authorize a migration.**
- [ ] Operator independently verifies PostgreSQL version/role/project/installation and current legacy hashes, then attests `staging_only`, `catalog_reviewed`, `private_schema_verified`, `writes_paused`, and exact `project_ref` **only after evidence is true**; do not fabricate settings merely to pass SQL gates.
- [ ] Do **not** concatenate or run old Stage A/C, historical identity scripts or all repository SQL files. Execute exactly one approved transactional D03 step using the supported documented operator workflow (`docs/staging-readiness/guide.md`). The runbook prescribes `ON_ERROR_STOP=1`, and D03 itself uses explicit lock/statement timeouts.
- [ ] Define failure response: if an authorization/catalog/hash/grant check fails, **STOP**, retain D01/D02 state, collect sanitized error, independently read back installation stage, and obtain a fresh review. Do not remove a failing guard or retry blindly. A lost connection after commit is ambiguous and requires phase/objects verification before any retry.

## After a separately approved D03 execution (NOT performed)

- [ ] SELECT-only installation readback reports `phase=3`, project_ref and version unchanged.
- [ ] Independently verify the **specific D03 integrity changes**, especially Client-only basic profile completion, atomic Provider onboarding, guarded service request creation/transition flows, and latest-only Admin verification decision; compare reviewed function signatures and expected grants.
- [ ] Recheck RLS/API quarantine, unexpected routine grants, function owners, Storage policies, and no browser/backend writers resumed.
- [ ] Record sanitized findings and conditional operator sign-off. If a test fails, remain paused and do not apply D04 until the failure is reviewed.
- [ ] Only begin D04's separately approved pre-cutover review after verified phase 3; notifier inventory, historical receipts, evidence-bucket rules, Storage ownership and effective ACLs remain independent gates.
- [ ] No real Auth user workflow, synthetic test-write batch, site deployment, signup enablement, production changes or GitHub PR merge merely because D03 applied. The approved D04 and end-to-end staging plan must complete first.

## Decision log

| Decision | Current state | Required to advance |
| --- | --- | --- |
| D03 exact catalog / legacy hashes | **PASS** | Re-verify if time/branch drift or external migration |
| Data API private helper exclusion | **SCREENSHOT PASS** | Fresh external settings check at window |
| Auth and common writer configurations | **PARTIAL PASS** | External hosting/client/service ownership inventory |
| All staging writers paused | **UNVERIFIED** | Enforced operator-controlled pause, not an idle-session inference |
| Future-object default ACL governance | **NEEDS REVIEW** | Document owner/grant policy; independent approval for any changes |
| Managed execution capability | **BLOCKED/UNVERIFIED** | Supported authorized operator route only |
| Exact D03 migration write authorization | **NOT GIVEN** | Separate informed approval |
| **D03 GO / NO-GO** | **NO-GO** | All above hard blockers cleared; only then seek GO decision |

### Sources

`docs/staging-readiness/guide.md`, `docs/staging-readiness/statement-review.json`, `docs/backend-integration/rollout.md`, reviewed `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`, and the dated evidence files in this draft PR. The operational plan is intentionally stricter than checking only session activity.
