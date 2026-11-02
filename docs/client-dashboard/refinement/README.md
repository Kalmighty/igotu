# PR #17 final dashboard refinement

Branch remains `feat/client-dashboard-experience`. This updates the existing draft PR, based on its previously reviewed commit `ea01e030bd4f9f060e9b9f71a095c540c2e925e2`. No new PR, other-page redesign or backend operation is part of this refinement.

The latest message supplied precise written changes but no additional revised image. The previously supplied reference and approved overall composition are preserved; no comparison against an unseen revised image is claimed.

## Focused changes

- Remove Edit Profile from the sidebar and Quick Actions. Preserve the single existing account-dropdown link, identity-verification link and logout. The existing forest sidebar, icons and lower decorative hills remain.
- Keep exactly four Quick Actions: Create a Service Request, View My Requests, Open Messages, and Get Help. The fourth is a real button, not a link to a missing Help page or invented support address.
- Add the “How can we help?” dialog with seven practical native FAQ disclosures. They cover creation, eligible recommendations, Provider confirmation/decline, tracking, Messages, offline payment recording/reviews and identity status. Links point only to existing Client pages. No support-ticket API or account lookup is added.
- Reuse the existing native-dialog helper for How It Works and the new FAQ. Both have initial focus, Close/Escape, forward/backward cycling and opener restoration. Collapsed FAQ answers' links are excluded from the focus loop; Chromium can report rectangles for those hidden links, so rectangle checks alone are insufficient.
- At 480px and below, show three recent cards. Larger views show five. The five cached cards and full authorized response remain in memory/DOM; CSS `display:none` removes the two overflow cards from display, keyboard navigation and the accessibility tree. View All still opens My Requests.
- Resize updates the caption from the existing data only. Tests cross the exact 480/481px boundary and multiple phone/tablet/desktop sizes, retain the full total of eight fixture requests and prove exactly one initial request query. No duplicate cards or new backend queries are caused by responsive changes. If a focused fourth/fifth card becomes hidden, focus moves to View All.
- Move `#dashboardDataStatus` into the Recent Requests heading. It reflects the number currently visible and retains loading/empty/error/stale-data guidance without falsely claiming a count during a failed/pending read.
- Raise phone request ID, category/date/time/budget chips, location and status text to 13px, keeping natural wrapping and existing colors/escaping/optional fields/navigation. Preserve the four statistics and their original full-dataset status rules.

The official logo, illustration, hero, How It Works content, finite animations, statistics design, existing notification/profile scripts, refresh/retry, query ownership filter, role/active/identity/profile/backend gates and other pages are unchanged in purpose and behavior. There is no request-data write, deletion, truncation in Supabase or altered recommendation algorithm.

## Actual before/after captures

These are real Chromium captures with synthetic fixtures. Offline labels are inserted only by the screenshot test; application HTML/JS contains no such banner. Modal captures put the test-only label inside the captured dialog and use the viewport so offscreen fixed elements do not distort a full-page capture.

| View | Approved before | Refined after |
| --- | --- | --- |
| 1536px desktop | [Before](before/dashboard-1536.png) | [After](../screenshots/dashboard-1536.png) |
| 390px phone | [Before](before/dashboard-390.png) | [After](../screenshots/dashboard-390.png) |
| 320px phone | [Before](before/dashboard-320.png) | [After](../screenshots/dashboard-320.png) |

[Get Help desktop](../screenshots/get-help-desktop.png) · [390px Help](../screenshots/get-help-390.png) · [320px Help](../screenshots/get-help-320.png)

[Account dropdown with Edit Profile](../screenshots/account-dropdown-desktop.png) · [Phone account dropdown](../screenshots/account-dropdown-390.png)

[Loading](../screenshots/loading.png) · [Empty](../screenshots/empty.png) · [Read error](../screenshots/error.png) · [Retained data after failed refresh](../screenshots/refresh-error-retained-data.png)

With the same eight-own-request fixture, measured phone page height falls from 2477→2095px at 390px and 2611→2297px at 320px. Larger metadata uses some of the space saved by the three-card limit; readability takes precedence over squeezing. Desktop remains five cards. [Comparison measurements](comparison.json) exclude the screenshot label.

## Verification and boundaries

See [validation](validation.json) and [raw results](results/) for the final executed checks. The focused suite covers the seven questions, real links, all four actions, one Edit Profile entry, desktop/mobile dropdowns, keyboard expansion/cycling/Escape/Close, accessible visible-card counts, exact breakpoint resizing without extra queries, full statistics, readable metadata, existing loading/error/empty/retry, menus/logout, XSS and all guards. Original How It Works still has separate coverage.

Testing initially started before the local server was listening; after starting the server, the first full focused run passed. A stronger backward-cycle check then exposed the collapsed-link focus issue described above; it was fixed and the full focused suite rerun. No security check or assertion was removed to obtain a pass.

Application changes are limited to dashboard HTML, its scoped stylesheet and `client.js`. Tests and existing PR #17 documentation/screenshots are updated. [Protected-file evidence](protected-files.json) checks shared Auth/guards, menus, shell, styles, configuration, all SQL and the unchanged illustration/logo. The original owned query and status counting rules are unchanged.

No live staging/production connection or data mutation occurred. No SQL, schema/RLS/RPC/Auth settings, deployment or merge. Synthetic browser authorization is not proof of live RLS or backend integration. Physical devices, Safari/Firefox and a full manual screen-reader review remain unverified. Repeatable local commands are in the parent review README.
