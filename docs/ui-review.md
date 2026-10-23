# UI polish review

This branch starts at `e5f9d898b1e5d1226677c9238b111ebbe06a781d` on `igotu-security-hardening`.

The shared `igotu_v2/css/ui.css` layer defines colors, spacing, typography, cards, buttons, focus states and responsive layouts. It loads after the existing styles, including messaging styles. Each workspace has a mobile Menu disclosure with an accessible name, expanded state, Escape handling and focus recovery on resize. Navigation remains visible if its script cannot load. The skip link moves keyboard users to the main content.

Dashboards show an em dash until data loads, distinguish query failure from empty results, and provide next actions. Provider service management is linked from the dashboard. Recommended Provider cards use a clearer identity/action row and a responsive information grid. Search, filter, map-search and message inputs have accessible names. Existing escaping, data queries, role checks, notification writes and provider selection remain in place. No SQL, security-stage, matching or deployment changes are included.

## Local verification

No package/build/test configuration exists in the original repository. JavaScript syntax and whitespace were checked directly. The added browser smoke test requires Node.js, Playwright and Chromium:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory igotu_v2
# In another terminal, with Playwright available to Node:
UI_SCREENSHOTS=work/screenshots node tests/ui-smoke.cjs
```

Set `CHROMIUM_PATH` if Chromium is not `/usr/bin/chromium`, and `UI_BASE_URL` if using a different local port. `NODE_PATH` can point to an existing Playwright installation.

The smoke test replaces `supabaseClient.js` with an in-memory fixture and aborts external requests. It checks all 23 workspace pages at 1440, 768, 390 and 320 pixels for horizontal overflow and navigation behavior. It executes real dashboard and recommendation rendering, search/reset, the selection RPC wiring (fixture rejects the write), and dashboard empty/error states. It also checks Escape focus, desktop-to-mobile resize focus recovery and navigation without the shell script.

Other service, map, messaging and Admin pages receive layout checks with their data scripts suppressed. Authenticated live workflows, maps, notifications and writes were not integration-tested. No live Supabase requests or SQL were executed. Screenshots show synthetic fixture data, not live users.

## Screenshots

Desktop and mobile captures are in [ui-preview](ui-preview/). The mobile Menu focus outline in captures is intentional: it shows keyboard focus after closing navigation with Escape.
