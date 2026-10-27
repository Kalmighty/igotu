-- PREPARED SELECT-ONLY CATALOG CHECKLIST. Not run in Phase 7.
-- Run only against separately approved staging, after each ordered stage.
SELECT current_setting('server_version') AS postgres_version,
       current_setting('pgrst.db_schemas',true) AS not_authoritative_api_schema_setting;
SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,n.nspacl FROM pg_namespace n
 WHERE n.nspname IN ('public','igotu_backend_private');
SELECT c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) AS owner,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','igotu_backend_private') AND c.relkind IN ('r','p');
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','igotu_backend_private');
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','storage');
SELECT t.tgrelid::regclass AS relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
 JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth');
SELECT c.conrelid::regclass AS relation,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public';
SELECT member::regrole AS member,roleid::regrole AS granted_role,admin_option FROM pg_auth_members;
SELECT defaclrole::regrole AS owner,defaclnamespace::regnamespace AS namespace,defaclobjtype,defaclacl FROM pg_default_acl;
SELECT s.setdatabase,s.setrole,setting AS reviewed_transaction_setting
 FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
 WHERE setting LIKE 'default_transaction_isolation=%' OR setting LIKE 'search_path=%' OR setting LIKE 'pgrst.db_schemas=%';
