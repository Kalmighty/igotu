# PG17 fingerprint correction and remaining evidence

Historical review at candidate `7b9ccc6`. The newer [rollout-readiness package](rollout/README.md) and [independent evidence record](rollout/evidence.json) supersede the database/cache-metadata unknowns below. No new live HTTP/auth or migration approval follows from that evidence.

This updates review-only candidate `4c42c18`. No live SQL, bucket/configuration changes, application/data writes, deployment or merge are authorized or performed. Application JavaScript/CSS/HTML, the proposal's policies/GRANT/REVOKE statements and existing staging evidence are unchanged by this correction.

## Fingerprint correction and stability

PostgreSQL's `pg_policy.polcmd` has the internal `"char"` type, not `text`. The original concatenation can fail with SQLSTATE **42725** (`text || "char"` has ambiguous overload resolution). Both SQL files now explicitly use `polcmd::text`; their entire canonical `md5(coalesce(string_agg(...)))` expression is byte-identical. It retains NULL normalization, the same separators, explicit boolean/role-array text conversion, and `ORDER BY polname`.

`tests/request-image-sql.py` now checks the parsed AST for that exact text cast, rejects a mutation restoring the old uncast operand, and compares the canonical expressions across both files. A fixed synthetic serialization fixture yields **fa2d2c8fcee9a23f7399545056830cd2** regardless of input row order; the empty-policy model yields **d41d8cd98f00b204e9800998ecf8427e**. These are **synthetic test digests, not the staging digest**. Do not put either into an execution gate.

With an unchanged catalog, ordered serialization produces the same fingerprint. A change in policy expressions, names, commands, permissiveness or stored role OIDs changes the serialized input. The digest is a drift check for this exact catalog, not a cross-project identifier or an authorization proof. This task does not execute PostgreSQL, so the **actual corrected staging MD5 and PG17 runtime execution remain UNVERIFIED**. Under a future separately authorized SELECT-only check, run the corrected fingerprint SELECT twice over an unchanged catalog/the same read-only snapshot, compare the values, and retain the reviewed policy inventory with the digest. Do not automatically bind a newly calculated value to an approval gate without reviewing that inventory.

## Supporting independent evidence

The operator reports that a separate SELECT-only review found PostgreSQL 17, installed backend phase 4, the Storage operation helper, and a valid SR0052 canonical association with matching owner, supported WebP MIME and acceptable size. These are supporting **operator-reported independent findings**, not measurements repeated by Codex. The helper's existence alone does not establish its ACLs, exact installed definition, operation-tag behavior or unauthorized-read enforcement. No live expected fingerprints or pause/privacy attestations are populated automatically.

## Schema USAGE and function EXECUTE review

No schema or function privilege is granted/revoked in this correction. `preflight-read-only.sql` now prepares effective-privilege queries for **both `anon` and `authenticated`**, including PUBLIC/inherited grants, raw schema/function ACLs, routine ownership/security mode, and missing/not-yet-installed image routines. The actual effective results were not provided and remain **UNVERIFIED**.

| Area | Required review and compatibility boundary |
|---|---|
| `public` schema USAGE | Preserve existing Auth/workspace/public RPC entrypoints. Schema USAGE is distinct from object EXECUTE/table privileges and Data API exposure. Do not blanket-revoke it to secure one bucket. |
| `storage` schema USAGE | Inspect both browser roles and `storage.allow_only_operation(text)` effective EXECUTE rights under actual Storage requests. Preserve managed Storage access and other buckets. Helper existence is insufficient. |
| `auth` schema USAGE / `auth.uid()` EXECUTE | Preserve the existing JWT-subject/policy helper path. Do not change Auth configuration or grants to fix this fingerprint error. |
| Private schema USAGE | Existing security-invoker public wrappers delegate to private routines. `authenticated` must retain the necessary existing USAGE/EXECUTE path; `anon` may have deliberately retained helper access used by current policies/APIs. USAGE alone does not expose the schema in PostgREST. Keep private-schema API rejection as a separate mandatory gate. |
| Existing public RPCs | Review effective EXECUTE for `current_user_role()`, `igotu_backend_contract()` and `client_save_request_image(text,text,text)`, including PUBLIC/inherited/default privileges. Preserve unrelated grants. The candidate's existing save-RPC ACL changes still require review against actual captured ACLs; no new revocations are added here. |
| New public image reader/capability wrappers | Candidate grants `authenticated` EXECUTE and revokes PUBLIC/anon; both wrappers are SECURITY INVOKER. Calls must still pass the private helper's independent workspace/ownership checks. |
| New private reader/capability helpers | `authenticated` EXECUTE is needed for the wrappers. `can_read_request_image(text)` is also used by the restrictive Storage policy. Its direct caller grant is not a grant to read arbitrary images. |
| Private resolver/writer internals | Candidate does not grant browser EXECUTE on `request_image_path`, `require_workspace` or `require_writer`. Nested calls from the trusted SECURITY DEFINER owner do not justify granting these internals to browser roles. Retain unrelated existing helper grants; no blanket schema-wide revoke. |
| Anonymous policy evaluation | Candidate SELECT policy is scoped to anon/authenticated, but the new reader helper is granted only to authenticated. An anonymous denial may therefore be a permission error, not a successfully evaluated false predicate. Review this path and test expected anonymous/other-bucket behavior; do not silently grant extra rights or claim compatibility from a denied request alone. |

