"""Read-only source inventory/reference checks. --write-inventory writes review documentation.
SQL is parsed offline only when pglast is installed; never connected or executed.
"""
import collections, html.parser, pathlib, re, subprocess, sys
root=pathlib.Path(__file__).resolve().parents[1]
app=root/'igotu_v2'
class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.refs=[]; self.scripts=[]; self.styles=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.append(a['id'])
        for key in ('src','href'):
            if a.get(key): self.refs.append((tag,a[key]))
        if tag=='script' and a.get('src'): self.scripts.append(a['src'])
        if tag=='link' and a.get('rel')=='stylesheet': self.styles.append(a.get('href'))
def local(p,ref):
    if re.match(r'^(https?:|data:|blob:|mailto:|tel:|javascript:|#)',ref):return None
    ref=ref.split('?')[0].split('#')[0]
    if not ref:return None
    return (app/ref.lstrip('/') if ref.startswith('/') else p.parent/ref).resolve()
def imports(p):return re.findall(r'\bfrom\s+["\']([^"\']+)["\']',p.read_text())
def closure(p,seen=None):
    seen=set() if seen is None else seen
    if p in seen or not p.exists() or p.suffix!='.js':return seen
    seen.add(p)
    for ref in imports(p):
        q=local(p,ref)
        if q:closure(q,seen)
    return seen
errors=[]; inventory=[]
for p in sorted(app.rglob('*.html')):
    page=Page();page.feed(p.read_text());dupes=[k for k,n in collections.Counter(page.ids).items() if n>1]
    if dupes:errors.append(f'{p.relative_to(root)} duplicate IDs: {dupes}')
    for tag,ref in page.refs:
        q=local(p,ref)
        if q and not q.exists():errors.append(f'{p.relative_to(root)} missing {tag} reference: {ref}')
    scripts=set()
    for ref in page.scripts:
        q=local(p,ref)
        if q: scripts.update(closure(q))
    inventory.append((p,page,sorted(scripts)))
for p in app.glob('js/*.js'):
    r=subprocess.run(['node','--input-type=module','--check'],input=p.read_bytes(),capture_output=True)
    if r.returncode:errors.append(f'{p.name}: {r.stderr.decode()}')
    for ref in imports(p):
        q=local(p,ref)
        if q and not q.exists():errors.append(f'{p.name} missing import: {ref}')
# The protected drafts must remain byte-identical to the feature base.
for name in ['security-hardening-stage-a-additive.sql','security-hardening-stage-c-lockdown.sql','security-hardening-rollout.md','mandatory-identity-verification-draft.sql']:
    p=app/'database'/name
    old=subprocess.check_output(['git','show',f'355e84d:igotu_v2/database/{name}'],cwd=root)
    if old!=p.read_bytes():errors.append(f'Protected draft changed: {name}')
counts=collections.Counter(p.suffix for p in app.rglob('*') if p.is_file())
lines=['# Source inventory — backend integration','',f'Generated from `{subprocess.check_output(["git","rev-parse","--short","HEAD"],cwd=root,text=True).strip()}` plus the backend integration working tree. Static discovery is not evidence of live schema installation.','', '## File inventory','']
for suffix in ['.html','.css','.js','.sql']:
    lines += [f'### {suffix}: {counts[suffix]} files','']+[f'- `{p.relative_to(app)}`' for p in sorted(app.rglob(f'*{suffix}'))]+['']
lines+=['## Pages, entry scripts and stylesheet links','', '| Page | Direct scripts | Stylesheets |','| --- | --- | --- |']
for p,page,scripts in inventory:lines.append(f'| `{p.relative_to(app)}` | '+ '<br>'.join(f'`{s}`' for s in page.scripts)+' | '+'<br>'.join(f'`{s}`' for s in page.styles)+' |')
lines+=['','## Browser data/API dependency inventory','', 'Literal calls below include Storage `.from` as well as table `.from`. Dynamic `countTable` uses users, service_requests, payment_records and service_reviews. The authorized metadata comparison is recorded in docs/backend-integration; effective staging API behavior remains untested.','', '| Source module | `.from` targets | RPCs | Auth methods |','| --- | --- | --- | --- |']
for p in sorted(app.glob('js/*.js')):
    s=p.read_text();targets=sorted(set(re.findall(r'\.from\(\s*["\']([^"\']+)',s)));rpcs=sorted(set(re.findall(r'\.rpc\(\s*["\']([^"\']+)',s)));auth=sorted(set(re.findall(r'\bauth\.(\w+)\(',s)))
    if targets or rpcs or auth:lines.append('| `'+p.name+'` | '+', '.join(f'`{x}`' for x in targets)+' | '+', '.join(f'`{x}`' for x in rpcs)+' | '+', '.join(f'`{x}`' for x in auth)+' |')
lines+=['','## Repository SQL contracts (not an installed schema)','', '| SQL source | Declared tables | Declared public functions |','| --- | --- | --- |']
for p in sorted((app/'database').rglob('*.sql')):
    s=p.read_text();tables=sorted(set(re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)',s,re.I)));funcs=sorted(set(re.findall(r'create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)',s,re.I)))
    lines.append(f'| `{p.name}` | '+', '.join(f'`{x}`' for x in tables)+' | '+', '.join(f'`{x}`' for x in funcs)+' |')
lines+=['','## Workflow and duplicate-code notes','', '- Public: homepage → role-selected Login/Register; forgot/reset password. Auth uses one Supabase project and trusted users rows.', '- Client: mandatory verification → basic onboarding → dashboard/create/edit/cancel → request-specific recommendations → select Provider → messages → complete → offline payment and Provider review; participant reports.', '- Provider: mandatory verification → basic/service profile, skills/specializations/location/hours → assigned incoming only → confirm/decline → assignment start/history → messages and Client review; participant reports.', '- Admin: dashboard/users/status; verification private signed previews and review RPC; request/payment/review monitors; report review RPC.', '- `notifications.js` is not referenced by any HTML page; current pages use `notification-menu.js` + badge. It remains legacy code, not silently loaded.', '- Cancellation setup exists in cancel-request-setup.sql, request-cancellation-setup.sql and priority-features-setup.sql; definitions/policies differ. request-editing vs specialization scripts contain older/newer edit signatures. These are historical setup scripts, not a reliable ordered migration ledger.', '- Old setup/readme instructions include legacy backfills, permissive policies and public receipt assumptions. Do not rerun them to fix UI errors. Stage A/C and the mandatory draft remain review-only, with separate integration gates.', '- Repeated Client/Provider session/profile/logout/formatting handlers are identified technical debt. No framework rewrite or wholesale deletion was performed.', '- External dependencies: Supabase SDK CDN; Leaflet 1.9.4 CSS/JS, OpenStreetMap tiles and Nominatim geocoder; Provider tiles also Esri fallback; browser geolocation and network permissions. Supabase SDK is pinned to 2.118.0; CDN availability and integrity remain external dependencies.', '']
if '--write-inventory' in sys.argv:(root/'docs/system-inventory.md').write_text('\n'.join(lines))
print(f'Static reference/syntax checks: {len(inventory)} HTML pages, {counts[".js"]} JS, {counts[".css"]} CSS, {counts[".sql"]} SQL sources; {len(errors)} errors.')
for e in errors:print(e)
if errors:sys.exit(1)
if '--parse-sql' in sys.argv:
    from pglast import parse_sql
    total=0
    for p in sorted((app/'database').rglob('*.sql')):
        n=len(parse_sql(p.read_text())); total+=n
    print(f'Offline SQL syntax: {counts[".sql"]} files, {total} statements parse. No database connection or semantic/authorization validation.')
