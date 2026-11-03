# Provider Incoming Requests redesign

Based on verified PR #25 head `6895c094d8a05e432512f930ef27d43ec2322906`, on `feat/provider-incoming-requests-ui`. The next Draft PR targets `feat/client-dashboard-service-calendar`.

Uses the approved Provider Dashboard shell and green/mint design, official branding, original inbox SVG, existing notification/profile modules and the original four sidebar routes. Incoming Requests is active. The reference mockup's unsupported New/unread/monthly-decline metrics are intentionally replaced by one real Awaiting Your Response count.

## Review and respond

Desktop uses a request list and selected details panel. Mobile uses a full-width list/details switch with Back to Requests and focus restoration. Selected cards use a green border, tint and semantic pressed state. Search matches already-loaded ID, title and category; Clear Search restores the list. Four sort modes use existing `created_at` or valid local `preferred_date`, with unavailable dates last and stable ID ties. The existing backend exposes no received/selected timestamp: received-order options therefore use request creation time.

Selection survives search, sorting and successful refresh while still available. A selected request outside a search remains visible in details with an explanation. Removed requests leave the available set; after acknowledged actions the next available request is selected. Requests cannot switch during an action/dialog/status check. Refresh is locked against overlapping reads and actions; failed refresh retains clearly labelled previous information with actions paused.

Confirm opens an accessible modal summarising ID, title and preferred date/time, explicitly distinguishing preferences from guaranteed appointments. Decline retains the unchanged `askDeclineReason()` dialog, reason choices, optional details and required-reason validation. Only the existing `provider_confirm_request(p_request_id)` and `provider_decline_request(p_request_id,p_reason)` mutations run. Duplicate clicks are blocked. Success is reported only after acknowledgement, followed by the existing authorised list read. Dashboard/calendar use their existing reads when revisited.

The pinned Supabase SDK automatically retries RPC POSTs. These two calls explicitly use `.retry(false)` on their builders; global client configuration is unchanged. Lost/ambiguous responses never trigger an automatic mutation retry. The UI keeps conflicting actions and selection disabled while checking only `provider_service_requests(null, knownRequestId)`. A current confirmed/in-progress/completed status can establish confirmation. An absent request only establishes that it is no longer available to this Provider, **not** that Decline succeeded. Messages preserve that distinction. Still-pending or failed status reads remain unresolved with an accessible Check request status action. Known server rejections receive sanitised errors and a fresh list before actions can be retried.

## Privacy and authority

Initial reads retain `providerRequests(["provider_selected"])`. Results are defensively filtered by the authenticated selected Provider and exact status. URLs/browser state cannot select an arbitrary ID; only IDs in the current authorised set reach actions. The server remains authoritative for every read and mutation.

Only permitted service fields and `approximate_area` are copied into UI state. No exact address, coordinates, submitted image or description is copied or rendered, including hidden attributes. The current RPC withholds descriptions/images before confirmation, so details show the explicit after-confirmation message. No precise map is loaded.

Client name/code/verified state come only from the existing bounded `service_participants` lookup over current request IDs, matched by request ID, Client ID and role. Lookup failure shows unavailable information independently of service loading; it never fabricates Not Verified. There is no unrestricted profile lookup. Report Issue retains the existing encoded `report.html?request_id=...` route.

Auth, active role, identity/profile gates, backend readers, participant permissions, notifications, reports, matching, weekly availability and both dashboard calendars are unchanged. No SQL, migrations, schema/RLS/Storage/RPC/Auth configuration, production/staging data, deployment or merge changes were made.

## Actual Chromium review evidence

Every capture is clearly labelled **synthetic offline review**, using intercepted fixtures, not live Supabase. Before images use exact PR #25 HTML/JS with the backend's description/image redaction represented in fixtures.

- Before: [desktop](before/incoming-1536.png), [mobile](before/incoming-390.png).
- After: [complete desktop / selected request](screenshots/list-1536.png), [mobile list](screenshots/list-390.png), [mobile details](screenshots/details-390.png), [320px details](screenshots/details-320.png).
- Search: [results](screenshots/search-results.png), [no matches](screenshots/search-empty.png).
- Dialogs: [Confirm](screenshots/confirm-1536.png), [Decline](screenshots/decline-1536.png), [mobile Confirm](screenshots/confirm-320.png), [mobile Decline](screenshots/decline-320.png).
- Loading: [refresh](screenshots/loading.png), [action in flight](screenshots/action-loading.png).
- Outcomes: [confirmation success](screenshots/confirm-success.png), [decline success](screenshots/decline-success.png), [confirmation failure](screenshots/confirm-error.png), [decline failure](screenshots/decline-error.png).
- Uncertain: [Confirm](screenshots/confirm-uncertain.png), [Decline](screenshots/decline-uncertain.png), [lost Confirm acknowledgement](screenshots/confirm-lost-ack.png), [lost Decline acknowledgement](screenshots/decline-lost-ack.png).
- Other states: [empty](screenshots/empty.png), [initial error](screenshots/initial-error.png), [stale refresh](screenshots/refresh-error.png), [participant error](screenshots/participant-error.png), [long content/missing fields](screenshots/long-content-320.png).

All eight requested sizes have list/details and Confirm/Decline captures: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×800. [Responsive measurements](responsive-metrics.json) and [validation results](VALIDATION.md).

## Changed files

- `igotu_v2/provider/incoming-requests.html`: approved shell, two-panel layout, search/sort, mobile details and Confirm dialog.
- `igotu_v2/js/provider-incoming-requests.js`: authorised projection, selection/search/sort/load state and guarded existing action workflows.
- `igotu_v2/css/provider-incoming-requests.css`: page-scoped responsive presentation and dialogs.
- `igotu_v2/assets/provider-incoming-requests/provider-inbox.svg`: original inbox variation of the approved Provider character.
- `tests/provider-incoming-requests.cjs`, `provider-incoming-contract.cjs`, `provider-incoming-retry.cjs`: browser, source-boundary and real pinned-SDK transport verification.
- `tests/system-functional.cjs`: one interaction added to submit the new Confirm dialog; every existing assertion is unchanged.
- `docs/provider-incoming-requests/`: captures, measurements and test evidence.

## Remaining limits and live staging checks

The existing reads' row limits still apply; no pagination/backend endpoint was invented. Exact descriptions, images, addresses and coordinates remain unavailable on this pre-confirmation page. There is no received-at field, unread state, declined-month statistic or open marketplace. Preferred dates remain Client preferences. No long description is shown because the current incoming API never authorises it.

The API supplies no separate mutation-operation status or decline-history read. After a lost response, a request remaining selected cannot conclusively establish that an earlier operation has finished; the UI conservatively keeps actions paused and permits further status reads. Disappearance cannot prove decline, cancellation or reassignment individually. No competing mutation is automatically retried.

Outstanding live staging tests: real Provider assignment/participant isolation, pre-confirmation redaction, reason persistence and notification behavior, busy-slot rejection, concurrent reassignment, actual lost HTTP responses, identity/profile gates, report authorisation, dashboard/calendar refresh after actions and real mobile keyboard behavior. Offline fixture and local-SDK tests do not prove live RLS or database deployment state. PRs #17–#25 remain unchanged, open Drafts and unmerged; see `validation/existing-pr-heads.json`.
