# Provider Assignments redesign

Based on verified PR #26 head `e4157b3dbac68dd75de1d54a76e28674fc2f1fa3`. Branch `feat/provider-assignments-ui` targets `feat/provider-incoming-requests-ui` as the next stacked Draft PR.

The approved Provider shell, official branding, geometric sidebar and existing notification/account menus surround a mint hero with original Provider SVG artwork. The four original destinations are preserved and Assignments is active. The three supported statistics are Confirmed, In Progress and Completed. No unsupported average rating, earnings, cancellation count or monthly metric was added from the mockups.

## Select, search, filter and review progress

Desktop uses a selectable assignment list and a larger details panel. Phone layouts use separate list/details views with Back to Assignments, a compact details hero and focus restoration. Search matches loaded IDs, service titles and categories. Status filters are All Assignments, Confirmed, In Progress and Completed. Four sorts use the existing request creation timestamp or valid preferred date; unavailable dates sort last with stable ID ties. The interface explicitly explains that request creation time is not assignment confirmation time.

Selection persists across searching, filtering, sorting and refresh while still authorised. Related data is fetched in scoped batches, not once per card. Refresh prevents overlapping list reads, preserves filter settings and shows labelled last-good data on recoverable failure; unsafe actions remain disabled until fresh status is available.

Progress has exactly three text-labelled stages: Confirmed → In Progress → Completed. There are no invented stage timestamps, Reviewed stage or payment prerequisites. Confirmed services offer Start Service with an accessible request-summary dialog. In-progress services explicitly explain that the **Client** completes the work. Providers never receive a Complete Service control. Payment information and Provider reviews of Clients remain separate sections.

## Existing actions and permissions

The initial read remains `providerRequests(["confirmed", "in_progress", "completed"])`. Results are additionally filtered by the authenticated selected Provider and these exact statuses before projecting any Client/location data. Pending, provider-selected, cancelled, foreign and malformed records are excluded. No URL ID is treated as authority. Client name/code/identity state come only from the existing bounded `service_participants` lookup, matched by both request and Client ID. Lookup failure shows “Client information is currently unavailable,” without fabricating an unverified identity.

Start Service uses only `provider_start_request(p_request_id)`. Duplicate submissions and selection changes are blocked while an operation is active. The pinned SDK's automatic RPC retries are disabled per mutation with `.retry(false)`; global Supabase configuration is unchanged. Success requires backend acknowledgement or a subsequent authorised status indicating In Progress/Completed. Lost responses trigger only a scoped read of the known request. Still-confirmed/unknown statuses or failed reads remain unresolved with a Check service status control; conflicting actions remain disabled. Disappearance cannot prove that Start succeeded and is described honestly.

Message Client uses the verified existing `messages.html?request_id=...` route only when the participant lookup supplies the Client. Report Issue retains `report.html?request_id=...`. Links encode their request context; existing destination guards/server permissions remain authoritative. There is no duplicate chat/report system or unrestricted cross-user profile query.

## Authorised location and one map at a time

Only location fields returned for the current authorised assignment enter the details view. Coordinates must be nonempty finite numbers in latitude/longitude bounds. The existing pinned Leaflet/OpenStreetMap map initialises only for the selected assignment's open location section. Switching/refreshing removes its previous instance; closed phone sections do not initialise maps. Expand/Shrink map updates its real size. Missing coordinates, unavailable Leaflet and tile failures have explicit messages while retaining authorised location text. No distance, route, journey time or external directions link is invented.

## Read-only offline payment records

The original scoped `payment_records` query and safe column list remain in use. The dedicated section distinguishes unavailable lookup, no submitted record and Payment Recorded. It shows authorised amount/method/reference/recorded date, with Malaysian date/time formatting. It explicitly says that a Client-recorded offline payment is not independent evidence that funds were received. Providers cannot submit Client payment records or process payments.

`payment-receipts.js` is unchanged. Only the selected payment is passed to its authorised reference/signed-preview mechanism, using five-minute URLs and a fresh signature on Open. No raw Storage path or legacy permanent proof URL fallback is rendered. A generation check prevents a delayed old receipt response from attaching to another selection. Missing proof and resolver/signer errors remain explicit.

## Provider reviews of Clients

Only completed services with confirmed review eligibility and authorised Client information offer the original `service_reviews` insert fields: request_id, reviewer_id, reviewee_id, rating and feedback. Accessible 1–5 star controls and required feedback validation are preserved. Payload ownership comes from the selected authorised record, not DOM or URL IDs.

Existing reviews show Review Submitted, rating and feedback with no second form. Failed eligibility reads disable new submission. Drafts survive switching and recoverable errors. Duplicate submissions and SDK insert retries are blocked. Acknowledged reviews remain visible even if the following refresh fails. Lost responses are resolved through owned review reads; if no review is visible or the lookup fails, submission stays paused with a Check review status action. Recovery refreshes the full authorised review set so it cannot accidentally hide another assignment's existing review.

