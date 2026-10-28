# IGotU — external staging writer inventory and D03 go/no-go (28 October 2026)

**Outcome: SOURCE-LEVEL REVIEW COMPLETE; D03 ROLLOUT NO-GO / NOT AUTHORIZED.**

This review uses read-only GitHub repository/branch trees and source files, read-only Supabase project/function metadata already acquired, and the existing verified SQL-catalog evidence. No DML/DDL, migration, Auth account creation, deployment, Netlify API call, GitHub merge, credential retrieval or production project access was performed.

## Checks completed and interpretation

| Writer/channel | Evidence | Status | Limitation |
| --- | --- | --- | --- |
| GitHub Actions workflow files | Branch trees of `main`, `igotu-staging-validation` and `feat/dashboard-visual-polish` contain **no** `.github/workflows/` files. | No tracked workflows in inspected refs | Workflows in other repositories/orgs or external automation cannot be excluded |
| GitHub Actions workflow runs | Repository-level API returned `total_count: 0`. | No runs returned | Does not cover external deployment providers |
| Netlify source configuration | Only `igotu_v2/netlify.toml` found; content is `[build]\n  publish = \".\"`. | Static-publish config; no scripted backend writes or deploy hooks in this file | Netlify site/account settings, build hooks, branch deploys, functions and environment variables **not accessible from repository metadata** |
| Checked-in frontend Supabase connection | `igotu_v2/js/supabaseClient.js` contains URL for **known production** project `giqtnbwyktbnbhdvjraa`. Its browser publishable key is *not recorded* in this document. | No shipped staging frontend connection found in reviewed source | Browsing an unmodified live/CodeSandbox frontend is **not staging verification**; do not send real Auth or service requests to production |
| Staging frontend preparation tooling | `tools/prepare-staging-frontend.mjs` is a local, isolated artifact builder that requires exact staging URL/project ref and rejects the known production project. | A safe **planned** staging build path exists | Builder has not been run with actual staging public config; no staging artifact deployed or attached to users |
| Staging integration test configuration | `tests/staging/config.example.json` contains placeholders and synthetic-only fixtures; no complete deployable staging credentials in source. | Test scope remains planned | An untracked private configuration may exist elsewhere and is not inventoried |
| Supabase Edge Functions | Staging project returned `functions: []`. | None deployed | Independent external/serverless services still possible |
| Postgres scheduled extensions | Earlier SELECT-only metadata confirmed no installed `pg_cron`/`pg_net` and no `cron`/`net` schema. | No installed native cron/net writer observed | Not proof of no custom scheduled task outside DB |
| Realtime publication | Earlier SELECT-only metadata showed `supabase_realtime` publication with zero published tables. | No currently published application tables there | Not proof that external sessions cannot write |
| Active DB sessions | Passive snapshot: four platform/infrastructure idle sessions, no other active transaction. | No live DB writer seen *at that instant* | **Never** substitute this snapshot for a controlled writer freeze |
| Auth and login settings | Not inspected through an authorized staging management view. | **UNVERIFIED** | Signup/email hooks, callbacks, backend jobs and Auth triggers require operator confirmation |
| Storage/public request image exposure | `request-images` is public, others private; separate D04 policy hardening remains. | Known privacy follow-up | Avoid any sensitive image in public bucket |
| Future default grants | `supabase_admin` has broad `public` default privileges for future tables/functions/sequences, whereas inspected current `postgres`-owned app tables are quarantined. | Operator future-object policy needed | Must not unilaterally modify managed role ACLs |

## Strict remaining controls / owner checklist

- [ ] **Netlify:** inspect the actual IGotU site(s) in the Netlify dashboard; record only safe metadata: bound GitHub repository, production branch, branch deploy settings, build hooks, deploy contexts, Functions/scheduled Functions, deploy status, and whether any staging project URL/ref is configured. **Do not print/reveal any keys or values of secret credentials.** Confirm that builds cannot execute a staging writer during the maintenance window.
- [ ] **CodeSandbox/external hosts:** inventory active previews, hosting connections and service workers. The committed frontend points to the production Supabase URL: do not mistake a preview page or a mock screenshot for an isolated staging integration test.
- [ ] **Supabase staging Auth:** in the Dashboard confirm signup/email confirmation/test SMTP, Auth hooks or triggers and callback configuration, and whether any staging users/service writer process is active. No Auth settings changes under this review; do not share personal data or tokens.
- [ ] **Other writers:** check third-party webhooks, API scripts, direct DB clients/pooler jobs, GitHub external actions in other repositories, mail/notification jobs and services holding service-role credentials. This cannot be proven solely from repo source.
- [ ] **Operator pause:** identify the person responsible for pausing allowed staging writes, prevent new writers throughout the D03 transaction and recheck immediately before and after. A `pg_stat_activity` snapshot is insufficient.
- [ ] **Future-object grants:** decide who may create new `public` objects, review managed `supabase_admin` defaults and ensure no unintended Data API or future SQL object access. Avoid ad-hoc changes to platform-managed defaults; use approved dedicated owner/grant policy.
- [ ] **Privacy:** settle whether request images may be publicly retrievable, especially before live personal data or production cutover.
- [ ] **Approved migration method and scope:** resolve the previously blocked managed SQL execution path via a supported operator workflow, then obtain *separate* explicit approval identifying the exact D03 reviewed SQL hash, staging ref, maintenance pause, validation, and stop/rollback plan. The user has **not** authorized D03 execution.

## D03 go/no-go

Technical preflight from the previous report: **phase 2, 24/24 function fingerprints, 132/132 typed columns/defaults, 64/64 constraints, 11/11 enabled trigger bindings, 6/6 enum sets, effective current application-table/sequence browser-role quarantine and current dashboard private-schema isolation** all passed.

**Operational state: NO-GO.** The unknown Netlify/external host settings, staging Auth and other writer access, verified freeze, future-object policy and approved operator/mutation process remain unresolved. Do not attest `writes_paused=true` or apply `03_integrity_draft.sql` now. D04 has separate later gates and approval. No database or production state was changed.

Related: [exact catalog review](2026-10-28-d03-exact-catalog-verified.md), [writer and future-grant audit](2026-10-28-writer-and-future-grant-audit.md), [ordered execution guide](guide.md).
