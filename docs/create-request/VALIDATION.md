# Offline validation — Create / Edit Service Request

Date: 2026-11-02. Base: PR #17 at `5103c13c29ffd2989553c52cec3a10be11e05f04`.

All browser evidence uses headless Chromium, Playwright and local in-memory Supabase fixtures. The real page/core modules and real Leaflet run locally; map assets, tiles, geocoding, GPS and navigation destinations are intercepted. No real Supabase, authentication, Storage, geocoding or image downloads were performed. Browser fixture writes are in-memory only.

| Check | Result | Evidence |
| --- | --- | --- |
| Create/Edit focused regression | PASS, 189 assertions | [Focused output](validation/focused.txt), `tests/create-request-preview.cjs` |
| Responsive layouts | PASS, all eight required widths, zero horizontal overflow | [Measurements](responsive-metrics.json), [screenshots](README.md#visual-evidence) |
| Focused accessibility | PASS, zero WCAG 2 A/AA / 2.1 AA axe violations in eight layouts, mobile image preview and Cancel dialog | Focused output/test source |
| Authentication regression | PASS, including all nine role combinations, keyboard and validation | [Output](validation/auth.txt) |
| Mandatory identity verification | PASS, including 16 guarded workspace routes and inactive/unapproved states | [Output](validation/identity-verification.txt) |
| Existing layout suite | PASS, 84 page/viewport combinations | [Output](validation/layout.txt) |
| Existing functional suite | PASS, 94 passed, zero failed | [Per-case results](validation/functional.json), [output](validation/functional.txt) |
| Critical source contract | PASS, 13 byte-identical business functions, exact service types, 11 untouched shared files | [Contract hashes](validation/contract.json), [output](validation/contract.txt) |
| HTML and syntax | PASS: unique IDs, label targets; core and optional UI parse; formatted page/scoped CSS/UI/test files | Source contract, HTMLParser and Prettier checks |
| Scope, whitespace and credential review | PASS: no SQL/config/Auth/shared-style/dashboard changes, no newly added secrets; git diff --check | Final staged review |

## Coverage

The focused suite covers blank form/default location, all supported categories and exact dependent types, type reset, native required-field feedback, a description longer than 500 characters, actual create RPC payload and recommendation redirect, optional budget/priority, single JPEG/PNG/WebP acceptance, invalid MIME/over-5-MiB rejection, keyboard native chooser, preview/remove, mobile preview, stored-image edit preview/replacement removal, safe-URL rejection, and no preview-induced Storage writes/deletes.

Location checks exercise real Leaflet clicks and pointer-drag events, Search, mock GPS success/permission denial/unavailable/timeout/low accuracy, no-map behavior, missing/invalid/search-transport responses, missing/failed reverse lookup, obsolete reverse responses, manual-address invalidation, non-finite/out-of-range coordinate rejection, null saved coordinates, restored owned locations, field guidance clearing, and map invalidation after responsive resize.

Creation/edit checks cover slow-save disabled state, duplicate-submit prevention, uncertain failure/key reuse, image failure after committed creation, retry without a second create, original association RPC, owned pending edit, separate edit redirect, foreign/completed/missing request rejection, clean/dirty Cancel, Escape/focus restoration, notification/profile controls, no optional UI script, finite entrances and reduced motion. Existing role and full functional suites provide additional regression coverage.

Native controls and main actions measure at least 44px in the focused layouts. Map dimensions range from 250×300px at 320px to about 980×320px at 1920px. The selection fallback label uses five decimal places for readability while submitted coordinates retain the existing seven-decimal precision. Date/time values and timezone semantics are unchanged.

## Issues found and corrected

- Inherited shared upload styles overrode the new preview's hidden state and absolutely positioned upload text. Scoped overrides now respect hidden state and use the new flexible upload layout.
- Hiding the selected-file upload label removed the native file control's accessible name. A stable explicit accessible name and preview focus outline preserve keyboard access in both states.
- A whole-section opacity entrance temporarily reduced text contrast in the first full functional run (93 passed, one failed). Form sections now move subtly at full text opacity; reduced motion still removes the entrance. The real-page accessibility regression passes after correction.
- Selecting a location programmatically left an earlier required-field message visible. The selected-address change notification now refreshes native-validity guidance; a focused assertion covers it.

Harness-only corrections: ignore formatting whitespace in the submit label, terminate the minified Leaflet source-map comment before test instrumentation, drive a real pointer drag, use the native Space key to open the file chooser, serve Leaflet marker assets locally, and allow Leaflet's finite zoom to settle before captures. No security or business assertions were removed to make tests pass.

## Remaining verification limits

These results demonstrate frontend behavior against controlled fixtures, not live RLS/RPC/Storage policy enforcement. Production and staging were not accessed. The existing legacy public-image association contract is unchanged; the private-request-images security candidate is separate. Real GPS accuracy, external geocoder/tile availability, actual upload permissions, live notification delivery, physical mobile file pickers, Safari/Firefox and full manual screen-reader speech remain unverified. Any future live validation requires its own authorization. No merge or deployment is included.
