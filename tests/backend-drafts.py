"""Offline review checks; parsing and source invariants do not prove RLS/transactions."""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql, ast
import json,re
root=Path(__file__).resolve().parents[1]
files=sorted((root/'igotu_v2/database/backend-integration').glob('*.sql'))
assert len(files)==4
for i,p in enumerate(files,1):
 s=p.read_text(); stmts=parse_sql(s); bodies=parse_plpgsql(s)
 assert 'STAGING-ONLY DRAFT' in s and 'private_schema_verified' in s
 assert isinstance(stmts[0].stmt,ast.TransactionStmt)
 for q in stmts:
  if isinstance(q.stmt,ast.UpdateStmt): assert q.stmt.relation.schemaname in ('igotu_backend_private','storage'),'No business/history backfill'
  assert not isinstance(q.stmt,(ast.DeleteStmt,ast.TruncateStmt)),'No standalone business-data deletion'
 print(f'PASS D0{i} offline: {len(stmts)} statements, {len(bodies)} PL/pgSQL units')
 for q in stmts:
  if isinstance(q.stmt,ast.CreateFunctionStmt):
   opts={o.defname:o.arg for o in q.stmt.options}
   lang=getattr(opts.get('language'),'sval',None)
   if lang=='sql': parse_sql(opts['as'].items[0].sval if hasattr(opts['as'],'items') else opts['as'][0].sval)
query=(root/'docs/backend-integration/catalog-review-query.sql').read_text()
assert all(isinstance(q.stmt,ast.SelectStmt) for q in parse_sql(query))
# No browser-generated notification inserts and no broad Provider request reads.
for p in (root/'igotu_v2/js').glob('*.js'):
 s=p.read_text();assert 'createNotification' not in s,p
 if p.name.startswith('provider') and p.name not in ('provider-profile.js',):assert '.from("service_requests")' not in s,p
assert 'getPublicUrl' not in (root/'igotu_v2/js/payment-receipts.js').read_text()
print('PASS offline frontend/draft invariants. No database connection.')

for p in (root/'igotu_v2/admin').glob('*.html'):
 assert 'data-access-state="checking"' in p.read_text(),p
 assert '../js/profile-guard.js' in p.read_text(),p
for p in (root/'igotu_v2/js').glob('admin*.js'):
 assert re.search(r'DOMContentLoaded[\s\S]*?await authorizeWorkspace',p.read_text()),p
print('PASS all Admin initializers await the shared compatibility/auth guard.')
# Current frontend peer reads must not request a peer email/phone.
for name in ['client-messages.js','provider-messages.js','report-service.js']:
 s=(root/'igotu_v2/js'/name).read_text()
 assert 'serviceParticipants' in s
 assert '.in("id",' not in s
print('PASS request-derived peer lookup contract.')
