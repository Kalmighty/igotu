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
DO $dependencies$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE version='20261026.1' AND phase=2)
 THEN RAISE EXCEPTION 'Reviewed reader APIs required first.'; END IF;
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
END $dependencies$;
CREATE FUNCTION igotu_backend_private.require_writer(p_role text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 -- Hold account status/approval stable through each mutation; Admin review/status
 -- writers take the same user row lock. Provider advisory lock always comes first.
 PERFORM 1 FROM public.users WHERE id=auth.uid() FOR SHARE;
 RETURN igotu_backend_private.require_workspace(p_role);
END $$;
CREATE FUNCTION igotu_backend_private.validate_request(details jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE lat numeric:=(details->>'client_lat')::numeric;lng numeric:=(details->>'client_lng')::numeric;budget numeric:=(details->>'budget')::numeric;
BEGIN
 IF jsonb_typeof(details)<>'object' OR nullif(btrim(details->>'title'),'') IS NULL OR nullif(btrim(details->>'description'),'') IS NULL
 OR nullif(btrim(details->>'location'),'') IS NULL OR (details->>'preferred_date')::date IS NULL OR (details->>'preferred_time')::time IS NULL
 OR NOT igotu_backend_private.valid_specialization(details->>'category',details->>'service_type')
 OR coalesce(details->>'priority','') NOT IN ('normal','urgent') OR lat IS NULL OR lng IS NULL OR NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180)
 OR (budget IS NOT NULL AND (budget<0 OR budget::text IN ('NaN','Infinity','-Infinity')))
 THEN RAISE EXCEPTION 'Invalid service request details.' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION igotu_backend_private.create_service_request(p_idempotency_key uuid,p_details jsonb)
RETURNS TABLE(request_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject uuid;existing public.service_requests%rowtype;fingerprint text;
BEGIN
 subject:=igotu_backend_private.require_writer('client');
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Creation key required.'; END IF;
 PERFORM igotu_backend_private.validate_request(p_details);
 fingerprint:=md5(p_details::text);
 -- Serialize same-key retries without conflating distinct clients or operations.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(subject::text||p_idempotency_key::text,61027));
 SELECT * INTO existing FROM public.service_requests r WHERE r.client_id=subject AND r.creation_key=p_idempotency_key;
 IF FOUND THEN
  IF existing.creation_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'This creation key already saved different details. Open My Requests.'; END IF;
  RETURN QUERY SELECT existing.request_id;RETURN;
 END IF;
 INSERT INTO public.service_requests(client_id,title,category,service_type,description,preferred_date,preferred_time,location,client_lat,client_lng,budget,priority,status,creation_key,creation_fingerprint)
 VALUES(subject,btrim(p_details->>'title'),(p_details->>'category')::public.service_category,p_details->>'service_type',btrim(p_details->>'description'),
 (p_details->>'preferred_date')::date,(p_details->>'preferred_time')::time,btrim(p_details->>'location'),(p_details->>'client_lat')::numeric,(p_details->>'client_lng')::numeric,
 (p_details->>'budget')::numeric,(p_details->>'priority')::public.request_priority,'pending',p_idempotency_key,fingerprint) RETURNING * INTO existing;
 IF existing.request_id IS NULL THEN RAISE EXCEPTION 'Existing request-ID trigger contract missing.'; END IF;
 RETURN QUERY SELECT existing.request_id;
END $$;
CREATE FUNCTION public.create_service_request(p_idempotency_key uuid,p_details jsonb) RETURNS TABLE(request_id text)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.create_service_request(p_idempotency_key,p_details); $$;

CREATE FUNCTION igotu_backend_private.save_provider_profile(p_profile jsonb,p_skills text[],p_specializations jsonb,p_weekly_hours jsonb,p_full_name text,p_phone text)
RETURNS public.users LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject uuid:=auth.uid();result public.users%rowtype;lat numeric:=(p_profile->>'provider_lat')::numeric;lng numeric:=(p_profile->>'provider_lng')::numeric;available boolean:=(p_profile->>'is_available')::boolean;
BEGIN
 PERFORM igotu_backend_private.provider_lock(subject);
 PERFORM igotu_backend_private.require_writer('provider');
 IF nullif(btrim(p_full_name),'') IS NULL OR length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<7
 OR nullif(btrim(p_profile->>'bio'),'') IS NULL OR nullif(btrim(p_profile->>'location'),'') IS NULL
 OR lat IS NULL OR lng IS NULL OR NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180) OR available IS NULL
 OR cardinality(p_skills) IS NULL OR cardinality(p_skills)=0 OR cardinality(p_skills)>7
 OR EXISTS(SELECT 1 FROM unnest(p_skills) skill WHERE skill IS NULL OR skill NOT IN ('Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other'))
 OR cardinality(p_skills)<>(SELECT count(DISTINCT skill) FROM unnest(p_skills) skill)
 OR jsonb_typeof(p_specializations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_specializations)>100
 OR jsonb_typeof(p_weekly_hours) IS DISTINCT FROM 'array' OR jsonb_array_length(p_weekly_hours)>7
 THEN RAISE EXCEPTION 'Invalid provider profile.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_specializations) item WHERE NOT(coalesce(item->>'category','')=ANY(p_skills))
 OR NOT igotu_backend_private.valid_specialization(item->>'category',item->>'specialization'))
 OR EXISTS(SELECT 1 FROM unnest(p_skills) skill WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_specializations) item WHERE item->>'category'=skill))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_weekly_hours) item WHERE (item->>'day_of_week')::integer NOT BETWEEN 0 AND 6
 OR (item->>'day_of_week') IS NULL OR (item->>'start_time')::time IS NULL OR (item->>'end_time')::time IS NULL
 OR (item->>'start_time')::time >= (item->>'end_time')::time)
 OR (SELECT count(DISTINCT item->>'day_of_week') FROM jsonb_array_elements(p_weekly_hours) item)<>jsonb_array_length(p_weekly_hours)
 OR (available AND jsonb_array_length(p_weekly_hours)=0)
 THEN RAISE EXCEPTION 'Invalid specializations or working hours.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.provider_profiles(provider_id,bio,location,provider_lat,provider_lng,is_available)
 VALUES(subject,btrim(p_profile->>'bio'),btrim(p_profile->>'location'),lat,lng,available)
 ON CONFLICT(provider_id) DO UPDATE SET bio=excluded.bio,location=excluded.location,provider_lat=excluded.provider_lat,provider_lng=excluded.provider_lng,is_available=excluded.is_available;
 DELETE FROM public.provider_skills WHERE provider_id=subject;
 INSERT INTO public.provider_skills(provider_id,category) SELECT subject,skill::public.service_category FROM unnest(p_skills) skill;
 DELETE FROM public.provider_specializations WHERE provider_id=subject;
 INSERT INTO public.provider_specializations(provider_id,category,specialization) SELECT DISTINCT subject,item->>'category',item->>'specialization' FROM jsonb_array_elements(p_specializations) item;
 DELETE FROM public.provider_weekly_availability WHERE provider_id=subject;
 INSERT INTO public.provider_weekly_availability(provider_id,day_of_week,start_time,end_time) SELECT subject,(item->>'day_of_week')::smallint,(item->>'start_time')::time,(item->>'end_time')::time FROM jsonb_array_elements(p_weekly_hours) item;
 UPDATE public.users SET full_name=btrim(p_full_name),phone=btrim(p_phone),profile_completed=true WHERE id=subject RETURNING * INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.save_provider_profile(p_profile jsonb,p_skills text[],p_specializations jsonb,p_weekly_hours jsonb,p_full_name text,p_phone text)
