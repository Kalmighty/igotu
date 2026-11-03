# Provider Messages redesign

Based on verified PR #27 head `207e71577c27ec62e796fd734c251bf3ea30e64d`. Branch `feat/provider-messages-ui` targets `feat/provider-assignments-ui` as the next stacked Draft PR.

Adapts the approved Client Messages layout and reliability patterns into Provider-specific HTML, JavaScript, CSS and original Provider messaging SVG. Client Messages and all shared modules remain unchanged. The forest-green shell, official branding, geometric sidebar, Provider Workspace topbar, notification/account dropdowns and four original destinations are preserved. Messages is active.

## Conversations and request context

The existing `providerRequests(["provider_selected", "confirmed", "in_progress", "completed"])` read is preserved. A defensive selected-Provider/status check runs before a minimal message-context projection. Exact locations, coordinates, descriptions and request images are not copied into UI state or hidden attributes. Pending, cancelled, unassigned and other Providers' requests are excluded.

Client names/codes come only from `service_participants`, matched by request ID, expected Client ID and Client role. Missing participants receive an explicit unavailable state and cannot receive a send. There is no unrestricted profile search.

Search matches authorised Client name, request ID, service title and existing category. All, Active and Completed filters operate locally. Preview and unread data use bounded batches of up to 100 known request IDs with an explicit authenticated sender/receiver predicate and expected Client IDs. Reads are paged; history reads retain request and both participant predicates. A final pair check rejects former participants or unrelated rows even in an over-broad fixture response.

Cards sort by the latest available authorised message timestamp; otherwise they use the existing request creation timestamp and a stable request-ID tie break. The fallback is **not** displayed as a last-message time. Previews distinguish You from Client. Unavailable metadata never produces fabricated text/times/unread totals. Conversation count means the eligible collection returned by the existing request read, not all platform conversations.

The header shows the Client's available name/code, service title/ID, actual status and validated preferred date/time. Awaiting Confirmation remains distinct from accepted work. Existing message deep links select only IDs in the authorised collection; unavailable IDs show a clear message and no unrelated fallback chat. Selection and Back/Forward update the URL safely and preserve drafts.

Incoming Requests and Assignments do not currently consume request-ID deep links. The chat action therefore links to the verified general Incoming Requests workflow for provider_selected, or `assignment-details.html` for confirmed/in-progress/completed. No nonexistent Provider request-details route or unsupported individual deep link was invented.

## Text chat and drafts

Incoming and outgoing bubbles match the approved Client design. Database text is rendered safely; multiline text, long words and URLs remain text. Malaysian timestamps/date separators come from actual creation dates; invalid dates remain unavailable. There are no fabricated delivery ticks, presence indicators or attachment/emoji controls.

The in-flow composer has bounded automatic textarea growth, the existing 1,000 UTF-16-unit/HTML maxlength limit, a synchronised raw-value counter, Send and explicit feedback. Empty, whitespace-only and over-limit submissions are disabled and validated. Enter sends; Shift+Enter inserts a line break; IME composition does not submit. Counter and size update on typing, restoration, clearing and failure recovery.

Drafts and revision numbers are scoped to the request in memory. Switching or refreshing preserves drafts. A late success/failure cannot overwrite newer text in the same or another conversation. Drafts are not persisted across a fresh page load or logout.

## Reliable sending and unread state

The original insert fields remain: id, message_id, request_id, sender_id, receiver_id, message_text, is_read and created_at. Request/recipient are captured and checked against the current authorised participant map before asynchronous work. One send at a time prevents duplicate clicks while the composer can hold newer draft text. Pending bubbles explicitly say Not yet confirmed; only a persistence acknowledgement or an authorised read establishes a saved message.

Both insert and read-status update builders disable the pinned SDK's automatic write retries with `.retry(false)`. Global Supabase configuration is unchanged. Rejected/uncertain saves preserve the draft and original identifiers. Explicit retry first reads the captured conversation, reconciles an existing matching UUID/message_id, or reuses the same identifiers for the same recipient/text. The existing UUID primary key and non-null message_id-preserving trigger are unchanged. No automatic second message is created, and there is no duplicate frontend notification operation.

Unread badges are **indicators**, not invented unread totals or online presence. They represent actually returned incoming rows with is_read=false addressed to the Provider. Only loaded incoming IDs are submitted to the existing read update, still filtered by request, Provider receiver, expected Client sender and is_read=false. Returned IDs acknowledge which rows changed. Failure or a missing acknowledgement retains the indicator and an honest warning. A delayed acknowledgement updates its own request's known unread IDs without changing the currently selected history. Notification badges remain independent.

## Polling, scrolling and mobile

Selected chat updates retain the approximately three-second cadence through a non-overlapping timeout chain and de-duplicated thread fetches. Polling pauses on hidden pages, pagehide, mobile conversation-list view and unavailable recipients; it resumes safely on visibility/BFCache return. Old selection responses are ignored. Existing history stays visible during recoverable refresh errors. Collection refresh failure retains labelled previous information and pauses unsafe sends until the eligible collection is checked again.

