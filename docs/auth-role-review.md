# Authentication role sections

Login and Register now use the homepage’s green-and-cream colors, original SVG brand/icons, typography, borders and rounded cards. Styling is isolated in `css/auth-roles.css`; the presentation script is `js/auth-roles.js`.

## Login

Client, Provider and Admin buttons form one accessible, keyboard-operable group. The active card has a visible selected outline/check and `aria-pressed`; it updates the login form’s heading and guidance. The single email/password form, Forgot Password and registration links stay available. Mobile uses two compact public-role cards and a full-width compact Admin option.

`login.html?role=admin` can preselect the Admin section. Only the three known UI roles are accepted; unknown values fall back to Client. A selection grants no permissions and is never sent as an authentication credential or used to change a user role.

After password authentication, the existing own-user lookup reads the database profile and preserves the missing-profile and active-status checks. Only when that actual role matches the selected login section may the existing profile-completion/dashboard redirect run. Three combinations succeed (Client/Client, Provider/Provider, Admin/Admin); all six cross-role combinations are rejected. The mismatch message names the actual registered role and the correct section to select.

Rejected logins sign out with local scope, remove `igotu_user`, verify that `getSession()` is null, restore the Login button/cards and remain on the same page. The selection is captured and the cards are disabled during an attempt; duplicate submissions cannot race the role check or redirect timer. A successful login continues to redirect by the database profile, never the card, query parameter, cached profile or editable Auth metadata.

### Cleanup failures

A project-scoped fallback stops auto-refresh and clears only the owned session/user storage keys when SDK sign-out fails to clear the session. The client explicitly retains the same default project storage key, so existing session keys are not migrated. No private SDK API or broad localStorage wipe is used. The SDK is then asked to sign out again and local state is verified. A remote failure is reported even when browser credentials are gone. If local clearing or verification cannot complete, no redirect or new sign-in is allowed; the restored button retries cleanup first.

Local cleanup does not claim to revoke already-issued access tokens instantly. Existing server authorization and RLS remain authoritative; this is a login-section consistency check, not a new privilege boundary.

## Registration

Two cards select Client or Provider. The original visible, required `#role` select remains the source read by registration, with exactly the original values: blank, `client`, `provider`. Cards update the select and its change event; dropdown changes and form resets update the cards and form heading. All original field IDs, required states and JavaScript validation remain. There is no extra registration step.

The smaller Admin information panel links to `login.html?role=admin`. It has no registration control, Admin role option or privilege request. Admin accounts continue to require the existing authorized provisioning process.

If the presentation script cannot run, role cards stay hidden and registration still offers its original native role select. Login refuses to authenticate without a valid selected section, so script failure cannot bypass the new consistency check.

## Verification and limits

`js/auth.js` now checks the selected section and handles rejected-session cleanup. `js/supabaseClient.js` retains its default project-scoped key and exports the local cleanup fallback. Registration validation, password recovery, dashboards and database/security files remain unchanged. No SQL, live Supabase calls, provisioning changes, deployment or merge were performed.

`tests/auth-smoke.cjs` executes the real auth and presentation scripts against an in-memory replacement for `supabaseClient.js`. It blocks all external network requests and substitutes simple local destinations for dashboards/onboarding. The stateful fixtures deliberately provide misleading user metadata and a cached Admin profile so the tests can verify those do not decide the login role. They also track session creation, sign-out and local cleanup.

Checks passed:

- Login and Register at 1440, 768, 390 and 320px, with no horizontal overflow or clipped headings, controls, cards or panels.
- axe-core WCAG 2 A/AA, WCAG 2.1 AA and best-practice rules at each page/width, with no reported violations; automated results are not a full manual audit.
- Keyboard role selection, `aria-pressed`, native dropdown/card synchronization and required-role validation.
- All nine visual-role/account-role combinations: three matches accepted; six mismatches rejected, signed out and left on Login with the session/profile cache removed. Misleading editable Auth metadata and a cached Admin profile do not influence the result.
- Matching Client/Provider onboarding redirects, authorized Admin dashboard redirects, all three suspended-role sign-outs, missing profile, invalid credentials and missing-session-user handling.
- Both allowed signup roles, immediate-session onboarding and the existing no-session signup-to-login path.
- Password length/mismatch validation, missing required values, and rejection of an injected Admin select option by the existing registration guard.
- Admin-information link, safe fallback for unknown role parameters, and fallback form visibility. Login requires an explicit valid UI selection; if its presentation script fails, it refuses to authenticate rather than bypass the section check.
- Returned and thrown sign-out errors, failed local cleanup/verification with blocked retries, no delayed redirects after rejection, duplicate-submit prevention, and switching to the correct section without reloading.
- Real Supabase JS SDK 2.118.0 with locally intercepted Auth/REST responses: normal logout, simulated 503 and thrown sign-out all leave `getSession()` null and remove only the owned project session/cache.
- Zero unexpected browser errors and zero live/external requests. JavaScript syntax, element IDs, labels, local references and whitespace checked.

These tests verify frontend wiring and behavior using safe fixtures. No real login, signup, password recovery email, live RLS, database authorization or Admin provisioning was integration-tested or changed.

## Repeat locally

With Node.js, Playwright, axe-core and Chromium available:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory igotu_v2
# Another terminal:
UI_SCREENSHOTS=work/auth/screenshots node tests/auth-smoke.cjs
```

Set `UI_BASE_URL`, `CHROMIUM_PATH`, `NODE_PATH` or `AXE_PATH` to match your local test tooling. No test library is loaded by the shipped pages.

## Full-page screenshots

- Login: [Desktop](ui-preview/auth-login-1440.png) · [Mobile](ui-preview/auth-login-390.png)
- Register: [Desktop](ui-preview/auth-register-1440.png) · [Mobile](ui-preview/auth-register-390.png)

### SDK cleanup check

`tests/auth-sdk-cleanup.cjs` uses the shipped client and login modules with a locally bundled Supabase SDK. All external SDK and API requests are intercepted; no project is contacted. With Supabase JS and esbuild installed as local test tooling, bundle its browser entry and run:

```sh
# Resolve the installed package's browser/ESM entry for its version, then:
esbuild /path/to/supabase-js/dist/index.mjs --bundle --format=esm --platform=browser --outfile=work/supabase-browser.mjs
SDK_BUNDLE=work/supabase-browser.mjs node tests/auth-sdk-cleanup.cjs
```

The bundle and SDK tooling are not shipped application dependencies.

Mismatch examples: [Desktop](ui-preview/auth-login-mismatch-1440.png) · [Mobile](ui-preview/auth-login-mismatch-390.png).
