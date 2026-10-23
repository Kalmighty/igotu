-- IGotU Stage C: LOCKDOWN ONLY -- REVIEW DRAFT, NEVER EXECUTED HERE.
-- Separate file and transaction from Stage A. No include/import of Stage A.
-- DO NOT run before the Stage B frontend and legacy receipt audit pass staging.
-- Pause writes/drain in-flight actions for the production notification handoff.
-- Gate settings below are OPERATOR ATTESTATIONS, not security credentials:
--   SET igotu.rollout.stage_b_tested = 'true';
--   SET igotu.rollout.writes_paused = 'true';
--   SET igotu.rollout.api_surface_audited = 'true';
--   SET igotu.rollout.private_schema_verified = 'true';
--   SET igotu.rollout.profile_projections_tested = 'true';
--   SET igotu.rollout.role_helper_anon_required = 'true' OR 'false';
-- These are NOT set by this script or Stage A. Missing values abort the transaction.
-- See security-hardening-rollout.md for tests, exact frontend files and gate evidence.
-- No existing application function bodies, signup authorization, booking logic,
-- base-table columns, indexes, CSS or unrelated buckets are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $stage_c_preflight$
DECLARE v_function record; v_table text; v_name text;
BEGIN
    IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Stage C expects postgres.'; END IF;
    IF current_setting('igotu.rollout.stage_b_tested',true) IS DISTINCT FROM 'true'
       OR current_setting('igotu.rollout.writes_paused',true) IS DISTINCT FROM 'true'
       OR current_setting('igotu.rollout.api_surface_audited',true) IS DISTINCT FROM 'true'
       OR current_setting('igotu.rollout.private_schema_verified',true) IS DISTINCT FROM 'true'
       OR current_setting('igotu.rollout.profile_projections_tested',true) IS DISTINCT FROM 'true'
       OR COALESCE(current_setting('igotu.rollout.role_helper_anon_required',true),'') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'Stage B, profile projections, private-schema, write-pause and helper-dependency attestations required; see rollout document.';
    END IF;
    IF to_regprocedure('igotu_private.provider_service_requests(text,text[])') IS NULL
       OR to_regprocedure('public.provider_service_requests(text,text[])') IS NULL
       OR to_regprocedure('public.provider_match_metadata(text)') IS NULL
       OR to_regprocedure('public.payment_proof_reference(text)') IS NULL
       OR to_regprocedure('igotu_private.valid_payment(text,uuid,uuid,numeric,text,text,text)') IS NULL
       OR to_regprocedure('public.current_user_role()') IS NULL THEN
        RAISE EXCEPTION 'Missing Stage A APIs or the confirmed live role helper.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname = 'on_auth_user_created'
          AND t.tgfoid = to_regprocedure('public.handle_new_auth_user()') AND NOT t.tgisinternal) THEN
        RAISE EXCEPTION 'Verified signup trigger wiring differs; review without rewriting signup.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.handle_new_auth_user()')
        AND p.prosecdef AND pg_get_userbyid(p.proowner) NOT IN ('anon','authenticated')) THEN
        RAISE EXCEPTION 'Confirm signup function execution context before narrowing table grants; do not rewrite its verified role logic.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs')
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
        RAISE EXCEPTION 'Expected payment bucket / Storage RLS is missing.';
    END IF;
    FOREACH v_name IN ARRAY ARRAY[
        'complete_basic_profile','client_cancel_request','client_update_request',
        'client_save_request_image','client_select_provider','provider_confirm_request',
        'provider_decline_request','provider_start_request','client_complete_request',
        'admin_update_user_status','admin_review_verification',
        'admin_review_service_report','submit_service_report'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname=v_name AND p.prosecdef
              AND p.prokind='f' AND p.prorettype <> 'pg_catalog.trigger'::regtype
              AND pg_get_userbyid(p.proowner) NOT IN ('anon','authenticated')) THEN
            RAISE EXCEPTION 'Missing privileged existing RPC: %',v_name;
        END IF;
    END LOOP;
    -- Proof privacy cannot proceed with unresolved historical rows. URL-only
    -- receipts are supported through the Stage A canonical-path fallback; this
    -- check requires their exact object and Client ownership to be resolvable.
    -- No historical row/object is updated or deleted by this script.
    IF EXISTS (
        SELECT 1 FROM public.payment_records pr
        LEFT JOIN public.service_requests sr ON sr.request_id=pr.request_id
        LEFT JOIN storage.objects o ON o.bucket_id='payment-proofs'
          AND o.name=igotu_private.payment_proof_path(pr.proof_path,pr.proof_url)
        WHERE (nullif(pr.proof_path,'') IS NOT NULL OR nullif(pr.proof_url,'') IS NOT NULL)
          AND (o.name IS NULL OR sr.request_id IS NULL
            OR pr.client_id IS DISTINCT FROM sr.client_id
            OR pr.provider_id IS DISTINCT FROM sr.selected_provider_id
            OR (storage.foldername(o.name))[1] IS DISTINCT FROM pr.client_id::text
            OR COALESCE(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') IS DISTINCT FROM pr.client_id::text)
    ) THEN
        RAISE EXCEPTION 'Legacy payment proofs need path/ownership/participant remediation before privacy lockdown.';
    END IF;
    -- Known API views must not bypass request/users RLS. This checks catalog
    -- dependencies, not dynamic SQL; the rollout requires a full API-surface audit.
    IF EXISTS (
        SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid
        JOIN pg_class v ON v.oid=rw.ev_class JOIN pg_namespace n ON n.oid=v.relnamespace
        WHERE d.classid='pg_rewrite'::regclass AND d.refobjid IN (
            'public.service_requests'::regclass, 'public.users'::regclass)
          AND n.nspname='public' AND v.relkind IN ('v','m')
          AND (v.relkind='m' OR NOT COALESCE(v.reloptions @> ARRAY['security_invoker=true'],false))
    ) THEN
        RAISE EXCEPTION 'A public view/materialized view may bypass request/profile privacy; audit before Stage C.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef
          AND (p.prorettype = 'public.service_requests'::regtype
            OR (p.prorettype = 'public.users'::regtype
                -- Existing onboarding returns ONLY the caller's updated row.
                -- Audit its live auth.uid() checks under the profile gate; do
                -- not block this known owner-only composite return by type alone.
                AND p.oid IS DISTINCT FROM to_regprocedure('public.complete_basic_profile(text,text)')))
          AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
        RAISE EXCEPTION 'A callable definer returns raw request/profile rows; review its authorization before Stage C.';
    END IF;
    -- Do not add duplicate database notifiers. Existing report review is the
    -- only retained notifier; confirm its body still supplies report outcomes.
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='admin_review_service_report'
          AND p.prokind='f' AND p.prosrc ~* '\mnotifications\M') THEN
        RAISE EXCEPTION 'Reconcile the existing report-review notifier before cutover.';
    END IF;
    FOR v_function IN
        SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prokind='f'
          AND p.proname=ANY(ARRAY['client_select_provider','provider_confirm_request','provider_decline_request',
            'provider_start_request','client_complete_request','client_cancel_request',
            'admin_update_user_status','admin_review_verification']) AND p.prosrc ~* '\mnotifications\M'
        UNION
        SELECT p.oid::regprocedure FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        WHERE NOT t.tgisinternal AND t.tgrelid IN (
            'public.service_requests'::regclass,'public.users'::regclass,'public.verification_requests'::regclass,
            'public.internal_messages'::regclass,'public.payment_records'::regclass,'public.service_reviews'::regclass)
          AND p.pronamespace <> 'igotu_private'::regnamespace AND p.prosrc ~* '\mnotifications\M'
    LOOP
        RAISE EXCEPTION 'Existing notification writer % requires reconciliation.',v_function.signature;
    END LOOP;
END;
$stage_c_preflight$;

-- 3. Privileges are independent of RLS. Revoke BOTH table-wide and all existing
-- column-level write grants, then give back a narrow application allowlist.
-- SELECT grants are retained: frontend select('*') must continue to work.
-- users SELECT is narrowed by RLS below only AFTER Stage B projections exist.
DO $write_grants$
DECLARE v_table text; v_columns text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'users','provider_profiles','notifications','internal_messages','payment_records'
    ] LOOP
        SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_columns
        FROM pg_attribute WHERE attrelid = to_regclass('public.' || v_table)
          AND attnum > 0 AND NOT attisdropped;
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
        EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
            v_columns, v_columns, v_table);
    END LOOP;
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_columns
    FROM pg_attribute WHERE attrelid = 'public.service_requests'::regclass
      AND attnum > 0 AND NOT attisdropped;
    REVOKE UPDATE ON TABLE public.service_requests FROM PUBLIC, anon, authenticated;
    EXECUTE format('REVOKE UPDATE (%s) ON TABLE public.service_requests FROM PUBLIC, anon, authenticated', v_columns);
