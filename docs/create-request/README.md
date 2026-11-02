# Create / Edit Service Request design review

Stacked on the reviewed Client Dashboard, PR #17, commit `5103c13c29ffd2989553c52cec3a10be11e05f04`. Branch: `feat/create-request-experience`. Only the Client Create/Edit Service Request page is redesigned. PR #17 and its dashboard/shared files are unchanged.

## Design and intentional differences from the reference

The page reuses the approved forest-green sidebar, official U mark, white account topbar and dashboard shell stylesheet. New page-scoped CSS supplies the wide form, secondary guidance cards, mint section icons, responsive controls and local decorative checklist illustration. On narrower layouts the form precedes guidance; there are no sticky overlays. Desktop entry animation is finite; reduced-motion preferences remove it. The illustration disappears on small phones.

The reference is a visual guide. The working form retains:

- **One** optional JPEG, PNG or WebP image, maximum **5 MiB** (displayed as 5 MB). Selection, preview and removal are keyboard operable. Clearing a local replacement restores the existing saved preview and does not delete a stored object.
- Existing Description, with an unlimited character count; no invented Notes field or 500-character restriction.
- Required Normal/Urgent Priority; optional non-negative RM budget with the existing decimal precision.
- Native preferred-date/time fields, unchanged values and timezone semantics. Display format follows the user's browser/locale; screenshots use the test browser's native format.
- **Post Request & Find Providers**, followed by the existing recommendations route. Guidance describes recommendations, selection and Provider confirmation/decline accurately.
- Owned pending-request edit mode, **Save Changes**, and the existing request-details redirect.

The upload component uses a single native file chooser, not drag-and-drop or multiple uploads. Map controls receive more room than the reference's small map.

## Targeted location validation correction

The old page installed the default Kota Kinabalu marker/coordinates immediately. A manually typed address could therefore be submitted with the default or stale point. Delayed reverse-geocoding responses could also overwrite a newer address.

The map now opens without a selected pin or saved coordinates. Search, GPS, a map click/marker drag, or valid saved coordinates from an owned editable request establishes the selection. Manually editing the address clears the point and requires selecting its matching location again. Null/blank, non-finite and out-of-range coordinates are rejected; a snapshot of the selected address/point must match the submitted values. Search/GPS pending states block submission. Version checks ignore obsolete asynchronous results. Programmatic address selection emits a change event so any earlier required-field guidance clears immediately.

A chosen point remains usable when reverse geocoding fails: its human-readable coordinate label is displayed, with a clear lookup warning, while the existing seven-decimal coordinate payload is retained. Low-accuracy GPS retains the existing warning/adjust-pin behavior; it does not introduce a new rejection threshold. GPS is requested only through the existing Use GPS action. ResizeObserver calls Leaflet invalidateSize after layout changes, with a window-resize fallback.

The form remains disabled until the existing workspace guard, active Client profile and any owned edit request have loaded. This is a UI readiness lock; shared authentication, identity verification, backend compatibility and authorization guards remain unchanged.

## Business-flow and privacy boundaries

The source contract test verifies byte-identical idempotency, RPC create/update, request ownership/status lookup, image validation/upload/association, session/profile and submission functions against PR #17. The creation key still survives uncertain failures. A committed request with an image-attachment failure enters edit recovery; retry updates/attaches to that request instead of creating another.

Image object-URL previews are released when replaced/removed or the page exits. Saved previews still use the existing safeUrl filter. **This branch inherits the base branch's getPublicUrl upload/association contract. It does not implement the separate private-request-images candidate or claim that legacy image storage is private.** No SQL, Storage policy, bucket, grant, RPC definition or Supabase setting is changed.

The optional presentation script adds native-validity hints, an unsaved-Cancel dialog, a character count, finite entrances and feedback derived from the real submit state. It has no SDK/network/storage calls and no submission handler. Core posting is also tested with that script unavailable.

## Visual evidence

Every capture contains a test-only OFFLINE REVIEW banner. Names, records, image bytes, map tiles, geocoder responses and GPS positions are synthetic. The banner and fixtures are not shipped in the application.

| Evidence | Files |
| --- | --- |
| All required layouts / full form | [1920](screenshots/create-1920.png), [1536 desktop](screenshots/create-1536.png), [1440](screenshots/create-1440.png), [1366 desktop](screenshots/create-1366.png), [1024](screenshots/create-1024.png), [768 tablet](screenshots/create-768.png), [390 mobile](screenshots/create-390.png), [320 mobile](screenshots/create-320.png) |
| Exact base before redesign | [1536 before](before/create-1536.png), [390 before](before/create-390.png) |
| Category, type, date/time and selected point | [Filled form](screenshots/category-location-filled.png) |
| Single-image selection | [Desktop](screenshots/image-preview.png), [Mobile](screenshots/image-preview-390.png) |
| Validation and failure | [Unconfirmed location](screenshots/validation-error.png), [Map unavailable](screenshots/map-unavailable.png) |
| Submission and editing | [Saving](screenshots/saving.png), [Success before redirect](screenshots/creation-success.png), [Owned edit](screenshots/edit-request.png) |

Full-page shots are intentionally tall so the complete form and guidance are reviewable. See [validation report](VALIDATION.md) for results and limits.

## Reproduce safely

Install the pinned dependencies from `tests/package-lock.json` in the testing environment only. Use Chromium or set CHROMIUM_PATH. Serve only local files:

```sh
python3 -m http.server 4206 --bind 127.0.0.1 --directory igotu_v2
# In a separate terminal, from the repository root:
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4206
node tests/create-request-contract.cjs
node tests/create-request-preview.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
SYSTEM_RESULTS=docs/create-request/validation/functional.json node tests/system-functional.cjs
```

The focused browser runner requires a loopback origin and intercepts backend, external map, geocoder and GPS operations. Unexpected external requests are aborted and reported as failures. Existing suites also use fixtures. Do not open the actual application against live credentials as a substitute for these tests.

## Changed-file scope

- `igotu_v2/client/create-request.html`: page markup and approved shell reuse.
- `igotu_v2/css/client-create-request.css`: isolated presentation, responsive and reduced-motion rules.
- `igotu_v2/js/client-create-request-ui.js`: optional UI enhancement.
- `igotu_v2/js/client-create-request.js`: targeted location safety/readiness and local preview lifecycle corrections.
- `igotu_v2/assets/create-request/checklist.svg`: original local decorative illustration.
- `tests/create-request-preview.cjs`, `tests/create-request-contract.cjs`: focused synthetic and source-contract coverage.
- `tests/system-functional.cjs`: request fixture now selects its point through the real Search control instead of injecting hidden coordinates; existing assertions/cases remain intact.
- `docs/create-request/`: review documentation, synthetic screenshots and validation evidence.

No production/staging access, real requests, image uploads, SQL, migrations, deployment or merge was performed. Live RLS, Storage authorization, real GPS/geocoding, physical-device file selection, browser-specific date controls and assistive-technology speech remain outside these offline results.
