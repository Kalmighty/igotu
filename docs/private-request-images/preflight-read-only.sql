-- REVIEW ONLY: prepare for separately authorized READ-ONLY staging evidence collection.
BEGIN READ ONLY;
SELECT current_database(),current_user,current_setting('server_version'),current_setting('transaction_read_only');
SELECT project_ref,version,phase FROM igotu_backend_private.installation;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='request-images';
SELECT n.nspname,p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl,
 md5(pg_get_functiondef(p.oid)) AS definition_md5,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.oid='public.client_save_request_image(text,text,text)'::regprocedure;
SELECT polname,polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid) AS using_expression,
 pg_get_expr(polwithcheck,polrelid) AS check_expression FROM pg_policy
WHERE polrelid='storage.objects'::regclass ORDER BY polname;
SELECT md5(coalesce(string_agg(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||'|'||polname||'|'||polcmd::text||'|'||polpermissive::text||'|'||polroles::text,E'\n' ORDER BY polname),'')) AS storage_policies_md5
FROM pg_policy WHERE polrelid='storage.objects'::regclass;
SELECT to_regprocedure('storage.allow_only_operation(text)') AS operation_helper;
SELECT pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid)) AS operation_helper_md5,p.proacl FROM pg_proc p
WHERE p.oid=to_regprocedure('storage.allow_only_operation(text)');
-- Hash-only association evidence; no image content, credentials or URL query tokens.
SELECT request_id,md5(to_jsonb(r)::text) AS request_row_md5,
 md5(coalesce(request_image_path,'')) AS path_md5,md5(coalesce(request_image_url,'')) AS legacy_url_md5,
 request_image_uploaded_at FROM public.service_requests r
WHERE request_image_path IS NOT NULL OR request_image_url IS NOT NULL ORDER BY request_id;
SELECT count(*) AS image_objects,count(*) FILTER(WHERE coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner') IS NULL) AS missing_owner
FROM storage.objects o WHERE bucket_id='request-images';
SELECT metadata->>'mimetype' AS mimetype,metadata->>'cacheControl' AS cache_control,count(*)
FROM storage.objects WHERE bucket_id='request-images' GROUP BY 1,2 ORDER BY 1,2;
-- Inline resolver permits full compatibility review BEFORE installing new helpers.
WITH source AS (
 SELECT r.*,'https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/'::text AS prefix
 FROM public.service_requests r WHERE nullif(request_image_path,'') IS NOT NULL OR nullif(request_image_url,'') IS NOT NULL
), candidate AS (
 SELECT s.*,coalesce(nullif(request_image_path,''),CASE WHEN left(request_image_url,length(prefix))=prefix THEN substr(request_image_url,length(prefix)+1) END) AS name
 FROM source s
), resolved AS (
 SELECT c.*,CASE WHEN name ~ '^[A-Za-z0-9_/-]+[.](jpg|jpeg|png|webp)$' AND split_part(name,'/',1)=client_id::text
 AND (nullif(request_image_url,'') IS NULL OR request_image_url=prefix||name) THEN name END AS resolved_name FROM candidate c
)
SELECT r.request_id,r.resolved_name IS NOT NULL AS canonical_association,
 md5(coalesce(r.resolved_name,'')) AS resolved_path_md5,
 o.id IS NOT NULL AS object_exists,
 coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=r.client_id::text AS owner_matches,
 coalesce(o.metadata->>'mimetype','') IN ('image/jpeg','image/png','image/webp') AS supported_mime,
 CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric BETWEEN 1 AND 5242880 ELSE false END AS supported_size,
 CASE WHEN r.resolved_name IS NOT NULL THEN count(*) OVER(PARTITION BY r.resolved_name) ELSE 0 END AS association_count,
 md5(coalesce(to_jsonb(o)::text,'')) AS object_metadata_md5
FROM resolved r LEFT JOIN storage.objects o ON o.bucket_id='request-images' AND o.name=r.resolved_name ORDER BY r.request_id;
-- Catalog grant review must include inherited privileges, not only named policies.
SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role');
SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='storage.objects'::regclass;
-- Effective privileges include PUBLIC/inherited grants; raw ACLs alone are insufficient.
WITH browser(role_name) AS (VALUES ('anon'::text),('authenticated'::text))
SELECT b.role_name,n.nspname,n.nspacl,
 has_schema_privilege(b.role_name::name,n.oid,'USAGE') AS effective_usage,
 has_schema_privilege(b.role_name::name,n.oid,'CREATE') AS effective_create
FROM browser b CROSS JOIN pg_namespace n
WHERE n.nspname IN ('public','storage','auth','igotu_backend_private') ORDER BY 1,2;
WITH browser(role_name) AS (VALUES ('anon'::text),('authenticated'::text)),
 signatures(signature) AS (VALUES
 ('public.current_user_role()'),('public.igotu_backend_contract()'),
 ('public.client_save_request_image(text,text,text)'),
 ('public.request_image_reference(text)'),('public.request_image_access_contract()'),
 ('igotu_backend_private.request_image_path(text,text,uuid)'),
 ('igotu_backend_private.can_read_request_image(text)'),
 ('igotu_backend_private.request_image_reference(text)'),
 ('igotu_backend_private.request_image_access_contract()'),
 ('igotu_backend_private.workspace(text)'),('igotu_backend_private.is_admin()'),
 ('igotu_backend_private.require_workspace(text)'),('igotu_backend_private.require_writer(text)'),
 ('storage.allow_only_operation(text)'),('auth.uid()'))
SELECT b.role_name,s.signature,p.oid IS NOT NULL AS installed,
 pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef,p.proacl,
 has_function_privilege(b.role_name::name,p.oid,'EXECUTE') AS effective_execute,
 has_schema_privilege(b.role_name::name,p.pronamespace,'USAGE') AS effective_schema_usage
FROM browser b CROSS JOIN signatures s LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature)
ORDER BY 1,2;
-- Existing SR0052 cache/association snapshot, metadata only. No URL values or image bytes.
WITH image AS (
 SELECT r.*,'https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/'::text AS prefix
 FROM public.service_requests r WHERE request_id='SR0052'
), resolved AS (
 SELECT r.*,coalesce(nullif(request_image_path,''),CASE WHEN left(request_image_url,length(prefix))=prefix THEN substr(request_image_url,length(prefix)+1) END) AS object_name
 FROM image r
)
SELECT r.request_id,md5(to_jsonb(r)::text) AS snapshot_md5,
 md5(coalesce(r.request_image_url,'')) AS old_url_md5,
 o.id IS NOT NULL AS object_exists,md5(coalesce(to_jsonb(o)::text,'')) AS object_metadata_md5,
 o.metadata->>'mimetype' AS mimetype,o.metadata->>'size' AS size_bytes,
 o.metadata->>'cacheControl' AS stored_cache_control,
 o.metadata->>'lastModified' AS stored_last_modified,
 o.metadata->>'eTag' AS stored_etag
FROM resolved r LEFT JOIN storage.objects o ON o.bucket_id='request-images' AND o.name=r.object_name;
COMMIT;
