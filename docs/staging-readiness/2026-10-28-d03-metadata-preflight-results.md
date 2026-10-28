# D03 staging preflight — metadata-only results (28 Oct 2026)

**Assessment:** PARTIAL READ-ONLY PASS; **D03 NOT CLEARED**.

This addendum updates [the current staging metadata review](2026-10-28-live-metadata-review.md) with a fresh check of Supabase project metadata, the source D01/D02/D03 gates, the read-only table/extension/API inventory, and the available Edge Functions list. It is **not** approval to execute SQL, migrations, Auth, test fixtures, credentials, browser-RPC calls, live data access or production changes. No `execute_sql`, migration action or other database mutation was invoked.

## Checked

- [x] **Target isolation:** Supabase returned `igotu-staging`, ref `oqalpauljjhytnrpzcqp` (not the known production ref), project status `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- [x] **Migration ledger:** exactly three records: quarantine `20261027104542`, D01 `20261027152247` and D02 `20261027152518`. No recorded D03/D04.
- [x] **Schema table presence:** all 14 `public` application/example tables described by D01 were returned in the table metadata, plus private `igotu_backend_private.installation`.
- [x] **Baseline column-name sample:** 131 table/column declarations could be extracted with a conservative syntax pattern from the D01 `VALUES` preflight, and all 131 column names were present in Supabase verbose table metadata. This is **not** the exhaustive official D01 132-typed-column contract; it does not validate exact types/typmods, nullability/default expressions, enum values, 64 constraints, indexes, triggers, or owner privileges. The unparsed/uncounted contract entry must be reconciled by an operator before marking catalog review complete.
- [x] **RLS flag inventory:** all 14 public tables report `rls_enabled=true`, and the private installation table also reports RLS enabled. Metadata reported zero rows on public tables and one private installation record; counts are summaries, not a content scan.
- [x] **Installed extensions inventoried:** `supabase_vault` (vault), `uuid-ossp` (extensions), `pgcrypto` (extensions), `plpgsql` (pg_catalog), `pg_stat_statements` (extensions). This does not review routine access exposed by each extension.
- [x] **Edge Functions list:** returned empty for this staging project. This does **not** attest to external cron jobs, webhooks, service-role scripts or notification emitters elsewhere.
- [x] **D03 source gates identified:** `20261026153956_03_integrity_draft.sql` checks `current_user='postgres'`, PostgreSQL major 17, staging-only/correct project, paused writers, a reviewed catalog and private-schema evidence, installation **phase 2**, and exact MD5 signatures for **24** reviewed legacy public functions. The definitions have **not been compared with live database fingerprints**.
- [x] **Advisors:** 15 RLS-enabled-without-policy INFO and 9 mutable-search-path WARN findings, which must be interpreted in the context of deliberate intermediate quarantine; no grants or policy changes are warranted merely to silence these alerts.

## Gate matrix

| D03 requirement | What is known now | Decision |
| --- | --- | --- |
| Distinct staging project / PostgreSQL 17 | Confirmed through project metadata | **METADATA PASS** |
| D01 and D02 recorded | Confirmed in migrations ledger | **LEDGER PASS** |
| Installation row at phase 2, correct `project_ref` | Private table exists and has one row; phase/project_ref contents not queried | **UNVERIFIED** |
| Full catalog matching D01/D03, exact types, 64 constraints, 11 trigger bindings, routine ownership, search-path and ACLs | 14/14 table names and 131 parsed baseline column names present; remaining metadata insufficient | **UNVERIFIED** |
| Original 24 `pg_get_functiondef()` hashes match D03 | GitHub expected hash list reviewed; live hashes not queried | **UNVERIFIED** |
| Effective private schemas not exposed in Data API | Dashboard exposed-schema configuration, extra search paths and browser-role controls not independently checked | **UNVERIFIED** |
| Effective `anon`/`authenticated` ownership/grants, no bypass | Table-level RLS flags only; no live effective privilege/member audit | **UNVERIFIED** |
| All writers paused and operator identity authorized | No write-window or privileged operator attestation | **UNVERIFIED** |
| Managed environment supports an explicitly approved D03 execution | Prior execution blocked; no alternative attempted | **BLOCKED** |
| Specific staging write authorization | Not requested/received here | **NOT APPROVED** |

## Priority follow-up — review only

1. Independently verify **Data API exposed schemas and extra search paths** in the staging Dashboard. The private helper schema must not appear. A NULL `pgrst.db_schemas` value cannot prove this.
2. Through the separately authorized **metadata-only operator route**, execute/review the existing `tests/staging/catalog-checks.sql` SELECT-only inventory, and compare exact function definitions to all 24 D03 SHA gates. Stop on mismatch; never relax D03 fingerprint guards merely to pass.
3. Verify phase 2/project ref and the effective browser-role grants, inherited role memberships, role ownership, RLS and relevant Storage policies as independent controls.
4. Confirm D03 transaction semantics, PostgreSQL version, controlled maintenance window and writers paused. Staging-only execution is **separate** from this read-only permission.
5. Seek explicit bounded approval for the actual D03 application **only after** all gates pass. D04 needs its own later pre-cutover review/approval; it remains out of scope.

Official background: [Supabase Securing your API](https://supabase.com/docs/guides/api/securing-your-api) (object grants and RLS are distinct layers). For this work, the project-specific contracts in `docs/staging-readiness/guide.md` and the D03 SQL are authoritative.

## Non-actions and limitations

No SQL was executed, even SELECT; no credentials or user rows were fetched; no Auth, Storage, public signup, Data API configuration, project access, RLS, function definition, migration, branch integration, production state or application source file was changed. The installed migration ledger does not guarantee actual Phase 2 row state or API safety. This is not proof of real JWT/RPC/RLS behavior. Frontend fixtures cannot substitute for it.
