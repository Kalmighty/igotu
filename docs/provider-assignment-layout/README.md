# Provider assignment layout review

Branch: `fix/provider-assignment-layout`. Base: `igotu-staging-provider-b-finish` at `146fa47f834d13f6633933873b1e0c85ed2240ac`.

The shared `incoming-card` grid allows intrinsic review/image/text widths to determine the actions column. Long content can squeeze or overflow the service details. A stylesheet loaded only by Assignments gives `.assignment-card` a shrinkable details track and a 320px actions track at desktop widths (1200px and above); smaller workspaces stack both tracks. All overrides are scoped to `.assignment-card`. Incoming Requests and the global card rules are unchanged.

Titles, addresses, reviews, dates and payment values can wrap; the address occupies a full details row. Payment fields use two columns where space permits, with the recorded date spanning both. Submitted/receipt images retain their full content with a 460px width and 220px height cap. Maps use 260–300px heights and the available details width. Map instances are removed before a list reload, invalidated when their container resizes, and invalidated after window/navigation breakpoint changes, including the fallback without ResizeObserver. Popups open on marker activation, rather than obscuring a small map on page load, and leave room for the zoom controls.

Display-only formatting removes floating-point tails from recognized 0.1-degree approximate-grid labels; arbitrary addresses and non-grid text are unchanged. Coordinate captions use five decimal places. Neither stored coordinates nor the coordinates passed to Leaflet are rounded. There are no new location lookups or authorization fallbacks.

## Offline validation and visual evidence

Run `npm ci --prefix tests`, then `npm --prefix tests run test:assignments` with local Chromium installed (`/usr/bin/chromium` in this Codex environment). The focused test serves local files, substitutes the existing synthetic transport, serves installed Leaflet assets/generated image and map tiles, and blocks other external requests. It checks confirmed/in-progress/completed cards, submitted and payment images, review form/submitted review, long text, scoped Provider RPC arguments, keyboard focus, popup/zoom separation, map sizing across breakpoint changes, overflow and automated WCAG A/AA rules at 390/768/1024/1440px. It never activates a write action. Synthetic request IDs are `SYN-LAYOUT-*`.

Before screenshots are captured from an untouched detached worktree at the exact base, using the identical fixtures: set `ASSIGNMENT_PHASE=before` and `ASSIGNMENT_SOURCE_ROOT` to that worktree when running the same test. `before` means evidence capture, not that the old layout passes the new assertions. Screenshot capture hides only the offscreen, unfocused skip link to avoid a full-page stitching artifact; the actual skip link remains unchanged and functional.

See [validation.json](validation.json) for final results and notes. Before/after full-page screenshots at all four widths and completed-card desktop/mobile crops are in [screenshots](screenshots/).

This is frontend visual/fixture validation, not live backend acceptance. No Supabase/SQL/Auth/Storage configuration or data was accessed or changed. Versioned staging evidence/procedures remain unchanged; no SR0001, SR0002, SR0011 or SR0052 service/payment/review/message was read or written. No deployment or merge was performed.

## Windows: build a fresh staging-only review artifact

Use Windows PowerShell with Git and Node.js 20+ installed. Start at the existing repository root. Keep your existing public staging config JSON outside Git; it must contain `projectRef`, `url` and `publishableKey`. Do not put account passwords, tokens or service-role keys in that file. These commands only prepare and zip static files locally; they do not open the app, connect to Supabase, install SQL or deploy.

```powershell
$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$repoRoot = (Get-Location).Path
$reviewDirectory = Join-Path (Split-Path $repoRoot -Parent) "igotu-assignment-review-$stamp"
git fetch origin fix/provider-assignment-layout
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
git worktree add --detach $reviewDirectory FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Fresh review worktree failed' }
Set-Location $reviewDirectory
git merge-base --is-ancestor 146fa47f834d13f6633933873b1e0c85ed2240ac HEAD
if ($LASTEXITCODE -ne 0) { throw 'Unexpected base history' }
git rev-parse HEAD  # Compare with the reviewed fix commit in the completion report.
if (git status --porcelain) { throw 'Review checkout must be clean' }

$configPath = Read-Host 'Absolute path to your existing public staging config JSON'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.projectRef -ne 'oqalpauljjhytnrpzcqp' -or
    $config.url -ne 'https://oqalpauljjhytnrpzcqp.supabase.co') {
    throw 'Expected the isolated IGotU staging project only'
}
if ($config.publishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]{16,}$') {
    throw 'A staging publishable key is required; no secret/service-role key'
}
# Re-encode public fields only as UTF-8 without BOM for the existing builder.
$publicConfigPath = Join-Path $env:TEMP "igotu-public-staging-$stamp.json"
$publicConfigJson = @{projectRef=$config.projectRef; url=$config.url; publishableKey=$config.publishableKey} | ConvertTo-Json
[IO.File]::WriteAllText($publicConfigPath, $publicConfigJson, (New-Object System.Text.UTF8Encoding($false)))
$artifactName = "provider-assignment-review-$stamp"
node tools/prepare-staging-frontend.mjs $publicConfigPath $artifactName
if ($LASTEXITCODE -ne 0) { throw 'Artifact build failed; stop here' }
$artifact = Join-Path (Get-Location).Path "work\staging\$artifactName"
$metadata = Get-Content -LiteralPath (Join-Path $artifact 'STAGING-ARTIFACT.json') -Raw | ConvertFrom-Json
if ($metadata.projectRef -ne 'oqalpauljjhytnrpzcqp') { throw 'Wrong artifact project' }
if (Test-Path (Join-Path $artifact 'database')) { throw 'SQL must not be in the frontend artifact' }
if (git status --porcelain) { throw 'Builder unexpectedly changed tracked/unignored source' }
Compress-Archive -Path (Join-Path $artifact '*') -DestinationPath "$artifact.zip"
Write-Host "Prepared staging-only review folder: $artifact"
Write-Host "Prepared review ZIP: $artifact.zip"
```

Keep earlier artifacts and evidence intact. Do not serve the repository's original production-configured `igotu_v2` directory as staging. The builder replaces public configuration only in the fresh ignored artifact and excludes database drafts. Opening the generated app for live testing remains a separate operator action; these instructions do not authorize new service/payment/review/message writes.
