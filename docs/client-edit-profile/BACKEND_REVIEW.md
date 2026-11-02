# Profile media — additive migration and Storage review

**REVIEW ONLY — NOT APPLIED.** No SQL was executed locally or remotely, and no Supabase configuration or live data was read or changed. This candidate requires separate user approval and isolated backend integration tests before rollout. Frontend fixture success is not proof that real uploads/persistence/security work.

Candidate: [`20261102153413_client_profile_media_review_only.sql`](../../igotu_v2/database/client-profile-media-review/20261102153413_client_profile_media_review_only.sql), kept outside an automatic migration deployment directory. Its filename was created using `supabase migration new` with CLI 2.54.11 in an isolated temporary project, then copied into the review directory. This only created a text file.

## Inspected baseline

The checked-in reviewed catalog (`docs/backend-integration/catalog-reviewed.json`) has no avatar/banner columns, media table, matching bucket or RPC. Existing `complete_basic_profile(text,text)` updates only the authenticated user's full name, phone and profile-completed flag. Existing browser permissions are not assumed to permit a users update. Existing Storage buckets/policies serve unrelated evidence/receipts and are not repurposed.

The application already requires backend contract `20261026.1`. The candidate depends on that reviewed foundation's private `require_workspace('client')`, `workspace('client')` and `require_read_committed()` helpers, including active status, completed profile and consistent Admin-reviewed identity history. It does not change those helpers or claim they have been deployed. Effective private-schema exposure and installed helper definitions must be confirmed separately before application.

Supabase Storage bucket/access documentation was checked through the documentation search tool, including private buckets and signed URL access. Direct changelog retrieval was blocked by the environment's HTTP policy (403); no relevant changelog review is claimed. No project inspection/query tools were used. The PostgreSQL RLS skill guidance was applied to ownership predicates, indexed owner keys, explicit grants and private privileged helpers.

## Candidate design

- `public.client_profile_media`: separate owner-primary-key record, avatar mode/value, banner mode/value/design, version, last operation UUID and updated timestamp. It references the existing user ID. No columns or grants on `public.users` change.
- RLS on the new table; authenticated Client owner SELECT only. No browser INSERT/UPDATE/DELETE grants.
- Public read/save wrappers use SECURITY INVOKER. Privileged implementations remain in the already-private backend schema, with empty search paths, auth-derived actor checks and explicit EXECUTE revocation/grants. No endpoint accepts a target user ID.
- Strict JSON keys, 12/8 template-ID allowlists and color/pattern allowlists. Arbitrary remote URLs or CSS cannot become persisted settings.
- Per-user row lock and expected-version comparison prevent stale-tab overwrites. Repeating the last operation UUID returns the committed row; older stale operations conflict after the version advances.
- New uploaded references must use the current operation's exact immutable path; existing current references may remain. Retired paths cannot be re-adopted by a later operation. The referenced Storage object must belong to the authenticated owner, match WebP metadata and fit its avatar/banner size bound.
- Private `client-profile-media` bucket: 5 MiB object limit, WebP MIME allowlist. The avatar's 2 MiB reference limit is additionally checked by the save RPC. Client canvas processing supplies a fresh WebP crop; Storage metadata checks do **not** prove server-side image decoding or malware inspection.
- Bucket-specific restrictive policies enforce Client identity/ownership even in the presence of older broad permissive policies. No Storage object overwrites; only immutable INSERT, owner SELECT/signing and owner deletion of unreferenced objects. A further restrictive deletion policy protects currently referenced media.
- Other buckets continue through their existing policies; the new restrictive boundary is true for other bucket IDs. No existing bucket or policy is removed or broadened.

The review gate requires a privileged reviewed application context and installed foundation helpers, excludes a conflicting pre-existing media bucket and checks Storage RLS. The private-schema setting check is only a guard, not authoritative proof of API exposure. A missing `pgrst.db_schemas` value still requires external effective-configuration evidence.

## Offline verification and outstanding backend work

`pglast 7.22` parsed all 28 outer SQL statements and both PL/pgSQL function bodies without execution. Parsing caught an ambiguous CASE expression in the media-size IF; parenthesising it fixed the grammar. Static checks verify private/owner boundaries and unchanged existing SQL. Parsing does not resolve all schema objects/types, execute grants/policies or prove transaction semantics.

Before any approval to apply, the reviewer needs to validate the actual database/catalog version, helper definitions, schema exposure, ownership/role privileges, Storage `owner_id`/metadata conventions and MIME/size behavior. Test authenticated Client, foreign Client, Provider, Admin, unverified/suspended/incomplete and anonymous actors; direct-table mutations; malformed IDs/settings/paths; cross-owner signing/deletion; referenced-file deletion; stale versions; lost responses; concurrent saves/cleanup; signed URL expiry and role revocation. Existing broader Storage policies must be evaluated with the restrictive candidate in place.

No live advisors, RLS queries, Storage writes, configuration changes, deployment or rollback were run. No live persistence, upload operation, cross-account enforcement or cleanup behavior is claimed. There is no user authorization in this task to apply the migration. Existing settings-dependent frontend controls remain unavailable until the backend contracts are reviewed and applied in a separately authorized environment.

## Operational limits

Five-minute signed URLs can remain usable until expiry after sign-out/revocation. Browser media state is not an authorization boundary; the server policies/functions must enforce access. Drafts, crop blobs and retry state are memory-only. A crashed/reloaded session can leave unreferenced private objects; a separately reviewed retention/cleanup process should remove old unreferenced objects and deleted-account media. Successful replacements use the Storage API for cleanup, never SQL deletion of Storage metadata. The candidate provides no background job and no public/social profile-media access.