END;
$write_grants$;

GRANT UPDATE (full_name, phone, profile_completed) ON public.users TO authenticated;
-- provider_id must be in UPDATE as well as INSERT because the existing browser
-- upsert includes that conflict-key column. RLS enforces OLD/NEW provider_id=uid,
-- so a Provider cannot transfer ownership. Verification columns are never granted.
GRANT INSERT (provider_id, bio, location, provider_lat, provider_lng, is_available),
      UPDATE (provider_id, bio, location, provider_lat, provider_lng, is_available)
    ON public.provider_profiles TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT INSERT (id, message_id, request_id, sender_id, receiver_id, message_text, is_read, created_at),
      UPDATE (is_read) ON public.internal_messages TO authenticated;
GRANT INSERT (request_id, client_id, provider_id, amount, payment_method,
              proof_path, proof_uploaded_at)
    ON public.payment_records TO authenticated;
GRANT SELECT ON public.service_requests, public.provider_profiles,
    public.notifications, public.internal_messages, public.payment_records TO authenticated;
-- Existing Client request creation remains available. Column/state authorization
-- is enforced by the INSERT boundary below; status changes/edits use existing RPCs.
GRANT INSERT ON public.service_requests TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;


-- 4. Safe SELECT-policy consolidation. Only permissive SELECT-only policies
-- for API roles are superseded. Log every name; custom-role policies and FOR ALL
-- policies are preserved. Restrictive boundaries also constrain those old rules.
DO $read_policies$
DECLARE v_policy record;
BEGIN
    FOR v_policy IN
        SELECT n.nspname, c.relname, p.polname
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY (ARRAY[
            'users','service_requests','provider_profiles','notifications','internal_messages','payment_records'])
          AND p.polcmd = 'r' AND p.polpermissive
          AND p.polroles <@ ARRAY[0::oid,
              (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
              (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]
    LOOP
        RAISE NOTICE 'Replacing SELECT policy %.%: %', v_policy.nspname, v_policy.relname, v_policy.polname;
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            v_policy.polname, v_policy.nspname, v_policy.relname);
    END LOOP;
END;
$read_policies$;
-- Explicitly document removal of the confirmed unrestricted legacy policy.
DROP POLICY IF EXISTS "Authenticated users can read service request summaries" ON public.service_requests;
DROP POLICY IF EXISTS users_select_authenticated ON public.users;

-- Do NOT deploy until guarded profile projections and their Stage B consumers
-- are implemented/tested. RLS hides whole rows; it cannot mask email/phone while
-- exposing full_name. Keep own-account reads (even suspended status checks)
-- and active Admin management; cross-user display uses narrow guarded APIs.
CREATE POLICY "IGotU user profile read" ON public.users FOR SELECT TO authenticated
USING (id = auth.uid() OR igotu_private.is_active_user('admin'));
DROP POLICY IF EXISTS "IGotU user profile read boundary" ON public.users;
CREATE POLICY "IGotU user profile read boundary" ON public.users
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (id = auth.uid() OR igotu_private.is_active_user('admin'));

CREATE POLICY "IGotU service request read" ON public.service_requests FOR SELECT TO authenticated
USING (igotu_private.can_read_raw_service(client_id, selected_provider_id, status::text));
DROP POLICY IF EXISTS "IGotU service request read boundary" ON public.service_requests;
CREATE POLICY "IGotU service request read boundary" ON public.service_requests
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (igotu_private.can_read_raw_service(client_id, selected_provider_id, status::text));

DROP POLICY IF EXISTS "IGotU request creation" ON public.service_requests;
CREATE POLICY "IGotU request creation" ON public.service_requests FOR INSERT TO authenticated
WITH CHECK (igotu_private.is_active_user('client') AND client_id = auth.uid()
    AND status::text = 'pending' AND selected_provider_id IS NULL);
DROP POLICY IF EXISTS "IGotU request creation boundary" ON public.service_requests;
CREATE POLICY "IGotU request creation boundary" ON public.service_requests
AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (igotu_private.is_active_user('client') AND client_id = auth.uid()
    AND status::text = 'pending' AND selected_provider_id IS NULL);

DROP POLICY IF EXISTS "IGotU own profile update" ON public.users;
CREATE POLICY "IGotU own profile update" ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (id = auth.uid() AND igotu_private.is_active_user());
DROP POLICY IF EXISTS "IGotU profile update boundary" ON public.users;
CREATE POLICY "IGotU profile update boundary" ON public.users
AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (id = auth.uid() AND igotu_private.is_active_user());

CREATE POLICY "IGotU provider profile read" ON public.provider_profiles FOR SELECT TO authenticated
USING (igotu_private.is_active_user());
DROP POLICY IF EXISTS "IGotU provider profile read boundary" ON public.provider_profiles;
CREATE POLICY "IGotU provider profile read boundary" ON public.provider_profiles
AS RESTRICTIVE FOR SELECT TO PUBLIC USING (igotu_private.is_active_user());
DROP POLICY IF EXISTS "Providers can update own profile" ON public.provider_profiles;
DROP POLICY IF EXISTS "Admins can verify provider profiles" ON public.provider_profiles;
DROP POLICY IF EXISTS "IGotU provider profile insert" ON public.provider_profiles;
CREATE POLICY "IGotU provider profile insert" ON public.provider_profiles FOR INSERT TO authenticated
WITH CHECK (provider_id = auth.uid() AND igotu_private.is_active_user('provider'));
DROP POLICY IF EXISTS "IGotU provider profile update" ON public.provider_profiles;
CREATE POLICY "IGotU provider profile update" ON public.provider_profiles FOR UPDATE TO authenticated
USING (provider_id = auth.uid() AND igotu_private.is_active_user('provider'))
WITH CHECK (provider_id = auth.uid() AND igotu_private.is_active_user('provider'));
DROP POLICY IF EXISTS "IGotU provider profile insert boundary" ON public.provider_profiles;
CREATE POLICY "IGotU provider profile insert boundary" ON public.provider_profiles
AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (provider_id = auth.uid() AND igotu_private.is_active_user('provider'));
DROP POLICY IF EXISTS "IGotU provider profile update boundary" ON public.provider_profiles;
CREATE POLICY "IGotU provider profile update boundary" ON public.provider_profiles
AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (provider_id = auth.uid() AND igotu_private.is_active_user('provider'))
WITH CHECK (provider_id = auth.uid() AND igotu_private.is_active_user('provider'));
-- Admin verification still uses admin_review_verification(), whose existing
-- SECURITY DEFINER body can update protected columns and bypass these policies.

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "IGotU notification read" ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid() AND igotu_private.is_active_user()
    AND NOT igotu_private.is_active_user('admin'));
