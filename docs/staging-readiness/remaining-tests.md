# Continue installed staging tests safely

Source inspected: `igotu-staging-validation` at `dd13352e31d6a53251baf501181a657882d840f0`. This continuation uses the existing integration/runtime/config modules. It does not install migrations, provision accounts, change schemas, grant Admin privileges or deploy. The original full suite is unchanged in scope and still starts with registration: **use `--remaining` for continuation**.

## Windows quick start

Use Node.js 20 or later and Windows PowerShell. Run from the repository root. No npm install or extra dependencies are needed for the focused API checks.

```powershell
node tests/staging/remaining.test.cjs
node tests/staging/remaining-lifecycle.test.cjs
node tests/staging/integration.cjs --remaining --plan
```

Keep your existing config, approval and secrets files **outside the repository and any served frontend directory**. Do not paste their contents into chat, capture their contents in screenshots or commit them. Windows uses NTFS ACLs: restrict the private directory to your account using its Security properties. POSIX systems require secret-file mode 0600. The loader cannot infer Windows ACL safety from POSIX mode bits.

In your LOCAL config, retain synthetic accounts' actual UUIDs and roles and set:

- `projectRef`: `oqalpauljjhytnrpzcqp`
- `url`: `https://oqalpauljjhytnrpzcqp.supabase.co`
- the staging publishable key; never use a privileged key
- a synthetic mail domain ending in `.test` or `.invalid`, and a valid fixture service date
- `remaining.messageRequestId`: `SR0001` (or another checked current-pair synthetic service)

Your LOCAL approval file must bind this project, have an unexpired `expiresAt`, and acknowledge `syntheticOnly`, `network`, `syntheticWrites`, `migrationsReviewed`, `migrationsInstalled`, `privateSchemaReviewed`, `testAccountsReviewed` and `remainingTests`. These fields record the existing authorization; they do not authorize schema changes, Admin actions, deployment or arbitrary writes. Leave `authSignups` and `mailCapture` false for remaining mode. No signup is performed. D01–D04 are already installed according to the owner; never execute them again.

Only actors used by the selected checks need secrets. ST-13 needs `clientA`, `providerA`, `clientB`; each entry accepts your existing email/password pair or `{ "accessToken": "LOCAL_STAGING_USER_JWT" }`. JWTs are checked for staging issuer, subject, authenticated role and expiry before transport, then independently verified by `/auth/v1/user`. Never use a service-role token. The shared protected-service control always also needs Client A and Provider A account declarations.

Set the following variables once, using your existing local paths:

```powershell
$private = 'C:\Users\USER\igotu-staging-private'
$stagingArgs = @('--config', "$private\config.json", '--approval', "$private\approval.json", '--secrets', "$private\secrets.json")
node tests/staging/integration.cjs --remaining --execute @stagingArgs
```

The command selects **only ST-13** by default. Run the same command to resume. It checks the published phase-4 contract and preserves SR0001's completed request row, exactly one RM100 Cash payment and two five-star reviews. It sends two synthetic messages, tests read permissions, forged sender/receiver attempts and notification access. It does not replay lifecycle/payment/review operations. No Admin credentials are needed for ST-13.

## Select additional checks

```powershell
node tests/staging/integration.cjs --remaining --execute --only ST-05,ST-06,ST-07,ST-08,ST-10,ST-12,ST-13,ST-17,ST-19 @stagingArgs
```

Select only cases whose prerequisites you have checked. Cases run in the supplied order and stop on failure or a blocked prerequisite. Selecting all of the above requires all their actors up front; use a smaller selection when fixtures are missing. Add `--state "$private\remaining-state.json"` to keep the journal outside the repo; retain that same path to resume.

| Case | Focused capability | Additional prerequisite |
|---|---|---|
| ST-05 | Pending/rejected/suspended account read and reader-RPC denial | Existing actors with independently checked latest history/status; no status changes |
| ST-06 | Anonymous table, private-schema profile headers, Provider raw-request denial | Client A and Provider A controls |
| ST-07 | Scoped reader controls and wrong-role/unrelated RPC denial | Client B active and approved |
| ST-08 | Existing transfer proof reference, signing and foreign/public access denial | Separate completed synthetic transfer in `receiptRequestId`; owned canonical `proof_path` |
| ST-10 | Existing matching truth table, aggregate assertions, distance order, PII absence | Existing `matchingControlRequestId` and at least eight independently specified `matchingCases`, as documented in operator-tests.md |
| ST-12 | Separate synthetic decline, exclusion and second-Provider assignment recovery | Two eligible, approved Providers; see fixture setup below |
| ST-13 | Two-way messaging, unread normalization, receiver read updates, denied edits and cross-account reads/sends, notification uniqueness | Existing current Client A / Provider A service; Client B approved |
| ST-17 | Read-only active Admin payment monitor/reconciliation queue and Client denial | Existing active synthetic Admin; no Admin mutations |
| ST-19 | 20 same-slot races, alternating launch order, exact conflict responses, Client/Provider readback | Two approved Clients and approved eligible Provider B, dedicated future slots |

