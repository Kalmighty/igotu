/* Offline regression: in-memory REST model and generated temporary credentials only. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { model }=require('./priority.test.cjs');
const { guardRuntime,executeCase,main:priorityMain }=require('./priority.cjs');
const { stateFile }=require('./remaining.cjs');
const { prepare,finish,buildContext,PROVIDER_B,REF }=require('./prepare-provider-b.cjs');
function approve(m) {
  m.users.find(u=>u.name==='providerB').identity_verified=true;
  m.history.find(h=>h.user_id===m.x.config.accounts.providerB.id).status='approved';
}
function files(root,m) {
  fs.mkdirSync(root);
  const approval={ syntheticOnly:true,projectRef:REF,expiresAt:new Date(Date.now()+3600000).toISOString(),network:true,syntheticWrites:true,migrationsReviewed:true,migrationsInstalled:true,privateSchemaReviewed:true,testAccountsReviewed:true,remainingTests:true };
  const bootstrap={ projectRef:REF,accounts:Object.fromEntries(Object.keys(m.x.config.accounts).map(n=>[n,{ email:n+'@igotu.test',password:'INERT-SYNTHETIC-password123!' }])) };
  for(const [name,data]of Object.entries({ config:m.x.config,approval,'synthetic-bootstrap':bootstrap,'priority-state':{ binding:'OLD-BINDING-DO-NOT-MODIFY',checks:{ 'priority.pass.ST-08':true,'priority.pass.ST-10':true } } }))fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(data),{ mode:0o600 });
  fs.mkdirSync(path.join(root,'priority-reports'));fs.writeFileSync(path.join(root,'priority-reports','ST08-ST10.json'),'RETAINED LIVE EVIDENCE');
  return{ approval,bootstrap };
}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-provider-b-'));
  const logs=[],oldLog=console.log;console.log=(...args)=>logs.push(args.join(' '));
  try {
    const m=model({ providerBId:PROVIDER_B }),x=guardRuntime(m.x);
    const request=await x.success(x.rpc(await x.actor('clientA'),'create_service_request',{ p_idempotency_key:'test',p_details:x.details('SYNTHETIC AUTH CONTROL') }));
    const rid=request[0].request_id;
    await x.success(x.rpc(await x.actor('clientA'),'client_select_provider',{ p_request_id:rid,p_provider_id:m.x.config.accounts.providerA.id }));
    const args={ p_request_id:rid,p_reason:'SYNTHETIC decline' };
    const before=m.count();
    for(const [actor,name,parameters,pattern]of [
      [null,'provider_decline_request',args,/AUTHENTICATED_PROVIDER_REQUIRED/],
      [await x.actor('clientA'),'provider_decline_request',args,/AUTHENTICATED_PROVIDER_REQUIRED/],
      [{ ...await x.actor('providerA'),token:'' },'provider_decline_request',args,/AUTHENTICATED_PROVIDER_REQUIRED/],
      [{ ...await x.actor('providerA'),id:PROVIDER_B },'provider_decline_request',args,/AUTHENTICATED_PROVIDER_REQUIRED/],
      [await x.actor('providerB'),'provider_decline_request',args,/DECLINE_OWN_ASSIGNMENT_REQUIRED/],
      [await x.actor('providerA'),'provider_decline_request',{ ...args,p_request_id:'SR0001' },/PROTECTED_SR0001/],
      [await x.actor('providerA'),'provider_decline_request',{ ...args,p_reason:'' },/DECLINE_ARGUMENTS/],
      [await x.actor('providerA'),'provider_decline_request',{ ...args,p_provider_id:PROVIDER_B },/DECLINE_ARGUMENTS/],
      [await x.actor('providerA'),'admin_update_user_status',{},/OUTSIDE_SCOPE/],
      [await x.actor('providerA'),'admin_review_verification',{},/OUTSIDE_SCOPE/],
      [await x.actor('providerA'),'transition',{},/OUTSIDE_SCOPE/],
    ])await assert.rejects(x.rpc(actor,name,parameters),pattern);
    for(const name of ['client_select_provider','provider_confirm_request','provider_start_request','client_complete_request','client_cancel_request','provider_decline_request']) await assert.rejects(x.rpc(await x.actor('providerA'),name,{...args,p_request_id:'SR0001'}),/PROTECTED_SR0001/);
    await assert.rejects(async()=>x.table(await x.actor('clientA'),'payment_records',{},'POST',{request_id:'SR0001'}),/OUTSIDE_SCOPE/);
    await assert.rejects(async()=>x.request(await x.actor('providerA'),'/rest/v1/rpc/provider_decline_request',{method:'POST',body:args}),/OUTSIDE_SCOPE/);
    assert.equal(m.count(),before,'Rejected calls cannot mutate');
    const originalControl=x.sessionControl;x.sessionControl=async()=>{throw Error('BROKEN SESSION');};
    await assert.rejects(x.rpc(await x.actor('providerA'),'provider_decline_request',args),/BROKEN SESSION/);
    assert.equal(m.count(),before);x.sessionControl=originalControl;
    await x.success(x.rpc(await x.actor('providerA'),'provider_decline_request',args));
    assert.equal(m.declines.length,1);assert.equal(m.requests.find(r=>r.request_id===rid).status,'pending');
    const gate=stateFile(path.join(dir,'gate.json'),'gate');
    await assert.rejects(executeCase(x,gate,'ST-19','--prepare'),/ST12_FOCUSED_PASS_REQUIRED/);
    gate.data.checks['priority.pass.ST-12']=true;
    await assert.rejects(executeCase(x,gate,'ST-19','--run'),/ST19_PREPARATION_REQUIRED/);
    const live=model({ providerBId:PROVIDER_B });approve(live);
    // An empty approval-created profile row is safe to fill; its badge is retained.
    live.profiles.push({ provider_id:PROVIDER_B,bio:null,location:null,provider_lat:null,provider_lng:null,is_available:true,is_verified:true });
    const source=path.join(dir,'source'),{ approval,bootstrap }=files(source,live);
    const oldState=fs.readFileSync(path.join(source,'priority-state.json'));
    const oldReports=fs.readFileSync(path.join(source,'priority-reports','ST08-ST10.json'));
    assert.throws(()=>buildContext(live.x.config,approval,{ ...bootstrap,projectRef:'wrong' },'2030-02-11'),/EXACT_STAGING/);
    fs.writeFileSync(path.join(source,'synthetic-bootstrap.json'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(JSON.stringify(bootstrap),'utf16le')]));
    assert.throws(()=>prepare(path.resolve(__dirname,'../..')),/OUTSIDE_REPOSITORY/);
    const originalInputs=Object.fromEntries(['config.json','approval.json','synthetic-bootstrap.json'].map(name=>[name,fs.readFileSync(path.join(source,name))]));
    const context=prepare(source);
    assert.equal(JSON.parse(fs.readFileSync(path.join(context.output,'config.json'))).accounts.providerB.id,PROVIDER_B);
    assert.equal(JSON.parse(fs.readFileSync(path.join(context.output,'config.json'))).date,'2030-02-11');
    const isolatedSecrets=JSON.parse(fs.readFileSync(path.join(context.output,'secrets.json')));
    assert.deepEqual(Object.keys(isolatedSecrets),['clientA','clientB','providerA','providerB']);
    assert.equal(isolatedSecrets.admin,undefined);
    if(process.platform!=='win32')assert.equal(fs.statSync(path.join(context.output,'secrets.json')).mode&0o077,0);
    await finish(context,args=>priorityMain(args,live.transport));
    assert.equal(process.exitCode,3);
    const journal=JSON.parse(fs.readFileSync(context.journal));
    assert.equal(journal.checks['priority.pass.ST-12'],true);assert.equal(journal.checks['priority.pass.ST-19'],true);
    assert.equal(live.declines.length,1);assert.equal(live.requests.filter(r=>r.status==='cancelled').length,40);
    assert.equal(live.requests.length,42);assert.equal(live.profiles.find(p=>p.provider_id===PROVIDER_B).is_verified,true);
    const count=live.count(),journalBefore=fs.readFileSync(context.journal);
    assert.deepEqual(prepare(source),context);
    assert.deepEqual(fs.readFileSync(context.journal),journalBefore,'Local helper cannot rewrite journal');
    await finish(context,args=>priorityMain(args,live.transport));assert.equal(live.count(),count,'Resume cannot repeat successful mutations');
    for(const [name,bytes]of Object.entries(originalInputs))assert.deepEqual(fs.readFileSync(path.join(source,name)),bytes);
    assert.deepEqual(fs.readFileSync(path.join(source,'priority-state.json')),oldState);
    assert.deepEqual(fs.readFileSync(path.join(source,'priority-reports','ST08-ST10.json')),oldReports);
    assert.throws(()=>prepare(source,'2030-03-01'),/ISOLATED_CONFIG_BINDING_CHANGED/);
    for(const commit of [true,false]) {
      const lost=model({ providerBId:PROVIDER_B,at:'decline',commit });approve(lost);
      const root=path.join(dir,'lost'+commit);files(root,lost);const c=prepare(root);
      await finish(c,args=>priorityMain(args,lost.transport));assert.equal(process.exitCode,2);
      assert.equal(lost.requests.filter(r=>r.title?.includes('ST-19')).length,0,'No race trial before ST-12 PASS');
      const writes=lost.count();await finish(c,args=>priorityMain(args,lost.transport));
      if(commit) {assert.equal(process.exitCode,3);assert.equal(lost.declines.length,1);}
      else {assert.equal(process.exitCode,2);assert.equal(lost.count(),writes,'Absent uncertain decline must not retry');}
    }
    const pending=model({ providerBId:PROVIDER_B }),pendingRoot=path.join(dir,'pending');files(pendingRoot,pending);const pendingContext=prepare(pendingRoot);
    await finish(pendingContext,args=>priorityMain(args,pending.transport));assert.equal(process.exitCode,2);assert.equal(pending.count(),0,'Pending identity cannot cause profile writes');
    for(const kind of ['consent','partial']) {
      const restricted=model({providerBId:PROVIDER_B});approve(restricted);
      if(kind==='consent')restricted.history.find(h=>h.user_id===PROVIDER_B).privacy_consent=false;
      else restricted.profiles.push({provider_id:PROVIDER_B,bio:'KEEP THIS SYNTHETIC PARTIAL PROFILE',provider_lat:null,provider_lng:null});
      const root=path.join(dir,kind);files(root,restricted);await finish(prepare(root),args=>priorityMain(args,restricted.transport));
      assert.equal(process.exitCode,2);assert.equal(restricted.count(),0);
    }
    assert(logs.every(line=>!line.includes('INERT-SYNTHETIC-password123!')&&!line.includes('@igotu.test')),'No credential or private object logging');
    process.exitCode=0;console.log=oldLog;
    console.log('PASS OFFLINE: authenticated own-assignment decline allowlist/denials; private bootstrap isolation and stable bindings; consent/profile gates; ST-12 before twenty modeled ST-19 trials; no-repeat resume and uncertain-write reconciliation. No live staging test executed.');
  }finally{console.log=oldLog;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
