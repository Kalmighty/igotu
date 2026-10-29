-- PREPARED ONLY. Run through the operator's existing STAGING connection only after
-- separate SELECT-only authorization. Redirect the single JSON value OUTSIDE Git.
-- Never import this as a migration or execute it from the HTTP runner.
BEGIN READ ONLY;
WITH protected_ids(request_id) AS (VALUES ('SR0001'),('SR0002'),('SR0011'),('SR0052')),
resolved AS (
 SELECT r.*,coalesce(nullif(request_image_path,''),CASE WHEN left(request_image_url,length('https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/'))='https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/'
 THEN substr(request_image_url,length('https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/')+1) END) AS image_name
 FROM public.service_requests r
), protected AS (
 SELECT i.request_id,jsonb_build_object(
  'rowMd5',md5(to_jsonb(r)::text),
  'relatedMd5',md5(jsonb_build_object(
    'payments',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY to_jsonb(p)::text) FROM public.payment_records p WHERE p.request_id=i.request_id),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text) FROM public.service_reviews v WHERE v.request_id=i.request_id),'[]'::jsonb),
    'messages',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)::text) FROM public.internal_messages m WHERE m.request_id=i.request_id),'[]'::jsonb),
    'declines',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY to_jsonb(d)::text) FROM public.service_request_declines d WHERE d.request_id=i.request_id),'[]'::jsonb),
    'reports',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY to_jsonb(s)::text) FROM public.service_reports s WHERE s.request_id=i.request_id),'[]'::jsonb)
  )::text),
  'imageMetadataMd5',CASE WHEN o.id IS NOT NULL THEN md5(to_jsonb(o)::text) END,
  'pathMd5',md5(x.image_name),'cacheControl',o.metadata->>'cacheControl','mime',o.metadata->>'mimetype'
 ) AS evidence
 FROM protected_ids i LEFT JOIN public.service_requests r ON r.request_id=i.request_id
 LEFT JOIN resolved x ON x.request_id=i.request_id
 LEFT JOIN storage.objects o ON o.bucket_id='request-images' AND o.name=x.image_name
)
SELECT jsonb_build_object(
 'projectRef',(SELECT project_ref FROM igotu_backend_private.installation LIMIT 1),
 'capturedAt',clock_timestamp(),'postgresMajor',current_setting('server_version_num')::int/10000,
 'backendPhase',(SELECT phase FROM igotu_backend_private.installation LIMIT 1),
 -- This is an operator attestation, deliberately NOT marked satisfied by a query.
 'catalogReviewed',false,
 'bucketPublic',(SELECT public FROM storage.buckets WHERE id='request-images'),
 'saveRpcMd5',md5(pg_get_functiondef('public.client_save_request_image(text,text,text)'::regprocedure)),
 'operationMd5',md5(pg_get_functiondef('storage.allow_only_operation(text)'::regprocedure)),
 'policiesMd5',(SELECT md5(coalesce(string_agg(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||'|'||polname||'|'||polcmd::text||'|'||polpermissive::text||'|'||polroles::text,E'\n' ORDER BY polname),'')) FROM pg_policy WHERE polrelid='storage.objects'::regclass),
 'imageObjectCount',(SELECT count(*) FROM storage.objects WHERE bucket_id='request-images'),
 'imageReaders',(SELECT jsonb_object_agg(s.signature,jsonb_build_object('md5',CASE WHEN p.oid IS NOT NULL THEN md5(pg_get_functiondef(p.oid)) END,'aclMd5',md5(coalesce(p.proacl::text,'')),'owner',pg_get_userbyid(p.proowner),'volatility',p.provolatile::text,'definer',p.prosecdef))
  FROM (VALUES ('public.request_image_reference(text)'),('public.request_image_access_contract()'),('igotu_backend_private.request_image_reference(text)'),('igotu_backend_private.request_image_access_contract()'),('igotu_backend_private.can_read_request_image(text)'),('igotu_backend_private.request_image_path(text,text,uuid)')) s(signature)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature)),
 'protected',(SELECT jsonb_object_agg(request_id,evidence) FROM protected),
 'actors',(SELECT coalesce(jsonb_object_agg(u.id::text,jsonb_build_object('id',u.id,'role',u.role::text,'status',u.status::text,'identityApproved',CASE WHEN u.role::text='admin' THEN true ELSE igotu_backend_private.identity_approved(u.id) END,'approvalHistoryMatches',CASE WHEN u.role::text='admin' THEN true ELSE igotu_backend_private.approval_history_matches(u.id) END,'profileComplete',coalesce(u.profile_completed,false))),'{}'::jsonb) FROM public.users u),
 'fixtures',(SELECT coalesce(jsonb_object_agg(x.request_id,jsonb_build_object('clientId',x.client_id,'providerId',x.selected_provider_id,'status',x.status::text,'pathMd5',md5(x.image_name),
  'imageExists',o.id IS NOT NULL,'imageOwnerMatchesClient',coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=x.client_id::text
   AND split_part(x.image_name,'/',1)=x.client_id::text AND (nullif(x.request_image_url,'') IS NULL OR x.request_image_url='https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/'||x.image_name)
 )),'{}'::jsonb) FROM resolved x LEFT JOIN storage.objects o ON o.bucket_id='request-images' AND o.name=x.image_name)
);
COMMIT;
