# Client Request Details — design review

Branch: `feat/client-request-details-experience`. Stacked on reviewed PR #19, commit `a9e870d32e01bbaf2e0c78974c19ab96408534b2`, branch `feat/client-my-requests-experience`. PRs #17–#19 are unchanged. Only Client Request Details is redesigned.

## Reference and layout

The supplied reference's forest-green sidebar, white account topbar, mint accents, illustrated heading, summary/timeline and main/right-hand card structure are implemented using the approved Client shell and a local original checklist/laptop illustration. New CSS is scoped to `.client-request-details`; shared styles, navigation, guards and menus are unchanged.

Desktop main content receives approximately two-thirds of the available width, with Provider, action, offline payment and review cards to the right. At wider desktop sizes Service Details / Image and Location / Information form a grid within the main column. Below 1251px the same card nodes are moved into a single logical DOM order: summary/timeline, actions, Provider, service details, location, image, payment, review, information. Moving existing nodes retains typed form values, selected stars and proof files. Focus is preserved and Leaflet is invalidated after layout changes. This avoids a visual/keyboard ordering mismatch or duplicate forms.

Cards grow naturally. Long text wraps, maps remain usable, images retain aspect ratio, buttons/forms have visible focus, and primary actions/zoom controls meet approximately 44px targets. The illustration disappears on phones. Entrances last 420ms with full text contrast; hover feedback is 220ms and reduced-motion preferences remove animation/transitions.

## Intentional corrections to the mockup

- All title, ID, category, service type, description, location, status, Provider and settlement information comes from the authorised request and existing lookups. Reference names, amounts and statistics are not hardcoded.
- The normal timeline reflects the stored status. **Only the reliable `created_at` timestamp is displayed in the timeline.** No selection/confirmation/start/completion times are invented. `updated_at`, preferred service date and payment dates are never repurposed as transition times.
- Cancelled requests show Created → Cancelled, without implying earlier confirmation, in-progress or completion milestones. Their reason remains visible. Unknown status gets neutral status text and no invented progression.
- Metadata uses reliable full ISO timestamps only, validates calendar dates, and labels displayed timestamps **MYT**. Missing/date-only/invalid event timestamps are omitted. Preferred service date/time retain their original date/local-time semantics, with readable formatting and no timezone conversion.
- The Provider card uses `serviceParticipants([requestId])` and only displays the matched selected participant's name/code/initial. No Provider ratings, review counts, contact numbers or Call action are invented. A failed participant lookup is distinguished from genuinely having no selected Provider.
- Important actions live in one Request Actions card. The optional three-dot menu is omitted to avoid duplicating those actions.
- Completed-request copy directs the Client to outstanding payment/review recording; it does not say that no further action is required while either is outstanding.
- Offline payment is explicitly a record of money already paid outside IGotU, not payment processing. Its amount input starts **blank**, rather than assuming the service budget equals money actually paid. Existing recorded amounts come from `payment_records`, not the request budget. Actual record dates are shown only when available.
- Submitted reviews are read-only and show the actual rating/feedback and reliable review timestamp. No Edit Review operation is introduced. Review eligibility remains independent of whether a payment record exists, as in the existing implementation.
- A missing/unsafe service image has an honest empty state. A failed image has a fallback while retaining a safe Open Image action. No reference photo is inserted. A neutral request icon is used instead of implying every service is Cleaning.

## Preserved contracts and targeted safeguards

The original owned request lookup retains both predicates:

```js
.eq("request_id", requestId)
.eq("client_id", currentUser.id)
```

No participant lookup or private card rendering happens until that request succeeds. An additional returned-Client-ID check is defensive; backend RLS remains authoritative. The active Client/session/profile/identity/backend gates remain intact.

Pending supports recommendations, edit and cancel. Selected/confirmed supports cancel. In-progress supports Client completion, with a native accessible confirmation dialog. Completed/cancelled omit ineligible mutations. Messaging retains its original rule (matched Provider, request not cancelled); reporting retains its original rule (matched Provider, request not pending, including cancelled requests). No Client Start Service or new operation is added.

The existing required cancellation-reason dialog and exact `client_cancel_request` parameters remain. Completion retains `client_complete_request({p_request_id})`; opening/dismissing the confirmation never calls it. A page-level mutation lock and disabled save buttons prevent duplicate/reentrant submissions. Confirmed successes refresh the original owned request; thrown/uncertain responses show conservative refresh instructions and do not claim success. A real Refresh details control and load-error Retry provide recovery without new APIs.

Payment/review lookups remain fail-closed together. If either fails, neither new settlement form is offered until a successful refresh. Existing records suppress duplicate forms. Amount/method, 1–5 star selection, required feedback, transfer proof requirements, MIME/5-MiB limits, private `payment-proofs` path/association and insert payloads are preserved. Cash and Other retain optional proof; the Other/empty-method helper copy is clarified without changing its rule. Raw returned database/Storage messages are replaced with generic UI errors.

The source-contract test verifies **12 byte-identical helpers**, including Auth/profile, existing settlement readers, star controls and proof requirements. Payment/review insert and proof-upload function bodies are byte-identical except generic error copy/removal of raw error logging. It also verifies owned-query/participant/RPC boundaries and **73 unchanged shared/prior-page/Provider/Admin/SQL files**.

