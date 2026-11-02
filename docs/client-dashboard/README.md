# Client Dashboard redesign review

Reviewed base: PR #16, `fix/admin-access-diagnostics`, commit `0ab95b0a202bb790ba1495174d07a5eead115663`. New branch: `feat/client-dashboard-experience`, stacked on that branch. This change redesigns only `client/dashboard.html`; previous PRs remain unchanged and unmerged.

The supplied Client Dashboard reference image was reviewed directly. Its forest sidebar, white topbar, wide mint welcome banner, four wave-accent statistics cards and Recent Requests/Quick Actions split guide the implementation. The code retains the established IGotU U-mark and wordmark, dynamic authorized data and all workspace gates.

Latest refinement updates the existing PR #17: one account-menu Edit Profile entry, practical Get Help FAQ, three visible requests at 480px and below, readable phone metadata and a count caption inside Recent Requests. See [the refinement review](refinement/README.md) for the approved-version comparison and latest results.

## Actual rendered screenshots

Every capture has a test-only **OFFLINE REVIEW · SYNTHETIC FIXTURES · NO LIVE SUPABASE** strip. It is added by the screenshot harness and is not application UI. The same in-memory Client/request fixtures are used for before and after. No values, names, counts or record identifiers are copied from the reference into application logic.

| View | Before | After |
| --- | --- | --- |
| Desktop 1536×864 | [Before](before/dashboard-1536.png) | [Full page](screenshots/dashboard-1536.png) |
| Mobile 390×844 | [Before](before/dashboard-390.png) | [Full page](screenshots/dashboard-390.png) |
| Desktop 1366×768 | — | [Full page](screenshots/dashboard-1366.png) / [Initial viewport](screenshots/dashboard-1366-initial.png) |
| Tablet 768px | — | [Full page](screenshots/dashboard-768.png) |
| Mobile 320px | — | [Full page](screenshots/dashboard-320.png) |
| Other requested widths | — | [1920](screenshots/dashboard-1920.png) / [1440](screenshots/dashboard-1440.png) / [1024](screenshots/dashboard-1024.png) |

Dialogs/account: [Get Help desktop](screenshots/get-help-desktop.png) · [Get Help mobile](screenshots/get-help-390.png) · [Account dropdown](screenshots/account-dropdown-desktop.png) · [Phone account dropdown](screenshots/account-dropdown-390.png).

States: [Loading](screenshots/loading.png) · [Empty](screenshots/empty.png) · [Initial read error](screenshots/error.png) · [Failed refresh retaining labelled last-known data](screenshots/refresh-error-retained-data.png) · [How It Works](screenshots/workflow-help.png) · [Long content/XSS strings at 320px](screenshots/long-content-320.png).

## Comparison with the reference

| Reference feature | Implemented behavior |
| --- | --- |
| Forest sidebar with organic lower shapes | 248px desktop sidebar, light active Dashboard link, consistent local SVG icons and a balanced decorative lower area. Edit Profile is available only in the account dropdown. Forest color continues through the full page; the sidebar remains usable while scrolling. |
| Reference handshake branding | Existing official `assets/igotu-mark.svg` and IGotU wordmark retained. No replacement logo. |
| White topbar, notifications and account | Client Workspace label, existing bell/count/dropdown, authenticated name/role/code/avatar and existing profile/logout/identity-verification actions. Compact phone header uses the avatar with a descriptive accessible account-menu label; full name remains in the hero. |
| Large generic search field | Omitted rather than implementing decorative/global search or another data read. View All and refresh remain useful controls. No unsupported message-count badge was copied. |
| Greeting and illustrated banner | Full authenticated Client name, truthful matching description, existing Create Request route, real workflow dialog and original efficient local person/phone SVG. Artwork is decorative and hidden on narrow phones so it cannot push the primary action down. |
| Four statistics with colored icons/waves | Same pending/ongoing/completed rules and actual owned response data. CSS waves carry no data meaning. Example reference numbers are never hardcoded. |
| Recent Requests beside Quick Actions | Five newest requests on desktop/larger tablets and three on phones at 480px or below, encoded existing details URLs, escaped title/ID/category/location, optional preferred date/time/budget, current status, plus three existing route links and a working Get Help FAQ button. |
| Roomy desktop composition | Four statistics and two main panels at 1366px and wider; two statistics per row and stacked panels at tablet/narrow desktop widths. |
| Comfortable mobile content | Existing in-flow collapsible menu; hero/action → statistics → recent requests → Quick Actions. No overlay drawer was introduced. |

