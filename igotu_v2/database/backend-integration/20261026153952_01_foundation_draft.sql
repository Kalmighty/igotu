-- REVIEW-ONLY, STAGING-ONLY DRAFT. NEVER EXECUTED BY THIS CHANGE.
-- Do not run historical Stage A/C/identity scripts with these replacements.
-- Read docs/backend-integration/rollout.md and obtain separate write approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $gate$ BEGIN
 IF current_user<>'postgres' OR current_setting('igotu.integration.staging_only',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.catalog_reviewed',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.private_schema_verified',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Authorized isolated staging, catalog review and effective API-schema privacy evidence required.'; END IF;
END $gate$;
DO $preflight$ BEGIN
 IF current_setting('igotu.integration.project_ref',true) IS NULL
 OR current_setting('igotu.integration.project_ref',true) !~ '^[a-z]{20}$'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 THEN RAISE EXCEPTION 'Explicit isolated staging project reference required; production is excluded.'; END IF;
 IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'Browser roles must not create public objects or bypass RLS.'; END IF;
 IF to_regnamespace('igotu_backend_private') IS NOT NULL OR to_regnamespace('igotu_private') IS NOT NULL
 OR to_regnamespace('identity_access_private') IS NOT NULL THEN
 RAISE EXCEPTION 'Fresh reviewed baseline only. Do not combine existing unintegrated stages.'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('admin_update_user_status(uuid,text)'))) IS DISTINCT FROM '45ca7c7966d9b7173a8d29fec046c609' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_update_user_status'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('provider_start_request(text)'))) IS DISTINCT FROM 'd6e8d69a8ba2df00568806bc85aa3471' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_start_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('client_complete_request(text)'))) IS DISTINCT FROM '83276aeb9b94e72b61dc7acc9d6cbced' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_complete_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('format_custom_id(text,text)'))) IS DISTINCT FROM '1b75cc9863d4eeaecebfd6a551eb1349' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: format_custom_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('set_updated_at()'))) IS DISTINCT FROM 'c4822644cf7d8a94a3b779a7f2c430e5' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: set_updated_at'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_user_code()'))) IS DISTINCT FROM '533b048ec6006b4cb09816bd4bb7a707' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_user_code'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_service_request_id()'))) IS DISTINCT FROM 'cc81eae5f333b1e2a721847087ecf02a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_service_request_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_skill_code()'))) IS DISTINCT FROM 'd6b0649d5a920d5c691c74a9d57201db' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_skill_code'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_payment_id()'))) IS DISTINCT FROM 'e22a02aa51680a15de7321417c962071' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_payment_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_review_id()'))) IS DISTINCT FROM '17182b2bf4d981f8dc27a993efeebb7a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_review_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_message_id()'))) IS DISTINCT FROM 'd24dafea56fe2319e011aa7c74e13025' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_message_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('assign_notification_id()'))) IS DISTINCT FROM '426dc23fa7350679557c367cd65b005c' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_notification_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('current_user_role()'))) IS DISTINCT FROM '126f596b9d5a89c026a286d8b335be81' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: current_user_role'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('handle_new_auth_user()'))) IS DISTINCT FROM '6e337fc906c4a58e14a09842724ba305' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: handle_new_auth_user'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('client_save_request_image(text,text,text)'))) IS DISTINCT FROM '348a966c7a7d8bdaad8d86ffec3e13f8' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_save_request_image'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('client_update_request(text,text,text,text,text,date,time without time zone,text,numeric,numeric,numeric,text)'))) IS DISTINCT FROM 'd0c8884416c5489102764366314a4c32' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_update_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('complete_basic_profile(text,text)'))) IS DISTINCT FROM '41675f6590ed187a06d2a20b1fa1cc6a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: complete_basic_profile'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('admin_review_verification(uuid,text,text)'))) IS DISTINCT FROM '2fed291da2f00407a553305b353c3841' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_review_verification'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('client_cancel_request(text,text)'))) IS DISTINCT FROM '0e817027f00845ea3967a58273264165' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_cancel_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('provider_decline_request(text,text)'))) IS DISTINCT FROM '0db321b2b32af22017e4c2e83e680915' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_decline_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('client_select_provider(text,uuid)'))) IS DISTINCT FROM 'd1a6661b9ea82cdbae0e22645536c349' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_select_provider'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('provider_confirm_request(text)'))) IS DISTINCT FROM '080ed91fe661175825cad942370cdce7' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_confirm_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('submit_service_report(text,uuid,text,text,text)'))) IS DISTINCT FROM '0541a7b2437e9375282f9d3a04150961' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: submit_service_report'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('admin_review_service_report(uuid,text,text)'))) IS DISTINCT FROM '518796d59faf41a6079e824ac62a084b' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_review_service_report'; END IF;
 IF EXISTS(SELECT 1 FROM public.verification_requests WHERE status='pending' GROUP BY user_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate pending history requires explicit reconciliation; no row is deleted.'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('v','m') AND (has_any_column_privilege('anon',c.oid,'SELECT') OR has_any_column_privilege('authenticated',c.oid,'SELECT')))
 THEN RAISE EXCEPTION 'New browser-readable view requires separate review.'; END IF;
END $preflight$;
CREATE SCHEMA igotu_backend_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA igotu_backend_private TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA igotu_backend_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE igotu_backend_private.installation(version text PRIMARY KEY,phase integer NOT NULL,project_ref text NOT NULL);
INSERT INTO igotu_backend_private.installation VALUES('20261026.1',1,current_setting('igotu.integration.project_ref'));
REVOKE ALL ON ALL TABLES IN SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;

-- No historical consent/approval backfill: old rows remain as recorded.
ALTER TABLE public.verification_requests ADD COLUMN age_confirmed boolean, ADD COLUMN privacy_consent boolean;
CREATE UNIQUE INDEX igotu_v6_one_pending ON public.verification_requests(user_id) WHERE status='pending';
CREATE INDEX igotu_v6_latest_verification ON public.verification_requests(user_id,submitted_at DESC,id DESC);
CREATE INDEX igotu_v6_identity_document_ref ON public.verification_requests(identity_document_path);
CREATE INDEX igotu_v6_support_document_ref ON public.verification_requests(supporting_document_path) WHERE supporting_document_path IS NOT NULL;
ALTER TABLE public.service_requests ADD COLUMN creation_key uuid, ADD COLUMN creation_fingerprint text;
CREATE UNIQUE INDEX igotu_v6_creation_key ON public.service_requests(client_id,creation_key);
ALTER TABLE public.notifications ADD COLUMN event_key text;
CREATE UNIQUE INDEX igotu_v6_notification_event ON public.notifications(event_key);
-- Existing payment(request_id), review(request_id,reviewer_id), skill/provider,
-- specialization and weekly-hours uniqueness is retained, not duplicated.

CREATE FUNCTION igotu_backend_private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text='admin' AND status::text='active'); $$;
CREATE FUNCTION igotu_backend_private.identity_approved(subject uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=subject AND u.role::text IN ('client','provider') AND u.status::text='active'
 AND u.identity_verified IS TRUE AND u.identity_verified_at IS NOT NULL AND EXISTS(
  SELECT 1 FROM (SELECT v.* FROM public.verification_requests v WHERE v.user_id=u.id ORDER BY v.submitted_at DESC,v.id DESC LIMIT 1) v
  WHERE v.status='approved' AND v.role=u.role::text AND v.reviewed_at IS NOT NULL AND v.reviewed_by IS NOT NULL AND v.reviewed_by=u.identity_verified_by)); $$;
