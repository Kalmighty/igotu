# Offline validation

Final checks use actual Chromium with synthetic intercepted backend fixtures, plus a local fetch implementation for the pinned SDK. No live Supabase requests or SQL were executed.

| Suite | Final result |
| --- | --- |
| Incoming Requests browser assertions | 348 passed |
| Incoming Requests axe scans | 22 scans, zero violations |
| Actual page mutation block + pinned PostgREST SDK | 12 transport cases passed; one fetch per mutation |
| Functional regression, including Provider workflows | 94 passed, zero failures |
| Workspace layouts | 84 passed |
| Auth | 9 role-match combinations and related flows passed |
| Mandatory verification | 16 direct routes and related states passed |
| Existing Client Dashboard | 285 assertions passed |
| Provider Dashboard / Calendar | 222 assertions, 13 axe scans passed |
| Client Calendar | 207 assertions, 13 axe scans passed |
| Calendar date/time/status utilities | 47 cases passed |
| Source-boundary contract | 308 protected files unchanged; four Auth/profile helpers preserved |

Focused coverage includes all required viewport sizes, real owned/assigned list reads, scoped participants, safe DOM text, no exact-location/description/image leakage (even when an intentionally over-broad synthetic response includes them), no URL-ID authority, one/multiple/empty requests, search/clear/no matches, all four sort modes, invalid dates/times/budget, persistent selection, selected item outside search, removed requests, mobile list/details/back, keyboard selection, dialog Escape/cancel/trapping/focus restoration, required decline reason, known failures, acknowledged success, uncertain responses with/without committed state, unavailable status reads, duplicate-click/refresh locks, stale refresh recovery, menus and role rejection.

All eight sizes have list/details and both dialog captures. `responsive-metrics.json` records page/list/card/search/refresh bounds; assertions check no horizontal overflow and practical 44px targets. Full-page captures reset scroll before capture so offscreen fixed skip links do not appear as screenshot artefacts. No identity documents or real private account records were captured.

`provider-incoming-retry.cjs` evaluates the actual production call block against `@supabase/postgrest-js@2.118.0` with a local fetch, for Confirm and Decline under success, server rejection, network failure, 409, 503 and 504. Every case verifies exactly one fetch, correct POST arguments and returned success/error classification. Browser fixtures also verify `.retry(false)` is called. The current Supabase documentation was consulted for RPC errors/retries; the changelog-index fetch was denied by environment HTTP policy. No backend/API signatures or dependency versions changed.

The original functional test now clicks `#submitIncomingConfirm` after opening the new modal. A source check proves removing that single interaction restores the exact PR #25 test file, including every original assertion. Provider/Client calendar suites were run from temporary copies with only their evidence-output path and fixture-import location adjusted, preserving the original tracked tests and approved screenshots.

During review, refresh controls were fixed to reflect their disabled state, the native Confirm dialog received explicit Tab wrapping, and the role-redirect test was changed to observe the committed pathname rather than racing duplicate guard navigations. Final focused validation was rerun after these fixes. The before-image fixture now represents the existing backend's redacted description/image response.

## Reproduction

Serve `igotu_v2` locally and set `UI_BASE_URL` accordingly. Set `NODE_PATH` to installed Playwright/axe/esbuild dependencies.

- `node tests/provider-incoming-requests.cjs`
- `node tests/provider-incoming-contract.cjs`
- Download the pinned SDK module from `https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@2.118.0/dist/index.mjs` into a local test-only file, then run `POSTGREST_MODULE=/absolute/path/to/index.mjs node tests/provider-incoming-retry.cjs`.
- `SYSTEM_RESULTS=docs/provider-incoming-requests/validation/functional.json node tests/system-functional.cjs`
- `node tests/ui-smoke.cjs`
- `node tests/auth-smoke.cjs`
- `node tests/mandatory-verification.cjs`
- `CLIENT_DASHBOARD_ARTIFACTS=work/client-regression node tests/client-dashboard.cjs`
- `node tests/service-calendar-dates.cjs`
- Run `tests/provider-dashboard-calendar.cjs` and `tests/client-service-calendar.cjs` with artifact-output paths redirected in temporary harness copies to preserve approved evidence.

See [README](README.md) for backend limitations and outstanding live staging checks. No merge/deployment is authorised or performed.
