# IGotU staged security rollout — review only

No SQL has been executed. No JavaScript, signup-function body or existing service-RPC body has been changed. The old `security-hardening-review.sql` is now comments-only so the superseded monolithic plan cannot be applied accidentally.

## Deployment order

1. **Review and stage first.** Export the live schema, policies, function/trigger definitions and ACLs. Check the remaining confirmations below. Exercise the entire A → B → C sequence in a staging copy before production. Keep independent copies of the current frontend and catalog definitions for recovery.
2. **Deploy Stage A alone:** `security-hardening-stage-a-additive.sql`. It adds guarded APIs and dormant notification functions; it removes no existing table/policy/RPC access, changes no bucket and installs no triggers. Current production behavior continues, including existing browser notifications. The known raw-table/privacy weaknesses intentionally remain until C. This is a fresh install: object collisions abort instead of silently replacing unknown production functions.
3. **Prepare Stage B frontend changes.** API/receipt-read changes may be released early once legacy receipt tests pass. Keep browser notification creation active during that early release. Prepare a second bundle removing every notification write listed below, but do not activate that bundle on open production traffic before C. No Stage B implementation is included in these SQL files.
4. **Complete staging tests and historical receipt audit.** Use the read-only inventory queries at the end of A when separately approved. All receipt cases must resolve to real, correctly owned objects. Test the complete notification handoff, not just the read APIs. Audit other API functions/views for raw request leaks.
5. **Begin a controlled production cutover:** pause all write entry points (including scheduled/backend writers), drain in-flight actions, and deploy the Stage B bundle that removes browser notification creation. Require clients to reload the migrated bundle before reopening traffic. Keep writes paused while the database triggers are still inactive: this avoids both duplicate notifications and a lost-notification interval.
6. **Deploy Stage C alone:** `security-hardening-stage-c-lockdown.sql`, with operator attestations set in the same approved SQL session: `igotu.rollout.stage_b_tested='true'`, `igotu.rollout.writes_paused='true'`, `igotu.rollout.api_surface_audited='true'`, and `igotu.rollout.role_helper_anon_required='true'` or `'false'` based on live dependency review. These settings are not set by A/C and are not credentials; they document reviewed deployment evidence. Missing settings abort C. Browser INSERT revocation and trigger activation commit in one transaction. Unresolved historical receipts abort C before the bucket change.
7. **Verify while traffic is paused**, using the read-only checks and controlled multi-account staging/production acceptance tests approved for deployment. Confirm one notification per event and no Admin recipient, then reopen traffic. Do not concatenate A and C or use the old setup files to “repair” permissions.

If C fails, its transaction rolls back. While writes are still paused, restore the browser-notification bundle before resuming the pre-C system. If C succeeds but verification fails, keep writes paused and repair forward; do not automatically re-open public receipts/raw requests or re-enable broad INSERT policies. Stale frontend tabs must not be used as a rollback strategy.

## Provider privacy contract

`supabase.rpc('provider_service_requests', { p_request_id: null, p_statuses: ['provider_selected'] })` lists only the signed-in active Provider's assigned requests. Supply a request ID for details, or the desired status list for dashboard/assignments/messages. Wrong role/anonymous callers are rejected; an unrelated request ID returns no rows. No caller-supplied Provider ID is accepted.

- `provider_selected`: `location`, `client_lat` and `client_lng` are SQL NULL. `approximate_area` is a coarse 0.1-degree coordinate-grid label (~11 km north/south), never a substring of the full address. Missing/invalid coordinates use fixed fallback text.
- `confirmed`, `in_progress`, `completed`: the assigned Provider may receive exact structured location fields and retain maps.
- `cancelled` and unknown states: location remains redacted; there is no supplied historical-confirmation marker that would justify wider disclosure.
- Stage C restricts raw `service_requests` reads to the owning Client, active Admin, or assigned Provider in those three post-confirmation states. A restrictive policy prevents an old permissive rule reopening pending rows. This is row denial plus a guarded projection, not pretend column masking through RLS.
- The return type is an explicit field allowlist, so future request columns are not automatically exposed. Existing image URLs and service text remain available; Client-entered descriptions/images/messages are not automatically content-redacted. Exact structured-location fields are protected independently of JavaScript.

Provider message INSERT uses a private participant-check helper, so denying raw pending-row reads does not break pre-confirmation messaging. The existing confirmation/decline/start RPC authorization logic is unchanged.

