# Offline validation

Actual Chromium uses stateful intercepted synthetic transport. The pinned SDK transport test uses a local fetch. No live Supabase, RLS, delivery or database-configuration validation is claimed.

| Check | Final result |
| --- | --- |
| Provider Messages browser assertions | 360 passed |
| Provider Messages axe scans | 20, zero violations |
| Async unread/draft/IME/long-list assertions | 14 passed |
| Actual production writes + pinned PostgREST SDK | 13 transport cases passed |
| Full functional suite | 94 passed, zero failed |
| Workspace layouts | 84 passed |
| Auth | 9 role combinations and related flows passed |
| Mandatory verification | 16 direct routes and related flows passed |
| Approved Client Messages | 418 assertions, 21 axe scans passed |
| Provider Incoming Requests | 348 assertions, 22 axe scans passed |
| Provider Assignments | 310 assertions, 20 axe scans passed |
| Provider Dashboard/Calendar | 222 assertions, 13 axe scans passed |
| Client Calendar | 207 assertions, 13 axe scans passed |
| Client Dashboard | 285 assertions and viewport/dialog/menu/error checks passed |
| Shared date utilities | 47 cases passed |
| Source boundaries | 534 protected files and six original Auth/identifier helpers preserved |

Focused coverage includes assigned eligible requests, request/Client/role matching, scoped overview and paginated history, no former/unrelated participant data or read updates, previews/order/unread indicators, search/filters, invalid deep links, Back/Forward, unavailable participants/history/metadata, stale refresh recovery, 1,000-character raw counter, restored/cleared/recovered drafts, empty/whitespace/over-limit validation, Shift+Enter/Enter, IME, captured sender/receiver/request, duplicate prevention, known failures, lost responses with/without persistence, original identifier reuse, optimistic/acknowledged states, pending sends during selection, newer drafts, visibility/BFCache cleanup, no overlapping slow polls, long histories and reader-controlled Latest Messages.

Supplemental asynchronous checks prove that a delayed read acknowledgement clears only its own known incoming IDs while leaving the new selected history intact; an acknowledged send keeps a newer draft/counter; IME Enter never sends; textarea growth is bounded; and a 40-conversation list scrolls without moving the page/composer or issuing one metadata query per card.

## Responsive measurements

Bounds are measured before adding the offline screenshot label. Ordinary desktop/tablet/phone captures and checks use the eight requested dimensions. Extra 390×430 and 320×600 cases cover short/zoom-equivalent views. Short screens can scroll externally; a separate focused-input viewport-resize test checks Send is on screen without a fixed overlay.

| Viewport | Composer bottom before focus scrolling | Send height | Page width |
| --- | --- | --- | --- |
| 1920×1080 | 1061.0px | 65.0px | 1920px |
| 1536×864 | 845.0px | 65.0px | 1536px |
| 1440×900 | 881.0px | 65.0px | 1440px |
| 1366×768 | 753.0px | 65.0px | 1366px |
| 1024×768 | 753.0px | 65.0px | 1024px |
| 768×1024 | 1005.0px | 65.0px | 768px |
| 390×844 | 818.5px | 75.0px | 390px |
| 320×800 | 775.2px | 75.0px | 320px |
| 390×430 | 544.5px | 55.0px | 390px |
| 320×600 | 660.2px | 75.0px | 320px |

Main message text remains 14px on desktop and phone. The 1366×768 composer bottom is 753px. The short-height screenshot shows the focused in-flow composer after visual-viewport resize. All cases assert no horizontal overflow; desktop conversation/history scroll regions are independent. Reduced motion is supported through page-scoped styles.

## Sending and regression evidence

`provider-messages-retry.cjs` executes the actual production insert/read-update code with `@supabase/postgrest-js@2.118.0`. Network failure, 409, 503, 504, explicit rejection and success each issue one POST/PATCH, with original payloads and read-update predicates checked. An extra explicit retry case proves the entire original message payload/identifiers remain unchanged. Global SDK configuration and dependencies are unchanged.

The existing functional suite has four completion waits adjusted for Provider Messages' required empty-Send-disabled behavior. Provider waits observe the real send lifecycle; Client waits keep the previous condition. A source check proves reversing only those four wait expressions restores the exact PR #27 file. All original assertions are intact. One parallel run exposed the existing recommendation test's short timing wait under heavy browser contention; the complete suite rerun alone passed 94/94, with no changes to that page or assertion.

Approved browser suites were run from temporary copies with only artifact-output paths and fixture-import locations redirected to ignored work directories, preserving original tests and approved captures. Historical source snapshots that predate later approved PRs are not treated as current repository baselines; the new PR #27 boundary check proves all Client Messages and other existing implementation/evidence files are unchanged.

## Reproduction

Serve `igotu_v2` on loopback and set `UI_BASE_URL`. Set `NODE_PATH` to installed Playwright/axe/esbuild dependencies.

- `node tests/provider-messages.cjs`
- `node tests/provider-messages-edge.cjs`
- `node tests/provider-messages-contract.cjs`
- Obtain the test-only pinned module `https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@2.118.0/dist/index.mjs`, then run `POSTGREST_MODULE=/absolute/path/to/index.mjs node tests/provider-messages-retry.cjs`.
- `SYSTEM_RESULTS=work/provider-messages/functional-final.json node tests/system-functional.cjs` (run the full suite without competing browser jobs if the existing short recommendation timing check flakes).
- `node tests/ui-smoke.cjs`, `node tests/auth-smoke.cjs`, `node tests/mandatory-verification.cjs`.
- `CLIENT_DASHBOARD_ARTIFACTS=work/client-regression node tests/client-dashboard.cjs` and `node tests/service-calendar-dates.cjs`.
- Run `tests/client-messages-preview.cjs`, `tests/provider-incoming-requests.cjs`, `tests/provider-assignments.cjs`, `tests/provider-dashboard-calendar.cjs` and `tests/client-service-calendar.cjs` with evidence paths redirected in temporary harness copies.

[README](README.md) lists remaining backend/navigation limits and live staging acceptance. No SQL, deployment, staging/production modification or merge was performed.
