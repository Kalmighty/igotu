# Verification UI validation

All results use actual Chromium renders and synthetic, intercepted SDK responses. No real MyKad/passport documents, staging/production accounts, live Supabase operations or SQL were used.

| Check                           | Result                                                                                                                         | Evidence                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Focused Client/Provider UI      | **441 assertions passed**                                                                                                      | [Log](validation/focused.txt), [counts](validation/focused.json)         |
| Focused accessibility           | **37 axe WCAG A/AA scans, zero reported violations**                                                                           | [Counts](validation/focused.json)                                        |
| Existing mandatory verification | Passed, including 16 direct guarded routes, submission/resubmission, roles and Admin review                                    | [Log](validation/identity.txt)                                           |
| Existing Auth                   | Passed, including nine role-match outcomes                                                                                     | [Log](validation/auth.txt)                                               |
| Existing functional suite       | **94 passed, zero failed**                                                                                                     | [Log](validation/functional.txt), [results](functional.json)             |
| Existing workspace/layout       | **84 layouts passed**                                                                                                          | [Log](validation/layout.txt)                                             |
| Source compatibility            | **216 protected application/test/SQL files unchanged**, six stable helpers, original queries/payloads/fields/privacy preserved | [Log](validation/contract.txt), [proof](validation/source-contract.json) |
| Admin CSS/render                | Entire original shared CSS prefix unchanged; Admin queue render pixel-identical                                                | [Browser image hashes](validation/admin-style-proof.json)                |

## Responsive and state coverage

Approved/incomplete states for both roles are measured and scanned at 1920×1080, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 and 320×800. [Responsive measurements](responsive-metrics.json) record page width, status card, stepper and header/Continue controls. No horizontal overflow; status cards fill the content width; primary controls are at least 44px tall. Short viewports use ordinary page scrolling, not fixed controls or overlays.

Both roles additionally cover not submitted, pending, rejected and approved/completed at desktop/phone sizes. Assertions check truthful completed/current steps, absence of workspace navigation when unapproved or stale, correct relative role-specific dashboard/onboarding routes, actual account data and timestamps, unchecked consents and optional Provider fields. Missing/invalid review evidence fails closed through the original approval predicate; missing data is not invented.

Other checks cover missing note/dates/phone, long email/note and HTML-shaped text, PNG preview/removal/keyboard focus, unsupported/SVG and oversize rejection, original private upload options, last-four-only insert fields, optional Provider payloads, confirmed reset, pending duplicate blocking, resubmission after rejection, returned/transport failures, lost committed insert response without unsafe document deletion, in-flight upload/submit locks, refresh coalescing, preserved input/files/consent, stale/initial refresh errors, logout, no-session/wrong-role access and finite/reduced motion. Existing mandatory tests retain JPEG/PNG/PDF validation and PDF upload coverage; the six upload/validation/preview helpers remain source-compatible.

Axe scans cover both roles at every requested width, all main states, missing/long data, stale approval and upload previews. Native labels, focus indicators, step semantics, live announcements, file-choice focus and keyboard navigation are exercised. Physical device/mobile keyboard testing, Safari/Firefox and a full manual screen-reader review were not performed. Automated scans do not prove complete accessibility.

The Admin comparison rendered the same controlled queue with original versus appended CSS. Only matching hashes are retained; no Admin document/identity screenshots were saved. The protected-source check also verifies all existing Admin HTML/JS and existing tests remain unchanged.

## Reproduction

The approved base commit must be available locally for before screenshots. Reuse dependencies pinned in tests/package-lock.json and Chromium. In this workspace no dependencies/lockfiles changed; NODE_PATH reused an existing install.

```sh
python -m http.server 4211 --bind 127.0.0.1 --directory igotu_v2
# In another shell, from the repository root:
export UI_BASE_URL=http://127.0.0.1:4211
export NODE_PATH=/workspace/work/igotu-service-calendar/tests/node_modules
node tests/identity-verification-contract.cjs
node tests/identity-verification-ui.cjs
node tests/mandatory-verification.cjs
node tests/auth-smoke.cjs
SYSTEM_RESULTS=docs/identity-verification-ui/functional.json node tests/system-functional.cjs
node tests/ui-smoke.cjs
```

The focused harness requires loopback, intercepts SDK traffic and blocks outside requests. Existing suites keep their assertions and fixtures. A development functional run caught that definite coded insert rejections must retain the original form-recovery path; the final logic separates that acknowledged rejection from thrown/uncoded transport uncertainty, and all 94 cases pass. No assertion was removed to accommodate the redesign.

Screenshots prepend a test-only synthetic label and redact the identification input. Layout measurements are taken before that label is inserted. Preview samples contain “NOT AN ID DOCUMENT”; they are not real personal documents or live evidence.

## Limits

The fixture adapter simulates transport, ownership/state and acknowledgement outcomes; it does not execute or prove PostgreSQL/RLS/Storage policies, actual approval races, signed document access, retention cleanup, network expiry or deployed uniqueness. No live staging verification is claimed. Existing backend contracts and approval gates remain the authority.

The conservative uncertain-submission lock is memory-only. An unresolved same-page attempt cannot resubmit automatically, but reloading loses its local uncertainty marker; safe at-most-once behavior still depends on the existing server pending-request protections, which were not verified live here. A successful status refresh can establish current account pending/approval status, not prove the identity of an arbitrary earlier attempt. Uploaded orphans after interruptions need separately reviewed cleanup. No endpoint, database constraint, automatic approval, identity history rewrite or account-status mutation was added.

No Supabase schema, SQL, RPC, RLS, Storage or Auth configuration was changed. No deployment or merge. The branch is stacked on approved PR #22 commit `4a3630d8dedb6b93dc9e322fc0a71a3fe0cd36c4`; the new Draft PR and final commit are reported in the handoff. Work stops before other IGotU interfaces.
