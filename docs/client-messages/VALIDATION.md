# Validation — Client Messages

See the [final refinement validation and viewport comparisons](refinement/README.md) for updated results. The results below include the final PR #21 refinement.

All results below use synthetic fixtures and blocked outside traffic. No live Supabase reads, writes, message-read updates, SQL, account changes, deployment or merge were performed.

| Check                           | Result                                                                                                                         | Evidence                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Focused Client Messages         | 418 assertions passed                                                                                                          | [Log](validation/focused.txt), [JSON](validation/focused.json)       |
| Accessibility                   | 21 axe scans, zero reported violations                                                                                         | [Focused JSON](validation/focused.json)                              |
| Existing functional suite       | 94 passed, 0 failed, including Client/Provider messaging                                                                       | [Log](validation/functional.txt), [JSON](validation/functional.json) |
| Existing Auth smoke             | Passed, including 9 role-match outcomes                                                                                        | [Log](validation/auth.txt)                                           |
| Existing mandatory verification | Passed, including 16 direct guarded routes                                                                                     | [Log](validation/identity.txt)                                       |
| Existing workspace/layout suite | 84 page/viewport layouts passed                                                                                                | [Log](validation/layout.txt)                                         |
| Source compatibility            | 6 identity/Auth helpers normalized equal; original query/read/insert contracts; 135 protected files identical to reviewed base | [Log](validation/contract.txt), [hashes](validation/contract.json)   |

Responsive coverage: 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 and 320×800. [Measured bounds](responsive-metrics.json) record page/panel/history/composer/Send dimensions. Assertions verify no horizontal overflow, non-overlapping history/composer, usable history area and touch targets. Phone list and chat are checked separately. A 390×430 short viewport exercises focused composer access.

Focused coverage includes owned eligible requests, selected Provider identity per request, former-assignment exclusion, unauthorized roles and IDs, participant failures, local combined search/filter, deep links, browser Back, separate drafts, timestamps, empty/loading/error states, message safety/length, pending vs confirmed, duplicate-submit locking, failed/thrown/lost-response retry, exact retry identifiers, switching during send/load/read, polling cleanup/deduplication, stale response rejection, receiver read predicates/failure, unchanged DOM/scroll, new-message scroll affordance, keyboard/labels, notification/profile/logout and reduced motion. Preferred schedule is displayed from stored request fields; message instants are formatted in MYT. No fabricated preview times or receipts.

The final refinement retains all existing focused and regression assertions. New tests cover viewport fitting, counter changes without input events, 75/130-character conversation drafts, pending/confirmed/failed/lost-response sends, resizing, tab visibility and outer-page scroll preservation. Native keyboard scrolling is allowed to settle under the test's virtual clock before checking position. Phone captures use matched focus plus a synthetic visual-viewport resize event, exercising the existing keyboard handler rather than claiming physical-keyboard validation. The original source compatibility checks still pass, with a further 30 unchanged functions and 137 protected application/SQL files verified against the reviewed PR #21 commit.

## Reproduction

Use the existing pinned dependencies in tests/package-lock.json and Chromium. From the repository root, serve `igotu_v2` on loopback port 4209 (for example `python -m http.server 4209 --bind 127.0.0.1 --directory igotu_v2`). In this workspace dependencies were reused from `/workspace/work/igotu-service-calendar/tests/node_modules` through NODE_PATH; no dependency files changed.

```sh
export UI_BASE_URL=http://127.0.0.1:4209
export NODE_PATH=/workspace/work/igotu-service-calendar/tests/node_modules
export CHROMIUM_PATH=/usr/bin/chromium
node tests/client-messages-contract.cjs
node tests/client-messages-preview.cjs
SYSTEM_RESULTS=docs/client-messages/validation/functional.json node tests/system-functional.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
```

The preview test requires the reviewed base commit to be available locally to render before screenshots. It restricts its base URL to loopback and intercepts the backend/CDN fixture transport. Existing suites retain their original assertions.

## Practical limits

These tests establish frontend behaviour under fixtures, not production authorization or RLS proof. Actual deployed constraints, network failures, realtime concurrency, notification traffic, session expiry and read updates were not exercised against Supabase. Retry uniqueness relies on existing primary key id and unique message_id constraints recorded in `docs/backend-integration/catalog-reviewed.json`; this task did not verify or alter live schema. Physical iOS/Android keyboard and screen-reader review remain outstanding. Axe results do not substitute for that review.

Drafts and unresolved attempt metadata are memory-only, so reloading loses them. Polling remains the existing transport, without realtime subscriptions or a new backend idempotency endpoint. The final refinement fits common desktop/tablet viewports; outer scrolling remains available for very short or zoom-equivalent viewports to retain readability. No unsupported attachments, cancellation conversations, unread counts, delivery/read receipts, calls or action menus were added.
