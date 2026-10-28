# D04 pre-cutover — focused SELECT-only metadata review (28 October 2026)

**Project:** `oqalpauljjhytnrpzcqp` (`igotu-staging`), **Phase 3 after D03 successfully committed**.  
**Scope:** read-only SQL catalogs, Storage bucket configuration and checked-in D04 source; no D04 DDL/DML, user/business records, credential reads, Auth/config changes or production access.

## D04 source

- File: `igotu_v2/database/backend-integration/20261026153958_04_cutover_draft.sql`, GitHub blob SHA `cfef9cc48a069fdaa5a6fa53d9d9f793571a83d3`.
- Offline statement-review manifest pins **SHA-256 `22549d69e655a5a84f47e3d36cc6956e0cb4e571da06d9282859203c5dad1ee7`**; **this session has not independently recomputed it from downloaded local bytes**. Before D04 execution the operator must download and verify the file's actual checksum, as with D03.
- Offline inventory: **86 statements** including 10 function creations, 10 named static trigger creations, 32 policies, GRANT/REVOKE, Storage bucket updates, D04 verification gates and installation advancement to **phase=4** inside a transaction.
- Includes required attestation gates `pre_cutover_reviewed`, `notifier_inventory_reviewed`, `legacy_receipts_reviewed`, `writes_paused`, `catalog_reviewed`, `private_schema_verified`, `staging_only` and verified project ref. Flags must not be asserted without real evidence and permission.

## Independently verified source-to-live metadata

| Check | Result |
| --- | --- |
| Installation phase | **3** |
| Target Postgres | PostgreSQL 17; active staging project |
| Ten new function names | None currently found in the corresponding `public` or `igotu_backend_private` target schema |
| Ten new named trigger names | None present |
| Reviewed `v6_*` RLS policy names | None present |
| Unexpected existing notification-emitting user triggers identified by D04's exact predicate | **0** |
| Scoped public RLS policies | **0** (expected quarantined intermediate state) |
| Existing Storage `storage.objects` RLS policies | **12** (pre-D04) |
| Current public custom trigger count | **10** (existing baseline) |
| `payment-proofs` bucket | `public=false` |
| `verification-documents` bucket | `public=false` |
| `report-evidence` bucket | `public=false` |
| `request-images` bucket | **`public=true`** — separate design/privacy decision, not made private by this source |

All findings are metadata snapshots, not proof of complete SQL execution, runtime RLS permission behavior, API routing, ownership of receipt objects, or external writer pause.

## Remaining actual D04 pre-cutover evidence

1. **Historical/legacy receipt truth:** D04's gate tests any non-empty `public.payment_records.proof_path/proof_url` against the corresponding `storage.objects` receipt, current request participants and recorded Storage owner. Counts or scoped integrity flags require **separately approved count-only data checks or an operator's private sanitized attestation**. No payment rows or Storage object names were accessed during this review. Cannot mark `legacy_receipts_reviewed` true yet.
2. **External notifiers/writers:** The source's exact trigger predicate found zero conflicting existing notifier triggers. Previous checks showed no staging Edge Functions, `pg_cron`/`pg_net`, GitHub Actions or configured Auth Hooks. The owner stated no external staging integration. At the D04 window operator must still reverify all actual writers and enforce maintenance pause.
3. **ACL/RLS/Storage:** D04 performs broad policy/grant changes and may fail on unexpected object/column/role shape. Verify reviewed exact D04 SQL, expected policy/trigger signature and current effective role grants immediately before D04; do not relax gates.
4. **Migration ledger:** Manual `psql` D03 changed private install phase to **3** without adding a Supabase CLI ledger row. Do not run `db push` or rerun D03 to fix history. Keep the ledger reconciliation plan separate and explicit.
5. **Safety and approval:** D04 mutates database and bucket settings; the user's authorization for D03 did **not** authorize D04. Obtain independent D04 approval after completing the above and local file SHA-256 verification. Do not deploy the production-hardcoded frontend or enable public signup before full synthetic authorization tests.

**Decision:** D04 *metadata/name-collision preflight* passed. **D04 application remains blocked pending receipts/notifier/ACL evidence, controlled operator maintenance pause and separate explicit D04 authorization.** No changes to Supabase or production were made in this review.

## Follow-up verified read-only results

The project owner requested continuation of the D04 pre-cutover review. Additional **read-only aggregate** SQL checked counts, not payment, identity, file names, user details or row content. Independent findings on 2026-10-28:

