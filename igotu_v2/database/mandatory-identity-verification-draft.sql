-- REVIEW-ONLY DRAFT. NOT EXECUTED. NOT A PRODUCTION DEPLOYMENT SCRIPT.
-- Separate feature from Stage A/B/C. Read mandatory-identity-verification.md first.
-- Requires an isolated catalog export, operator review and the accompanying
-- negative API/Storage tests. No accounts are approved, deleted or backfilled.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE t text;
BEGIN
  IF current_user <> 'postgres' OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'Reviewed postgres installer and non-writable public schema required.';
  END IF;
  IF current_setting('igotu.identity.catalog_reviewed', true) IS DISTINCT FROM 'true'
     OR current_setting('igotu.identity.private_schema_verified', true) IS DISTINCT FROM 'true'
     OR current_setting('igotu.identity.staging_only', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Review catalog/exposed schemas and staging test plan first; no production authorization is implied.';
  END IF;
  IF EXISTS(SELECT 1 FROM regexp_split_to_table(coalesce(current_setting('pgrst.db_schemas',true),''),',') s(name)
    WHERE trim(both '"' FROM btrim(s.name))='identity_access_private') THEN
    RAISE EXCEPTION 'Private schema must not be exposed. SQL settings alone are not authoritative evidence.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('v','m')
      AND (c.relkind='m' OR NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'],false))
      AND (has_any_column_privilege('anon',c.oid,'SELECT') OR has_any_column_privilege('authenticated',c.oid,'SELECT'))) THEN
    RAISE EXCEPTION 'Browser-readable definer view/materialized view requires a separate compatibility review.';
  END IF;
  IF to_regnamespace('identity_access_private') IS NOT NULL THEN
    RAISE EXCEPTION 'Fresh reviewed install only; inspect prior installation instead of replacing objects.';
  END IF;
  IF to_regnamespace('igotu_private') IS NOT NULL THEN
    RAISE EXCEPTION 'Stage A/C objects present: reconcile the separate rollout before applying this pre-Stage-A draft.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.verification_requests WHERE status='pending' GROUP BY user_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate pending requests: review individually; this draft does not delete or pick winners.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='verification-documents' AND NOT public) THEN
    RAISE EXCEPTION 'Existing private verification-documents bucket required.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p')
      AND (pg_has_role('anon',c.relowner,'USAGE') OR pg_has_role('authenticated',c.relowner,'USAGE'))) THEN
    RAISE EXCEPTION 'A browser role owns/inherits ownership of an application table and could bypass RLS.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Browser roles must not bypass RLS.';
  END IF;
  -- Owners, inherited grants, callable views/functions, extensions, other exposed
  -- schemas and indirect function dependencies MUST be audited externally too.
  -- Unknown privileged public endpoints are not silently granted an exception.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f'
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
      AND (p.proname <> ALL(ARRAY['current_user_role','complete_basic_profile','client_cancel_request',
       'client_update_request','client_save_request_image','client_select_provider','provider_confirm_request',
       'provider_decline_request','provider_start_request','client_complete_request','admin_update_user_status',
       'admin_review_verification','admin_review_service_report','submit_service_report'])
        OR (p.proname='current_user_role' AND p.oid IS DISTINCT FROM to_regprocedure('public.current_user_role()'))
        OR (p.proname='admin_review_verification' AND p.oid IS DISTINCT FROM to_regprocedure('public.admin_review_verification(uuid,text,text)')))
  ) THEN RAISE EXCEPTION 'Unknown browser-callable SECURITY DEFINER function: review before extending the allowlist.'; END IF;
  IF to_regprocedure('public.current_user_role()') IS NULL OR to_regprocedure('public.handle_new_auth_user()') IS NULL THEN
    RAISE EXCEPTION 'Expected role helper/signup trigger contract missing; do not replace signup logic.';
  END IF;
  FOREACH t IN ARRAY ARRAY['complete_basic_profile','client_cancel_request','client_update_request',
    'client_save_request_image','client_select_provider','provider_confirm_request','provider_decline_request',
    'provider_start_request','client_complete_request','admin_update_user_status','admin_review_service_report','submit_service_report'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=t AND p.prosecdef) THEN
      RAISE EXCEPTION 'Missing expected RPC %. Review actual signatures; do not install substitute business logic.', t;
    END IF;
  END LOOP;
END;
$preflight$;
CREATE SCHEMA identity_access_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA identity_access_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA identity_access_private TO anon, authenticated;

