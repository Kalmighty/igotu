# D03 function-existence and current migration ledger preflight — 2026-10-28

**Target project:** `igotu-staging` (`oqalpauljjhytnrpzcqp`).  
**Current decision:** **TECHNICAL FUNCTION-NAME PREFLIGHT PASS; OPERATIONAL D03 NO-GO.**

This review compared the checked-in D03 source (`igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`) with the **read-only PostgreSQL `pg_proc` catalog** in the explicitly authorized staging project. No user/application rows, Auth records, credentials, production data, DDL/DML or migration actions were accessed or changed.

## What the database currently shows

- Supabase staging project is `ACTIVE_HEALTHY` on PostgreSQL **17.11.0.003**.
- Current migration ledger lists three entries: staging privilege quarantine, D01 foundation and D02 private readers. **D03 and D04 are not recorded as installed**.
- Staging catalog currently contains **50 scoped public/private routines** (29 `public`, 21 `igotu_backend_private`), as independently recorded in earlier read-only inventory.
- D03 source contains **14 plain `CREATE FUNCTION` statements**, representing names not yet present in the target namespace, and **13 `CREATE OR REPLACE FUNCTION` statements**, whose corresponding names are already present in their target namespaces.
- **No direct name-level collision** was observed among the 14 new function definitions, and no name-level missing target was observed among the 13 replacements. This is a source-to-live-name comparison, not a parser-level guarantee of all type signatures.
- The exact **24/24 legacy function MD5 fingerprints** were previously compared with the live database and passed; exact baseline columns **132/132**, constraints **64/64**, trigger definitions **11/11**, enums **6/6** also passed.
- D03 SHA-256 previously recomputed from GitHub source matches the offline inventory `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6`. The inventory classifies all **40** SQL statements as `OFFLINE_REVIEWED_EXECUTION_BLOCKED`.

## Relevant future-object privilege observation

The reviewed D03 source creates routines under the expected **`postgres`** operator context. **Correction:** A per-schema default ACL without explicit browser-role grants does **not** remove PostgreSQL's built-in global `PUBLIC EXECUTE` on new functions when no global function override exists for `postgres`. The inspected catalog confirmed no such global override. D03's explicit private-schema and named-public-function revocations, performed in its transaction before COMMIT, are the relevant protective control; every public function D03 creates or replaces is included. **Separately**, managed `supabase_admin` default ACLs grant broad future-table/sequence/function rights to browser roles. All future routine creations need an approved owner/grant policy. No ACLs were changed. [PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

The private namespace is currently excluded from exposed Data API schemas, and the staged Data API has 0 exposed tables/50 functions according to the operator screenshots. D03 includes explicit privilege changes. **D03 is still an incomplete intermediate security stage: no API/browser traffic or synthetic user tests may be enabled before approved D04 cutover and independent authorization tests.**

## Remaining STOP gates

- [ ] All owned staging writers (Netlify/other hosts, CodeSandbox, service scripts, Auth sign-in/admin creates, webhooks, direct DB clients, Storage and notification automation) must be identified and **actually paused** for the approved maintenance window. Idle connection snapshots do not satisfy this.
- [ ] A supported authorized operator connection and isolation/timeout checks must be available. Earlier managed-environment restrictions must not be bypassed.
- [ ] Review and record future-object grant/ownership governance; avoid toggling managed defaults without separate, reviewed approval.
- [ ] Recheck target, Phase 2 record, 24 legacy hashes, exact SQL checksum and Data API privacy before execution; stop for any drift.
- [ ] Obtain **explicit staging-only D03 migration write authorization**, naming the precise SQL checksum, writer pause, operator, bounded step and stop/recovery procedure. Earlier SELECT-only approval does **not** cover executing D03.

**No-go stays in effect.** D04, staging fixture writes, signups and deployment have separate later approvals. No changes were made to application code, staged schema, project configuration, Auth accounts, deployment, PRs #8–#10, or production.
