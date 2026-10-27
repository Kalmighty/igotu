# Isolated staging execution guide — prepared, NOT executed

This guide is not authorization. **Every project/configuration/account/SQL/Storage/mail/test-write step below requires separate explicit approval.** Phase 7 performed only local preparation. Do not connect to production, run historical setup SQL, merge a PR or deploy a website.

## 1. Approve and identify the environment

Ask the project owner to approve a disposable staging project, organization/billing/region, PostgreSQL major, operator identities and exact synthetic test scope. Create it through the Supabase Dashboard only after approval. Record the staging project reference, API origin and creation evidence; independently check it is not production. The tools deny known production `giqtnbwyktbnbhdvjraa`, but cannot detect every other production project automatically.

After authorization, use the supported managed-environment configuration workflow to allow the exact new staging API hostname, test-mail sink and required SDK CDN. The current environment may allow only the old production host; never switch to it as a workaround, edit policy files or bypass the session proxy.

Use PostgreSQL 17 and READ COMMITTED for the reviewed application writer protocol. Verify actual PostgREST role/transaction settings; unsupported isolation is rejected rather than silently accepted. Changing those settings requires separate approval. Preserve managed `auth` and `storage` schemas. No production database clone, Auth export, user/documents/receipt copy, password, refresh token or service key may be reused. Keep public signup/testing offline until the full cutover is installed and the controlled synthetic test window is approved.

## 2. Prepare operator and Data API controls

**Approval required: privileged staging database connection and configuration review.** Use a dedicated libpq service entry named `igotu_staging`, with host/project reference independently verified and a separate mode-600 credential file outside the repository/frontend. Never paste a service-role/secret key into frontend JavaScript. The HTTP test procedures support only a staging publishable key plus synthetic user logins; they cannot apply SQL or provision Admins.

In the staging Dashboard, inspect effective Data API exposed schemas and extra search paths. Keep `igotu_backend_private`, historical `igotu_private` and `identity_access_private` outside all exposed REST/GraphQL/API schemas. Review GraphQL/custom views/extensions/Edge Functions too. Do not “fix” wrapper errors by exposing the private namespace. Save sanitized configuration evidence. A NULL `pgrst.db_schemas` setting proves nothing. After D04, the HTTP procedure verifies both `Accept-Profile` and `Content-Profile` fail with `PGRST106`, with a successful public-schema own-account control. A different error is not equivalent evidence.

Inspect browser memberships/owners/default privileges. Neither browser role may own/inherit ownership, become a privileged role, create in public/private namespaces or bypass RLS. Unreviewed extension routines, public tables, views or inherited grants need explicit reconciliation. Never just add them to an allowlist to make the migration pass.

## 3. Create the empty compatible application baseline

**Approval required: the separate empty baseline SQL.** Review `igotu_v2/database/staging-baseline/20261026165620_phase7_synthetic_baseline_draft.sql` and its builder. The filename was generated locally with Supabase CLI; no database was linked. This baseline creates the captured app types/tables/keys/indexes/sequences, 24 original routines and 11 trigger bindings, but **no users or history**. It refuses existing app objects/buckets/namespaces rather than dropping them. Counters start at 1, not production values. Metadata omitted some physical attributes; this is not a production backup/restore.

The baseline quarantines browser grants. Some legacy bodies deliberately retain known bugs for D01/D03 fingerprints, including the wrong Admin enum cast. Never call those routines or open traffic at this stage. Private receipt/identity/evidence buckets start private. The existing request-image design remains public with synthetic-only inert canaries; that privacy design must be resolved before production.

Use the approved operator service, never a live project connection. Example structure **for the later approved run only**:

```sh
psql "service=igotu_staging" -X --set=ON_ERROR_STOP=1 \
  --file=/private/igotu-staging-attestations.sql \
  --file=igotu_v2/database/staging-baseline/20261026165620_phase7_synthetic_baseline_draft.sql
```

The untracked operator attestation file contains only reviewed settings, no credentials. After independently verifying the actual connection, set the exact approved `igotu.integration.project_ref`, `staging_only='true'`, `writes_paused='true'`, and `baseline_authorized='true'` for baseline creation. These are attestations, not authorization credentials. An intentionally wrong reference, missing setting, existing app or wrong major must abort. Do not disable gates to accommodate drift.

Run the approved SELECT-only `tests/staging/catalog-checks.sql`; compare it with the saved snapshot and generated baseline. Verify table/types/defaults/constraints, ID sequence dependencies and all trigger wiring. Differences must be reviewed before D01. Do not use SQL owner reads as proof of RLS behavior.

## 4. Apply and verify each coordinated stage

**Approval required: exact D01–D04 hashes from statement-review.json.** All stages require `staging_only`, `catalog_reviewed`, `private_schema_verified`, `writes_paused` and the exact project reference. They require `postgres` as operator and PostgreSQL 17. The baseline does not automatically set successful review flags for you.