Conversation and history panels scroll independently. Polls follow the bottom only if the reader was already near it; otherwise scroll position remains and Show latest messages offers an explicit move. The composer remains in the chat grid, not a fixed overlay. At 1366×768 its measured bottom is **753px**. Below 600px, list/chat are separate in-page views with Back and focus restoration. Short/zoomed screens permit outer scrolling rather than shrinking text; visual-viewport resize keeps the focused composer/Send reachable.

## Actual Chromium review evidence

All captures are actual browser renders labelled **synthetic offline review**. They contain no real Client conversations or live Supabase proof.

- Before: [desktop](before/messages-1536.png), [mobile](before/messages-390.png), exact PR #27 Provider sources.
- Desktop: [1536×864](screenshots/chat-1536x864.png), [1366×768 composer](screenshots/chat-1366x768.png), [1024×768](screenshots/chat-1024x768.png), [tablet](screenshots/chat-768x1024.png).
- Mobile: [conversation list](screenshots/list-390x844.png), [chat](screenshots/chat-390x844.png), [320px chat](screenshots/chat-320x800.png), [focused short-viewport composer](screenshots/short-viewport-composer.png).
- Search/filter: [results](screenshots/search-results.png), [no matches](screenshots/search-empty.png), [Active](screenshots/filter-active.png), [Completed](screenshots/filter-completed.png).
- Content/drafts: [restored draft and counter](screenshots/restored-draft.png), [long history/Latest control](screenshots/long-history-latest.png), [long safe text](screenshots/long-content.png).
- Sending: [pending](screenshots/sending-pending.png), [saved](screenshots/send-success-resolved.png), [rejected](screenshots/send-reject.png), [uncertain](screenshots/send-lost.png), [lost acknowledgement](screenshots/send-lost-success.png), [reconciled](screenshots/send-lost-success-resolved.png).
- Errors/empty: [empty](screenshots/empty-conversations.png), [conversation read](screenshots/conversation-error.png), [participants](screenshots/participant-error.png), [history read](screenshots/history-error.png), [history refresh](screenshots/history-refresh-error.png), [preview lookup](screenshots/metadata-error.png), [unread update](screenshots/read-status-error.png).

All eight required sizes have actual chat captures, plus 390×430 and 320×600 short/zoom-equivalent checks. Phone sizes also have list captures. [Responsive measurements](responsive-metrics.json) and [validation](VALIDATION.md) include accessibility and regression evidence.

## Changed files and preserved contracts

- `igotu_v2/provider/messages.html`: approved shell, two panels, Provider context, text-only composer and refresh control.
- `igotu_v2/js/provider-messages.js`: Provider eligibility/participants, scoped previews/history/unread state, drafts, safe sending, lifecycle and navigation.
- `igotu_v2/css/provider-messages.css`: Provider-scoped adaptation of the approved Client styles and refinements.
- `igotu_v2/assets/provider-messages/provider-chat.svg`: original approved-character messaging variation.
- `tests/provider-messages.cjs`, `provider-messages-edge.cjs`, `provider-messages-contract.cjs`, `provider-messages-retry.cjs`: browser, race/layout, scope and real SDK transport checks.
- `tests/system-functional.cjs`: four completion waits now observe Provider send lifecycle, because empty Send is intentionally disabled. Client waits and every original assertion remain unchanged.
- `docs/provider-messages/`: review captures, measurements and evidence.

Six original Auth/identifier helpers are preserved. Shared Auth/profile/notification/backend/messaging modules, Client Messages HTML/JS/CSS/evidence, other Provider pages, service calendars and SQL remain byte-identical to PR #27. No schema/RLS/RPC/Storage/Auth configuration, matching, data, deployment or merge changes occurred. PRs #17–#27 remain unchanged, open Drafts and unmerged; see `validation/existing-pr-heads.json`.

## Limitations and outstanding live staging acceptance

The initial eligible collection inherits existing Provider RPC row limits. Preview/history pagination does not grant access outside the existing server policies; exact-count pagination is not a transactional snapshot during concurrent inserts. Metadata failures are shown as unavailable. In-flight reads are ignored when paused rather than assumed cancelled; no Realtime subscription was introduced. The two workflow destinations still lack individual request deep links. Attachments, editing/deletion, reactions, voice/video, presence and external messaging are unsupported and omitted.

Outstanding live staging tests: actual Provider/participant/message RLS, before-confirmation access, real insert uniqueness/reconciliation under concurrent/lost requests, read-update returning/permissions, database notification delivery, actual row-limit/pagination behavior, endpoint/CDN performance, session/identity/profile gates, real mobile virtual keyboards, BFCache and OS screen-reader behavior. Offline fixtures/local SDK fetches cannot prove deployed policies or real delivery. No live staging/database modification or validation was performed.
