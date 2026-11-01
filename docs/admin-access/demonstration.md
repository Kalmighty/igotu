# FYP demonstration decision — no live actions authorized

## A. Existing isolated staging: preferred, currently BLOCKED

Target only `igotu-staging`, `oqalpauljjhytnrpzcqp`. Supplied independent evidence says backend phase 4 and the four named RPCs are installed. This removes the known production metadata mismatch as a staging candidate, but is not proof of browser EXECUTE, an active synthetic Admin, effective table RLS or a working dashboard.

Required evidence before a live demonstration:

1. A named operator verifies project identity, actual frontend artifact origin/target, installed phase/version, exact function signatures and effective schema restrictions. Do not rerun installed baseline/D01–D04, concatenate historical SQL or infer execution state from the old manifest's `NOT_EXECUTED` field.
2. Identify an existing **synthetic** Admin account privately and verify that account's real staging login and database role/status. Do not assume the production owner/Admin exists in staging; Auth metadata, localStorage and role selection do not grant Admin.
3. Under separate scoped validation authorization, prove own-user SELECT and authenticated contract success through the actual Data API. Confirm private schemas stay unexposed. A 401, generic 500, missing function or SQL-owner success is not an authorization control.
4. Prepare a fresh staging-only artifact using the existing `tools/prepare-staging-frontend.mjs`, with privately held verified staging public configuration. Review its source/hash mapping and generated target. Do not edit the source production configuration, overwrite an existing artifact, embed secrets or deploy. Artifact preparation and use follow the existing approval guide; none was performed here.
5. In an isolated browser, perform the authorized existing synthetic Admin login, dashboard counts/recent activity, users, verification queue, reports, service requests, payments and reviews **read-only**. Verify unrelated Client/Provider/inactive contexts fail. No approvals, suspensions, report resolutions, service/payment/review/message writes are permitted by this task. Stop on any denial/error; no security bypass.
6. Collect sanitized pass/fail evidence and get approval for the precise presentation scope/window. Existing account creation, fixture changes or functional mutations require their own authorization. Keep approval expiry, account credentials and private evidence outside Git.

Historical documentation says “no staging created/migrations not executed”; those are dated preparation reports. The current user-supplied phase-4 evidence supersedes that old preparation state. Local SQL/manifest files on this UI branch still describe their original reviewed package and must not be used as an installed ledger. Reconcile the actual approved corrected D01/D03 artifacts and installation record with the operator before any future backend work. This diagnostic change neither replaces their hashes nor grants execution permission.

## B. Isolated offline demonstration: safe fallback plan

The checked-in screenshot `screenshots/synthetic-admin-dashboard.png` is explicitly labelled **OFFLINE DEMONSTRATION · SYNTHETIC DATA · NO LIVE SUPABASE**. It is produced by the real Admin initializer after the real guard succeeds against an in-memory synthetic SDK fixture, not by changing production authentication. Use this and the recorded test results as clearly disclosed local UI evidence if live staging validation cannot be completed in time.

For a repeatable local evidence demonstration, install the existing test dependencies and run the loopback commands in README. `tests/admin-access.cjs` serves the fixture only inside its isolated browser context, blocks all external requests, uses no real credentials and captures both the successful synthetic Admin and the locked incompatible-backend state. The test browser closes afterwards; **this package is not an interactive, hosted mock-login application**.

For presentation, show the labelled screenshot and explain that real account/RLS validation is pending; walk through the synthetic scenario log and before/after failure messages. Do not claim a live backend has passed. Existing functional fixture tests also exercise Admin monitoring, review and status actions entirely in memory; they are regression evidence, not authorization to perform those writes in staging.

Do not open the ordinary source HTML in an uninstrumented browser for this fallback: its existing configuration still targets production. Do not publish the test fixture SDK, add a query-string demo bypass, ship fake contract/profile responses or deploy the Node test server. A future interactive offline runner, if desired, should bind loopback only, serve no real SDK configuration, enforce no external network, label every page and keep its fixture interception outside application code; it would need separate review before being represented as ready.

## C. Production: separate future rollout, NO-GO now

Follow `production-assessment.md`. Correcting wording does not make production compatible. Do not install a contract stub, use D04 alone, reuse the staging synthetic baseline or remove production rejection gates from old drafts. A production account/role investigation and any production schema, data, Storage, Auth or deployment operation need separate explicit scope/approval.
