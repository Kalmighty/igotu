# IGotU staging D03 — Operator go/no-go and maintenance-pause plan

**Review date:** 2026-10-28  
**Target:** Supabase project `igotu-staging`, reference `oqalpauljjhytnrpzcqp`, PostgreSQL 17.  
**Migration under consideration:** `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`, reviewed file blob SHA `d7a4e7bf6394a9188868cabbf285585a361084c0`.  
**Current decision:** **NO-GO**; **not an execution authorization**. No SQL writes, migration, permissions changes, account work, hosting/production change or merge were performed to produce this document.

This is an **operator worksheet**, not a SQL command, automated deployment script or substitute for separate informed approval. The responsible operator should record the date, reviewed commit/content digest, scope, sign-off and result outside this public GitHub repository. **Do not commit credentials, user data, JWTs, project service keys, identity files, or sensitive logs.**

## Conditional user authorization — recorded after operator review

The user responded **"yes"** to the explicit question: *"Do you authorize applying the exact reviewed D03 migration to igotu-staging (oqalpauljjhytnrpzcqp) only, provided the writer pause and execution safeguards are verified first?"* This is **conditional D03-only permission**, not permission to attest unverified preconditions, modify the SQL, bypass the managed environment, apply D04, change production, or enable users. It supersedes earlier documents' statement that no D03 approval whatsoever had been expressed, **but the conditions remain unmet**, so execution is still on hold.

After that authorization, the current Supabase project readback still showed **phase=2**, `ACTIVE_HEALTHY`, PostgreSQL 17.11, `postgres`/READ COMMITTED, and zero other *active* client sessions at the checked instant. The exact local staged D03 SQL also matched SHA-256 `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6`. These results do **not** establish an enforceable maintenance freeze.

**Execution blocker:** The assistant's available migration interface has not demonstrated equivalent session-attestation, explicit BEGIN/COMMIT and ledger semantics to the required `psql` operator workflow. No configured local `psql` binary, PostgreSQL service file or authorized staging operator connection was available in the current execution environment. Do not use an unreviewed modified migration, reset guards, claim `writes_paused=true`, or substitute another route to force execution. A permitted operator environment must establish a supported **direct or session-mode** PostgreSQL connection with separately held credentials and verified project identity, then enforce and attest the writer pause. The conditional approval can only be acted on once those predicates have truly been verified. D03 has **not** been applied.

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

## Recommended operator connection route (official Supabase connection guidance, checked 2026-10-28)

This is a **procedure recommendation**, not proof of an established or authorized connection. Supabase currently recommends a **direct PostgreSQL connection for migrations**, with the **shared session-mode pooler** as an alternative when the operator's environment is IPv4-only. Both preserve long-lived PostgreSQL session state. The **transaction-mode pooler** does not preserve session state between transactions and must not be selected as a casual substitute for the reviewed `psql` + attestation-file workflow.

- **Preferred:** use the project Dashboard **Connect → Direct connection**, from a supported and explicitly permitted operator environment with IPv6 (or approved IPv4 add-on), using the exact host/username from the Dashboard, not a reconstructed pooler hostname.
- **Conditional alternative:** if direct connectivity is unavailable solely due to IPv4, evaluate **Connect → Session pooler** with a documented operator capability test and confirmed session semantics. Do not use the **Transaction pooler**.
- **Transport:** use TLS with server-certificate validation according to the operating environment and Supabase certificate settings; never store a database password in GitHub, the browser source, an open issue, or any user-facing screenshot.
- **Execution:** preserve the repository's `psql -X --set=ON_ERROR_STOP=1` and single-connection operator attestation procedure as written; confirm the exact staged project reference and transaction semantics before any execution approval. D03 already contains `BEGIN`/`COMMIT`, so do **not** wrap or decompose it blindly through an unverified migration/SQL API. An `apply_migration` tool is **not** presumed equivalent to this procedure. Reconcile the installed D01/D02 migration ledger (`20261027` versions) with the repository D03 draft filename (`20261026`) in an approved migration ledger plan; do not use `db push`, force history repair, run all SQL files, or fabricate a new applied revision.
- **Operator-level read-only connectivity preflight:** independently establish that the permitted connection resolves to `igotu-staging` with expected PostgreSQL role/phase and can keep session-local state within the intended operator-controlled scope. This is not yet demonstrated via that external `psql` environment.
- **Migration approval:** the user previously authorized SELECT-only metadata access, **not** D03 DDL/DML. No invocation of a migration or service pause has occurred.

Official documentation: [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) (migration/direct vs session vs transaction modes), [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) (migration history and deploy synchronization).

### Proportionate future-object privilege policy for the D03 decision

**Correction to earlier default-grant assumption:** The `postgres` role is the intended D03 owner, and existing application objects have explicit quarantine grants. However, the inspected catalog shows **no global `postgres` function default override**; PostgreSQL normally grants `EXECUTE` on newly created functions to `PUBLIC`. A schema-specific `postgres` default ACL with no explicit browser roles cannot revoke the global default. The D03 source independently **REVOKEs `PUBLIC`, `anon`, `authenticated`, and `service_role` execution on all private-schema functions and every one of its 15 affected public wrappers**, then GRANTs only selected entry points before COMMIT. These *transactional explicit revocations*, not an assumed safe default, are why D03's newly created functions avoid a committed unintended public-execute state. For future separate functions, adopt an approved global-default and/or mandatory in-transaction REVOKE/GRANT policy; changing global defaults is a separate administrative modification, **not authorized by this review**. The broad managed `supabase_admin` future defaults remain an additional risk; do not change managed defaults without independent review. Verify actual grants after any separately approved D03 and D04. [PostgreSQL 17 docs](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

### One practical owner confirmation needed before scheduling a maintenance window

The project owner must account for any staging credentials shared with **CodeSandbox, Netlify, CI, external APIs, direct database clients, Auth Admin/service-role scripts, webhooks or a test browser**. If no external staging writer has ever been connected, record that as a scope-limited owner declaration and still enforce no new staging writes for the entire approved window. Disabled new signup and a zero-active-session snapshot alone do not prove this. A responsible operator must control the pause, verify it immediately before execution, and only resume writers after the separately approved safe cutover and tests.

**Result:** Supabase offers a documented *candidate* connection method; no approved operator connection, maintenance freeze or D03 write authorization exists yet. **D03 remains NO-GO.**

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
