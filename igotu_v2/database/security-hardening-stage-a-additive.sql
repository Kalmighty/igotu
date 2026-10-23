-- IGotU Stage A: ADDITIVE APIs only -- REVIEW DRAFT, NEVER EXECUTED HERE.
-- Apply independently of Stage C. This file does NOT remove existing access,
-- change a bucket/policy/application RPC, enable triggers or change JavaScript.
-- Existing privacy weaknesses remain until the tested Stage C cutover.
-- Fresh install only: collision checks intentionally reject replacing an existing
-- schema/API silently. Inspect any collision; do not drop production objects.
-- Read security-hardening-rollout.md before any later approved deployment.
-- SECURITY DEFINER readers deliberately cross table RLS to expose a narrow,
-- caller-validated projection. Public wrappers are SECURITY INVOKER. No raw
-- service request composite/JSON is ever returned by the Provider API.
-- igotu_private must remain outside Supabase's exposed API schemas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $stage_a_preflight$
DECLARE v_table text; v_column record;
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Stage A expects the postgres deployment role.';
    END IF;
    IF to_regnamespace('igotu_private') IS NOT NULL
       OR to_regprocedure('public.provider_service_requests(text,text[])') IS NOT NULL
       OR to_regprocedure('public.provider_match_metadata(text)') IS NOT NULL
       OR to_regprocedure('public.payment_proof_reference(text)') IS NOT NULL THEN
        RAISE EXCEPTION 'Stage A objects already exist; inspect installation/collisions instead of replacing them.';
    END IF;
    IF COALESCE(current_setting('pgrst.db_schemas', true), '')
        ~ '(^|,)\s*igotu_private\s*(,|$)' THEN
        RAISE EXCEPTION 'igotu_private must not be an exposed API schema.';
    END IF;
    FOREACH v_table IN ARRAY ARRAY['users','provider_profiles','service_requests',
        'provider_specializations','service_request_declines','payment_records',
        'internal_messages','service_reviews','verification_requests','notifications'] LOOP
        IF to_regclass('public.' || v_table) IS NULL THEN
            RAISE EXCEPTION 'Missing prerequisite public.%', v_table;
        END IF;
    END LOOP;
    -- PL/pgSQL query bodies are planned on first use. Check critical projection
    -- and legacy-receipt columns now instead of installing an unusable API.
    FOR v_column IN
        SELECT x.table_name, unnest(x.column_names) AS column_name FROM (VALUES
            ('service_requests', ARRAY['request_id','client_id','selected_provider_id',
                'title','category','service_type','description','preferred_date','preferred_time',
                'budget','priority','status','created_at','location','client_lat','client_lng',
                'request_image_url','cancellation_reason']),
            ('payment_records', ARRAY['payment_id','request_id','client_id','provider_id',
                'proof_path','proof_url','amount','payment_method']),
            ('provider_profiles', ARRAY['provider_id','is_available']),
            ('users', ARRAY['id','role','status'])
        ) AS x(table_name,column_names)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_attribute a
            WHERE a.attrelid=to_regclass('public.' || v_column.table_name)
              AND a.attname=v_column.column_name AND a.attnum>0 AND NOT a.attisdropped) THEN
            RAISE EXCEPTION 'Missing API prerequisite %.%.',v_column.table_name,v_column.column_name;
        END IF;
    END LOOP;
END;
$stage_a_preflight$;
CREATE SCHEMA igotu_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA igotu_private FROM PUBLIC, anon, authenticated;
-- Safe boolean policy predicates need anon USAGE/EXECUTE in Stage C so policy
-- evaluation does not break other buckets. They return false without auth.uid().
GRANT USAGE ON SCHEMA igotu_private TO anon, authenticated;

CREATE FUNCTION igotu_private.is_active_user(p_role text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = auth.uid()
          AND u.status::text = 'active'
          AND (p_role IS NULL OR u.role::text = p_role)
    );
$fn$;

