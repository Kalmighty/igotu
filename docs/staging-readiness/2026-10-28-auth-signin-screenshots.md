# Supabase staging Auth settings review — 2026-10-28

**Source:** Four user-supplied screenshots from the Supabase Dashboard for project `igotu-staging` (`oqalpauljjhytnrpzcqp`), Authentication → Sign In / Providers. Screenshot-only observation, not an operator attestation or an active-session test.

## Observed configuration

| Setting | Observed state | Meaning for staging quarantine |
| --- | --- | --- |
| Allow new users to sign up | **OFF** | Ordinary public self-service signup is disabled. Appropriate until explicitly approved test accounts are provisioned after controlled backend cutover. |
| Allow manual linking | **OFF** | Account manual linking option is disabled. |
| Allow anonymous sign-ins | **OFF** | Anonymous Auth sign-in is disabled. |
| Confirm email | **ON** | Email confirmation is required for new accounts when signup is later approved. This does not re-enable signup. |
| Email authentication provider | **ENABLED** | Existing accounts (if any) may still be able to sign in; this alone is **not** a writer pause or evidence of account absence. |
| Phone, SAML, Web3, Apple, Azure, Bitbucket, Discord, Facebook, Figma, GitHub, GitLab, Google, Kakao, Keycloak, LinkedIn, Notion, Twitch, Twitter/X, Slack, Spotify, WorkOS, Zoom and other visible non-email providers | **DISABLED** | No listed third-party sign-in provider is currently enabled in these screenshots. |
| Custom providers list | **No custom providers found** | No custom OAuth/OIDC providers shown on this page. |

The screenshot header displays the Supabase **branch label** `main` with a `PRODUCTION` badge *within the staging project*. That UI label refers to its primary Supabase branch; it does **not** identify the separate known production IGotU project (`giqtnbwyktbnbhdvjraa`). The project breadcrumb reads `igotu-staging`.

## Limits — operational D03 writer pause is still not proven

These screenshots do **not** establish: whether existing Auth users/sessions are present; whether external service-role/admin calls can create accounts; whether Auth hooks or custom webhooks are configured; which callback origins are allowed; whether automated email/webhook dispatch could operate; or whether other clients, external schedulers and Netlify installations can write. The visible settings have **not** been altered.

## Next read-only evidence

1. Screenshot **Authentication → Auth Hooks** showing whether any hooks are configured. Do not reveal webhook secrets or bearer tokens.
2. Screenshot **Authentication → URL Configuration** showing only safe origin/redirect domains, if possible; blur query strings or secret values. Confirm no production callback URL is reused for staging tests.
3. Separately inventory existing Auth sessions/users through authorized non-PII administrative summaries or dashboard review; **do not** capture personal email addresses, user IDs, JWTs, service-role keys, or identity documents.
4. Require a controlled and separately approved maintenance writer pause immediately before D03 execution. **Do not** attest `writes_paused=true` based only on signup being disabled.

**Decision:** Auth sign-up configuration is appropriate for the quarantined staging state; **D03 remains NO-GO** until the full external-writer inventory, operational pause, default-grant governance, and separate migration approval. No SQL, Auth/Storage/config changes, test sign-ins, deploy, merge or production access occurred in this screenshot review.
