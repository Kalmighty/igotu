-- REVIEW-ONLY, STAGING-ONLY DRAFT. NEVER EXECUTED BY THIS CHANGE.
-- Do not run historical Stage A/C/identity scripts with these replacements.
-- Read docs/backend-integration/rollout.md and obtain separate write approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,pg_catalog;
DO $gate$ BEGIN
 IF current_setting('server_version_num')::integer / 10000 <> 17 THEN RAISE EXCEPTION 'Reviewed PostgreSQL 17 baseline required; review other versions separately.'; END IF;
 IF current_user<>'postgres' OR current_setting('igotu.integration.staging_only',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.catalog_reviewed',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.private_schema_verified',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.writes_paused',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Authorized isolated staging, catalog review and effective API-schema privacy evidence required.'; END IF;
 IF EXISTS(SELECT 1 FROM regexp_split_to_table(coalesce(current_setting('pgrst.db_schemas',true),''),',') exposed(name)
 WHERE trim(both '"' FROM btrim(exposed.name))='igotu_backend_private') THEN
 RAISE EXCEPTION 'Private schema appears exposed. NULL/absent settings still require external proof.'; END IF;
END $gate$;
DO $cutover_gate$ BEGIN
 IF current_setting('igotu.integration.project_ref',true) IS NULL OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 OR NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE version='20261026.1'
 AND project_ref=current_setting('igotu.integration.project_ref',true)) THEN RAISE EXCEPTION 'Staging project attestation does not match this installation.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE version='20261026.1' AND phase=3)
 OR current_setting('igotu.integration.pre_cutover_reviewed',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.writes_paused',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.notifier_inventory_reviewed',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.legacy_receipts_reviewed',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Reviewed staged dependencies, drained writes, notifier inventory and historical receipt evidence required.'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_records p LEFT JOIN public.service_requests r ON r.request_id=p.request_id
 LEFT JOIN storage.objects o ON o.bucket_id='payment-proofs' AND o.name=igotu_backend_private.receipt_path(p.proof_path,p.proof_url)
 WHERE (nullif(p.proof_path,'') IS NOT NULL OR nullif(p.proof_url,'') IS NOT NULL) AND (p.payment_id IS NULL OR o.name IS NULL
 OR p.client_id IS DISTINCT FROM r.client_id OR p.provider_id IS DISTINCT FROM r.selected_provider_id
 OR split_part(o.name,'/',1) IS DISTINCT FROM p.client_id::text OR coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') IS DISTINCT FROM p.client_id::text))
 THEN RAISE EXCEPTION 'Historical receipt reference/owner mismatch. Explicit correction approval required; nothing backfilled.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='verification-documents' AND NOT public)
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='report-evidence' AND NOT public)
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='payment-proofs') THEN RAISE EXCEPTION 'Expected private evidence buckets/receipt bucket missing.'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.users'::regclass,'public.service_requests'::regclass,'public.internal_messages'::regclass,
 'public.payment_records'::regclass,'public.service_reviews'::regclass,'public.verification_requests'::regclass,'public.service_reports'::regclass)
 AND n.nspname<>'igotu_backend_private' AND p.prosrc~*'\mnotifications\M') THEN RAISE EXCEPTION 'Unexpected existing notifier: reconcile before activation.'; END IF;
END $cutover_gate$;
-- This transaction is a new reviewed lockdown, not an include of old Stage C.
-- Browser mutation grants are removed at both table and column level.
DO $grants$ DECLARE t text;cols text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','provider_profiles','provider_skills','provider_specializations','provider_weekly_availability','service_requests','notifications','internal_messages','payment_records','service_reviews','verification_requests','service_request_declines','service_reports','example_table'] LOOP
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,t);
 IF t<>'example_table' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); END IF;
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $grants$;
GRANT INSERT(id,message_id,request_id,sender_id,receiver_id,message_text,is_read,created_at) ON public.internal_messages TO authenticated;
GRANT UPDATE(is_read) ON public.internal_messages,public.notifications TO authenticated;
GRANT INSERT(request_id,client_id,provider_id,amount,payment_method,proof_path,proof_uploaded_at) ON public.payment_records TO authenticated;
GRANT INSERT(request_id,reviewer_id,reviewee_id,rating,feedback) ON public.service_reviews TO authenticated;
GRANT INSERT(user_id,role,legal_name,id_type,id_number_last4,identity_document_path,supporting_document_path,business_name,ssm_number,professional_license,status,age_confirmed,privacy_consent) ON public.verification_requests TO authenticated;

