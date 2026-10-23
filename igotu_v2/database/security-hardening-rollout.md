# IGotU staged security rollout — review only

No SQL has been executed. No JavaScript, signup-function body or existing service-RPC body has been changed. The old `security-hardening-review.sql` is now comments-only so the superseded monolithic plan cannot be applied accidentally.

## Deployment order

1. **Review and stage first.** Export the live schema, policies, function/trigger definitions and ACLs. Check the remaining confirmations below. Exercise the entire A → B → C sequence in a staging copy before production. Keep independent copies of the current frontend and catalog definitions for recovery.
2. **Deploy Stage A alone:** `security-hardening-stage-a-additive.sql`. It adds guarded APIs and dormant notification functions; it removes no existing table/policy/RPC access, changes no bucket and installs no triggers. Current production behavior continues, including existing browser notifications. The known raw-table/privacy weaknesses intentionally remain until C. This is a fresh install: object collisions abort instead of silently replacing unknown production functions.
3. **Prepare Stage B frontend changes.** API/receipt-read changes may be released early once legacy receipt tests pass. Keep browser notification creation active during that early release. Prepare a second bundle removing every notification write listed below, but do not activate that bundle on open production traffic before C. No Stage B implementation is included in these SQL files.
4. **Complete staging tests and historical receipt audit.** Use the read-only inventory queries at the end of A when separately approved. All receipt cases must resolve to real, correctly owned objects. Test the complete notification handoff, not just the read APIs. Audit other API functions/views for raw request leaks.
5. **Begin a controlled production cutover:** pause all write entry points (including scheduled/backend writers), drain in-flight actions, and deploy the Stage B bundle that removes browser notification creation. Require clients to reload the migrated bundle before reopening traffic. Keep writes paused while the database triggers are still inactive: this avoids both duplicate notifications and a lost-notification interval.
6. **Deploy Stage C alone:** `security-hardening-stage-c-lockdown.sql`, with operator attestations set in the same approved SQL session: `igotu.rollout.stage_b_tested='true'`, `igotu.rollout.writes_paused='true'`, `igotu.rollout.api_surface_audited='true'`, `igotu.rollout.private_schema_verified='true'`, `igotu.rollout.profile_projections_tested='true'`, and `igotu.rollout.role_helper_anon_required='true'` or `'false'` based on live dependency review. These settings are not set by A/C and are not credentials; they document reviewed deployment evidence. Missing settings abort C. The profile-projection gate cannot be satisfied by this PR: the additional APIs and Stage B consumers are not implemented. Do not apply C to the current frontend. Browser INSERT revocation and trigger activation commit in one transaction. Unresolved historical receipts abort C before the bucket change.
7. **Verify while traffic is paused**, using the read-only checks and controlled multi-account staging/production acceptance tests approved for deployment. Confirm one notification per event and no Admin recipient, then reopen traffic. Do not concatenate A and C or use the old setup files to “repair” permissions.

If C fails, its transaction rolls back. While writes are still paused, restore the browser-notification bundle before resuming the pre-C system. If C succeeds but verification fails, keep writes paused and repair forward; do not automatically re-open public receipts/raw requests or re-enable broad INSERT policies. Stale frontend tabs must not be used as a rollback strategy.

## Mandatory private-schema deployment gate (A and C)

**Confirmed:** SQL Editor `current_setting('pgrst.db_schemas', true)` can be NULL because its session is not the running Data API process. A present value may also be stale or overridden by service configuration. Neither NULL nor a list omitting igotu_private proves the effective API exposure. The SQL check is defense in depth only and now handles quoted schema names too.

Before any separately approved Stage A deployment, an operator must:

