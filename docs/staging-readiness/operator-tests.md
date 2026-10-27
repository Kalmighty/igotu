# Prepared operator acceptance procedures

**All procedures below are PREPARED_NOT_EXECUTED.** No staging test ran in Phase 7. The 20 core procedures are executable in `tests/staging/integration.cjs` after the guide's separate approvals/configuration. All are run in order against a fresh fixture batch. Additional cases below complete the 14-group acceptance scope; a core pass alone never passes a whole group. No operator/service-role call may substitute for a browser JWT authorization test.

The shared runtime validates the exact approved staging origin/ref, known production denylist, synthetic scope, expiring approval document, publishable key and distinct synthetic credentialed actors. Its negative helper first verifies the actor's own-user session control; a missing RPC, expired token, invalid payload or HTTP 500 is a failure, not a successful denial. Storage checks additionally require a successful authorized signer for that same object and a successful public canary route for public-endpoint denials.

For approved supplemental Node procedures, the following setup can be used **only after separate authorization**, with paths to the private files from guide.md. Do not paste credentials into code or logs:

```js
const {load}=require('./tests/staging/config.cjs');
const {makeRuntime,check}=require('./tests/staging/runtime.cjs');
const {config,approval,secrets}=load([
  '--config','/private/staging.json',
  '--approval','/private/approval.json',
  '--secrets','/private/test-accounts.json'
]);
const x=makeRuntime(config,approval,secrets);
// Run the specified async recipe below. Catch failures and log only fixed case
// IDs/status codes. Never log response bodies, tokens, signing URLs or secrets.
```

## ST-01

Core: confirmed synthetic Client signs in and reads own profile/compatibility contract; normal Client signup requests captured confirmation and fails if an immediate session skips confirmation. Complete the fresh email confirmation through the isolated mail sink, then sign in as that new user and verify actual database role Client, no approved flags/history and denial of business APIs. Its verification screen remains accessible. Add invalid-password and missing-profile controls (a separately approved empty synthetic fixture, not deletion of a real row). Use `browser-login.cjs` for all nine role combinations. Confirmation/recovery delivery remains EXT-01 until observed, even if Auth returns 200.

## ST-02

Core: analogous Provider login/signup control. In a separately approved fresh signup fixture, submit forged `data.role='admin'`; after captured confirmation, read the actual own `public.users.role` and verify it is Client/Provider, never Admin. Check Admin Login rejects it. Test a normal approved Client changing editable Auth metadata via `PUT /auth/v1/user` with `data.role='admin'`; own database role must stay unchanged and Admin RPCs must remain denied. This tests metadata non-authority, not a new signup system. The frontend has no Admin registration action.

## ST-03

Core: unverified Client has a valid session but cannot create services; uploads an inert owned PNG, records explicit consent and becomes pending. A repeated valid submission referencing the same valid owned file must fail with `23505`, not merely an arbitrary document error. Before the successful submission, add false/omitted consent, wrong role/reviewer/status, unsupported ID type, malformed last-four and foreign/missing object cases with the valid owned-payload control.

In a **fresh** unsubmitted synthetic batch, upload two inert files, then POST two valid verification records concurrently using the same real user JWT. Exactly one pending record must exist; verify the loser was uniqueness/authorization rejection, not a missing object/network error. For cleanup/submission interleaving, race authenticated Storage DELETE of an unreferenced owned file against that user's valid submission. Allowed serial outcomes: submission commits and deletion is denied, or deletion commits and submission is denied for missing object. **Never** accept a committed verification reference to a missing object. Repeat both arrival orders with owner-row barriers; do not manufacture history/reset the same user's approval to rerun a case.

## ST-04

Core: actual Admin approves latest consented submission; approved incomplete Client is still denied business creation, completes profile, and can proceed. Admin rejects a latest pending Provider with reason; Provider resubmits a fresh consented request, gets approved, loads own onboarding data and completes via atomic profile API. Verify badge, user flag and both verification notifications after onboarding.

