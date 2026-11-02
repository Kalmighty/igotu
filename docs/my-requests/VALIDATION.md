# My Requests validation

Date: 2 November 2026 (Asia/Kuala_Lumpur). Reviewed base: PR #18 at `b22ec7de716a991bcdaf522846a1e1e53db3b87d`.

Browser validation uses Playwright, Chromium, axe and the existing in-memory Supabase transport fixture. No real authentication, account data, cancellation, project query, Storage operation or other live write was performed. No production/staging endpoint was contacted. Dependencies already installed in the testing environment were reused; application dependencies/lockfiles are unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Focused request-history interactions | PASS, 227 assertions; 19 axe scans, zero violations | [Assertions/scans](validation/focused.json), [output](validation/focused.txt) |
| Eight viewport layouts | PASS: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×900, 768×1000, 390×844, 320×800 | [Measurements](responsive-metrics.json), [captures](README.md#browser-evidence) |
| Auth regression | PASS, including nine role combinations, inactive/missing/error states and keyboard interactions | [Output](validation/auth.txt) |
| Mandatory verification | PASS, including 16 direct guarded workspace routes | [Output](validation/identity.txt) |
| Existing layout suite | PASS, 84 page/viewport layouts | [Output](validation/layout.txt) |
| Existing functional regression | PASS, 94 passed, zero failed | [Cases](validation/functional.json), [output](validation/functional.txt) |
| Source compatibility/security boundaries | PASS: original owned query, cancellation RPC/status gate, four unchanged normalised Auth/profile helper functions, 67 protected files | [Source/hash evidence](validation/contract.json), [output](validation/contract.txt) |
| Syntax/markup/style/scope | Original IDs preserved, unique IDs, valid label/icon targets, JS syntax and formatted new source; whitespace and staged credential/scope review | Contract test and final staged review |

## Focused coverage

- Authenticated profile display and user code; caller-ID predicate on every request-list query; unrelated records excluded; no rendering-triggered mutations.
- Full owned totals and exact Pending/Ongoing/Completed/Cancelled definitions, including additional/missing statuses retained under All; counters unaffected by filters and pagination.
- Case/whitespace-insensitive title/ID/category/type search, all filter composition, creation-date time windows and inclusive cutoffs, exclusions for future/missing timestamps, deterministic equal/missing timestamp sort, reset and query-free five-item pagination/ranges.
- Real details/edit routes and encoding, pending edit, selected/confirmed cancel only, no empty/ineligible menus, keyboard disclosure/Escape/outside dismissal, mobile navigation, actual fixture unread count, profile/verification controls and logout.
- Successful cancellation with required reason/optional details, original RPC parameters, no-reason/Escape safety, focus cycling/restoration, error/throw restoration, duplicate prevention during a filter rerender, preserved filters and retained history. A committed cancellation followed by failed refresh keeps its success acknowledgement and displays unavailable statistics; Retry refreshes without another cancellation.
- Loading, successful empty history, no filtered matches, returned/thrown fetch failures and working Retry. Statistics do not claim zero on failure.
- XSS payloads and unusual encoded IDs, long unbroken addresses, unsupported categories/statuses, missing service type/budget, malformed budget/date/time, no horizontal overflow, reasonable control targets and reduced/finite motion.
- WCAG 2 A/AA and 2.1 AA axe scans across layouts, desktop/mobile menus/reason dialogs, errors and long/malformed data. Automated scans supplement keyboard checks; they do not establish complete screen-reader conformance.

The two pre-existing functional cancellation tests were adapted only to open the new action disclosure before their existing Cancel click. No business/security assertion was removed. An initial loading assertion targeted the fieldset rather than its native disabled input; the corrected check verifies the actual control. Visual review also removed inherited list padding and placed desktop actions beside request metadata, without modifying shared CSS. A genuine refetch readiness improvement disables filters/sort during a refresh and restores keyboard focus after Retry.

Screenshots use a visible synthetic/offline label. Modal captures show the viewport so a fixed backdrop is not misrepresented as covering the entire full-page capture. Any new screenshot annotation is test-only.

## Limits

These results verify frontend behavior against synthetic contracts, not live Supabase RLS, ownership enforcement or cancellation authorization. Backend gates/RPC definitions are unchanged and remain authoritative. Real notification delivery, concurrency against real records, physical touch devices, Safari/Firefox and manual screen-reader speech have not been tested.

Client-side pagination/statistics cover the owned rows returned by the original loader. This scoped change intentionally does not alter its query contract or the existing server result limit; very large histories exceeding that limit need a separately reviewed backend-pagination approach.

No separate My Requests image was present in this turn; the detailed written reference and approved PR #17/#18 design were used. All new screens remain candidates for visual review. No deployment, merge, SQL or live data changes were performed.
