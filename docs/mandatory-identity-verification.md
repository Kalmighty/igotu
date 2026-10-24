# Mandatory identity approval — isolated feature, not deployed

**Backend enforcement has not been deployed or proven in a database.** This feature is isolated on `igotu-mandatory-verification`, based on `64530d4` from `igotu-ui-polish`. PR #2 and Stage A/C files are not changed. No SQL or live Supabase operations were executed. Frontend fixtures and offline SQL/PLpgSQL parsing do not establish database authorization.

## Implemented application flow

Register → preserve email confirmation → authenticated identity submission → Admin approval → profile completion if needed → dashboard. Login still enforces the selected-role/account-role match, missing-profile and active-status checks. Approval precedes both Client and Provider onboarding. Admin access remains independent of identity approval.

Approval means the authoritative users flag is true, the latest own request is approved for the same role, review metadata exists, and its reviewer matches `identity_verified_by` with a recorded approval timestamp. A legacy Provider badge or cached profile alone grants nothing. Fresh database reads decide routing.

`identity-access.js` centralizes this contract and auth destinations. `profile-guard.js` memoizes one asynchronous decision per document. Every Client/Provider page and all its data-loading DOMContentLoaded initializers (including notifications) await that promise before fetching normal data or binding service actions. During checks/errors the page content remains hidden behind a checking/retry/sign-out view. A query failure denies access. The guard does not replace database enforcement or continuously revoke already-rendered information: database checks must govern every later request.

Verification pages preserve the existing ID form and local file previews but remove workspace/sidebar/notification navigation. Pending users see a dedicated review state with date, progress, refresh and logout. Rejection notes are inserted as text, allow corrections and resubmission; approved accounts get the correct onboarding/dashboard link. Suspended accounts are denied even with approval. Neither rejection nor profile incompleteness is treated as account suspension.

The form preserves MyKad/Passport, full legal name, JPG/PNG/PDF up to 5 MiB, age and privacy checks, and optional Provider supporting details. It uploads anonymized object names to the private verification bucket with no public URLs, sends only the identification last four characters, and clears the transient full-ID field after commit. New consent fields must exist before using this frontend. Duplicate clicks are blocked locally; the draft adds database serialization and a unique pending index. Failed inserts clean up only newly staged files, never files linked to a committed request. Raw document paths/Storage failures are not logged or shown in submit errors.

Admin review retains `admin_review_verification` and 5-minute signed document links. It labels repeat submissions and uses an accessible confirmation/rejection dialog with a required correction reason. The existing pre-C browser notifications remain, once per successful action; review notifications are generic and do not echo private notes, IDs or document links. No Stage C notification triggers are activated. Approved Providers who have not yet created a provider_profiles row receive the derived verification badge when they later create it.

## Review-only database draft

`igotu_v2/database/mandatory-identity-verification-draft.sql` is a **fresh, pre-Stage-A staging candidate**. It deliberately aborts without catalog/private-schema/staging attestations, on duplicate pending records, missing existing RPCs, unknown callable public definers, readable non-invoker views, unexpected signatures, or already-installed Stage A/private objects. These checks are safeguards, not an automatic completeness/security audit. Exact catalog bodies, owners, ACL inheritance, custom exposed schemas and dependency chains still need authorized review.

The draft proposes:

- Indexed latest approval proof; no automatic approval, account update backfill or grandfathering.
- Restrictive RLS boundaries over public workspace tables and authenticated Storage operations. Existing participant/ownership checks remain ANDed with approval; this draft grants no general service access.
- Own account/status reads for applicants; only minimal private verification submission/status access before approval. Normal users/profile/service writes remain unavailable.
- Protected role/status/identity fields, immutable verification history, applicant-first locks, persisted consent checks, owned private document checks and one pending row per user.
- Transactional active-Admin-only review through the existing RPC. Rejection requires a note; legacy pending records without recorded consent cannot be approved by inventing consent. Reject with instructions and obtain a corrected submission.
- Private, revoked original legacy service RPC implementations behind guarded wrappers, retaining signatures and business/participant logic. Row triggers defend mutations reached via existing privileged functions. Unknown endpoints/signature modes abort instead of being silently allowed.
- Approved Provider target eligibility for profile recommendations and assignment selection, without changing specialization, hours, declined-provider exclusion, distance ordering or Client choice. Cancellation/history involving an existing now-unapproved Provider is not automatically deleted.
- Private verification file ownership, MIME/5-MiB bucket limits, no object overwrite, and orphan-only applicant cleanup. Normal other-bucket operations require approval.
- One generic, self-addressed pre-C submission receipt; no new notification emission triggers or premature browser-notification retirement.