Supplement: approve/reject as wrong-role/inactive Admin; decline without reason; approve legacy pending consent NULL; decide an older pending record when a newer record exists. Require the latest-record/consent/role checks to fail without changing users/history/badge. Race Admin decision against resubmission/suspension and inspect all affected synthetic rows after commit. Seeded incomplete approved Provider data must be readable in onboarding and remain unchanged after a failed save. Pending/rejected/flag-only users may not mark themselves approved via REST PATCH, metadata or the profile API.

## ST-05

Core: rejected, legacy flag-only and suspended actors have working own-profile controls but no normal service access/RPC mutation. Provider denials use the Provider request API with an approved Provider positive control, not the raw request table that is denied to all Providers. Extend to all normal tables/RPCs for not-submitted, pending, rejected, approved-incomplete, approved-complete and suspended states. Own status/history and approved onboarding fields are deliberate exceptions. Verify frontend direct routes agree without treating redirects as the data boundary.

## ST-06

Core: anonymous tables denied, actual Client cannot PATCH authority fields, private-schema `Accept-Profile` and `Content-Profile` both return `PGRST106` with a public own-user control. Perform the same probes without JWT, with Client, Provider and Admin JWTs. Include views/materialized views, all exposed schemas and GraphQL if enabled. A 403 private table response alone does **not** prove the schema is unexposed. Inspect Dashboard/config evidence independently.

Execute SELECT-only catalog checks as approved operator to inspect inherited/default/column/table/sequence privileges, actual routine owners/search paths and RLS. In a separate disposable trial, an explicitly approved unexpected inherited grant must make D04 abort; do not add a permissive policy or grant to make tests pass. Do not run that fault injection in the accepted fixture batch.

## ST-07

Core: create-request positive control, Provider wrong-role create denial, Provider legacy basic-profile completion denial and browser notification INSERT denial. Enumerate every public reader/writer/Admin RPC with a valid authorized caller first, then anon, wrong-role, inactive, unapproved, incomplete and unrelated-ID callers. Generic transition/emitter/approval-history helpers must not be remotely callable. Read-only own-account boolean helpers remain scoped to the caller; they do not accept arbitrary identities. Broken/missing functions fail compatibility rather than count as denials.

## ST-08

Core: rejected actor uploads an owned private identity file; Admin signs it successfully; another valid actor cannot sign it; public access fails while an inert public request-image canary proves the public endpoint works. Extend to owner folders/object metadata owner mismatch, pending upload denial, inactive/Admin-inactive denial, MIME/size limits, UPDATE/upsert denial and referenced delete denial.

For report evidence, create a real synthetic participant report with a valid owned evidence path, then attempt own overwrite/delete; both must fail after reference. An orphan evidence file should still be cleanable. Race deletion against `submit_service_report` using actual user JWTs and verify no committed dangling evidence link. Evidence/identity cleanup locks the same owner row as submissions; exercise opposing orders and lock timeout. Public request-image privacy remains a known design blocker, not a passed private-file test.

## ST-09

Core: race identical Client creation keys, require one shared request ID, then reject changed details under that key. Read back exactly one record for that Client/key as authorized actor. Simulate a committed response lost by the browser, retry the retained session key and check original ID/no duplicate; repeat image upload failure/retry so the request is retained and edited. Missing/foreign keys, invalid category/spec/date/time/GPS/amount must fail safely. Requests remain Client-created; no Provider application/open-request browse path is added.

## ST-10

Core: atomic Provider profile controls, a known eligible candidate and absence of raw email/phone/coordinate fields. Run prepared `matching-matrix.cjs` using an independently seeded truth table. Add `matchingControlRequestId` with Provider A eligible, and at least eight `matchingCases` to the private config:

