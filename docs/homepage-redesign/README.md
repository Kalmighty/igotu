# IGotU homepage: spacing and motion review (draft PR #12)

The same green-and-white design now has larger content and comfortable spacing. The curved student photo, five service ideas, seven categories, illustrative recommendations, four-step guide, benefits and green closing banner are retained. The page is deliberately scrollable rather than compressed into one screen.

## Review the actual browser output

- **[Updated full desktop](screenshots/homepage-1536.png)** · **[Updated full mobile](screenshots/homepage-390.png)**
- [Desktop viewport](screenshots/desktop-viewport.png) · [Mobile viewport](screenshots/mobile-viewport.png)
- [1440px](screenshots/homepage-1440.png) · [1024px](screenshots/homepage-1024.png) · [768px](screenshots/homepage-768.png) · [320px](screenshots/homepage-320.png)
- [Hero](screenshots/hero.png) · [Mobile hero](screenshots/hero-mobile.png) · [Helpful Right Now](screenshots/helpful-right-now.png) · [Categories](screenshots/categories.png) · [Recommendations](screenshots/recommendations.png) · [How It Works](screenshots/how-it-works.png)
- **[Short browser-recorded animation preview (MP4)](homepage-motion.mp4)**. Actual Chromium screencast frames, encoded locally with ffmpeg; not simulated animation artwork. It shows the hero entrance, service/card hover, scrolling, categories, process, benefits and CTA. Open or download the file in GitHub.

All screenshots are actual local Chromium renders with reduced motion for reproducibility. No real users, private records or Supabase data appear. The video uses normal motion and only local static content.

## Before and after

The previous PR #12 screenshots and validation record are preserved unchanged from `f7069cd84eba49b6fa0a931f660171c184e54b1f`.

| View | Before | After |
| --- | --- | --- |
| Full desktop | [Previous 1536px capture](before/homepage-1536.png) | [Updated 1536px capture](screenshots/homepage-1536.png) |
| Full mobile | [Previous 390px capture](before/homepage-390.png) | [Updated 390px capture](screenshots/homepage-390.png) |
| Hero | [Previous](before/hero.png) | [Updated](screenshots/hero.png) |
| Service feed | [Previous](before/helpful-right-now.png) | [Updated](screenshots/helpful-right-now.png) |

Measured at 1536px in local Chromium:

| Element | Before | After |
| --- | ---: | ---: |
| Main content width | 1432px | 1328px |
| Hero height | 282px | 540px |
| Main heading | 44px | 66px |
| Section heading | 23px | about 40px |
| Service photo height | 72px | 172px |
| Service description | 12px | 16px |
| Service-card gap | 14px | 24px |
| Category tile height | 63px | 124px |
| Illustrative avatar | 43px | 66px |
| Hero button height | 37px | 52px |
| Gap before category section | 18px | about 100px |

[Computed measurements at all six widths](spacing-comparison.json). Full desktop height is now 3538px rather than 1143px; this is an intentional consequence of the approved spacing refinement. Mobile service cards form one readable column; categories wrap, recommendations stack and process steps reflow. Wide recommendation and process grids now occupy separate rows so their larger text and padding have adequate room.

## Motion and interaction

- Finite hero entrances for heading, description, staggered buttons, service examples and photograph.
- One-time scroll entrances for section headings, feed/category/recommendation cards, process steps, benefits and CTA. IntersectionObserver adds effects only as elements enter view; offscreen elements never depend on JS to become readable.
- 450ms entrances with a 14px translation; 70ms stagger, capped at 210ms. No looping floating effects, autoplay carousel, flashing or continuous motion.
- 220ms hover transitions: service cards lift 5px, photos scale to 1.035, arrows move slightly; categories and sample cards receive restrained emphasis. Hover effects are limited to fine pointers. Keyboard focus receives equivalent clear feedback.
- Button feedback, navigation underline transitions and a short mobile-menu fade. Enhanced mobile navigation overlays the page instead of moving its content; closing links immediately become inert. Without JS the original in-flow navigation remains available.
- A small head bootstrap establishes the collapsed mobile state before first paint. If the deferred script fails, fallback navigation is restored on load or after 2.5 seconds. The motion test deliberately delays the script by 500ms to reproduce the startup race.
- Reduced-motion CSS disables animation, transitions and smooth scrolling. JS also disconnects the reveal observer. Focus cancels a pending entrance immediately, so navigation is never blocked while an effect runs. A finite animation still ends visibly if later JS fails.

