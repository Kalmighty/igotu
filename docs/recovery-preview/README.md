# Password recovery UI review

Branch: `feat/password-recovery-experience`. Based exactly on reviewed PR #14 commit `89a5c6176f81c61927e6d99968a7841e24c8cde5`. New draft PR targets `feat/registration-experience`; existing PRs #12–#14 are unchanged.

Forgot Password and Reset Password now share the reviewed authentication design: forest-green headings, green italic text, white rounded forms, mint guidance panels, original laptop/plant artwork and local background curves. Desktop has information on the left and the form on the right. Mobile DOM and visual order is header, heading, form, supporting information, then decorative artwork.

**Reference limitation:** the supplied request names an attached Forgot Password reference image, but no such image was available in this message. The detailed text brief and reviewed homepage/login/registration styling were used. Exact comparison against that image remains pending; no visual-match claim is made.

## Actual browser captures and comparison

All screenshots were rendered in Chromium against a loopback static server. Requests to the SDK module were replaced with synthetic fixtures; all non-loopback requests were blocked. Password fields are masked in captures, and no recovery tokens or URLs appear. No live account or email operation was performed.

| Page | Before desktop | After desktop | Before mobile | After mobile |
| --- | --- | --- | --- | --- |
| Forgot Password | [1536px](before/forgot-password-1536.png) | [1536px](screenshots/forgot-password-1536.png) | [390px](before/forgot-password-390.png) | [390px](screenshots/forgot-password-390.png) |
| Reset Password | [1536px](before/reset-password-1536.png) | [1536px](screenshots/reset-password-1536.png) | [390px](before/reset-password-390.png) | [390px](screenshots/reset-password-390.png) |

The originals were small centered forms with minimal guidance. The new desktop layouts make the recovery form prominent beside readable instructions and a reserved-size illustration. On phones, the forms come before the extra information. The form/input content remains intact, with matching buttons, labels and navigation across both pages.

States:

- [Recovery accepted](screenshots/recovery-success.png)
- [Recovery request error](screenshots/recovery-error.png) / [Transport error](screenshots/recovery-network-error.png)
- [Missing/invalid recovery session](screenshots/invalid-reset-session.png)
- [Password validation](screenshots/password-validation.png)
- [Password update success before the existing redirect](screenshots/password-update-success.png)
- [Password updated but cleanup unconfirmed: no redirect](screenshots/cleanup-unconfirmed.png)
- [All seven widths, both pages](screenshots/)
- [Forgot Password at actual 1366×768](screenshots/forgot-password-1366-initial.png) / [Reset Password at actual 1366×768](screenshots/reset-password-1366-initial.png)
- [Responsive measurements](responsive-metrics.json)

At 1366×768, both forms start at 159px; the default Send Reset Link button ends around 507px, and Update Password around 622px. At 390px, the email field begins around 498px and Send Reset Link ends around 622px; the new-password field begins around 514px and Update Password ends around 799px. At 320px, those button bottoms are approximately 666px and 835px. Reset on a shorter phone requires scrolling; inputs are not squeezed to force a one-screen page. The fields are at least 51px high. No horizontal overflow was found at any requested width.

## Recovery/security behavior preserved

`js/password-recovery.js` is **byte-identical** to the reviewed base. The new presentation script imports no SDK and makes no requests. It does not read sessions, tokens or password contents, store anything, submit forms, retry requests, change redirects or decide authorization.

The existing handler still:

1. Uses `resetPasswordForEmail` with its same-origin relative `reset-password.html` destination.
2. Blocks duplicate submissions while disabled.
3. Returns the same generic account-enumeration-safe recovery message and does not auto-redirect after a recovery request. The new next-step panel explicitly says acceptance does not confirm delivery.
4. Keeps the entered email after a genuine failure, restores the button for an explicit retry and exposes only its existing generic failure text.
5. Checks the current session on **every** password-update attempt before `updateUser`; missing/error sessions never reach the update.
6. Retains both native `minlength="6"` constraints and the existing six-character/mismatch checks. Longer unique passwords are advice, not a new policy.
7. Removes cached account data after an update; uses local sign-out with the existing `clearStoredAuthSession` fallback.
8. Redirects to Login only after its successful update/cleanup flow. When cleanup throws, the existing warning remains, the button stays disabled and there is no success redirect.

