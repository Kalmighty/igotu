-- Metadata snapshot only. DO NOT EXECUTE: these are observed legacy definitions, not migrations.
-- admin_update_user_status(uuid,text)
CREATE OR REPLACE FUNCTION public.admin_update_user_status(p_user_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Only active admins can update user status.';
    END IF;

    IF p_status NOT IN ('active', 'suspended') THEN
        RAISE EXCEPTION 'Invalid user status.';
    END IF;

    UPDATE public.users
    SET status = p_status::user_status,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$


-- provider_start_request(text)
CREATE OR REPLACE FUNCTION public.provider_start_request(p_request_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.service_requests
    SET status = 'in_progress',
        updated_at = NOW()
    WHERE request_id = p_request_id
      AND selected_provider_id = auth.uid()
      AND status = 'confirmed';
END;
$function$


-- client_complete_request(text)
CREATE OR REPLACE FUNCTION public.client_complete_request(p_request_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.service_requests
    SET status = 'completed',
        updated_at = NOW()
    WHERE request_id = p_request_id
      AND client_id = auth.uid()
      AND status = 'in_progress';
END;
$function$


-- format_custom_id(text,text)
CREATE OR REPLACE FUNCTION public.format_custom_id(prefix text, seq_name text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    next_number BIGINT;
BEGIN
    EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_number;
    RETURN prefix || LPAD(next_number::TEXT, 4, '0');
END;
$function$


-- set_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$


-- assign_user_code()
CREATE OR REPLACE FUNCTION public.assign_user_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.user_code IS NULL THEN
        IF NEW.role = 'client' THEN
            NEW.user_code := public.format_custom_id('C', 'public.client_seq');
        ELSIF NEW.role = 'provider' THEN
            NEW.user_code := public.format_custom_id('P', 'public.provider_seq');
        ELSIF NEW.role = 'admin' THEN
            NEW.user_code := public.format_custom_id('A', 'public.admin_seq');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$


-- assign_service_request_id()
CREATE OR REPLACE FUNCTION public.assign_service_request_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.request_id IS NULL THEN
        NEW.request_id := public.format_custom_id('SR', 'public.request_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- assign_skill_code()
CREATE OR REPLACE FUNCTION public.assign_skill_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.skill_code IS NULL THEN
        NEW.skill_code := public.format_custom_id('SK', 'public.skill_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- assign_payment_id()
CREATE OR REPLACE FUNCTION public.assign_payment_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.payment_id IS NULL THEN
        NEW.payment_id := public.format_custom_id('PAY', 'public.payment_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- assign_review_id()
CREATE OR REPLACE FUNCTION public.assign_review_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.review_id IS NULL THEN
        NEW.review_id := public.format_custom_id('REV', 'public.review_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- assign_message_id()
CREATE OR REPLACE FUNCTION public.assign_message_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.message_id IS NULL THEN
        NEW.message_id := public.format_custom_id('MSG', 'public.message_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- assign_notification_id()
CREATE OR REPLACE FUNCTION public.assign_notification_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.notification_id IS NULL THEN
        NEW.notification_id := public.format_custom_id('NOTIF', 'public.notification_seq');
    END IF;

    RETURN NEW;
END;
$function$


-- current_user_role()
CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT role::TEXT
    FROM public.users
    WHERE id = auth.uid()
    LIMIT 1;
$function$


-- handle_new_auth_user()
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    selected_role TEXT;
    selected_name TEXT;
BEGIN
    selected_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'client'));

    IF selected_role NOT IN ('client', 'provider') THEN
        selected_role := 'client';
    END IF;

    selected_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.email
    );

    INSERT INTO public.users (id, full_name, email, role, status)
    VALUES (
        NEW.id,
        selected_name,
        NEW.email,
        selected_role::public.user_role,
        'active'
    );

    RETURN NEW;
END;
$function$


-- client_save_request_image(text,text,text)
CREATE OR REPLACE FUNCTION public.client_save_request_image(p_request_id text, p_request_image_url text, p_request_image_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request public.service_requests%rowtype;
begin
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

  update public.service_requests
  set
    request_image_url = p_request_image_url,
    request_image_path = p_request_image_path,
    request_image_uploaded_at = now()
  where request_id = p_request_id;
end;
$function$


-- client_update_request(text,text,text,text,text,date,time without time zone,text,numeric,numeric,numeric,text)
CREATE OR REPLACE FUNCTION public.client_update_request(p_request_id text, p_title text, p_category text, p_service_type text, p_description text, p_preferred_date date, p_preferred_time time without time zone, p_location text, p_client_lat numeric, p_client_lng numeric, p_budget numeric, p_priority text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request public.service_requests%rowtype;
  v_category public.service_requests.category%type;
  v_priority public.service_requests.priority%type;
begin
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


-- complete_basic_profile(text,text)
CREATE OR REPLACE FUNCTION public.complete_basic_profile(p_full_name text, p_phone text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user public.users%rowtype;
begin

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


-- admin_review_verification(uuid,text,text)
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_request_id uuid, p_status text, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_admin public.users%rowtype;

    v_request public.verification_requests%rowtype;

    v_approved boolean;

begin


    -- =========================================================
    -- USER MUST BE LOGGED IN
    -- =========================================================

    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    -- =========================================================
    -- LOAD ADMIN PROFILE
    -- =========================================================

    select *

    into v_admin

    from public.users

    where id = auth.uid();


    -- =========================================================
    -- CHECK ADMIN ROLE
    -- =========================================================

    if not found

    or v_admin.role::text <> 'admin'

    or v_admin.status::text <> 'active'

    then

        raise exception
        'Only an active administrator can review verification requests.';

    end if;


    -- =========================================================
    -- CHECK REVIEW STATUS
    -- =========================================================

    if p_status not in (
        'approved',
        'rejected'
    )

    then

        raise exception
        'Verification status must be approved or rejected.';

    end if;


    -- =========================================================
    -- LOAD VERIFICATION REQUEST
    -- =========================================================

    select *

    into v_request

    from public.verification_requests

    where id = p_request_id

    for update;


    if not found then

        raise exception
        'Verification request not found.';

    end if;


    -- =========================================================
    -- PREVENT DOUBLE REVIEW
    -- =========================================================

    if v_request.status <> 'pending' then

        raise exception
        'This verification request has already been reviewed.';

    end if;


    -- =========================================================
    -- CHECK APPROVAL
    -- =========================================================

    v_approved =
        (p_status = 'approved');


    -- =========================================================
    -- UPDATE VERIFICATION REQUEST
    -- =========================================================

    update public.verification_requests

    set

        status =
            p_status,

        admin_note =
            nullif(
                trim(
                    coalesce(
                        p_admin_note,
                        ''
                    )
                ),
                ''
            ),

        reviewed_at =
            now(),

        reviewed_by =
            auth.uid()

    where id =
        p_request_id;


    -- =========================================================
    -- UPDATE USER VERIFICATION
    -- =========================================================

    update public.users

    set

        identity_verified =
            v_approved,

        identity_verified_at =
            case

                when v_approved
                    then now()

                else null

            end,

        identity_verified_by =
            case

                when v_approved
                    then auth.uid()

                else null

            end

    where id =
        v_request.user_id;


    -- =========================================================
    -- IF PROVIDER:
    -- ALSO UPDATE PROVIDER PROFILE VERIFICATION
    -- =========================================================

    if v_request.role = 'provider' then

        update public.provider_profiles

        set

            is_verified =
                v_approved,

            verified_at =
                case

                    when v_approved
                        then now()

                    else null

                end,

            verified_by =
                case

                    when v_approved
                        then auth.uid()

                    else null

                end

        where provider_id =
            v_request.user_id;

    end if;


end;

$function$


-- client_cancel_request(text,text)
CREATE OR REPLACE FUNCTION public.client_cancel_request(p_request_id text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

begin


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    if nullif(
        trim(p_reason),
        ''
    ) is null then

        raise exception
        'Please provide a cancellation reason.';

    end if;


    select *

    into v_request

    from public.service_requests

    where request_id =
        p_request_id

    for update;


    if not found then

        raise exception
        'Service request not found.';

    end if;


    if v_request.client_id <>
       auth.uid() then

        raise exception
        'You can only cancel your own request.';

    end if;


    if v_request.status::text
       not in (
           'pending',
           'provider_selected',
           'confirmed'
       )
    then

        raise exception
        'This request can no longer be cancelled.';

    end if;


    update public.service_requests

    set

        status =
            'cancelled',

        cancelled_by =
            auth.uid(),

        cancellation_reason =
            trim(p_reason),

        cancelled_at =
            now()

    where request_id =
        p_request_id;

end;

$function$


-- provider_decline_request(text,text)
CREATE OR REPLACE FUNCTION public.provider_decline_request(p_request_id text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

begin


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    if nullif(
        trim(p_reason),
        ''
    ) is null then

        raise exception
        'Please provide a decline reason.';

    end if;


    select *

    into v_request

    from public.service_requests

    where request_id =
        p_request_id

    for update;


    if not found then

        raise exception
        'Service request not found.';

    end if;


    if v_request.selected_provider_id <>
       auth.uid() then

        raise exception
        'This request is not assigned to you.';

    end if;


    if v_request.status::text <>
       'provider_selected'
    then

        raise exception
        'Only newly selected requests can be declined.';

    end if;


    insert into
    public.service_request_declines (

        request_id,

        provider_id,

        reason,

        created_at

    )

    values (

        p_request_id,

        auth.uid(),

        trim(p_reason),

        now()

    )

    on conflict (
        request_id,
        provider_id
    )

    do update set

        reason =
            excluded.reason,

        created_at =
            now();


    update public.service_requests

    set

        selected_provider_id =
            null,

        status =
            'pending'

    where request_id =
        p_request_id;

end;

$function$


-- client_select_provider(text,uuid)
CREATE OR REPLACE FUNCTION public.client_select_provider(p_request_id text, p_provider_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

    v_provider
        public.users%rowtype;

begin


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    select *

    into v_request

    from public.service_requests

    where request_id =
        p_request_id

    for update;


    if not found then

        raise exception
        'Service request not found.';

    end if;


    if v_request.client_id <>
       auth.uid()
    then

        raise exception
        'You can only select a provider for your own request.';

    end if;


    if v_request.status::text <>
       'pending'
    then

        raise exception
        'A provider can only be selected while the request is pending.';

    end if;


    select *

    into v_provider

    from public.users

    where id =
        p_provider_id;


    if not found

       or v_provider.role::text <>
          'provider'

       or v_provider.status::text <>
          'active'

    then

        raise exception
        'The selected provider is not available.';

    end if;


    -- =========================================================
    -- Provider overall availability
    -- =========================================================

    if exists (

        select 1

        from public.provider_profiles pp

        where pp.provider_id =
            p_provider_id

        and pp.is_available =
            false

    )
    then

        raise exception
        'The selected provider is currently unavailable.';

    end if;


    -- =========================================================
    -- Provider previously declined same request
    -- =========================================================

    if exists (

        select 1

        from public.service_request_declines d

        where d.request_id =
            p_request_id

        and d.provider_id =
            p_provider_id

    )
    then

        raise exception
        'This provider previously declined this request. Please choose another provider.';

    end if;


    -- =========================================================
    -- Check specialization
    -- =========================================================

    if nullif(
        trim(
            coalesce(
                v_request.service_type,
                ''
            )
        ),
        ''
    ) is not null

    and not exists (

        select 1

        from public.provider_specializations ps

        where ps.provider_id =
            p_provider_id

        and ps.category::text =
            v_request.category::text

        and ps.specialization =
            v_request.service_type

    )
    then

        raise exception
        'This provider does not match the requested service specialization.';

    end if;


    -- =========================================================
    -- DOUBLE BOOKING CHECK
    -- Same date + exact preferred time
    -- =========================================================

    if exists (

        select 1

        from public.service_requests busy

        where busy.selected_provider_id =
            p_provider_id

        and busy.request_id <>
            p_request_id

        and busy.status::text in (

            'provider_selected',

            'confirmed',

            'in_progress'
        )

        and busy.preferred_date =
            v_request.preferred_date

        and busy.preferred_time =
            v_request.preferred_time

    )
    then

        raise exception
        'This provider is already booked at the requested date and time.';

    end if;


    -- =========================================================
    -- SELECT PROVIDER
    -- =========================================================

    update public.service_requests

    set

        selected_provider_id =
            p_provider_id,

        status =
            'provider_selected'

    where request_id =
        p_request_id;

end;

$function$


-- provider_confirm_request(text)
CREATE OR REPLACE FUNCTION public.provider_confirm_request(p_request_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

begin


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    select *

    into v_request

    from public.service_requests

    where request_id =
        p_request_id

    for update;


    if not found then

        raise exception
        'Service request not found.';

    end if;


    if v_request.selected_provider_id <>
       auth.uid()
    then

        raise exception
        'This request is not assigned to you.';

    end if;


    if v_request.status::text <>
       'provider_selected'
    then

        raise exception
        'This request is no longer waiting for confirmation.';

    end if;


    if exists (

        select 1

        from public.service_requests busy

        where busy.selected_provider_id =
            auth.uid()

        and busy.request_id <>
            p_request_id

        and busy.status::text in (
            'confirmed',
            'in_progress'
        )

        and busy.preferred_date =
            v_request.preferred_date

        and busy.preferred_time =
            v_request.preferred_time

    )
    then

        raise exception
        'You already have another confirmed service at this date and time. Decline this request so the client can re-match.';

    end if;


    update public.service_requests

    set status =
        'confirmed'

    where request_id =
        p_request_id;

end;

$function$


-- submit_service_report(text,uuid,text,text,text)
CREATE OR REPLACE FUNCTION public.submit_service_report(p_request_id text, p_reported_user_id uuid, p_reason text, p_description text, p_evidence_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_request
        public.service_requests%rowtype;

    v_report_id uuid;

    v_expected_reported_user uuid;

begin


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


-- admin_review_service_report(uuid,text,text)
CREATE OR REPLACE FUNCTION public.admin_review_service_report(p_report_id uuid, p_status text, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

    v_admin
        public.users%rowtype;

    v_report
        public.service_reports%rowtype;

begin


    if auth.uid() is null then

        raise exception
        'You must be logged in.';

    end if;


    select *

    into v_admin

    from public.users

    where id =
        auth.uid();


    if not found

       or v_admin.role::text <>
          'admin'

       or v_admin.status::text <>
          'active'

    then

        raise exception
        'Only an active administrator can review reports.';

    end if;


    if p_status not in (

        'under_review',

        'resolved',

        'dismissed'

    )
    then

        raise exception
        'Invalid report status.';

    end if;


    select *

    into v_report

    from public.service_reports

    where id =
        p_report_id

    for update;


    if not found then

        raise exception
        'Report not found.';

    end if;


    update public.service_reports

    set

        status =
            p_status,

        admin_note =
            nullif(
                trim(
                    coalesce(
                        p_admin_note,
                        ''
                    )
                ),
                ''
            ),

        reviewed_at =
            now(),

        reviewed_by =
            auth.uid()

    where id =
        p_report_id;


    -- =========================================================
    -- Notify reporter after final decision
    -- =========================================================

    if p_status in (
        'resolved',
        'dismissed'
    )
    then


        insert into public.notifications (

            user_id,

            title,

            message,

            is_read,

            created_at

        )

        values (

            v_report.reporter_id,

            case

                when p_status =
                     'resolved'

                then
                    'Report resolved'

                else
                    'Report dismissed'

            end,

            case

                when p_status =
                     'resolved'

                then
                    'Your report for request '
                    || v_report.request_id
                    || ' has been reviewed and resolved.'

                else
                    'Your report for request '
                    || v_report.request_id
                    || ' has been reviewed and dismissed.'

            end,

            false,

            now()

        );

    end if;

end;

$function$
