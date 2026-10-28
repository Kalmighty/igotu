/* In-memory REST/Storage model and private temporary files. No live connections. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const { check,CheckError }=require('./runtime.cjs');
const { stateFile,checks }=require('./remaining.cjs');
const { main,selected,mode,guardRuntime,protectedEvidence,providerB,prerequisite,transfer,matching,executeCase,reportRows }=require('./priority.cjs');
function model(fault={}) {
  const names=['clientA','providerA','clientB','providerB','pending','rejected','suspended'];
  const accounts=Object.fromEntries(names.map((n,i)=>[n,{ synthetic:true,id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,role:/provider|pending/.test(n)?'provider':'client' }]));
  if (fault.providerBId) accounts.providerB.id=fault.providerBId;
  const actors=Object.fromEntries(names.map(n=>[n,{ ...accounts[n],name:n,token:n }]));
  const id=n=>accounts[n].id;
  const users=names.map(n=>({ ...actors[n],status:n==='suspended'?'suspended':'active',profile_completed:n!=='providerB',identity_verified:!['providerB','pending','rejected'].includes(n) }));
  const history=names.map(n=>({ user_id:id(n),status:n==='providerB'||n==='pending'?'pending':n==='rejected'?'rejected':'approved',age_confirmed:true,privacy_consent:true }));
  const requests=[{ id:'protected-row',request_id:'SR0001',client_id:id('clientA'),selected_provider_id:id('providerA'),status:'completed' }];
  const payments=[{ id:'protected-payment',request_id:'SR0001',amount:100,payment_method:'Cash' }];
  const reviews=[id('clientA'),id('providerA')].map((reviewer_id,i)=>({ id:'protected-review-'+i,request_id:'SR0001',reviewer_id,rating:5 }));
  const messages=[['clientA','providerA'],['providerA','clientA']].map(([sender,receiver],i)=>({ id:'protected-message-'+i,request_id:'SR0001',sender_id:id(sender),receiver_id:id(receiver),is_read:true,message_text:'PROTECTED' }));
  const profiles=[{ provider_id:id('providerA'),bio:'SYNTHETIC',location:'SYNTHETIC',provider_lat:6,provider_lng:116,is_available:true }];
  const skills=[{ provider_id:id('providerA'),category:'Cleaning' }],specs=[{ provider_id:id('providerA'),category:'Cleaning',specialization:'Home Cleaning' }];
  const hours=Array.from({ length:7 },(_,i)=>({ provider_id:id('providerA'),day_of_week:i,start_time:'08:00:00',end_time:'18:00:00' }));
  const declines=[],notifications=[],objects=[];let writes=0,faulted=false;
  const ok=data=>({ ok:true,status:200,data });
  const filter=(rows,query={})=>structuredClone(rows.filter(r=>Object.entries(query).every(([k,v])=>!String(v).startsWith('eq.')||String(r[k])===v.slice(3))));
  const config={ projectRef:'oqalpauljjhytnrpzcqp',url:'https://oqalpauljjhytnrpzcqp.supabase.co',syntheticOnly:true,publishableKey:'sb_publishable_synthetic_public_fixture',mailDomain:'igotu.test',date:'2030-01-07',accounts,priority:{ matchingReviewed:true,expectedProviderNames:{ exact:['providerA'],near:['providerA'],far:['providerA'],start:['providerA'],wrongCategory:[],wrongSpecialization:[],beforeHours:[],endExclusive:[] } } };
  const fail=key=>{if(fault.at===key&&!faulted){faulted=true;throw new CheckError('TRANSPORT_FAILED');}};
  const x={ config,png:Buffer.from('SYNTHETIC INERT PNG'),
    actor:async n=>actors[n],success:async op=>{const r=await op;check(r.ok,'POSITIVE_CONTROL_FAILED');return r.data;},sessionControl:async()=>{},
    denied:async(a,fn)=>{const r=await fn();check((r.status===403&&r.data?.code==='42501')||(r.ok&&Array.isArray(r.data)&&r.data.length===0),'AUTHORIZATION_DENIAL_NOT_PROVEN');},
    details:(title,date=config.date,time='10:00:00')=>({ title,preferred_date:date,preferred_time:time,budget:100,category:'Cleaning',service_type:'Home Cleaning',description:'SYNTHETIC',location:'SYNTHETIC',client_lat:6,client_lng:116,priority:'normal' }),
    profile:a=>({ p_profile:{ bio:'SYNTHETIC',location:'SYNTHETIC',provider_lat:6,provider_lng:116,is_available:true },p_full_name:'Synthetic '+a.name,p_phone:'01000000000',p_skills:['Cleaning'],p_specializations:[{ category:'Cleaning',specialization:'Home Cleaning' }],p_weekly_hours:Array.from({ length:7 },(_,day_of_week)=>({ day_of_week,start_time:'08:00',end_time:'18:00' })) }),
    table:async(a,name,query={},method='GET',body)=>{
      const tables={ users,service_requests:requests,payment_records:payments,service_reviews:reviews,internal_messages:messages,verification_requests:history,provider_profiles:profiles,provider_skills:skills,provider_specializations:specs,provider_weekly_availability:hours,service_request_declines:declines,notifications };
      assert(name in tables,'Unknown table '+name);
      if(method==='POST') {assert.equal(name,'payment_records');writes++;if(fault.at==='payment'&&fault.commit===false)fail('payment');payments.push({ ...body,id:'payment-'+payments.length });fail('payment');return ok([body]);}
      return ok(filter(tables[name],query));
    },
    rpc:async(a,name,args={})=>{
      const r=requests.find(r=>r.request_id===args.p_request_id);
      if(name==='igotu_backend_contract')return ok({ version:'20261026.1',notifications:'database' });
      if(name==='create_service_request') {writes++;const request_id='SR'+String(requests.length+1).padStart(4,'0');requests.push({ ...args.p_details,request_id,id:'row-'+requests.length,client_id:a.id,creation_key:args.p_idempotency_key,status:'pending',selected_provider_id:null });return ok([{ request_id }]);}
      if(name==='recommended_provider_candidates') {
        const eligible=r.category==='Cleaning'&&r.service_type==='Home Cleaning'&&r.preferred_time>='08:00:00'&&r.preferred_time<'18:00:00';
        return ok(eligible?['providerA','providerB'].filter(n=>users.find(u=>u.id===id(n)).identity_verified && users.find(u=>u.id===id(n)).profile_completed && !declines.some(d=>d.request_id===r.request_id&&d.provider_id===id(n)) && !requests.some(b=>b.request_id!==r.request_id&&b.selected_provider_id===id(n)&&['provider_selected','confirmed','in_progress'].includes(b.status)&&b.preferred_date===r.preferred_date&&b.preferred_time===r.preferred_time)).map(n=>({ id:id(n),distance_km:Math.abs(r.client_lat-6)*111.19492664 })):[]);
      }
      if(name==='payment_proof_reference')return ok(payments.filter(p=>p.request_id===r.request_id).map(p=>({ proof_path:p.proof_path })));
      if(name==='provider_service_requests')return a.role==='provider'?ok(requests.filter(r=>r.selected_provider_id===a.id&&(!args.p_request_id||r.request_id===args.p_request_id))):{ ok:false,status:403,data:{ code:'42501' } };
      if(name==='provider_decline_request') {writes++;if(fault.at==='decline'&&fault.commit===false)fail('decline');assert.equal(r.selected_provider_id,a.id);declines.push({ request_id:r.request_id,provider_id:a.id,reason:args.p_reason });notifications.push({ user_id:r.client_id,event_key:'service_requests:'+r.id+':pending:'+a.id });r.status='pending';r.selected_provider_id=null;fail('decline');return ok(null);}
      if(name==='client_cancel_request'){writes++;assert.equal(r.client_id,a.id);r.status='cancelled';return ok(null);}
      if(name==='save_provider_profile') {writes++;const user=users.find(u=>u.id===a.id);user.profile_completed=true;user.full_name=args.p_full_name;user.phone=args.p_phone;const current=profiles.find(p=>p.provider_id===a.id);if(current)Object.assign(current,args.p_profile);else profiles.push({ provider_id:a.id,...args.p_profile });skills.push({ provider_id:a.id,category:'Cleaning' });specs.push({ provider_id:a.id,category:'Cleaning',specialization:'Home Cleaning' });hours.push(...args.p_weekly_hours.map(h=>({ provider_id:a.id,...h })));return ok(user);}
      const transitions={ client_select_provider:'provider_selected',provider_confirm_request:'confirmed',provider_start_request:'in_progress',client_complete_request:'completed' };
      if(name in transitions) {writes++;if(name==='client_select_provider'&&requests.some(b=>b.request_id!==r.request_id&&b.selected_provider_id===args.p_provider_id&&['provider_selected','confirmed','in_progress'].includes(b.status)&&b.preferred_date===r.preferred_date&&b.preferred_time===r.preferred_time))return{ok:false,status:400,data:{code:'P0001',message:'Provider no longer matches this request or is booked.'}};r.status=transitions[name];if(args.p_provider_id)r.selected_provider_id=args.p_provider_id;return ok(null);}
      throw Error('Unexpected RPC '+name);
    },
    request:async(a,resource,options={})=>{
      if(resource==='/storage/v1/object/list/payment-proofs')return ok(objects.filter(o=>o.owner===a.id&&o.name===options.body.search));
      if(resource.startsWith('/storage/v1/object/payment-proofs/')) {writes++;if(fault.at==='upload'&&fault.commit===false)fail('upload');objects.push({ owner:a.id,name:resource.split('/').at(-1) });fail('upload');return ok({ Key:'SYNTHETIC' });}
      if(resource.startsWith('/storage/v1/object/sign/'))return a.name==='clientB'?{ ok:false,status:400,data:{ statusCode:'400' } }:ok({ signedURL:'/object/sign/payment-proofs/SYNTHETIC?token=INERT' });
      if(resource.startsWith('/storage/v1/object/public/'))return{ ok:false,status:400,data:{ statusCode:'400' } };
      throw Error('Unexpected Storage request');
    }
  };
  const transport=async(raw,options)=>{
    const u=new URL(raw);assert.equal(u.origin,config.url);
    const body=Buffer.isBuffer(options.body)?options.body:options.body?JSON.parse(options.body):undefined;
    let result;
    if(u.pathname==='/auth/v1/token'){const n=body.email.split('@')[0];result=ok({ access_token:n,user:{ id:id(n) } });}
    else {const a=actors[options.headers.Authorization?.slice(7)];
      if(u.pathname.startsWith('/rest/v1/rpc/'))result=await x.rpc(a,u.pathname.split('/').at(-1),body);
      else if(u.pathname.startsWith('/rest/v1/'))result=await x.table(a,u.pathname.split('/').at(-1),Object.fromEntries(u.searchParams),options.method,body);
      else result=await x.request(a,u.pathname,{ ...options,body });}
    return{ ...result,text:async()=>JSON.stringify(result.data) };
  };
  return{ x,transport,declines,notifications,actors,users,history,messages,requests,payments,objects,profiles,count:()=>writes };
}
async function test(){
  assert.deepEqual(selected([]),['ST-05','ST-12','ST-19']);
  assert.throws(()=>selected(['--only','ST-13']),/PRIORITY_CASE_SELECTION_INVALID/);
  assert.throws(()=>mode(['--run','--prepare']),/ONE_PRIORITY_MODE_REQUIRED/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-priority-'));
  try {
    const m=model(),j=stateFile(path.join(dir,'main.json'),'test'),x=guardRuntime(m.x);
    const before=await protectedEvidence(x);
    await assert.rejects(providerB(x,j,true),/ORDINARY_IDENTITY_APPROVAL/);assert.equal(m.count(),0);
    await assert.rejects(async()=>x.rpc(await x.actor('providerB'),'admin_review_verification',{}),/OUTSIDE_SCOPE/);
    await assert.rejects(async()=>x.rpc(await x.actor('clientA'),'client_complete_request',{ p_request_id:'SR0001' }),/PROTECTED/);
    await assert.rejects(async()=>x.table(await x.actor('clientA'),'internal_messages',{},'POST',{}),/OUTSIDE_SCOPE/);
    const receipt=await transfer(x,j,true);assert.notEqual(receipt,'SR0001');
    assert.equal(m.payments.length,2);assert.equal(m.objects.length,1);
    let count=m.count();await transfer(x,j,true);assert.equal(m.count(),count,'Repeated prepare must not replay mutations');
    x.config.receiptRequestId=receipt;await transfer(x,stateFile(path.join(dir,'existing.json'),'existing'),true);assert.equal(m.count(),count,'Declared completed transfer is validated and reused without mutation');
    await executeCase(x,j,'ST-08','--run');assert.equal(m.count(),count,'ST-08 run must be read-only');
    await matching(x,j,true);assert.equal(m.requests.length,10);
    count=m.count();await executeCase(x,j,'ST-10','--run');assert.equal(m.count(),count,'Matching run must be read-only');
    assert.equal(await protectedEvidence(x),before);
    m.messages[0].message_text='MUTATED';assert.notEqual(await protectedEvidence(x),before);m.messages.pop();await assert.rejects(protectedEvidence(x),/PROTECTED_MESSAGE_STATE_CHANGED/);
    for(const at of ['upload','payment'])for(const commit of [true,false]) {
      const f=model({ at,commit }),fj=stateFile(path.join(dir,at+commit+'.json'),'fault');
      await assert.rejects(transfer(f.x,fj,true),/TRANSPORT_FAILED/);count=f.count();
      if(commit){await transfer(f.x,fj,true);assert.equal(f.objects.length,1);assert.equal(f.payments.length,2);}
      else {await assert.rejects(transfer(f.x,fj,true),/UNCERTAIN/);assert.equal(f.count(),count,'Uncertain absent write cannot retry');}
    }
    const verified=model(),vj=stateFile(path.join(dir,'provider.json'),'verified');
    verified.users.find(u=>u.name==='providerB').identity_verified=true;verified.history.find(h=>h.user_id===verified.x.config.accounts.providerB.id).status='approved';
    await providerB(verified.x,vj,true);assert(verified.users.find(u=>u.name==='providerB').profile_completed);count=verified.count();await providerB(verified.x,vj,true);assert.equal(verified.count(),count);
    const gate=model(),gj=stateFile(path.join(dir,'gate.json'),'gate');
    await assert.rejects(executeCase(gate.x,gj,'ST-19','--prepare'),/ST12_FOCUSED_PASS_REQUIRED/);assert.equal(gate.count(),0);
    assert(reportRows([]).filter(r=>r.priorFocusedLive).every(r=>r.status==='SKIPPED'&&r.priorFocusedLive.reexecuted===false&&r.fullAcceptance==='UNVERIFIED'));
    process.exitCode=0;
    console.log('PASS OFFLINE priority: protected messages, no Admin/authority writes, Provider B approval gate, once-only transfer/proof/payment reconciliation, eight matching fixtures, independent blocked cases, persisted passes and credential-free reports. No live test executed.');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={model};