## Stage B: exact JavaScript files

All paths below are relative to `igotu_v2/js/`. Preserve current escaping, layout, controls and event handlers.

| File | Required change |
|---|---|
| `provider.js` | Use `provider_service_requests` for assigned-request counts/cards; render the returned `approximate_area`, not an address-splitting function. |
| `provider-incoming-requests.js` | Use the Provider API for pending cards/details and its server-provided approximate area. Remove confirm/decline notification calls and their notification-only raw request prefetches; retain the action RPCs. |
| `provider-assignment-details.js` | Use the Provider API for assignments; render maps only when permitted coordinates are non-null. Migrate proof links; retire start/review notification calls and notification-only raw prefetches. |
| `provider-messages.js` | Use the Provider API for conversation/service metadata; remove browser message notifications. Keep message text as text and retain send/read behavior. |
| `report-service.js` | Provider branch uses the Provider API for service metadata. Client branch may keep its own-request query. Keep report submission RPC unchanged. |
| `client-recommended-providers.js` | Replace both cross-Client busy-slot and completed-count queries with `provider_match_metadata({p_request_id})`; retain own-request, reviews, hours, declines, distance and selection logic. Remove selection notification creation. |
| `client-request-details.js` | Obtain receipt paths from `payment_proof_reference({p_request_id})`, then sign/download them. Save durable `proof_path`; stop generating public URLs for new private proofs. Remove cancellation/completion/payment/review notification calls. |
| `admin-monitor-payments.js` | Use the receipt-reference RPC and short-lived signed URLs/authenticated downloads for each payment; retain monitoring UI and previews. |
| `client-my-requests.js` | Remove cancellation notification creation. |
| `client-messages.js` | Remove browser message notification creation; keep safe message rendering. |
| `verification.js` | Remove verification-submission notification creation. |
| `admin-verifications.js` | Remove approval/rejection notification creation; retain the review RPC. |
| `admin-manage-users.js` | Remove account activation/suspension notification creation; retain the Admin status RPC. |
| `notification-helper.js` | Retire browser INSERT logic and imports after all callers above are removed. Do not replace it with an arbitrary notification RPC. |

`admin-reports.js` already relies on the report-review RPC's database notification and needs no notification rewrite. Notification badge/menu behavior is intentionally unchanged.

## Receipt migration safety

**Live counts have not been measured because no SQL was executed.** A includes read-only queries classifying path-only, URL-only, both and neither, plus unresolved/conflicting paths and missing/foreign-owned objects.

The new `payment_proof_reference(p_request_id)` returns `(payment_id, proof_path)` only for an authorized Client/related Provider/Admin and correctly linked/owned objects. Map results to the actual payment record by payment_id; do not pick an arbitrary first receipt when a request has multiple records. It supports old URL-only rows by decoding only this project's exact `.../storage/v1/object/{public|authenticated|sign}/payment-proofs/` URL prefix. The Storage read helper uses the same canonical-path fallback after C, so URL-only rows do not lose related Provider access.

Stage B must use that canonical path to call `createSignedUrl` or an authenticated download for both image/PDF previews and open links. Use short signed-URL lifetimes (for example 300 seconds) and refresh when needed. Never use the raw legacy URL as the post-lockdown fallback and never persist an expiring signed URL as an object identifier. New receipts should store proof_path (proof_url may be null).

Resolvable, correctly owned legacy rows require **no backfill**. Conflicting path/URL pairs, custom-domain/external URLs, missing files, missing ownership or mismatched request participants require a separately reviewed correction/backfill before C. No script guesses an object, changes a legacy payment row or deletes a receipt. C aborts if any historical proof would fail the reference/ownership contract. Validate every historical class with Client, related Provider and Admin before switching the bucket. Existing external downloads/caches cannot be undone by a bucket flag; already-issued signed URLs also remain usable until their expiry.

## Notification handoff manifest

Stage A creates functions only. Each trigger below is installed only by C after its browser writes have been retired and in-flight writes drained:

