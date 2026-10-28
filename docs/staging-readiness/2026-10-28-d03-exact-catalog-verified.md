# D03 preflight: exact catalog and passive writer observations (2026-10-28)

**Verdict: database catalog pass; migration remains BLOCKED.** This read-only addendum follows the user's explicit authorization for SELECT-only catalog/permission checks against **staging only** project `oqalpauljjhytnrpzcqp` (not the production project). No migration, DDL, DML, configuration change, Auth account, browser JWT request, production access, merge or deployment occurred.

## Strong evidence established

| Check | Recorded result | Scope |
| --- | --- | --- |
| Project status | `igotu-staging`, `ACTIVE_HEALTHY`, PostgreSQL 17.11 | Supabase project metadata |
| Installation | Version `20261026.1`, project_ref `oqalpauljjhytnrpzcqp`, **phase 2** | SELECT of one private installation record |
| D03 legacy function fingerprints | **24/24 exact MD5 matches** | `pg_get_functiondef` compared to `03_integrity_draft.sql` |
| Original baseline typed columns | **132/132 exact matches** | Each D01 expected `format_type`, not-null and normalized default `pg_get_expr`; zero mismatches |
| Original constraints | **64/64 exact matches** | D01 named constraints and normalized `pg_get_constraintdef`; zero mismatches |
| Trigger binding definitions and enabled status | **11/11 exact matches** | D01 definitions and `tgenabled='O'` (`public`: 10; `auth`: 1); zero mismatches |
| Enum types and label order | **6/6 exact matches** | `user_role`, `account_status`, `service_category`, `request_priority`, `request_status`, `payment_method` |
| Original expected public application/example tables | 14, all RLS enabled | Staging metadata; actual RLS policies are absent in intermediate quarantine |
| `anon` / `authenticated` privileges on 15 scoped app/private tables | No effective table or per-column privileges found | `has_table_privilege`, `has_column_privilege`; excludes separately handled Storage and Supabase managed schemas |
| Browser-role public sequence privileges | No grants found on nine public sequences | `has_sequence_privilege` |
| Browser role privilege escalation | Neither is superuser/BYPASSRLS or member of a privileged role; neither has `CREATE` on the four inspected schemas | `pg_roles`, `pg_has_role`, `has_schema_privilege` |
| Public/private routine inventory | 29 public, 21 `igotu_backend_private` routines | `pg_proc` inventory |
| Public views/foreign/partitioned tables in inspected class grouping | 0 | `pg_class` summary; not an assertion about other schemas |
| Application table owners | All 15 scoped tables owned by `postgres` | `pg_class` owners |
| Edge Functions in staging | None listed | Supabase functions metadata |
| Data API exposed schemas | `public`, `graphql_public`; private namespace excluded | User-provided settings screenshot |
| Data API exposed objects | 0/15 tables, 0/50 functions exposed | User-provided settings screenshots; reflects current intermediate quarantine |
| Automatic new-table exposure | Off | User-provided settings screenshot |
| Extra Data API search path | `public`, `extensions` | User-provided settings screenshot, no private namespace |

**Method:** The D01 source's **132 column, 64 constraint, and 11 trigger expected `VALUES` tuples** were read from the reviewed source and compared by SELECT-only SQL to PostgreSQL catalog definitions; this is stronger evidence than matching counts alone. The 24 D03 expected function hashes were compared by `pg_get_functiondef` and `md5`. Every query targeted the explicitly approved staging project. No raw user rows, documents, identity data or payments were accessed.

## Writer/session snapshot — NOT a maintenance freeze

One SELECT-only `pg_stat_activity` snapshot reported **four other client-backend sessions, all idle**, and **zero other active sessions, idle-in-transaction sessions or open transaction IDs** at that instant. Those sessions were:

- `authenticator`: PostgREST 14.18 — 1 idle
- `pgbouncer`: unspecified application — 1 idle
- `supabase_admin`: unspecified application — 1 idle
- `supabase_admin`: postgres_exporter — 1 idle

This cannot certify that external jobs, queued requests, Auth signup, webhooks, a different connection later or a new transaction won't write. **`writes_paused=true` must not be attested solely from this observation.** Operator-controlled maintenance and external writer inventory are still pending.

## Relevant quarantine and caveats

- `storage.objects` remains RLS enabled with separately governed Storage grants and 12 existing staging Storage policies; these are **not proven safe by the application-table no-grant audit**. D04 is intended to harden Storage boundaries; actual browser-role and race tests remain separately blocked.
- Effective default ACL inspection found `supabase_admin` schema-specific `public` defaults granting the browser roles broad privileges for **future objects created by that owner**. Although today's Data API setting automatically exposing new tables is off and existing application objects have no effective browser table grants, these defaults must be reconciled or explicitly addressed in the operator's future-object/grant plan. Do not change default grants on the basis of this report alone.
- The database session returned a NULL `pgrst.db_schemas` setting, which proves **nothing** about Data API exposure. The separate dashboard screenshots supply current UI-level exposure evidence; HTTP denial controls have not been performed.
- Legacy nine search-path advisor warnings remain on older public routines. These are not fixed by this read-only work and should be evaluated against reviewed D03/D04 bodies.
- Neither metadata review nor successful frontend fixture tests proves real JWT/RLS behavior, operational concurrency safety or deployment readiness.

## Final gates: do not execute D03 yet

- [x] Staging target, installed phase 2 and reviewed baseline catalog/functions verified.
- [x] Current dashboard exposed schemas, exposed objects, automatic exposure and extra search path reviewed.
- [ ] External writer inventory and **confirmed maintenance pause** for all staging application and backend writers (including Auth and scheduled/external processes).
- [ ] Operator review of remaining effective default grants, Storage rights, future-object policy, and managed schemas; verify narrow no-bypass behavior through approved real-role controls at the correct stage.
- [ ] Resolve the managed-environment execution path through an approved operator procedure; do **not** bypass platform restrictions or switch to production.
- [ ] Obtain **separate, explicit D03 migration authorization** specifying project, exact reviewed SQL contents/hash, maintenance controls and rollback/reporting procedure.

D04 remains **blocked** until D03 is independently applied/verified, notifier/receipt inventories are approved, and the pre-cutover RLS/ACL/Storage review passes. No D03/D04 installation permission is implied by this catalog report.

Sources: D01 `igotu_v2/database/backend-integration/20261026153952_01_foundation_draft.sql`, D03 `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql`, `docs/staging-readiness/guide.md`, Supabase SELECT-only catalog results captured during this review, and the user's supplied staging Data API settings screenshots.
