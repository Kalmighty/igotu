# Staging request-image rollout readiness — no execution approval

This is the current readiness package for `fix/private-request-images`, extending `7b9ccc67e59cf87ca756988f6f628945e02fa1f4`. **Staging only: oqalpauljjhytnrpzcqp.** No SQL, auth tests, image HTTP downloads, bucket changes, fixture creation, deployment or merge were performed by Codex. The bucket remains public according to independent operator evidence. `proposal.sql` is unchanged and remains unapproved for execution.

## Evidence versus acceptance

[evidence.json](evidence.json) records the user's independent database checks: PostgreSQL 17/phase 4; corrected fingerprint SELECT succeeds; save RPC `fcf40031bee715b5078ccdd803d5e64b`; Storage operation helper `e2f7d55adc027df69ec4b42c6c08f50f`; policies `d32ba30e81d6497aa55b53d507dab2b0`; one existing image; SR0052 canonical/owner/type/size checks pass; request row `2ce13c921f2443f78a752e439fc37b79`; image metadata `a05a9342d3ff96970818bac4fb00a8cf`; stored cache metadata **max-age=3600**. This is reported independent evidence, not a new Codex observation or migration approval. Stored cache metadata does not establish actual CDN/browser response behavior.

Still **UNVERIFIED**: current operator/connection evidence, complete effective ACL review, writer pause, real operation-tag values/behavior, native Windows transport, HTTP headers/body hash, cold/warm cache behavior, anonymous legacy URL rejection after cutover, and the live authorization matrix. No expected execution fingerprint GUC, approval file, fixture state or pause attestation is filled automatically. Missing protected row/related-data pins for SR0001/SR0002/SR0011 and related-data pins for SR0052 remain blockers.

## Runner boundaries

`tools/request-image-readiness.cjs` uses Node.js 20+ built-ins. Its default is **dry-run**, including when private-file arguments are present. It does not read credentials, create reports/approvals, change files or make network requests in that mode. The test suite uses fake files/approvals and a memory-only transport, not real credentials or sockets. Injected reports are explicitly labeled OFFLINE and cannot be finalized as live evidence by the CLI. Live report types require the gated Windows transport.

```powershell
node tools/request-image-readiness.cjs
npm --prefix tests run test:request-image-readiness
# Optional Windows syntax-only check; does NOT execute the HTTP worker:
$tokens = $null; $parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path tools/request-image-http.ps1).Path, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw 'Windows transport syntax review failed' }
```

There are only three additional phases:

| Phase | Gate and behavior |
|---|---|
| `baseline --execute` | Separate `request-image-anonymous-baseline` approval. Two anonymous GETs to the same exact SR0052 old public URL, constructed only in memory from the private context. No API key/JWT/password is sent on those GETs and no login is attempted. Records status, allowlisted safe response headers, body SHA-256 and byte count; no image body, URL or path is saved. |
| `post-cutover --execute` | Separate `request-image-post-cutover-auth-http` approval explicitly permitting existing-account auth, image HTTP and denial checks. Uses existing private synthetic credentials/tokens, no signup/provisioning/status transitions. Auth password login creates managed Auth sessions/audit entries and is **not a SQL SELECT**; this requires explicit future authorization. Existing valid access tokens can avoid login, but authenticated identity checks still require approval. |
| `finalize` | Offline comparison of a completed HTTP report with a fresh operator-collected post-HTTP snapshot. Requires the same unexpired approval/context/before-snapshot binding. Writes a new private finalized report only; no HTTP or SQL. |

The live phases run only on Windows and use an internal PowerShell/.NET HTTP transport. It preserves OS trust/certificate validation and the configured proxy (including HTTPS_PROXY/ALL_PROXY when present), refuses redirects, caps bodies at 5 MiB and times out. It never retries directly after a proxy failure, disables TLS verification, or changes network policy. A PowerShell execution-policy or proxy/certificate failure is a blocker, not a reason to bypass security. The internal transport uses captured process pipes for private auth payloads; do not run `request-image-http.ps1` by itself or print its raw IPC output. The runner prints only phase/status/safe error codes.