| Stage C trigger | Browser writes that must be retired first |
|---|---|
| `igotu_notify_service_change` on service_requests | Selection (`client-recommended-providers`); cancellation (`client-my-requests`, `client-request-details`); confirmation/decline (`provider-incoming-requests`); start (`provider-assignment-details`); completion (`client-request-details`). |
| `igotu_notify_message` on internal_messages | Send notifications in `client-messages` and `provider-messages`. |
| `igotu_notify_payment` on payment_records | Payment-record notification in `client-request-details`. |
| `igotu_notify_review` on service_reviews | Review notifications in `client-request-details` and `provider-assignment-details`. |
| `igotu_notify_verification` on verification_requests | Submission notification in `verification`; review notifications in `admin-verifications`. |
| `igotu_notify_account_status` on users | Status-change notification in `admin-manage-users`. |

The existing report-review RPC remains the single report-outcome writer; no second report trigger is added. New emission allows only Client/Provider recipients, including a stored suspension notification; no Admin notification recipients are generated. Conservative source-text checks stop C on other known live notifiers that could duplicate the added triggers. They are an inspection aid, not a semantic proof. Source event and notification commit or roll back together; test failure handling too.

## New functions / RPCs (all installed in A)

Public wrappers are authenticated-only SECURITY INVOKER functions. Private record readers are SECURITY DEFINER with fixed empty search paths, qualified relations and explicit caller/participant checks. Notification writers/trigger functions have no browser EXECUTE access.

- `igotu_private.is_active_user(p_role text DEFAULT NULL)`.
- `igotu_private.can_read_service(p_client_id uuid, p_provider_id uuid)`.
- `igotu_private.can_read_raw_service(p_client_id uuid, p_provider_id uuid, p_status text)`.
- `igotu_private.approximate_service_area(p_lat numeric, p_lng numeric)`.
- `igotu_private.provider_service_requests(p_request_id text DEFAULT NULL, p_statuses text[] DEFAULT NULL)`.
- `public.provider_service_requests(p_request_id text DEFAULT NULL, p_statuses text[] DEFAULT NULL)`.
- `igotu_private.provider_match_metadata(p_request_id text)`.
- `public.provider_match_metadata(p_request_id text)`.
- `igotu_private.decode_url_path(p_value text)`.
- `igotu_private.payment_proof_path(p_path text, p_url text)`.
- `igotu_private.payment_proof_reference(p_request_id text)`.
- `public.payment_proof_reference(p_request_id text)`.
- `igotu_private.can_read_payment_proof(p_name text)`.
- `igotu_private.valid_payment(p_request_id text, p_client_id uuid, p_provider_id uuid, p_amount numeric, p_method text, p_proof_path text)`.
- `igotu_private.valid_message(p_request_id text, p_sender_id uuid, p_receiver_id uuid)`.
- `igotu_private.emit_notification(p_user_id uuid, p_title text, p_message text)`.
- `igotu_private.notify_service_change()`.
- `igotu_private.notify_insert_event()`.
- `igotu_private.notify_verification_change()`.
- `igotu_private.notify_account_status()`.

No new payment-create RPC is necessary: Stage C validates the current offline INSERT with private `valid_payment`; the frontend keeps its existing insert shape, with a durable proof_path.

## Every Stage C policy change

The script consolidates **permissive SELECT-only policies exclusively targeting PUBLIC/anon/authenticated** on service_requests, provider_profiles, notifications, internal_messages and payment_records. Every discovered live name is logged before removal. Their authorized replacement access is defined below. Live names were not supplied and are not invented. FOR ALL, custom-role and restrictive policies remain for review; boundaries prevent old permissive policies reopening access.

