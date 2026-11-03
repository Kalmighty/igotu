# Provider Dashboard and Service Calendar — Phase A

Redesigned the Provider Dashboard using the approved forest-green workspace shell, official branding, original Provider SVG hero, four statistics, five recent authorised requests and quick actions. The four original sidebar routes and all original notification/profile modules remain in place. Client Dashboard sources and styles are unchanged.

The shared vanilla calendar accepts already-authorised records and makes no network calls. It supports month/week, Previous/Next/Today, keyboard date navigation, selected-day details, status legend, five chronologically sorted upcoming requests, invalid-date disclosure and refresh. Mobile month cells use count badges; selected-day details preserve all events. Preferred dates and times remain Malaysian local values, with strict validation and Malaysia-based Today. Awaiting confirmation is tentative; completed/cancelled records are history and never upcoming. Refresh failures retain and label the last successful data.

## Data and workflow contracts

Only the existing `provider_service_requests` RPC and owned `service_reviews` rating query are used. A defensive selected-Provider check precedes rendering. Only `approximate_area` is projected; exact addresses, coordinates, images and Client identities are never displayed. Counts retain original status rules and unavailable reviews show an honest unavailable state. Auth, identity/profile gates, RLS/RPC definitions, matching, confirmations, declines and weekly availability remain unchanged.

Existing Incoming Requests and Assignments scripts do not consume request-ID deep links. Calendar events therefore open compact selected-day details with links to the existing general workflow pages. Assignments uses `assignment-details.html`; no invented route or duplicate confirmation action was added. Weekly hours remain on Edit Profile; no Online/Offline toggle was introduced.

## Review evidence

All captures are actual Chromium renders with clearly labelled synthetic intercepted fixtures; none demonstrate live Supabase integration.

- Before: [desktop](before/dashboard-1536.png), [mobile](before/dashboard-390.png).
- After: [desktop](screenshots/dashboard-1536.png), [mobile](screenshots/dashboard-390.png), [320px](screenshots/dashboard-320.png).
- Calendar: [month and multiple selected-day events / upcoming](screenshots/selected-day-multiple.png), [week](screenshots/week-1536.png), [mobile week](screenshots/week-390.png).
- States: [empty](screenshots/empty-calendar.png), [loading](screenshots/loading.png), [initial error](screenshots/initial-error.png), [stale refresh](screenshots/refresh-error.png), [rating error](screenshots/review-error.png), [rating transport error](screenshots/review-transport-error.png), [long title](screenshots/long-title.png).
- All eight requested widths have month/week captures; [measurements](responsive-metrics.json) and [validation](VALIDATION.md).

Changed implementation: Provider HTML/JS, Provider CSS/SVG and shared calendar JS/CSS. New focused/date/contract tests and this evidence directory. The existing layout harness only adds the real calendar module to its allowed imports; no existing assertions were changed.

## Limits and outstanding staging verification

The dashboard displays only rows returned by existing reads and inherits their result limits. Preferred dates are requested service times, not independently agreed appointment slots. Unknown statuses remain unavailable; invalid dates are unscheduled. No Provider identity lookup, external calendar, booking mutation, reminder or availability logic was added.

Live staging verification remains outstanding: real Provider RPC/RLS ownership, pre-confirmation approximate-area redaction, review visibility, identity/profile redirects, notifications and existing confirm/decline/assignment workflows. No live backend reads, SQL execution, migrations, configuration changes, deployment or merges were performed.