```json
{
 "matchingControlRequestId":"SYNTHETIC-CONTROL-REQUEST",
 "matchingCases":[
  {"synthetic":true,"requestId":"SYNTHETIC-EXACT-MATCH","expectedProviderIds":["PROVIDER-A-UUID"],"nearestFirst":true,
   "statistics":[{"providerId":"PROVIDER-A-UUID","reviews":4,"completed":6,"rating":4.5}]}
 ]
}
```

The sample is incomplete by design. Include wrong specialization/skill, unavailable, unapproved/flag-only, approved-but-incomplete, declined, busy on another Client's exact slot, weekly boundary, no-hours legacy and missing-GPS fixtures. Check full reviews/completions across multiple Clients and more than the displayed feedback, not only rows that Client can read raw. Set exact expected IDs/counts independently; an always-empty endpoint must fail the nonempty canary. Never seed from production data.

## ST-11

Core: Client selects only own pending request; unrelated Client denied; selected Provider's projection withholds exact location/coordinates/description/image URL before confirmation. Add inactive/unapproved/declined/booked target denials with a matching active target control. API result must not include other Clients' raw booking details. Race selection with availability/hours change and suspension; the shared Provider lock must produce a valid serial order. A reservation made before an availability change is not automatically cancelled; Provider can confirm/decline the existing assignment under the unchanged workflow.

## ST-12

Core: selected Provider confirms, exact repeat produces one event; separate decline clears selection, stores reason and excludes that Provider from recommendations. Check wrong/unselected Providers, empty reason, stale status and confirmed conflict denials with independent valid controls. Two legacy same-slot pre-selections must not both confirm. No request/history row is deleted. Repeated decline is idempotent only for its own cleared still-pending request; a concurrent changed assignment may correctly return serialization/retry error.

## ST-13

Core: actual Client sends a message with forged `is_read=true`; receiver sees false, unrelated Client sees nothing and only receiver can mark read. Add sender/receiver/request reassignment/PATCH attempts, other thread request IDs, unapproved/suspended users, former Provider sending to a new pair and simultaneous thread navigation/draft failures. Historical messages remain visible to their actual sender/receiver; they must not be mixed into the current Provider conversation. A signed-out browser must clear its own SDK storage. Separately test a retained unexpired JWT and document the required revocation window; do not pretend local cleanup revokes every bearer token.

## ST-14

Core: Provider starts confirmed own service; unrelated Client cannot complete; owning Client completes; exact completion repeat is idempotent. Verify expected status and one intended event after start/complete. Race cancel/start/complete in separate actual-JWT requests with barriers. Accept only a valid serial state; no completion directly from pending/confirmed and no Provider completion on behalf of Client. Keep all cancelled/completed histories.

## ST-15

Core: completed Client records Cash without proof, duplicate request payment fails uniquely, unrelated read denied; separate completed transfer requires owned private proof and authorized Provider signing. Complete `storage-expiry.cjs` against an independently prepared completed transfer in `receiptRequestId`; it checks success, 305-second expiry and fresh reauthorization without logging URLs/tokens.

Add path-only, URL-only, consistent dual-reference, ambiguous/mismatched ID, foreign host, percent-encoded/traversal, absent object and foreign owner legacy fixtures. Resolver must never return a raw public/signed URL fallback. For every negative fixture prove a valid reference/signer works first. Account suspension blocks fresh signing; already-issued signed URLs may remain valid until expiry. Cached/public/downloaded historic copies need separate remediation decisions.

## ST-16

Core: both actual participants review completed service once, with one server notification each; duplicate reviewer/request fails. Add wrong reviewee, premature service, suspended, invalid rating, own-author rewriting and concurrent duplicate cases. Compare recommendation averages/counts against the complete independent synthetic ledger. Feedback is untrusted text; UI escaping tests remain distinct from actual RLS.

## ST-17