CREATE FUNCTION igotu_private.can_read_service(
    p_client_id uuid, p_provider_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT igotu_private.is_active_user('admin')
        OR (igotu_private.is_active_user('client') AND p_client_id = auth.uid())
        OR (igotu_private.is_active_user('provider') AND p_provider_id = auth.uid());
$fn$;

-- Raw table access after Stage C: Clients/Admin retain their intended rows.
-- Providers get raw rows ONLY after confirmation; provider_selected/cancelled
-- rows require the redacted API. Unknown/future states default to no raw access.
CREATE FUNCTION igotu_private.can_read_raw_service(
    p_client_id uuid, p_provider_id uuid, p_status text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT igotu_private.is_active_user('admin')
        OR (igotu_private.is_active_user('client') AND p_client_id = auth.uid())
        OR (igotu_private.is_active_user('provider') AND p_provider_id = auth.uid()
            AND p_status IN ('confirmed','in_progress','completed'));
$fn$;

-- Free-form addresses cannot safely be truncated into localities. Return a
-- coarse 0.1-degree grid (~11 km north/south) instead, never parse location text.
-- This is NOT an exact-coordinate field. For invalid/missing coordinates, give
-- a fixed fallback. A later structured-locality design would be a separate change.
CREATE FUNCTION igotu_private.approximate_service_area(p_lat numeric, p_lng numeric)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $fn$
    SELECT CASE WHEN p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180 THEN
        'Approximate grid: latitude ' || (floor(p_lat * 10) / 10)::text || ' to '
        || (least(floor(p_lat * 10) / 10 + 0.1, 90))::text || ', longitude '
        || (floor(p_lng * 10) / 10)::text || ' to '
        || (least(floor(p_lng * 10) / 10 + 0.1, 180))::text
        ELSE 'Approximate area unavailable; exact location after confirmation'
    END;
$fn$;

CREATE FUNCTION igotu_private.provider_service_requests(
    p_request_id text DEFAULT NULL, p_statuses text[] DEFAULT NULL
) RETURNS TABLE (
    request_id text, client_id uuid, selected_provider_id uuid,
    title text, category text, service_type text, description text,
    preferred_date date, preferred_time time without time zone,
    budget numeric, priority text, status text, created_at timestamptz,
    approximate_area text, location text, client_lat numeric, client_lng numeric,
    request_image_url text, cancellation_reason text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF NOT igotu_private.is_active_user('provider') THEN
        RAISE EXCEPTION 'Only an active Provider can read assigned service requests.';
    END IF;
    RETURN QUERY
    SELECT sr.request_id::text, sr.client_id, sr.selected_provider_id,
        sr.title::text, sr.category::text, sr.service_type::text, sr.description::text,
        sr.preferred_date::date, sr.preferred_time::time,
        sr.budget::numeric, sr.priority::text, sr.status::text, sr.created_at::timestamptz,
        igotu_private.approximate_service_area(sr.client_lat::numeric, sr.client_lng::numeric),
        CASE WHEN sr.status::text IN ('confirmed','in_progress','completed') THEN sr.location::text END,
        CASE WHEN sr.status::text IN ('confirmed','in_progress','completed') THEN sr.client_lat::numeric END,
        CASE WHEN sr.status::text IN ('confirmed','in_progress','completed') THEN sr.client_lng::numeric END,
        sr.request_image_url::text, sr.cancellation_reason::text
    FROM public.service_requests sr
    WHERE sr.selected_provider_id = auth.uid()
      AND (p_request_id IS NULL OR sr.request_id = p_request_id)
      AND (p_statuses IS NULL OR sr.status::text = ANY(p_statuses))
    ORDER BY sr.created_at DESC;
END;
$fn$;
CREATE FUNCTION public.provider_service_requests(
    p_request_id text DEFAULT NULL, p_statuses text[] DEFAULT NULL
) RETURNS TABLE (
    request_id text, client_id uuid, selected_provider_id uuid,
    title text, category text, service_type text, description text,
    preferred_date date, preferred_time time without time zone,
    budget numeric, priority text, status text, created_at timestamptz,
    approximate_area text, location text, client_lat numeric, client_lng numeric,
    request_image_url text, cancellation_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
    SELECT * FROM igotu_private.provider_service_requests(p_request_id, p_statuses);
$fn$;
-- Allowlist excludes every future service_requests column by default. For
-- provider_selected, location/client_lat/client_lng are SQL NULL. Cancelled and
-- unknown states remain redacted because no reliable prior-confirmation marker
-- was supplied. Free text/images/messages intentionally shared by a Client are
-- not automatically content-redacted by this structured-location API.

CREATE FUNCTION igotu_private.provider_match_metadata(p_request_id text)
RETURNS TABLE (provider_id uuid, is_booked boolean, completed_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_request public.service_requests%ROWTYPE;
BEGIN
    IF NOT igotu_private.is_active_user('client') THEN
        RAISE EXCEPTION 'Only an active Client can request matching metadata.';
    END IF;
    SELECT * INTO v_request FROM public.service_requests sr
    WHERE sr.request_id = p_request_id AND sr.client_id = auth.uid()
      AND sr.status::text = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Own pending service request required.';
    END IF;
    RETURN QUERY
    SELECT pp.provider_id,
        EXISTS (SELECT 1 FROM public.service_requests busy
            WHERE busy.selected_provider_id = pp.provider_id
              AND busy.request_id <> v_request.request_id
              AND busy.status::text IN ('provider_selected','confirmed','in_progress')
              AND busy.preferred_date = v_request.preferred_date
              AND busy.preferred_time = v_request.preferred_time),
        (SELECT count(*) FROM public.service_requests done
            WHERE done.selected_provider_id = pp.provider_id AND done.status::text = 'completed')
    FROM public.provider_profiles pp JOIN public.users u ON u.id = pp.provider_id
    WHERE u.role::text = 'provider' AND u.status::text = 'active' AND pp.is_available
      AND EXISTS (SELECT 1 FROM public.provider_specializations ps
          WHERE ps.provider_id = pp.provider_id
            AND ps.category::text = v_request.category::text
            AND ps.specialization = v_request.service_type)
      AND NOT EXISTS (SELECT 1 FROM public.service_request_declines d
          WHERE d.request_id = v_request.request_id AND d.provider_id = pp.provider_id);
END;
$fn$;

CREATE FUNCTION public.provider_match_metadata(p_request_id text)
RETURNS TABLE (provider_id uuid, is_booked boolean, completed_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
    SELECT * FROM igotu_private.provider_match_metadata(p_request_id);
$fn$;

-- Decode ONLY a URL PATH, once; '+' stays '+'. Never decode a stored object
-- name a second time. Reject malformed percent encoding or invalid UTF-8.
CREATE FUNCTION igotu_private.decode_url_path(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_pos integer := 1; v_bytes bytea := ''::bytea; v_char text;
BEGIN
    IF p_value IS NULL THEN RETURN NULL; END IF;
    WHILE v_pos <= length(p_value) LOOP
        v_char := substr(p_value, v_pos, 1);
        IF v_char = '%' THEN
            IF substr(p_value, v_pos + 1, 2) !~ '^[0-9A-Fa-f]{2}$' THEN RETURN NULL; END IF;
            v_bytes := v_bytes || decode(substr(p_value, v_pos + 1, 2), 'hex');
            v_pos := v_pos + 3;
        ELSE
            v_bytes := v_bytes || convert_to(v_char, 'UTF8');
            v_pos := v_pos + 1;
        END IF;
    END LOOP;
    RETURN convert_from(v_bytes, 'UTF8');
EXCEPTION WHEN character_not_in_repertoire OR invalid_parameter_value THEN
    RETURN NULL;
END;
$fn$;

-- Supports path-only, URL-only and consistent path+URL legacy rows WITHOUT
-- updating historical data. Only this project's exact Storage host/bucket is
-- accepted. Custom CDN/external URLs or conflicting paths require manual review.
CREATE FUNCTION igotu_private.payment_proof_path(p_path text, p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_path text := nullif(p_path, ''); v_url_path text;
BEGIN
    IF nullif(p_url, '') IS NOT NULL THEN
        v_url_path := substring(p_url FROM
            '^https://giqtnbwyktbnbhdvjraa[.]supabase[.]co/storage/v1/object/(?:public|authenticated|sign)/payment-proofs/(.+)$');
        IF v_url_path IS NULL THEN RETURN NULL; END IF;
        v_url_path := igotu_private.decode_url_path(split_part(split_part(v_url_path, '?', 1), '#', 1));
        IF v_url_path IS NULL OR (v_path IS NOT NULL AND v_path <> v_url_path) THEN RETURN NULL; END IF;
        v_path := COALESCE(v_path, v_url_path);
    END IF;
    IF v_path IS NULL OR v_path = '' OR v_path LIKE '/%'
       OR v_path ~ '(^|/)\.\.(/|$)' OR v_path ~ '[[:cntrl:]]'
       OR position(chr(92) IN v_path) > 0 THEN RETURN NULL; END IF;
    RETURN v_path;
END;
$fn$;

CREATE FUNCTION igotu_private.payment_proof_reference(p_request_id text)
RETURNS TABLE (payment_id text, proof_path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF NOT igotu_private.is_active_user() THEN
        RAISE EXCEPTION 'An active account is required.';
    END IF;
    RETURN QUERY
    SELECT DISTINCT pr.payment_id::text, path.object_name
    FROM public.payment_records pr
    JOIN public.service_requests sr ON sr.request_id = pr.request_id
    CROSS JOIN LATERAL (SELECT igotu_private.payment_proof_path(pr.proof_path, pr.proof_url) AS object_name) path
    JOIN storage.objects o ON o.bucket_id = 'payment-proofs' AND o.name = path.object_name
    WHERE pr.request_id = p_request_id
      AND pr.client_id = sr.client_id AND pr.provider_id = sr.selected_provider_id
      AND igotu_private.can_read_service(sr.client_id, sr.selected_provider_id)
      AND (storage.foldername(o.name))[1] = sr.client_id::text
      AND COALESCE(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = sr.client_id::text;
END;
$fn$;
CREATE FUNCTION public.payment_proof_reference(p_request_id text)
RETURNS TABLE (payment_id text, proof_path text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
    SELECT * FROM igotu_private.payment_proof_reference(p_request_id);
$fn$;

CREATE FUNCTION igotu_private.can_read_payment_proof(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT auth.uid() IS NOT NULL AND (
        igotu_private.is_active_user('admin')
        OR (igotu_private.is_active_user('client') AND EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = 'payment-proofs' AND o.name = p_name
              AND (storage.foldername(o.name))[1] = auth.uid()::text
              AND COALESCE(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = auth.uid()::text
        ))
        OR (igotu_private.is_active_user('provider') AND EXISTS (
            SELECT 1 FROM public.payment_records pr
            JOIN public.service_requests sr ON sr.request_id = pr.request_id
            WHERE igotu_private.payment_proof_path(pr.proof_path, pr.proof_url) = p_name AND pr.provider_id = auth.uid()
              AND sr.selected_provider_id = auth.uid() AND pr.client_id = sr.client_id
              AND EXISTS (SELECT 1 FROM storage.objects o
                  WHERE o.bucket_id = 'payment-proofs' AND o.name = p_name
                    AND (storage.foldername(o.name))[1] = sr.client_id::text
                    AND COALESCE(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = sr.client_id::text)
        ))
    );
$fn$;

CREATE FUNCTION igotu_private.valid_payment(
    p_request_id text, p_client_id uuid, p_provider_id uuid,
    p_amount numeric, p_method text, p_proof_path text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT igotu_private.is_active_user('client') AND p_client_id = auth.uid()
      AND p_amount > 0 AND p_amount <> 'NaN'::numeric
      AND p_amount NOT IN ('Infinity'::numeric, '-Infinity'::numeric)
      AND p_method IN ('Cash','QR Transfer','Bank Transfer','Other')
      AND EXISTS (
        SELECT 1 FROM public.service_requests sr
        WHERE sr.request_id = p_request_id AND sr.client_id = auth.uid()
          AND sr.selected_provider_id = p_provider_id AND sr.status::text = 'completed'
      )
      AND (p_method NOT IN ('QR Transfer','Bank Transfer') OR p_proof_path IS NOT NULL)
      AND (p_proof_path IS NULL OR EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'payment-proofs' AND o.name = p_proof_path
          AND (storage.foldername(o.name))[1] = auth.uid()::text
          AND COALESCE(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = auth.uid()::text
      ));
$fn$;

-- Needed because Providers cannot read raw provider_selected rows after C.
-- Policy checks must not accidentally depend on that now-denied raw SELECT.
CREATE FUNCTION igotu_private.valid_message(p_request_id text, p_sender_id uuid, p_receiver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
    SELECT p_sender_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.service_requests sr
        WHERE sr.request_id = p_request_id
          AND sr.status::text IN ('provider_selected','confirmed','in_progress','completed')
          AND ((igotu_private.is_active_user('client') AND sr.client_id = p_sender_id
                AND sr.selected_provider_id = p_receiver_id)
            OR (igotu_private.is_active_user('provider') AND sr.selected_provider_id = p_sender_id
                AND sr.client_id = p_receiver_id))
    );
$fn$;

-- DORMANT notification functions: this Stage A file creates NO triggers and
-- gives no browser EXECUTE permission on these writers. Existing browser event
-- notifications continue unchanged until the coordinated Stage C handoff.
CREATE FUNCTION igotu_private.emit_notification(
    p_user_id uuid, p_title text, p_message text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF p_user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = p_user_id
          AND u.role::text IN ('client','provider')
    ) THEN
        INSERT INTO public.notifications(user_id, title, message, is_read)
        VALUES (p_user_id, p_title, p_message, false);
    END IF;
END;
$fn$;

CREATE FUNCTION igotu_private.notify_service_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.selected_provider_id IS NOT DISTINCT FROM OLD.selected_provider_id THEN
        RETURN NEW;
    END IF;
    CASE NEW.status::text
    WHEN 'provider_selected' THEN
        PERFORM igotu_private.emit_notification(NEW.selected_provider_id,
            'New service request', 'A Client selected you for service ' || NEW.request_id || '.');
    WHEN 'confirmed' THEN
        PERFORM igotu_private.emit_notification(NEW.client_id,
            'Service confirmed', 'Your Provider confirmed service ' || NEW.request_id || '.');
    WHEN 'in_progress' THEN
        PERFORM igotu_private.emit_notification(NEW.client_id,
            'Service started', 'Your Provider started service ' || NEW.request_id || '.');
    WHEN 'completed' THEN
        PERFORM igotu_private.emit_notification(NEW.selected_provider_id,
            'Service completed', 'The Client completed service ' || NEW.request_id || '.');
    WHEN 'cancelled' THEN
        PERFORM igotu_private.emit_notification(OLD.selected_provider_id,
            'Request cancelled', 'Service ' || NEW.request_id || ' was cancelled. Reason: '
                || COALESCE(NEW.cancellation_reason, 'Not provided'));
    WHEN 'pending' THEN
        IF OLD.status::text = 'provider_selected' AND OLD.selected_provider_id IS NOT NULL
           AND NEW.selected_provider_id IS NULL THEN
            PERFORM igotu_private.emit_notification(NEW.client_id, 'Provider declined',
                'Please choose another recommended Provider for service ' || NEW.request_id || '.');
        END IF;
    ELSE NULL;
    END CASE;
    RETURN NEW;
END;
$fn$;

CREATE FUNCTION igotu_private.notify_insert_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_service public.service_requests%ROWTYPE;
BEGIN
    IF TG_TABLE_NAME = 'internal_messages' THEN
        PERFORM igotu_private.emit_notification(NEW.receiver_id, 'New message',
            'You received a message about service ' || NEW.request_id || '.');
    ELSIF TG_TABLE_NAME = 'payment_records' THEN
        PERFORM igotu_private.emit_notification(NEW.provider_id, 'Payment recorded',
            'The Client recorded an offline payment for service ' || NEW.request_id || '.');
    ELSIF TG_TABLE_NAME = 'service_reviews' THEN
        SELECT * INTO v_service FROM public.service_requests sr WHERE sr.request_id = NEW.request_id;
        -- Do not turn unverified review claims into notifications for arbitrary
        -- recipients; leave unrelated review-policy improvements outside scope.
        IF FOUND AND v_service.status::text = 'completed'
           AND ((NEW.reviewer_id = v_service.client_id AND NEW.reviewee_id = v_service.selected_provider_id)
             OR (NEW.reviewer_id = v_service.selected_provider_id AND NEW.reviewee_id = v_service.client_id))
           AND (auth.uid() IS NULL OR auth.uid() = NEW.reviewer_id) THEN
            PERFORM igotu_private.emit_notification(NEW.reviewee_id, 'New review received',
                'A review was submitted for service ' || NEW.request_id || '.');
        END IF;
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE FUNCTION igotu_private.notify_verification_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM igotu_private.emit_notification(NEW.user_id, 'Verification submitted',
            'Your identity verification was submitted for Admin review.');
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
        PERFORM igotu_private.emit_notification(NEW.user_id,
            CASE WHEN NEW.status = 'approved' THEN 'Identity verified' ELSE 'Verification rejected' END,
            CASE WHEN NEW.status = 'approved' THEN 'Your identity verification was approved.'
                 ELSE 'Your identity verification was rejected. Reason: ' || COALESCE(NEW.admin_note, 'Not provided') END);
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE FUNCTION igotu_private.notify_account_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM igotu_private.emit_notification(NEW.id,
            CASE WHEN NEW.status::text = 'active' THEN 'Account activated' ELSE 'Account suspended' END,
            'Your IGotU account status was changed to ' || NEW.status::text || '.');
    END IF;
    RETURN NEW;
END;
$fn$;

-- Restrict ONLY newly-created functions; existing RPC/helper grants are unchanged.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igotu_private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION igotu_private.is_active_user(text),
    igotu_private.can_read_service(uuid,uuid),
    igotu_private.can_read_raw_service(uuid,uuid,text),
    igotu_private.can_read_payment_proof(text),
    igotu_private.valid_payment(text,uuid,uuid,numeric,text,text),
    igotu_private.valid_message(text,uuid,uuid) TO anon, authenticated;
-- Public wrappers call guarded private readers with the caller's JWT context.
GRANT EXECUTE ON FUNCTION igotu_private.provider_service_requests(text,text[]),
    igotu_private.provider_match_metadata(text),
    igotu_private.payment_proof_reference(text) TO authenticated;
-- Invoker parsing helpers are needed by authenticated callers of the guarded
-- functions and are pure (no records, no writes). They are not API-exposed.
GRANT EXECUTE ON FUNCTION igotu_private.decode_url_path(text),
    igotu_private.payment_proof_path(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.provider_service_requests(text,text[]),
    public.provider_match_metadata(text), public.payment_proof_reference(text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provider_service_requests(text,text[]),
    public.provider_match_metadata(text), public.payment_proof_reference(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- READ-ONLY, OPTIONAL INVENTORY AFTER AN APPROVED STAGE A DEPLOYMENT.
-- Do NOT interpret successful RPC tests as proof that legacy raw access is fixed:
-- existing access is deliberately unchanged until Stage C.
SELECT count(*) FILTER (WHERE nullif(proof_path,'') IS NOT NULL AND nullif(proof_url,'') IS NULL) AS path_only,
       count(*) FILTER (WHERE nullif(proof_path,'') IS NULL AND nullif(proof_url,'') IS NOT NULL) AS url_only,
       count(*) FILTER (WHERE nullif(proof_path,'') IS NOT NULL AND nullif(proof_url,'') IS NOT NULL) AS both,
       count(*) FILTER (WHERE nullif(proof_path,'') IS NULL AND nullif(proof_url,'') IS NULL) AS neither,
       count(*) FILTER (WHERE (nullif(proof_path,'') IS NOT NULL OR nullif(proof_url,'') IS NOT NULL)
          AND igotu_private.payment_proof_path(proof_path, proof_url) IS NULL) AS unresolved_or_conflicting
FROM public.payment_records;
SELECT count(*) AS proof_rows_with_missing_object_or_owner
FROM public.payment_records pr
LEFT JOIN storage.objects o ON o.bucket_id = 'payment-proofs'
    AND o.name = igotu_private.payment_proof_path(pr.proof_path, pr.proof_url)
WHERE (nullif(pr.proof_path,'') IS NOT NULL OR nullif(pr.proof_url,'') IS NOT NULL)
  AND (o.name IS NULL OR (storage.foldername(o.name))[1] IS DISTINCT FROM pr.client_id::text
       OR COALESCE(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') IS DISTINCT FROM pr.client_id::text);
SELECT p.oid::regprocedure AS signature, p.prosecdef, p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid = to_regprocedure('public.current_user_role()');
SELECT pg_get_functiondef(p.oid) AS role_helper_definition
FROM pg_proc p WHERE p.oid = to_regprocedure('public.current_user_role()');
-- Inspect role-helper policy dependencies. PUBLIC means anon may also need it;
-- catalog dependencies do not reveal every dynamic/indirect function call.
SELECT pol.polname, pol.polrelid::regclass AS table_name, pol.polroles, pol.polcmd
FROM pg_depend d JOIN pg_policy pol ON d.classid = 'pg_policy'::regclass AND pol.oid = d.objid
WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = to_regprocedure('public.current_user_role()');
SELECT t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t
WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname = 'on_auth_user_created';
SELECT id, public FROM storage.buckets WHERE id = 'payment-proofs';
-- Expected: existing bucket value unchanged; no igotu_notify_* trigger installed.
SELECT t.tgname FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname LIKE 'igotu_notify_%';
