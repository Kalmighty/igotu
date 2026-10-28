# IGotU final FYP readiness checklist

This is a sign-off checklist, not a claim that all items passed. P0 items support a reliable secure FYP demonstration. P1 items are needed for deployment/stronger acceptance claims. Keep evidence links, dates, viewport and exact source commit beside each completed item. Full backend acceptance remains UNVERIFIED where a matrix assertion has no actual evidence.

## Established baseline

- [x] Owner reports focused **live PASS** for ST-06, ST-07, ST-08, ST-10, ST-13 and ST-17. Keep their private original reports; this session did not re-execute them.
- [x] Owner reports completed SR0001 with one RM100 Cash payment, two reciprocal reviews and two messages. Preserve these records and the associated evidence.
- [x] Existing staging architecture and Client-selected Provider business flow retained. No Provider job-browsing/application flow added.
- [ ] Remaining priority cases have focused live reports: ST-05, ST-12, ST-19. ST-08/ST-10 focused passes are retained; do not rerun them. Explain blocked fixture/approval gaps honestly.
- [ ] Supervisor/demo scope accepts documented residual gaps; no offline/model result is presented as real backend proof.

## P0 — Client browser demonstration

- [ ] Client registration/confirmation and login work against the staging artifact; invalid login/role mismatch safely returns to Login and clears only IGotU session state.
- [ ] Direct workspace routes stay restricted before ordinary identity submission, Admin approval and complete profile; pending/rejected states show a useful next step.
- [ ] On a **new synthetic demonstration service**, Client creates correct category/specialization, date/time, location/GPS, budget and optional request image; validation and duplicate-click retry are understandable.
- [ ] Matching shows eligible Providers, sensible distance ordering and no restricted contact/exact coordinate leak. Client selects; no Provider application/job-browsing model exists.
- [ ] Client sees confirmation/decline, can recover a declined assignment, sees correct lifecycle and alone completes an in-progress service.
- [ ] Cash/transfer recording is visibly labelled offline recording; no real money moves. A new private inert transfer proof can be opened by an authorized participant; unrelated accounts are denied.
- [ ] New completed demonstration service supports one review per participant and expected notifications. Do not recreate SR0001 payment/reviews.
- [ ] Messaging UI uses a different synthetic thread, keeps recipient/draft correct under rapid navigation, handles failure and shows read state. Do not mutate SR0001 messages even by marking read.

## P0 — Provider browser demonstration

- [x] Owner reports Provider B identity approved and independently verified. Do not perform another Admin decision; recheck latest approved history/consents before profile completion via the [isolated finishing workflow](provider-b-finish.md).
- [ ] Approved Provider completes profile, categories/specializations, synthetic coordinates, availability and weekly hours; validation is clear and saved sets are consistent.
- [ ] Provider sees only assignments addressed to them; no raw browse-all requests, application button or other Clients' booking details.
- [ ] Before confirmation, exact Client location/description/image is hidden as specified; after confirmation the authorized service details appear.
- [ ] Confirm/decline/start UI and notification updates work on dedicated fixtures; double-click/stale failures do not create duplicate events or inconsistent transitions.
- [ ] Declined Provider is excluded for that service; another eligible approved Provider receives recovery assignment.
- [ ] Concurrent same-slot assignment report proves one winner/expected conflict; UI handles the losing selection and booking exclusion.
- [ ] Provider messaging and reciprocal review work on a new demonstration fixture; historical records remain available without changing completed evidence.

## P0 — Admin browser demonstration

- [ ] Existing active synthetic Admin logs in under the correct role; monitoring pages load the synthetic service/payment/review evidence with correct labels and no real identity/payment content in screenshots.
- [ ] Read-only verification/reconciliation queue is usable and Client/Provider access remains denied; focused API PASS does not substitute for this browser check.
- [ ] Verification pending/rejected/approved statuses, notes and document preview permissions are understandable in UI. Any approve/reject/resubmit demonstration uses dedicated synthetic identities and separately authorized Admin decisions.
- [ ] User-management/suspension and report-resolution demonstrations remain blocked until separately authorized; no self/last-Admin suspension or privilege change is attempted.

## P0 — Security and resilience