The reference's phrase about verified Providers is deliberately replaced with the requested truthful matching copy. It makes no claim that every recommendation is currently verified or available. Only the six statuses in this branch's `request_status` enum are styled: pending, provider_selected, confirmed, in_progress, completed and cancelled. Decline is not invented as a new request status. Unexpected statuses receive a neutral “Status unavailable” label.

The new illustration is original project-local SVG artwork inspired by the reference's person/phone/green-hills composition. It contains no real user data, fabricated verification badge or externally loaded font/image. The official logo asset itself is unchanged. Explicit dimensions reserve image space.

## Data and authorization preserved

`client.js` still waits for `authorizeWorkspace()`, obtains the current session and database profile, and retains its existing Client role, active status and completed-profile checks. Profile/account data does not come from the reference, an email allowlist or editable metadata. Shared authentication, identity approval, backend contract, RLS and guards are unchanged.

The request read uses the **same** existing table, projection, ownership filter and descending creation order:

```js
supabase.from("service_requests").select("*")
  .eq("client_id", userId).order("created_at", { ascending: false });
```

No broad search, Provider listing, new backend endpoint or schema change is added. Statistics still count all requests returned by that owned read: pending exactly `pending`; ongoing exactly `provider_selected`, `confirmed`, `in_progress`; completed exactly `completed`. Cancelled records still contribute to the total, so the displayed categories need not sum to it. At most five cards are rendered from that response; CSS removes cards four/five from display and the accessibility tree at 480px and below. The cached data and all statistics remain intact. A matchMedia listener updates only the caption and, when necessary, moves focus from a newly hidden card to View All; resizing makes no backend request.

The local synthetic fixture includes an unrelated Client's future-dated request. Tests prove it is excluded by the ownership-filtered read and never rendered. This verifies frontend query construction and fixture behavior; it is not a live RLS proof.

All dynamic HTML is escaped; request IDs preserve `encodeURIComponent` followed by attribute escaping. The full-name greeting and account label use DOM text/attribute setters. Status classes and icon names are fixed allowlists. Missing optional values are omitted, invalid dates/times/budgets are not invented, zero budget is a valid value, and unknown status text cannot inject markup. Preferred date labels do not imply that a Provider has confirmed the service.

## Loading, retry and interactions

- Initial statistics use em dashes and an actual loading message. Both the statistics and request regions reflect request activity with `aria-busy`.
- Initial read errors show generic guidance and a working Try again button, never fictional zeroes or backend error payloads. Thrown transport failures are handled too.
- Refresh uses the same owned read and disables duplicate reads while pending. No automatic retry/polling for requests is introduced. Existing notification polling is unchanged.
- A failed refresh retains the last successful in-memory statistics/cards and explicitly labels them stale. No data is written back or persisted. A successful retry replaces the view with the new actual response.
- No requests produces “No service requests yet” with the existing Create Request route. No sample records fill an empty account.
- How It Works is an authorized-page native modal, not a dead button. It explains request → eligible recommendations → selection → Provider confirmation/decline → tracking/offline payment/review. Selection is explicitly not confirmation. The modal has labelled heading, initial Close focus, forward/backward focus containment, Escape/Close and opener restoration. Its button stays hidden until its handler and native dialog support are ready.
- Get Help is a separate practical FAQ dialog with seven native disclosures, existing Client routes, truthful selection/availability/offline-payment guidance, Close/Escape and focus restoration. Shared dialog keyboard handling excludes links inside collapsed disclosures. Edit Profile has one entry point in the original account dropdown.
- Notification badge/dropdown, mark-one/mark-all, profile menu, identity-verification link and logout use the original scripts unchanged. Scoped text colors improve notification contrast on this dashboard only. Existing writes from mark-as-read/logout are exercised only against in-memory fixtures during tests; no live notification/account data changes occurred.

