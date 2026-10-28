# Staging D03/D04 — passive writers, default ACL and Storage exposure review
**Date:** 2026-10-28  **Project:** `igotu-staging` / `oqalpauljjhytnrpzcqp`  
**Scope:** read-only catalog and configuration metadata under the user's SELECT-only staging metadata authorization. **No migration, DML/DDL, authentication testing, production access, account creation, Storage object reads, branch merge or deployment.**

## Directly observed

| Topic | Read-only finding | What it does / does not prove |
|---|---|---|
| Scheduled extensions | Neither `pg_cron` nor `pg_net` is installed. `cron` and `net` schemas are absent. | No *currently installed* Postgres cron/net execution mechanism identified; external schedulers may exist. |
| Edge Functions | Staging Supabase Edge Function inventory was empty in the preceding approved project-metadata review. | No deployed Edge Functions observed; not a webhook/service-role writer inventory. |
| Realtime publication | `supabase_realtime` exists; `pg_publication_tables` listed **no member tables**. | No publication tables presently subscribed under this publication; not a proof that external writes are impossible. |
| Database sessions | Passive `pg_stat_activity` snapshot: four idle client sessions (PostgREST/authenticator, pgbouncer, supabase_admin, postgres_exporter), zero other active sessions or open transactions. | **Not a maintenance pause:** a new connection, Auth activity or external job can write later. |
| PostgreSQL event triggers | Six platform-related event triggers, including PostgREST cache watch and pg_cron/pg_net/pg_graphql access handlers. | Event-trigger names alone are not evidence of a scheduled business job. |
| Existing public objects | 14 public application/example tables with RLS enabled and **no application-table browser grants**, nine public sequences without browser grants, and no public views in the reviewed class inventory. | Quarantined application schema, not confirmation of future-object grant posture. |
| Default ACL for objects created by **postgres** in `public` | Browser `anon` and `authenticated` have no future table/function/sequence default grants from this owner. | Supports intended D03 operator-owned creation path; effective inherited grants still require review at cutover. |
| Default ACL for objects created by **supabase_admin** in `public` | Browser roles have default SELECT/INSERT/UPDATE/DELETE, etc. on future tables, USAGE/SELECT/UPDATE on future sequences, and EXECUTE on future functions. | **Future-object governance risk.** Existing IGotU objects are owned by postgres and remain quarantined. Any future supabase_admin-owned object requires explicit grant/API exposure review. Do not change managed privileges without approval. |
| Private document buckets | `verification-documents`, `payment-proofs`, `report-evidence`: `public=false`. | Correct public flag for identity/evidence content; RLS policy behavior has not been independently tested with JWTs. |
| Request-image bucket | `request-images`: `public=true`. | Public object URLs may bypass Storage read authentication. Staging only; **do not put user-sensitive images in this bucket** until the design/privacy decision is resolved. |
| Storage policy inventory | 12 permissive, authenticated-role `storage.objects` policies: read/upload/cleanup for each of four buckets. No `storage.buckets` policies in this inventory; Storage tables have RLS enabled and broad PostgreSQL table grants. | These are staging intermediate policies, not the D04 final restrictive controls. Do not confuse broad table grants + RLS with unrestricted effective row access. No anonymous/JWT HTTP tests were performed. |
| Current Data API settings | User screenshots show `public` and `graphql_public` exposed, **0/15 tables**, **0/50 functions**, auto exposure off, search path `public, extensions`, and private helper schema not exposed. | Current UI configuration; future default ACLs and network/API integration require their own managed controls. |

Official Supabase documentation states that a public Storage bucket bypasses access checks for **retrieving and serving** files given their URL, while uploads/deletes remain controlled: [Storage bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals); [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Stop conditions before any D03 application

1. **Not fully cleared:** an idle-connection snapshot is not evidence that all staging writers have been paused. A responsible operator must check Auth signup, webhooks, external cron/CI, deployed services, service-role scripts, scheduled jobs and permitted direct database clients; execute a controlled maintenance window with writers intentionally blocked/paused.
2. **Not fully cleared:** default privileges for `supabase_admin` on future public objects need an intentional future-creation/exposure policy. Current postgres-owned application objects and D03 function fingerprints passed, but a future managed-creator object could receive broader grants. Never turn on auto exposure or `igotu_backend_private` for convenience.
3. **Privacy decision needed before real data:** request images currently use a public bucket. Do not test with identity/financial/sensitive documents there. Approve a separate private-request-image design and migration when appropriate; a D03 run alone will not repair past public URLs/caches.
4. **Storage JWT/RLS verification remains blocked until after approved D04:** current Storage policies do not constitute proven request participants/identity permissions. Do not shortcut the gated integration procedure.
5. **D03 is not authorized:** requires a separately approved reviewed SQL hash, verified target/role, maintenance controls, operator execution path and post-transaction checks. D04 remains independently gated and must not be bundled or run automatically.

## Current decision

**D03 exact structure/fingerprint preflight: PASSED** (132 columns, 64 constraints, 11 triggers, six enums, 24 hashes, phase 2 project binding).  
**Operational writer freeze: UNVERIFIED.**  
**Default-grant future-object governance: NEEDS REVIEW.**  
**Storage privacy and D04 cutover controls: NEEDS REVIEW.**  
**D03 migration execution: NOT AUTHORIZED — no SQL mutation performed.**

This evidence is an extension of [the exact-catalog verification](2026-10-28-d03-exact-catalog-verified.md); it does not supersede any earlier migration prerequisite.
