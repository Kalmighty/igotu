# Isolated staging preparation (not provisioned)

No project/resources/accounts were created. The acceptance plan is prepared; authorization to perform writes is pending. `readiness.cjs` checks its 20-case/14-group mapping locally and refuses `--execute`.

## After explicit resource and mutation approval

1. Create a disposable project under an approved staging organization, separate project reference, URL, publishable key and storage namespace. Denylist production reference `giqtnbwyktbnbhdvjraa` in the reviewed execution harness. Require an exact URL allowlist and reject redirects to other origins. No production service-role key, database password, refresh token or account login may be supplied.
2. Configure staging-only local callback origins, rate limits and email capture/test delivery after approval. Disable real outbound business emails/webhooks/jobs and notification fanout. Public sample accounts must use a controlled test mail sink; `example.invalid` addresses are documentation/fixture values, not a delivery test. Do not disable Auth, RLS or mandatory verification for convenience.
3. Seed a reviewed empty schema compatible with the catalog metadata, using an operator-created baseline migration. Do not execute historical setup scripts, which contain backfills/permissive grants and inconsistent signatures. Baseline creation is itself a separate approval/review step; these integration drafts intentionally assume the reviewed existing schema and trigger wiring. Compare function fingerprints; adapt drafts explicitly if platform version formatting differs.
4. Provision two Clients, two Providers, one existing authorized Admin and an unrelated account through an approved synthetic Auth/admin process. Admin is provisioned only by the staging operator, never signup metadata. Add independent not-submitted, pending, rejected, approved, suspended, profile-incomplete and flag-only legacy fixtures. No production user/document rows or credentials copied. Store credentials in an untracked secret file with restricted access, provide only its path to the eventual harness and never print it.
5. Generate inert watermarked PNG/PDF files with “SYNTHETIC — NOT AN ID”; avoid real names, faces, identifiers, bank receipts or location addresses. Use synthetic local map coordinates. Create separate fixtures for own/foreign folder, orphan, URL-only, conflicting and absent documents. Keep request histories/ratings sufficiently varied to test full aggregates and exact-time conflicts.
6. Review effective private-schema exposure and all grants, then apply approved D01–D04 in order using the rollout gates. Execute each database authorization test as actual anon/authenticated users with isolated JWTs. Service-role testing must not stand in for browser authorization. The operator may independently inspect synthetic final rows for assertions under the approved test scope.
7. Implement and review the environment-specific acceptance harness from `tests/staging/acceptance-plan.json`. Log case IDs, sanitized status/SQLSTATE, expected row/event counts and timestamps; redact Authorization, passwords, tokens, raw errors containing private references, signed URLs and documents. A failed prerequisite is BLOCKED, not a successful denial. Verify a control request for every negative API test so a broken endpoint does not masquerade as security.
8. Execute assignments in separate sessions/JWTs with barriers, both arrival orders and at least 20 iterations. Validate exact-time exclusivity after commit, not just one HTTP error. For atomic saves inject a late database failure and independently compare all saved sets; a simulated RPC error alone cannot prove rollback. Recheck race interactions with availability/hours/status changes.
9. Test signed URL expiration with a real clock wait longer than 300 seconds and fresh reauthorization on open. Observe that previously issued signed links may survive account suspension until expiry; do not claim instant revocation. Anonymous public URLs must fail. Do not screenshot tokens or document contents.
10. Review all 20 case results and DB-01–DB-13/EXT-01 separately. Capture desktop/mobile screenshots using synthetic data. Obtain approval for teardown/resource deletion; do not run an automatic cleanup that could target another project.

## Required product/security decisions before rollout

Approve how legacy users and scheduled/in-progress assignments transition while verification is pending; how unrecorded historical consent is corrected; whether private request-image migration and free-text disclosure controls are required; how old public receipt caches/exports are remediated; and how last-Admin/self-suspension is handled. These are explicit blockers, not prompts to grant a temporary bypass.

Production rollout requires its own authorization, then-current metadata comparison, narrowly approved historical-data/object review and production-specific migration. The staging-only drafts refuse the known production reference.

## Local frontend artifact builder

`supabaseClient.js` retains the existing production public configuration in source; do not point a staging test at it. After a staging reference and publishable key are approved, put `{ "projectRef": "<20 lowercase letters>", "url": "https://<same-ref>.supabase.co", "publishableKey": "sb_publishable_<staging-public-key>" }` in an untracked local file. Run:

```sh
node tools/prepare-staging-frontend.mjs /path/to/local-staging-config.json fresh-artifact-name
```

This prepares a fresh ignored `work/staging/fresh-artifact-name` directory without changing source, contacting Supabase, provisioning or deploying anything. It rejects the known production reference, foreign origins and non-publishable keys, refuses to overwrite existing work and excludes database SQL from the web artifact. It does not verify the key against a server; verify an authorized staging control request before testing. `tests/staging/artifact.cjs` checks these local preparation protections using synthetic public configuration. No real staging artifact was configured with live credentials.