## Actual browser evidence

All images are actual Chromium captures with explicitly labelled synthetic Providers/Clients/requests and **synthetic offline map tiles**. They are not evidence of live Supabase policies or real geographical imagery. No real identity documents/account data were captured.

- Before: [desktop](before/assignments-1536.png), [mobile](before/assignments-390.png), exact PR #26 HTML/JS.
- After: [complete desktop](screenshots/list-1536.png), [mobile list](screenshots/list-390.png), [mobile details](screenshots/details-390.png), [320px details](screenshots/details-320.png).
- Stages: [Confirmed and map](screenshots/details-1536.png), [In Progress](screenshots/in-progress.png), [Completed/payment/review form](screenshots/completed-payment-review.png), [existing review](screenshots/existing-review.png).
- Start dialog: [desktop](screenshots/start-dialog-1536.png), [320px](screenshots/start-dialog-320.png).
- Start outcomes: [success](screenshots/start-success.png), [rejected](screenshots/start-reject.png), [uncertain](screenshots/start-uncertain.png), [lost acknowledgement](screenshots/start-lost-success.png), [processing](screenshots/start-loading.png).
- Review outcomes: [submitted](screenshots/review-success.png), [recoverable error/draft](screenshots/review-reject.png), [uncertain](screenshots/review-uncertain.png), [lost acknowledgement](screenshots/review-lost-success.png).
- Search/filter: [search results](screenshots/search.png), [no matches](screenshots/search-empty.png), [status-filtered results](screenshots/filter-results.png), [no confirmed assignments](screenshots/empty-filter.png).
- Errors: [initial read](screenshots/initial-error.png), [stale refresh](screenshots/refresh-error.png), [participant lookup](screenshots/error-participantError.png), [payment lookup](screenshots/error-paymentError.png), [review lookup](screenshots/error-reviewError.png), [receipt](screenshots/receipt-error.png), [map library](screenshots/error-noLeaflet.png), [tile failure](screenshots/error-tileFail.png).
- Other: [loading](screenshots/loading.png), [empty](screenshots/empty.png), [long description/missing fields](screenshots/long-content-320.png).

All eight requested sizes have list, selected details and Start dialog captures: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 320×800. See [measurements](responsive-metrics.json) and [validation](VALIDATION.md).

## Changed files and preservation

- `igotu_v2/provider/assignment-details.html`: approved shell, summary, filters/list/details, Start modal and existing pinned Leaflet dependency.
- `igotu_v2/js/provider-assignment-details.js`: scoped loading, selection/progress, guarded Start/review operations, selected map/receipt lifecycle and retained Auth/profile helpers.
- `igotu_v2/css/provider-assignments.css`: page-scoped responsive cards, disclosures, progress and accessible controls.
- `igotu_v2/assets/provider-assignments/provider-services.svg`: original approved-character variation.
- `tests/provider-assignments.cjs`, `provider-assignments-edge.cjs`, `provider-assignments-contract.cjs`, `provider-assignments-retry.cjs`: focused browser/asynchronous/source/SDK checks.
- `tests/system-functional.cjs`: one interaction to submit the new Start dialog; all original assertions remain intact, including PR #26's Incoming confirmation step.
- `docs/provider-assignments/`: before/after images, measurements and review evidence.

No unrelated Provider page, shared receipt/calendar/Auth module, notification/messaging/report workflow, SQL/schema/RLS/Storage/RPC/Auth configuration, matching logic, availability, staging/production data, deployment or merge was changed. PRs #17–#26 are still unchanged, open Drafts and unmerged; metadata is in `validation/existing-pr-heads.json`.

## Remaining limitations and staging acceptance

The existing request/related-query result limits still apply. The backend has no assignment-confirmation timestamp or mutation-operation lookup; request creation dates are labelled accurately. A still-confirmed service or absent review after an ambiguous response cannot establish whether an earlier operation has finished; the UI conservatively permits status checks while keeping conflicting submissions paused. An absent request cannot establish which external operation removed it. No new server contract was introduced.

Outstanding live staging acceptance: actual Provider isolation and participant redaction, confirmed/completed location visibility, map/SDK CDN availability, receipt reference/signing/expiry and browser popup behavior, review eligibility/uniqueness and notification delivery, concurrent Start/reassignment and lost real HTTP responses, Client-only completion, real identity/profile gates, message/report context, dashboard/calendar refresh and real mobile keyboard behavior. Offline fixtures and local SDK fetch tests do not prove deployed RLS, Storage or database state. No live staging/database acceptance was performed.
