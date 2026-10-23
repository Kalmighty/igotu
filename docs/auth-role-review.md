# Authentication role sections

Login and Register now use the homepage’s green-and-cream colors, original SVG brand/icons, typography, borders and rounded cards. Styling is isolated in `css/auth-roles.css`; the presentation script is `js/auth-roles.js`.

## Login

Client, Provider and Admin buttons form one accessible, keyboard-operable group. The active card has a visible selected outline/check and `aria-pressed`; it updates the login form’s heading and guidance. The single email/password form, Forgot Password and registration links stay available. Mobile uses two compact public-role cards and a full-width compact Admin option.

`login.html?role=admin` can preselect the Admin presentation. Only the three known visual roles are accepted; unknown values fall back to Client. This preference is not stored, sent to login, used to query profiles, or used to redirect. Login still calls the existing password-sign-in method with only email/password, reads the signed-in user’s database profile by their ID, checks active status and redirects according to that profile’s role/completion state. If a selection differs, the actual account’s workspace wins. The page explains that the account determines access. There is no separate Admin authentication system.

## Registration

Two cards select Client or Provider. The original visible, required `#role` select remains the source read by registration, with exactly the original values: blank, `client`, `provider`. Cards update the select and its change event; dropdown changes and form resets update the cards and form heading. All original field IDs, required states and JavaScript validation remain. There is no extra registration step.

The smaller Admin information panel links to `login.html?role=admin`. It has no registration control, Admin role option or privilege request. Admin accounts continue to require the existing authorized provisioning process.

If the presentation script cannot run, role cards stay hidden and the original form controls remain usable. Registration still offers its native role select. No auth page requires the presentation script to submit.

## Verification and limits

`js/auth.js`, `js/supabaseClient.js`, password recovery, dashboards and database/security files are unchanged. No SQL, Supabase calls, provisioning changes, deployment or merge were performed.

`tests/auth-smoke.cjs` executes the real auth and presentation scripts against an in-memory replacement for `supabaseClient.js`. It blocks all external network requests and substitutes simple local destinations for dashboards/onboarding. The fixtures deliberately provide misleading user metadata and a cached Admin profile so the tests can verify those do not decide the login role.

Checks passed:

- Login and Register at 1440, 768, 390 and 320px, with no horizontal overflow or clipped headings, controls, cards or panels.
- axe-core WCAG 2 A/AA, WCAG 2.1 AA and best-practice rules at each page/width, with no reported violations; automated results are not a full manual audit.
- Keyboard role selection, `aria-pressed`, native dropdown/card synchronization and required-role validation.
- All nine visual-role/account-role combinations route by the database-profile fixture, including Client/Provider accounts choosing Admin.
- Client/Provider onboarding redirects, all three suspended-role sign-outs, missing profile, invalid credentials and missing-session-user handling.
- Both allowed signup roles, immediate-session onboarding and the existing no-session signup-to-login path.
- Password length/mismatch validation, missing required values, and rejection of an injected Admin select option by the existing registration guard.
- Admin-information link, safe fallback for unknown role parameters and no-JavaScript forms.
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