1. Inspect the **target project's effective Data API exposed schemas** in Supabase Dashboard → Integrations → Data API → Settings (or its authoritative Management API configuration). Confirm `igotu_private` is absent; record the project reference, complete list, timestamp and reviewer. Inspect every enabled API path/schema configuration; SQL-session settings are not authoritative evidence.
2. Against that project's REST API, perform non-mutating schema-selection probes using `Accept-Profile: igotu_private` on GET `/rest/v1/`, with both the anonymous key context and a real authenticated JWT. Require the specific PostgREST schema-not-allowed rejection (normally `PGRST106`), not merely a generic 401/403/404, missing-function response, empty result or successful RPC. Use `public` as a positive control so an authentication/network failure cannot count as evidence. If the project's response behavior differs, resolve it using authoritative configuration before proceeding; never waive unknown exposure. Do not call notification writers or use POST as a probe.
3. Only after this evidence, set `igotu.rollout.private_schema_verified='true'` in the same approved deployment session. A deliberately does not set it, and aborts if missing even when pgrst.db_schemas looks safe. This is a manual-evidence attestation, not automated proof or an authorization credential.
4. Recheck configuration and negative probes after A, before B, immediately before C, and after any Data API configuration change. If privacy cannot be established, stop. If exposure is discovered after installation, contain API access under a separately approved incident/deployment plan; do not assume body guards alone make helpers safe endpoints.

Private schema USAGE is needed for invoker wrappers/policies; revoking USAGE indiscriminately would break them. Only the three public guarded wrappers are intended API endpoints. Do not add igotu_private to exposed schemas. Existing helper authorization checks remain in place as defense in depth.

## User personal data and additional Stage B dependency

**Confirmed design gap:** the reported live `users_select_authenticated` policy allows every authenticated user to enumerate users, including email, phone, account and verification fields. It was not in the repository setup scripts; this review has not re-queried the live catalog. RLS filters rows, not columns, and frontend select lists do not prevent a malicious caller selecting extra columns. Stage A deliberately leaves this existing exposure unchanged for compatibility.

Stage C now consolidates users SELECT policies, explicitly drops that reported policy and adds self/active-Admin SELECT plus a restrictive boundary. Own-row reads do not require active status, so auth/status/profile guards can still recognize suspended accounts. Active Admin management retains cross-user reads; Admin writes still use existing guarded RPCs. Other permissive/FOR ALL rules cannot reopen cross-user reads. Audit definer functions, views and indirect API relationships too; base-table RLS alone cannot close those alternate routes.

**Do not deploy C yet.** New `igotu.rollout.profile_projections_tested='true'` is a mandatory evidence gate, not permission to bypass missing implementation. Before setting it, separately review/install additive profile APIs and migrate the consumers below in Stage B. No profile API or frontend migration is implemented in this correction. Do not replace the users table with a broad definer view or globally revoke email/phone columns: the same authenticated role also serves the owner and Admin, and own `select('*')`/Admin workflows need those fields.

Proposed contracts (designs for later review, not installed RPC names):

- Candidate-profile projection: active Client + own pending request; return only eligible system-recommended Provider IDs with full_name, user_code and necessary public verification badge. Combine with the existing guarded match metadata; exclude email/phone/private verification metadata. Preserve specialization, weekly hours, declined-provider exclusion, distance/trust scoring and Client choice. Do not give Providers an open-request directory.
- Service-participant projection: derive the other participant from an authorized request ID and auth.uid(), not an arbitrary supplied user ID. Return id, full_name, user_code, role and the boolean verification badge only where required. Support the existing assigned pre-confirmation message/report/confirm/decline workflows. Explicitly define status/cancelled-history access alongside the request API. No unrelated profile enumeration.
- Contact exception: `client-request-details.js` currently visibly shows the selected Provider email. Before C, explicitly review a service-scoped Client-to-selected-Provider email projection to preserve that existing contact display, or approve its removal in Stage B. Never grant all users' email or Client phone/email as a shortcut. No such UI/contact decision has been implemented here.

