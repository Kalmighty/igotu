# IGotU remaining staging plan and Windows runbook

Continuation base: `igotu-staging-remaining-tests` at `473db55b302f4acabaea92428382d99783e3b8a7`. Review branch: `igotu-staging-fyp-priority`. Only staging `oqalpauljjhytnrpzcqp` is permitted. No Admin mutation, schema/RLS change, migration execution, production connection or deployment is included.

ST-06, ST-07, ST-13 and ST-17 focused API checks are **owner-reported live PASS**. Their private local reports were not available in Cloud; retain them as the primary evidence. The priority runner excludes these cases, rejects attempts to select them, and does not recreate their test data. All full acceptance cases/groups remain **UNVERIFIED** until their remaining assertions have evidence.

SR0001 is read-only: completed service, one RM100 Cash payment, two reciprocal five-star reviews and two messages. A protected snapshot includes all these rows, including message contents/read flags, and is compared before/after work and across priority resumes. Do not open its thread in a UI that might mark messages read; use a different synthetic service for browser messaging demonstrations.

## Execution order and required decisions

| Priority | Work | Safe automation | Blocker / human action |
|---|---|---|---|
| 1 | ST-05 pending/rejected/suspended restrictions | Verify own account/history controls, then reuse existing focused denial checks | Missing pending/rejected/suspended fixtures are reported separately. No fake history, identity bypass or status changes. Admin rejection/suspension needs separate explicit approval. |
| 2 | ST-08 private payment proof | Reuse a declared completed transfer, or create one dedicated service; ordinary A/A lifecycle; inert private PNG; one synthetic RM1 Bank Transfer record; ownership readback; focused signing/foreign/public denial checks | Client B must be active/approved. Provider A must match the date's 09:00 slot. No real bank transfer occurs. Existing receipt and signed-link expiry matrices remain separate. |
| 3 | ST-10 matching | Reuse an existing eight-case truth table, or create eight owned pending requests; check exact expected sets, PII absence, order and numerical distance | Expected sets must be independently reviewed. The example assumes only Provider A is eligible for the positive Home Cleaning cases. Do not derive expectations by copying the endpoint under test. |
| 4 | ST-12 decline and recovery | After B is approved and complete, create one pending request at 12:00; verify both Providers eligible; reuse journaled decline/exclusion/recovery | B is currently unverified/incomplete. Complete normal identity submission first; **a separate explicit approval is required before any Admin approval/rejection operation**. This runner never makes that decision. |
| 5 | ST-19 same-slot race | After B is approved/complete, prepare forty requests on twenty dates; race both Clients, validate exact winner/conflict, independent readback and booked-Provider exclusion; cancel only the forty new requests | B must be eligible at 10:00 on each date; both Clients approved. SQL lock barriers and profile/suspension interleavings remain unverified. |

Use ST-08 and ST-10 while Provider B remains unverified. ST-05 runs only against the states already available. Do not manufacture rejected/suspended accounts just to unblock it. Once a case has a persisted successful priority result, a repeat Run skips it; missing independent fixtures do not stop other ready cases. Assertion failures stop subsequent work. Blocked uncertain writes remain blocked on resume until read-only reconciliation.

## Get the review branch

Run from a clean Windows checkout; retain any unrelated work before switching. Existing branches and PRs are preserved.

```powershell
Set-Location 'C:\Users\USER\igotu-staging-remaining-work'
git fetch origin igotu-staging-fyp-priority
git switch --track origin/igotu-staging-fyp-priority
$private = 'C:\Users\USER\igotu-staging-private'
```

If that local branch already exists, use `git switch igotu-staging-fyp-priority`. Do not reset/force an existing branch. Keep `config.json`, `approval.json`, `secrets.json`, all journals and reports in the existing private directory. Use the already authorized staging user credentials; never paste them into chat. Password login or a local user JWT is supported. Only actors needed by each selected case are required; missing credentials block that case. No Admin credential is needed by the five priority cases.

Existing approval fields remain required: exact staging binding, unexpired expiry, synthetic-only, network/synthetic-write scope, installed/reviewed migrations, private-schema/accounts review and remainingTests. No additional signup/mail permission is requested. Do not turn on flags for operations that have not been authorized. D01–D04 are already installed and must not be replayed.

### One-time matching expectation review

If you already have independently specified `matchingControlRequestId` and at least eight synthetic `matchingCases` in local config, they are reused. Otherwise copy the nonsecret example once:

```powershell
Copy-Item tests/staging/priority.example.json "$private\priority.json"
```

Do this only if `priority.json` does not already exist; do not overwrite a reviewed settings file. Review/edit it locally and set `matchingReviewed` true only after confirming the synthetic fixture population. Provider A must be available with Cleaning/Home Cleaning, no Office Cleaning or Delivery skill, valid synthetic coordinates and a weekly interval on `config.date`. The interval must start after midnight and end before 24:00. The eight cases are exact position, near/far position, inclusive start, different category, different specialization, just before hours and exclusive end. Exact expected Provider aliases are supplied in that file; an unexpected additional eligible Provider should fail the expectation, not be silently accepted.

The fixture plan is checked against Provider A's own profile/hours. Existing booking conflicts or a different fixture population require reviewing expectations or choosing a suitable future `config.date` **before preparing**. Expected sets are frozen once matching preparation starts; don't change them to make a failing response pass. Null-GPS, unavailable/suspended Provider fixtures, complete aggregates and more complex distance ties remain full-acceptance gaps. Request creation rejects null GPS, so that historical case cannot be fabricated through a legitimate create RPC.

