# Request Details validation

2 November 2026, Asia/Kuala_Lumpur. Reviewed base: PR #19 at `a9e870d32e01bbaf2e0c78974c19ab96408534b2`.

| Check | Final result | Evidence |
| --- | --- | --- |
| Focused browser behavior | PASS, 306 assertions | [Results](validation/focused.json), [output](validation/focused.txt) |
| Accessibility | PASS, 13 axe WCAG 2 A/AA / 2.1 AA scans, zero violations | Focused suite; layouts, desktop/mobile completion, cancellation, long data and mobile forms |
| Responsive | PASS, all eight requested widths, no horizontal overflow | [Measurements](responsive-metrics.json), [captures](README.md#synthetic-browser-evidence) |
| Authentication | PASS, including nine role combinations and inactive/missing/error scenarios | [Output](validation/auth.txt) |
| Mandatory identity verification | PASS, including 16 direct guarded routes | [Output](validation/identity.txt) |
| Existing workspace layouts | PASS, 84 page/viewport layouts | [Output](validation/layout.txt) |
| Full existing functional suite | PASS, 94 passed, zero failed | [Per-case report](validation/functional.json), [output](validation/functional.txt) |
| Source contracts | PASS, 12 byte-identical helpers; insert/upload bodies unchanged except generic errors; original query/participant/RPC boundaries; 73 protected files | [Hashes/details](validation/contract.json), [output](validation/contract.txt) |
| Syntax/HTML/scope | PASS: JS parses, original/static IDs and icons preserved; formatted HTML/CSS/tests; whitespace and staged scope/credential review | Contract test and final review |

The core JS deliberately retains the exact formatting of protected legacy functions so their byte-level comparison remains meaningful; new code is formatted. No dependency or lockfile changed.

## Focused checks

The actual page/core modules and real Leaflet run against the existing synthetic backend transport. Tests cover Client display, both owner predicates, no participant lookup after failed/foreign request lookup, all six statuses and unknown status, exact reached/current/future progression, no invented event timestamps, malformed/date-only timestamps, dates/budget, long escaped text and neutral unknown data.

They cover pending recommendation/edit routes; original message/report eligibility; no selected/failed selected Provider; real cancellation reason handling and guarded completion; dialog-open/Escape safety, focus cycle/restoration, exact mutation signatures, returned/thrown failures and repeated cancellation prevention.

Settlement tests cover empty amount independent of budget, supported methods and proof requirements, all four accepted proof MIME types, rejected/oversize files, private proof upload path/association, server receipt-reference pathway, actual paid amount, existing records suppressing duplicate forms, blocked forms after either lookup fails, star selection/feedback, failed/uncertain saves without raw database details, duplicate payment/review submit prevention and read-only submitted review. Existing functional tests additionally exercise private receipt resolver/signer/ambiguity failures, refresh-on-open five-minute signing and cash/no-proof presentation.

Map/image tests cover actual recorded coordinates, ranges/finite/type checks, marker/attribution, unavailable library/tiles, missing/unsafe/broken image and safe new-tab image controls. Responsive reparenting preserves review text/rating, amount and selected proof file, invalidates map size and adds no backend operation. Menu/notification behavior, real Message Provider navigation, finite animations and reduced motion are also checked. Shared authentication/logout behavior is covered by the full suites and unchanged-source proof.

## Findings resolved during validation

- The previous amount field assumed the request budget. It now starts blank. The existing transfer-proof fixture now enters its synthetic amount before asserting proof rules; validation/insert assertions were not removed.
- Completion now uses the new accessible dialog. The connected workflow test explicitly confirms it before checking the same completed status and settlement flow.
- A frozen test clock kept Leaflet's tile-opacity animation at zero. The runner now advances its controlled clock and waits for loaded tiles before capture; no application security gate was bypassed.
- Initial highly parallel functional testing observed the unchanged recommendation-error scenario before its asynchronous message appeared. The final standalone full suite passed all 94 existing cases. Recommendation code/assertions were not changed to hide that timing issue.
- Missing/invalid coordinates, unsafe image URLs, tile loading failures and unreliable timestamps have honest UI fallbacks. Server/database errors are kept generic; unknown historical transition times stay absent.

## Limits

All fixtures, names, image bytes, map tiles, proof uploads, signing and mutation results are local synthetic data. These tests do **not** prove live Supabase RLS, RPC/Storage permissions, real signed-link expiry, production/staging behavior or receipt content validation. No real Supabase endpoint or credentials were used, and no database/Storage object/account was changed.

The existing legacy request-image URL association remains separate from private receipt signing and the independently reviewed private-request-images candidate. This UI change does not apply that security rollout or change any bucket visibility/policy.

Physical touch devices, Safari/Firefox, full manual screen-reader speech, external map availability and real concurrent backend operations remain unverified. View/recovery behavior against actual staging data needs separately authorised live testing. Nothing was deployed or merged.
