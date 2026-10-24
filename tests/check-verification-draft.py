"""Offline syntax/coverage checks only. Does not connect to or execute SQL."""
from pathlib import Path
import re, subprocess
from pglast import parse_sql, parse_plpgsql, ast
root=Path(__file__).resolve().parents[1]
draft=(root/'igotu_v2/database/mandatory-identity-verification-draft.sql').read_text()
statements=parse_sql(draft)
units=parse_plpgsql(draft)
audit=parse_sql((root/'igotu_v2/database/mandatory-identity-audit.sql').read_text())
assert all(isinstance(s.stmt,ast.SelectStmt) for s in audit),'Audit must stay SELECT-only'
for s in statements:
 if isinstance(s.stmt,ast.UpdateStmt):
  assert s.stmt.relation.schemaname=='storage' and s.stmt.relation.relname=='buckets','No standalone account/backfill UPDATE is allowed'
for f in ['security-hardening-stage-a-additive.sql','security-hardening-stage-c-lockdown.sql','security-hardening-rollout.md']:
 path=f'igotu_v2/database/{f}'
 baseline=subprocess.check_output(['git','show',f'64530d4:{path}'],cwd=root)
 assert (root/path).read_bytes()==baseline,f'Staged security source changed: {f}'
modules=set()
for role in ['client','provider']:
 for p in (root/'igotu_v2'/role).glob('*.html'):
  text=p.read_text()
  assert 'data-access-state="checking"' in text,p
  assert 'workspace-gate.css' in text,p
  assert 'src="../js/profile-guard.js"' in text,p
  for src in re.findall(r'<script[^>]*type="module"[^>]*src="../js/([^"]+)"',text):modules.add(src)
for name in modules-{'profile-guard.js','verification.js'}:
 code=(root/'igotu_v2/js'/name).read_text()
 assert 'authorizeWorkspace' in code,name
 for match in re.finditer(r'document.addEventListener\("DOMContentLoaded",[\s\S]*?\{',code):
  assert 'await authorizeWorkspace()' in code[match.end():match.end()+100],name
assert 'await authorizeWorkspace()' in (root/'igotu_v2/js/verification.js').read_text()
print(f'PASS: {len(statements)} SQL statements and {len(units)} PL/pgSQL units parse offline; {len(audit)} audit SELECTs; no account backfill or Stage A/C changes; guarded initializer coverage. Database authorization NOT tested.')
