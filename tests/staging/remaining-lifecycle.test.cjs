/* Tests the runner's state machine using a model, not Supabase concurrency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stateFile, checks } = require('./remaining.cjs');
function model() {
  const actors=Object.fromEntries(['clientA','clientB','providerA','providerB'].map((name,i)=>[name,{ name,id:'actor-'+i,role:name.startsWith('client')?'client':'provider' }]));
  const requests=[],declines=[],notifications=[];let writes=0;
  const ok=data=>({ ok:true,status:200,data });
  const x={ config:{ date:'2030-01-07',remaining:{ decline:{ synthetic:true,create:true },concurrency:true } },
    actor:async name=>actors[name],
    success:async op=>{const r=await op;assert(r.ok,JSON.stringify(r));return r.data;},
    details:(title,date='2030-01-07',time='10:00:00')=>({ title,preferred_date:date,preferred_time:time,budget:100,category:'Cleaning',service_type:'Home Cleaning' }),
    table:async(a,name,query)=>{
      let rows;
      if(name==='users') rows=[{ ...a,status:'active',profile_completed:true,identity_verified:true }];
      else if(name==='service_requests') rows=requests.filter(r=>r.client_id===a.id);
      else if(name==='service_request_declines') rows=declines;
      else if(name==='notifications') rows=notifications.filter(n=>n.user_id===a.id);
      else throw Error('Unexpected table');
      return ok(structuredClone(rows.filter(r=>Object.entries(query).every(([k,v])=>!v.startsWith('eq.')||r[k]===v.slice(3)))));
    },
    rpc:async(a,name,args)=>{
      const r=requests.find(r=>r.request_id===args.p_request_id);
      if(name==='create_service_request') {
        writes++;assert(!requests.some(r=>r.creation_key===args.p_idempotency_key));
        const request_id='SYNTHETIC-'+requests.length;
        requests.push({ ...args.p_details,id:'row-'+requests.length,request_id,client_id:a.id,creation_key:args.p_idempotency_key,status:'pending',selected_provider_id:null });return ok([{ request_id }]);
      }
      if(name==='recommended_provider_candidates') {
        return ok(['providerA','providerB'].map(n=>actors[n]).filter(p=>!declines.some(d=>d.request_id===r.request_id&&d.provider_id===p.id)&&!requests.some(b=>b.request_id!==r.request_id&&b.preferred_date===r.preferred_date&&b.preferred_time===r.preferred_time&&b.selected_provider_id===p.id&&b.status==='provider_selected')).map(p=>({ id:p.id })));
      }
      if(name==='client_select_provider') {
        writes++;const busy=requests.some(b=>b.request_id!==r.request_id&&b.preferred_date===r.preferred_date&&b.preferred_time===r.preferred_time&&b.selected_provider_id===args.p_provider_id&&b.status==='provider_selected');
        if(busy)return{ ok:false,status:400,data:{ code:'P0001',message:'Provider no longer matches this request or is booked.' } };
        assert.equal(r.status,'pending');r.status='provider_selected';r.selected_provider_id=args.p_provider_id;return ok(null);
      }
      if(name==='provider_decline_request') {
        writes++;assert.equal(r.selected_provider_id,a.id);declines.push({ request_id:r.request_id,provider_id:a.id,reason:args.p_reason });
        notifications.push({ user_id:r.client_id,event_key:'service_requests:'+r.id+':pending:'+a.id });r.status='pending';r.selected_provider_id=null;return ok(null);
      }
      if(name==='provider_service_requests')return ok(requests.filter(r=>r.selected_provider_id===a.id&&(!args.p_request_id||r.request_id===args.p_request_id)&&(!args.p_statuses||args.p_statuses.includes(r.status))));
      if(name==='client_cancel_request'){writes++;assert.equal(r.client_id,a.id);r.status='cancelled';return ok(null);}
      throw Error('Unexpected RPC '+name);
    }
  };
  return { x,requests,declines,count:()=>writes };
}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'igotu-lifecycle-'));
  try {
    const m=model(),j=stateFile(path.join(dir,'state.json'),'model');
    await checks['ST-12'](m.x,j);
    assert.equal(m.requests.length,1);assert.equal(m.declines.length,1);
    assert.equal(m.requests[0].selected_provider_id,'actor-3');
    let count=m.count();await checks['ST-12'](m.x,j);assert.equal(m.count(),count,'Decline resume must not replay transitions');
    await checks['ST-19'](m.x,j);
    assert.equal(m.requests.length,41);assert.equal(m.requests.filter(r=>r.status==='cancelled').length,40);
    count=m.count();await checks['ST-19'](m.x,j);assert.equal(m.count(),count,'Race resume must not recreate fixtures or transitions');
    const uncertain=model(),uj=stateFile(path.join(dir,'uncertain.json'),'uncertain');
    uj.data.actions['decline.create']='attempted';uj.save();
    await assert.rejects(checks['ST-12'](uncertain.x,uj),/UNCERTAIN_FIXTURE_CREATION/);assert.equal(uncertain.count(),0);
    console.log('PASS OFFLINE: dedicated decline/recovery setup, 20 modeled race iterations, retained cancellation cleanup and no-repeat resume. Does not prove database concurrency.');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