`PASS` means the listed focused API assertions passed on that execution. It is **not** a complete acceptance-case pass. JSON and Markdown reports enumerate remaining browser/operator assertions and keep all 14 full acceptance groups `UNVERIFIED`. `FAIL` means an assertion failed; `BLOCKED` means prerequisites, configuration, transport or reconciliation prevented execution; `SKIPPED` means not selected. Selected cases after a stop are `BLOCKED`. Exit codes: 1 failed assertion, 2 blocked, 3 focused checks passed with broader acceptance still incomplete; planning exits 0.

ST-01/02 registration/browser work, ST-03/04 identity mutation flows, ST-09/11/14/15/16 completed lifecycle checks, ST-18 suspension and ST-20 schema-based late-failure probes are intentionally not dispatched by remaining mode. Selecting one records `BLOCKED` instead of replaying the original full suite. Their original procedures remain available for separately reviewed dedicated fixtures. Atomic late-failure injection requires separately approved schema work; suspension/identity Admin mutations require separate bounded authorization. Do not treat their related SR0001 successes as proof of their full negative/concurrency matrices.

## Synthetic fixture setup and cleanup

No account is approved or profile changed automatically. In particular, the owner's unverified Provider B remains unverified. ST-12/ST-19 block until an ordinary synthetic Provider has completed verification/Admin approval and has matching skills, specialization, availability and weekly hours. Assign its UUID to the intended test alias only after reviewing the local config; changing fixture bindings requires a new journal, preserving the old one.

For automated ST-12 setup, set this in LOCAL config:

```json
"remaining": {
  "messageRequestId": "SR0001",
  "decline": { "synthetic": true, "create": true },
  "concurrency": false
}
```

Then run `--only ST-12`. The runner creates one request at `config.date` / 12:00 with a persisted creation key and `SYNTHETIC ST-12 <run UUID>` title. It reads back the owner, title, date, budget, category, specialization and time before selecting a Provider. The second Provider must also be eligible before the first selection. A lost committed creation response is found by its creation key. An uncertain absent write stops; it is never blindly retried. You may instead supply `decline: { "synthetic": true, "requestId": "YOUR_SEPARATE_SYNTHETIC_ID", "title": "SYNTHETIC exact fixture title" }` for a pristine existing pending Client A request.

The recovery request remains `provider_selected` so its assignment evidence can be inspected. To release its reservation, use Client A's ordinary cancellation flow for that exact synthetic title/request ID, retaining its history. Do not cancel SR0001. Once cancelled, this fixture is terminal: preserve its journal/reports and use a new explicitly named `--state` for a new run if another trial is needed.

For ST-19, set `remaining.concurrency: true` and run `--only ST-19`. Forty new synthetic requests use future dates `config.date + 1` through `+20`, at 10:00. Each pair shares one slot and selects Provider B concurrently. Both requests are cancelled through their own Client RPCs after independently validating one winner, the expected conflict, and exclusive assignment. Rows, notifications and history remain. Interrupted cleanup resumes from readback; uncertainty stops. No SQL barriers are installed, so this does not prove all lock/interleaving acceptance criteria.

Private proof fixtures and matching truth tables use the existing operator procedures. Do not create another payment/review on SR0001. Referenced private documents/proofs must be retained; no blanket DELETE, Storage wipe or evidence cleanup is included. ST-13 retains its messages and notifications as evidence.

## Journals, reports and uncertain operations

Default journal: `work/staging/remaining-reports/remaining-state.json`. Each execution produces new timestamp/UUID-named `.json` and `.md` reports in that directory. No tokens, passwords, signed links, response bodies or identity documents are written to reports. Journals contain synthetic IDs, action states and a hash of protected SR0001 evidence; treat them as local evidence. Keep them backed up outside source control.

An exclusive journal lock blocks concurrent processes using the same journal. Do not launch the same fixtures concurrently with different journals. After a crash, first verify the process is gone before removing only its `.lock` file. Keep the journal. A persisted message/creation is reconciled by ID and content. If a recorded write has no visible result, or race responses were lost, the runner blocks for read-only operator reconciliation rather than resending. Never edit an attempted action into a successful result. Preserve the report and investigate with the synthetic row IDs. New journals create new probes and must not be used to hide or retry an uncertain outcome.

The protected-service digest is compared before and after cases and across resumes. Unexpected payment/review/service changes fail validation. Reports are immutable per invocation; earlier evidence is never overwritten. Historical Phase 7 plan/preflight output remains explicitly offline and may mention old provisioning gates; those messages are not instructions to reinstall the now-installed database.