- [ ] Every test/build/browser route targets staging `oqalpauljjhytnrpzcqp`; never launch the original production-configured frontend as a staging artifact.
- [ ] Anonymous, wrong-role, unrelated and restricted-account assertions are backed by valid positive controls. A 404/500/expired session is not accepted as an authorization denial.
- [ ] Identity, report and payment proof buckets stay private; raw public URLs fail, authorized signing succeeds, and signed URLs/tokens never appear in committed reports or screenshots.
- [ ] No privileged key, password/JWT, private config/journal, real identity document or personal payment data is committed, served or bundled. Windows private directory ACLs are restricted to the operator.
- [ ] Inputs/rendered feedback/messages withstand empty/long text and HTML/script strings; server errors do not expose credentials or internal sensitive details.
- [ ] Network interruption, expired login, denied permissions and stale transitions show a useful failure state and retain drafts/creation keys. Lost responses do not cause duplicate mutations.
- [ ] SR0001 protected digest remains unchanged; all new fixture IDs and terminal states are traceable to the private journal/report.

## P0 — Responsive design and accessibility

- [ ] Check Client, Provider and Admin Login, dashboards, forms, matching cards, assignment details, tables and messaging at 360/390, 768 and 1440 px; add 1024 px for tablet landscape if used in the demo.
- [ ] No horizontal overflow/clipped controls, unreadable table cells or mobile fixed-bar overlap. Long names, feedback and error text wrap correctly.
- [ ] Green-and-white IGotU design, navigation, status colours and primary actions remain consistent across roles; loading/empty/denied states are visible.
- [ ] Keyboard tab order, visible focus, form labels/error association, contrast and touch targets are usable. Verify core flows with keyboard and at least one screen-reader spot check; automated layout checks alone do not prove accessibility.
- [ ] Maps remain usable when GPS permission is refused, tiles/geocoding fail or coordinates are missing; manual correction is available where designed.

## P0 — Evidence and FYP package

- [ ] Record exact review branch/commit, Node version, staging project ref, run timestamps, fixture aliases and test scope. No secret values in captures.
- [ ] Retain all previous reports/journals. New priority reports label prior owner-reported live passes, current focused results, offline checks, blocked scenarios and full acceptance separately.
- [ ] Each of the 20 cases and all 14 groups have an honest status and an evidence reference or explicit unresolved criterion; do not close a group because a related happy path worked.
- [ ] Save an end-to-end browser demonstration script/video/screenshots using new synthetic fixtures, with an understandable Client → Provider → Client → Admin story and disclosed limits.
- [ ] Prepare concise FYP architecture/business-flow diagram, data/role boundaries, testing table, limitations and next-work list. Align claims with the actual evidence.

## P1 — Before deployment or broader release claims

- [ ] Complete full registration/recovery/role-pair and browser session-revocation matrices; test retained JWT and signed-link expiry windows explicitly.
- [ ] Cover identity rejection/resubmission, forged consents/roles/paths, duplicate submission and orphan/reference cleanup races using separately approved fixtures/decisions.
- [ ] Complete Storage ownership/overwrite/delete/legacy-reference/expiry matrices and notification recipient/replay matrix. Public request-image privacy is an explicit design decision before any real sensitive image is uploaded.
- [ ] Complete unavailable/unapproved/incomplete/declined/busy/hours/coordinates matching truth table, full independent statistics and additional distance ordering cases.
- [ ] Cover stale/invalid/unauthorized and raced lifecycle, payment and review transitions on separate fixtures. Do not use SR0001 for negative writes.
- [ ] Full atomic Provider-profile late-failure rollback and SQL barrier/interleaving tests require separate explicit schema/operator approval; do not install probes or alter RLS automatically.
- [ ] Review effective API schemas/grants/default privileges and routine exposure with an authorized read-only operator; never broaden permissions to make a test pass.
- [ ] Choose the reviewed deploy commit, intended staging environment, build/publish directory, staging-only public client configuration, Auth redirect/recovery URLs and HTTPS settings; keep private files out of the artifact.
- [ ] Prepare Netlify staging preview/smoke-test and rollback plans, external map/CDN requirements, and a credential-safe configuration inventory. Confirm no automatic production deploy or branch merge is triggered.
- [ ] Obtain separate explicit deployment approval before any hosting/deployment action. No deployment, PR merge/closure or migration replay is authorized by this checklist.
- [ ] After an approved deployment, perform a scoped staging browser smoke test and retain evidence; separately approve any future production work.

Final sign-off: P0 browser demonstration evidence complete, priority focused results reviewed, unresolved P1/full-acceptance items disclosed, protected evidence intact, and deployment approval recorded if deployment is requested. Until then, describe the project as **staging validation in progress**, not fully accepted or production-ready.
