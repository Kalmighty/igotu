"""Build a REVIEW-ONLY empty baseline from saved metadata. No SQL/network execution.
Requires an existing filename created with `supabase migration new`.
"""
from pathlib import Path
import sys,json,re
root=Path(__file__).resolve().parents[1]
target=Path(sys.argv[1]).resolve() if len(sys.argv)==2 else None
if target is None or not target.is_file() or target.stat().st_size:
 raise SystemExit('Pass a fresh empty CLI-created SQL file; existing work is never overwritten.')
c=json.loads((root/'docs/backend-integration/catalog-reviewed.json').read_text())
m=json.loads((root/'docs/backend-integration/catalog-metadata.json').read_text())
snapshot=(root/'docs/backend-integration/reviewed-rpc-definitions.sql').read_text()
q=lambda v:"'"+str(v).replace("'","''")+"'"
ident=lambda v:'"'+v.replace('"','""')+'"'
text='''-- REVIEW-ONLY EMPTY SYNTHETIC STAGING BASELINE. NEVER EXECUTED IN PHASE 7.
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
'''
enums={x['format']:x['enums'] for t in m['tables'] for x in t['columns'] if x.get('enums')}
for name,labels in enums.items():text+='CREATE TYPE public.'+ident(name)+' AS ENUM ('+','.join(map(q,labels))+');\n'
for name in sorted(set(re.findall(r'public[.](\w+_seq)',snapshot))):text+='CREATE SEQUENCE public.'+ident(name)+' AS bigint START WITH 1;\n'
for table in c['tables']:
 name=table['name'];columns=[]
 for x in c['columns']:
  if x['table']!=name:continue
  col=ident(x['column'])+' '+('public.' if x['type'] in enums else '')+x['type']
  if x['default'] is not None:col+=' DEFAULT '+x['default']
  if x['notnull']:col+=' NOT NULL'
  columns.append(col)
 text+='CREATE TABLE public.'+ident(name)+' (\n '+',\n '.join(columns)+'\n);\n'
for constraints in [ [x for x in c['constraints'] if x['type']!='f'],[x for x in c['constraints'] if x['type']=='f'] ]:
 for x in constraints:text+='ALTER TABLE public.'+ident(x['table'])+' ADD CONSTRAINT '+ident(x['name'])+' '+x['definition']+';\n'
constraint_names={x['name'] for x in c['constraints']}
for x in c['indexes']:
 if x['name'] not in constraint_names:text+=x['definition']+';\n'
units=re.findall(r'CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$',snapshot)
assert len(units)==24
for unit in units:text+=unit+';\n'
for x in c['triggers']:text+=x['definition']+';\n'
# No public-table browser grants or legacy permissive policies in this baseline.
# D04 installs explicit policies/grants; Auth trigger remains an internal bridge.
for table in c['tables']:
 name=ident(table['name']);text+='ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE public.'+name+' FROM PUBLIC,anon,authenticated;\n'
text+='REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;\nREVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated;\n'
text+="INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES\n"
buckets=[]
for bucket in ['payment-proofs','request-images','verification-documents','report-evidence']:
 mime=['image/jpeg','image/png','application/pdf'] if bucket=='verification-documents' else ['image/jpeg','image/png','image/webp']+([] if bucket=='request-images' else ['application/pdf'])
 buckets.append('('+q(bucket)+','+q(bucket)+','+('true' if bucket=='request-images' else 'false')+",5242880,ARRAY["+','.join(map(q,mime))+'])')
text+=',\n'.join(buckets)+';\n'
for bucket in ['payment-proofs','request-images','verification-documents','report-evidence']:
 b=bucket.replace('-','_')
 text+=f"CREATE POLICY staging_{b}_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id={q(bucket)} AND (split_part(name,'/',1)=auth.uid()::text OR public.current_user_role()='admin'));\n"
 text+=f"CREATE POLICY staging_{b}_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id={q(bucket)} AND split_part(name,'/',1)=auth.uid()::text);\n"
 text+=f"CREATE POLICY staging_{b}_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id={q(bucket)} AND split_part(name,'/',1)=auth.uid()::text);\n"
text+='COMMIT;\n'
target.write_text(text)
print('Prepared empty baseline draft from metadata; no user data, counters, credentials or SQL execution.')