DROP POLICY IF EXISTS "IGotU notification read boundary" ON public.notifications;
CREATE POLICY "IGotU notification read boundary" ON public.notifications
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (user_id = auth.uid() AND igotu_private.is_active_user()
    AND NOT igotu_private.is_active_user('admin'));
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "IGotU notification read-state update" ON public.notifications;
CREATE POLICY "IGotU notification read-state update" ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (user_id = auth.uid() AND igotu_private.is_active_user());
DROP POLICY IF EXISTS "IGotU notification update boundary" ON public.notifications;
CREATE POLICY "IGotU notification update boundary" ON public.notifications
AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (user_id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (user_id = auth.uid() AND igotu_private.is_active_user());
DROP POLICY IF EXISTS "IGotU notification insert boundary" ON public.notifications;
CREATE POLICY "IGotU notification insert boundary" ON public.notifications
AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (false);
-- No permissive notification INSERT policy/grant is given to browser roles.

CREATE POLICY "IGotU message read" ON public.internal_messages FOR SELECT TO authenticated
USING (igotu_private.is_active_user('admin') OR
    (igotu_private.is_active_user() AND auth.uid() IN (sender_id, receiver_id)));
DROP POLICY IF EXISTS "IGotU message read boundary" ON public.internal_messages;
CREATE POLICY "IGotU message read boundary" ON public.internal_messages
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (igotu_private.is_active_user('admin') OR
    (igotu_private.is_active_user() AND auth.uid() IN (sender_id, receiver_id)));
DROP POLICY IF EXISTS "IGotU message send" ON public.internal_messages;
CREATE POLICY "IGotU message send" ON public.internal_messages FOR INSERT TO authenticated
WITH CHECK (NOT is_read AND igotu_private.valid_message(request_id, sender_id, receiver_id));
DROP POLICY IF EXISTS "IGotU message send boundary" ON public.internal_messages;
CREATE POLICY "IGotU message send boundary" ON public.internal_messages
AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (NOT is_read AND igotu_private.valid_message(request_id, sender_id, receiver_id));
DROP POLICY IF EXISTS "IGotU message read-state update" ON public.internal_messages;
CREATE POLICY "IGotU message read-state update" ON public.internal_messages FOR UPDATE TO authenticated
USING (receiver_id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (receiver_id = auth.uid() AND igotu_private.is_active_user());
DROP POLICY IF EXISTS "IGotU message update boundary" ON public.internal_messages;
CREATE POLICY "IGotU message update boundary" ON public.internal_messages
AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (receiver_id = auth.uid() AND igotu_private.is_active_user())
WITH CHECK (receiver_id = auth.uid() AND igotu_private.is_active_user());

CREATE POLICY "IGotU payment read" ON public.payment_records FOR SELECT TO authenticated
USING (igotu_private.can_read_service(client_id, provider_id));
DROP POLICY IF EXISTS "IGotU payment read boundary" ON public.payment_records;
CREATE POLICY "IGotU payment read boundary" ON public.payment_records
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (igotu_private.can_read_service(client_id, provider_id));
DROP POLICY IF EXISTS "Clients can insert own payment records" ON public.payment_records;
DROP POLICY IF EXISTS "IGotU completed-service payment insert" ON public.payment_records;
CREATE POLICY "IGotU completed-service payment insert" ON public.payment_records FOR INSERT TO authenticated
WITH CHECK (igotu_private.valid_payment(request_id, client_id, provider_id, amount,
    payment_method::text, proof_path, proof_url));
DROP POLICY IF EXISTS "IGotU payment insert boundary" ON public.payment_records;
CREATE POLICY "IGotU payment insert boundary" ON public.payment_records
AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (igotu_private.valid_payment(request_id, client_id, provider_id, amount,
    payment_method::text, proof_path, proof_url));
-- proof_url must default to NULL (verify live column/default in staging).
-- Stage B omits it from INSERT entirely; even an explicit NULL has no grant.
-- RLS additionally rejects non-NULL URLs if another inherited grant exists.
-- Existing URL-only/both-column receipts are not rewritten or revalidated here.
-- Payment amounts/participants and message/notification bodies cannot be edited
-- through the API because their UPDATE columns were not granted in section 3.


-- 6. Payment-proof privacy. Only this bucket is updated. Existing object names,
-- content, URLs/rows and the other buckets are not rewritten/deleted.
UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';
DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "IGotU payment proof read" ON storage.objects;
CREATE POLICY "IGotU payment proof read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND igotu_private.can_read_payment_proof(name));
DROP POLICY IF EXISTS "IGotU payment proof upload" ON storage.objects;
CREATE POLICY "IGotU payment proof upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-proofs' AND igotu_private.is_active_user('client')
    AND (storage.foldername(name))[1] = auth.uid()::text);
-- Global Storage rules for other buckets may be broad. Restrictive fences apply
-- to every API role, but return TRUE for every bucket except payment-proofs.
DROP POLICY IF EXISTS "IGotU payment proof read boundary" ON storage.objects;
CREATE POLICY "IGotU payment proof read boundary" ON storage.objects
AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (bucket_id <> 'payment-proofs' OR igotu_private.can_read_payment_proof(name));
DROP POLICY IF EXISTS "IGotU payment proof upload boundary" ON storage.objects;
CREATE POLICY "IGotU payment proof upload boundary" ON storage.objects
AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (bucket_id <> 'payment-proofs' OR
    (igotu_private.is_active_user('client') AND (storage.foldername(name))[1] = auth.uid()::text));
DROP POLICY IF EXISTS "IGotU payment proof immutable update" ON storage.objects;
CREATE POLICY "IGotU payment proof immutable update" ON storage.objects
AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id <> 'payment-proofs') WITH CHECK (bucket_id <> 'payment-proofs');
DROP POLICY IF EXISTS "IGotU payment proof immutable delete" ON storage.objects;
CREATE POLICY "IGotU payment proof immutable delete" ON storage.objects
AS RESTRICTIVE FOR DELETE TO PUBLIC USING (bucket_id <> 'payment-proofs');
-- The existing uploader uses upsert:false. Receipt replacement/deletion is not
-- a current frontend feature; new receipts get new paths. Privileged maintenance
-- remains possible with service_role/postgres (never expose their credentials).