## Motion and responsive findings

420ms finite transform/opacity entrances use 70ms staggering capped at 210ms and start only after successful workspace authorization. Focus interrupts entrances. Hover effects take 220ms: statistics lift 3px, request cards lift 2px, arrows move subtly. No fake count-up, artificial update animation, looping decoration, video or animation library is used. Reduced motion disables entrances and hover movement, including a runtime preference change. Broken optional artwork leaves the primary action usable; a blocked optional shell script leaves native navigation visible.

All eight requested viewports pass horizontal-overflow and control-bound checks. At 1366×768 the primary Create action ends around 338px, the two lower panels start around 554px, and the rest of five real request cards requires scrolling. At 390px the Create action ends around 397px; at 320px around 420px. These are application measurements **before** the screenshot-only fixture strip. The strip adds roughly 31px to captured content positions (about 47px at 320px, where its label wraps). Three readable cards make the full mobile page scrollable; there is no attempt to squeeze all requests into one screen.

At 1024px and below, main panels stack; at 1000px and below, the original shell toggle collapses the in-flow sidebar navigation. Edit Profile is kept in the account dropdown rather than duplicated in navigation or Quick Actions. Current phone typography/controls remain legible, with touch controls at least 44px. Very long names, unbroken titles and locations wrap without horizontal scrolling.

[Computed measurements](responsive-metrics.json) record all viewport sizes, hero/action/statistics/panel positions and page dimensions. [Validation](validation.json) and [raw results](results/) give executed checks.

## Changed files and protected scope

Application:

- `igotu_v2/client/dashboard.html`
- `igotu_v2/js/client.js` (used only by this dashboard)
- New `igotu_v2/css/client-dashboard.css`
- New `igotu_v2/assets/client-dashboard/welcome.svg`

Tests: new `tests/client-dashboard.cjs`. Review documents, screenshots and results live here. No shared stylesheet or shared shell/menu/notification/Auth script changes. Create Request, My Requests, Messages, Edit Profile, verification, Provider and Admin pages are unchanged. All SQL/configuration and previously reviewed security/UI progress remain untouched; see [protected-file proof](protected-files.json).

Testing initially caught a whitespace-sensitive text assertion, a native-dialog Tab edge case and insufficient contrast in inherited notification styles. The assertion now tolerates HTML formatting; the dialog explicitly contains keyboard focus and only this dashboard's notification colors are corrected. No security assertion was removed and no live backend result was substituted.

## Repeat local synthetic verification

Install only the existing test dependencies and start a local static server:

```sh
npm ci --prefix tests
python -m http.server 4202 --bind 127.0.0.1 --directory igotu_v2
```

Then, from the repository root in another terminal (Chromium required):

```sh
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4202
node tests/client-dashboard.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
node tests/system-functional.cjs
```

The focused test requires loopback, serves the existing synthetic SDK inside its browser contexts, blocks external requests and adds an offline capture label. Do not open the source dashboard in an uninstrumented browser as an offline demo: its unchanged configuration targets production. These fixture tests do not establish live Supabase integration, actor-level RLS, production readiness or real delivery. No live project was connected, no real/staging account or data was changed, no SQL executed and nothing was deployed or merged.

Safari/Firefox, physical devices and a full manual screen-reader audit remain unverified. Exact pixel identity is not claimed: branding, truthful data, working controls, accessibility and responsive behavior take precedence over copying decorative/example content from the supplied image.
