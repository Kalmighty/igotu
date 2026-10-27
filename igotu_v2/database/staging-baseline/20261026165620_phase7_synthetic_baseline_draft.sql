-- REVIEW-ONLY EMPTY SYNTHETIC STAGING BASELINE. NEVER EXECUTED IN PHASE 7.
-- Separate approval required. Do not apply to production or an existing app.
-- This preserves reviewed legacy function text for D01/D03 fingerprint checks;
-- known legacy weaknesses (including user_status) are quarantined until D03/D04.
-- No browser traffic, account provisioning or RPC use before all four stages.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $baseline_gate$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::integer/10000<>17
 OR current_setting('igotu.integration.baseline_authorized',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.writes_paused',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.staging_only',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.project_ref',true) IS NULL
 OR current_setting('igotu.integration.project_ref',true)!~'^[a-z]{20}$'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 THEN RAISE EXCEPTION 'Separately approved empty synthetic PostgreSQL 17 staging only.'; END IF;
 IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN RAISE EXCEPTION 'Browser-writable public schema is not a safe baseline.'; END IF;
 IF to_regnamespace('igotu_backend_private') IS NOT NULL OR to_regnamespace('igotu_private') IS NOT NULL OR to_regnamespace('identity_access_private') IS NOT NULL THEN RAISE EXCEPTION 'Existing private app namespace requires review, not baseline recreation.'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regclass('storage.objects') IS NULL THEN RAISE EXCEPTION 'Managed Supabase Auth and Storage are prerequisites; never recreate them.'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id IN ('payment-proofs','request-images','verification-documents','report-evidence'))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Empty app baseline required; review collisions without dropping objects or records.'; END IF;