-- Stage B browser notification writes are now retired and writes are paused.
-- Trigger activation and browser INSERT revocation commit in ONE transaction.
DROP TRIGGER IF EXISTS igotu_notify_service_change ON public.service_requests;
CREATE TRIGGER igotu_notify_service_change AFTER UPDATE OF status, selected_provider_id
ON public.service_requests FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_service_change();
DROP TRIGGER IF EXISTS igotu_notify_message ON public.internal_messages;
CREATE TRIGGER igotu_notify_message AFTER INSERT ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_insert_event();
DROP TRIGGER IF EXISTS igotu_notify_payment ON public.payment_records;
CREATE TRIGGER igotu_notify_payment AFTER INSERT ON public.payment_records
FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_insert_event();
DROP TRIGGER IF EXISTS igotu_notify_review ON public.service_reviews;
CREATE TRIGGER igotu_notify_review AFTER INSERT ON public.service_reviews
FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_insert_event();
DROP TRIGGER IF EXISTS igotu_notify_verification ON public.verification_requests;
CREATE TRIGGER igotu_notify_verification AFTER INSERT OR UPDATE OF status ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_verification_change();
DROP TRIGGER IF EXISTS igotu_notify_account_status ON public.users;
CREATE TRIGGER igotu_notify_account_status AFTER UPDATE OF status ON public.users
FOR EACH ROW EXECUTE FUNCTION igotu_private.notify_account_status();
-- admin_review_service_report() already writes the report outcome notification.
-- It is retained unchanged; adding another report trigger would duplicate it.


