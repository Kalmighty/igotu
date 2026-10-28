# D03 operator execution-path compatibility review — 2026-10-28

**Scope:** Read-only configuration verification on the user's expressly approved staging project `oqalpauljjhytnrpzcqp`, review of the checked-in SQL/runbook and available migration-tool contract. No migration, DDL/DML, settings change, Auth/test login, SQL transaction write, publication, deploy or production access.

## Verified read-only staging environment

| Field | Result |
| --- | --- |
| Database | `postgres` on `igotu-staging` |
| Operator and session role | `postgres` |
| PostgreSQL version | `17.11.0.003` (`server_version_num=170011`) |
| Default transaction isolation | `read committed` |
| Current SELECT-only metadata session isolation | `read committed` |
| `postgres` permission to create in `public` and `igotu_backend_private` | `true` for each |
| Installation state | version `20261026.1`, project `oqalpauljjhytnrpzcqp`, **phase 2** |

These are observed at the time of metadata review. They are **not** an assertion that the D03 maintenance transaction is open or that the operator will keep the same session/role later.

## Exact migration file and existing history

- Reviewed SQL: `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`, SHA-256 `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6`.
- D03 file includes **explicit `BEGIN;` and `COMMIT;`**, `SET LOCAL lock_timeout='5s'` and `statement_timeout='60s'`, and session-local attestation checks for `igotu.integration.staging_only`, `catalog_reviewed`, `private_schema_verified`, `writes_paused`, and `project_ref`.
- D01/D02 were recorded in the staging migration ledger with project-specific **20261027** versions, while source draft filenames use **20261026** versions. These identifiers are not interchangeable. The installed phase **2** is proven separately, but a new applied migration ledger entry must have an operator-approved mapping.
- The project skill's available Supabase `apply_migration` action takes a `name` and SQL body and writes a migration; it does **not** specify whether manually embedded `BEGIN/COMMIT`, the local attestation settings, and the repo's required one-file `psql -X --set=ON_ERROR_STOP=1` procedure behave identically in its execution context. **Do not assume they are equivalent or run this file through that tool as a casual fallback.**
- The repository runbook specifies a privileged, supported operator connection, an attestation file external to the repository, one individually approved migration file per step, and post-transaction readback. Earlier managed-environment execution restrictions must not be circumvented with a different host, proxy, tunnel, SQL Editor trick or production connection.

## Decision

**Environment settings: PASS (metadata only).**  
**Exact SQL identity: PASS.**  
**Complete writer pause: NOT VERIFIED.**  
**Default privilege/future-object policy: PARTIAL — managed `supabase_admin` grants require an approved governance decision, whereas D03-created routines are intended to be `postgres` owned.**  
**Operator migration method / transaction semantics: UNVERIFIED.**  
**Separate D03 write authorization: NOT GRANTED.**

Therefore **D03 GO/NO-GO = NO-GO**. Do not set `writes_paused=true` unless all relevant writers are actually paused and cannot reconnect through the maintenance window. Do not modify the D03 SQL file just to make it fit another execution interface; first review the differences and obtain a newly pinned checksum and separate approval if a revision is required.

## Next operator decision

The accountable staging operator must pick and demonstrate a supported migration procedure with correct transaction semantics and reviewed migration ledger mapping, and identify every owned staging writer and means to enforce pause. The user then separately decides whether to authorize the exact D03 write step. If any of these cannot be demonstrated, leave D03 blocked and retain staging quarantine.

D04, browser tests, account provisioning, RLS/Storage authorization and any production change remain entirely outside this checkpoint.
