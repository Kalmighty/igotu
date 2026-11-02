# Client Edit Profile and appearance customisation

Branch: `feat/client-edit-profile-customisation`. Based on approved PR #21 head `60e3b56523265c75f981e380a50fa1209b190502`; the new Draft PR targets `feat/client-messages-experience`. Existing stacked PRs are unchanged. This work stops at Client Edit Profile and the requested Client avatar display.

## Interface

The page keeps the approved forest-green sidebar, official logo, white Client Workspace topbar, notifications/account controls, mint hero, rounded white cards and green focus/buttons. Edit Profile remains in the account dropdown, with no added sidebar item. The original local hero illustration uses the same visual language as Messages; the user's personal cover is a separate appearance card.

The appearance card previews a personal cover, overlapping circular avatar and actual account name. Personal Information retains Full Name and Phone Number. Account Information displays real email, user code, role and status as read-only values; it does not invent verification labels. Desktop has two information columns; narrow screens stack them. All screenshot identities/data are synthetic fixtures, never application defaults.

The native picture/banner dialogs support:

- Twelve original local avatar SVGs (eight illustrated characters and four abstract/geometric designs), or the initial derived from the actual name.
- Eight original local banner SVGs: waves, geometry, leaves, gradient, mountains, circles, clean lines and forest professional.
- Allowlisted custom banner background/accent colors and solid/gradient/circles/diagonal patterns with a live preview.
- JPEG/PNG/WebP source images up to 10 MiB; MIME/header checks, image decode and 32-pixel/24-megapixel dimension limits. SVG uploads are rejected. Animated inputs become a still crop.
- Keyboard-operated zoom/horizontal/vertical sliders and a circular avatar or 3:1 banner crop preview. Canvas re-encodes the crop as WebP at 512×512 or 1200×400, discarding original metadata. Processed outputs are limited to 2 MiB for avatars and 5 MiB for banners. Source images are never uploaded directly.

Use Preview changes only the local draft. Save Changes starts uploads and server saves. Cancel restores the last confirmed state after an unsaved-changes confirmation. Navigation/logout warn about unsaved changes; native beforeunload also covers browser navigation when supported. Dialogs use native modal focus containment, Escape, labelled controls and opener restoration. Motion is finite and respects reduced-motion settings.

## Review gallery — synthetic/offline

Actual Chromium renders are labelled **OFFLINE REVIEW · SYNTHETIC ACCOUNT · NO LIVE SUPABASE**. The fixture adapter simulates new media RPCs and private objects; screenshots do not demonstrate deployed persistence or Storage/RLS enforcement.

| View                      | Evidence                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete desktop page     | [1536px](screenshots/profile-1536.png), [1366px](screenshots/profile-1366.png), [1920px](screenshots/profile-1920.png), [1440px](screenshots/profile-1440.png)                                                                                                                                                                                                            |
| Tablet / smaller desktop  | [768px](screenshots/profile-768.png), [1024px](screenshots/profile-1024.png)                                                                                                                                                                                                                                                                                              |
| Phone                     | [390px](screenshots/profile-390.png), [320px](screenshots/profile-320.png)                                                                                                                                                                                                                                                                                                |
| Before redesign           | [1536px](screenshots/before-1536.png), [390px](screenshots/before-390.png)                                                                                                                                                                                                                                                                                                |
| Template galleries        | [12 avatars](screenshots/avatar-gallery.png), [8 banners](screenshots/banner-gallery.png)                                                                                                                                                                                                                                                                                 |
| Cropping                  | [Avatar preview](screenshots/avatar-cropping.png), [banner preview](screenshots/banner-cropping.png)                                                                                                                                                                                                                                                                      |
| Custom design             | [Banner customiser](screenshots/custom-banner-preview.png)                                                                                                                                                                                                                                                                                                                |
| Confirmed fixture saves   | [Templates](screenshots/saved-templates.png), [uploaded crops](screenshots/saved-uploads.png), [success](screenshots/success.png)                                                                                                                                                                                                                                         |
| Loading / saving          | [Appearance loading](screenshots/loading.png), [save in progress](screenshots/saving.png)                                                                                                                                                                                                                                                                                 |
| Failures / partial states | [Invalid mobile file](screenshots/invalid-image-mobile.png), [upload failure](screenshots/upload-error.png), [save failure](screenshots/save-error.png), [partial save](screenshots/partial-save.png), [version conflict](screenshots/version-conflict.png), [cleanup warning](screenshots/cleanup-warning.png), [backend unavailable](screenshots/media-unavailable.png) |
| Other states              | [Unsaved phone values](screenshots/unsaved-mobile.png), [long untrusted name at 320px](screenshots/long-name-320.png)                                                                                                                                                                                                                                                     |