### A small command sequence

First inspect prerequisites. This performs account/history/fixture reads and normal user authentication, with **no application data writes**; it does not repeat the four passed checks.

```powershell
node tests/staging/integration.cjs --priority --inspect --private-dir $private
```

Prepare and run the work that does not require B's approval:

```powershell
node tests/staging/integration.cjs --priority --prepare --only ST-08,ST-10 --private-dir $private
node tests/staging/integration.cjs --priority --run --only ST-05,ST-08,ST-10 --private-dir $private
```

An unavailable ST-05 fixture does not prevent ST-08/ST-10. Inspect the report after each command. Both operations can be resumed by repeating the same command with the same private directory/journal. A completed priority test is skipped on subsequent Runs. **Prepare is not a live test PASS.**

Only after Provider B has truthfully submitted identity evidence and its Admin decision has been separately authorized/completed, continue:

```powershell
node tests/staging/integration.cjs --priority --prepare --only ST-12,ST-19 --private-dir $private
node tests/staging/integration.cjs --priority --run --only ST-12,ST-19 --private-dir $private
```

If B has an approved history but an empty, incomplete profile, Prepare can call the ordinary Provider profile-save RPC with synthetic Cleaning/Home Cleaning, coordinates, availability and 08:00–18:00 hours for all seven days. It verifies true consents, active status, latest approved history and the complete saved profile; no authority flags are written. A partial existing profile is preserved and reported BLOCKED: finish it through the normal Provider UI, then repeat Prepare. A completed profile is never overwritten. Approval is never inferred from a user-editable metadata claim.

The recovered ST-12 request remains assigned for evidence. Its exact synthetic ID/title appears in the report inventory. Release only that reservation through its owning Client's cancellation flow if needed; preserve all rows. ST-19 cancels its forty requests after verified outcomes, retaining history. ST-08 retains the completed request/payment/private proof and ST-10 retains eight pending controls; no blanket delete or Storage cleanup is included.

## Evidence, resuming and errors

Default journal: `$private\priority-state.json`; reports: `$private\priority-reports\<timestamp>-<uuid>.json` and `.md`. The earlier remaining-state journal is not read, migrated or overwritten. Reports include synthetic fixture IDs, current outcome, separately labelled owner-reported prior passes, unverified acceptance groups and outstanding assertions. Credentials, tokens, signed links, raw API bodies and documents are excluded.

- **Focused live PASS:** `evidenceMode=STAGING_HTTP`, operation `--run`, case status PASS. It proves only the listed API assertions.
- **Offline PASS:** local test/model output, or `evidenceMode=OFFLINE_MOCK`; never live evidence.
- **SKIPPED / READY / PREPARED:** prerequisite or fixture work, not test execution; a retained prior priority pass is explicitly skipped.
- **BLOCKED:** missing/invalid credentials, approval/prerequisite gaps, transport failure or uncertain operation. Read the safe code and preserve the journal/report.
- **FAIL:** failed assertion or protected/fixture state drift; investigate before calling it a backend bug. No backend failure has yet been confirmed by this cloud session.
- **Full acceptance UNVERIFIED:** always kept separate from focused passes.

Exit codes: 0 successful Plan/Inspect/Prepare, 1 assertion failure, 2 blocked work, 3 focused Run completed but full acceptance remains incomplete. A blocked case can coexist with other successful results; use the report, not only the process exit code.

A stable creation key finds a committed request after a lost response. A private proof's fixed owner/path is read before upload and independently read after upload. A committed payment is found by its request before considering another insert. Absent uncertain writes, race responses lost in transit, partial-profile drift or changed fixture bindings stop without retry. Do not edit action records, change IDs, delete journals or use a new journal to conceal an uncertain attempt. If a crash leaves a `.lock`, first verify its process is gone, then remove only that lock; retain the journal. Do not run the same fixtures concurrently using different journals.

No automatic report import upgrades historical assertions to full acceptance. Keep the Windows reports alongside the earlier four live reports, and use [the FYP readiness checklist](fyp-readiness-checklist.md) for the final demonstration/browser/security work.

## Remaining work beyond the five priorities

After the focused API runs, use new synthetic demonstration fixtures and the FYP checklist for Client/Provider/Admin browser evidence. ST-01/02 still need registration/confirmation/recovery/role-pair/session evidence; the existing browser-login procedure requires a separately built staging-only artifact and locally available browser dependencies. Its source-level/local fixture successes are not live browser acceptance.

ST-03/04 require consent/ownership/duplicate identity-submission, rejection and resubmission evidence; plan ordinary applicant steps but stop before Admin state changes until separately approved. ST-09/11/14/15/16 have an owner-reported happy-path baseline; their creation replay, invalid/unauthorized/stale/raced lifecycle/payment/review cases need separate services, never SR0001. ST-18 needs separate bounded Admin suspension authorization and dedicated accounts. ST-20's late database failure probe and additional SQL concurrency barriers require separate explicit schema/operator approval. Preserve existing procedures and do not dispatch the original whole integration run to fill these gaps.

ST-06/07/13/17 focused passes remain valid owner-reported prior evidence; their wider browser/authorization/revocation/monitoring matrices remain unverified. Investigate a specific failure before deciding any focused live re-execution is necessary. This branch neither replays them nor treats them as whole-case acceptance.
