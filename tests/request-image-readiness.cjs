/* OFFLINE ONLY: fake files, fake approvals, injected in-memory HTTP. No sockets. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const m=require('../tools/request-image-readiness.cjs');
const NOW=Date.parse('2026-10-29T04:00:00Z');
const iso=offset=>new Date(NOW+offset).toISOString();
const hash=value=>m.digest(value,'md5');
const image=Buffer.from('OFFLINE_SYNTHETIC_IMAGE_BYTES');
const result=(status,body,headers={'content-type':'application/json'})=>({status,body:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body)),headers});
function bundle(phase='baseline'){
 const labels=['clientA','clientB','providerA','providerB','admin','suspended'];
 const config={projectRef:m.REF,url:m.ORIGIN,syntheticOnly:true,publishableKey:'sb_publishable_OFFLINE_FAKE_0000000000000000',accounts:{}};
 const actors={};labels.forEach((name,i)=>{const id=`00000000-0000-4000-8000-00000000000${i+1}`,role=name.startsWith('provider')?'provider':name==='admin'?'admin':'client';config.accounts[name]={id,role,synthetic:true};actors[id]={id,role,status:name==='suspended'?'suspended':'active',identityApproved:name!=='suspended',approvalHistoryMatches:true,profileComplete:true};});
 const owner=config.accounts.clientA.id,provider=config.accounts.providerA.id,inactive=config.accounts.suspended.id;
 const common={clientId:owner,providerId:provider,status:'confirmed',imageExists:true,imageOwnerMatchesClient:true};
 const p=`${owner}/OFFLINE-PRIVATE.webp`,beforePath=`${owner}/OFFLINE-BEFORE.webp`,inactivePath=`${inactive}/OFFLINE-INACTIVE.webp`;
 const fixtures={'OFFLINE-AFTER':{...common,pathMd5:hash(p)},'OFFLINE-BEFORE':{...common,status:'provider_selected',pathMd5:hash(beforePath)},'OFFLINE-INACTIVE':{...common,clientId:inactive,pathMd5:hash(inactivePath)}};
 const pins=Object.fromEntries(m.PROTECTED.map(id=>[id,{rowMd5:id==='SR0052'?m.KNOWN.sr0052Row:hash(id),relatedMd5:hash('related-'+id)}]));
 const protectedRows=Object.fromEntries(m.PROTECTED.map(id=>[id,{...pins[id]}]));
 protectedRows.SR0052={...protectedRows.SR0052,imageMetadataMd5:m.KNOWN.sr0052Image,pathMd5:hash(p),mime:'image/webp',cacheControl:'max-age=3600'};
 const readers=Object.fromEntries(m.READERS.map(name=>[name,{md5:hash(name),aclMd5:hash('acl-'+name),owner:'postgres',volatility:'s',definer:name.startsWith('igotu_backend_private.')} ]));
 const context={reviewedImageReaders:readers,projectRef:m.REF,baseline:{requestId:'SR0052',path:p},protectedPins:pins,expectedImageObjectCount:3,
  reviewedPostCutoverFingerprints:{saveRpcMd5:hash('post-save'),operationMd5:m.KNOWN.operationMd5,policiesMd5:hash('post-policies')},
  operationContractReviewed:true,effectivePrivilegesReviewed:true,cachePlanReviewed:true,reviewedSyntheticRequestIds:Object.keys(fixtures),
  maintenance:{confirmedBy:'OFFLINE_TEST_NOT_A_REAL_ATTESTATION',startsAt:iso(-30000),expiresAt:iso(300000),sources:Object.fromEntries(m.SOURCES.map(key=>[key,{owner:'OFFLINE_TEST',confirmedBy:'OFFLINE_TEST',confirmedAt:iso(-30000),state:'paused',evidence:'OFFLINE_TEST_ONLY',exceptions:[],expiresAt:iso(300000),resumptionAuthority:'OFFLINE_TEST'}]))},
  cases:[['owner','clientA','OFFLINE-AFTER',p],['selected-before','providerA','OFFLINE-BEFORE',beforePath],['selected-after','providerA','OFFLINE-AFTER',p],['unrelated-client','clientB','OFFLINE-AFTER',p],['nonselected-provider','providerB','OFFLINE-AFTER',p],['admin','admin','OFFLINE-AFTER',p],['anonymous',null,'OFFLINE-AFTER',p],['inactive','suspended','OFFLINE-INACTIVE',inactivePath]].map(([label,actor,requestId,path])=>({label,actor,requestId,path,bodySha256:m.digest(image)}))};
 const approval={projectRef:m.REF,approved:true,scope:phase==='baseline'?'request-image-anonymous-baseline':'request-image-post-cutover-auth-http',authorizationReference:'OFFLINE_FIXTURE_ONLY',approvedBy:'OFFLINE_TEST',approvedAt:iso(-60000),expiresAt:iso(360000),privateFilesAclReviewed:true,contextSha256:m.digest('context'),configSha256:m.digest('config'),beforeSnapshotSha256:m.digest('before'),proposalSha256:m.digest(fs.readFileSync(path.resolve(__dirname,'../docs/private-request-images/proposal.sql'))),authenticateExistingSynthetic:true,readOnlyImageHttp:true,denyListSignChecks:true};
 const before={imageReaders:readers,projectRef:m.REF,postgresMajor:17,backendPhase:4,catalogReviewed:true,capturedAt:iso(-5000),bucketPublic:phase==='baseline',...(phase==='baseline'?m.KNOWN:context.reviewedPostCutoverFingerprints),protected:protectedRows,imageObjectCount:phase==='baseline'?1:3,actors,fixtures};
 const secrets=Object.fromEntries(labels.map(name=>[name,{email:name+'@example.invalid',password:'OFFLINE_SECRET_PASSWORD_12345'}]));
 return {config,configSha:approval.configSha256,context,contextSha:approval.contextSha256,approval,before,beforeSha:approval.beforeSnapshotSha256,secrets};
}
function transport(b,options={}){
 const calls=[];const tokens=new Map();
 return {calls,send:async req=>{
  calls.push(req);const u=new URL(req.url),p=u.pathname,auth=req.headers.Authorization;
  if(p==='/auth/v1/token'){
   const login=JSON.parse(req.body),name=Object.keys(b.secrets).find(k=>b.secrets[k].email===login.email);
   if(options.loginFail)return result(401,{message:'DO_NOT_PRINT_PASSWORD_OR_TOKEN'});
   const id=b.config.accounts[name].id,token='e30.'+Buffer.from(JSON.stringify({role:'authenticated',iss:m.ORIGIN+'/auth/v1',sub:id})).toString('base64url')+'.OFFLINE_FAKE_SIGNATURE';tokens.set(token,id);return result(200,{access_token:token,refresh_token:'NEVER_PERSIST_REFRESH'});
  }
  if(p==='/auth/v1/user')return result(200,{id:tokens.get(auth?.slice(7))});
  if(p.endsWith('/request_image_access_contract'))return result(200,'private-request-images-v1');
  const id=tokens.get(auth?.slice(7)),body=req.body?JSON.parse(req.body):null;
  const q=b.context.cases.find(q=>q.actor&&b.config.accounts[q.actor].id===id&&(!body?.p_request_id||q.requestId===body.p_request_id));
  const allowed=q&&['owner','selected-after','admin'].includes(q.label);
  const denied=()=>options.proxyDenial?result(403,Buffer.from('<html>proxy denied</html>'),{'content-type':'text/html'}):result(403,{statusCode:'403',error:'Unauthorized'});
  if(p.endsWith('/request_image_reference')){
   const requested=b.context.cases.find(x=>x.actor&&b.config.accounts[x.actor].id===id&&x.requestId===body.p_request_id);
   return requested&&['owner','selected-after','admin'].includes(requested.label)?result(200,[{image_path:requested.path}]):result(200,[]);
  }
  if(p.includes('/object/list/')||p.includes('/object/sign/'))return options.emptyList&&p.includes('/list/')?result(200,[]):options.nonemptyList&&p.includes('/list/')?result(200,[{name:'NEVER_REPORT_IMAGE_NAME'}]):options.signAllowed&&p.includes('/sign/')?result(200,{signedURL:'NEVER_PRINT_SIGNED_URL_TOKEN'}):denied();
  if(p.includes('/object/public/')){
   if(b.approval.scope!=='request-image-anonymous-baseline')return options.oldPublicAccessible?result(200,image,{'content-type':'image/webp'}):denied();
   return result(200,options.changedBody&&calls.length>1?Buffer.from('changed'):image,{'content-type':'image/webp','cache-control':'public, max-age=3600',...(options.unknownCache?{}:{'cf-cache-status':calls.length===1?'MISS':'HIT'}),'etag':'"abc123"'});
  }
  const pathValue=p.split('/request-images/')[1];
  const permitted=b.context.cases.some(x=>x.path===pathValue&&x.actor&&b.config.accounts[x.actor].id===id&&['owner','selected-after','admin'].includes(x.label));
  return permitted||options.leak?result(200,image,{'content-type':'image/webp'}):denied();
 }};
}
const tests=[];const test=(name,run)=>tests.push({name,run});
test('Independent evidence pins match the runner; committed templates remain unsigned/unapproved',()=>{
 const folder=path.resolve(__dirname,'../docs/private-request-images/rollout');
 const evidence=JSON.parse(fs.readFileSync(path.join(folder,'evidence.json'),'utf8'));
 for(const key of ['saveRpcMd5','operationMd5','policiesMd5'])assert.equal(evidence[key],m.KNOWN[key]);
 assert.equal(evidence.SR0052.requestRowMd5,m.KNOWN.sr0052Row);assert.equal(evidence.SR0052.imageMetadataMd5,m.KNOWN.sr0052Image);
 const approval=JSON.parse(fs.readFileSync(path.join(folder,'approval.template.json'),'utf8'));assert.equal(approval.approved,false);assert.equal(approval.expiresAt,'');
 const context=JSON.parse(fs.readFileSync(path.join(folder,'context.template.json'),'utf8'));assert.ok(Object.values(context.maintenance.sources).every(s=>s.state==='UNVERIFIED'&&s.owner===''&&s.confirmedBy===''));
});
test('Default dry-run ignores supplied private paths, makes no requests and writes no files',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-readiness-test-'));try{
  const out=path.join(temp,'must-not-exist.json');const r=spawnSync(process.execPath,['tools/request-image-readiness.cjs','--config',path.join(temp,'nonexistent-secret'),'--report',out],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).networkRequests,0);assert.equal(JSON.parse(r.stdout).writes,0);assert.equal(fs.existsSync(out),false);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('Live phase without explicit execute is blocked before private file access',()=>{
 const r=spawnSync(process.execPath,['tools/request-image-readiness.cjs','--phase','baseline'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});assert.equal(r.status,2);assert.match(r.stderr,/EXPLICIT_EXECUTE_REQUIRED/);
});
for(const [label,mutate] of [
 ['production origin',b=>{b.config.url='https://giqtnbwyktbnbhdvjraa.supabase.co';}],
 ['missing approval',b=>{b.approval.approved=false;}],['wrong scope',b=>{b.approval.scope='migration';}],
 ['expired approval',b=>{b.approval.expiresAt=iso(-1);}],['context mismatch',b=>{b.contextSha='f'.repeat(64);}],
 ['candidate mismatch',b=>{b.approval.proposalSha256='f'.repeat(64);}],['unpaused writer',b=>{b.context.maintenance.sources['privileged-writers'].state='UNVERIFIED';}],
 ['writer exception',b=>{b.context.maintenance.sources['workers-queues-retries'].exceptions=['active'];}],
 ['stale snapshot',b=>{b.before.capturedAt=iso(-600001);}],['missing protected pin',b=>{delete b.context.protectedPins.SR0001.relatedMd5;}],
 ['SR0052 row drift',b=>{b.before.protected.SR0052.rowMd5='f'.repeat(32);}],['image metadata drift',b=>{b.before.protected.SR0052.imageMetadataMd5='f'.repeat(32);}],
 ['cache mismatch',b=>{b.before.protected.SR0052.cacheControl='max-age=0';}],['live policy drift',b=>{b.before.policiesMd5='f'.repeat(32);}],
])test(`Pre-network gate: ${label}`,async()=>{const b=bundle();mutate(b);let calls=0;await assert.rejects(m.httpPhase(b,'baseline',async()=>{calls++;},()=>NOW));assert.equal(calls,0);});
test('Baseline anonymous exact URL twice, body SHA, cache observations, no auth or sensitive report',async()=>{
 const b=bundle(),t=transport(b),r=await m.httpPhase(b,'baseline',t.send,()=>NOW);
 assert.equal(r.evidenceType,'OFFLINE_INJECTED_TRANSPORT_NOT_LIVE');assert.equal(r.status,'BASELINE_CAPTURED_NOT_PRIVACY_ACCEPTANCE');assert.equal(t.calls.length,2);assert.equal(t.calls[0].url,t.calls[1].url);
 assert.deepEqual(t.calls[0].headers,{});assert.equal(r.results[0].bodySha256,m.digest(image));assert.equal(r.results[0].edgeColdProven,false);assert.equal(r.results[1].cacheObservation,'REPORTED_HIT');
 for(const value of [b.context.baseline.path,m.ORIGIN,b.secrets.clientA.password])assert.equal(JSON.stringify(r).includes(value),false);
});
for(const [name,options,code] of [['unknown cache',{unknownCache:true},'UNKNOWN_CACHE_BEHAVIOR'],['changed body',{changedBody:true},'BASELINE_BODY_CHANGED']])test(`Baseline stops: ${name}`,async()=>{const b=bundle(),t=transport(b,options),r=await m.httpPhase(b,'baseline',t.send,()=>NOW);assert.equal(r.status,'STOP');assert.equal(r.safeCode,code);});
test('Approval expiry is rechecked between HTTP requests',async()=>{
 const b=bundle(),t=transport(b);let now=NOW;const r=await m.httpPhase(b,'baseline',async req=>{const result=await t.send(req);now=NOW+7200000;return result;},()=>now);assert.equal(t.calls.length,1);assert.equal(r.status,'STOP');assert.equal(r.safeCode,'APPROVAL_INVALID_OR_EXPIRED');
});
test('Redirects, oversized responses and sensitive/unknown cache headers stop without leaking',async()=>{
 for(const reply of [result(302,{}),result(200,Buffer.alloc(5242881),{'content-type':'image/webp'}),result(200,image,{'content-type':'image/webp','cache-control':'max-age=3600','cf-cache-status':'HIT','cache-status':'https://private.invalid/DO_NOT_PRINT'})]){
  const b=bundle(),r=await m.httpPhase(b,'baseline',async()=>reply,()=>NOW);assert.equal(r.status,'STOP');assert.equal(JSON.stringify(r).includes('private.invalid'),false);
 }
});
test('Service-role or foreign-issuer tokens are rejected before any HTTP',async()=>{
 for(const claims of [{role:'service_role',iss:m.ORIGIN+'/auth/v1'},{role:'authenticated',iss:'https://foreign.invalid/auth/v1'}]){
  const b=bundle('post-cutover');b.secrets.clientA.accessToken='e30.'+Buffer.from(JSON.stringify({...claims,sub:b.config.accounts.clientA.id})).toString('base64url')+'.OFFLINE_SIGNATURE';
  let calls=0;const r=await m.httpPhase(b,'post-cutover',async()=>{calls++;},()=>NOW);assert.equal(calls,0);assert.equal(r.safeCode,'USER_SESSION_TOKEN_REQUIRED');
 }
});
test('Shared-cache extensions and invalid Age are not accepted as the stored one-hour baseline',async()=>{
 for(const headers of [{'cache-control':'public, max-age=3600, s-maxage=86400'},{'cache-control':'max-age=3600',age:'unknown'}]){
  const b=bundle(),r=await m.httpPhase(b,'baseline',async()=>result(200,image,{'content-type':'image/webp','cf-cache-status':'HIT',...headers}),()=>NOW);
  assert.equal(r.status,'STOP');assert.ok(['CACHE_DIRECTIVES_REQUIRE_REVIEW','UNKNOWN_CACHE_AGE'].includes(r.safeCode));
 }
});
test('Changed approval file stops an in-flight phase without renewal or further requests',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-readiness-revocation-'));
 try{const file=path.join(dir,'offline-fixture.json');fs.writeFileSync(file,'OFFLINE_FIXTURE_ONLY',{mode:0o600});
  const b=bundle();b.approvalFile=file;b.approvalSha=m.digest(fs.readFileSync(file));const t=transport(b);
  const r=await m.httpPhase(b,'baseline',async req=>{const reply=await t.send(req);fs.writeFileSync(file,'OFFLINE_CHANGED');return reply;},()=>NOW);
  assert.equal(t.calls.length,1);assert.equal(r.status,'STOP');assert.equal(r.safeCode,'APPROVAL_FILE_CHANGED');assert.equal(fs.readFileSync(file,'utf8'),'OFFLINE_CHANGED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Post-cutover matrix covers all eight actors; only allowlisted routes; tokens never reported',async()=>{
 const b=bundle('post-cutover'),t=transport(b),r=await m.httpPhase(b,'post-cutover',t.send,()=>NOW);
 assert.equal(r.status,'HTTP_MATRIX_PASSED_PENDING_PROTECTED_SNAPSHOT');assert.equal(r.results.filter(x=>x.operation==='authenticated-download').length,8);
 assert.equal(r.results.filter(x=>x.operation==='sign').length,8);assert.equal(r.results.filter(x=>x.operation==='list').length,8);
 assert.ok(t.calls.every(x=>m.routeAllowed(x.method,x.url)));assert.equal(t.calls.find(x=>x.url.includes('request_image_reference')).headers.Authorization.startsWith('Bearer '),true);
 for(const value of ['OFFLINE_SECRET_PASSWORD_12345','OFFLINE_FAKE_SIGNATURE','NEVER_PERSIST_REFRESH',b.context.baseline.path,m.ORIGIN])assert.equal(JSON.stringify(r).includes(value),false);
});
test('Native list 200 empty is separately labeled filtered, while any returned metadata stops',async()=>{
 const b=bundle('post-cutover'),empty=transport(b,{emptyList:true}),r=await m.httpPhase(b,'post-cutover',empty.send,()=>NOW);
 assert.equal(r.status,'HTTP_MATRIX_PASSED_PENDING_PROTECTED_SNAPSHOT');assert.equal(r.results.filter(q=>q.outcome==='FILTERED_EMPTY_NOT_HTTP_DENIAL').length,8);
 const leaked=transport(b,{nonemptyList:true}),failed=await m.httpPhase(b,'post-cutover',leaked.send,()=>NOW);
 assert.equal(failed.status,'STOP');assert.equal(failed.safeCode,'STORAGE_OPERATION_NOT_DENIED');assert.equal(JSON.stringify(failed).includes('NEVER_REPORT_IMAGE_NAME'),false);
});
for(const [label,options,code] of [['bad credentials',{loginFail:true},'AUTHENTICATION_FAILED'],['proxy 403',{proxyDenial:true},'STORAGE_OPERATION_NOT_DENIED'],['unexpected signing allowed',{signAllowed:true},'STORAGE_OPERATION_NOT_DENIED'],['unauthorized image bytes',{leak:true},'UNAUTHORIZED_DOWNLOAD_NOT_DENIED'],['old public response',{oldPublicAccessible:true},'OLD_PUBLIC_URL_STILL_ACCESSIBLE']])test(`Matrix stops: ${label}`,async()=>{
 const b=bundle('post-cutover'),t=transport(b,options),r=await m.httpPhase(b,'post-cutover',t.send,()=>NOW);assert.equal(r.status,'STOP');assert.equal(r.safeCode,code);assert.equal(JSON.stringify(r).includes('NEVER_PRINT_SIGNED_URL_TOKEN'),false);
});
test('Missing operation review, wrong actor, unrelated negative target and protected preconfirm fixture blocked',()=>{
 for(const change of [b=>{b.context.reviewedImageReaders[m.READERS[0]].volatility='v';},b=>{b.context.operationContractReviewed=false;},b=>{b.config.accounts.providerB.id=b.config.accounts.providerA.id;},b=>{b.context.cases.find(q=>q.label==='anonymous').path='other/unknown.webp';},b=>{b.context.cases.find(q=>q.label==='selected-before').requestId='SR0052';}]){const b=bundle('post-cutover');change(b);assert.throws(()=>m.validateBundle(b,'post-cutover',NOW));}
});
test('Finalization requires new after-snapshot and strict service, payment/review/message/image protection',async()=>{
 const b=bundle(),t=transport(b),r=await m.httpPhase(b,'baseline',t.send,()=>NOW);const after=structuredClone(b.before);after.capturedAt=iso(1000);
 assert.equal(m.finalize(b,r,after,NOW+2000).protectedAfter,'PASS');
 for(const mutate of [s=>{s.capturedAt=iso(-1000);},s=>{s.protected.SR0001.relatedMd5='f'.repeat(32);},s=>{s.protected.SR0052.imageMetadataMd5='f'.repeat(32);},s=>{s.imageObjectCount=2;}]){const changed=structuredClone(after);mutate(changed);assert.throws(()=>m.finalize(b,r,changed,NOW+2000));}
});
test('Report binding and actor/fixture state changes stop matrix finalization',async()=>{
 const b=bundle('post-cutover'),t=transport(b),r=await m.httpPhase(b,'post-cutover',t.send,()=>NOW),after=structuredClone(b.before);after.capturedAt=iso(1000);
 const altered=structuredClone(after);altered.fixtures['OFFLINE-BEFORE'].status='confirmed';assert.throws(()=>m.finalize(b,r,altered,NOW+2000));
 assert.throws(()=>m.finalize(b,{...r,contextSha256:'f'.repeat(64)},after,NOW+2000));
});
test('Private files and reports cannot live in Git/frontend or overwrite evidence',()=>{
 assert.throws(()=>m.privatePath(__filename));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-readiness-private-'));try{
  const file=path.join(dir,'fake-private.json');fs.writeFileSync(file,'{}',{mode:0o600});assert.equal(m.readPrivate(file).value.constructor,Object);assert.throws(()=>m.privatePath(file,true));
  fs.mkdirSync(path.join(dir,'web'));fs.writeFileSync(path.join(dir,'web','fake.json'),'{}',{mode:0o600});assert.throws(()=>m.readPrivate(path.join(dir,'web','fake.json'),path.join(dir,'web')));
  const bom=path.join(dir,'bom.json');fs.writeFileSync(bom,Buffer.concat([Buffer.from([255,254]),Buffer.from('{"fixture":true}','utf16le')]),{mode:0o600});assert.equal(m.readPrivate(bom).value.fixture,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Forbidden mutation/signup/production/redirect routes never allowed; Windows transport keeps TLS/proxy',()=>{
 for(const [method,url] of [['DELETE',m.ORIGIN+'/storage/v1/object/request-images'],['PATCH',m.ORIGIN+'/rest/v1/service_requests'],['POST',m.ORIGIN+'/auth/v1/signup'],['POST',m.ORIGIN+'/rest/v1/rpc/provider_confirm_request'],['GET','https://giqtnbwyktbnbhdvjraa.supabase.co/storage/v1/object/public/request-images/a.png']])assert.equal(m.routeAllowed(method,url),false);
 const worker=fs.readFileSync(path.resolve(__dirname,'../tools/request-image-http.ps1'),'utf8');assert.match(worker,/AllowAutoRedirect = \$false/);assert.match(worker,/UseProxy = \$true/);assert.match(worker,/DefaultWebProxy/);assert.doesNotMatch(worker,/ServerCertificateCustomValidationCallback\s*=/);assert.match(worker,/5242880/);
});
(async()=>{const results=[];for(const t of tests){try{await t.run();results.push({name:t.name,status:'PASS'});console.log('PASS',t.name);}catch(e){results.push({name:t.name,status:'FAIL',error:e.message});console.error('FAIL',t.name,e.message);}}
 if(process.env.READINESS_TEST_REPORT){fs.writeFileSync(process.env.READINESS_TEST_REPORT,JSON.stringify({scope:'OFFLINE synthetic only. No sockets, Windows HTTP, authentication or live Storage calls.',results},null,2));}
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length}));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(()=>{console.error('OFFLINE_TEST_HARNESS_FAILED');process.exitCode=1;});
