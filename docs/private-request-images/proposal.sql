-- REVIEW ONLY. NOT A MIGRATION; NOT EXECUTED. Separate explicit approval required.
-- Exact staging project only. Do not set these gates without reviewed evidence.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;
DO $preflight$
DECLARE actual text;
BEGIN
 IF current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
 OR current_setting('igotu.integration.project_ref',true) IS DISTINCT FROM 'oqalpauljjhytnrpzcqp'
 OR current_setting('igotu.integration.staging_only',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.catalog_reviewed',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.writes_paused',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.private_schema_verified',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.images.execution_approved',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Explicit staging authorization and documented preflight evidence required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
 THEN RAISE EXCEPTION 'Reviewed definer owner must bypass recursive Storage RLS'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
 OR EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass
   AND (pg_has_role('anon',relowner,'USAGE') OR pg_has_role('authenticated',relowner,'USAGE')))
 THEN RAISE EXCEPTION 'Storage RLS and non-owner/non-bypass browser roles required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM igotu_backend_private.installation WHERE project_ref='oqalpauljjhytnrpzcqp' AND phase=4)
 THEN RAISE EXCEPTION 'Installed phase-4 staging backend required'; END IF;
 IF to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RAISE EXCEPTION 'Supported Storage operation-aware authorization required; do not emulate or bypass'; END IF;
 actual:=md5(pg_get_functiondef('storage.allow_only_operation(text)'::regprocedure));
 IF current_setting('igotu.images.reviewed_operation_md5',true) IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Storage operation helper fingerprint not reviewed/matched'; END IF;
 -- Live rendered function/policy evidence is not available in this offline review.
 -- These independently captured AND reviewed hashes are intentionally unset.
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.client_save_request_image(text,text,text)'::regprocedure AND proowner='postgres'::regrole AND prosecdef) THEN RAISE EXCEPTION 'Unexpected save RPC owner/security mode'; END IF;
 actual := md5(pg_get_functiondef('public.client_save_request_image(text,text,text)'::regprocedure));
 IF current_setting('igotu.images.reviewed_save_md5',true) IS DISTINCT FROM actual
 THEN RAISE EXCEPTION 'Save RPC fingerprint not reviewed/matched'; END IF;
 SELECT md5(coalesce(string_agg(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||'|'||polname||'|'||polcmd||'|'||polpermissive::text||'|'||polroles::text,E'\n' ORDER BY polname),''))
 INTO actual FROM pg_policy WHERE polrelid='storage.objects'::regclass;
 IF current_setting('igotu.images.reviewed_storage_policies_md5',true) IS DISTINCT FROM actual
 THEN RAISE EXCEPTION 'Complete Storage policy inventory not reviewed/matched'; END IF;
 IF EXISTS (SELECT 1 FROM regexp_split_to_table(coalesce(current_setting('pgrst.db_schemas',true),''),',') s WHERE btrim(s,' "')='igotu_backend_private')
 THEN RAISE EXCEPTION 'Private schema must not be exposed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-images')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('request_image_reference','request_image_access_contract'))
 THEN RAISE EXCEPTION 'Missing bucket or conflicting image API; stop for review'; END IF;
END $preflight$;

-- Resolve only this staging project's exact canonical legacy URLs. Never fetch URLs.
CREATE FUNCTION igotu_backend_private.request_image_path(p_path text,p_url text,p_client uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE candidate text; prefix text;
BEGIN
 prefix := 'https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/';
 candidate := nullif(p_path,'');
 IF candidate IS NULL AND left(p_url,length(prefix))=prefix THEN candidate:=substr(p_url,length(prefix)+1); END IF;
 IF candidate IS NULL OR candidate !~ '^[A-Za-z0-9_/-]+[.](jpg|jpeg|png|webp)$'
 OR candidate ~ '(^|/)[.][.]?(/|$)' OR split_part(candidate,'/',1) IS DISTINCT FROM p_client::text
 OR (nullif(p_url,'') IS NOT NULL AND p_url IS DISTINCT FROM prefix||candidate)
 THEN RETURN NULL; END IF;
 RETURN candidate;
END $body$;

CREATE FUNCTION igotu_backend_private.can_read_request_image(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT auth.uid() IS NOT NULL AND igotu_backend_private.workspace() AND EXISTS (
  SELECT 1 FROM public.service_requests r JOIN storage.objects o ON o.bucket_id='request-images' AND o.name=p_name
  WHERE igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id)=p_name
  AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=r.client_id::text
  AND (igotu_backend_private.is_admin() OR (igotu_backend_private.workspace('client') AND r.client_id=auth.uid())
       OR (igotu_backend_private.workspace('provider') AND r.selected_provider_id=auth.uid() AND r.status::text IN ('confirmed','in_progress','completed')))
 );
$body$;

CREATE FUNCTION igotu_backend_private.request_image_reference(p_request_id text)
RETURNS TABLE(image_path text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
BEGIN
 PERFORM igotu_backend_private.require_workspace();
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-images' AND public IS FALSE)
 THEN RAISE EXCEPTION 'Private request-image cutover required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id)
 FROM public.service_requests r
 WHERE r.request_id=p_request_id
 AND (igotu_backend_private.is_admin() OR (igotu_backend_private.workspace('client') AND r.client_id=auth.uid())
      OR (igotu_backend_private.workspace('provider') AND r.selected_provider_id=auth.uid() AND r.status::text IN ('confirmed','in_progress','completed')))
 AND igotu_backend_private.can_read_request_image(igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id));
END $body$;
CREATE FUNCTION public.request_image_reference(p_request_id text)
RETURNS TABLE(image_path text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $body$
 SELECT * FROM igotu_backend_private.request_image_reference(p_request_id);
$body$;

-- Restrictive boundaries cannot be widened by an old permissive public-read policy.
CREATE POLICY request_image_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(bucket_id <> 'request-images' OR (storage.allow_only_operation('object.get_authenticated') AND igotu_backend_private.can_read_request_image(name)));
CREATE POLICY request_image_read_allowed ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='request-images' AND igotu_backend_private.can_read_request_image(name));
CREATE POLICY request_image_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id <> 'request-images' OR (igotu_backend_private.workspace('client') AND split_part(name,'/',1)=auth.uid()::text
 AND name ~ '^[A-Za-z0-9_/-]+[.](jpg|jpeg|png|webp)$'));