The empty baseline has a later CLI timestamp than D01–D04. The order here is **explicit operator order, not filename sort order**. Keep these files outside active migrations. If later adopting a CLI migration ledger, create/review a fresh chronologically ordered sequence with CLI-generated versions and a verified content/hash mapping; do not copy mismatched historical versions into it or force `db push`.

Run **one file per reviewed step** with `ON_ERROR_STOP=1`; inspect its result/catalog before proceeding. Keep all browser/backend writers paused. Do not glob every repository SQL file.

| Stage | Required start | Verify after commit / possible stop | Recovery |
| --- | --- | --- | --- |
| D01 foundation | Approved empty compatible baseline, no private feature namespaces; exact columns/enums/keys/routines/triggers/owners; no unsafe browser roles | Private installation phase 1 (operator-only), nullable consent fields with no backfill; pending/key/event indexes; approval/onboarding/workspace predicates and expected private ACLs. Missing/drifted objects, duplicate pending rows, unknown objects or writable roles abort. | Transaction rolls back D01; preserve baseline, inspect failure. No data deletion/hash bypass. |
| D02 readers | Same project and phase 1 | Phase 2; exact narrow public/private reader signatures/return shapes, auth-only wrapper grants; queue history independent of suspension. Return-type planning must be tested later with synthetic controls. | Roll back this transaction on failure; earlier phase remains. Stay paused. |
| D03 integrity | Same project, phase 2, original legacy routine hashes still match | Phase 3; atomic profile API, Client-only basic completion, approval-only onboarding writer, guarded idempotent creation/transitions, latest-only Admin decision and correct `account_status` cast. Generic transition/helper is not browser callable. | Earlier stages remain committed. Do not restore old bodies or grants automatically. |
| D04 cutover | Same project, phase 3, independent pre-cutover evidence | Phase 4; effective schema/table/column/sequence/routine ACL audits pass; public/private schema exposure proof remains external. Check every new restrictive policy/trigger and private bucket, not just phase number. API contract is installed last. | Whole D04 transaction rolls back on failure. Stay paused; do not re-publicize buckets or restore permissive policies. |

D04 additionally requires reviewed `pre_cutover_reviewed`, `notifier_inventory_reviewed` and `legacy_receipts_reviewed` attestations. Inventory external jobs/Edge Functions/service-role writers, not just database triggers. No duplicate legacy emitter may continue after cutover. Synthetic legacy receipt fixtures must resolve exactly by project/path/object owner/current request participants. Foreign/mismatched references stop the migration, not get repaired automatically.

All four drafts are transactional with lock/statement timeouts. A failed later draft does not undo earlier commits. A lost connection after commit is ambiguous: inspect the stage record and actual objects as the approved operator; do not rerun or reset blindly. Disposable staging recreation/backup restoration and any fixture corrections also require approval. Production is not a rollback target.

## 5. Configure Auth and create synthetic fixtures

**Approval required: Auth configuration, mail capture, accounts and narrowly scoped fixture data.** Use staging-only local callback URLs, test SMTP capture, reasonable rates/JWT lifetimes and no real outbound webhooks/business notifications. Never disable identity verification, RLS or role guards. Keep email confirmation enabled; the signup procedure deliberately fails if immediate sessions bypass confirmation.

Create synthetic Client/Provider accounts through ordinary Auth signup and captured email confirmation. Use only inert 1px PNG/watermarked PDF documents; no real ID/bank data or real location addresses. The signup bridge permits Client/Provider only. Create an Admin Auth account through the approved operator workflow, then explicitly provision **only that synthetic user's database role** through a separately authorized operator step. Auth metadata alone does not create an Admin. Do not add an Admin signup route or automated promotion script. User codes are display identifiers, not credentials.

Use a fresh fixture batch for each ordered suite; the suite changes review/status/profile state and is not a history-reset tool. Prepare these distinct IDs and test-mail credentials in the supplied configuration templates:

| Actor | Required database state before the suite |
| --- | --- |
| clientA / clientB | Active Client, consistent Admin-approved history, completed basic profile |
| providerA / providerB | Active Provider, consistent approval, completed profile; no conflicting bookings in the chosen synthetic date/time range |
| admin | Existing active authorized synthetic Admin |
| unverified | Active Client, no submission, incomplete profile |
| pending | Active Provider, one latest pending consented submission with owned private files |
| rejected | Active Client, latest rejected request/reason; no pending request |
| suspended | Suspended Client with otherwise valid approval history |
| legacy | Active Provider, verified flag true but no consistent approval history (deliberate synthetic inconsistency only) |
| legacySuspended | Suspended Provider with valid matching approval history; must NOT appear in inconsistency queue |

Create truthful synthetic approval histories through the normal Admin RPC. The deliberately inconsistent legacy fixture requires a separately approved operator seed, never applied to real users. Additional matching/history/race truth-table fixtures are listed in operator-tests.md. Neither production historical counts nor invented real approvals belong in this seed.

## 6. Prepare the local staging frontend and configuration