Only exact-staging Auth token/user endpoints, the two read-only image RPCs, authenticated/public image GET, and Storage list/sign denial POSTs are allowlisted. No SQL client, migrations, application mutations, file upload/delete/upsert, signup, Admin provisioning, confirmation, payment, review or message API is available. A successful signing response is an immediate STOP; any returned token is discarded, never logged or persisted. Managed Auth/Storage can record access metadata; any protected metadata drift still stops finalization, rather than being silently ignored.

## Private files and credentials

Keep every filled config, credential, context, approval, raw/reviewed snapshot and report **outside every Git checkout and frontend artifact**. The runner resolves paths/symlinks, rejects existing report targets, and uses exclusive report creation. On Windows, review private-directory and file ACLs yourself (`Get-Acl`); no ACLs are changed automatically. POSIX offline fixtures require mode 600. Reports are kept private even though the runner avoids raw actor IDs, paths, public/signed URLs and tokens in their content.

Use the existing staging `config.json` shape (`syntheticOnly`, exact project/url, publishable key, `accounts` with reviewed synthetic UUID/role bindings, optional `frontendDirectory`). Credentials may use the existing `{clientA:{email,password},...}` format or existing bootstrap `{accounts:{clientA:{email,password},...}}`; existing `accessToken` values are also supported. Only synthetic `.test`/`.invalid` email/password logins are accepted. A token must claim authenticated role, exact staging issuer and the configured subject, then pass a real `/auth/v1/user` check before any actor test. Service-role/secret keys are never accepted as public configuration or user session tokens. No credential values are passed as shell arguments or persisted to reports.

The committed templates are **not valid approvals**: [approval.template.json](approval.template.json) has `approved:false`; [context.template.json](context.template.json) leaves identities, missing pins, fixtures and every writer attestation unverified. The runner never creates, signs, copies, expands or renews operator approvals. A local flag/file cannot itself grant permission: fill a separate private approval only after the user explicitly authorizes that exact phase and time window.

## Protected snapshots and digest binding

The [prepared SELECT-only snapshot](snapshot-read-only.sql) has not been executed here. It produces one private JSON object: exact project/PG/phase/bucket state, the same canonical casted policy digest, all four protected request hashes, image metadata/path hashes, and related-data hashes covering **all fields** of payments, reviews, messages (including content/read flags), declines and reports in deterministic order. It also captures actor/fixture metadata needed for read-only role tests. UUIDs/fixture IDs in that output are private; redirect output to a private file, never Git or chat.

Run it only through the independently verified existing Windows **staging** PostgreSQL connection after separate SELECT-only approval. The HTTP runner does not execute SQL. If using an already configured staging-only `psql` service profile, an operator-reviewed example is `psql "service=igotu-staging" -X -qAt -v ON_ERROR_STOP=1 -f docs/private-request-images/rollout/snapshot-read-only.sql > "$privateRoot\before.raw.json"`; the profile must already exist and independently match staging. Do not put connection passwords/URLs on command lines. No service profile is created by this package.

Preserve the raw export, review it, and separately attest `catalogReviewed:true` in a reviewed private copy without changing `capturedAt` or calculated hashes. Copying calculated pins into an approval automatically is forbidden: independently review and approve the baseline inventory/pins first. The runner requires every protected row and related-data pin, hard-pins the supplied SR0052 row/metadata/cache/type evidence, and rejects a missing record or mismatch. Snapshots must be at most ten minutes old; the after snapshot must be captured **after** HTTP completion. The approved before-snapshot file SHA-256 binds the exact reviewed copy. Any change to application-related rows, image count, protected metadata, or observed actor/fixture/reader-catalog state is a STOP. No hashes are rebased automatically. If managed last-access metadata changes, stop and separately review it; do not whitelist the change inside this runner.

## Maintenance checklist — unsigned, every row UNVERIFIED

The private context must identify the overall confirmer, UTC ISO start/expiry, and for **each** source: owner, actual pause/drain/verified-absence evidence, confirming person and time, expiry, exceptions and resumption authority. Maximum approval/maintenance window is two hours; each confirmation must occur within the window. Any unresolved exception blocks execution. No source is considered paused because a database connection sample was quiet.

