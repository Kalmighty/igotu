# Client My Requests — design review

[Final pagination refinement: narrow-phone before/after, updated captures and validation](pagination/README.md).

Branch: `feat/client-my-requests-experience`. Stacked on reviewed PR #18 commit `b22ec7de716a991bcdaf522846a1e1e53db3b87d`, branch `feat/create-request-experience`. PRs #17 and #18 are unchanged. Only My Requests is redesigned.

The request supplied a detailed written mockup specification; no separate My Requests reference image was available in this turn. This implementation follows that layout and the approved Dashboard/Create Request visual language. It does not claim a pixel comparison against an unseen image.

## Design

The page reuses the approved forest-green sidebar, official U mark, white account header and dashboard shell stylesheet without changing them. My Requests is the active navigation item. The original local SVG shows a person reviewing a checklist; it is decorative and hidden on narrow phones.

Five dynamic summary cards precede a labelled search/filter toolbar. The desktop list receives most of the available width, with a compact status guide and real Quick Actions to the right. Cards include a category icon, title, ID, status text, location, preferred date/time, budget, specialisation and supported priority. Cancelled cards retain the cancellation reason. On tablet and mobile, guidance follows the list. Phones use stacked cards and larger metadata; all essential actions remain available.

Controls have visible focus and approximately 44px minimum targets. Entrances last 420ms with short bounded staggering, using movement at full text contrast; menus move briefly and hover feedback lasts 220ms. Reduced motion disables animation and transitions. No continuous animation, statistics count-up, external UI package or new framework is used.

## Data and workflow

The original query is retained:

```js
supabase.from("service_requests").select("*")
  .eq("client_id", currentUser.id)
  .order("created_at", { ascending: false });
```

Only the authorised returned owned dataset is used. A defensive Client-ID check also rejects malformed/foreign rows; this does not replace RLS. No new search endpoint, directory, request lookup by arbitrary URL ID, or schema change is introduced.

Summary counts use the full loaded owned dataset, independently of filters and the visible page. Pending is `pending`; Ongoing groups `provider_selected`, `confirmed`, and `in_progress`; Completed and Cancelled use their stored statuses. Unknown or missing statuses remain in Total and All Statuses. The subtotals therefore need not add up to Total.

Search matches title, ID, category and service type, case-insensitively, after trimming/collapsing whitespace. Category/status/time/search compose locally. Last 7/30/90 Days means a rolling interval of that many 24-hour periods, inclusive of the cutoff, based on `created_at`, excluding future or unavailable timestamps. Preferred service dates are not used for these filters or creation-order sorting. Newest/Oldest sorts place unavailable timestamps last; equal times use a deterministic request-ID/source-index tiebreaker.

Pagination uses five records on desktop and mobile, bounded nearby page buttons and dynamic counts. Filters/sort/reset return to page 1. Navigation keeps filters and sorting, has no extra data query and preserves keyboard focus without forced scrolling. Reset restores all defaults.

View Details keeps the encoded `request-details.html?request_id=...` route. Pending-only Edit keeps `create-request.html?request_id=...`. A disclosure action menu appears only when an eligible action exists; native links/buttons, labelled triggers, expanded state, outside dismissal, Escape and focus restoration support keyboard use. It omits Edit for selected/confirmed and omits the menu for in-progress/completed/cancelled/unknown requests. Those records still have View Details.

Cancellation remains limited to pending/provider-selected/confirmed. The unchanged `askCancellationReason()` dialog supplies the same required reason and optional details. The only mutation remains `client_cancel_request({p_request_id,p_reason})`. Backend checks remain authoritative. A lock begins before opening the dialog and survives filter rerenders, preventing duplicate RPCs. Returned RPC errors do not change status. Thrown/uncertain responses explicitly advise checking Details/refresh before retry. Confirmed success is acknowledged, then the original owned query refreshes the dataset and statistics while preserving filters/sort and clamping pagination. A failed refresh shows unavailable statistics and Retry rather than stale fresh-looking numbers or a false zero. History is retained; refresh retry does not repeat cancellation.

No matching/confirmation, completion, payment, review, messaging, verification or Request Details functionality is changed. Shared notification/unread/profile/verification/logout controls remain in use.

## Loading, errors and unexpected data

