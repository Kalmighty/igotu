# Public homepage redesign

The homepage replaces the four-link introduction with an original IGotU design: warm white, forest and emerald green, a serif accent, restrained borders, original SVG icons, and a request-to-recommendation illustration. All artwork is authored in this change; no stock imagery, copied branding, external fonts, libraries or live data are used by the page.

## Premium refinement

The refinement builds on the homepage in `374164c`; its sections, headline, categories, links and request-first workflow are retained. It adds:

- A stronger hero headline, subtle accent underline, clearer body text and button treatments with inset highlights and circular arrow details.
- A softly lit illustration canvas, layered card shadows, numbered request/recommendation/choice cues and restrained hover motion. The illustration remains explicitly labelled sample data.
- An enclosed benefit strip and larger service tiles with framed icons, supporting descriptions and a differentiated Other tile. These remain the exact seven supported categories.
- White numbered workflow cards, desktop connectors and a vertical mobile sequence, retaining the same four steps and offline-payment wording.
- A richer forest-green signature section with bounded contour accents and a contrasting light interactive explainer panel.
- Framed benefit cards, richer mint/sand Client and Provider cards, dimensional icon sequences and a more distinctive closing CTA.

Phone illustrations separate the request and Provider cards; the tablet hero stacks to preserve legibility. The browser check now asserts that the supporting Provider card does not obscure the primary card and that narrow-layout request text remains uncovered. All five viewport and axe checks pass after refinement. Homepage JavaScript, authentication and service-matching behavior are unchanged. The screenshots below show the refined design.

## Sections and behavior

- Sticky navigation with Home, How It Works, Services, Why IGotU, Login and Get Started. The mobile disclosure supports keyboard activation, Escape, focus recovery on resize and section navigation. Without JavaScript the navigation links remain visible.
- Two-column hero: “Need a service? We got you.” An original SVG/CSS illustration shows a service request, IGotU matching and two explicitly illustrative Provider options.
- Seven service-category cards, matching the current Client request form exactly: Cleaning, Delivery, Repair, Moving Help, Errands, Tutoring and Other.
- Four steps explain Client request creation, recommendations, Client selection/Provider confirmation, completion, offline payment recording and reviews.
- An interactive “Your request. Your match. Your choice.” section explains skills/specialization, availability and distance. This is a content explainer, not a matching engine or fake search tool.
- Six benefits cover recommendations, location, request details, assigned-party messaging, profiles/reviews and progress.
- Separate Client and Provider paths explain each role. All registration links use the existing `register.html`; the visitor chooses the role there. Category choices do not promise a prefilled request.
- A dark-green closing call to action and a footer link to real sections and existing authentication pages.

The page has its own `home.css` and `home.js`. Existing dashboard CSS, auth pages, authentication code, matching code, database/security files and APIs are unchanged. The only runtime script is presentation code; the homepage works without an authenticated session and makes no external requests. Content remains visible without JavaScript; the interactive explanation controls are hidden if unavailable. Motion respects `prefers-reduced-motion`.

## Validation

The browser check uses the actual public HTML, CSS and JavaScript, with no service-data fixtures. It checks:

- 1440, 1024, 768, 390 and 320px viewports, with no horizontal overflow or clipped headings, cards or CTAs.
- axe-core WCAG 2 A/AA, WCAG 2.1 AA and best-practice rules at every width, with no reported violations. Automated checks do not replace a full manual accessibility audit.
- Mobile menu expansion, Escape/focus, sticky-header anchor positioning, mobile section focus, desktop-to-mobile focus recovery, the skip link and keyboard-operated explanation buttons.
- Valid local anchors and links; category names against the existing request form; actual navigation to Login and registration pages from hero, Provider and category CTAs. The auth module is suppressed only on those destination-page checks to avoid accessing Supabase; signup/login themselves were not integration-tested.
- Reduced-motion CSS, useful no-JavaScript fallback, zero browser errors, zero failed local assets and zero external requests.
- JavaScript syntax, local asset references, unique element IDs and whitespace checks.

No SQL was executed. Supabase was not accessed or changed. No deployment or merge was performed.

To repeat locally, serve `igotu_v2` and run the check with Node.js, Playwright, axe-core and Chromium available:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory igotu_v2
# In another terminal:
UI_SCREENSHOTS=work/homepage node tests/home-smoke.cjs
```

Set `UI_BASE_URL` for another local port, `CHROMIUM_PATH` for a different Chromium executable, `NODE_PATH` for an existing test-tool installation, and `AXE_PATH` for a local `axe.min.js`. Playwright and axe-core are test tools, not dependencies of the shipped homepage. No frontend framework or runtime dependency was added.

## Screenshots

Full-page captures of the actual public homepage (no authenticated session):

- [Desktop, 1440px](ui-preview/homepage-desktop.png)
- [Mobile, 390px](ui-preview/homepage-mobile.png)
- [Desktop hero](ui-preview/homepage-desktop-hero.png)
- [Mobile hero](ui-preview/homepage-mobile-hero.png)
