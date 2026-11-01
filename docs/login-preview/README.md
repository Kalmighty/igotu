# Login interface and animated service preview

This review candidate recreates the supplied login reference in IGotU's existing green-and-white identity. The familiar Client, Provider and Admin controls remain native buttons wired to the original role-selection and authentication modules.

**Branch:** `feat/login-service-preview`

**Base:** `feat/homepage-reference-redesign` at `00ab4ccc330dc7e192d75e20155f0e99d4b6b461` (draft PR #12). This is a separate stacked review; PR #12 and other open PRs are untouched. Nothing has been deployed or merged.

## Actual visual review

- [Full desktop, 1536px](screenshots/login-1536.png) · [Desktop viewport](screenshots/desktop-viewport.png)
- [1440px](screenshots/login-1440.png) · [1024px](screenshots/login-1024.png) · [768px](screenshots/login-768.png)
- [Full mobile, 390px](screenshots/login-390.png) · [Narrow mobile, 320px](screenshots/login-320.png)
- [Login-card close-up](screenshots/login-closeup.png) · [Mobile login close-up](screenshots/login-mobile-closeup.png)
- [Static workflow preview](screenshots/workflow-static.png) · [Synthetic error state](screenshots/synthetic-error.png)
- **[Actual browser recording of the working animation (MP4)](workflow-demo.mp4)**

The screenshots are rendered Chromium output with reduced motion for reproducibility. The approximately 13-second recording shows the real HTML/CSS preview with normal motion; it has no audio. It is a review artifact, not an embedded video asset in the application.

Compared with the reference, the page retains the logo/header, outlined account action, centered italic welcome heading, three mint/cream/forest role cards, illustrated student and floating service panel, white login card, green decoration and responsive hierarchy. The form is on the right at desktop widths. On phones it follows the compact role selectors and precedes the decorative preview in both DOM and visual order.

Deliberate differences: the student image is original generated artwork; the panel uses functional HTML/CSS scenes rather than a GIF badge; illustration disclosure, playback controls and a readable transcript are included. The complete desktop page is about 1233px tall, allowing more room for controls and the stable role-specific form description. This is a qualitative visual comparison, not a claim of pixel-identical reproduction. Common laptop users can see the form without first scrolling through the promotional panel.

## Working animation

The preview is a **10.8-second HTML/CSS/SVG loop**, not a static placeholder:

1. Create a request (Room Cleaning, Laptop Repair or Tutoring as service ideas).
2. Receive illustrative Provider recommendations using skills, time preferences and relevant location context.
3. Choose one Provider.
4. The selected Provider can confirm or decline.
5. Track progress after confirmation; record offline payment and review.
6. IGotU: “Your request. Your match. Your choice.”

A local original WebP illustration provides the student/background. All interface cards, icons and transitions are actual browser elements. No external GIF, stock video, animation library, Provider identity, rating, distance, availability or booking statistic is used. The figure explicitly says it is illustrative and contains no live activity.

Pause/Play freezes and resumes the same timeline. Next step pauses and advances the static storyboard, including for reduced-motion users. Playback stops when the canvas is offscreen or the document becomes hidden. Returning does not override a user's deliberate pause. Changing reduced-motion preference stops automatic motion; restoring normal motion does not force autoplay. Offscreen handling uses IntersectionObserver; background behavior uses the standard document visibility event. There are no JS animation polling intervals.

The scene text is decorative to screen readers, avoiding repeated announcements while it loops. A native expandable transcript provides the complete workflow. Important information and the login form remain available if the optional animation script or image fails. With all JS disabled, the illustration/transcript are static; authentication still needs its original application JavaScript.

The image has a fixed, reserved aspect ratio. An automated delayed-image test verifies that its arrival does not resize or reposition the canvas. A successful CSS animation does not depend on image decoding.

## Form usability, without replacing authentication

- New show/hide password button with an accessible name and pressed state. It changes the input type only; it never reads, logs or stores the password value. Passwords re-mask on submit, role change, page hide or window blur without clearing input.
- Existing email/password IDs, input types, autocomplete, required flags, login form/submit/status attributes and all role-control attributes are preserved exactly.
- Role selection retains deliberate keyboard focus, updates the original polite form description and preserves typed fields. Reserved description height prevents role-change jumps in tested layouts.
- The spinner appears only when the original Auth module sets `aria-busy=true` during an actual login attempt. Existing button/role locks, messages, validation, cleanup, success handling and redirects are unchanged. Reduced-motion users retain the text loading cue.
- Brief 420ms entrances, 220ms hover/focus transitions, a 4px role-card lift and a restrained error fade. No entrance hides content permanently; focus interrupts it, and reduced-motion CSS disables the effects.

No changes to `auth.js`, `auth-roles.js`, `supabaseClient.js`, shared CSS, registration, password recovery, session handling, role validation, identity verification, onboarding, matching, dashboards, SQL, Storage or configuration. The real account's fetched role still controls routing. Selecting a card grants nothing. All nine role/account combinations still pass their original synthetic tests: three matches accepted and six mismatches rejected with cleanup.

[Protected-file hashes and control comparison](protected-files.json) verify **326 other existing files** against the base. The only existing application file changed is `igotu_v2/login.html`. New application files are `css/login.css`, `js/login-preview.js`, `assets/login/student-preview.webp` and `assets/login/login-leaves.svg`. All new styling is loaded by and scoped to the login page; registration and the homepage retain their existing assets.

## Executed validation

[Validation JSON](validation.json) · [test logs](evidence/) · [preview results](evidence/preview-results.json)

- New preview suite at **1536, 1440, 1024, 768, 390 and 320px**: no horizontal overflow/clipping; correct form/preview order; keyboard role selection and stable form height; input retention; password controls; all six manual scenes; reduced motion; axe WCAG A/AA and best-practice checks.
- Genuine time-based scene playback; user pause/resume; actual offscreen IntersectionObserver behavior; simulated document-visibility events; preference changes; preserved deliberate pause; script/image failure and no-JS static fallback.
- Busy spinner, frozen roles, submit re-masking and error recovery exercised through the unchanged Auth module with synthetic credentials/responses.
- Real navigation to both registration links, password recovery and the homepage. No signup, recovery email or real account operation was performed.
- Existing Login/Register suite: all nine role combinations, validation, sign-out failures, fail-closed retries, missing/suspended profiles, onboarding, registration roles/Admin rejection and no-JS fallback.
- Existing **94 functional scenarios**, **84 workspace layouts**, mandatory identity-verification suite including **16 guarded routes**.
- Real pinned Supabase SDK with all responses intercepted: normal/failed/thrown sign-out cleanup; cross-tab sign-out and invalid-refresh locking. Host-shaped fixture URLs are fulfilled in the browser and never reach a Supabase project.
- JavaScript syntax, whitespace, exact file-scope/credential-pattern scan and protected-file comparisons.

During development, the initial decorative pseudo-element caused overflow and the shared mobile Admin layout conflicted with compact selectors. Both were corrected locally without changing shared styles. Scene fitting tests also caught cramped storyboard layouts at 768/320px. A reduced-motion assertion now waits for the browser's media-change event rather than assuming synchronous delivery. The optional SDK check initially needed the installed dependencies exposed at the worktree's test path; its final runs pass. No Auth logic or backend repair was needed.

## Reproduce safely

Install the existing locked **test-only** dependencies (`npm ci --prefix tests`). Chromium is selected with `CHROMIUM_PATH`, default `/usr/bin/chromium`. Start a loopback server from the repository root:

```sh
python -m http.server 4182 --bind 127.0.0.1 --directory igotu_v2
```

In another terminal:

```sh
UI_BASE_URL=http://127.0.0.1:4182 UI_SCREENSHOTS=work/login-preview/screenshots node tests/login-preview.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/auth-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/mandatory-verification.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/system-functional.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/ui-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4182 node tests/auth-sdk-lifecycle.cjs
```

Set `UI_PREVIEW_VIDEO=work/login-preview/workflow-demo.mp4` for the new suite to record a browser preview too; `/usr/bin/ffmpeg` encodes captured frames. The suite requires a loopback origin and aborts remote requests. Authentication responses are fixtures provided by the test harness, never application code.

## Limits and safety boundary

No live Supabase authentication, database, RLS, Storage, account creation or staging/production data was accessed. No migrations, deployment, merge or modifications to other PRs. The public Supabase changelog request was denied by the managed proxy (CONNECT 403); it was not bypassed. No Supabase API or security behavior was changed, and existing SDK behavior was verified offline.

Background-tab checks simulate the standard visibility event; native OS tab/background and physical-device profiling remain unverified. Safari/Firefox and a full manual screen-reader audit were not performed. Automated axe and Chromium tests do not prove live backend authorization. Any deployment or live integration validation needs separate authorization.