Receipt previews continue through unchanged `payment-receipts.js`: server-authorised reference, private five-minute signing, fresh signing on Open and no public/raw-path fallback. **Service-request images retain the base branch's existing `request_image_url` + `safeUrl()` contract. This UI branch does not apply the separate private-request-images rollout or claim legacy request images are private.** No bucket, RLS, grant, SQL, RPC definition or Supabase setting is changed.

Coordinates reject null/blank, unsupported types, non-finite values and values outside latitude/longitude ranges. No default point or geolocation request is introduced. Leaflet/marker/attribution remain; missing library and tile failures have inline fallbacks without disabling the rest of the page. ResizeObserver invalidates map size and is cleaned up before rerender.

## Synthetic browser evidence

Every capture is generated by local Chromium with an explicit test-only OFFLINE REVIEW banner. Names, records, image bytes, map tiles and all mutations are fixtures. They are not live staging/production evidence.

| State | Capture |
| --- | --- |
| Desktop/full page | [1920](screenshots/details-1920.png), [1536](screenshots/details-1536.png), [1440](screenshots/details-1440.png), [1366](screenshots/details-1366.png) |
| Tablet | [1024](screenshots/details-1024.png), [768](screenshots/details-768.png) |
| Mobile | [390](screenshots/details-390.png), [320](screenshots/details-320.png) |
| Before redesign, exact reviewed HTML/core | [1536 before](before/details-1536.png), [390 before](before/details-390.png) |
| Stored statuses | [Pending / no Provider](screenshots/status-pending.png), [Provider Selected](screenshots/status-provider_selected.png), [Confirmed](screenshots/status-confirmed.png), [In Progress](screenshots/status-in_progress.png), [Completed / payment and review forms](screenshots/status-completed.png), [Cancelled](screenshots/status-cancelled.png), [Unknown](screenshots/status-disputed.png) |
| Settlement/review | [Completed without payment, mobile forms](screenshots/completed-without-payment-390.png), [Recorded payment](screenshots/completed-with-payment.png), [Private proof document](screenshots/completed-with-private-proof.png), [Submitted review](screenshots/submitted-review.png) |
| Confirmation | [Cancellation](screenshots/cancellation-confirmation.png), [Completion](screenshots/completion-confirmation.png), [320px completion](screenshots/completion-confirmation-320.png) |
| Images | [Missing](screenshots/image-missing.png), [Unsafe URL](screenshots/image-invalid.png), [Load failure](screenshots/image-failed.png) |
| Map failures | [Leaflet unavailable](screenshots/map-unavailable.png), [Tiles unavailable](screenshots/map-tiles-unavailable.png) |
| Data/error states | [Loading](screenshots/loading.png), [Fetch failure](screenshots/fetch-error.png), [Provider unavailable](screenshots/provider-unavailable.png), [Payment lookup failure](screenshots/lookup-error-payment_records.png), [Review lookup failure](screenshots/lookup-error-service_reviews.png), [Long/missing data](screenshots/long-data-320.png) |

Dialog captures show the active viewport; other captures show the full page. [Measurements](responsive-metrics.json) and the [validation report](VALIDATION.md) distinguish UI evidence from live-backend testing.

## Changed-file summary

- `igotu_v2/client/request-details.html`: approved shell reuse, header, load container and completion dialog.
- `igotu_v2/css/client-request-details.css`: page-scoped cards, responsive layout, timeline, image/map/forms and reduced motion.
- `igotu_v2/js/client-request-details.js`: presentation, accurate timeline/formatting, responsive node layout, map/image/load fallbacks and mutation/confirmation guards; existing backend contracts preserved.
- `igotu_v2/assets/request-details/checklist.svg`: local original illustration, consistent with prior Client artwork.
- `tests/request-details-preview.cjs` and `tests/request-details-contract.cjs`: synthetic behavior/visual/accessibility and source-contract coverage.
- `tests/system-functional.cjs`: two setup additions — confirm the new completion dialog, and explicitly enter the amount before the existing transfer-proof assertions. Existing assertions remain intact.
- `docs/request-details/`: reference comparison, screenshots, responsive metrics and validation evidence.

No other Client, Provider or Admin page or shared script/style is modified. No new dependencies/framework, real accounts, live SQL/data writes, production/staging access, deployment or merge.

## Reproduce safely

Use the pinned test dependencies in `tests/package-lock.json` and Chromium (or CHROMIUM_PATH), with a local static server:

```sh
python3 -m http.server 4208 --bind 127.0.0.1 --directory igotu_v2
# Separate terminal, repository root:
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4208
node tests/request-details-contract.cjs
node tests/request-details-preview.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
SYSTEM_RESULTS=docs/request-details/validation/functional.json node tests/system-functional.cjs
```

The focused runner requires loopback, substitutes the existing in-memory backend, serves Leaflet assets/tiles and image fixtures locally, and aborts unexpected external traffic. Its clock advances from a controlled date so Leaflet's finite opacity fade can finish. No real geolocation or geocoder is requested. Existing regression suites also use fixtures.
