# PR #21 — final Client Messages refinement

Existing branch: `feat/client-messages-experience`. Reviewed starting commit: `8b361180eac2b991f0966775d1d47c30c797a681`. This updates [Draft PR #21](https://github.com/Kalmighty/igotu/pull/21); no new PR is created. PR #20 remains the base. This refinement ends at Client Messages.

## Two focused changes

The approved Client shell, illustration, colors, content and navigation remain. On widths above 600px the page now uses a viewport-height grid, with a flex main area/content section. The banner and actual shell consume their intrinsic space; the conversation panels receive the remaining height. The grid has separate history and composer rows. The 700px panel minimum is replaced with a 500px readability floor. At heights up to 850px, banner spacing and artwork become more compact without reducing message text or hiding the request summary.

The navigation row is included in the grid calculation on tablets. Both conversation list and message history keep independent scrolling. The request summary can scroll when unusually long, retaining its details link. No composer uses fixed positioning or overlays bubbles. Very short or zoom-equivalent viewports can scroll the outer page to preserve readable controls. At 600px and below, the approved separate list/chat layout and in-flow mobile composer are unchanged.

A small `setMessageInput` helper changes the textarea value and immediately calls `updateMessageCharacterCount`. Every application assignment now uses it: conversation draft restoration, pending-send clear, failed-send restoration and earlier-attempt reconciliation. The same count helper runs on user input, composer state refresh and initialization. It reads the actual textarea length and retains the existing 1,000-character rule. No new live region announces each keystroke. Draft maps/revisions, send locks, captured recipients, retry identifiers and polling logic remain.

## Before and after

These are actual Chromium viewport screenshots with identical synthetic conversations. Before renders the reviewed PR #21 HTML/JS/page CSS from Git; after renders this refinement. Every image is labelled **offline / synthetic / no live Supabase**. The fixed test-only label does not alter page geometry. Phone screenshots preserve matched focus and simulated visual-viewport resize behavior; short phone screenshots show the reachable composer rather than claiming all chat content fits simultaneously.

| Viewport           | Before                             | After                                       |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| 1366×768 desktop   | [Before](before/chat-1366-768.png) | [Composer visible](after/chat-1366-768.png) |
| 1536×864 desktop   | [Before](before/chat-1536-864.png) | [After](after/chat-1536-864.png)            |
| 768×1024 tablet    | [Before](before/chat-768-1024.png) | [After](after/chat-768-1024.png)            |
| 390×844 phone chat | [Before](before/chat-390-844.png)  | [After](after/chat-390-844.png)             |
| 320×800 phone chat | [Before](before/chat-320-800.png)  | [After](after/chat-320-800.png)             |

Additional captures: [1920×1080](after/chat-1920-1080.png), [1440×900](after/chat-1440-900.png), [1024×768](after/chat-1024-768.png), [390×430 short phone](after/chat-390-430.png), [683×384 zoom-equivalent viewport](after/zoom-equivalent-683-384.png), [long history](after/long-history.png), [restored 75-character desktop draft](after/restored-draft-1536.png), [restored phone draft](after/restored-draft-390.png), [successful-send zero counter](after/successful-send-counter.png), [failed-send draft/counter](after/failed-send-counter-error.png), [uncertain-send draft/counter](after/failed-send-counter-throw.png).

## Measured layout

| Viewport  | History height | Composer bottom | Fits initial viewport |
| --------- | -------------: | --------------: | --------------------- |
| 1920×1080 |        443.2px |        1061.0px | Yes                   |
| 1536×864  |        227.2px |         845.0px | Yes                   |
| 1440×900  |        263.2px |         881.0px | Yes                   |
| 1366×768  |        184.5px |         753.0px | Yes                   |
| 1024×768  |        166.2px |         753.0px | Yes                   |
| 768×1024  |        265.5px |        1005.0px | Yes                   |

Bounds are measured before adding the test screenshot label and with the outer page at the top. No horizontal overflow was observed. Phone bounds include the original in-flow outer-page layout plus `focusedComposer` bounds after the synthetic visual-viewport resize event. Short/zoom-equivalent pages are allowed to scroll; the phone assertions verify the input and Send are then visible. With matched focus/resize state, the 390×844 and 320×800 before/after renders are pixel-identical ([comparison proof](mobile-comparison.json)).

## Validation and scope

| Check                          | Final result                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expanded focused suite         | **418 assertions passed**, including all original 300                                                                                                  |
| Accessibility                  | **21 axe scans**, zero reported violations                                                                                                             |
| Existing functional suite      | **94 passed, zero failed**, including Client and Provider messaging                                                                                    |
| Existing Auth                  | Passed, including nine role-match outcomes                                                                                                             |
| Existing identity verification | Passed, including 16 direct guarded routes                                                                                                             |
| Existing workspace/layout      | **84 layouts passed**                                                                                                                                  |
| Source compatibility           | 30 unchanged functions and 137 protected application/SQL files vs reviewed PR #21; original query/read/insert contracts and six Auth helpers preserved |
| Formatting/syntax/scope        | Passed                                                                                                                                                 |

Evidence: [focused log](../validation/focused.txt), [assertion/axe counts](../validation/focused.json), [functional log](../validation/functional.txt), [functional results](../validation/functional.json), [Auth](../validation/auth.txt), [identity](../validation/identity.txt), [layouts](../validation/layout.txt), [source contracts](../validation/contract.txt).

Final results and measured bounds are recorded alongside this report in [responsive-metrics.json](responsive-metrics.json), [source-contract.json](source-contract.json) and the existing [validation directory](../validation/). The new focused checks add all nine requested viewport combinations, composer visibility, independent list scrolling, restored draft counters on desktop/phone, pending/confirmed/failure/reconciliation counters and zoom-equivalent keyboard access. Existing scroll tests also check resize/tab-resume preservation and ensure incoming polling does not move the outer page. All existing focused assertions remain in place.

Changed implementation files are only `igotu_v2/css/client-messages.css` and `igotu_v2/js/client-messages.js`. Focused tests and this existing PR's documentation/evidence are updated. HTML, illustration, Provider Messages, shared styles, Auth/profile/identity/backend modules, all other pages and SQL are unchanged. Source checks compare 30 unchanged functions and 137 protected application/SQL files against the reviewed PR #21 commit, in addition to the original PR #20 contract checks.

## Limits

All testing uses isolated synthetic SDK fixtures with outside traffic blocked. No staging/production data, live Supabase reads/writes/read-status updates, SQL, schema/RLS/RPC/Storage/Auth configuration changes, deployment or merge. Real backend authorization/constraints and physical iOS/Android keyboard behavior remain unverified. The 390×430 viewport and a synthetic visual-viewport resize event exercise the existing keyboard handler; it is not a physical keyboard test. The 683×384 viewport approximates CSS reflow at 200% zoom on 1366×768; browser chrome and actual browser zoom were not exercised. Axe does not replace full manual screen-reader review.

Drafts remain memory-only and existing retry uniqueness still relies on the previously reviewed backend constraints. No new persistent storage, fields, APIs, dependencies or messaging features are introduced.
