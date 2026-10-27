"""Phase 7 offline contract review. Never connects to PostgreSQL or runs SQL."""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql, ast
from pglast.stream import RawStream
import re,json,hashlib
root=Path(__file__).resolve().parents[1]
folder=root/'igotu_v2/database/backend-integration'
files=sorted(folder.glob('*.sql'))
catalog=json.loads((root/'docs/backend-integration/catalog-reviewed.json').read_text())
metadata=json.loads((root/'docs/backend-integration/catalog-metadata.json').read_text())
snapshot=(root/'docs/backend-integration/reviewed-rpc-definitions.sql').read_text()
legacy=[parse_sql(unit)[0].stmt for unit in re.findall(r'CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$',snapshot)]
name=lambda f:'.'.join(x.sval for x in f.funcname)
old={name(f):f for f in legacy}
assert len(old)==len(catalog['function_contracts'])==24
known=set(old);functions={};ledger=[];replaced=0
norm=lambda t:RawStream()(t).replace('public.users','users')
for phase,p in enumerate(files,1):
 s=p.read_text();statements=parse_sql(s);parse_plpgsql(s)
 assert "writes_paused',true) IS DISTINCT FROM 'true'" in s
 assert "project_ref',true)='giqtnbwyktbnbhdvjraa'" in s
 assert "NULL/absent settings still require external proof" in s
 assert "server_version_num" in s and '17 baseline' in s
 if phase>1:
  assert f'AND phase={phase-1}' in s
  assert "project_ref=current_setting('igotu.integration.project_ref',true)" in s
  assert f'SET phase={phase}' in s
 for number,q in enumerate(statements,1):
  stmt=q.stmt;line=s[:q.stmt_location].count('\n')+1
  ledger.append({'draft':p.name,'statement':number,'start_line':line,'ast_type':type(stmt).__name__,'disposition':'OFFLINE_REVIEWED_EXECUTION_BLOCKED'})
  if isinstance(stmt,ast.CreateFunctionStmt):
   opts={o.defname:o.arg for o in stmt.options};body=opts['as'][0].sval
   assert any(o.defname=='set' and getattr(o.arg,'name',None)=='search_path' for o in stmt.options),name(stmt)
   for call in re.findall(r'\b((?:public|igotu_backend_private)\.\w+)\s*\(',body):
    assert call in known or call==name(stmt) or call in {'public.'+t['name'] for t in catalog['tables']},(p.name,name(stmt),'unresolved call dependency',call)
   if getattr(opts['language'],'sval',None)=='sql':parse_sql(body)
   if stmt.replace:
    baseline=old[name(stmt)]
    assert [(x.name,norm(x.argType)) for x in stmt.parameters or ()]==[(x.name,norm(x.argType)) for x in baseline.parameters or ()],name(stmt)
    assert norm(stmt.returnType)==norm(baseline.returnType),name(stmt)
    replaced+=1
   functions[name(stmt)]=stmt;known.add(name(stmt))
 # Stage phase bump/commit must come after ACL grants and dependency gate.
 assert s.rfind('COMMIT;')>s.rfind('GRANT EXECUTE')
print(f'PASS {len(ledger)} coordinated statements, {len(functions)} function definitions and {replaced} compatible legacy replacements; ordered dependencies parse offline.')
foundation=files[0].read_text();cutover=files[3].read_text()
for x in catalog['columns']:
 assert "('%s','%s','%s',"%(x['table'],x['column'],x['type']) in foundation,x
for x in catalog['constraints']:
 assert x['name'] in foundation and x['definition'].replace("'","''") in foundation,x['name']
for x in catalog['triggers']:assert x['name'] in foundation and x['definition'].replace("'","''") in foundation,x['name']
for t in metadata['tables']:
 for x in t['columns']:
  if x.get('enums'):assert f"Baseline enum drift: {x['format']}" in foundation
for x in catalog['function_contracts']:assert x['definition_md5'] in foundation and x['definition_md5'] in files[2].read_text()
assert 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA' not in foundation
assert 'installation ENABLE ROW LEVEL SECURITY' in foundation
assert 'DO $effective_acl$' in cutover
assert "'service_reports','example_table']" in cutover and "IF t<>'example_table' THEN" in cutover
assert all(x in cutover for x in ['has_table_privilege(browser::name','has_column_privilege(browser::name','has_sequence_privilege(browser::name','has_function_privilege(browser::name','has_schema_privilege(browser::name'])
print(f"PASS baseline checks cover {len(catalog['columns'])} typed columns, {len(catalog['constraints'])} constraints, {len(catalog['triggers'])} trigger bindings, enum definitions and effective ACL categories.")
# These are source boundary checks, not simulated PostgreSQL results.
assert 'NEW.is_read:=false' in cutover
assert "role::text='provider' AND profile_completed IS TRUE" in foundation
assert "transaction_isolation')<>'read committed'" in foundation
for helper in ['require_writer','require_approved_writer']:
 f=functions['igotu_backend_private.'+helper];opts={o.defname:o.arg for o in f.options};assert 'require_read_committed()' in opts['as'][0].sval
assert "profile_completed IS TRUE" in foundation and 'igotu_backend_private.approved_account(p_role)' in foundation
assert 'igotu_backend_private.require_approved_writer' in files[2].read_text()
assert 'THEN \'igotu_backend_private.approved_account()\'' in cutover
for helper in ['orphan_identity','orphan_report_evidence']:
 f=functions['igotu_backend_private.'+helper];opts={x.defname:x.arg for x in f.options}
 assert opts['volatility'].sval=='volatile'
 assert 'FOR UPDATE' in opts['as'][0].sval and 'NOT EXISTS' in opts['as'][0].sval
assert "AND NOT igotu_backend_private.approval_history_matches(u.id)" in files[1].read_text()
assert 'Only the latest identity submission can be decided' in files[2].read_text()
assert 'p_request_id FOR SHARE' in files[2].read_text()
assert 'p_status::public.account_status' in files[2].read_text() and '::user_status' not in files[2].read_text()
for original in ['security-hardening-stage-a-additive.sql','security-hardening-stage-c-lockdown.sql','mandatory-identity-verification-draft.sql']:
 import subprocess
 relative='igotu_v2/database/'+original
 assert (root/relative).read_bytes()==subprocess.check_output(['git','show','0a849da:'+relative],cwd=root)
print('PASS corrected source boundaries and unchanged historical drafts. RLS/transactions/concurrency remain BLOCKED.')
if '--write-review' in __import__('sys').argv:
 output=root/'docs/staging-readiness'
 output.mkdir(exist_ok=True)
 baseline=next((root/'igotu_v2/database/staging-baseline').glob('*.sql'))
 ordered=[baseline,*files]
 (output/'migration-order.json').write_text(json.dumps({'ordering':'Explicit approved operator order, NOT filename sorting or automatic db push','execution_status':'NOT_EXECUTED','steps':[{'order':i,'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'approval_required':True} for i,p in enumerate(ordered)]},indent=2)+'\n')
 (output/'statement-review.json').write_text(json.dumps({'scope':'Statement inventory accompanying manual review; no SQL execution or automatic semantic proof','draft_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'statements':ledger},indent=2)+'\n')