CREATE POLICY request_image_insert_allowed ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='request-images' AND igotu_backend_private.workspace('client') AND split_part(name,'/',1)=auth.uid()::text
 AND name ~ '^[A-Za-z0-9_/-]+[.](jpg|jpeg|png|webp)$');
CREATE POLICY request_image_update_boundary ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id <> 'request-images') WITH CHECK(bucket_id <> 'request-images');
CREATE POLICY request_image_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(bucket_id <> 'request-images');

-- Keep the existing signature for old callers. New callers pass NULL as URL.
-- A canonical old-client URL is accepted, but no new URL is persisted.
CREATE OR REPLACE FUNCTION public.client_save_request_image(p_request_id text,p_request_image_url text,p_request_image_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE subject uuid; r public.service_requests%rowtype; candidate text; object_owner text;
BEGIN
 subject:=igotu_backend_private.require_writer('client');
 SELECT * INTO r FROM public.service_requests WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.client_id<>subject OR r.status::text<>'pending'
 THEN RAISE EXCEPTION 'Owned pending request required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-images' AND public IS FALSE)
 THEN RAISE EXCEPTION 'Private bucket required' USING ERRCODE='42501'; END IF;
 candidate:=igotu_backend_private.request_image_path(p_request_image_path,p_request_image_url,subject);
 IF candidate IS NULL THEN RAISE EXCEPTION 'Canonical owned image path required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') INTO object_owner
 FROM storage.objects o WHERE o.bucket_id='request-images' AND o.name=candidate FOR UPDATE;
 IF object_owner IS DISTINCT FROM subject::text OR EXISTS (
  SELECT 1 FROM public.service_requests other WHERE other.request_id<>r.request_id
  AND igotu_backend_private.request_image_path(other.request_image_path,other.request_image_url,other.client_id)=candidate)
 THEN RAISE EXCEPTION 'Existing uniquely associated owned image required' USING ERRCODE='42501'; END IF;
 UPDATE public.service_requests SET request_image_path=candidate,request_image_url=NULL,request_image_uploaded_at=now()
 WHERE request_id=r.request_id;
END $body$;

-- Inventory conflicts/missing objects are blockers; never repair or rewrite evidence.
DO $inventory$ BEGIN
 IF EXISTS (SELECT 1 FROM public.service_requests r LEFT JOIN storage.objects o
 ON o.bucket_id='request-images' AND o.name=igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id)
 WHERE (nullif(r.request_image_path,'') IS NOT NULL OR nullif(r.request_image_url,'') IS NOT NULL)
 AND (o.id IS NULL OR coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') IS DISTINCT FROM r.client_id::text
 OR coalesce(o.metadata->>'mimetype','') NOT IN ('image/jpeg','image/png','image/webp')
 OR CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric NOT BETWEEN 1 AND 5242880 ELSE true END))
 THEN RAISE EXCEPTION 'Legacy association, ownership, object or format conflict; separate review required'; END IF;
 IF EXISTS (SELECT 1 FROM public.service_requests r
 WHERE igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id) IS NOT NULL
 GROUP BY igotu_backend_private.request_image_path(r.request_image_path,r.request_image_url,r.client_id) HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Shared legacy image path requires separate review'; END IF;
END $inventory$;

UPDATE storage.buckets SET public=false,file_size_limit=5242880,
 allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id='request-images';

CREATE FUNCTION igotu_backend_private.request_image_access_contract() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
BEGIN
 PERFORM igotu_backend_private.require_workspace();
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-images' AND public IS FALSE)
 THEN RAISE EXCEPTION 'Private bucket required' USING ERRCODE='42501'; END IF;
 RETURN 'private-request-images-v1';
END $body$;
CREATE FUNCTION public.request_image_access_contract() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $body$
 SELECT igotu_backend_private.request_image_access_contract();
$body$;
-- Contract is capability/version detection only; reference/download independently authorize.
REVOKE ALL ON FUNCTION igotu_backend_private.request_image_path(text,text,uuid),igotu_backend_private.can_read_request_image(text),igotu_backend_private.request_image_reference(text),public.request_image_reference(text),public.request_image_access_contract(),igotu_backend_private.request_image_access_contract() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION igotu_backend_private.can_read_request_image(text),igotu_backend_private.request_image_reference(text),public.request_image_reference(text),public.request_image_access_contract(),igotu_backend_private.request_image_access_contract() TO authenticated;
REVOKE ALL ON FUNCTION public.client_save_request_image(text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.client_save_request_image(text,text,text) TO authenticated;
-- Existing helper owners must be postgres; new functions inherit the gated operator.
COMMIT;
