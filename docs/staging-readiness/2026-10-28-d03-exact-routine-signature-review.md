# D03 exact routine signatures and invoker/definer preflight — 2026-10-28

**Verdict:** Source-to-staging function-signature preflight **PASS**; D03 rollout remains **NO-GO** for operational reasons.  
**Scope:** SELECT-only `pg_proc` catalog reads against `igotu-staging` (`oqalpauljjhytnrpzcqp`) and GitHub source review. No SQL write/migration, credential access, Auth user reads, production access, deployment or code change.

## Exact existing replacement signatures

- The approved D03 source contains **13 `CREATE OR REPLACE FUNCTION public.*` definitions** and **14 new `CREATE FUNCTION` definitions**.
- All **13 existing replacement argument signatures** resolve via `to_regprocedure()` against the staging catalog; every existing function is owned by `postgres` and is of regular function kind (`prokind='f'`).
- The existing return types match the D03 declaration types: **11 `void`**, **one `uuid`** (`submit_service_report`), **one `public.users` composite** (`complete_basic_profile`). The existing two Admin-review routines plus report submission have **one default argument** each, matching the reviewed signatures.
- The **14 newly named routines** are currently absent from their target namespaces, based on the name inventory, with no obvious plain-`CREATE FUNCTION` name collision.
- Static reference-name scan of D03 found no missing **function names** across the current public/private/auth/storage routine inventory plus D03's own declarations. The seven apparent unmatched `public.*(` names are application table/row references, not function calls. This is heuristic source analysis, not complete SQL type checking, dependency resolution, function-body execution or proof of runtime safety.
- All **27 D03 declarations** have a fixed `search_path` clause. Twenty-six expressly declare `SECURITY DEFINER` or `SECURITY INVOKER`; `igotu_backend_private.validate_request(jsonb)` omits the security qualifier and therefore uses PostgreSQL's **SECURITY INVOKER default**. This should be acknowledged as an intentional design decision in review rather than silently assumed to be SECURITY DEFINER. No functions were altered.

## Relevant D03 privilege interpretation

- **Correction:** The planned D03 `CREATE FUNCTION` statements execute under `postgres`, whose per-schema `public` default ACL entry has no explicit browser-role EXECUTE grants, **but its global function default has not been overridden**. PostgreSQL normally grants newly created routines `EXECUTE` to `PUBLIC`, and a per-schema `REVOKE` cannot cancel that built-in global default. D03 mitigates this by atomically revoking from `PUBLIC`, `anon`, `authenticated` and `service_role` on **all private-schema functions** and its **15 created/replaced public routines**, then applying explicit selected GRANTs before COMMIT. This does **not** justify relying on the per-schema default for unrelated future functions. [PostgreSQL 17 default-privilege rules](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).
- Earlier staging metadata showed broader **`supabase_admin` default ACLs** for future public objects. Those are a **separate future-object governance risk**, not evidence of direct leakage from D03's planned `postgres`-owned functions. Do not weaken existing browser/table restrictions and do not change managed default ACLs without independent approval.
- D03 is still **not** a complete secure backend cutover. The coordinated D04 phase must be separately approved and proven before opening API/browser traffic. Current Data API 0/15 tables and 0/50 functions exposed reflects its quarantine; effective public-wrapper REST accessibility must be validated after approved D04, never presumed from GRANT alone.

## Operational gates are still required

1. Owner-controlled **pause of all staging writers**, including external scripts, Auth/admin, webhooks, direct clients and hosting, with an identifiable responsible operator and actual enforcement. A SQL session snapshot does not suffice.
2. Supported, approved privileged execution procedure matching the runbook's required transaction/session-local attestation semantics. **Do not treat MCP `apply_migration` as a verified drop-in replacement for the documented psql procedure.** The earlier managed-environment restriction must not be circumvented.
3. Reviewed default-grant future-object policy and confidential operator evidence of all actual dependencies.
4. **Separately authorized exact D03 write scope**, including checksum `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6`, target `oqalpauljjhytnrpzcqp`, stop/recovery plan and fresh metadata recheck.

**Do not run D03 yet.** This addendum does not authorize database changes. Keep PR #11 as a review-only draft.