RETURNS public.users LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.save_provider_profile(p_profile,p_skills,p_specializations,p_weekly_hours,p_full_name,p_phone); $$;

CREATE FUNCTION igotu_backend_private.transition(p_request_id text,action text,p_provider uuid DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%rowtype;initial_provider uuid;actor uuid:=auth.uid();target uuid;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE request_id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service request not found.'; END IF;
 initial_provider:=r.selected_provider_id;
 target:=CASE WHEN action='select' THEN p_provider ELSE initial_provider END;
 PERFORM igotu_backend_private.provider_lock(target);
 PERFORM igotu_backend_private.require_writer(CASE WHEN action IN ('select','cancel','complete') THEN 'client' ELSE 'provider' END);
 SELECT * INTO r FROM public.service_requests WHERE request_id=p_request_id FOR UPDATE;
 IF action<>'select' AND r.selected_provider_id IS DISTINCT FROM initial_provider THEN RAISE EXCEPTION 'Assignment changed; refresh before retrying.' USING ERRCODE='40001'; END IF;
 IF action IN ('select','cancel','complete') AND r.client_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Own request required.' USING ERRCODE='42501'; END IF;
 IF action IN ('confirm','decline','start') AND r.selected_provider_id IS DISTINCT FROM actor THEN
  -- A repeated decline is idempotent only while its own cleared request remains pending.
  IF action='decline' AND r.selected_provider_id IS NULL AND r.status::text='pending' AND EXISTS(SELECT 1 FROM public.service_request_declines WHERE request_id=p_request_id AND provider_id=actor) THEN RETURN; END IF;
  RAISE EXCEPTION 'Assigned Provider required.' USING ERRCODE='42501';
 END IF;
 CASE action
 WHEN 'select' THEN
  IF r.status::text='provider_selected' AND r.selected_provider_id=p_provider THEN RETURN; END IF;
  IF r.status::text<>'pending' OR p_provider IS NULL THEN RAISE EXCEPTION 'Pending request and eligible Provider required.'; END IF;
  PERFORM 1 FROM public.users WHERE id=p_provider FOR SHARE;
  IF NOT igotu_backend_private.eligible_provider(p_provider,r) THEN RAISE EXCEPTION 'Provider no longer matches this request or is booked.'; END IF;
  UPDATE public.service_requests SET selected_provider_id=p_provider,status='provider_selected' WHERE request_id=p_request_id;
 WHEN 'confirm' THEN
  IF r.status::text='confirmed' THEN RETURN; END IF;
  IF r.status::text<>'provider_selected' THEN RAISE EXCEPTION 'Request is not awaiting confirmation.'; END IF;
  IF EXISTS(SELECT 1 FROM public.service_requests busy WHERE busy.selected_provider_id=actor AND busy.request_id<>p_request_id
   AND busy.preferred_date=r.preferred_date AND busy.preferred_time=r.preferred_time AND busy.status::text IN ('confirmed','in_progress'))
  THEN RAISE EXCEPTION 'Provider already confirmed a conflicting service.'; END IF;
  UPDATE public.service_requests SET status='confirmed' WHERE request_id=p_request_id;
 WHEN 'decline' THEN
  IF r.status::text<>'provider_selected' OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'New assignment and decline reason required.'; END IF;
  INSERT INTO public.service_request_declines(request_id,provider_id,reason) VALUES(p_request_id,actor,btrim(p_reason))
  ON CONFLICT(request_id,provider_id) DO UPDATE SET reason=excluded.reason,created_at=now();
  UPDATE public.service_requests SET selected_provider_id=NULL,status='pending' WHERE request_id=p_request_id;
 WHEN 'start' THEN
  IF r.status::text='in_progress' THEN RETURN; END IF;
  IF r.status::text<>'confirmed' THEN RAISE EXCEPTION 'Only a confirmed service may start.'; END IF;
  UPDATE public.service_requests SET status='in_progress' WHERE request_id=p_request_id;
 WHEN 'complete' THEN
  IF r.status::text='completed' THEN RETURN; END IF;
  IF r.status::text<>'in_progress' THEN RAISE EXCEPTION 'Only an in-progress service may complete.'; END IF;
  UPDATE public.service_requests SET status='completed' WHERE request_id=p_request_id;
 WHEN 'cancel' THEN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required.'; END IF;
  IF r.status::text='cancelled' THEN RETURN; END IF;
  IF r.status::text NOT IN ('pending','provider_selected','confirmed') THEN RAISE EXCEPTION 'Service can no longer be cancelled.'; END IF;
  UPDATE public.service_requests SET status='cancelled',cancelled_by=actor,cancellation_reason=btrim(p_reason),cancelled_at=now() WHERE request_id=p_request_id;
 ELSE RAISE EXCEPTION 'Invalid service action.';
 END CASE;
END $$;
CREATE FUNCTION igotu_backend_private.client_select_provider(p_request_id text,p_provider_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'select',p_provider_id,NULL); $$;
CREATE OR REPLACE FUNCTION public.client_select_provider(p_request_id text,p_provider_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.client_select_provider(p_request_id,p_provider_id); $$;
CREATE FUNCTION igotu_backend_private.provider_confirm_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'confirm',NULL,NULL); $$;
CREATE OR REPLACE FUNCTION public.provider_confirm_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.provider_confirm_request(p_request_id); $$;
CREATE FUNCTION igotu_backend_private.provider_decline_request(p_request_id text,p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'decline',NULL,p_reason); $$;
CREATE OR REPLACE FUNCTION public.provider_decline_request(p_request_id text,p_reason text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.provider_decline_request(p_request_id,p_reason); $$;
CREATE FUNCTION igotu_backend_private.provider_start_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'start',NULL,NULL); $$;
CREATE OR REPLACE FUNCTION public.provider_start_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.provider_start_request(p_request_id); $$;
CREATE FUNCTION igotu_backend_private.client_complete_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'complete',NULL,NULL); $$;
CREATE OR REPLACE FUNCTION public.client_complete_request(p_request_id text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.client_complete_request(p_request_id); $$;
CREATE FUNCTION igotu_backend_private.client_cancel_request(p_request_id text,p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT igotu_backend_private.transition(p_request_id,'cancel',NULL,p_reason); $$;
CREATE OR REPLACE FUNCTION public.client_cancel_request(p_request_id text,p_reason text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT igotu_backend_private.client_cancel_request(p_request_id,p_reason); $$;
CREATE OR REPLACE FUNCTION public.complete_basic_profile(p_full_name text, p_phone text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_user public.users%rowtype;
begin
    PERFORM igotu_backend_private.require_writer();

  -- User must be logged in
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;


  -- Full name validation
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required.';
  end if;


  -- Phone validation
  if nullif(trim(p_phone), '') is null then
    raise exception 'Phone number is required.';
  end if;


  if length(
    regexp_replace(
      p_phone,
      '[^0-9+]',
      '',
      'g'
    )
  ) < 7 then
    raise exception 'Please enter a valid phone number.';
  end if;


  -- Get logged-in user's profile
  select *
  into v_user
  from public.users
  where id = auth.uid()
  for update;


  if not found then
    raise exception 'User profile not found.';
  end if;


  -- Only Client and Provider use onboarding
  if v_user.role::text not in ('client', 'provider') then
    raise exception 'This profile setup is only for clients and providers.';
  end if;


  -- Update profile
  update public.users
  set
    full_name = trim(p_full_name),
    phone = trim(p_phone),
    profile_completed = true
  where id = auth.uid()
  returning * into v_user;


  return v_user;

end;
$function$
;
CREATE OR REPLACE FUNCTION public.client_update_request(p_request_id text, p_title text, p_category text, p_service_type text, p_description text, p_preferred_date date, p_preferred_time time without time zone, p_location text, p_client_lat numeric, p_client_lng numeric, p_budget numeric, p_priority text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_request public.service_requests%rowtype;
  v_category public.service_requests.category%type;
  v_priority public.service_requests.priority%type;
begin
 PERFORM igotu_backend_private.validate_request(jsonb_build_object('title',p_title,'description',p_description,'category',p_category,'service_type',p_service_type,'priority',p_priority,'preferred_date',p_preferred_date,'preferred_time',p_preferred_time,'location',p_location,'client_lat',p_client_lat,'client_lng',p_client_lng,'budget',p_budget));

    PERFORM igotu_backend_private.require_writer('client');
  select * into v_request
  from public.service_requests
  where request_id = p_request_id
  for update;

  if not found then raise exception 'Service request not found.'; end if;
  if auth.uid() is null or v_request.client_id <> auth.uid() then raise exception 'You are not allowed to edit this request.'; end if;
  if v_request.status <> 'pending' then raise exception 'Only pending requests can be edited.'; end if;

  if nullif(trim(p_title),'') is null or nullif(trim(p_service_type),'') is null
     or nullif(trim(p_description),'') is null or nullif(trim(p_location),'') is null
     or p_preferred_date is null or p_preferred_time is null
     or p_client_lat is null or p_client_lng is null then
    raise exception 'Please complete all required request fields.';
  end if;

  if p_category not in ('Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other') then
    raise exception 'Invalid service category.';
  end if;

  if not (
    (p_category='Repair' and p_service_type in ('Roofing','Plumbing','Electrical','Appliance Repair','Furniture Repair','General Repair')) or
    (p_category='Cleaning' and p_service_type in ('Home Cleaning','Deep Cleaning','Move-in / Move-out Cleaning','Office Cleaning','Post-event Cleaning','General Cleaning')) or
    (p_category='Delivery' and p_service_type in ('Food Delivery','Grocery Delivery','Parcel Delivery','Document Delivery','General Delivery')) or
    (p_category='Moving Help' and p_service_type in ('Furniture Moving','House Moving','Room Moving','Packing & Unpacking','Loading & Unloading','General Moving Help')) or
    (p_category='Errands' and p_service_type in ('Grocery Shopping','Queueing','Item Pickup','Document Collection','Personal Runner','General Errands')) or
    (p_category='Tutoring' and p_service_type in ('Mathematics','Science','English / MUET','ICT / Computer','General Tutoring')) or
    (p_category='Other' and p_service_type in ('Event Setup','General Assistance','Other Service'))
  ) then
    raise exception 'Invalid service type for selected category.';
  end if;

  if p_priority not in ('normal','urgent') then raise exception 'Invalid request priority.'; end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative.'; end if;

  v_category := p_category;
  v_priority := p_priority;

  update public.service_requests
  set title=trim(p_title), category=v_category, service_type=trim(p_service_type),
      description=trim(p_description), preferred_date=p_preferred_date, preferred_time=p_preferred_time,
      location=trim(p_location), client_lat=p_client_lat, client_lng=p_client_lng,
      budget=p_budget, priority=v_priority
  where request_id=p_request_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.client_save_request_image(p_request_id text, p_request_image_url text, p_request_image_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_request public.service_requests%rowtype;
begin
    PERFORM igotu_backend_private.require_writer('client');
  select *
  into v_request
  from public.service_requests
  where request_id = p_request_id
  for update;

  if not found then
    raise exception 'Service request not found.';
  end if;

  if auth.uid() is null or v_request.client_id <> auth.uid() then
    raise exception 'You are not allowed to update this request image.';
  end if;

  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='request-images' AND o.name=p_request_image_path
 AND split_part(o.name,'/',1)=auth.uid()::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)
 THEN RAISE EXCEPTION 'Owned request image required.'; END IF;
 IF p_request_image_path !~ '^[A-Za-z0-9_./-]+$' OR p_request_image_path~'(^|/)[.][.]?(/|$)' OR p_request_image_url IS DISTINCT FROM
 (SELECT 'https://'||project_ref||'.supabase.co/storage/v1/object/public/request-images/'||p_request_image_path FROM igotu_backend_private.installation)
 THEN RAISE EXCEPTION 'Canonical request image URL required.'; END IF;
 update public.service_requests
  set
    request_image_url = p_request_image_url,
    request_image_path = p_request_image_path,
    request_image_uploaded_at = now()
  where request_id = p_request_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_service_report(p_request_id text, p_reported_user_id uuid, p_reason text, p_description text, p_evidence_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

    v_report_id uuid;

    v_expected_reported_user uuid;

begin
    PERFORM igotu_backend_private.require_writer();


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    if nullif(
        trim(p_reason),
        ''
    ) is null
    then

        raise exception
        'Please select a report reason.';

    end if;


    if nullif(
        trim(p_description),
        ''
    ) is null
    then

        raise exception
        'Please describe what happened.';

    end if;


    select *

    into v_request

    from public.service_requests

    where request_id =
        p_request_id;


    if not found then

        raise exception
        'Service request not found.';

    end if;


    -- =========================================================
    -- CLIENT REPORTING PROVIDER
    -- =========================================================

    if auth.uid() =
       v_request.client_id
    then


        if v_request.selected_provider_id
           is null
        then

            raise exception
            'There is no selected provider to report for this request.';

        end if;


        v_expected_reported_user :=
            v_request.selected_provider_id;


    -- =========================================================
    -- PROVIDER REPORTING CLIENT
    -- =========================================================

    elsif auth.uid() =
          v_request.selected_provider_id

    then

        v_expected_reported_user :=
            v_request.client_id;


    else

        raise exception
        'You are not a participant in this service request.';

    end if;


    -- =========================================================
    -- CHECK REPORTED USER
    -- =========================================================

    if p_reported_user_id <>
       v_expected_reported_user
    then

        raise exception
        'The reported user does not match this service request.';

    end if;


    -- =========================================================
    -- VALIDATE EVIDENCE STORAGE PATH
    -- =========================================================

    if p_evidence_path is not null

       and p_evidence_path not like
           auth.uid()::text || '/%'

    then

        raise exception
        'Invalid evidence file path.';

    end if;


    -- =========================================================
    -- INSERT REPORT
    -- =========================================================

    IF p_evidence_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='report-evidence' AND o.name=p_evidence_path
 AND split_part(o.name,'/',1)=auth.uid()::text AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)
 THEN RAISE EXCEPTION 'Owned report evidence required.'; END IF;
 insert into public.service_reports (

        request_id,

        reporter_id,

        reported_user_id,

        reason,

        description,

        evidence_path,

        status

    )

    values (

        p_request_id,

        auth.uid(),

        p_reported_user_id,

        trim(p_reason),

        trim(p_description),

        p_evidence_path,

        'pending'

    )

    returning id

    into v_report_id;


    return v_report_id;


exception

    when unique_violation then

        raise exception
        'You have already submitted a report for this user on this service request.';

end;

$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(p_user_id uuid,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.provider_lock(p_user_id);PERFORM igotu_backend_private.require_writer('admin');
 IF p_status IS NULL OR p_status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'Invalid account status.'; END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found.'; END IF;
 UPDATE public.users SET status=p_status::public.account_status WHERE id=p_user_id AND status::text IS DISTINCT FROM p_status;
 UPDATE public.provider_profiles SET is_verified=igotu_backend_private.identity_approved(p_user_id) WHERE provider_id=p_user_id;
END $$;
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_request_id uuid,p_status text,p_admin_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.verification_requests%rowtype;subject uuid; BEGIN
 PERFORM igotu_backend_private.require_writer('admin');
 IF p_status IS NULL OR p_status NOT IN ('approved','rejected') OR (p_status='rejected' AND nullif(btrim(p_admin_note),'') IS NULL) THEN RAISE EXCEPTION 'Valid decision and rejection reason required.'; END IF;
 SELECT user_id INTO subject FROM public.verification_requests WHERE id=p_request_id;
 IF subject IS NULL THEN RAISE EXCEPTION 'Verification request not found.'; END IF;
 PERFORM igotu_backend_private.provider_lock(subject);
 PERFORM 1 FROM public.users WHERE id=subject FOR UPDATE;
 SELECT * INTO v FROM public.verification_requests WHERE id=p_request_id FOR UPDATE;
 IF v.status<>'pending' OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=v.user_id AND role::text=v.role) THEN RAISE EXCEPTION 'Request already reviewed or applicant role changed.'; END IF;
 IF p_status='approved' AND (v.age_confirmed IS DISTINCT FROM true OR v.privacy_consent IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Unrecorded legacy consent requires rejection/corrected submission, never invented consent.'; END IF;
 UPDATE public.verification_requests SET status=p_status,admin_note=nullif(btrim(p_admin_note),''),reviewed_at=now(),reviewed_by=auth.uid() WHERE id=v.id;
 UPDATE public.users SET identity_verified=(p_status='approved'),identity_verified_at=CASE WHEN p_status='approved' THEN now() END,
 identity_verified_by=CASE WHEN p_status='approved' THEN auth.uid() END WHERE id=v.user_id;
 UPDATE public.provider_profiles SET is_verified=(p_status='approved'),verified_at=CASE WHEN p_status='approved' THEN now() END,
 verified_by=CASE WHEN p_status='approved' THEN auth.uid() END WHERE provider_id=v.user_id AND v.role='provider';
END $$;
CREATE OR REPLACE FUNCTION public.admin_review_service_report(p_report_id uuid,p_status text,p_admin_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_reports%rowtype; BEGIN
 PERFORM igotu_backend_private.require_writer('admin');
 IF p_status IS NULL OR p_status NOT IN ('under_review','resolved','dismissed') OR (p_status='dismissed' AND nullif(btrim(p_admin_note),'') IS NULL) THEN RAISE EXCEPTION 'Valid status and dismissal reason required.'; END IF;
 SELECT * INTO r FROM public.service_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.'; END IF;
 IF r.status=p_status THEN RETURN; END IF;
 IF r.status NOT IN ('pending','under_review') THEN RAISE EXCEPTION 'Report already has a final decision.'; END IF;
 UPDATE public.service_reports SET status=p_status,admin_note=nullif(btrim(p_admin_note),''),reviewed_at=now(),reviewed_by=auth.uid() WHERE id=p_report_id;
 -- Exactly one D04 report trigger owns final-decision notifications.
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION igotu_backend_private.is_admin(),igotu_backend_private.workspace(text),igotu_backend_private.applicant(),igotu_backend_private.participant(text),igotu_backend_private.can_read_receipt(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION igotu_backend_private.provider_service_requests(text,text[]),igotu_backend_private.service_participants(text[]),igotu_backend_private.recommended_provider_candidates(text),igotu_backend_private.payment_proof_reference(text),igotu_backend_private.verification_reconciliation_queue(uuid),igotu_backend_private.create_service_request(uuid,jsonb),igotu_backend_private.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text),igotu_backend_private.client_select_provider(text,uuid),igotu_backend_private.provider_confirm_request(text),igotu_backend_private.provider_decline_request(text,text),igotu_backend_private.provider_start_request(text),igotu_backend_private.client_complete_request(text),igotu_backend_private.client_cancel_request(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.provider_service_requests(text,text[]),public.service_participants(text[]),public.recommended_provider_candidates(text),public.payment_proof_reference(text),public.verification_reconciliation_queue(uuid),public.create_service_request(uuid,jsonb),public.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text),public.client_select_provider(text,uuid),public.provider_confirm_request(text),public.provider_decline_request(text,text),public.provider_start_request(text),public.client_complete_request(text),public.client_cancel_request(text,text),public.complete_basic_profile(text,text),public.client_update_request(text,text,text,text,text,date,time,text,numeric,numeric,numeric,text),public.client_save_request_image(text,text,text),public.submit_service_report(text,uuid,text,text,text),public.admin_update_user_status(uuid,text),public.admin_review_verification(uuid,text,text),public.admin_review_service_report(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.provider_service_requests(text,text[]),public.service_participants(text[]),public.recommended_provider_candidates(text),public.payment_proof_reference(text),public.verification_reconciliation_queue(uuid),public.create_service_request(uuid,jsonb),public.save_provider_profile(jsonb,text[],jsonb,jsonb,text,text),public.client_select_provider(text,uuid),public.provider_confirm_request(text),public.provider_decline_request(text,text),public.provider_start_request(text),public.client_complete_request(text),public.client_cancel_request(text,text),public.complete_basic_profile(text,text),public.client_update_request(text,text,text,text,text,date,time,text,numeric,numeric,numeric,text),public.client_save_request_image(text,text,text),public.submit_service_report(text,uuid,text,text,text),public.admin_update_user_status(uuid,text),public.admin_review_verification(uuid,text,text),public.admin_review_service_report(uuid,text,text) TO authenticated;
UPDATE igotu_backend_private.installation SET phase=3 WHERE version='20261026.1';
COMMIT;
