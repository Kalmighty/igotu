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
 IF NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE version='20261026.1' AND phase=1)
 THEN RAISE EXCEPTION 'Apply reviewed foundation first.'; END IF;
END $dependencies$;
CREATE FUNCTION igotu_backend_private.provider_service_requests(p_request_id text DEFAULT NULL,p_statuses text[] DEFAULT NULL)
RETURNS TABLE(request_id text,client_id uuid,selected_provider_id uuid,title text,category text,service_type text,description text,
 preferred_date date,preferred_time time,budget numeric,priority text,status text,created_at timestamptz,
 approximate_area text,location text,client_lat numeric,client_lng numeric,request_image_url text,cancellation_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_workspace('provider');
 RETURN QUERY SELECT r.request_id,r.client_id,r.selected_provider_id,r.title,r.category::text,r.service_type,CASE WHEN r.status::text IN ('confirmed','in_progress','completed') THEN r.description END,
 r.preferred_date,r.preferred_time,r.budget,r.priority::text,r.status::text,r.created_at,
 igotu_backend_private.coarse_area(r.client_lat,r.client_lng),
 CASE WHEN r.status::text IN ('confirmed','in_progress','completed') THEN r.location END,
 CASE WHEN r.status::text IN ('confirmed','in_progress','completed') THEN r.client_lat END,
 CASE WHEN r.status::text IN ('confirmed','in_progress','completed') THEN r.client_lng END,
 CASE WHEN r.status::text IN ('confirmed','in_progress','completed') THEN r.request_image_url END,r.cancellation_reason
 FROM public.service_requests r WHERE r.selected_provider_id=auth.uid()
 AND (p_request_id IS NULL OR r.request_id=p_request_id) AND (p_statuses IS NULL OR r.status::text=ANY(p_statuses)) ORDER BY r.created_at DESC;
END $$;
CREATE FUNCTION public.provider_service_requests(p_request_id text DEFAULT NULL,p_statuses text[] DEFAULT NULL)
RETURNS TABLE(request_id text,client_id uuid,selected_provider_id uuid,title text,category text,service_type text,description text,
 preferred_date date,preferred_time time,budget numeric,priority text,status text,created_at timestamptz,
 approximate_area text,location text,client_lat numeric,client_lng numeric,request_image_url text,cancellation_reason text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.provider_service_requests(p_request_id,p_statuses); $$;

CREATE FUNCTION igotu_backend_private.service_participants(p_request_ids text[])
RETURNS TABLE(request_id text,id uuid,full_name text,user_code text,role text,identity_verified boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_workspace();
 IF cardinality(p_request_ids)>100 OR NOT EXISTS(SELECT 1 FROM public.users WHERE users.id=auth.uid() AND users.role::text IN ('client','provider'))
 THEN RAISE EXCEPTION 'Bounded participant lookup required.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.request_id,u.id,u.full_name,u.user_code,u.role::text,igotu_backend_private.identity_approved(u.id)
 FROM public.service_requests r JOIN public.users u ON u.id=CASE WHEN r.client_id=auth.uid() THEN r.selected_provider_id ELSE r.client_id END
 WHERE r.request_id=ANY(p_request_ids) AND r.selected_provider_id IS NOT NULL
 AND (r.client_id=auth.uid() OR r.selected_provider_id=auth.uid());
END $$;
CREATE FUNCTION public.service_participants(p_request_ids text[])
RETURNS TABLE(request_id text,id uuid,full_name text,user_code text,role text,identity_verified boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.service_participants(p_request_ids); $$;

CREATE FUNCTION igotu_backend_private.recommended_provider_candidates(p_request_id text)
RETURNS TABLE(id uuid,user_code text,full_name text,bio text,location text,is_verified boolean,distance_km numeric,
 matched_specializations text[],has_weekly_hours boolean,average_rating numeric,total_reviews bigint,total_completed bigint,recent_feedback text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE r public.service_requests%rowtype; BEGIN
 PERFORM igotu_backend_private.require_workspace('client');
 SELECT * INTO r FROM public.service_requests WHERE request_id=p_request_id AND client_id=auth.uid() AND status::text='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Own pending request required.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.user_code,u.full_name,p.bio,igotu_backend_private.coarse_area(p.provider_lat,p.provider_lng),true,
 CASE WHEN r.client_lat BETWEEN -90 AND 90 AND r.client_lng BETWEEN -180 AND 180 AND p.provider_lat BETWEEN -90 AND 90 AND p.provider_lng BETWEEN -180 AND 180
 THEN (6371*2*asin(sqrt(least(1,greatest(0,power(sin(radians((p.provider_lat-r.client_lat)::double precision)/2),2)
 +cos(radians(r.client_lat::double precision))*cos(radians(p.provider_lat::double precision))*power(sin(radians((p.provider_lng-r.client_lng)::double precision)/2),2))))))::numeric END,
 ARRAY(SELECT DISTINCT s.specialization FROM public.provider_specializations s WHERE s.provider_id=u.id AND s.category=r.category::text AND s.specialization=r.service_type),
 EXISTS(SELECT 1 FROM public.provider_weekly_availability w WHERE w.provider_id=u.id),
 (SELECT avg(v.rating)::numeric FROM public.service_reviews v WHERE v.reviewee_id=u.id),
 (SELECT count(*) FROM public.service_reviews v WHERE v.reviewee_id=u.id),
 (SELECT count(*) FROM public.service_requests done WHERE done.selected_provider_id=u.id AND done.status::text='completed'),
 ARRAY(SELECT v.feedback FROM public.service_reviews v WHERE v.reviewee_id=u.id AND nullif(btrim(v.feedback),'') IS NOT NULL ORDER BY v.created_at DESC,v.id DESC LIMIT 2)
 FROM public.users u JOIN public.provider_profiles p ON p.provider_id=u.id
 WHERE igotu_backend_private.eligible_provider(u.id,r) ORDER BY 7 NULLS LAST,u.full_name,u.id;
END $$;
CREATE FUNCTION public.recommended_provider_candidates(p_request_id text)
RETURNS TABLE(id uuid,user_code text,full_name text,bio text,location text,is_verified boolean,distance_km numeric,
 matched_specializations text[],has_weekly_hours boolean,average_rating numeric,total_reviews bigint,total_completed bigint,recent_feedback text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.recommended_provider_candidates(p_request_id); $$;

-- Pure canonical-path decoder. Legacy URL-only rows are resolved at read time;
-- mismatches, foreign origins/paths, missing objects and foreign owners never fallback.
CREATE FUNCTION igotu_backend_private.decode_path(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE pos integer:=1; bytes bytea:=''::bytea; ch text; BEGIN
 IF value IS NULL THEN RETURN NULL; END IF;
 WHILE pos<=length(value) LOOP ch:=substr(value,pos,1);
 IF ch='%' THEN IF substr(value,pos+1,2)!~'^[0-9A-Fa-f]{2}$' THEN RETURN NULL; END IF;
 bytes:=bytes||decode(substr(value,pos+1,2),'hex');pos:=pos+3;
 ELSE bytes:=bytes||convert_to(ch,'UTF8');pos:=pos+1; END IF; END LOOP;
 RETURN convert_from(bytes,'UTF8'); EXCEPTION WHEN character_not_in_repertoire OR invalid_parameter_value THEN RETURN NULL; END $$;
CREATE FUNCTION igotu_backend_private.receipt_path(path text,url text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; suffix text; result text:=nullif(path,''); BEGIN
 SELECT 'https://'||project_ref||'.supabase.co/storage/v1/object/' INTO origin FROM igotu_backend_private.installation;
 IF nullif(url,'') IS NOT NULL THEN
 IF left(url,length(origin)) IS DISTINCT FROM origin THEN RETURN NULL; END IF;
 suffix:=substring(url FROM length(origin)+1);
 IF suffix!~'^(public|authenticated|sign)/payment-proofs/' THEN RETURN NULL; END IF;
 suffix:=regexp_replace(suffix,'^(public|authenticated|sign)/payment-proofs/','');
 suffix:=igotu_backend_private.decode_path(split_part(split_part(suffix,'?',1),'#',1));
 IF suffix IS NULL OR (result IS NOT NULL AND result<>suffix) THEN RETURN NULL; END IF; result:=coalesce(result,suffix);
 END IF;
 IF result IS NULL OR result='' OR result LIKE '/%' OR result~'(^|/)[.][.](/|$)' OR result~'[[:cntrl:]]' OR position(chr(92) IN result)>0 THEN RETURN NULL; END IF;
 RETURN result;
END $$;
CREATE FUNCTION igotu_backend_private.payment_proof_reference(p_request_id text)
RETURNS TABLE(payment_id text,proof_path text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM igotu_backend_private.require_workspace();
 RETURN QUERY SELECT p.payment_id,path.value FROM public.payment_records p JOIN public.service_requests r ON r.request_id=p.request_id
 CROSS JOIN LATERAL(SELECT igotu_backend_private.receipt_path(p.proof_path,p.proof_url) AS value) path
 JOIN storage.objects o ON o.bucket_id='payment-proofs' AND o.name=path.value
 WHERE r.request_id=p_request_id AND igotu_backend_private.participant(r.request_id)
 AND p.client_id=r.client_id AND p.provider_id=r.selected_provider_id AND split_part(o.name,'/',1)=p.client_id::text
 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=p.client_id::text;
END $$;
CREATE FUNCTION public.payment_proof_reference(p_request_id text) RETURNS TABLE(payment_id text,proof_path text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.payment_proof_reference(p_request_id); $$;
CREATE FUNCTION igotu_backend_private.can_read_receipt(name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT igotu_backend_private.workspace() AND (igotu_backend_private.is_admin() OR
 (igotu_backend_private.workspace('client') AND split_part(name,'/',1)=auth.uid()::text AND EXISTS(SELECT 1 FROM storage.objects o
 WHERE o.bucket_id='payment-proofs' AND o.name=$1 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text)) OR
 EXISTS(SELECT 1 FROM public.payment_records p JOIN public.service_requests r ON r.request_id=p.request_id WHERE r.selected_provider_id=auth.uid()
 AND p.provider_id=auth.uid() AND p.client_id=r.client_id AND igotu_backend_private.receipt_path(p.proof_path,p.proof_url)=$1
 AND split_part($1,'/',1)=p.client_id::text AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='payment-proofs' AND o.name=$1
 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=p.client_id::text))); $$;

CREATE FUNCTION igotu_backend_private.verification_reconciliation_queue(p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid,user_code text,full_name text,role text,status text,latest_status text,recorded_consent boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT igotu_backend_private.is_admin() THEN RAISE EXCEPTION 'Active Admin required.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.user_code,u.full_name,u.role::text,u.status::text,v.status,coalesce(v.age_confirmed AND v.privacy_consent,false)
 FROM public.users u LEFT JOIN LATERAL(SELECT * FROM public.verification_requests v WHERE v.user_id=u.id ORDER BY v.submitted_at DESC,v.id DESC LIMIT 1) v ON true
 WHERE u.role::text IN ('client','provider') AND u.identity_verified IS TRUE AND NOT igotu_backend_private.identity_approved(u.id)
 AND (p_after IS NULL OR u.id>p_after) ORDER BY u.id LIMIT 100;
END $$;
CREATE FUNCTION public.verification_reconciliation_queue(p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid,user_code text,full_name text,role text,status text,latest_status text,recorded_consent boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM igotu_backend_private.verification_reconciliation_queue(p_after); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igotu_backend_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION igotu_backend_private.is_admin(),igotu_backend_private.workspace(text),igotu_backend_private.applicant(),igotu_backend_private.participant(text),igotu_backend_private.can_read_receipt(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION igotu_backend_private.provider_service_requests(text,text[]),igotu_backend_private.service_participants(text[]),igotu_backend_private.recommended_provider_candidates(text),igotu_backend_private.payment_proof_reference(text),igotu_backend_private.verification_reconciliation_queue(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.provider_service_requests(text,text[]),public.service_participants(text[]),public.recommended_provider_candidates(text),public.payment_proof_reference(text),public.verification_reconciliation_queue(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.provider_service_requests(text,text[]),public.service_participants(text[]),public.recommended_provider_candidates(text),public.payment_proof_reference(text),public.verification_reconciliation_queue(uuid) TO authenticated;
UPDATE igotu_backend_private.installation SET phase=2 WHERE version='20261026.1';
COMMIT;
