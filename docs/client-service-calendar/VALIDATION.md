# Offline validation

All browser tests use actual local Chromium rendering with synthetic intercepted backend fixtures. No live Supabase integration or database authorisation proof is claimed.

| Check | Final result |
| --- | --- |
| Focused Client/calendar browser assertions | 207 passed |
| Focused axe scans | 13 scans, zero violations |
| Existing Client Dashboard suite | 285 assertions passed; 8 viewport scans plus dialog/menu/error checks |
| Existing functional regressions, including Provider workflows | 94 passed, 0 failed |
| Existing layout suite | 84 layouts passed |
| Auth suite | 9 role-match combinations and related flows passed |
| Mandatory identity verification | 16 direct routes and verification flows passed |
| Shared date/time/status unit cases | 47 passed |
| Phase B source contract | 268 protected files unchanged |

Focused browser coverage: one owned Client query, no Provider request RPC, no calendar mutations, foreign-owner exclusion, safe text, encoded request-ID links to the existing details route, all six status labels, invalid date/time, multiple events, selected-day filtering, upcoming ordering, historical completed/cancelled exclusion, month/week navigation, Today and keyboard, Malaysia Today in a US browser timezone, empty/initial-error/loading/stale refresh/recovery, refresh locking, profile and notification menus, role redirects, mobile bounds, touch targets and reduced motion.

Eight exact viewports: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×800. Both month/week were rendered and captured at every width. `responsive-metrics.json` records page/calendar/toolbar/date/refresh bounds. Images carry an offline synthetic-data label; measurements precede the label insertion. Before images serve exact Phase A Client sources from Git.

The source contract proves the original Client request loader is unchanged after removing the three calendar lifecycle calls, including its query, counters, cache, error/retry and refresh lock. Original display/render/menu/dialog helpers and approved HTML remain intact apart from the calendar stylesheet/host. All Provider implementation, shared calendar, existing tests and SQL are byte-identical to Phase A. Existing assertions were not weakened.

An added encoded-ID check initially selected the first event in the whole month (a historical event), rather than its pending test event. Its selector was corrected to identify the intended record; the complete focused suite was rerun.

## Reproduction

Serve `igotu_v2` locally, install Playwright/axe/esbuild dependencies, set `NODE_PATH` accordingly and set `UI_BASE_URL` to the local server. Run:

- `node tests/client-service-calendar.cjs`
- `node tests/client-calendar-contract.cjs`
- `node tests/service-calendar-dates.cjs`
- `SYSTEM_RESULTS=docs/client-service-calendar/validation/functional.json node tests/system-functional.cjs`
- `node tests/auth-smoke.cjs`
- `node tests/mandatory-verification.cjs`
- `node tests/ui-smoke.cjs`
- `CLIENT_DASHBOARD_ARTIFACTS=work/client-regression node tests/client-dashboard.cjs`

Phase A's independent 222 focused assertions, 13 axe scans and Provider privacy/rating tests are retained in `../provider-dashboard/`. PRs #17–#23 remain open Drafts, unmerged and at their original heads; see `validation/existing-pr-heads.json`.

Outstanding staging checks and backend limitations are listed in [README](README.md). No live SQL, migrations, configuration changes, deployment or merge occurred.