## Required staging/deployment work — blockers

1. Export the actual schema/ACLs/policies/functions/triggers, all effective exposed schemas, API views/GraphQL and scheduled/backend writers. Read the draft alongside exact live definitions; several repository setup files are incomplete and the earlier rollout records known live/repository differences. Do not re-run old setup files: they include automatic legacy backfills, broad policies and old function bodies.
2. Confirm `identity_access_private` is not exposed, using authoritative Data API settings and anonymous/authenticated negative schema-selection GET probes with a working public-schema control. SQL-session settings alone cannot establish privacy. Audit every helper and original-function dependency; moved implementations cannot remain reachable through other invoker/definer paths.
3. Resolve duplicate pending rows and legacy approval inconsistencies through individually approved decisions. Do not delete records, infer consent or auto-approve. Validate original service RPC owners/default arguments/overloads and return contracts; review the wrapper strategy against dependencies before any application.
4. Review public buckets, cached/public object URLs, existing signed URLs and retention. Restrictive authenticated Storage policies do not retroactively privatize public request images/old receipt URLs, invalidate already-issued signed URLs or solve the separate Stage A/C privacy gaps. No public-bucket conversion or receipt migration is included here. Resolve any path that could expose restricted service data before claiming complete backend enforcement.
5. Apply only in a separately authorized isolated staging copy, with the frontend and new consent columns coordinated. Execute the negative/positive API matrix below, concurrency tests, notification and legacy-workflow regressions. Until these succeed **direct API restrictions, transactional review and Storage policies are unproven**. The new frontend must not be deployed against the old schema as a security fix.
6. Independently review rollout, monitoring, backup and repair-forward steps. Wrapper moves, restrictive policies and triggers are not safely rolled back by blindly opening policies. No production deployment or grandfathering is authorized by this PR.

## Stage A / B / C interaction

The original A/C drafts and rollout document remain byte-identical. This draft refuses an existing `igotu_private` installation. Do not concatenate scripts or deploy A/C after this draft without a new integration review: Stage A adds definer readers that need the same identity boundary; Stage C changes ACLs, private schemas and notification ownership, and can conflict with private RPC implementations/consent/submission behavior. Stage B still requires the separately planned profile APIs/receipt changes and browser-notification removal. None is implemented or activated here. Preserve exactly one notifier per event during a separately reviewed paused-write handoff. This feature cannot satisfy the existing Stage C rollout attestations. The existing staged `notify_verification_change` currently appends `admin_note` to rejection notifications. That payload needs a separate privacy correction during integration before activating those triggers; this feature leaves A/C untouched and uses generic pre-C browser notifications. Do not activate the current staged payload for this feature.

## Existing-account read-only audit plan

`mandatory-identity-audit.sql` contains **unexecuted SELECT-only** inventory queries: role/status/proof counts, duplicate pending users, legacy Provider badge mismatches, policies, effective function access/fingerprints, roles and bucket settings. It avoids selecting legal names, identification numbers, object names, document paths or credentials. Run only with separate authorization; review results privately.

| Existing state | Expected result after verified rollout |
| --- | --- |
| Active, consistent Admin-reviewed approval | Profile setup if incomplete; otherwise correct workspace |
| Active unverified/no request | Identity form; no normal workspace/API |
| Pending | Review-only status; no second pending submission |
| Rejected | Correction note and resubmission; normal features remain blocked |
| Provider badge without consistent identity request/reviewer | Not grandfathered; obtain explicit review/resubmission |
| Approved history but inconsistent/null/deleted reviewer or flags | Block normal use pending an explicit reconciliation decision |
| Suspended/inactive, even if previously approved | Denied; verification rejection does not reactivate the account |
| Existing services assigned to an unapproved account | Retained, not deleted/reassigned; audit continuity and notifications before rollout |

Do not change roles, status, identity approval or existing rows merely to make counts pass. Any exception/grandfathering needs explicit approval and a separately reviewed policy.

## Database-side acceptance matrix — NOT RUN

Use isolated new/not-submitted, pending, rejected and approved Client/Provider accounts; completed/incomplete profiles; suspended variants; active/inactive Admin; unrelated users and anonymous sessions. Do not use real identity documents.