CREATE FUNCTION igotu_backend_private.workspace(p_role text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status::text='active'
 AND (p_role IS NULL OR u.role::text=p_role) AND (u.role::text='admin' OR igotu_backend_private.identity_approved(u.id))); $$;
CREATE FUNCTION igotu_backend_private.require_workspace(p_role text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN IF NOT igotu_backend_private.workspace(p_role) THEN RAISE EXCEPTION 'Active account and Admin-reviewed identity required.' USING ERRCODE='42501'; END IF; RETURN auth.uid(); END $$;
CREATE FUNCTION igotu_backend_private.applicant() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('client','provider') AND status::text='active'); $$;
CREATE FUNCTION igotu_backend_private.provider_lock(subject uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN IF subject IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(subject::text,61026)); END IF; END $$;
CREATE FUNCTION igotu_backend_private.participant(p_request text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.workspace() AND (igotu_backend_private.is_admin() OR EXISTS(
 SELECT 1 FROM public.service_requests WHERE request_id=p_request AND (client_id=auth.uid() OR selected_provider_id=auth.uid()))); $$;
CREATE FUNCTION igotu_backend_private.coarse_area(lat numeric,lng numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT CASE WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 THEN 'Approximate grid: latitude '||(floor(lat*10)/10)::text||' to '||least(floor(lat*10)/10+0.1,90)::text||', longitude '||(floor(lng*10)/10)::text||' to '||least(floor(lng*10)/10+0.1,180)::text ELSE 'Area available after confirmation' END; $$;
CREATE FUNCTION igotu_backend_private.valid_specialization(category text,specialization text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM (VALUES ('Cleaning','Home Cleaning'),('Cleaning','Deep Cleaning'),('Cleaning','Move-in / Move-out Cleaning'),('Cleaning','Office Cleaning'),('Cleaning','Post-event Cleaning'),('Cleaning','General Cleaning'),('Delivery','Food Delivery'),('Delivery','Grocery Delivery'),('Delivery','Parcel Delivery'),('Delivery','Document Delivery'),('Delivery','General Delivery'),('Repair','Roofing'),('Repair','Plumbing'),('Repair','Electrical'),('Repair','Appliance Repair'),('Repair','Furniture Repair'),('Repair','General Repair'),('Moving Help','Furniture Moving'),('Moving Help','House Moving'),('Moving Help','Room Moving'),('Moving Help','Packing & Unpacking'),('Moving Help','Loading & Unloading'),('Moving Help','General Moving Help'),('Errands','Grocery Shopping'),('Errands','Queueing'),('Errands','Item Pickup'),('Errands','Document Collection'),('Errands','Personal Runner'),('Errands','General Errands'),('Tutoring','Mathematics'),('Tutoring','Science'),('Tutoring','English / MUET'),('Tutoring','ICT / Computer'),('Tutoring','General Tutoring'),('Other','Event Setup'),('Other','General Assistance'),('Other','Other Service')) v(category,specialization) WHERE v.category=$1 AND v.specialization=$2); $$;
CREATE FUNCTION igotu_backend_private.eligible_provider(subject uuid,service public.service_requests) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.identity_approved(subject)
 AND EXISTS(SELECT 1 FROM public.users WHERE id=subject AND role::text='provider')
 AND EXISTS(SELECT 1 FROM public.provider_profiles WHERE provider_id=subject AND is_available)
 AND EXISTS(SELECT 1 FROM public.provider_skills WHERE provider_id=subject AND category::text=service.category::text)
 AND EXISTS(SELECT 1 FROM public.provider_specializations WHERE provider_id=subject AND category=service.category::text AND specialization=service.service_type)
 AND NOT EXISTS(SELECT 1 FROM public.service_request_declines WHERE provider_id=subject AND request_id=service.request_id)
 AND (NOT EXISTS(SELECT 1 FROM public.provider_weekly_availability WHERE provider_id=subject) OR EXISTS(
 SELECT 1 FROM public.provider_weekly_availability WHERE provider_id=subject AND day_of_week=extract(dow FROM service.preferred_date)
 AND service.preferred_time>=start_time AND service.preferred_time<end_time))
 AND NOT EXISTS(SELECT 1 FROM public.service_requests WHERE selected_provider_id=subject AND request_id<>service.request_id
 AND status::text IN ('provider_selected','confirmed','in_progress') AND preferred_date=service.preferred_date AND preferred_time=service.preferred_time); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
-- Only own-account boolean predicates may be evaluated by browser RLS callers.
GRANT EXECUTE ON FUNCTION igotu_backend_private.is_admin(),igotu_backend_private.workspace(text),igotu_backend_private.applicant(),igotu_backend_private.participant(text) TO anon,authenticated;
COMMIT;