| Scoped staging collection | Count |
| --- | ---: |
| `public.payment_records` | **0** |
| Payment rows with nonempty `proof_path` or `proof_url` | **0** |
| `storage.objects` objects in `payment-proofs` | **0** |
| `public.service_requests` | **0** |
| `public.notifications` | **0** |
| `auth.users` | **0** |
| `public.verification_requests` | **0** |
| `public.service_reports` | **0** |

**Legacy receipt review:** The current staging project is empty in the examined receipt-related tables, so the D04 gate's receipt-path/ownership mismatch check has **no historical payment rows to inspect**. This resolves the historical receipt-data blocker **for the observed snapshot**, subject to a fresh count immediately before any authorized D04 transaction; it does **not** mean that D04 is installed or that synthetic fixtures have been created.

**Source file:** A fresh SHA-256 computed over the fetched **42,788-byte UTF-8/LF D04 source** is **`22549d69e655a5a84f47e3d36cc6956e0cb4e571da06d9282859203c5dad1ee7`**, exactly matching `docs/staging-readiness/statement-review.json`; Git blob SHA `cfef9cc48a069fdaa5a6fa53d9d9f793571a83d3`. This corrects the earlier status stating that the current session had not recomputed the digest. The operator must *still* hash the actual local file before any approved execution, because downloads can drift.

**Scope of potential D04 permission-conflict preflight:** no unexpected `public` or `igotu_backend_private` function owners, no unexpected `public` table owners, no public views/foreign tables, and **7** currently browser-callable public SECURITY DEFINER functions; those 7 existing public functions are all expressly allowed by the reviewed D04 `$final_acl$` allowlist. There are **19** private functions with current effective browser-role execute privileges; D04 applies a new explicit full private-function REVOKE followed by an allowlisted GRANT, with an effective permission gate before COMMIT. This is a source/catalog comparison, not a live simulation of RLS or Storage access.

**Updated stage decision:** receipt-history check **PASS for the current snapshot**, D04 source SHA-256 **PASS**, catalog name/owner/definer preflight **PASS**. Still **NO-GO for actual D04 execution** until separately authorized D04 migration, verified operator-controlled writer pause, fresh Data API private-schema verification and review of the exact changes including Storage and notification behavior. D03 has been committed, D04 has **not**. Manual `psql` D03 did not add a Supabase CLI ledger entry; do not rerun D03 or force migration history.

## Conditional D04 authorization and final check — 28 October 2026

The project owner answered **yes** to the explicit request to authorize the exact checksum-verified D04 migration on **igotu-staging** (`oqalpauljjhytnrpzcqp`) only, *provided remaining maintenance safeguards are confirmed*. This authorizes D04 alone, not production, D04 modifications, unrelated scripts, Auth account creation, or frontend release. Local owner `psql` execution instructions may be supplied after verified preflight; **this repository update is not a claim that D04 has executed**.

Latest independently refreshed SELECT-only staging preflight: installation `phase=3` with exact `project_ref`, PostgreSQL 17.11/`postgres` and READ COMMITTED; payment rows, nonempty receipt references, Storage `payment-proofs` objects and Auth users all **0**; no duplicate custom notification trigger detected; no unexpected scoped function/table owners; no other active or idle-in-transaction client-backend sessions at snapshot; 0 public RLS policies and 12 existing Storage object policies. Three evidence buckets remain private; `request-images` remains **public** and requires a separate privacy decision before real user documents. Current public executable-routine inventory: 20 authenticated-only functions, seven with SECURITY DEFINER, all seven on D04's reviewed definer allowlist; no `anon` execute on them.

Prior current-turn review independently computed the exact D04 source SHA-256: `22549d69e655a5a84f47e3d36cc6956e0cb4e571da06d9282859203c5dad1ee7`; the owner also verified the locally downloaded file's SHA-256 in PowerShell.

The owner previously confirmed sole control of this staging FYP project and no connections to CodeSandbox, Netlify, local web apps or external scripts. The execution window still requires the owner to keep all other connections/actions stopped, verify the target and current Phase 3, use the exact pinned D04 SQL in the established **single direct PostgreSQL session** with `ON_ERROR_STOP=1`, and inspect the committed result. Session counts are not writer-pause proof. The D04 transaction itself must enforce its own safety gates and roll back on failure. **Never rerun if a failure/ambiguous disconnect occurs without independent installation readback.** D04's manual `psql` execution will not automatically create a Supabase CLI migrations ledger entry; do not force ledger changes.