END $baseline_gate$;
CREATE TYPE public."user_role" AS ENUM ('client','provider','admin');
CREATE TYPE public."account_status" AS ENUM ('active','inactive','suspended');
CREATE TYPE public."service_category" AS ENUM ('Cleaning','Delivery','Repair','Moving Help','Errands','Tutoring','Other');
CREATE TYPE public."request_priority" AS ENUM ('normal','urgent');
CREATE TYPE public."request_status" AS ENUM ('pending','provider_selected','confirmed','in_progress','completed','cancelled');
CREATE TYPE public."payment_method" AS ENUM ('Cash','QR Transfer','Bank Transfer','Other');
CREATE SEQUENCE public."admin_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."client_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."message_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."notification_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."payment_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."provider_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."request_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."review_seq" AS bigint START WITH 1;
CREATE SEQUENCE public."skill_seq" AS bigint START WITH 1;
CREATE TABLE public."payment_records" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "payment_id" text,
 "request_id" text NOT NULL,
 "client_id" uuid NOT NULL,
 "provider_id" uuid NOT NULL,
 "amount" numeric(10,2) NOT NULL,
 "payment_method" public.payment_method NOT NULL,
 "reference_number" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "proof_url" text,
 "proof_path" text,
 "proof_uploaded_at" timestamp with time zone
);
CREATE TABLE public."notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "notification_id" text,
 "user_id" uuid NOT NULL,
 "title" text NOT NULL,
 "message" text NOT NULL,
 "link_url" text,
 "is_read" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."service_requests" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "request_id" text,
 "client_id" uuid NOT NULL,
 "selected_provider_id" uuid,
 "title" text NOT NULL,
 "category" public.service_category NOT NULL,
 "description" text NOT NULL,
 "preferred_date" date NOT NULL,
 "preferred_time" time without time zone NOT NULL,
 "location" text NOT NULL,
 "client_lat" numeric(10,7),
 "client_lng" numeric(10,7),
 "budget" numeric(10,2),
 "priority" public.request_priority DEFAULT 'normal'::request_priority NOT NULL,
 "status" public.request_status DEFAULT 'pending'::request_status NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "request_image_url" text,
 "request_image_path" text,
 "request_image_uploaded_at" timestamp with time zone,
 "service_type" text,
 "cancelled_by" uuid,
 "cancellation_reason" text,
 "cancelled_at" timestamp with time zone
);
CREATE TABLE public."internal_messages" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "message_id" text,
 "request_id" text NOT NULL,
 "sender_id" uuid NOT NULL,
 "receiver_id" uuid NOT NULL,
 "message_text" text NOT NULL,
 "is_read" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."service_reviews" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "review_id" text,
 "request_id" text NOT NULL,
 "reviewer_id" uuid NOT NULL,
 "reviewee_id" uuid NOT NULL,
 "rating" integer NOT NULL,
 "feedback" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."provider_skills" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "skill_code" text,
 "provider_id" uuid NOT NULL,
 "category" public.service_category NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."provider_profiles" (
 "provider_id" uuid NOT NULL,
 "bio" text,
 "location" text,
 "provider_lat" numeric(10,7),
 "provider_lng" numeric(10,7),
 "is_available" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "is_verified" boolean DEFAULT false NOT NULL,
 "verified_at" timestamp with time zone,
 "verified_by" uuid
);
CREATE TABLE public."users" (
 "id" uuid NOT NULL,
 "user_code" text,
 "full_name" text NOT NULL,
 "email" text NOT NULL,
 "role" public.user_role DEFAULT 'client'::user_role NOT NULL,
 "status" public.account_status DEFAULT 'active'::account_status NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "phone" text,
 "profile_completed" boolean DEFAULT false NOT NULL,
 "identity_verified" boolean DEFAULT false NOT NULL,
 "identity_verified_at" timestamp with time zone,
 "identity_verified_by" uuid
);
CREATE TABLE public."provider_weekly_availability" (
 "provider_id" uuid NOT NULL,
 "day_of_week" smallint NOT NULL,
 "start_time" time without time zone NOT NULL,
 "end_time" time without time zone NOT NULL
);
CREATE TABLE public."provider_specializations" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "provider_id" uuid NOT NULL,
 "category" text NOT NULL,
 "specialization" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."verification_requests" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "role" text NOT NULL,
 "legal_name" text NOT NULL,
 "id_type" text NOT NULL,
 "id_number_last4" text NOT NULL,
 "identity_document_path" text NOT NULL,
 "supporting_document_path" text,
 "business_name" text,
 "ssm_number" text,
 "professional_license" text,
 "status" text DEFAULT 'pending'::text NOT NULL,
 "admin_note" text,
 "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "reviewed_by" uuid
);
CREATE TABLE public."example_table" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL
);
CREATE TABLE public."service_request_declines" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "request_id" text NOT NULL,
 "provider_id" uuid NOT NULL,
 "reason" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."service_reports" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "request_id" text NOT NULL,
 "reporter_id" uuid NOT NULL,
 "reported_user_id" uuid NOT NULL,
 "reason" text NOT NULL,
 "description" text NOT NULL,
 "evidence_path" text,
 "status" text DEFAULT 'pending'::text NOT NULL,
 "admin_note" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "reviewed_by" uuid
);
ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE public."users" ADD CONSTRAINT "users_user_code_key" UNIQUE (user_code);
ALTER TABLE public."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);
ALTER TABLE public."provider_profiles" ADD CONSTRAINT "provider_profiles_pkey" PRIMARY KEY (provider_id);
ALTER TABLE public."provider_skills" ADD CONSTRAINT "provider_skills_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_skills" ADD CONSTRAINT "provider_skills_skill_code_key" UNIQUE (skill_code);
ALTER TABLE public."provider_skills" ADD CONSTRAINT "provider_skills_provider_id_category_key" UNIQUE (provider_id, category);
ALTER TABLE public."service_requests" ADD CONSTRAINT "service_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_requests" ADD CONSTRAINT "service_requests_request_id_key" UNIQUE (request_id);
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_pkey" PRIMARY KEY (id);
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_payment_id_key" UNIQUE (payment_id);
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_request_id_key" UNIQUE (request_id);
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_review_id_key" UNIQUE (review_id);
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_request_id_reviewer_id_key" UNIQUE (request_id, reviewer_id);
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_message_id_key" UNIQUE (message_id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_notification_id_key" UNIQUE (notification_id);
ALTER TABLE public."provider_specializations" ADD CONSTRAINT "provider_specializations_pkey" PRIMARY KEY (id);
ALTER TABLE public."provider_specializations" ADD CONSTRAINT "provider_specializations_unique" UNIQUE (provider_id, category, specialization);
ALTER TABLE public."provider_weekly_availability" ADD CONSTRAINT "provider_weekly_availability_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public."provider_weekly_availability" ADD CONSTRAINT "weekly_availability_valid_range" CHECK ((start_time < end_time));
ALTER TABLE public."provider_weekly_availability" ADD CONSTRAINT "provider_weekly_availability_pkey" PRIMARY KEY (provider_id, day_of_week);
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_role_check" CHECK ((role = ANY (ARRAY['client'::text, 'provider'::text])));
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_id_type_check" CHECK ((id_type = ANY (ARRAY['mykad'::text, 'passport'::text])));
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."example_table" ADD CONSTRAINT "example_table_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_request_declines" ADD CONSTRAINT "service_request_declines_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_request_declines" ADD CONSTRAINT "service_request_declines_request_id_provider_id_key" UNIQUE (request_id, provider_id);
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'resolved'::text, 'dismissed'::text])));
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_request_id_reporter_id_reported_user_id_key" UNIQUE (request_id, reporter_id, reported_user_id);
ALTER TABLE public."users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."provider_profiles" ADD CONSTRAINT "provider_profiles_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."provider_skills" ADD CONSTRAINT "provider_skills_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_requests" ADD CONSTRAINT "service_requests_client_id_fkey" FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_requests" ADD CONSTRAINT "service_requests_selected_provider_id_fkey" FOREIGN KEY (selected_provider_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_request_id_fkey" FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE;
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_client_id_fkey" FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."payment_records" ADD CONSTRAINT "payment_records_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_request_id_fkey" FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE;
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_reviews" ADD CONSTRAINT "service_reviews_reviewee_id_fkey" FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_request_id_fkey" FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE;
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."provider_profiles" ADD CONSTRAINT "provider_profiles_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."provider_specializations" ADD CONSTRAINT "provider_specializations_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."provider_weekly_availability" ADD CONSTRAINT "provider_weekly_availability_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."users" ADD CONSTRAINT "users_identity_verified_by_fkey" FOREIGN KEY (identity_verified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."service_requests" ADD CONSTRAINT "service_requests_cancelled_by_fkey" FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."service_request_declines" ADD CONSTRAINT "service_request_declines_request_id_fkey" FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE;
ALTER TABLE public."service_request_declines" ADD CONSTRAINT "service_request_declines_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_request_id_fkey" FOREIGN KEY (request_id) REFERENCES service_requests(request_id) ON DELETE CASCADE;
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_reported_user_id_fkey" FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."service_reports" ADD CONSTRAINT "service_reports_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_internal_messages_request_id_created_at ON public.internal_messages USING btree (request_id, created_at);
CREATE INDEX idx_internal_messages_receiver_id_is_read ON public.internal_messages USING btree (receiver_id, is_read);
CREATE INDEX provider_weekly_availability_day_idx ON public.provider_weekly_availability USING btree (day_of_week, start_time, end_time);
CREATE INDEX idx_provider_specializations_match ON public.provider_specializations USING btree (category, specialization, provider_id);
CREATE INDEX idx_verification_requests_user ON public.verification_requests USING btree (user_id, submitted_at DESC);
CREATE INDEX idx_verification_requests_status ON public.verification_requests USING btree (status, submitted_at DESC);
CREATE INDEX idx_service_request_declines_request ON public.service_request_declines USING btree (request_id);
CREATE INDEX idx_service_request_declines_provider ON public.service_request_declines USING btree (provider_id);
CREATE INDEX idx_service_reports_status ON public.service_reports USING btree (status, created_at DESC);
CREATE INDEX idx_service_reports_reporter ON public.service_reports USING btree (reporter_id, created_at DESC);
CREATE INDEX idx_service_reports_reported_user ON public.service_reports USING btree (reported_user_id, created_at DESC);
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
$function$;
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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