| Table | Created/replaced policy | Type / command |
|---|---|---|
| `public.service_requests` | `IGotU service request read` | Permissive / SELECT |
| `public.service_requests` | `IGotU service request read boundary` | Restrictive / SELECT |
| `public.service_requests` | `IGotU request creation` | Permissive / INSERT |
| `public.service_requests` | `IGotU request creation boundary` | Restrictive / INSERT |
| `public.users` | `IGotU own profile update` | Permissive / UPDATE |
| `public.users` | `IGotU profile update boundary` | Restrictive / UPDATE |
| `public.provider_profiles` | `IGotU provider profile read` | Permissive / SELECT |
| `public.provider_profiles` | `IGotU provider profile read boundary` | Restrictive / SELECT |
| `public.provider_profiles` | `IGotU provider profile insert` | Permissive / INSERT |
| `public.provider_profiles` | `IGotU provider profile update` | Permissive / UPDATE |
| `public.provider_profiles` | `IGotU provider profile insert boundary` | Restrictive / INSERT |
| `public.provider_profiles` | `IGotU provider profile update boundary` | Restrictive / UPDATE |
| `public.notifications` | `IGotU notification read` | Permissive / SELECT |
| `public.notifications` | `IGotU notification read boundary` | Restrictive / SELECT |
| `public.notifications` | `IGotU notification read-state update` | Permissive / UPDATE |
| `public.notifications` | `IGotU notification update boundary` | Restrictive / UPDATE |
| `public.notifications` | `IGotU notification insert boundary` | Restrictive / INSERT |
| `public.internal_messages` | `IGotU message read` | Permissive / SELECT |
| `public.internal_messages` | `IGotU message read boundary` | Restrictive / SELECT |
| `public.internal_messages` | `IGotU message send` | Permissive / INSERT |
| `public.internal_messages` | `IGotU message send boundary` | Restrictive / INSERT |
| `public.internal_messages` | `IGotU message read-state update` | Permissive / UPDATE |
| `public.internal_messages` | `IGotU message update boundary` | Restrictive / UPDATE |
| `public.payment_records` | `IGotU payment read` | Permissive / SELECT |
| `public.payment_records` | `IGotU payment read boundary` | Restrictive / SELECT |
| `public.payment_records` | `IGotU completed-service payment insert` | Permissive / INSERT |
| `public.payment_records` | `IGotU payment insert boundary` | Restrictive / INSERT |
| `storage.objects` | `IGotU payment proof read` | Permissive / SELECT |
| `storage.objects` | `IGotU payment proof upload` | Permissive / INSERT |
| `storage.objects` | `IGotU payment proof read boundary` | Restrictive / SELECT |
| `storage.objects` | `IGotU payment proof upload boundary` | Restrictive / INSERT |
| `storage.objects` | `IGotU payment proof immutable update` | Restrictive / UPDATE |
| `storage.objects` | `IGotU payment proof immutable delete` | Restrictive / DELETE |

Explicit legacy policy names dropped (other DROP statements only replace this draft’s own named policies):

- `public.service_requests` — `Authenticated users can read service request summaries`.
- `public.provider_profiles` — `Providers can update own profile`.
- `public.provider_profiles` — `Admins can verify provider profiles`.
- `public.notifications` — `Authenticated users can create notifications`.
- `public.notifications` — `Users can update own notifications`.
- `public.payment_records` — `Clients can insert own payment records`.
- `storage.objects` — `Authenticated users can upload payment proofs`.
- `storage.objects` — `Authenticated users can view payment proofs`.
- `storage.objects` — `Authenticated users can update own payment proofs`.

## Every privilege / Storage change

**Stage A:** creates the new private schema, revokes PUBLIC/anon/authenticated schema privileges, then grants anon/authenticated USAGE (not CREATE). Revokes all default EXECUTE on the new private functions from PUBLIC/anon/authenticated/service_role. Regrants anon/authenticated only six boolean policy predicates (`is_active_user`, `can_read_service`, `can_read_raw_service`, `can_read_payment_proof`, `valid_payment`, `valid_message`); these deny protected access without auth.uid(). Authenticated additionally gets the three guarded private readers and two pure path-decoding helpers. No browser gets notification-writer/trigger EXECUTE. Public wrappers revoke all default API/service_role EXECUTE and grant only authenticated. No existing table/RPC privileges are changed in A.

**Stage C:** removes table INSERT/UPDATE/DELETE and all column INSERT/UPDATE grants from PUBLIC/anon/authenticated on the five tables below, then restores exactly these authenticated write allowlists. Effective-ACL checks abort if inherited privileges undermine protected writes.

| Table | INSERT columns | UPDATE columns |
|---|---|---|
| users | None | full_name, phone, profile_completed |
| provider_profiles | provider_id, bio, location, provider_lat, provider_lng, is_available | Same six, with old/new ownership enforced for upsert |
| notifications | None | is_read |
| internal_messages | id, message_id, request_id, sender_id, receiver_id, message_text, is_read, created_at | is_read, receiver only |
| payment_records | request_id, client_id, provider_id, amount, payment_method, proof_url, proof_path, proof_uploaded_at | None |