Core: active Admin monitors the synthetic payment, queue includes the true flag-only legacy account and excludes suspended valid history, Client cannot call the queue, report resolution emits exactly one correct reporter notification and message emits one recipient event. Add queue pagination (101 fixtures), cursor/reviewer/latest-state cases, report evidence privacy, inactive Admin, repeated final report decisions and full event-recipient matrix. Pending identity events are checked after approval/onboarding because pending users do not have normal notification workspace access. No Admin dropdown/notification browsing privilege is invented.

Legacy transition controls: block flag-only account without deleting its scheduled/active/completed requests, payments or reviews; submit fresh truthful consented identity and approve through ordinary Admin review, then verify retained history becomes accessible under normal policies. Exceptional decisions/active-assignment support require separate authorization; do not fabricate past approvals or auto-reassign services.

## ST-18

Core: actual Admin suspends synthetic Client B using the correct status enum; that same valid JWT cannot create a service; Admin reactivates in controlled cleanup. Test Provider suspension and in-flight writes against Provider lock/user-row guards. After reactivation, complete profile and valid history are still required. Check correct status notifications with no duplicate on a no-op update. Test inactive Admin denial and separately decide self/last-Admin policy. Do not exercise self-suspension using the only usable Admin fixture.

## ST-19

Core: 20 iterations of two Client JWTs selecting the same Provider/exact slot on distinct requests, both request-launch orders; exactly one succeeds and independent assigned-Provider readback shows exactly one reservation. Both synthetic requests are explicitly cancelled through their owner RPCs for cleanup, not deleted.

For deterministic interleavings, use an approved **interactive** operator connection with exact staging/project/synthetic Provider settings and `igotu.test.probe_authorized='true'`:

```text
\i tests/staging/concurrency-barrier.sql
```

This holds the shared Provider advisory lock in the open operator transaction. Launch the real-JWT selection/profile/status requests from separate processes, observe waiting locks using metadata only, start the second request in the required order, then explicitly COMMIT/ROLLBACK the operator transaction. Repeat all arrival orders and inspect final synthetic rows/events. Do not forge `request.jwt.claims` or call business RPCs as postgres to claim authorization passed. If the full suite already ran ST-20, restore the synthetic Provider B Home Cleaning setup through its own authorized atomic RPC **before** taking the barrier; do not reset identity/history. The exported self-contained `cases['ST-19'](x)` can run this core race against the already prepared profiles/config; it still reports additional interleavings BLOCKED.

The reviewed writer protocol requires **READ COMMITTED**. Advisory serialization alone is unsafe with a REPEATABLE READ snapshot taken before waiting. `isolation-check.sql` is a prepared pure-protocol negative check under repeatable read; it must catch `25001` and never mutates a business row. Positive core API writes demonstrate the supported real request path. Configuring role/PostgREST isolation or running the protocol SQL needs separate approval; do not disable the guard.

## ST-20

Core: use the separately approved named late-failure constraint described in guide.md. Provider B first successfully saves Office Cleaning; snapshot own user/profile/skills/specs/hours. General Cleaning then hits `igotu_v7_atomic_probe` **after earlier writes inside the RPC**. Require that named `23514` and exact unchanged snapshot, not any validation error. Both calls use the real Provider JWT, with all authority fields server-derived.

Add two simultaneous valid saves; final data must be one complete set, never mixed sets. Race with selection/suspension, and exercise all validation failures before/after a successful save. Remove the exact probe only after approved evidence capture. Local mocked failure tests are not evidence of database rollback.

## Evidence and acceptance rule

Record draft/commit hashes, staging reference and server version, independent controls, sanitized status/SQLSTATE, final synthetic record/event counts and every unexecuted subcheck. Treat `PARTIAL_REQUIRES_OPERATOR_CHECKS`/exit 3 as incomplete. Tests missing fixtures or controls are BLOCKED/FAIL, not PASS. None of these instructions authorizes actual execution, fixture data changes, external mail, project teardown, merging or deployment.
