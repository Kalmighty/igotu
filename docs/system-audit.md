# IGotU system audit — 26 October 2026 (MYT)

This branch contains implemented fixes and repeatable local tests. **It does not establish production readiness or successful database authorization.** No live Supabase reads/writes, SQL execution, real emails, notifications, payments, deployments or merges were performed. SQL validation means offline parsing only. All browser service operations used synthetic accounts, fake documents and in-memory responses.

## Repository state and scope

At the start, the working tree was clean on `igotu-mandatory-verification` at `355e84d3996fad78bb04936e831cfa389d942545`. The execution workspace and previous committed work were recovered. Remote branch tips and GitHub metadata were checked before creating `igotu-system-audit` from that commit:

| PR | Head | Base | State at audit start |
| --- | --- | --- | --- |
| [#1](https://github.com/Kalmighty/igotu/pull/1) | `igotu-security-hardening` / `e5f9d89` | `main` | Open, unmerged |
| [#2](https://github.com/Kalmighty/igotu/pull/2) | `igotu-ui-polish` / `64530d4` | `igotu-security-hardening` | Open, unmerged |
| [#3](https://github.com/Kalmighty/igotu/pull/3) | `igotu-mandatory-verification` / `355e84d` | `igotu-ui-polish` | Draft, open, unmerged |

[Complete inventory](system-inventory.md): 30 HTML pages, 37 application JavaScript files, seven stylesheets, 19 SQL files; page/script/style mapping, literal table/Storage/RPC/Auth dependencies and historical duplicate code. Local file references/imports/HTML IDs are checked automatically. Source-wide inventory, call-site and reference checks cover all application scripts; focused reviews and browser interaction coverage are described below. This is not a promise that every possible input and race is covered.

## A. Overall module status

**PASS below means the stated local evidence passes. It never means live database authorization passed.** All real-backend acceptance groups are separately BLOCKED. In particular, this code must not be deployed as a complete mandatory-verification security solution against the old schema.

| Module | Local status and evidence | Actual backend/external status |
| --- | --- | --- |
| Authentication | PASS — nine selected-role/account-role outcomes; missing/suspended/error cases; cleanup failures; real SDK cross-tab sign-out and expired-token refresh rejection | BLOCKED — real Auth configuration/session revocation policies |
| Registration | PASS — both roles; validation/public Admin rejection; simulated duplicate email/transport failure; confirmation instructions; connected approval-first routing | BLOCKED — real signup trigger, email configuration and delivery |
| Identity verification | PASS — four states/both roles, correction/resubmission, consent/file validation, refresh/relogin, direct-route timing guards, cleanup error recovery | BLOCKED — consent columns, RLS/RPC/Storage enforcement/concurrency |
| Client | PASS — real page modules/layouts; onboarding, create/edit/cancel, scoped requests, messaging, payment/review controls and reports | BLOCKED — actual database constraints/transactions and failure recovery |
| Provider | PASS — onboarding, skills/hours, availability changes, assigned-only incoming filters, confirm/decline/start, history/review controls | BLOCKED — actual authorization, atomic profile update and booking concurrency |
| Admin | PASS — real page modules; search/filter/suspend/activate; verification decisions; report review; payment/review monitoring | BLOCKED — server authority and transactional effects/notification uniqueness |
| Provider matching | PASS — exact specialization, availability/hours, declined/busy/inactive/unverified exclusions, deduplication, nearest-first order, rating aggregation, empty/error states | BLOCKED — complete cross-user metadata under actual RLS; latest approval proof and concurrent booking |
| Service requests | PASS — connected create → select → confirm → start → complete; decline/rematch and cancel/history; image failure retry | BLOCKED — real RPC bodies, transactions and stale/concurrent action enforcement |
| Messaging | PASS — scoped thread queries, send/receive/read updates, ordering, failed drafts, stale responses, captured recipients, XSS-safe text | BLOCKED — real participant RLS and rejection of writes after suspension/revocation |
| Payments | PASS — Cash without proof; transfer requires proof; upload validation; participant payload, duplicate-form prevention after history failure | BLOCKED — database ownership/uniqueness; current public-URL receipt design and legacy privacy |
| Ratings/reviews | PASS — keyboard-clickable labelled stars, correct reviewee, completed-state UI, history/duplicate-form/error handling, displayed aggregate | BLOCKED — database completion/ownership/unique constraints and full aggregate visibility |
| Notifications | PASS — counts beyond eight previews; mark all read; generic verification content; notification failure does not reverse a committed action | BLOCKED — server-owned delivery, actual RPC emission, duplicate/lost-notification handoff |
| GPS/maps | PASS — real locally bundled Leaflet, synthetic geocoder/GPS; click/search/GPS coordinates; Provider tile-fallback failure recovery | BLOCKED — live tile/geocoder availability, physical-device GPS accuracy and permission behavior |
| Supabase integration | BLOCKED — source contracts and offline SQL parse pass, but no complete installed catalog or authorized staging project was supplied | BLOCKED |
| Security | BLOCKED overall — local role/session/approval guards and escaped rendering pass; no protected draft changed | BLOCKED — direct API/RPC/Storage/exposed-schema tests not run |

## B. Confirmed bugs and fixes

Each numbered row has a reproduction represented in `tests/system-functional.cjs`, `tests/auth-sdk-lifecycle.cjs` or the static/pinned-SDK checks. Negative scenarios are expected-denial tests, not failed test outcomes. Retest outcomes are recorded in C and the JSON artifacts.

| ID / severity | Module / affected files | Reproduction and root cause | Fix |
| --- | --- | --- | --- |
| B01 / High | Matching: `client-recommended-providers.js` | Fail decline/booking lookup: eligible cards still appear; other lookup errors are overwritten by an empty-results render. Missing metadata is treated as valid absence. | Stop recommendation initialization on eligibility/history errors and show a clear retry message. No scoring/matching rule changes. |
| B02 / High | Request creation: `client-create-request.js` | Insert succeeds, image upload/link fails, then submit again: second request is inserted because the page stays in create mode. | Retain committed request ID, switch to edit mode and update the URL so retry/refresh reuses it. Guard duplicate submits and recover thrown saves. This does not provide server idempotency after an ambiguous lost INSERT response. |
| B03 / High | Both `client-messages.js`, `provider-messages.js` | Reject message insert: optimistic UI clears the only copy of the text. | Keep per-thread drafts and restore failed text for retry. Capture request/recipient before awaiting; lock concurrent sends. |
| B04 / High | Both messaging scripts | Hold thread A read, select B, then release A: A's messages render in B and can use the wrong mutable selection for read/notification work. | Version and snapshot reads, ignore stale responses, capture send recipients/titles and retain drafts per conversation. |
| B05 / High | `notification-helper.js`, service/Admin callers | Throw notification transport error after Admin approval: the durable decision succeeds but UI never reports success. Similar callers can offer a retry after an already committed action. | Keep notification delivery best effort and return failure without throwing/logging private payloads. No server-trigger handoff implemented; best-effort delivery can still be lost. |
| B06 / High | `provider-profile.js` | Saved specialization/profile lookup fails; form accepts save and can overwrite/reset unseen saved data. | Block save after any incomplete initial profile/skills/specialization/hours load. Show refresh guidance rather than telling ordinary users to execute SQL. Mid-save cross-table atomicity remains a database blocker. |
| B07 / Medium | `admin-reports.js` | Cancel the optional resolution prompt: null is coerced to an empty note and the report is resolved. | Return immediately on Cancel; retain optional blank note only when confirmed. |
| B08 / High | `provider-incoming-requests.js` | A three-component address such as `Unit 7, Likas, Sabah` is displayed in full as the approximate area before confirmation. | Use the existing conservative short-address fallback. This fixes display only; raw-table privacy remains blocked on the planned backend/projection work. |
| B09 / Medium | `service-action-dialogs.js` | Tab leaves cancellation/decline dialog; Escape removes it without restoring opener focus. A second invocation can orphan the first promise. | Wrap Tab/Shift+Tab, restore opener, resolve a replaced dialog before opening another. |
| B10 / Medium | `auth.js`, `password-recovery.js` | Throw signup/reset transport error: button remains disabled and the promise is unhandled. Reset also retained a true recovery-session flag after sign-out. | Catch failures, restore retry controls, suppress duplicate submissions, re-read current session before update, clear cache and use local sign-out/fallback after success. Email confirmation is retained. |
| B11 / High | `verification.js` | Fail verification insert and throw again during orphan cleanup: catch exits before restoring the verification form. | Contain cleanup failure, retain generic safe error and restore allowed submission controls. No linked-file deletion; orphan retention still needs backend operational review. |
| B12 / Medium | `notification-menu.js` | Eleven unread notifications exist but opening the latest-eight dropdown changes badge/count to eight. | Query exact unread total separately and refresh after read mutations; latest-eight limit applies only to previews. |
| B13 / High | `client-request-details.js`, `provider-assignment-details.js` | Reject payment/review history lookup: failure becomes null/empty and another submission form is shown. Provider payment state also falsely says no payment. | Track known history state; withhold duplicate payment/review forms on errors and label unavailable payment state. Database uniqueness is still required. |
| B14 / High | `profile-guard.js`, `profile-menu.js` | Real SDK sign-out in another tab leaves an already authorized document displayed because the guard promise is only checked once. | Handle SDK SIGNED_OUT synchronously, lock/redirect open workspaces, clear cache; refresh persisted back/forward documents. Reuse guarded local logout in the common profile menu. This is not continuous server revocation of already rendered data. |
| B15 / High | `provider-profile.js` | Both tile sources fail, then click/search/zoom: Leaflet throws `project`/`getCenter` null errors and cannot save coordinates. `layer.off()` removed Leaflet's internal remove listener, leaving a removed layer registered on map events. | Detach only IGotU tileload/tileerror listeners, preserving Leaflet teardown. Real Leaflet fallback + connected onboarding regression now exercise this. |
| B16 / Medium | `css/ui.css`, request/assignment detail scripts | axe finds low-contrast role/hours/map/receipt controls and map attribution links; review stars have indistinguishable names and Provider feedback lacks a bound label; hidden required proof input cannot be focused. | Targeted contrast/underline overrides, named/pressed rating buttons, associated feedback label, one visible, labelled keyboard-accessible proof control (without a duplicate upload widget). Existing premium styling retained. |
| B17 / Low | `supabaseClient.js`, SDK tests | Unversioned `supabase-js/+esm` can change independently of reviewed code. | Pin the already tested 2.118.0 SDK and matching test dependency. No new framework or Auth system. CDN reachability remains external. |
| B18 / Medium | `profile-menu.js`, `notification-menu.js` | Escape from mobile navigation moves focus to the closed profile trigger because its global handler always runs; notification Escape does not restore its opener and opening Profile leaves Notifications open. Earlier layout tests masked this by suppressing these scripts. | Handle Escape only for the open dropdown, restore its own opener and close the other dropdown when opening Profile. Real-script checks cover Client/Provider dropdowns and navigation focus for all three roles; Admin deliberately has no notification/profile dropdown. |

The initial regression suites passed on the base. The expanded harness then reproduced these errors; its temporary before-results include early selector/timing errors that were corrected in the tests. Only final outcomes are acceptance evidence. The Leaflet failure was traced with a fresh synthetic Provider and the real library, not hidden by removing the map from tests.

## C. Validation and repeatability

Final recorded outcomes and their precise counting units are saved in [system-audit-results.json](system-audit-results.json). **Final acceptance: 12 recorded command outcomes passed (nine standard suites plus three focused followups), zero failed. The system cases comprise 84 executions of 77 distinct named scenarios, all passing; seven were repeated after final upload-control review. Fourteen backend/external acceptance groups remain BLOCKED.** A suite outcome is one command result; it is not added to its internal scenario/layout counts. No total is invented for legacy scripts that do not emit individual assertion counts.

- Static checks: every page/import/local reference/duplicate HTML ID; all 37 application JS sources parse; all 19 SQL sources/459 statements parse offline; mandatory draft's 66 statements/17 PLpgSQL units and eight audit SELECTs parse; protected drafts remain byte-identical to the feature base.
- Existing homepage suite: 1440/1024/768/390/320px, keyboard/menu/links/criteria, reduced motion, no-JS and axe.
- Existing auth suite: nine role outcomes (three accepted/six rejected), signup validation, confirmation/onboarding, missing/suspended/error profiles, stuck/failed sign-out cleanup, mobile roles and axe.
- SDK cleanup suite: real pinned SDK with normal, simulated 503 and thrown sign-out. Lifecycle suite: real SDK cross-tab sign-out and expired access token plus invalid refresh. All HTTP responses are synthetic. A failed proactive refresh while the access token remains valid is intentionally not counted as an expired session.
- Existing verification suite: 16 direct normal/onboarding routes, both roles/four states at 1440/768/390/320px, registration/email instructions, correction, file payload/validation, pending lock, active/inactive role routing, Admin signed previews/dialogs and axe.
- Existing workspace layout suite: 84 layouts; mobile/focus/provider search/reset/select/dashboard empty/error behaviors. This suite suppresses most page scripts; it is not claimed to test their actions.
- New system suite: **all actual page modules execute** across five requested widths (23 role pages excluding completed onboarding redirects, 115 page/viewport visits). Separate connected scenario uses both new registrations → verification → Admin approval → Client/Provider onboarding → create/image → recommend/select → confirm → two-way messages/read → start → complete → cash payment → both reviews → Admin monitors. Further cases cover decline/rematch/cancel, eligibility/history failures and exclusions, payment validation, reports/Admin status actions, session/draft races, notifications and map/GPS interaction. Five service-form axe scenarios complement the public/auth/verification checks.

No staging database integration test or actual-backend end-to-end test was run. Fourteen named acceptance groups are BLOCKED in the results artifact, including real schema compatibility, direct API authorization, concurrency, privacy, transaction rollback and external services. No live credentials are hardcoded; fake passwords and documents belong only to fixtures. The synthetic transport is not an RLS emulator and cannot prove backend denial.

To repeat in a normal local development environment:

```sh
npm ci --prefix tests --ignore-scripts
python -m pip install -r tests/requirements.txt
# Install Chromium or set CHROMIUM_PATH to your installed executable.
npm test --prefix tests
```

`tests/run-audit.cjs` starts and closes its own loopback static server, bundles the pinned SDK locally, runs all nine suites, logs outcomes and writes JSON/screenshots under ignored `work/system-audit/final`. It needs Node, Python, Chromium, npm dependencies and offline pglast. Set `CHROMIUM_PATH`, `AUDIT_OUTPUT` or `AXE_PATH` if necessary. Chromium execution may need environment-specific sandbox permission; no Supabase permission is required. SQL parsing never opens a database connection. Test-generated profile/request IDs are synthetic.

## D. Database compatibility and security dependencies

**The actual deployed schema is unknown in this audit.** Runtime context supplied no configured staging credentials or authorized isolated project/catalog. The browser contains a project URL and publishable key; that does not authorize production account/API testing. No Supabase project was queried and no schema was applied.

Source contracts that need catalog confirmation:

| Dependency | Source finding / blocker |
| --- | --- |
| Base schema and Auth triggers | `database/setup.sql` is a three-line historical note, not a base schema. Core users/provider_skills/service_requests/payments/reviews definitions, enums/FKs/defaults/unique constraints and the installed signup trigger are not fully reconstructible from this repository. |
| Missing RPC implementations | Browser uses `admin_update_user_status(p_user_id,p_status)`, `provider_start_request(p_request_id)` and `client_complete_request(p_request_id)` but their actual business bodies are not in the repository. Draft wrapping references do not supply them. `current_user_role()` and `handle_new_auth_user()` are also dependencies whose installed definitions/ACLs need inspection. |
| Versioned edit/cancel contracts | Current edit sends `p_service_type` plus other details; old edit setup has an older signature. Current cancellation/decline send `p_reason`; older cancel scripts support one argument. Applying old scripts can silently regress these calls. Check exact installed overloads/argument names/defaults and schema-cache refresh. |
| Identity consent | Frontend inserts `age_confirmed`/`privacy_consent`, defined only in the mandatory draft. Old schema submission fails; do not drop consent fields or bypass approval to make an old database pass. |
| Authoritative approval | Own latest reviewed request must agree with users flags, role and reviewer. Badge-only legacy approval is blocked intentionally. Audit inconsistencies/duplicate pending rows through the existing SELECT-only audit plan; no automatic approval, consent inference or grandfathering. |
| Provider candidates and trust statistics | Browser still reads other users/profiles/booking/review rows. An RLS-filtered successful empty result is indistinguishable from true absence. The new error handling cannot fix invisible bookings, incomplete totals or missing cross-user projections. Stage A metadata plus separately reviewed name/participant projections and Stage B consumers remain necessary. |
| Verification enforcement | Without a reviewed/applied mandatory migration, frontend gating is not a direct API restriction. Existing definer RPCs, exposed views/schemas, grants, Storage paths and privileged writers need exact negative/positive staging tests. |
| Receipt privacy | Frontend still stores/opens `proof_url` generated with getPublicUrl. Private signed/authenticated receipts and historical URL/path reconciliation remain Stage A/B/C work. A private bucket makes a public URL unusable; a public bucket may expose receipts. Neither condition was probed. |
| Profile save atomicity | Provider save remains several requests (profile, delete/insert skills/specializations, hours, basic profile RPC). An intermediate failure can leave partial data; frontend load protection does not provide rollback. A separately reviewed transactional API/schema contract and concurrency tests are required; no speculative replacement RPC was installed. |
| Booking transitions/concurrency | Repository RPCs check exact date/time conflicts but lock the individual request; cross-request Provider-slot races and missing duration semantics still need staging tests/design review. No duration, reordering or marketplace model was added. |
| Notification ownership | Current browser receipts/notifications remain best effort; source report RPCs may emit their own events, so inspect exact installed bodies/recipients. Stage C browser-write removal and trigger activation need the paused-write handoff. No new notifier/trigger was added. |

Stage A, Stage C, their rollout document and the mandatory migration are byte-identical to `355e84d`. No SQL file is changed by this audit. The mandatory draft refuses existing `igotu_private` objects; A/C cannot simply be concatenated with it. C would break current raw Provider request/profile/receipt consumers; additional narrow projections and the separately planned Stage B implementation are prerequisites. The staged verification rejection notification still appends `admin_note`: integrate a separate privacy correction before activation. None of these gates is satisfied by fixture success.

Prior hardening documentation records broad authenticated users enumeration and raw exact-location access concerns. Those earlier reported live findings were **not re-queried** here. The mandatory draft adds approval boundaries but does not by itself solve every approved-user cross-user privacy issue. Frontend escaping, selected-role checks, no public Admin signup and database-derived authority are retained; browser cache/cards/metadata are never treated as privileged authorization. No real service-role credential was introduced.

## E. Remaining problems and limits

- All fourteen backend/external groups in the JSON remain BLOCKED. Actual data correctness, RLS/definer bypass resistance, transactional approval, document privacy/expiry, review/payment uniqueness and concurrency cannot be certified from mocks or parser success.
- Partial Provider saves and ambiguous network failures after durable writes still need database transactions/idempotency. The image retry fix covers the known post-insert attachment failure; it does not invent a server-generated idempotency contract. Orphan uploads/retention need an operational plan.
- Source receipt exposure, broad personal-data reads, Stage A/C integration, missing projections/RPC bodies and consent schema dependencies remain release blockers. They were not weakened or hidden with frontend fallbacks.
- Continuous suspension/approval revocation of an already open tab is not a frontend authorization boundary. SIGNED_OUT/BFCache handling is improved, but server checks must reject every later operation. Previously rendered/cached information and already issued signed/public URLs cannot be revoked by a redirect.
- Live confirmation/recovery emails, real notification delivery, tile/geocoder service behavior, device GPS accuracy, browser/OS combinations and actual password-provider settings are NOT TESTED. Leaflet/geocoder/geolocation tests are local/synthetic, including tile failures.
- Current product does not include password visibility-toggle controls, separate payment/review pages, a My Requests text-search control, or separate Client/Provider/verification count cards on the Admin dashboard. Existing embedded payment/review forms, request status filters and total/report cards were tested. These absent controls are recorded feature gaps, not claimed tested or added as unrelated features.
- The test matrix is repeatable but not exhaustive. Five-width real-module visits check initialization/layout/navigation; dedicated scenarios exercise selected actions. They do not mean every button, field combination and race has been formally verified. No claim of zero bugs is made.

## F. Files and GitHub delivery

Application changes are limited to `igotu_v2/css/ui.css` and auth/session, verification, service request/recommendation/detail, Provider profile/assignment/incoming, messaging, notification and dialog scripts listed in the PR diff. No HTML redesign, service workflow rewrite or SQL modification occurred.

New test sources: `system-static.py`, `system-fixture.js/.cjs`, `system-functional.cjs`, `auth-sdk-lifecycle.cjs`, `run-audit.cjs`, pinned `tests/package.json`/lockfile and `requirements.txt`. Existing SDK cleanup interception is updated to the pinned CDN URL. `.gitignore` excludes test dependencies/scratch output. Review artifacts include this report, the generated inventory, final JSON and representative synthetic screenshots. The root README links local tests; legacy setup READMEs are marked historical so their backfills/policy replacements are not mistaken for a safe migration order.

The audit PR targets `igotu-mandatory-verification`; it remains unmerged. See the final delivery message/PR head for the exact audit commit SHA (the report cannot embed its own commit hash). Existing PRs #1–#3 are preserved.

## G. Readiness assessment

| Intended use | Assessment |
| --- | --- |
| UI demonstration | **Ready for a clearly labelled local fixture demonstration.** Existing premium views and the connected workflow can be shown without real identities or production writes. A live-data security demonstration is blocked. |
| Functional UAT | **Ready for fixture-based walkthroughs; BLOCKED for backend-backed acceptance.** Provision an authorized isolated project and pass the database/external matrix before counting real business outcomes. |
| Isolated staging integration testing | **Ready to begin catalog review/test preparation, not to apply drafts blindly.** Supply an isolated schema export, fake accounts/documents, reviewed stage integration and explicit mutation authorization. Resolve missing RPC/projection/schema contracts before end-to-end acceptance. |
| Production deployment | **NOT READY.** Consent migration and identity enforcement, privacy/projection/receipt handoff, real RLS/RPC/Storage tests, concurrency/atomicity and existing-user reconciliation remain blockers. Nothing has been deployed. |

## Representative screenshots

All screenshot content is synthetic. Map tiles/icons are intentionally unavailable in these offline fixtures; grey backgrounds are not evidence of a successful live basemap connection. Full verification/Admin state screenshots remain indexed in [mandatory verification review](mandatory-identity-verification.md#recorded-local-results-and-screenshots).

- [Client payment/review — desktop](ui-preview/system-client-request-details-1440.png) / [mobile](ui-preview/system-client-request-details-390.png)
- [Provider incoming — desktop](ui-preview/system-provider-incoming-1440.png) / [mobile](ui-preview/system-provider-incoming-390.png)
- [Admin payment monitor — desktop](ui-preview/system-admin-payments-1440.png) / [mobile](ui-preview/system-admin-payments-390.png)