DO $rpc_acls$
DECLARE v_function record;
BEGIN
    FOR v_function IN
        SELECT p.oid::regprocedure AS signature FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
          AND p.prorettype <> 'pg_catalog.trigger'::regtype
          AND p.proname = ANY (ARRAY[
            'complete_basic_profile','client_cancel_request','client_update_request',
            'client_save_request_image','client_select_provider','provider_confirm_request',
            'provider_decline_request','provider_start_request','client_complete_request',
            'admin_update_user_status','admin_review_verification',
            'admin_review_service_report','submit_service_report'])
    LOOP
        -- All overloads are inventoried below. No bodies, owners or role checks
        -- are rewritten; existing service_role grants remain untouched.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_function.signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function.signature);
    END LOOP;
END;
$rpc_acls$;
-- Trigger-only function: invocation by the EXISTING auth.users trigger is not
-- affected by revoking direct API execute. Do not replace its body/trigger.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated, service_role;


-- current_user_role() is a LIVE RLS helper, not a signup RPC. Preserve its
-- body and authenticated access. Only revoke PUBLIC/anon after explicit review.
-- If anon is required by retained policies, retain the existing PUBLIC/anon ACLs
-- rather than breaking those policies; record this justified exception.
DO $role_helper_acls$
DECLARE v_oid oid := to_regprocedure('public.current_user_role()'); v_service_before boolean;
BEGIN
    v_service_before := has_function_privilege('service_role',v_oid,'EXECUTE');
    GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
    IF current_setting('igotu.rollout.role_helper_anon_required',true)='false' THEN
        IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_policy pol
            ON d.classid='pg_policy'::regclass AND pol.oid=d.objid
            WHERE d.refclassid='pg_proc'::regclass AND d.refobjid=v_oid
              AND (0::oid=ANY(pol.polroles)
                OR (SELECT oid FROM pg_roles WHERE rolname='anon')=ANY(pol.polroles))) THEN
            RAISE EXCEPTION 'A retained PUBLIC/anon policy uses current_user_role; anon cannot be revoked blindly.';
        END IF;
        REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
        IF v_service_before THEN GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role; END IF;
        IF has_function_privilege('anon',v_oid,'EXECUTE') THEN
            RAISE EXCEPTION 'Inherited anon access to current_user_role remains.';
        END IF;
    ELSE
        -- Guarantee anon dependencies still work if previous effective access
        -- was inherited through PUBLIC; do not expand beyond that known need.
        GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon;
        RAISE NOTICE 'current_user_role anon/PUBLIC access retained for reviewed RLS dependencies.';
    END IF;
