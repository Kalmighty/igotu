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
