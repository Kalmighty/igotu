"""Offline baseline/fixture SQL checks. No database is created or contacted."""
from pathlib import Path
import json,re,tempfile,subprocess
from pglast import parse_sql,parse_plpgsql,ast
from pglast.stream import RawStream
root=Path(__file__).resolve().parents[1]
p=next((root/'igotu_v2/database/staging-baseline').glob('*.sql'));sql=p.read_text();statements=parse_sql(sql);parse_plpgsql(sql)
c=json.loads((root/'docs/backend-integration/catalog-reviewed.json').read_text())
tables={q.stmt.relation.relname:q.stmt for q in statements if isinstance(q.stmt,ast.CreateStmt)}
assert set(tables)=={t['name'] for t in c['tables']}
for name,t in tables.items():
 cols={x.colname:x for x in t.tableElts if isinstance(x,ast.ColumnDef)}
 assert set(cols)=={x['column'] for x in c['columns'] if x['table']==name}
 for x in c['columns']:
  if x['table']!=name:continue
  assert ('CONSTR_NOTNULL' in str(cols[x['column']].constraints))==x['notnull']
for q in statements:
 if isinstance(q.stmt,ast.CreateFunctionStmt):
  opts={o.defname:o.arg for o in q.stmt.options}
  if opts['language'].sval=='sql':parse_sql(opts['as'][0].sval)
functions={'.'.join(n.sval for n in q.stmt.funcname):RawStream()(q.stmt) for q in statements if isinstance(q.stmt,ast.CreateFunctionStmt)}
snapshot=(root/'docs/backend-integration/reviewed-rpc-definitions.sql').read_text()
for unit in re.findall(r'CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$[\s\S]*?\$function\$',snapshot):
 f=parse_sql(unit)[0].stmt;assert functions['.'.join(n.sval for n in f.funcname)]==RawStream()(f),'Legacy fingerprint source must remain identical in quarantined baseline'
assert len(functions)==24
for q in statements:
 assert not isinstance(q.stmt,(ast.UpdateStmt,ast.DeleteStmt,ast.TruncateStmt,ast.DropStmt))
 if isinstance(q.stmt,ast.InsertStmt):assert (q.stmt.relation.schemaname,q.stmt.relation.relname)==('storage','buckets')
assert "'payment-proofs','payment-proofs',false" in sql
assert "'verification-documents','verification-documents',false" in sql
assert "'report-evidence','report-evidence',false" in sql
for file in (root/'tests/staging').glob('*.sql'):
 qs=parse_sql(file.read_text());parse_plpgsql(file.read_text())
 if file.name=='catalog-checks.sql':assert all(isinstance(q.stmt,ast.SelectStmt) for q in qs)
 else:assert 'probe_authorized' in file.read_text() and "='giqtnbwyktbnbhdvjraa'" in file.read_text()
with tempfile.TemporaryDirectory(dir=root/'work') as d:
 fresh=Path(d)/'empty.sql';fresh.touch()
 subprocess.run(['python','tools/build-staging-baseline.py',str(fresh)],cwd=root,check=True,capture_output=True)
 assert fresh.read_bytes()==p.read_bytes(),'Builder and reviewed draft diverged'
 old=fresh.read_bytes();r=subprocess.run(['python','tools/build-staging-baseline.py',str(fresh)],cwd=root,capture_output=True)
 assert r.returncode!=0 and fresh.read_bytes()==old,'Existing work must be preserved'
print(f'PASS empty baseline offline: {len(statements)} statements, {len(tables)} tables, 24 identical quarantined routine definitions; deterministic builder, no business data mutations, private document buckets; probe/catalog SQL parses. No SQL executed.')