END;
$role_helper_acls$;

-- Inherited grants could defeat narrow column revokes. Abort rather than change
-- custom role memberships silently. Owner/superuser role assignments also need
-- a catalog review; none are created or changed by this script.
DO $effective_acl_checks$
DECLARE v_table text; v_column text; v_function record;
BEGIN
    FOREACH v_column IN ARRAY ARRAY[
        'id','user_code','role','status','identity_verified','identity_verified_at','identity_verified_by'
    ] LOOP
        IF has_column_privilege('authenticated', 'public.users', v_column, 'UPDATE') THEN
            RAISE EXCEPTION 'Inherited users UPDATE privilege remains on %; review memberships.', v_column;
        END IF;
    END LOOP;
    FOREACH v_column IN ARRAY ARRAY['is_verified','verified_at','verified_by'] LOOP
        IF has_column_privilege('authenticated', 'public.provider_profiles', v_column, 'UPDATE')
           OR has_column_privilege('authenticated', 'public.provider_profiles', v_column, 'INSERT') THEN
            RAISE EXCEPTION 'Inherited Provider verification write privilege remains on %.', v_column;
        END IF;
    END LOOP;
    IF has_any_column_privilege('authenticated', 'public.notifications', 'INSERT')
       OR has_any_column_privilege('anon', 'public.notifications', 'INSERT') THEN
        RAISE EXCEPTION 'Inherited browser notification INSERT privilege remains.';
    END IF;
    IF has_any_column_privilege('authenticated', 'public.service_requests', 'UPDATE') THEN
        RAISE EXCEPTION 'Inherited direct service UPDATE remains; RPC-only transitions required.';
    END IF;
    IF has_any_column_privilege('authenticated', 'public.users', 'INSERT') THEN
        RAISE EXCEPTION 'Inherited users INSERT remains; signup must use the auth trigger.';
    END IF;
    IF has_column_privilege('authenticated', 'public.payment_records', 'proof_url', 'INSERT') THEN
        RAISE EXCEPTION 'Inherited proof_url INSERT remains; new receipts must use verified proof_path only.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'igotu_private'
          AND p.proname IN ('emit_notification','notify_service_change','notify_insert_event',
              'notify_verification_change','notify_account_status')
          AND (has_function_privilege('anon',p.oid,'EXECUTE')
            OR has_function_privilege('authenticated',p.oid,'EXECUTE')
            OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN
        RAISE EXCEPTION 'Direct notification-writer EXECUTE must remain revoked.';
    END IF;
    FOREACH v_table IN ARRAY ARRAY[
        'users','provider_profiles','notifications','internal_messages','payment_records'
    ] LOOP
        IF has_any_column_privilege('anon', 'public.' || v_table, 'INSERT')
           OR has_any_column_privilege('anon', 'public.' || v_table, 'UPDATE')
           OR has_table_privilege('anon', 'public.' || v_table, 'DELETE')
           OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') THEN
            RAISE EXCEPTION 'Unexpected inherited browser write privileges on %.', v_table;
        END IF;
    END LOOP;
    -- No inherited UPDATE may allow changes to message contents/participants,
    -- notification contents/recipients, email/account identifiers or payments.
    FOR v_function IN
        SELECT c.relname, a.attname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
          AND ((c.relname = 'users' AND a.attname NOT IN ('full_name','phone','profile_completed'))
            OR (c.relname IN ('notifications','internal_messages') AND a.attname <> 'is_read')
            OR c.relname = 'payment_records'
            OR (c.relname = 'provider_profiles' AND a.attname NOT IN (
                'provider_id','bio','location','provider_lat','provider_lng','is_available')))
    LOOP
        IF has_column_privilege('authenticated', 'public.' || v_function.relname,
            v_function.attname, 'UPDATE') THEN
            RAISE EXCEPTION 'Unexpected inherited UPDATE on %.%.', v_function.relname, v_function.attname;
        END IF;
    END LOOP;
    FOR v_function IN
        SELECT p.oid, p.oid::regprocedure AS signature FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
          AND p.proname = ANY (ARRAY[
            'complete_basic_profile','client_cancel_request','client_update_request',
            'client_save_request_image','client_select_provider','provider_confirm_request',
            'provider_decline_request','provider_start_request','client_complete_request',
            'admin_update_user_status','admin_review_verification','admin_review_service_report',
            'submit_service_report','provider_match_metadata','provider_service_requests','payment_proof_reference','handle_new_auth_user'])
    LOOP
        IF has_function_privilege('anon', v_function.oid, 'EXECUTE')
           OR (v_function.signature::text LIKE '%handle_new_auth_user%'
               AND has_function_privilege('authenticated', v_function.oid, 'EXECUTE')) THEN
            RAISE EXCEPTION 'Inherited API EXECUTE privilege remains on %.', v_function.signature;
        END IF;
    END LOOP;
END;
$effective_acl_checks$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 9. READ-ONLY VERIFICATION QUERIES -- run separately after an approved apply.
-- These query metadata, not private application content. Expected results are
-- documented; a catalog check is not a substitute for multi-account API tests.

-- All six tables should show rls_enabled=true.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
    'users','service_requests','provider_profiles','notifications','internal_messages','payment_records');