| Current consumer (all in js/) | Actual field use / migration consequence |
|---|---|
| `auth.js`, `profile-guard.js`, dashboards and page-local getProfile helpers | Own-row reads only; retain them, including role/status checks. No cross-user personal data required. |
| `client-complete-profile.js`, `client-edit-profile.js`, `provider-profile.js`, `verification.js` | Own phone/name and, where displayed, own email/account data. Keep own reads and complete_basic_profile. Provider profile upsert includes provider_id; the existing six-column write allowlist and own-row RLS retain onboarding/editing. Skills/specializations/weekly-hours writes remain unchanged. |
| `client-recommended-providers.js` | Fetches other Providers' email but never uses it. Move names/code/role/status eligibility to candidate projection; email is unnecessary. Existing provider_match_metadata returns IDs/busy/count only and does not replace this missing name projection. |
| `provider-incoming-requests.js`, `provider-assignment-details.js` | Other Client id/name/code/identity_verified; use participant projection. No Client email/phone needed. |
| `client-messages.js`, `provider-messages.js` | Fetch email but never display/use it; only counterpart labels need projection. Message text remains textContent. Retain message participant checks and read-state behavior. |
| `report-service.js` | Other participant id/code/name/role needs projection; own email query may stay. Keep submit_service_report authorization. |
| `client-request-details.js` | Provider name/code and displayed email: use the reviewed contact exception above. Own service creation/read/edit APIs remain as before; no cross-Client records needed. |
| `admin-manage-users.js`, `admin-verifications.js`, `admin-reports.js`, `admin-monitor-requests.js`, `admin-monitor-payments.js`, `admin-monitor-reviews.js` | Email is used for Admin display/search or management; retain active Admin access. Verification document and Admin RPC flows remain unchanged. |

Test these migrations with owner, suspended owner, unrelated Client, assigned/unrelated Provider, active/inactive Admin and anon accounts. Require raw users SELECT, filters and embeddings to deny other users' personal fields, while candidate/participant projections return only their allowlists. Audit existing RPCs that return users composites/JSON. The catalog guard exempts only the known complete_basic_profile(text,text) signature: its repository body locks/updates/returns id=auth.uid() only. Confirm the live body still has that contract before setting the profile gate; do not remove its authenticated EXECUTE or break onboarding. Unknown callable users-composite definers block C; JSON/dynamic/non-public routes require manual audit. The new Stage C boundary relies on privileged is_active_user reading users without recursion; verify its postgres owner/execution context in staging.

## Location-content limitation and required review

The guarded Provider reader already uses an exact selected_provider_id=auth.uid() predicate, independent of caller-supplied filters. All three exact fields use the same confirmed/in_progress/completed allowlist; provider_selected, pending, cancelled, NULL and unknown statuses yield SQL NULL, even when coordinates/location exist. Status itself must only be changeable through authorized transition RPCs. Test each state and foreign request IDs; Stage A alone does not stop legacy raw reads until C.

**Residual exposure:** title, description, cancellation_reason, request_image_url (including object names), image pixels/EXIF and separate messages can contain addresses or coordinates. Existing public request-images access is also outside this receipt-only storage change. Hiding three columns cannot promise that arbitrary content or already-shared/public assets are location-free. Removing descriptions/images now would impair Provider service assessment and break existing previews, so this draft preserves them explicitly.

Before claiming full pre-confirmation location privacy, review a separate content/asset contract in Stage B: Client guidance to keep exact addresses out of pre-confirmation text/photos; handling of existing address-bearing content; whether photos/filenames/metadata need sanitization or delayed release; and whether pre-confirmation messaging can disclose location voluntarily. Frontend text guidance alone is not an enforcement boundary. Any server-side media/private-storage changes or deliberate loss of pre-confirmation service detail need a separately explained design and approval. Do not treat api_surface_audited or passing structured-field tests as proof that this residual content risk is solved. No new image-bucket configuration or content filtering is implemented here.

## New function privilege review and future additions