- Each non-approved Client/Provider: REST reads/writes to service_requests, provider_profiles, provider_specializations, weekly availability, declines, messages, payments, reviews and reports must deny/return no restricted rows. Try raw filters, embeddings and every exposed view/GraphQL path. Never count a UI redirect as evidence.
- Exercise every overload of every callable RPC directly with those JWTs; creating/editing/cancelling/selecting/confirming/starting/completing services, onboarding/profile writes and report submission must reject before effects. Unknown/custom APIs and service-role/backend jobs require their own approved contract.
- Approved active actors: existing positive business/participant tests must still pass. An approved Client cannot select an unapproved Provider. Providers still cannot browse open requests. Existing cancellation/history must not be silently lost.
- Pending/rejected owners: own minimal profile/status reads work; only valid owned-document pending inserts are permitted. Foreign-role/user IDs, fake review metadata, arbitrary notes/timestamps, missing consent, foreign/nonexistent document paths and concurrent duplicate inserts fail without orphaned durable state.
- No Client/Provider/inactive Admin can review/approve, alter authority fields, re-review history or self-promote, including through definer functions. Active Admin decisions update request, users flags and an existing Provider badge together; concurrent approval/rejection yields one decision and one notification. New Provider profile badges derive from that authoritative result later.
- Verification Storage: JPG/PNG/PDF <=5 MiB, correct folder/owner; no public URL; own/active-Admin access only; unrelated users/anon/suspended users, overwrite and linked-file deletion denied. Signed URL expiry and bucket privacy must be exercised through the actual gateway. Audit existing/public assets separately.
- Verify normal reads/writes fail again after rejection/authority revocation or suspension, including cached JWTs and stale open tabs. Confirm email/password recovery and private verification status stay usable as intended.

No successful staging results are recorded by this branch. Passing local fixtures or offline parsing must never be reported as these tests passing.

## Local checks

`tests/mandatory-verification.cjs` uses stateful synthetic fixtures and intercepts external requests. It exercises registration/email-confirmation messaging, direct route guards, timing, all four verification states, resubmission/file validation, signed Admin previews and review dialogs. These are frontend behavior tests. Existing auth mismatch tests use explicitly approved fixtures so their earlier matrix remains meaningful.

Run a local static server, then with Playwright, axe-core and Chromium available:

```sh
UI_SCREENSHOTS=work/mandatory/screenshots node tests/mandatory-verification.cjs
node tests/auth-smoke.cjs
```

Set `UI_BASE_URL`, `CHROMIUM_PATH`, `NODE_PATH`, `AXE_PATH` as needed. SQL/PLpgSQL parsing is offline only; no database was created or queried.

## Recorded local results and screenshots

- Stateful frontend fixtures: all 16 direct normal/onboarding routes blocked before service data initialization for unapproved accounts; four verification states for both roles at 1440/768/390/320px; registration and email confirmation; refresh/relogin persistence; correction/resubmission; file type/size checks; approved routing; all inactive Client/Provider states and inactive Admin denial; active Admin signed previews and approve/reject dialogs. All API responses are synthetic.
- Existing authentication regression: all nine login-role/account-role outcomes, session cleanup/error handling, signup validation and verified onboarding still pass.
- Approved workspace regression: 84 page/viewport layouts plus provider search/reset and dashboard empty/error checks pass with explicitly approved fixtures. Dedicated verification views are covered by the separate state suite.
- axe accessibility rules pass on verification states and Admin decision dialogs. Static route/initializer coverage, application JS syntax, offline parsing of 66 SQL statements/17 PLpgSQL units and eight read-only audit SELECTs pass. These are not database execution or staging authorization results.

Full-page state screenshots (synthetic data only):

| State | Desktop | Mobile |
| --- | --- | --- |
| Not submitted | [View](ui-preview/verification-not_submitted-1440.png) | [View](ui-preview/verification-not_submitted-390.png) |
| Pending | [View](ui-preview/verification-pending-1440.png) | [View](ui-preview/verification-pending-390.png) |
| Rejected / resubmit | [View](ui-preview/verification-rejected-1440.png) | [View](ui-preview/verification-rejected-390.png) |
| Approved / next step | [View](ui-preview/verification-approved-1440.png) | [View](ui-preview/verification-approved-390.png) |

[Provider supporting information](ui-preview/verification-provider-form-1440.png) · [Admin queue](ui-preview/admin-verification-queue-1440.png) · [Approval dialog](ui-preview/admin-verification-approved.png) · [Rejection dialog](ui-preview/admin-verification-rejected.png).

Offline checks can be repeated with `PYTHONPATH=/path/to/pglast python tests/check-verification-draft.py`. It parses without connecting to a database and checks that Stage A/C and their rollout document match the base commit. The audit file is verified SELECT-only; there is no account backfill.