-- These helpers deliberately bypass users/request RLS only to return a boolean
-- about auth.uid(). They do not accept arbitrary user IDs or return personal data.
CREATE FUNCTION identity_access_private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin' AND status='active'); $$;
CREATE FUNCTION identity_access_private.is_applicant()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('client','provider') AND status='active'); $$;
CREATE FUNCTION identity_access_private.can_use_workspace()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status='active'
    AND (u.role::text='admin' OR (u.role::text IN ('client','provider') AND u.identity_verified IS TRUE
      AND u.identity_verified_at IS NOT NULL AND EXISTS(
        SELECT 1 FROM (SELECT v.* FROM public.verification_requests v WHERE v.user_id=u.id
          ORDER BY v.submitted_at DESC,v.id DESC LIMIT 1) v
        WHERE v.status='approved' AND v.role=u.role::text AND v.reviewed_at IS NOT NULL
          AND v.reviewed_by IS NOT NULL AND v.reviewed_by=u.identity_verified_by))));
$$;
REVOKE ALL ON FUNCTION identity_access_private.is_admin(),identity_access_private.is_applicant(),identity_access_private.can_use_workspace()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION identity_access_private.is_admin(),identity_access_private.is_applicant(),identity_access_private.can_use_workspace() TO anon,authenticated;

ALTER TABLE public.verification_requests ADD COLUMN age_confirmed boolean;
ALTER TABLE public.verification_requests ADD COLUMN privacy_consent boolean;
CREATE UNIQUE INDEX mandatory_identity_one_pending ON public.verification_requests(user_id) WHERE status='pending';
CREATE INDEX mandatory_identity_latest ON public.verification_requests(user_id,submitted_at DESC,id DESC);
UPDATE storage.buckets SET file_size_limit=5242880,
  allowed_mime_types=ARRAY['image/jpeg','image/png','application/pdf'] WHERE id='verification-documents';

-- Add restrictive boundaries rather than OR-ing permissive policies. They do not
-- grant new service access or replace existing ownership/participant checks.
DO $table_boundaries$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname NOT IN ('users','verification_requests','notifications')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
    EXECUTE format('CREATE POLICY mandatory_identity_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING ((SELECT identity_access_private.can_use_workspace())) WITH CHECK ((SELECT identity_access_private.can_use_workspace()))',r.relname);
  END LOOP;