A revokes creation-default EXECUTE on every new function before the transaction commits, then restores only its allowlist. Its new effective-ACL preflight checks all 20 new functions for anon/authenticated/service_role, including inherited access. Expected private EXECUTE: six boolean policy helpers for anon/authenticated; three guarded readers plus two pure URL/path helpers for authenticated only; approximate-area and all five notification writers/trigger functions for no browser/service_role callers. Three public invoker wrappers allow authenticated only. C rechecks notification writers before commit. Notification triggers run with their privileged context; the browser must never call emit_notification or trigger functions directly.

No existing production RPC/default privileges are changed in A. Default ACLs can grant PUBLIC and project roles on function creation, and per-schema revocation cannot negate a global default grant. For each future function, in one reviewed transaction: use a private non-exposed schema for definers, fixed search_path and qualified objects; enforce auth.uid()/role/ownership in the body; immediately revoke EXECUTE from PUBLIC/anon/authenticated/service_role, then grant only documented callers; inspect effective privileges/role inheritance before commit; negative-test unauthorized calls. A future default-privilege hardening proposal must cover every function-creating owner and explicit global defaults, and requires separate compatibility review rather than modifying public defaults here.

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
| `provider-incoming-requests.js` | Migrate cross-user Client labels to guarded participant profiles. Use the Provider API for pending cards/details and its server-provided approximate area. Remove confirm/decline notification calls and their notification-only raw request prefetches; retain the action RPCs. |
| `provider-assignment-details.js` | Migrate cross-user Client labels to guarded participant profiles. Use the Provider API for assignments; render maps only when permitted coordinates are non-null. Migrate proof links; retire start/review notification calls and notification-only raw prefetches. |
| `provider-messages.js` | Migrate participant labels to guarded profiles; remove the unused email selection. Use the Provider API for conversation/service metadata; remove browser message notifications. Keep message text as text and retain send/read behavior. |
| `report-service.js` | Migrate reported-user labels to a service-participant projection. Provider branch uses the Provider API for service metadata. Client branch may keep its own-request query. Keep report submission RPC unchanged. |
| `client-recommended-providers.js` | Replace both cross-Client busy-slot and completed-count queries with `provider_match_metadata({p_request_id})`; replace cross-user users lookup with a guarded candidate-profile projection (no email/phone); retain own-request, reviews, hours, declines, distance and selection logic. Remove selection notification creation. |
| `client-request-details.js` | Obtain receipt paths from `payment_proof_reference({p_request_id})`, then sign/download them. Save durable verified `proof_path`; omit `proof_url` entirely from INSERT (even explicit NULL lacks a column grant after C). Stop generating public URLs for new private proofs. Migrate selected-Provider labels/contact to the reviewed participant projection. Remove cancellation/completion/payment/review notification calls. |
| `admin-monitor-payments.js` | Use the receipt-reference RPC and short-lived signed URLs/authenticated downloads for each payment; retain monitoring UI and previews. |
| `client-my-requests.js` | Remove cancellation notification creation. |
| `client-messages.js` | Migrate participant labels to guarded profiles; remove the unused email selection. Remove browser message notification creation; keep safe message rendering. |
| `verification.js` | Remove verification-submission notification creation. |
| `admin-verifications.js` | Remove approval/rejection notification creation; retain the review RPC. |
| `admin-manage-users.js` | Remove account activation/suspension notification creation; retain the Admin status RPC. |
| `notification-helper.js` | Retire browser INSERT logic and imports after all callers above are removed. Do not replace it with an arbitrary notification RPC. |

`admin-reports.js` already relies on the report-review RPC's database notification and needs no notification rewrite. Notification badge/menu behavior is intentionally unchanged.

## Receipt migration safety

**Live counts have not been measured because no SQL was executed.** A includes read-only queries classifying path-only, URL-only, both and neither, plus unresolved/conflicting paths and missing/foreign-owned objects.

The new `payment_proof_reference(p_request_id)` returns `(payment_id, proof_path)` only for an authorized Client/related Provider/Admin and correctly linked/owned objects. Map results to the actual payment record by payment_id; do not pick an arbitrary first receipt when a request has multiple records. It supports old URL-only rows by decoding only this project's exact `.../storage/v1/object/{public|authenticated|sign}/payment-proofs/` URL prefix. The Storage read helper uses the same canonical-path fallback after C, so URL-only rows do not lose related Provider access.

