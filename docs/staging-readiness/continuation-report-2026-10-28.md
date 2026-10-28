# IGotU FYP staging integration continuation — 28 October 2026

## Outcome and scope

An improved continuation mode is prepared and offline-tested. **No live staging integration test was executed in this session.** There are zero newly confirmed full acceptance cases and zero newly confirmed acceptance groups. No backend bug is confirmed. Missing live credentials block execution; no passwords, JWTs, service-role keys or database credentials were requested or accessed.

The 15 completed SR0001 workflow steps and installed D01–D04 state are **owner-reported prior evidence**, retained as such. They were not replayed or independently revalidated here. SR0001 must remain completed, with exactly one RM100 Cash payment and exactly two reciprocal five-star reviews. Messaging alone may add synthetic evidence to it after authorized local execution.

## Source and access evidence

- Repository: Kalmighty/igotu; inspected staging branch commit `dd13352e31d6a53251baf501181a657882d840f0`.
- Existing draft PR #11 was read only. Its audit branch is `docs/staging-readiness-live-audit-20261028`, based on `igotu-staging-validation`; it remains open and untouched. Earlier migration no-go statements in historical docs do not supersede the owner's current installed-state report and are not a reason to rerun migrations.
- The provided local checkout had only an older main snapshot (`442c787`). Git fetch failed because the configured proxy was unavailable. The connected GitHub tools supplied the staging source instead. Required blobs, all tree object IDs and the reconstructed shallow base commit were hash-verified; a sparse checkout was created under `/workspace/work/igotu-staging` on local branch `igotu-staging-remaining-tests`, directly from the authentic staging base. The source checkout was restored without changing remote refs. The reviewed continuation is delivered on a separate new testing branch; PR #11 and the base branch remain untouched.
- Managed environment observations reported no secrets, runtime credentials or outbound identities. No Supabase endpoint, production endpoint, SQL executor, Auth session, account mutation, Storage object or migration was contacted in this session.
- The Supabase documentation fetch also failed at the environment proxy. This change adds no SDK or schema feature; it reuses the existing REST/RPC contracts and checks their signatures against the inspected SQL source. Live behavior is still unverified.

## Existing infrastructure and focused changes

The existing suite has 20 ordered cases covering all 14 acceptance groups, guarded REST transport, synthetic-account declarations, local config/approval loading, offline migration integrity checks, browser login, matching and signed-link expiry procedures. Its full run begins with registration and relies on transient shared `flow` state. It is suitable for a separately reviewed fresh fixture run, but does not safely continue the owner's completed workflow on its own.

The existing `integration.cjs` now routes `--remaining` into a focused module sharing its runtime/config and acceptance plan. Default remaining execution selects only ST-13. Nine scenarios can run independently with required preconditions; unsupported acceptance work reports BLOCKED. No new test framework or dependency was introduced.

- ST-13 covers two-way messaging, forced initial unread state, receiver read updates, sender/unrelated read-flag denial, forbidden column updates, unrelated reads/sends, forged sender/receiver, notification uniqueness and notification access. Actual rows are read after writes.
- ST-12 optionally creates one dedicated synthetic request, verifies its creation key/owner/details, declines it, checks history/exclusion and recovers assignment to another eligible approved Provider. ST-19 optionally creates forty synthetic requests for twenty same-slot races, checks exact winner/conflict responses and independent final state, then cancels only those requests, retaining history.
- ST-05/06/07/08/10/17 add focused restriction/reader/Storage/matching/Admin read-only checks. Matching reuses the existing truth-table implementation.
- Every remaining request pins the exact staging origin/ref and rechecks approval expiry/scope; real user JWTs from local files can be verified through Auth without signup. Only selected actors require local credentials. Windows ACL handling replaces an invalid dependence on POSIX mode bits; POSIX protection remains enforced.
- Persistent journals bind fixtures and stable IDs, prevent duplicate writes on resume, reconcile committed lost responses, and stop ambiguous absent writes. A local lock prevents simultaneous use of the same journal. SR0001 request/payment/review snapshots are checked before and after cases and across resumes.
- Each execution writes fresh JSON/Markdown reports with PASS/FAIL/SKIPPED/BLOCKED. Focused API passes never become full acceptance passes. All remaining browser/operator criteria stay explicit.

## Twenty-case evidence matrix

