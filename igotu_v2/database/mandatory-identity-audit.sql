-- READ-ONLY AUDIT PLAN. NOT EXECUTED. Authorized operator/staging copy only.
-- Does not select legal names, IDs, document paths, object names or credentials.
WITH latest AS (
 SELECT DISTINCT ON(user_id) user_id,role,status,reviewed_by,reviewed_at
 FROM public.verification_requests ORDER BY user_id,submitted_at DESC,id DESC
)
SELECT u.role::text,u.status,u.identity_verified,u.profile_completed,coalesce(v.status,'not_submitted') AS latest_status,
 count(*) AS accounts,
 count(*) FILTER(WHERE u.identity_verified AND v.status='approved' AND v.role=u.role::text
   AND v.reviewed_by=u.identity_verified_by AND v.reviewed_at IS NOT NULL AND u.identity_verified_at IS NOT NULL) AS consistent_approvals
FROM public.users u LEFT JOIN latest v ON v.user_id=u.id
WHERE u.role::text IN ('client','provider')
GROUP BY 1,2,3,4,5 ORDER BY 1,2,5;
SELECT user_id,count(*) AS pending_count FROM public.verification_requests WHERE status='pending' GROUP BY user_id HAVING count(*)>1;
SELECT count(*) AS legacy_provider_badges_without_identity_proof
FROM public.provider_profiles p JOIN public.users u ON u.id=p.provider_id
WHERE p.is_verified AND NOT EXISTS(SELECT 1 FROM public.verification_requests v WHERE v.user_id=u.id AND v.status='approved' AND v.reviewed_by=u.identity_verified_by);
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relkind,c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,
 pg_get_userbyid(p.proowner) AS owner,p.proconfig,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
 md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f' ORDER BY 1,2,3;
SELECT roleid::regrole,member::regrole,admin_option FROM pg_auth_members;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets;
-- Separately export exact function/trigger bodies, column ACLs/default ACLs,
-- dependencies and *effective* exposed schemas for authorized review. Check all
-- REST/GraphQL/function/Storage paths; the SQL session's pgrst.db_schemas is not
-- authoritative. No settings here satisfy draft deployment attestations.
