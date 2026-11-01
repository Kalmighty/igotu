# Registration UI review

Branch: `feat/registration-experience`. Based exactly on reviewed PR #13 commit `4f972492c8950a503542287d754aac0c75ecdf35`; draft PR targets `feat/login-service-preview`.

The registration page now shares the homepage/login forest-green typography, cream/mint cards and curved background. Desktop has two role cards, a compact Admin login notice and an information/form split. On phones, the form precedes the Admin notice and illustration in both DOM and visual order. The page deliberately scrolls instead of squeezing the registration fields into a laptop viewport.

**Reference limitation:** this request included a detailed text brief but no registration reference image accessible in the conversation. The implementation follows that brief and the reviewed homepage/login styling. Exact comparison with the claimed registration image remains pending; no image-match claim is made.

## Review actual browser captures

All account details and responses in these captures are synthetic. Full-width captures below have Client selected; the separate Provider capture shows the alternative state. The before captures render the original registration HTML at the reviewed base commit using the same local fixtures and shared assets.

| Capture | Before | After |
| --- | --- | --- |
| Desktop, 1536px | [Original registration](before/register-1536.png) | [Updated registration](screenshots/register-1536.png) |
| Mobile, 390px | [Original registration](before/register-390.png) | [Updated registration](screenshots/register-390.png) |

- [Form close-up](screenshots/form-closeup.png)
- [Client selected](screenshots/client-selected.png) / [Provider selected](screenshots/provider-selected.png)
- [Password mismatch](screenshots/validation-error.png) / [Signup error](screenshots/signup-error.png) / [Ambiguous response](screenshots/ambiguous-response.png)
- [Email-confirmation response](screenshots/confirmation.png)
- [Actual initial 1366×768 viewport](screenshots/register-1366-initial.png)
- [All seven full-page widths](screenshots/) / [Computed responsive measurements](responsive-metrics.json)

Before: the existing role cards and simpler registration form had no accompanying information illustration or compact form choices. After: the lower desktop area has a mint information panel beside the white form; mobile keeps decorative content after the form. The two compact role tiles supplement the visible native selector. The native selector is intentionally retained for familiar keyboard use and optional-script fallback rather than hidden behind a second state.

At 1366×768, the form starts about 601px down and is 651px wide. Only its heading/guidance appears in the initial view; the fields and Register button require scrolling. This is explicitly recorded in the initial-viewport screenshot. At 390px the form starts about 557px down; at 320px about 536px. All tested widths have zero horizontal overflow. The Admin notice is about 161px high at 390px and 182px at 320px.

## Controls and security boundaries

- The original `data-register-role` controls and native required `#role` select remain. Only `client` and `provider` are choices. New quick-choice buttons write that same select and dispatch its existing change event. They hold no separate account role state.
- `auth-roles.js` continues to synchronize the original cards, heading and polite guidance. Input contents survive role changes. The Admin notice only links to `login.html?role=admin`.
- New password visibility buttons change input type and accessible pressed/label state; they never copy, store or transmit values. Passwords are masked on role change, submit, window blur, page hide and hidden-document events.
- Native required/email validity adds fixed, accessible inline hints. The unchanged signup handler still enforces six characters, password matching and its Client/Provider allowlist, including rejecting a tampered Admin option. Original input IDs, required/type/autocomplete attributes and role values are preserved.
- The busy indicator observes the existing handler's disabled button and `Creating account...` state. Role controls are locked while submission is disabled; existing duplicate-submit protection and signup payload construction remain unchanged. The presentation script never submits, retries or calls Supabase.
- Success guidance appears only after the existing handler marks a real response as successful. No-session responses retain email-confirmation instructions and the captured role's Login link. Immediate-session responses continue through mandatory verification/approval routing.
- The existing ambiguous-transport guidance tells users to check email or try logging in; there is no new automatic retry. Existing Auth error handling is unchanged.
- With optional presentation JS blocked, native role selection and the existing signup handler still work. Without JavaScript, the original form/native selection is visible; account creation itself still requires the original Auth JavaScript. Enhanced tiles and visibility buttons remain hidden until their handlers initialize.

No existing authentication, guard, Supabase configuration, backend, matching, recovery, login, homepage, dashboard or SQL file changes. [Protected-file report](protected-file-check.json) records hashes and the original field contract comparison. The only modified existing application file is `register.html`; new CSS/JS are registration-only.

## Motion and artwork

Finite 420ms entrances use 70ms staggering capped at 210ms, with transform/opacity and immediate keyboard interruption. Hover feedback takes 220ms with a small lift/arrow movement. Reduced motion disables entrances and hover movement, including a runtime preference change. There is no decorative looping video, animation library or new external dependency. The spinner runs only during an actual pending signup response.

`assets/register/request-first.svg` and the small card illustrations are original vector artwork created for this change. They depict illustrative service ideas, not real profiles, identity documents, recommendations, verification badges, availability or matching guarantees. The original IGotU logo and existing local background curves are reused. Image dimensions reserve space before loading.

## Repeat locally

Install the existing test dependencies in the test environment only, start a local static server and run the suites below. Do not point these commands at a deployed application or a Supabase host.

```sh
npm ci --prefix tests
python -m http.server 4186 --bind 127.0.0.1 --directory igotu_v2
```

In a second terminal, from the repository root (Chromium must be installed):

```sh
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4186
node tests/registration-preview.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
node tests/system-functional.cjs
```

The registration runner requires a loopback server, replaces the SDK module with `auth-fixture.js`, blocks every external origin and stubs guarded redirect destinations. It extends only the served fixture with a delayed/thrown signup response to exercise busy/error states; the real application and shared fixture file are unchanged. It records assertions and screenshots without logging signup payloads or passwords.

See [validation report](validation.json) for the executed results. Automated axe and Chromium testing does not replace a manual screen-reader review, physical-device testing or Firefox/Safari checks. Live signup, email delivery, real session issuance and database/RLS integration were not exercised. No staging/production project was accessed, no accounts/data were created, and nothing was deployed or merged.