All new live executions are **BLOCKED (credentials unavailable)**. Acceptance statuses below reflect incomplete evidence, not an observed backend failure. “Prior evidence” means the owner's supplied request, not a new live observation.

| Case | Acceptance status | Prior evidence and unverified assertions | New focused automation |
|---|---|---|---|
| ST-01 — Client registration and login | UNVERIFIED | Client A account/sign-in used; registration, recovery and nine role combinations unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-02 — Provider registration and login | UNVERIFIED | Provider A account/sign-in used; forged Admin metadata, recovery and revocation unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-03 — Mandatory identity verification | UNVERIFIED | Client A/Provider A verification succeeded; invalid submissions, races and ownership matrix unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-04 — Admin approval and rejection | UNVERIFIED | Client A/Provider A Admin approval succeeded; rejection, resubmission and replay unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-05 — Pending/rejected user access denial | UNVERIFIED | Unverified Provider B excluded from recommendations; full workspace restriction matrix unverified. | Prepared; offline-validated runner only |
| ST-06 — Direct REST restrictions | UNVERIFIED | Restricted contacts/location respected in one workflow; direct REST and schema/ACL matrix unverified. | Prepared; offline-validated runner only |
| ST-07 — RPC authorization | UNVERIFIED | Happy-path RPCs succeeded; wrong-role, anonymous and cross-account RPC matrix unverified. | Prepared; offline-validated runner only |
| ST-08 — Private Storage access | UNVERIFIED | No live private Storage permission evidence supplied. | Prepared; offline-validated runner only |
| ST-09 — Client request creation | UNVERIFIED | SR0001 created; concurrent/replayed creation-key behavior unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-10 — Recommendation accuracy | UNVERIFIED | Provider A recommended, unverified B excluded, contacts hidden; distance/hours/bookings/negative matrix unverified. | Prepared; offline-validated runner only |
| ST-11 — Provider selection | UNVERIFIED | Provider A selected and received assignment; forged targets, replay, conflict and browse restrictions unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-12 — Provider confirm and decline | UNVERIFIED | Provider A confirmed; separate decline/recovery and stale/conflict cases unverified. | Prepared; offline-validated runner only |
| ST-13 — Messaging | UNVERIFIED | Messaging explicitly not yet tested. | Prepared; offline-validated runner only |
| ST-14 — Service completion | UNVERIFIED | Start and Client completion succeeded; wrong-account, repeated and raced transitions unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-15 — Payment recording | UNVERIFIED | Exactly one synthetic RM100 Cash payment reported; duplicate denial, transfer ownership and proof matrix unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-16 — Ratings and reviews | UNVERIFIED | Two reciprocal five-star reviews reported; invalid/duplicate/raced review assertions unverified. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-17 — Admin monitoring | UNVERIFIED | Notifications independently checked for the completed workflow; monitoring, reports, queues and full recipient matrix unverified. | Prepared; offline-validated runner only |
| ST-18 — Account suspension | UNVERIFIED | No live suspension/revocation evidence supplied; separate bounded Admin mutation approval needed. | Existing procedure retained; remaining dispatch BLOCKED |
| ST-19 — Concurrent Provider assignments | UNVERIFIED | No actual-JWT concurrent assignment evidence supplied. | Prepared; offline-validated runner only |
| ST-20 — Atomic Provider profile updates | UNVERIFIED | No late-failure atomicity evidence supplied; schema probe requires separate explicit approval. | Existing procedure retained; remaining dispatch BLOCKED |

## Fourteen acceptance groups

| Group | Cases | Status |
|---|---|---|
| DB-01 | ST-06 | UNVERIFIED; live execution BLOCKED |
| DB-02 | ST-01, ST-02, ST-06, ST-07, ST-18 | UNVERIFIED; live execution BLOCKED |
| DB-03 | ST-03, ST-05, ST-06 | UNVERIFIED; live execution BLOCKED |
| DB-04 | ST-03, ST-08 | UNVERIFIED; live execution BLOCKED |
| DB-05 | ST-04, ST-17 | UNVERIFIED; live execution BLOCKED |
| DB-06 | ST-10, ST-11 | UNVERIFIED; live execution BLOCKED |
| DB-07 | ST-07, ST-09, ST-11, ST-12, ST-14, ST-19 | UNVERIFIED; live execution BLOCKED |
| DB-08 | ST-13, ST-18 | UNVERIFIED; live execution BLOCKED |
| DB-09 | ST-08, ST-15 | UNVERIFIED; live execution BLOCKED |
| DB-10 | ST-10, ST-16 | UNVERIFIED; live execution BLOCKED |
| DB-11 | ST-08, ST-17 | UNVERIFIED; live execution BLOCKED |
| DB-12 | ST-20 | UNVERIFIED; live execution BLOCKED |
| DB-13 | ST-17 | UNVERIFIED; live execution BLOCKED |
| EXT-01 | ST-01, ST-02 | UNVERIFIED; live execution BLOCKED |

