# Client Messages review

[PR #21 final refinement: before/after, viewport measurements and counter validation](refinement/README.md).

Branch: `feat/client-messages-experience`. Stacked on PR #20, `feat/client-request-details-experience`, reviewed commit `ad96900331668a33d775f36b1822f275c89788e0`. This change ends at Client Messages; Edit Profile is outside scope.

## Result and reference

The reference is implemented using the approved forest-green Client shell, mint illustrated hero, searchable conversation panel, Provider header, linked request summary, gray incoming/mint outgoing bubbles and green Send control. The original local SVG is decorative. Existing HTML/CSS/JavaScript architecture and dependencies are retained.

The conversation list shows actual Provider, request title/ID and status, rather than inventing last-message previews. All/Active/Completed filters match the eligible request model; Cancelled is excluded. Attachments, calls, unsupported menus, per-thread unread counts and delivery/read ticks are omitted. The existing notification dropdown/badge remains connected to its original data source.

Desktop/tablet show two independently scrollable panels. At 600px and below, list and chat are separate views with an in-flow Back control. An eligible request deep link opens its chat directly. An invalid/unowned ID shows an unavailable state without silently choosing another thread. Drafts survive switching and mobile Back in the current page session. They are intentionally not stored across reloads or logout.

## Browser evidence

Every screenshot is labelled **offline review / synthetic conversations / no live Supabase**. These are actual Chromium renders of the application modules with intercepted fixtures, not production or staging evidence. The original review captures use full-page screenshots. The final refinement report uses viewport-sized before/after screenshots and verifies the composer fits common desktop/tablet viewports. Chat history also scrolls independently.

| View           | Before                               | After                                                                                |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Desktop 1536px | [Original](before/messages-1536.png) | [Redesigned](screenshots/messages-chat-1536.png)                                     |
| Mobile 390px   | [Original](before/messages-390.png)  | [List](screenshots/messages-list-390.png), [chat](screenshots/messages-chat-390.png) |

Other sizes: [1920](screenshots/messages-chat-1920.png), [1440](screenshots/messages-chat-1440.png), [1366](screenshots/messages-chat-1366.png), [1024](screenshots/messages-chat-1024.png), [768 tablet](screenshots/messages-chat-768.png), [320 list](screenshots/messages-list-320.png), [320 chat](screenshots/messages-chat-320.png).

| State                    | Screenshot                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search and filters       | [Search](screenshots/search-results.png), [Active](screenshots/filter-active.png), [Completed](screenshots/filter-completed.png), [no results](screenshots/search-empty.png)                                      |
| Selection and navigation | [Selected](screenshots/selected-conversation.png), [phone deep link](screenshots/deep-link-390.png)                                                                                                               |
| Empty/loading            | [No conversations](screenshots/empty-conversations.png), [empty history](screenshots/empty-history.png), [loading history](screenshots/loading-messages.png)                                                      |
| Errors                   | [Conversations](screenshots/conversation-load-error.png), [participants](screenshots/participant-unavailable.png), [history](screenshots/message-load-error.png), [read update](screenshots/read-state-error.png) |
| Sending                  | [Unconfirmed pending](screenshots/sending.png), [confirmed](screenshots/sent-message.png), [failed insert/draft](screenshots/failed-send-error.png), [thrown response/draft](screenshots/failed-send-throw.png)   |
| Content and scrolling    | [Long history](screenshots/long-history.png), [long message at 320px](screenshots/long-message-320.png)                                                                                                           |

## Compatibility and behaviour

Only requests owned by the signed-in Client with a selected Provider and status `provider_selected`, `confirmed`, `in_progress` or `completed` become conversations. Participant results are matched by both request ID and selected Provider ID. Unknown participants prevent sending instead of guessing a recipient. Search/filter operate on the loaded authorized list without extra backend queries.

The original request query, request-and-actor-pair message query, receiver-scoped unread update and eight insert columns are retained. Inserts contain only `id`, `message_id`, `request_id`, `sender_id`, `receiver_id`, `message_text`, `is_read` and `created_at`. The existing profile guard and Auth helpers are preserved. No SQL, RPC, Storage, RLS, Auth setting or backend configuration changes are included.

A single timer polls roughly three seconds after the previous load finishes. Same-thread in-flight fetches are shared; selection versions reject late responses before rendering or marking read. Polling pauses on mobile Back, page hide and hidden tabs, and resumes for the visible selection. Read updates target the current request, current receiver, selected Provider sender and unread rows only. Failure shows a warning without claiming the update succeeded.

Pending bubbles explicitly say they are not yet confirmed. Only an insert acknowledgement or matching row returned by the existing query confirms a message. Confirmation means saved to the conversation, not delivery or reading. Acknowledged rows are retained through an older in-flight poll until observed in a fresh query. Failed/uncertain sends preserve their raw draft and original identifiers. Before retry, the same authorized thread is checked for that attempt; a found row is reconciled without another insert. An absent unchanged attempt reuses its UUID/message ID/time; a failed check blocks insertion. This relies on existing reviewed primary/unique constraints, documented in the saved backend catalog, not a new idempotency API. Changing the draft can start a new attempt after resolving the earlier one.

Conversation-specific revisions protect newer typing during an earlier send. Switching threads never changes the captured receiver/request of an in-flight insert. Message bodies use textContent; multiline text, emoji and long URLs wrap safely. Enter inserts a newline, including during IME composition. Send is keyboard reachable; blank or over-1,000-character messages cannot be inserted.

Unchanged polling preserves history DOM and scroll position. New messages follow only near the bottom; otherwise Show latest messages appears. The composer stays in normal flow without covering bubbles. Mobile visual viewport changes bring the focused composer into view. A short viewport test approximates keyboard intrusion; physical keyboards and browser-specific mobile keyboards still need device review.

## Changed files

- `igotu_v2/client/messages.html`: page layout and accessible controls within the approved shell.
- `igotu_v2/js/client-messages.js`: Client-only selection/search/filter, draft/send/poll/render handling.
- `igotu_v2/css/client-messages.css`: scoped responsive layout, focus states and reduced motion.
- `igotu_v2/assets/client-messages/chat.svg`: original local illustration.
- `tests/client-messages-preview.cjs`: synthetic browser/state/accessibility coverage and screenshots.
- `tests/client-messages-contract.cjs`: reviewed contract and protected-file checks.
- `docs/client-messages/`: review evidence, measurements and test results.

Provider Messages, shared messages.css, all other pages, shared application modules, existing tests and SQL remain unchanged. See [validation and limitations](VALIDATION.md).