| Context source | Operator must verify |
|---|---|
| `clients-previews` | All Client/Provider/Admin tabs, preview/local origins and alternate clients are closed or isolated from application mutations. |
| `frontends-backends` | Every deployed frontend/backend and integration instance targets the correct project and is in maintenance; traffic/drain evidence and owner signoff retained. |
| `auth-admin-provisioning` | Signup, Admin provisioning, onboarding scripts and invitation/provisioning automations paused; bounded existing-user Auth tests are separately authorized, not implicit. |
| `workers-queues-retries` | Workers stopped/drained; queues, retries, delayed/in-flight jobs and failure replays cannot write during the window. |
| `ci-cd-schedules` | GitHub Actions, deployment previews/hooks, cron/schedulers and manual dispatches disabled or verified absent with owners. |
| `webhooks-notifications` | Inbound webhooks, notification writers, third-party callbacks and retry deliveries paused/drained. |
| `local-development` | All developer machines, CLI sessions, local servers, scratch scripts and manual SQL editors accounted for. |
| `privileged-writers` | Service-role tools, Admin/Postgres writers, external scripts, dashboards and privileged automations frozen except explicitly approved observations. Managed platform internals are not claimed paused. |

Record names/evidence privately; no signatures are supplied by Codex. Resume only by the named authority after integrity/acceptance review and a separate execution/release decision. Expiry or file modification revokes the runner's permission to continue; no automatic extension exists.

## Future anonymous HTTP/cache baseline — NOT AUTHORIZED NOW

Only after explicit approval, a reviewed private context must bind the exact SR0052 image path by the snapshot's path MD5. The old public URL is never printed or stored by the runner. Its metadata remains `max-age=3600`; future upload `cacheControl:0` does not change old objects or purge any cache.

Two requests use fresh, non-browser HTTP clients without a local response cache. Observation one is **not proof of a cold CDN edge**. Observation two is only an edge-warm candidate; classify the actual returned CDN/cache headers (MISS/HIT/BYPASS/DYNAMIC/revalidation). Do not claim a warm/cold state from request order alone. Unknown classification/lifetime, redacted unexpected header data, different response bytes, non-WebP content, redirects, oversized bodies or non-200 control responses STOP the baseline. Keep actual safe Cache-Control, Age, Expires, ETag, Last-Modified, Date and available cache-status headers in the private report. If native headers cannot establish behavior, obtain separate operator/provider cache evidence; there is no override switch.

Example commands below are **future gated procedures, not current permission**. Private approval/context/snapshots must already exist and be reviewed; these commands do not create approval files:

```powershell
$privateRoot = Read-Host 'Existing private staging evidence directory outside all Git/frontend folders'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
node tools/request-image-readiness.cjs --phase baseline --execute --config "$privateRoot\config.json" --context "$privateRoot\image-context.json" --approval "$privateRoot\image-baseline-approval.json" --before "$privateRoot\before.json" --report "$privateRoot\baseline-$stamp.json"
# Exit 2 after successful HTTP capture means AFTER-SNAPSHOT REQUIRED, not PASS/GO.
# Obtain/review a fresh after.json through the separately authorized SELECT-only connection.
node tools/request-image-readiness.cjs --phase finalize --config "$privateRoot\config.json" --context "$privateRoot\image-context.json" --approval "$privateRoot\image-baseline-approval.json" --before "$privateRoot\before.json" --input-report "$privateRoot\baseline-$stamp.json" --after "$privateRoot\after.json" --report "$privateRoot\baseline-final-$stamp.json"
```

Approval scopes are exact (`request-image-anonymous-baseline` versus `request-image-post-cutover-auth-http`), with human authorization reference, approved person/time, expiry, reviewed private ACLs, and SHA-256 bindings to this exact proposal, private config, context and reviewed before snapshot. A calculated digest is evidence only. Approval must be renewed manually after explicit authorization if expired or context changes. `Get-FileHash -Algorithm SHA256 -LiteralPath ...` can inspect local file digests; it must not automatically populate/approve anything.

