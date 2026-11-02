# Client Edit Profile validation

All tests used synthetic identities, a loopback server, the real application modules and controlled SDK/Storage fixtures. No live backend reads/writes, SQL execution, Supabase configuration, accounts, deployment or merge were performed.

| Check                       | Result                                                                                                                              | Evidence                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Focused profile/media suite | **158 assertions passed**                                                                                                           | [Log](validation/focused.txt), [JSON](validation/focused.json)          |
| Accessibility               | **15 axe scans, zero reported violations**                                                                                          | [Counts](validation/focused.json)                                       |
| Existing functional suite   | **94 passed, 0 failed**                                                                                                             | [Log](validation/functional.txt), [JSON](validation/functional.json)    |
| Auth smoke                  | Passed, including nine role-match outcomes                                                                                          | [Log](validation/auth.txt)                                              |
| Identity verification       | Passed, including 16 direct guarded routes                                                                                          | [Log](validation/identity.txt)                                          |
| Existing workspace/layout   | **84 layouts passed**                                                                                                               | [Log](validation/layout.txt)                                            |
| Source/contract scope       | **136 protected files unchanged**, original personal RPC/validation/owned read, five other Client pages only opt into media display | [Log](validation/contract.txt), [JSON](validation/source-contract.json) |
| Candidate migration syntax  | 28 outer SQL statements and both PL/pgSQL bodies parsed; **not executed**                                                           | [Parser result](validation/sql-parse.json)                              |

## Focused coverage

Eight viewport combinations: 1920×1080, 1536×1000, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 and 320×800. [Responsive bounds](responsive-metrics.json) cover the banner, avatar overlap, picture/banner buttons and Save control. Every width has no horizontal overflow, readable cards and touch-sized controls. Mobile keeps the approved in-flow menu and stacked page structure.

The browser suite exercises real identity data, default appearance, all template galleries, local-only selection/cropping, native dialog focus/Escape restoration, keyboard crop sliders, source type/header/size rejection including SVG, safe WebP processing/size bounds, custom banner settings, default resets, fixture persistence after reload, same immutable upload-key retries, lost upload/save responses, duplicate-submit locking, upload/save failures, partial personal/appearance success, cross-tab version conflicts and explicit recovery, superseded-file cleanup/failure, unavailable/foreign media responses, safe long names, dirty Cancel/navigation and unauthorized roles. Confirmed topbar and account-dropdown template avatars are checked on all six requested Client pages.

Axe scans cover every viewport and avatar/banner/custom/crop/invalid-file/long-name dialogs/states. The first development scan found insufficient inherited account-note text contrast; the page-scoped color was corrected. Final scans report zero violations. Physical mobile keyboards, Safari/Firefox, browser zoom and a complete manual screen-reader session remain unverified.

Existing functional tests initially reported the new media getter as an unsupported fixture RPC. The system fixture now provides a read-only initial/default response for that recognized contract. No existing test expectations or assertions were removed or loosened. The final standalone functional run passed all 94 cases. The Auth, identity, Provider Messages and other existing business sources remain unchanged.

## Reproduction

Use dependencies pinned in tests/package-lock.json and Chromium. In this workspace NODE_PATH reuses the installed dependency tree; no package/lockfile changes were needed. From the repository root:

```sh
python -m http.server 4210 --bind 127.0.0.1 --directory igotu_v2
# In another shell:
export UI_BASE_URL=http://127.0.0.1:4210
export NODE_PATH=/workspace/work/igotu-service-calendar/tests/node_modules
node tests/client-edit-profile-contract.cjs
node tests/client-edit-profile-preview.cjs
SYSTEM_RESULTS=docs/client-edit-profile/validation/functional.json node tests/system-functional.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
```

The focused harness uses an additional synthetic adapter for media RPCs/objects, while personal information and existing workflows use the original fixture transport. Its saved paths, operation/version checks, fixture signing and policy-like restrictions simulate expected contracts; they are not PostgreSQL execution or RLS proof. The test creates a labelled synthetic source image in canvas; no real person photo is used.

## Limits and review boundary

The appearance backend candidate has not been applied. Media controls fail closed when its read contract is missing, while existing personal information saving remains usable. No real upload, persistence after a real server reload, signed URL expiry, concurrent database transaction, RLS, Storage ownership/deletion or live role/identity restriction was verified. The separate [backend review](BACKEND_REVIEW.md) lists the required approval and integration work.

Browser canvas processing discards the original file's metadata; it is not a server image-content validation service. Storage checks use owner/MIME/size metadata, and real enforcement needs isolated backend tests. Signed URLs live for five minutes and can remain usable until expiry after revocation. Crop/draft/retry state is memory-only; crashes can leave private unreferenced objects for later reviewed cleanup. Confirmed replacements request Storage cleanup only after server acknowledgement and protect the current image.

The new branch is based on approved PR #21 commit 60e3b56523265c75f981e380a50fa1209b190502. Latest commit SHA and the new Draft PR link are in the PR handoff. Existing PRs remain unchanged; this task stops before Provider redesigns.