-- Replace only reviewed browser policies. Unknown custom-role policies remain
-- for review; restrictive browser boundaries below cannot be OR-bypassed.
DO $policies$ DECLARE p record; BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public'
 AND tablename=ANY(ARRAY['users','provider_profiles','provider_skills','provider_specializations','provider_weekly_availability','service_requests','notifications','internal_messages','payment_records','service_reviews','verification_requests','service_request_declines','service_reports'])
 AND roles <@ ARRAY['public','anon','authenticated']::name[] LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $policies$;
CREATE POLICY v6_users_read ON public.users FOR SELECT TO authenticated USING(id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_users_boundary ON public.users AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_services_read ON public.service_requests FOR SELECT TO authenticated USING(igotu_backend_private.is_admin() OR client_id=auth.uid());
CREATE POLICY v6_services_boundary ON public.service_requests AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(igotu_backend_private.is_admin() OR (igotu_backend_private.workspace('client') AND client_id=auth.uid()));
DO $profiles$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability'] LOOP
 EXECUTE format('CREATE POLICY v6_profile_read ON public.%I FOR SELECT TO authenticated USING(provider_id=auth.uid() OR igotu_backend_private.is_admin())',t);
 EXECUTE format('CREATE POLICY v6_profile_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(provider_id=auth.uid() OR igotu_backend_private.is_admin())',t);
 END LOOP;
END $profiles$;
CREATE POLICY v6_notifications_read ON public.notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY v6_notifications_update ON public.notifications FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY v6_notifications_boundary ON public.notifications AS RESTRICTIVE FOR ALL TO anon,authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY v6_messages_read ON public.internal_messages FOR SELECT TO authenticated USING(sender_id=auth.uid() OR receiver_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_messages_read_boundary ON public.internal_messages AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(sender_id=auth.uid() OR receiver_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_messages_send ON public.internal_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid());
CREATE POLICY v6_messages_update ON public.internal_messages FOR UPDATE TO authenticated USING(receiver_id=auth.uid()) WITH CHECK(receiver_id=auth.uid());
CREATE POLICY v6_messages_update_boundary ON public.internal_messages AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(receiver_id=auth.uid()) WITH CHECK(receiver_id=auth.uid());
CREATE POLICY v6_payments_read ON public.payment_records FOR SELECT TO authenticated USING(client_id=auth.uid() OR provider_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_payments_read_boundary ON public.payment_records AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(client_id=auth.uid() OR provider_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_payments_insert ON public.payment_records FOR INSERT TO authenticated WITH CHECK(client_id=auth.uid() AND igotu_backend_private.workspace('client'));
CREATE POLICY v6_reviews_read ON public.service_reviews FOR SELECT TO authenticated USING(reviewer_id=auth.uid() OR reviewee_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_reviews_boundary ON public.service_reviews AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(reviewer_id=auth.uid() OR reviewee_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_reviews_insert ON public.service_reviews FOR INSERT TO authenticated WITH CHECK(reviewer_id=auth.uid());
CREATE POLICY v6_verification_read ON public.verification_requests FOR SELECT TO authenticated USING(user_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_verification_boundary ON public.verification_requests AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(user_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_verification_insert ON public.verification_requests FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND igotu_backend_private.applicant() AND NOT igotu_backend_private.workspace());
CREATE POLICY v6_reports_read ON public.service_reports FOR SELECT TO authenticated USING(reporter_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_reports_boundary ON public.service_reports AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(reporter_id=auth.uid() OR igotu_backend_private.is_admin());
CREATE POLICY v6_declines_read ON public.service_request_declines FOR SELECT TO authenticated USING(provider_id=auth.uid() OR igotu_backend_private.participant(request_id));
CREATE POLICY v6_declines_boundary ON public.service_request_declines AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(provider_id=auth.uid() OR igotu_backend_private.participant(request_id));
DO $workspace_boundaries$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname NOT IN ('users','verification_requests') LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
 EXECUTE format('CREATE POLICY v6_workspace_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(%s) WITH CHECK(%s)',t.relname,CASE WHEN t.relname=ANY(ARRAY['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability']) THEN 'igotu_backend_private.approved_account()' ELSE 'igotu_backend_private.workspace()' END,CASE WHEN t.relname=ANY(ARRAY['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability']) THEN 'igotu_backend_private.approved_account()' ELSE 'igotu_backend_private.workspace()' END);
 END LOOP;
END $workspace_boundaries$;

CREATE FUNCTION igotu_backend_private.protect_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF NOT igotu_backend_private.is_admin() AND (NEW.id,NEW.role,NEW.status,NEW.user_code,NEW.identity_verified,NEW.identity_verified_at,NEW.identity_verified_by)
 IS DISTINCT FROM (OLD.id,OLD.role,OLD.status,OLD.user_code,OLD.identity_verified,OLD.identity_verified_at,OLD.identity_verified_by)
 THEN RAISE EXCEPTION 'Account authority is Admin-managed.' USING ERRCODE='42501'; END IF;
 IF NOT igotu_backend_private.approved_account() THEN RAISE EXCEPTION 'Active approval required for profile changes.' USING ERRCODE='42501'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER v6_user_authority BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.protect_user();
CREATE FUNCTION igotu_backend_private.sync_badge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE u public.users%rowtype; BEGIN
 SELECT * INTO u FROM public.users WHERE id=NEW.provider_id;
 NEW.is_verified:=igotu_backend_private.identity_approved(u.id);NEW.verified_at:=CASE WHEN NEW.is_verified THEN u.identity_verified_at END;NEW.verified_by:=CASE WHEN NEW.is_verified THEN u.identity_verified_by END;RETURN NEW;
END $$;
CREATE TRIGGER v6_provider_badge BEFORE INSERT OR UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.sync_badge();
CREATE FUNCTION igotu_backend_private.verification_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE u public.users%rowtype; BEGIN
 PERFORM igotu_backend_private.require_read_committed();
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification history is immutable.'; END IF;
 IF TG_OP='UPDATE' THEN
 IF NOT igotu_backend_private.is_admin() OR OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.reviewed_by IS DISTINCT FROM auth.uid() OR NEW.reviewed_at IS NULL
 OR (NEW.status='rejected' AND nullif(btrim(NEW.admin_note),'') IS NULL)
 OR (to_jsonb(NEW)-ARRAY['status','admin_note','reviewed_at','reviewed_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','admin_note','reviewed_at','reviewed_by'])
 THEN RAISE EXCEPTION 'Only an active Admin can decide a pending request.' USING ERRCODE='42501'; END IF; RETURN NEW; END IF;
 SELECT * INTO u FROM public.users WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT igotu_backend_private.applicant() OR igotu_backend_private.approved_account() OR NEW.user_id IS DISTINCT FROM u.id OR NEW.role IS DISTINCT FROM u.role::text
 OR NEW.status IS DISTINCT FROM 'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.admin_note IS NOT NULL
 OR NEW.age_confirmed IS DISTINCT FROM true OR NEW.privacy_consent IS DISTINCT FROM true
 OR length(btrim(NEW.legal_name))<2 OR NEW.id_type NOT IN ('mykad','passport') OR NEW.id_number_last4 !~ '^[A-Za-z0-9]{4}$'
 OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='verification-documents' AND o.name=NEW.identity_document_path AND split_part(o.name,'/',1)=u.id::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u.id::text)
 OR (NEW.supporting_document_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='verification-documents' AND o.name=NEW.supporting_document_path AND split_part(o.name,'/',1)=u.id::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=u.id::text))
 THEN RAISE EXCEPTION 'Invalid private identity submission.' USING ERRCODE='42501'; END IF;
 NEW.submitted_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER v6_verification_write BEFORE INSERT OR UPDATE OR DELETE ON public.verification_requests FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.verification_write();
CREATE FUNCTION igotu_backend_private.validate_workspace_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%rowtype; BEGIN
 IF auth.uid() IS NULL AND coalesce(current_setting('role',true),'none') NOT IN ('anon','authenticated') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_TABLE_NAME=ANY(ARRAY['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability']) THEN PERFORM igotu_backend_private.require_approved_writer();
 ELSE PERFORM igotu_backend_private.require_writer(); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME='internal_messages' AND TG_OP='INSERT' THEN
 SELECT * INTO r FROM public.service_requests WHERE request_id=NEW.request_id FOR SHARE;
 IF NEW.sender_id IS DISTINCT FROM auth.uid() OR nullif(btrim(NEW.message_text),'') IS NULL OR NOT FOUND OR r.status::text NOT IN ('provider_selected','confirmed','in_progress','completed')
 OR NOT((r.client_id=NEW.sender_id AND r.selected_provider_id=NEW.receiver_id) OR (r.selected_provider_id=NEW.sender_id AND r.client_id=NEW.receiver_id))
 THEN RAISE EXCEPTION 'Authorized service conversation required.' USING ERRCODE='42501'; END IF;NEW.is_read:=false;NEW.created_at:=now();
 ELSIF TG_TABLE_NAME='payment_records' AND TG_OP='INSERT' THEN
 SELECT * INTO r FROM public.service_requests WHERE request_id=NEW.request_id FOR SHARE;
 IF NOT igotu_backend_private.workspace('client') OR NEW.client_id IS DISTINCT FROM auth.uid() OR NOT FOUND OR r.client_id IS DISTINCT FROM NEW.client_id
 OR r.selected_provider_id IS DISTINCT FROM NEW.provider_id OR r.status::text<>'completed' OR NEW.proof_url IS NOT NULL
 OR NEW.amount<=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR NEW.payment_method::text NOT IN ('Cash','QR Transfer','Bank Transfer','Other')
 OR (NEW.payment_method::text IN ('QR Transfer','Bank Transfer') AND NEW.proof_path IS NULL)
 OR (NEW.proof_path IS NOT NULL AND (igotu_backend_private.receipt_path(NEW.proof_path,NULL) IS DISTINCT FROM NEW.proof_path OR NOT EXISTS(
 SELECT 1 FROM storage.objects o WHERE o.bucket_id='payment-proofs' AND o.name=NEW.proof_path AND split_part(o.name,'/',1)=auth.uid()::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)))
 THEN RAISE EXCEPTION 'Valid completed-service offline payment and owned proof required.' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='service_reviews' AND TG_OP='INSERT' THEN
 SELECT * INTO r FROM public.service_requests WHERE request_id=NEW.request_id FOR SHARE;
 IF NOT FOUND OR NEW.reviewer_id IS DISTINCT FROM auth.uid() OR r.status::text<>'completed'
 OR NOT((r.client_id=NEW.reviewer_id AND r.selected_provider_id=NEW.reviewee_id) OR (r.selected_provider_id=NEW.reviewer_id AND r.client_id=NEW.reviewee_id))
 THEN RAISE EXCEPTION 'Completed service and correct review participant required.' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
DO $write_triggers$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relispartition AND c.relname NOT IN ('users','verification_requests','notifications') LOOP
 EXECUTE format('CREATE TRIGGER v6_workspace_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.validate_workspace_write()',t.relname);
 END LOOP;
END $write_triggers$;

-- One server-owned, transactional notification per source event. No note,
-- evidence path, ID number, signed/public document URL or arbitrary recipient.
CREATE FUNCTION igotu_backend_private.emit(event text,subject uuid,title text,message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.users WHERE id=subject AND role::text IN ('client','provider')) THEN
 INSERT INTO public.notifications(event_key,user_id,title,message,is_read) VALUES(event,subject,title,message,false) ON CONFLICT(event_key) DO NOTHING;
 END IF;
END $$;
CREATE FUNCTION igotu_backend_private.notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event text;recipient uuid;title text;message text; BEGIN
 IF TG_TABLE_NAME='notifications' THEN RETURN NEW; END IF;
 event:=TG_TABLE_NAME||':'||(to_jsonb(NEW)->>'id');
 CASE TG_TABLE_NAME
 WHEN 'service_requests' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.selected_provider_id IS NOT DISTINCT FROM OLD.selected_provider_id THEN RETURN NEW; END IF;
  event:=event||':'||NEW.status::text||':'||coalesce(NEW.selected_provider_id,OLD.selected_provider_id)::text;
  recipient:=CASE WHEN NEW.status::text IN ('confirmed','in_progress','pending') THEN NEW.client_id ELSE coalesce(NEW.selected_provider_id,OLD.selected_provider_id) END;
  title:=CASE NEW.status::text WHEN 'provider_selected' THEN 'New service request' WHEN 'confirmed' THEN 'Service confirmed' WHEN 'in_progress' THEN 'Service started' WHEN 'completed' THEN 'Service completed' WHEN 'pending' THEN 'Provider declined' WHEN 'cancelled' THEN 'Request cancelled' ELSE 'Service updated' END;
  message:='Service '||NEW.request_id||' has been updated. Open the service to continue.';
 WHEN 'internal_messages' THEN recipient:=NEW.receiver_id;title:='New message';message:='You received a message about service '||NEW.request_id||'.';
 WHEN 'payment_records' THEN recipient:=NEW.provider_id;title:='Payment recorded';message:='An offline payment was recorded for service '||NEW.request_id||'.';
 WHEN 'service_reviews' THEN recipient:=NEW.reviewee_id;title:='New review received';message:='A review was submitted for service '||NEW.request_id||'.';
 WHEN 'verification_requests' THEN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  event:=event||':'||NEW.status;recipient:=NEW.user_id;
  title:=CASE NEW.status WHEN 'pending' THEN 'Verification submitted' WHEN 'approved' THEN 'Identity verified' ELSE 'Verification rejected' END;
  message:=CASE NEW.status WHEN 'pending' THEN 'Your identity submission was received for Admin review.' WHEN 'approved' THEN 'Your identity verification is approved. Continue to profile setup or your workspace.' ELSE 'Your identity needs correction. Open Identity Verification to read the note and resubmit.' END;
 WHEN 'users' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  event:=event||':'||txid_current()::text||':'||NEW.status::text;recipient:=NEW.id;title:='Account status changed';message:='Your account status changed. Log in to check account access.';
 WHEN 'service_reports' THEN
  IF NEW.status NOT IN ('resolved','dismissed') OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  event:=event||':'||NEW.status;recipient:=NEW.reporter_id;title:='Report reviewed';message:='Your service report has been reviewed. Open the report outcome for details.';
 ELSE RETURN NEW;
 END CASE;
 IF event IS NOT NULL AND recipient IS NOT NULL THEN PERFORM igotu_backend_private.emit(event,recipient,title,message); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v6_notify_service AFTER UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_message AFTER INSERT ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_payment AFTER INSERT ON public.payment_records FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_review AFTER INSERT ON public.service_reviews FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_verification AFTER INSERT OR UPDATE ON public.verification_requests FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_status AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();
CREATE TRIGGER v6_notify_report AFTER UPDATE ON public.service_reports FOR EACH ROW EXECUTE FUNCTION igotu_backend_private.notify();

-- Serialize orphan cleanup against submission using the same owner row lock.
-- VOLATILE is deliberate: re-check references with a fresh snapshot after wait.
CREATE FUNCTION igotu_backend_private.orphan_identity(name text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_read_committed();
 PERFORM 1 FROM public.users WHERE id=auth.uid() FOR UPDATE;
 RETURN igotu_backend_private.applicant() AND split_part(name,'/',1)=auth.uid()::text
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='verification-documents' AND o.name=$1 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)
 AND NOT EXISTS(SELECT 1 FROM public.verification_requests WHERE identity_document_path=$1 OR supporting_document_path=$1); END $$;
CREATE FUNCTION igotu_backend_private.orphan_report_evidence(name text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_read_committed();
 PERFORM 1 FROM public.users WHERE id=auth.uid() FOR UPDATE;
 RETURN igotu_backend_private.workspace() AND split_part(name,'/',1)=auth.uid()::text
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='report-evidence' AND o.name=$1 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)
 AND NOT EXISTS(SELECT 1 FROM public.service_reports WHERE evidence_path=$1); END $$;
UPDATE storage.buckets SET public=false WHERE id='payment-proofs';
UPDATE storage.buckets SET file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','application/pdf'] WHERE id='verification-documents';
CREATE POLICY v6_storage_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(
 CASE bucket_id WHEN 'payment-proofs' THEN igotu_backend_private.can_read_receipt(name)
 WHEN 'report-evidence' THEN igotu_backend_private.is_admin() OR (igotu_backend_private.workspace() AND split_part(name,'/',1)=auth.uid()::text)
 WHEN 'verification-documents' THEN igotu_backend_private.is_admin() OR (igotu_backend_private.applicant() AND split_part(name,'/',1)=auth.uid()::text)
 ELSE igotu_backend_private.workspace() END);
CREATE POLICY v6_storage_upload_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(
 CASE bucket_id WHEN 'payment-proofs' THEN igotu_backend_private.workspace('client') AND split_part(name,'/',1)=auth.uid()::text
 WHEN 'report-evidence' THEN igotu_backend_private.workspace() AND split_part(name,'/',1)=auth.uid()::text
 WHEN 'verification-documents' THEN igotu_backend_private.applicant() AND NOT igotu_backend_private.approved_account() AND split_part(name,'/',1)=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.verification_requests WHERE user_id=auth.uid() AND status='pending')
 ELSE igotu_backend_private.workspace() END);
CREATE POLICY v6_storage_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id NOT IN ('payment-proofs','verification-documents','report-evidence') AND igotu_backend_private.workspace()) WITH CHECK(bucket_id NOT IN ('payment-proofs','verification-documents','report-evidence') AND igotu_backend_private.workspace());
CREATE POLICY v6_storage_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(
 CASE bucket_id WHEN 'payment-proofs' THEN false WHEN 'verification-documents' THEN igotu_backend_private.orphan_identity(name) WHEN 'report-evidence' THEN igotu_backend_private.orphan_report_evidence(name) ELSE igotu_backend_private.workspace() END);
-- Positive verification/receipt policies do not depend on users/raw request RLS.
CREATE POLICY v6_private_file_read ON storage.objects FOR SELECT TO authenticated USING(
 (bucket_id='payment-proofs' AND igotu_backend_private.can_read_receipt(name)) OR (bucket_id='verification-documents' AND (igotu_backend_private.is_admin() OR (igotu_backend_private.applicant() AND split_part(name,'/',1)=auth.uid()::text))));
CREATE POLICY v6_private_file_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 (bucket_id='payment-proofs' AND igotu_backend_private.workspace('client') AND split_part(name,'/',1)=auth.uid()::text) OR (bucket_id='verification-documents' AND igotu_backend_private.applicant() AND NOT igotu_backend_private.approved_account() AND split_part(name,'/',1)=auth.uid()::text));
CREATE POLICY v6_orphan_file_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='verification-documents' AND igotu_backend_private.orphan_identity(name));

-- Preserve ID formatting while removing direct browser access to sequence helpers.
-- Reviewed ID triggers use fixed prefixes/sequences and become trusted executors.
DO $id_triggers$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['assign_user_code','assign_service_request_id','assign_skill_code','assign_payment_id','assign_review_id','assign_message_id','assign_notification_id'] LOOP
 EXECUTE format('ALTER FUNCTION public.%I() SECURITY DEFINER',f);
 EXECUTE format('ALTER FUNCTION public.%I() SET search_path=public,pg_temp',f);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC,anon,authenticated,service_role',f);
 END LOOP;
END $id_triggers$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.format_custom_id(text,text),public.handle_new_auth_user(),public.set_updated_at() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.format_custom_id(text,text) SET search_path=pg_catalog,public,pg_temp;
-- Compatibility exception: safe own-role helper is still referenced by retained
-- Storage policies. It returns NULL without auth.uid(); no arbitrary subject.
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon,authenticated;
CREATE FUNCTION igotu_backend_private.contract() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_read_committed();
 IF NOT igotu_backend_private.applicant() AND NOT igotu_backend_private.is_admin() THEN RAISE EXCEPTION 'Active account required.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE version='20261026.1' AND phase=4) THEN RAISE EXCEPTION 'Integration contract is unavailable.'; END IF;
 RETURN jsonb_build_object('version','20261026.1','notifications','database');
END $$;
CREATE FUNCTION public.igotu_backend_contract() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.contract(); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION igotu_backend_private.is_admin(),igotu_backend_private.approved_account(text),igotu_backend_private.workspace(text),igotu_backend_private.applicant(),igotu_backend_private.participant(text),igotu_backend_private.can_read_receipt(text),igotu_backend_private.orphan_identity(text),igotu_backend_private.orphan_report_evidence(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION igotu_backend_private.provider_service_requests(text,text[]),igotu_backend_private.service_participants(text[]),igotu_backend_private.recommended_provider_candidates(text),igotu_backend_private.payment_proof_reference(text),igotu_backend_private.verification_reconciliation_queue(uuid),igotu_backend_private.create_service_request(uuid,jsonb),igotu_backend_private.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text),igotu_backend_private.client_select_provider(text,uuid),igotu_backend_private.provider_confirm_request(text),igotu_backend_private.provider_decline_request(text,text),igotu_backend_private.provider_start_request(text),igotu_backend_private.client_complete_request(text),igotu_backend_private.client_cancel_request(text,text),igotu_backend_private.contract() TO authenticated;
REVOKE ALL ON FUNCTION public.igotu_backend_contract() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.igotu_backend_contract() TO authenticated;
-- Fail closed on any unknown effective public definer API or leaked private
-- mutation helper. Views/exposed schemas/service-role writers need external audit.
DO $final_acl$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'pg_catalog.trigger'::regtype
 AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')) LOOP
 IF NOT (f.signature::oid = ANY(array_remove(ARRAY[to_regprocedure('public.current_user_role()')::oid,to_regprocedure('public.complete_basic_profile(text,text)')::oid,to_regprocedure('public.client_update_request(text,text,text,text,text,date,time without time zone,text,numeric,numeric,numeric,text)')::oid,to_regprocedure('public.client_save_request_image(text,text,text)')::oid,to_regprocedure('public.submit_service_report(text,uuid,text,text,text)')::oid,to_regprocedure('public.admin_update_user_status(uuid,text)')::oid,to_regprocedure('public.admin_review_verification(uuid,text,text)')::oid,to_regprocedure('public.admin_review_service_report(uuid,text,text)')::oid],NULL))) THEN RAISE EXCEPTION 'Unknown callable public definer %',f.signature; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','igotu_backend_private.emit(text,uuid,text,text)','EXECUTE') OR has_function_privilege('anon','igotu_backend_private.emit(text,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','igotu_backend_private.transition(text,text,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Private mutation helpers must not be browser-callable.'; END IF;
END $final_acl$;
-- Effective privileges include PUBLIC and inherited/default ACLs. If unexpected
-- grants survive direct REVOKEs, abort; never silently strip unknown role grants.
DO $effective_acl$ DECLARE t record;a record;browser text;privilege text;allowed boolean; BEGIN
 FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_schema_privilege(browser::name,'public','CREATE') OR has_schema_privilege(browser::name,'igotu_backend_private','CREATE') THEN RAISE EXCEPTION 'Browser schema creation privilege survives.'; END IF;
  IF has_any_column_privilege(browser::name,'igotu_backend_private.installation','SELECT') OR has_any_column_privilege(browser::name,'igotu_backend_private.installation','INSERT')
  OR has_any_column_privilege(browser::name,'igotu_backend_private.installation','UPDATE') OR has_table_privilege(browser::name,'igotu_backend_private.installation','DELETE')
  THEN RAISE EXCEPTION 'Private installation privileges survive.'; END IF;
  FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
   FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] LOOP
    IF has_table_privilege(browser::name,t.oid,privilege) THEN RAISE EXCEPTION 'Unexpected effective table privilege % on % for %',privilege,t.relname,browser; END IF;
   END LOOP;
   FOR a IN SELECT attnum,attname FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
     allowed:=false;
     IF browser='authenticated' THEN
      allowed:=CASE privilege
      WHEN 'SELECT' THEN t.relname=ANY(ARRAY['users','provider_profiles','provider_skills','provider_specializations','provider_weekly_availability','service_requests','notifications','internal_messages','payment_records','service_reviews','verification_requests','service_request_declines','service_reports'])
      WHEN 'UPDATE' THEN t.relname=ANY(ARRAY['internal_messages','notifications']) AND a.attname='is_read'
      WHEN 'INSERT' THEN
       (t.relname='internal_messages' AND a.attname=ANY(ARRAY['id','message_id','request_id','sender_id','receiver_id','message_text','is_read','created_at'])) OR
       (t.relname='payment_records' AND a.attname=ANY(ARRAY['request_id','client_id','provider_id','amount','payment_method','proof_path','proof_uploaded_at'])) OR
       (t.relname='service_reviews' AND a.attname=ANY(ARRAY['request_id','reviewer_id','reviewee_id','rating','feedback'])) OR
       (t.relname='verification_requests' AND a.attname=ANY(ARRAY['user_id','role','legal_name','id_type','id_number_last4','identity_document_path','supporting_document_path','business_name','ssm_number','professional_license','status','age_confirmed','privacy_consent']))
      ELSE false END;
     END IF;
     IF has_column_privilege(browser::name,t.oid,a.attnum,privilege) AND NOT allowed THEN
      RAISE EXCEPTION 'Unexpected effective column privilege % on %.% for %',privilege,t.relname,a.attname,browser; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
  FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' LOOP
   IF has_sequence_privilege(browser::name,t.oid,'USAGE') OR has_sequence_privilege(browser::name,t.oid,'SELECT') OR has_sequence_privilege(browser::name,t.oid,'UPDATE') THEN RAISE EXCEPTION 'Inherited sequence access survives: %',t.relname; END IF;
  END LOOP;
  FOR t IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
   allowed:=CASE WHEN browser='anon' THEN t.oid=to_regprocedure('public.current_user_role()')::oid ELSE t.oid=ANY(ARRAY[to_regprocedure('public.provider_service_requests(text,text[])')::oid,to_regprocedure('public.service_participants(text[])')::oid,to_regprocedure('public.recommended_provider_candidates(text)')::oid,to_regprocedure('public.payment_proof_reference(text)')::oid,to_regprocedure('public.verification_reconciliation_queue(uuid)')::oid,to_regprocedure('public.create_service_request(uuid,jsonb)')::oid,to_regprocedure('public.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text)')::oid,to_regprocedure('public.client_select_provider(text,uuid)')::oid,to_regprocedure('public.provider_confirm_request(text)')::oid,to_regprocedure('public.provider_decline_request(text,text)')::oid,to_regprocedure('public.provider_start_request(text)')::oid,to_regprocedure('public.client_complete_request(text)')::oid,to_regprocedure('public.client_cancel_request(text,text)')::oid,to_regprocedure('public.complete_basic_profile(text,text)')::oid,to_regprocedure('public.client_update_request(text,text,text,text,text,date,time,text,numeric,numeric,numeric,text)')::oid,to_regprocedure('public.client_save_request_image(text,text,text)')::oid,to_regprocedure('public.submit_service_report(text,uuid,text,text,text)')::oid,to_regprocedure('public.admin_update_user_status(uuid,text)')::oid,to_regprocedure('public.admin_review_verification(uuid,text,text)')::oid,to_regprocedure('public.admin_review_service_report(uuid,text,text)')::oid,to_regprocedure('public.igotu_backend_contract()')::oid,to_regprocedure('public.current_user_role()')::oid]) END;
   IF has_function_privilege(browser::name,t.oid,'EXECUTE') AND NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Unexpected effective public routine access: % for %',t.signature,browser; END IF;
   IF t.proowner<>'postgres'::regrole THEN RAISE EXCEPTION 'Public routine owner drift: %',t.signature; END IF;
  END LOOP;
  FOR t IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='igotu_backend_private' LOOP
   allowed:=t.oid=ANY(CASE WHEN browser='anon' THEN ARRAY[to_regprocedure('igotu_backend_private.is_admin()')::oid,to_regprocedure('igotu_backend_private.workspace(text)')::oid,to_regprocedure('igotu_backend_private.approved_account(text)')::oid,to_regprocedure('igotu_backend_private.applicant()')::oid,to_regprocedure('igotu_backend_private.participant(text)')::oid,to_regprocedure('igotu_backend_private.can_read_receipt(text)')::oid,to_regprocedure('igotu_backend_private.orphan_identity(text)')::oid,to_regprocedure('igotu_backend_private.orphan_report_evidence(text)')::oid] ELSE ARRAY[to_regprocedure('igotu_backend_private.is_admin()')::oid,to_regprocedure('igotu_backend_private.workspace(text)')::oid,to_regprocedure('igotu_backend_private.approved_account(text)')::oid,to_regprocedure('igotu_backend_private.applicant()')::oid,to_regprocedure('igotu_backend_private.participant(text)')::oid,to_regprocedure('igotu_backend_private.can_read_receipt(text)')::oid,to_regprocedure('igotu_backend_private.orphan_identity(text)')::oid,to_regprocedure('igotu_backend_private.orphan_report_evidence(text)')::oid,to_regprocedure('igotu_backend_private.provider_service_requests(text,text[])')::oid,to_regprocedure('igotu_backend_private.service_participants(text[])')::oid,to_regprocedure('igotu_backend_private.recommended_provider_candidates(text)')::oid,to_regprocedure('igotu_backend_private.payment_proof_reference(text)')::oid,to_regprocedure('igotu_backend_private.verification_reconciliation_queue(uuid)')::oid,to_regprocedure('igotu_backend_private.create_service_request(uuid,jsonb)')::oid,to_regprocedure('igotu_backend_private.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text)')::oid,to_regprocedure('igotu_backend_private.client_select_provider(text,uuid)')::oid,to_regprocedure('igotu_backend_private.provider_confirm_request(text)')::oid,to_regprocedure('igotu_backend_private.provider_decline_request(text,text)')::oid,to_regprocedure('igotu_backend_private.provider_start_request(text)')::oid,to_regprocedure('igotu_backend_private.client_complete_request(text)')::oid,to_regprocedure('igotu_backend_private.client_cancel_request(text,text)')::oid,to_regprocedure('igotu_backend_private.contract()')::oid] END);
   IF has_function_privilege(browser::name,t.oid,'EXECUTE') AND NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Inherited private routine access survives: % for %',t.signature,browser; END IF;
   IF t.proowner<>'postgres'::regrole THEN RAISE EXCEPTION 'Private routine owner drift: %',t.signature; END IF;
  END LOOP;
 END LOOP;
END $effective_acl$;
UPDATE igotu_backend_private.installation SET phase=4 WHERE version='20261026.1';
NOTIFY pgrst,'reload schema';
COMMIT;