-- Inventory every retained/new policy, including custom-role/FOR ALL policies.
-- Read boundaries must not be absent merely because another permissive policy exists.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
    'users','service_requests','provider_profiles','notifications','internal_messages','payment_records'))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, cmd, policyname;

-- For authenticated: only users full_name/phone/profile_completed may be updated;
-- Provider protected verification columns must be false for INSERT AND UPDATE.
SELECT c.relname AS table_name, a.attname AS column_name,
    has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') AS may_insert,
    has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') AS may_update
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public' AND c.relname IN (
    'users','provider_profiles','notifications','internal_messages','payment_records')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- payment-proofs must be private; the other two buckets retain their old values.
SELECT id, public FROM storage.buckets
WHERE id IN ('payment-proofs','verification-documents','report-evidence');
-- Counts only: historical NULL/unlinked proof_path and owner metadata need review.
SELECT count(*) FILTER (WHERE proof_url IS NOT NULL AND proof_path IS NULL) AS legacy_proofs_without_path
FROM public.payment_records;
SELECT count(*) FILTER (
    WHERE COALESCE(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') IS NULL
) AS proofs_without_owner FROM storage.objects o WHERE bucket_id = 'payment-proofs';

-- Named public application RPCs: anon_execute=false; authenticated=true.
-- Private boolean predicates: both true, intentionally, for restrictive policies.
-- Guarded private matching reader: only authenticated=true.
-- handle_new_auth_user/notification trigger functions: both false.
-- service_role execution for existing application RPCs is preserved as it was.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
    p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'igotu_private') OR (n.nspname = 'public' AND p.proname IN (
    'complete_basic_profile','client_cancel_request','client_update_request',
    'client_save_request_image','client_select_provider','provider_confirm_request',
    'provider_decline_request','provider_start_request','client_complete_request',
    'admin_update_user_status','admin_review_verification','admin_review_service_report',
    'submit_service_report','provider_match_metadata','provider_service_requests','payment_proof_reference','handle_new_auth_user'))
