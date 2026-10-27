# Validation evidence — Phase 6

> Phase 7 reviewed/corrected these drafts. See [current migration review](../staging-readiness/README.md), [ordered execution guide](../staging-readiness/guide.md) and [current validation](../staging-readiness/validation.md). Phase 6 evidence below is historical; use the Phase 7 gates and explicit baseline-first order.

**12 local check groups passed; 94 fixture scenarios passed across the full run and focused reruns. No real-backend integration test passed.** All 14 database/external acceptance groups remain BLOCKED. [Machine-readable results](validation-results.json) retain case names, evidence sources, initial failures and their corrections.

| Check | Executed result | Limits |
| --- | --- | --- |
| Static source/references | PASS: 30 HTML, 38 JS, 7 CSS; no missing local references, duplicate IDs or JavaScript syntax errors; protected drafts unchanged | Static discovery only |
| Offline SQL | PASS: all 23 application SQL files, 639 statements parse; four new drafts also parse SQL function bodies and 73 PL/pgSQL units | No PostgreSQL connection, semantic execution, policy/permission proof or transaction testing |
| Earlier verification draft | PASS: 66 statements, 17 PL/pgSQL units; earlier Stage A/C/identity sources byte-identical | Remains a historical alternative draft, not combined with new rollout |
| Homepage | PASS: 1440/1024/768/390/320px, keyboard/mobile menu, axe WCAG A/AA checks | Local intercepted browser run |
| Login/Register | PASS: nine role/account combinations, 3 accepted/6 rejected; mismatch session cleanup/failure handling, active/missing profile/onboarding cases, mobile selection and axe | Synthetic Auth responses only |
| Real pinned SDK cleanup | PASS: local sign-out, simulated server logout failure and thrown failure clear scoped session/cache | Real SDK, local intercepted HTTP responses |
| Real pinned SDK lifecycle | PASS: two-tab sign-out and invalid refresh lock both tabs | No live Auth configuration tested |
| Mandatory verification UI | PASS: 16 direct Client/Provider routes gated, all verification states, correction/resubmission, consent payload, signed Admin previews, approval-first onboarding | Fixture access states do not prove database enforcement |
| Workspace layout | PASS: 84 page/viewport checks, mobile navigation/focus and empty/error states | Includes suppressed scripts for layout-only pages; full real page modules also exercised below |
| Stateful functional scenarios | PASS: 94 final scenario outcomes; existing workflows plus new contracts, no browser notification inserts, private receipt failure/refresh cases, atomic-save failure UI, creation retry key, current-pair messaging, Admin reconciliation/consent/pagination | Single API failure simulation does not prove atomic DB rollback; synthetic filters do not prove RLS/matching completeness |
| Staging plan coverage | PASS preparation check: 20 requested cases map to DB-01–DB-13 and EXT-01 | Plan only; execution blocked |
| Staging artifact builder | PASS: production ref/foreign origin/secret key rejection, no overwrite/source edits, SQL omitted from artifact | Synthetic public configuration; no environment provisioned or contacted |

The full fixture run recorded 91 passes and two failures caused by fixed timing assumptions: the race test checked its transport barrier before the asynchronous query reached it, and one recommendation error assertion ran before the message became visible. Tests now wait for the explicit barrier or visible message. Both race cases and all five recommendation-error cases passed focused reruns. The final Admin queue/consent/pagination checks and 320/390/1440px capture also passed. A separate source check caught a missing Admin verification body gate; it was fixed and the offline check rerun successfully. Raw [full functional log](evidence/full-functional.log) and focused retry logs are retained instead of hiding those failures. The combined 94-scenario result is not presented as a single clean full-suite run.

Reproduction with Node dependencies from `tests/package-lock.json`, Python `tests/requirements.txt`, Chromium and loopback permissions:

```sh
npm --prefix tests ci
python -m pip install -r tests/requirements.txt
npm --prefix tests test
```

The runner creates its own local static server and intercepts all backend/external traffic. Offline parse tests never submit SQL. `node tests/staging/readiness.cjs` is safe local preparation and rejects execution requests. `node tests/staging/artifact.cjs` creates only ignored synthetic local artifacts. Test logs are in [evidence/](evidence/).

## Screenshots

All screenshots use synthetic accounts and service information. No real documents, signed receipt URLs, credentials or business records appear. Live map tiles/external services were blocked by fixtures; blank map backgrounds do not demonstrate a successful external map test.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Legacy Admin review queue | [1440px](screenshots/admin-reconciliation-1440.png) | [390px](screenshots/admin-reconciliation-390.png), [320px](screenshots/admin-reconciliation-320.png) |
| Client request/payment/review | [1440px](screenshots/client-request-details.html-1440.png) | [390px](screenshots/client-request-details.html-390.png) |
| Assigned Provider incoming service | [1440px](screenshots/provider-incoming-requests.html-1440.png) | [390px](screenshots/provider-incoming-requests.html-390.png) |
| Admin payment monitor | [1440px](screenshots/admin-monitor-payments.html-1440.png) | [390px](screenshots/admin-monitor-payments.html-390.png) |

## Blocked acceptance groups

Production metadata review partly resolves DB-01 discovery, but none of these effective integration groups has been executed against an authorized staging database:

| Group | Required evidence |
| --- | --- |
| DB-01 | Actual installed schema/contracts, grants and effective API schema exposure |
| DB-02 | Anonymous/wrong-role/inactive API denial; authority tampering |
| DB-03 | Direct not-submitted/pending/rejected workspace denial |
| DB-04 | Concurrent pending submissions; real consent/document ownership |
| DB-05 | Transactional Admin review and badge synchronization |
| DB-06 | Complete recommendation eligibility, other-Client bookings and data minimization |
| DB-07 | Assignment concurrency, expected-state transitions, creation idempotency |
| DB-08 | Participant messaging, read flags and suspension/session revocation |
| DB-09 | Payment uniqueness, historical private receipts, actual URL expiry |
| DB-10 | Review uniqueness/authorization and complete aggregates |
| DB-11 | Evidence/report ownership and transactional notification recipients |
| DB-12 | Atomic Provider save and injected late-failure rollback |
| DB-13 | Coordinated rollout, notification handoff and legacy reconciliation |
| EXT-01 | Real confirmation/recovery mail, geocoder/tiles, GPS, CDN/configuration |

Exact approval needed: create an isolated project/resources and synthetic users/files, configure staging Auth/mail capture, apply the reviewed drafts after schema/privacy review, and execute synthetic writes, concurrency, Storage and external-service tests. See [environment preparation](staging-environment.md), [20-case plan](../../tests/staging/acceptance-plan.json) and [rollout/remaining decisions](rollout.md). No such mutation/resource approval has been inferred from the metadata-only SELECT authorization.