$function$;
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

$function$;
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

$function$;
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

$function$;
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

$function$;
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

$function$;
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

$function$;
CREATE TRIGGER trg_payment_id BEFORE INSERT ON public.payment_records FOR EACH ROW EXECUTE FUNCTION assign_payment_id();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER trg_notification_id BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION assign_notification_id();
CREATE TRIGGER trg_service_requests_id BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION assign_service_request_id();
CREATE TRIGGER trg_service_requests_updated BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_message_id BEFORE INSERT ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION assign_message_id();
CREATE TRIGGER trg_review_id BEFORE INSERT ON public.service_reviews FOR EACH ROW EXECUTE FUNCTION assign_review_id();
CREATE TRIGGER trg_provider_skills_code BEFORE INSERT ON public.provider_skills FOR EACH ROW EXECUTE FUNCTION assign_skill_code();
CREATE TRIGGER trg_provider_profiles_updated BEFORE UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION assign_user_code();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE public."payment_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."payment_records" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notifications" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."service_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."service_requests" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."internal_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."internal_messages" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."service_reviews" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."service_reviews" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."provider_skills" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."provider_skills" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."provider_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."provider_profiles" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."users" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."provider_weekly_availability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."provider_weekly_availability" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."provider_specializations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."provider_specializations" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."verification_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."verification_requests" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."example_table" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."example_table" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."service_request_declines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."service_request_declines" FROM PUBLIC,anon,authenticated;
ALTER TABLE public."service_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."service_reports" FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
('payment-proofs','payment-proofs',false,5242880,ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
('request-images','request-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp']),
('verification-documents','verification-documents',false,5242880,ARRAY['image/jpeg','image/png','application/pdf']),
('report-evidence','report-evidence',false,5242880,ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
CREATE POLICY staging_payment_proofs_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='payment-proofs' AND (split_part(name,'/',1)=auth.uid()::text OR public.current_user_role()='admin'));
CREATE POLICY staging_payment_proofs_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='payment-proofs' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_payment_proofs_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='payment-proofs' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_request_images_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='request-images' AND (split_part(name,'/',1)=auth.uid()::text OR public.current_user_role()='admin'));
CREATE POLICY staging_request_images_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='request-images' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_request_images_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='request-images' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_verification_documents_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='verification-documents' AND (split_part(name,'/',1)=auth.uid()::text OR public.current_user_role()='admin'));
CREATE POLICY staging_verification_documents_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='verification-documents' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_verification_documents_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='verification-documents' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_report_evidence_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='report-evidence' AND (split_part(name,'/',1)=auth.uid()::text OR public.current_user_role()='admin'));
CREATE POLICY staging_report_evidence_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='report-evidence' AND split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY staging_report_evidence_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='report-evidence' AND split_part(name,'/',1)=auth.uid()::text);
COMMIT;
