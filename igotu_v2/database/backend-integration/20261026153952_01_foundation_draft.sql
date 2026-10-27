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
DO $preflight$ DECLARE expected record; BEGIN
 IF current_setting('igotu.integration.project_ref',true) IS NULL
 OR current_setting('igotu.integration.project_ref',true) !~ '^[a-z]{20}$'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 THEN RAISE EXCEPTION 'Explicit isolated staging project reference required; production is excluded.'; END IF;
 IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'Browser roles must not create public objects or bypass RLS.'; END IF;
 -- RLS must not be bypassed through ownership or role membership (including
 -- NOINHERIT memberships that permit SET ROLE outside this API).
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolname='authenticator')
 AND (pg_has_role('anon',r.oid,'MEMBER') OR pg_has_role('authenticated',r.oid,'MEMBER')))
 OR EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname IN ('public','storage') AND t.relkind IN ('r','p','S')
 AND (pg_has_role('anon',t.relowner,'MEMBER') OR pg_has_role('authenticated',t.relowner,'MEMBER')))
 THEN RAISE EXCEPTION 'Browser membership/ownership can bypass the intended grants or RLS.'; END IF;
 -- Verify the trusted definer execution context; never grant BYPASSRLS here.
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls))
 AND EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE ((n.nspname='public' AND t.relkind IN ('r','p')) OR t.oid=to_regclass('storage.objects'))
 AND (t.relforcerowsecurity OR NOT pg_has_role('postgres',t.relowner,'USAGE')))
 THEN RAISE EXCEPTION 'Trusted definer context cannot safely read required RLS tables; review owner/recursion design.'; END IF;
 IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')),false)
 THEN RAISE EXCEPTION 'Storage RLS is required.'; END IF;
 IF (SELECT atttypid FROM pg_attribute WHERE attrelid=to_regclass('public.users') AND attname='status' AND NOT attisdropped)
 IS DISTINCT FROM to_regtype('public.account_status')::oid THEN RAISE EXCEPTION 'Expected users.status account_status enum.'; END IF;
 FOR expected IN SELECT * FROM (VALUES ('payment_records','id','uuid',true,'gen_random_uuid()'),
 ('payment_records','payment_id','text',false,NULL),
 ('payment_records','request_id','text',true,NULL),
 ('payment_records','client_id','uuid',true,NULL),
 ('payment_records','provider_id','uuid',true,NULL),
 ('payment_records','amount','numeric(10,2)',true,NULL),
 ('payment_records','payment_method','payment_method',true,NULL),
 ('payment_records','reference_number','text',false,NULL),
 ('payment_records','created_at','timestamp with time zone',true,'now()'),
 ('payment_records','proof_url','text',false,NULL),
 ('payment_records','proof_path','text',false,NULL),
 ('payment_records','proof_uploaded_at','timestamp with time zone',false,NULL),
 ('notifications','id','uuid',true,'gen_random_uuid()'),
 ('notifications','notification_id','text',false,NULL),
 ('notifications','user_id','uuid',true,NULL),
 ('notifications','title','text',true,NULL),
 ('notifications','message','text',true,NULL),
 ('notifications','link_url','text',false,NULL),
 ('notifications','is_read','boolean',true,'false'),
 ('notifications','created_at','timestamp with time zone',true,'now()'),
 ('service_requests','id','uuid',true,'gen_random_uuid()'),
 ('service_requests','request_id','text',false,NULL),
 ('service_requests','client_id','uuid',true,NULL),
 ('service_requests','selected_provider_id','uuid',false,NULL),
 ('service_requests','title','text',true,NULL),
 ('service_requests','category','service_category',true,NULL),
 ('service_requests','description','text',true,NULL),
 ('service_requests','preferred_date','date',true,NULL),
 ('service_requests','preferred_time','time without time zone',true,NULL),
 ('service_requests','location','text',true,NULL),
 ('service_requests','client_lat','numeric(10,7)',false,NULL),
 ('service_requests','client_lng','numeric(10,7)',false,NULL),
 ('service_requests','budget','numeric(10,2)',false,NULL),
 ('service_requests','priority','request_priority',true,'''normal''::request_priority'),
 ('service_requests','status','request_status',true,'''pending''::request_status'),
 ('service_requests','created_at','timestamp with time zone',true,'now()'),
 ('service_requests','updated_at','timestamp with time zone',true,'now()'),
 ('service_requests','request_image_url','text',false,NULL),
 ('service_requests','request_image_path','text',false,NULL),
 ('service_requests','request_image_uploaded_at','timestamp with time zone',false,NULL),
 ('service_requests','service_type','text',false,NULL),
 ('service_requests','cancelled_by','uuid',false,NULL),
 ('service_requests','cancellation_reason','text',false,NULL),
 ('service_requests','cancelled_at','timestamp with time zone',false,NULL),
 ('internal_messages','id','uuid',true,'gen_random_uuid()'),
 ('internal_messages','message_id','text',false,NULL),
 ('internal_messages','request_id','text',true,NULL),
 ('internal_messages','sender_id','uuid',true,NULL),
 ('internal_messages','receiver_id','uuid',true,NULL),
 ('internal_messages','message_text','text',true,NULL),
 ('internal_messages','is_read','boolean',true,'false'),
 ('internal_messages','created_at','timestamp with time zone',true,'now()'),
 ('service_reviews','id','uuid',true,'gen_random_uuid()'),
 ('service_reviews','review_id','text',false,NULL),
 ('service_reviews','request_id','text',true,NULL),
 ('service_reviews','reviewer_id','uuid',true,NULL),
 ('service_reviews','reviewee_id','uuid',true,NULL),
 ('service_reviews','rating','integer',true,NULL),
 ('service_reviews','feedback','text',false,NULL),
 ('service_reviews','created_at','timestamp with time zone',true,'now()'),
 ('provider_skills','id','uuid',true,'gen_random_uuid()'),
 ('provider_skills','skill_code','text',false,NULL),
 ('provider_skills','provider_id','uuid',true,NULL),
 ('provider_skills','category','service_category',true,NULL),
 ('provider_skills','created_at','timestamp with time zone',true,'now()'),
 ('provider_profiles','provider_id','uuid',true,NULL),
 ('provider_profiles','bio','text',false,NULL),
 ('provider_profiles','location','text',false,NULL),
 ('provider_profiles','provider_lat','numeric(10,7)',false,NULL),
 ('provider_profiles','provider_lng','numeric(10,7)',false,NULL),
 ('provider_profiles','is_available','boolean',true,'true'),
 ('provider_profiles','created_at','timestamp with time zone',true,'now()'),
 ('provider_profiles','updated_at','timestamp with time zone',true,'now()'),
 ('provider_profiles','is_verified','boolean',true,'false'),
 ('provider_profiles','verified_at','timestamp with time zone',false,NULL),
 ('provider_profiles','verified_by','uuid',false,NULL),
 ('users','id','uuid',true,NULL),
 ('users','user_code','text',false,NULL),
 ('users','full_name','text',true,NULL),
 ('users','email','text',true,NULL),
 ('users','role','user_role',true,'''client''::user_role'),
 ('users','status','account_status',true,'''active''::account_status'),
 ('users','created_at','timestamp with time zone',true,'now()'),
 ('users','updated_at','timestamp with time zone',true,'now()'),
 ('users','phone','text',false,NULL),
 ('users','profile_completed','boolean',true,'false'),
 ('users','identity_verified','boolean',true,'false'),
 ('users','identity_verified_at','timestamp with time zone',false,NULL),
 ('users','identity_verified_by','uuid',false,NULL),
 ('provider_weekly_availability','provider_id','uuid',true,NULL),
 ('provider_weekly_availability','day_of_week','smallint',true,NULL),
 ('provider_weekly_availability','start_time','time without time zone',true,NULL),
 ('provider_weekly_availability','end_time','time without time zone',true,NULL),
 ('provider_specializations','id','uuid',true,'gen_random_uuid()'),
 ('provider_specializations','provider_id','uuid',true,NULL),
 ('provider_specializations','category','text',true,NULL),
 ('provider_specializations','specialization','text',true,NULL),
 ('provider_specializations','created_at','timestamp with time zone',true,'now()'),
 ('verification_requests','id','uuid',true,'gen_random_uuid()'),
 ('verification_requests','user_id','uuid',true,NULL),
 ('verification_requests','role','text',true,NULL),
 ('verification_requests','legal_name','text',true,NULL),
 ('verification_requests','id_type','text',true,NULL),
 ('verification_requests','id_number_last4','text',true,NULL),
 ('verification_requests','identity_document_path','text',true,NULL),
 ('verification_requests','supporting_document_path','text',false,NULL),
 ('verification_requests','business_name','text',false,NULL),
 ('verification_requests','ssm_number','text',false,NULL),
 ('verification_requests','professional_license','text',false,NULL),
 ('verification_requests','status','text',true,'''pending''::text'),
 ('verification_requests','admin_note','text',false,NULL),
 ('verification_requests','submitted_at','timestamp with time zone',true,'now()'),
 ('verification_requests','reviewed_at','timestamp with time zone',false,NULL),
 ('verification_requests','reviewed_by','uuid',false,NULL),
 ('example_table','id','uuid',true,'gen_random_uuid()'),
 ('service_request_declines','id','uuid',true,'gen_random_uuid()'),
 ('service_request_declines','request_id','text',true,NULL),
 ('service_request_declines','provider_id','uuid',true,NULL),
 ('service_request_declines','reason','text',true,NULL),
 ('service_request_declines','created_at','timestamp with time zone',true,'now()'),
 ('service_reports','id','uuid',true,'gen_random_uuid()'),
 ('service_reports','request_id','text',true,NULL),
 ('service_reports','reporter_id','uuid',true,NULL),
 ('service_reports','reported_user_id','uuid',true,NULL),
 ('service_reports','reason','text',true,NULL),
 ('service_reports','description','text',true,NULL),
 ('service_reports','evidence_path','text',false,NULL),
 ('service_reports','status','text',true,'''pending''::text'),
 ('service_reports','admin_note','text',false,NULL),
 ('service_reports','created_at','timestamp with time zone',true,'now()'),
 ('service_reports','reviewed_at','timestamp with time zone',false,NULL),
 ('service_reports','reviewed_by','uuid',false,NULL)) e(table_name,column_name,type_name,required,default_expr) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||expected.table_name)
 AND a.attname=expected.column_name AND a.attnum>0 AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=expected.type_name AND a.attnotnull=expected.required
 AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum) IS NOT DISTINCT FROM expected.default_expr)
 THEN RAISE EXCEPTION 'Baseline column/type drift: %.%',expected.table_name,expected.column_name; END IF;
 END LOOP;
 FOR expected IN SELECT * FROM (VALUES ('users','users_pkey','PRIMARY KEY (id)'),
 ('users','users_user_code_key','UNIQUE (user_code)'),
 ('users','users_email_key','UNIQUE (email)'),
 ('users','users_id_fkey','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
 ('provider_profiles','provider_profiles_pkey','PRIMARY KEY (provider_id)'),
 ('provider_profiles','provider_profiles_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('provider_skills','provider_skills_pkey','PRIMARY KEY (id)'),
 ('provider_skills','provider_skills_skill_code_key','UNIQUE (skill_code)'),
 ('provider_skills','provider_skills_provider_id_category_key','UNIQUE (provider_id, category)'),
 ('provider_skills','provider_skills_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_requests','service_requests_pkey','PRIMARY KEY (id)'),
 ('service_requests','service_requests_request_id_key','UNIQUE (request_id)'),
 ('service_requests','service_requests_client_id_fkey','FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_requests','service_requests_selected_provider_id_fkey','FOREIGN KEY (selected_provider_id) REFERENCES users(id) ON DELETE SET NULL'),
 ('payment_records','payment_records_amount_check','CHECK ((amount > (0)::numeric))'),
 ('payment_records','payment_records_pkey','PRIMARY KEY (id)'),
 ('payment_records','payment_records_payment_id_key','UNIQUE (payment_id)'),
 ('payment_records','payment_records_request_id_key','UNIQUE (request_id)'),
 ('payment_records','payment_records_request_id_fkey','FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE'),
 ('payment_records','payment_records_client_id_fkey','FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('payment_records','payment_records_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_reports','service_reports_pkey','PRIMARY KEY (id)'),
 ('service_reviews','service_reviews_rating_check','CHECK (((rating >= 1) AND (rating <= 5)))'),
 ('service_reviews','service_reviews_pkey','PRIMARY KEY (id)'),
 ('service_reviews','service_reviews_review_id_key','UNIQUE (review_id)'),
 ('service_reviews','service_reviews_request_id_reviewer_id_key','UNIQUE (request_id, reviewer_id)'),
 ('service_reviews','service_reviews_request_id_fkey','FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE'),
 ('service_reviews','service_reviews_reviewer_id_fkey','FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_reviews','service_reviews_reviewee_id_fkey','FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('internal_messages','internal_messages_pkey','PRIMARY KEY (id)'),
 ('internal_messages','internal_messages_message_id_key','UNIQUE (message_id)'),
 ('internal_messages','internal_messages_request_id_fkey','FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE'),
 ('internal_messages','internal_messages_sender_id_fkey','FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('internal_messages','internal_messages_receiver_id_fkey','FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('notifications','notifications_pkey','PRIMARY KEY (id)'),
 ('notifications','notifications_notification_id_key','UNIQUE (notification_id)'),
 ('notifications','notifications_user_id_fkey','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('provider_profiles','provider_profiles_verified_by_fkey','FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL'),
 ('provider_specializations','provider_specializations_pkey','PRIMARY KEY (id)'),
 ('provider_specializations','provider_specializations_unique','UNIQUE (provider_id, category, specialization)'),
 ('provider_specializations','provider_specializations_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('provider_weekly_availability','provider_weekly_availability_day_of_week_check','CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))'),
 ('provider_weekly_availability','weekly_availability_valid_range','CHECK ((start_time < end_time))'),
 ('provider_weekly_availability','provider_weekly_availability_pkey','PRIMARY KEY (provider_id, day_of_week)'),
 ('provider_weekly_availability','provider_weekly_availability_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('users','users_identity_verified_by_fkey','FOREIGN KEY (identity_verified_by) REFERENCES users(id) ON DELETE SET NULL'),
 ('verification_requests','verification_requests_role_check','CHECK ((role = ANY (ARRAY[''client''::text, ''provider''::text])))'),
 ('verification_requests','verification_requests_id_type_check','CHECK ((id_type = ANY (ARRAY[''mykad''::text, ''passport''::text])))'),
 ('verification_requests','verification_requests_status_check','CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text])))'),
 ('verification_requests','verification_requests_pkey','PRIMARY KEY (id)'),
 ('verification_requests','verification_requests_user_id_fkey','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('verification_requests','verification_requests_reviewed_by_fkey','FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL'),
 ('example_table','example_table_pkey','PRIMARY KEY (id)'),
 ('service_requests','service_requests_cancelled_by_fkey','FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL'),
 ('service_request_declines','service_request_declines_pkey','PRIMARY KEY (id)'),
 ('service_request_declines','service_request_declines_request_id_provider_id_key','UNIQUE (request_id, provider_id)'),
 ('service_request_declines','service_request_declines_request_id_fkey','FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE'),
 ('service_request_declines','service_request_declines_provider_id_fkey','FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_reports','service_reports_status_check','CHECK ((status = ANY (ARRAY[''pending''::text, ''under_review''::text, ''resolved''::text, ''dismissed''::text])))'),
 ('service_reports','service_reports_request_id_reporter_id_reported_user_id_key','UNIQUE (request_id, reporter_id, reported_user_id)'),
 ('service_reports','service_reports_request_id_fkey','FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE'),
 ('service_reports','service_reports_reporter_id_fkey','FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_reports','service_reports_reported_user_id_fkey','FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE'),
 ('service_reports','service_reports_reviewed_by_fkey','FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL')) e(table_name,constraint_name,definition) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint p WHERE p.conrelid=to_regclass('public.'||expected.table_name)
 AND p.conname=expected.constraint_name AND pg_get_constraintdef(p.oid)=expected.definition)
 THEN RAISE EXCEPTION 'Baseline key/check/FK drift: %.%',expected.table_name,expected.constraint_name; END IF;
 END LOOP;
 FOR expected IN SELECT * FROM (VALUES ('public.payment_records','trg_payment_id','CREATE TRIGGER trg_payment_id BEFORE INSERT ON public.payment_records FOR EACH ROW EXECUTE FUNCTION assign_payment_id()'),
 ('auth.users','on_auth_user_created','CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()'),
 ('public.notifications','trg_notification_id','CREATE TRIGGER trg_notification_id BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION assign_notification_id()'),
 ('public.service_requests','trg_service_requests_id','CREATE TRIGGER trg_service_requests_id BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION assign_service_request_id()'),
 ('public.service_requests','trg_service_requests_updated','CREATE TRIGGER trg_service_requests_updated BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
 ('public.internal_messages','trg_message_id','CREATE TRIGGER trg_message_id BEFORE INSERT ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION assign_message_id()'),
 ('public.service_reviews','trg_review_id','CREATE TRIGGER trg_review_id BEFORE INSERT ON public.service_reviews FOR EACH ROW EXECUTE FUNCTION assign_review_id()'),
 ('public.provider_skills','trg_provider_skills_code','CREATE TRIGGER trg_provider_skills_code BEFORE INSERT ON public.provider_skills FOR EACH ROW EXECUTE FUNCTION assign_skill_code()'),
 ('public.provider_profiles','trg_provider_profiles_updated','CREATE TRIGGER trg_provider_profiles_updated BEFORE UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
 ('public.users','trg_users_code','CREATE TRIGGER trg_users_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION assign_user_code()'),
 ('public.users','trg_users_updated','CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at()')) e(table_name,trigger_name,definition) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass(expected.table_name) AND t.tgname=expected.trigger_name
 AND NOT t.tgisinternal AND t.tgenabled='O' AND pg_get_triggerdef(t.oid)=expected.definition)
 THEN RAISE EXCEPTION 'Baseline trigger wiring drift: %.%',expected.table_name,expected.trigger_name; END IF;
 END LOOP;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.user_role')) IS DISTINCT FROM ARRAY['client','provider','admin']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: user_role'; END IF;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.account_status')) IS DISTINCT FROM ARRAY['active','inactive','suspended']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: account_status'; END IF;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.service_category')) IS DISTINCT FROM ARRAY['Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: service_category'; END IF;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.request_priority')) IS DISTINCT FROM ARRAY['normal','urgent']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: request_priority'; END IF;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.request_status')) IS DISTINCT FROM ARRAY['pending','provider_selected','confirmed','in_progress','completed','cancelled']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: request_status'; END IF;
 IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=to_regtype('public.payment_method')) IS DISTINCT FROM ARRAY['Cash','QR Transfer','Bank Transfer','Other']::text[]
 THEN RAISE EXCEPTION 'Baseline enum drift: payment_method'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind IN ('r','p') AND t.relname NOT IN ('payment_records','notifications','service_requests','internal_messages','service_reviews','provider_skills','provider_profiles','users','provider_weekly_availability','provider_specializations','verification_requests','example_table','service_request_declines','service_reports')) THEN RAISE EXCEPTION 'Unreviewed public table requires catalog reconciliation.'; END IF;
 IF to_regnamespace('igotu_backend_private') IS NOT NULL OR to_regnamespace('igotu_private') IS NOT NULL
 OR to_regnamespace('identity_access_private') IS NOT NULL THEN
 RAISE EXCEPTION 'Fresh reviewed baseline only. Do not combine existing unintegrated stages.'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.admin_update_user_status(uuid,text)'))) IS DISTINCT FROM '45ca7c7966d9b7173a8d29fec046c609' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_update_user_status'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.provider_start_request(text)'))) IS DISTINCT FROM 'd6e8d69a8ba2df00568806bc85aa3471' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_start_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.client_complete_request(text)'))) IS DISTINCT FROM '83276aeb9b94e72b61dc7acc9d6cbced' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_complete_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.format_custom_id(text,text)'))) IS DISTINCT FROM '1b75cc9863d4eeaecebfd6a551eb1349' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: format_custom_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.set_updated_at()'))) IS DISTINCT FROM 'c4822644cf7d8a94a3b779a7f2c430e5' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: set_updated_at'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_user_code()'))) IS DISTINCT FROM '533b048ec6006b4cb09816bd4bb7a707' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_user_code'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_service_request_id()'))) IS DISTINCT FROM 'cc81eae5f333b1e2a721847087ecf02a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_service_request_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_skill_code()'))) IS DISTINCT FROM 'd6b0649d5a920d5c691c74a9d57201db' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_skill_code'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_payment_id()'))) IS DISTINCT FROM 'e22a02aa51680a15de7321417c962071' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_payment_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_review_id()'))) IS DISTINCT FROM '17182b2bf4d981f8dc27a993efeebb7a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_review_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_message_id()'))) IS DISTINCT FROM 'd24dafea56fe2319e011aa7c74e13025' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_message_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.assign_notification_id()'))) IS DISTINCT FROM '426dc23fa7350679557c367cd65b005c' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: assign_notification_id'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.current_user_role()'))) IS DISTINCT FROM '126f596b9d5a89c026a286d8b335be81' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: current_user_role'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.handle_new_auth_user()'))) IS DISTINCT FROM '6e337fc906c4a58e14a09842724ba305' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: handle_new_auth_user'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.client_save_request_image(text,text,text)'))) IS DISTINCT FROM '348a966c7a7d8bdaad8d86ffec3e13f8' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_save_request_image'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.client_update_request(text,text,text,text,text,date,time without time zone,text,numeric,numeric,numeric,text)'))) IS DISTINCT FROM 'd0c8884416c5489102764366314a4c32' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_update_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.complete_basic_profile(text,text)'))) IS DISTINCT FROM '41675f6590ed187a06d2a20b1fa1cc6a' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: complete_basic_profile'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.admin_review_verification(uuid,text,text)'))) IS DISTINCT FROM '2fed291da2f00407a553305b353c3841' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_review_verification'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.client_cancel_request(text,text)'))) IS DISTINCT FROM '0e817027f00845ea3967a58273264165' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_cancel_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.provider_decline_request(text,text)'))) IS DISTINCT FROM '0db321b2b32af22017e4c2e83e680915' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_decline_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.client_select_provider(text,uuid)'))) IS DISTINCT FROM 'd1a6661b9ea82cdbae0e22645536c349' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: client_select_provider'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.provider_confirm_request(text)'))) IS DISTINCT FROM '080ed91fe661175825cad942370cdce7' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: provider_confirm_request'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.submit_service_report(text,uuid,text,text,text)'))) IS DISTINCT FROM '0541a7b2437e9375282f9d3a04150961' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: submit_service_report'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.admin_review_service_report(uuid,text,text)'))) IS DISTINCT FROM '518796d59faf41a6079e824ac62a084b' THEN RAISE EXCEPTION 'Baseline RPC/trigger drift: admin_review_service_report'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND (p.proowner<>'postgres'::regrole OR NOT(p.oid=ANY(array_remove(ARRAY[to_regprocedure('public.admin_update_user_status(uuid,text)')::oid,to_regprocedure('public.provider_start_request(text)')::oid,to_regprocedure('public.client_complete_request(text)')::oid,to_regprocedure('public.format_custom_id(text,text)')::oid,to_regprocedure('public.set_updated_at()')::oid,to_regprocedure('public.assign_user_code()')::oid,to_regprocedure('public.assign_service_request_id()')::oid,to_regprocedure('public.assign_skill_code()')::oid,to_regprocedure('public.assign_payment_id()')::oid,to_regprocedure('public.assign_review_id()')::oid,to_regprocedure('public.assign_message_id()')::oid,to_regprocedure('public.assign_notification_id()')::oid,to_regprocedure('public.current_user_role()')::oid,to_regprocedure('public.handle_new_auth_user()')::oid,to_regprocedure('public.client_save_request_image(text,text,text)')::oid,to_regprocedure('public.client_update_request(text,text,text,text,text,date,time without time zone,text,numeric,numeric,numeric,text)')::oid,to_regprocedure('public.complete_basic_profile(text,text)')::oid,to_regprocedure('public.admin_review_verification(uuid,text,text)')::oid,to_regprocedure('public.client_cancel_request(text,text)')::oid,to_regprocedure('public.provider_decline_request(text,text)')::oid,to_regprocedure('public.client_select_provider(text,uuid)')::oid,to_regprocedure('public.provider_confirm_request(text)')::oid,to_regprocedure('public.submit_service_report(text,uuid,text,text,text)')::oid,to_regprocedure('public.admin_review_service_report(uuid,text,text)')::oid],NULL)))))
 THEN RAISE EXCEPTION 'Unreviewed public routine or changed owner. Review catalog; do not extend gates blindly.'; END IF;
 IF EXISTS(SELECT 1 FROM public.verification_requests WHERE status='pending' GROUP BY user_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate pending history requires explicit reconciliation; no row is deleted.'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('v','m') AND (has_any_column_privilege('anon',c.oid,'SELECT') OR has_any_column_privilege('authenticated',c.oid,'SELECT')))
 THEN RAISE EXCEPTION 'New browser-readable view requires separate review.'; END IF;
END $preflight$;
CREATE SCHEMA igotu_backend_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA igotu_backend_private TO anon,authenticated;
-- Per-schema REVOKE cannot cancel global default EXECUTE. Each new routine
-- is explicitly revoked in its creation transaction; final effective ACL audit
-- also catches inherited/default grants. Do not rely on schema default ACLs.
CREATE TABLE igotu_backend_private.installation(version text PRIMARY KEY,phase integer NOT NULL,project_ref text NOT NULL);
ALTER TABLE igotu_backend_private.installation ENABLE ROW LEVEL SECURITY;
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
CREATE FUNCTION igotu_backend_private.approval_history_matches(subject uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=subject AND u.role::text IN ('client','provider')
 AND u.identity_verified IS TRUE AND u.identity_verified_at IS NOT NULL AND EXISTS(
  SELECT 1 FROM (SELECT v.* FROM public.verification_requests v WHERE v.user_id=u.id ORDER BY v.submitted_at DESC,v.id DESC LIMIT 1) v
  WHERE v.status='approved' AND v.role=u.role::text AND v.reviewed_at IS NOT NULL AND v.reviewed_by IS NOT NULL AND v.reviewed_by=u.identity_verified_by)); $$;
-- History consistency is independent of suspension. Workspace/badges still
-- require active status; the reconciliation queue must not relabel suspension.
CREATE FUNCTION igotu_backend_private.identity_approved(subject uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.approval_history_matches(subject) AND EXISTS(SELECT 1 FROM public.users WHERE id=subject AND status::text='active'); $$;
CREATE FUNCTION igotu_backend_private.approved_account(p_role text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status::text='active'
 AND (p_role IS NULL OR u.role::text=p_role) AND (u.role::text='admin' OR igotu_backend_private.identity_approved(u.id))); $$;
-- Approval opens onboarding; a completed profile additionally opens normal
-- workspaces. Admin remains exempt from Client/Provider onboarding.
CREATE FUNCTION igotu_backend_private.workspace(p_role text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.approved_account(p_role) AND EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND (role::text='admin' OR profile_completed IS TRUE)); $$;
CREATE FUNCTION igotu_backend_private.require_workspace(p_role text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN IF NOT igotu_backend_private.workspace(p_role) THEN RAISE EXCEPTION 'Active account and Admin-reviewed identity required.' USING ERRCODE='42501'; END IF; RETURN auth.uid(); END $$;
CREATE FUNCTION igotu_backend_private.applicant() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('client','provider') AND status::text='active'); $$;
-- Mutexes alone are insufficient under a transaction-pinned stale snapshot.
-- Fail closed rather than permit write skew at REPEATABLE READ.
CREATE FUNCTION igotu_backend_private.require_read_committed() RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Reviewed writer protocol requires READ COMMITTED.' USING ERRCODE='25001'; END IF;
END $$;
CREATE FUNCTION igotu_backend_private.provider_lock(subject uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN PERFORM igotu_backend_private.require_read_committed();IF subject IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(subject::text,61026)); END IF; END $$;
CREATE FUNCTION igotu_backend_private.participant(p_request text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.workspace() AND (igotu_backend_private.is_admin() OR EXISTS(
 SELECT 1 FROM public.service_requests WHERE request_id=p_request AND (client_id=auth.uid() OR selected_provider_id=auth.uid()))); $$;
CREATE FUNCTION igotu_backend_private.coarse_area(lat numeric,lng numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT CASE WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 THEN 'Approximate grid: latitude '||(floor(lat*10)/10)::text||' to '||least(floor(lat*10)/10+0.1,90)::text||', longitude '||(floor(lng*10)/10)::text||' to '||least(floor(lng*10)/10+0.1,180)::text ELSE 'Area available after confirmation' END; $$;
CREATE FUNCTION igotu_backend_private.valid_specialization(category text,specialization text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM (VALUES ('Cleaning','Home Cleaning'),
 ('Cleaning','Deep Cleaning'),
 ('Cleaning','Move-in / Move-out Cleaning'),
 ('Cleaning','Office Cleaning'),
 ('Cleaning','Post-event Cleaning'),
 ('Cleaning','General Cleaning'),
 ('Delivery','Food Delivery'),
 ('Delivery','Grocery Delivery'),
 ('Delivery','Parcel Delivery'),
 ('Delivery','Document Delivery'),
 ('Delivery','General Delivery'),
 ('Repair','Roofing'),
 ('Repair','Plumbing'),
 ('Repair','Electrical'),
 ('Repair','Appliance Repair'),
 ('Repair','Furniture Repair'),
 ('Repair','General Repair'),
 ('Moving Help','Furniture Moving'),
 ('Moving Help','House Moving'),
 ('Moving Help','Room Moving'),
 ('Moving Help','Packing & Unpacking'),
 ('Moving Help','Loading & Unloading'),
 ('Moving Help','General Moving Help'),
 ('Errands','Grocery Shopping'),
 ('Errands','Queueing'),
 ('Errands','Item Pickup'),
 ('Errands','Document Collection'),
 ('Errands','Personal Runner'),
 ('Errands','General Errands'),
 ('Tutoring','Mathematics'),
 ('Tutoring','Science'),
 ('Tutoring','English / MUET'),
 ('Tutoring','ICT / Computer'),
 ('Tutoring','General Tutoring'),
 ('Other','Event Setup'),
 ('Other','General Assistance'),
 ('Other','Other Service')) v(category,specialization) WHERE v.category=$1 AND v.specialization=$2); $$;
CREATE FUNCTION igotu_backend_private.eligible_provider(subject uuid,service public.service_requests) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT igotu_backend_private.identity_approved(subject)
 AND EXISTS(SELECT 1 FROM public.users WHERE id=subject AND role::text='provider' AND profile_completed IS TRUE)
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
GRANT EXECUTE ON FUNCTION igotu_backend_private.is_admin(),igotu_backend_private.approved_account(text),igotu_backend_private.workspace(text),igotu_backend_private.applicant(),igotu_backend_private.participant(text) TO anon,authenticated;
COMMIT;
