# Finish ST-12, then ST-19 — Windows-local runbook

Base: `igotu-staging-fyp-priority` / `636b8389f5fa6c93d99b24ba9c5fb6f56e3a8956`. Review branch: `igotu-staging-provider-b-finish`.

The owner reports Provider B approved and independently verified in staging. The runner still checks the latest approved verification, both true consents, active status and identity flag before normal Provider profile completion. No Admin decision, authority-flag write, SQL/schema/RLS/migration or deployment action is included.

**Already focused live PASS (owner reported): ST-06, ST-07, ST-08, ST-10, ST-13, ST-17.** The priority entrypoint excludes all six, including explicit selection attempts. Do not replay them. SR0001's completed request, one RM100 Cash payment, two reviews and two messages remain read-only and are checked by the existing protected digest.

## Fewest local commands

From your clean existing checkout (preserve unrelated work before switching):

```powershell
Set-Location 'C:\Users\USER\igotu-staging-priority-work'
git fetch origin igotu-staging-provider-b-finish
git switch --track origin/igotu-staging-provider-b-finish
node tests/staging/prepare-provider-b.cjs --private-dir 'C:\Users\USER\igotu-staging-private' --finish
```

If the new local branch already exists, switch to it without `--track`. Repeating the **same final command** resumes the same isolated context and journal; it does not create a fresh batch. Do not reset existing branches or edit/remove an uncertain journal.

The helper reads only local `config.json`, `approval.json` and `synthetic-bootstrap.json`. The bootstrap shape is `{ "projectRef": "oqalpauljjhytnrpzcqp", "accounts": { "clientA": { "email": "LOCAL", "password": "LOCAL" }, ... } }`. It supports ordinary UTF-8/UTF-8 BOM and PowerShell UTF-16LE BOM JSON. **Never paste these files into chat, upload them or commit them.** No credential is passed as a shell argument, printed or included in a report.

Only the four synthetic Client/Provider entries are copied. Provider B is bound to UUID `a488bd46-8610-449b-b601-406314453672`; optional bootstrap IDs/roles must agree. The normal Auth login must return the expected user UUID and database role before any workflow mutation. An alias or editable Auth metadata cannot bypass this check.

## Isolation and sequence

The helper creates/reuses this **new** directory:

```text
C:\Users\USER\igotu-staging-private\provider-b-st12-st19\
  config.json
  approval.json
  secrets.json
  context.json
  st12-st19-state.json
  priority-reports\
```

The original `priority-state.json`, its binding, original configuration/bootstrap/secrets and ST-08/ST-10 reports are not modified. The new config includes only clientA/clientB/providerA/providerB and no old matching/receipt settings. It chooses `source config.date + 35 days`, preserving the weekday and separating these tests from the former base-date/+1..+20 fixture range. This avoids reusing an earlier failed-decline reservation without deleting it. The chosen date is stored once and reused. If a different date is necessary, supply `--date YYYY-MM-DD` **before the first preparation**; changing an existing isolated binding is blocked.

Windows preparation removes inheritance on only the new context directory and grants its current operator Full Control with file/folder inheritance. On POSIX, the directory is 0700 and private files 0600. ACL setup failure stops before credentials are written. The helper refuses repository/frontend private-file locations and output symlinks. It never changes the parent private directory's ACL. Subsequent invocations validate the immutable isolated config, then refresh only its copied secrets/approval from the local inputs; scopes/expiry are never invented or extended. If source approval expired, renew it through the usual authorized local process; the helper will not forge a fresh window.

With `--finish`, the helper calls the existing priority workflow in this order:

1. **Prepare ST-12:** re-read B's latest approved/consented history. If incomplete and truly empty (or containing only a blank profile placeholder), save the standard synthetic Provider profile through `save_provider_profile`, then independently verify every set. Meaningful partial/completed profiles are preserved; a partial one requires ordinary UI completion. Create/reuse one dedicated pending Client A request at 12:00 and verify both Providers eligible.
2. **Run ST-12:** Client A selects Provider A; authenticated Provider A declines its own selected assignment; verify decline history, exclusion, recovery assignment to B and one intended notification. Require a protected-evidence check and a persisted focused ST-12 PASS.
3. **Prepare ST-19:** only after that ST-12 PASS, validate both Clients, B's active approved complete profile, and B's eligibility for all twenty date/time pairs. Prepare forty dedicated requests at 10:00 on isolated base date +1..+20, then persist the completed preparation gate before any trial can run.
4. **Run ST-19:** twenty two-Client races, alternating launch order, one exact winner/expected conflict, independent Client/Provider state readback and booked-Provider exclusion. Cancel only these forty synthetic requests through their owners; retain their rows/history.

If a phase is BLOCKED or FAIL, later phases do not execute. ST-19 preparation/execution is also gated inside `executeCase`, so selecting it directly cannot skip ST-12. Successful prior ST-12/ST-19 checks are skipped on resume. New reports have timestamp/UUID names; no report is overwritten.

The recovered ST-12 service stays assigned for evidence; release that exact synthetic reservation later through its owning Client's cancellation UI if needed. Its inventory is in the private report. Never cancel SR0001 or an old incomplete fixture just to free a test slot. No blanket evidence or Storage cleanup exists.

## Why the allowlist fix is safe

`provider_decline_request` is a permitted ordinary workflow RPC, not an Admin helper. The priority guard requires a token-bearing configured Provider A/B actor, matching UUID/Provider role, a successful own-session control and a projection showing that exact request is currently assigned to that Provider in `provider_selected`. Blank reasons, unexpected RPC arguments, non-Providers, missing sessions, unassigned Providers, arbitrary/private/Admin helpers and every SR0001 write are rejected. The existing backend still enforces JWT/role/approval/ownership and transactional checks; no permission or schema is broadened.

Preparation now recognizes journaled in-progress ST-12/ST-19 fixtures instead of incorrectly requiring fresh ones on every resume. Run performs the existing readback reconciliation. A committed lost decline can be reconciled without another decline; an absent uncertain decline or lost race response remains BLOCKED. Do not edit attempted actions, delete locks while a process is live, change bindings or start a different journal to retry. After a crash, verify the process is gone before removing only its lock file.

## Results and next stage

- **Focused live PASS:** actual `STAGING_HTTP` + `--run` + PASS in the local report. Nothing in Cloud supplied a new live PASS.
- **Offline PASS:** generated-credential/in-memory regression tests; not Supabase or Windows execution proof.
- **BLOCKED:** missing/expired configuration, ACL failure, approval/profile/availability gap or uncertain write. Keep the report/journal and investigate the safe code.
- **FAIL:** failed assertion/state drift; do not assume every fixture mismatch is a backend defect.
- **Full acceptance UNVERIFIED:** remains separate from focused API successes.

Exit 1 means FAIL; 2 means BLOCKED. Exit **3** after the final run means focused checks completed, with broader acceptance still unverified. Plan/Prepare success uses 0. Keep the four phase reports even if PowerShell shows a nonzero code.

For a local-files-only preparation without network, omit `--finish`. No live account/profile/service action occurs until `--finish` or an explicit priority Prepare/Run is invoked.

After both local focused passes, move to the [FYP readiness checklist](fyp-readiness-checklist.md): a new synthetic Client → Provider → Client browser walkthrough, responsive/keyboard checks, messaging draft/navigation and session behavior, and read-only Admin monitoring. Use a different thread/service for new UI mutations; retain SR0001. Full invalid/stale/revoked-session/Storage/SQL-interleaving/atomicity matrices remain unverified where evidence is missing. No deployment or additional Admin action is authorized by this runbook.