Before any execution approval, collect/review the newly prepared results and verify the expected invoker/definer call chains, existing managed/default/inherited grants and other-bucket controls. If a required effective privilege is missing or an unwanted privilege is present, stop and propose a **separate precise ACL change** with its rationale. Do not infer the live ACLs from this repository's historical D01–D04 SQL or from a 401/403 response. No privilege repair is included in this correction.

## SR0052 cache evidence and future old-URL checks

| Evidence | Current status |
|---|---|
| Request/image canonical association and matching owner | Independently confirmed by operator; no path/owner values copied here |
| MIME | Independently confirmed WebP (`image/webp`) |
| Size | Independently reported acceptable; exact bytes not supplied |
| Existing stored `metadata.cacheControl` | **NOT PROVIDED / UNVERIFIED** |
| Existing stored ETag/last-modified and metadata hash | **NOT PROVIDED / UNVERIFIED** |
| Actual HTTP `Cache-Control`, `Age`, `Expires`, ETag, Last-Modified and available CDN hit/status headers | **NOT PROVIDED / UNVERIFIED** |
| Exact old URL/association hash and pre/post-cutover retrieval results | **NOT PROVIDED / UNVERIFIED** |

The historical uploader used `cacheControl: "3600"`, but source code does **not** establish SR0052's stored metadata or served HTTP cache lifetime. The candidate's `cacheControl: "0"` applies only to future uploads; it does not retroactively change SR0052 or purge old public responses. No exact cache value is invented. The prepared SELECT-only script adds a dedicated hash/metadata snapshot for SR0052, including its actual cache-control, MIME/size and available stored ETag/last-modified fields; NULL values must remain NULL/unknown. Stored metadata and observed HTTP headers are separate evidence.

After separate approval for inspection/cutover, while traffic remains paused:

1. Preserve request/association and object metadata snapshots. Record actual cache metadata and the independently authorized old-URL GET baseline (status, relevant headers, body hash rather than body/URL tokens). Do not upload, replace, delete, move, rekey or backfill SR0052.
2. After the approved private-bucket/policy change, establish a successful authorized authenticated-download control for the **same known image**. Verify its bytes against the approved baseline without application writes. An invalid URL, bad credentials, denied proxy or generic 401 is not an isolation proof.
3. Check the exact previously public URL anonymously with fresh and previously warmed browser/CDN cache conditions. A cache-busting/new URL alone cannot prove that the old cache key stopped serving bytes. Compare GET behavior, not HEAD alone; record timestamps, vantage points and observed cache headers. Do not disable network/TLS security to obtain a result.
4. Test separately authorized negative cases: anon/unrelated Client/nonselected Provider and selected Provider before confirmation must not receive image bytes; the confirmed selected Provider and authorized owner/Admin must succeed. Operation-tag values and native signing/list/copy denial remain **UNVERIFIED** until the real Storage API paths are exercised.
5. If any old URL still serves bytes, record a failed privacy acceptance gate. Use supported Supabase cache invalidation/support or an evidenced cache-expiry plan, not file deletion or reopening the bucket. A few HTTP checks do not prove all edge caches are purged. Already downloaded copies cannot be recalled.
6. Review any previously minted signed URLs separately; new signing restrictions do not revoke those tokens, and rotating Auth keys is not Storage signing-key revocation. Preserve all files and request evidence. Compare snapshots and report every difference; managed access/cache metadata may legitimately change on reads and must not be confused with an association/file-content change or silently ignored.

**Operation-tag behavior, live unauthorized-download enforcement, old-public-URL/cache acceptance and effective live privileges are UNVERIFIED.** The review-only patch is not execution approval and does not claim that staging's public bucket has become private.