## Post-cutover read-only authorization matrix — prepared, NOT AUTHORIZED NOW

No runner changes record states. Before/after Provider confirmation use **two separately approved dedicated image fixtures** with the same Provider, one `provider_selected`, one `confirmed`. Never reset SR0001/SR0002/SR0011/SR0052 to manufacture those states. Any needed fixture/account provisioning or confirmation write needs its own prior authorization and tool; this runner cannot perform it. Bind all actor UUIDs, request/path hashes, state/ownership metadata and known positive body SHA-256 values in the reviewed private context. Inactive-user credentials must be existing; authentication failure is BLOCKED, not proof of image authorization.

Each case object has `label`, `actor` (existing credential/config alias, or null for anonymous), `requestId`, private `path`, and for positive controls `bodySha256`. Required labels/expectations:

| Label | Read-only expectation | Source |
|---|---|---|
| `owner` | Owning active verified/profile-complete Client gets one authorized reference and matching image bytes. This control runs first. | OFFLINE EXPECTATION; live UNVERIFIED |
| `selected-before` | Selected active verified Provider on a dedicated `provider_selected` fixture gets no reference/image bytes. | OFFLINE EXPECTATION; live UNVERIFIED |
| `selected-after` | Same Provider on a dedicated `confirmed` fixture gets matching reference/image bytes. | OFFLINE EXPECTATION; live UNVERIFIED |
| `unrelated-client` | Distinct Client denied against the exact owning-Client positive-control image. | OFFLINE EXPECTATION; live UNVERIFIED |
| `nonselected-provider` | Distinct Provider denied against that same known image. | OFFLINE EXPECTATION; live UNVERIFIED |
| `admin` | Active authorized Admin obtains an associated image through the existing Admin workspace rules. | OFFLINE EXPECTATION; live UNVERIFIED |
| `anonymous` | No user token; denied against the same known positive-control image. | OFFLINE EXPECTATION; live UNVERIFIED |
| `inactive` | Existing valid Auth session of an application-inactive/suspended otherwise associated owner/Provider with approved identity history and completed profile is denied. No reactivation or account changes. | OFFLINE EXPECTATION; live UNVERIFIED |

Every case also attempts native Storage **listing and signing**, both expected to expose no object metadata/capability, including for owner/Admin. Listing may return a native `200 []` under RLS; that is labeled **FILTERED_EMPTY_NOT_HTTP_DENIAL**, distinct from an attributable HTTP permission denial. Any nonempty/malformed listing or successful signing response stops. A filtered empty list alone is not proof of the internal operation tag; it is interpreted only after the same-image authorized download control succeeds. Reference denials plus direct authenticated-download denials must be checked independently. A matching authorized body hash/control is mandatory before interpreting negatives. Authenticated 401, proxy HTML 403, unknown/malformed error formats, missing permission/helper support or a bad URL are not counted as authorization proof. The final check fetches the **exact old public URL**, without cache-busting, and requires an attributable Storage denial. Warm/browser/other-vantage edge-cache and any older signed-token tests still need operator/provider review; one HTTP matrix run is not a global cache purge proof.

The private context's `operationContractReviewed`, `effectivePrivilegesReviewed`, and `cachePlanReviewed` flags are prior human **design/catalog/plan review**, not assertions that unrun live behavior passed. Actual operation-tag values require approved Storage diagnostics; the matrix proves its observed outcomes only. Post-cutover fingerprints are new separately reviewed evidence, never assumed equal to the old save/policy hashes. `reviewedImageReaders` must also bind all six new public/private image reader, capability, authorization and resolver routines by definition MD5, raw ACL MD5, postgres owner, STABLE/IMMUTABLE volatility and the intended invoker/definer mode. Review the actual definitions and effective privileges through separately authorized SELECT-only inspection; copying the calculated `imageReaders` map into a context without that review is not approval. Missing/mutable/unreviewed routines block HTTP. No fingerprint grants migration approval.