Stage B must use that canonical path to call `createSignedUrl` or an authenticated download for both image/PDF previews and open links. Use short signed-URL lifetimes (for example 300 seconds) and refresh when needed. Never use the raw legacy URL as the post-lockdown fallback and never persist an expiring signed URL as an object identifier. New receipts must store a verified `proof_path` when a proof exists and leave `proof_url` SQL NULL. Stage B must omit `proof_url` from the INSERT object; sending `proof_url: null` is also denied after C because the column is not granted. Confirm the live column is nullable and has a NULL/no default. A non-NULL default is rejected by the INSERT policy and must be separately reviewed, not silently changed. QR/Bank payments require a real owned proof; Cash/Other may omit it. The current frontend still sends proof_url, so C is intentionally incompatible until B migrates this writer.

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
- `igotu_private.valid_payment(p_request_id text, p_client_id uuid, p_provider_id uuid, p_amount numeric, p_method text, p_proof_path text, p_proof_url text)`.
- `igotu_private.valid_message(p_request_id text, p_sender_id uuid, p_receiver_id uuid)`.
- `igotu_private.emit_notification(p_user_id uuid, p_title text, p_message text)`.
- `igotu_private.notify_service_change()`.
- `igotu_private.notify_insert_event()`.
- `igotu_private.notify_verification_change()`.
- `igotu_private.notify_account_status()`.

No new payment-create RPC is necessary: Stage C validates the current offline INSERT with private `valid_payment`; Stage B keeps the offline INSERT workflow but omits proof_url and saves a durable proof_path. valid_payment rejects any non-NULL proof_url and invalid/non-owned paths only for new rows; historical URL decoding remains unchanged.

## Every Stage C policy change

The script consolidates **permissive SELECT-only policies exclusively targeting PUBLIC/anon/authenticated** on users, service_requests, provider_profiles, notifications, internal_messages and payment_records. Every discovered live name is logged before removal. Their authorized replacement access is defined below. Other live policy names were not supplied and are discovered rather than invented; users_select_authenticated is explicitly identified from the owner’s live review. FOR ALL, custom-role and restrictive policies remain for review; boundaries prevent old permissive policies reopening access.

| Table | Created/replaced policy | Type / command |
|---|---|---|
| `public.service_requests` | `IGotU service request read` | Permissive / SELECT |
| `public.service_requests` | `IGotU service request read boundary` | Restrictive / SELECT |
| `public.service_requests` | `IGotU request creation` | Permissive / INSERT |
| `public.service_requests` | `IGotU request creation boundary` | Restrictive / INSERT |
| `public.users` | `IGotU user profile read` | Permissive / SELECT |
| `public.users` | `IGotU user profile read boundary` | Restrictive / SELECT |
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

- `public.users` — `users_select_authenticated`.
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
| payment_records | request_id, client_id, provider_id, amount, payment_method, proof_path, proof_uploaded_at | None |

C also removes API-role service_requests UPDATE grants (table and every column), grants authenticated SELECT on service_requests/provider_profiles/notifications/internal_messages/payment_records and authenticated service_requests INSERT constrained to an own pending request with no selected Provider. It retains/enables RLS on users and these five tables. users raw SELECT becomes self or active Admin only, including a restrictive boundary against retained broad policies. Own suspended-account status reads are preserved. Guarded cross-user projections are a mandatory Stage B dependency. No browser DELETE is restored on the five reset tables. Protected user identifiers/role/status/verification and Provider verification fields receive no normal-user write grants. The current profile RPCs, Provider upsert and authorized Admin RPC bodies are unchanged.

