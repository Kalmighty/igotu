# IGotU reference homepage review

The public homepage follows the supplied green-and-white reference: centered navigation, curved campus-photo hero with floating service ideas, five photographic “Helpful Right Now” cards, seven compact category tiles, illustrative recommendations beside a four-step guide, a benefits row and a curved dark-green call to action.

## Branch and review boundary

- Feature branch: `feat/homepage-reference-redesign`.
- Base: `igotu-homepage-service-explorer-20261028` at `1f1ebd6dec054c4046e700f2c208c91ae72bc9f6` (draft PR #8).
- Reviewed PR #2's homepage, authentication and workspace UI history; PR #8's category explorer; PR #9's caller-scoped calendar; and PR #10's dashboard polish. All four PRs remain unchanged and unmerged.
- This stacked PR targets the homepage branch to keep its diff limited to the redesign. It does not import the separate dashboard, calendar, assignment-layout or private-image candidates. Integrating those branches remains a separate review decision.
- Existing category explorer and interactive matching explanation are retained as native keyboard-accessible disclosures. The mobile menu, skip link, no-JavaScript navigation, Login/Register actions and role-selection pages remain available.
- Only `igotu_v2/index.html`, `igotu_v2/css/home.css` and `igotu_v2/js/home.js` change in existing application code. No shared dashboard styles, Auth, verification guards, backend contracts, configuration, matching, SQL or Storage code changed. See [byte-for-byte comparison](protected-files.json).

## Request-first discovery

All five inspiration cards, seven category tiles and registration CTAs use the existing `register.html`. The page explains that users should register as a **Client**, with a Login link for existing members. The existing role selector remains the user's choice; Become a Provider goes to that same role-selection page. No query parameter grants a role, no automatic account redirect is added and no service idea is silently carried into a private form. After normal registration/login and mandatory onboarding/verification, Clients use the unchanged request-creation and recommendation workflow and choose their category there.

The seven labels were checked against the existing Client request form: Cleaning, Delivery, Repair, Moving Help, Errands, Tutoring, Other. The explorer only focuses these static tiles. Neither the feed nor the example cards read Supabase, list private requests or provide a Provider directory.

The Provider examples are descriptive avatars rather than real identities. They have no fabricated ratings, distances, availability or verification badges. Hero cards are labelled service ideas with illustrative imagery. The workflow describes Provider confirmation/decline, offline payment recording and reviews accurately.

## Actual rendered screenshots

All images are actual local Chromium renders, without live accounts or backend data. Click an image in GitHub to view/download it.

- [Full desktop, 1536px](screenshots/homepage-1536.png) and [1536 × 1024 viewport](screenshots/desktop-viewport.png)
- [1440px](screenshots/homepage-1440.png), [1024px](screenshots/homepage-1024.png), [768px](screenshots/homepage-768.png)
- [Mobile, 390px](screenshots/homepage-390.png), [narrow mobile, 320px](screenshots/homepage-320.png)
- [Hero](screenshots/hero.png), [Helpful Right Now](screenshots/helpful-right-now.png), [categories](screenshots/categories.png), [illustrative recommendations](screenshots/recommendations.png), [How It Works](screenshots/how-it-works.png)

Compared visually with the user reference: section order, header alignment, green palette, curved photo treatment, card proportions, category row, parallel recommendations/process layout and closing laptop banner are retained. The student photo crop was adjusted specifically for mobile to avoid covering the face with floating cards. At smaller widths the layout reflows; it does not scale down a fixed desktop canvas.

This is not a pixel-identical reproduction. Original imagery, silhouette avatars, the longer truthful example heading/disclaimer, registration guidance and retained expandable controls are deliberate differences. The full desktop page is 1143px tall at 1536px wide; a separate 1024px-tall viewport capture shows exactly what fits in the reference-sized window. There is no pixel-similarity score or fabricated visual acceptance result.

## Image provenance and performance

Six optimized WebP assets total **181,482 bytes**. They were created for this implementation with image generation: an original photorealistic Malaysian-campus student scene and five original service illustrations. They are not scraped stock photos, real Provider portraits or evidence of IGotU bookings. No third-party photograph has been copied from the reference. The unoptimized generated contact sheet is retained locally outside this branch; only web-ready crops are committed. All image metadata was stripped during WebP export. See [asset hashes](validation.json).

The existing IGotU mark is retained. Icons use local inline SVG; the small closing laptop illustration uses local CSS/SVG. There are no external fonts, asset hosts, additional application dependencies, autoplay media or API requests. Hero imagery has high fetch priority; feed images are lazy-loaded. Reduced-motion preferences disable transitions and smooth scrolling.

## Reproduce offline checks

Use the locked existing test dependencies (`npm ci --prefix tests`). This installs test tooling only. Start a loopback static server from the repository root:

```sh
python -m http.server 4178 --bind 127.0.0.1 --directory igotu_v2
```

In another terminal, using Chromium at `/usr/bin/chromium` or setting `CHROMIUM_PATH`:

```sh
UI_BASE_URL=http://127.0.0.1:4178 node tests/home-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4178 UI_SCREENSHOTS=work/homepage-reference node tests/home-reference.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/auth-smoke.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/mandatory-verification.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/system-functional.cjs
UI_BASE_URL=http://127.0.0.1:4178 node tests/ui-smoke.cjs
```

The reference test requires a loopback origin and blocks external requests. It verifies all category shortcuts, all navigation items, expanded-disclosure clipping and axe checks, all 16 registration links, unchanged role choices, real image loading and screenshots. The existing smoke suite retains matching-criterion, no-JS, reduced-motion, menu/Escape, resize focus and skip-link checks. Old illustration-specific overlap assertions were replaced because those cards were superseded by the reference photo hero; no security assertions were removed.

[Validation report](validation.json) · [raw test logs](evidence/) · [per-viewport observations](screenshots/observations.json)

## Results and limits

All six requested homepage widths pass overflow and automated axe WCAG A/AA/best-practice checks, both with disclosures closed and expanded. Keyboard navigation, 16 registration destinations and no-JavaScript fallback pass. Existing regressions pass: **94 functional scenarios**, **84 workspace layouts**, authentication UI and mandatory verification including **16 direct route gates**. All remote application requests are intercepted/blocked by synthetic test fixtures. No live backend integration is claimed.

During development, the old clipped-content test counted layout boxes inside closed disclosures; it now checks actual visibility, and the new suite separately checks expanded content. The new directory assertion initially counted SVG `use` references; it now specifically checks links. Both final suites pass. Visual inspection also found and corrected the initial mobile photo crop and compact-page active-navigation behavior.

No Supabase project was contacted, no SQL was executed, no application data/users/files were changed, and no deployment or merge was performed. Manual screen-reader testing, Safari/Firefox and physical-device testing remain outside this validation. Review the screenshots and the stacked PR before any integration or deployment decision.