END;
$table_boundaries$;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY mandatory_identity_users_read ON public.users AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (id=auth.uid() OR (SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_users_insert ON public.users AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY mandatory_identity_users_update ON public.users AS RESTRICTIVE FOR UPDATE TO anon,authenticated
  USING ((SELECT identity_access_private.can_use_workspace())) WITH CHECK((SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_users_delete ON public.users AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY mandatory_identity_request_read ON public.verification_requests AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (user_id=auth.uid() OR (SELECT identity_access_private.is_admin()));
CREATE POLICY mandatory_identity_request_insert ON public.verification_requests AS RESTRICTIVE FOR INSERT TO anon,authenticated
  WITH CHECK(user_id=auth.uid() AND (SELECT identity_access_private.is_applicant()) AND NOT (SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_request_update ON public.verification_requests AS RESTRICTIVE FOR UPDATE TO anon,authenticated
  USING((SELECT identity_access_private.is_admin())) WITH CHECK((SELECT identity_access_private.is_admin()));
CREATE POLICY mandatory_identity_request_delete ON public.verification_requests AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);

-- Row triggers also protect mutations reached through privileged legacy RPCs.
-- Trusted backend/signup operations with no browser role/UID remain compatible;
-- the catalog review must enumerate those writers. No browser can set SQL role.
CREATE FUNCTION identity_access_private.enforce_workspace_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NOT identity_access_private.can_use_workspace() THEN RAISE EXCEPTION 'Identity approval required.' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
DO $write_triggers$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relispartition
      AND c.relname NOT IN ('users','verification_requests','notifications')
  LOOP EXECUTE format('CREATE TRIGGER mandatory_identity_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION identity_access_private.enforce_workspace_write()',r.relname); END LOOP;
END;
$write_triggers$;
CREATE FUNCTION identity_access_private.protect_user_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF NOT identity_access_private.is_admin() AND
    (NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.user_code IS DISTINCT FROM OLD.user_code OR NEW.identity_verified IS DISTINCT FROM OLD.identity_verified
      OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at OR NEW.identity_verified_by IS DISTINCT FROM OLD.identity_verified_by)
  THEN RAISE EXCEPTION 'Account authority fields are administrator-managed.' USING ERRCODE='42501'; END IF;
  IF NOT identity_access_private.can_use_workspace() THEN RAISE EXCEPTION 'Identity approval required for profile changes.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER mandatory_identity_user_authority BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION identity_access_private.protect_user_authority();

CREATE FUNCTION identity_access_private.enforce_verification_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE u public.users%rowtype;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification history is immutable.'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NOT identity_access_private.is_admin() OR OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected')
      OR (to_jsonb(NEW)-ARRAY['status','admin_note','reviewed_at','reviewed_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','admin_note','reviewed_at','reviewed_by'])
      OR NEW.reviewed_by IS DISTINCT FROM auth.uid() OR NEW.reviewed_at IS NULL
      OR (NEW.status='rejected' AND nullif(btrim(NEW.admin_note),'') IS NULL)
    THEN RAISE EXCEPTION 'Only active Admin review may change a pending submission.' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO u FROM public.users WHERE id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR u.status<>'active' OR u.role::text NOT IN ('client','provider') OR NEW.user_id IS DISTINCT FROM u.id
    OR NEW.role<>u.role::text OR identity_access_private.can_use_workspace()
    OR NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.admin_note IS NOT NULL
    OR NEW.age_confirmed IS DISTINCT FROM true OR NEW.privacy_consent IS DISTINCT FROM true
    OR length(btrim(NEW.legal_name))<2 OR NEW.id_type NOT IN ('mykad','passport')
    OR NEW.id_number_last4 !~ '^[A-Za-z0-9]{4}$'
  THEN RAISE EXCEPTION 'Invalid identity submission.' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.verification_requests WHERE user_id=u.id AND status='pending') THEN
    RAISE EXCEPTION 'A pending verification already exists.' USING ERRCODE='23505'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='verification-documents' AND o.name=NEW.identity_document_path
      AND split_part(o.name,'/',1)=u.id::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u.id::text)
    OR (NEW.supporting_document_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='verification-documents'
      AND o.name=NEW.supporting_document_path AND split_part(o.name,'/',1)=u.id::text
      AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u.id::text))
  THEN RAISE EXCEPTION 'Identity documents must be privately uploaded and owned by this applicant.'; END IF;
  NEW.submitted_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER mandatory_identity_submission BEFORE INSERT OR UPDATE OR DELETE ON public.verification_requests FOR EACH ROW EXECUTE FUNCTION identity_access_private.enforce_verification_write();

-- The existing RPC remains the one review endpoint. No notification trigger is
-- added: pre-Stage-C browser submission/review notifications remain in place.
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_request_id uuid,p_status text,p_admin_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v public.verification_requests%rowtype; subject uuid;
BEGIN
  IF NOT identity_access_private.is_admin() THEN RAISE EXCEPTION 'Only active administrators may review identity.' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision.'; END IF;
  IF p_status='rejected' AND nullif(btrim(p_admin_note),'') IS NULL THEN RAISE EXCEPTION 'A rejection reason is required.'; END IF;
  SELECT user_id INTO subject FROM public.verification_requests WHERE id=p_request_id;
  IF subject IS NULL THEN RAISE EXCEPTION 'Verification request not found.'; END IF;
  -- Same applicant-first lock order as submission, avoiding a user/request deadlock.
  PERFORM 1 FROM public.users WHERE id=subject FOR UPDATE;
  SELECT * INTO v FROM public.verification_requests WHERE id=p_request_id FOR UPDATE;
  IF v.status<>'pending' THEN RAISE EXCEPTION 'This request was already reviewed.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v.user_id AND role::text=v.role) THEN RAISE EXCEPTION 'Applicant role changed; investigate before review.'; END IF;
  IF p_status='approved' AND (v.age_confirmed IS DISTINCT FROM true OR v.privacy_consent IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Legacy consent is unrecorded. Reject with corrections and obtain a new submission; never invent consent.';
  END IF;
  UPDATE public.verification_requests SET status=p_status,admin_note=nullif(btrim(p_admin_note),''),reviewed_at=now(),reviewed_by=auth.uid() WHERE id=v.id;
  UPDATE public.users SET identity_verified=(p_status='approved'),identity_verified_at=CASE WHEN p_status='approved' THEN now() END,
    identity_verified_by=CASE WHEN p_status='approved' THEN auth.uid() END WHERE id=v.user_id;
  IF v.role='provider' THEN UPDATE public.provider_profiles SET is_verified=(p_status='approved'),verified_at=CASE WHEN p_status='approved' THEN now() END,
    verified_by=CASE WHEN p_status='approved' THEN auth.uid() END WHERE provider_id=v.user_id; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid,text,text) TO authenticated;

-- Approval can precede creation of provider_profiles. Derive its badge when the
-- approved Provider later creates/updates their service profile; never trust input.
CREATE FUNCTION identity_access_private.sync_provider_badge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE u public.users%rowtype; BEGIN
  SELECT * INTO u FROM public.users WHERE id=NEW.provider_id;
  NEW.is_verified:=coalesce(u.identity_verified,false); NEW.verified_at:=u.identity_verified_at; NEW.verified_by:=u.identity_verified_by;
  RETURN NEW;
END; $$;
CREATE TRIGGER mandatory_identity_provider_badge BEFORE INSERT OR UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION identity_access_private.sync_provider_badge();

-- Preserve original service RPC bodies/overloads and ownership rules behind a
-- guarded public wrapper. Moving the original preserves internal dependencies;
-- those dependencies MUST be audited (unknown definer readers/views abort review).
DO $rpc_boundaries$
DECLARE r record; args text; body text; expr text; i integer;
BEGIN
  FOR r IN SELECT p.*,pg_get_function_arguments(p.oid) AS declaration,pg_get_function_identity_arguments(p.oid) AS identity_args,
    pg_get_function_result(p.oid) AS result_type FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY['complete_basic_profile','client_cancel_request','client_update_request',
    'client_save_request_image','client_select_provider','provider_confirm_request','provider_decline_request','provider_start_request',
    'client_complete_request','admin_update_user_status','admin_review_service_report','submit_service_report'])
  LOOP
    IF NOT r.prosecdef OR r.proretset OR r.proargmodes IS NOT NULL OR r.provariadic<>0
      OR pg_has_role('anon',r.proowner,'USAGE') OR pg_has_role('authenticated',r.proowner,'USAGE') THEN
      RAISE EXCEPTION 'Unsupported RPC signature: %. Audit exact wrapper contract.',r.proname;
    END IF;
    args:='';
    FOR i IN 1..r.pronargs LOOP args:=args || CASE WHEN i>1 THEN ',' ELSE '' END || '$'||i; END LOOP;
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA identity_access_private',r.proname,r.identity_args);
    EXECUTE format('REVOKE ALL ON FUNCTION identity_access_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',r.proname,r.identity_args);
    EXECUTE format('ALTER FUNCTION identity_access_private.%I(%s) SET search_path=public,pg_temp',r.proname,r.identity_args);
    expr:=format('identity_access_private.%I(%s)',r.proname,args);
    body:='BEGIN IF NOT identity_access_private.can_use_workspace() THEN RAISE EXCEPTION ''Identity approval required.'' USING ERRCODE=''42501''; END IF; ' ||
      CASE WHEN r.prorettype='void'::regtype THEN 'PERFORM '||expr||'; RETURN;' ELSE 'RETURN '||expr||';' END || ' END;';
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',r.proname,r.declaration,r.result_type,body);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated,service_role',r.proname,r.identity_args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',r.proname,r.identity_args);
  END LOOP;