C revokes PUBLIC/anon EXECUTE and grants authenticated EXECUTE for every non-trigger overload of: `complete_basic_profile`, `client_cancel_request`, `client_update_request`, `client_save_request_image`, `client_select_provider`, `provider_confirm_request`, `provider_decline_request`, `provider_start_request`, `client_complete_request`, `admin_update_user_status`, `admin_review_verification`, `admin_review_service_report`, `submit_service_report`. Existing service_role grants remain unchanged.

C separately revokes direct PUBLIC/anon/authenticated/service_role EXECUTE on `handle_new_auth_user()` while keeping `on_auth_user_created` attached and the verified normalization body unchanged. Trigger execution does not require granting direct API execution to the signup caller. Preflight checks its wiring/execution context before narrowing table grants.

`current_user_role()` is handled explicitly: authenticated EXECUTE is guaranteed, body unchanged. If the reviewed anon dependency flag is false, C refuses to revoke when a retained PUBLIC/anon policy has a catalog dependency; otherwise it revokes PUBLIC/anon and preserves service_role's previous effective access. If anon is required, explicit anon EXECUTE and existing PUBLIC access remain as a documented compatibility exception. Review indirect/dynamic callers too, since catalog dependency checks are incomplete for them. Do not claim anon revocation when that exception is selected.

**Storage:** A changes nothing. C sets only payment-proofs.public=false, adds participant/uploader/Admin SELECT and own-folder Client INSERT, plus payment-bucket-only restrictive SELECT/INSERT/UPDATE/DELETE fences. Existing upsert:false uploads work; browser overwrite/delete is denied. verification-documents, report-evidence, request-images and their policies/configuration remain unchanged. Legacy receipt paths are resolved at read time; no data backfill, bucket creation, object rename or deletion is performed.

## Tests and live confirmations required before C

- Accept the owner's verified signup role normalization; no signup redesign is needed. Confirm its deployment wiring/privileged execution context and that Admin/profile RPC owners retain required rights after narrow grants.
- Supply or inspect all live policies, table column types/defaults (including payment_id), function overloads and notification writers. The scripts have not queried the live database. Confirm igotu_private is not exposed as an API schema.
- Review current_user_role body/ACLs, retained PUBLIC/anon policy dependencies and indirect callers, then choose its explicit flag. Do not blindly remove a helper needed by existing RLS.
- Audit all exposed schemas, views, RPCs, materialized views and computed relationships for routes returning raw pending service rows. C detects known public view dependencies and raw request/user-composite definer returns (with the documented owner-only onboarding exception), but not every dynamic SQL/JSON-returning function or non-public exposed schema; the API-surface attestation requires that broader review.
- Provider pending tests: RPC exact fields NULL; raw table SELECT/filter/embedding cannot recover them; only coarse approximate_area appears. Confirmed/in_progress/completed maps work; cancelled/unknown states stay redacted. An unrelated Provider/Client/anon cannot use the Provider API to fetch another Provider's requests.
- Confirm Client own reads and Admin monitoring; Provider pending confirm/decline/report/message behavior; completed Provider reviews; profile editing/upsert; protected-column PATCH/INSERT/upsert rejection; Admin status/verification; signup; matching counts/busy flags.
- Historical receipt inventory must be complete and every usable proof resolvable/owned/linked before privacy changes. Test path-only, URL-only, both, percent-encoded names and multiple payments per request. Reject malformed, conflicting, foreign-host, missing and foreign-owned paths. Test image and PDF signed/authenticated previews for Client/related Provider/Admin and denial for unrelated/anon accounts.
- Test every notification row in the handoff table for exactly one correct recipient/event after browser writes are retired, including report outcomes; no Admin recipients. Confirm notification failure rolls back the source transaction as documented.

## Static validation only

PostgreSQL statement, SQL-function-body and PL/pgSQL parser checks; staged-boundary checks; protected API projection/ACL checks (35 distinct Stage C policies); unique policy-name checks; existing-file hash checks; and git diff --check are performed without executing SQL. Catalog inventories and acceptance queries are supplied for later approved testing, not run by this assistant. No booking concurrency, duration overlap, CSS, badge UI, unused-index or general tuning work is included.