The presentation code observes actual button/message mutations. It marks the form busy only while the existing handler is pending, and ends that state when the handler reports an outcome, including success or unconfirmed cleanup while the existing button remains disabled. It never changes the submit button's disabled state or text.

Native required/email/minlength feedback adds fixed inline messages and `aria-invalid` without replacing native constraints or preventing submissions. The existing message box now has polite, atomic status semantics. Success/error panels have text and symbols as well as color. Password toggles are keyboard-accessible `type="button"` controls with pressed state and explicit labels. They change field type only; submit, form reset, window blur, page hide and document hiding mask both passwords again. During the existing disabled state, toggles are also disabled.

If optional presentation JavaScript is blocked, both original recovery handlers still work; visibility buttons stay hidden until initialized. Without JavaScript, the original fields and navigation remain visible, but recovery operations still require the existing SDK/handler. Essential content is never dependent on an animation library or intersection observer.

No account lookup, custom token system, delivery guarantee, configured expiry claim or verification bypass was added. Synthetic session-loss tests represent a missing/expired session as a null SDK response; they do not validate real token expiry or recovery-link issuance. Existing Auth settings/session design were not expanded or represented as independently audited.

## Motion and assets

420ms finite transform/opacity entrances use 70ms staggering capped at 210ms. Keyboard focus interrupts an entrance. Hover/press transitions take 220ms; status appearance takes 200ms. Reduced motion suppresses entrances, hover movement and the spinner rotation, including runtime preference changes. Busy text and disabled states remain meaningful with motion disabled. No decorative loop, video or heavy dependency was added.

`assets/recovery/account-support.svg` is original project-local vector artwork created for this change, in the same style as the registration illustration. It contains no real account information, passwords, tokens or identity documents. The existing IGotU mark/wordmark treatment and local login background curves are reused. Explicit image dimensions reserve its space.

## Changed files

Application changes:

- `igotu_v2/forgot-password.html`
- `igotu_v2/reset-password.html`
- New `igotu_v2/css/recovery.css`
- New `igotu_v2/js/recovery-presentation.js`
- New `igotu_v2/assets/recovery/account-support.svg`

Tests: new `tests/recovery-preview.cjs` and `tests/recovery-fixture.js`. Documentation and browser evidence live in this directory. [Protected-file evidence](protected-files.json) confirms every previously tracked file except the two HTML pages is unchanged; original input types/required/minlength constraints and form IDs are preserved. Autocomplete and accessibility attributes are added where appropriate.

## Repeat the synthetic checks

From the repository root, install test dependencies in the test environment and start a loopback server:

```sh
npm ci --prefix tests
python -m http.server 4190 --bind 127.0.0.1 --directory igotu_v2
```

In another terminal (Chromium must be installed):

```sh
export NODE_PATH="$PWD/tests/node_modules"
export UI_BASE_URL=http://127.0.0.1:4190
node tests/recovery-preview.cjs
node tests/auth-smoke.cjs
node tests/mandatory-verification.cjs
node tests/ui-smoke.cjs
node tests/system-functional.cjs
```

The new fixture records operation names, safe argument shape and password length, never password contents. Its session marker is an explicitly synthetic local string, not a credential. Delay/error flags exercise real handler branches. A first test run exposed a fixture initialization mistake that recreated the synthetic session marker on the Login stub; the setup now seeds it only on recovery pages, and the cleanup assertions pass without changing application logic or weakening assertions.

See [validation](validation.json) and [raw results](results/) for executed evidence. Tests are local Chromium/axe results, not proof of live Supabase recovery, email delivery, token expiry, RLS or deployed behavior. Physical devices, Safari/Firefox, a full manual screen-reader audit and the missing design-image comparison remain unverified. No staging/production project access, real accounts/data, SQL execution, configuration change, deployment or merge.