ORDER BY n.nspname, p.proname, arguments;
-- Review remaining anon-callable definers. current_user_role may be an explicitly
-- retained policy dependency; do not mistake that reviewed exception for an RPC.
SELECT p.oid::regprocedure AS anon_callable_definer,
    CASE WHEN p.oid=to_regprocedure('public.current_user_role()')
        THEN 'Check against the reviewed role-helper dependency decision'
        ELSE 'Review explicitly; do not blindly revoke unrelated functions' END AS review_note
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  AND p.prorettype <> 'pg_catalog.trigger'::regtype
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- Verify six new event triggers plus the original auth.users signup trigger.
SELECT n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND (t.tgname LIKE 'igotu_notify_%' OR t.tgrelid = 'auth.users'::regclass)
ORDER BY n.nspname, c.relname, t.tgname;
SELECT member_role.rolname AS member_role, parent_role.rolname AS inherited_role
FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid = m.member
JOIN pg_roles parent_role ON parent_role.oid = m.roleid
WHERE member_role.rolname IN ('anon','authenticated');

-- MANUAL MULTI-ACCOUNT ACCEPTANCE CHECKS (use real JWTs in staging):
-- * Client A sees own requests; Client B/Provider B cannot retrieve them.
-- * Assigned Provider sees only projected pending details through provider_service_requests();
--   raw provider_selected SELECT returns no rows; exact fields remain SQL NULL in RPC.
--   Confirmed/in_progress/completed can expose location; Admin retains raw reads.
-- * Client A calling provider_match_metadata(Client B's request) is rejected;
--   Provider and anon calls are rejected; successful result has only three columns.
-- * Own full_name/phone edit and Provider upsert work; protected user/verification
--   fields fail even when mixed into an otherwise-valid PATCH or INSERT/upsert.
-- * users raw SELECT/embedding exposes only self or active Admin rows; Stage B
--   guarded projections preserve recommendations, participant labels and reports
--   without returning other users' email/phone or private verification metadata.
-- * Signup trigger still creates users and Admin RPCs still update status/verification.
-- * Notification INSERT fails for both browser roles; service/message/payment/
--   review/verification/account events notify the correct Client/Provider once.
-- * Payment insert rejects wrong Client/Provider/request/status and foreign proof;
--   a completed own service with the selected Provider succeeds.
--   Omit proof_url; explicit arbitrary/project/signed URLs (even paired with an
--   owned path) fail. QR/Bank require an owned path; Cash/Other may omit a proof.
-- * Path-only, URL-only and consistent both-column legacy receipts remain viewable.
-- * Own uploader, linked Provider and Admin can sign/read a receipt; unrelated
--   users/anon cannot. Old public URLs fail after cache considerations are reviewed.
-- * Other private buckets behave exactly as before.
-- * Message text/participants cannot be patched; receiver can mark is_read.
-- No mutation tests or SQL statements above have been executed by this assistant.

-- Role-helper ACL exception and retained dependencies must match operator review.
SELECT p.oid::regprocedure, p.prosecdef, p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid=to_regprocedure('public.current_user_role()');
