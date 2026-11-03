# Client Service Calendar — Phase B

Adds the shared read-only Service Calendar below the approved Client Dashboard panels. The existing hero, four statistics, recent requests, quick actions, Help dialogs, notifications, profile menu, media and responsive styling are preserved. Production changes are limited to the Client HTML stylesheet/section additions and calendar integration in `client.js`. Provider and shared calendar implementation files are byte-identical to Phase A.

## Functionality and authorised data

Month/week views, Previous/Next/Today, selected-date highlighting, keyboard navigation, status legend, all selected-day requests, upcoming services and invalid-date disclosure reuse the Phase A component. Phone month cells show counts; selecting a date reveals every request without horizontal scrolling. Preferred dates/times retain Malaysian local meaning and Today uses Asia/Kuala_Lumpur.

The existing `service_requests.select("*").eq("client_id", userId).order("created_at", {ascending:false})` read supplies both dashboard and calendar. There is no second calendar query. Calendar projection defensively checks ownership and copies only ID, title, category, preferred date/time, status and the encoded existing `request-details.html?request_id=...` destination. Native event links and selected-day links open that route. Event IDs do not grant access: the existing details-page ownership gates and server policies remain authoritative.

Pending is labelled “not confirmed”; Provider selected is awaiting confirmation. Completed/cancelled items remain history and never upcoming. Missing/invalid dates receive no invented placement. Upcoming lists the first five relevant requests from today onward, ordered by preferred date/time, including clearly labelled unconfirmed requests. Refresh shares the existing request lock and preserves a labelled last-good calendar on failure.

## Review captures

Every image is an actual Chromium capture labelled as synthetic offline review; no live Supabase traffic was used.

- Before: [desktop](before/dashboard-1536.png), [mobile](before/dashboard-390.png), exact completed Phase A Client sources.
- After: [desktop](screenshots/dashboard-1536.png), [mobile](screenshots/dashboard-390.png), [320px](screenshots/dashboard-320.png).
- Calendar: [month / multiple selected-day events / upcoming](screenshots/selected-day-multiple.png), [desktop week](screenshots/week-1536.png), [mobile week](screenshots/week-390.png).
- States: [empty](screenshots/empty-calendar.png), [loading cached data](screenshots/loading.png), [initial error](screenshots/initial-error.png), [stale refresh](screenshots/refresh-error.png), [long untrusted title](screenshots/long-title.png).
- All eight required viewport sizes have month/week captures. See [measurements](responsive-metrics.json) and [validation](VALIDATION.md).

## Preserved contracts and limits

Auth/session, identity approval, profile completion, role separation, owned requests, notifications, matching, request actions, reviews, payment/assignment workflows and weekly availability are unchanged. No SQL, RLS, RPC, Storage, Auth configuration, backend data or matching changes were made. There are no mutations, rescheduling, reminders, external sync or calendar booking API.

Provider names are omitted: the existing dashboard read supplies only the selected Provider ID, not a verified display name. No new user/participant query was introduced. Data inherits the existing dashboard read's result limits. Preferred times are requested service times, not a separately agreed appointment schedule. The original Client recent-request panel still displays its owner's location; the calendar does not copy or render addresses/coordinates.

Outstanding live staging checks: actual Client RLS isolation, Provider RPC/redaction and review access from Phase A, authenticated identity/profile redirects, notifications and owned request-details navigation. Offline intercepted fixtures cannot prove live policies. No deployment or merge was performed; both changes remain stacked Draft PRs for review.

## Changed files

- `igotu_v2/client/dashboard.html`: shared stylesheet and spaced calendar host.
- `igotu_v2/js/client.js`: role-specific safe projection and shared loader integration.
- `tests/client-service-calendar.cjs`: real-browser synthetic integration, responsiveness, accessibility and captures.
- `tests/client-calendar-contract.cjs`: unchanged approved UI/data logic and Phase A boundary checks.
- `docs/client-service-calendar/`: review images, measurements and validation evidence.
