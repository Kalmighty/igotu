# Offline validation

All results use local Chromium and synthetic intercepted backend fixtures. No live Supabase integration was exercised.

| Check | Result |
| --- | --- |
| Focused Provider/calendar browser assertions | 222 passed |
| axe accessibility scans | 13 scans, zero violations |
| Date/time/status unit cases | 47 passed |
| Functional regression (includes Provider workflows) | 94 passed, 0 failed |
| Responsive workspace layouts | 84 passed |
| Auth role combinations | 9 passed |
| Mandatory verification direct routes | 16 passed |
| Existing Client Dashboard assertions | 285 passed |
| Protected application/test/SQL source contracts | 220 unchanged files passed |

Focused coverage includes authorised-only data, coarse location, correct stats/rating, tentative vs active/history status, chronological ordering, multiple events, invalid dates/times, month/week and year boundaries, keyboard/focus, empty/loading/error/stale refresh, refresh locking, review failures, real workflow links, safe text rendering and role redirects. Pure date cases cover leap years and Malaysia dates independent of browser timezone.

Eight viewport sizes: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 and 320×800. Month/week bounds are recorded in `responsive-metrics.json`. Before captures use exact PR #23 sources.

The layout harness previously replaced unknown modules with empty stubs; adding `service-calendar.js` to its real-module allowlist enables testing the new component. Assertions remain intact. Final regression results were rerun after fixing initial-render timing and a formatter-cache variable declaration.

Reproduce with `NODE_PATH` pointing to installed Playwright/axe dependencies and `UI_BASE_URL` to a local static server serving `igotu_v2`: run `tests/provider-dashboard-calendar.cjs`, `tests/service-calendar-dates.cjs`, `tests/provider-calendar-contract.cjs`, `tests/system-functional.cjs`, `tests/auth-smoke.cjs`, `tests/mandatory-verification.cjs`, `tests/ui-smoke.cjs` and `tests/client-dashboard.cjs`. Use `CLIENT_DASHBOARD_ARTIFACTS=work/client-regression` to preserve approved Client evidence.