Statistics show em dashes while loading or unavailable, and zero only for a successful empty dataset. The list distinguishes true empty history, no filtered matches and fetch failure. Retry actually reruns the owned query, without discarding filter context. Filters/sort are disabled while loading/unavailable.

Dynamic fields are escaped at the HTML boundary; request IDs are encoded and escaped in links. Status classes and category icons come from fixed mappings. Unknown labels remain readable text with neutral badges. Missing/malformed optional values have explicit fallbacks; long and unbroken text wraps within the card. Missing request IDs cannot create a misleading details link.

## Browser evidence

Every capture is made by local Chromium with an explicit test-only OFFLINE / SYNTHETIC banner. Names, requests, timestamps, counts and cancellation operations are fixtures, not live records. The fixture counts intentionally differ from the written mockup's example numbers.

| State | Screenshots |
| --- | --- |
| Desktop/full page | [1920](screenshots/requests-1920.png), [1536](screenshots/requests-1536.png), [1440](screenshots/requests-1440.png), [1366](screenshots/requests-1366.png) |
| Tablet | [1024](screenshots/requests-1024.png), [768](screenshots/requests-768.png) |
| Mobile | [390](screenshots/requests-390.png), [320](screenshots/requests-320.png) |
| Before redesign, exact reviewed base HTML/core | [1536 before](before/requests-1536.png), [390 before](before/requests-390.png) |
| Finding requests | [Search](screenshots/search-results.png), [category](screenshots/category-filter.png), [status](screenshots/status-filter.png), [no matches](screenshots/no-matches.png) |
| Navigation/actions | [Page 2](screenshots/pagination-page-2.png), [action disclosure](screenshots/actions-menu.png) |
| Cancellation | [Dialog desktop](screenshots/cancellation-dialog.png), [390](screenshots/cancellation-dialog-390.png), [320](screenshots/cancellation-dialog-320.png), [success](screenshots/cancellation-success.png), [error](screenshots/cancellation-error.png) |
| Data states | [Empty history](screenshots/empty-history.png), [loading](screenshots/loading.png), [fetch error](screenshots/fetch-error.png), [long/malformed values](screenshots/long-data-320.png) |

Dialog captures show the active viewport; other captures show the full page. Screenshot labels are inserted only by the test harness, not shipped application code. [Measurements](responsive-metrics.json) and the [validation report](VALIDATION.md) document the results and limits.

## Changed files

- `igotu_v2/client/my-requests.html`: approved Client shell reuse and new history-page markup.
- `igotu_v2/css/client-my-requests.css`: page-scoped styling/responsiveness, disclosure and existing reason-dialog presentation.
- `igotu_v2/js/client-my-requests.js`: local statistics, search/filter/sort/pagination, safe card rendering and guarded cancellation feedback/recovery.
- `igotu_v2/assets/my-requests/review.svg`: original decorative illustration.
- `tests/my-requests-preview.cjs`: synthetic browser interactions, accessibility, responsive metrics and captures.
- `tests/my-requests-contract.cjs`: original helper/query/RPC and protected-file regression checks.
- `tests/system-functional.cjs`: two existing cancellation scenarios now open the action disclosure before clicking Cancel. Existing reason, history and focus assertions remain intact.
- `docs/my-requests/`: design, before/after/state screenshots and validation evidence.

No Dashboard/Create Request/Request Details/Messages redesign, shared script/style modification, dependency/lockfile change, SQL, Supabase configuration change, account creation, live mutation, deployment or merge is included.

## Reproduce with synthetic fixtures

Use the pinned testing dependencies in `tests/package-lock.json` and Chromium (or set CHROMIUM_PATH). Serve local files only:

```sh
python3 -m http.server 4207 --bind 127.0.0.1 --directory igotu_v2
# Separate terminal, repository root:
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4207
node tests/my-requests-contract.cjs
node tests/my-requests-preview.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
SYSTEM_RESULTS=docs/my-requests/validation/functional.json node tests/system-functional.cjs
```

The focused runner requires a loopback origin, replaces Supabase transport with in-memory fixtures, aborts unexpected external requests and fails on escaped traffic/browser exceptions. Existing regression suites likewise use synthetic fixtures. Do not substitute real staging/production credentials.