No new application libraries, fonts, image downloads or network dependencies. The six original WebP assets are unchanged and still total **181,482 bytes**. They are original generated illustrations, not real Provider portraits, service availability or booking evidence. The original IGotU mark and local SVG/CSS artwork remain.

## Functionality and security boundary

Branch: `feat/homepage-reference-redesign`. This remains the same stacked draft PR based on `igotu-homepage-service-explorer-20261028` (PR #8). Existing PRs #2/#8/#9/#10 and the separate security candidates are untouched.

Only existing homepage application files change: `index.html`, `css/home.css`, `js/home.js`. No Auth, identity-verification guard, configuration, matching, dashboard, SQL or Storage code changes. [Refinement scope proof](refinement-scope.json) compares application and SQL files with the previous PR #12 commit. The [original protected-file comparison](protected-files.json) against the homepage base is retained too.

All five service ideas, seven category tiles and registration CTAs retain the same existing `register.html` destination, Client guidance and Login path. The existing role selector remains the user's choice. No request/category state is injected into private forms, no role is granted by a link and no private data is fetched. Clients still complete the normal registration/login and mandatory verification before the unchanged request/matching workflow. The category explorer still only focuses supported static tiles.

The illustrative-only disclaimer, descriptive avatars and truthful confirmation/decline, offline-payment and review text remain unchanged. No ratings, availability, distances, live matching claims or public Provider directory were added.

## Executed checks

[Validation JSON](validation.json) · [test logs](evidence/) · [motion observations](evidence/motion-observations.json)

- Homepage smoke and reference suites: **1536/1440/1024/768/390/320px**; no horizontal overflow, clipping, failed images, console errors or external homepage requests.
- Automated axe WCAG A/AA and best-practice checks, closed and expanded disclosures; skip link, focus, mobile menu/Escape, resize focus, all navigation, all seven category shortcuts and all 16 idea/category/CTA registration links.
- Motion suite: all six widths, pointer hover, phone touch navigation, readable targets/text, keyboard interruption, preference changes, finite effects, and no-JS/blocked-script/missing-observer fallback. **Measured CLS = 0** at all six widths, including delayed-script startup. This is a local scripted result, not a physical-device performance guarantee.
- Existing synthetic regressions: **94 functional scenarios**, **84 workspace layouts**, Auth UI suite and mandatory identity-verification suite including **16 direct route gates**.
- Syntax, whitespace, scope/credential-pattern scan and protected-file byte comparisons.

One initial functional run finished 93/94: a Client messaging assertion ran while the fixture still showed “Loading messages…”. The exact case passed on targeted rerun, then the full suite passed 94/94. No messaging code or functional test was changed. Both initial and final logs are retained.

During motion development, an initial fixed-time assertion could observe a newly started finite effect; the suite now waits for actual completion. A slower rerun exposed a real mobile startup layout shift. The pre-paint navigation state and overlay menu fix it; a delayed-script regression check now covers that case. The larger feed also needed screenshot tests to wait for lazy-loaded images and settled navigation rather than a fixed delay.

No live backend integration, physical-device profiling, full manual screen-reader audit or Safari/Firefox testing was performed. No Supabase access, SQL execution, application data/users/files, deployment or merge occurred.

## Reproduce locally

Use the existing locked test tools (`npm ci --prefix tests`) and Chromium (`CHROMIUM_PATH` may select its executable). From the repository root:

```sh
python -m http.server 4178 --bind 127.0.0.1 --directory igotu_v2
```

In another terminal:

```sh
UI_BASE_URL=http://127.0.0.1:4178 node tests/home-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4178 UI_SCREENSHOTS=work/homepage-reference node tests/home-reference.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/home-motion.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/auth-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/mandatory-verification.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/system-functional.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/ui-smoke.cjs
```

To also capture a new browser preview, set `UI_MOTION_PREVIEW=work/homepage-motion.mp4` for the motion suite; it requires `/usr/bin/ffmpeg`. It writes captured frames/video locally and never contacts Supabase. The reference and motion suites require loopback origins and block remote requests. Screenshots use reduced motion; the preview enables normal motion. All other application test requests use synthetic fixtures.