## Saving, retries and Client display

Personal information still uses `complete_basic_profile(p_full_name, p_phone)` with the original required-name/phone validation and minimum seven digits/plus characters. The owned `users` read and shared Auth/active/role/identity/profile gates remain. No browser direct update of `public.users` is introduced.

Appearance uses separate `get_client_profile_media()` and `save_client_profile_media(p_expected_version, p_operation_id, p_settings)` contracts. The new backend is **not applied** by this change. When unavailable, the appearance section fails closed and personal-information saving remains usable; the page never reports an unconfirmed media save as complete.

A single save lock disables editing/submission while saving. Uploads use immutable `<auth-user-id>/<avatar|banner>/<operation-uuid>.webp` paths with upsert disabled. Acknowledged uploads are retained for retry; uncertain upload results reuse the exact key and reconcile a duplicate-path response through authenticated signing. The settings RPC uses an operation UUID and expected version. Lost save responses are checked against the saved operation before confirming success or retrying. A newer version from another tab is preserved; the user's local preview is kept, with an explicit reload/discard route.

Appearance is saved before personal information. If the first operation succeeds and the second fails, the message explicitly says appearance was saved and keeps the entered personal values. Retrying does not repeat the completed appearance change. Existing images are retired only after a confirmed replacement; failed cleanup is reported separately and does not remove the new setting. Interrupted sessions can leave unreferenced private uploads requiring later reviewed cleanup.

The shared Client display helper applies confirmed avatars to the existing topbar and a small account-dropdown identity row on Dashboard, Create Request, My Requests, Request Details, Messages and Edit Profile. It loads only the current user's settings after the existing workspace gate, uses five-minute signed URLs for uploads, refreshes them after four minutes/on visibility, and falls back to the actual name initial. Same-tab events and an account-scoped BroadcastChannel refresh confirmed changes without persisting signed URLs. Other page business logic and decorative hero banners remain unchanged.

## Changed-file summary

| Scope                  | Files                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Edit Profile interface | `igotu_v2/client/edit-profile.html`, `igotu_v2/css/client-edit-profile.css`, `igotu_v2/js/client-edit-profile.js`                   |
| Media model / display  | `igotu_v2/js/client-profile-media.js`, `igotu_v2/js/client-profile-media-display.js`, `igotu_v2/css/client-profile-media.css`       |
| Other Client pages     | Only media stylesheet/module opt-ins in Dashboard, Create Request, My Requests, Request Details and Messages HTML                   |
| Original assets        | `igotu_v2/assets/client-edit-profile/` (hero, 12 avatars, eight banners)                                                            |
| Review-only backend    | `igotu_v2/database/client-profile-media-review/20261102153413_client_profile_media_review_only.sql`                                 |
| Tests                  | New profile preview/source-contract suites; the existing system fixture gains a read-only default response for the new media getter |
| Evidence               | `docs/client-edit-profile/`                                                                                                         |

See [validation](VALIDATION.md) and the [separate migration/Storage review](BACKEND_REVIEW.md). Latest implementation commit and Draft PR link are reported in the PR description and handoff; no deployment or migration is part of this branch.