## Actual verification results

Executed using Node.js 24.19.0 on Linux; no Windows shell or live Supabase behavior is claimed.

| Check | Result | Evidence boundary |
|---|---|---|
| Existing preparation.test.cjs | PASS | Existing 20 procedures, config/expiry/production guards, mock controls and plan-only subprocess checks |
| Existing preflight.cjs | PASS | Five checked-in bundle hashes/order only; no SQL execution |
| Existing readiness.cjs | PASS | 20-case / 14-group preparation coverage only |
| remaining.test.cjs | PASS | In-memory two-way messaging, permission assertions, notification counts, stable resume, lost response reconciliation, uncertain absent-write stop, false denial rejection, project/expiry/JWT guards and report completeness |
| remaining-lifecycle.test.cjs | PASS | Modeled decline/recovery, twenty modeled races, retained cancellation and no-repeat resume; does not prove database locking |
| Remaining --plan for nine supported cases | PASS | No private config read, authentication or network operation |
| Remaining --execute without local configuration | BLOCKED as expected, exit 2 | Generated a redacted 20-case report before any network operation |
| git diff --check | PASS | Patch whitespace/integrity check |
| Live staging tests | BLOCKED | No authorized user JWT/password files in this cloud environment |

The existing preparation test initially hit a sandbox subprocess restriction. It subsequently passed using the supported execution permission path; no application or backend failure was involved.

## Findings and minimal fixes

No genuine backend defect was proven. Confirmed source-level runner limitations were fixed:

1. ST-13 could only use a request created earlier in a full run; it could not safely resume SR0001. Remaining mode now validates an existing service pair and records stable message IDs.
2. Original ST-13 accepted a receiver PATCH's HTTP success without independently proving the stored flag or checking reciprocal sending/forged participant paths. The focused check reads both parties' rows, exercises rejected writes and checks the associated server event.
3. Config loading used POSIX permission bits unconditionally, which do not represent Windows NTFS ACLs. Windows now relies on an external private directory plus operator-reviewed ACLs; POSIX 0600 checks remain. Tests account for Windows symlink/permission semantics.
4. Original full-run approval/secret loading demanded signup/mail approval and every actor even for messaging. Scoped continuation uses only the needed actors and makes no signup call.

Review the shared runtime/config compatibility diff separately from the new focused case module and tests. No database, frontend UI, business-rule, RLS, migration or production fix is included.

## Remaining blockers and next local run

Read `docs/staging-readiness/remaining-tests.md` for simple local commands. Fetch the separate testing branch to obtain the reviewed changes. Once the existing private local staging files are available, set their paths once and run:

```powershell
node tests/staging/integration.cjs --remaining --execute @stagingArgs
```

Rerun the same command/journal to resume ST-13. Inspect its new report before selecting additional cases. Unverified Provider B is never automatically approved or modified; decline/recovery and race tests need two independently approved eligible Providers. Private proof and matching cases need separately reviewed fixtures. Identity rejection/resubmission, Admin suspension, browser role/draft/session checks, full authorization/Storage matrices, operator lock barriers and atomic late-failure schema probes remain unverified and are not passed by this delivery. Privileged/schema actions require the user's separate bounded approval; no such action was attempted.

Retain all journals/reports and synthetic evidence. Do not delete messages, referenced documents, payments, reviews or migration history. ST-12's recovered reservation can be released through its owning Client's ordinary cancellation UI, using the exact synthetic request ID/title; never cancel SR0001. ST-19's dedicated requests are cancelled automatically after readback, with rows/history preserved. A recorded uncertain write stops for read-only reconciliation, rather than being retried under a new journal.
