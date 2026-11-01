# Final login UI/UX refinement — PR #13

The approved appearance and animation remain. This change reduces the space above sign-in, balances the three role cards, gives the form 45% of the desktop content width and enlarges small functional/guidance text.

Baseline: `17ec4d7826724c56d7ca3642eef58f941d9f78b7`. Branch: `feat/login-service-preview`. PR #13 stays draft; PR #12 and other branches are untouched.

## Actual before/after browser comparison

| View | Before | After |
| --- | --- | --- |
| Full desktop | [Original PR #13](../before-refinement/login-1536.png) | [Refined full desktop](../screenshots/login-1536.png) |
| Full mobile | [Original PR #13](../before-refinement/login-390.png) | [Refined full mobile](../screenshots/login-390.png) |
| 1536 × 864 viewport | [Before](before-1536x864.png) | [After](after-1536x864.png) |
| 1366 × 768 viewport | [Before](before-1366x768.png) | [After](after-1366x768.png) |

[Login close-up](../screenshots/login-closeup.png) · [Mobile close-up](../screenshots/login-mobile-closeup.png) · [Refreshed browser-recorded animation](../workflow-demo.mp4)

All captures use the actual application with synthetic fixtures. Screenshots use reduced motion for reproducibility. The video records the working CSS animation with normal motion; it is not an application video/GIF replacement.

## Measured form access

Measurements use a fresh local Chromium context, no zoom, page scrolled to the top, default Client section, decoded illustration and reduced motion. The “space above form” is its viewport Y coordinate, including the header. The comparison runner fulfills the original HTML/CSS directly from the baseline Git commit; it does not approximate the old layout.

| Viewport | Form top before → after | Reduction | Login button bottom before → after | Scroll needed before → after |
| --- | --- | --- | --- | --- |
| 1536 × 864 | 567.1 → 477.6px | 15.8% | 986.7 → 853.8px | 123 → **0px** |
| 1440 × 900 | 563.3 → 476.1px | 15.5% | 982.8 → 852.3px | 83 → **0px** |
| 1366 × 768 | 558.8 → 472.9px | 15.4% | 978.4 → 849.0px | 211 → **82px** |
| 1024 × 900 | 538.8 → 483.5px | 10.3% | 958.4 → 879.7px | 59 → **0px** |
| 768 × 1024 | 384.5 → 345.8px | 10.1% | 808.0 → 746.0px | 0 → **0px** |
| 390 × 844 | 437.3 → 413.3px | 5.5% | 876.3 → 827.5px | 33 → **0px** |
| 320 × 844 | 426.2 → 402.2px | 5.6% | 852.1 → 816.3px | 9 → **0px** |

[Raw measurements](measurements.json) include field positions, card heights, form widths, overflow and layout-shift readings. Scroll is the minimum whole-pixel distance to expose the entire button, without extra breathing room.

**Laptop assessment:** the complete Login button is visible at 1536×864. At 1366×768 the email field is visible immediately, the password field begins near the bottom, and the Login button still needs about 82px of scrolling. That is substantially earlier than the original 211px scroll; the design is not forced into one screen by shrinking fields or touch targets. Browser zoom, OS text scaling and the browser's actual content viewport can change this result.

## Refinements

- Slightly shorter header/welcome spacing and a modestly smaller main heading, retaining the italic green treatment.
- Desktop role cards are consistently about 223px tall, down from about 271px, with aligned headings, descriptions and actions. Client/Provider descriptions remain 15px. The Admin description is shortened to its essential monitoring purpose, preserving meaning while avoiding extra lines.
- The original mint, cream and forest colors remain. Selection still has its checkmark, border and `aria-pressed` state; no meaning relies solely on color.
- Desktop columns are 55% preview / 45% form. At 1536px the form grows from about 493px to 599px. Tablet columns split evenly where appropriate; phones retain the form before the preview in DOM and visual order.
- Labels are 15px on desktop and 14px on phones; inputs remain 16px with at least 48px height. Recovery text is 14px desktop / 13px phone (12px at 320px). Registration guidance is 14–15px, account-role guidance and illustration captions are 13px, preview controls are at least 44px high. Primary Login targets retain their size.
- The illustration keeps sufficient canvas height at narrower desktop widths so all six scenes fit without shrinking their content. Captions and transcript remain readable.
- Selector space is reserved until the **unchanged** role-selection script finishes initializing, removing the observed initial layout shift. Uninitialized selectors remain hidden and unfocusable. A no-JS style retains the prior hidden-selector fallback without reserving blank space.

No animation timing, keyframes or playback JS changes. The 10.8-second loop, six scenes, Pause/Play, Next step, reduced motion, offscreen pause, visibility handling, transcript, finite entrances, hover/focus feedback, password controls, real busy spinner and error feedback remain.

## Security/scope proof

Only `igotu_v2/login.html` and `igotu_v2/css/login.css` change in application code. Existing authentication, role-selection and preview JavaScript are byte-identical. The HTML changes are the shorter Admin presentation text and no-JS fallback style; original form/input/role-button attributes remain identical.

[Protected-file proof](protected-files.json) includes Auth, session, account-status, identity-verification, recovery, shared styles, homepage, all other workspace code, source artwork and SQL. There are no database, RLS, Storage, configuration, matching or workflow changes. No project was contacted and no data/accounts were created.

## Validation and reproducibility

The comparison suite (`tests/login-refinement.cjs`) checks all seven requested widths and both specified laptop sizes, records the actual form/button positions, asserts balanced role cards/actions, stable form height on role changes, preserved fields, zero overflow and negligible initial layout shift. The existing preview suite now includes 1366px and still tests all six scenes and controls at every width. Original authentication/functional/identity tests are unchanged.

With the existing locked test tools installed and a loopback static server running:

```sh
python -m http.server 4182 --bind 127.0.0.1 --directory igotu_v2
```

```sh
UI_REFINEMENT_OUTPUT=work/login-refinement node tests/login-refinement.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/login-preview.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/auth-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/mandatory-verification.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/system-functional.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/ui-smoke.cjs
```

The comparison requires the baseline commit in local Git history. `CHROMIUM_PATH` can select Chromium. Use `UI_PREVIEW_VIDEO=work/login-refinement/preview.mp4` with the preview suite to record it; ffmpeg is required for that optional artifact.

Final runs pass: seven-width comparison/preview/axe checks, all nine synthetic role-login combinations, the mandatory-verification suite including 16 guarded routes, 84 workspace layouts and 94 functional cases. Measured initial layout shift is zero at all seven viewports.

Two earlier full functional runs returned 93/94: one observed a not-yet-displayed recommendation error, and another reported contrast on a Leaflet popup. Each case passed in isolation, and a final standalone full run passed 94/94. The functional runner and affected Client pages/modules/shared stylesheet are byte-identical to baseline. No assertion, application code or security check was removed or weakened. [Initial run](evidence/functional-initial.log), [second run](evidence/functional-second.log), [recommendation case](evidence/recommendation-targeted.log), [popup case](evidence/popup-targeted.log), [final full run](evidence/functional-final.log).

The original SDK cleanup/lifecycle logs remain historical evidence from the initial PR #13 implementation. They were not rerun for this refinement; their underlying SDK/Auth code is unchanged.

These are offline UI/fixture checks, not live Supabase authorization tests. Background visibility events are simulated; offscreen behavior uses the real IntersectionObserver. Native OS background behavior, Safari/Firefox, physical-device profiling and a full manual screen-reader audit remain unverified. No deployment or merge is performed.