**Approval required before using actual staging configuration.** `tools/prepare-staging-frontend.mjs` creates a fresh ignored local artifact, rejects the known production ref/foreign origins/non-publishable keys, preserves source/existing output and excludes SQL files. It does not deploy or connect.

```sh
node tools/prepare-staging-frontend.mjs /private/staging-public-config.json fresh-artifact-name
```

Copy `tests/staging/config.example.json`, `approval.example.json`, `secrets.example.json` to **untracked private files**. Fill exact staging IDs/origin/public key and test account credentials only. Keep secrets mode 600 outside the web artifact. The approval document records separate user authorization, matching project, expiry and approved scopes; setting flags alone does not grant permission. The shipped placeholders/false flags cannot run tests. No service-role key is accepted. Independently verify a successful own-user/contract control before interpreting any denial.

## 7. Prepare the late-failure atomicity probe

**Additional approval required: temporary test-only constraint DDL and removal.** In a fresh isolated fixture batch, set `igotu.test.provider` to the synthetic Provider B UUID and `igotu.test.probe_authorized='true'`, with the same verified staging project reference. Review/run `tests/staging/atomic-probe-install.sql` only after D04. It adds a NOT VALID check scoped to this Provider's `General Cleaning` specialization. Existing synthetic rows are preserved; new rows fail late inside the atomic RPC. This is not an authorization bypass and the RPC is called using the real Provider JWT.

Set the same Provider UUID in the private approval document's `atomicProbeProvider`. ST-20 first performs a successful `Office Cleaning` save, snapshots all five own sets, deliberately hits the named late constraint and compares every set unchanged. Expect the named `23514`, not any arbitrary error. The probe specialization is deliberately different from Home Cleaning used by earlier matching/race cases. PostgreSQL sequences can advance across a failed transaction; gaps are expected and must not be reset as a supposed rollback repair. Remove only the validated fixture constraint using `atomic-probe-remove.sql` after approved evidence collection. Never leave it installed for normal staging use or copy it to production.

## 8. Execute the prepared procedures only after approval

The following commands are **instructions for the later authorized environment**, not actions performed in this phase:

```sh
node tests/staging/integration.cjs --execute \
  --config /private/staging.json --approval /private/approval.json --secrets /private/test-accounts.json
node tests/staging/browser-login.cjs --execute \
  --config /private/staging.json --approval /private/approval.json --secrets /private/test-accounts.json
node tests/staging/storage-expiry.cjs --execute \
  --config /private/staging.json --approval /private/approval.json --secrets /private/test-accounts.json
```

The core API suite runs all 20 cases in order and stops on failure. It does not create projects, apply SQL or provision Admins. Browser Login tests use the local artifact, actual staging Auth and separate contexts for nine role pairs at desktop/mobile. The separate `matching-matrix.cjs --execute` command uses the same three private-file arguments and a reviewed truth table (see operator-tests.md). The expiry procedure needs a completed synthetic transfer fixture in `receiptRequestId` and waits 305 seconds without logging its URL/token.

Exit codes: 0 = stated procedure completed; 1 = failed core assertion; 2 = missing approval/configuration or guarded procedure failure; **3 = core checks completed with separately blocked operator/external subchecks**. A core API pass does not pass its whole acceptance group. `--plan` and `readiness.cjs` are local-only and do not execute integration tests. `preparation.test.cjs` uses a mock transport, not staging.

## 9. Diagnose, collect evidence and decide readiness

For every negative test, first prove the same actor has a valid session/own-user control and that the endpoint works for an authorized actor. Permission/RLS denial must be distinguishable from missing RPC, schema/type error, invalid payload, expired credentials or network failure. The harness rejects those false passes. Storage denial checks require an authorized signer control for the same object; public-route denial has a successful synthetic public canary control. Private-schema probes require the specific unexposed-schema error.

Record commit/draft hashes, PostgreSQL/Supabase versions, stage order, sanitized HTTP/SQLSTATE, case IDs, expected versus observed synthetic row/event counts and all BLOCKED subchecks. Never store passwords, bearer/refresh tokens, signing query strings, real records or document contents in logs/screenshots. Use operator-approved synthetic readbacks for final-state and notification assertions, not service-role calls as substitutes for browser authorization. The catalog checklist reads only metadata; business-row inspection requires the approved synthetic test scope.

Reproduce concurrency in separate connections/JWTs, both arrival orders and controlled barriers. Test actual late failures, not just client-side exceptions. Validate private-schema exposure, inherited grants, all five identity states, ordinary/incomplete profiles, signed URL lifetime, writer handoff and every server event. Complete mail confirmation/recovery, GPS/map/CDN and revocation tests separately. A still-valid JWT after ordinary logout may remain usable until expiry; decide and test the required server revocation model rather than falsely reporting immediate denial.

Only after all 20 workflows and 14 backend/external groups have independent evidence should staging be accepted. Any failure/drift keeps traffic paused and the related group BLOCKED/FAIL. Reconcile future legacy user/assignment/consent and receipt/image retention decisions separately. This guide does not authorize production rollout, merging or deployment. Teardown/fixture deletion also requires approval.