Future command, only after that phase is explicitly authorized and all preceding gates pass:

```powershell
node tools/request-image-readiness.cjs --phase post-cutover --execute --config "$privateRoot\config.json" --secrets "$privateRoot\secrets.json" --context "$privateRoot\image-post-context.json" --approval "$privateRoot\image-post-approval.json" --before "$privateRoot\post-before.json" --report "$privateRoot\post-http-$stamp.json"
# Collect/review post-after.json, then use --phase finalize with these same bound files.
```

## Exact migration review checklist — no application by this package

1. Compare reviewed branch/commit and every candidate SHA-256 in the manifest; confirm `proposal.sql` has not changed from the reviewed `7b9ccc6` candidate. Do not execute it, D01–D04 or historical repair scripts as a preflight step.
2. Independently establish staging host/project/operator/PG17/phase 4. Review actual save/helper definitions and ACLs, the complete casted policy fingerprint, exposed-schema/private-schema controls and effective schema USAGE/function EXECUTE paths. The reported MD5s are drift evidence, not semantic review or approval. Do not revoke grants to cure a denied control.
3. Collect/review protected row/related/image hashes, canonical association/owner/MIME/size/inventory, actual stored and HTTP cache evidence. All four protected records and linked payments/reviews/messages/declines/reports must be pinned. Stop on a conflict; no backfill or file deletion is included.
4. Complete the unsigned writer inventory with actual owners, drain evidence, expiry and resumption authority. Confirm native Storage operation support and define cache/past-signed-token acceptance requirements. Unknowns remain NO-GO.
5. Obtain **separate explicit SQL/bucket-change authorization**, bound to the exact proposal hash, reviewed expected fingerprint values and maintenance window. This readiness runner never sets execution GUCs or executes SQL; its HTTP approval scopes cannot authorize migration execution.
6. Only a separately authorized operator may apply the proposal transaction with stop-on-error. It installs narrow helpers/policies, checks inventory and makes the bucket private; any error must roll back and stop. Preserve existing definitions/ACLs/settings and protected snapshots beforehand. Do not rerun SQL or relax gates automatically.
7. While traffic stays paused, verify private state, actual new definition/policy fingerprints, supported operation behavior and old-public/signed-cache transition under separately approved observations. Then run the separately authorized matrix with fresh snapshots and dedicated fixtures. Treat unmatched body/hash/actor/permission results as STOP.
8. Reconcile every report and snapshot, approve any next frontend artifact/deployment step separately, and let only the named resumption authority release maintenance. No runner success deploys, merges, resumes traffic or creates an approval.

## Stop conditions and rollback

STOP on absent/expired/wrong-scope approvals, any modified bound file, unknown/missing protected pins, stale snapshots, changed request/payment/review/message/image evidence, unpaused/expired writer confirmation, unknown cache behavior, wrong host/role/body, proxy/TLS/permission/auth failure, unsupported tags/helper behavior, any listed object metadata, successful signing, or any denied image bytes delivered. Never repair, expand grants, create fixtures, update pins, retry directly, extend approvals or resume traffic automatically.

Before SQL application, rollback is simply **do not apply**; the known public-bucket exposure remains unresolved. A failed future SQL transaction must roll back as a unit and stop. After a future successful cutover, keep Storage private and retain restrictive boundaries; pause image operations and use an image-unavailable frontend/previous artifact rather than reopening public reads. Review a forward correction or separately authorized captured-definition rollback; no rollback SQL or visibility toggle is executed here. Preserve files/associations/evidence. Previously downloaded content and cached responses cannot be recalled, and new restrictions do not revoke previously issued signed URLs. Any supported Storage cache/key intervention needs separate authorization and cross-feature review; do not delete SR0052 or rotate Auth keys as a substitute.

Exit codes: **0** dry-run or offline snapshot finalization completed; **1** executed HTTP phase stopped on a failed check; **2** blocked prerequisites or successful HTTP phase awaiting protected after-snapshot. None means migration/deployment GO. Native PowerShell/Windows proxy/TLS execution and all live HTTP/auth phases remain UNVERIFIED in this package.