END;
$rpc_boundaries$;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC,anon,authenticated,service_role;

-- Minimal pre-C browser notification write: a single generic self receipt after
-- a pending submission. Normal notification reads/updates still require approval.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY mandatory_identity_notification_read ON public.notifications AS RESTRICTIVE FOR SELECT TO anon,authenticated USING((SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_notification_update ON public.notifications AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING((SELECT identity_access_private.can_use_workspace())) WITH CHECK((SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_notification_delete ON public.notifications AS RESTRICTIVE FOR DELETE TO anon,authenticated USING((SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_notification_insert ON public.notifications AS RESTRICTIVE FOR INSERT TO anon,authenticated
  WITH CHECK((SELECT identity_access_private.can_use_workspace()) OR (user_id=auth.uid() AND title='Verification submitted' AND message='Your identity verification request has been submitted for administrator review.' AND (SELECT identity_access_private.is_applicant())));
CREATE FUNCTION identity_access_private.enforce_notification_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE submitted timestamptz; BEGIN
  IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF identity_access_private.can_use_workspace() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identity approval required.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.users WHERE id=auth.uid() FOR UPDATE;
  SELECT submitted_at INTO submitted FROM public.verification_requests WHERE user_id=auth.uid() AND status='pending';
  IF TG_OP<>'INSERT' OR NOT identity_access_private.is_applicant() OR NEW.user_id IS DISTINCT FROM auth.uid() OR submitted IS NULL
    OR NEW.title<>'Verification submitted' OR NEW.message<>'Your identity verification request has been submitted for administrator review.'
    OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id=auth.uid() AND title='Verification submitted' AND created_at>=submitted)
  THEN RAISE EXCEPTION 'Identity approval required for notification operations.' USING ERRCODE='42501'; END IF;
  NEW.created_at:=now(); RETURN NEW;
END; $$;
CREATE TRIGGER mandatory_identity_notification_write BEFORE INSERT OR UPDATE OR DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION identity_access_private.enforce_notification_write();

-- Check references with a boolean definer so RLS-hidden legacy references
-- cannot turn a linked document into an apparent orphan.
CREATE INDEX mandatory_identity_document_ref ON public.verification_requests(identity_document_path);
CREATE INDEX mandatory_identity_support_ref ON public.verification_requests(supporting_document_path) WHERE supporting_document_path IS NOT NULL;
CREATE FUNCTION identity_access_private.unlinked_own_document(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT identity_access_private.is_applicant() AND split_part(p_name,'/',1)=auth.uid()::text
 AND NOT EXISTS(SELECT 1 FROM public.verification_requests WHERE identity_document_path=p_name OR supporting_document_path=p_name); $$;
REVOKE ALL ON FUNCTION identity_access_private.unlinked_own_document(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION identity_access_private.unlinked_own_document(text) TO anon,authenticated;

-- Bucket remains private. Existing permissive ownership policies remain, but
-- these restrictive boundaries cannot be OR-bypassed by broader legacy policies.
CREATE POLICY mandatory_identity_storage_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(CASE WHEN bucket_id='verification-documents' THEN (SELECT identity_access_private.is_admin()) OR ((SELECT identity_access_private.is_applicant()) AND split_part(name,'/',1)=auth.uid()::text) ELSE (SELECT identity_access_private.can_use_workspace()) END);
CREATE POLICY mandatory_identity_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(CASE WHEN bucket_id='verification-documents' THEN (SELECT identity_access_private.is_applicant()) AND NOT (SELECT identity_access_private.can_use_workspace())
  AND split_part(name,'/',1)=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.verification_requests WHERE user_id=auth.uid() AND status='pending') ELSE (SELECT identity_access_private.can_use_workspace()) END);
CREATE POLICY mandatory_identity_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'verification-documents' AND (SELECT identity_access_private.can_use_workspace())) WITH CHECK(bucket_id<>'verification-documents' AND (SELECT identity_access_private.can_use_workspace()));
CREATE POLICY mandatory_identity_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(CASE WHEN bucket_id='verification-documents' THEN identity_access_private.unlinked_own_document(name) ELSE (SELECT identity_access_private.can_use_workspace()) END);

-- Recommendation/assignment targets must also be approved, not only the actor.
CREATE FUNCTION identity_access_private.provider_is_eligible(p_provider_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT identity_access_private.can_use_workspace() AND EXISTS(
 SELECT 1 FROM public.users u WHERE u.id=p_provider_id AND u.role::text='provider' AND u.status='active'
 AND u.identity_verified IS TRUE AND u.identity_verified_at IS NOT NULL AND EXISTS(
   SELECT 1 FROM (SELECT v.* FROM public.verification_requests v WHERE v.user_id=u.id ORDER BY v.submitted_at DESC,v.id DESC LIMIT 1) v
   WHERE v.status='approved' AND v.role='provider' AND v.reviewed_at IS NOT NULL AND v.reviewed_by IS NOT NULL AND v.reviewed_by=u.identity_verified_by)); $$;
REVOKE ALL ON FUNCTION identity_access_private.provider_is_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION identity_access_private.provider_is_eligible(uuid) TO anon,authenticated;
CREATE POLICY mandatory_identity_provider_candidate ON public.provider_profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING((SELECT identity_access_private.is_admin()) OR identity_access_private.provider_is_eligible(provider_id));
CREATE FUNCTION identity_access_private.enforce_assignment_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF NEW.selected_provider_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.selected_provider_id IS DISTINCT FROM OLD.selected_provider_id)
   AND NOT identity_access_private.provider_is_eligible(NEW.selected_provider_id)
 THEN RAISE EXCEPTION 'Selected Provider must have approved identity.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mandatory_identity_assignment_target BEFORE INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION identity_access_private.enforce_assignment_target();

-- Trigger helpers are never callable by browsers, even under creation defaults.
DO $acl_check$
DECLARE r record;
BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='identity_access_private' AND p.prorettype='pg_catalog.trigger'::regtype
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature); END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity_access_private'
   AND p.proname NOT IN ('is_admin','is_applicant','can_use_workspace','provider_is_eligible','unlinked_own_document')
   AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
   RAISE EXCEPTION 'Inherited access to private implementations remains.';
 END IF;
END;
$acl_check$;
NOTIFY pgrst,'reload schema';
COMMIT;