C also removes API-role service_requests UPDATE grants (table and every column), grants authenticated SELECT on service_requests/provider_profiles/notifications/internal_messages/payment_records and authenticated service_requests INSERT constrained to an own pending request with no selected Provider. It retains/enables RLS on users and these five tables. No browser DELETE is restored on the five reset tables. Protected user identifiers/role/status/verification and Provider verification fields receive no normal-user write grants. The current profile RPCs, Provider upsert and authorized Admin RPC bodies are unchanged.

C revokes PUBLIC/anon EXECUTE and grants authenticated EXECUTE for every non-trigger overload of: `complete_basic_profile`, `client_cancel_request`, `client_update_request`, `client_save_request_image`, `client_select_provider`, `provider_confirm_request`, `provider_decline_request`, `provider_start_request`, `client_complete_request`, `admin_update_user_status`, `admin_review_verification`, `admin_review_service_report`, `submit_service_report`. Existing service_role grants remain unchanged.

C separately revokes direct PUBLIC/anon/authenticated/service_role EXECUTE on `handle_new_auth_user()` while keeping `on_auth_user_created` attached and the verified normalization body unchanged. Trigger execution does not require granting direct API execution to the signup caller. Preflight checks its wiring/execution context before narrowing table grants.

`current_user_role()` is handled explicitly: authenticated EXECUTE is guaranteed, body unchanged. If the reviewed anon dependency flag is false, C refuses to revoke when a retained PUBLIC/anon policy has a catalog dependency; otherwise it revokes PUBLIC/anon and preserves service_role's previous effective access. If anon is required, explicit anon EXECUTE and existing PUBLIC access remain as a documented compatibility exception. Review indirect/dynamic callers too, since catalog dependency checks are incomplete for them. Do not claim anon revocation when that exception is selected.

**Storage:** A changes nothing. C sets only payment-proofs.public=false, adds participant/uploader/Admin SELECT and own-folder Client INSERT, plus payment-bucket-only restrictive SELECT/INSERT/UPDATE/DELETE fences. Existing upsert:false uploads work; browser overwrite/delete is denied. verification-documents, report-evidence, request-images and their policies/configuration remain unchanged. Legacy receipt paths are resolved at read time; no data backfill, bucket creation, object rename or deletion is performed.

## Tests and live confirmations required before C

- Accept the owner's verified signup role normalization; no signup redesign is needed. Confirm its deployment wiring/privileged execution context and that Admin/profile RPC owners retain required rights after narrow grants.
- Supply or inspect all live policies, table column types/defaults (including payment_id), function overloads and notification writers. The scripts have not queried the live database. Confirm igotu_private is not exposed as an API schema.
- Review current_user_role body/ACLs, retained PUBLIC/anon policy dependencies and indirect callers, then choose its explicit flag. Do not blindly remove a helper needed by existing RLS.
- Audit all exposed schemas, views, RPCs, materialized views and computed relationships for routes returning raw pending service rows. C detects known public view dependencies and raw-composite definer returns, but not every dynamic SQL/JSON-returning function or non-public exposed schema; the API-surface attestation requires that broader review.
- Provider pending tests: RPC exact fields NULL; raw table SELECT/filter/embedding cannot recover them; only coarse approximate_area appears. Confirmed/in_progress/completed maps work; cancelled/unknown states stay redacted. An unrelated Provider/Client/anon cannot use the Provider API to fetch another Provider's requests.
- Confirm Client own reads and Admin monitoring; Provider pending confirm/decline/report/message behavior; completed Provider reviews; profile editing/upsert; protected-column PATCH/INSERT/upsert rejection; Admin status/verification; signup; matching counts/busy flags.
- Historical receipt inventory must be complete and every usable proof resolvable/owned/linked before privacy changes. Test path-only, URL-only, both, percent-encoded names and multiple payments per request. Reject malformed, conflicting, foreign-host, missing and foreign-owned paths. Test image and PDF signed/authenticated previews for Client/related Provider/Admin and denial for unrelated/anon accounts.
- Test every notification row in the handoff table for exactly one correct recipient/event after browser writes are retired, including report outcomes; no Admin recipients. Confirm notification failure rolls back the source transaction as documented.

## Static validation only

PostgreSQL statement, SQL-function-body and PL/pgSQL parser checks; staged-boundary checks; protected API projection/ACL checks; unique policy-name checks; existing-file hash checks; and git diff --check are performed without executing SQL. Catalog inventories and acceptance queries are supplied for later approved testing, not run by this assistant. No booking concurrency, duration overlap, CSS, badge UI, unused-index or general tuning work is included.
