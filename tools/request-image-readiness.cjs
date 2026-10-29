/* Windows-local REVIEW package. Default plan: no network, credential reads or writes.
   Live phases require separate human authorization; never executes SQL or mutations. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const REF='oqalpauljjhytnrpzcqp',ORIGIN=`https://${REF}.supabase.co`;
const PROTECTED=['SR0001','SR0002','SR0011','SR0052'];
const KNOWN={saveRpcMd5:'fcf40031bee715b5078ccdd803d5e64b',operationMd5:'e2f7d55adc027df69ec4b42c6c08f50f',policiesMd5:'d32ba30e81d6497aa55b53d507dab2b0',sr0052Row:'2ce13c921f2443f78a752e439fc37b79',sr0052Image:'a05a9342d3ff96970818bac4fb00a8cf'};
const SOURCES=['clients-previews','frontends-backends','auth-admin-provisioning','workers-queues-retries','ci-cd-schedules','webhooks-notifications','local-development','privileged-writers'];
const READERS=['public.request_image_reference(text)','public.request_image_access_contract()','igotu_backend_private.request_image_reference(text)','igotu_backend_private.request_image_access_contract()','igotu_backend_private.can_read_request_image(text)','igotu_backend_private.request_image_path(text,text,uuid)'];
const CASES=['owner','selected-before','selected-after','unrelated-client','nonselected-provider','admin','anonymous','inactive'];
const MD5=/^[0-9a-f]{32}$/,SHA=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zoned=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=(b,algorithm='sha256')=>crypto.createHash(algorithm).update(b).digest('hex');
function check(value,code){if(!value){const e=new Error(code);e.safeCode=code;throw e;}}
function privatePath(file,write=false,frontend){
 check(typeof file==='string'&&file.length>0,'PRIVATE_PATH_REQUIRED');
 const target=write?path.join(fs.realpathSync(path.dirname(file)),path.basename(file)):fs.realpathSync(file);
 for(let dir=write?path.dirname(target):path.dirname(target);;dir=path.dirname(dir)){
  const marker=path.join(dir,'.git');
  const repository=fs.existsSync(marker)&&(fs.statSync(marker).isFile()||fs.existsSync(path.join(marker,'HEAD')));
  check(!repository,'PRIVATE_FILES_OUTSIDE_ALL_GIT_CHECKOUTS_REQUIRED');
  if(path.dirname(dir)===dir)break;
 }
 for(const forbidden of [ROOT,frontend].filter(Boolean)){
  const root=fs.existsSync(forbidden)?fs.realpathSync(forbidden):path.resolve(forbidden);
  const rel=path.relative(root,target);check(rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'PRIVATE_FILES_OUTSIDE_REPO_AND_FRONTEND_REQUIRED');
 }
 if(!write){check(fs.statSync(target).isFile(),'PRIVATE_FILE_REQUIRED');check(process.platform==='win32'||(fs.statSync(target).mode&0o077)===0,'PRIVATE_FILE_PERMISSIONS_REQUIRED');}
 else check(!fs.existsSync(target),'REPORT_MUST_BE_NEW');
 return target;
}
function readPrivate(file,frontend){
 const name=privatePath(file,false,frontend),bytes=fs.readFileSync(name);
 try{return {value:JSON.parse(bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8').replace(/^\uFEFF/,'')),sha:digest(bytes)};}catch{check(false,'PRIVATE_JSON_INVALID');}
}
function verifyCandidate(){
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/private-request-images/manifest.json'),'utf8'));
 check(manifest.status==='REVIEW_ONLY_NOT_APPROVED_FOR_EXECUTION'&&manifest.execution_approval_received===false,'REVIEW_ONLY_MANIFEST_REQUIRED');
 for(const [file,expected] of Object.entries(manifest.files_sha256)){
  const resolved=path.resolve(ROOT,file);check(resolved.startsWith(ROOT+path.sep)&&digest(fs.readFileSync(resolved))===expected,'CANDIDATE_MANIFEST_MISMATCH');
 }
}

function plan(){return {phase:'dry-run',projectRef:REF,databaseEvidence:'INDEPENDENT_OPERATOR_REPORTED_NOT_RECOLLECTED',networkRequests:0,writes:0,authorization:'NOT_GRANTED',liveHttpAuthChecks:'UNVERIFIED_NOT_AUTHORIZED',phases:['baseline','post-cutover','finalize'],requiredEvidence:['existing private staging config/credentials','scope-specific explicit approval','reviewed context SHA-256','fresh protected snapshots and all four reviewed hash pins','signed maintenance window','post-download protected snapshot; no automatic SQL execution']};}
function windowValid(a,c,phase,now=Date.now()){
 check(a.projectRef===REF&&a.approved===true&&a.scope===(phase==='baseline'?'request-image-anonymous-baseline':'request-image-post-cutover-auth-http'),'EXPLICIT_PHASE_APPROVAL_REQUIRED');
 check(a.authorizationReference?.trim()&&a.approvedBy?.trim()&&a.privateFilesAclReviewed===true,'HUMAN_AUTHORIZATION_AND_ACL_REVIEW_REQUIRED');
 const start=Date.parse(a.approvedAt),end=Date.parse(a.expiresAt);
 check(zoned(a.approvedAt)&&zoned(a.expiresAt)&&Number.isFinite(start)&&start<=now&&end>now&&end-start<=7200000,'APPROVAL_INVALID_OR_EXPIRED');
 const w=c.maintenance;check(w&&zoned(w.startsAt)&&zoned(w.expiresAt)&&w.confirmedBy?.trim()&&Date.parse(w.startsAt)<=now&&Date.parse(w.expiresAt)>now&&Date.parse(w.expiresAt)<=end&&Date.parse(w.startsAt)>=start&&Date.parse(w.expiresAt)-Date.parse(w.startsAt)<=7200000,'MAINTENANCE_WINDOW_REQUIRED');
 for(const key of SOURCES){const s=w.sources?.[key];check(s&&zoned(s.confirmedAt)&&zoned(s.expiresAt)&&s.owner?.trim()&&s.confirmedBy?.trim()&&s.evidence?.trim()&&['paused','drained','verified-absent'].includes(s.state)&&Array.isArray(s.exceptions)&&s.exceptions.length===0&&Date.parse(s.confirmedAt)>=Date.parse(w.startsAt)&&Date.parse(s.confirmedAt)<=now&&Date.parse(s.expiresAt)>now&&Date.parse(s.expiresAt)<=Date.parse(w.expiresAt)&&s.resumptionAuthority?.trim(),'WRITER_SOURCE_UNVERIFIED');}
}
function verifySnapshot(c,s,phase,now,afterStarted){
 check(s.projectRef===REF&&s.postgresMajor===17&&s.backendPhase===4&&s.catalogReviewed===true,'SNAPSHOT_IDENTITY_OR_REVIEW_INVALID');
 const at=Date.parse(s.capturedAt);check(zoned(s.capturedAt)&&at<=now&&now-at<=600000&&(!afterStarted||at>=afterStarted),'FRESH_PROTECTED_SNAPSHOT_REQUIRED');
 check(s.bucketPublic===(phase==='baseline'),'BUCKET_STATE_MISMATCH');
 const expected=phase==='baseline'?KNOWN:c.reviewedPostCutoverFingerprints;
 check(expected&&['saveRpcMd5','operationMd5','policiesMd5'].every(k=>MD5.test(expected[k]||'')&&s[k]===expected[k]),'REVIEWED_FINGERPRINT_MISMATCH');
 for(const id of PROTECTED){
  const pin=c.protectedPins?.[id];check(MD5.test(pin?.rowMd5||'')&&s.protected?.[id]?.rowMd5===pin.rowMd5&&MD5.test(pin.relatedMd5||'')&&s.protected[id].relatedMd5===pin.relatedMd5,'PROTECTED_RECORD_HASH_MISMATCH');
 }
 check(c.protectedPins.SR0052.rowMd5===KNOWN.sr0052Row&&s.protected.SR0052.imageMetadataMd5===KNOWN.sr0052Image,'SR0052_PROTECTION_MISMATCH');
 check(s.protected.SR0052.cacheControl==='max-age=3600'&&s.protected.SR0052.mime==='image/webp'&&MD5.test(s.protected.SR0052.pathMd5||''),'SR0052_IMAGE_EVIDENCE_MISMATCH');
 if(phase==='post-cutover'){for(const name of READERS){const expected=c.reviewedImageReaders?.[name],actual=s.imageReaders?.[name];check(expected&&MD5.test(expected.md5||'')&&MD5.test(expected.aclMd5||'')&&stable(actual)===stable(expected)&&expected.owner==='postgres'&&['s','i'].includes(expected.volatility)&&expected.definer===name.startsWith('igotu_backend_private.'),'REVIEWED_READONLY_RPC_CATALOG_REQUIRED');}}
 check(s.imageObjectCount===(phase==='baseline'?1:c.expectedImageObjectCount)&&Number.isSafeInteger(s.imageObjectCount)&&s.imageObjectCount>0,'IMAGE_INVENTORY_MISMATCH');
}
function validateBundle(b,phase,now=Date.now()){
 const {config:c,context:x,approval:a,before:s}=b;
 check(c.projectRef===REF&&c.url===ORIGIN&&c.syntheticOnly===true&&/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(c.publishableKey||''),'EXACT_SYNTHETIC_STAGING_CONFIG_REQUIRED');
 check(x.projectRef===REF&&a.contextSha256===b.contextSha&&a.beforeSnapshotSha256===b.beforeSha&&a.configSha256===b.configSha,'APPROVAL_CONTEXT_BINDING_MISMATCH');
 check(a.proposalSha256===digest(fs.readFileSync(path.join(ROOT,'docs/private-request-images/proposal.sql'))),'CANDIDATE_SQL_HASH_MISMATCH');
 windowValid(a,x,phase,now);verifySnapshot(x,s,phase,now);
 check(x.baseline?.requestId==='SR0052'&&validImagePath(x.baseline.path)&&digest(x.baseline.path,'md5')===s.protected.SR0052.pathMd5,'BASELINE_IMAGE_BINDING_REQUIRED');
 if(phase==='post-cutover'){
  check(a.authenticateExistingSynthetic===true&&a.readOnlyImageHttp===true&&a.denyListSignChecks===true,'EXPLICIT_AUTH_AND_HTTP_SCOPE_REQUIRED');
  check(x.operationContractReviewed===true&&x.effectivePrivilegesReviewed===true&&x.cachePlanReviewed===true,'OPERATION_PRIVILEGE_AND_CACHE_PLAN_REVIEW_REQUIRED');
  check(Array.isArray(x.cases)&&x.cases.length===CASES.length&&new Set(x.cases.map(q=>q.label)).size===CASES.length&&CASES.every(k=>x.cases.some(q=>q.label===k)),'EXACT_AUTHORIZATION_MATRIX_REQUIRED');
  for(const q of x.cases){
   check(validImagePath(q.path)&&q.requestId&&s.fixtures?.[q.requestId]?.pathMd5===digest(q.path,'md5'),'FIXTURE_PATH_BINDING_MISMATCH');
   const f=s.fixtures[q.requestId];check(f.imageExists===true&&f.imageOwnerMatchesClient===true,'FIXTURE_IMAGE_INTEGRITY_REQUIRED');check(x.reviewedSyntheticRequestIds?.includes(q.requestId),'REVIEWED_SYNTHETIC_FIXTURE_REQUIRED');
   const account=q.actor?c.accounts?.[q.actor]:null;
   if(q.label==='anonymous')check(q.actor===null,'ANONYMOUS_CASE_MUST_HAVE_NO_SESSION');
   else check(account?.synthetic===true&&UUID.test(account.id||'')&&s.actors?.[account.id]?.id===account.id&&s.actors[account.id].role===account.role,'SYNTHETIC_ACTOR_BINDING_REQUIRED');
   const id=account?.id;
   if(account&&['owner','selected-before','selected-after','unrelated-client','nonselected-provider'].includes(q.label))check(s.actors[id].identityApproved===true&&s.actors[id].profileComplete===true,'APPROVED_PROFILE_REQUIRED');
   if(q.label==='owner')check(account.role==='client'&&f.clientId===id,'OWNER_CONTROL_REQUIRED');
   if(['selected-before','selected-after'].includes(q.label))check(account.role==='provider'&&f.providerId===id,'SELECTED_PROVIDER_BINDING_REQUIRED');
   if(q.label==='selected-before')check(f.status==='provider_selected'&&!PROTECTED.includes(q.requestId),'DEDICATED_PRECONFIRMATION_FIXTURE_REQUIRED');
   if(q.label==='selected-after')check(f.status==='confirmed','CONFIRMED_FIXTURE_REQUIRED');
   if(q.label==='unrelated-client')check(account.role==='client'&&f.clientId!==id,'UNRELATED_CLIENT_REQUIRED');
   if(q.label==='nonselected-provider')check(account.role==='provider'&&f.providerId!==id,'NONSELECTED_PROVIDER_REQUIRED');
   if(q.label==='admin')check(account.role==='admin','ADMIN_BINDING_REQUIRED');
   if(q.label==='inactive')check((f.clientId===id||f.providerId===id)&&s.actors[id].approvalHistoryMatches===true&&s.actors[id].profileComplete===true&&(s.actors[account.id].status==='inactive'||s.actors[account.id].status==='suspended'),'INACTIVE_ACTOR_REQUIRED');
   else if(account)check(s.actors[account.id].status==='active','ACTIVE_ACTOR_REQUIRED');
   if(['owner','selected-after','admin'].includes(q.label))check(SHA.test(q.bodySha256||''),'REVIEWED_POSITIVE_BODY_HASH_REQUIRED');
  }
  check(x.cases.find(q=>q.label==='selected-before').actor===x.cases.find(q=>q.label==='selected-after').actor,'SAME_SELECTED_PROVIDER_REQUIRED');
  const owner=x.cases.find(q=>q.label==='owner');
  for(const label of ['unrelated-client','nonselected-provider','anonymous']){const q=x.cases.find(q=>q.label===label);check(q.requestId===owner.requestId&&q.path===owner.path,'NEGATIVE_MUST_USE_POSITIVE_CONTROL_IMAGE');}
  const roleLabels=['owner','unrelated-client','selected-after','nonselected-provider','admin','inactive'];
  check(new Set(roleLabels.map(label=>c.accounts[x.cases.find(q=>q.label===label).actor].id)).size===roleLabels.length,'DISTINCT_ACTORS_REQUIRED');
 }
 return b;
}
function validImagePath(value){return typeof value==='string'&&/^[A-Za-z0-9_-]+\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(value);}
function routeAllowed(method,url){
 const u=new URL(url);if(u.origin!==ORIGIN||u.username||u.password||u.hash)return false;
 if(method==='POST'&&u.pathname==='/auth/v1/token'&&u.search==='?grant_type=password')return true;
 if(u.search)return false;
 return (method==='GET'&&(u.pathname==='/auth/v1/user'||/^\/storage\/v1\/object\/(public|authenticated)\/request-images\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(u.pathname)))||
  (method==='POST'&&['/rest/v1/rpc/request_image_reference','/rest/v1/rpc/request_image_access_contract','/storage/v1/object/list/request-images'].includes(u.pathname))||
  (method==='POST'&&/^\/storage\/v1\/object\/sign\/request-images\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(u.pathname));
}
function windowsTransport(request){
 check(process.platform==='win32','LIVE_RUNNER_WINDOWS_ONLY');
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'request-image-http.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',failed=false;const fail=()=>{if(!failed){failed=true;child.kill();reject(Object.assign(new Error('HTTP_TRANSPORT_FAILED'),{safeCode:'HTTP_TRANSPORT_FAILED'}));}};
  const timer=setTimeout(fail,45000);
  child.stdout.on('data',b=>{output+=b.toString();if(output.length>16000000)fail();});child.stderr.on('data',()=>{});child.on('error',fail);
  child.on('close',code=>{clearTimeout(timer);if(failed)return;try{check(code===0,'HTTP_TRANSPORT_FAILED');const r=JSON.parse(output);check(r.ok===true,'HTTP_TRANSPORT_FAILED');resolve({status:r.status,headers:r.headers,body:Buffer.from(r.bodyBase64,'base64')});}catch{fail();}});
  child.stdin.on('error',fail);child.stdin.end(JSON.stringify(request));
 });
}
function headersOf(r){
 const keep=['cache-control','age','expires','etag','last-modified','content-type','content-length','date','cache-status','x-cache','cf-cache-status'];
 return Object.fromEntries(keep.filter(k=>r.headers?.[k]!==undefined).map(k=>{
  const value=String(r.headers[k]);
  const safe=k==='content-type'?/^(image\/(png|jpeg|webp)|application\/json)(?:;[A-Za-z0-9= _-]+)?$/i.test(value):k==='etag'?/^(?:W\/)?"[A-Za-z0-9_-]{1,128}"$/.test(value):!/[\\/]|https?:|eyJ[A-Za-z0-9_-]{12}/i.test(value);
  return [k,safe&&value.length<=512?value:'[REDACTED_UNEXPECTED_HEADER]'];
 }));
}
function cacheClass(h){const s=[h['cache-status'],h['x-cache'],h['cf-cache-status']].filter(Boolean).join(' ').toUpperCase();return /\bHIT\b/.test(s)?'REPORTED_HIT':/\bMISS\b/.test(s)?'REPORTED_MISS':/BYPASS|DYNAMIC|REVALIDATED/.test(s)?'REPORTED_BYPASS_DYNAMIC_OR_REVALIDATION':'UNKNOWN';}
function isDenied(r,anonymous=false){
 if(!/application\/json/i.test(r.headers?.['content-type']||''))return false;
 let error;try{error=JSON.parse(r.body.toString());}catch{return false;}
 const status=String(error.statusCode||''),code=String(error.code||'');
 if([403,404].includes(r.status))return ['403','404'].includes(status)||['42501','AccessDenied','NoSuchKey','not_found'].includes(code);
 if(r.status===400)return ['403','404'].includes(status);
 if(anonymous&&r.status===401)return status==='401'||['42501','PGRST301','PGRST302'].includes(code);
 return false;
}
async function httpPhase(bundle,phase,transport=windowsTransport,clock=()=>Date.now()){
 validateBundle(bundle,phase,clock());
 const {config:c,context:x,approval:a}=bundle;
 const report={version:1,evidenceType:transport===windowsTransport?'LIVE_WINDOWS_HTTP':'OFFLINE_INJECTED_TRANSPORT_NOT_LIVE',projectRef:REF,phase,startedAt:new Date(clock()).toISOString(),contextSha256:bundle.contextSha,configSha256:bundle.configSha,approvalSha256:bundle.approvalSha,beforeSnapshotSha256:bundle.beforeSha,proposalSha256:a.proposalSha256,approvalExpiresAt:a.expiresAt,maintenanceExpiresAt:x.maintenance.expiresAt,results:[],status:'BLOCKED',protectedAfter:'UNVERIFIED_REQUIRED'};
 async function req(method,relative,token,body,anonymous=false){
  windowValid(a,x,phase,clock());
  if(bundle.approvalFile)check(digest(fs.readFileSync(bundle.approvalFile))===bundle.approvalSha,'APPROVAL_FILE_CHANGED');
  check(routeAllowed(method,ORIGIN+relative),'HTTP_ROUTE_NOT_ALLOWED');
  const headers=anonymous?{}:{apikey:c.publishableKey,...(token?{Authorization:`Bearer ${token}`}:{})};
  if(body)headers['Content-Type']='application/json';
  const r=await transport({method,url:ORIGIN+relative,headers,body:body?JSON.stringify(body):null});
  windowValid(a,x,phase,clock());
  if(bundle.approvalFile)check(digest(fs.readFileSync(bundle.approvalFile))===bundle.approvalSha,'APPROVAL_FILE_CHANGED');
  check(Number.isInteger(r.status)&&Buffer.isBuffer(r.body)&&r.body.length<=5242880,'HTTP_RESPONSE_INVALID');
  check(r.status<300||r.status>=400,'REDIRECT_REFUSED');return r;
 }
 try{
  if(phase==='baseline'){
   let previous;
   for(const label of ['fresh-client-exact-old-url','repeat-exact-old-url-edge-warm-candidate']){
    const r=await req('GET','/storage/v1/object/public/request-images/'+x.baseline.path,null,null,true);
    const headers=headersOf(r),sha=digest(r.body),classification=cacheClass(headers);
    report.results.push({case:label,status:r.status,headers,bodySha256:sha,bytes:r.body.length,cacheObservation:classification,clientCache:'NO_LOCAL_HTTP_CACHE',edgeColdProven:false});
    check(r.status===200&&/^image\/webp(?:;|$)/i.test(headers['content-type']||'')&&r.body.length>0,'BASELINE_CONTROL_FAILED');
    check(!previous||previous===sha,'BASELINE_BODY_CHANGED');previous=sha;
    check(!Object.values(headers).some(v=>v==='[REDACTED_UNEXPECTED_HEADER]'),'UNKNOWN_CACHE_HEADERS');
    check(classification!=='UNKNOWN','UNKNOWN_CACHE_BEHAVIOR');
    check(/(?:^|,)\s*(?:public\s*,\s*)?max-age=3600(?:,|$)/i.test(headers['cache-control']||''),'UNKNOWN_CACHE_LIFETIME');
    check(headers['cache-control'].toLowerCase().split(',').map(v=>v.trim()).every(v=>v==='public'||v==='max-age=3600'),'CACHE_DIRECTIVES_REQUIRE_REVIEW');
    check(headers.age===undefined||(/^\d+$/.test(headers.age)&&Number(headers.age)<=3600),'UNKNOWN_CACHE_AGE');
    check(headers.expires===undefined||Number.isFinite(Date.parse(headers.expires)),'UNKNOWN_CACHE_EXPIRY');
   }
   report.status='BASELINE_CAPTURED_NOT_PRIVACY_ACCEPTANCE';
  }else{
   const tokens=new Map();
   async function tokenFor(actor){
    if(!actor)return null;if(tokens.has(actor))return tokens.get(actor);
    const secret=(bundle.secrets.accounts||bundle.secrets)[actor];check(secret,'EXISTING_SYNTHETIC_CREDENTIAL_REQUIRED');let token=secret.accessToken;
    if(!token){check(typeof secret.password==='string'&&secret.password.length>=12&&typeof secret.email==='string'&&/\.(test|invalid)$/.test(secret.email.split('@')[1]||''),'EXISTING_SYNTHETIC_CREDENTIAL_REQUIRED');
     const login=await req('POST','/auth/v1/token?grant_type=password',null,{email:secret.email,password:secret.password});check(login.status===200,'AUTHENTICATION_FAILED');try{token=JSON.parse(login.body.toString()).access_token;}catch{} }
    check(typeof token==='string'&&token.length>20&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token),'AUTHENTICATION_FAILED');
    let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{}
    check(claims?.role==='authenticated'&&claims.iss===ORIGIN+'/auth/v1'&&claims.sub===c.accounts[actor].id,'USER_SESSION_TOKEN_REQUIRED');
    const user=await req('GET','/auth/v1/user',token);let id;try{id=JSON.parse(user.body.toString()).id;}catch{}
    check(user.status===200&&id===c.accounts[actor].id,'AUTHENTICATED_IDENTITY_CONTROL_FAILED');tokens.set(actor,token);return token;
   }
   // The owning Client is a real authenticated positive control before any denial.
   const ordered=[x.cases.find(q=>q.label==='owner'),...x.cases.filter(q=>q.label!=='owner')];
   for(const q of ordered){
    const token=await tokenFor(q.actor),allow=['owner','selected-after','admin'].includes(q.label);
    if(q.label==='owner'){
     const capability=await req('POST','/rest/v1/rpc/request_image_access_contract',token,{});
     check(capability.status===200&&JSON.parse(capability.body.toString())==='private-request-images-v1','PRIVATE_IMAGE_CAPABILITY_FAILED');
    }
    const reference=await req('POST','/rest/v1/rpc/request_image_reference',token,{p_request_id:q.requestId});
    if(allow){let rows;try{rows=JSON.parse(reference.body.toString());}catch{}check(reference.status===200&&Array.isArray(rows)&&rows.length===1&&rows[0].image_path===q.path,'AUTHORIZED_REFERENCE_FAILED');}
    else {let empty=false;try{empty=reference.status===200&&Array.isArray(JSON.parse(reference.body.toString()))&&JSON.parse(reference.body.toString()).length===0;}catch{}check(empty||isDenied(reference,!q.actor),'REFERENCE_NOT_DENIED');}
    const download=await req('GET','/storage/v1/object/authenticated/request-images/'+q.path,token);
    report.results.push({case:q.label,operation:'authenticated-download',status:download.status,bodySha256:allow?digest(download.body):undefined});
    if(allow)check(download.status===200&&digest(download.body)===q.bodySha256&&/^image\/(png|jpeg|webp)(?:;|$)/.test(download.headers['content-type']||''),'AUTHORIZED_DOWNLOAD_FAILED');
    else check(isDenied(download,!q.actor),'UNAUTHORIZED_DOWNLOAD_NOT_DENIED');
    for(const [operation,url,body] of [['list','/storage/v1/object/list/request-images',{prefix:q.path.split('/')[0],limit:1}],['sign','/storage/v1/object/sign/request-images/'+q.path,{expiresIn:60}]]){
     const r=await req('POST',url,token,body);let filteredEmpty=false;
     if(operation==='list'&&r.status===200&&/application\/json/i.test(r.headers['content-type']||'')){try{const rows=JSON.parse(r.body.toString());filteredEmpty=Array.isArray(rows)&&rows.length===0;}catch{}}
     report.results.push({case:q.label,operation,status:r.status,outcome:filteredEmpty?'FILTERED_EMPTY_NOT_HTTP_DENIAL':isDenied(r,!q.actor)?'ATTRIBUTABLE_HTTP_DENIAL':'UNEXPECTED_ACCESS_OR_RESPONSE'});
     check(filteredEmpty||isDenied(r,!q.actor),'STORAGE_OPERATION_NOT_DENIED');
    }
   }
   const old=await req('GET','/storage/v1/object/public/request-images/'+x.baseline.path,null,null,true);
   report.results.push({case:'exact-old-public-url',status:old.status,headers:headersOf(old)});check(isDenied(old,true),'OLD_PUBLIC_URL_STILL_ACCESSIBLE');
   report.status='HTTP_MATRIX_PASSED_PENDING_PROTECTED_SNAPSHOT';
  }
 }catch(e){report.status='STOP';report.safeCode=e.safeCode||'HTTP_CHECK_FAILED';}
 report.finishedAt=new Date(clock()).toISOString();return report;
}
function finalize(bundle,report,after,now=Date.now()){
 check(report.projectRef===REF&&['BASELINE_CAPTURED_NOT_PRIVACY_ACCEPTANCE','HTTP_MATRIX_PASSED_PENDING_PROTECTED_SNAPSHOT'].includes(report.status),'SUCCESSFUL_PHASE_REPORT_REQUIRED');
 const phase=report.phase;check(['baseline','post-cutover'].includes(phase)&&report.status===(phase==='baseline'?'BASELINE_CAPTURED_NOT_PRIVACY_ACCEPTANCE':'HTTP_MATRIX_PASSED_PENDING_PROTECTED_SNAPSHOT'),'PHASE_REPORT_MISMATCH');validateBundle(bundle,phase,now);
 check(report.contextSha256===bundle.contextSha&&report.configSha256===bundle.configSha&&report.approvalSha256===bundle.approvalSha&&report.beforeSnapshotSha256===bundle.beforeSha&&report.proposalSha256===bundle.approval.proposalSha256,'REPORT_BINDING_MISMATCH');
 check(Date.parse(report.finishedAt)<=Date.parse(after.capturedAt),'AFTER_HTTP_SNAPSHOT_REQUIRED');
 verifySnapshot(bundle.context,after,phase,now,Date.parse(report.finishedAt));
 check(stable(after.protected)===stable(bundle.before.protected),'PROTECTED_RECORDS_CHANGED');
 check(stable(after.imageReaders)===stable(bundle.before.imageReaders),'IMAGE_READER_CATALOG_CHANGED');
 check(stable(after.fixtures)===stable(bundle.before.fixtures)&&stable(after.actors)===stable(bundle.before.actors),'ACTORS_OR_FIXTURES_CHANGED');
 check(after.imageObjectCount===bundle.before.imageObjectCount,'IMAGE_INVENTORY_CHANGED');
 return {...report,protectedAfter:'PASS',status:phase==='baseline'?'BASELINE_COMPLETE_NOT_CUTOVER_APPROVAL':'MATRIX_COMPLETE_OPERATOR_REVIEW_REQUIRED',finalizedAt:new Date(now).toISOString()};
}
async function main(args){
 const allowed=['--phase','--execute','--config','--context','--approval','--secrets','--before','--after','--input-report','--report'];
 const options={};for(let i=0;i<args.length;i++){check(allowed.includes(args[i])&&!Object.hasOwn(options,args[i]),'UNKNOWN_OR_DUPLICATE_ARGUMENT');const k=args[i];options[k]=k==='--execute'?true:args[++i];check(options[k]!==undefined,'ARGUMENT_VALUE_REQUIRED');}
 const phase=options['--phase']||'dry-run';check(['dry-run','baseline','post-cutover','finalize'].includes(phase),'INVALID_PHASE');
 if(phase==='dry-run'){check(!options['--execute'],'DRY_RUN_CANNOT_EXECUTE');console.log(JSON.stringify(plan(),null,2));return 0;}
 check(phase==='finalize'||options['--execute']===true,'EXPLICIT_EXECUTE_REQUIRED');
 verifyCandidate();
 const configFile=readPrivate(options['--config']),config=configFile.value,frontend=config.frontendDirectory;
 privatePath(options['--config'],false,frontend);
 const context=readPrivate(options['--context'],frontend),approval=readPrivate(options['--approval'],frontend),before=readPrivate(options['--before'],frontend);
 const b={approvalFile:privatePath(options['--approval'],false,frontend),approvalSha:approval.sha,config,configSha:configFile.sha,context:context.value,contextSha:context.sha,approval:approval.value,before:before.value,beforeSha:before.sha};
 let result;
 if(phase==='finalize'){const inputReport=readPrivate(options['--input-report'],frontend).value;check(inputReport.evidenceType==='LIVE_WINDOWS_HTTP','LIVE_PHASE_REPORT_REQUIRED');result=finalize(b,inputReport,readPrivate(options['--after'],frontend).value);}
 else{
  validateBundle(b,phase);check(process.platform==='win32','LIVE_RUNNER_WINDOWS_ONLY');
  if(phase==='post-cutover')b.secrets=readPrivate(options['--secrets'],frontend).value;
  // Reserve a new private report before HTTP; never overwrite evidence/approvals.
  const reportPath=privatePath(options['--report'],true,frontend),fd=fs.openSync(reportPath,'wx',0o600);
  try{result=await httpPhase(b,phase);fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');}finally{fs.closeSync(fd);}
  console.log(JSON.stringify({phase,status:result.status,safeCode:result.safeCode,protectedAfter:result.protectedAfter}));return result.status==='STOP'?1:2;
 }
 const fd=fs.openSync(privatePath(options['--report'],true,frontend),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');}finally{fs.closeSync(fd);}
 console.log(JSON.stringify({phase,status:result.status,protectedAfter:result.protectedAfter}));return 0;
}
if(require.main===module)main(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.safeCode||'LOCAL_READINESS_BLOCKED');process.exitCode=2;});
module.exports={REF,ORIGIN,KNOWN,PROTECTED,SOURCES,READERS,CASES,digest,plan,windowValid,verifySnapshot,validateBundle,routeAllowed,httpPhase,finalize,readPrivate,privatePath,verifyCandidate,main};
