# Offline validation

Actual Chromium rendering uses synthetic intercepted backend fixtures and locally supplied Leaflet assets. Map captures use explicitly labelled synthetic tiles, not live geography. The SDK transport checks use a local fetch implementation. No live Supabase integration or SQL execution is claimed.

| Suite | Final result |
| --- | --- |
| Provider Assignments browser assertions | 310 passed |
| Assignments axe scans | 20 scans, zero violations |
| Asynchronous map/receipt/review state assertions | 19 passed |
| Actual production Start/review functions with pinned SDK | 12 cases passed, one fetch per mutation |
| Functional regressions, including messaging/payment/review workflows | 94 passed, zero failures |
| Workspace layouts | 84 passed |
| Auth | 9 role combinations and related flows passed |
| Mandatory verification | 16 direct routes and related states passed |
| Provider Incoming Requests | 348 assertions, 22 axe scans passed |
| Provider Dashboard/Calendar | 222 assertions, 13 axe scans passed |
| Client Calendar | 207 assertions, 13 axe scans passed |
| Existing Client Dashboard | 285 assertions and viewport/dialog/menu/error scans passed |
| Calendar date/time/status utilities | 47 cases passed |
| Source boundary | 383 protected files unchanged; four Auth/profile helpers retained |

Focused coverage includes authorised status/ownership filtering before Client/location projection, accurate three-status counts, local search/filter/sort, stable selection, missing dates/times/budget, long authorised safe-text descriptions, participant/identity failures, coordinate validation, one selected map and cleanup, Leaflet/tile failures, Start cancel/success/rejection/uncertain/duplicate handling, Client-only completion, encoded existing message/report routes, no payment vs failed lookup vs recorded payment, five-minute selected-only receipts, receipt errors, review validation/drafts/existing-review/duplicate safeguards, ambiguous review outcomes, stale-data refresh/locks/recovery, all requested viewports, keyboard/dialog/focus, menus and role rejection.

The 19 supplemental asynchronous checks cover map Expand/Shrink layout and ARIA, a delayed receipt response arriving after selection changes, draft/rating persistence across switching, selection during a held refresh, acknowledged Start/review followed by failed refresh, and missing optional Client verification fields. Production generation guards prevent old proof content replacing the new selection; acknowledged reviews never expose a second form after refresh failure.

Eight exact viewports: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×800. Every size has list/details/Start modal captures. Measurements record page/list/card/search/refresh bounds before adding the synthetic screenshot label. Browser assertions verify no horizontal overflow and practical 44px targets. The mobile details view compacts the hero and hides the list summary while retaining service status, Back and the next action.

`provider-assignments-retry.cjs` runs the actual production mutation functions against `@supabase/postgrest-js@2.118.0` and a local fetch for network failure, 409, 503, 504, server rejection and success. Both Start and review insert issue one POST with their original payloads; returned error/success classification is also checked. Existing Supabase client/dependency versions and global configuration are unchanged.

A contrast failure in Next Action text was fixed and both focused accessibility and the full functional suite passed afterward. Native dialog focus assertions wait for the close operation to finish before checking restoration. Review recovery refreshes the full owned review set; an additional check ensures another assignment's existing review remains visible without a duplicate form.

The original functional suite adds only `#confirmStartService` submission after opening the new Start dialog. A source check proves removing that single interaction restores the exact PR #26 file; no existing assertion was weakened. The four original Auth/profile helpers, shared receipt module, incoming page, dashboards/calendars, original related-query columns and all SQL files are protected by source checks. Other page suites ran from temporary harness copies with only evidence paths and local fixture-import locations adjusted, preserving approved evidence files.

## Reproduction

Serve `igotu_v2` on loopback. Set `UI_BASE_URL` to the local URL and `NODE_PATH` to installed Playwright/axe/esbuild dependencies.

- `node tests/provider-assignments.cjs`
- `node tests/provider-assignments-edge.cjs`
- `node tests/provider-assignments-contract.cjs`
- Obtain the test-only module `https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@2.118.0/dist/index.mjs`, then run `POSTGREST_MODULE=/absolute/path/to/index.mjs node tests/provider-assignments-retry.cjs`.
- `SYSTEM_RESULTS=work/provider-assignments/functional.json node tests/system-functional.cjs`
- `node tests/ui-smoke.cjs`
- `node tests/auth-smoke.cjs`
- `node tests/mandatory-verification.cjs`
- `CLIENT_DASHBOARD_ARTIFACTS=work/client-regression node tests/client-dashboard.cjs`
- `node tests/service-calendar-dates.cjs`
- Run `tests/provider-incoming-requests.cjs`, `tests/provider-dashboard-calendar.cjs` and `tests/client-service-calendar.cjs` with evidence paths redirected in temporary copies to preserve approved captures.

[README](README.md) records the authorised API limits and outstanding live staging acceptance. No SQL, migration, configuration, deployment or merge was performed.
