# Staging Auth URL configuration screenshot review — 28 October 2026

**Scope:** user-provided screenshot of Supabase **igotu-staging** Authentication → URL Configuration. Read-only screenshot review; no Supabase settings, Auth records, database, GitHub application code, or production environment were modified.

## Observed configuration

| Setting | Visible value | Interpretation |
|---|---|---|
| Site URL | `http://localhost:3000` | Local-development placeholder; not an approved deployed staging callback destination |
| Redirect URLs | **No Redirect URLs** | No additional allowed redirects shown; notably no known production IGotU URL appears in this screenshot |
| Save changes | No save action taken | Screenshot does not indicate any settings modification |

## Significance

- Staging currently has public signup **disabled**, anonymous sign-in **disabled**, email confirmation **enabled**, and no custom Auth Hooks or custom OAuth providers visible in previously reviewed screenshots. This URL configuration is consistent with a quarantined intermediate staging state.
- `http://localhost:3000` resolves to the browser's own computer, so it is not suitable for email-confirmation or password-reset callbacks to a remotely hosted staging website. The eventual staging frontend callback and any approved localhost development origin must be scoped exactly to the isolated test environment.
- Do not add wildcard production domain redirects or copy production Auth credentials. The checked-in IGotU frontend still has the production Supabase project URL and must not be used as a staging integration client.
- No redirects shown **does not prove that all possible outbound links, existing Auth users/sessions, server-side user creation, external webhooks, or backend writers are absent**. URL configuration is a distinct control from the D03 `writes_paused` attestation.

## Decision and next step

**Auth callback configuration screenshot review: COMPLETE for currently displayed settings. No change required until an isolated approved staging frontend, test email flow and synthetic-account test window exist.**

D03 remains **NO-GO** until external writer inventory, controlled maintenance pause, future-object default privileges and approved execution mechanism are independently resolved. Even when the technical D03 catalog matches, its actual SQL requires separate explicit authorization. No SQL/D03/D04 installation is implied by this screenshot.

Other evidence: `2026-10-28-auth-signin-screenshots.md`, `2026-10-28-auth-hooks-screenshot.md`, `2026-10-28-external-writer-inventory.md`.
